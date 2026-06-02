// .github/scripts/utils/config-loaders/assignees.js
// =============================================================================
// Aerealith AI Assignees Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, and validate `.github/assignees.yaml` for repository
//   automation scripts.
//
// Used by:
//   - .github/scripts/repo/assign-assignees.js
//   - .github/scripts/repo/assign-reviewers.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/link-issues-prs.js
//   - .github/scripts/repo/run-repo-management.js
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe to use in dry-run and read-only workflows.
//   - It supports multiple assignees, reviewers, and team reviewers.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const logger = require("../logger");

const DEFAULT_CONFIG_PATH = ".github/assignees.yaml";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
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

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeNullableString(value, fieldPath) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string when provided.`);
  }

  return value.trim() || null;
}

function normalizeOwnerBlock(block, fallback = {}, fieldPath = "owner block") {
  if (block === undefined || block === null) {
    block = {};
  }

  if (!isPlainObject(block)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (!isPlainObject(fallback)) {
    fallback = {};
  }

  return {
    ...block,

    assignees: normalizeStringList(
      block.assignees !== undefined ? block.assignees : fallback.assignees,
      `${fieldPath}.assignees`,
    ),

    reviewers: normalizeStringList(
      block.reviewers !== undefined ? block.reviewers : fallback.reviewers,
      `${fieldPath}.reviewers`,
    ),

    team_reviewers: normalizeStringList(
      block.team_reviewers !== undefined
        ? block.team_reviewers
        : fallback.team_reviewers,
      `${fieldPath}.team_reviewers`,
    ),

    labels: normalizeStringList(block.labels, `${fieldPath}.labels`),

    milestone: normalizeNullableString(
      block.milestone !== undefined ? block.milestone : fallback.milestone,
      `${fieldPath}.milestone`,
    ),

    paths: normalizeStringList(block.paths, `${fieldPath}.paths`),

    automation_safe: normalizeBoolean(block.automation_safe, false),
  };
}

function normalizeOwnerGroups(ownerGroups, defaultOwners) {
  if (ownerGroups === undefined || ownerGroups === null) return {};

  if (!isPlainObject(ownerGroups)) {
    throw new TypeError("owner_groups must be an object.");
  }

  return Object.fromEntries(
    Object.entries(ownerGroups).map(([groupName, groupConfig]) => [
      groupName,
      normalizeOwnerBlock(
        groupConfig,
        defaultOwners,
        `owner_groups.${groupName}`,
      ),
    ]),
  );
}

function normalizeRules(rules, defaultOwners) {
  if (rules === undefined || rules === null) return {};

  if (!isPlainObject(rules)) {
    throw new TypeError("rules must be an object.");
  }

  return Object.fromEntries(
    Object.entries(rules).map(([ruleName, ruleConfig]) => [
      ruleName,
      normalizeOwnerBlock(ruleConfig, defaultOwners, `rules.${ruleName}`),
    ]),
  );
}

function normalizeMilestones(milestones) {
  if (milestones === undefined || milestones === null) return {};

  if (!isPlainObject(milestones)) {
    throw new TypeError("milestones must be an object.");
  }

  return Object.fromEntries(
    Object.entries(milestones).map(([milestoneName, milestoneConfig]) => {
      if (!isPlainObject(milestoneConfig)) {
        throw new TypeError(`milestones.${milestoneName} must be an object.`);
      }

      return [
        milestoneName,
        {
          ...milestoneConfig,
          description: normalizeNullableString(
            milestoneConfig.description,
            `milestones.${milestoneName}.description`,
          ),
          labels: normalizeStringList(
            milestoneConfig.labels,
            `milestones.${milestoneName}.labels`,
          ),
        },
      ];
    }),
  );
}

function normalizeRelationships(relationships) {
  if (relationships === undefined || relationships === null) return {};

  if (!isPlainObject(relationships)) {
    throw new TypeError("relationships must be an object.");
  }

  const createIssueWhenMissing = isPlainObject(
    relationships.create_issue_when_missing,
  )
    ? relationships.create_issue_when_missing
    : {};

  const relationshipFooter = isPlainObject(relationships.relationship_footer)
    ? relationships.relationship_footer
    : {};

  return {
    ...relationships,

    strong_keywords: normalizeStringList(
      relationships.strong_keywords,
      "relationships.strong_keywords",
    ),

    weak_keywords: normalizeStringList(
      relationships.weak_keywords,
      "relationships.weak_keywords",
    ),

    branch_issue_patterns: normalizeStringList(
      relationships.branch_issue_patterns,
      "relationships.branch_issue_patterns",
    ),

    require_strong_evidence: normalizeBoolean(
      relationships.require_strong_evidence,
      true,
    ),

    create_issue_when_missing: {
      ...createIssueWhenMissing,
      enabled: normalizeBoolean(createIssueWhenMissing.enabled, false),
      require_openai_review: normalizeBoolean(
        createIssueWhenMissing.require_openai_review,
        true,
      ),
      labels: normalizeStringList(
        createIssueWhenMissing.labels,
        "relationships.create_issue_when_missing.labels",
      ),
    },

    relationship_footer: {
      ...relationshipFooter,
      start: normalizeNullableString(
        relationshipFooter.start,
        "relationships.relationship_footer.start",
      ),
      end: normalizeNullableString(
        relationshipFooter.end,
        "relationships.relationship_footer.end",
      ),
    },
  };
}

function normalizeMergePolicy(policy, fieldPath) {
  if (policy === undefined || policy === null) return {};

  if (!isPlainObject(policy)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  return {
    ...policy,
    enabled: normalizeBoolean(policy.enabled, false),
    allowed_labels: normalizeStringList(
      policy.allowed_labels,
      `${fieldPath}.allowed_labels`,
    ),
    required_absent_labels: normalizeStringList(
      policy.required_absent_labels,
      `${fieldPath}.required_absent_labels`,
    ),
    allowed_authors: normalizeStringList(
      policy.allowed_authors,
      `${fieldPath}.allowed_authors`,
    ),
  };
}

function normalizeAutomationMerge(automationMerge) {
  if (automationMerge === undefined || automationMerge === null) return {};

  if (!isPlainObject(automationMerge)) {
    throw new TypeError("automation_merge must be an object.");
  }

  return {
    ...automationMerge,
    dependency_prs: normalizeMergePolicy(
      automationMerge.dependency_prs,
      "automation_merge.dependency_prs",
    ),
    security_patch_prs: normalizeMergePolicy(
      automationMerge.security_patch_prs,
      "automation_merge.security_patch_prs",
    ),
  };
}

function normalizeSafety(safety) {
  if (safety === undefined || safety === null) return {};

  if (!isPlainObject(safety)) {
    throw new TypeError("safety must be an object.");
  }

  return {
    ...safety,

    dry_run_supported: normalizeBoolean(safety.dry_run_supported, true),

    do_not_assign_without_matching_rule: normalizeBoolean(
      safety.do_not_assign_without_matching_rule,
      true,
    ),

    do_not_assign_bots_when_github_rejects: normalizeBoolean(
      safety.do_not_assign_bots_when_github_rejects,
      true,
    ),

    do_not_create_milestones: normalizeBoolean(
      safety.do_not_create_milestones,
      true,
    ),
    do_not_delete_milestones: normalizeBoolean(
      safety.do_not_delete_milestones,
      true,
    ),

    do_not_create_labels: normalizeBoolean(safety.do_not_create_labels, true),
    do_not_delete_labels: normalizeBoolean(safety.do_not_delete_labels, true),

    do_not_close_issues: normalizeBoolean(safety.do_not_close_issues, true),
    do_not_merge_pull_requests: normalizeBoolean(
      safety.do_not_merge_pull_requests,
      true,
    ),
    do_not_push_to_main: normalizeBoolean(safety.do_not_push_to_main, true),

    protected_labels: normalizeStringList(
      safety.protected_labels,
      "safety.protected_labels",
    ),

    replace_status_labels: normalizeStringList(
      safety.replace_status_labels,
      "safety.replace_status_labels",
    ),

    replace_priority_labels: normalizeStringList(
      safety.replace_priority_labels,
      "safety.replace_priority_labels",
    ),

    replace_severity_labels: normalizeStringList(
      safety.replace_severity_labels,
      "safety.replace_severity_labels",
    ),

    release_labels: normalizeStringList(
      safety.release_labels,
      "safety.release_labels",
    ),

    release_blocking_labels: normalizeStringList(
      safety.release_blocking_labels,
      "safety.release_blocking_labels",
    ),
  };
}

function normalizeAssigneesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Assignees config must be a YAML object.");
  }

  const maintainers = normalizeStringList(rawConfig.maintainers, "maintainers");
  const automationAccounts = normalizeStringList(
    rawConfig.automation_accounts,
    "automation_accounts",
  );

  const defaultOwners = normalizeOwnerBlock(
    rawConfig.default,
    {
      assignees: maintainers,
      reviewers: maintainers,
      team_reviewers: [],
      labels: ["status:backlog"],
      milestone: "Backlog",
    },
    "default",
  );

  const ownerGroups = normalizeOwnerGroups(
    rawConfig.owner_groups,
    defaultOwners,
  );
  const rules = normalizeRules(rawConfig.rules, defaultOwners);
  const milestones = normalizeMilestones(rawConfig.milestones);
  const relationships = normalizeRelationships(rawConfig.relationships);
  const automationMerge = normalizeAutomationMerge(rawConfig.automation_merge);
  const safety = normalizeSafety(rawConfig.safety);

  return {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    maintainers,
    automation_accounts: automationAccounts,
    owner_groups: ownerGroups,
    default: defaultOwners,
    rules,
    milestones,
    relationships,
    automation_merge: automationMerge,
    safety,
  };
}

function validateOwnerBlock(block, fieldPath) {
  if (!isPlainObject(block)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  for (const key of [
    "assignees",
    "reviewers",
    "team_reviewers",
    "labels",
    "paths",
  ]) {
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

function validateAssigneesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Assignees config must be an object.");
  }

  if (!Array.isArray(config.maintainers)) {
    throw new TypeError("maintainers must be an array.");
  }

  if (!config.maintainers.length && !config.default?.assignees?.length) {
    throw new TypeError(
      "At least one maintainer or default assignee is required.",
    );
  }

  validateOwnerBlock(config.default, "default");

  for (const [groupName, groupConfig] of Object.entries(
    config.owner_groups || {},
  )) {
    validateOwnerBlock(groupConfig, `owner_groups.${groupName}`);
  }

  for (const [ruleName, ruleConfig] of Object.entries(config.rules || {})) {
    validateOwnerBlock(ruleConfig, `rules.${ruleName}`);
  }

  if (!isPlainObject(config.rules)) {
    throw new TypeError("rules must be an object.");
  }

  if (!Object.keys(config.rules).length) {
    logger.warn("No assignee rules were found in .github/assignees.yaml.");
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

function loadAssigneesConfig(options = {}) {
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
        `Assignees config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeAssigneesConfig(
        {
          maintainers: [],
          automation_accounts: [],
          owner_groups: {},
          default: {
            assignees: [],
            reviewers: [],
            team_reviewers: [],
            labels: [],
            milestone: null,
          },
          rules: {},
          milestones: {},
          relationships: {},
          automation_merge: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Assignees config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeAssigneesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateAssigneesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded assignees config from ${displayPath}.`);
      logger.debug(
        `Assignees config contains ${Object.keys(normalizedConfig.rules || {}).length} rules.`,
      );
      logger.dump("assignees config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load assignees config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function getDefaultAssignment(config) {
  validateAssigneesConfig(config);
  return config.default;
}

function getAssigneeRule(config, ruleName) {
  validateAssigneesConfig(config);

  if (!ruleName || typeof ruleName !== "string") {
    return null;
  }

  return config.rules[ruleName] || null;
}

function getRulesForLabels(config, labels) {
  validateAssigneesConfig(config);

  const normalizedLabels = normalizeStringList(labels, "labels");

  return normalizedLabels
    .map((label) => {
      const rule = getAssigneeRule(config, label);
      return rule ? { name: label, rule } : null;
    })
    .filter(Boolean);
}

function mergeAssignments(...assignments) {
  const result = {
    assignees: [],
    reviewers: [],
    team_reviewers: [],
    labels: [],
    paths: [],
    milestone: null,
    automation_safe: false,
  };

  for (const assignment of assignments) {
    if (!assignment) continue;

    const normalized = normalizeOwnerBlock(assignment, {}, "assignment");

    result.assignees.push(...normalized.assignees);
    result.reviewers.push(...normalized.reviewers);
    result.team_reviewers.push(...normalized.team_reviewers);
    result.labels.push(...normalized.labels);
    result.paths.push(...normalized.paths);

    if (normalized.milestone) {
      result.milestone = normalized.milestone;
    }

    result.automation_safe =
      result.automation_safe || normalized.automation_safe;
  }

  return {
    assignees: unique(result.assignees),
    reviewers: unique(result.reviewers),
    team_reviewers: unique(result.team_reviewers),
    labels: unique(result.labels),
    paths: unique(result.paths),
    milestone: result.milestone,
    automation_safe: result.automation_safe,
  };
}

function getRulesForAutomationMerge(config, type) {
  validateAssigneesConfig(config);

  if (!type || typeof type !== "string") {
    return null;
  }

  return config.automation_merge?.[type] || null;
}

function isAutomationAccount(config, login) {
  if (!login || typeof login !== "string") return false;

  const automationAccounts = normalizeStringList(
    config.automation_accounts,
    "automation_accounts",
  );

  return automationAccounts.includes(login);
}

if (require.main === module) {
  try {
    const config = loadAssigneesConfig();
    logger.info(
      `Assignees config validation passed with ${Object.keys(config.rules || {}).length} rules.`,
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

  loadAssigneesConfig,
  normalizeAssigneesConfig,
  validateAssigneesConfig,

  getDefaultAssignment,
  getAssigneeRule,
  getRulesForLabels,
  getRulesForAutomationMerge,
  isAutomationAccount,
  mergeAssignments,
};
