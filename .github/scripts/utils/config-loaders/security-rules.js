// .github/scripts/utils/config-loaders/security-rules.js
// =============================================================================
// Aerealith AI Security Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/security-rules.yaml`.
//
// Used by:
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/security/summarize-security.js
//   - .github/scripts/security/create-security-issues.js
//   - .github/scripts/security/summarize-dependencies.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//
// Notes:
//   - This loader does not mutate GitHub, SonarQube, Cloudflare, npm, or GHCR.
//   - It is safe for dry-run and read-only workflows.
//   - It centralizes strict security policy for pull requests, main branch scans,
//     dependency automation, CodeQL, SonarQube Cloud, Dependabot, dependency
//     review, secret scanning, license review, SBOMs, container scanning,
//     supply-chain integrity, release gates, and production deployment gates.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/security-rules.yaml";

const DEFAULT_SEVERITY_ORDER = [
  "critical",
  "high",
  "medium",
  "moderate",
  "low",
  "warning",
  "note",
  "unknown",
];

const DEFAULT_BLOCKING_SECURITY_LABELS = [
  "blocked-by-security",
  "needs-security-review",
  "do-not-merge",
  "status:blocked",
];

const DEFAULT_SECURITY_REVIEW_LABELS = [
  "kind:security",
  "area:security",
  "needs-security-review",
];

const DEFAULT_DEPENDENCY_SECURITY_LABELS = [
  "dependencies",
  "security:dependency",
  "no-release",
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

const DEFAULT_RELEASE_BLOCKING_LABELS = [
  "no-release",
  "dependencies",
  "security:dependency",
  "blocked-by-security",
  "do-not-merge",
  "status:blocked",
];

const DEFAULT_SECURITY_TOOLS = {
  codeql: true,
  dependabot: true,
  dependency_review: true,
  sonarqube: true,
  secret_scanning: true,
  pnpm_audit: true,
  license_review: true,
  container_scanning: true,
  sbom: true,
  scorecard: true,
  gitleaks: true,
  trivy: true,
  grype: false,
  semgrep: false,
  osv_scanner: true,
};

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

function matchesGlob(pattern, value) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!value || typeof value !== "string") return false;

  return minimatch(value, pattern, {
    dot: true,
    nocase: false,
    matchBase: false,
  });
}

function matchesAnyGlob(patterns, value) {
  const normalizedPatterns = normalizeStringList(patterns, "patterns");

  return normalizedPatterns.some((pattern) => matchesGlob(pattern, value));
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

function normalizeSeverity(value, fallback = "unknown") {
  const severity = normalizeString(value, "severity", {
    fallback,
  }).toLowerCase();

  if (severity === "moderate") return "medium";
  if (severity === "warn") return "warning";
  if (severity === "error") return "high";
  if (severity === "fatal") return "critical";

  if (!DEFAULT_SEVERITY_ORDER.includes(severity)) {
    return fallback;
  }

  return severity;
}

function severityRank(severity) {
  const normalized = normalizeSeverity(severity);
  const index = DEFAULT_SEVERITY_ORDER.indexOf(normalized);

  return index === -1 ? DEFAULT_SEVERITY_ORDER.indexOf("unknown") : index;
}

function severityAtLeast(severity, threshold) {
  return severityRank(severity) <= severityRank(threshold);
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
    primary_language: normalizeString(
      tooling.primary_language,
      "tooling.primary_language",
      {
        fallback: "TypeScript",
      },
    ),
  };
}

function normalizePolicy(policy) {
  policy = normalizeObject(policy, "policy");

  return {
    ...policy,

    enabled: normalizeBoolean(policy.enabled, true),
    strict: normalizeBoolean(policy.strict, true),
    dry_run_supported: normalizeBoolean(policy.dry_run_supported, true),
    debug_supported: normalizeBoolean(policy.debug_supported, true),

    security_required_on_pull_requests: normalizeBoolean(
      policy.security_required_on_pull_requests,
      true,
    ),
    security_required_on_main: normalizeBoolean(
      policy.security_required_on_main,
      true,
    ),
    security_required_before_release: normalizeBoolean(
      policy.security_required_before_release,
      true,
    ),
    security_required_before_staging_deploy: normalizeBoolean(
      policy.security_required_before_staging_deploy,
      true,
    ),
    security_required_before_production_deploy: normalizeBoolean(
      policy.security_required_before_production_deploy,
      true,
    ),

    block_merge_on_security_failure: normalizeBoolean(
      policy.block_merge_on_security_failure,
      true,
    ),
    block_release_on_security_failure: normalizeBoolean(
      policy.block_release_on_security_failure,
      true,
    ),
    block_deploy_on_security_failure: normalizeBoolean(
      policy.block_deploy_on_security_failure,
      true,
    ),

    dependency_prs_must_be_no_release: normalizeBoolean(
      policy.dependency_prs_must_be_no_release,
      true,
    ),
    security_dependency_prs_must_be_no_release: normalizeBoolean(
      policy.security_dependency_prs_must_be_no_release,
      true,
    ),

    allow_dependency_auto_merge_after_green_security: normalizeBoolean(
      policy.allow_dependency_auto_merge_after_green_security,
      true,
    ),
    allow_security_patch_auto_merge_after_green_security: normalizeBoolean(
      policy.allow_security_patch_auto_merge_after_green_security,
      true,
    ),

    require_codeql: normalizeBoolean(policy.require_codeql, true),
    require_dependabot: normalizeBoolean(policy.require_dependabot, true),
    require_dependency_review: normalizeBoolean(
      policy.require_dependency_review,
      true,
    ),
    require_sonarqube: normalizeBoolean(policy.require_sonarqube, true),
    require_secret_scanning: normalizeBoolean(
      policy.require_secret_scanning,
      true,
    ),
    require_license_review: normalizeBoolean(
      policy.require_license_review,
      true,
    ),
    require_pnpm_audit: normalizeBoolean(policy.require_pnpm_audit, true),
    require_container_scanning_for_dockerfiles: normalizeBoolean(
      policy.require_container_scanning_for_dockerfiles,
      true,
    ),
    require_sbom_for_release: normalizeBoolean(
      policy.require_sbom_for_release,
      true,
    ),

    fail_on_missing_security_report: normalizeBoolean(
      policy.fail_on_missing_security_report,
      true,
    ),
    fail_on_unknown_security_state: normalizeBoolean(
      policy.fail_on_unknown_security_state,
      true,
    ),
  };
}

function normalizeToolConfig(toolName, toolConfig) {
  toolConfig = normalizeObject(toolConfig, `tools.${toolName}`);

  return {
    ...toolConfig,
    enabled: normalizeBoolean(
      toolConfig.enabled,
      DEFAULT_SECURITY_TOOLS[toolName] || false,
    ),
    required: normalizeBoolean(toolConfig.required, false),
    check_names: normalizeStringList(
      toolConfig.check_names,
      `tools.${toolName}.check_names`,
    ),
    labels: normalizeStringList(toolConfig.labels, `tools.${toolName}.labels`),
    report_artifacts: normalizeStringList(
      toolConfig.report_artifacts,
      `tools.${toolName}.report_artifacts`,
    ),
  };
}

function normalizeTools(tools) {
  tools = {
    ...DEFAULT_SECURITY_TOOLS,
    ...normalizeObject(tools, "tools"),
  };

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolConfig]) => {
      if (typeof toolConfig === "boolean") {
        return [
          toolName,
          normalizeToolConfig(toolName, {
            enabled: toolConfig,
            required: toolConfig,
          }),
        ];
      }

      return [toolName, normalizeToolConfig(toolName, toolConfig)];
    }),
  );
}

function normalizeCodeql(codeql) {
  codeql = normalizeObject(codeql, "codeql");

  return {
    ...codeql,
    enabled: normalizeBoolean(codeql.enabled, true),
    config_file: normalizeString(codeql.config_file, "codeql.config_file", {
      fallback: ".github/codeql.yaml",
    }),
    languages: normalizeStringList(codeql.languages, "codeql.languages"),
    required_queries: normalizeStringList(
      codeql.required_queries,
      "codeql.required_queries",
    ),
    block_on_severities: normalizeStringList(
      codeql.block_on_severities,
      "codeql.block_on_severities",
    ),
    warn_on_severities: normalizeStringList(
      codeql.warn_on_severities,
      "codeql.warn_on_severities",
    ),
    required_check_names: normalizeStringList(
      codeql.required_check_names,
      "codeql.required_check_names",
    ),
  };
}

function normalizeDependabot(dependabot) {
  dependabot = normalizeObject(dependabot, "dependabot");

  return {
    ...dependabot,
    enabled: normalizeBoolean(dependabot.enabled, true),
    config_file: normalizeString(
      dependabot.config_file,
      "dependabot.config_file",
      {
        fallback: ".github/dependabot.yaml",
      },
    ),
    alerts_enabled: normalizeBoolean(dependabot.alerts_enabled, true),
    security_updates_enabled: normalizeBoolean(
      dependabot.security_updates_enabled,
      true,
    ),
    block_on_alert_severities: normalizeStringList(
      dependabot.block_on_alert_severities,
      "dependabot.block_on_alert_severities",
    ),
    warn_on_alert_severities: normalizeStringList(
      dependabot.warn_on_alert_severities,
      "dependabot.warn_on_alert_severities",
    ),
    labels: normalizeStringList(dependabot.labels, "dependabot.labels"),
  };
}

function normalizeDependencyReview(dependencyReview) {
  dependencyReview = normalizeObject(dependencyReview, "dependency_review");

  const licenses = normalizeObject(
    dependencyReview.licenses,
    "dependency_review.licenses",
  );

  return {
    ...dependencyReview,
    enabled: normalizeBoolean(dependencyReview.enabled, true),
    required_check_names: normalizeStringList(
      dependencyReview.required_check_names,
      "dependency_review.required_check_names",
    ),
    fail_on_severity: normalizeString(
      dependencyReview.fail_on_severity,
      "dependency_review.fail_on_severity",
      { fallback: "high" },
    ),
    warn_on_severity: normalizeString(
      dependencyReview.warn_on_severity,
      "dependency_review.warn_on_severity",
      { fallback: "medium" },
    ),
    allow_ghsas: normalizeStringList(
      dependencyReview.allow_ghsas,
      "dependency_review.allow_ghsas",
    ),
    deny_ghsas: normalizeStringList(
      dependencyReview.deny_ghsas,
      "dependency_review.deny_ghsas",
    ),
    fail_on_scopes: normalizeStringList(
      dependencyReview.fail_on_scopes,
      "dependency_review.fail_on_scopes",
    ),
    licenses: {
      ...licenses,
      enabled: normalizeBoolean(licenses.enabled, true),
      allow: normalizeStringList(
        licenses.allow,
        "dependency_review.licenses.allow",
      ),
      deny: normalizeStringList(
        licenses.deny,
        "dependency_review.licenses.deny",
      ),
      fail_on_unknown: normalizeBoolean(licenses.fail_on_unknown, false),
    },
  };
}

function normalizeSonarqube(sonarqube) {
  sonarqube = normalizeObject(sonarqube, "sonarqube");

  return {
    ...sonarqube,
    enabled: normalizeBoolean(sonarqube.enabled, true),
    cloud: normalizeBoolean(sonarqube.cloud, true),
    project_key_variable: normalizeString(
      sonarqube.project_key_variable,
      "sonarqube.project_key_variable",
      { fallback: "SONAR_PROJECT_KEY" },
    ),
    organization_variable: normalizeString(
      sonarqube.organization_variable,
      "sonarqube.organization_variable",
      { fallback: "SONAR_ORGANIZATION" },
    ),
    token_secret: normalizeString(
      sonarqube.token_secret,
      "sonarqube.token_secret",
      {
        fallback: "SONAR_TOKEN",
      },
    ),
    quality_gate_required: normalizeBoolean(
      sonarqube.quality_gate_required,
      true,
    ),
    block_on_quality_gate_failure: normalizeBoolean(
      sonarqube.block_on_quality_gate_failure,
      true,
    ),
    required_check_names: normalizeStringList(
      sonarqube.required_check_names,
      "sonarqube.required_check_names",
    ),
  };
}

function normalizeSecretScanning(secretScanning) {
  secretScanning = normalizeObject(secretScanning, "secret_scanning");

  return {
    ...secretScanning,
    enabled: normalizeBoolean(secretScanning.enabled, true),
    push_protection_required: normalizeBoolean(
      secretScanning.push_protection_required,
      true,
    ),
    block_on_verified_secret: normalizeBoolean(
      secretScanning.block_on_verified_secret,
      true,
    ),
    block_on_any_secret: normalizeBoolean(
      secretScanning.block_on_any_secret,
      true,
    ),
    allowlist_paths: normalizeStringList(
      secretScanning.allowlist_paths,
      "secret_scanning.allowlist_paths",
    ),
    allowlist_patterns: normalizeStringList(
      secretScanning.allowlist_patterns,
      "secret_scanning.allowlist_patterns",
    ),
    required_check_names: normalizeStringList(
      secretScanning.required_check_names,
      "secret_scanning.required_check_names",
    ),
  };
}

function normalizePnpmAudit(pnpmAudit) {
  pnpmAudit = normalizeObject(pnpmAudit, "pnpm_audit");

  return {
    ...pnpmAudit,
    enabled: normalizeBoolean(pnpmAudit.enabled, true),
    command: normalizeString(pnpmAudit.command, "pnpm_audit.command", {
      fallback: "pnpm audit --audit-level high",
    }),
    fail_on_severities: normalizeStringList(
      pnpmAudit.fail_on_severities,
      "pnpm_audit.fail_on_severities",
    ),
    warn_on_severities: normalizeStringList(
      pnpmAudit.warn_on_severities,
      "pnpm_audit.warn_on_severities",
    ),
    ignore_advisories: normalizeStringList(
      pnpmAudit.ignore_advisories,
      "pnpm_audit.ignore_advisories",
    ),
    required_check_names: normalizeStringList(
      pnpmAudit.required_check_names,
      "pnpm_audit.required_check_names",
    ),
  };
}

function normalizeLicenseReview(licenseReview) {
  licenseReview = normalizeObject(licenseReview, "license_review");

  return {
    ...licenseReview,
    enabled: normalizeBoolean(licenseReview.enabled, true),
    allowed: normalizeStringList(
      licenseReview.allowed,
      "license_review.allowed",
    ),
    forbidden: normalizeStringList(
      licenseReview.forbidden,
      "license_review.forbidden",
    ),
    warn: normalizeStringList(licenseReview.warn, "license_review.warn"),
    fail_on_unknown: normalizeBoolean(licenseReview.fail_on_unknown, false),
    allow_private_packages: normalizeBoolean(
      licenseReview.allow_private_packages,
      true,
    ),
    required_check_names: normalizeStringList(
      licenseReview.required_check_names,
      "license_review.required_check_names",
    ),
  };
}

function normalizeContainerScanning(containerScanning) {
  containerScanning = normalizeObject(containerScanning, "container_scanning");

  return {
    ...containerScanning,
    enabled: normalizeBoolean(containerScanning.enabled, true),
    required_when_dockerfile_changed: normalizeBoolean(
      containerScanning.required_when_dockerfile_changed,
      true,
    ),
    dockerfile_patterns: normalizeStringList(
      containerScanning.dockerfile_patterns,
      "container_scanning.dockerfile_patterns",
    ),
    ignore_paths: normalizeStringList(
      containerScanning.ignore_paths,
      "container_scanning.ignore_paths",
    ),
    scanners: normalizeStringList(
      containerScanning.scanners,
      "container_scanning.scanners",
    ),
    fail_on_severities: normalizeStringList(
      containerScanning.fail_on_severities,
      "container_scanning.fail_on_severities",
    ),
    warn_on_severities: normalizeStringList(
      containerScanning.warn_on_severities,
      "container_scanning.warn_on_severities",
    ),
    required_check_names: normalizeStringList(
      containerScanning.required_check_names,
      "container_scanning.required_check_names",
    ),
  };
}

function normalizeSbom(sbom) {
  sbom = normalizeObject(sbom, "sbom");

  return {
    ...sbom,
    enabled: normalizeBoolean(sbom.enabled, true),
    required_on_release: normalizeBoolean(sbom.required_on_release, true),
    required_for_containers: normalizeBoolean(
      sbom.required_for_containers,
      true,
    ),
    format: normalizeString(sbom.format, "sbom.format", {
      fallback: "spdx-json",
    }),
    artifact_name: normalizeString(sbom.artifact_name, "sbom.artifact_name", {
      fallback: "sbom.spdx.json",
    }),
    accepted_formats: normalizeStringList(
      sbom.accepted_formats,
      "sbom.accepted_formats",
    ),
    required_check_names: normalizeStringList(
      sbom.required_check_names,
      "sbom.required_check_names",
    ),
  };
}

function normalizeSupplyChain(supplyChain) {
  supplyChain = normalizeObject(supplyChain, "supply_chain");

  const scorecard = normalizeObject(
    supplyChain.scorecard,
    "supply_chain.scorecard",
  );
  const provenance = normalizeObject(
    supplyChain.provenance,
    "supply_chain.provenance",
  );
  const signatures = normalizeObject(
    supplyChain.signatures,
    "supply_chain.signatures",
  );

  return {
    ...supplyChain,

    enabled: normalizeBoolean(supplyChain.enabled, true),

    scorecard: {
      ...scorecard,
      enabled: normalizeBoolean(scorecard.enabled, true),
      required_on_main: normalizeBoolean(scorecard.required_on_main, true),
      required_on_release: normalizeBoolean(
        scorecard.required_on_release,
        true,
      ),
      min_score: normalizeNumber(
        scorecard.min_score,
        7,
        "supply_chain.scorecard.min_score",
      ),
      block_on_dangerous_workflow: normalizeBoolean(
        scorecard.block_on_dangerous_workflow,
        true,
      ),
    },

    provenance: {
      ...provenance,
      enabled: normalizeBoolean(provenance.enabled, true),
      required_on_release: normalizeBoolean(
        provenance.required_on_release,
        true,
      ),
      required_for_npm: normalizeBoolean(provenance.required_for_npm, true),
      required_for_containers: normalizeBoolean(
        provenance.required_for_containers,
        true,
      ),
    },

    signatures: {
      ...signatures,
      require_signed_commits: normalizeBoolean(
        signatures.require_signed_commits,
        false,
      ),
      require_signed_tags: normalizeBoolean(
        signatures.require_signed_tags,
        true,
      ),
    },
  };
}

function normalizeRequiredChecks(requiredChecks) {
  requiredChecks = normalizeObject(requiredChecks, "required_checks");

  return Object.fromEntries(
    Object.entries(requiredChecks).map(([groupName, checks]) => [
      groupName,
      normalizeStringList(checks, `required_checks.${groupName}`),
    ]),
  );
}

function normalizeGateSeverityRule(rule, fieldPath) {
  rule = normalizeObject(rule, fieldPath);

  return {
    ...rule,
    block: normalizeStringList(rule.block, `${fieldPath}.block`),
    warn: normalizeStringList(rule.warn, `${fieldPath}.warn`),
    allow: normalizeStringList(rule.allow, `${fieldPath}.allow`),
  };
}

function normalizeGates(gates) {
  gates = normalizeObject(gates, "gates");

  const pullRequest = normalizeObject(gates.pull_request, "gates.pull_request");
  const main = normalizeObject(gates.main, "gates.main");
  const release = normalizeObject(gates.release, "gates.release");
  const stagingDeploy = normalizeObject(
    gates.staging_deploy,
    "gates.staging_deploy",
  );
  const productionDeploy = normalizeObject(
    gates.production_deploy,
    "gates.production_deploy",
  );

  return {
    ...gates,

    pull_request: {
      ...pullRequest,
      enabled: normalizeBoolean(pullRequest.enabled, true),
      block_on_failed_required_checks: normalizeBoolean(
        pullRequest.block_on_failed_required_checks,
        true,
      ),
      block_on_findings: normalizeGateSeverityRule(
        pullRequest.block_on_findings,
        "gates.pull_request.block_on_findings",
      ),
    },

    main: {
      ...main,
      enabled: normalizeBoolean(main.enabled, true),
      scheduled_scan_required: normalizeBoolean(
        main.scheduled_scan_required,
        true,
      ),
      block_on_findings: normalizeGateSeverityRule(
        main.block_on_findings,
        "gates.main.block_on_findings",
      ),
    },

    release: {
      ...release,
      enabled: normalizeBoolean(release.enabled, true),
      block_on_failed_required_checks: normalizeBoolean(
        release.block_on_failed_required_checks,
        true,
      ),
      require_sbom: normalizeBoolean(release.require_sbom, true),
      require_attestations: normalizeBoolean(
        release.require_attestations,
        true,
      ),
      block_on_findings: normalizeGateSeverityRule(
        release.block_on_findings,
        "gates.release.block_on_findings",
      ),
    },

    staging_deploy: {
      ...stagingDeploy,
      enabled: normalizeBoolean(stagingDeploy.enabled, true),
      block_on_failed_required_checks: normalizeBoolean(
        stagingDeploy.block_on_failed_required_checks,
        true,
      ),
      block_on_findings: normalizeGateSeverityRule(
        stagingDeploy.block_on_findings,
        "gates.staging_deploy.block_on_findings",
      ),
    },

    production_deploy: {
      ...productionDeploy,
      enabled: normalizeBoolean(productionDeploy.enabled, true),
      require_release_tag: normalizeBoolean(
        productionDeploy.require_release_tag,
        true,
      ),
      require_environment_approval: normalizeBoolean(
        productionDeploy.require_environment_approval,
        true,
      ),
      require_sbom: normalizeBoolean(productionDeploy.require_sbom, true),
      require_attestations: normalizeBoolean(
        productionDeploy.require_attestations,
        true,
      ),
      block_on_failed_required_checks: normalizeBoolean(
        productionDeploy.block_on_failed_required_checks,
        true,
      ),
      block_on_findings: normalizeGateSeverityRule(
        productionDeploy.block_on_findings,
        "gates.production_deploy.block_on_findings",
      ),
    },
  };
}

function normalizeDependencyAutomation(dependencyAutomation) {
  dependencyAutomation = normalizeObject(
    dependencyAutomation,
    "dependency_automation",
  );

  const autoMerge = normalizeObject(
    dependencyAutomation.auto_merge,
    "dependency_automation.auto_merge",
  );

  const securityPatchAutoMerge = normalizeObject(
    dependencyAutomation.security_patch_auto_merge,
    "dependency_automation.security_patch_auto_merge",
  );

  const branchPatterns = normalizeStringList(
    dependencyAutomation.branch_patterns,
    "dependency_automation.branch_patterns",
  );

  validateRegexList(branchPatterns, "dependency_automation.branch_patterns");

  return {
    ...dependencyAutomation,

    enabled: normalizeBoolean(dependencyAutomation.enabled, true),

    authors: normalizeStringList(
      dependencyAutomation.authors,
      "dependency_automation.authors",
    ),
    branch_patterns: branchPatterns.length
      ? branchPatterns
      : DEFAULT_DEPENDENCY_BRANCH_PATTERNS,

    required_labels: normalizeStringList(
      dependencyAutomation.required_labels,
      "dependency_automation.required_labels",
    ),

    security_required_labels: normalizeStringList(
      dependencyAutomation.security_required_labels,
      "dependency_automation.security_required_labels",
    ),

    release_blocking_labels: normalizeStringList(
      dependencyAutomation.release_blocking_labels,
      "dependency_automation.release_blocking_labels",
    ),

    auto_merge: {
      ...autoMerge,
      enabled: normalizeBoolean(autoMerge.enabled, true),
      allow_patch: normalizeBoolean(autoMerge.allow_patch, true),
      allow_minor: normalizeBoolean(autoMerge.allow_minor, true),
      allow_major: normalizeBoolean(autoMerge.allow_major, false),
      require_all_security_checks: normalizeBoolean(
        autoMerge.require_all_security_checks,
        true,
      ),
      required_checks: normalizeStringList(
        autoMerge.required_checks,
        "dependency_automation.auto_merge.required_checks",
      ),
      required_absent_labels: normalizeStringList(
        autoMerge.required_absent_labels,
        "dependency_automation.auto_merge.required_absent_labels",
      ),
    },

    security_patch_auto_merge: {
      ...securityPatchAutoMerge,
      enabled: normalizeBoolean(securityPatchAutoMerge.enabled, true),
      require_all_security_checks: normalizeBoolean(
        securityPatchAutoMerge.require_all_security_checks,
        true,
      ),
      required_checks: normalizeStringList(
        securityPatchAutoMerge.required_checks,
        "dependency_automation.security_patch_auto_merge.required_checks",
      ),
      required_absent_labels: normalizeStringList(
        securityPatchAutoMerge.required_absent_labels,
        "dependency_automation.security_patch_auto_merge.required_absent_labels",
      ),
    },
  };
}

function normalizeIssueCreation(issueCreation) {
  issueCreation = normalizeObject(issueCreation, "issue_creation");

  const templates = normalizeObject(
    issueCreation.templates,
    "issue_creation.templates",
  );

  return {
    ...issueCreation,

    enabled: normalizeBoolean(issueCreation.enabled, true),
    use_openai_summary: normalizeBoolean(
      issueCreation.use_openai_summary,
      true,
    ),
    create_for_unpatchable_vulnerabilities: normalizeBoolean(
      issueCreation.create_for_unpatchable_vulnerabilities,
      true,
    ),
    create_for_failed_security_updates: normalizeBoolean(
      issueCreation.create_for_failed_security_updates,
      true,
    ),
    create_for_repeated_failures: normalizeBoolean(
      issueCreation.create_for_repeated_failures,
      true,
    ),
    repeated_failure_threshold: normalizeNumber(
      issueCreation.repeated_failure_threshold,
      3,
      "issue_creation.repeated_failure_threshold",
    ),

    default_assignees: normalizeStringList(
      issueCreation.default_assignees,
      "issue_creation.default_assignees",
    ),

    default_labels: normalizeStringList(
      issueCreation.default_labels,
      "issue_creation.default_labels",
    ),

    default_milestone: normalizeNullableString(
      issueCreation.default_milestone,
      "issue_creation.default_milestone",
    ),

    severity_labels: normalizeStringMap(
      issueCreation.severity_labels,
      "issue_creation.severity_labels",
    ),
    priority_labels: normalizeStringMap(
      issueCreation.priority_labels,
      "issue_creation.priority_labels",
    ),

    templates: Object.fromEntries(
      Object.entries(templates).map(([templateName, templateConfig]) => {
        if (!isPlainObject(templateConfig)) {
          throw new TypeError(
            `issue_creation.templates.${templateName} must be an object.`,
          );
        }

        return [
          templateName,
          {
            ...templateConfig,
            title: normalizeString(
              templateConfig.title,
              `issue_creation.templates.${templateName}.title`,
              { fallback: "[Security]: {summary}" },
            ),
            labels: normalizeStringList(
              templateConfig.labels,
              `issue_creation.templates.${templateName}.labels`,
            ),
            milestone: normalizeNullableString(
              templateConfig.milestone,
              `issue_creation.templates.${templateName}.milestone`,
            ),
          },
        ];
      }),
    ),
  };
}

function normalizeLabels(labels) {
  labels = normalizeObject(labels, "labels");

  return {
    ...labels,
    blocking: normalizeStringList(labels.blocking, "labels.blocking"),
    review_required: normalizeStringList(
      labels.review_required,
      "labels.review_required",
    ),
    dependency_security: normalizeStringList(
      labels.dependency_security,
      "labels.dependency_security",
    ),
    release_blocking: normalizeStringList(
      labels.release_blocking,
      "labels.release_blocking",
    ),
    auto_apply_by_finding_type: normalizeStringListMap(
      labels.auto_apply_by_finding_type,
      "labels.auto_apply_by_finding_type",
    ),
    auto_apply_by_tool: normalizeStringListMap(
      labels.auto_apply_by_tool,
      "labels.auto_apply_by_tool",
    ),
    auto_apply_by_severity: normalizeStringListMap(
      labels.auto_apply_by_severity,
      "labels.auto_apply_by_severity",
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
          enabled: normalizeBoolean(scheduleConfig.enabled, true),
          cron: normalizeNullableString(
            scheduleConfig.cron,
            `schedules.${scheduleName}.cron`,
          ),
          timezone: normalizeString(
            scheduleConfig.timezone,
            `schedules.${scheduleName}.timezone`,
            { fallback: "America/Boise" },
          ),
          description: normalizeNullableString(
            scheduleConfig.description,
            `schedules.${scheduleName}.description`,
          ),
        },
      ];
    }),
  );
}

function normalizeArtifacts(artifacts) {
  artifacts = normalizeObject(artifacts, "artifacts");

  const retentionDays = normalizeObject(
    artifacts.retention_days,
    "artifacts.retention_days",
  );

  return {
    ...artifacts,

    enabled: normalizeBoolean(artifacts.enabled, true),

    upload_security_reports: normalizeBoolean(
      artifacts.upload_security_reports,
      true,
    ),
    upload_sarif: normalizeBoolean(artifacts.upload_sarif, true),
    upload_dependency_reports: normalizeBoolean(
      artifacts.upload_dependency_reports,
      true,
    ),
    upload_container_reports: normalizeBoolean(
      artifacts.upload_container_reports,
      true,
    ),
    upload_license_reports: normalizeBoolean(
      artifacts.upload_license_reports,
      true,
    ),
    upload_policy_gate_summary: normalizeBoolean(
      artifacts.upload_policy_gate_summary,
      true,
    ),

    retention_days: Object.fromEntries(
      Object.entries(retentionDays).map(([key, value]) => [
        key,
        normalizeNumber(value, 30, `artifacts.retention_days.${key}`),
      ]),
    ),

    required_release_artifacts: normalizeStringList(
      artifacts.required_release_artifacts,
      "artifacts.required_release_artifacts",
    ),
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

    enabled: normalizeBoolean(reporting.enabled, true),
    add_workflow_summary: normalizeBoolean(
      reporting.add_workflow_summary,
      true,
    ),
    add_pr_comment_on_failure: normalizeBoolean(
      reporting.add_pr_comment_on_failure,
      true,
    ),
    add_pr_comment_on_warning: normalizeBoolean(
      reporting.add_pr_comment_on_warning,
      false,
    ),
    add_issue_comment_for_security_issue: normalizeBoolean(
      reporting.add_issue_comment_for_security_issue,
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

function normalizeRuntime(runtime) {
  runtime = normalizeObject(runtime, "runtime");

  const requiredSecrets = normalizeObject(
    runtime.required_secrets,
    "runtime.required_secrets",
  );
  const requiredVariables = normalizeObject(
    runtime.required_variables,
    "runtime.required_variables",
  );

  return {
    ...runtime,

    required_secrets: Object.fromEntries(
      Object.entries(requiredSecrets).map(([groupName, secrets]) => [
        groupName,
        normalizeStringList(secrets, `runtime.required_secrets.${groupName}`),
      ]),
    ),

    required_variables: Object.fromEntries(
      Object.entries(requiredVariables).map(([groupName, variables]) => [
        groupName,
        normalizeStringList(
          variables,
          `runtime.required_variables.${groupName}`,
        ),
      ]),
    ),

    recommended_variables: normalizeStringMap(
      runtime.recommended_variables,
      "runtime.recommended_variables",
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

    do_not_expose_secrets_to_pull_request_from_fork: normalizeBoolean(
      safety.do_not_expose_secrets_to_pull_request_from_fork,
      true,
    ),
    do_not_run_write_security_actions_on_untrusted_pr: normalizeBoolean(
      safety.do_not_run_write_security_actions_on_untrusted_pr,
      true,
    ),
    do_not_auto_close_security_issues: normalizeBoolean(
      safety.do_not_auto_close_security_issues,
      true,
    ),
    do_not_dismiss_security_findings: normalizeBoolean(
      safety.do_not_dismiss_security_findings,
      true,
    ),
    do_not_override_security_blockers: normalizeBoolean(
      safety.do_not_override_security_blockers,
      true,
    ),
    do_not_release_with_security_blockers: normalizeBoolean(
      safety.do_not_release_with_security_blockers,
      true,
    ),
    do_not_deploy_production_with_security_blockers: normalizeBoolean(
      safety.do_not_deploy_production_with_security_blockers,
      true,
    ),
    do_not_publish_sensitive_vulnerability_details: normalizeBoolean(
      safety.do_not_publish_sensitive_vulnerability_details,
      true,
    ),
    redact_secrets_in_logs: normalizeBoolean(
      safety.redact_secrets_in_logs,
      true,
    ),

    protected_labels: normalizeStringList(
      safety.protected_labels,
      "safety.protected_labels",
    ),
    secret_redaction_patterns: normalizeStringList(
      safety.secret_redaction_patterns,
      "safety.secret_redaction_patterns",
    ),
  };
}

function normalizeSecurityRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Security rules config must be a YAML object.");
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
    tooling: normalizeTooling(rawConfig.tooling),
    policy: normalizePolicy(rawConfig.policy),
    tools: normalizeTools(rawConfig.tools),
    codeql: normalizeCodeql(rawConfig.codeql),
    dependabot: normalizeDependabot(rawConfig.dependabot),
    dependency_review: normalizeDependencyReview(rawConfig.dependency_review),
    sonarqube: normalizeSonarqube(rawConfig.sonarqube),
    secret_scanning: normalizeSecretScanning(rawConfig.secret_scanning),
    pnpm_audit: normalizePnpmAudit(rawConfig.pnpm_audit),
    license_review: normalizeLicenseReview(rawConfig.license_review),
    container_scanning: normalizeContainerScanning(
      rawConfig.container_scanning,
    ),
    sbom: normalizeSbom(rawConfig.sbom),
    supply_chain: normalizeSupplyChain(rawConfig.supply_chain),
    required_checks: normalizeRequiredChecks(rawConfig.required_checks),
    gates: normalizeGates(rawConfig.gates),
    dependency_automation: normalizeDependencyAutomation({
      authors: DEFAULT_DEPENDENCY_AUTHORS,
      branch_patterns: DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
      required_labels: ["dependencies", "no-release"],
      security_required_labels: DEFAULT_DEPENDENCY_SECURITY_LABELS,
      release_blocking_labels: DEFAULT_RELEASE_BLOCKING_LABELS,
      ...rawConfig.dependency_automation,
    }),
    issue_creation: normalizeIssueCreation(rawConfig.issue_creation),
    labels: normalizeLabels({
      blocking: DEFAULT_BLOCKING_SECURITY_LABELS,
      review_required: DEFAULT_SECURITY_REVIEW_LABELS,
      dependency_security: DEFAULT_DEPENDENCY_SECURITY_LABELS,
      release_blocking: DEFAULT_RELEASE_BLOCKING_LABELS,
      ...rawConfig.labels,
    }),
    schedules: normalizeSchedules(rawConfig.schedules),
    artifacts: normalizeArtifacts(rawConfig.artifacts),
    reporting: normalizeReporting(rawConfig.reporting),
    runtime: normalizeRuntime(rawConfig.runtime),
    enforcement: normalizeEnforcement(rawConfig.enforcement),
    safety: normalizeSafety(rawConfig.safety),
  };
}

function validateSecurityRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Security rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  if (!config.tooling?.package_manager) {
    throw new TypeError("tooling.package_manager is required.");
  }

  if (config.tooling.package_manager !== "pnpm") {
    logger.warn(
      `Expected package manager "pnpm", received "${config.tooling.package_manager}".`,
    );
  }

  if (!Object.keys(config.tools || {}).length) {
    throw new TypeError("At least one security tool must be configured.");
  }

  if (config.policy.require_codeql && !config.tools.codeql?.enabled) {
    throw new TypeError(
      "CodeQL is required by policy but disabled in tools.codeql.",
    );
  }

  if (config.policy.require_sonarqube && !config.tools.sonarqube?.enabled) {
    throw new TypeError(
      "SonarQube is required by policy but disabled in tools.sonarqube.",
    );
  }

  if (config.policy.require_dependabot && !config.tools.dependabot?.enabled) {
    throw new TypeError(
      "Dependabot is required by policy but disabled in tools.dependabot.",
    );
  }

  if (
    config.policy.require_dependency_review &&
    !config.tools.dependency_review?.enabled
  ) {
    throw new TypeError(
      "Dependency Review is required by policy but disabled in tools.dependency_review.",
    );
  }

  if (!config.labels.blocking.includes("blocked-by-security")) {
    logger.warn("labels.blocking should include `blocked-by-security`.");
  }

  if (!config.labels.release_blocking.includes("no-release")) {
    logger.warn("labels.release_blocking should include `no-release`.");
  }

  if (!config.labels.release_blocking.includes("security:dependency")) {
    logger.warn(
      "labels.release_blocking should include `security:dependency`.",
    );
  }

  if (!config.dependency_automation.required_labels.includes("no-release")) {
    logger.warn(
      "dependency_automation.required_labels should include `no-release`.",
    );
  }

  if (!config.dependency_automation.required_labels.includes("dependencies")) {
    logger.warn(
      "dependency_automation.required_labels should include `dependencies`.",
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

function loadSecurityRulesConfig(options = {}) {
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
        `Security rules config not found at ${displayPath}. Returning default config.`,
      );

      return normalizeSecurityRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          tooling: {},
          policy: {},
          tools: DEFAULT_SECURITY_TOOLS,
          codeql: {},
          dependabot: {},
          dependency_review: {},
          sonarqube: {},
          secret_scanning: {},
          pnpm_audit: {},
          license_review: {},
          container_scanning: {},
          sbom: {},
          supply_chain: {},
          required_checks: {},
          gates: {},
          dependency_automation: {},
          issue_creation: {},
          labels: {},
          schedules: {},
          artifacts: {},
          reporting: {},
          runtime: {},
          enforcement: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Security rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeSecurityRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateSecurityRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded security rules config from ${displayPath}.`);
      logger.debug(
        `Security rules config contains ${
          Object.values(normalizedConfig.tools || {}).filter(
            (tool) => tool.enabled,
          ).length
        } enabled tools.`,
      );
      logger.dump("security rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load security rules config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function getDefaultBranch(config) {
  validateSecurityRulesConfig(config);
  return config.repository.default_branch || "main";
}

function isDefaultBranch(config, branchNameOrRef) {
  return normalizeBranchName(branchNameOrRef) === getDefaultBranch(config);
}

function getEnabledTools(config) {
  validateSecurityRulesConfig(config);

  return Object.entries(config.tools || {})
    .filter(([, tool]) => tool.enabled)
    .map(([name, tool]) => ({
      name,
      ...tool,
    }));
}

function getRequiredTools(config) {
  validateSecurityRulesConfig(config);

  return Object.entries(config.tools || {})
    .filter(([, tool]) => tool.enabled && tool.required)
    .map(([name, tool]) => ({
      name,
      ...tool,
    }));
}

function getTool(config, toolName) {
  validateSecurityRulesConfig(config);

  if (!toolName || typeof toolName !== "string") return null;

  return config.tools?.[toolName] || null;
}

function isToolEnabled(config, toolName) {
  return Boolean(getTool(config, toolName)?.enabled);
}

function isToolRequired(config, toolName) {
  return Boolean(getTool(config, toolName)?.required);
}

function getRequiredChecks(config, groupName = "pull_request") {
  validateSecurityRulesConfig(config);

  return config.required_checks?.[groupName] || [];
}

function getAllRequiredChecks(config) {
  validateSecurityRulesConfig(config);

  return unique(Object.values(config.required_checks || {}).flat());
}

function getFailedRequiredChecks(
  config,
  input = {},
  groupName = "pull_request",
) {
  const checks = normalizeObject(input.checks, "input.checks");
  const requiredChecks = getRequiredChecks(config, groupName);

  return requiredChecks.filter((checkName) => checks[checkName] !== "success");
}

function normalizeFinding(finding, index = 0) {
  if (!isPlainObject(finding)) {
    throw new TypeError(`findings[${index}] must be an object.`);
  }

  return {
    ...finding,
    id: normalizeNullableString(
      finding.id || finding.rule_id || finding.ruleId,
      `findings[${index}].id`,
    ),
    tool: normalizeString(
      finding.tool || finding.source,
      `findings[${index}].tool`,
      {
        fallback: "unknown",
      },
    ),
    severity: normalizeSeverity(
      finding.severity || finding.level || finding.impact,
    ),
    type: normalizeString(
      finding.type || finding.category,
      `findings[${index}].type`,
      {
        fallback: "security_finding",
      },
    ),
    package_name: normalizeNullableString(
      finding.package_name || finding.packageName || finding.package,
      `findings[${index}].package_name`,
    ),
    path: normalizeNullableString(
      finding.path || finding.file,
      `findings[${index}].path`,
    ),
    title: normalizeNullableString(
      finding.title || finding.summary,
      `findings[${index}].title`,
    ),
    message: normalizeNullableString(
      finding.message || finding.description,
      `findings[${index}].message`,
    ),
    url: normalizeNullableString(
      finding.url || finding.html_url,
      `findings[${index}].url`,
    ),
    fixed: normalizeBoolean(finding.fixed, false),
    dismissed: normalizeBoolean(finding.dismissed, false),
    false_positive: normalizeBoolean(
      finding.false_positive || finding.falsePositive,
      false,
    ),
  };
}

function normalizeFindings(findings = []) {
  if (!Array.isArray(findings)) {
    throw new TypeError("findings must be an array.");
  }

  return findings.map((finding, index) => normalizeFinding(finding, index));
}

function isFindingAllowed(config, finding) {
  const normalized = normalizeFinding(finding);

  if (normalized.dismissed || normalized.false_positive) return true;

  if (normalized.tool === "dependency_review") {
    if (config.dependency_review.allow_ghsas.includes(normalized.id)) {
      return true;
    }
  }

  if (normalized.tool === "pnpm_audit") {
    if (config.pnpm_audit.ignore_advisories.includes(normalized.id)) {
      return true;
    }
  }

  if (normalized.path) {
    if (
      matchesAnyGlob(config.secret_scanning.allowlist_paths, normalized.path)
    ) {
      return true;
    }
  }

  return false;
}

function findingMatchesGateSeverityRule(rule, finding, mode = "block") {
  const normalized = normalizeFinding(finding);
  const severities = rule?.[mode] || [];

  if (!severities.length) return false;

  return severities
    .map((severity) => normalizeSeverity(severity))
    .includes(normalized.severity);
}

function getBlockingFindingsForGate(
  config,
  findings = [],
  gateName = "pull_request",
) {
  validateSecurityRulesConfig(config);

  const gate = config.gates?.[gateName];

  if (!gate?.enabled) return [];

  const rule = gate.block_on_findings || {};
  const normalizedFindings = normalizeFindings(findings);

  return normalizedFindings.filter((finding) => {
    if (isFindingAllowed(config, finding)) return false;
    return findingMatchesGateSeverityRule(rule, finding, "block");
  });
}

function getWarningFindingsForGate(
  config,
  findings = [],
  gateName = "pull_request",
) {
  validateSecurityRulesConfig(config);

  const gate = config.gates?.[gateName];

  if (!gate?.enabled) return [];

  const rule = gate.block_on_findings || {};
  const normalizedFindings = normalizeFindings(findings);

  return normalizedFindings.filter((finding) => {
    if (isFindingAllowed(config, finding)) return false;
    return findingMatchesGateSeverityRule(rule, finding, "warn");
  });
}

function getLabelsForFinding(config, finding) {
  validateSecurityRulesConfig(config);

  const normalized = normalizeFinding(finding);

  return unique([
    ...(config.labels.auto_apply_by_finding_type?.[normalized.type] || []),
    ...(config.labels.auto_apply_by_tool?.[normalized.tool] || []),
    ...(config.labels.auto_apply_by_severity?.[normalized.severity] || []),
  ]);
}

function getLabelsForFindings(config, findings = []) {
  return unique(
    normalizeFindings(findings).flatMap((finding) =>
      getLabelsForFinding(config, finding),
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

function getBlockingLabels(config, labels = []) {
  validateSecurityRulesConfig(config);

  const normalizedLabels = normalizeStringList(labels, "labels");

  return normalizedLabels.filter((label) =>
    config.labels.blocking.includes(label),
  );
}

function getReleaseBlockingLabels(config, labels = []) {
  validateSecurityRulesConfig(config);

  const normalizedLabels = normalizeStringList(labels, "labels");

  return normalizedLabels.filter((label) =>
    config.labels.release_blocking.includes(label),
  );
}

function isDependencyAuthor(config, author) {
  if (!author || typeof author !== "string") return false;

  return config.dependency_automation.authors.includes(author.trim());
}

function isDependencyBranch(config, branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  if (!branchName) return false;

  return matchesAnyRegex(
    config.dependency_automation.branch_patterns,
    branchName,
  );
}

function isDependencyPullRequest(config, input = {}) {
  return (
    isDependencyAuthor(config, input.author || input.actor || "") ||
    isDependencyBranch(
      config,
      input.branch || input.head_branch || input.headBranch || "",
    )
  );
}

function isSecurityDependencyPullRequest(config, input = {}) {
  const labels = normalizeStringList(input.labels, "input.labels");
  return (
    isDependencyPullRequest(config, input) &&
    labels.includes("security:dependency")
  );
}

function getMissingDependencySecurityLabels(config, labels = [], input = {}) {
  const normalizedLabels = normalizeStringList(labels, "labels");

  if (!isDependencyPullRequest(config, input)) return [];

  const required = isSecurityDependencyPullRequest(config, {
    ...input,
    labels: normalizedLabels,
  })
    ? config.dependency_automation.security_required_labels
    : config.dependency_automation.required_labels;

  return required.filter((label) => !normalizedLabels.includes(label));
}

function getDockerfileChanges(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");

  return files.filter((file) => {
    if (matchesAnyGlob(config.container_scanning.ignore_paths, file))
      return false;
    return matchesAnyGlob(config.container_scanning.dockerfile_patterns, file);
  });
}

function hasDockerfileChanges(config, changedFiles = []) {
  return getDockerfileChanges(config, changedFiles).length > 0;
}

function getSecurityGateBlockers(
  config,
  input = {},
  gateName = "pull_request",
) {
  validateSecurityRulesConfig(config);

  const labels = normalizeStringList(input.labels, "input.labels");
  const findings = normalizeFindings(input.findings || []);
  const checks = normalizeObject(input.checks, "input.checks");
  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
    "input.changed_files",
  );

  const gate = config.gates?.[gateName];
  const blockers = [];

  if (!gate?.enabled) {
    return blockers;
  }

  const blockingLabels = getBlockingLabels(config, labels);

  for (const label of blockingLabels) {
    blockers.push({
      type: "label",
      value: label,
      reason: `Security-blocking label is present: ${label}`,
    });
  }

  if (gate.block_on_failed_required_checks) {
    for (const checkName of getFailedRequiredChecks(
      config,
      { checks },
      gateName,
    )) {
      blockers.push({
        type: "check",
        value: checkName,
        reason: `Required security check has not passed: ${checkName}`,
      });
    }
  }

  for (const finding of getBlockingFindingsForGate(
    config,
    findings,
    gateName,
  )) {
    blockers.push({
      type: "finding",
      finding,
      reason: `Blocking ${finding.severity} finding from ${finding.tool}.`,
    });
  }

  if (
    gateName === "pull_request" &&
    config.policy.require_container_scanning_for_dockerfiles &&
    hasDockerfileChanges(config, changedFiles)
  ) {
    const failedContainerChecks = getFailedRequiredChecks(
      config,
      { checks },
      "container_scanning",
    );

    for (const checkName of failedContainerChecks) {
      blockers.push({
        type: "container_scanning",
        value: checkName,
        reason: `Dockerfile changes require successful container scanning: ${checkName}`,
      });
    }
  }

  return blockers;
}

function getSecurityGateWarnings(
  config,
  input = {},
  gateName = "pull_request",
) {
  validateSecurityRulesConfig(config);

  const findings = normalizeFindings(input.findings || []);
  const warnings = [];

  for (const finding of getWarningFindingsForGate(config, findings, gateName)) {
    warnings.push({
      type: "finding",
      finding,
      reason: `Warning-level ${finding.severity} finding from ${finding.tool}.`,
    });
  }

  return warnings;
}

function evaluateSecurityGate(config, input = {}, gateName = "pull_request") {
  const blockers = getSecurityGateBlockers(config, input, gateName);
  const warnings = getSecurityGateWarnings(config, input, gateName);

  return {
    passed: blockers.length === 0,
    gate: gateName,
    blockers,
    warnings,
  };
}

function evaluatePullRequestSecurity(config, input = {}) {
  validateSecurityRulesConfig(config);

  const labels = normalizeStringList(input.labels, "input.labels");
  const missingDependencyLabels = getMissingDependencySecurityLabels(
    config,
    labels,
    input,
  );

  const gate = evaluateSecurityGate(config, input, "pull_request");
  const blockers = [...gate.blockers];

  for (const label of missingDependencyLabels) {
    blockers.push({
      type: "missing_dependency_label",
      value: label,
      reason: `Dependency pull request is missing required security label: ${label}`,
    });
  }

  return {
    passed: blockers.length === 0,
    gate: "pull_request",
    is_dependency_pr: isDependencyPullRequest(config, input),
    is_security_dependency_pr: isSecurityDependencyPullRequest(config, input),
    missing_dependency_labels: missingDependencyLabels,
    suggested_labels: unique([
      ...getLabelsForFindings(config, input.findings || []),
      ...missingDependencyLabels,
    ]),
    blockers,
    warnings: gate.warnings,
  };
}

function evaluateMainSecurity(config, input = {}) {
  return evaluateSecurityGate(config, input, "main");
}

function evaluateReleaseSecurity(config, input = {}) {
  validateSecurityRulesConfig(config);

  const gate = evaluateSecurityGate(config, input, "release");
  const labels = normalizeStringList(input.labels, "input.labels");
  const artifacts = normalizeStringList(
    input.artifacts || input.artifact_names,
    "input.artifacts",
  );
  const blockers = [...gate.blockers];

  for (const label of getReleaseBlockingLabels(config, labels)) {
    blockers.push({
      type: "release_blocking_label",
      value: label,
      reason: `Security release-blocking label is present: ${label}`,
    });
  }

  if (config.gates.release.require_sbom && config.sbom.required_on_release) {
    if (!artifacts.includes(config.sbom.artifact_name)) {
      blockers.push({
        type: "sbom",
        value: config.sbom.artifact_name,
        reason: "Release requires an SPDX JSON SBOM artifact.",
      });
    }
  }

  if (
    config.gates.release.require_attestations &&
    !normalizeBoolean(input.attestations_created, false)
  ) {
    blockers.push({
      type: "attestations",
      reason: "Release requires security attestations.",
    });
  }

  return {
    passed: blockers.length === 0,
    gate: "release",
    blockers,
    warnings: gate.warnings,
  };
}

function evaluateDeploymentSecurity(
  config,
  input = {},
  environment = "staging",
) {
  validateSecurityRulesConfig(config);

  const gateName =
    environment === "production" ? "production_deploy" : "staging_deploy";
  const gate = evaluateSecurityGate(config, input, gateName);
  const blockers = [...gate.blockers];
  const ref = normalizeString(input.ref || "", "input.ref");
  const tag = normalizeTagName(ref);

  if (gateName === "production_deploy") {
    if (
      config.gates.production_deploy.require_release_tag &&
      !/^V[0-9]+\.[0-9]+\.[0-9]+$/.test(tag)
    ) {
      blockers.push({
        type: "release_tag",
        value: ref,
        reason:
          "Production deployment requires a V-prefixed semantic release tag.",
      });
    }

    if (
      config.gates.production_deploy.require_attestations &&
      !normalizeBoolean(input.attestations_created, false)
    ) {
      blockers.push({
        type: "attestations",
        reason: "Production deployment requires release attestations.",
      });
    }

    if (
      config.gates.production_deploy.require_sbom &&
      !normalizeBoolean(input.sbom_created, false)
    ) {
      blockers.push({
        type: "sbom",
        reason: "Production deployment requires an SBOM.",
      });
    }
  }

  return {
    passed: blockers.length === 0,
    gate: gateName,
    environment,
    blockers,
    warnings: gate.warnings,
  };
}

function updateTypeAllowedForDependencyAutoMerge(config, updateType) {
  const normalized = normalizeString(updateType, "updateType");

  if (normalized === "patch")
    return config.dependency_automation.auto_merge.allow_patch;
  if (normalized === "minor")
    return config.dependency_automation.auto_merge.allow_minor;
  if (normalized === "major")
    return config.dependency_automation.auto_merge.allow_major;

  return false;
}

function getDependencyAutoMergeBlockers(config, input = {}) {
  validateSecurityRulesConfig(config);

  const labels = normalizeStringList(input.labels, "input.labels");
  const checks = normalizeObject(input.checks, "input.checks");
  const updateType = normalizeNullableString(
    input.update_type || input.updateType,
    "input.update_type",
  );
  const securityEvaluation = evaluatePullRequestSecurity(config, input);
  const isSecurityPatch = isSecurityDependencyPullRequest(config, input);
  const rules = isSecurityPatch
    ? config.dependency_automation.security_patch_auto_merge
    : config.dependency_automation.auto_merge;

  const blockers = [];

  if (!rules.enabled) {
    blockers.push({
      type: "policy",
      reason: "Dependency auto-merge is disabled by security policy.",
    });
  }

  if (!isDependencyPullRequest(config, input)) {
    blockers.push({
      type: "source",
      reason: "Pull request is not a recognized dependency automation PR.",
    });
  }

  if (
    !isSecurityPatch &&
    updateType &&
    !updateTypeAllowedForDependencyAutoMerge(config, updateType)
  ) {
    blockers.push({
      type: "update_type",
      value: updateType,
      reason: `Dependency update type is not allowed for auto-merge: ${updateType}`,
    });
  }

  for (const label of rules.required_absent_labels || []) {
    if (labels.includes(label)) {
      blockers.push({
        type: "label",
        value: label,
        reason: `Label blocks dependency auto-merge: ${label}`,
      });
    }
  }

  for (const checkName of rules.required_checks || []) {
    if (checks[checkName] !== "success") {
      blockers.push({
        type: "check",
        value: checkName,
        reason: `Required dependency security check has not passed: ${checkName}`,
      });
    }
  }

  if (rules.require_all_security_checks && !securityEvaluation.passed) {
    blockers.push({
      type: "security_gate",
      reason: "Security gate has not passed for dependency auto-merge.",
      blockers: securityEvaluation.blockers,
    });
  }

  return blockers;
}

function evaluateDependencyAutoMergeSecurity(config, input = {}) {
  const blockers = getDependencyAutoMergeBlockers(config, input);

  return {
    eligible: blockers.length === 0,
    blockers,
  };
}

function shouldCreateSecurityIssue(config, reason) {
  validateSecurityRulesConfig(config);

  if (!config.issue_creation.enabled) return false;

  if (reason === "unpatchable_vulnerability") {
    return config.issue_creation.create_for_unpatchable_vulnerabilities;
  }

  if (reason === "failed_security_update") {
    return config.issue_creation.create_for_failed_security_updates;
  }

  if (reason === "repeated_failure") {
    return config.issue_creation.create_for_repeated_failures;
  }

  return false;
}

function getSecurityIssueDefaults(config, input = {}) {
  validateSecurityRulesConfig(config);

  const severity = normalizeSeverity(input.severity || "unknown");
  const templateName = normalizeString(
    input.template || "default",
    "input.template",
  );
  const template = config.issue_creation.templates?.[templateName] || {};

  return {
    assignees: config.issue_creation.default_assignees || [],
    labels: unique(
      [
        ...(config.issue_creation.default_labels || []),
        ...(template.labels || []),
        config.issue_creation.severity_labels?.[severity],
        config.issue_creation.priority_labels?.[severity],
      ].filter(Boolean),
    ),
    milestone:
      template.milestone || config.issue_creation.default_milestone || null,
    title_template: template.title || "[Security]: {summary}",
  };
}

function validateRuntimeConfiguration(
  config,
  groupName = "security",
  env = process.env,
) {
  validateSecurityRulesConfig(config);

  const requiredSecrets = config.runtime.required_secrets?.[groupName] || [];
  const requiredVariables =
    config.runtime.required_variables?.[groupName] || [];

  const missing = {
    secrets: requiredSecrets.filter((secret) => !env[secret]),
    variables: requiredVariables.filter((variable) => !env[variable]),
  };

  return {
    valid: missing.secrets.length === 0 && missing.variables.length === 0,
    missing,
  };
}

function redactSecrets(config, text) {
  if (!text || typeof text !== "string") return "";

  let redacted = text;

  for (const pattern of config.safety.secret_redaction_patterns || []) {
    try {
      redacted = redacted.replace(new RegExp(pattern, "g"), "[REDACTED]");
    } catch {
      logger.warn(`Invalid secret redaction pattern ignored: ${pattern}`);
    }
  }

  return redacted;
}

function summarizeFindings(findings = []) {
  const normalizedFindings = normalizeFindings(findings);
  const counts = {};

  for (const severity of DEFAULT_SEVERITY_ORDER) {
    counts[severity] = 0;
  }

  for (const finding of normalizedFindings) {
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  }

  return counts;
}

function summarizeSecurityGate(evaluation) {
  const lines = [
    `Gate: ${evaluation.gate}`,
    `Passed: ${evaluation.passed ? "yes" : "no"}`,
    `Blockers: ${evaluation.blockers.length}`,
    `Warnings: ${evaluation.warnings.length}`,
  ];

  if (evaluation.blockers.length) {
    lines.push("");
    lines.push("Blockers:");

    for (const blocker of evaluation.blockers) {
      lines.push(`- ${blocker.reason}`);
    }
  }

  if (evaluation.warnings.length) {
    lines.push("");
    lines.push("Warnings:");

    for (const warning of evaluation.warnings) {
      lines.push(`- ${warning.reason}`);
    }
  }

  return lines.join("\n");
}

function summarizeSecurityRulesConfig(config) {
  validateSecurityRulesConfig(config);

  return [
    `Repository: ${config.repository.full_name}`,
    `Default branch: ${config.repository.default_branch}`,
    `Strict mode: ${config.policy.strict ? "yes" : "no"}`,
    `Enabled tools: ${getEnabledTools(config)
      .map((tool) => tool.name)
      .join(", ")}`,
    `Required tools: ${
      getRequiredTools(config)
        .map((tool) => tool.name)
        .join(", ") || "none"
    }`,
    `Pull request checks: ${getRequiredChecks(config, "pull_request").join(", ") || "none"}`,
    `Release checks: ${getRequiredChecks(config, "release").join(", ") || "none"}`,
    `Production deploy checks: ${getRequiredChecks(config, "production_deploy").join(", ") || "none"}`,
  ].join("\n");
}

function assertSecurityGatePassed(
  config,
  input = {},
  gateName = "pull_request",
) {
  const evaluation = evaluateSecurityGate(config, input, gateName);

  if (!evaluation.passed) {
    throw new Error(summarizeSecurityGate(evaluation));
  }

  return true;
}

function assertReleaseSecurityPassed(config, input = {}) {
  const evaluation = evaluateReleaseSecurity(config, input);

  if (!evaluation.passed) {
    throw new Error(summarizeSecurityGate(evaluation));
  }

  return true;
}

function assertDeploymentSecurityPassed(
  config,
  input = {},
  environment = "staging",
) {
  const evaluation = evaluateDeploymentSecurity(config, input, environment);

  if (!evaluation.passed) {
    throw new Error(summarizeSecurityGate(evaluation));
  }

  return true;
}

if (require.main === module) {
  try {
    const config = loadSecurityRulesConfig();

    logger.info("Security rules config validation passed.");
    logger.info(`\n${summarizeSecurityRulesConfig(config)}`);
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_SEVERITY_ORDER,
  DEFAULT_BLOCKING_SECURITY_LABELS,
  DEFAULT_SECURITY_REVIEW_LABELS,
  DEFAULT_DEPENDENCY_SECURITY_LABELS,
  DEFAULT_DEPENDENCY_AUTHORS,
  DEFAULT_DEPENDENCY_BRANCH_PATTERNS,
  DEFAULT_RELEASE_BLOCKING_LABELS,
  DEFAULT_SECURITY_TOOLS,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadSecurityRulesConfig,
  normalizeSecurityRulesConfig,
  validateSecurityRulesConfig,

  normalizeBranchName,
  normalizeTagName,
  normalizeSeverity,
  severityRank,
  severityAtLeast,

  getDefaultBranch,
  isDefaultBranch,

  getEnabledTools,
  getRequiredTools,
  getTool,
  isToolEnabled,
  isToolRequired,

  getRequiredChecks,
  getAllRequiredChecks,
  getFailedRequiredChecks,

  normalizeFinding,
  normalizeFindings,
  isFindingAllowed,
  getBlockingFindingsForGate,
  getWarningFindingsForGate,
  getLabelsForFinding,
  getLabelsForFindings,
  summarizeFindings,

  hasAnyLabel,
  hasAllLabels,
  getBlockingLabels,
  getReleaseBlockingLabels,

  isDependencyAuthor,
  isDependencyBranch,
  isDependencyPullRequest,
  isSecurityDependencyPullRequest,
  getMissingDependencySecurityLabels,

  getDockerfileChanges,
  hasDockerfileChanges,

  getSecurityGateBlockers,
  getSecurityGateWarnings,
  evaluateSecurityGate,
  evaluatePullRequestSecurity,
  evaluateMainSecurity,
  evaluateReleaseSecurity,
  evaluateDeploymentSecurity,

  updateTypeAllowedForDependencyAutoMerge,
  getDependencyAutoMergeBlockers,
  evaluateDependencyAutoMergeSecurity,

  shouldCreateSecurityIssue,
  getSecurityIssueDefaults,

  validateRuntimeConfiguration,
  redactSecrets,

  summarizeSecurityGate,
  summarizeSecurityRulesConfig,

  assertSecurityGatePassed,
  assertReleaseSecurityPassed,
  assertDeploymentSecurityPassed,
};
