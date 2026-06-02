// .github/scripts/utils/config-loaders/branch-rules.js
// =============================================================================
// Aerealith AI Branch Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/branch-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/enforce-branch-name.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/link-issues-prs.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/run-repo-management.js
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - It centralizes branch, PR target, automation branch, dependency branch,
//     release label, and release blocker logic.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/branch-rules.yaml";

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

function normalizeNullableString(value, fieldPath) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string when provided.`);
  }

  return value.trim() || null;
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
    throw new TypeError(`${fieldPath} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return trimmed || fallback;
}

function normalizeStringList(value, fieldPath, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (allowEmpty) return [];
    throw new TypeError(`${fieldPath} is required.`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

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
      if (typeof item !== "string") {
        throw new TypeError(`${fieldPath}[${index}] must be a string.`);
      }

      return item.trim();
    })
    .filter(Boolean);

  if (!normalized.length && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return unique(normalized);
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

function normalizeRepository(repository) {
  if (repository === undefined || repository === null) {
    repository = {};
  }

  if (!isPlainObject(repository)) {
    throw new TypeError("repository must be an object.");
  }

  return {
    ...repository,
    name: normalizeString(repository.name, "repository.name", {
      fallback: "Aerealith-AI",
    }),
    owner: normalizeString(repository.owner, "repository.owner", {
      fallback: "SinLess-Games",
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

function normalizePolicy(policy) {
  if (policy === undefined || policy === null) {
    policy = {};
  }

  if (!isPlainObject(policy)) {
    throw new TypeError("policy must be an object.");
  }

  return {
    ...policy,

    require_pull_request_to_main: normalizeBoolean(
      policy.require_pull_request_to_main,
      true,
    ),

    block_direct_push_to_main: normalizeBoolean(
      policy.block_direct_push_to_main,
      true,
    ),

    allow_main_as_base_branch: normalizeBoolean(
      policy.allow_main_as_base_branch,
      true,
    ),

    require_issue_number_for_human_branches: normalizeBoolean(
      policy.require_issue_number_for_human_branches,
      true,
    ),

    require_issue_number_for_automation_branches: normalizeBoolean(
      policy.require_issue_number_for_automation_branches,
      false,
    ),

    allow_release_branches: normalizeBoolean(
      policy.allow_release_branches,
      true,
    ),

    infer_release_labels_from_branch: normalizeBoolean(
      policy.infer_release_labels_from_branch,
      false,
    ),

    dependency_branches_are_no_release: normalizeBoolean(
      policy.dependency_branches_are_no_release,
      true,
    ),

    ai_must_not_push_to_main: normalizeBoolean(
      policy.ai_must_not_push_to_main,
      true,
    ),
  };
}

function normalizeProtectedBranches(protectedBranches) {
  if (protectedBranches === undefined || protectedBranches === null) return {};

  if (!isPlainObject(protectedBranches)) {
    throw new TypeError("protected_branches must be an object.");
  }

  return Object.fromEntries(
    Object.entries(protectedBranches).map(([branchName, branchConfig]) => {
      if (!isPlainObject(branchConfig)) {
        throw new TypeError(
          `protected_branches.${branchName} must be an object.`,
        );
      }

      return [
        branchName,
        {
          ...branchConfig,
          description: normalizeNullableString(
            branchConfig.description,
            `protected_branches.${branchName}.description`,
          ),
          required: normalizeBoolean(branchConfig.required, true),
          allow_direct_push: normalizeBoolean(
            branchConfig.allow_direct_push,
            false,
          ),
          allow_force_push: normalizeBoolean(
            branchConfig.allow_force_push,
            false,
          ),
          allow_delete: normalizeBoolean(branchConfig.allow_delete, false),
          allowed_base_for_pull_requests: normalizeBoolean(
            branchConfig.allowed_base_for_pull_requests,
            true,
          ),
          required_status_checks: normalizeStringList(
            branchConfig.required_status_checks,
            `protected_branches.${branchName}.required_status_checks`,
          ),
          required_labels_absent: normalizeStringList(
            branchConfig.required_labels_absent,
            `protected_branches.${branchName}.required_labels_absent`,
          ),
          required_before_merge: normalizeStringList(
            branchConfig.required_before_merge,
            `protected_branches.${branchName}.required_before_merge`,
          ),
        },
      ];
    }),
  );
}

function normalizeBaseBranches(baseBranches) {
  if (baseBranches === undefined || baseBranches === null) return {};

  if (!isPlainObject(baseBranches)) {
    throw new TypeError("base_branches must be an object.");
  }

  return Object.fromEntries(
    Object.entries(baseBranches).map(([branchName, branchConfig]) => {
      if (!isPlainObject(branchConfig)) {
        throw new TypeError(`base_branches.${branchName} must be an object.`);
      }

      const normalized = {
        ...branchConfig,
        enabled: normalizeBoolean(branchConfig.enabled, true),
        description: normalizeNullableString(
          branchConfig.description,
          `base_branches.${branchName}.description`,
        ),
        pattern: normalizeNullableString(
          branchConfig.pattern,
          `base_branches.${branchName}.pattern`,
        ),
      };

      if (normalized.pattern) {
        compileRegex(normalized.pattern, `base_branches.${branchName}.pattern`);
      }

      return [branchName, normalized];
    }),
  );
}

function normalizeHumanBranchRules(humanBranchRules) {
  if (humanBranchRules === undefined || humanBranchRules === null) {
    humanBranchRules = {};
  }

  if (!isPlainObject(humanBranchRules)) {
    throw new TypeError("human_branch_rules must be an object.");
  }

  const requiredPattern = normalizeString(
    humanBranchRules.required_pattern,
    "human_branch_rules.required_pattern",
    {
      fallback:
        "^(feature|feat|fix|bugfix|hotfix|chore|maintenance|docs|doc|refactor|test|tests|security|ci|deploy|deployment)/(?<issue>[0-9]+)-(?<slug>[a-z0-9][a-z0-9-]*[a-z0-9])$",
    },
  );

  const releaseBranchPattern = normalizeString(
    humanBranchRules.release_branch_pattern,
    "human_branch_rules.release_branch_pattern",
    {
      fallback:
        "^release/V(?<major>[0-9]+)\\.(?<minor>[0-9]+)\\.(?<patch>[0-9]+)$",
    },
  );

  compileRegex(requiredPattern, "human_branch_rules.required_pattern");
  compileRegex(
    releaseBranchPattern,
    "human_branch_rules.release_branch_pattern",
  );

  const slugRules = isPlainObject(humanBranchRules.slug_rules)
    ? humanBranchRules.slug_rules
    : {};

  const issueNumberRules = isPlainObject(humanBranchRules.issue_number_rules)
    ? humanBranchRules.issue_number_rules
    : {};

  const examples = isPlainObject(humanBranchRules.examples)
    ? humanBranchRules.examples
    : {};

  return {
    ...humanBranchRules,

    enabled: normalizeBoolean(humanBranchRules.enabled, true),

    allowed_types: normalizeStringList(
      humanBranchRules.allowed_types,
      "human_branch_rules.allowed_types",
    ),

    required_pattern: requiredPattern,
    release_branch_pattern: releaseBranchPattern,

    slug_rules: {
      ...slugRules,
      format: normalizeString(
        slugRules.format,
        "human_branch_rules.slug_rules.format",
        {
          fallback: "kebab-case",
        },
      ),
      min_length: normalizeNumber(
        slugRules.min_length,
        3,
        "human_branch_rules.slug_rules.min_length",
      ),
      max_length: normalizeNumber(
        slugRules.max_length,
        80,
        "human_branch_rules.slug_rules.max_length",
      ),
      allowed_characters: normalizeString(
        slugRules.allowed_characters,
        "human_branch_rules.slug_rules.allowed_characters",
        {
          fallback: "a-z, 0-9, hyphen",
        },
      ),
      disallow_trailing_hyphen: normalizeBoolean(
        slugRules.disallow_trailing_hyphen,
        true,
      ),
      disallow_double_hyphen: normalizeBoolean(
        slugRules.disallow_double_hyphen,
        true,
      ),
    },

    issue_number_rules: {
      ...issueNumberRules,
      required: normalizeBoolean(issueNumberRules.required, true),
      min: normalizeNumber(
        issueNumberRules.min,
        1,
        "human_branch_rules.issue_number_rules.min",
      ),
    },

    examples: {
      ...examples,
      valid: normalizeStringList(
        examples.valid,
        "human_branch_rules.examples.valid",
      ),
      invalid: normalizeStringList(
        examples.invalid,
        "human_branch_rules.examples.invalid",
      ),
    },
  };
}

function normalizeBranchTypes(branchTypes) {
  if (branchTypes === undefined || branchTypes === null) return {};

  if (!isPlainObject(branchTypes)) {
    throw new TypeError("branch_types must be an object.");
  }

  return Object.fromEntries(
    Object.entries(branchTypes).map(([typeName, typeConfig]) => {
      if (!isPlainObject(typeConfig)) {
        throw new TypeError(`branch_types.${typeName} must be an object.`);
      }

      return [
        typeName,
        {
          ...typeConfig,
          aliases: normalizeStringList(
            typeConfig.aliases,
            `branch_types.${typeName}.aliases`,
          ),
          labels: normalizeStringList(
            typeConfig.labels,
            `branch_types.${typeName}.labels`,
          ),
          release_allowed: normalizeBoolean(typeConfig.release_allowed, false),
          default_release_label: normalizeNullableString(
            typeConfig.default_release_label,
            `branch_types.${typeName}.default_release_label`,
          ),
          milestone_hint: normalizeNullableString(
            typeConfig.milestone_hint,
            `branch_types.${typeName}.milestone_hint`,
          ),
        },
      ];
    }),
  );
}

function normalizeAutomationBranchRules(automationBranchRules) {
  if (automationBranchRules === undefined || automationBranchRules === null) {
    automationBranchRules = {};
  }

  if (!isPlainObject(automationBranchRules)) {
    throw new TypeError("automation_branch_rules must be an object.");
  }

  const allowedPatterns = normalizeStringList(
    automationBranchRules.allowed_patterns,
    "automation_branch_rules.allowed_patterns",
  );

  validateRegexList(
    allowedPatterns,
    "automation_branch_rules.allowed_patterns",
  );

  const rules = isPlainObject(automationBranchRules.rules)
    ? automationBranchRules.rules
    : {};

  const normalizedRules = Object.fromEntries(
    Object.entries(rules).map(([ruleName, ruleConfig]) => {
      if (!isPlainObject(ruleConfig)) {
        throw new TypeError(
          `automation_branch_rules.rules.${ruleName} must be an object.`,
        );
      }

      const patterns = normalizeStringList(
        ruleConfig.patterns,
        `automation_branch_rules.rules.${ruleName}.patterns`,
      );

      validateRegexList(
        patterns,
        `automation_branch_rules.rules.${ruleName}.patterns`,
      );

      return [
        ruleName,
        {
          ...ruleConfig,
          patterns,
          allowed_base_branches: normalizeStringList(
            ruleConfig.allowed_base_branches,
            `automation_branch_rules.rules.${ruleName}.allowed_base_branches`,
          ),
          labels: normalizeStringList(
            ruleConfig.labels,
            `automation_branch_rules.rules.${ruleName}.labels`,
          ),
          release_allowed: normalizeBoolean(ruleConfig.release_allowed, false),
          auto_merge_allowed: normalizeBoolean(
            ruleConfig.auto_merge_allowed,
            false,
          ),
          require_issue_number: normalizeBoolean(
            ruleConfig.require_issue_number,
            false,
          ),
          require_maintainer_review: normalizeBoolean(
            ruleConfig.require_maintainer_review,
            false,
          ),
        },
      ];
    }),
  );

  return {
    ...automationBranchRules,
    enabled: normalizeBoolean(automationBranchRules.enabled, true),
    allowed_patterns: allowedPatterns,
    rules: normalizedRules,
  };
}

function normalizePullRequestRules(pullRequestRules) {
  if (pullRequestRules === undefined || pullRequestRules === null) {
    pullRequestRules = {};
  }

  if (!isPlainObject(pullRequestRules)) {
    throw new TypeError("pull_request_rules must be an object.");
  }

  const title = isPlainObject(pullRequestRules.title)
    ? pullRequestRules.title
    : {};
  const body = isPlainObject(pullRequestRules.body)
    ? pullRequestRules.body
    : {};
  const labels = isPlainObject(pullRequestRules.labels)
    ? pullRequestRules.labels
    : {};
  const blockers = isPlainObject(pullRequestRules.blockers)
    ? pullRequestRules.blockers
    : {};

  return {
    ...pullRequestRules,

    required_base_branch: normalizeString(
      pullRequestRules.required_base_branch,
      "pull_request_rules.required_base_branch",
      {
        fallback: "main",
      },
    ),

    title: {
      ...title,
      require_type_prefix: normalizeBoolean(title.require_type_prefix, true),
      allowed_prefixes: normalizeStringList(
        title.allowed_prefixes,
        "pull_request_rules.title.allowed_prefixes",
      ),
    },

    body: {
      ...body,
      require_linked_issue_for_human_prs: normalizeBoolean(
        body.require_linked_issue_for_human_prs,
        true,
      ),
      accepted_link_keywords: normalizeStringList(
        body.accepted_link_keywords,
        "pull_request_rules.body.accepted_link_keywords",
      ),
    },

    labels: {
      ...labels,
      require_at_least_one_kind_label: normalizeBoolean(
        labels.require_at_least_one_kind_label,
        true,
      ),
      require_at_least_one_status_label: normalizeBoolean(
        labels.require_at_least_one_status_label,
        true,
      ),
      require_release_label_for_release: normalizeBoolean(
        labels.require_release_label_for_release,
        true,
      ),
      mutually_exclusive_groups: isPlainObject(labels.mutually_exclusive_groups)
        ? Object.fromEntries(
            Object.entries(labels.mutually_exclusive_groups).map(
              ([groupName, groupLabels]) => [
                groupName,
                normalizeStringList(
                  groupLabels,
                  `pull_request_rules.labels.mutually_exclusive_groups.${groupName}`,
                ),
              ],
            ),
          )
        : {},
    },

    blockers: {
      ...blockers,
      labels_that_block_merge: normalizeStringList(
        blockers.labels_that_block_merge,
        "pull_request_rules.blockers.labels_that_block_merge",
      ),
      labels_that_require_review: normalizeStringList(
        blockers.labels_that_require_review,
        "pull_request_rules.blockers.labels_that_require_review",
      ),
    },
  };
}

function normalizeReleaseRules(releaseRules) {
  if (releaseRules === undefined || releaseRules === null) {
    releaseRules = {};
  }

  if (!isPlainObject(releaseRules)) {
    throw new TypeError("release_rules must be an object.");
  }

  const tagPattern = normalizeString(
    releaseRules.tag_pattern,
    "release_rules.tag_pattern",
    {
      fallback: "^V[0-9]+\\.[0-9]+\\.[0-9]+$",
    },
  );

  compileRegex(tagPattern, "release_rules.tag_pattern");

  const releaseChannel = isPlainObject(releaseRules.release_channel)
    ? releaseRules.release_channel
    : {};

  const releaseBlockingBranchPatterns = normalizeStringList(
    releaseRules.release_blocking_branch_patterns,
    "release_rules.release_blocking_branch_patterns",
  );

  validateRegexList(
    releaseBlockingBranchPatterns,
    "release_rules.release_blocking_branch_patterns",
  );

  return {
    ...releaseRules,

    release_only_from_main: normalizeBoolean(
      releaseRules.release_only_from_main,
      true,
    ),
    release_only_after_merge_to_main: normalizeBoolean(
      releaseRules.release_only_after_merge_to_main,
      true,
    ),

    tag_format: normalizeString(
      releaseRules.tag_format,
      "release_rules.tag_format",
      {
        fallback: "V{major}.{minor}.{patch}",
      },
    ),

    tag_pattern: tagPattern,

    valid_release_labels: normalizeStringList(
      releaseRules.valid_release_labels,
      "release_rules.valid_release_labels",
    ),

    require_exactly_one_release_label: normalizeBoolean(
      releaseRules.require_exactly_one_release_label,
      true,
    ),

    release_blocking_labels: normalizeStringList(
      releaseRules.release_blocking_labels,
      "release_rules.release_blocking_labels",
    ),

    release_blocking_authors: normalizeStringList(
      releaseRules.release_blocking_authors,
      "release_rules.release_blocking_authors",
    ),

    release_blocking_branch_patterns: releaseBlockingBranchPatterns,

    release_channel: {
      ...releaseChannel,
      default: normalizeString(
        releaseChannel.default,
        "release_rules.release_channel.default",
        {
          fallback: "release",
        },
      ),
      allowed: normalizeStringList(
        releaseChannel.allowed,
        "release_rules.release_channel.allowed",
      ),
    },
  };
}

function normalizeDependencyRules(dependencyRules) {
  if (dependencyRules === undefined || dependencyRules === null) {
    dependencyRules = {};
  }

  if (!isPlainObject(dependencyRules)) {
    throw new TypeError("dependency_rules must be an object.");
  }

  const autoMerge = isPlainObject(dependencyRules.auto_merge)
    ? dependencyRules.auto_merge
    : {};

  const allowedBranchPatterns = normalizeStringList(
    dependencyRules.allowed_branch_patterns,
    "dependency_rules.allowed_branch_patterns",
  );

  validateRegexList(
    allowedBranchPatterns,
    "dependency_rules.allowed_branch_patterns",
  );

  return {
    ...dependencyRules,

    labels: isPlainObject(dependencyRules.labels)
      ? {
          ...dependencyRules.labels,
          required: normalizeStringList(
            dependencyRules.labels.required,
            "dependency_rules.labels.required",
          ),
        }
      : {
          required: [],
        },

    allowed_authors: normalizeStringList(
      dependencyRules.allowed_authors,
      "dependency_rules.allowed_authors",
    ),

    allowed_branch_patterns: allowedBranchPatterns,

    auto_merge: {
      ...autoMerge,
      enabled: normalizeBoolean(autoMerge.enabled, false),
      allowed_labels: normalizeStringList(
        autoMerge.allowed_labels,
        "dependency_rules.auto_merge.allowed_labels",
      ),
      required_absent_labels: normalizeStringList(
        autoMerge.required_absent_labels,
        "dependency_rules.auto_merge.required_absent_labels",
      ),
      required_checks: normalizeStringList(
        autoMerge.required_checks,
        "dependency_rules.auto_merge.required_checks",
      ),
    },
  };
}

function normalizeSecurityRules(securityRules) {
  if (securityRules === undefined || securityRules === null) {
    securityRules = {};
  }

  if (!isPlainObject(securityRules)) {
    throw new TypeError("security_rules must be an object.");
  }

  const branchPatterns = normalizeStringList(
    securityRules.branch_patterns,
    "security_rules.branch_patterns",
  );

  validateRegexList(branchPatterns, "security_rules.branch_patterns");

  return {
    ...securityRules,

    branch_patterns: branchPatterns,

    required_labels: normalizeStringList(
      securityRules.required_labels,
      "security_rules.required_labels",
    ),

    allowed_release_labels: normalizeStringList(
      securityRules.allowed_release_labels,
      "security_rules.allowed_release_labels",
    ),

    require_security_review: normalizeBoolean(
      securityRules.require_security_review,
      true,
    ),

    block_if_labels_present: normalizeStringList(
      securityRules.block_if_labels_present,
      "security_rules.block_if_labels_present",
    ),
  };
}

function normalizePathHints(pathHints) {
  if (pathHints === undefined || pathHints === null) return {};

  if (!isPlainObject(pathHints)) {
    throw new TypeError("path_hints must be an object.");
  }

  return Object.fromEntries(
    Object.entries(pathHints).map(([pattern, hintConfig]) => {
      if (!isPlainObject(hintConfig)) {
        throw new TypeError(`path_hints.${pattern} must be an object.`);
      }

      return [
        pattern,
        {
          ...hintConfig,
          suggested_branch_types: normalizeStringList(
            hintConfig.suggested_branch_types,
            `path_hints.${pattern}.suggested_branch_types`,
          ),
          labels: normalizeStringList(
            hintConfig.labels,
            `path_hints.${pattern}.labels`,
          ),
        },
      ];
    }),
  );
}

function normalizeEnforcement(enforcement) {
  if (enforcement === undefined || enforcement === null) return {};

  if (!isPlainObject(enforcement)) {
    throw new TypeError("enforcement must be an object.");
  }

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

function normalizeReporting(reporting) {
  if (reporting === undefined || reporting === null) return {};

  if (!isPlainObject(reporting)) {
    throw new TypeError("reporting must be an object.");
  }

  const commentFooter = isPlainObject(reporting.comment_footer)
    ? reporting.comment_footer
    : {};

  const summary = isPlainObject(reporting.summary) ? reporting.summary : {};

  return {
    ...reporting,

    add_pr_comment_on_failure: normalizeBoolean(
      reporting.add_pr_comment_on_failure,
      true,
    ),
    add_workflow_summary: normalizeBoolean(
      reporting.add_workflow_summary,
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

    summary: {
      ...summary,
      include_branch_name: normalizeBoolean(summary.include_branch_name, true),
      include_base_branch: normalizeBoolean(summary.include_base_branch, true),
      include_detected_type: normalizeBoolean(
        summary.include_detected_type,
        true,
      ),
      include_issue_number: normalizeBoolean(
        summary.include_issue_number,
        true,
      ),
      include_release_allowed: normalizeBoolean(
        summary.include_release_allowed,
        true,
      ),
      include_matched_rule: normalizeBoolean(
        summary.include_matched_rule,
        true,
      ),
    },
  };
}

function normalizeBranchRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Branch rules config must be a YAML object.");
  }

  return {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: normalizeNumber(rawConfig.version, 1, "version"),
    repository: normalizeRepository(rawConfig.repository),
    policy: normalizePolicy(rawConfig.policy),

    protected_branches: normalizeProtectedBranches(
      rawConfig.protected_branches,
    ),
    base_branches: normalizeBaseBranches(rawConfig.base_branches),
    human_branch_rules: normalizeHumanBranchRules(rawConfig.human_branch_rules),
    branch_types: normalizeBranchTypes(rawConfig.branch_types),
    automation_branch_rules: normalizeAutomationBranchRules(
      rawConfig.automation_branch_rules,
    ),

    pull_request_rules: normalizePullRequestRules(rawConfig.pull_request_rules),
    release_rules: normalizeReleaseRules(rawConfig.release_rules),
    dependency_rules: normalizeDependencyRules(rawConfig.dependency_rules),
    security_rules: normalizeSecurityRules(rawConfig.security_rules),

    path_hints: normalizePathHints(rawConfig.path_hints),
    enforcement: normalizeEnforcement(rawConfig.enforcement),
    reporting: normalizeReporting(rawConfig.reporting),
  };
}

function validateBranchRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Branch rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  if (!config.human_branch_rules?.required_pattern) {
    throw new TypeError("human_branch_rules.required_pattern is required.");
  }

  compileRegex(
    config.human_branch_rules.required_pattern,
    "human_branch_rules.required_pattern",
  );

  compileRegex(
    config.human_branch_rules.release_branch_pattern,
    "human_branch_rules.release_branch_pattern",
  );

  if (!Array.isArray(config.release_rules.valid_release_labels)) {
    throw new TypeError("release_rules.valid_release_labels must be an array.");
  }

  if (!config.release_rules.valid_release_labels.length) {
    throw new TypeError("release_rules.valid_release_labels cannot be empty.");
  }

  if (!config.protected_branches[config.repository.default_branch]) {
    logger.warn(
      `Default branch "${config.repository.default_branch}" is not listed under protected_branches.`,
    );
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

function loadBranchRulesConfig(options = {}) {
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
        `Branch rules config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeBranchRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          policy: {},
          protected_branches: {},
          base_branches: {},
          human_branch_rules: {},
          branch_types: {},
          automation_branch_rules: {},
          pull_request_rules: {},
          release_rules: {
            valid_release_labels: [
              "release:major",
              "release:minor",
              "release:patch",
            ],
          },
          dependency_rules: {},
          security_rules: {},
          path_hints: {},
          enforcement: {},
          reporting: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Branch rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeBranchRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateBranchRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded branch rules config from ${displayPath}.`);
      logger.debug(
        `Branch rules config contains ${
          Object.keys(normalizedConfig.branch_types || {}).length
        } branch type rules.`,
      );
      logger.dump("branch rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load branch rules config from ${displayPath}: ${logger.formatError(err)}`,
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

function getDefaultBranch(config) {
  return config.repository?.default_branch || "main";
}

function isDefaultBranch(config, branchNameOrRef) {
  return normalizeBranchName(branchNameOrRef) === getDefaultBranch(config);
}

function isProtectedBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);
  return Boolean(config.protected_branches?.[branchName]);
}

function getProtectedBranchRule(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);
  return config.protected_branches?.[branchName] || null;
}

function getBaseBranchRule(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (config.base_branches?.[branchName]) {
    return config.base_branches[branchName];
  }

  for (const [name, rule] of Object.entries(config.base_branches || {})) {
    if (rule.pattern && matchesRegex(rule.pattern, branchName)) {
      return {
        ...rule,
        name,
      };
    }
  }

  return null;
}

function isAllowedBaseBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);
  const directRule = config.base_branches?.[branchName];

  if (directRule) {
    return normalizeBoolean(directRule.enabled, true);
  }

  return Boolean(getBaseBranchRule(config, branchName));
}

function isReleaseBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!config.policy?.allow_release_branches) return false;

  if (
    matchesRegex(config.human_branch_rules?.release_branch_pattern, branchName)
  ) {
    return true;
  }

  const releaseBaseRule = config.base_branches?.release;

  if (releaseBaseRule?.pattern) {
    return matchesRegex(releaseBaseRule.pattern, branchName);
  }

  return false;
}

function isReleaseTag(config, refOrTag) {
  const tagName = normalizeTagName(refOrTag);
  return matchesRegex(config.release_rules?.tag_pattern, tagName);
}

function parseHumanBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);
  const pattern = config.human_branch_rules?.required_pattern;

  if (!pattern) return null;

  const regex = compileRegex(pattern, "human_branch_rules.required_pattern");
  const match = regex.exec(branchName);

  if (!match) return null;

  const slashIndex = branchName.indexOf("/");
  const fallbackType = slashIndex > -1 ? branchName.slice(0, slashIndex) : null;
  const fallbackRest =
    slashIndex > -1 ? branchName.slice(slashIndex + 1) : null;
  const fallbackIssueMatch = fallbackRest
    ? /^([0-9]+)-(.+)$/.exec(fallbackRest)
    : null;

  return {
    branch: branchName,
    type: match.groups?.type || match[1] || fallbackType,
    issue: match.groups?.issue || fallbackIssueMatch?.[1] || null,
    slug: match.groups?.slug || fallbackIssueMatch?.[2] || null,
    raw_match: match,
  };
}

function getBranchTypeConfig(config, typeOrAlias) {
  if (!typeOrAlias || typeof typeOrAlias !== "string") return null;

  for (const [typeName, typeConfig] of Object.entries(
    config.branch_types || {},
  )) {
    if (typeName === typeOrAlias || typeConfig.aliases.includes(typeOrAlias)) {
      return {
        name: typeName,
        ...typeConfig,
      };
    }
  }

  return null;
}

function getAutomationBranchRule(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  for (const [ruleName, ruleConfig] of Object.entries(
    config.automation_branch_rules?.rules || {},
  )) {
    if (matchesAnyRegex(ruleConfig.patterns, branchName)) {
      return {
        name: ruleName,
        ...ruleConfig,
      };
    }
  }

  return null;
}

function isAutomationBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!config.automation_branch_rules?.enabled) return false;

  if (getAutomationBranchRule(config, branchName)) return true;

  return matchesAnyRegex(
    config.automation_branch_rules?.allowed_patterns || [],
    branchName,
  );
}

function isDependencyBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  return matchesAnyRegex(
    config.dependency_rules?.allowed_branch_patterns || [],
    branchName,
  );
}

function isSecurityBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  return matchesAnyRegex(
    config.security_rules?.branch_patterns || [],
    branchName,
  );
}

function detectBranchKind(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (isDefaultBranch(config, branchName)) {
    return {
      kind: "default",
      branch: branchName,
      type: "main",
      rule: getProtectedBranchRule(config, branchName),
    };
  }

  const automationRule = getAutomationBranchRule(config, branchName);

  if (automationRule) {
    return {
      kind: "automation",
      branch: branchName,
      type: automationRule.name,
      rule: automationRule,
    };
  }

  if (isReleaseBranch(config, branchName)) {
    return {
      kind: "release",
      branch: branchName,
      type: "release",
      rule: config.base_branches?.release || null,
    };
  }

  const parsedHumanBranch = parseHumanBranch(config, branchName);

  if (parsedHumanBranch) {
    const typeRule = getBranchTypeConfig(config, parsedHumanBranch.type);

    return {
      kind: "human",
      branch: branchName,
      type: typeRule?.name || parsedHumanBranch.type,
      issue: parsedHumanBranch.issue,
      slug: parsedHumanBranch.slug,
      rule: typeRule,
      parsed: parsedHumanBranch,
    };
  }

  return {
    kind: "unknown",
    branch: branchName,
    type: null,
    rule: null,
  };
}

function validateBranchName(config, branchNameOrRef, options = {}) {
  const {
    allowDefaultBranch = false,
    allowReleaseBranch = config.policy?.allow_release_branches,
  } = options;

  validateBranchRulesConfig(config);

  const branchName = normalizeBranchName(branchNameOrRef);
  const detected = detectBranchKind(config, branchName);

  const result = {
    valid: true,
    branch: branchName,
    kind: detected.kind,
    type: detected.type,
    issue: detected.issue || null,
    slug: detected.slug || null,
    matched_rule: detected.rule?.name || detected.type || null,
    release_allowed: false,
    labels: [],
    errors: [],
    warnings: [],
  };

  if (!branchName) {
    result.valid = false;
    result.errors.push("Branch name is required.");
    return result;
  }

  if (detected.kind === "default") {
    if (!allowDefaultBranch) {
      result.valid = false;
      result.errors.push(
        `Branch "${branchName}" is the default branch and should not be used as a PR head branch.`,
      );
    }

    return result;
  }

  if (detected.kind === "automation") {
    result.labels = detected.rule?.labels || [];
    result.release_allowed = normalizeBoolean(
      detected.rule?.release_allowed,
      false,
    );

    if (
      config.policy?.require_issue_number_for_automation_branches &&
      !parseHumanBranch(config, branchName)?.issue
    ) {
      result.valid = false;
      result.errors.push(
        "Automation branch is missing a required issue number.",
      );
    }

    return result;
  }

  if (detected.kind === "release") {
    result.release_allowed = true;
    result.labels = config.branch_types?.release?.labels || [];

    if (!allowReleaseBranch) {
      result.valid = false;
      result.errors.push("Release branches are not allowed by branch policy.");
    }

    return result;
  }

  if (detected.kind === "human") {
    result.labels = detected.rule?.labels || [];
    result.release_allowed = normalizeBoolean(
      detected.rule?.release_allowed,
      false,
    );

    if (
      config.policy?.require_issue_number_for_human_branches &&
      !detected.issue
    ) {
      result.valid = false;
      result.errors.push("Human branch is missing a required issue number.");
    }

    if (!detected.rule) {
      result.warnings.push(
        `No branch type rule matched type "${detected.type}".`,
      );
    }

    return result;
  }

  result.valid = false;
  result.errors.push(
    "Branch name does not match a human, automation, release, or protected branch rule.",
  );

  return result;
}

function validatePullRequestTarget(config, baseBranchOrRef, headBranchOrRef) {
  validateBranchRulesConfig(config);

  const baseBranch = normalizeBranchName(baseBranchOrRef);
  const headBranch = normalizeBranchName(headBranchOrRef);

  const result = {
    valid: true,
    base_branch: baseBranch,
    head_branch: headBranch,
    errors: [],
    warnings: [],
  };

  const requiredBaseBranch =
    config.pull_request_rules?.required_base_branch || getDefaultBranch(config);

  if (!baseBranch) {
    result.valid = false;
    result.errors.push("Pull request base branch is required.");
  }

  if (!headBranch) {
    result.valid = false;
    result.errors.push("Pull request head branch is required.");
  }

  if (
    baseBranch !== requiredBaseBranch &&
    !isAllowedBaseBranch(config, baseBranch)
  ) {
    result.valid = false;
    result.errors.push(
      `Pull requests must target "${requiredBaseBranch}" unless an allowed base branch rule matches.`,
    );
  }

  if (baseBranch === headBranch) {
    result.valid = false;
    result.errors.push(
      "Pull request base branch and head branch cannot be the same.",
    );
  }

  if (isDefaultBranch(config, headBranch)) {
    result.valid = false;
    result.errors.push(
      "Pull request head branch cannot be the default branch.",
    );
  }

  return result;
}

function getReleaseLabels(config, labels) {
  const normalizedLabels = normalizeStringList(labels, "labels");

  return normalizedLabels.filter((label) =>
    config.release_rules.valid_release_labels.includes(label),
  );
}

function getReleaseBlockers(config, input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  const author = normalizeNullableString(input.author, "input.author");
  const branch = normalizeBranchName(input.branch || input.head_branch || "");

  const blockers = [];

  for (const label of labels) {
    if (config.release_rules.release_blocking_labels.includes(label)) {
      blockers.push({
        type: "label",
        value: label,
        reason: `Release-blocking label is present: ${label}`,
      });
    }
  }

  if (
    author &&
    config.release_rules.release_blocking_authors.includes(author)
  ) {
    blockers.push({
      type: "author",
      value: author,
      reason: `Release-blocking author matched: ${author}`,
    });
  }

  if (
    branch &&
    matchesAnyRegex(
      config.release_rules.release_blocking_branch_patterns,
      branch,
    )
  ) {
    blockers.push({
      type: "branch",
      value: branch,
      reason: `Release-blocking branch pattern matched: ${branch}`,
    });
  }

  return blockers;
}

function evaluateReleaseEligibility(config, input = {}) {
  validateBranchRulesConfig(config);

  const labels = normalizeStringList(input.labels, "input.labels");
  const baseBranch = normalizeBranchName(
    input.base_branch || input.baseBranch || "",
  );
  const merged = normalizeBoolean(input.merged, false);
  const releaseLabels = getReleaseLabels(config, labels);
  const blockers = getReleaseBlockers(config, input);

  const result = {
    eligible: true,
    release_type: null,
    release_label: null,
    release_labels: releaseLabels,
    blockers,
    errors: [],
    warnings: [],
  };

  if (
    config.release_rules.release_only_from_main &&
    baseBranch &&
    baseBranch !== "main"
  ) {
    result.errors.push("Release source does not target main.");
  }

  if (config.release_rules.release_only_after_merge_to_main && !merged) {
    result.errors.push("Release source is not a merged pull request.");
  }

  if (
    config.release_rules.require_exactly_one_release_label &&
    releaseLabels.length !== 1
  ) {
    result.errors.push(
      `Expected exactly one release label, found ${releaseLabels.length}.`,
    );
  }

  if (blockers.length) {
    result.errors.push("Release blockers are present.");
  }

  if (releaseLabels.length === 1) {
    result.release_label = releaseLabels[0];
    result.release_type = releaseLabels[0].replace(/^release:/, "");
  }

  result.eligible = result.errors.length === 0;

  return result;
}

function getLabelsForBranch(config, branchNameOrRef) {
  const detected = detectBranchKind(config, branchNameOrRef);

  if (detected.kind === "automation") {
    return detected.rule?.labels || [];
  }

  if (detected.kind === "human") {
    return detected.rule?.labels || [];
  }

  if (detected.kind === "release") {
    return config.branch_types?.release?.labels || [];
  }

  return [];
}

function getMilestoneHintForBranch(config, branchNameOrRef) {
  const detected = detectBranchKind(config, branchNameOrRef);

  if (detected.kind === "human") {
    return detected.rule?.milestone_hint || null;
  }

  if (detected.kind === "release") {
    return config.branch_types?.release?.milestone_hint || null;
  }

  return null;
}

function matchPathHints(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const matches = [];

  for (const [pattern, hint] of Object.entries(config.path_hints || {})) {
    const matchedFiles = files.filter((file) =>
      minimatch(file, pattern, {
        dot: true,
        nocase: false,
        matchBase: false,
      }),
    );

    if (!matchedFiles.length) continue;

    matches.push({
      pattern,
      files: matchedFiles,
      labels: hint.labels || [],
      suggested_branch_types: hint.suggested_branch_types || [],
    });
  }

  return matches;
}

function collectLabelsFromPathHints(config, changedFiles = []) {
  return unique(
    matchPathHints(config, changedFiles).flatMap((match) => match.labels),
  );
}

function collectSuggestedBranchTypesFromPathHints(config, changedFiles = []) {
  return unique(
    matchPathHints(config, changedFiles).flatMap(
      (match) => match.suggested_branch_types,
    ),
  );
}

function hasAnyLabel(labels, candidates) {
  const labelSet = new Set(normalizeStringList(labels, "labels"));
  return normalizeStringList(candidates, "candidates").some((label) =>
    labelSet.has(label),
  );
}

function hasAllLabels(labels, candidates) {
  const labelSet = new Set(normalizeStringList(labels, "labels"));
  return normalizeStringList(candidates, "candidates").every((label) =>
    labelSet.has(label),
  );
}

function getMergeBlockers(config, labels) {
  const normalizedLabels = normalizeStringList(labels, "labels");
  const blockers = [];

  const blockingLabels =
    config.pull_request_rules?.blockers?.labels_that_block_merge || [];

  for (const label of normalizedLabels) {
    if (blockingLabels.includes(label)) {
      blockers.push({
        type: "label",
        value: label,
        reason: `Merge-blocking label is present: ${label}`,
      });
    }
  }

  return blockers;
}

function getReviewRequiredLabels(config, labels) {
  const normalizedLabels = normalizeStringList(labels, "labels");
  const reviewLabels =
    config.pull_request_rules?.blockers?.labels_that_require_review || [];

  return normalizedLabels.filter((label) => reviewLabels.includes(label));
}

if (require.main === module) {
  try {
    const config = loadBranchRulesConfig();
    logger.info(
      `Branch rules config validation passed for ${config.repository.owner}/${config.repository.name}.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadBranchRulesConfig,
  normalizeBranchRulesConfig,
  validateBranchRulesConfig,

  normalizeBranchName,
  normalizeTagName,

  getDefaultBranch,
  isDefaultBranch,
  isProtectedBranch,
  getProtectedBranchRule,
  getBaseBranchRule,
  isAllowedBaseBranch,

  isReleaseBranch,
  isReleaseTag,

  parseHumanBranch,
  getBranchTypeConfig,
  getAutomationBranchRule,
  isAutomationBranch,
  isDependencyBranch,
  isSecurityBranch,
  detectBranchKind,

  validateBranchName,
  validatePullRequestTarget,

  getReleaseLabels,
  getReleaseBlockers,
  evaluateReleaseEligibility,

  getLabelsForBranch,
  getMilestoneHintForBranch,

  matchPathHints,
  collectLabelsFromPathHints,
  collectSuggestedBranchTypesFromPathHints,

  hasAnyLabel,
  hasAllLabels,
  getMergeBlockers,
  getReviewRequiredLabels,
};
