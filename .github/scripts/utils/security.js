// .github/scripts/utils/security.js
// =============================================================================
// Aerealith AI Security Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared security helpers for GitHub workflow automation scripts.
//
// Used by:
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/security/summarize-security.js
//   - .github/scripts/security/create-security-issues.js
//   - .github/scripts/security/summarize-dependencies.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//
// Notes:
//   - Security is strict by default.
//   - Pull requests, main, release, and production deploys can all be gated.
//   - Dependency automation must never create releases.
//   - Attestations are release/publish evidence only and are not created here.
//   - Secrets are referenced by name only.
//   - Safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const yaml = require("js-yaml");

const logger = require("./logger");

const DEFAULT_SECURITY_RULES_FILE =
  ".github/repo-management/security-rules.yaml";
const DEFAULT_RELEASE_RULES_FILE = ".github/repo-management/release-rules.yaml";
const DEFAULT_DEPENDENCY_RULES_FILE =
  ".github/repo-management/dependency-rules.yaml";

const DEFAULT_OUTPUT_DIR = "artifacts/security";
const DEFAULT_SECURITY_REPORT_FILE = "artifacts/security/security-report.json";
const DEFAULT_SECURITY_GATE_FILE = "artifacts/security/security-gate.json";
const DEFAULT_SECURITY_SUMMARY_FILE = "artifacts/security/security-summary.md";

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "nx.json",
  "package.json",
];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SEVERITY_ORDER = {
  unknown: 0,
  note: 1,
  info: 1,
  informational: 1,
  low: 2,
  warning: 2,
  moderate: 3,
  medium: 3,
  high: 4,
  critical: 5,
};

const NORMALIZED_SEVERITIES = {
  error: "high",
  warning: "medium",
  note: "low",
  none: "unknown",
  informational: "low",
  info: "low",
  low: "low",
  moderate: "medium",
  medium: "medium",
  high: "high",
  critical: "critical",
};

const DEFAULT_STRICT_POLICY = {
  enabled: true,
  strict: true,
  fail_on_unknown_security_state: true,
  fail_on_missing_security_report: true,
  block_on_failed_required_checks: true,
  block_release_on_security_failure: true,
  block_deploy_on_security_failure: true,
  block_merge_on_security_failure: true,
  dependency_prs_must_be_no_release: true,
  dependency_security_prs_must_be_no_release: true,
  block_dependency_releases: true,
  block_openai_automation_releases: false,
  fail_on_severities: ["critical", "high"],
  warn_on_severities: ["medium", "moderate", "low", "warning", "unknown"],
  allowed_severities: ["note", "info"],
};

const DEFAULT_REQUIRED_CHECKS = {
  pull_request: [
    "CI",
    "CodeQL",
    "Dependency Review",
    "SonarQube",
    "Security Policy Gate",
  ],
  main: ["CI", "CodeQL", "SonarQube", "Security Policy Gate"],
  release: [
    "CI",
    "CodeQL",
    "Dependency Review",
    "SonarQube",
    "Security Policy Gate",
    "Release Evidence",
  ],
  staging_deploy: ["CI", "Security Policy Gate", "Cloudflare Deployment Gate"],
  production_deploy: [
    "CI",
    "CodeQL",
    "SonarQube",
    "Security Policy Gate",
    "Release Evidence",
    "Cloudflare Deployment Gate",
  ],
  dependency_auto_merge: ["CI", "Dependency Review", "Security Policy Gate"],
};

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
  trivy: true,
  grype: false,
  semgrep: false,
  osv_scanner: true,
};

const DEFAULT_SECURITY_LABELS = {
  blocking: ["security:blocking"],
  review_required: ["security:review-required"],
  dependency_security: ["security:dependency"],
  release_blocking: ["release:blocked", "security:blocking"],
  no_release: ["no-release"],
  by_severity: {
    critical: ["priority:critical", "security:critical"],
    high: ["priority:high", "security:high"],
    medium: ["priority:medium", "security:medium"],
    low: ["priority:low", "security:low"],
    unknown: ["security:unknown"],
  },
  by_tool: {
    codeql: ["security:codeql"],
    dependabot: ["security:dependabot"],
    dependency_review: ["security:dependency-review"],
    sonarqube: ["security:sonarqube"],
    secret_scanning: ["security:secrets"],
    pnpm_audit: ["security:pnpm-audit"],
    container_scanning: ["security:container"],
    license_review: ["security:license"],
    sbom: ["security:sbom"],
    scorecard: ["security:scorecard"],
    trivy: ["security:trivy"],
    osv_scanner: ["security:osv"],
  },
};

const DEPENDENCY_AUTHORS = ["dependabot[bot]", "renovate[bot]", "mend[bot]"];

const DEPENDENCY_BRANCH_PATTERNS = [
  /^dependabot\/.+$/,
  /^renovate\/.+$/,
  /^mend\/.+$/,
];

const OPENAI_BRANCH_PATTERNS = [
  /^openai\/.+$/,
  /^ai\/.+$/,
  /^automation\/openai-.+$/,
];

const RELEASE_LABELS = ["release:major", "release:minor", "release:patch"];

const NO_RELEASE_LABEL = "no-release";

const SECURITY_REPORT_TYPES = {
  sarif: "sarif",
  pnpm_audit: "pnpm-audit",
  trivy: "trivy",
  grype: "grype",
  osv: "osv",
  sonarqube: "sonarqube",
  dependency_review: "dependency-review",
  scorecard: "scorecard",
  license_review: "license-review",
  secret_scan: "secret-scan",
  generic: "generic",
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [String(value).trim()].filter(Boolean);
  }

  return unique(value.map((item) => String(item).trim()).filter(Boolean));
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

function normalizeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBranchName(branchNameOrRef) {
  return normalizeString(branchNameOrRef)
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  return normalizeString(refOrTag)
    .replace(/^refs\/tags\//, "")
    .trim();
}

function normalizeSeverity(severity = "unknown") {
  const normalized = normalizeString(severity, "unknown").toLowerCase();

  return NORMALIZED_SEVERITIES[normalized] || normalized;
}

function severityRank(severity = "unknown") {
  return SEVERITY_ORDER[normalizeSeverity(severity)] ?? SEVERITY_ORDER.unknown;
}

function severityAtLeast(severity, threshold) {
  return severityRank(severity) >= severityRank(threshold);
}

function maxSeverity(severities = []) {
  const normalized = normalizeStringList(severities).map((severity) =>
    normalizeSeverity(severity),
  );

  if (!normalized.length) return "unknown";

  return normalized.sort(
    (left, right) => severityRank(right) - severityRank(left),
  )[0];
}

function sortFindingsBySeverity(findings = []) {
  return [...findings].sort((left, right) => {
    const severityDiff =
      severityRank(right.severity) - severityRank(left.severity);

    if (severityDiff !== 0) return severityDiff;

    return String(left.title || left.id || "").localeCompare(
      String(right.title || right.id || ""),
    );
  });
}

function getDryRun(options = {}) {
  return normalizeBoolean(
    options.dryRun ??
      options.dry_run ??
      process.env.DRY_RUN ??
      process.env.PROJECT_SYNC_DRY_RUN,
    logger.DRY_RUN,
  );
}

function allowLocalFileWrites(options = {}) {
  return normalizeBoolean(
    options.allowLocalFileWrites ?? options.allow_local_file_writes,
    true,
  );
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectDeep(value[key])]),
  );
}

function stableStringify(value, space = 2) {
  return JSON.stringify(sortObjectDeep(value), null, space);
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
  options = {},
) {
  const markers = normalizeStringList(
    options.markers || DEFAULT_REPO_ROOT_MARKERS,
  );
  const candidates = unique([
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ]);

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath = ".", repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);

  return path.normalize(path.join(repoRoot, filePath));
}

function toPosixPath(filePath) {
  return normalizeString(filePath).split(path.sep).join("/");
}

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot)));
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function isFile(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isDirectory();
}

function ensureDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (isDirectory(dirPath)) return dirPath;

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  logger.debug(`Ensured directory exists: ${dirPath}`);

  return dirPath;
}

function ensureParentDir(filePath, options = {}) {
  return ensureDir(path.dirname(filePath), options);
}

function readTextFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(
      `File not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function writeFile(filePath, contents, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);
  const dryRun = getDryRun(options);

  ensureParentDir(absolutePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(
      `Would write file: ${toRelativePath(absolutePath, repoRoot)}`,
    );
    logger.dump(`planned ${path.basename(absolutePath)}`, contents);

    return {
      written: false,
      path: toRelativePath(absolutePath, repoRoot),
      dry_run: true,
    };
  }

  fs.writeFileSync(absolutePath, contents);

  logger.info(`Wrote ${toRelativePath(absolutePath, repoRoot)}.`);

  return {
    written: true,
    path: toRelativePath(absolutePath, repoRoot),
    dry_run: dryRun,
  };
}

function writeJson(filePath, value, options = {}) {
  return writeFile(filePath, `${stableStringify(value)}\n`, options);
}

function writeMarkdown(filePath, value, options = {}) {
  return writeFile(filePath, `${String(value).trim()}\n`, options);
}

function readJson(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `JSON file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
}

function readYaml(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `YAML file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    return (
      yaml.load(fs.readFileSync(absolutePath, "utf8")) ??
      options.fallback ??
      null
    );
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
}

function loadSecurityRules(
  filePath = DEFAULT_SECURITY_RULES_FILE,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const loaded =
    readYaml(filePath, {
      ...options,
      repoRoot,
      required: false,
      fallback: {},
    }) || {};

  return normalizeSecurityRules(loaded);
}

function normalizeSecurityRules(rules = {}) {
  return {
    version: rules.version || 1,
    repository: {
      owner: "SinLess-Games",
      name: "Aerealith-AI",
      default_branch: "main",
      ...(rules.repository || {}),
    },
    policy: {
      ...DEFAULT_STRICT_POLICY,
      ...(rules.policy || {}),
    },
    tools: {
      ...DEFAULT_SECURITY_TOOLS,
      ...(rules.tools || {}),
    },
    required_checks: {
      ...DEFAULT_REQUIRED_CHECKS,
      ...(rules.required_checks || {}),
    },
    labels: {
      ...DEFAULT_SECURITY_LABELS,
      ...(rules.labels || {}),
      by_severity: {
        ...DEFAULT_SECURITY_LABELS.by_severity,
        ...(rules.labels?.by_severity || {}),
        ...(rules.labels?.auto_apply_by_severity || {}),
      },
      by_tool: {
        ...DEFAULT_SECURITY_LABELS.by_tool,
        ...(rules.labels?.by_tool || {}),
        ...(rules.labels?.auto_apply_by_tool || {}),
      },
    },
    allowlists: {
      advisories: normalizeStringList(
        rules.allowlists?.advisories || rules.dependency_review?.allow_ghsas,
      ),
      packages: normalizeStringList(rules.allowlists?.packages),
      paths: normalizeStringList(rules.allowlists?.paths),
      rules: normalizeStringList(rules.allowlists?.rules),
      licenses: normalizeStringList(
        rules.allowlists?.licenses || rules.license_review?.allowed,
      ),
    },
    gates: rules.gates || {},
    artifacts: rules.artifacts || {},
    reporting: rules.reporting || {},
    runtime: rules.runtime || {},
    enforcement: rules.enforcement || {},
    safety: rules.safety || {},
    raw: rules,
  };
}

function normalizeToolConfig(toolConfig, fallbackEnabled = true) {
  if (typeof toolConfig === "boolean") {
    return {
      enabled: toolConfig,
      required: fallbackEnabled,
      labels: [],
      check_names: [],
      report_artifacts: [],
    };
  }

  if (!isPlainObject(toolConfig)) {
    return {
      enabled: fallbackEnabled,
      required: fallbackEnabled,
      labels: [],
      check_names: [],
      report_artifacts: [],
    };
  }

  return {
    enabled: toolConfig.enabled !== false,
    required: Boolean(toolConfig.required),
    labels: normalizeStringList(toolConfig.labels),
    check_names: normalizeStringList(
      toolConfig.check_names || toolConfig.checkNames,
    ),
    report_artifacts: normalizeStringList(
      toolConfig.report_artifacts || toolConfig.reportArtifacts,
    ),
    ...toolConfig,
  };
}

function createFinding(input = {}) {
  const tool = normalizeString(input.tool, "unknown");
  const severity = normalizeSeverity(
    input.severity || input.level || input.impact || "unknown",
  );

  const id = normalizeString(
    input.id ||
      input.rule_id ||
      input.ruleId ||
      input.cve ||
      input.ghsa ||
      input.advisory_id ||
      input.title,
    `${tool}:${severity}:${Date.now()}`,
  );

  return {
    id,
    tool,
    type: normalizeString(input.type, "security"),
    severity,
    title: normalizeString(input.title || input.message || input.summary, id),
    message: normalizeString(
      input.message || input.description || input.summary || input.title,
      "",
    ),
    package: normalizeString(
      input.package || input.package_name || input.module_name,
      "",
    ),
    version: normalizeString(input.version || input.installed_version, ""),
    fixed_version: normalizeString(
      input.fixed_version || input.fixedVersion || input.fixed_in,
      "",
    ),
    cve: normalizeString(input.cve || input.cve_id, ""),
    ghsa: normalizeString(input.ghsa || input.ghsa_id || input.advisory_id, ""),
    cwe: normalizeString(input.cwe || input.cwe_id, ""),
    rule_id: normalizeString(input.rule_id || input.ruleId || input.rule, id),
    path: normalizeString(input.path || input.file || input.uri, ""),
    line: input.line || input.start_line || input.startLine || null,
    column: input.column || input.start_column || input.startColumn || null,
    url: normalizeString(
      input.url || input.html_url || input.help_uri || input.helpUri,
      "",
    ),
    fingerprint: normalizeString(
      input.fingerprint ||
        input.partial_fingerprint ||
        input.partialFingerprint,
      "",
    ),
    suppressible: Boolean(input.suppressible),
    raw: input.raw || null,
  };
}

function findingKey(finding) {
  return [
    finding.tool,
    finding.id,
    finding.rule_id,
    finding.package,
    finding.version,
    finding.path,
    finding.line || "",
  ].join("|");
}

function dedupeFindings(findings = []) {
  const seen = new Map();

  for (const finding of findings.map((item) => createFinding(item))) {
    const key = findingKey(finding);

    if (!seen.has(key)) {
      seen.set(key, finding);
      continue;
    }

    const existing = seen.get(key);

    if (severityRank(finding.severity) > severityRank(existing.severity)) {
      seen.set(key, {
        ...existing,
        ...finding,
      });
    }
  }

  return sortFindingsBySeverity([...seen.values()]);
}

function isFindingAllowlisted(finding, rules = {}) {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  const allowlists = normalizedRules.allowlists;

  if (finding.ghsa && allowlists.advisories.includes(finding.ghsa)) return true;
  if (finding.cve && allowlists.advisories.includes(finding.cve)) return true;
  if (finding.id && allowlists.advisories.includes(finding.id)) return true;
  if (finding.package && allowlists.packages.includes(finding.package))
    return true;
  if (finding.rule_id && allowlists.rules.includes(finding.rule_id))
    return true;

  if (finding.path) {
    return allowlists.paths.some((pattern) => {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");

      return new RegExp(`^${escaped}$`).test(toPosixPath(finding.path));
    });
  }

  return false;
}

function normalizeSarifSeverity(result = {}, rule = {}) {
  const securitySeverity = Number(
    result.properties?.["security-severity"] ??
      rule.properties?.["security-severity"] ??
      result.properties?.securitySeverity ??
      rule.properties?.securitySeverity,
  );

  if (Number.isFinite(securitySeverity)) {
    if (securitySeverity >= 9) return "critical";
    if (securitySeverity >= 7) return "high";
    if (securitySeverity >= 4) return "medium";
    if (securitySeverity > 0) return "low";
  }

  return normalizeSeverity(
    result.level || rule.defaultConfiguration?.level || "unknown",
  );
}

function parseSarifReport(report, options = {}) {
  const tool = normalizeString(options.tool, "codeql");
  const findings = [];

  const runs = Array.isArray(report?.runs) ? report.runs : [];

  for (const run of runs) {
    const rulesById = new Map();

    const rules = [
      ...(run.tool?.driver?.rules || []),
      ...(run.tool?.extensions || []).flatMap(
        (extension) => extension.rules || [],
      ),
    ];

    for (const rule of rules) {
      rulesById.set(rule.id, rule);
    }

    for (const result of run.results || []) {
      const rule = rulesById.get(result.ruleId) || {};
      const location = result.locations?.[0]?.physicalLocation || {};
      const artifactLocation = location.artifactLocation || {};
      const region = location.region || {};

      findings.push(
        createFinding({
          id: result.ruleId,
          tool: normalizeString(run.tool?.driver?.name, tool).toLowerCase(),
          type: "code-scanning",
          severity: normalizeSarifSeverity(result, rule),
          title: rule.shortDescription?.text || result.ruleId,
          message: result.message?.text || rule.fullDescription?.text || "",
          rule_id: result.ruleId,
          path: artifactLocation.uri || "",
          line: region.startLine || null,
          column: region.startColumn || null,
          url: rule.helpUri || "",
          fingerprint:
            result.fingerprints?.primaryLocationLineHash ||
            result.partialFingerprints?.primaryLocationLineHash ||
            "",
          raw: result,
        }),
      );
    }
  }

  return findings;
}

function parsePnpmAuditReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "pnpm_audit");

  const advisories = isPlainObject(report?.advisories)
    ? Object.values(report.advisories)
    : [];
  const vulnerabilities = Array.isArray(report?.vulnerabilities)
    ? report.vulnerabilities
    : [];

  for (const advisory of advisories) {
    findings.push(
      createFinding({
        id: advisory.github_advisory_id || advisory.id || advisory.module_name,
        tool,
        type: "dependency",
        severity: advisory.severity,
        title: advisory.title || advisory.module_name,
        message: advisory.overview || advisory.recommendation || "",
        package: advisory.module_name,
        version: advisory.vulnerable_versions,
        fixed_version: advisory.patched_versions,
        cve: Array.isArray(advisory.cves)
          ? advisory.cves.join(", ")
          : advisory.cves,
        ghsa: advisory.github_advisory_id,
        url: advisory.url,
        raw: advisory,
      }),
    );
  }

  for (const vulnerability of vulnerabilities) {
    findings.push(
      createFinding({
        id: vulnerability.id || vulnerability.name,
        tool,
        type: "dependency",
        severity: vulnerability.severity,
        title: vulnerability.title || vulnerability.name,
        message: vulnerability.description || "",
        package: vulnerability.name || vulnerability.package,
        version: vulnerability.range || vulnerability.version,
        fixed_version:
          vulnerability.fixAvailable?.version || vulnerability.fix_available,
        cve: Array.isArray(vulnerability.cves)
          ? vulnerability.cves.join(", ")
          : vulnerability.cve,
        ghsa: vulnerability.github_advisory_id || vulnerability.ghsa,
        url: vulnerability.url,
        raw: vulnerability,
      }),
    );
  }

  return findings;
}

function parseTrivyReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "trivy");

  for (const result of report?.Results || report?.results || []) {
    const target = result.Target || result.target || "";

    for (const vulnerability of result.Vulnerabilities ||
      result.vulnerabilities ||
      []) {
      findings.push(
        createFinding({
          id: vulnerability.VulnerabilityID || vulnerability.id,
          tool,
          type: "container",
          severity: vulnerability.Severity || vulnerability.severity,
          title:
            vulnerability.Title ||
            vulnerability.title ||
            vulnerability.VulnerabilityID,
          message: vulnerability.Description || vulnerability.description || "",
          package:
            vulnerability.PkgName ||
            vulnerability.pkgName ||
            vulnerability.package,
          version:
            vulnerability.InstalledVersion || vulnerability.installedVersion,
          fixed_version:
            vulnerability.FixedVersion || vulnerability.fixedVersion,
          cve: vulnerability.VulnerabilityID || vulnerability.cve,
          url: vulnerability.PrimaryURL || vulnerability.url,
          path: target,
          raw: vulnerability,
        }),
      );
    }

    for (const secret of result.Secrets || result.secrets || []) {
      findings.push(
        createFinding({
          id: secret.RuleID || secret.ruleID || secret.title,
          tool,
          type: "secret",
          severity: secret.Severity || "high",
          title: secret.Title || secret.RuleID || "Secret detected",
          message: secret.Match || secret.message || "",
          rule_id: secret.RuleID || secret.ruleID,
          path: target,
          line: secret.StartLine || secret.startLine,
          raw: secret,
        }),
      );
    }

    for (const misconfiguration of result.Misconfigurations ||
      result.misconfigurations ||
      []) {
      findings.push(
        createFinding({
          id: misconfiguration.ID || misconfiguration.id,
          tool,
          type: "misconfiguration",
          severity: misconfiguration.Severity || misconfiguration.severity,
          title: misconfiguration.Title || misconfiguration.id,
          message:
            misconfiguration.Message || misconfiguration.description || "",
          rule_id: misconfiguration.ID || misconfiguration.id,
          path: target,
          url: misconfiguration.PrimaryURL || misconfiguration.url,
          raw: misconfiguration,
        }),
      );
    }
  }

  return findings;
}

function parseOsvReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "osv_scanner");

  for (const result of report?.results || report?.Results || []) {
    const packageName =
      result.package?.name || result.package?.Name || result.name || "";
    const packageVersion =
      result.package?.version ||
      result.package?.Version ||
      result.version ||
      "";

    for (const vulnerability of result.vulnerabilities || result.vulns || []) {
      findings.push(
        createFinding({
          id: vulnerability.id,
          tool,
          type: "dependency",
          severity:
            vulnerability.database_specific?.severity ||
            vulnerability.severity ||
            "unknown",
          title: vulnerability.summary || vulnerability.id,
          message: vulnerability.details || "",
          package: packageName,
          version: packageVersion,
          fixed_version: vulnerability.fixed || "",
          cve:
            (vulnerability.aliases || []).find((alias) =>
              alias.startsWith("CVE-"),
            ) || "",
          ghsa:
            (vulnerability.aliases || []).find((alias) =>
              alias.startsWith("GHSA-"),
            ) || "",
          url: vulnerability.references?.[0]?.url || "",
          raw: vulnerability,
        }),
      );
    }
  }

  return findings;
}

function parseSonarQubeReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "sonarqube");

  const issues = Array.isArray(report?.issues)
    ? report.issues
    : Array.isArray(report?.component?.issues)
      ? report.component.issues
      : [];

  for (const issue of issues) {
    const severity =
      {
        BLOCKER: "critical",
        CRITICAL: "critical",
        MAJOR: "high",
        MINOR: "medium",
        INFO: "low",
      }[String(issue.severity || "").toUpperCase()] ||
      issue.severity ||
      "unknown";

    findings.push(
      createFinding({
        id: issue.key || issue.rule,
        tool,
        type: issue.type || "code-quality",
        severity,
        title: issue.message || issue.rule,
        message: issue.message || "",
        rule_id: issue.rule,
        path: issue.component || issue.file || "",
        line: issue.line || issue.textRange?.startLine || null,
        raw: issue,
      }),
    );
  }

  const qualityGate =
    report?.projectStatus || report?.qualityGate || report?.quality_gate;

  if (qualityGate && String(qualityGate.status || "").toUpperCase() !== "OK") {
    findings.push(
      createFinding({
        id: "sonarqube-quality-gate",
        tool,
        type: "quality-gate",
        severity: "high",
        title: "SonarQube quality gate failed",
        message: `Quality gate status: ${qualityGate.status || "unknown"}`,
        raw: qualityGate,
      }),
    );
  }

  return findings;
}

function parseDependencyReviewReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "dependency_review");

  const vulnerabilities = [
    ...(report?.vulnerabilities || []),
    ...(report?.findings || []),
    ...(report?.alerts || []),
  ];

  for (const vulnerability of vulnerabilities) {
    findings.push(
      createFinding({
        id:
          vulnerability.advisory_ghsa_id ||
          vulnerability.ghsa_id ||
          vulnerability.id,
        tool,
        type: "dependency",
        severity: vulnerability.severity,
        title:
          vulnerability.advisory_summary ||
          vulnerability.title ||
          vulnerability.package,
        message:
          vulnerability.advisory_description || vulnerability.description || "",
        package: vulnerability.package || vulnerability.package_name,
        version: vulnerability.version || vulnerability.vulnerable_requirements,
        fixed_version:
          vulnerability.fixed_version || vulnerability.patched_versions,
        cve: vulnerability.cve,
        ghsa: vulnerability.advisory_ghsa_id || vulnerability.ghsa_id,
        url: vulnerability.advisory_url || vulnerability.url,
        raw: vulnerability,
      }),
    );
  }

  const deniedLicenses =
    report?.denied_licenses || report?.license_findings || [];

  for (const license of deniedLicenses) {
    findings.push(
      createFinding({
        id: `license:${license.package || license.name || license.license}`,
        tool,
        type: "license",
        severity: "high",
        title: `Denied license detected: ${license.license || "unknown"}`,
        message: license.message || "",
        package: license.package || license.name,
        raw: license,
      }),
    );
  }

  return findings;
}

function parseScorecardReport(report, options = {}) {
  const findings = [];
  const tool = normalizeString(options.tool, "scorecard");
  const minScore = Number(options.minScore || options.min_score || 7);

  const checks = report?.checks || report?.Checks || [];

  for (const check of checks) {
    const score = Number(check.score ?? check.Score);

    if (!Number.isFinite(score)) continue;
    if (score >= minScore) continue;

    findings.push(
      createFinding({
        id: `scorecard:${check.name || check.Name}`,
        tool,
        type: "supply-chain",
        severity: score <= 3 ? "high" : "medium",
        title: `OpenSSF Scorecard check below threshold: ${check.name || check.Name}`,
        message: check.reason || check.Reason || "",
        raw: check,
      }),
    );
  }

  return findings;
}

function parseGenericSecurityReport(report, options = {}) {
  const tool = normalizeString(options.tool, "generic");
  const findings = [];

  const candidates = Array.isArray(report)
    ? report
    : report?.findings ||
      report?.results ||
      report?.issues ||
      report?.vulnerabilities ||
      [];

  for (const candidate of candidates) {
    findings.push(
      createFinding({
        ...candidate,
        tool: candidate.tool || tool,
        raw: candidate,
      }),
    );
  }

  return findings;
}

function inferReportType(filePath, report = null) {
  const normalizedPath = toPosixPath(filePath).toLowerCase();

  if (normalizedPath.endsWith(".sarif")) return SECURITY_REPORT_TYPES.sarif;
  if (normalizedPath.includes("pnpm") && normalizedPath.includes("audit"))
    return SECURITY_REPORT_TYPES.pnpm_audit;
  if (normalizedPath.includes("trivy")) return SECURITY_REPORT_TYPES.trivy;
  if (normalizedPath.includes("grype")) return SECURITY_REPORT_TYPES.grype;
  if (normalizedPath.includes("osv")) return SECURITY_REPORT_TYPES.osv;
  if (normalizedPath.includes("sonar")) return SECURITY_REPORT_TYPES.sonarqube;
  if (normalizedPath.includes("dependency-review"))
    return SECURITY_REPORT_TYPES.dependency_review;
  if (normalizedPath.includes("scorecard"))
    return SECURITY_REPORT_TYPES.scorecard;

  if (report?.runs?.[0]?.tool) return SECURITY_REPORT_TYPES.sarif;
  if (report?.advisories || report?.vulnerabilities)
    return SECURITY_REPORT_TYPES.pnpm_audit;
  if (report?.Results || report?.results?.[0]?.Vulnerabilities)
    return SECURITY_REPORT_TYPES.trivy;
  if (report?.projectStatus || report?.issues)
    return SECURITY_REPORT_TYPES.sonarqube;
  if (report?.checks || report?.Checks) return SECURITY_REPORT_TYPES.scorecard;

  return SECURITY_REPORT_TYPES.generic;
}

function parseSecurityReport(report, options = {}) {
  const type = normalizeString(
    options.type || inferReportType(options.filePath || "", report),
  );

  if (type === SECURITY_REPORT_TYPES.sarif)
    return parseSarifReport(report, options);
  if (type === SECURITY_REPORT_TYPES.pnpm_audit)
    return parsePnpmAuditReport(report, options);
  if (type === SECURITY_REPORT_TYPES.trivy)
    return parseTrivyReport(report, options);
  if (type === SECURITY_REPORT_TYPES.osv)
    return parseOsvReport(report, options);
  if (type === SECURITY_REPORT_TYPES.sonarqube)
    return parseSonarQubeReport(report, options);
  if (type === SECURITY_REPORT_TYPES.dependency_review)
    return parseDependencyReviewReport(report, options);
  if (type === SECURITY_REPORT_TYPES.scorecard)
    return parseScorecardReport(report, options);

  return parseGenericSecurityReport(report, options);
}

function parseSecurityReportFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return [];
    throw new Error(
      `Security report file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const report = raw.trim() ? JSON.parse(raw) : {};
  const type = options.type || inferReportType(filePath, report);

  return parseSecurityReport(report, {
    ...options,
    filePath: toRelativePath(absolutePath, repoRoot),
    type,
  });
}

function discoverSecurityReportFiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const roots = normalizeStringList(
    options.roots || ["artifacts/security", "artifacts", "reports", "coverage"],
  );

  const files = [];

  function visit(dirPath) {
    if (!isDirectory(dirPath)) return;

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (
          ["node_modules", ".git", ".nx", "dist", "build", "out"].includes(
            entry.name,
          )
        )
          continue;
        visit(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const normalized = entry.name.toLowerCase();

      if (
        normalized.endsWith(".sarif") ||
        normalized.endsWith(".json") ||
        normalized.endsWith(".jsonc")
      ) {
        files.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    visit(resolvePath(root, repoRoot));
  }

  return unique(files)
    .sort()
    .map((file) => toRelativePath(file, repoRoot));
}

function aggregateSecurityReports(files = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const reportFiles = normalizeStringList(files).length
    ? normalizeStringList(files)
    : discoverSecurityReportFiles({
        ...options,
        repoRoot,
      });

  const findings = [];
  const parse_errors = [];

  for (const file of reportFiles) {
    try {
      findings.push(
        ...parseSecurityReportFile(file, {
          ...options,
          repoRoot,
          required: false,
        }),
      );
    } catch (err) {
      parse_errors.push({
        file,
        error: logger.formatError(err),
      });
    }
  }

  return {
    report_files: reportFiles,
    findings: dedupeFindings(findings),
    parse_errors,
  };
}

function getFindingAction(finding, rules = {}) {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  const policy = normalizedRules.policy;

  if (isFindingAllowlisted(finding, normalizedRules)) {
    return "allow";
  }

  const severity = normalizeSeverity(finding.severity);

  if (
    normalizeStringList(policy.fail_on_severities)
      .map(normalizeSeverity)
      .includes(severity)
  ) {
    return "block";
  }

  if (
    normalizeStringList(policy.warn_on_severities)
      .map(normalizeSeverity)
      .includes(severity)
  ) {
    return "warn";
  }

  if (severityAtLeast(severity, "high")) return "block";
  if (severityAtLeast(severity, "medium")) return "warn";

  return "allow";
}

function classifyFindings(findings = [], rules = {}) {
  const allowed = [];
  const warnings = [];
  const blockers = [];

  for (const finding of dedupeFindings(findings)) {
    const action = getFindingAction(finding, rules);

    if (action === "block") {
      blockers.push(finding);
      continue;
    }

    if (action === "warn") {
      warnings.push(finding);
      continue;
    }

    allowed.push(finding);
  }

  return {
    blockers: sortFindingsBySeverity(blockers),
    warnings: sortFindingsBySeverity(warnings),
    allowed: sortFindingsBySeverity(allowed),
  };
}

function normalizeCheckState(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (
    ["success", "successful", "passed", "pass", "ok", "completed"].includes(
      normalized,
    )
  ) {
    return "success";
  }

  if (
    [
      "failure",
      "failed",
      "fail",
      "error",
      "cancelled",
      "timed_out",
      "action_required",
    ].includes(normalized)
  ) {
    return "failure";
  }

  if (
    ["pending", "queued", "in_progress", "waiting", "requested"].includes(
      normalized,
    )
  ) {
    return "pending";
  }

  if (!normalized) return "unknown";

  return normalized;
}

function normalizeChecks(checks = {}) {
  if (Array.isArray(checks)) {
    return Object.fromEntries(
      checks.map((check) => [
        check.name || check.context || check.check_name,
        normalizeCheckState(check.conclusion || check.status || check.state),
      ]),
    );
  }

  if (isPlainObject(checks)) {
    return Object.fromEntries(
      Object.entries(checks).map(([name, state]) => [
        name,
        normalizeCheckState(state),
      ]),
    );
  }

  return {};
}

function evaluateRequiredChecks(requiredChecks = [], checks = {}) {
  const normalizedChecks = normalizeChecks(checks);
  const required = normalizeStringList(requiredChecks);

  const results = required.map((name) => ({
    name,
    state: normalizedChecks[name] || "missing",
    passed: normalizedChecks[name] === "success",
  }));

  return {
    passed: results.every((result) => result.passed),
    required,
    results,
    missing: results
      .filter((result) => result.state === "missing")
      .map((result) => result.name),
    failed: results
      .filter((result) => !["success", "missing"].includes(result.state))
      .map((result) => result.name),
  };
}

function getRequiredChecksForContext(rules = {}, context = "pull_request") {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  return normalizeStringList(normalizedRules.required_checks[context] || []);
}

function isDependencyAutomation(input = {}) {
  const author = normalizeString(
    input.author || input.actor || input.user || process.env.GITHUB_ACTOR,
  );
  const branch = normalizeBranchName(
    input.branch ||
      input.head_branch ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF,
  );
  const labels = normalizeStringList(input.labels);

  if (DEPENDENCY_AUTHORS.includes(author)) return true;
  if (DEPENDENCY_BRANCH_PATTERNS.some((pattern) => pattern.test(branch)))
    return true;

  return labels.some((label) =>
    [
      "dependencies",
      "kind:dependencies",
      "security:dependency",
      "renovate",
      "dependabot",
      "mend",
    ].includes(label),
  );
}

function isOpenAiAutomation(input = {}) {
  const branch = normalizeBranchName(
    input.branch ||
      input.head_branch ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF,
  );
  const labels = normalizeStringList(input.labels);

  if (OPENAI_BRANCH_PATTERNS.some((pattern) => pattern.test(branch)))
    return true;

  return labels.some((label) =>
    ["automation:openai", "ai:generated", "openai"].includes(label),
  );
}

function classifyReleaseIntent(labels = []) {
  const normalizedLabels = normalizeStringList(labels);
  const releaseLabels = normalizedLabels.filter((label) =>
    RELEASE_LABELS.includes(label),
  );

  if (normalizedLabels.includes(NO_RELEASE_LABEL)) {
    return {
      should_release: false,
      bump: null,
      reason: "no-release label is present",
      release_labels: releaseLabels,
    };
  }

  if (releaseLabels.length !== 1) {
    return {
      should_release: false,
      bump: null,
      reason:
        releaseLabels.length > 1
          ? "multiple release labels are present"
          : "no release label is present",
      release_labels: releaseLabels,
    };
  }

  return {
    should_release: true,
    bump: releaseLabels[0].replace("release:", ""),
    reason: "exactly one release label is present",
    release_labels: releaseLabels,
  };
}

function evaluateDependencyReleasePolicy(input = {}, rules = {}) {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  const labels = normalizeStringList(input.labels);
  const dependency = isDependencyAutomation(input);
  const openai = isOpenAiAutomation(input);
  const releaseIntent = classifyReleaseIntent(labels);

  const blockers = [];
  const required_labels = [];
  const suggested_labels = [];

  if (dependency) {
    required_labels.push(NO_RELEASE_LABEL);
    suggested_labels.push(...DEFAULT_SECURITY_LABELS.dependency_security);

    if (!labels.includes(NO_RELEASE_LABEL)) {
      blockers.push("Dependency automation must have the no-release label.");
    }

    if (
      releaseIntent.should_release &&
      normalizedRules.policy.block_dependency_releases !== false
    ) {
      blockers.push("Dependency automation may not trigger releases.");
    }
  }

  if (openai && normalizedRules.policy.block_openai_automation_releases) {
    if (releaseIntent.should_release) {
      blockers.push(
        "OpenAI automation may not trigger releases under the active security policy.",
      );
    }
  }

  return {
    allowed: blockers.length === 0,
    dependency,
    openai,
    release_intent: releaseIntent,
    blockers,
    required_labels: unique(required_labels),
    suggested_labels: unique(suggested_labels),
  };
}

function getLabelsForFindings(findings = [], rules = {}) {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  const labels = [];

  for (const finding of findings) {
    labels.push(
      ...normalizeStringList(
        normalizedRules.labels.by_severity[normalizeSeverity(finding.severity)],
      ),
    );
    labels.push(
      ...normalizeStringList(normalizedRules.labels.by_tool[finding.tool]),
    );

    if (getFindingAction(finding, normalizedRules) === "block") {
      labels.push(...normalizeStringList(normalizedRules.labels.blocking));
      labels.push(
        ...normalizeStringList(normalizedRules.labels.release_blocking),
      );
    }
  }

  return unique(labels);
}

function createSecurityGate(input = {}) {
  const rules = normalizeSecurityRules(input.rules || {});
  const context = normalizeString(input.context, "pull_request");
  const findings = dedupeFindings(input.findings || []);
  const classified = classifyFindings(findings, rules);
  const requiredChecks = normalizeStringList(
    input.required_checks ||
      input.requiredChecks ||
      getRequiredChecksForContext(rules, context),
  );
  const checkEvaluation = evaluateRequiredChecks(
    requiredChecks,
    input.checks || {},
  );
  const dependencyPolicy = evaluateDependencyReleasePolicy(input, rules);

  const blockers = [];

  for (const finding of classified.blockers) {
    blockers.push({
      type: "finding",
      severity: finding.severity,
      title: finding.title,
      id: finding.id,
      tool: finding.tool,
      reason: `${finding.tool} reported ${finding.severity}: ${finding.title}`,
      finding,
    });
  }

  if (rules.policy.block_on_failed_required_checks && !checkEvaluation.passed) {
    for (const failedCheck of [
      ...checkEvaluation.missing,
      ...checkEvaluation.failed,
    ]) {
      blockers.push({
        type: "required_check",
        reason: `Required check has not passed: ${failedCheck}`,
        check: failedCheck,
      });
    }
  }

  for (const blocker of dependencyPolicy.blockers) {
    blockers.push({
      type: "dependency_release_policy",
      reason: blocker,
    });
  }

  if (
    input.report_files_required &&
    !normalizeStringList(input.report_files).length
  ) {
    blockers.push({
      type: "missing_security_report",
      reason: "No security report files were provided.",
    });
  }

  if (
    rules.policy.fail_on_unknown_security_state &&
    input.unknown_security_state
  ) {
    blockers.push({
      type: "unknown_security_state",
      reason: "Security state is unknown.",
    });
  }

  const warnings = [
    ...classified.warnings.map((finding) => ({
      type: "finding",
      severity: finding.severity,
      title: finding.title,
      id: finding.id,
      tool: finding.tool,
      reason: `${finding.tool} reported ${finding.severity}: ${finding.title}`,
      finding,
    })),
  ];

  const gate = {
    schema_version: 1,
    type: "security-gate",
    created_at: new Date().toISOString(),
    context,
    allowed: blockers.length === 0,
    dry_run: getDryRun(input),
    policy: {
      strict: rules.policy.strict,
      fail_on_severities: normalizeStringList(rules.policy.fail_on_severities),
      warn_on_severities: normalizeStringList(rules.policy.warn_on_severities),
    },
    totals: {
      findings: findings.length,
      blockers: blockers.length,
      warnings: warnings.length,
      allowed_findings: classified.allowed.length,
      required_checks: checkEvaluation.required.length,
      failed_required_checks: checkEvaluation.failed.length,
      missing_required_checks: checkEvaluation.missing.length,
    },
    max_severity: maxSeverity(findings.map((finding) => finding.severity)),
    labels: getLabelsForFindings(
      [...classified.blockers, ...classified.warnings],
      rules,
    ),
    dependency_policy: dependencyPolicy,
    check_evaluation: checkEvaluation,
    blockers,
    warnings,
    findings: {
      blockers: classified.blockers,
      warnings: classified.warnings,
      allowed: classified.allowed,
    },
  };

  return gate;
}

function assertSecurityGateAllowed(gate) {
  if (!gate.allowed) {
    const reasons = gate.blockers
      .map((blocker) => `- ${blocker.reason}`)
      .join("\n");

    throw new Error(`Security gate failed.\n${reasons}`);
  }

  return true;
}

function createSecurityReport(input = {}) {
  const rules = normalizeSecurityRules(input.rules || {});
  const reportFiles = normalizeStringList(
    input.report_files || input.reportFiles || input.files,
  );
  const aggregated = aggregateSecurityReports(reportFiles, input);
  const findings = dedupeFindings([
    ...(input.findings || []),
    ...aggregated.findings,
  ]);
  const classified = classifyFindings(findings, rules);
  const gate = createSecurityGate({
    ...input,
    rules,
    findings,
    report_files: aggregated.report_files,
  });

  return {
    schema_version: 1,
    type: "security-report",
    created_at: new Date().toISOString(),
    project: "Aerealith AI",
    repository: process.env.GITHUB_REPOSITORY || "SinLess-Games/Aerealith-AI",
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    context: gate.context,
    dry_run: getDryRun(input),
    report_files: aggregated.report_files,
    parse_errors: aggregated.parse_errors,
    gate,
    totals: {
      findings: findings.length,
      blockers: classified.blockers.length,
      warnings: classified.warnings.length,
      allowed: classified.allowed.length,
      parse_errors: aggregated.parse_errors.length,
    },
    max_severity: maxSeverity(findings.map((finding) => finding.severity)),
    labels: gate.labels,
    findings: {
      blockers: classified.blockers,
      warnings: classified.warnings,
      allowed: classified.allowed,
      all: findings,
    },
  };
}

function createSecuritySummary(reportOrGate = {}) {
  const report = reportOrGate.gate ? reportOrGate : { gate: reportOrGate };
  const gate = report.gate || reportOrGate;
  const blockers = gate.blockers || [];
  const warnings = gate.warnings || [];
  const findings = report.findings?.all || [
    ...(gate.findings?.blockers || []),
    ...(gate.findings?.warnings || []),
    ...(gate.findings?.allowed || []),
  ];

  const lines = [
    "## Security Gate",
    "",
    `- Result: \`${gate.allowed ? "passed" : "failed"}\``,
    `- Context: \`${gate.context || "unknown"}\``,
    `- Dry-run: \`${gate.dry_run ? "true" : "false"}\``,
    `- Findings: \`${findings.length}\``,
    `- Blockers: \`${blockers.length}\``,
    `- Warnings: \`${warnings.length}\``,
    `- Max severity: \`${gate.max_severity || report.max_severity || "unknown"}\``,
  ];

  if (gate.check_evaluation?.required?.length) {
    lines.push("");
    lines.push("### Required Checks");
    lines.push("");
    lines.push("| Check | State | Passed |");
    lines.push("|---|---|---:|");

    for (const check of gate.check_evaluation.results || []) {
      lines.push(
        `| \`${check.name}\` | \`${check.state}\` | \`${check.passed ? "yes" : "no"}\` |`,
      );
    }
  }

  if (blockers.length) {
    lines.push("");
    lines.push("### Blockers");
    lines.push("");
    lines.push("| Type | Severity | Tool | Reason |");
    lines.push("|---|---|---|---|");

    for (const blocker of blockers) {
      lines.push(
        `| \`${blocker.type}\` | \`${blocker.severity || ""}\` | \`${blocker.tool || ""}\` | ${blocker.reason} |`,
      );
    }
  }

  if (warnings.length) {
    lines.push("");
    lines.push("### Warnings");
    lines.push("");
    lines.push("| Type | Severity | Tool | Reason |");
    lines.push("|---|---|---|---|");

    for (const warning of warnings) {
      lines.push(
        `| \`${warning.type}\` | \`${warning.severity || ""}\` | \`${warning.tool || ""}\` | ${warning.reason} |`,
      );
    }
  }

  if (gate.labels?.length) {
    lines.push("");
    lines.push("### Suggested Labels");
    lines.push("");
    for (const label of gate.labels) {
      lines.push(`- \`${label}\``);
    }
  }

  return lines.join("\n");
}

function writeSecurityReport(
  report,
  outputFile = DEFAULT_SECURITY_REPORT_FILE,
  options = {},
) {
  return writeJson(outputFile, report, options);
}

function writeSecurityGate(
  gate,
  outputFile = DEFAULT_SECURITY_GATE_FILE,
  options = {},
) {
  return writeJson(outputFile, gate, options);
}

function writeSecuritySummary(
  reportOrGate,
  outputFile = DEFAULT_SECURITY_SUMMARY_FILE,
  options = {},
) {
  return writeMarkdown(
    outputFile,
    createSecuritySummary(reportOrGate),
    options,
  );
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping security summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function appendSecuritySummary(reportOrGate) {
  return appendGitHubStepSummary(createSecuritySummary(reportOrGate));
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function setSecurityGateOutputs(gate) {
  setGitHubOutput("security_allowed", gate.allowed ? "true" : "false");
  setGitHubOutput("security_blockers", String(gate.totals?.blockers || 0));
  setGitHubOutput("security_warnings", String(gate.totals?.warnings || 0));
  setGitHubOutput("security_max_severity", gate.max_severity || "unknown");
  setGitHubOutput("security_labels", gate.labels || []);
}

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );

  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun && options.executeInDryRun !== true) {
    logger.dryRun(
      `Would run command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
    );

    return {
      command,
      args,
      cwd,
      dry_run: true,
      status: 0,
      stdout: "",
      stderr: "",
    };
  }

  logger.info(
    `Running command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
  );

  const result = childProcess.spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: "utf8",
    shell: normalizeBoolean(options.shell, false),
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    options.allowFailure !== true &&
    options.allow_failure !== true
  ) {
    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        result.stdout ? `stdout:\n${result.stdout}` : null,
        result.stderr ? `stderr:\n${result.stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    command,
    args,
    cwd,
    dry_run: false,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function createPnpmAuditArgs(options = {}) {
  const auditLevel = normalizeString(
    options.auditLevel || options.audit_level,
    "high",
  );

  const args = ["audit", "--audit-level", auditLevel, "--json"];

  if (options.production || options.prod) args.push("--prod");
  if (options.dev) args.push("--dev");

  return args;
}

function runPnpmAudit(options = {}) {
  const result = runCommand("pnpm", createPnpmAuditArgs(options), {
    ...options,
    allowFailure: true,
  });

  let parsed = null;

  try {
    parsed = result.stdout.trim() ? JSON.parse(result.stdout) : {};
  } catch {
    parsed = {
      raw: result.stdout,
    };
  }

  return {
    result,
    report: parsed,
    findings: parsePnpmAuditReport(parsed),
  };
}

function createSecurityIssueTitle(finding) {
  return `[Security]: ${normalizeSeverity(finding.severity).toUpperCase()} ${finding.title}`;
}

function createSecurityIssueBody(finding) {
  const lines = [
    "## Security Finding",
    "",
    `- Tool: \`${finding.tool}\``,
    `- Severity: \`${finding.severity}\``,
    `- Type: \`${finding.type}\``,
    `- Rule / Advisory: \`${finding.rule_id || finding.id}\``,
  ];

  if (finding.package) lines.push(`- Package: \`${finding.package}\``);
  if (finding.version) lines.push(`- Version: \`${finding.version}\``);
  if (finding.fixed_version)
    lines.push(`- Fixed version: \`${finding.fixed_version}\``);
  if (finding.path)
    lines.push(
      `- Path: \`${finding.path}${finding.line ? `:${finding.line}` : ""}\``,
    );
  if (finding.cve) lines.push(`- CVE: \`${finding.cve}\``);
  if (finding.ghsa) lines.push(`- GHSA: \`${finding.ghsa}\``);
  if (finding.url) lines.push(`- Reference: ${finding.url}`);

  lines.push("");
  lines.push("## Details");
  lines.push("");
  lines.push(finding.message || finding.title);

  lines.push("");
  lines.push("## Acceptance Criteria");
  lines.push("");
  lines.push("- [ ] Confirm the finding is valid.");
  lines.push(
    "- [ ] Patch, remove, replace, or suppress the vulnerable source with justification.",
  );
  lines.push("- [ ] Re-run the strict security workflow.");
  lines.push("- [ ] Confirm the security gate passes.");
  lines.push(
    "- [ ] Confirm release and deployment gates are no longer blocked.",
  );

  return lines.join("\n");
}

function createSecurityIssueDraft(finding, rules = {}) {
  const normalizedRules = normalizeSecurityRules(rules.raw ? rules.raw : rules);
  const labels = unique([
    "type:security",
    "status:todo",
    "needs-triage",
    ...getLabelsForFindings([finding], normalizedRules),
  ]);

  return {
    title: createSecurityIssueTitle(finding),
    body: createSecurityIssueBody(finding),
    labels,
  };
}

function createSecurityIssueDrafts(reportOrGate, rules = {}) {
  const findings =
    reportOrGate.findings?.blockers ||
    reportOrGate.gate?.findings?.blockers ||
    reportOrGate.findings?.all ||
    [];

  return sortFindingsBySeverity(findings).map((finding) =>
    createSecurityIssueDraft(finding, rules),
  );
}

function printSecurityGate(gate) {
  logger.info(`Security gate ${gate.allowed ? "passed" : "failed"}.`);
  logger.info(
    `Findings: ${gate.totals.findings}. Blockers: ${gate.totals.blockers}. Warnings: ${gate.totals.warnings}.`,
  );

  for (const blocker of gate.blockers) {
    logger.warn(blocker.reason);
  }

  logger.dump("security gate", gate);
}

function runCli() {
  const command = process.argv[2] || "gate";
  const repoRoot = findRepoRoot();
  const rules = loadSecurityRules(DEFAULT_SECURITY_RULES_FILE, {
    repoRoot,
  });

  if (command === "audit") {
    const audit = runPnpmAudit({
      repoRoot,
    });

    const report = createSecurityReport({
      repoRoot,
      rules,
      findings: audit.findings,
      context: process.argv[3] || "pull_request",
    });

    writeSecurityReport(report, DEFAULT_SECURITY_REPORT_FILE, {
      repoRoot,
    });
    writeSecurityGate(report.gate, DEFAULT_SECURITY_GATE_FILE, {
      repoRoot,
    });
    writeSecuritySummary(report, DEFAULT_SECURITY_SUMMARY_FILE, {
      repoRoot,
    });
    appendSecuritySummary(report);
    setSecurityGateOutputs(report.gate);

    if (!report.gate.allowed) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "parse") {
    const filePath = process.argv[3];

    if (!filePath) {
      throw new Error("A security report file path is required.");
    }

    const findings = parseSecurityReportFile(filePath, {
      repoRoot,
    });

    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  if (command === "report") {
    const files = process.argv.slice(3);

    const report = createSecurityReport({
      repoRoot,
      rules,
      report_files: files,
      context: process.env.SECURITY_CONTEXT || "pull_request",
    });

    writeSecurityReport(report, DEFAULT_SECURITY_REPORT_FILE, {
      repoRoot,
    });
    writeSecurityGate(report.gate, DEFAULT_SECURITY_GATE_FILE, {
      repoRoot,
    });
    writeSecuritySummary(report, DEFAULT_SECURITY_SUMMARY_FILE, {
      repoRoot,
    });
    appendSecuritySummary(report);
    setSecurityGateOutputs(report.gate);

    console.log(JSON.stringify(report, null, 2));

    if (!report.gate.allowed) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "gate") {
    const files = process.argv.slice(3);

    const report = createSecurityReport({
      repoRoot,
      rules,
      report_files: files,
      context: process.env.SECURITY_CONTEXT || "pull_request",
    });

    printSecurityGate(report.gate);
    writeSecurityGate(report.gate, DEFAULT_SECURITY_GATE_FILE, {
      repoRoot,
    });
    writeSecuritySummary(report, DEFAULT_SECURITY_SUMMARY_FILE, {
      repoRoot,
    });
    appendSecuritySummary(report);
    setSecurityGateOutputs(report.gate);

    console.log(JSON.stringify(report.gate, null, 2));

    if (!report.gate.allowed) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "issues") {
    const report = readJson(process.argv[3] || DEFAULT_SECURITY_REPORT_FILE, {
      repoRoot,
    });

    const drafts = createSecurityIssueDrafts(report, rules);

    console.log(JSON.stringify(drafts, null, 2));
    return;
  }

  throw new Error(`Unknown security utility command: ${command}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_SECURITY_RULES_FILE,
  DEFAULT_RELEASE_RULES_FILE,
  DEFAULT_DEPENDENCY_RULES_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SECURITY_REPORT_FILE,
  DEFAULT_SECURITY_GATE_FILE,
  DEFAULT_SECURITY_SUMMARY_FILE,
  DEFAULT_REPO_ROOT_MARKERS,

  TRUE_VALUES,
  FALSE_VALUES,
  SEVERITY_ORDER,
  NORMALIZED_SEVERITIES,
  DEFAULT_STRICT_POLICY,
  DEFAULT_REQUIRED_CHECKS,
  DEFAULT_SECURITY_TOOLS,
  DEFAULT_SECURITY_LABELS,
  DEPENDENCY_AUTHORS,
  DEPENDENCY_BRANCH_PATTERNS,
  OPENAI_BRANCH_PATTERNS,
  RELEASE_LABELS,
  NO_RELEASE_LABEL,
  SECURITY_REPORT_TYPES,

  isPlainObject,
  unique,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,
  normalizeBranchName,
  normalizeTagName,
  normalizeSeverity,
  severityRank,
  severityAtLeast,
  maxSeverity,
  sortFindingsBySeverity,

  getDryRun,
  allowLocalFileWrites,
  sortObjectDeep,
  stableStringify,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,
  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  ensureParentDir,
  readTextFile,
  writeFile,
  writeJson,
  writeMarkdown,
  readJson,
  readYaml,

  loadSecurityRules,
  normalizeSecurityRules,
  normalizeToolConfig,

  createFinding,
  findingKey,
  dedupeFindings,
  isFindingAllowlisted,

  normalizeSarifSeverity,
  parseSarifReport,
  parsePnpmAuditReport,
  parseTrivyReport,
  parseOsvReport,
  parseSonarQubeReport,
  parseDependencyReviewReport,
  parseScorecardReport,
  parseGenericSecurityReport,
  inferReportType,
  parseSecurityReport,
  parseSecurityReportFile,
  discoverSecurityReportFiles,
  aggregateSecurityReports,

  getFindingAction,
  classifyFindings,

  normalizeCheckState,
  normalizeChecks,
  evaluateRequiredChecks,
  getRequiredChecksForContext,

  isDependencyAutomation,
  isOpenAiAutomation,
  classifyReleaseIntent,
  evaluateDependencyReleasePolicy,

  getLabelsForFindings,

  createSecurityGate,
  assertSecurityGateAllowed,
  createSecurityReport,
  createSecuritySummary,

  writeSecurityReport,
  writeSecurityGate,
  writeSecuritySummary,
  appendGitHubStepSummary,
  appendSecuritySummary,
  setGitHubOutput,
  setSecurityGateOutputs,

  runCommand,
  createPnpmAuditArgs,
  runPnpmAudit,

  createSecurityIssueTitle,
  createSecurityIssueBody,
  createSecurityIssueDraft,
  createSecurityIssueDrafts,

  printSecurityGate,
};
