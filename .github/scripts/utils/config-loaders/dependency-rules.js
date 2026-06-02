// .github/scripts/utils/config-loaders/dependency-rules.js
// =============================================================================
// Aerealith AI Dependency Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/dependency-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/security/summarize-dependencies.js
//   - .github/scripts/security/create-security-issues.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/validate-release-source.js
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - It centralizes dependency automation policy for Renovate, Mend,
//     Dependabot, auto-merge, release exclusion, security updates,
//     license policy, package grouping, and dependency PR safety.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/dependency-rules.yaml";

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
    throw new TypeError(`${fieldPath} must be a string.`);
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
    throw new TypeError(`${fieldPath} must be a string when provided.`);
  }

  return value.trim() || null;
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

function normalizeAutomationTools(automationTools) {
  automationTools = normalizeObject(automationTools, "automation_tools");

  return Object.fromEntries(
    Object.entries(automationTools).map(([toolName, toolConfig]) => {
      if (!isPlainObject(toolConfig)) {
        throw new TypeError(`automation_tools.${toolName} must be an object.`);
      }

      const branchPatterns = normalizeStringList(
        toolConfig.branch_patterns,
        `automation_tools.${toolName}.branch_patterns`,
      );

      validateRegexList(
        branchPatterns,
        `automation_tools.${toolName}.branch_patterns`,
      );

      return [
        toolName,
        {
          ...toolConfig,
          enabled: normalizeBoolean(toolConfig.enabled, true),
          role: normalizeNullableString(
            toolConfig.role,
            `automation_tools.${toolName}.role`,
          ),
          config_file: normalizeNullableString(
            toolConfig.config_file,
            `automation_tools.${toolName}.config_file`,
          ),
          branch_patterns: branchPatterns,
          authors: normalizeStringList(
            toolConfig.authors,
            `automation_tools.${toolName}.authors`,
          ),
          labels: normalizeStringList(
            toolConfig.labels,
            `automation_tools.${toolName}.labels`,
          ),
        },
      ];
    }),
  );
}

function normalizeDependencyPullRequests(dependencyPullRequests) {
  dependencyPullRequests = normalizeObject(
    dependencyPullRequests,
    "dependency_pull_requests",
  );

  const bodyRequirements = normalizeObject(
    dependencyPullRequests.body_requirements,
    "dependency_pull_requests.body_requirements",
  );

  const titlePrefixes = normalizeObject(
    dependencyPullRequests.title_prefixes,
    "dependency_pull_requests.title_prefixes",
  );

  return {
    ...dependencyPullRequests,

    release_allowed: normalizeBoolean(
      dependencyPullRequests.release_allowed,
      false,
    ),

    required_labels: normalizeStringList(
      dependencyPullRequests.required_labels,
      "dependency_pull_requests.required_labels",
    ),

    recommended_labels: normalizeStringList(
      dependencyPullRequests.recommended_labels,
      "dependency_pull_requests.recommended_labels",
    ),

    release_blocking_labels: normalizeStringList(
      dependencyPullRequests.release_blocking_labels,
      "dependency_pull_requests.release_blocking_labels",
    ),

    release_labels_forbidden: normalizeStringList(
      dependencyPullRequests.release_labels_forbidden,
      "dependency_pull_requests.release_labels_forbidden",
    ),

    allowed_base_branches: normalizeStringList(
      dependencyPullRequests.allowed_base_branches,
      "dependency_pull_requests.allowed_base_branches",
    ),

    allowed_authors: normalizeStringList(
      dependencyPullRequests.allowed_authors,
      "dependency_pull_requests.allowed_authors",
    ),

    allowed_branch_patterns: normalizeStringList(
      dependencyPullRequests.allowed_branch_patterns,
      "dependency_pull_requests.allowed_branch_patterns",
    ),

    require_linked_issue: normalizeBoolean(
      dependencyPullRequests.require_linked_issue,
      false,
    ),

    require_milestone: normalizeBoolean(
      dependencyPullRequests.require_milestone,
      true,
    ),

    default_milestone: normalizeString(
      dependencyPullRequests.default_milestone,
      "dependency_pull_requests.default_milestone",
      { fallback: "Dependencies — Renovate Weekly Updates" },
    ),

    title_prefixes: {
      ...titlePrefixes,
      allowed: normalizeStringList(
        titlePrefixes.allowed,
        "dependency_pull_requests.title_prefixes.allowed",
      ),
    },

    body_requirements: {
      ...bodyRequirements,
      require_update_summary: normalizeBoolean(
        bodyRequirements.require_update_summary,
        true,
      ),
      require_package_list: normalizeBoolean(
        bodyRequirements.require_package_list,
        true,
      ),
      require_release_note_summary: normalizeBoolean(
        bodyRequirements.require_release_note_summary,
        false,
      ),
      require_security_context_for_security_updates: normalizeBoolean(
        bodyRequirements.require_security_context_for_security_updates,
        true,
      ),
    },
  };
}

function normalizePolicyBlock(block, fieldPath) {
  block = normalizeObject(block, fieldPath);

  return {
    ...block,
    description: normalizeNullableString(
      block.description,
      `${fieldPath}.description`,
    ),
    labels: normalizeStringList(block.labels, `${fieldPath}.labels`),
    automerge_allowed: normalizeBoolean(block.automerge_allowed, false),
    review_required: normalizeBoolean(block.review_required, false),
    review_required_for_major: normalizeBoolean(
      block.review_required_for_major,
      false,
    ),
    dependency_dashboard_approval_required: normalizeBoolean(
      block.dependency_dashboard_approval_required,
      false,
    ),
    minimum_release_age: normalizeNullableString(
      block.minimum_release_age,
      `${fieldPath}.minimum_release_age`,
    ),
    milestone: normalizeNullableString(
      block.milestone,
      `${fieldPath}.milestone`,
    ),
  };
}

function normalizeDependencyTypes(dependencyTypes) {
  dependencyTypes = normalizeObject(dependencyTypes, "dependency_types");

  return Object.fromEntries(
    Object.entries(dependencyTypes).map(([typeName, typeConfig]) => [
      typeName,
      normalizePolicyBlock(typeConfig, `dependency_types.${typeName}`),
    ]),
  );
}

function normalizeUpdateTypes(updateTypes) {
  updateTypes = normalizeObject(updateTypes, "update_types");

  return Object.fromEntries(
    Object.entries(updateTypes).map(([typeName, typeConfig]) => [
      typeName,
      normalizePolicyBlock(typeConfig, `update_types.${typeName}`),
    ]),
  );
}

function normalizeSeverityPolicy(severityPolicy, fieldPath) {
  severityPolicy = normalizeObject(severityPolicy, fieldPath);

  return Object.fromEntries(
    Object.entries(severityPolicy).map(([severity, severityConfig]) => {
      if (!isPlainObject(severityConfig)) {
        throw new TypeError(`${fieldPath}.${severity} must be an object.`);
      }

      return [
        severity,
        {
          ...severityConfig,
          block_merge: normalizeBoolean(severityConfig.block_merge, false),
          block_release: normalizeBoolean(severityConfig.block_release, false),
          block_deploy: normalizeBoolean(severityConfig.block_deploy, false),
          create_issue: normalizeBoolean(severityConfig.create_issue, false),
          priority_label: normalizeNullableString(
            severityConfig.priority_label,
            `${fieldPath}.${severity}.priority_label`,
          ),
          severity_label: normalizeNullableString(
            severityConfig.severity_label,
            `${fieldPath}.${severity}.severity_label`,
          ),
        },
      ];
    }),
  );
}

function normalizeSecurityUpdates(securityUpdates) {
  securityUpdates = normalizeObject(securityUpdates, "security_updates");

  const securityIssueTemplate = normalizeObject(
    securityUpdates.security_issue_template,
    "security_updates.security_issue_template",
  );

  return {
    ...securityUpdates,

    enabled: normalizeBoolean(securityUpdates.enabled, true),
    release_allowed: normalizeBoolean(securityUpdates.release_allowed, false),

    default_milestone: normalizeString(
      securityUpdates.default_milestone,
      "security_updates.default_milestone",
      { fallback: "Security — Dependency Vulnerability Response" },
    ),

    labels: normalizeStringList(
      securityUpdates.labels,
      "security_updates.labels",
    ),

    automerge_allowed: normalizeBoolean(
      securityUpdates.automerge_allowed,
      true,
    ),
    review_required: normalizeBoolean(securityUpdates.review_required, false),

    require_all_checks: normalizeBoolean(
      securityUpdates.require_all_checks,
      true,
    ),
    require_security_gate: normalizeBoolean(
      securityUpdates.require_security_gate,
      true,
    ),
    require_dependency_review: normalizeBoolean(
      securityUpdates.require_dependency_review,
      true,
    ),
    require_codeql: normalizeBoolean(securityUpdates.require_codeql, true),
    require_sonarqube: normalizeBoolean(
      securityUpdates.require_sonarqube,
      true,
    ),

    block_if_exploit_known: normalizeBoolean(
      securityUpdates.block_if_exploit_known,
      false,
    ),
    create_security_issue_for_failed_patch: normalizeBoolean(
      securityUpdates.create_security_issue_for_failed_patch,
      true,
    ),
    create_security_issue_for_unpatchable_alert: normalizeBoolean(
      securityUpdates.create_security_issue_for_unpatchable_alert,
      true,
    ),

    severity_policy: normalizeSeverityPolicy(
      securityUpdates.severity_policy,
      "security_updates.severity_policy",
    ),

    security_issue_template: {
      ...securityIssueTemplate,
      title: normalizeString(
        securityIssueTemplate.title,
        "security_updates.security_issue_template.title",
        { fallback: "[Security]: Dependency vulnerability" },
      ),
      labels: normalizeStringList(
        securityIssueTemplate.labels,
        "security_updates.security_issue_template.labels",
      ),
      milestone: normalizeString(
        securityIssueTemplate.milestone,
        "security_updates.security_issue_template.milestone",
        { fallback: "Security — Dependency Vulnerability Response" },
      ),
    },
  };
}

function normalizeAutoMerge(autoMerge) {
  autoMerge = normalizeObject(autoMerge, "auto_merge");

  const blockIfFilesChanged = normalizeStringList(
    autoMerge.block_if_files_changed,
    "auto_merge.block_if_files_changed",
  );

  const manualReviewRequiredIfFilesChanged = normalizeStringList(
    autoMerge.manual_review_required_if_files_changed,
    "auto_merge.manual_review_required_if_files_changed",
  );

  return {
    ...autoMerge,

    enabled: normalizeBoolean(autoMerge.enabled, true),
    strategy: normalizeString(autoMerge.strategy, "auto_merge.strategy", {
      fallback: "merge",
    }),

    allowed_pr_types: normalizeStringList(
      autoMerge.allowed_pr_types,
      "auto_merge.allowed_pr_types",
    ),

    allowed_authors: normalizeStringList(
      autoMerge.allowed_authors,
      "auto_merge.allowed_authors",
    ),

    allowed_branch_patterns: normalizeStringList(
      autoMerge.allowed_branch_patterns,
      "auto_merge.allowed_branch_patterns",
    ),

    required_labels: normalizeStringList(
      autoMerge.required_labels,
      "auto_merge.required_labels",
    ),

    required_any_labels: normalizeStringList(
      autoMerge.required_any_labels,
      "auto_merge.required_any_labels",
    ),

    required_absent_labels: normalizeStringList(
      autoMerge.required_absent_labels,
      "auto_merge.required_absent_labels",
    ),

    required_checks: normalizeStringList(
      autoMerge.required_checks,
      "auto_merge.required_checks",
    ),

    required_status: normalizeStringList(
      autoMerge.required_status,
      "auto_merge.required_status",
    ),

    require_branch_up_to_date: normalizeBoolean(
      autoMerge.require_branch_up_to_date,
      true,
    ),
    require_no_requested_changes: normalizeBoolean(
      autoMerge.require_no_requested_changes,
      true,
    ),
    require_no_conflicts: normalizeBoolean(
      autoMerge.require_no_conflicts,
      true,
    ),

    allow_patch: normalizeBoolean(autoMerge.allow_patch, true),
    allow_minor: normalizeBoolean(autoMerge.allow_minor, true),
    allow_major: normalizeBoolean(autoMerge.allow_major, false),
    allow_security_patch: normalizeBoolean(
      autoMerge.allow_security_patch,
      true,
    ),
    allow_lockfile: normalizeBoolean(autoMerge.allow_lockfile, true),

    block_if_files_changed: blockIfFilesChanged,
    manual_review_required_if_files_changed: manualReviewRequiredIfFilesChanged,
  };
}

function normalizeManualReview(manualReview) {
  manualReview = normalizeObject(manualReview, "manual_review");

  const requiredFor = normalizeObject(
    manualReview.required_for,
    "manual_review.required_for",
  );

  return {
    ...manualReview,
    required_for: {
      ...requiredFor,
      update_types: normalizeStringList(
        requiredFor.update_types,
        "manual_review.required_for.update_types",
      ),
      package_groups: normalizeStringList(
        requiredFor.package_groups,
        "manual_review.required_for.package_groups",
      ),
      labels: normalizeStringList(
        requiredFor.labels,
        "manual_review.required_for.labels",
      ),
    },
    labels_to_add: normalizeStringList(
      manualReview.labels_to_add,
      "manual_review.labels_to_add",
    ),
    milestone: normalizeNullableString(
      manualReview.milestone,
      "manual_review.milestone",
    ),
  };
}

function normalizePackageGroups(packageGroups) {
  packageGroups = normalizeObject(packageGroups, "package_groups");

  return Object.fromEntries(
    Object.entries(packageGroups).map(([groupName, groupConfig]) => {
      if (!isPlainObject(groupConfig)) {
        throw new TypeError(`package_groups.${groupName} must be an object.`);
      }

      return [
        groupName,
        {
          ...groupConfig,
          description: normalizeNullableString(
            groupConfig.description,
            `package_groups.${groupName}.description`,
          ),
          match_package_names: normalizeStringList(
            groupConfig.match_package_names,
            `package_groups.${groupName}.match_package_names`,
          ),
          managers: normalizeStringList(
            groupConfig.managers,
            `package_groups.${groupName}.managers`,
          ),
          labels: normalizeStringList(
            groupConfig.labels,
            `package_groups.${groupName}.labels`,
          ),
          automerge_allowed: normalizeBoolean(
            groupConfig.automerge_allowed,
            false,
          ),
          review_required: normalizeBoolean(groupConfig.review_required, false),
          review_required_for_major: normalizeBoolean(
            groupConfig.review_required_for_major,
            false,
          ),
          milestone: normalizeNullableString(
            groupConfig.milestone,
            `package_groups.${groupName}.milestone`,
          ),
        },
      ];
    }),
  );
}

function normalizePathRules(pathRules) {
  pathRules = normalizeObject(pathRules, "path_rules");

  return Object.fromEntries(
    Object.entries(pathRules).map(([ruleName, ruleConfig]) => {
      if (!isPlainObject(ruleConfig)) {
        throw new TypeError(`path_rules.${ruleName} must be an object.`);
      }

      return [
        ruleName,
        {
          ...ruleConfig,
          patterns: normalizeStringList(
            ruleConfig.patterns,
            `path_rules.${ruleName}.patterns`,
          ),
          labels: normalizeStringList(
            ruleConfig.labels,
            `path_rules.${ruleName}.labels`,
          ),
          milestone: normalizeNullableString(
            ruleConfig.milestone,
            `path_rules.${ruleName}.milestone`,
          ),
          automerge_allowed:
            ruleConfig.automerge_allowed === undefined
              ? null
              : normalizeBoolean(ruleConfig.automerge_allowed, false),
        },
      ];
    }),
  );
}

function normalizeRequiredChecks(requiredChecks) {
  return normalizeStringListMap(requiredChecks, "required_checks");
}

function normalizeSecurityGates(securityGates) {
  securityGates = normalizeObject(securityGates, "security_gates");

  const blockMergeOn = normalizeObject(
    securityGates.block_merge_on,
    "security_gates.block_merge_on",
  );
  const warnOn = normalizeObject(
    securityGates.warn_on,
    "security_gates.warn_on",
  );
  const licenses = normalizeObject(
    securityGates.licenses,
    "security_gates.licenses",
  );
  const dependencyReview = normalizeObject(
    securityGates.dependency_review,
    "security_gates.dependency_review",
  );
  const pnpmAudit = normalizeObject(
    securityGates.pnpm_audit,
    "security_gates.pnpm_audit",
  );
  const containerScanning = normalizeObject(
    securityGates.container_scanning,
    "security_gates.container_scanning",
  );

  return {
    ...securityGates,

    strict: normalizeBoolean(securityGates.strict, true),

    block_merge_on: {
      ...blockMergeOn,
      vulnerabilities: normalizeStringList(
        blockMergeOn.vulnerabilities,
        "security_gates.block_merge_on.vulnerabilities",
      ),
      codeql: normalizeStringList(
        blockMergeOn.codeql,
        "security_gates.block_merge_on.codeql",
      ),
      sonarqube_quality_gate_failed: normalizeBoolean(
        blockMergeOn.sonarqube_quality_gate_failed,
        true,
      ),
      dependency_review_failed: normalizeBoolean(
        blockMergeOn.dependency_review_failed,
        true,
      ),
      secret_findings: normalizeBoolean(blockMergeOn.secret_findings, true),
      disallowed_licenses: normalizeBoolean(
        blockMergeOn.disallowed_licenses,
        true,
      ),
      malicious_packages: normalizeBoolean(
        blockMergeOn.malicious_packages,
        true,
      ),
    },

    warn_on: {
      ...warnOn,
      vulnerabilities: normalizeStringList(
        warnOn.vulnerabilities,
        "security_gates.warn_on.vulnerabilities",
      ),
    },

    licenses: {
      ...licenses,
      enabled: normalizeBoolean(licenses.enabled, true),
      block_unknown_license: normalizeBoolean(
        licenses.block_unknown_license,
        false,
      ),
      forbidden: normalizeStringList(
        licenses.forbidden,
        "security_gates.licenses.forbidden",
      ),
      allowed: normalizeStringList(
        licenses.allowed,
        "security_gates.licenses.allowed",
      ),
    },

    dependency_review: {
      ...dependencyReview,
      fail_on_severity: normalizeStringList(
        dependencyReview.fail_on_severity,
        "security_gates.dependency_review.fail_on_severity",
      ),
    },

    pnpm_audit: {
      ...pnpmAudit,
      enabled: normalizeBoolean(pnpmAudit.enabled, true),
      fail_on: normalizeStringList(
        pnpmAudit.fail_on,
        "security_gates.pnpm_audit.fail_on",
      ),
      warn_on: normalizeStringList(
        pnpmAudit.warn_on,
        "security_gates.pnpm_audit.warn_on",
      ),
    },

    container_scanning: {
      ...containerScanning,
      enabled: normalizeBoolean(containerScanning.enabled, true),
      fail_on: normalizeStringList(
        containerScanning.fail_on,
        "security_gates.container_scanning.fail_on",
      ),
      warn_on: normalizeStringList(
        containerScanning.warn_on,
        "security_gates.container_scanning.warn_on",
      ),
    },
  };
}

function normalizeReleaseExclusion(releaseExclusion) {
  releaseExclusion = normalizeObject(releaseExclusion, "release_exclusion");

  return {
    ...releaseExclusion,

    enabled: normalizeBoolean(releaseExclusion.enabled, true),

    dependency_changes_never_release: normalizeBoolean(
      releaseExclusion.dependency_changes_never_release,
      true,
    ),
    security_dependency_changes_never_release: normalizeBoolean(
      releaseExclusion.security_dependency_changes_never_release,
      true,
    ),
    lockfile_only_changes_never_release: normalizeBoolean(
      releaseExclusion.lockfile_only_changes_never_release,
      true,
    ),
    github_actions_dependency_changes_never_release: normalizeBoolean(
      releaseExclusion.github_actions_dependency_changes_never_release,
      true,
    ),

    block_release_if_author: normalizeStringList(
      releaseExclusion.block_release_if_author,
      "release_exclusion.block_release_if_author",
    ),

    block_release_if_branch_matches: normalizeStringList(
      releaseExclusion.block_release_if_branch_matches,
      "release_exclusion.block_release_if_branch_matches",
    ),

    block_release_if_labels_present: normalizeStringList(
      releaseExclusion.block_release_if_labels_present,
      "release_exclusion.block_release_if_labels_present",
    ),

    remove_release_labels_if_present: normalizeBoolean(
      releaseExclusion.remove_release_labels_if_present,
      true,
    ),

    release_labels_to_remove: normalizeStringList(
      releaseExclusion.release_labels_to_remove,
      "release_exclusion.release_labels_to_remove",
    ),
  };
}

function normalizeSchedules(schedules) {
  schedules = normalizeObject(schedules, "schedules");

  return Object.fromEntries(
    Object.entries(schedules).map(([scheduleName, scheduleConfig]) => {
      if (!isPlainObject(scheduleConfig)) {
        throw new TypeError(`schedules.${scheduleName} must be an object.`);
      }

      return [
        scheduleName,
        {
          ...scheduleConfig,
          normal_updates: isPlainObject(scheduleConfig.normal_updates)
            ? {
                ...scheduleConfig.normal_updates,
                description: normalizeNullableString(
                  scheduleConfig.normal_updates.description,
                  `schedules.${scheduleName}.normal_updates.description`,
                ),
                schedule: normalizeStringList(
                  scheduleConfig.normal_updates.schedule,
                  `schedules.${scheduleName}.normal_updates.schedule`,
                ),
              }
            : scheduleConfig.normal_updates,
          lockfile_maintenance: isPlainObject(
            scheduleConfig.lockfile_maintenance,
          )
            ? {
                ...scheduleConfig.lockfile_maintenance,
                description: normalizeNullableString(
                  scheduleConfig.lockfile_maintenance.description,
                  `schedules.${scheduleName}.lockfile_maintenance.description`,
                ),
                schedule: normalizeStringList(
                  scheduleConfig.lockfile_maintenance.schedule,
                  `schedules.${scheduleName}.lockfile_maintenance.schedule`,
                ),
              }
            : scheduleConfig.lockfile_maintenance,
          triggers: normalizeStringList(
            scheduleConfig.triggers,
            `schedules.${scheduleName}.triggers`,
          ),
        },
      ];
    }),
  );
}

function normalizeGroups(groups) {
  groups = normalizeObject(groups, "groups");

  return Object.fromEntries(
    Object.entries(groups).map(([groupName, groupConfig]) => {
      if (!isPlainObject(groupConfig)) {
        throw new TypeError(`groups.${groupName} must be an object.`);
      }

      return [
        groupName,
        {
          ...groupConfig,
          managers: normalizeStringList(
            groupConfig.managers,
            `groups.${groupName}.managers`,
          ),
          update_types: normalizeStringList(
            groupConfig.update_types,
            `groups.${groupName}.update_types`,
          ),
          labels: normalizeStringList(
            groupConfig.labels,
            `groups.${groupName}.labels`,
          ),
          security: normalizeBoolean(groupConfig.security, false),
        },
      ];
    }),
  );
}

function normalizeIssueCreation(issueCreation) {
  issueCreation = normalizeObject(issueCreation, "issue_creation");

  return {
    ...issueCreation,

    enabled: normalizeBoolean(issueCreation.enabled, true),

    create_issue_for: normalizeStringList(
      issueCreation.create_issue_for,
      "issue_creation.create_issue_for",
    ),

    repeated_failure_threshold: normalizeNumber(
      issueCreation.repeated_failure_threshold,
      3,
      "issue_creation.repeated_failure_threshold",
    ),

    default_labels: normalizeStringList(
      issueCreation.default_labels,
      "issue_creation.default_labels",
    ),
    security_labels: normalizeStringList(
      issueCreation.security_labels,
      "issue_creation.security_labels",
    ),

    default_assignees: normalizeStringList(
      issueCreation.default_assignees,
      "issue_creation.default_assignees",
    ),

    default_milestone: normalizeNullableString(
      issueCreation.default_milestone,
      "issue_creation.default_milestone",
    ),
    security_milestone: normalizeNullableString(
      issueCreation.security_milestone,
      "issue_creation.security_milestone",
    ),
    major_upgrade_milestone: normalizeNullableString(
      issueCreation.major_upgrade_milestone,
      "issue_creation.major_upgrade_milestone",
    ),
  };
}

function normalizeComments(comments) {
  comments = normalizeObject(comments, "comments");

  const commentFooter = normalizeObject(
    comments.comment_footer,
    "comments.comment_footer",
  );
  const summary = normalizeObject(comments.summary, "comments.summary");

  return {
    ...comments,

    enabled: normalizeBoolean(comments.enabled, true),
    add_pr_comment_on_policy_failure: normalizeBoolean(
      comments.add_pr_comment_on_policy_failure,
      true,
    ),
    add_pr_comment_on_release_exclusion: normalizeBoolean(
      comments.add_pr_comment_on_release_exclusion,
      true,
    ),
    add_pr_comment_on_auto_merge_blocked: normalizeBoolean(
      comments.add_pr_comment_on_auto_merge_blocked,
      true,
    ),
    add_workflow_summary: normalizeBoolean(comments.add_workflow_summary, true),

    comment_footer: {
      ...commentFooter,
      start: normalizeNullableString(
        commentFooter.start,
        "comments.comment_footer.start",
      ),
      end: normalizeNullableString(
        commentFooter.end,
        "comments.comment_footer.end",
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
              fallback: "warn",
            },
          ),
          label: normalizeNullableString(
            ruleConfig.label,
            `enforcement.${ruleName}.label`,
          ),
          labels: normalizeStringList(
            ruleConfig.labels,
            `enforcement.${ruleName}.labels`,
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

    do_not_push_to_main: normalizeBoolean(safety.do_not_push_to_main, true),
    do_not_create_release: normalizeBoolean(safety.do_not_create_release, true),
    do_not_publish_npm: normalizeBoolean(safety.do_not_publish_npm, true),
    do_not_publish_containers: normalizeBoolean(
      safety.do_not_publish_containers,
      true,
    ),
    do_not_deploy_production: normalizeBoolean(
      safety.do_not_deploy_production,
      true,
    ),

    do_not_auto_merge_if_unknown_author: normalizeBoolean(
      safety.do_not_auto_merge_if_unknown_author,
      true,
    ),
    do_not_auto_merge_if_missing_required_checks: normalizeBoolean(
      safety.do_not_auto_merge_if_missing_required_checks,
      true,
    ),
    do_not_auto_merge_if_security_gate_failed: normalizeBoolean(
      safety.do_not_auto_merge_if_security_gate_failed,
      true,
    ),
    do_not_auto_merge_if_review_requested: normalizeBoolean(
      safety.do_not_auto_merge_if_review_requested,
      true,
    ),
    do_not_auto_merge_if_conflicts: normalizeBoolean(
      safety.do_not_auto_merge_if_conflicts,
      true,
    ),
    do_not_auto_merge_if_release_label_present: normalizeBoolean(
      safety.do_not_auto_merge_if_release_label_present,
      true,
    ),

    protected_labels: normalizeStringList(
      safety.protected_labels,
      "safety.protected_labels",
    ),

    labels_to_never_remove_automatically: normalizeStringList(
      safety.labels_to_never_remove_automatically,
      "safety.labels_to_never_remove_automatically",
    ),

    labels_to_force_on_dependency_prs: normalizeStringList(
      safety.labels_to_force_on_dependency_prs,
      "safety.labels_to_force_on_dependency_prs",
    ),

    labels_to_force_on_security_dependency_prs: normalizeStringList(
      safety.labels_to_force_on_security_dependency_prs,
      "safety.labels_to_force_on_security_dependency_prs",
    ),
  };
}

function normalizeDependencyRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Dependency rules config must be a YAML object.");
  }

  const dependencyPrBranchPatterns = normalizeStringList(
    rawConfig.dependency_pull_requests?.allowed_branch_patterns,
    "dependency_pull_requests.allowed_branch_patterns",
  );
  validateRegexList(
    dependencyPrBranchPatterns,
    "dependency_pull_requests.allowed_branch_patterns",
  );

  const autoMergeBranchPatterns = normalizeStringList(
    rawConfig.auto_merge?.allowed_branch_patterns,
    "auto_merge.allowed_branch_patterns",
  );
  validateRegexList(
    autoMergeBranchPatterns,
    "auto_merge.allowed_branch_patterns",
  );

  const releaseExclusionBranchPatterns = normalizeStringList(
    rawConfig.release_exclusion?.block_release_if_branch_matches,
    "release_exclusion.block_release_if_branch_matches",
  );
  validateRegexList(
    releaseExclusionBranchPatterns,
    "release_exclusion.block_release_if_branch_matches",
  );

  return {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: normalizeNumber(rawConfig.version, 1, "version"),
    repository: normalizeRepository(rawConfig.repository),
    tooling: normalizeTooling(rawConfig.tooling),

    automation_tools: normalizeAutomationTools(rawConfig.automation_tools),

    dependency_pull_requests: normalizeDependencyPullRequests(
      rawConfig.dependency_pull_requests,
    ),

    dependency_types: normalizeDependencyTypes(rawConfig.dependency_types),
    update_types: normalizeUpdateTypes(rawConfig.update_types),
    security_updates: normalizeSecurityUpdates(rawConfig.security_updates),
    auto_merge: normalizeAutoMerge(rawConfig.auto_merge),
    manual_review: normalizeManualReview(rawConfig.manual_review),
    package_groups: normalizePackageGroups(rawConfig.package_groups),
    path_rules: normalizePathRules(rawConfig.path_rules),
    required_checks: normalizeRequiredChecks(rawConfig.required_checks),
    security_gates: normalizeSecurityGates(rawConfig.security_gates),
    release_exclusion: normalizeReleaseExclusion(rawConfig.release_exclusion),
    schedules: normalizeSchedules(rawConfig.schedules),
    groups: normalizeGroups(rawConfig.groups),
    issue_creation: normalizeIssueCreation(rawConfig.issue_creation),
    comments: normalizeComments(rawConfig.comments),
    enforcement: normalizeEnforcement(rawConfig.enforcement),
    safety: normalizeSafety(rawConfig.safety),
  };
}

function validateDependencyRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Dependency rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  if (!config.tooling?.package_manager) {
    throw new TypeError("tooling.package_manager is required.");
  }

  if (!Array.isArray(config.dependency_pull_requests?.required_labels)) {
    throw new TypeError(
      "dependency_pull_requests.required_labels must be an array.",
    );
  }

  if (
    !config.dependency_pull_requests.required_labels.includes("dependencies")
  ) {
    logger.warn("Dependency PR required labels should include `dependencies`.");
  }

  if (!config.dependency_pull_requests.required_labels.includes("no-release")) {
    logger.warn("Dependency PR required labels should include `no-release`.");
  }

  if (!config.auto_merge?.required_labels?.includes("no-release")) {
    logger.warn("Auto-merge required labels should include `no-release`.");
  }

  if (!Object.keys(config.automation_tools || {}).length) {
    logger.warn("No dependency automation tools were configured.");
  }

  if (!Object.keys(config.package_groups || {}).length) {
    logger.warn("No package groups were configured.");
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

function loadDependencyRulesConfig(options = {}) {
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
        `Dependency rules config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeDependencyRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          tooling: {},
          automation_tools: {},
          dependency_pull_requests: {
            required_labels: ["dependencies", "no-release"],
            allowed_authors: [],
            allowed_branch_patterns: [],
          },
          dependency_types: {},
          update_types: {},
          security_updates: {},
          auto_merge: {},
          manual_review: {},
          package_groups: {},
          path_rules: {},
          required_checks: {},
          security_gates: {},
          release_exclusion: {},
          schedules: {},
          groups: {},
          issue_creation: {},
          comments: {},
          enforcement: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Dependency rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeDependencyRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateDependencyRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded dependency rules config from ${displayPath}.`);
      logger.debug(
        `Dependency rules config contains ${
          Object.keys(normalizedConfig.package_groups || {}).length
        } package groups.`,
      );
      logger.dump("dependency rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load dependency rules config from ${displayPath}: ${logger.formatError(err)}`,
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

function normalizeAuthor(author) {
  if (!author || typeof author !== "string") return "";
  return author.trim();
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

function hasNoLabels(labels, candidates) {
  const labelSet = new Set(normalizeLabels(labels));
  return normalizeStringList(candidates, "candidates").every(
    (label) => !labelSet.has(label),
  );
}

function detectAutomationTool(config, input = {}) {
  const author = normalizeAuthor(input.author);
  const branch = normalizeBranchName(input.branch || input.head_branch || "");

  for (const [toolName, toolConfig] of Object.entries(
    config.automation_tools || {},
  )) {
    if (!toolConfig.enabled) continue;

    const authorMatched = author && toolConfig.authors.includes(author);
    const branchMatched =
      branch && matchesAnyRegex(toolConfig.branch_patterns, branch);

    if (authorMatched || branchMatched) {
      return {
        name: toolName,
        tool: toolConfig,
        author_matched: authorMatched,
        branch_matched: branchMatched,
      };
    }
  }

  return null;
}

function isDependencyAuthor(config, author) {
  const normalizedAuthor = normalizeAuthor(author);

  if (!normalizedAuthor) return false;

  return config.dependency_pull_requests.allowed_authors.includes(
    normalizedAuthor,
  );
}

function isDependencyBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!branchName) return false;

  return matchesAnyRegex(
    config.dependency_pull_requests.allowed_branch_patterns,
    branchName,
  );
}

function isDependencyPullRequest(config, input = {}) {
  return Boolean(
    detectAutomationTool(config, input) ||
    isDependencyAuthor(config, input.author) ||
    isDependencyBranch(config, input.branch || input.head_branch),
  );
}

function isSecurityDependency(labels = []) {
  return hasAnyLabel(labels, ["security:dependency"]);
}

function getDependencyRequiredLabels(config, input = {}) {
  const labels = [];

  if (isSecurityDependency(input.labels || [])) {
    labels.push(
      ...(config.safety.labels_to_force_on_security_dependency_prs || []),
    );
  } else {
    labels.push(...(config.safety.labels_to_force_on_dependency_prs || []));
  }

  labels.push(...(config.dependency_pull_requests.required_labels || []));

  return unique(labels);
}

function getMissingDependencyLabels(config, labels = [], input = {}) {
  const labelSet = new Set(normalizeLabels(labels));

  return getDependencyRequiredLabels(config, input).filter(
    (label) => !labelSet.has(label),
  );
}

function getForbiddenDependencyReleaseLabels(config, labels = []) {
  const labelSet = new Set(normalizeLabels(labels));

  return (
    config.dependency_pull_requests.release_labels_forbidden || []
  ).filter((label) => labelSet.has(label));
}

function getUpdateTypePolicy(config, updateType) {
  if (!updateType || typeof updateType !== "string") return null;

  return config.update_types?.[updateType] || null;
}

function getDependencyTypePolicy(config, dependencyType) {
  if (!dependencyType || typeof dependencyType !== "string") return null;

  return config.dependency_types?.[dependencyType] || null;
}

function packageNameMatches(pattern, packageName) {
  if (!pattern || !packageName) return false;

  if (pattern === packageName) return true;

  return minimatch(packageName, pattern, {
    dot: true,
    nocase: false,
    matchBase: false,
  });
}

function packageGroupMatchesPackage(groupConfig, packageName) {
  if (!packageName || !groupConfig) return false;

  return (groupConfig.match_package_names || []).some((pattern) =>
    packageNameMatches(pattern, packageName),
  );
}

function packageGroupMatchesManager(groupConfig, manager) {
  if (!manager || !groupConfig) return false;

  return (groupConfig.managers || []).includes(manager);
}

function getPackageGroupMatches(config, input = {}) {
  const packageNames = normalizeStringList(
    input.package_names || input.packages,
    "package_names",
  );
  const manager = normalizeNullableString(input.manager, "input.manager");

  const matches = [];

  for (const [groupName, groupConfig] of Object.entries(
    config.package_groups || {},
  )) {
    const matchedPackages = packageNames.filter((packageName) =>
      packageGroupMatchesPackage(groupConfig, packageName),
    );

    const managerMatched =
      manager && packageGroupMatchesManager(groupConfig, manager);

    if (!matchedPackages.length && !managerMatched) continue;

    matches.push({
      name: groupName,
      group: groupConfig,
      packages: matchedPackages,
      manager_matched: Boolean(managerMatched),
    });
  }

  return matches;
}

function collectPackageGroupLabels(config, input = {}) {
  return unique(
    getPackageGroupMatches(config, input).flatMap(
      (match) => match.group.labels || [],
    ),
  );
}

function collectPackageGroupMilestones(config, input = {}) {
  return unique(
    getPackageGroupMatches(config, input)
      .map((match) => match.group.milestone)
      .filter(Boolean),
  );
}

function packageGroupsRequireReview(config, input = {}) {
  return getPackageGroupMatches(config, input).some((match) =>
    normalizeBoolean(match.group.review_required, false),
  );
}

function matchPathRules(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const matches = [];

  for (const [ruleName, ruleConfig] of Object.entries(
    config.path_rules || {},
  )) {
    const matchedFiles = files.filter((file) =>
      (ruleConfig.patterns || []).some((pattern) =>
        minimatch(file, pattern, {
          dot: true,
          nocase: false,
          matchBase: false,
        }),
      ),
    );

    if (!matchedFiles.length) continue;

    matches.push({
      name: ruleName,
      rule: ruleConfig,
      files: unique(matchedFiles),
    });
  }

  return matches;
}

function collectPathRuleLabels(config, changedFiles = []) {
  return unique(
    matchPathRules(config, changedFiles).flatMap(
      (match) => match.rule.labels || [],
    ),
  );
}

function collectPathRuleMilestones(config, changedFiles = []) {
  return unique(
    matchPathRules(config, changedFiles)
      .map((match) => match.rule.milestone)
      .filter(Boolean),
  );
}

function anyPathRuleDisallowsAutomerge(config, changedFiles = []) {
  return matchPathRules(config, changedFiles).some(
    (match) => match.rule.automerge_allowed === false,
  );
}

function filesMatchAnyPattern(files = [], patterns = []) {
  const normalizedFiles = normalizeStringList(files, "files");
  const normalizedPatterns = normalizeStringList(patterns, "patterns");

  return normalizedFiles.some((file) =>
    normalizedPatterns.some((pattern) =>
      minimatch(file, pattern, {
        dot: true,
        nocase: false,
        matchBase: false,
      }),
    ),
  );
}

function getRequiredChecks(config, type = "dependency_pr") {
  return config.required_checks?.[type] || [];
}

function getSecuritySeverityPolicy(config, severity) {
  if (!severity || typeof severity !== "string") return null;

  const normalizedSeverity = severity.toLowerCase();

  return config.security_updates?.severity_policy?.[normalizedSeverity] || null;
}

function evaluateSecurityGate(config, input = {}) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const labels = normalizeLabels(input.labels || []);
  const blockers = [];
  const warnings = [];

  const blockSeverities =
    config.security_gates?.block_merge_on?.vulnerabilities || [];
  const warnSeverities = config.security_gates?.warn_on?.vulnerabilities || [];

  for (const finding of findings) {
    if (!isPlainObject(finding)) continue;

    const severity = normalizeString(
      finding.severity,
      "finding.severity",
    ).toLowerCase();
    const tool = normalizeNullableString(finding.tool, "finding.tool");
    const message = normalizeNullableString(finding.message, "finding.message");

    if (blockSeverities.includes(severity)) {
      blockers.push({
        type: "security_finding",
        severity,
        tool,
        message,
      });
    } else if (warnSeverities.includes(severity)) {
      warnings.push({
        type: "security_finding",
        severity,
        tool,
        message,
      });
    }
  }

  if (
    hasAnyLabel(labels, [
      "blocked-by-security",
      "do-not-merge",
      "status:blocked",
    ])
  ) {
    blockers.push({
      type: "label",
      labels: labels.filter((label) =>
        ["blocked-by-security", "do-not-merge", "status:blocked"].includes(
          label,
        ),
      ),
    });
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
  };
}

function getReleaseExclusionReasons(config, input = {}) {
  const labels = normalizeLabels(input.labels || []);
  const author = normalizeAuthor(input.author);
  const branch = normalizeBranchName(input.branch || input.head_branch || "");
  const changedFiles = normalizeStringList(
    input.changed_files || input.files,
    "changed_files",
  );

  const reasons = [];

  if (!config.release_exclusion?.enabled) {
    return reasons;
  }

  for (const label of labels) {
    if (
      config.release_exclusion.block_release_if_labels_present.includes(label)
    ) {
      reasons.push({
        type: "label",
        value: label,
        reason: `Release-blocking dependency label is present: ${label}`,
      });
    }
  }

  if (
    author &&
    config.release_exclusion.block_release_if_author.includes(author)
  ) {
    reasons.push({
      type: "author",
      value: author,
      reason: `Dependency automation author cannot create releases: ${author}`,
    });
  }

  if (
    branch &&
    matchesAnyRegex(
      config.release_exclusion.block_release_if_branch_matches,
      branch,
    )
  ) {
    reasons.push({
      type: "branch",
      value: branch,
      reason: `Dependency branch cannot create releases: ${branch}`,
    });
  }

  if (
    config.release_exclusion.lockfile_only_changes_never_release &&
    changedFiles.length > 0
  ) {
    const lockfilePatterns = [
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
    ];
    const allLockfileOnly = changedFiles.every((file) =>
      lockfilePatterns.some((pattern) =>
        minimatch(file, pattern, { dot: true }),
      ),
    );

    if (allLockfileOnly) {
      reasons.push({
        type: "lockfile_only",
        value: changedFiles,
        reason: "Lockfile-only dependency changes cannot create releases.",
      });
    }
  }

  return reasons;
}

function evaluateReleaseExclusion(config, input = {}) {
  const reasons = getReleaseExclusionReasons(config, input);

  return {
    excluded: reasons.length > 0,
    reasons,
    release_labels_to_remove: reasons.length
      ? config.release_exclusion.release_labels_to_remove || []
      : [],
  };
}

function updateTypeAllowedForAutoMerge(config, updateType) {
  const normalizedUpdateType = normalizeString(updateType, "updateType");

  if (normalizedUpdateType === "patch") return config.auto_merge.allow_patch;
  if (normalizedUpdateType === "minor") return config.auto_merge.allow_minor;
  if (normalizedUpdateType === "major") return config.auto_merge.allow_major;
  if (normalizedUpdateType === "security_patch") {
    return config.auto_merge.allow_security_patch;
  }
  if (normalizedUpdateType === "lockfile")
    return config.auto_merge.allow_lockfile;

  return config.auto_merge.allowed_pr_types.includes(normalizedUpdateType);
}

function getAutoMergeBlockers(config, input = {}) {
  const labels = normalizeLabels(input.labels || []);
  const author = normalizeAuthor(input.author);
  const branch = normalizeBranchName(input.branch || input.head_branch || "");
  const updateType = normalizeNullableString(
    input.update_type || input.updateType,
    "input.update_type",
  );
  const changedFiles = normalizeStringList(
    input.changed_files || input.files,
    "changed_files",
  );
  const checks = normalizeObject(input.checks, "input.checks");
  const reviewRequested = normalizeBoolean(input.review_requested, false);
  const hasConflicts = normalizeBoolean(input.has_conflicts, false);
  const branchUpToDate = normalizeBoolean(input.branch_up_to_date, true);
  const securityGatePassed = normalizeBoolean(input.security_gate_passed, true);

  const blockers = [];

  if (!config.auto_merge.enabled) {
    blockers.push({
      type: "policy",
      reason: "Dependency auto-merge is disabled.",
    });
  }

  if (author && !config.auto_merge.allowed_authors.includes(author)) {
    blockers.push({
      type: "author",
      value: author,
      reason: `Author is not allowed for dependency auto-merge: ${author}`,
    });
  }

  if (
    branch &&
    !matchesAnyRegex(config.auto_merge.allowed_branch_patterns, branch)
  ) {
    blockers.push({
      type: "branch",
      value: branch,
      reason: `Branch is not allowed for dependency auto-merge: ${branch}`,
    });
  }

  if (!hasAllLabels(labels, config.auto_merge.required_labels)) {
    blockers.push({
      type: "missing_labels",
      labels: config.auto_merge.required_labels.filter(
        (label) => !labels.includes(label),
      ),
      reason: "Required auto-merge labels are missing.",
    });
  }

  if (!hasAnyLabel(labels, config.auto_merge.required_any_labels)) {
    blockers.push({
      type: "missing_any_label",
      labels: config.auto_merge.required_any_labels,
      reason: "At least one automation identity label is required.",
    });
  }

  const forbiddenLabels = labels.filter((label) =>
    config.auto_merge.required_absent_labels.includes(label),
  );

  if (forbiddenLabels.length) {
    blockers.push({
      type: "forbidden_labels",
      labels: forbiddenLabels,
      reason: "One or more labels block dependency auto-merge.",
    });
  }

  if (updateType && !updateTypeAllowedForAutoMerge(config, updateType)) {
    blockers.push({
      type: "update_type",
      value: updateType,
      reason: `Update type is not allowed for auto-merge: ${updateType}`,
    });
  }

  const missingChecks = config.auto_merge.required_checks.filter(
    (checkName) => checks[checkName] !== "success",
  );

  if (missingChecks.length) {
    blockers.push({
      type: "checks",
      checks: missingChecks,
      reason: "Required checks have not passed.",
    });
  }

  if (config.auto_merge.require_branch_up_to_date && !branchUpToDate) {
    blockers.push({
      type: "branch_up_to_date",
      reason: "Branch must be up to date before auto-merge.",
    });
  }

  if (config.auto_merge.require_no_conflicts && hasConflicts) {
    blockers.push({
      type: "conflicts",
      reason: "Pull request has merge conflicts.",
    });
  }

  if (config.auto_merge.require_no_requested_changes && reviewRequested) {
    blockers.push({
      type: "review",
      reason: "Review is requested or changes were requested.",
    });
  }

  if (!securityGatePassed) {
    blockers.push({
      type: "security",
      reason: "Security gate has not passed.",
    });
  }

  if (
    filesMatchAnyPattern(changedFiles, config.auto_merge.block_if_files_changed)
  ) {
    blockers.push({
      type: "files",
      files: changedFiles,
      reason: "Changed files include paths that block dependency auto-merge.",
    });
  }

  if (anyPathRuleDisallowsAutomerge(config, changedFiles)) {
    blockers.push({
      type: "path_rule",
      reason: "A matching path rule blocks dependency auto-merge.",
    });
  }

  if (packageGroupsRequireReview(config, input)) {
    blockers.push({
      type: "package_group_review",
      reason: "One or more package groups require manual review.",
    });
  }

  return blockers;
}

function evaluateAutoMergeEligibility(config, input = {}) {
  const blockers = getAutoMergeBlockers(config, input);

  return {
    eligible: blockers.length === 0,
    blockers,
  };
}

function getManualReviewReasons(config, input = {}) {
  const labels = normalizeLabels(input.labels || []);
  const updateType = normalizeNullableString(
    input.update_type || input.updateType,
    "input.update_type",
  );
  const changedFiles = normalizeStringList(
    input.changed_files || input.files,
    "changed_files",
  );

  const reasons = [];

  if (
    updateType &&
    config.manual_review?.required_for?.update_types?.includes(updateType)
  ) {
    reasons.push({
      type: "update_type",
      value: updateType,
      reason: `Update type requires manual review: ${updateType}`,
    });
  }

  const matchedManualLabels = labels.filter((label) =>
    config.manual_review?.required_for?.labels?.includes(label),
  );

  if (matchedManualLabels.length) {
    reasons.push({
      type: "labels",
      labels: matchedManualLabels,
      reason: "One or more labels require manual review.",
    });
  }

  const packageGroupMatches = getPackageGroupMatches(config, input).filter(
    (match) =>
      config.manual_review?.required_for?.package_groups?.includes(match.name),
  );

  if (packageGroupMatches.length) {
    reasons.push({
      type: "package_groups",
      groups: packageGroupMatches.map((match) => match.name),
      reason: "One or more package groups require manual review.",
    });
  }

  if (
    filesMatchAnyPattern(
      changedFiles,
      config.auto_merge?.manual_review_required_if_files_changed || [],
    )
  ) {
    reasons.push({
      type: "files",
      files: changedFiles,
      reason: "Changed files require manual review.",
    });
  }

  return reasons;
}

function evaluateDependencyPullRequest(config, input = {}) {
  validateDependencyRulesConfig(config);

  const labels = normalizeLabels(input.labels || []);
  const changedFiles = normalizeStringList(
    input.changed_files || input.files,
    "changed_files",
  );
  const automationTool = detectAutomationTool(config, input);
  const isDependency = isDependencyPullRequest(config, input);
  const isSecurity = isSecurityDependency(labels);

  const missingLabels = isDependency
    ? getMissingDependencyLabels(config, labels, input)
    : [];

  const forbiddenReleaseLabels = isDependency
    ? getForbiddenDependencyReleaseLabels(config, labels)
    : [];

  const pathMatches = matchPathRules(config, changedFiles);
  const packageGroupMatches = getPackageGroupMatches(config, input);
  const releaseExclusion = evaluateReleaseExclusion(config, input);
  const autoMerge = evaluateAutoMergeEligibility(config, input);
  const manualReviewReasons = getManualReviewReasons(config, input);

  return {
    is_dependency_pr: isDependency,
    is_security_dependency_pr: isSecurity,
    automation_tool: automationTool?.name || null,

    missing_labels: missingLabels,
    forbidden_release_labels: forbiddenReleaseLabels,

    suggested_labels: unique([
      ...(automationTool?.tool?.labels || []),
      ...(isSecurity ? config.security_updates.labels || [] : []),
      ...(config.dependency_pull_requests.recommended_labels || []),
      ...collectPathRuleLabels(config, changedFiles),
      ...collectPackageGroupLabels(config, input),
      ...missingLabels,
    ]),

    suggested_milestones: unique(
      [
        ...(isSecurity ? [config.security_updates.default_milestone] : []),
        ...(collectPathRuleMilestones(config, changedFiles) || []),
        ...(collectPackageGroupMilestones(config, input) || []),
        config.dependency_pull_requests.default_milestone,
      ].filter(Boolean),
    ),

    path_matches: pathMatches.map((match) => match.name),
    package_group_matches: packageGroupMatches.map((match) => match.name),

    release_exclusion: releaseExclusion,
    auto_merge: autoMerge,
    manual_review: {
      required: manualReviewReasons.length > 0,
      reasons: manualReviewReasons,
      labels_to_add: manualReviewReasons.length
        ? config.manual_review.labels_to_add || []
        : [],
      milestone: manualReviewReasons.length
        ? config.manual_review.milestone || null
        : null,
    },
  };
}

function shouldCreateDependencyIssue(config, reason) {
  if (!config.issue_creation?.enabled) return false;
  if (!reason || typeof reason !== "string") return false;

  return config.issue_creation.create_issue_for.includes(reason);
}

function getIssueCreationDefaults(config, reason = "default") {
  const isSecurityReason = [
    "failed_security_update",
    "unpatchable_vulnerability",
    "malicious_package_detection",
    "license_policy_violation",
  ].includes(reason);

  return {
    assignees: config.issue_creation.default_assignees || [],
    labels: isSecurityReason
      ? unique([
          ...(config.issue_creation.default_labels || []),
          ...(config.issue_creation.security_labels || []),
        ])
      : config.issue_creation.default_labels || [],
    milestone: isSecurityReason
      ? config.issue_creation.security_milestone ||
        config.issue_creation.default_milestone
      : config.issue_creation.default_milestone,
  };
}

if (require.main === module) {
  try {
    const config = loadDependencyRulesConfig();
    logger.info(
      `Dependency rules config validation passed with ${
        Object.keys(config.automation_tools || {}).length
      } automation tools and ${Object.keys(config.package_groups || {}).length} package groups.`,
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

  loadDependencyRulesConfig,
  normalizeDependencyRulesConfig,
  validateDependencyRulesConfig,

  normalizeBranchName,
  normalizeAuthor,
  normalizeLabels,

  hasAnyLabel,
  hasAllLabels,
  hasNoLabels,

  detectAutomationTool,
  isDependencyAuthor,
  isDependencyBranch,
  isDependencyPullRequest,
  isSecurityDependency,

  getDependencyRequiredLabels,
  getMissingDependencyLabels,
  getForbiddenDependencyReleaseLabels,

  getUpdateTypePolicy,
  getDependencyTypePolicy,

  packageNameMatches,
  packageGroupMatchesPackage,
  packageGroupMatchesManager,
  getPackageGroupMatches,
  collectPackageGroupLabels,
  collectPackageGroupMilestones,
  packageGroupsRequireReview,

  matchPathRules,
  collectPathRuleLabels,
  collectPathRuleMilestones,
  anyPathRuleDisallowsAutomerge,
  filesMatchAnyPattern,

  getRequiredChecks,
  getSecuritySeverityPolicy,
  evaluateSecurityGate,

  getReleaseExclusionReasons,
  evaluateReleaseExclusion,

  updateTypeAllowedForAutoMerge,
  getAutoMergeBlockers,
  evaluateAutoMergeEligibility,

  getManualReviewReasons,
  evaluateDependencyPullRequest,

  shouldCreateDependencyIssue,
  getIssueCreationDefaults,
};
