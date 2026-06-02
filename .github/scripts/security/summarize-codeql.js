#!/usr/bin/env node
// .github/scripts/security/summarize-codeql.js
// =============================================================================
// Aerealith AI — CodeQL Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize CodeQL SARIF output and/or GitHub code scanning alerts into clean
//   JSON and Markdown reports for CI, security review, and release workflows.
//
// Input:
//   - CodeQL SARIF file(s)
//   - Optional GitHub code scanning alerts JSON file
//   - Optional GitHub REST API alert fetch
//   - .github/security/summarize-codeql.json
//   - .github/security/summarize-codeql.jsonc
//   - .github/security/summarize-codeql.yaml
//   - .github/security/summarize-codeql.yml
//
// Output:
//   - artifacts/security/summarize-codeql.json
//   - artifacts/security/summarize-codeql.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Read-only.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[summarize-codeql] ${message}`),
    warn: (message) => console.warn(`[summarize-codeql] WARN: ${message}`),
    error: (message) => console.error(`[summarize-codeql] ERROR: ${message}`),
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
  ".github/security/summarize-codeql.json",
  ".github/security/summarize-codeql.jsonc",
  ".github/security/summarize-codeql.yaml",
  ".github/security/summarize-codeql.yml",
  ".github/security/codeql-summary.json",
  ".github/security/codeql-summary.jsonc",
  ".github/security/codeql-summary.yaml",
  ".github/security/codeql-summary.yml",
  ".github/repo/summarize-codeql.json",
  ".github/repo/summarize-codeql.jsonc",
  ".github/repo/summarize-codeql.yaml",
  ".github/repo/summarize-codeql.yml",
  ".github/summarize-codeql.json",
  ".github/summarize-codeql.jsonc",
  ".github/summarize-codeql.yaml",
  ".github/summarize-codeql.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security/codeql",
  "artifacts/codeql",
  "artifacts/security",
  "results",
  ".outputs/codeql",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-codeql.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-codeql.md";

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "note",
  "low",
  "medium",
  "high",
  "critical",
];
const DEFAULT_FAIL_SEVERITIES = [];
const DEFAULT_WARN_SEVERITIES = ["medium", "high", "critical"];

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
  if (["note", "notice"].includes(severity)) return "note";
  if (["info", "informational"].includes(severity)) return "note";
  if (["none", "unknown", "untriaged"].includes(severity)) return "unknown";

  return fallback;
}

function severityRank(severity) {
  const normalized = normalizeSeverity(severity, "unknown");
  const index = DEFAULT_SEVERITY_ORDER.indexOf(normalized);

  return index === -1 ? 0 : index;
}

function severityFromScore(value, fallback = "unknown") {
  const score = normalizeFloat(value, 0);

  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";

  return fallback;
}

function severityFromSarifLevel(level) {
  const normalized = normalizeString(level).toLowerCase();

  if (normalized === "error") return "high";
  if (normalized === "warning") return "medium";
  if (normalized === "note") return "note";
  if (normalized === "none") return "unknown";

  return "unknown";
}

function normalizeState(value, fallback = "open") {
  const state = normalizeString(value, fallback).toLowerCase();

  if (["open", "fixed", "dismissed", "closed"].includes(state)) return state;

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.SUMMARIZE_CODEQL_TOKEN ||
      process.env.SECURITY_AUTOMATION_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.SUMMARIZE_CODEQL_CONFIG_FILE || "",

    sarif_files: normalizeStringList(
      process.env.SUMMARIZE_CODEQL_SARIF_FILES ||
        process.env.CODEQL_SARIF_FILES ||
        process.env.SARIF_FILES ||
        "",
    ),

    alerts_file:
      process.env.SUMMARIZE_CODEQL_ALERTS_FILE ||
      process.env.CODEQL_ALERTS_FILE ||
      process.env.CODE_SCANNING_ALERTS_FILE ||
      "",

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_CODEQL_INPUT_DIRS ||
        process.env.CODEQL_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_CODEQL_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_CODEQL_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    ref: process.env.SUMMARIZE_CODEQL_REF || process.env.GITHUB_REF || "",

    commit_sha:
      process.env.SUMMARIZE_CODEQL_SHA || process.env.GITHUB_SHA || "",

    category:
      process.env.SUMMARIZE_CODEQL_CATEGORY ||
      process.env.CODEQL_CATEGORY ||
      "",

    tool_name: process.env.SUMMARIZE_CODEQL_TOOL_NAME || "CodeQL",

    fail_on_severities: normalizeStringList(
      process.env.SUMMARIZE_CODEQL_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SUMMARIZE_CODEQL_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    min_report_severity: normalizeSeverity(
      process.env.SUMMARIZE_CODEQL_MIN_REPORT_SEVERITY || "unknown",
      "unknown",
    ),

    max_open_alerts: normalizeInteger(
      process.env.SUMMARIZE_CODEQL_MAX_OPEN_ALERTS,
      -1,
    ),
    max_critical: normalizeInteger(
      process.env.SUMMARIZE_CODEQL_MAX_CRITICAL,
      -1,
    ),
    max_high: normalizeInteger(process.env.SUMMARIZE_CODEQL_MAX_HIGH, -1),
    max_medium: normalizeInteger(process.env.SUMMARIZE_CODEQL_MAX_MEDIUM, -1),
    max_low: normalizeInteger(process.env.SUMMARIZE_CODEQL_MAX_LOW, -1),
    max_note: normalizeInteger(process.env.SUMMARIZE_CODEQL_MAX_NOTE, -1),
    max_unknown: normalizeInteger(process.env.SUMMARIZE_CODEQL_MAX_UNKNOWN, -1),

    fetch_alerts: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_FETCH_ALERTS,
      false,
    ),
    include_closed_alerts: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_INCLUDE_CLOSED_ALERTS,
      false,
    ),
    include_dismissed_alerts: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_INCLUDE_DISMISSED_ALERTS,
      true,
    ),
    include_fixed_alerts: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_INCLUDE_FIXED_ALERTS,
      false,
    ),

    recursive: normalizeBoolean(process.env.SUMMARIZE_CODEQL_RECURSIVE, true),
    require_results: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_REQUIRE_RESULTS,
      false,
    ),
    fail_if_alerts: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_FAIL_IF_ALERTS,
      false,
    ),
    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_FAIL_ON_THRESHOLD,
      true,
    ),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_FAIL_ON_INVALID_INPUT,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_FAIL_ON_ERROR,
      true,
    ),

    max_alert_rows: normalizeInteger(
      process.env.SUMMARIZE_CODEQL_MAX_ALERT_ROWS,
      100,
    ),
    timeout_seconds: normalizeInteger(
      process.env.SUMMARIZE_CODEQL_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_CODEQL_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_CODEQL_STEP_SUMMARY,
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

    if (arg === "--api-url") {
      args.api_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--token") {
      args.token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--sarif" ||
      arg === "--sarif-file" ||
      arg === "--sarif-files"
    ) {
      args.sarif_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--alerts-file") {
      args.alerts_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ref") {
      args.ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--sha" || arg === "--commit-sha") {
      args.commit_sha = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--category") {
      args.category = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tool-name") {
      args.tool_name = argv[index + 1];
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

    if (arg === "--max-open-alerts") {
      args.max_open_alerts = normalizeInteger(
        argv[index + 1],
        args.max_open_alerts,
      );
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

    if (arg === "--max-note") {
      args.max_note = normalizeInteger(argv[index + 1], args.max_note);
      index += 1;
      continue;
    }

    if (arg === "--max-unknown") {
      args.max_unknown = normalizeInteger(argv[index + 1], args.max_unknown);
      index += 1;
      continue;
    }

    if (arg === "--fetch-alerts") {
      args.fetch_alerts = true;
      continue;
    }

    if (arg === "--no-fetch-alerts") {
      args.fetch_alerts = false;
      continue;
    }

    if (arg === "--include-closed-alerts") {
      args.include_closed_alerts = true;
      continue;
    }

    if (arg === "--no-include-closed-alerts") {
      args.include_closed_alerts = false;
      continue;
    }

    if (arg === "--include-dismissed-alerts") {
      args.include_dismissed_alerts = true;
      continue;
    }

    if (arg === "--no-include-dismissed-alerts") {
      args.include_dismissed_alerts = false;
      continue;
    }

    if (arg === "--include-fixed-alerts") {
      args.include_fixed_alerts = true;
      continue;
    }

    if (arg === "--no-include-fixed-alerts") {
      args.include_fixed_alerts = false;
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

    if (arg === "--fail-if-alerts") {
      args.fail_if_alerts = true;
      continue;
    }

    if (arg === "--no-fail-if-alerts") {
      args.fail_if_alerts = false;
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

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
      continue;
    }

    if (arg === "--max-alert-rows") {
      args.max_alert_rows = normalizeInteger(
        argv[index + 1],
        args.max_alert_rows,
      );
      index += 1;
      continue;
    }

    if (arg === "--timeout-seconds") {
      args.timeout_seconds = normalizeInteger(
        argv[index + 1],
        args.timeout_seconds,
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
  args.api_url = normalizeString(
    args.api_url,
    "https://api.github.com",
  ).replace(/\/+$/g, "");
  args.sarif_files = [
    ...new Set(args.sarif_files.map(toPosixPath).filter(Boolean)),
  ];
  args.alerts_file = toPosixPath(args.alerts_file);
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.ref = normalizeString(args.ref);
  args.commit_sha = normalizeString(args.commit_sha);
  args.category = normalizeString(args.category);
  args.tool_name = normalizeString(args.tool_name, "CodeQL");
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
  args.max_alert_rows = Math.max(1, args.max_alert_rows);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI CodeQL Summary

Usage:
  node .github/scripts/security/summarize-codeql.js [options]

Examples:
  node .github/scripts/security/summarize-codeql.js --sarif results/codeql.sarif
  node .github/scripts/security/summarize-codeql.js --input-dir artifacts/security/codeql
  node .github/scripts/security/summarize-codeql.js --alerts-file artifacts/security/codeql-alerts.json
  node .github/scripts/security/summarize-codeql.js --fetch-alerts
  node .github/scripts/security/summarize-codeql.js --fail-if-alerts
  node .github/scripts/security/summarize-codeql.js --max-high 0 --max-critical 0

Options:
      --repo <owner/repo>                 Repository slug.
      --api-url <url>                     GitHub API URL.
      --token <token>                     GitHub token.
      --config <file>                     Summary config file.
      --sarif-file <file,list>            CodeQL SARIF file(s).
      --alerts-file <file>                GitHub code scanning alerts JSON.
      --input-dir <dir,list>              Directories to scan for SARIF files.
      --ref <ref>                         Git ref for fetched alerts.
      --sha <sha>                         Commit SHA for fetched alerts.
      --category <name>                   CodeQL analysis category filter.
      --tool-name <name>                  Tool name. Default: CodeQL.
      --fail-on-severities <list>         Alert severities that fail the summary.
      --warn-on-severities <list>         Alert severities that warn the summary.
      --min-report-severity <severity>    Minimum severity included in alert rows.
      --max-open-alerts <number>          Max allowed open alerts. -1 disables.
      --max-critical <number>             Max allowed critical alerts. -1 disables.
      --max-high <number>                 Max allowed high alerts. -1 disables.
      --max-medium <number>               Max allowed medium alerts. -1 disables.
      --max-low <number>                  Max allowed low alerts. -1 disables.
      --max-note <number>                 Max allowed note alerts. -1 disables.
      --max-unknown <number>              Max allowed unknown alerts. -1 disables.
      --fetch-alerts                      Fetch code scanning alerts from GitHub.
      --no-fetch-alerts                   Do not fetch alerts. Default.
      --include-closed-alerts             Include fixed/dismissed alerts from API.
      --include-dismissed-alerts          Include dismissed alerts in totals. Default.
      --include-fixed-alerts              Include fixed alerts in totals.
      --recursive                         Recursively scan input dirs. Default.
      --no-recursive                      Scan only direct files in input dirs.
      --require-results                   Fail when no SARIF/API alerts are found.
      --fail-if-alerts                    Fail when active alerts exist.
      --fail-on-threshold                 Fail when thresholds are exceeded. Default.
      --fail-on-invalid-input             Fail on invalid input files. Default.
      --fail-on-error                     Exit non-zero when summary is not ok. Default.
      --max-alert-rows <number>           Max alert rows in Markdown. Default: 100.
      --timeout-seconds <number>          GitHub API timeout. Default: 60.
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
    return safeJsonParse(stripJsonc(text), null);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleYaml(text);
  }

  return safeJsonParse(stripJsonc(text), null);
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
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = [
    "alerts_file",
    "output_file",
    "summary_file",
    "ref",
    "commit_sha",
    "category",
    "tool_name",
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
    "sarif_files",
    "input_dirs",
    "fail_on_severities",
    "warn_on_severities",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "fetch_alerts",
    "include_closed_alerts",
    "include_dismissed_alerts",
    "include_fixed_alerts",
    "recursive",
    "require_results",
    "fail_if_alerts",
    "fail_on_threshold",
    "fail_on_invalid_input",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  const integerKeys = [
    "max_open_alerts",
    "max_critical",
    "max_high",
    "max_medium",
    "max_low",
    "max_note",
    "max_unknown",
    "max_alert_rows",
    "timeout_seconds",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.sarif_files = [
    ...new Set(merged.sarif_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.input_dirs = [
    ...new Set(merged.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
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
  merged.max_alert_rows = Math.max(1, merged.max_alert_rows);
  merged.timeout_seconds = Math.max(1, merged.timeout_seconds);

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

function discoverSarifFiles(args, repoRoot) {
  const explicit = args.sarif_files
    .map((filePath) => resolvePath(filePath, repoRoot))
    .filter(isFile);

  const discovered = args.input_dirs
    .flatMap((dirPath) =>
      listFiles(resolvePath(dirPath, repoRoot), { recursive: args.recursive }),
    )
    .filter((filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      const basename = path.basename(filePath).toLowerCase();

      return extension === ".sarif" || basename.endsWith(".sarif.json");
    });

  return [...new Set([...explicit, ...discovered])].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right)),
  );
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-summarize-codeql-script`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (bodyBuffer && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (bodyBuffer) {
    headers["Content-Length"] = String(bodyBuffer.length);
  }

  const requestOptions = {
    method: options.method || "GET",
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: (options.timeout_seconds || 60) * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const parsedBody = safeJsonParse(responseText, responseText);
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 300;

        const response = {
          ok,
          status_code: statusCode,
          headers: res.headers,
          body: parsedBody,
          raw_body: responseText,
        };

        if (!ok && !options.allow_error) {
          const message =
            typeof parsedBody === "object" && parsedBody?.message
              ? parsedBody.message
              : responseText || `HTTP ${statusCode}`;

          const error = new Error(`GitHub API request failed: ${message}`);
          error.response = response;
          reject(error);
          return;
        }

        resolve(response);
      });
    });

    req.on("timeout", () => {
      req.destroy(
        new Error(
          `Request timed out after ${options.timeout_seconds || 60} second(s).`,
        ),
      );
    });

    req.on("error", reject);

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }

    req.end();
  });
}

function apiUrl(args, endpoint) {
  return `${args.api_url}${endpoint}`;
}

function repoEndpoint(args, suffix) {
  return `/repos/${args.repository}${suffix}`;
}

async function fetchCodeScanningAlerts(args) {
  const alerts = [];
  let page = 1;

  const state = args.include_closed_alerts ? "all" : "open";
  const params = new URLSearchParams({
    state,
    per_page: "100",
  });

  if (args.ref) params.set("ref", args.ref);
  if (args.commit_sha) params.set("sha", args.commit_sha);
  if (args.category) params.set("category", args.category);
  if (args.tool_name) params.set("tool_name", args.tool_name);

  while (page <= 20) {
    params.set("page", String(page));

    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(args, `/code-scanning/alerts?${params.toString()}`),
      ),
      {
        method: "GET",
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    alerts.push(...body);

    if (body.length < 100) break;

    page += 1;
  }

  return alerts;
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

function extractRuleTags(rule) {
  const tags = [];

  if (Array.isArray(rule?.properties?.tags)) {
    tags.push(...rule.properties.tags);
  }

  if (Array.isArray(rule?.properties?.["tags"])) {
    tags.push(...rule.properties["tags"]);
  }

  return [...new Set(tags.map(normalizeString).filter(Boolean))];
}

function extractCwes(rule) {
  return extractRuleTags(rule)
    .filter((tag) => /^cwe-\d+/i.test(tag))
    .map((tag) => tag.toUpperCase());
}

function extractRulePrecision(rule) {
  return normalizeString(
    rule?.properties?.precision || rule?.properties?.["precision"],
  );
}

function extractSecuritySeverity(rule) {
  return normalizeString(
    rule?.properties?.["security-severity"] ||
      rule?.properties?.securitySeverity ||
      rule?.properties?.security_severity ||
      "",
  );
}

function normalizeSarifLocation(location) {
  const physical = location?.physicalLocation || {};
  const artifact = physical.artifactLocation || {};
  const region = physical.region || {};

  return {
    file: toPosixPath(artifact.uri || artifact.uriBaseId || ""),
    start_line: normalizeInteger(region.startLine, 0),
    start_column: normalizeInteger(region.startColumn, 0),
    end_line: normalizeInteger(region.endLine, 0),
    end_column: normalizeInteger(region.endColumn, 0),
    snippet: normalizeString(region.snippet?.text || ""),
  };
}

function normalizeMessage(message) {
  if (typeof message === "string") return normalizeString(message);
  return normalizeString(message?.text || message?.markdown || "");
}

function fingerprintAlert(parts) {
  const stable = parts
    .map((item) => normalizeString(item).toLowerCase())
    .join("|");

  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function normalizeSarifResult(result, context) {
  const rule = context.rules.get(result.ruleId) || {};
  const securitySeverity = extractSecuritySeverity(rule);
  const severity = securitySeverity
    ? severityFromScore(securitySeverity, severityFromSarifLevel(result.level))
    : normalizeSeverity(
        result.properties?.severity ||
          result.properties?.["problem.severity"] ||
          rule.defaultConfiguration?.level ||
          severityFromSarifLevel(result.level),
        severityFromSarifLevel(result.level),
      );

  const location = normalizeSarifLocation(result.locations?.[0] || {});
  const message = normalizeMessage(result.message);
  const title = normalizeString(
    rule.shortDescription?.text ||
      rule.fullDescription?.text ||
      result.ruleId ||
      "CodeQL alert",
  );

  const partialFingerprints = result.partialFingerprints || {};
  const fingerprint =
    partialFingerprints.primaryLocationLineHash ||
    partialFingerprints.primaryLocationStartColumnFingerprint ||
    result.fingerprints?.["github/codeql"] ||
    result.correlationGuid ||
    fingerprintAlert([
      result.ruleId,
      title,
      message,
      location.file,
      location.start_line,
      context.tool_name,
      context.category,
    ]);

  return {
    source: "sarif",
    source_file: context.source_file,
    fingerprint,
    rule_id: normalizeString(result.ruleId),
    rule_name: normalizeString(rule.name || result.ruleId),
    title,
    message,
    severity,
    level: normalizeString(
      result.level || rule.defaultConfiguration?.level || "",
    ),
    security_severity: securitySeverity
      ? normalizeFloat(securitySeverity, 0)
      : 0,
    precision: extractRulePrecision(rule),
    tags: extractRuleTags(rule),
    cwes: extractCwes(rule),
    state: normalizeState(result.baselineState === "absent" ? "fixed" : "open"),
    baseline_state: normalizeString(result.baselineState),
    tool_name: context.tool_name,
    category: context.category,
    language: context.language,
    location,
    help: normalizeString(rule.help?.text || rule.help?.markdown || ""),
    help_uri: normalizeUrl(rule.helpUri || ""),
    alert_url: "",
  };
}

function parseSarifFile(filePath, repoRoot) {
  const data = readDataFile(filePath, repoRoot);

  if (!data || !Array.isArray(data.runs)) {
    return {
      alerts: [],
      metadata: [],
      error: `Invalid SARIF file: ${toRelativePath(filePath, repoRoot)}`,
    };
  }

  const alerts = [];
  const metadata = [];

  for (const run of data.runs) {
    const rules = ruleMapFromRun(run);
    const toolName = normalizeString(run.tool?.driver?.name || "CodeQL");
    const category = normalizeString(
      run.automationDetails?.id ||
        run.automationDetails?.guid ||
        run.invocations?.[0]?.properties?.category ||
        "",
    );
    const language = normalizeString(
      run.properties?.language ||
        run.properties?.["github/codeql-language"] ||
        "",
    );

    metadata.push({
      source_file: toRelativePath(filePath, repoRoot),
      tool_name: toolName,
      tool_version: normalizeString(
        run.tool?.driver?.semanticVersion || run.tool?.driver?.version || "",
      ),
      category,
      language,
      rule_count: rules.size,
      result_count: Array.isArray(run.results) ? run.results.length : 0,
    });

    for (const result of run.results || []) {
      alerts.push(
        normalizeSarifResult(result, {
          rules,
          source_file: toRelativePath(filePath, repoRoot),
          tool_name: toolName,
          category,
          language,
        }),
      );
    }
  }

  return {
    alerts,
    metadata,
    error: "",
  };
}

function normalizeApiAlert(alert) {
  const instance = alert.most_recent_instance || {};
  const location = instance.location || {};
  const rule = alert.rule || {};
  const tool = alert.tool || {};

  const securitySeverity = normalizeString(
    rule.security_severity_level || rule.securitySeverity || "",
  );
  const severity = normalizeSeverity(
    securitySeverity || rule.severity || alert.severity || "",
    "unknown",
  );

  const file = toPosixPath(location.path || "");
  const startLine = normalizeInteger(
    location.start_line || location.startLine,
    0,
  );
  const message = normalizeMessage(
    instance.message || alert.message || rule.description || "",
  );

  return {
    source: "github-api",
    source_file: "",
    fingerprint: fingerprintAlert([
      alert.number,
      rule.id,
      rule.name,
      file,
      startLine,
      message,
      alert.html_url,
    ]),
    number: normalizeInteger(alert.number, 0),
    rule_id: normalizeString(rule.id || rule.name),
    rule_name: normalizeString(rule.name || rule.id),
    title: normalizeString(
      rule.description || rule.name || rule.id || "Code scanning alert",
    ),
    message,
    severity,
    level: normalizeString(rule.severity || ""),
    security_severity: 0,
    precision: normalizeString(rule.precision),
    tags: [],
    cwes: [],
    state: normalizeState(alert.state, "open"),
    dismissed_reason: normalizeString(alert.dismissed_reason),
    dismissed_comment: normalizeString(alert.dismissed_comment),
    fixed_at: normalizeString(alert.fixed_at),
    created_at: normalizeString(alert.created_at),
    updated_at: normalizeString(alert.updated_at),
    tool_name: normalizeString(tool.name || "CodeQL"),
    category: normalizeString(alert.instances_url || ""),
    language: "",
    location: {
      file,
      start_line: startLine,
      start_column: normalizeInteger(
        location.start_column || location.startColumn,
        0,
      ),
      end_line: normalizeInteger(location.end_line || location.endLine, 0),
      end_column: normalizeInteger(
        location.end_column || location.endColumn,
        0,
      ),
      snippet: "",
    },
    help: "",
    help_uri: normalizeUrl(rule.help_uri || rule.helpUri || ""),
    alert_url: normalizeUrl(alert.html_url),
  };
}

function readAlertsFile(args, repoRoot) {
  if (!args.alerts_file) {
    return {
      alerts: [],
      error: "",
    };
  }

  const data = readDataFile(args.alerts_file, repoRoot);

  if (!data) {
    return {
      alerts: [],
      error: `Alerts file was not readable or contained invalid data: ${args.alerts_file}`,
    };
  }

  const rawAlerts = Array.isArray(data)
    ? data
    : Array.isArray(data.alerts)
      ? data.alerts
      : Array.isArray(data.code_scanning_alerts)
        ? data.code_scanning_alerts
        : [];

  return {
    alerts: rawAlerts.map(normalizeApiAlert),
    error: "",
  };
}

function shouldIncludeAlert(args, alert) {
  if (severityRank(alert.severity) < severityRank(args.min_report_severity)) {
    return false;
  }

  if (alert.state === "dismissed" && !args.include_dismissed_alerts) {
    return false;
  }

  if (alert.state === "fixed" && !args.include_fixed_alerts) {
    return false;
  }

  if (
    ["fixed", "dismissed", "closed"].includes(alert.state) &&
    !args.include_closed_alerts
  ) {
    return false;
  }

  return true;
}

function dedupeAlerts(alerts) {
  const map = new Map();

  for (const alert of alerts) {
    const key = alert.alert_url || alert.fingerprint;

    if (!map.has(key)) {
      map.set(key, alert);
      continue;
    }

    const existing = map.get(key);

    if (existing.source !== "github-api" && alert.source === "github-api") {
      map.set(key, alert);
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
    message: `Found ${count} ${name} alert(s); maximum allowed is ${maxAllowed}.`,
  };
}

function analyzeAlerts(args, loadResult) {
  const alerts = loadResult.alerts.filter((alert) =>
    shouldIncludeAlert(args, alert),
  );
  const activeAlerts = alerts.filter((alert) => alert.state === "open");
  const warningAlerts = activeAlerts.filter((alert) =>
    args.warn_on_severities.includes(alert.severity),
  );
  const failingSeverityAlerts = activeAlerts.filter((alert) =>
    args.fail_on_severities.includes(alert.severity),
  );

  const severityCounts = {
    critical: activeAlerts.filter((alert) => alert.severity === "critical")
      .length,
    high: activeAlerts.filter((alert) => alert.severity === "high").length,
    medium: activeAlerts.filter((alert) => alert.severity === "medium").length,
    low: activeAlerts.filter((alert) => alert.severity === "low").length,
    note: activeAlerts.filter((alert) => alert.severity === "note").length,
    unknown: activeAlerts.filter((alert) => alert.severity === "unknown")
      .length,
  };

  const thresholdViolations = [
    limitViolation("open", activeAlerts.length, args.max_open_alerts),
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("note", severityCounts.note, args.max_note),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];

  if (args.require_results && !loadResult.alerts.length) {
    errors.push("No CodeQL SARIF results or code scanning alerts were found.");
  }

  if (args.fail_if_alerts && activeAlerts.length) {
    errors.push(`CodeQL found ${activeAlerts.length} active alert(s).`);
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
  }

  errors.push(
    ...failingSeverityAlerts.map(
      (alert) => `${alert.rule_id}: ${alert.title} (${alert.severity})`,
    ),
  );
  warnings.push(
    ...warningAlerts.map(
      (alert) => `${alert.rule_id}: ${alert.title} (${alert.severity})`,
    ),
  );

  const ok = errors.length === 0;

  return {
    alerts,
    active_alerts: activeAlerts,
    warning_alerts: warningAlerts,
    failing_alerts: failingSeverityAlerts,
    severity_counts: severityCounts,
    state_counts: countBy(alerts, (alert) => alert.state),
    tool_counts: countBy(alerts, (alert) => alert.tool_name),
    file_counts: countBy(
      alerts.filter((alert) => alert.location.file),
      (alert) => alert.location.file,
    ),
    rule_counts: countBy(alerts, (alert) => alert.rule_id || alert.rule_name),
    threshold_violations: thresholdViolations,
    errors,
    warnings,
    status: ok
      ? warnings.length || warningAlerts.length
        ? "warning"
        : "passed"
      : "failed",
    ok,
  };
}

async function loadCodeQlData(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const metadata = [];
  const alerts = [];

  const sarifFiles = discoverSarifFiles(args, repoRoot);

  for (const filePath of sarifFiles) {
    const parsed = parseSarifFile(filePath, repoRoot);

    if (parsed.error) {
      if (args.fail_on_invalid_input) {
        errors.push(parsed.error);
      } else {
        warnings.push(parsed.error);
      }

      continue;
    }

    metadata.push(...parsed.metadata);
    alerts.push(...parsed.alerts);
  }

  const alertsFileResult = readAlertsFile(args, repoRoot);

  if (alertsFileResult.error) {
    if (args.fail_on_invalid_input) {
      errors.push(alertsFileResult.error);
    } else {
      warnings.push(alertsFileResult.error);
    }
  }

  alerts.push(...alertsFileResult.alerts);

  if (args.fetch_alerts) {
    if (!args.token) {
      const message =
        "GitHub token is missing, so code scanning alerts were not fetched.";

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    } else {
      try {
        const fetchedAlerts = await fetchCodeScanningAlerts(args);
        alerts.push(...fetchedAlerts.map(normalizeApiAlert));
      } catch (err) {
        const message = `Unable to fetch CodeQL code scanning alerts: ${logger.formatError(err)}`;

        if (args.fail_on_invalid_input) {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  const deduped = dedupeAlerts(alerts);

  return {
    sarif_files: sarifFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    metadata,
    alerts: deduped,
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
    type: "security-summarize-codeql",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: endedAt.toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      sarif_files: loadResult.sarif_files,
      alerts_file: args.alerts_file
        ? toRelativePath(resolvePath(args.alerts_file, repoRoot), repoRoot)
        : null,
      input_dirs: args.input_dirs,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      ref: args.ref,
      commit_sha: args.commit_sha,
      category: args.category,
      tool_name: args.tool_name,
      fetch_alerts: args.fetch_alerts,
      include_closed_alerts: args.include_closed_alerts,
      include_dismissed_alerts: args.include_dismissed_alerts,
      include_fixed_alerts: args.include_fixed_alerts,
      min_report_severity: args.min_report_severity,
      fail_on_severities: args.fail_on_severities,
      warn_on_severities: args.warn_on_severities,
      max_open_alerts: args.max_open_alerts,
      max_by_severity: {
        critical: args.max_critical,
        high: args.max_high,
        medium: args.max_medium,
        low: args.max_low,
        note: args.max_note,
        unknown: args.max_unknown,
      },
      require_results: args.require_results,
      fail_if_alerts: args.fail_if_alerts,
      fail_on_threshold: args.fail_on_threshold,
      dry_run: args.dry_run,
    },
    codeql: {
      runs: loadResult.metadata,
      alerts: analysis.alerts,
      active_alerts: analysis.active_alerts,
      warning_alerts: analysis.warning_alerts,
      failing_alerts: analysis.failing_alerts,
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      state_counts: analysis.state_counts,
      tool_counts: analysis.tool_counts,
      file_counts: analysis.file_counts,
      rule_counts: analysis.rule_counts,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      sarif_files: loadResult.sarif_files.length,
      runs: loadResult.metadata.length,
      alerts: analysis.alerts.length,
      active_alerts: analysis.active_alerts.length,
      warning_alerts: analysis.warning_alerts.length,
      failing_alerts: analysis.failing_alerts.length,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      note: analysis.severity_counts.note,
      unknown: analysis.severity_counts.unknown,
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
  return String(value || "").replace(/\|/g, "\\|");
}

function sortedAlerts(alerts) {
  return [...alerts].sort((left, right) => {
    const severityDiff =
      severityRank(right.severity) - severityRank(left.severity);

    if (severityDiff !== 0) return severityDiff;

    const leftFile = left.location?.file || "";
    const rightFile = right.location?.file || "";

    if (leftFile !== rightFile) return leftFile.localeCompare(rightFile);

    return (left.location?.start_line || 0) - (right.location?.start_line || 0);
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
    `# 🛡️ ${PROJECT_NAME} CodeQL Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- SARIF files: \`${report.totals.sarif_files}\``,
    `- CodeQL runs: \`${report.totals.runs}\``,
    `- Alerts: \`${report.totals.alerts}\``,
    `- Active alerts: \`${report.totals.active_alerts}\``,
    `- Failing alerts: \`${report.totals.failing_alerts}\``,
    `- Warning alerts: \`${report.totals.warning_alerts}\``,
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
    `| Note | \`${report.totals.note}\` |`,
    `| Unknown | \`${report.totals.unknown}\` |`,
    "",
  ];

  if (report.codeql.runs.length) {
    lines.push("## 🧪 CodeQL Runs");
    lines.push("");
    lines.push(
      "| Tool | Version | Category | Language | Rules | Results | Source |",
    );
    lines.push("|---|---|---|---|---:|---:|---|");

    for (const run of report.codeql.runs) {
      lines.push(
        `| \`${escapeMarkdown(run.tool_name || "CodeQL")}\` | \`${escapeMarkdown(run.tool_version || "unknown")}\` | \`${escapeMarkdown(run.category || "none")}\` | \`${escapeMarkdown(run.language || "unknown")}\` | \`${run.rule_count}\` | \`${run.result_count}\` | \`${escapeMarkdown(run.source_file)}\` |`,
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

  if (report.codeql.active_alerts.length) {
    lines.push("## 🔐 Active Alerts");
    lines.push("");
    lines.push("| Severity | Rule | Message | File | Line | State | Source |");
    lines.push("|---|---|---|---|---:|---|---|");

    for (const alert of sortedAlerts(report.codeql.active_alerts).slice(
      0,
      report.config.max_alert_rows || 100,
    )) {
      const source = alert.alert_url ? alert.alert_url : alert.source;
      const file = alert.location?.file || "none";
      const line = alert.location?.start_line || 0;

      lines.push(
        `| \`${escapeMarkdown(alert.severity)}\` | \`${escapeMarkdown(alert.rule_id || alert.rule_name || "unknown")}\` | ${escapeMarkdown(alert.message || alert.title || "none")} | \`${escapeMarkdown(file)}\` | \`${line || "n/a"}\` | \`${escapeMarkdown(alert.state)}\` | ${escapeMarkdown(source || "unknown")} |`,
      );
    }

    if (
      report.codeql.active_alerts.length > (report.config.max_alert_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | \`${report.codeql.active_alerts.length - (report.config.max_alert_rows || 100)}\` more alert(s) omitted |`,
      );
    }

    lines.push("");
  }

  const topFiles = topEntries(report.analysis.file_counts, 20);

  if (topFiles.length) {
    lines.push("## 📁 Most Affected Files");
    lines.push("");
    lines.push("| File | Alerts |");
    lines.push("|---|---:|");

    for (const [file, count] of topFiles) {
      lines.push(`| \`${escapeMarkdown(file)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  const topRules = topEntries(report.analysis.rule_counts, 20);

  if (topRules.length) {
    lines.push("## 📏 Most Frequent Rules");
    lines.push("");
    lines.push("| Rule | Alerts |");
    lines.push("|---|---:|");

    for (const [rule, count] of topRules) {
      lines.push(`| \`${escapeMarkdown(rule)}\` | \`${count}\` |`);
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
  lines.push(`- Alerts file: \`${report.config.alerts_file || "none"}\``);
  lines.push(
    `- Fetch alerts: \`${report.config.fetch_alerts ? "true" : "false"}\``,
  );
  lines.push(
    `- Include closed alerts: \`${report.config.include_closed_alerts ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if alerts: \`${report.config.fail_if_alerts ? "true" : "false"}\``,
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
  setGitHubOutput("codeql_summary_file", report.config.output_file);
  setGitHubOutput(
    "codeql_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("codeql_summary_status", report.status);
  setGitHubOutput("codeql_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput("codeql_sarif_files", String(report.totals.sarif_files));
  setGitHubOutput("codeql_runs", String(report.totals.runs));
  setGitHubOutput("codeql_alerts", String(report.totals.alerts));
  setGitHubOutput("codeql_active_alerts", String(report.totals.active_alerts));
  setGitHubOutput(
    "codeql_failing_alerts",
    String(report.totals.failing_alerts),
  );
  setGitHubOutput(
    "codeql_warning_alerts",
    String(report.totals.warning_alerts),
  );

  setGitHubOutput("codeql_critical", String(report.totals.critical));
  setGitHubOutput("codeql_high", String(report.totals.high));
  setGitHubOutput("codeql_medium", String(report.totals.medium));
  setGitHubOutput("codeql_low", String(report.totals.low));
  setGitHubOutput("codeql_note", String(report.totals.note));
  setGitHubOutput("codeql_unknown", String(report.totals.unknown));

  setGitHubOutput("codeql_errors", String(report.totals.errors));
  setGitHubOutput("codeql_warnings", String(report.totals.warnings));

  setGitHubOutput("codeql_alerts_json", JSON.stringify(report.codeql.alerts));
  setGitHubOutput(
    "codeql_active_alerts_json",
    JSON.stringify(report.codeql.active_alerts),
  );
  setGitHubOutput("codeql_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("codeql_warnings_json", JSON.stringify(report.warnings));
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

  logger.info("Summarizing CodeQL results.");

  const loadResult = await loadCodeQlData(args, repoRoot);
  const analysis = analyzeAlerts(args, loadResult);
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
