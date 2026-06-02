#!/usr/bin/env node
// .github/scripts/security/summarize-dependencies.js
// =============================================================================
// Aerealith AI — Dependency Security Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize dependency inventory and vulnerability reports from npm audit,
//   pnpm audit, Yarn audit, OSV, Snyk-like JSON, CycloneDX SBOM, SPDX SBOM,
//   package.json manifests, and generic dependency finding reports.
//
// Output:
//   - artifacts/security/summarize-dependencies.json
//   - artifacts/security/summarize-dependencies.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Read-only.
//   - Safe for pull requests.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[summarize-dependencies] ${message}`),
    warn: (message) =>
      console.warn(`[summarize-dependencies] WARN: ${message}`),
    error: (message) =>
      console.error(`[summarize-dependencies] ERROR: ${message}`),
    debug: () => {},
    dump: () => {},
    formatError: (err) => {
      if (!err) return "unknown error";
      if (typeof err === "string") return err;
      return err.message || String(err);
    },
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const DEFAULT_CONFIG_CANDIDATES = [
  ".github/security/summarize-dependencies.json",
  ".github/security/summarize-dependencies.jsonc",
  ".github/security/summarize-dependencies.yaml",
  ".github/security/summarize-dependencies.yml",
  ".github/security/dependency-summary.json",
  ".github/security/dependency-summary.jsonc",
  ".github/security/dependency-summary.yaml",
  ".github/security/dependency-summary.yml",
  ".github/repo/summarize-dependencies.json",
  ".github/repo/summarize-dependencies.jsonc",
  ".github/repo/summarize-dependencies.yaml",
  ".github/repo/summarize-dependencies.yml",
  ".github/summarize-dependencies.json",
  ".github/summarize-dependencies.jsonc",
  ".github/summarize-dependencies.yaml",
  ".github/summarize-dependencies.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security/dependencies",
  "artifacts/security/dependency-scan",
  "artifacts/security/audit",
  "artifacts/dependencies",
  "artifacts/audit",
  "artifacts/osv",
  "artifacts/sbom",
  "results",
  ".outputs/dependencies",
  ".outputs/audit",
];

const DEFAULT_MANIFEST_FILES = [
  "package.json",
  "apps/*/package.json",
  "libs/*/package.json",
  "packages/*/package.json",
  "tools/*/package.json",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-dependencies.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-dependencies.md";

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "info",
  "low",
  "medium",
  "high",
  "critical",
];
const DEFAULT_WARN_SEVERITIES = ["medium", "high", "critical"];
const DEFAULT_FAIL_SEVERITIES = [];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
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

function normalizeFloat(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (Array.isArray(value)) {
    return [
      ...new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    ];
  }

  return [
    ...new Set(
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeSeverity(value, fallback = "unknown") {
  const severity = normalizeString(value, fallback).toLowerCase();

  if (["critical", "crit", "blocker"].includes(severity)) return "critical";
  if (["high", "major", "error"].includes(severity)) return "high";
  if (["medium", "moderate", "med", "warning"].includes(severity))
    return "medium";
  if (["low", "minor"].includes(severity)) return "low";
  if (["info", "informational", "notice", "note"].includes(severity))
    return "info";
  if (["unknown", "none", "untriaged"].includes(severity)) return "unknown";

  return fallback;
}

function severityRank(severity) {
  const normalized = normalizeSeverity(severity, "unknown");
  const index = DEFAULT_SEVERITY_ORDER.indexOf(normalized);

  return index === -1 ? 0 : index;
}

function severityFromCvss(value, fallback = "unknown") {
  const cvss = normalizeFloat(value, 0);

  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "medium";
  if (cvss > 0) return "low";

  return fallback;
}

function normalizeUrl(value) {
  const source = normalizeString(value);

  if (!source) return "";

  try {
    return new URL(source).toString();
  } catch {
    return source;
  }
}

function normalizeLicense(value) {
  if (!value) return "";

  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    return value.map(normalizeLicense).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return normalizeString(
      value.license?.id ||
        value.license?.name ||
        value.expression ||
        value.name ||
        value.id ||
        "",
    );
  }

  return "";
}

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.SUMMARIZE_DEPENDENCIES_CONFIG_FILE || "",

    report_files: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_REPORT_FILES ||
        process.env.DEPENDENCY_REPORT_FILES ||
        process.env.AUDIT_REPORT_FILES ||
        "",
    ),

    manifest_files: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_MANIFEST_FILES ||
        process.env.DEPENDENCY_MANIFEST_FILES ||
        DEFAULT_MANIFEST_FILES.join(","),
    ),

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_INPUT_DIRS ||
        process.env.DEPENDENCY_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_DEPENDENCIES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_DEPENDENCIES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    ecosystem:
      process.env.SUMMARIZE_DEPENDENCIES_ECOSYSTEM ||
      process.env.DEPENDENCY_ECOSYSTEM ||
      "npm",

    fail_on_severities: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    min_report_severity: normalizeSeverity(
      process.env.SUMMARIZE_DEPENDENCIES_MIN_REPORT_SEVERITY || "unknown",
      "unknown",
    ),

    max_critical: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_CRITICAL,
      -1,
    ),
    max_high: normalizeInteger(process.env.SUMMARIZE_DEPENDENCIES_MAX_HIGH, -1),
    max_medium: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_MEDIUM,
      -1,
    ),
    max_low: normalizeInteger(process.env.SUMMARIZE_DEPENDENCIES_MAX_LOW, -1),
    max_info: normalizeInteger(process.env.SUMMARIZE_DEPENDENCIES_MAX_INFO, -1),
    max_unknown: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_UNKNOWN,
      -1,
    ),
    max_total: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_TOTAL,
      -1,
    ),

    ignored_vulnerabilities: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_IGNORED_VULNERABILITIES ||
        process.env.DEPENDENCY_IGNORED_VULNERABILITIES ||
        "",
    ),

    ignored_packages: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_IGNORED_PACKAGES ||
        process.env.DEPENDENCY_IGNORED_PACKAGES ||
        "",
    ),

    ignored_licenses: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_IGNORED_LICENSES || "",
    ),

    denied_licenses: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_DENIED_LICENSES ||
        process.env.DEPENDENCY_DENIED_LICENSES ||
        "",
    ),

    allowed_licenses: normalizeStringList(
      process.env.SUMMARIZE_DEPENDENCIES_ALLOWED_LICENSES ||
        process.env.DEPENDENCY_ALLOWED_LICENSES ||
        "",
    ),

    include_dev_dependencies: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_INCLUDE_DEV,
      true,
    ),

    include_transitive_dependencies: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_INCLUDE_TRANSITIVE,
      true,
    ),

    include_inventory: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_INCLUDE_INVENTORY,
      true,
    ),

    recursive: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_RECURSIVE,
      true,
    ),
    require_results: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_REQUIRE_RESULTS,
      false,
    ),
    fail_if_vulnerabilities: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_IF_VULNERABILITIES,
      false,
    ),
    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_THRESHOLD,
      true,
    ),
    fail_on_denied_licenses: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_DENIED_LICENSES,
      true,
    ),
    fail_on_unapproved_licenses: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_UNAPPROVED_LICENSES,
      false,
    ),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_INVALID_INPUT,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_FAIL_ON_ERROR,
      true,
    ),

    max_vulnerability_rows: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_VULNERABILITY_ROWS,
      100,
    ),
    max_dependency_rows: normalizeInteger(
      process.env.SUMMARIZE_DEPENDENCIES_MAX_DEPENDENCY_ROWS,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_DEPENDENCIES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_DEPENDENCIES_STEP_SUMMARY,
      true,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--report-file" ||
      arg === "--report-files" ||
      arg === "--audit-file" ||
      arg === "--file"
    ) {
      args.report_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--manifest-file" || arg === "--manifest-files") {
      args.manifest_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ecosystem") {
      args.ecosystem = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fail-on-severity" || arg === "--fail-on-severities") {
      args.fail_on_severities.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--warn-on-severity" || arg === "--warn-on-severities") {
      args.warn_on_severities.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--min-report-severity") {
      args.min_report_severity = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--max-critical") {
      args.max_critical = normalizeInteger(argv[index + 1], args.max_critical);
      index += 1;
      continue;
    }

    if (arg === "--max-high") {
      args.max_high = normalizeInteger(argv[index + 1], args.max_high);
      index += 1;
      continue;
    }

    if (arg === "--max-medium") {
      args.max_medium = normalizeInteger(argv[index + 1], args.max_medium);
      index += 1;
      continue;
    }

    if (arg === "--max-low") {
      args.max_low = normalizeInteger(argv[index + 1], args.max_low);
      index += 1;
      continue;
    }

    if (arg === "--max-info") {
      args.max_info = normalizeInteger(argv[index + 1], args.max_info);
      index += 1;
      continue;
    }

    if (arg === "--max-unknown") {
      args.max_unknown = normalizeInteger(argv[index + 1], args.max_unknown);
      index += 1;
      continue;
    }

    if (arg === "--max-total") {
      args.max_total = normalizeInteger(argv[index + 1], args.max_total);
      index += 1;
      continue;
    }

    if (arg === "--ignore-vulnerability" || arg === "--ignored-vulnerability") {
      args.ignored_vulnerabilities.push(
        ...normalizeStringList(argv[index + 1]),
      );
      index += 1;
      continue;
    }

    if (arg === "--ignore-package" || arg === "--ignored-package") {
      args.ignored_packages.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--deny-license" || arg === "--denied-license") {
      args.denied_licenses.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allow-license" || arg === "--allowed-license") {
      args.allowed_licenses.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-dev") {
      args.include_dev_dependencies = true;
      continue;
    }

    if (arg === "--no-dev") {
      args.include_dev_dependencies = false;
      continue;
    }

    if (arg === "--include-transitive") {
      args.include_transitive_dependencies = true;
      continue;
    }

    if (arg === "--no-transitive") {
      args.include_transitive_dependencies = false;
      continue;
    }

    if (arg === "--include-inventory") {
      args.include_inventory = true;
      continue;
    }

    if (arg === "--no-inventory") {
      args.include_inventory = false;
      continue;
    }

    if (arg === "--recursive") {
      args.recursive = true;
      continue;
    }

    if (arg === "--no-recursive") {
      args.recursive = false;
      continue;
    }

    if (arg === "--require-results") {
      args.require_results = true;
      continue;
    }

    if (arg === "--no-require-results") {
      args.require_results = false;
      continue;
    }

    if (arg === "--fail-if-vulnerabilities") {
      args.fail_if_vulnerabilities = true;
      continue;
    }

    if (arg === "--no-fail-if-vulnerabilities") {
      args.fail_if_vulnerabilities = false;
      continue;
    }

    if (arg === "--fail-on-threshold") {
      args.fail_on_threshold = true;
      continue;
    }

    if (arg === "--no-fail-on-threshold") {
      args.fail_on_threshold = false;
      continue;
    }

    if (arg === "--fail-on-denied-licenses") {
      args.fail_on_denied_licenses = true;
      continue;
    }

    if (arg === "--no-fail-on-denied-licenses") {
      args.fail_on_denied_licenses = false;
      continue;
    }

    if (arg === "--fail-on-unapproved-licenses") {
      args.fail_on_unapproved_licenses = true;
      continue;
    }

    if (arg === "--no-fail-on-unapproved-licenses") {
      args.fail_on_unapproved_licenses = false;
      continue;
    }

    if (arg === "--fail-on-invalid-input") {
      args.fail_on_invalid_input = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-input") {
      args.fail_on_invalid_input = false;
      continue;
    }

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
      continue;
    }

    if (arg === "--max-vulnerability-rows") {
      args.max_vulnerability_rows = normalizeInteger(
        argv[index + 1],
        args.max_vulnerability_rows,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-dependency-rows") {
      args.max_dependency_rows = normalizeInteger(
        argv[index + 1],
        args.max_dependency_rows,
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = argv[index + 1];
      args.write_summary_file = true;
      index += 1;
      continue;
    }

    if (arg === "--no-summary") {
      args.write_summary_file = false;
      continue;
    }

    if (arg === "--dry-run") {
      args.dry_run = true;
      continue;
    }

    if (arg === "--no-print") {
      args.print = false;
      continue;
    }

    if (arg === "--no-step-summary") {
      args.write_step_summary = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  args.repository = normalizeString(args.repository, DEFAULT_REPOSITORY);
  args.report_files = [
    ...new Set(args.report_files.map(toPosixPath).filter(Boolean)),
  ];
  args.manifest_files = [
    ...new Set(args.manifest_files.map(toPosixPath).filter(Boolean)),
  ];
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.ecosystem = normalizeString(args.ecosystem, "npm").toLowerCase();
  args.fail_on_severities = [
    ...new Set(
      args.fail_on_severities
        .map((item) => normalizeSeverity(item, ""))
        .filter(Boolean),
    ),
  ];
  args.warn_on_severities = [
    ...new Set(
      args.warn_on_severities
        .map((item) => normalizeSeverity(item, ""))
        .filter(Boolean),
    ),
  ];
  args.min_report_severity = normalizeSeverity(
    args.min_report_severity,
    "unknown",
  );
  args.ignored_vulnerabilities = [
    ...new Set(
      args.ignored_vulnerabilities
        .map((item) => normalizeString(item).toUpperCase())
        .filter(Boolean),
    ),
  ];
  args.ignored_packages = [
    ...new Set(
      args.ignored_packages
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.ignored_licenses = [
    ...new Set(
      args.ignored_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.denied_licenses = [
    ...new Set(
      args.denied_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.allowed_licenses = [
    ...new Set(
      args.allowed_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.max_vulnerability_rows = Math.max(1, args.max_vulnerability_rows);
  args.max_dependency_rows = Math.max(1, args.max_dependency_rows);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Dependency Security Summary

Usage:
  node .github/scripts/security/summarize-dependencies.js [options]

Examples:
  node .github/scripts/security/summarize-dependencies.js --report-file artifacts/security/npm-audit.json
  node .github/scripts/security/summarize-dependencies.js --input-dir artifacts/security/dependencies
  node .github/scripts/security/summarize-dependencies.js --manifest-file package.json
  node .github/scripts/security/summarize-dependencies.js --max-critical 0 --max-high 0
  node .github/scripts/security/summarize-dependencies.js --fail-if-vulnerabilities
  node .github/scripts/security/summarize-dependencies.js --deny-license GPL-3.0

Supported input shapes:
  - npm audit JSON
  - pnpm audit JSON
  - Yarn audit JSON / NDJSON
  - OSV JSON
  - Snyk-like JSON
  - CycloneDX SBOM JSON
  - SPDX SBOM JSON
  - package.json
  - Generic JSON with vulnerabilities/findings/results/advisories arrays

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Summary config file.
      --report-file <file,list>            Dependency/audit report file(s).
      --manifest-file <file,list>          Dependency manifest file(s).
      --input-dir <dir,list>               Directories to scan for reports.
      --ecosystem <name>                   Ecosystem override. Default: npm.
      --fail-on-severities <list>          Severities that fail the summary.
      --warn-on-severities <list>          Severities that warn the summary.
      --min-report-severity <severity>     Minimum severity included in vulnerability rows.
      --max-critical <number>              Max allowed critical vulns. -1 disables.
      --max-high <number>                  Max allowed high vulns. -1 disables.
      --max-medium <number>                Max allowed medium vulns. -1 disables.
      --max-low <number>                   Max allowed low vulns. -1 disables.
      --max-info <number>                  Max allowed info vulns. -1 disables.
      --max-unknown <number>               Max allowed unknown vulns. -1 disables.
      --max-total <number>                 Max allowed total vulns. -1 disables.
      --ignore-vulnerability <id,list>     Vulnerability IDs to ignore.
      --ignore-package <name,list>         Package names to ignore.
      --deny-license <license,list>        Licenses that should fail policy.
      --allow-license <license,list>       Approved licenses.
      --include-dev                        Include dev dependency findings. Default.
      --no-dev                             Exclude dev dependency findings.
      --include-transitive                 Include transitive dependency findings. Default.
      --no-transitive                      Exclude transitive dependency findings.
      --include-inventory                  Include dependency inventory. Default.
      --no-inventory                       Do not include dependency inventory.
      --recursive                          Recursively scan input dirs. Default.
      --no-recursive                       Scan only direct files in input dirs.
      --require-results                    Fail when no dependency data is found.
      --fail-if-vulnerabilities            Fail when active vulnerabilities exist.
      --fail-on-threshold                  Fail when thresholds are exceeded. Default.
      --fail-on-denied-licenses            Fail when denied licenses are found. Default.
      --fail-on-unapproved-licenses        Fail when allowed licenses are configured and dependency license is not approved.
      --fail-on-invalid-input              Fail on invalid input files. Default.
      --fail-on-error                      Exit non-zero when summary is not ok. Default.
      --max-vulnerability-rows <number>    Max vulnerability rows in Markdown. Default: 100.
      --max-dependency-rows <number>       Max dependency rows in Markdown. Default: 100.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Evaluate but mark as dry run.
      --no-print                           Do not print JSON report.
      --no-step-summary                    Do not append GitHub step summary.
`);
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const markers = [
    ".git",
    ".github",
    "package.json",
    "pnpm-workspace.yaml",
    "nx.json",
  ];
  let current = path.resolve(startDir);

  while (current && current !== path.dirname(current)) {
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

function resolvePath(filePath, repoRoot) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.normalize(path.join(repoRoot, filePath));
}

function toRelativePath(filePath, repoRoot) {
  return (
    toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot))) || "."
  );
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }

  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return {
      written: false,
      dry_run: true,
      path: filePath,
    };
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    dry_run: false,
    path: filePath,
  };
}

function runGit(args, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return options.fallback ?? "";
  }
}

function getGitMetadata(repoRoot) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], { repoRoot }),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"], { repoRoot }),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }) ||
      DEFAULT_BRANCH,
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
    event_name: process.env.GITHUB_EVENT_NAME || "",
  };
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseNdjson(text) {
  const entries = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const parsed = safeJsonParse(trimmed, null);

    if (parsed) entries.push(parsed);
  }

  return entries.length ? entries : null;
}

function parseYamlScalar(value) {
  const source = normalizeString(value);

  if (!source) return "";
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+$/.test(source)) return Number(source);
  if (/^-?\d+\.\d+$/.test(source)) return Number.parseFloat(source);

  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }

  if (source.startsWith("[") && source.endsWith("]")) {
    return source
      .slice(1, -1)
      .split(",")
      .map((item) => parseYamlScalar(item.trim()))
      .filter((item) => item !== "");
  }

  return source;
}

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;

    if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index).trimEnd();
    }
  }

  return line.trimEnd();
}

function parseSimpleYaml(text) {
  const config = {};
  const lines = String(text || "").split(/\r?\n/);
  let section = "";

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      continue;
    }

    if (section && /^-\s*/.test(trimmed)) {
      config[section] = Array.isArray(config[section]) ? config[section] : [];
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
      section = "";
    }
  }

  return config;
}

function readDataFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const extension = path.extname(absolutePath).toLowerCase();
  const text = fs.readFileSync(absolutePath, "utf8");

  if (
    extension === ".json" ||
    extension === ".jsonc" ||
    extension === ".sbom" ||
    extension === ".spdx"
  ) {
    const parsed = safeJsonParse(stripJsonc(text), null);
    return parsed || parseNdjson(text);
  }

  if (extension === ".ndjson" || extension === ".jsonl") {
    return parseNdjson(text);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleYaml(text);
  }

  return safeJsonParse(stripJsonc(text), null) || parseNdjson(text);
}

function findConfigFile(args, repoRoot) {
  if (args.config_file) {
    const absolutePath = resolvePath(args.config_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.config_file;
  }

  for (const candidate of DEFAULT_CONFIG_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return args;

  const merged = { ...args };

  const stringKeys = [
    "output_file",
    "summary_file",
    "ecosystem",
    "min_report_severity",
  ];

  for (const key of stringKeys) {
    if (
      config[key] !== undefined &&
      (!merged[key] || key === "min_report_severity")
    ) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "report_files",
    "manifest_files",
    "input_dirs",
    "fail_on_severities",
    "warn_on_severities",
    "ignored_vulnerabilities",
    "ignored_packages",
    "ignored_licenses",
    "denied_licenses",
    "allowed_licenses",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "include_dev_dependencies",
    "include_transitive_dependencies",
    "include_inventory",
    "recursive",
    "require_results",
    "fail_if_vulnerabilities",
    "fail_on_threshold",
    "fail_on_denied_licenses",
    "fail_on_unapproved_licenses",
    "fail_on_invalid_input",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  const integerKeys = [
    "max_critical",
    "max_high",
    "max_medium",
    "max_low",
    "max_info",
    "max_unknown",
    "max_total",
    "max_vulnerability_rows",
    "max_dependency_rows",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.report_files = [
    ...new Set(merged.report_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.manifest_files = [
    ...new Set(merged.manifest_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.input_dirs = [
    ...new Set(merged.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  merged.ecosystem = normalizeString(merged.ecosystem, "npm").toLowerCase();
  merged.fail_on_severities = [
    ...new Set(
      merged.fail_on_severities
        .map((item) => normalizeSeverity(item, ""))
        .filter(Boolean),
    ),
  ];
  merged.warn_on_severities = [
    ...new Set(
      merged.warn_on_severities
        .map((item) => normalizeSeverity(item, ""))
        .filter(Boolean),
    ),
  ];
  merged.min_report_severity = normalizeSeverity(
    merged.min_report_severity,
    "unknown",
  );
  merged.ignored_vulnerabilities = [
    ...new Set(
      merged.ignored_vulnerabilities
        .map((item) => normalizeString(item).toUpperCase())
        .filter(Boolean),
    ),
  ];
  merged.ignored_packages = [
    ...new Set(
      merged.ignored_packages
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.ignored_licenses = [
    ...new Set(
      merged.ignored_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.denied_licenses = [
    ...new Set(
      merged.denied_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.allowed_licenses = [
    ...new Set(
      merged.allowed_licenses
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.max_vulnerability_rows = Math.max(1, merged.max_vulnerability_rows);
  merged.max_dependency_rows = Math.max(1, merged.max_dependency_rows);

  return merged;
}

function listFiles(dirPath, options = {}) {
  if (!isDirectory(dirPath)) return [];

  const files = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && options.recursive) {
      files.push(...listFiles(absolutePath, options));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function hasGlob(value) {
  return /[*?]/.test(String(value || ""));
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "*" && next === "*") {
      const afterDoubleStar = source[index + 2];

      if (afterDoubleStar === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }

      continue;
    }

    if (char === "*") {
      output += "[^/]*";
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += String(char).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  output += "$";

  return new RegExp(output);
}

function expandFilePatterns(patterns, repoRoot) {
  const files = [];

  for (const pattern of patterns) {
    const normalized = toPosixPath(pattern);

    if (!hasGlob(normalized)) {
      const absolute = resolvePath(normalized, repoRoot);

      if (isFile(absolute)) files.push(absolute);

      continue;
    }

    const regex = globToRegExp(normalized);

    for (const file of listFiles(repoRoot, { recursive: true })) {
      const relative = toRelativePath(file, repoRoot);

      if (regex.test(relative)) files.push(file);
    }
  }

  return [...new Set(files)];
}

function looksLikeDependencyReport(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  if (
    ![".json", ".jsonc", ".ndjson", ".jsonl", ".sbom", ".spdx"].includes(
      extension,
    )
  )
    return false;
  if (basename === "package.json") return false;

  return (
    basename.includes("audit") ||
    basename.includes("dependency") ||
    basename.includes("dependencies") ||
    basename.includes("deps") ||
    basename.includes("osv") ||
    basename.includes("snyk") ||
    basename.includes("sbom") ||
    basename.includes("cyclonedx") ||
    basename.includes("spdx") ||
    basename.includes("vulnerab")
  );
}

function discoverReportFiles(args, repoRoot) {
  const explicit = args.report_files
    .map((filePath) => resolvePath(filePath, repoRoot))
    .filter(isFile);

  const discovered = args.input_dirs
    .flatMap((dirPath) =>
      listFiles(resolvePath(dirPath, repoRoot), { recursive: args.recursive }),
    )
    .filter(looksLikeDependencyReport);

  return [...new Set([...explicit, ...discovered])].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right)),
  );
}

function discoverManifestFiles(args, repoRoot) {
  if (!args.include_inventory) return [];

  return expandFilePatterns(args.manifest_files, repoRoot)
    .filter(
      (filePath) => path.basename(filePath).toLowerCase() === "package.json",
    )
    .sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right)));
}

function dependencyFingerprint(parts) {
  const stable = parts
    .map((item) => normalizeString(item).toLowerCase())
    .join("|");

  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function normalizeDependency(raw, context) {
  const packageName = normalizeString(
    raw.package_name ||
      raw.packageName ||
      raw.name ||
      raw.component_name ||
      raw.componentName ||
      raw.bom_ref ||
      raw["SPDXID"] ||
      "",
  );

  const version = normalizeString(
    raw.version ||
      raw.installed_version ||
      raw.installedVersion ||
      raw.purl?.split("@").pop() ||
      "",
  );

  const dependencyType = normalizeString(
    raw.dependency_type ||
      raw.dependencyType ||
      raw.scope ||
      raw.type ||
      context.dependency_type ||
      "unknown",
  ).toLowerCase();

  const direct =
    raw.direct === undefined
      ? Boolean(context.direct)
      : normalizeBoolean(raw.direct, Boolean(context.direct));

  const dev =
    raw.dev === undefined
      ? Boolean(context.dev)
      : normalizeBoolean(raw.dev, Boolean(context.dev));

  const license = normalizeLicense(
    raw.license ||
      raw.licenses ||
      raw.licenseDeclared ||
      raw.licenseConcluded ||
      "",
  );

  const ecosystem = normalizeString(
    raw.ecosystem || context.ecosystem || "npm",
  ).toLowerCase();

  return {
    source: context.source,
    source_file: context.source_file,
    fingerprint: dependencyFingerprint([
      ecosystem,
      packageName,
      version,
      context.source_file,
      dependencyType,
    ]),
    package_name: packageName,
    version,
    ecosystem,
    dependency_type: dependencyType,
    direct,
    dev,
    transitive: !direct,
    license,
    purl: normalizeString(raw.purl || raw.package_url || raw.packageUrl || ""),
    path: normalizeString(raw.path || context.path || ""),
  };
}

function normalizeVulnerability(raw, context) {
  const id = normalizeString(
    raw.id ||
      raw.vulnerability_id ||
      raw.vulnerabilityId ||
      raw.VulnerabilityID ||
      raw.cve ||
      raw.cves ||
      raw.source ||
      raw.url ||
      raw.advisory_id ||
      raw.advisoryId ||
      raw.ghsa_id ||
      raw.ghsaId ||
      raw.name ||
      "",
  ).toUpperCase();

  const packageName = normalizeString(
    raw.package_name ||
      raw.packageName ||
      raw.module_name ||
      raw.moduleName ||
      raw.package ||
      raw.dependency ||
      raw.name ||
      raw.pkgName ||
      raw.PkgName ||
      context.package_name ||
      "",
  );

  const installedVersion = normalizeString(
    raw.installed_version ||
      raw.installedVersion ||
      raw.version ||
      raw.current_version ||
      raw.currentVersion ||
      context.installed_version ||
      "",
  );

  const fixedVersion = normalizeString(
    raw.fixed_version ||
      raw.fixedVersion ||
      raw.patched_version ||
      raw.patchedVersion ||
      raw.patched_versions ||
      raw.patchedVersions ||
      raw.fixAvailable?.version ||
      raw.fix_available?.version ||
      raw.fix?.version ||
      raw.fix?.versions ||
      raw.first_patched_version?.identifier ||
      raw.firstPatchedVersion?.identifier ||
      "",
  );

  const vulnerableRange = normalizeString(
    raw.vulnerable_version_range ||
      raw.vulnerableVersionRange ||
      raw.vulnerable_versions ||
      raw.vulnerableVersions ||
      raw.range ||
      raw.semver?.vulnerable ||
      "",
  );

  const cvss = normalizeFloat(
    raw.cvss ||
      raw.cvss_score ||
      raw.cvssScore ||
      raw.cvss?.score ||
      raw.cvss?.[0]?.metrics?.baseScore ||
      raw.cvss?.nvd?.V3Score ||
      0,
    0,
  );

  const severity = normalizeSeverity(
    raw.severity ||
      raw.Severity ||
      raw.cvssSeverity ||
      raw.security_severity ||
      raw.securitySeverity ||
      severityFromCvss(cvss),
    "unknown",
  );

  const title = normalizeString(
    raw.title ||
      raw.summary ||
      raw.name ||
      raw.vulnerability ||
      raw.message ||
      raw.id ||
      id ||
      "Dependency vulnerability",
  );

  const description = normalizeString(
    raw.description ||
      raw.overview ||
      raw.details ||
      raw.body ||
      raw.recommendation ||
      "",
  );

  const cve = normalizeString(
    raw.cve || (Array.isArray(raw.cves) ? raw.cves.join(", ") : raw.cves) || "",
  ).toUpperCase();

  const cwe = normalizeString(
    raw.cwe ||
      (Array.isArray(raw.cwe) ? raw.cwe.join(", ") : "") ||
      (Array.isArray(raw.cwes)
        ? raw.cwes.map((item) => item.cwe_id || item.name || item).join(", ")
        : raw.cwes) ||
      "",
  ).toUpperCase();

  const advisoryUrl = normalizeUrl(
    raw.url ||
      raw.advisory_url ||
      raw.advisoryUrl ||
      raw.source_url ||
      raw.sourceUrl ||
      raw.references?.[0] ||
      "",
  );

  const references = [
    ...new Set(
      normalizeStringList(raw.references || raw.urls || raw.URLs || [])
        .map(normalizeUrl)
        .filter(Boolean),
    ),
  ];

  const direct =
    raw.direct === undefined
      ? Boolean(context.direct)
      : normalizeBoolean(raw.direct, Boolean(context.direct));

  const dev =
    raw.dev === undefined
      ? Boolean(context.dev)
      : normalizeBoolean(raw.dev, Boolean(context.dev));

  const ecosystem = normalizeString(
    raw.ecosystem || context.ecosystem || "npm",
  ).toLowerCase();
  const pathValue = normalizeString(
    raw.path ||
      raw.file ||
      raw.manifest_path ||
      raw.manifestPath ||
      context.path ||
      "",
  );

  const fingerprint = dependencyFingerprint([
    ecosystem,
    packageName,
    installedVersion,
    id,
    cve,
    title,
    pathValue,
    context.source_file,
  ]);

  return {
    source: context.source,
    source_file: context.source_file,
    fingerprint,
    id,
    title,
    description,
    severity,
    cvss,
    cve,
    cwe,
    package_name: packageName,
    ecosystem,
    installed_version: installedVersion,
    fixed_version: fixedVersion,
    fixed: Boolean(fixedVersion),
    vulnerable_range: vulnerableRange,
    direct,
    dev,
    transitive: !direct,
    path: pathValue,
    advisory_url: advisoryUrl,
    references,
  };
}

function parsePackageJson(data, context) {
  const dependencies = [];
  const sections = [
    ["dependencies", "production", false],
    ["devDependencies", "development", true],
    ["peerDependencies", "peer", false],
    ["optionalDependencies", "optional", false],
    ["bundledDependencies", "bundled", false],
    ["bundleDependencies", "bundled", false],
  ];

  for (const [section, dependencyType, dev] of sections) {
    const entries = data?.[section];

    if (!entries || typeof entries !== "object") continue;

    if (Array.isArray(entries)) {
      for (const name of entries) {
        dependencies.push(
          normalizeDependency(
            {
              name,
              version: "",
            },
            {
              ...context,
              dependency_type: dependencyType,
              dev,
              direct: true,
            },
          ),
        );
      }

      continue;
    }

    for (const [name, version] of Object.entries(entries)) {
      dependencies.push(
        normalizeDependency(
          {
            name,
            version,
          },
          {
            ...context,
            dependency_type: dependencyType,
            dev,
            direct: true,
          },
        ),
      );
    }
  }

  return {
    dependencies,
    vulnerabilities: [],
    metadata: {
      source: "package-json",
      source_file: context.source_file,
      name: normalizeString(data?.name),
      version: normalizeString(data?.version),
      dependency_count: dependencies.length,
      vulnerability_count: 0,
    },
  };
}

function parseNpmAudit(data, context) {
  const vulnerabilities = [];
  const dependencies = [];

  if (data?.vulnerabilities && typeof data.vulnerabilities === "object") {
    for (const [name, vuln] of Object.entries(data.vulnerabilities)) {
      const viaItems = asArray(vuln.via).filter(
        (item) => item && typeof item === "object",
      );

      if (viaItems.length) {
        for (const via of viaItems) {
          vulnerabilities.push(
            normalizeVulnerability(
              {
                ...via,
                package_name: name,
                installed_version: vuln.version,
                vulnerable_version_range: vuln.range,
                fixed_version: vuln.fixAvailable?.version || "",
                direct: Boolean(vuln.isDirect),
                dev: Boolean(vuln.dev),
              },
              context,
            ),
          );
        }
      } else {
        vulnerabilities.push(
          normalizeVulnerability(
            {
              id: name,
              title: `${name} vulnerability`,
              severity: vuln.severity,
              package_name: name,
              installed_version: vuln.version,
              vulnerable_version_range: vuln.range,
              fixed_version: vuln.fixAvailable?.version || "",
              direct: Boolean(vuln.isDirect),
              dev: Boolean(vuln.dev),
            },
            context,
          ),
        );
      }
    }
  }

  if (data?.advisories && typeof data.advisories === "object") {
    for (const advisory of Object.values(data.advisories)) {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: advisory.id || advisory.github_advisory_id,
            title: advisory.title,
            description: advisory.overview,
            severity: advisory.severity,
            cvss: advisory.cvss,
            cve: advisory.cves,
            cwe: advisory.cwe,
            package_name: advisory.module_name,
            vulnerable_versions: advisory.vulnerable_versions,
            patched_versions: advisory.patched_versions,
            url: advisory.url,
            recommendation: advisory.recommendation,
          },
          context,
        ),
      );
    }
  }

  return {
    dependencies,
    vulnerabilities,
    metadata: {
      source: "npm-audit",
      source_file: context.source_file,
      dependency_count: dependencies.length,
      vulnerability_count: vulnerabilities.length,
      audit_report_version: normalizeInteger(data?.auditReportVersion, 0),
    },
  };
}

function parseYarnAudit(data, context) {
  const vulnerabilities = [];
  const entries = Array.isArray(data) ? data : asArray(data);

  for (const entry of entries) {
    const advisory = entry?.data?.advisory || entry?.advisory || entry;

    if (!advisory || typeof advisory !== "object") continue;

    if (
      !advisory.module_name &&
      !advisory.package_name &&
      !advisory.title &&
      !advisory.severity
    )
      continue;

    vulnerabilities.push(
      normalizeVulnerability(
        {
          id: advisory.id || advisory.github_advisory_id,
          title: advisory.title,
          description: advisory.overview,
          severity: advisory.severity,
          cvss: advisory.cvss,
          cve: advisory.cves,
          cwe: advisory.cwe,
          package_name: advisory.module_name || advisory.package_name,
          vulnerable_versions: advisory.vulnerable_versions,
          patched_versions: advisory.patched_versions,
          url: advisory.url,
          recommendation: advisory.recommendation,
        },
        {
          ...context,
          source: "yarn-audit",
        },
      ),
    );
  }

  return {
    dependencies: [],
    vulnerabilities,
    metadata: {
      source: "yarn-audit",
      source_file: context.source_file,
      dependency_count: 0,
      vulnerability_count: vulnerabilities.length,
    },
  };
}

function parseOsv(data, context) {
  const vulnerabilities = [];

  for (const result of data?.results || []) {
    const packageName = normalizeString(
      result.package?.name || result.package_name || "",
    );
    const ecosystem = normalizeString(
      result.package?.ecosystem || context.ecosystem || "npm",
    ).toLowerCase();

    for (const vuln of result.vulnerabilities || result.vulns || []) {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: vuln.id,
            title: vuln.summary || vuln.id,
            description: vuln.details,
            aliases: vuln.aliases,
            package_name: packageName,
            ecosystem,
            references: (vuln.references || []).map((item) => item.url || item),
            severity: vuln.database_specific?.severity || "",
            cve: (vuln.aliases || [])
              .filter((item) => /^CVE-/i.test(item))
              .join(", "),
          },
          {
            ...context,
            source: "osv",
            ecosystem,
          },
        ),
      );
    }
  }

  if (Array.isArray(data?.vulns)) {
    for (const vuln of data.vulns) {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: vuln.id,
            title: vuln.summary || vuln.id,
            description: vuln.details,
            references: (vuln.references || []).map((item) => item.url || item),
            cve: (vuln.aliases || [])
              .filter((item) => /^CVE-/i.test(item))
              .join(", "),
          },
          {
            ...context,
            source: "osv",
          },
        ),
      );
    }
  }

  return {
    dependencies: [],
    vulnerabilities,
    metadata: {
      source: "osv",
      source_file: context.source_file,
      dependency_count: 0,
      vulnerability_count: vulnerabilities.length,
    },
  };
}

function parseCycloneDx(data, context) {
  const dependencies = [];
  const vulnerabilities = [];

  for (const component of data?.components || []) {
    dependencies.push(
      normalizeDependency(
        {
          name: component.name,
          version: component.version,
          purl: component.purl,
          licenses: component.licenses,
          type: component.type,
        },
        {
          ...context,
          source: "cyclonedx",
          ecosystem:
            component.purl?.split(":")[1]?.split("/")[0] || context.ecosystem,
          direct: false,
          dependency_type: component.type || "library",
        },
      ),
    );
  }

  for (const vuln of data?.vulnerabilities || []) {
    const affects = asArray(vuln.affects);

    if (affects.length) {
      for (const affected of affects) {
        vulnerabilities.push(
          normalizeVulnerability(
            {
              id: vuln.id,
              title: vuln.description || vuln.id,
              description: vuln.detail || vuln.description,
              severity: vuln.ratings?.[0]?.severity,
              cvss: vuln.ratings?.[0]?.score,
              cwe: vuln.cwes,
              package_name: affected.ref,
              references: vuln.references?.map((item) => item.url || item),
              fixed_version:
                affected.versions?.find((item) => item.status === "unaffected")
                  ?.version || "",
            },
            {
              ...context,
              source: "cyclonedx",
            },
          ),
        );
      }
    } else {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: vuln.id,
            title: vuln.description || vuln.id,
            description: vuln.detail || vuln.description,
            severity: vuln.ratings?.[0]?.severity,
            cvss: vuln.ratings?.[0]?.score,
            cwe: vuln.cwes,
            references: vuln.references?.map((item) => item.url || item),
          },
          {
            ...context,
            source: "cyclonedx",
          },
        ),
      );
    }
  }

  return {
    dependencies,
    vulnerabilities,
    metadata: {
      source: "cyclonedx",
      source_file: context.source_file,
      bom_format: normalizeString(data?.bomFormat),
      spec_version: normalizeString(data?.specVersion),
      dependency_count: dependencies.length,
      vulnerability_count: vulnerabilities.length,
    },
  };
}

function parseSpdx(data, context) {
  const dependencies = [];

  for (const pkg of data?.packages || []) {
    dependencies.push(
      normalizeDependency(
        {
          name: pkg.name,
          version: pkg.versionInfo,
          licenseDeclared: pkg.licenseDeclared,
          licenseConcluded: pkg.licenseConcluded,
          SPDXID: pkg.SPDXID,
        },
        {
          ...context,
          source: "spdx",
          direct: false,
          dependency_type: "library",
        },
      ),
    );
  }

  return {
    dependencies,
    vulnerabilities: [],
    metadata: {
      source: "spdx",
      source_file: context.source_file,
      name: normalizeString(data?.name),
      spdx_version: normalizeString(data?.spdxVersion),
      dependency_count: dependencies.length,
      vulnerability_count: 0,
    },
  };
}

function parseGenericReport(data, context) {
  const dependencies = [];
  const vulnerabilities = [];

  const rawDependencies = [
    ...asArray(data?.dependencies),
    ...asArray(data?.dependency_inventory),
    ...asArray(data?.packages),
    ...asArray(data?.components),
  ];

  for (const dependency of rawDependencies) {
    if (!dependency || typeof dependency !== "object") continue;
    if (dependency.vulnerabilities || dependency.vulns) continue;

    dependencies.push(normalizeDependency(dependency, context));
  }

  const rawVulnerabilities = [
    ...asArray(data?.vulnerabilities),
    ...asArray(data?.findings),
    ...asArray(data?.security_findings),
    ...asArray(data?.results),
    ...asArray(data?.alerts),
    ...asArray(data?.advisories),
    ...asArray(data?.matches),
  ];

  for (const item of rawVulnerabilities) {
    if (!item || typeof item !== "object") continue;

    if (item.vulnerability || item.artifact) {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            ...(item.vulnerability || {}),
            package_name: item.artifact?.name,
            installed_version: item.artifact?.version,
            fixed_version: item.vulnerability?.fix?.versions || "",
          },
          context,
        ),
      );
      continue;
    }

    vulnerabilities.push(normalizeVulnerability(item, context));
  }

  return {
    dependencies,
    vulnerabilities,
    metadata: {
      source: context.source,
      source_file: context.source_file,
      dependency_count: dependencies.length,
      vulnerability_count: vulnerabilities.length,
    },
  };
}

function detectReportType(data, filePath) {
  const basename = path.basename(filePath).toLowerCase();

  if (basename === "package.json" && data?.dependencies) return "package-json";
  if (data?.auditReportVersion || data?.vulnerabilities) return "npm-audit";
  if (
    Array.isArray(data) &&
    data.some((item) => item?.type === "auditAdvisory")
  )
    return "yarn-audit";
  if (
    data?.results &&
    Array.isArray(data.results) &&
    data.results.some((item) => item?.package && item?.vulnerabilities)
  )
    return "osv";
  if (data?.bomFormat === "CycloneDX") return "cyclonedx";
  if (data?.spdxVersion || Array.isArray(data?.packages)) return "spdx";
  if (basename.includes("osv")) return "osv";
  if (basename.includes("yarn")) return "yarn-audit";
  if (
    basename.includes("pnpm") ||
    basename.includes("npm") ||
    basename.includes("audit")
  )
    return "npm-audit";
  if (basename.includes("cyclonedx") || basename.includes("sbom"))
    return "cyclonedx";
  if (basename.includes("spdx")) return "spdx";

  return "generic";
}

function parseReportFile(filePath, repoRoot, args) {
  const data = readDataFile(filePath, repoRoot);
  const sourceFile = toRelativePath(filePath, repoRoot);

  if (!data || (Array.isArray(data) && !data.length)) {
    return {
      dependencies: [],
      vulnerabilities: [],
      metadata: null,
      error: `Invalid dependency report file: ${sourceFile}`,
    };
  }

  const reportType = detectReportType(data, filePath);
  const context = {
    source: reportType,
    source_file: sourceFile,
    ecosystem: args.ecosystem,
    package_name: "",
    installed_version: "",
    path: sourceFile,
    direct: false,
    dev: false,
    dependency_type: "unknown",
  };

  try {
    if (reportType === "package-json") return parsePackageJson(data, context);
    if (reportType === "npm-audit") return parseNpmAudit(data, context);
    if (reportType === "yarn-audit") return parseYarnAudit(data, context);
    if (reportType === "osv") return parseOsv(data, context);
    if (reportType === "cyclonedx") return parseCycloneDx(data, context);
    if (reportType === "spdx") return parseSpdx(data, context);

    return parseGenericReport(data, context);
  } catch (err) {
    return {
      dependencies: [],
      vulnerabilities: [],
      metadata: null,
      error: `Unable to parse ${sourceFile}: ${logger.formatError(err)}`,
    };
  }
}

function shouldIncludeVulnerability(args, vulnerability) {
  if (
    severityRank(vulnerability.severity) <
    severityRank(args.min_report_severity)
  )
    return false;
  if (!args.include_dev_dependencies && vulnerability.dev) return false;
  if (!args.include_transitive_dependencies && vulnerability.transitive)
    return false;
  if (args.ignored_vulnerabilities.includes(vulnerability.id.toUpperCase()))
    return false;
  if (args.ignored_packages.includes(vulnerability.package_name.toLowerCase()))
    return false;

  return true;
}

function shouldIncludeDependency(args, dependency) {
  if (!args.include_dev_dependencies && dependency.dev) return false;
  if (!args.include_transitive_dependencies && dependency.transitive)
    return false;
  if (args.ignored_packages.includes(dependency.package_name.toLowerCase()))
    return false;

  return true;
}

function dedupeDependencies(dependencies) {
  const map = new Map();

  for (const dependency of dependencies) {
    const key = [
      dependency.ecosystem,
      dependency.package_name,
      dependency.version,
      dependency.source_file,
      dependency.dependency_type,
    ]
      .map((item) => normalizeString(item).toLowerCase())
      .join("|");

    if (!map.has(key)) {
      map.set(key, dependency);
    }
  }

  return [...map.values()];
}

function dedupeVulnerabilities(vulnerabilities) {
  const map = new Map();

  for (const vulnerability of vulnerabilities) {
    const key = [
      vulnerability.ecosystem,
      vulnerability.package_name,
      vulnerability.installed_version,
      vulnerability.id,
      vulnerability.cve,
      vulnerability.path,
    ]
      .map((item) => normalizeString(item).toLowerCase())
      .join("|");

    if (!map.has(key)) {
      map.set(key, vulnerability);
      continue;
    }

    const existing = map.get(key);

    if (!existing.fixed && vulnerability.fixed) {
      map.set(key, vulnerability);
    }
  }

  return [...map.values()];
}

function countBy(items, getter) {
  const counts = {};

  for (const item of items) {
    const key = normalizeString(getter(item), "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function limitViolation(name, count, maxAllowed) {
  if (maxAllowed < 0) return null;
  if (count <= maxAllowed) return null;

  return {
    name,
    count,
    max_allowed: maxAllowed,
    message: `Found ${count} ${name} dependency vulnerability/vulnerabilities; maximum allowed is ${maxAllowed}.`,
  };
}

function licenseMatches(license, values) {
  const normalized = normalizeString(license).toLowerCase();

  if (!normalized) return false;

  return values.some(
    (value) => normalized === value || normalized.includes(value),
  );
}

function analyzeDependencies(args, loadResult) {
  const vulnerabilities = loadResult.vulnerabilities.filter((vulnerability) =>
    shouldIncludeVulnerability(args, vulnerability),
  );

  const dependencies = loadResult.dependencies.filter((dependency) =>
    shouldIncludeDependency(args, dependency),
  );

  const severityCounts = {
    critical: vulnerabilities.filter((item) => item.severity === "critical")
      .length,
    high: vulnerabilities.filter((item) => item.severity === "high").length,
    medium: vulnerabilities.filter((item) => item.severity === "medium").length,
    low: vulnerabilities.filter((item) => item.severity === "low").length,
    info: vulnerabilities.filter((item) => item.severity === "info").length,
    unknown: vulnerabilities.filter((item) => item.severity === "unknown")
      .length,
  };

  const failingSeverityVulnerabilities = vulnerabilities.filter((item) =>
    args.fail_on_severities.includes(item.severity),
  );

  const warningSeverityVulnerabilities = vulnerabilities.filter((item) =>
    args.warn_on_severities.includes(item.severity),
  );

  const thresholdViolations = [
    limitViolation("total", vulnerabilities.length, args.max_total),
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("info", severityCounts.info, args.max_info),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  const deniedLicenseDependencies = dependencies.filter(
    (dependency) =>
      dependency.license &&
      !licenseMatches(dependency.license, args.ignored_licenses) &&
      licenseMatches(dependency.license, args.denied_licenses),
  );

  const unapprovedLicenseDependencies = args.allowed_licenses.length
    ? dependencies.filter(
        (dependency) =>
          dependency.license &&
          !licenseMatches(dependency.license, args.ignored_licenses) &&
          !licenseMatches(dependency.license, args.allowed_licenses),
      )
    : [];

  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];

  if (
    args.require_results &&
    !loadResult.dependencies.length &&
    !loadResult.vulnerabilities.length
  ) {
    errors.push("No dependency inventory or vulnerability results were found.");
  }

  if (args.fail_if_vulnerabilities && vulnerabilities.length) {
    errors.push(
      `Dependency scan found ${vulnerabilities.length} active vulnerability/vulnerabilities.`,
    );
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
  }

  if (args.fail_on_denied_licenses) {
    errors.push(
      ...deniedLicenseDependencies.map(
        (dependency) =>
          `${dependency.package_name}: denied license "${dependency.license}"`,
      ),
    );
  } else {
    warnings.push(
      ...deniedLicenseDependencies.map(
        (dependency) =>
          `${dependency.package_name}: denied license "${dependency.license}"`,
      ),
    );
  }

  if (args.fail_on_unapproved_licenses) {
    errors.push(
      ...unapprovedLicenseDependencies.map(
        (dependency) =>
          `${dependency.package_name}: unapproved license "${dependency.license}"`,
      ),
    );
  } else if (unapprovedLicenseDependencies.length) {
    warnings.push(
      ...unapprovedLicenseDependencies.map(
        (dependency) =>
          `${dependency.package_name}: unapproved license "${dependency.license}"`,
      ),
    );
  }

  errors.push(
    ...failingSeverityVulnerabilities.map(
      (item) =>
        `${item.id || "UNKNOWN"}: ${item.package_name || "unknown package"} (${item.severity})`,
    ),
  );

  warnings.push(
    ...warningSeverityVulnerabilities.map(
      (item) =>
        `${item.id || "UNKNOWN"}: ${item.package_name || "unknown package"} (${item.severity})`,
    ),
  );

  const ok = errors.length === 0;

  return {
    dependencies,
    vulnerabilities,
    failing_vulnerabilities: failingSeverityVulnerabilities,
    warning_vulnerabilities: warningSeverityVulnerabilities,
    denied_license_dependencies: deniedLicenseDependencies,
    unapproved_license_dependencies: unapprovedLicenseDependencies,
    severity_counts: severityCounts,
    ecosystem_counts: countBy(
      dependencies,
      (item) => item.ecosystem || "unknown",
    ),
    dependency_type_counts: countBy(
      dependencies,
      (item) => item.dependency_type || "unknown",
    ),
    package_counts: countBy(
      vulnerabilities,
      (item) => item.package_name || "unknown",
    ),
    vulnerability_counts: countBy(
      vulnerabilities,
      (item) => item.id || "unknown",
    ),
    license_counts: countBy(
      dependencies.filter((item) => item.license),
      (item) => item.license,
    ),
    source_counts: countBy(
      [...dependencies, ...vulnerabilities],
      (item) => item.source || "unknown",
    ),
    fixed_count: vulnerabilities.filter((item) => item.fixed).length,
    unfixed_count: vulnerabilities.filter((item) => !item.fixed).length,
    direct_vulnerability_count: vulnerabilities.filter((item) => item.direct)
      .length,
    transitive_vulnerability_count: vulnerabilities.filter(
      (item) => item.transitive,
    ).length,
    dev_vulnerability_count: vulnerabilities.filter((item) => item.dev).length,
    threshold_violations: thresholdViolations,
    errors,
    warnings,
    status: ok
      ? warnings.length || warningSeverityVulnerabilities.length
        ? "warning"
        : "passed"
      : "failed",
    ok,
  };
}

function loadDependencyData(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const metadata = [];
  const dependencies = [];
  const vulnerabilities = [];

  const reportFiles = discoverReportFiles(args, repoRoot);
  const manifestFiles = discoverManifestFiles(args, repoRoot);
  const allFiles = [...new Set([...reportFiles, ...manifestFiles])];

  for (const filePath of allFiles) {
    const parsed = parseReportFile(filePath, repoRoot, args);

    if (parsed.error) {
      if (args.fail_on_invalid_input) {
        errors.push(parsed.error);
      } else {
        warnings.push(parsed.error);
      }

      continue;
    }

    if (parsed.metadata) {
      metadata.push(parsed.metadata);
    }

    dependencies.push(...parsed.dependencies);
    vulnerabilities.push(...parsed.vulnerabilities);
  }

  return {
    report_files: reportFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    manifest_files: manifestFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    metadata,
    dependencies: dedupeDependencies(dependencies),
    vulnerabilities: dedupeVulnerabilities(vulnerabilities),
    errors,
    warnings,
  };
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (value < 1000) return `${value}ms`;

  const seconds = value / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  loadResult,
  analysis,
  startedAt,
) {
  const github = getGitMetadata(repoRoot);
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();

  return {
    schema_version: 1,
    type: "security-summarize-dependencies",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: endedAt.toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      report_files: loadResult.report_files,
      manifest_files: loadResult.manifest_files,
      input_dirs: args.input_dirs,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      ecosystem: args.ecosystem,
      min_report_severity: args.min_report_severity,
      fail_on_severities: args.fail_on_severities,
      warn_on_severities: args.warn_on_severities,
      max_by_severity: {
        critical: args.max_critical,
        high: args.max_high,
        medium: args.max_medium,
        low: args.max_low,
        info: args.max_info,
        unknown: args.max_unknown,
      },
      max_total: args.max_total,
      include_dev_dependencies: args.include_dev_dependencies,
      include_transitive_dependencies: args.include_transitive_dependencies,
      include_inventory: args.include_inventory,
      ignored_vulnerabilities: args.ignored_vulnerabilities,
      ignored_packages: args.ignored_packages,
      denied_licenses: args.denied_licenses,
      allowed_licenses: args.allowed_licenses,
      require_results: args.require_results,
      fail_if_vulnerabilities: args.fail_if_vulnerabilities,
      fail_on_threshold: args.fail_on_threshold,
      fail_on_denied_licenses: args.fail_on_denied_licenses,
      fail_on_unapproved_licenses: args.fail_on_unapproved_licenses,
      dry_run: args.dry_run,
    },
    dependency_scan: {
      inputs: loadResult.metadata,
      dependencies: analysis.dependencies,
      vulnerabilities: analysis.vulnerabilities,
      failing_vulnerabilities: analysis.failing_vulnerabilities,
      warning_vulnerabilities: analysis.warning_vulnerabilities,
      denied_license_dependencies: analysis.denied_license_dependencies,
      unapproved_license_dependencies: analysis.unapproved_license_dependencies,
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      ecosystem_counts: analysis.ecosystem_counts,
      dependency_type_counts: analysis.dependency_type_counts,
      package_counts: analysis.package_counts,
      vulnerability_counts: analysis.vulnerability_counts,
      license_counts: analysis.license_counts,
      source_counts: analysis.source_counts,
      fixed_count: analysis.fixed_count,
      unfixed_count: analysis.unfixed_count,
      direct_vulnerability_count: analysis.direct_vulnerability_count,
      transitive_vulnerability_count: analysis.transitive_vulnerability_count,
      dev_vulnerability_count: analysis.dev_vulnerability_count,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      report_files: loadResult.report_files.length,
      manifest_files: loadResult.manifest_files.length,
      inputs: loadResult.metadata.length,
      dependencies: analysis.dependencies.length,
      vulnerabilities: analysis.vulnerabilities.length,
      failing_vulnerabilities: analysis.failing_vulnerabilities.length,
      warning_vulnerabilities: analysis.warning_vulnerabilities.length,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      info: analysis.severity_counts.info,
      unknown: analysis.severity_counts.unknown,
      fixed: analysis.fixed_count,
      unfixed: analysis.unfixed_count,
      direct_vulnerabilities: analysis.direct_vulnerability_count,
      transitive_vulnerabilities: analysis.transitive_vulnerability_count,
      dev_vulnerabilities: analysis.dev_vulnerability_count,
      denied_licenses: analysis.denied_license_dependencies.length,
      unapproved_licenses: analysis.unapproved_license_dependencies.length,
      packages_with_vulnerabilities: Object.keys(analysis.package_counts)
        .length,
      licenses: Object.keys(analysis.license_counts).length,
      threshold_violations: analysis.threshold_violations.length,
      errors: analysis.errors.length,
      warnings: analysis.warnings.length,
      duration_ms: durationMs,
      duration_human: formatDuration(durationMs),
      ok: analysis.ok,
    },
    errors: analysis.errors,
    warnings: analysis.warnings,
    status: analysis.status,
    ok: analysis.ok,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function sortedVulnerabilities(vulnerabilities) {
  return [...vulnerabilities].sort((left, right) => {
    const severityDiff =
      severityRank(right.severity) - severityRank(left.severity);

    if (severityDiff !== 0) return severityDiff;

    const leftId = left.id || "";
    const rightId = right.id || "";

    if (leftId !== rightId) return leftId.localeCompare(rightId);

    return (left.package_name || "").localeCompare(right.package_name || "");
  });
}

function sortedDependencies(dependencies) {
  return [...dependencies].sort((left, right) => {
    const sourceDiff = (left.source_file || "").localeCompare(
      right.source_file || "",
    );

    if (sourceDiff !== 0) return sourceDiff;

    return (left.package_name || "").localeCompare(right.package_name || "");
  });
}

function topEntries(counts, limit = 20) {
  return Object.entries(counts)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, limit);
}

function createMarkdownSummary(report) {
  const icon = report.ok ? (report.status === "warning" ? "⚠️" : "✅") : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Dependency Security Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Report files: \`${report.totals.report_files}\``,
    `- Manifest files: \`${report.totals.manifest_files}\``,
    `- Dependencies: \`${report.totals.dependencies}\``,
    `- Vulnerabilities: \`${report.totals.vulnerabilities}\``,
    `- Failing vulnerabilities: \`${report.totals.failing_vulnerabilities}\``,
    `- Warning vulnerabilities: \`${report.totals.warning_vulnerabilities}\``,
    `- Fixed available: \`${report.totals.fixed}\``,
    `- Unfixed: \`${report.totals.unfixed}\``,
    `- Denied licenses: \`${report.totals.denied_licenses}\``,
    `- Unapproved licenses: \`${report.totals.unapproved_licenses}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${escapeMarkdown(report.github.branch || "unknown")}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📊 Vulnerability Severity Counts",
    "",
    "| Severity | Count |",
    "|---|---:|",
    `| Critical | \`${report.totals.critical}\` |`,
    `| High | \`${report.totals.high}\` |`,
    `| Medium | \`${report.totals.medium}\` |`,
    `| Low | \`${report.totals.low}\` |`,
    `| Info | \`${report.totals.info}\` |`,
    `| Unknown | \`${report.totals.unknown}\` |`,
    "",
  ];

  if (report.dependency_scan.inputs.length) {
    lines.push("## 📥 Parsed Inputs");
    lines.push("");
    lines.push("| Source | Dependencies | Vulnerabilities | File |");
    lines.push("|---|---:|---:|---|");

    for (const input of report.dependency_scan.inputs) {
      lines.push(
        `| \`${escapeMarkdown(input.source || "unknown")}\` | \`${input.dependency_count || 0}\` | \`${input.vulnerability_count || 0}\` | \`${escapeMarkdown(input.source_file || "unknown")}\` |`,
      );
    }

    lines.push("");
  }

  if (report.analysis.threshold_violations.length) {
    lines.push("## 🚫 Threshold Violations");
    lines.push("");

    for (const violation of report.analysis.threshold_violations) {
      lines.push(`- ${escapeMarkdown(violation.message)}`);
    }

    lines.push("");
  }

  if (report.dependency_scan.vulnerabilities.length) {
    lines.push("## 🔐 Vulnerabilities");
    lines.push("");
    lines.push(
      "| Severity | ID | Package | Installed | Fixed | Direct | Dev | Source |",
    );
    lines.push("|---|---|---|---|---|---|---|---|");

    for (const vuln of sortedVulnerabilities(
      report.dependency_scan.vulnerabilities,
    ).slice(0, report.config.max_vulnerability_rows || 100)) {
      const source = vuln.advisory_url || vuln.source || "unknown";

      lines.push(
        `| \`${escapeMarkdown(vuln.severity)}\` | \`${escapeMarkdown(vuln.id || "unknown")}\` | \`${escapeMarkdown(vuln.package_name || "unknown")}\` | \`${escapeMarkdown(vuln.installed_version || "unknown")}\` | \`${escapeMarkdown(vuln.fixed_version || "unfixed")}\` | \`${vuln.direct ? "true" : "false"}\` | \`${vuln.dev ? "true" : "false"}\` | ${escapeMarkdown(source)} |`,
      );
    }

    if (
      report.dependency_scan.vulnerabilities.length >
      (report.config.max_vulnerability_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | … | \`${report.dependency_scan.vulnerabilities.length - (report.config.max_vulnerability_rows || 100)}\` more vulnerability/vulnerabilities omitted |`,
      );
    }

    lines.push("");
  }

  if (report.dependency_scan.denied_license_dependencies.length) {
    lines.push("## 🚫 Denied Licenses");
    lines.push("");
    lines.push("| Package | Version | License | Source |");
    lines.push("|---|---|---|---|");

    for (const dependency of report.dependency_scan.denied_license_dependencies.slice(
      0,
      100,
    )) {
      lines.push(
        `| \`${escapeMarkdown(dependency.package_name)}\` | \`${escapeMarkdown(dependency.version || "unknown")}\` | \`${escapeMarkdown(dependency.license || "unknown")}\` | \`${escapeMarkdown(dependency.source_file || "unknown")}\` |`,
      );
    }

    lines.push("");
  }

  const topPackages = topEntries(report.analysis.package_counts, 20);

  if (topPackages.length) {
    lines.push("## 📦 Most Vulnerable Packages");
    lines.push("");
    lines.push("| Package | Vulnerabilities |");
    lines.push("|---|---:|");

    for (const [pkg, count] of topPackages) {
      lines.push(`| \`${escapeMarkdown(pkg)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  const topLicenses = topEntries(report.analysis.license_counts, 20);

  if (topLicenses.length) {
    lines.push("## 📜 Most Common Licenses");
    lines.push("");
    lines.push("| License | Dependencies |");
    lines.push("|---|---:|");

    for (const [license, count] of topLicenses) {
      lines.push(`| \`${escapeMarkdown(license)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  if (report.dependency_scan.dependencies.length) {
    lines.push("## 🧩 Dependency Inventory");
    lines.push("");
    lines.push("| Package | Version | Type | Dev | License | Source |");
    lines.push("|---|---|---|---|---|---|");

    for (const dependency of sortedDependencies(
      report.dependency_scan.dependencies,
    ).slice(0, report.config.max_dependency_rows || 100)) {
      lines.push(
        `| \`${escapeMarkdown(dependency.package_name || "unknown")}\` | \`${escapeMarkdown(dependency.version || "unknown")}\` | \`${escapeMarkdown(dependency.dependency_type || "unknown")}\` | \`${dependency.dev ? "true" : "false"}\` | \`${escapeMarkdown(dependency.license || "unknown")}\` | \`${escapeMarkdown(dependency.source_file || "unknown")}\` |`,
      );
    }

    if (
      report.dependency_scan.dependencies.length >
      (report.config.max_dependency_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | \`${report.dependency_scan.dependencies.length - (report.config.max_dependency_rows || 100)}\` more dependency/dependencies omitted |`,
      );
    }

    lines.push("");
  }

  if (report.errors.length) {
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors.slice(0, 100)) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }

    if (report.errors.length > 100) {
      lines.push(`- ...and \`${report.errors.length - 100}\` more error(s).`);
    }

    lines.push("");
  }

  if (report.warnings.length) {
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, 100)) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }

    if (report.warnings.length > 100) {
      lines.push(
        `- ...and \`${report.warnings.length - 100}\` more warning(s).`,
      );
    }

    lines.push("");
  }

  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Ecosystem: \`${escapeMarkdown(report.config.ecosystem || "unknown")}\``,
  );
  lines.push(
    `- Include dev dependencies: \`${report.config.include_dev_dependencies ? "true" : "false"}\``,
  );
  lines.push(
    `- Include transitive dependencies: \`${report.config.include_transitive_dependencies ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if vulnerabilities: \`${report.config.fail_if_vulnerabilities ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail severities: \`${escapeMarkdown(report.config.fail_on_severities.join(", ") || "none")}\``,
  );
  lines.push(
    `- Warn severities: \`${escapeMarkdown(report.config.warn_on_severities.join(", ") || "none")}\``,
  );
  lines.push(
    `- Denied licenses: \`${escapeMarkdown(report.config.denied_licenses.join(", ") || "none")}\``,
  );

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
  );

  return `${lines.join("\n").trim()}\n`;
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) return false;

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);
  return true;
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) return false;

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(
    outputFile,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("dependency_summary_file", report.config.output_file);
  setGitHubOutput(
    "dependency_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("dependency_summary_status", report.status);
  setGitHubOutput("dependency_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "dependency_report_files",
    String(report.totals.report_files),
  );
  setGitHubOutput(
    "dependency_manifest_files",
    String(report.totals.manifest_files),
  );
  setGitHubOutput("dependency_count", String(report.totals.dependencies));
  setGitHubOutput(
    "dependency_vulnerabilities",
    String(report.totals.vulnerabilities),
  );
  setGitHubOutput(
    "dependency_failing_vulnerabilities",
    String(report.totals.failing_vulnerabilities),
  );
  setGitHubOutput(
    "dependency_warning_vulnerabilities",
    String(report.totals.warning_vulnerabilities),
  );

  setGitHubOutput("dependency_critical", String(report.totals.critical));
  setGitHubOutput("dependency_high", String(report.totals.high));
  setGitHubOutput("dependency_medium", String(report.totals.medium));
  setGitHubOutput("dependency_low", String(report.totals.low));
  setGitHubOutput("dependency_info", String(report.totals.info));
  setGitHubOutput("dependency_unknown", String(report.totals.unknown));

  setGitHubOutput("dependency_fixed", String(report.totals.fixed));
  setGitHubOutput("dependency_unfixed", String(report.totals.unfixed));
  setGitHubOutput(
    "dependency_denied_licenses",
    String(report.totals.denied_licenses),
  );
  setGitHubOutput(
    "dependency_unapproved_licenses",
    String(report.totals.unapproved_licenses),
  );

  setGitHubOutput("dependency_errors", String(report.totals.errors));
  setGitHubOutput("dependency_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "dependency_vulnerabilities_json",
    JSON.stringify(report.dependency_scan.vulnerabilities),
  );
  setGitHubOutput(
    "dependency_failing_vulnerabilities_json",
    JSON.stringify(report.dependency_scan.failing_vulnerabilities),
  );
  setGitHubOutput(
    "dependency_warning_vulnerabilities_json",
    JSON.stringify(report.dependency_scan.warning_vulnerabilities),
  );
  setGitHubOutput(
    "dependency_denied_licenses_json",
    JSON.stringify(report.dependency_scan.denied_license_dependencies),
  );
  setGitHubOutput("dependency_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("dependency_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  const startedAt = new Date();
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readDataFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing dependency security results.");

  const loadResult = loadDependencyData(args, repoRoot);
  const analysis = analyzeDependencies(args, loadResult);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    loadResult,
    analysis,
    startedAt,
  );

  const markdown = createMarkdownSummary(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(report);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
