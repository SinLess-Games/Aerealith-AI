// .github/scripts/utils/config-loaders/release-rules.js
// =============================================================================
// Aerealith AI Release Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/release-rules.yaml`.
//
// Used by:
//   - .github/scripts/release/determine-release-version.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/release/build-changelog.js
//   - .github/scripts/release/create-github-release.js
//   - .github/scripts/release/post-discussion-announcement.js
//   - .github/scripts/npm/discover-publishable-packages.js
//   - .github/scripts/docker/discover-images.js
//   - .github/scripts/artifacts/create-checksums.js
//   - .github/scripts/artifacts/create-sbom.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/repo/enforce-pr-rules.js
//
// Notes:
//   - This loader does not mutate GitHub, npm, GHCR, or Cloudflare state.
//   - It is safe for dry-run and read-only workflows.
//   - Releases require exactly one release label.
//   - Dependency automation must never trigger a release.
//   - Attestations are allowed only during release or publish jobs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const semver = require("semver");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/release-rules.yaml";

const DEFAULT_RELEASE_LABELS = [
  "release:major",
  "release:minor",
  "release:patch",
];

const DEFAULT_RELEASE_BLOCKING_LABELS = [
  "no-release",
  "dependencies",
  "security:dependency",
  "do-not-merge",
  "blocked-by-security",
  "status:blocked",
];

const DEFAULT_DEPENDENCY_AUTHORS = [
  "renovate[bot]",
  "dependabot[bot]",
  "mend[bot]",
];

const DEFAULT_DEPENDENCY_BRANCH_PATTERNS = [
  "^renovate/.+$",
  "^dependabot/.+$",
  "^mend/.+$",
];

const DEFAULT_TAG_PATTERN = "^V[0-9]+\\.[0-9]+\\.[0-9]+$";

const DEFAULT_REQUIRED_RELEASE_ARTIFACTS = [
  "SHA256SUMS",
  "SHA512SUMS",
  "artifact-manifest.json",
  "sbom.spdx.json",
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeNumber(value, fallback = 0, fieldPath = "value") {
  if (value === undefined || value === null || value === "") return fallback;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${fieldPath} must be a finite number.`);
  }

  return number;
}

function normalizeString(value, fieldPath, options = {}) {
  const { fallback = "", allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (!allowEmpty && !fallback) {
      throw new TypeError(`${fieldPath} is required.`);
    }

    return fallback;
  }

  if (typeof value !== "string") {
    value = String(value);
  }

  const trimmed = value.trim();

  if (!trimmed && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return trimmed || fallback;
}

function normalizeNullableString(value, fieldPath) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    value = String(value);
  }

  return value.trim() || null;
}

function normalizeStringList(value, fieldPath, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (allowEmpty) return [];
    throw new TypeError(`${fieldPath} is required.`);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const trimmed = String(value).trim();

    if (!trimmed && !allowEmpty) {
      throw new TypeError(`${fieldPath} cannot be empty.`);
    }

    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      `${fieldPath} must be a string or an array of strings.`,
    );
  }

  const normalized = value
    .map((item, index) => {
      if (
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      ) {
        throw new TypeError(`${fieldPath}[${index}] must be a string.`);
      }

      return String(item).trim();
    })
    .filter(Boolean);

  if (!normalized.length && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return unique(normalized);
}

function normalizeObject(value, fieldPath) {
  if (value === undefined || value === null) return {};

  if (!isPlainObject(value)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  return value;
}

function normalizeStringMap(value, fieldPath) {
  const source = normalizeObject(value, fieldPath);

  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      normalizeString(item, `${fieldPath}.${key}`),
    ]),
  );
}

function normalizeStringListMap(value, fieldPath) {
  const source = normalizeObject(value, fieldPath);

  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      normalizeStringList(item, `${fieldPath}.${key}`),
    ]),
  );
}

function normalizeBooleanMap(value, fieldPath) {
  const source = normalizeObject(value, fieldPath);

  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      normalizeBoolean(item, false),
    ]),
  );
}

function compileRegex(pattern, fieldPath) {
  if (!pattern || typeof pattern !== "string") {
    throw new TypeError(`${fieldPath} must be a non-empty regex string.`);
  }

  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new TypeError(`${fieldPath} is not a valid regex: ${err.message}`);
  }
}

function validateRegexList(patterns, fieldPath) {
  for (const [index, pattern] of patterns.entries()) {
    compileRegex(pattern, `${fieldPath}[${index}]`);
  }
}

function matchesRegex(pattern, value) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!value || typeof value !== "string") return false;

  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function matchesAnyRegex(patterns, value) {
  return normalizeStringList(patterns, "patterns").some((pattern) =>
    matchesRegex(pattern, value),
  );
}

function matchesAnyGlob(patterns, value) {
  const normalizedPatterns = normalizeStringList(patterns, "patterns");

  return normalizedPatterns.some((pattern) =>
    minimatch(value, pattern, {
      dot: true,
      nocase: false,
      matchBase: false,
    }),
  );
}

function normalizeRepository(repository) {
  repository = normalizeObject(repository, "repository");

  return {
    ...repository,
    owner: normalizeString(repository.owner, "repository.owner", {
      fallback: "SinLess-Games",
    }),
    name: normalizeString(repository.name, "repository.name", {
      fallback: "Aerealith-AI",
    }),
    default_branch: normalizeString(
      repository.default_branch,
      "repository.default_branch",
      {
        fallback: "main",
      },
    ),
  };
}

function normalizeTooling(tooling) {
  tooling = normalizeObject(tooling, "tooling");

  return {
    ...tooling,
    package_manager: normalizeString(
      tooling.package_manager,
      "tooling.package_manager",
      {
        fallback: "pnpm",
      },
    ),
    pnpm_version: normalizeString(
      tooling.pnpm_version,
      "tooling.pnpm_version",
      {
        fallback: "10.23.0",
      },
    ),
    node_version: normalizeString(
      tooling.node_version,
      "tooling.node_version",
      {
        fallback: "24.15.0",
      },
    ),
    monorepo_tool: normalizeString(
      tooling.monorepo_tool,
      "tooling.monorepo_tool",
      {
        fallback: "nx",
      },
    ),
  };
}

function normalizePolicy(policy) {
  policy = normalizeObject(policy, "policy");

  return {
    ...policy,

    enabled: normalizeBoolean(policy.enabled, true),
    dry_run_supported: normalizeBoolean(policy.dry_run_supported, true),
    debug_supported: normalizeBoolean(policy.debug_supported, true),

    release_only_from_default_branch: normalizeBoolean(
      policy.release_only_from_default_branch,
      true,
    ),
    release_only_from_branch: normalizeString(
      policy.release_only_from_branch,
      "policy.release_only_from_branch",
      { fallback: "main" },
    ),
    release_only_after_pr_merge: normalizeBoolean(
      policy.release_only_after_pr_merge,
      true,
    ),
    release_only_from_merged_pull_request: normalizeBoolean(
      policy.release_only_from_merged_pull_request,
      true,
    ),
    release_only_when_checks_pass: normalizeBoolean(
      policy.release_only_when_checks_pass,
      true,
    ),

    require_release_label: normalizeBoolean(policy.require_release_label, true),
    require_exactly_one_release_label: normalizeBoolean(
      policy.require_exactly_one_release_label,
      true,
    ),
    infer_release_from_branch_name: normalizeBoolean(
      policy.infer_release_from_branch_name,
      false,
    ),
    infer_release_from_commit_message: normalizeBoolean(
      policy.infer_release_from_commit_message,
      false,
    ),
    infer_release_from_milestone: normalizeBoolean(
      policy.infer_release_from_milestone,
      false,
    ),

    dependency_prs_never_release: normalizeBoolean(
      policy.dependency_prs_never_release,
      true,
    ),
    security_dependency_prs_never_release: normalizeBoolean(
      policy.security_dependency_prs_never_release,
      true,
    ),
    lockfile_only_prs_never_release: normalizeBoolean(
      policy.lockfile_only_prs_never_release,
      true,
    ),
    github_actions_dependency_prs_never_release: normalizeBoolean(
      policy.github_actions_dependency_prs_never_release,
      true,
    ),

    require_clean_release_source: normalizeBoolean(
      policy.require_clean_release_source,
      true,
    ),
    require_ci_success: normalizeBoolean(policy.require_ci_success, true),
    require_security_success: normalizeBoolean(
      policy.require_security_success,
      true,
    ),
    require_codeql_success: normalizeBoolean(
      policy.require_codeql_success,
      true,
    ),
    require_sonarqube_success: normalizeBoolean(
      policy.require_sonarqube_success,
      true,
    ),
    require_dependency_review_success: normalizeBoolean(
      policy.require_dependency_review_success,
      true,
    ),

    allow_manual_workflow_dispatch: normalizeBoolean(
      policy.allow_manual_workflow_dispatch,
      true,
    ),
    manual_dispatch_requires_dry_run_by_default: normalizeBoolean(
      policy.manual_dispatch_requires_dry_run_by_default,
      true,
    ),
    manual_dispatch_write_mode_requires_confirmation: normalizeBoolean(
      policy.manual_dispatch_write_mode_requires_confirmation,
      true,
    ),

    create_github_release: normalizeBoolean(policy.create_github_release, true),
    create_git_tag: normalizeBoolean(policy.create_git_tag, true),
    create_changelog: normalizeBoolean(policy.create_changelog, true),
    publish_npm_packages: normalizeBoolean(policy.publish_npm_packages, true),
    publish_ghcr_containers: normalizeBoolean(
      policy.publish_ghcr_containers,
      true,
    ),
    deploy_cloudflare_production: normalizeBoolean(
      policy.deploy_cloudflare_production,
      true,
    ),
    post_discussion_announcement: normalizeBoolean(
      policy.post_discussion_announcement,
      true,
    ),
  };
}

function normalizeReleaseLabels(releaseLabels) {
  releaseLabels = normalizeObject(releaseLabels, "release_labels");

  return {
    ...releaseLabels,
    valid: normalizeStringList(releaseLabels.valid, "release_labels.valid", {
      allowEmpty: false,
    }),

    major: normalizeObject(releaseLabels.major, "release_labels.major"),
    minor: normalizeObject(releaseLabels.minor, "release_labels.minor"),
    patch: normalizeObject(releaseLabels.patch, "release_labels.patch"),

    forbidden_on_dependency_prs: normalizeStringList(
      releaseLabels.forbidden_on_dependency_prs,
      "release_labels.forbidden_on_dependency_prs",
    ),

    remove_from_dependency_prs: normalizeBoolean(
      releaseLabels.remove_from_dependency_prs,
      true,
    ),
  };
}

function normalizeBlockers(blockers) {
  blockers = normalizeObject(blockers, "blockers");

  const changedFiles = normalizeObject(
    blockers.changed_files,
    "blockers.changed_files",
  );
  const lockfileOnly = normalizeObject(
    changedFiles.lockfile_only,
    "blockers.changed_files.lockfile_only",
  );
  const securityFindings = normalizeObject(
    blockers.security_findings,
    "blockers.security_findings",
  );
  const releaseLabelConflicts = normalizeObject(
    blockers.release_label_conflicts,
    "blockers.release_label_conflicts",
  );

  const branchPatterns = normalizeStringList(
    blockers.branch_patterns,
    "blockers.branch_patterns",
  );
  validateRegexList(branchPatterns, "blockers.branch_patterns");

  return {
    ...blockers,

    labels: normalizeStringList(blockers.labels, "blockers.labels"),
    authors: normalizeStringList(blockers.authors, "blockers.authors"),
    branch_patterns: branchPatterns,
    failed_checks: normalizeStringList(
      blockers.failed_checks,
      "blockers.failed_checks",
    ),

    changed_files: {
      ...changedFiles,
      lockfile_only: {
        ...lockfileOnly,
        enabled: normalizeBoolean(lockfileOnly.enabled, true),
        patterns: normalizeStringList(
          lockfileOnly.patterns,
          "blockers.changed_files.lockfile_only.patterns",
        ),
      },
    },

    security_findings: {
      ...securityFindings,
      block_on: normalizeStringList(
        securityFindings.block_on,
        "blockers.security_findings.block_on",
      ),
    },

    release_label_conflicts: {
      ...releaseLabelConflicts,
      block_if_multiple_release_labels: normalizeBoolean(
        releaseLabelConflicts.block_if_multiple_release_labels,
        true,
      ),
      block_if_release_label_with_no_release: normalizeBoolean(
        releaseLabelConflicts.block_if_release_label_with_no_release,
        true,
      ),
      block_if_release_label_with_dependencies: normalizeBoolean(
        releaseLabelConflicts.block_if_release_label_with_dependencies,
        true,
      ),
      block_if_release_label_with_security_dependency: normalizeBoolean(
        releaseLabelConflicts.block_if_release_label_with_security_dependency,
        true,
      ),
    },
  };
}

function normalizeVersioning(versioning) {
  versioning = normalizeObject(versioning, "versioning");

  const source = normalizeObject(versioning.source, "versioning.source");
  const prerelease = normalizeObject(
    versioning.prerelease,
    "versioning.prerelease",
  );

  const tagPattern = normalizeString(
    versioning.tag_pattern,
    "versioning.tag_pattern",
    {
      fallback: DEFAULT_TAG_PATTERN,
    },
  );

  compileRegex(tagPattern, "versioning.tag_pattern");

  return {
    ...versioning,

    scheme: normalizeString(versioning.scheme, "versioning.scheme", {
      fallback: "semver",
    }),

    prefix: normalizeString(versioning.prefix, "versioning.prefix", {
      fallback: "V",
    }),

    tag_format: normalizeString(
      versioning.tag_format,
      "versioning.tag_format",
      {
        fallback: "V{major}.{minor}.{patch}",
      },
    ),

    tag_pattern: tagPattern,

    initial_version: normalizeString(
      versioning.initial_version,
      "versioning.initial_version",
      {
        fallback: "V0.1.0",
      },
    ),

    default_bump: normalizeString(
      versioning.default_bump,
      "versioning.default_bump",
      {
        fallback: "patch",
      },
    ),

    source: {
      ...source,
      latest_tag: normalizeString(
        source.latest_tag,
        "versioning.source.latest_tag",
        {
          fallback: "git",
        },
      ),
      fallback_version: normalizeString(
        source.fallback_version,
        "versioning.source.fallback_version",
        { fallback: "V0.0.0" },
      ),
    },

    bump_rules: normalizeStringMap(
      versioning.bump_rules,
      "versioning.bump_rules",
    ),

    validation: normalizeBooleanMap(
      versioning.validation,
      "versioning.validation",
    ),

    prerelease: {
      ...prerelease,
      enabled: normalizeBoolean(prerelease.enabled, true),
      channels: normalizeStringList(
        prerelease.channels,
        "versioning.prerelease.channels",
      ),
      default_channel: normalizeString(
        prerelease.default_channel,
        "versioning.prerelease.default_channel",
        { fallback: "release" },
      ),
      tag_suffix_format: normalizeString(
        prerelease.tag_suffix_format,
        "versioning.prerelease.tag_suffix_format",
        { fallback: "{version}-{channel}" },
      ),
      examples: normalizeStringList(
        prerelease.examples,
        "versioning.prerelease.examples",
      ),
    },
  };
}

function normalizeReleaseSource(releaseSource) {
  releaseSource = normalizeObject(releaseSource, "release_source");

  const eventSources = normalizeObject(
    releaseSource.event_sources,
    "release_source.event_sources",
  );
  const pullRequestResolution = normalizeObject(
    releaseSource.pull_request_resolution,
    "release_source.pull_request_resolution",
  );
  const ignoredSources = normalizeObject(
    releaseSource.ignored_sources,
    "release_source.ignored_sources",
  );

  const normalizedEventSources = Object.fromEntries(
    Object.entries(eventSources).map(([sourceName, sourceConfig]) => {
      if (!isPlainObject(sourceConfig)) {
        throw new TypeError(
          `release_source.event_sources.${sourceName} must be an object.`,
        );
      }

      return [
        sourceName,
        {
          ...sourceConfig,
          enabled: normalizeBoolean(sourceConfig.enabled, true),
          event: normalizeNullableString(
            sourceConfig.event,
            `release_source.event_sources.${sourceName}.event`,
          ),
          branch: normalizeNullableString(
            sourceConfig.branch,
            `release_source.event_sources.${sourceName}.branch`,
          ),
          default_dry_run: normalizeBoolean(
            sourceConfig.default_dry_run,
            false,
          ),
          description: normalizeNullableString(
            sourceConfig.description,
            `release_source.event_sources.${sourceName}.description`,
          ),
        },
      ];
    }),
  );

  const ignoredBranchPatterns = normalizeStringList(
    ignoredSources.branch_patterns,
    "release_source.ignored_sources.branch_patterns",
  );
  validateRegexList(
    ignoredBranchPatterns,
    "release_source.ignored_sources.branch_patterns",
  );

  return {
    ...releaseSource,

    event_sources: normalizedEventSources,

    pull_request_resolution: {
      ...pullRequestResolution,
      enabled: normalizeBoolean(pullRequestResolution.enabled, true),
      strategy: normalizeString(
        pullRequestResolution.strategy,
        "release_source.pull_request_resolution.strategy",
        { fallback: "merge_commit" },
      ),
      fallback_strategy: normalizeString(
        pullRequestResolution.fallback_strategy,
        "release_source.pull_request_resolution.fallback_strategy",
        { fallback: "associated_prs" },
      ),
      require_pull_request_number: normalizeBoolean(
        pullRequestResolution.require_pull_request_number,
        true,
      ),
      require_merged: normalizeBoolean(
        pullRequestResolution.require_merged,
        true,
      ),
      require_base_branch: normalizeString(
        pullRequestResolution.require_base_branch,
        "release_source.pull_request_resolution.require_base_branch",
        { fallback: "main" },
      ),
      require_head_branch_not_main: normalizeBoolean(
        pullRequestResolution.require_head_branch_not_main,
        false,
      ),
    },

    accepted_merge_methods: normalizeStringList(
      releaseSource.accepted_merge_methods,
      "release_source.accepted_merge_methods",
    ),

    ignored_sources: {
      ...ignoredSources,
      authors: normalizeStringList(
        ignoredSources.authors,
        "release_source.ignored_sources.authors",
      ),
      branch_patterns: ignoredBranchPatterns,
    },
  };
}

function normalizeRequiredChecks(requiredChecks) {
  return normalizeStringListMap(requiredChecks, "required_checks");
}

function normalizeOpenAiBlock(openai, fieldPath) {
  openai = normalizeObject(openai, fieldPath);

  const safety = normalizeObject(openai.safety, `${fieldPath}.safety`);

  return {
    ...openai,
    enabled: normalizeBoolean(openai.enabled, true),
    mode: normalizeString(openai.mode, `${fieldPath}.mode`, {
      fallback: "draft",
    }),
    model_variable: normalizeString(
      openai.model_variable,
      `${fieldPath}.model_variable`,
      {
        fallback: "OPENAI_MODEL",
      },
    ),
    default_model: normalizeString(
      openai.default_model,
      `${fieldPath}.default_model`,
      {
        fallback: "gpt-5.5",
      },
    ),
    prompt_file: normalizeNullableString(
      openai.prompt_file,
      `${fieldPath}.prompt_file`,
    ),
    safety: {
      ...safety,
      do_not_invent_changes: normalizeBoolean(
        safety.do_not_invent_changes,
        true,
      ),
      require_pr_links: normalizeBoolean(safety.require_pr_links, true),
      require_release_links: normalizeBoolean(
        safety.require_release_links,
        true,
      ),
      require_uncertainty_notes: normalizeBoolean(
        safety.require_uncertainty_notes,
        true,
      ),
      exclude_dependency_only_changes: normalizeBoolean(
        safety.exclude_dependency_only_changes,
        true,
      ),
      exclude_no_release_changes: normalizeBoolean(
        safety.exclude_no_release_changes,
        true,
      ),
      redact_secrets: normalizeBoolean(safety.redact_secrets, true),
      do_not_publish_unfixed_security_details: normalizeBoolean(
        safety.do_not_publish_unfixed_security_details,
        true,
      ),
    },
  };
}

function normalizeChangelog(changelog) {
  changelog = normalizeObject(changelog, "changelog");

  const source = normalizeObject(changelog.source, "changelog.source");
  const exclude = normalizeObject(changelog.exclude, "changelog.exclude");
  const grouping = normalizeObject(changelog.grouping, "changelog.grouping");

  return {
    ...changelog,

    enabled: normalizeBoolean(changelog.enabled, true),
    output_file: normalizeString(
      changelog.output_file,
      "changelog.output_file",
      {
        fallback: "CHANGELOG.md",
      },
    ),
    update_changelog_file: normalizeBoolean(
      changelog.update_changelog_file,
      true,
    ),

    source: {
      ...source,
      include_merged_pull_requests_since_last_release: normalizeBoolean(
        source.include_merged_pull_requests_since_last_release,
        true,
      ),
      include_linked_issues: normalizeBoolean(
        source.include_linked_issues,
        true,
      ),
      include_pr_labels: normalizeBoolean(source.include_pr_labels, true),
      include_pr_authors: normalizeBoolean(source.include_pr_authors, true),
      include_commit_links: normalizeBoolean(source.include_commit_links, true),
      include_full_changelog_link: normalizeBoolean(
        source.include_full_changelog_link,
        true,
      ),
    },

    exclude: {
      ...exclude,
      labels: normalizeStringList(exclude.labels, "changelog.exclude.labels"),
      authors: normalizeStringList(
        exclude.authors,
        "changelog.exclude.authors",
      ),
    },

    grouping: {
      ...grouping,
      enabled: normalizeBoolean(grouping.enabled, true),
      order: normalizeStringList(grouping.order, "changelog.grouping.order"),
    },

    label_mapping: normalizeStringMap(
      changelog.label_mapping,
      "changelog.label_mapping",
    ),

    required_sections: normalizeStringList(
      changelog.required_sections,
      "changelog.required_sections",
    ),

    optional_sections: normalizeStringList(
      changelog.optional_sections,
      "changelog.optional_sections",
    ),

    openai: normalizeOpenAiBlock(changelog.openai, "changelog.openai"),
  };
}

function normalizeGithubRelease(githubRelease) {
  githubRelease = normalizeObject(githubRelease, "github_release");

  const assets = normalizeObject(githubRelease.assets, "github_release.assets");

  return {
    ...githubRelease,

    enabled: normalizeBoolean(githubRelease.enabled, true),

    title_format: normalizeString(
      githubRelease.title_format,
      "github_release.title_format",
      { fallback: "Aerealith AI {version}" },
    ),

    tag_name_format: normalizeString(
      githubRelease.tag_name_format,
      "github_release.tag_name_format",
      { fallback: "{version}" },
    ),

    target_commitish: normalizeString(
      githubRelease.target_commitish,
      "github_release.target_commitish",
      { fallback: "main" },
    ),

    draft: normalizeBoolean(githubRelease.draft, false),

    prerelease: normalizeObject(
      githubRelease.prerelease,
      "github_release.prerelease",
    ),

    generate_release_notes: normalizeBoolean(
      githubRelease.generate_release_notes,
      false,
    ),

    use_generated_changelog: normalizeBoolean(
      githubRelease.use_generated_changelog,
      true,
    ),

    body_template: normalizeString(
      githubRelease.body_template,
      "github_release.body_template",
      { fallback: "" },
    ),

    assets: {
      ...assets,
      upload: normalizeBoolean(assets.upload, true),
      required: normalizeStringList(
        assets.required,
        "github_release.assets.required",
      ),
      optional: normalizeStringList(
        assets.optional,
        "github_release.assets.optional",
      ),
    },
  };
}

function normalizeNpm(npm) {
  npm = normalizeObject(npm, "npm");

  const packageDiscovery = normalizeObject(
    npm.package_discovery,
    "npm.package_discovery",
  );
  const publishableWhen = normalizeObject(
    packageDiscovery.publishable_when,
    "npm.package_discovery.publishable_when",
  );
  const validation = normalizeObject(npm.validation, "npm.validation");
  const provenance = normalizeObject(npm.provenance, "npm.provenance");
  const artifacts = normalizeObject(npm.artifacts, "npm.artifacts");

  return {
    ...npm,

    enabled: normalizeBoolean(npm.enabled, true),

    publish_only_on_release: normalizeBoolean(
      npm.publish_only_on_release,
      true,
    ),
    publish_only_from_tag: normalizeBoolean(npm.publish_only_from_tag, true),
    publish_only_when_package_private_false: normalizeBoolean(
      npm.publish_only_when_package_private_false,
      true,
    ),

    registry: normalizeString(npm.registry, "npm.registry", {
      fallback: "https://registry.npmjs.org",
    }),
    access: normalizeString(npm.access, "npm.access", { fallback: "public" }),
    token_secret: normalizeString(npm.token_secret, "npm.token_secret", {
      fallback: "NPM_ACCESS_TOKEN",
    }),

    package_discovery: {
      ...packageDiscovery,
      enabled: normalizeBoolean(packageDiscovery.enabled, true),
      package_json_patterns: normalizeStringList(
        packageDiscovery.package_json_patterns,
        "npm.package_discovery.package_json_patterns",
      ),
      ignore_paths: normalizeStringList(
        packageDiscovery.ignore_paths,
        "npm.package_discovery.ignore_paths",
      ),
      publishable_when: {
        ...publishableWhen,
        private: normalizeBoolean(publishableWhen.private, false),
      },
    },

    validation: {
      ...validation,
      require_package_json: normalizeBoolean(
        validation.require_package_json,
        true,
      ),
      require_name: normalizeBoolean(validation.require_name, true),
      require_version: normalizeBoolean(validation.require_version, true),
      require_private_false: normalizeBoolean(
        validation.require_private_false,
        true,
      ),
      fail_if_private_missing: normalizeBoolean(
        validation.fail_if_private_missing,
        false,
      ),
      fail_if_package_version_mismatch: normalizeBoolean(
        validation.fail_if_package_version_mismatch,
        true,
      ),
      pack_before_publish: normalizeBoolean(
        validation.pack_before_publish,
        true,
      ),
    },

    provenance: {
      ...provenance,
      enabled: normalizeBoolean(provenance.enabled, true),
      npm_provenance: normalizeBoolean(provenance.npm_provenance, true),
      require_id_token: normalizeBoolean(provenance.require_id_token, true),
    },

    artifacts: {
      ...artifacts,
      create_package_manifest: normalizeBoolean(
        artifacts.create_package_manifest,
        true,
      ),
      manifest_file: normalizeString(
        artifacts.manifest_file,
        "npm.artifacts.manifest_file",
        {
          fallback: "npm-package-manifest.json",
        },
      ),
    },

    commands: normalizeStringMap(npm.commands, "npm.commands"),
  };
}

function normalizeGhcr(ghcr) {
  ghcr = normalizeObject(ghcr, "ghcr");

  const dockerfileDiscovery = normalizeObject(
    ghcr.dockerfile_discovery,
    "ghcr.dockerfile_discovery",
  );
  const naming = normalizeObject(ghcr.naming, "ghcr.naming");
  const build = normalizeObject(ghcr.build, "ghcr.build");
  const cache = normalizeObject(build.cache, "ghcr.build.cache");
  const sbom = normalizeObject(ghcr.sbom, "ghcr.sbom");
  const artifacts = normalizeObject(ghcr.artifacts, "ghcr.artifacts");

  return {
    ...ghcr,

    enabled: normalizeBoolean(ghcr.enabled, true),

    publish_only_on_release: normalizeBoolean(
      ghcr.publish_only_on_release,
      true,
    ),
    publish_only_from_tag: normalizeBoolean(ghcr.publish_only_from_tag, true),

    registry: normalizeString(ghcr.registry, "ghcr.registry", {
      fallback: "ghcr.io",
    }),
    owner: normalizeString(ghcr.owner, "ghcr.owner", {
      fallback: "sinless-games",
    }),
    namespace: normalizeString(ghcr.namespace, "ghcr.namespace", {
      fallback: "aerealith-ai",
    }),

    image_repository_format: normalizeString(
      ghcr.image_repository_format,
      "ghcr.image_repository_format",
      { fallback: "ghcr.io/sinless-games/aerealith-ai/{name}" },
    ),

    image_tag_format: normalizeString(
      ghcr.image_tag_format,
      "ghcr.image_tag_format",
      {
        fallback: "{version}-{channel}",
      },
    ),

    examples: normalizeStringList(ghcr.examples, "ghcr.examples"),

    dockerfile_discovery: {
      ...dockerfileDiscovery,
      enabled: normalizeBoolean(dockerfileDiscovery.enabled, true),
      build_every_dockerfile: normalizeBoolean(
        dockerfileDiscovery.build_every_dockerfile,
        true,
      ),
      dockerfile_patterns: normalizeStringList(
        dockerfileDiscovery.dockerfile_patterns,
        "ghcr.dockerfile_discovery.dockerfile_patterns",
      ),
      ignore_paths: normalizeStringList(
        dockerfileDiscovery.ignore_paths,
        "ghcr.dockerfile_discovery.ignore_paths",
      ),
    },

    naming: {
      ...naming,
      derive_name_from_parent_directory: normalizeBoolean(
        naming.derive_name_from_parent_directory,
        true,
      ),
      normalize_to_lowercase: normalizeBoolean(
        naming.normalize_to_lowercase,
        true,
      ),
      replace_invalid_characters_with: normalizeString(
        naming.replace_invalid_characters_with,
        "ghcr.naming.replace_invalid_characters_with",
        { fallback: "-" },
      ),
      collapse_duplicate_separators: normalizeBoolean(
        naming.collapse_duplicate_separators,
        true,
      ),
    },

    build: {
      ...build,
      builder: normalizeString(build.builder, "ghcr.build.builder", {
        fallback: "docker-buildx",
      }),
      push: normalizeBoolean(build.push, true),
      platforms: normalizeStringList(build.platforms, "ghcr.build.platforms"),
      cache: {
        ...cache,
        enabled: normalizeBoolean(cache.enabled, true),
        type: normalizeString(cache.type, "ghcr.build.cache.type", {
          fallback: "gha",
        }),
        readable_names: normalizeBoolean(cache.readable_names, true),
      },
      labels: normalizeStringMap(build.labels, "ghcr.build.labels"),
    },

    sbom: {
      ...sbom,
      enabled: normalizeBoolean(sbom.enabled, true),
      format: normalizeString(sbom.format, "ghcr.sbom.format", {
        fallback: "spdx-json",
      }),
      attach_to_release: normalizeBoolean(sbom.attach_to_release, true),
    },

    artifacts: {
      ...artifacts,
      create_image_manifest: normalizeBoolean(
        artifacts.create_image_manifest,
        true,
      ),
      manifest_file: normalizeString(
        artifacts.manifest_file,
        "ghcr.artifacts.manifest_file",
        { fallback: "ghcr-image-manifest.json" },
      ),
    },
  };
}

function normalizeReleaseEvidence(releaseEvidence) {
  releaseEvidence = normalizeObject(releaseEvidence, "release_evidence");

  const artifacts = normalizeObject(
    releaseEvidence.artifacts,
    "release_evidence.artifacts",
  );
  const manifest = normalizeObject(
    artifacts.manifest,
    "release_evidence.artifacts.manifest",
  );
  const checksums = normalizeObject(
    artifacts.checksums,
    "release_evidence.artifacts.checksums",
  );
  const files = normalizeObject(
    checksums.files,
    "release_evidence.artifacts.checksums.files",
  );
  const sbom = normalizeObject(
    artifacts.sbom,
    "release_evidence.artifacts.sbom",
  );
  const attestations = normalizeObject(
    releaseEvidence.attestations,
    "release_evidence.attestations",
  );
  const buildProvenance = normalizeObject(
    attestations.build_provenance,
    "release_evidence.attestations.build_provenance",
  );
  const sbomAttestation = normalizeObject(
    attestations.sbom_attestation,
    "release_evidence.attestations.sbom_attestation",
  );
  const retentionDays = normalizeObject(
    releaseEvidence.retention_days,
    "release_evidence.retention_days",
  );

  return {
    ...releaseEvidence,

    enabled: normalizeBoolean(releaseEvidence.enabled, true),

    artifacts: {
      ...artifacts,
      enabled: normalizeBoolean(artifacts.enabled, true),
      output_directory: normalizeString(
        artifacts.output_directory,
        "release_evidence.artifacts.output_directory",
        { fallback: "artifacts/release" },
      ),

      manifest: {
        ...manifest,
        enabled: normalizeBoolean(manifest.enabled, true),
        file: normalizeString(
          manifest.file,
          "release_evidence.artifacts.manifest.file",
          {
            fallback: "artifact-manifest.json",
          },
        ),
      },

      checksums: {
        ...checksums,
        enabled: normalizeBoolean(checksums.enabled, true),
        algorithms: normalizeStringList(
          checksums.algorithms,
          "release_evidence.artifacts.checksums.algorithms",
        ),
        files: {
          sha256: normalizeString(
            files.sha256,
            "release_evidence.artifacts.checksums.files.sha256",
            {
              fallback: "SHA256SUMS",
            },
          ),
          sha512: normalizeString(
            files.sha512,
            "release_evidence.artifacts.checksums.files.sha512",
            {
              fallback: "SHA512SUMS",
            },
          ),
        },
      },

      sbom: {
        ...sbom,
        enabled: normalizeBoolean(sbom.enabled, true),
        format: normalizeString(
          sbom.format,
          "release_evidence.artifacts.sbom.format",
          {
            fallback: "spdx-json",
          },
        ),
        file: normalizeString(
          sbom.file,
          "release_evidence.artifacts.sbom.file",
          {
            fallback: "sbom.spdx.json",
          },
        ),
      },
    },

    attestations: {
      ...attestations,
      enabled: normalizeBoolean(attestations.enabled, true),
      only_on_release_or_publish_jobs: normalizeBoolean(
        attestations.only_on_release_or_publish_jobs,
        true,
      ),
      build_provenance: {
        ...buildProvenance,
        enabled: normalizeBoolean(buildProvenance.enabled, true),
        predicate_type: normalizeString(
          buildProvenance.predicate_type,
          "release_evidence.attestations.build_provenance.predicate_type",
          { fallback: "slsa" },
        ),
      },
      sbom_attestation: {
        ...sbomAttestation,
        enabled: normalizeBoolean(sbomAttestation.enabled, true),
      },
      required_permissions: normalizeStringMap(
        attestations.required_permissions,
        "release_evidence.attestations.required_permissions",
      ),
    },

    retention_days: Object.fromEntries(
      Object.entries(retentionDays).map(([key, value]) => [
        key,
        normalizeNumber(value, 30, `release_evidence.retention_days.${key}`),
      ]),
    ),
  };
}

function normalizeCloudflareProduction(cloudflareProduction) {
  cloudflareProduction = normalizeObject(
    cloudflareProduction,
    "cloudflare_production",
  );

  const allowedTagPattern = normalizeString(
    cloudflareProduction.allowed_tag_pattern,
    "cloudflare_production.allowed_tag_pattern",
    { fallback: DEFAULT_TAG_PATTERN },
  );

  compileRegex(allowedTagPattern, "cloudflare_production.allowed_tag_pattern");

  return {
    ...cloudflareProduction,

    enabled: normalizeBoolean(cloudflareProduction.enabled, true),

    deploy_only_on_release_tag: normalizeBoolean(
      cloudflareProduction.deploy_only_on_release_tag,
      true,
    ),
    require_github_environment_approval: normalizeBoolean(
      cloudflareProduction.require_github_environment_approval,
      true,
    ),
    github_environment: normalizeString(
      cloudflareProduction.github_environment,
      "cloudflare_production.github_environment",
      { fallback: "production" },
    ),
    allowed_tag_pattern: allowedTagPattern,

    block_if_labels_present: normalizeStringList(
      cloudflareProduction.block_if_labels_present,
      "cloudflare_production.block_if_labels_present",
    ),

    require_release_evidence: normalizeBoolean(
      cloudflareProduction.require_release_evidence,
      true,
    ),
    require_artifact_manifest: normalizeBoolean(
      cloudflareProduction.require_artifact_manifest,
      true,
    ),
    require_smoke_tests: normalizeBoolean(
      cloudflareProduction.require_smoke_tests,
      true,
    ),

    workflow: normalizeString(
      cloudflareProduction.workflow,
      "cloudflare_production.workflow",
      { fallback: ".github/workflows/cloudflare-production.yaml" },
    ),
  };
}

function normalizeDiscussionAnnouncement(discussionAnnouncement) {
  discussionAnnouncement = normalizeObject(
    discussionAnnouncement,
    "discussion_announcement",
  );

  const skipIf = normalizeObject(
    discussionAnnouncement.skip_if,
    "discussion_announcement.skip_if",
  );
  const failureBehavior = normalizeObject(
    discussionAnnouncement.failure_behavior,
    "discussion_announcement.failure_behavior",
  );

  return {
    ...discussionAnnouncement,

    enabled: normalizeBoolean(discussionAnnouncement.enabled, true),

    category: normalizeString(
      discussionAnnouncement.category,
      "discussion_announcement.category",
      { fallback: "Announcements" },
    ),

    create_discussion: normalizeBoolean(
      discussionAnnouncement.create_discussion,
      true,
    ),

    update_existing_discussion: normalizeBoolean(
      discussionAnnouncement.update_existing_discussion,
      false,
    ),

    title_format: normalizeString(
      discussionAnnouncement.title_format,
      "discussion_announcement.title_format",
      { fallback: "Aerealith AI {version}" },
    ),

    require_release_success: normalizeBoolean(
      discussionAnnouncement.require_release_success,
      true,
    ),

    require_github_release_url: normalizeBoolean(
      discussionAnnouncement.require_github_release_url,
      true,
    ),

    skip_if: {
      ...skipIf,
      labels: normalizeStringList(
        skipIf.labels,
        "discussion_announcement.skip_if.labels",
      ),
      authors: normalizeStringList(
        skipIf.authors,
        "discussion_announcement.skip_if.authors",
      ),
    },

    openai: normalizeOpenAiBlock(
      discussionAnnouncement.openai,
      "discussion_announcement.openai",
    ),

    failure_behavior: {
      ...failureBehavior,
      fail_release_if_post_fails: normalizeBoolean(
        failureBehavior.fail_release_if_post_fails,
        false,
      ),
      warn_on_post_failure: normalizeBoolean(
        failureBehavior.warn_on_post_failure,
        true,
      ),
      add_workflow_summary_on_failure: normalizeBoolean(
        failureBehavior.add_workflow_summary_on_failure,
        true,
      ),
    },
  };
}

function normalizePermissions(permissions) {
  permissions = normalizeObject(permissions, "permissions");

  return Object.fromEntries(
    Object.entries(permissions).map(([groupName, groupPermissions]) => {
      if (!isPlainObject(groupPermissions)) {
        throw new TypeError(`permissions.${groupName} must be an object.`);
      }

      return [
        groupName,
        Object.fromEntries(
          Object.entries(groupPermissions).map(([permissionName, value]) => [
            permissionName,
            normalizeString(
              value,
              `permissions.${groupName}.${permissionName}`,
            ),
          ]),
        ),
      ];
    }),
  );
}

function normalizeConfiguration(configuration) {
  configuration = normalizeObject(configuration, "configuration");

  const requiredSecrets = normalizeObject(
    configuration.required_secrets,
    "configuration.required_secrets",
  );

  const requiredVariables = normalizeObject(
    configuration.required_variables,
    "configuration.required_variables",
  );

  return {
    ...configuration,

    required_secrets: Object.fromEntries(
      Object.entries(requiredSecrets).map(([key, value]) => [
        key,
        normalizeStringList(value, `configuration.required_secrets.${key}`),
      ]),
    ),

    required_variables: Object.fromEntries(
      Object.entries(requiredVariables).map(([key, value]) => [
        key,
        normalizeStringList(value, `configuration.required_variables.${key}`),
      ]),
    ),

    optional_variables: normalizeStringList(
      configuration.optional_variables,
      "configuration.optional_variables",
    ),

    recommended_values: normalizeStringMap(
      configuration.recommended_values,
      "configuration.recommended_values",
    ),
  };
}

function normalizeValidation(validation) {
  validation = normalizeObject(validation, "validation");

  const dryRun = normalizeObject(validation.dry_run, "validation.dry_run");

  const releaseLabelTests = Array.isArray(validation.release_label_tests)
    ? validation.release_label_tests
    : [];

  return {
    ...validation,

    dry_run: {
      ...dryRun,
      enabled: normalizeBoolean(dryRun.enabled, true),
      default_for_manual_dispatch: normalizeBoolean(
        dryRun.default_for_manual_dispatch,
        true,
      ),
      print_planned_version: normalizeBoolean(
        dryRun.print_planned_version,
        true,
      ),
      print_release_source: normalizeBoolean(dryRun.print_release_source, true),
      print_changelog_preview: normalizeBoolean(
        dryRun.print_changelog_preview,
        true,
      ),
      print_publishable_packages: normalizeBoolean(
        dryRun.print_publishable_packages,
        true,
      ),
      print_discovered_dockerfiles: normalizeBoolean(
        dryRun.print_discovered_dockerfiles,
        true,
      ),
      print_artifact_plan: normalizeBoolean(dryRun.print_artifact_plan, true),
      print_discussion_preview: normalizeBoolean(
        dryRun.print_discussion_preview,
        true,
      ),
      create_tag: normalizeBoolean(dryRun.create_tag, false),
      create_github_release: normalizeBoolean(
        dryRun.create_github_release,
        false,
      ),
      publish_npm: normalizeBoolean(dryRun.publish_npm, false),
      publish_ghcr: normalizeBoolean(dryRun.publish_ghcr, false),
      deploy_cloudflare: normalizeBoolean(dryRun.deploy_cloudflare, false),
      post_discussion: normalizeBoolean(dryRun.post_discussion, false),
    },

    release_label_tests: releaseLabelTests.map((test, index) => {
      if (!isPlainObject(test)) {
        throw new TypeError(
          `validation.release_label_tests[${index}] must be an object.`,
        );
      }

      return {
        ...test,
        name: normalizeString(
          test.name,
          `validation.release_label_tests[${index}].name`,
          {
            allowEmpty: false,
          },
        ),
        labels: normalizeStringList(
          test.labels,
          `validation.release_label_tests[${index}].labels`,
        ),
        expected_bump: normalizeNullableString(
          test.expected_bump,
          `validation.release_label_tests[${index}].expected_bump`,
        ),
        expected_release: normalizeBoolean(test.expected_release, false),
        expected_failure: normalizeBoolean(test.expected_failure, false),
      };
    }),
  };
}

function normalizeReporting(reporting) {
  reporting = normalizeObject(reporting, "reporting");

  const commentFooter = normalizeObject(
    reporting.comment_footer,
    "reporting.comment_footer",
  );
  const summary = normalizeObject(reporting.summary, "reporting.summary");

  return {
    ...reporting,

    add_workflow_summary: normalizeBoolean(
      reporting.add_workflow_summary,
      true,
    ),
    add_pr_comment_on_release_skip: normalizeBoolean(
      reporting.add_pr_comment_on_release_skip,
      false,
    ),
    add_pr_comment_on_release_failure: normalizeBoolean(
      reporting.add_pr_comment_on_release_failure,
      true,
    ),

    comment_footer: {
      ...commentFooter,
      start: normalizeNullableString(
        commentFooter.start,
        "reporting.comment_footer.start",
      ),
      end: normalizeNullableString(
        commentFooter.end,
        "reporting.comment_footer.end",
      ),
    },

    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [
        key,
        normalizeBoolean(value, true),
      ]),
    ),
  };
}

function normalizeEnforcement(enforcement) {
  enforcement = normalizeObject(enforcement, "enforcement");

  return Object.fromEntries(
    Object.entries(enforcement).map(([ruleName, ruleConfig]) => {
      if (!isPlainObject(ruleConfig)) {
        throw new TypeError(`enforcement.${ruleName} must be an object.`);
      }

      return [
        ruleName,
        {
          ...ruleConfig,
          action: normalizeString(
            ruleConfig.action,
            `enforcement.${ruleName}.action`,
            {
              fallback: "fail",
            },
          ),
          message: normalizeNullableString(
            ruleConfig.message,
            `enforcement.${ruleName}.message`,
          ),
        },
      ];
    }),
  );
}

function normalizeSafety(safety) {
  safety = normalizeObject(safety, "safety");

  return {
    ...safety,

    dry_run_supported: normalizeBoolean(safety.dry_run_supported, true),
    debug_supported: normalizeBoolean(safety.debug_supported, true),

    do_not_release_from_feature_branch: normalizeBoolean(
      safety.do_not_release_from_feature_branch,
      true,
    ),
    do_not_release_from_pull_request_event: normalizeBoolean(
      safety.do_not_release_from_pull_request_event,
      true,
    ),
    do_not_release_from_dependency_pr: normalizeBoolean(
      safety.do_not_release_from_dependency_pr,
      true,
    ),
    do_not_release_from_security_dependency_pr: normalizeBoolean(
      safety.do_not_release_from_security_dependency_pr,
      true,
    ),
    do_not_release_when_no_release_label_present: normalizeBoolean(
      safety.do_not_release_when_no_release_label_present,
      true,
    ),
    do_not_release_when_blocked_by_security: normalizeBoolean(
      safety.do_not_release_when_blocked_by_security,
      true,
    ),

    do_not_generate_attestations_outside_release_or_publish_jobs:
      normalizeBoolean(
        safety.do_not_generate_attestations_outside_release_or_publish_jobs,
        true,
      ),
    do_not_publish_npm_outside_release: normalizeBoolean(
      safety.do_not_publish_npm_outside_release,
      true,
    ),
    do_not_publish_containers_outside_release: normalizeBoolean(
      safety.do_not_publish_containers_outside_release,
      true,
    ),
    do_not_deploy_production_without_approval: normalizeBoolean(
      safety.do_not_deploy_production_without_approval,
      true,
    ),
    do_not_post_announcement_for_skipped_release: normalizeBoolean(
      safety.do_not_post_announcement_for_skipped_release,
      true,
    ),
    do_not_include_secrets_in_changelog: normalizeBoolean(
      safety.do_not_include_secrets_in_changelog,
      true,
    ),
    do_not_include_private_data_in_announcements: normalizeBoolean(
      safety.do_not_include_private_data_in_announcements,
      true,
    ),

    protected_labels: normalizeStringList(
      safety.protected_labels,
      "safety.protected_labels",
    ),
  };
}

function normalizeReleaseRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Release rules config must be a YAML object.");
  }

  const normalized = {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: normalizeNumber(rawConfig.version, 1, "version"),
    repository: normalizeRepository(rawConfig.repository),
    tooling: normalizeTooling(rawConfig.tooling),
    policy: normalizePolicy(rawConfig.policy),

    release_labels: normalizeReleaseLabels({
      valid: DEFAULT_RELEASE_LABELS,
      forbidden_on_dependency_prs: DEFAULT_RELEASE_LABELS,
      ...rawConfig.release_labels,
    }),

    blockers: normalizeBlockers({
      labels: DEFAULT_RELEASE_BLOCKING_LABELS,
      authors: DEFAULT_DEPENDENCY_AUTHORS,
      branch_patterns: DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
      ...rawConfig.blockers,
    }),

    versioning: normalizeVersioning(rawConfig.versioning),
    release_source: normalizeReleaseSource(rawConfig.release_source),
    required_checks: normalizeRequiredChecks(rawConfig.required_checks),
    changelog: normalizeChangelog(rawConfig.changelog),
    github_release: normalizeGithubRelease(rawConfig.github_release),
    npm: normalizeNpm(rawConfig.npm),
    ghcr: normalizeGhcr(rawConfig.ghcr),
    release_evidence: normalizeReleaseEvidence(rawConfig.release_evidence),
    cloudflare_production: normalizeCloudflareProduction(
      rawConfig.cloudflare_production,
    ),
    discussion_announcement: normalizeDiscussionAnnouncement(
      rawConfig.discussion_announcement,
    ),
    permissions: normalizePermissions(rawConfig.permissions),
    configuration: normalizeConfiguration(rawConfig.configuration),
    validation: normalizeValidation(rawConfig.validation),
    reporting: normalizeReporting(rawConfig.reporting),
    enforcement: normalizeEnforcement(rawConfig.enforcement),
    safety: normalizeSafety(rawConfig.safety),
  };

  return normalized;
}

function validateReleaseRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Release rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  if (!Array.isArray(config.release_labels?.valid)) {
    throw new TypeError("release_labels.valid must be an array.");
  }

  if (!config.release_labels.valid.length) {
    throw new TypeError("release_labels.valid cannot be empty.");
  }

  for (const label of DEFAULT_RELEASE_LABELS) {
    if (!config.release_labels.valid.includes(label)) {
      logger.warn(`release_labels.valid should include "${label}".`);
    }
  }

  if (!config.versioning?.tag_pattern) {
    throw new TypeError("versioning.tag_pattern is required.");
  }

  compileRegex(config.versioning.tag_pattern, "versioning.tag_pattern");

  if (!isSemverVersion(config.versioning.initial_version)) {
    throw new TypeError(
      `versioning.initial_version must be a V-prefixed semantic version. Received: ${config.versioning.initial_version}`,
    );
  }

  if (!isSemverVersion(config.versioning.source.fallback_version)) {
    throw new TypeError(
      `versioning.source.fallback_version must be a V-prefixed semantic version. Received: ${config.versioning.source.fallback_version}`,
    );
  }

  for (const [label, bump] of Object.entries(
    config.versioning.bump_rules || {},
  )) {
    if (!config.release_labels.valid.includes(label)) {
      logger.warn(
        `versioning.bump_rules references unknown release label "${label}".`,
      );
    }

    if (!["major", "minor", "patch"].includes(bump)) {
      throw new TypeError(
        `versioning.bump_rules.${label} must be major, minor, or patch.`,
      );
    }
  }

  if (!config.blockers.labels.includes("no-release")) {
    logger.warn("blockers.labels should include `no-release`.");
  }

  if (!config.blockers.labels.includes("dependencies")) {
    logger.warn("blockers.labels should include `dependencies`.");
  }

  if (!config.blockers.labels.includes("security:dependency")) {
    logger.warn("blockers.labels should include `security:dependency`.");
  }

  if (config.release_evidence.attestations.enabled) {
    const requiredPermissions =
      config.release_evidence.attestations.required_permissions || {};

    if (requiredPermissions["id-token"] !== "write") {
      logger.warn("Release attestations usually require `id-token: write`.");
    }

    if (requiredPermissions.attestations !== "write") {
      logger.warn(
        "Release attestations usually require `attestations: write`.",
      );
    }
  }

  return true;
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const candidates = [
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../../.."),
  ];

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      const githubDir = path.join(current, ".github");

      if (fs.existsSync(githubDir) && fs.statSync(githubDir).isDirectory()) {
        return current;
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolveConfigPath(
  configPath = DEFAULT_CONFIG_PATH,
  repoRoot = findRepoRoot(),
) {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  return path.join(repoRoot, configPath);
}

function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw, {
    filename: filePath,
    schema: yaml.DEFAULT_SCHEMA,
  });

  return parsed || {};
}

function loadReleaseRulesConfig(options = {}) {
  const {
    configPath = DEFAULT_CONFIG_PATH,
    repoRoot = findRepoRoot(),
    required = true,
    validate = true,
    log = true,
  } = options;

  const absolutePath = resolveConfigPath(configPath, repoRoot);
  const displayPath = path.relative(repoRoot, absolutePath) || absolutePath;

  if (!fs.existsSync(absolutePath)) {
    if (!required) {
      logger.warn(
        `Release rules config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeReleaseRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          tooling: {},
          policy: {},
          release_labels: {
            valid: DEFAULT_RELEASE_LABELS,
          },
          blockers: {
            labels: DEFAULT_RELEASE_BLOCKING_LABELS,
            authors: DEFAULT_DEPENDENCY_AUTHORS,
            branch_patterns: DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
          },
          versioning: {
            initial_version: "V0.1.0",
            source: {
              fallback_version: "V0.0.0",
            },
            bump_rules: {
              "release:major": "major",
              "release:minor": "minor",
              "release:patch": "patch",
            },
          },
          release_source: {},
          required_checks: {},
          changelog: {},
          github_release: {},
          npm: {},
          ghcr: {},
          release_evidence: {},
          cloudflare_production: {},
          discussion_announcement: {},
          permissions: {},
          configuration: {},
          validation: {},
          reporting: {},
          enforcement: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Release rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeReleaseRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateReleaseRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded release rules config from ${displayPath}.`);
      logger.debug(
        `Release rules config contains ${normalizedConfig.release_labels.valid.length} release labels.`,
      );
      logger.dump("release rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load release rules config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function normalizeBranchName(branchNameOrRef) {
  if (!branchNameOrRef || typeof branchNameOrRef !== "string") return "";

  return branchNameOrRef
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  if (!refOrTag || typeof refOrTag !== "string") return "";

  return refOrTag.replace(/^refs\/tags\//, "").trim();
}

function stripVersionPrefix(version, prefix = "V") {
  const normalized = normalizeString(version, "version", { allowEmpty: false });

  if (prefix && normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }

  if (normalized.startsWith("v")) {
    return normalized.slice(1);
  }

  if (normalized.startsWith("V")) {
    return normalized.slice(1);
  }

  return normalized;
}

function addVersionPrefix(version, prefix = "V") {
  const raw = normalizeString(version, "version", { allowEmpty: false });
  const bare = stripVersionPrefix(raw, prefix);

  return `${prefix}${bare}`;
}

function isSemverVersion(version) {
  if (!version || typeof version !== "string") return false;

  const bare = stripVersionPrefix(version);

  return Boolean(semver.valid(bare));
}

function normalizeReleaseVersion(version, prefix = "V") {
  if (!version || typeof version !== "string") {
    throw new TypeError("version must be a non-empty string.");
  }

  const bare = stripVersionPrefix(version, prefix);
  const valid = semver.valid(bare);

  if (!valid) {
    throw new TypeError(`Invalid semantic version: ${version}`);
  }

  return `${prefix}${valid}`;
}

function isReleaseTag(config, refOrTag) {
  const tag = normalizeTagName(refOrTag);
  return matchesRegex(config.versioning.tag_pattern, tag);
}

function getDefaultBranch(config) {
  return config.repository?.default_branch || "main";
}

function isDefaultBranch(config, branchNameOrRef) {
  return normalizeBranchName(branchNameOrRef) === getDefaultBranch(config);
}

function normalizeLabels(labels) {
  return normalizeStringList(labels, "labels");
}

function hasAnyLabel(labels, candidates) {
  const labelSet = new Set(normalizeLabels(labels));
  return normalizeStringList(candidates, "candidates").some((label) =>
    labelSet.has(label),
  );
}

function hasAllLabels(labels, candidates) {
  const labelSet = new Set(normalizeLabels(labels));
  return normalizeStringList(candidates, "candidates").every((label) =>
    labelSet.has(label),
  );
}

function getReleaseLabels(config, labels) {
  const normalizedLabels = normalizeLabels(labels);

  return normalizedLabels.filter((label) =>
    config.release_labels.valid.includes(label),
  );
}

function getReleaseLabel(config, labels) {
  const releaseLabels = getReleaseLabels(config, labels);

  if (releaseLabels.length !== 1) return null;

  return releaseLabels[0];
}

function getReleaseBumpForLabel(config, label) {
  if (!label || typeof label !== "string") return null;

  return config.versioning.bump_rules?.[label] || null;
}

function getReleaseBump(config, labels) {
  const label = getReleaseLabel(config, labels);

  if (!label) return null;

  return getReleaseBumpForLabel(config, label);
}

function hasReleaseBlockingLabel(config, labels) {
  return hasAnyLabel(labels, config.blockers.labels);
}

function getReleaseBlockingLabels(config, labels) {
  const normalizedLabels = normalizeLabels(labels);

  return normalizedLabels.filter((label) =>
    config.blockers.labels.includes(label),
  );
}

function isDependencyAuthor(config, author) {
  if (!author || typeof author !== "string") return false;

  const normalizedAuthor = author.trim();

  return (
    config.blockers.authors.includes(normalizedAuthor) ||
    config.release_source.ignored_sources.authors.includes(normalizedAuthor)
  );
}

function isDependencyBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!branchName) return false;

  return (
    matchesAnyRegex(config.blockers.branch_patterns, branchName) ||
    matchesAnyRegex(
      config.release_source.ignored_sources.branch_patterns,
      branchName,
    )
  );
}

function isDependencySource(config, input = {}) {
  const author = input.author || input.actor || "";
  const branch = input.branch || input.head_branch || input.headBranch || "";

  return (
    isDependencyAuthor(config, author) || isDependencyBranch(config, branch)
  );
}

function isLockfileOnlyChange(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");

  if (!files.length) return false;

  const lockfileRule = config.blockers.changed_files.lockfile_only;

  if (!lockfileRule.enabled) return false;

  return files.every((file) => matchesAnyGlob(lockfileRule.patterns, file));
}

function getFailedRequiredChecks(
  config,
  checks = {},
  checkGroup = "release_eligibility",
) {
  const required = config.required_checks?.[checkGroup] || [];
  const normalizedChecks = normalizeObject(checks, "checks");

  return required.filter(
    (checkName) => normalizedChecks[checkName] !== "success",
  );
}

function getSecurityFindingBlockers(config, findings = []) {
  if (!Array.isArray(findings)) return [];

  const blockSeverities = config.blockers.security_findings.block_on.map(
    (item) => item.toLowerCase(),
  );

  return findings
    .filter((finding) => isPlainObject(finding))
    .filter((finding) => {
      const severity = String(finding.severity || "").toLowerCase();
      return blockSeverities.includes(severity);
    })
    .map((finding) => ({
      type: "security_finding",
      severity: String(finding.severity || "").toLowerCase(),
      tool: finding.tool || null,
      message: finding.message || finding.title || null,
    }));
}

function getReleaseBlockers(config, input = {}) {
  validateReleaseRulesConfig(config);

  const labels = normalizeLabels(input.labels || []);
  const author = normalizeNullableString(
    input.author || input.actor,
    "input.author",
  );
  const branch = normalizeBranchName(
    input.branch || input.head_branch || input.headBranch || "",
  );
  const baseBranch = normalizeBranchName(
    input.base_branch || input.baseBranch || "",
  );
  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
    "input.changed_files",
  );
  const checks = normalizeObject(input.checks, "input.checks");
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const merged = normalizeBoolean(input.merged, false);
  const eventName = normalizeNullableString(
    input.event || input.event_name,
    "input.event",
  );

  const blockers = [];

  for (const label of getReleaseBlockingLabels(config, labels)) {
    blockers.push({
      type: "label",
      value: label,
      reason: `Release-blocking label is present: ${label}`,
    });
  }

  if (author && config.blockers.authors.includes(author)) {
    blockers.push({
      type: "author",
      value: author,
      reason: `Release-blocking author matched: ${author}`,
    });
  }

  if (branch && matchesAnyRegex(config.blockers.branch_patterns, branch)) {
    blockers.push({
      type: "branch",
      value: branch,
      reason: `Release-blocking branch pattern matched: ${branch}`,
    });
  }

  if (
    config.policy.release_only_from_default_branch &&
    baseBranch &&
    baseBranch !== getDefaultBranch(config)
  ) {
    blockers.push({
      type: "base_branch",
      value: baseBranch,
      reason: `Release source must target ${getDefaultBranch(config)}.`,
    });
  }

  if (config.policy.release_only_after_pr_merge && !merged) {
    blockers.push({
      type: "merged",
      value: merged,
      reason: "Release source must be a merged pull request.",
    });
  }

  if (
    eventName === "pull_request" &&
    config.safety.do_not_release_from_pull_request_event
  ) {
    blockers.push({
      type: "event",
      value: eventName,
      reason: "Release cannot run directly from a pull_request event.",
    });
  }

  if (
    config.policy.lockfile_only_prs_never_release &&
    isLockfileOnlyChange(config, changedFiles)
  ) {
    blockers.push({
      type: "lockfile_only",
      value: changedFiles,
      reason: "Lockfile-only changes cannot create releases.",
    });
  }

  const releaseLabels = getReleaseLabels(config, labels);

  if (config.policy.require_release_label && releaseLabels.length === 0) {
    blockers.push({
      type: "missing_release_label",
      reason: "Release requires one release label.",
    });
  }

  if (
    config.policy.require_exactly_one_release_label &&
    releaseLabels.length > 1
  ) {
    blockers.push({
      type: "multiple_release_labels",
      labels: releaseLabels,
      reason: "Release requires exactly one release label.",
    });
  }

  if (
    config.blockers.release_label_conflicts
      .block_if_release_label_with_no_release &&
    releaseLabels.length &&
    labels.includes("no-release")
  ) {
    blockers.push({
      type: "label_conflict",
      labels: ["no-release", ...releaseLabels],
      reason: "`no-release` cannot be combined with release labels.",
    });
  }

  if (
    config.blockers.release_label_conflicts
      .block_if_release_label_with_dependencies &&
    releaseLabels.length &&
    labels.includes("dependencies")
  ) {
    blockers.push({
      type: "label_conflict",
      labels: ["dependencies", ...releaseLabels],
      reason: "`dependencies` cannot be combined with release labels.",
    });
  }

  if (
    config.blockers.release_label_conflicts
      .block_if_release_label_with_security_dependency &&
    releaseLabels.length &&
    labels.includes("security:dependency")
  ) {
    blockers.push({
      type: "label_conflict",
      labels: ["security:dependency", ...releaseLabels],
      reason: "`security:dependency` cannot be combined with release labels.",
    });
  }

  if (config.policy.release_only_when_checks_pass) {
    const failedChecks = getFailedRequiredChecks(
      config,
      checks,
      "release_eligibility",
    );

    for (const checkName of failedChecks) {
      blockers.push({
        type: "check",
        value: checkName,
        reason: `Required check has not passed: ${checkName}`,
      });
    }
  }

  blockers.push(...getSecurityFindingBlockers(config, findings));

  return blockers;
}

function evaluateReleaseEligibility(config, input = {}) {
  const blockers = getReleaseBlockers(config, input);
  const labels = normalizeLabels(input.labels || []);
  const releaseLabels = getReleaseLabels(config, labels);
  const releaseLabel = releaseLabels.length === 1 ? releaseLabels[0] : null;
  const releaseBump = releaseLabel
    ? getReleaseBumpForLabel(config, releaseLabel)
    : null;

  return {
    eligible: blockers.length === 0,
    release_label: releaseLabel,
    release_labels: releaseLabels,
    release_bump: releaseBump,
    blockers,
  };
}

function incrementVersion(config, currentVersion, bump) {
  const prefix = config.versioning.prefix || "V";
  const normalizedCurrent = normalizeReleaseVersion(
    currentVersion || config.versioning.source.fallback_version,
    prefix,
  );
  const bare = stripVersionPrefix(normalizedCurrent, prefix);

  const next = semver.inc(bare, bump || config.versioning.default_bump);

  if (!next) {
    throw new Error(
      `Unable to increment version "${currentVersion}" with bump "${bump}".`,
    );
  }

  return `${prefix}${next}`;
}

function determineNextVersion(config, input = {}) {
  validateReleaseRulesConfig(config);

  const currentVersion =
    input.current_version ||
    input.currentVersion ||
    input.latest_tag ||
    input.latestTag ||
    config.versioning.source.fallback_version;

  const labels = normalizeLabels(input.labels || []);
  const bump =
    input.bump ||
    getReleaseBump(config, labels) ||
    config.versioning.default_bump;

  return incrementVersion(config, currentVersion, bump);
}

function validateNextVersion(config, nextVersion, latestVersion = null) {
  validateReleaseRulesConfig(config);

  const prefix = config.versioning.prefix || "V";
  const normalizedNext = normalizeReleaseVersion(nextVersion, prefix);

  const result = {
    valid: true,
    version: normalizedNext,
    errors: [],
  };

  if (!matchesRegex(config.versioning.tag_pattern, normalizedNext)) {
    result.errors.push(`Version does not match tag pattern: ${normalizedNext}`);
  }

  if (latestVersion) {
    const normalizedLatest = normalizeReleaseVersion(latestVersion, prefix);
    const nextBare = stripVersionPrefix(normalizedNext, prefix);
    const latestBare = stripVersionPrefix(normalizedLatest, prefix);

    if (!semver.gt(nextBare, latestBare)) {
      result.errors.push(
        `Next version ${normalizedNext} must be greater than latest version ${normalizedLatest}.`,
      );
    }
  }

  result.valid = result.errors.length === 0;

  return result;
}

function getReleaseChannel(config, input = {}) {
  const channel =
    input.channel ||
    input.release_channel ||
    input.releaseChannel ||
    process.env.RELEASE_CHANNEL ||
    config.versioning.prerelease.default_channel ||
    "release";

  const normalized = normalizeString(channel, "channel", {
    fallback: "release",
  });

  if (
    config.versioning.prerelease.channels.length &&
    !config.versioning.prerelease.channels.includes(normalized)
  ) {
    throw new Error(
      `Invalid release channel "${normalized}". Allowed channels: ${config.versioning.prerelease.channels.join(", ")}`,
    );
  }

  return normalized;
}

function formatImageRepository(config, imageName) {
  const normalizedName = normalizeDockerImageName(config, imageName);

  return config.ghcr.image_repository_format.replace("{name}", normalizedName);
}

function formatImageTag(config, version, channel = "release") {
  const normalizedVersion = normalizeReleaseVersion(
    version,
    config.versioning.prefix,
  );

  return config.ghcr.image_tag_format
    .replace("{version}", normalizedVersion)
    .replace("{channel}", channel);
}

function formatImageRef(config, imageName, version, channel = "release") {
  return `${formatImageRepository(config, imageName)}:${formatImageTag(
    config,
    version,
    channel,
  )}`;
}

function normalizeDockerImageName(config, name) {
  let normalized = normalizeString(name, "name", { allowEmpty: false });

  if (config.ghcr.naming.normalize_to_lowercase) {
    normalized = normalized.toLowerCase();
  }

  const replacement = config.ghcr.naming.replace_invalid_characters_with || "-";

  normalized = normalized.replace(/[^a-z0-9._-]+/gi, replacement);

  if (config.ghcr.naming.collapse_duplicate_separators) {
    const escaped = replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(
      new RegExp(`${escaped}+`, "g"),
      replacement,
    );
  }

  normalized = normalized.replace(/^[._-]+/, "").replace(/[._-]+$/, "");

  return normalized || "image";
}

function deriveImageNameFromDockerfile(config, dockerfilePath) {
  const normalizedPath = normalizeString(dockerfilePath, "dockerfilePath", {
    allowEmpty: false,
  });
  const dirname = path.basename(path.dirname(normalizedPath));
  const basename = path.basename(normalizedPath);

  if (basename !== "Dockerfile" && basename.startsWith("Dockerfile.")) {
    return normalizeDockerImageName(
      config,
      basename.replace(/^Dockerfile\./, ""),
    );
  }

  return normalizeDockerImageName(config, dirname === "." ? "root" : dirname);
}

function shouldIgnorePath(filePath, ignorePatterns = []) {
  return matchesAnyGlob(ignorePatterns, filePath);
}

function isDockerfilePath(config, filePath) {
  if (
    shouldIgnorePath(filePath, config.ghcr.dockerfile_discovery.ignore_paths)
  ) {
    return false;
  }

  return matchesAnyGlob(
    config.ghcr.dockerfile_discovery.dockerfile_patterns,
    filePath,
  );
}

function discoverDockerfilesFromList(config, files = []) {
  const normalizedFiles = normalizeStringList(files, "files");

  return normalizedFiles
    .filter((file) => isDockerfilePath(config, file))
    .map((dockerfile) => ({
      dockerfile,
      context: path.dirname(dockerfile),
      name: deriveImageNameFromDockerfile(config, dockerfile),
    }));
}

function isPackageJsonPath(config, filePath) {
  if (shouldIgnorePath(filePath, config.npm.package_discovery.ignore_paths)) {
    return false;
  }

  return matchesAnyGlob(
    config.npm.package_discovery.package_json_patterns,
    filePath,
  );
}

function discoverPackageJsonPathsFromList(config, files = []) {
  const normalizedFiles = normalizeStringList(files, "files");

  return normalizedFiles.filter((file) => isPackageJsonPath(config, file));
}

function isPackagePublishable(config, packageJson = {}) {
  if (!isPlainObject(packageJson)) {
    throw new TypeError("packageJson must be an object.");
  }

  if (config.npm.validation.require_name && !packageJson.name) {
    return false;
  }

  if (config.npm.validation.require_version && !packageJson.version) {
    return false;
  }

  if (config.npm.validation.require_private_false) {
    return packageJson.private === false;
  }

  return packageJson.private !== true;
}

function getRequiredReleaseArtifacts(config) {
  return unique(
    [
      ...(config.github_release.assets.required || []),
      config.release_evidence.artifacts.checksums.files.sha256,
      config.release_evidence.artifacts.checksums.files.sha512,
      config.release_evidence.artifacts.manifest.file,
      config.release_evidence.artifacts.sbom.file,
    ].filter(Boolean),
  );
}

function getMissingRequiredArtifacts(config, artifactNames = []) {
  const artifactSet = new Set(
    normalizeStringList(artifactNames, "artifactNames"),
  );

  return getRequiredReleaseArtifacts(config).filter(
    (artifact) => !artifactSet.has(artifact),
  );
}

function evaluateReleaseEvidence(config, input = {}) {
  const artifacts = normalizeStringList(
    input.artifacts || input.artifact_names,
    "artifacts",
  );
  const attestationsCreated = normalizeBoolean(
    input.attestations_created,
    false,
  );
  const sbomCreated = normalizeBoolean(input.sbom_created, false);

  const missingArtifacts = getMissingRequiredArtifacts(config, artifacts);
  const blockers = [];

  if (missingArtifacts.length) {
    blockers.push({
      type: "missing_artifacts",
      artifacts: missingArtifacts,
      reason: "Required release artifacts are missing.",
    });
  }

  if (config.release_evidence.artifacts.sbom.enabled && !sbomCreated) {
    blockers.push({
      type: "sbom",
      reason: "Required SBOM was not created.",
    });
  }

  if (config.release_evidence.attestations.enabled && !attestationsCreated) {
    blockers.push({
      type: "attestations",
      reason: "Required release attestations were not created.",
    });
  }

  return {
    valid: blockers.length === 0,
    missing_artifacts: missingArtifacts,
    blockers,
  };
}

function canGenerateAttestations(config, input = {}) {
  const jobType = normalizeString(
    input.job_type || input.jobType,
    "input.job_type",
    {
      fallback: "unknown",
    },
  );

  if (!config.release_evidence.attestations.enabled) {
    return {
      allowed: false,
      reason: "Attestations are disabled.",
    };
  }

  if (!config.release_evidence.attestations.only_on_release_or_publish_jobs) {
    return {
      allowed: true,
      reason: "Attestations are allowed by policy.",
    };
  }

  const allowed = [
    "release",
    "publish",
    "publish_npm",
    "publish_containers",
  ].includes(jobType);

  return {
    allowed,
    reason: allowed
      ? "Attestations are allowed for release or publish jobs."
      : "Attestations are only allowed for release or publish jobs.",
  };
}

function getConfigurationRequirements(config, groupName) {
  const group = normalizeString(groupName, "groupName", { allowEmpty: false });

  return {
    secrets: config.configuration.required_secrets?.[group] || [],
    variables: config.configuration.required_variables?.[group] || [],
  };
}

function validateRuntimeConfiguration(config, groupName, env = process.env) {
  const requirements = getConfigurationRequirements(config, groupName);

  const missing = {
    secrets: requirements.secrets.filter((secret) => !env[secret]),
    variables: requirements.variables.filter((variable) => !env[variable]),
  };

  return {
    valid: missing.secrets.length === 0 && missing.variables.length === 0,
    missing,
  };
}

function formatReleaseTitle(config, version) {
  const normalizedVersion = normalizeReleaseVersion(
    version,
    config.versioning.prefix,
  );

  return config.github_release.title_format.replace(
    "{version}",
    normalizedVersion,
  );
}

function formatDiscussionTitle(config, version) {
  const normalizedVersion = normalizeReleaseVersion(
    version,
    config.versioning.prefix,
  );

  return config.discussion_announcement.title_format.replace(
    "{version}",
    normalizedVersion,
  );
}

function shouldSkipDiscussionAnnouncement(config, input = {}) {
  const labels = normalizeLabels(input.labels || []);
  const author = normalizeNullableString(
    input.author || input.actor,
    "input.author",
  );

  const reasons = [];

  for (const label of labels) {
    if (config.discussion_announcement.skip_if.labels.includes(label)) {
      reasons.push({
        type: "label",
        value: label,
        reason: `Discussion announcement skip label is present: ${label}`,
      });
    }
  }

  if (
    author &&
    config.discussion_announcement.skip_if.authors.includes(author)
  ) {
    reasons.push({
      type: "author",
      value: author,
      reason: `Discussion announcement skip author matched: ${author}`,
    });
  }

  return {
    skip: reasons.length > 0,
    reasons,
  };
}

function summarizeReleaseEligibility(evaluation) {
  if (evaluation.eligible) {
    return `Release eligible: ${evaluation.release_label} (${evaluation.release_bump})`;
  }

  return [
    "Release not eligible.",
    ...evaluation.blockers.map((blocker) => `- ${blocker.reason}`),
  ].join("\n");
}

function summarizeReleaseEvidence(evaluation) {
  if (evaluation.valid) {
    return "Release evidence valid.";
  }

  return [
    "Release evidence invalid.",
    ...evaluation.blockers.map((blocker) => `- ${blocker.reason}`),
  ].join("\n");
}

function assertReleaseLabelsValid(config, labels) {
  const releaseLabels = getReleaseLabels(config, labels);

  if (releaseLabels.length !== 1) {
    throw new Error(
      `Expected exactly one release label, found ${releaseLabels.length}: ${releaseLabels.join(", ")}`,
    );
  }

  return true;
}

function assertReleaseEligible(config, input = {}) {
  const evaluation = evaluateReleaseEligibility(config, input);

  if (!evaluation.eligible) {
    throw new Error(summarizeReleaseEligibility(evaluation));
  }

  return true;
}

function assertAttestationsAllowed(config, input = {}) {
  const evaluation = canGenerateAttestations(config, input);

  if (!evaluation.allowed) {
    throw new Error(evaluation.reason);
  }

  return true;
}

if (require.main === module) {
  try {
    const config = loadReleaseRulesConfig();

    validateReleaseRulesConfig(config);

    logger.info(
      `Release rules config validation passed for ${config.repository.owner}/${config.repository.name}.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_RELEASE_LABELS,
  DEFAULT_RELEASE_BLOCKING_LABELS,
  DEFAULT_DEPENDENCY_AUTHORS,
  DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
  DEFAULT_TAG_PATTERN,
  DEFAULT_REQUIRED_RELEASE_ARTIFACTS,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadReleaseRulesConfig,
  normalizeReleaseRulesConfig,
  validateReleaseRulesConfig,

  normalizeBranchName,
  normalizeTagName,

  stripVersionPrefix,
  addVersionPrefix,
  isSemverVersion,
  normalizeReleaseVersion,
  isReleaseTag,

  getDefaultBranch,
  isDefaultBranch,

  normalizeLabels,
  hasAnyLabel,
  hasAllLabels,

  getReleaseLabels,
  getReleaseLabel,
  getReleaseBumpForLabel,
  getReleaseBump,

  hasReleaseBlockingLabel,
  getReleaseBlockingLabels,

  isDependencyAuthor,
  isDependencyBranch,
  isDependencySource,
  isLockfileOnlyChange,

  getFailedRequiredChecks,
  getSecurityFindingBlockers,
  getReleaseBlockers,
  evaluateReleaseEligibility,

  incrementVersion,
  determineNextVersion,
  validateNextVersion,
  getReleaseChannel,

  normalizeDockerImageName,
  deriveImageNameFromDockerfile,
  formatImageRepository,
  formatImageTag,
  formatImageRef,

  shouldIgnorePath,
  isDockerfilePath,
  discoverDockerfilesFromList,

  isPackageJsonPath,
  discoverPackageJsonPathsFromList,
  isPackagePublishable,

  getRequiredReleaseArtifacts,
  getMissingRequiredArtifacts,
  evaluateReleaseEvidence,

  canGenerateAttestations,

  getConfigurationRequirements,
  validateRuntimeConfiguration,

  formatReleaseTitle,
  formatDiscussionTitle,
  shouldSkipDiscussionAnnouncement,

  summarizeReleaseEligibility,
  summarizeReleaseEvidence,

  assertReleaseLabelsValid,
  assertReleaseEligible,
  assertAttestationsAllowed,
};
