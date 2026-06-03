#!/usr/bin/env node
// .github/scripts/security/summarize-secrets-scan.js
// =============================================================================
// Aerealith AI — Secrets Scan Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize secret scanning output from Gitleaks, TruffleHog, detect-secrets,
//   GitHub secret scanning alerts, SARIF-like scanners, and generic JSON/NDJSON
//   reports into clean JSON and Markdown reports for CI, release, and security
//   workflows.
//
// Input:
//   - Secret scan JSON/JSONC/NDJSON/SARIF file(s)
//   - Optional config file
//   - Direct CLI/env inputs
//
// Output:
//   - artifacts/security/summarize-secrets-scan.json
//   - artifacts/security/summarize-secrets-scan.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Read-only.
//   - Safe for pull requests.
//   - Raw secrets are never written to reports, summaries, logs, or outputs.
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
    info: (message) => console.log(`[summarize-secrets-scan] ${message}`),
    warn: (message) =>
      console.warn(`[summarize-secrets-scan] WARN: ${message}`),
    error: (message) =>
      console.error(`[summarize-secrets-scan] ERROR: ${message}`),
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
  ".github/security/summarize-secrets-scan.json",
  ".github/security/summarize-secrets-scan.jsonc",
  ".github/security/summarize-secrets-scan.yaml",
  ".github/security/summarize-secrets-scan.yml",
  ".github/security/secrets-scan-summary.json",
  ".github/security/secrets-scan-summary.jsonc",
  ".github/security/secrets-scan-summary.yaml",
  ".github/security/secrets-scan-summary.yml",
  ".github/repo/summarize-secrets-scan.json",
  ".github/repo/summarize-secrets-scan.jsonc",
  ".github/repo/summarize-secrets-scan.yaml",
  ".github/repo/summarize-secrets-scan.yml",
  ".github/summarize-secrets-scan.json",
  ".github/summarize-secrets-scan.jsonc",
  ".github/summarize-secrets-scan.yaml",
  ".github/summarize-secrets-scan.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security/secrets",
  "artifacts/security/secrets-scan",
  "artifacts/security/secret-scan",
  "artifacts/gitleaks",
  "artifacts/trufflehog",
  "artifacts/detect-secrets",
  "artifacts/secret-scanning",
  "results",
  ".outputs/secrets",
  ".outputs/secrets-scan",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-secrets-scan.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-secrets-scan.md";

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "info",
  "low",
  "medium",
  "high",
  "critical",
];
const DEFAULT_WARN_SEVERITIES = [];
const DEFAULT_FAIL_SEVERITIES = ["critical", "high"];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|DATABASE_URL=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

function normalizeState(value, fallback = "open") {
  const state = normalizeString(value, fallback).toLowerCase();

  if (["open", "active", "new", "unresolved"].includes(state)) return "open";
  if (["resolved", "closed", "fixed", "revoked", "remediated"].includes(state))
    return "resolved";
  if (
    ["false_positive", "false-positive", "ignored", "dismissed"].includes(state)
  )
    return "dismissed";

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

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function hashValue(value) {
  const source = normalizeString(value);

  if (!source) return "";

  return crypto.createHash("sha256").update(source).digest("hex");
}

function shortHash(value, length = 24) {
  const hashed = hashValue(value);

  return hashed ? hashed.slice(0, length) : "";
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function redactSecretValue(value) {
  const source = normalizeString(value);

  if (!source) return "";

  const redacted = redactOutput(source);

  if (redacted !== source) return redacted;

  if (source.length <= 8) return "[REDACTED]";

  return `${source.slice(0, 3)}…${source.slice(-3)}`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.SUMMARIZE_SECRETS_SCAN_CONFIG_FILE || "",

    scan_files: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_FILES ||
        process.env.SECRETS_SCAN_FILES ||
        process.env.SECRET_SCAN_FILES ||
        process.env.GITLEAKS_REPORT_FILES ||
        process.env.TRUFFLEHOG_REPORT_FILES ||
        "",
    ),

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_INPUT_DIRS ||
        process.env.SECRETS_SCAN_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_SECRETS_SCAN_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_SECRETS_SCAN_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    scanner:
      process.env.SUMMARIZE_SECRETS_SCAN_SCANNER ||
      process.env.SECRETS_SCANNER ||
      "",

    default_secret_severity: normalizeSeverity(
      process.env.SUMMARIZE_SECRETS_SCAN_DEFAULT_SEVERITY || "critical",
      "critical",
    ),

    fail_on_severities: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    min_report_severity: normalizeSeverity(
      process.env.SUMMARIZE_SECRETS_SCAN_MIN_REPORT_SEVERITY || "unknown",
      "unknown",
    ),

    max_critical: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_CRITICAL,
      0,
    ),
    max_high: normalizeInteger(process.env.SUMMARIZE_SECRETS_SCAN_MAX_HIGH, 0),
    max_medium: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_MEDIUM,
      -1,
    ),
    max_low: normalizeInteger(process.env.SUMMARIZE_SECRETS_SCAN_MAX_LOW, -1),
    max_info: normalizeInteger(process.env.SUMMARIZE_SECRETS_SCAN_MAX_INFO, -1),
    max_unknown: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_UNKNOWN,
      -1,
    ),
    max_total: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_TOTAL,
      0,
    ),
    max_verified: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_VERIFIED,
      0,
    ),

    ignored_fingerprints: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_IGNORED_FINGERPRINTS ||
        process.env.SECRETS_SCAN_IGNORED_FINGERPRINTS ||
        "",
    ),

    ignored_secret_types: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_IGNORED_SECRET_TYPES ||
        process.env.SECRETS_SCAN_IGNORED_SECRET_TYPES ||
        "",
    ),

    ignored_paths: normalizeStringList(
      process.env.SUMMARIZE_SECRETS_SCAN_IGNORED_PATHS ||
        process.env.SECRETS_SCAN_IGNORED_PATHS ||
        "",
    ),

    include_resolved: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_INCLUDE_RESOLVED,
      false,
    ),
    include_dismissed: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_INCLUDE_DISMISSED,
      false,
    ),
    include_unverified: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_INCLUDE_UNVERIFIED,
      true,
    ),
    include_raw_redacted_match: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_INCLUDE_REDACTED_MATCH,
      false,
    ),

    fail_if_secrets: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_IF_SECRETS,
      true,
    ),
    fail_on_verified: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_ON_VERIFIED,
      true,
    ),
    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_ON_THRESHOLD,
      true,
    ),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_ON_INVALID_INPUT,
      true,
    ),
    require_results: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_REQUIRE_RESULTS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_FAIL_ON_ERROR,
      true,
    ),

    recursive: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_RECURSIVE,
      true,
    ),
    max_secret_rows: normalizeInteger(
      process.env.SUMMARIZE_SECRETS_SCAN_MAX_ROWS,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_SECRETS_SCAN_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_SECRETS_SCAN_STEP_SUMMARY,
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
      arg === "--scan-file" ||
      arg === "--scan-files" ||
      arg === "--report-file" ||
      arg === "--file"
    ) {
      args.scan_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--scanner") {
      args.scanner = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--default-secret-severity" || arg === "--default-severity") {
      args.default_secret_severity = argv[index + 1];
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

    if (arg === "--max-verified") {
      args.max_verified = normalizeInteger(argv[index + 1], args.max_verified);
      index += 1;
      continue;
    }

    if (arg === "--ignore-fingerprint" || arg === "--ignored-fingerprint") {
      args.ignored_fingerprints.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignore-secret-type" || arg === "--ignored-secret-type") {
      args.ignored_secret_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignore-path" || arg === "--ignored-path") {
      args.ignored_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-resolved") {
      args.include_resolved = true;
      continue;
    }

    if (arg === "--no-include-resolved") {
      args.include_resolved = false;
      continue;
    }

    if (arg === "--include-dismissed") {
      args.include_dismissed = true;
      continue;
    }

    if (arg === "--no-include-dismissed") {
      args.include_dismissed = false;
      continue;
    }

    if (arg === "--include-unverified") {
      args.include_unverified = true;
      continue;
    }

    if (arg === "--no-unverified") {
      args.include_unverified = false;
      continue;
    }

    if (arg === "--include-redacted-match") {
      args.include_raw_redacted_match = true;
      continue;
    }

    if (arg === "--no-redacted-match") {
      args.include_raw_redacted_match = false;
      continue;
    }

    if (arg === "--fail-if-secrets") {
      args.fail_if_secrets = true;
      continue;
    }

    if (arg === "--no-fail-if-secrets") {
      args.fail_if_secrets = false;
      continue;
    }

    if (arg === "--fail-on-verified") {
      args.fail_on_verified = true;
      continue;
    }

    if (arg === "--no-fail-on-verified") {
      args.fail_on_verified = false;
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

    if (arg === "--fail-on-invalid-input") {
      args.fail_on_invalid_input = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-input") {
      args.fail_on_invalid_input = false;
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

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
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

    if (arg === "--max-rows") {
      args.max_secret_rows = normalizeInteger(
        argv[index + 1],
        args.max_secret_rows,
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
  args.scan_files = [
    ...new Set(args.scan_files.map(toPosixPath).filter(Boolean)),
  ];
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.scanner = normalizeString(args.scanner).toLowerCase();
  args.default_secret_severity = normalizeSeverity(
    args.default_secret_severity,
    "critical",
  );
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
  args.ignored_fingerprints = [
    ...new Set(args.ignored_fingerprints.map(normalizeString).filter(Boolean)),
  ];
  args.ignored_secret_types = [
    ...new Set(
      args.ignored_secret_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.ignored_paths = [
    ...new Set(args.ignored_paths.map(toPosixPath).filter(Boolean)),
  ];
  args.max_secret_rows = Math.max(1, args.max_secret_rows);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Secrets Scan Summary

Usage:
  node .github/scripts/security/summarize-secrets-scan.js [options]

Examples:
  node .github/scripts/security/summarize-secrets-scan.js --scan-file artifacts/security/gitleaks.json
  node .github/scripts/security/summarize-secrets-scan.js --input-dir artifacts/security/secrets
  node .github/scripts/security/summarize-secrets-scan.js --scanner gitleaks
  node .github/scripts/security/summarize-secrets-scan.js --max-total 0
  node .github/scripts/security/summarize-secrets-scan.js --fail-if-secrets
  node .github/scripts/security/summarize-secrets-scan.js --ignore-path "fixtures/**"

Supported scanner shapes:
  - Gitleaks JSON
  - TruffleHog JSON / NDJSON
  - detect-secrets JSON baseline
  - GitHub secret scanning alerts JSON
  - SARIF-like JSON
  - Generic JSON with secrets/findings/results/alerts arrays

Options:
      --repo <owner/repo>                 Repository slug.
      --config <file>                     Summary config file.
      --scan-file <file,list>             Secret scan report file(s).
      --input-dir <dir,list>              Directories to scan for reports.
      --scanner <name>                    Scanner name override.
      --default-secret-severity <level>   Default severity for findings. Default: critical.
      --fail-on-severities <list>         Severities that fail the summary.
      --warn-on-severities <list>         Severities that warn the summary.
      --min-report-severity <severity>    Minimum severity included in rows.
      --max-critical <number>             Max allowed critical findings. Default: 0.
      --max-high <number>                 Max allowed high findings. Default: 0.
      --max-medium <number>               Max allowed medium findings. -1 disables.
      --max-low <number>                  Max allowed low findings. -1 disables.
      --max-info <number>                 Max allowed info findings. -1 disables.
      --max-unknown <number>              Max allowed unknown findings. -1 disables.
      --max-total <number>                Max allowed total active findings. Default: 0.
      --max-verified <number>             Max allowed verified active findings. Default: 0.
      --ignore-fingerprint <id,list>      Finding fingerprints to ignore.
      --ignore-secret-type <type,list>    Secret types/rules to ignore.
      --ignore-path <path,list>           Path patterns to ignore.
      --include-resolved                  Include resolved findings in report.
      --include-dismissed                 Include dismissed findings in report.
      --include-unverified                Include unverified findings. Default.
      --no-unverified                     Exclude unverified findings.
      --include-redacted-match            Include redacted match snippets.
      --fail-if-secrets                   Fail if active secrets are found. Default.
      --no-fail-if-secrets                Do not fail on any secret by default.
      --fail-on-verified                  Fail on verified findings. Default.
      --no-fail-on-verified               Do not fail automatically on verified findings.
      --fail-on-threshold                 Fail when thresholds are exceeded. Default.
      --fail-on-invalid-input             Fail on invalid input files. Default.
      --require-results                   Fail when no scan results are found.
      --recursive                         Recursively scan input dirs. Default.
      --no-recursive                      Scan only direct files in input dirs.
      --max-rows <number>                 Max finding rows in Markdown. Default: 100.
      --fail-on-error                     Exit non-zero when summary is not ok. Default.
      --no-fail-on-error                  Do not fail workflow.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Evaluate but mark as dry run.
      --no-print                          Do not print JSON report.
      --no-step-summary                   Do not append GitHub step summary.
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
    extension === ".sarif"
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
    "scanner",
    "default_secret_severity",
    "min_report_severity",
  ];

  for (const key of stringKeys) {
    if (
      config[key] !== undefined &&
      (!merged[key] ||
        key === "min_report_severity" ||
        key === "default_secret_severity")
    ) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "scan_files",
    "input_dirs",
    "fail_on_severities",
    "warn_on_severities",
    "ignored_fingerprints",
    "ignored_secret_types",
    "ignored_paths",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "include_resolved",
    "include_dismissed",
    "include_unverified",
    "include_raw_redacted_match",
    "fail_if_secrets",
    "fail_on_verified",
    "fail_on_threshold",
    "fail_on_invalid_input",
    "require_results",
    "recursive",
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
    "max_verified",
    "max_secret_rows",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.scan_files = [
    ...new Set(merged.scan_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.input_dirs = [
    ...new Set(merged.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  merged.scanner = normalizeString(merged.scanner).toLowerCase();
  merged.default_secret_severity = normalizeSeverity(
    merged.default_secret_severity,
    "critical",
  );
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
  merged.ignored_fingerprints = [
    ...new Set(
      merged.ignored_fingerprints.map(normalizeString).filter(Boolean),
    ),
  ];
  merged.ignored_secret_types = [
    ...new Set(
      merged.ignored_secret_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.ignored_paths = [
    ...new Set(merged.ignored_paths.map(toPosixPath).filter(Boolean)),
  ];
  merged.max_secret_rows = Math.max(1, merged.max_secret_rows);

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

function looksLikeSecretScanFile(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  if (![".json", ".jsonc", ".ndjson", ".jsonl", ".sarif"].includes(extension))
    return false;

  return (
    basename.includes("secret") ||
    basename.includes("secrets") ||
    basename.includes("gitleaks") ||
    basename.includes("trufflehog") ||
    basename.includes("detect-secrets") ||
    basename.includes("detect_secrets") ||
    basename.includes("leaks") ||
    basename.endsWith(".sarif") ||
    basename.endsWith(".sarif.json")
  );
}

function discoverScanFiles(args, repoRoot) {
  const explicit = args.scan_files
    .map((filePath) => resolvePath(filePath, repoRoot))
    .filter(isFile);

  const discovered = args.input_dirs
    .flatMap((dirPath) =>
      listFiles(resolvePath(dirPath, repoRoot), { recursive: args.recursive }),
    )
    .filter(looksLikeSecretScanFile);

  return [...new Set([...explicit, ...discovered])].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right)),
  );
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

function matchesPattern(value, pattern) {
  const normalizedValue = toPosixPath(value);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedValue || !normalizedPattern) return false;

  if (hasGlob(normalizedPattern)) {
    return globToRegExp(normalizedPattern).test(normalizedValue);
  }

  return (
    normalizedValue === normalizedPattern ||
    normalizedValue.includes(normalizedPattern)
  );
}

function pathMatches(filePath, patterns) {
  if (!filePath) return false;

  return patterns.some((pattern) => matchesPattern(filePath, pattern));
}

function detectScanner(data, filePath, args) {
  if (args.scanner) return args.scanner;

  const basename = path.basename(filePath).toLowerCase();

  if (
    Array.isArray(data) &&
    data.some((item) => item?.RuleID || item?.Fingerprint)
  )
    return "gitleaks";
  if (
    Array.isArray(data) &&
    data.some((item) => item?.DetectorName || item?.DetectorType)
  )
    return "trufflehog";
  if (data?.results && typeof data.results === "object" && data.plugins_used)
    return "detect-secrets";
  if (data?.runs && data?.version && data?.$schema) return "sarif";
  if (
    Array.isArray(data) &&
    data.some((item) => item?.secret_type || item?.secret_type_display_name)
  )
    return "github-secret-scanning";
  if (
    Array.isArray(data?.alerts) &&
    data.alerts.some(
      (item) => item?.secret_type || item?.secret_type_display_name,
    )
  )
    return "github-secret-scanning";
  if (basename.includes("gitleaks")) return "gitleaks";
  if (basename.includes("trufflehog")) return "trufflehog";
  if (
    basename.includes("detect-secrets") ||
    basename.includes("detect_secrets")
  )
    return "detect-secrets";
  if (basename.includes("github") || basename.includes("secret-scanning"))
    return "github-secret-scanning";
  if (basename.endsWith(".sarif") || basename.endsWith(".sarif.json"))
    return "sarif";

  return "generic";
}

function normalizeSecretType(value, fallback = "unknown-secret") {
  return normalizeString(value, fallback).toLowerCase();
}

function normalizeVerified(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return normalizeBoolean(value, fallback);
}

function normalizeSecretFinding(raw, context) {
  const source = raw && typeof raw === "object" ? raw : {};

  const secretValue = normalizeString(
    source.secret ||
      source.Secret ||
      source.raw ||
      source.Raw ||
      source.RawV2 ||
      source.value ||
      source.match ||
      source.Match ||
      source.redacted ||
      "",
  );

  const secretHash = hashValue(secretValue);

  const secretType = normalizeSecretType(
    source.secret_type ||
      source.secretType ||
      source.SecretType ||
      source.secret_type_display_name ||
      source.secretTypeDisplayName ||
      source.rule_id ||
      source.ruleId ||
      source.RuleID ||
      source.detector_name ||
      source.detectorName ||
      source.DetectorName ||
      source.DetectorType ||
      source.type ||
      source.kind ||
      source.id ||
      context.secret_type ||
      "unknown-secret",
  );

  const ruleId = normalizeString(
    source.rule_id ||
      source.ruleId ||
      source.RuleID ||
      source.id ||
      source.ID ||
      source.detector_name ||
      source.DetectorName ||
      secretType,
  );

  const title = normalizeString(
    source.title ||
      source.Title ||
      source.description ||
      source.Description ||
      source.message ||
      source.Message ||
      source.secret_type_display_name ||
      source.secretTypeDisplayName ||
      ruleId ||
      secretType ||
      "Secret finding",
  );

  const description = normalizeString(
    source.description ||
      source.Description ||
      source.message ||
      source.Message ||
      source.reason ||
      source.resolution ||
      "",
  );

  const file = toPosixPath(
    source.file ||
      source.File ||
      source.path ||
      source.Path ||
      source.filename ||
      source.Filename ||
      source.location?.path ||
      source.source_metadata?.data?.git?.file ||
      source.SourceMetadata?.Data?.Git?.file ||
      context.file ||
      "",
  );

  const startLine = normalizeInteger(
    source.start_line ||
      source.startLine ||
      source.StartLine ||
      source.line ||
      source.Line ||
      source.location?.start_line ||
      source.source_metadata?.data?.git?.line ||
      source.SourceMetadata?.Data?.Git?.line ||
      0,
    0,
  );

  const endLine = normalizeInteger(
    source.end_line ||
      source.endLine ||
      source.EndLine ||
      source.location?.end_line ||
      startLine,
    startLine,
  );

  const startColumn = normalizeInteger(
    source.start_column ||
      source.startColumn ||
      source.StartColumn ||
      source.column ||
      source.Column ||
      source.location?.start_column ||
      0,
    0,
  );

  const endColumn = normalizeInteger(
    source.end_column ||
      source.endColumn ||
      source.EndColumn ||
      source.location?.end_column ||
      0,
    0,
  );

  const commit = normalizeString(
    source.commit ||
      source.Commit ||
      source.sha ||
      source.SHA ||
      source.source_metadata?.data?.git?.commit ||
      source.SourceMetadata?.Data?.Git?.commit ||
      "",
  );

  const author = normalizeString(source.author || source.Author || "");
  const email = normalizeString(source.email || source.Email || "");
  const entropy = normalizeFloat(source.entropy || source.Entropy, 0);
  const confidence = normalizeString(
    source.confidence || source.Confidence || source.verified ? "verified" : "",
  );

  const verified = normalizeVerified(
    source.verified ||
      source.Verified ||
      source.validated ||
      source.Validated ||
      source.is_verified ||
      source.isVerified,
    false,
  );

  const state = normalizeState(
    source.state ||
      source.State ||
      source.status ||
      source.Status ||
      context.state ||
      "open",
  );
  const severity = normalizeSeverity(
    source.severity || source.Severity || context.default_severity,
    context.default_severity,
  );

  const fingerprint =
    normalizeString(
      source.fingerprint ||
        source.Fingerprint ||
        source.fingerprint_sha256 ||
        "",
    ) ||
    shortHash(
      [
        context.scanner,
        secretType,
        ruleId,
        file,
        startLine,
        startColumn,
        commit,
        secretHash,
        title,
      ].join("|"),
    );

  const url = normalizeUrl(
    source.url ||
      source.URL ||
      source.html_url ||
      source.htmlUrl ||
      source.source_url ||
      source.sourceUrl ||
      "",
  );

  const tags = [
    ...new Set(
      normalizeStringList(source.tags || source.Tags || source.labels || [])
        .map((item) => item.toLowerCase())
        .filter(Boolean),
    ),
  ];

  const finding = {
    source: context.scanner,
    source_file: context.source_file,
    fingerprint,
    rule_id: ruleId,
    secret_type: secretType,
    title,
    description,
    severity,
    state,
    verified,
    confidence,
    entropy,
    secret_present: Boolean(secretValue),
    secret_hash: secretHash,
    file,
    start_line: startLine,
    end_line: endLine,
    start_column: startColumn,
    end_column: endColumn,
    commit,
    author,
    email_hash: email ? hashValue(email) : "",
    tags,
    url,
    raw_match_redacted: context.include_raw_redacted_match
      ? redactSecretValue(secretValue)
      : "",
  };

  return finding;
}

function parseGitleaks(data, context) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.findings)
      ? data.findings
      : Array.isArray(data?.results)
        ? data.results
        : [];

  return {
    findings: rows.map((item) =>
      normalizeSecretFinding(item, {
        ...context,
        scanner: "gitleaks",
      }),
    ),
    metadata: {
      scanner: "gitleaks",
      source_file: context.source_file,
      finding_count: rows.length,
    },
  };
}

function parseTruffleHog(data, context) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.findings)
      ? data.findings
      : Array.isArray(data?.results)
        ? data.results
        : [];

  return {
    findings: rows.map((item) =>
      normalizeSecretFinding(item, {
        ...context,
        scanner: "trufflehog",
        file:
          item?.SourceMetadata?.Data?.Git?.file ||
          item?.source_metadata?.data?.git?.file ||
          item?.SourceMetadata?.Data?.Filesystem?.file ||
          item?.source_metadata?.data?.filesystem?.file ||
          "",
      }),
    ),
    metadata: {
      scanner: "trufflehog",
      source_file: context.source_file,
      finding_count: rows.length,
    },
  };
}

function parseDetectSecrets(data, context) {
  const findings = [];
  const results =
    data?.results && typeof data.results === "object" ? data.results : {};

  for (const [file, secrets] of Object.entries(results)) {
    for (const secret of secrets || []) {
      findings.push(
        normalizeSecretFinding(
          {
            ...secret,
            file,
            rule_id: secret.type,
            secret_type: secret.type,
            line: secret.line_number,
            secret: secret.hashed_secret || "",
            verified: secret.is_verified,
          },
          {
            ...context,
            scanner: "detect-secrets",
            file,
          },
        ),
      );
    }
  }

  return {
    findings,
    metadata: {
      scanner: "detect-secrets",
      source_file: context.source_file,
      version: normalizeString(data?.version),
      plugin_count: Array.isArray(data?.plugins_used)
        ? data.plugins_used.length
        : 0,
      finding_count: findings.length,
    },
  };
}

function parseGithubSecretScanning(data, context) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
      ? data.alerts
      : Array.isArray(data?.secret_scanning_alerts)
        ? data.secret_scanning_alerts
        : [];

  return {
    findings: rows.map((item) =>
      normalizeSecretFinding(
        {
          ...item,
          secret_type: item.secret_type || item.secretType,
          secret_type_display_name:
            item.secret_type_display_name || item.secretTypeDisplayName,
          state: item.state,
          description: item.resolution_comment || item.resolution || "",
          url: item.html_url || item.url,
          verified: item.validity === "active" || item.validity === "valid",
          file: item.locations?.[0]?.path || item.location?.path || "",
          start_line:
            item.locations?.[0]?.start_line || item.location?.start_line || 0,
        },
        {
          ...context,
          scanner: "github-secret-scanning",
        },
      ),
    ),
    metadata: {
      scanner: "github-secret-scanning",
      source_file: context.source_file,
      finding_count: rows.length,
    },
  };
}

function ruleMapFromRun(run) {
  const rules = new Map();

  for (const rule of run?.tool?.driver?.rules || []) {
    rules.set(rule.id, rule);
  }

  for (const extension of run?.tool?.extensions || []) {
    for (const rule of extension.rules || []) {
      rules.set(rule.id, rule);
    }
  }

  return rules;
}

function normalizeSarifLocation(location) {
  const physical = location?.physicalLocation || {};
  const artifact = physical.artifactLocation || {};
  const region = physical.region || {};

  return {
    file: toPosixPath(artifact.uri || artifact.uriBaseId || ""),
    start_line: normalizeInteger(region.startLine, 0),
    start_column: normalizeInteger(region.startColumn, 0),
    end_line: normalizeInteger(region.endLine, region.startLine || 0),
    end_column: normalizeInteger(region.endColumn, 0),
    snippet: normalizeString(region.snippet?.text || ""),
  };
}

function parseSarif(data, context) {
  const findings = [];
  const runs = [];

  for (const run of data?.runs || []) {
    const rules = ruleMapFromRun(run);
    const scanner = normalizeString(
      run.tool?.driver?.name || "sarif-secret-scanner",
    ).toLowerCase();
    const results = Array.isArray(run.results) ? run.results : [];

    runs.push({
      tool_name: scanner,
      tool_version: normalizeString(
        run.tool?.driver?.semanticVersion || run.tool?.driver?.version,
      ),
      rule_count: rules.size,
      result_count: results.length,
    });

    for (const result of results) {
      const rule = rules.get(result.ruleId) || {};
      const location = normalizeSarifLocation(result.locations?.[0] || {});
      const severity = normalizeSeverity(
        result.properties?.severity ||
          result.level ||
          rule.properties?.severity ||
          context.default_severity,
        context.default_severity,
      );

      findings.push(
        normalizeSecretFinding(
          {
            rule_id: result.ruleId,
            secret_type: rule.name || result.ruleId,
            title:
              result.message?.text ||
              rule.shortDescription?.text ||
              rule.fullDescription?.text ||
              result.ruleId,
            description:
              rule.fullDescription?.text || result.message?.text || "",
            severity,
            file: location.file,
            start_line: location.start_line,
            end_line: location.end_line,
            start_column: location.start_column,
            end_column: location.end_column,
            match: location.snippet,
            fingerprint:
              result.partialFingerprints?.primaryLocationLineHash ||
              result.fingerprints?.["github/secret-scanning"] ||
              "",
            url: rule.helpUri || "",
          },
          {
            ...context,
            scanner,
          },
        ),
      );
    }
  }

  return {
    findings,
    metadata: {
      scanner: "sarif",
      source_file: context.source_file,
      run_count: runs.length,
      runs,
      finding_count: findings.length,
    },
  };
}

function parseGeneric(data, context) {
  const rows = Array.isArray(data)
    ? data
    : [
        ...(Array.isArray(data?.secrets) ? data.secrets : []),
        ...(Array.isArray(data?.findings) ? data.findings : []),
        ...(Array.isArray(data?.security_findings)
          ? data.security_findings
          : []),
        ...(Array.isArray(data?.results) ? data.results : []),
        ...(Array.isArray(data?.alerts) ? data.alerts : []),
      ];

  const directRows = rows.length
    ? rows
    : data &&
        typeof data === "object" &&
        (data.secret ||
          data.rule_id ||
          data.detector_name ||
          data.secret_type ||
          data.title)
      ? [data]
      : [];

  return {
    findings: directRows.map((item) =>
      normalizeSecretFinding(item, {
        ...context,
        scanner: context.scanner || "generic",
      }),
    ),
    metadata: {
      scanner: context.scanner || "generic",
      source_file: context.source_file,
      finding_count: directRows.length,
    },
  };
}

function parseScanFile(filePath, repoRoot, args) {
  const data = readDataFile(filePath, repoRoot);
  const sourceFile = toRelativePath(filePath, repoRoot);

  if (!data || (Array.isArray(data) && !data.length)) {
    return {
      findings: [],
      metadata: null,
      error: `Invalid secrets scan file: ${sourceFile}`,
    };
  }

  const scanner = detectScanner(data, filePath, args);
  const context = {
    scanner,
    source_file: sourceFile,
    default_severity: args.default_secret_severity,
    include_raw_redacted_match: args.include_raw_redacted_match,
  };

  try {
    if (scanner === "gitleaks") return parseGitleaks(data, context);
    if (scanner === "trufflehog") return parseTruffleHog(data, context);
    if (scanner === "detect-secrets") return parseDetectSecrets(data, context);
    if (scanner === "github-secret-scanning")
      return parseGithubSecretScanning(data, context);
    if (scanner === "sarif") return parseSarif(data, context);

    return parseGeneric(data, context);
  } catch (err) {
    return {
      findings: [],
      metadata: null,
      error: `Unable to parse ${sourceFile}: ${logger.formatError(err)}`,
    };
  }
}

function shouldIncludeFinding(args, finding) {
  if (severityRank(finding.severity) < severityRank(args.min_report_severity))
    return false;
  if (!args.include_resolved && finding.state === "resolved") return false;
  if (!args.include_dismissed && finding.state === "dismissed") return false;
  if (!args.include_unverified && !finding.verified) return false;
  if (args.ignored_fingerprints.includes(finding.fingerprint)) return false;
  if (args.ignored_secret_types.includes(finding.secret_type.toLowerCase()))
    return false;
  if (args.ignored_secret_types.includes(finding.rule_id.toLowerCase()))
    return false;
  if (pathMatches(finding.file, args.ignored_paths)) return false;

  return true;
}

function dedupeFindings(findings) {
  const map = new Map();

  for (const finding of findings) {
    const key = [
      finding.secret_hash,
      finding.secret_type,
      finding.rule_id,
      finding.file,
      finding.start_line,
      finding.commit,
      finding.fingerprint,
    ]
      .map((item) => normalizeString(item).toLowerCase())
      .join("|");

    if (!map.has(key)) {
      map.set(key, finding);
      continue;
    }

    const existing = map.get(key);

    if (!existing.verified && finding.verified) {
      map.set(key, finding);
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
    message: `Found ${count} ${name} secret finding(s); maximum allowed is ${maxAllowed}.`,
  };
}

function analyzeFindings(args, loadResult) {
  const findings = loadResult.findings.filter((finding) =>
    shouldIncludeFinding(args, finding),
  );
  const activeFindings = findings.filter((finding) => finding.state === "open");
  const verifiedFindings = activeFindings.filter((finding) => finding.verified);

  const severityCounts = {
    critical: activeFindings.filter((item) => item.severity === "critical")
      .length,
    high: activeFindings.filter((item) => item.severity === "high").length,
    medium: activeFindings.filter((item) => item.severity === "medium").length,
    low: activeFindings.filter((item) => item.severity === "low").length,
    info: activeFindings.filter((item) => item.severity === "info").length,
    unknown: activeFindings.filter((item) => item.severity === "unknown")
      .length,
  };

  const failingSeverityFindings = activeFindings.filter((item) =>
    args.fail_on_severities.includes(item.severity),
  );

  const warningSeverityFindings = activeFindings.filter((item) =>
    args.warn_on_severities.includes(item.severity),
  );

  const thresholdViolations = [
    limitViolation("total", activeFindings.length, args.max_total),
    limitViolation("verified", verifiedFindings.length, args.max_verified),
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("info", severityCounts.info, args.max_info),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];

  if (args.require_results && !loadResult.findings.length) {
    errors.push("No secrets scan findings or results were found.");
  }

  if (args.fail_if_secrets && activeFindings.length) {
    errors.push(
      `Secrets scan found ${activeFindings.length} active secret finding(s).`,
    );
  }

  if (args.fail_on_verified && verifiedFindings.length) {
    errors.push(
      `Secrets scan found ${verifiedFindings.length} verified active secret finding(s).`,
    );
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
  }

  errors.push(
    ...failingSeverityFindings.map(
      (item) =>
        `${item.fingerprint}: ${item.secret_type || item.rule_id || "secret"} (${item.severity})`,
    ),
  );

  warnings.push(
    ...warningSeverityFindings.map(
      (item) =>
        `${item.fingerprint}: ${item.secret_type || item.rule_id || "secret"} (${item.severity})`,
    ),
  );

  const ok = errors.length === 0;

  return {
    findings,
    active_findings: activeFindings,
    verified_findings: verifiedFindings,
    failing_findings: failingSeverityFindings,
    warning_findings: warningSeverityFindings,
    resolved_findings: findings.filter((item) => item.state === "resolved"),
    dismissed_findings: findings.filter((item) => item.state === "dismissed"),
    severity_counts: severityCounts,
    state_counts: countBy(findings, (item) => item.state),
    scanner_counts: countBy(findings, (item) => item.source),
    secret_type_counts: countBy(findings, (item) => item.secret_type),
    rule_counts: countBy(findings, (item) => item.rule_id),
    file_counts: countBy(
      findings.filter((item) => item.file),
      (item) => item.file,
    ),
    author_counts: countBy(
      findings.filter((item) => item.author),
      (item) => item.author,
    ),
    threshold_violations: thresholdViolations,
    errors,
    warnings,
    status: ok
      ? warnings.length || warningSeverityFindings.length
        ? "warning"
        : "passed"
      : "failed",
    ok,
  };
}

function loadSecretsScanData(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const metadata = [];
  const findings = [];

  const scanFiles = discoverScanFiles(args, repoRoot);

  for (const filePath of scanFiles) {
    const parsed = parseScanFile(filePath, repoRoot, args);

    if (parsed.error) {
      if (args.fail_on_invalid_input) {
        errors.push(parsed.error);
      } else {
        warnings.push(parsed.error);
      }

      continue;
    }

    if (parsed.metadata) {
      metadata.push({
        ...parsed.metadata,
        source_file: toRelativePath(filePath, repoRoot),
      });
    }

    findings.push(...parsed.findings);
  }

  return {
    scan_files: scanFiles.map((filePath) => toRelativePath(filePath, repoRoot)),
    metadata,
    findings: dedupeFindings(findings),
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
    type: "security-summarize-secrets-scan",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: endedAt.toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      scan_files: loadResult.scan_files,
      input_dirs: args.input_dirs,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      scanner: args.scanner || "auto",
      default_secret_severity: args.default_secret_severity,
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
      max_verified: args.max_verified,
      ignored_fingerprints: args.ignored_fingerprints,
      ignored_secret_types: args.ignored_secret_types,
      ignored_paths: args.ignored_paths,
      include_resolved: args.include_resolved,
      include_dismissed: args.include_dismissed,
      include_unverified: args.include_unverified,
      include_raw_redacted_match: args.include_raw_redacted_match,
      fail_if_secrets: args.fail_if_secrets,
      fail_on_verified: args.fail_on_verified,
      fail_on_threshold: args.fail_on_threshold,
      require_results: args.require_results,
      dry_run: args.dry_run,
      max_secret_rows: args.max_secret_rows,
    },
    secrets_scan: {
      scans: loadResult.metadata,
      findings: analysis.findings,
      active_findings: analysis.active_findings,
      verified_findings: analysis.verified_findings,
      failing_findings: analysis.failing_findings,
      warning_findings: analysis.warning_findings,
      resolved_findings: analysis.resolved_findings,
      dismissed_findings: analysis.dismissed_findings,
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      state_counts: analysis.state_counts,
      scanner_counts: analysis.scanner_counts,
      secret_type_counts: analysis.secret_type_counts,
      rule_counts: analysis.rule_counts,
      file_counts: analysis.file_counts,
      author_counts: analysis.author_counts,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      scan_files: loadResult.scan_files.length,
      scans: loadResult.metadata.length,
      raw_findings: loadResult.findings.length,
      findings: analysis.findings.length,
      active_findings: analysis.active_findings.length,
      verified_findings: analysis.verified_findings.length,
      failing_findings: analysis.failing_findings.length,
      warning_findings: analysis.warning_findings.length,
      resolved_findings: analysis.resolved_findings.length,
      dismissed_findings: analysis.dismissed_findings.length,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      info: analysis.severity_counts.info,
      unknown: analysis.severity_counts.unknown,
      secret_types: Object.keys(analysis.secret_type_counts).length,
      rules: Object.keys(analysis.rule_counts).length,
      files: Object.keys(analysis.file_counts).length,
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
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function sortedFindings(findings) {
  return [...findings].sort((left, right) => {
    const severityDiff =
      severityRank(right.severity) - severityRank(left.severity);

    if (severityDiff !== 0) return severityDiff;

    if (left.verified !== right.verified) return left.verified ? -1 : 1;

    const fileDiff = (left.file || "").localeCompare(right.file || "");

    if (fileDiff !== 0) return fileDiff;

    return (left.start_line || 0) - (right.start_line || 0);
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
    `# 🛡️ ${PROJECT_NAME} Secrets Scan Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Scan files: \`${report.totals.scan_files}\``,
    `- Scans: \`${report.totals.scans}\``,
    `- Findings: \`${report.totals.findings}\``,
    `- Active findings: \`${report.totals.active_findings}\``,
    `- Verified active findings: \`${report.totals.verified_findings}\``,
    `- Failing findings: \`${report.totals.failing_findings}\``,
    `- Warning findings: \`${report.totals.warning_findings}\``,
    `- Resolved findings: \`${report.totals.resolved_findings}\``,
    `- Dismissed findings: \`${report.totals.dismissed_findings}\``,
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
    "## 📊 Active Severity Counts",
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

  if (report.secrets_scan.scans.length) {
    lines.push("## 🧪 Scan Inputs");
    lines.push("");
    lines.push("| Scanner | Findings | Source |");
    lines.push("|---|---:|---|");

    for (const scan of report.secrets_scan.scans) {
      lines.push(
        `| \`${escapeMarkdown(scan.scanner || "unknown")}\` | \`${scan.finding_count || 0}\` | \`${escapeMarkdown(scan.source_file || "unknown")}\` |`,
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

  if (report.secrets_scan.active_findings.length) {
    lines.push("## 🔐 Active Secret Findings");
    lines.push("");
    lines.push(
      "| Severity | Verified | Type | Rule | File | Line | Fingerprint | Source |",
    );
    lines.push("|---|---|---|---|---|---:|---|---|");

    for (const finding of sortedFindings(
      report.secrets_scan.active_findings,
    ).slice(0, report.config.max_secret_rows || 100)) {
      lines.push(
        `| \`${escapeMarkdown(finding.severity)}\` | \`${finding.verified ? "true" : "false"}\` | \`${escapeMarkdown(finding.secret_type || "unknown")}\` | \`${escapeMarkdown(finding.rule_id || "unknown")}\` | \`${escapeMarkdown(finding.file || "unknown")}\` | \`${finding.start_line || "n/a"}\` | \`${finding.fingerprint}\` | \`${escapeMarkdown(finding.source || "unknown")}\` |`,
      );
    }

    if (
      report.secrets_scan.active_findings.length >
      (report.config.max_secret_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | \`${report.secrets_scan.active_findings.length - (report.config.max_secret_rows || 100)}\` more finding(s) omitted | … |`,
      );
    }

    lines.push("");
  }

  const topSecretTypes = topEntries(report.analysis.secret_type_counts, 20);

  if (topSecretTypes.length) {
    lines.push("## 🧬 Most Common Secret Types");
    lines.push("");
    lines.push("| Secret Type | Findings |");
    lines.push("|---|---:|");

    for (const [secretType, count] of topSecretTypes) {
      lines.push(`| \`${escapeMarkdown(secretType)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  const topFiles = topEntries(report.analysis.file_counts, 20);

  if (topFiles.length) {
    lines.push("## 📁 Most Affected Files");
    lines.push("");
    lines.push("| File | Findings |");
    lines.push("|---|---:|");

    for (const [file, count] of topFiles) {
      lines.push(`| \`${escapeMarkdown(file)}\` | \`${count}\` |`);
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
    `- Scanner override: \`${escapeMarkdown(report.config.scanner || "auto")}\``,
  );
  lines.push(
    `- Default secret severity: \`${escapeMarkdown(report.config.default_secret_severity)}\``,
  );
  lines.push(
    `- Include resolved: \`${report.config.include_resolved ? "true" : "false"}\``,
  );
  lines.push(
    `- Include dismissed: \`${report.config.include_dismissed ? "true" : "false"}\``,
  );
  lines.push(
    `- Include unverified: \`${report.config.include_unverified ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if secrets: \`${report.config.fail_if_secrets ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail on verified: \`${report.config.fail_on_verified ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail severities: \`${escapeMarkdown(report.config.fail_on_severities.join(", ") || "none")}\``,
  );
  lines.push(
    `- Warn severities: \`${escapeMarkdown(report.config.warn_on_severities.join(", ") || "none")}\``,
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
  setGitHubOutput("secrets_scan_summary_file", report.config.output_file);
  setGitHubOutput(
    "secrets_scan_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("secrets_scan_summary_status", report.status);
  setGitHubOutput("secrets_scan_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput("secrets_scan_files", String(report.totals.scan_files));
  setGitHubOutput("secrets_scan_scans", String(report.totals.scans));
  setGitHubOutput("secrets_scan_findings", String(report.totals.findings));
  setGitHubOutput(
    "secrets_scan_active_findings",
    String(report.totals.active_findings),
  );
  setGitHubOutput(
    "secrets_scan_verified_findings",
    String(report.totals.verified_findings),
  );
  setGitHubOutput(
    "secrets_scan_failing_findings",
    String(report.totals.failing_findings),
  );
  setGitHubOutput(
    "secrets_scan_warning_findings",
    String(report.totals.warning_findings),
  );

  setGitHubOutput("secrets_scan_critical", String(report.totals.critical));
  setGitHubOutput("secrets_scan_high", String(report.totals.high));
  setGitHubOutput("secrets_scan_medium", String(report.totals.medium));
  setGitHubOutput("secrets_scan_low", String(report.totals.low));
  setGitHubOutput("secrets_scan_info", String(report.totals.info));
  setGitHubOutput("secrets_scan_unknown", String(report.totals.unknown));

  setGitHubOutput(
    "secrets_scan_secret_types",
    String(report.totals.secret_types),
  );
  setGitHubOutput("secrets_scan_files_affected", String(report.totals.files));
  setGitHubOutput("secrets_scan_errors", String(report.totals.errors));
  setGitHubOutput("secrets_scan_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "secrets_scan_findings_json",
    JSON.stringify(report.secrets_scan.findings),
  );
  setGitHubOutput(
    "secrets_scan_active_findings_json",
    JSON.stringify(report.secrets_scan.active_findings),
  );
  setGitHubOutput(
    "secrets_scan_failing_findings_json",
    JSON.stringify(report.secrets_scan.failing_findings),
  );
  setGitHubOutput(
    "secrets_scan_warning_findings_json",
    JSON.stringify(report.secrets_scan.warning_findings),
  );
  setGitHubOutput("secrets_scan_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "secrets_scan_warnings_json",
    JSON.stringify(report.warnings),
  );
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

  logger.info("Summarizing secrets scan results.");

  const loadResult = loadSecretsScanData(args, repoRoot);
  const analysis = analyzeFindings(args, loadResult);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    loadResult,
    analysis,
    startedAt,
  );

  const markdown = redactOutput(createMarkdownSummary(report));
  const json = `${redactOutput(JSON.stringify(report, null, 2))}\n`;

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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(redactOutput(logger.formatError(err)));
  process.exitCode = 1;
});
