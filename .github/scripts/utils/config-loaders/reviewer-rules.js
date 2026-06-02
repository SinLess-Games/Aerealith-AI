// .github/scripts/utils/config-loaders/reviewer-rules.js
// =============================================================================
// Aerealith AI Reviewer Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/reviewer-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/assign-reviewers.js
//   - .github/scripts/repo/assign-assignees.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - It supports multiple reviewers, team reviewers, assignees, labels,
//     milestones, path rules, branch rules, label rules, dependency PR rules,
//     security PR rules, OpenAI automation rules, and CODEOWNERS awareness.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/reviewer-rules.yaml";

const DEFAULT_BOT_ACCOUNTS = [
  "github-actions[bot]",
  "dependabot[bot]",
  "renovate[bot]",
  "mend[bot]",
];

const DEFAULT_DEPENDENCY_BRANCH_PATTERNS = [
  "^renovate/.+$",
  "^dependabot/.+$",
  "^mend/.+$",
];

const DEFAULT_OPENAI_BRANCH_PATTERNS = [
  "^openai/.+$",
  "^ai/.+$",
  "^automation/openai-.+$",
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

function matchesGlob(pattern, filePath) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!filePath || typeof filePath !== "string") return false;

  return minimatch(filePath, pattern, {
    dot: true,
    nocase: false,
    matchBase: false,
  });
}

function matchesAnyGlob(patterns, filePath) {
  const normalizedPatterns = normalizeStringList(patterns, "patterns");

  return normalizedPatterns.some((pattern) => matchesGlob(pattern, filePath));
}

function normalizeBranchName(branchNameOrRef) {
  if (!branchNameOrRef || typeof branchNameOrRef !== "string") return "";

  return branchNameOrRef
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeLogin(login) {
  if (!login || typeof login !== "string") return "";

  return login.trim().replace(/^@/, "");
}

function normalizeLoginList(value, fieldPath) {
  return normalizeStringList(value, fieldPath)
    .map((login) => normalizeLogin(login))
    .filter(Boolean);
}

function normalizeTeamSlug(team) {
  if (!team || typeof team !== "string") return "";

  const normalized = team.trim().replace(/^@/, "");

  if (normalized.includes("/")) {
    return normalized.split("/").pop();
  }

  return normalized;
}

function normalizeTeamSlugList(value, fieldPath) {
  return normalizeStringList(value, fieldPath)
    .map((team) => normalizeTeamSlug(team))
    .filter(Boolean);
}

function normalizeRepository(repository) {
  repository = normalizeObject(repository, "repository");

  const owner = normalizeString(repository.owner, "repository.owner", {
    fallback: "SinLess-Games",
  });

  const name = normalizeString(repository.name, "repository.name", {
    fallback: "Aerealith-AI",
  });

  return {
    ...repository,
    owner,
    name,
    full_name: normalizeString(repository.full_name, "repository.full_name", {
      fallback: `${owner}/${name}`,
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
  policy = normalizeObject(policy, "policy");

  return {
    ...policy,

    enabled: normalizeBoolean(policy.enabled, true),
    dry_run_supported: normalizeBoolean(policy.dry_run_supported, true),
    debug_supported: normalizeBoolean(policy.debug_supported, true),

    request_reviewers: normalizeBoolean(policy.request_reviewers, true),
    request_team_reviewers: normalizeBoolean(
      policy.request_team_reviewers,
      true,
    ),
    assign_assignees: normalizeBoolean(policy.assign_assignees, true),

    allow_multiple_reviewers: normalizeBoolean(
      policy.allow_multiple_reviewers,
      true,
    ),
    allow_multiple_team_reviewers: normalizeBoolean(
      policy.allow_multiple_team_reviewers,
      true,
    ),
    allow_multiple_assignees: normalizeBoolean(
      policy.allow_multiple_assignees,
      true,
    ),

    do_not_request_review_from_author: normalizeBoolean(
      policy.do_not_request_review_from_author,
      true,
    ),
    do_not_request_review_from_bots: normalizeBoolean(
      policy.do_not_request_review_from_bots,
      true,
    ),
    do_not_assign_bots: normalizeBoolean(policy.do_not_assign_bots, true),

    require_review_for_security: normalizeBoolean(
      policy.require_review_for_security,
      true,
    ),
    require_review_for_release: normalizeBoolean(
      policy.require_review_for_release,
      true,
    ),
    require_review_for_production_deploy: normalizeBoolean(
      policy.require_review_for_production_deploy,
      true,
    ),
    require_review_for_openai_prs: normalizeBoolean(
      policy.require_review_for_openai_prs,
      true,
    ),

    dependency_prs_can_skip_human_review: normalizeBoolean(
      policy.dependency_prs_can_skip_human_review,
      true,
    ),
    security_dependency_prs_require_review: normalizeBoolean(
      policy.security_dependency_prs_require_review,
      false,
    ),

    fallback_to_default_reviewers: normalizeBoolean(
      policy.fallback_to_default_reviewers,
      true,
    ),
  };
}

function normalizeAssignmentBlock(block, fieldPath, fallback = {}) {
  block = normalizeObject(block, fieldPath);
  fallback = isPlainObject(fallback) ? fallback : {};

  return {
    ...block,

    reviewers: normalizeLoginList(
      block.reviewers !== undefined ? block.reviewers : fallback.reviewers,
      `${fieldPath}.reviewers`,
    ),

    team_reviewers: normalizeTeamSlugList(
      block.team_reviewers !== undefined
        ? block.team_reviewers
        : fallback.team_reviewers,
      `${fieldPath}.team_reviewers`,
    ),

    assignees: normalizeLoginList(
      block.assignees !== undefined ? block.assignees : fallback.assignees,
      `${fieldPath}.assignees`,
    ),

    labels: normalizeStringList(
      block.labels !== undefined ? block.labels : fallback.labels,
      `${fieldPath}.labels`,
    ),

    milestone: normalizeNullableString(
      block.milestone !== undefined ? block.milestone : fallback.milestone,
      `${fieldPath}.milestone`,
    ),

    required: normalizeBoolean(
      block.required !== undefined ? block.required : fallback.required,
      false,
    ),

    request_reviewers: normalizeBoolean(
      block.request_reviewers !== undefined
        ? block.request_reviewers
        : fallback.request_reviewers,
      true,
    ),

    request_team_reviewers: normalizeBoolean(
      block.request_team_reviewers !== undefined
        ? block.request_team_reviewers
        : fallback.request_team_reviewers,
      true,
    ),

    assign_assignees: normalizeBoolean(
      block.assign_assignees !== undefined
        ? block.assign_assignees
        : fallback.assign_assignees,
      true,
    ),
  };
}

function normalizeDefault(defaultConfig) {
  return normalizeAssignmentBlock(defaultConfig, "default", {
    reviewers: ["Sinless777"],
    team_reviewers: [],
    assignees: ["Sinless777"],
    labels: [],
    milestone: null,
    required: false,
  });
}

function normalizeOwnerGroups(ownerGroups, defaultAssignment) {
  ownerGroups = normalizeObject(ownerGroups, "owner_groups");

  return Object.fromEntries(
    Object.entries(ownerGroups).map(([groupName, groupConfig]) => [
      groupName,
      normalizeAssignmentBlock(
        groupConfig,
        `owner_groups.${groupName}`,
        defaultAssignment,
      ),
    ]),
  );
}

function normalizePatternRule(ruleConfig, fieldPath, defaultAssignment) {
  ruleConfig = normalizeObject(ruleConfig, fieldPath);

  return {
    ...normalizeAssignmentBlock(ruleConfig, fieldPath, defaultAssignment),

    description: normalizeNullableString(
      ruleConfig.description,
      `${fieldPath}.description`,
    ),

    patterns: normalizeStringList(ruleConfig.patterns, `${fieldPath}.patterns`),

    exclude_patterns: normalizeStringList(
      ruleConfig.exclude_patterns,
      `${fieldPath}.exclude_patterns`,
    ),

    require_all_patterns: normalizeBoolean(
      ruleConfig.require_all_patterns,
      false,
    ),
  };
}

function normalizePathRules(pathRules, defaultAssignment) {
  pathRules = normalizeObject(pathRules, "path_rules");

  return Object.fromEntries(
    Object.entries(pathRules).map(([ruleName, ruleConfig]) => [
      ruleName,
      normalizePatternRule(
        ruleConfig,
        `path_rules.${ruleName}`,
        defaultAssignment,
      ),
    ]),
  );
}

function normalizeLabelRules(labelRules, defaultAssignment) {
  labelRules = normalizeObject(labelRules, "label_rules");

  return Object.fromEntries(
    Object.entries(labelRules).map(([ruleName, ruleConfig]) => {
      ruleConfig = normalizeObject(ruleConfig, `label_rules.${ruleName}`);

      return [
        ruleName,
        {
          ...normalizeAssignmentBlock(
            ruleConfig,
            `label_rules.${ruleName}`,
            defaultAssignment,
          ),

          description: normalizeNullableString(
            ruleConfig.description,
            `label_rules.${ruleName}.description`,
          ),

          match_any: normalizeStringList(
            ruleConfig.match_any,
            `label_rules.${ruleName}.match_any`,
          ),

          match_all: normalizeStringList(
            ruleConfig.match_all,
            `label_rules.${ruleName}.match_all`,
          ),

          exclude: normalizeStringList(
            ruleConfig.exclude,
            `label_rules.${ruleName}.exclude`,
          ),
        },
      ];
    }),
  );
}

function normalizeBranchRules(branchRules, defaultAssignment) {
  branchRules = normalizeObject(branchRules, "branch_rules");

  return Object.fromEntries(
    Object.entries(branchRules).map(([ruleName, ruleConfig]) => {
      ruleConfig = normalizeObject(ruleConfig, `branch_rules.${ruleName}`);

      const patterns = normalizeStringList(
        ruleConfig.patterns,
        `branch_rules.${ruleName}.patterns`,
      );

      const excludePatterns = normalizeStringList(
        ruleConfig.exclude_patterns,
        `branch_rules.${ruleName}.exclude_patterns`,
      );

      validateRegexList(patterns, `branch_rules.${ruleName}.patterns`);
      validateRegexList(
        excludePatterns,
        `branch_rules.${ruleName}.exclude_patterns`,
      );

      return [
        ruleName,
        {
          ...normalizeAssignmentBlock(
            ruleConfig,
            `branch_rules.${ruleName}`,
            defaultAssignment,
          ),

          description: normalizeNullableString(
            ruleConfig.description,
            `branch_rules.${ruleName}.description`,
          ),

          patterns,
          exclude_patterns: excludePatterns,
        },
      ];
    }),
  );
}

function normalizePullRequestTypeRules(
  pullRequestTypeRules,
  defaultAssignment,
) {
  pullRequestTypeRules = normalizeObject(
    pullRequestTypeRules,
    "pull_request_type_rules",
  );

  return Object.fromEntries(
    Object.entries(pullRequestTypeRules).map(([typeName, typeConfig]) => [
      typeName,
      normalizeAssignmentBlock(
        typeConfig,
        `pull_request_type_rules.${typeName}`,
        defaultAssignment,
      ),
    ]),
  );
}

function normalizeSpecialRules(specialRules, defaultAssignment) {
  specialRules = normalizeObject(specialRules, "special_rules");

  const dependency = normalizeObject(
    specialRules.dependency,
    "special_rules.dependency",
  );
  const securityDependency = normalizeObject(
    specialRules.security_dependency,
    "special_rules.security_dependency",
  );
  const security = normalizeObject(
    specialRules.security,
    "special_rules.security",
  );
  const release = normalizeObject(
    specialRules.release,
    "special_rules.release",
  );
  const productionDeploy = normalizeObject(
    specialRules.production_deploy,
    "special_rules.production_deploy",
  );
  const openai = normalizeObject(specialRules.openai, "special_rules.openai");
  const docsOnly = normalizeObject(
    specialRules.docs_only,
    "special_rules.docs_only",
  );

  const dependencyBranchPatterns = normalizeStringList(
    dependency.branch_patterns,
    "special_rules.dependency.branch_patterns",
  );

  const openaiBranchPatterns = normalizeStringList(
    openai.branch_patterns,
    "special_rules.openai.branch_patterns",
  );

  validateRegexList(
    dependencyBranchPatterns,
    "special_rules.dependency.branch_patterns",
  );
  validateRegexList(
    openaiBranchPatterns,
    "special_rules.openai.branch_patterns",
  );

  return {
    ...specialRules,

    dependency: {
      ...normalizeAssignmentBlock(
        dependency,
        "special_rules.dependency",
        defaultAssignment,
      ),
      branch_patterns: dependencyBranchPatterns.length
        ? dependencyBranchPatterns
        : DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
      authors: normalizeLoginList(
        dependency.authors,
        "special_rules.dependency.authors",
      ),
      can_skip_human_review: normalizeBoolean(
        dependency.can_skip_human_review,
        true,
      ),
    },

    security_dependency: {
      ...normalizeAssignmentBlock(
        securityDependency,
        "special_rules.security_dependency",
        defaultAssignment,
      ),
      required: normalizeBoolean(securityDependency.required, false),
    },

    security: {
      ...normalizeAssignmentBlock(
        security,
        "special_rules.security",
        defaultAssignment,
      ),
      required: normalizeBoolean(security.required, true),
      labels: normalizeStringList(
        security.labels,
        "special_rules.security.labels",
      ),
    },

    release: {
      ...normalizeAssignmentBlock(
        release,
        "special_rules.release",
        defaultAssignment,
      ),
      required: normalizeBoolean(release.required, true),
      labels: normalizeStringList(
        release.labels,
        "special_rules.release.labels",
      ),
    },

    production_deploy: {
      ...normalizeAssignmentBlock(
        productionDeploy,
        "special_rules.production_deploy",
        defaultAssignment,
      ),
      required: normalizeBoolean(productionDeploy.required, true),
      labels: normalizeStringList(
        productionDeploy.labels,
        "special_rules.production_deploy.labels",
      ),
    },

    openai: {
      ...normalizeAssignmentBlock(
        openai,
        "special_rules.openai",
        defaultAssignment,
      ),
      branch_patterns: openaiBranchPatterns.length
        ? openaiBranchPatterns
        : DEFAULT_OPENAI_BRANCH_PATTERNS,
      authors: normalizeLoginList(
        openai.authors,
        "special_rules.openai.authors",
      ),
      required: normalizeBoolean(openai.required, true),
    },

    docs_only: {
      ...normalizeAssignmentBlock(
        docsOnly,
        "special_rules.docs_only",
        defaultAssignment,
      ),
      can_skip_review: normalizeBoolean(docsOnly.can_skip_review, false),
      path_patterns: normalizeStringList(
        docsOnly.path_patterns,
        "special_rules.docs_only.path_patterns",
      ),
    },
  };
}

function normalizeCodeowners(codeowners) {
  codeowners = normalizeObject(codeowners, "codeowners");

  return {
    ...codeowners,
    enabled: normalizeBoolean(codeowners.enabled, true),
    file: normalizeString(codeowners.file, "codeowners.file", {
      fallback: ".github/CODEOWNERS",
    }),
    use_as_fallback: normalizeBoolean(codeowners.use_as_fallback, true),
    require_codeowners_review_for_owned_paths: normalizeBoolean(
      codeowners.require_codeowners_review_for_owned_paths,
      false,
    ),
    allow_multiple_owners: normalizeBoolean(
      codeowners.allow_multiple_owners,
      true,
    ),
  };
}

function normalizeReviewRequirements(reviewRequirements) {
  reviewRequirements = normalizeObject(
    reviewRequirements,
    "review_requirements",
  );

  const labels = normalizeObject(
    reviewRequirements.labels,
    "review_requirements.labels",
  );
  const paths = normalizeObject(
    reviewRequirements.paths,
    "review_requirements.paths",
  );
  const branches = normalizeObject(
    reviewRequirements.branches,
    "review_requirements.branches",
  );

  return {
    ...reviewRequirements,

    minimum_reviewers: normalizeNumber(
      reviewRequirements.minimum_reviewers,
      1,
      "review_requirements.minimum_reviewers",
    ),

    minimum_team_reviewers: normalizeNumber(
      reviewRequirements.minimum_team_reviewers,
      0,
      "review_requirements.minimum_team_reviewers",
    ),

    require_review_for_drafts: normalizeBoolean(
      reviewRequirements.require_review_for_drafts,
      false,
    ),

    require_review_when_ready_for_review: normalizeBoolean(
      reviewRequirements.require_review_when_ready_for_review,
      true,
    ),

    labels: {
      ...labels,
      require_review_if_present: normalizeStringList(
        labels.require_review_if_present,
        "review_requirements.labels.require_review_if_present",
      ),
      allow_skip_if_present: normalizeStringList(
        labels.allow_skip_if_present,
        "review_requirements.labels.allow_skip_if_present",
      ),
    },

    paths: {
      ...paths,
      require_review_if_changed: normalizeStringList(
        paths.require_review_if_changed,
        "review_requirements.paths.require_review_if_changed",
      ),
      allow_skip_if_only_changed: normalizeStringList(
        paths.allow_skip_if_only_changed,
        "review_requirements.paths.allow_skip_if_only_changed",
      ),
    },

    branches: {
      ...branches,
      require_review_if_matches: normalizeStringList(
        branches.require_review_if_matches,
        "review_requirements.branches.require_review_if_matches",
      ),
    },
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
    add_pr_comment_on_failure: normalizeBoolean(
      reporting.add_pr_comment_on_failure,
      true,
    ),
    add_pr_comment_on_assignment: normalizeBoolean(
      reporting.add_pr_comment_on_assignment,
      false,
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

function normalizeSafety(safety) {
  safety = normalizeObject(safety, "safety");

  return {
    ...safety,

    dry_run_supported: normalizeBoolean(safety.dry_run_supported, true),
    debug_supported: normalizeBoolean(safety.debug_supported, true),

    do_not_request_review_from_author: normalizeBoolean(
      safety.do_not_request_review_from_author,
      true,
    ),
    do_not_request_review_from_bots: normalizeBoolean(
      safety.do_not_request_review_from_bots,
      true,
    ),
    do_not_assign_bots: normalizeBoolean(safety.do_not_assign_bots, true),

    do_not_remove_reviewers: normalizeBoolean(
      safety.do_not_remove_reviewers,
      true,
    ),
    do_not_remove_assignees: normalizeBoolean(
      safety.do_not_remove_assignees,
      true,
    ),
    do_not_dismiss_reviews: normalizeBoolean(
      safety.do_not_dismiss_reviews,
      true,
    ),
    do_not_approve_pull_requests: normalizeBoolean(
      safety.do_not_approve_pull_requests,
      true,
    ),
    do_not_merge_pull_requests: normalizeBoolean(
      safety.do_not_merge_pull_requests,
      true,
    ),

    bot_accounts: normalizeLoginList(
      safety.bot_accounts,
      "safety.bot_accounts",
    ),

    protected_reviewers: normalizeLoginList(
      safety.protected_reviewers,
      "safety.protected_reviewers",
    ),

    protected_team_reviewers: normalizeTeamSlugList(
      safety.protected_team_reviewers,
      "safety.protected_team_reviewers",
    ),
  };
}

function normalizeReviewerRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Reviewer rules config must be a YAML object.");
  }

  const defaultAssignment = normalizeDefault(rawConfig.default);

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

    default: defaultAssignment,
    owner_groups: normalizeOwnerGroups(
      rawConfig.owner_groups,
      defaultAssignment,
    ),

    path_rules: normalizePathRules(rawConfig.path_rules, defaultAssignment),
    label_rules: normalizeLabelRules(rawConfig.label_rules, defaultAssignment),
    branch_rules: normalizeBranchRules(
      rawConfig.branch_rules,
      defaultAssignment,
    ),
    pull_request_type_rules: normalizePullRequestTypeRules(
      rawConfig.pull_request_type_rules,
      defaultAssignment,
    ),

    special_rules: normalizeSpecialRules(
      rawConfig.special_rules,
      defaultAssignment,
    ),
    codeowners: normalizeCodeowners(rawConfig.codeowners),
    review_requirements: normalizeReviewRequirements(
      rawConfig.review_requirements,
    ),
    reporting: normalizeReporting(rawConfig.reporting),
    safety: normalizeSafety(rawConfig.safety),
  };
}

function validateAssignmentBlock(block, fieldPath) {
  if (!isPlainObject(block)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  for (const key of ["reviewers", "team_reviewers", "assignees", "labels"]) {
    if (!Array.isArray(block[key])) {
      throw new TypeError(`${fieldPath}.${key} must be an array.`);
    }

    for (const [index, value] of block[key].entries()) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
          `${fieldPath}.${key}[${index}] must be a non-empty string.`,
        );
      }
    }
  }

  if (block.milestone !== null && typeof block.milestone !== "string") {
    throw new TypeError(`${fieldPath}.milestone must be a string or null.`);
  }
}

function validateReviewerRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Reviewer rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  validateAssignmentBlock(config.default, "default");

  for (const [groupName, groupConfig] of Object.entries(
    config.owner_groups || {},
  )) {
    validateAssignmentBlock(groupConfig, `owner_groups.${groupName}`);
  }

  for (const [ruleName, ruleConfig] of Object.entries(
    config.path_rules || {},
  )) {
    validateAssignmentBlock(ruleConfig, `path_rules.${ruleName}`);

    if (!ruleConfig.patterns.length) {
      logger.warn(`path_rules.${ruleName} has no path patterns.`);
    }
  }

  for (const [ruleName, ruleConfig] of Object.entries(
    config.label_rules || {},
  )) {
    validateAssignmentBlock(ruleConfig, `label_rules.${ruleName}`);

    if (!ruleConfig.match_any.length && !ruleConfig.match_all.length) {
      logger.warn(`label_rules.${ruleName} has no label matchers.`);
    }
  }

  for (const [ruleName, ruleConfig] of Object.entries(
    config.branch_rules || {},
  )) {
    validateAssignmentBlock(ruleConfig, `branch_rules.${ruleName}`);

    if (!ruleConfig.patterns.length) {
      logger.warn(`branch_rules.${ruleName} has no branch patterns.`);
    }
  }

  if (
    !config.default.reviewers.length &&
    !config.default.team_reviewers.length &&
    config.policy.fallback_to_default_reviewers
  ) {
    logger.warn(
      "Default reviewer fallback is enabled, but no default reviewers are configured.",
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

function loadReviewerRulesConfig(options = {}) {
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
        `Reviewer rules config not found at ${displayPath}. Returning default config.`,
      );

      return normalizeReviewerRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          policy: {},
          default: {
            reviewers: ["Sinless777"],
            assignees: ["Sinless777"],
            team_reviewers: [],
          },
          owner_groups: {},
          path_rules: {},
          label_rules: {},
          branch_rules: {},
          pull_request_type_rules: {},
          special_rules: {},
          codeowners: {},
          review_requirements: {},
          reporting: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Reviewer rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeReviewerRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateReviewerRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded reviewer rules config from ${displayPath}.`);
      logger.debug(
        `Reviewer rules config contains ${
          Object.keys(normalizedConfig.path_rules || {}).length
        } path rules, ${Object.keys(normalizedConfig.label_rules || {}).length} label rules, and ${
          Object.keys(normalizedConfig.branch_rules || {}).length
        } branch rules.`,
      );
      logger.dump("reviewer rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load reviewer rules config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function mergeAssignments(...assignments) {
  const merged = {
    reviewers: [],
    team_reviewers: [],
    assignees: [],
    labels: [],
    milestone: null,
    required: false,
    request_reviewers: false,
    request_team_reviewers: false,
    assign_assignees: false,
    matched_rules: [],
  };

  for (const assignment of assignments) {
    if (!assignment) continue;

    merged.reviewers.push(...(assignment.reviewers || []));
    merged.team_reviewers.push(...(assignment.team_reviewers || []));
    merged.assignees.push(...(assignment.assignees || []));
    merged.labels.push(...(assignment.labels || []));

    if (assignment.milestone) {
      merged.milestone = assignment.milestone;
    }

    merged.required = merged.required || Boolean(assignment.required);
    merged.request_reviewers =
      merged.request_reviewers || Boolean(assignment.request_reviewers);
    merged.request_team_reviewers =
      merged.request_team_reviewers ||
      Boolean(assignment.request_team_reviewers);
    merged.assign_assignees =
      merged.assign_assignees || Boolean(assignment.assign_assignees);

    if (assignment.matched_rule) {
      merged.matched_rules.push(assignment.matched_rule);
    }

    if (Array.isArray(assignment.matched_rules)) {
      merged.matched_rules.push(...assignment.matched_rules);
    }
  }

  return {
    reviewers: unique(merged.reviewers),
    team_reviewers: unique(merged.team_reviewers),
    assignees: unique(merged.assignees),
    labels: unique(merged.labels),
    milestone: merged.milestone,
    required: merged.required,
    request_reviewers: merged.request_reviewers,
    request_team_reviewers: merged.request_team_reviewers,
    assign_assignees: merged.assign_assignees,
    matched_rules: unique(merged.matched_rules),
  };
}

function getBotAccounts(config) {
  return unique([
    ...DEFAULT_BOT_ACCOUNTS,
    ...(config.safety?.bot_accounts || []),
  ]);
}

function isBotAccount(config, login) {
  const normalized = normalizeLogin(login);
  return getBotAccounts(config).includes(normalized);
}

function filterReviewers(config, reviewers, options = {}) {
  const {
    author = null,
    excludeBots = config.policy.do_not_request_review_from_bots,
    excludeAuthor = config.policy.do_not_request_review_from_author,
  } = options;

  const normalizedAuthor = normalizeLogin(author);

  return unique(normalizeLoginList(reviewers, "reviewers")).filter(
    (reviewer) => {
      if (excludeAuthor && normalizedAuthor && reviewer === normalizedAuthor) {
        return false;
      }

      if (excludeBots && isBotAccount(config, reviewer)) {
        return false;
      }

      return true;
    },
  );
}

function filterAssignees(config, assignees, options = {}) {
  const { excludeBots = config.policy.do_not_assign_bots } = options;

  return unique(normalizeLoginList(assignees, "assignees")).filter(
    (assignee) => {
      if (excludeBots && isBotAccount(config, assignee)) {
        return false;
      }

      return true;
    },
  );
}

function getDefaultAssignment(config) {
  validateReviewerRulesConfig(config);
  return config.default;
}

function getOwnerGroup(config, groupName) {
  validateReviewerRulesConfig(config);

  if (!groupName || typeof groupName !== "string") return null;

  return config.owner_groups?.[groupName] || null;
}

function pathRuleMatches(rule, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");

  if (!rule.patterns.length) return false;

  const includedFiles = files.filter((file) =>
    matchesAnyGlob(rule.patterns, file),
  );

  if (!includedFiles.length) return false;

  const excludedFiles = includedFiles.filter((file) =>
    matchesAnyGlob(rule.exclude_patterns, file),
  );

  const effectiveMatches = includedFiles.filter(
    (file) => !excludedFiles.includes(file),
  );

  if (!effectiveMatches.length) return false;

  if (rule.require_all_patterns) {
    return rule.patterns.every((pattern) =>
      effectiveMatches.some((file) => matchesGlob(pattern, file)),
    );
  }

  return true;
}

function matchPathRules(config, changedFiles = []) {
  validateReviewerRulesConfig(config);

  const matches = [];

  for (const [ruleName, ruleConfig] of Object.entries(
    config.path_rules || {},
  )) {
    if (!pathRuleMatches(ruleConfig, changedFiles)) continue;

    matches.push({
      name: ruleName,
      rule: {
        ...ruleConfig,
        matched_rule: `path_rules.${ruleName}`,
      },
    });
  }

  return matches;
}

function labelRuleMatches(rule, labels = []) {
  const labelSet = new Set(normalizeStringList(labels, "labels"));

  if (rule.exclude.some((label) => labelSet.has(label))) {
    return false;
  }

  if (
    rule.match_all.length &&
    !rule.match_all.every((label) => labelSet.has(label))
  ) {
    return false;
  }

  if (
    rule.match_any.length &&
    !rule.match_any.some((label) => labelSet.has(label))
  ) {
    return false;
  }

  return Boolean(rule.match_any.length || rule.match_all.length);
}

function matchLabelRules(config, labels = []) {
  validateReviewerRulesConfig(config);

  const matches = [];

  for (const [ruleName, ruleConfig] of Object.entries(
    config.label_rules || {},
  )) {
    if (!labelRuleMatches(ruleConfig, labels)) continue;

    matches.push({
      name: ruleName,
      rule: {
        ...ruleConfig,
        matched_rule: `label_rules.${ruleName}`,
      },
    });
  }

  return matches;
}

function branchRuleMatches(rule, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!branchName || !rule.patterns.length) return false;

  if (matchesAnyRegex(rule.exclude_patterns, branchName)) return false;

  return matchesAnyRegex(rule.patterns, branchName);
}

function matchBranchRules(config, branchNameOrRef) {
  validateReviewerRulesConfig(config);

  const matches = [];

  for (const [ruleName, ruleConfig] of Object.entries(
    config.branch_rules || {},
  )) {
    if (!branchRuleMatches(ruleConfig, branchNameOrRef)) continue;

    matches.push({
      name: ruleName,
      rule: {
        ...ruleConfig,
        matched_rule: `branch_rules.${ruleName}`,
      },
    });
  }

  return matches;
}

function getPullRequestTypeRule(config, typeName) {
  validateReviewerRulesConfig(config);

  if (!typeName || typeof typeName !== "string") return null;

  return config.pull_request_type_rules?.[typeName] || null;
}

function isDependencyPullRequest(config, input = {}) {
  const author = normalizeLogin(input.author || input.actor || "");
  const branch = normalizeBranchName(input.branch || input.head_branch || "");

  const dependencyRule = config.special_rules?.dependency || {};

  if (dependencyRule.authors?.includes(author)) return true;

  return matchesAnyRegex(
    dependencyRule.branch_patterns || DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
    branch,
  );
}

function isOpenAiPullRequest(config, input = {}) {
  const author = normalizeLogin(input.author || input.actor || "");
  const branch = normalizeBranchName(input.branch || input.head_branch || "");

  const openaiRule = config.special_rules?.openai || {};

  if (openaiRule.authors?.includes(author)) return true;

  return matchesAnyRegex(
    openaiRule.branch_patterns || DEFAULT_OPENAI_BRANCH_PATTERNS,
    branch,
  );
}

function isSecurityPullRequest(config, input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  const securityRule = config.special_rules?.security || {};

  return labels.some((label) => (securityRule.labels || []).includes(label));
}

function isSecurityDependencyPullRequest(input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  return labels.includes("security:dependency");
}

function isReleasePullRequest(config, input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  const releaseRule = config.special_rules?.release || {};

  return labels.some((label) => (releaseRule.labels || []).includes(label));
}

function isProductionDeployPullRequest(config, input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  const productionRule = config.special_rules?.production_deploy || {};

  return labels.some((label) => (productionRule.labels || []).includes(label));
}

function isDocsOnlyPullRequest(config, changedFiles = []) {
  const docsRule = config.special_rules?.docs_only || {};
  const files = normalizeStringList(changedFiles, "changedFiles");

  if (!files.length || !docsRule.path_patterns?.length) return false;

  return files.every((file) => matchesAnyGlob(docsRule.path_patterns, file));
}

function getSpecialRuleAssignments(config, input = {}) {
  const assignments = [];

  if (isDependencyPullRequest(config, input)) {
    assignments.push({
      ...config.special_rules.dependency,
      matched_rule: "special_rules.dependency",
    });
  }

  if (isSecurityDependencyPullRequest(input)) {
    assignments.push({
      ...config.special_rules.security_dependency,
      matched_rule: "special_rules.security_dependency",
    });
  }

  if (isSecurityPullRequest(config, input)) {
    assignments.push({
      ...config.special_rules.security,
      matched_rule: "special_rules.security",
    });
  }

  if (isReleasePullRequest(config, input)) {
    assignments.push({
      ...config.special_rules.release,
      matched_rule: "special_rules.release",
    });
  }

  if (isProductionDeployPullRequest(config, input)) {
    assignments.push({
      ...config.special_rules.production_deploy,
      matched_rule: "special_rules.production_deploy",
    });
  }

  if (isOpenAiPullRequest(config, input)) {
    assignments.push({
      ...config.special_rules.openai,
      matched_rule: "special_rules.openai",
    });
  }

  if (isDocsOnlyPullRequest(config, input.changed_files || input.files || [])) {
    assignments.push({
      ...config.special_rules.docs_only,
      matched_rule: "special_rules.docs_only",
    });
  }

  return assignments;
}

function shouldSkipHumanReview(config, input = {}) {
  if (
    isDependencyPullRequest(config, input) &&
    !isSecurityDependencyPullRequest(input) &&
    config.policy.dependency_prs_can_skip_human_review
  ) {
    return {
      skip: true,
      reason: "Dependency PR may skip human review by policy.",
    };
  }

  if (
    isDocsOnlyPullRequest(config, input.changed_files || input.files || []) &&
    config.special_rules.docs_only.can_skip_review
  ) {
    return {
      skip: true,
      reason: "Docs-only PR may skip review by policy.",
    };
  }

  return {
    skip: false,
    reason: null,
  };
}

function getReviewerAssignment(config, input = {}) {
  validateReviewerRulesConfig(config);

  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
    "input.changed_files",
  );

  const labels = normalizeStringList(input.labels, "input.labels");
  const branch = normalizeBranchName(input.branch || input.head_branch || "");
  const author = normalizeLogin(input.author || input.actor || "");
  const prType = normalizeNullableString(
    input.type || input.pull_request_type,
    "input.type",
  );

  const pathMatches = matchPathRules(config, changedFiles);
  const labelMatches = matchLabelRules(config, labels);
  const branchMatches = matchBranchRules(config, branch);
  const specialAssignments = getSpecialRuleAssignments(config, {
    ...input,
    labels,
    branch,
    head_branch: branch,
    changed_files: changedFiles,
    author,
  });

  const typeAssignment = prType ? getPullRequestTypeRule(config, prType) : null;

  const assignments = [
    ...pathMatches.map((match) => match.rule),
    ...labelMatches.map((match) => match.rule),
    ...branchMatches.map((match) => match.rule),
    ...(typeAssignment
      ? [
          {
            ...typeAssignment,
            matched_rule: `pull_request_type_rules.${prType}`,
          },
        ]
      : []),
    ...specialAssignments,
  ];

  const shouldUseDefault =
    config.policy.fallback_to_default_reviewers && assignments.length === 0;

  if (shouldUseDefault) {
    assignments.push({
      ...config.default,
      matched_rule: "default",
    });
  }

  const merged = mergeAssignments(...assignments);

  const filteredReviewers = filterReviewers(config, merged.reviewers, {
    author,
  });

  const filteredAssignees = filterAssignees(config, merged.assignees);

  return {
    ...merged,

    reviewers: config.policy.allow_multiple_reviewers
      ? filteredReviewers
      : filteredReviewers.slice(0, 1),

    team_reviewers: config.policy.allow_multiple_team_reviewers
      ? merged.team_reviewers
      : merged.team_reviewers.slice(0, 1),

    assignees: config.policy.allow_multiple_assignees
      ? filteredAssignees
      : filteredAssignees.slice(0, 1),

    path_matches: pathMatches.map((match) => match.name),
    label_matches: labelMatches.map((match) => match.name),
    branch_matches: branchMatches.map((match) => match.name),
    special_matches: specialAssignments.map(
      (assignment) => assignment.matched_rule,
    ),
    used_default: shouldUseDefault,
  };
}

function evaluateReviewRequirements(config, input = {}) {
  validateReviewerRulesConfig(config);

  const labels = normalizeStringList(input.labels, "input.labels");
  const branch = normalizeBranchName(input.branch || input.head_branch || "");
  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
    "input.changed_files",
  );
  const draft = normalizeBoolean(input.draft, false);

  const requirements = config.review_requirements;

  const reasons = [];

  if (draft && !requirements.require_review_for_drafts) {
    return {
      required: false,
      reasons: [
        {
          type: "draft",
          reason: "Draft pull requests do not require review by policy.",
        },
      ],
    };
  }

  if (
    labels.some((label) =>
      requirements.labels.allow_skip_if_present.includes(label),
    )
  ) {
    return {
      required: false,
      reasons: [
        {
          type: "label_skip",
          reason: "A review-skip label is present.",
        },
      ],
    };
  }

  for (const label of labels) {
    if (requirements.labels.require_review_if_present.includes(label)) {
      reasons.push({
        type: "label",
        value: label,
        reason: `Review required because label is present: ${label}`,
      });
    }
  }

  for (const pattern of requirements.paths.require_review_if_changed) {
    if (changedFiles.some((file) => matchesGlob(pattern, file))) {
      reasons.push({
        type: "path",
        value: pattern,
        reason: `Review required because changed files match: ${pattern}`,
      });
    }
  }

  for (const pattern of requirements.branches.require_review_if_matches) {
    if (matchesRegex(pattern, branch)) {
      reasons.push({
        type: "branch",
        value: pattern,
        reason: `Review required because branch matches: ${pattern}`,
      });
    }
  }

  if (isSecurityPullRequest(config, { labels })) {
    reasons.push({
      type: "security",
      reason: "Security pull requests require review.",
    });
  }

  if (isReleasePullRequest(config, { labels })) {
    reasons.push({
      type: "release",
      reason: "Release pull requests require review.",
    });
  }

  if (isOpenAiPullRequest(config, { ...input, branch })) {
    reasons.push({
      type: "openai",
      reason: "OpenAI automation pull requests require review.",
    });
  }

  const skip = shouldSkipHumanReview(config, {
    ...input,
    labels,
    branch,
    changed_files: changedFiles,
  });

  if (skip.skip && !reasons.length) {
    return {
      required: false,
      reasons: [
        {
          type: "policy_skip",
          reason: skip.reason,
        },
      ],
    };
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

function toGitHubReviewRequestPayload(assignment) {
  return {
    reviewers: unique(assignment.reviewers || []),
    team_reviewers: unique(assignment.team_reviewers || []),
  };
}

function toGitHubAssigneePayload(assignment) {
  return {
    assignees: unique(assignment.assignees || []),
  };
}

function summarizeReviewerAssignment(assignment) {
  return [
    `Reviewers: ${(assignment.reviewers || []).join(", ") || "none"}`,
    `Team reviewers: ${(assignment.team_reviewers || []).join(", ") || "none"}`,
    `Assignees: ${(assignment.assignees || []).join(", ") || "none"}`,
    `Labels: ${(assignment.labels || []).join(", ") || "none"}`,
    `Milestone: ${assignment.milestone || "none"}`,
    `Required: ${assignment.required ? "yes" : "no"}`,
    `Matched rules: ${(assignment.matched_rules || []).join(", ") || "none"}`,
  ].join("\n");
}

function assertReviewersConfigured(config) {
  validateReviewerRulesConfig(config);

  const hasDefault =
    config.default.reviewers.length > 0 ||
    config.default.team_reviewers.length > 0;

  const hasRules =
    Object.keys(config.path_rules || {}).length > 0 ||
    Object.keys(config.label_rules || {}).length > 0 ||
    Object.keys(config.branch_rules || {}).length > 0;

  if (!hasDefault && !hasRules) {
    throw new Error("No reviewers or reviewer rules are configured.");
  }

  return true;
}

if (require.main === module) {
  try {
    const config = loadReviewerRulesConfig();

    assertReviewersConfigured(config);

    logger.info(
      `Reviewer rules config validation passed with ${
        Object.keys(config.path_rules || {}).length
      } path rules, ${Object.keys(config.label_rules || {}).length} label rules, and ${
        Object.keys(config.branch_rules || {}).length
      } branch rules.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_BOT_ACCOUNTS,
  DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
  DEFAULT_OPENAI_BRANCH_PATTERNS,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadReviewerRulesConfig,
  normalizeReviewerRulesConfig,
  validateReviewerRulesConfig,

  normalizeBranchName,
  normalizeLogin,
  normalizeLoginList,
  normalizeTeamSlug,
  normalizeTeamSlugList,

  mergeAssignments,

  getBotAccounts,
  isBotAccount,
  filterReviewers,
  filterAssignees,

  getDefaultAssignment,
  getOwnerGroup,

  pathRuleMatches,
  matchPathRules,

  labelRuleMatches,
  matchLabelRules,

  branchRuleMatches,
  matchBranchRules,

  getPullRequestTypeRule,

  isDependencyPullRequest,
  isOpenAiPullRequest,
  isSecurityPullRequest,
  isSecurityDependencyPullRequest,
  isReleasePullRequest,
  isProductionDeployPullRequest,
  isDocsOnlyPullRequest,

  getSpecialRuleAssignments,
  shouldSkipHumanReview,

  getReviewerAssignment,
  evaluateReviewRequirements,

  toGitHubReviewRequestPayload,
  toGitHubAssigneePayload,

  summarizeReviewerAssignment,
  assertReviewersConfigured,
};
