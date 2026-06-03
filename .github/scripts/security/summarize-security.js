#!/usr/bin/env node
// .github/scripts/security/summarize-security.js
// =============================================================================
// Aerealith AI — Unified Security Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Aggregate security reports produced by repository security automation into a
//   single JSON and Markdown summary for CI, pull requests, releases, and audit
//   review.
//
// Supported report families:
//   - Security policy gate
//   - Security issue creation
//   - Security milestone assignment
//   - CodeQL summaries
//   - Container scan summaries
//   - Dependency summaries
//   - Secrets scan summaries
//   - Generic security JSON reports with status/ok/totals/errors/warnings
//
// Output:
//   - artifacts/security/summarize-security.json
//   - artifacts/security/summarize-security.md
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
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[summarize-security] ${message}`),
    warn: (message) => console.warn(`[summarize-security] WARN: ${message}`),
    error: (message) => console.error(`[summarize-security] ERROR: ${message}`),
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
  ".github/security/summarize-security.json",
  ".github/security/summarize-security.jsonc",
  ".github/security/summarize-security.yaml",
  ".github/security/summarize-security.yml",
  ".github/security/security-summary.json",
  ".github/security/security-summary.jsonc",
  ".github/security/security-summary.yaml",
  ".github/security/security-summary.yml",
  ".github/repo/summarize-security.json",
  ".github/repo/summarize-security.jsonc",
  ".github/repo/summarize-security.yaml",
  ".github/repo/summarize-security.yml",
  ".github/summarize-security.json",
  ".github/summarize-security.jsonc",
  ".github/summarize-security.yaml",
  ".github/summarize-security.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security",
  "artifacts/codeql",
  "artifacts/container-scan",
  "artifacts/dependencies",
  "artifacts/secrets",
  "results",
  ".outputs/security",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-security.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-security.md";

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "info",
  "note",
  "negligible",
  "low",
  "medium",
  "high",
  "critical",
];

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
  if (["negligible", "minimal"].includes(severity)) return "negligible";
  if (["note", "notice"].includes(severity)) return "note";
  if (["info", "informational"].includes(severity)) return "info";
  if (["unknown", "none", "untriaged"].includes(severity)) return "unknown";

  return fallback;
}

function severityRank(severity) {
  const normalized = normalizeSeverity(severity, "unknown");
  const index = DEFAULT_SEVERITY_ORDER.indexOf(normalized);

  return index === -1 ? 0 : index;
}

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.SUMMARIZE_SECURITY_CONFIG_FILE || "",

    report_files: normalizeStringList(
      process.env.SUMMARIZE_SECURITY_REPORT_FILES ||
        process.env.SECURITY_REPORT_FILES ||
        "",
    ),

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_SECURITY_INPUT_DIRS ||
        process.env.SECURITY_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_SECURITY_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_SECURITY_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    ignored_report_files: normalizeStringList(
      process.env.SUMMARIZE_SECURITY_IGNORED_REPORT_FILES || "",
    ),

    ignored_report_types: normalizeStringList(
      process.env.SUMMARIZE_SECURITY_IGNORED_REPORT_TYPES || "",
    ),

    required_report_types: normalizeStringList(
      process.env.SUMMARIZE_SECURITY_REQUIRED_REPORT_TYPES || "",
    ),

    fail_on_report_failure: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_ON_REPORT_FAILURE,
      true,
    ),

    fail_if_no_reports: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_IF_NO_REPORTS,
      false,
    ),

    fail_if_findings: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_IF_FINDINGS,
      false,
    ),

    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_ON_THRESHOLD,
      true,
    ),

    fail_on_required_missing: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_ON_REQUIRED_MISSING,
      true,
    ),

    max_critical: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_CRITICAL,
      -1,
    ),
    max_high: normalizeInteger(process.env.SUMMARIZE_SECURITY_MAX_HIGH, -1),
    max_medium: normalizeInteger(process.env.SUMMARIZE_SECURITY_MAX_MEDIUM, -1),
    max_low: normalizeInteger(process.env.SUMMARIZE_SECURITY_MAX_LOW, -1),
    max_info: normalizeInteger(process.env.SUMMARIZE_SECURITY_MAX_INFO, -1),
    max_note: normalizeInteger(process.env.SUMMARIZE_SECURITY_MAX_NOTE, -1),
    max_negligible: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_NEGLIGIBLE,
      -1,
    ),
    max_unknown: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_UNKNOWN,
      -1,
    ),

    max_active_findings: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_ACTIVE_FINDINGS,
      -1,
    ),

    max_failing_findings: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_FAILING_FINDINGS,
      0,
    ),

    include_raw_reports: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_INCLUDE_RAW_REPORTS,
      false,
    ),

    recursive: normalizeBoolean(process.env.SUMMARIZE_SECURITY_RECURSIVE, true),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_ON_INVALID_INPUT,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_FAIL_ON_ERROR,
      true,
    ),

    max_component_rows: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_COMPONENT_ROWS,
      100,
    ),
    max_error_rows: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_ERROR_ROWS,
      100,
    ),
    max_warning_rows: normalizeInteger(
      process.env.SUMMARIZE_SECURITY_MAX_WARNING_ROWS,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_SECURITY_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_SECURITY_STEP_SUMMARY,
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
      arg === "--file"
    ) {
      args.report_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignore-report-file" || arg === "--ignored-report-file") {
      args.ignored_report_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignore-report-type" || arg === "--ignored-report-type") {
      args.ignored_report_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--require-report-type" || arg === "--required-report-type") {
      args.required_report_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--fail-on-report-failure") {
      args.fail_on_report_failure = true;
      continue;
    }

    if (arg === "--no-fail-on-report-failure") {
      args.fail_on_report_failure = false;
      continue;
    }

    if (arg === "--fail-if-no-reports") {
      args.fail_if_no_reports = true;
      continue;
    }

    if (arg === "--no-fail-if-no-reports") {
      args.fail_if_no_reports = false;
      continue;
    }

    if (arg === "--fail-if-findings") {
      args.fail_if_findings = true;
      continue;
    }

    if (arg === "--no-fail-if-findings") {
      args.fail_if_findings = false;
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

    if (arg === "--fail-on-required-missing") {
      args.fail_on_required_missing = true;
      continue;
    }

    if (arg === "--no-fail-on-required-missing") {
      args.fail_on_required_missing = false;
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

    if (arg === "--max-note") {
      args.max_note = normalizeInteger(argv[index + 1], args.max_note);
      index += 1;
      continue;
    }

    if (arg === "--max-negligible") {
      args.max_negligible = normalizeInteger(
        argv[index + 1],
        args.max_negligible,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-unknown") {
      args.max_unknown = normalizeInteger(argv[index + 1], args.max_unknown);
      index += 1;
      continue;
    }

    if (arg === "--max-active-findings") {
      args.max_active_findings = normalizeInteger(
        argv[index + 1],
        args.max_active_findings,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-failing-findings") {
      args.max_failing_findings = normalizeInteger(
        argv[index + 1],
        args.max_failing_findings,
      );
      index += 1;
      continue;
    }

    if (arg === "--include-raw-reports") {
      args.include_raw_reports = true;
      continue;
    }

    if (arg === "--no-raw-reports") {
      args.include_raw_reports = false;
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

    if (arg === "--max-component-rows") {
      args.max_component_rows = normalizeInteger(
        argv[index + 1],
        args.max_component_rows,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-error-rows") {
      args.max_error_rows = normalizeInteger(
        argv[index + 1],
        args.max_error_rows,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-warning-rows") {
      args.max_warning_rows = normalizeInteger(
        argv[index + 1],
        args.max_warning_rows,
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
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.ignored_report_files = [
    ...new Set(args.ignored_report_files.map(toPosixPath).filter(Boolean)),
  ];
  args.ignored_report_types = [
    ...new Set(
      args.ignored_report_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.required_report_types = [
    ...new Set(
      args.required_report_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.max_component_rows = Math.max(1, args.max_component_rows);
  args.max_error_rows = Math.max(1, args.max_error_rows);
  args.max_warning_rows = Math.max(1, args.max_warning_rows);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Unified Security Summary

Usage:
  node .github/scripts/security/summarize-security.js [options]

Examples:
  node .github/scripts/security/summarize-security.js
  node .github/scripts/security/summarize-security.js --input-dir artifacts/security
  node .github/scripts/security/summarize-security.js --report-file artifacts/security/run-policy-gate.json
  node .github/scripts/security/summarize-security.js --required-report-type codeql --required-report-type secrets
  node .github/scripts/security/summarize-security.js --max-critical 0 --max-high 0
  node .github/scripts/security/summarize-security.js --fail-if-findings

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Summary config file.
      --report-file <file,list>            Security report JSON file(s).
      --input-dir <dir,list>               Directories to scan for security reports.
      --ignore-report-file <file,list>     Report files to ignore.
      --ignore-report-type <type,list>     Component types to ignore.
      --require-report-type <type,list>    Required component types.
      --fail-on-report-failure             Fail if any component report is not OK. Default.
      --no-fail-on-report-failure          Do not fail on failed component reports.
      --fail-if-no-reports                 Fail if no reports are found.
      --fail-if-findings                   Fail if active findings are present.
      --fail-on-threshold                  Fail when configured thresholds are exceeded. Default.
      --max-critical <number>              Max allowed critical findings. -1 disables.
      --max-high <number>                  Max allowed high findings. -1 disables.
      --max-medium <number>                Max allowed medium findings. -1 disables.
      --max-low <number>                   Max allowed low findings. -1 disables.
      --max-info <number>                  Max allowed info findings. -1 disables.
      --max-note <number>                  Max allowed note findings. -1 disables.
      --max-negligible <number>            Max allowed negligible findings. -1 disables.
      --max-unknown <number>               Max allowed unknown findings. -1 disables.
      --max-active-findings <number>       Max allowed active findings. -1 disables.
      --max-failing-findings <number>      Max allowed failing findings. Default: 0.
      --include-raw-reports                Include redacted source reports in JSON.
      --recursive                          Recursively scan input dirs. Default.
      --no-recursive                       Scan only direct files in input dirs.
      --fail-on-invalid-input              Fail on invalid input files. Default.
      --fail-on-error                      Exit non-zero when summary is not OK. Default.
      --max-component-rows <number>        Max component rows in Markdown. Default: 100.
      --max-error-rows <number>            Max error rows in Markdown. Default: 100.
      --max-warning-rows <number>          Max warning rows in Markdown. Default: 100.
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

  if (extension === ".json" || extension === ".jsonc") {
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
  if (!config || typeof config !== "object" || Array.isArray(config))
    return args;

  const merged = { ...args };

  const stringKeys = ["output_file", "summary_file"];

  for (const key of stringKeys) {
    if (config[key] !== undefined && !merged[key]) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "report_files",
    "input_dirs",
    "ignored_report_files",
    "ignored_report_types",
    "required_report_types",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "fail_on_report_failure",
    "fail_if_no_reports",
    "fail_if_findings",
    "fail_on_threshold",
    "fail_on_required_missing",
    "include_raw_reports",
    "recursive",
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
    "max_note",
    "max_negligible",
    "max_unknown",
    "max_active_findings",
    "max_failing_findings",
    "max_component_rows",
    "max_error_rows",
    "max_warning_rows",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.report_files = [
    ...new Set(merged.report_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.input_dirs = [
    ...new Set(merged.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  merged.ignored_report_files = [
    ...new Set(merged.ignored_report_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.ignored_report_types = [
    ...new Set(
      merged.ignored_report_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.required_report_types = [
    ...new Set(
      merged.required_report_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.max_component_rows = Math.max(1, merged.max_component_rows);
  merged.max_error_rows = Math.max(1, merged.max_error_rows);
  merged.max_warning_rows = Math.max(1, merged.max_warning_rows);

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

function looksLikeSecurityReport(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  if (![".json", ".jsonc"].includes(extension)) return false;
  if (basename.endsWith(".sarif.json")) return false;
  if (basename === "package.json") return false;

  return (
    basename.includes("security") ||
    basename.includes("codeql") ||
    basename.includes("container") ||
    basename.includes("dependency") ||
    basename.includes("dependencies") ||
    basename.includes("secrets") ||
    basename.includes("secret") ||
    basename.includes("policy-gate") ||
    basename.includes("scan") ||
    basename.includes("audit") ||
    basename.includes("summary")
  );
}

function discoverReportFiles(args, repoRoot) {
  const outputFile = toRelativePath(
    resolvePath(args.output_file, repoRoot),
    repoRoot,
  );
  const summaryFile = toRelativePath(
    resolvePath(args.summary_file, repoRoot),
    repoRoot,
  );

  const ignored = new Set(
    [outputFile, summaryFile, ...args.ignored_report_files].map(toPosixPath),
  );

  const explicit = args.report_files
    .map((filePath) => resolvePath(filePath, repoRoot))
    .filter(isFile);

  const discovered = args.input_dirs
    .flatMap((dirPath) =>
      listFiles(resolvePath(dirPath, repoRoot), { recursive: args.recursive }),
    )
    .filter(looksLikeSecurityReport);

  return [...new Set([...explicit, ...discovered])]
    .filter((filePath) => {
      const relative = toRelativePath(filePath, repoRoot);
      return !ignored.has(relative);
    })
    .sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right)));
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNestedNumber(source, paths) {
  for (const pathSpec of paths) {
    const parts = pathSpec.split(".");
    let current = source;

    for (const part of parts) {
      current = current?.[part];
    }

    if (current !== undefined && current !== null) {
      return numberValue(current);
    }
  }

  return 0;
}

function getReportType(report) {
  const type = normalizeString(report?.type).toLowerCase();

  if (type) return type;

  if (report?.codeql) return "security-summarize-codeql";
  if (report?.container_scan) return "security-summarize-container-scan";
  if (report?.dependency_scan) return "security-summarize-dependencies";
  if (report?.secrets_scan) return "security-summarize-secrets-scan";
  if (report?.gate) return "security-policy-gate";
  if (report?.assignment) return "security-assign-milestones";

  return "generic-security-report";
}

function componentKindFromType(type) {
  if (type.includes("policy-gate")) return "policy";
  if (type.includes("create-issues")) return "issues";
  if (type.includes("assign-milestones")) return "milestones";
  if (type.includes("codeql")) return "codeql";
  if (type.includes("container")) return "container";
  if (type.includes("dependencies") || type.includes("dependency"))
    return "dependencies";
  if (type.includes("secrets") || type.includes("secret")) return "secrets";
  return "generic";
}

function componentNameFromKind(kind) {
  const names = {
    policy: "Security Policy Gate",
    issues: "Security Issue Creation",
    milestones: "Security Milestone Assignment",
    codeql: "CodeQL",
    container: "Container Scan",
    dependencies: "Dependency Scan",
    secrets: "Secrets Scan",
    generic: "Security Report",
  };

  return names[kind] || "Security Report";
}

function extractSeverityCounts(report) {
  const totals = report?.totals || {};
  const analysisCounts =
    report?.analysis?.severity_counts || report?.gate?.severity_counts || {};

  return {
    critical: numberValue(totals.critical ?? analysisCounts.critical),
    high: numberValue(totals.high ?? analysisCounts.high),
    medium: numberValue(totals.medium ?? analysisCounts.medium),
    low: numberValue(totals.low ?? analysisCounts.low),
    info: numberValue(totals.info ?? analysisCounts.info),
    note: numberValue(totals.note ?? analysisCounts.note),
    negligible: numberValue(totals.negligible ?? analysisCounts.negligible),
    unknown: numberValue(totals.unknown ?? analysisCounts.unknown),
  };
}

function extractComponentSummary(report, sourceFile) {
  const type = getReportType(report);
  const kind = componentKindFromType(type);
  const totals = report?.totals || {};
  const status = normalizeString(
    report?.status || report?.execution?.status || "unknown",
  );
  const ok =
    report?.ok === undefined
      ? !["failed", "invalid"].includes(status)
      : Boolean(report.ok);
  const severityCounts = extractSeverityCounts(report);

  const activeFindings =
    getNestedNumber(report, [
      "totals.active_findings",
      "totals.active_alerts",
      "totals.vulnerabilities",
      "totals.findings",
      "totals.security_policy_active_findings",
      "totals.security_findings",
    ]) || 0;

  const failingFindings =
    getNestedNumber(report, [
      "totals.failing_findings",
      "totals.failing_alerts",
      "totals.failing_vulnerabilities",
      "totals.failed",
    ]) || 0;

  const warningFindings =
    getNestedNumber(report, [
      "totals.warning_findings",
      "totals.warning_alerts",
      "totals.warning_vulnerabilities",
      "totals.warnings",
    ]) || 0;

  const createdIssues =
    getNestedNumber(report, [
      "totals.created",
      "totals.security_issues_created",
    ]) || 0;

  const changed = Boolean(report?.execution?.changed || totals.changed);

  return {
    type,
    kind,
    name: componentNameFromKind(kind),
    source_file: sourceFile,
    status,
    ok,
    dry_run: Boolean(
      report?.config?.dry_run || report?.execution?.dry_run || report?.dry_run,
    ),
    severity_counts: severityCounts,
    active_findings: activeFindings,
    failing_findings: failingFindings,
    warning_findings: warningFindings,
    created_issues: createdIssues,
    changed,
    errors: Array.isArray(report?.errors)
      ? report.errors.map(normalizeString).filter(Boolean)
      : [],
    warnings: Array.isArray(report?.warnings)
      ? report.warnings.map(normalizeString).filter(Boolean)
      : [],
    summary: {
      scan_files: numberValue(totals.scan_files),
      report_files: numberValue(totals.report_files),
      manifest_files: numberValue(totals.manifest_files),
      findings: numberValue(totals.findings),
      vulnerabilities: numberValue(totals.vulnerabilities),
      alerts: numberValue(totals.alerts),
      active_alerts: numberValue(totals.active_alerts),
      active_findings: numberValue(totals.active_findings),
      secrets: numberValue(totals.secrets),
      dependencies: numberValue(totals.dependencies),
      errors: numberValue(totals.errors),
      warnings: numberValue(totals.warnings),
    },
  };
}

function loadSecurityReports(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const components = [];
  const rawReports = [];

  const reportFiles = discoverReportFiles(args, repoRoot);

  for (const filePath of reportFiles) {
    const sourceFile = toRelativePath(filePath, repoRoot);
    const report = readDataFile(filePath, repoRoot);

    if (!report || typeof report !== "object" || Array.isArray(report)) {
      const message = `Invalid security report file: ${sourceFile}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }

      continue;
    }

    const type = getReportType(report);
    const kind = componentKindFromType(type);

    if (type === "security-summary" || type === "security-summarize-security") {
      continue;
    }

    if (
      args.ignored_report_types.includes(type) ||
      args.ignored_report_types.includes(kind)
    ) {
      continue;
    }

    const component = extractComponentSummary(report, sourceFile);

    components.push(component);

    if (args.include_raw_reports) {
      rawReports.push({
        source_file: sourceFile,
        report,
      });
    }
  }

  return {
    report_files: reportFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    components,
    raw_reports: rawReports,
    errors,
    warnings,
  };
}

function addSeverityCounts(left, right) {
  return {
    critical: numberValue(left.critical) + numberValue(right.critical),
    high: numberValue(left.high) + numberValue(right.high),
    medium: numberValue(left.medium) + numberValue(right.medium),
    low: numberValue(left.low) + numberValue(right.low),
    info: numberValue(left.info) + numberValue(right.info),
    note: numberValue(left.note) + numberValue(right.note),
    negligible: numberValue(left.negligible) + numberValue(right.negligible),
    unknown: numberValue(left.unknown) + numberValue(right.unknown),
  };
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
    message: `Found ${count} ${name} security finding(s); maximum allowed is ${maxAllowed}.`,
  };
}

function analyzeSecurity(args, loadResult) {
  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];
  const components = loadResult.components;

  const severityCounts = components.reduce(
    (accumulator, component) =>
      addSeverityCounts(accumulator, component.severity_counts),
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      note: 0,
      negligible: 0,
      unknown: 0,
    },
  );

  const activeFindings = components.reduce(
    (total, component) => total + component.active_findings,
    0,
  );
  const failingFindings = components.reduce(
    (total, component) => total + component.failing_findings,
    0,
  );
  const warningFindings = components.reduce(
    (total, component) => total + component.warning_findings,
    0,
  );
  const createdIssues = components.reduce(
    (total, component) => total + component.created_issues,
    0,
  );

  const failedComponents = components.filter((component) => !component.ok);
  const missingRequiredTypes = args.required_report_types.filter(
    (requiredType) => {
      const normalized = normalizeString(requiredType).toLowerCase();

      return !components.some(
        (component) =>
          component.type === normalized ||
          component.kind === normalized ||
          component.name.toLowerCase() === normalized,
      );
    },
  );

  const thresholdViolations = [
    limitViolation("active", activeFindings, args.max_active_findings),
    limitViolation("failing", failingFindings, args.max_failing_findings),
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("info", severityCounts.info, args.max_info),
    limitViolation("note", severityCounts.note, args.max_note),
    limitViolation(
      "negligible",
      severityCounts.negligible,
      args.max_negligible,
    ),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  if (!components.length && args.fail_if_no_reports) {
    errors.push("No security reports were found.");
  }

  if (args.fail_on_report_failure && failedComponents.length) {
    errors.push(
      ...failedComponents.map(
        (component) =>
          `${component.name} report is not OK: ${component.status} (${component.source_file})`,
      ),
    );
  }

  if (args.fail_if_findings && activeFindings > 0) {
    errors.push(`Security summary found ${activeFindings} active finding(s).`);
  }

  if (args.fail_on_required_missing && missingRequiredTypes.length) {
    errors.push(
      `Missing required security report type(s): ${missingRequiredTypes.join(", ")}`,
    );
  } else if (missingRequiredTypes.length) {
    warnings.push(
      `Missing required security report type(s): ${missingRequiredTypes.join(", ")}`,
    );
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
  }

  for (const component of components) {
    errors.push(
      ...component.errors.map((error) => `${component.name}: ${error}`),
    );

    warnings.push(
      ...component.warnings.map((warning) => `${component.name}: ${warning}`),
    );
  }

  const ok = errors.length === 0;

  return {
    components,
    failed_components: failedComponents,
    missing_required_types: missingRequiredTypes,
    severity_counts: severityCounts,
    component_type_counts: countBy(components, (component) => component.kind),
    status_counts: countBy(components, (component) => component.status),
    threshold_violations: thresholdViolations,
    active_findings: activeFindings,
    failing_findings: failingFindings,
    warning_findings: warningFindings,
    created_issues: createdIssues,
    errors,
    warnings,
    status: ok
      ? warnings.length || warningFindings > 0
        ? "warning"
        : "passed"
      : "failed",
    ok,
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
    type: "security-summarize-security",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: endedAt.toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      report_files: loadResult.report_files,
      input_dirs: args.input_dirs,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      ignored_report_files: args.ignored_report_files,
      ignored_report_types: args.ignored_report_types,
      required_report_types: args.required_report_types,
      fail_on_report_failure: args.fail_on_report_failure,
      fail_if_no_reports: args.fail_if_no_reports,
      fail_if_findings: args.fail_if_findings,
      fail_on_threshold: args.fail_on_threshold,
      fail_on_required_missing: args.fail_on_required_missing,
      max_by_severity: {
        critical: args.max_critical,
        high: args.max_high,
        medium: args.max_medium,
        low: args.max_low,
        info: args.max_info,
        note: args.max_note,
        negligible: args.max_negligible,
        unknown: args.max_unknown,
      },
      max_active_findings: args.max_active_findings,
      max_failing_findings: args.max_failing_findings,
      include_raw_reports: args.include_raw_reports,
      recursive: args.recursive,
      dry_run: args.dry_run,
    },
    security: {
      components: analysis.components,
      failed_components: analysis.failed_components,
      missing_required_types: analysis.missing_required_types,
      raw_reports: args.include_raw_reports ? loadResult.raw_reports : [],
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      component_type_counts: analysis.component_type_counts,
      status_counts: analysis.status_counts,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      reports_found: loadResult.report_files.length,
      reports_loaded: analysis.components.length,
      components: analysis.components.length,
      failed_components: analysis.failed_components.length,
      missing_required_types: analysis.missing_required_types.length,
      active_findings: analysis.active_findings,
      failing_findings: analysis.failing_findings,
      warning_findings: analysis.warning_findings,
      created_issues: analysis.created_issues,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      info: analysis.severity_counts.info,
      note: analysis.severity_counts.note,
      negligible: analysis.severity_counts.negligible,
      unknown: analysis.severity_counts.unknown,
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

function sortedComponents(components) {
  return [...components].sort((left, right) => {
    if (left.ok !== right.ok) return left.ok ? 1 : -1;

    const severityDiff =
      severityRank("critical") *
        (right.severity_counts.critical - left.severity_counts.critical) ||
      severityRank("high") *
        (right.severity_counts.high - left.severity_counts.high);

    if (severityDiff !== 0) return severityDiff;

    return left.name.localeCompare(right.name);
  });
}

function createMarkdownSummary(report) {
  const icon = report.ok ? (report.status === "warning" ? "⚠️" : "✅") : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Unified Security Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Reports found: \`${report.totals.reports_found}\``,
    `- Reports loaded: \`${report.totals.reports_loaded}\``,
    `- Failed components: \`${report.totals.failed_components}\``,
    `- Active findings: \`${report.totals.active_findings}\``,
    `- Failing findings: \`${report.totals.failing_findings}\``,
    `- Warning findings: \`${report.totals.warning_findings}\``,
    `- Created security issues: \`${report.totals.created_issues}\``,
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
    "## 📊 Aggregated Severity Counts",
    "",
    "| Severity | Count |",
    "|---|---:|",
    `| Critical | \`${report.totals.critical}\` |`,
    `| High | \`${report.totals.high}\` |`,
    `| Medium | \`${report.totals.medium}\` |`,
    `| Low | \`${report.totals.low}\` |`,
    `| Info | \`${report.totals.info}\` |`,
    `| Note | \`${report.totals.note}\` |`,
    `| Negligible | \`${report.totals.negligible}\` |`,
    `| Unknown | \`${report.totals.unknown}\` |`,
    "",
  ];

  if (report.security.components.length) {
    lines.push("## 🧩 Component Reports");
    lines.push("");
    lines.push(
      "| OK | Component | Status | Active | Failing | Warning | Critical | High | Source |",
    );
    lines.push("|---|---|---|---:|---:|---:|---:|---:|---|");

    for (const component of sortedComponents(report.security.components).slice(
      0,
      report.config.max_component_rows || 100,
    )) {
      lines.push(
        `| \`${component.ok ? "true" : "false"}\` | ${escapeMarkdown(component.name)} | \`${escapeMarkdown(component.status)}\` | \`${component.active_findings}\` | \`${component.failing_findings}\` | \`${component.warning_findings}\` | \`${component.severity_counts.critical}\` | \`${component.severity_counts.high}\` | \`${escapeMarkdown(component.source_file)}\` |`,
      );
    }

    if (
      report.security.components.length >
      (report.config.max_component_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | … | … | \`${report.security.components.length - (report.config.max_component_rows || 100)}\` more component(s) omitted |`,
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

  if (report.security.missing_required_types.length) {
    lines.push("## 🚫 Missing Required Reports");
    lines.push("");

    for (const type of report.security.missing_required_types) {
      lines.push(`- \`${escapeMarkdown(type)}\``);
    }

    lines.push("");
  }

  if (report.errors.length) {
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors.slice(
      0,
      report.config.max_error_rows || 100,
    )) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }

    if (report.errors.length > (report.config.max_error_rows || 100)) {
      lines.push(
        `- ...and \`${report.errors.length - (report.config.max_error_rows || 100)}\` more error(s).`,
      );
    }

    lines.push("");
  }

  if (report.warnings.length) {
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(
      0,
      report.config.max_warning_rows || 100,
    )) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }

    if (report.warnings.length > (report.config.max_warning_rows || 100)) {
      lines.push(
        `- ...and \`${report.warnings.length - (report.config.max_warning_rows || 100)}\` more warning(s).`,
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
    `- Input dirs: \`${escapeMarkdown(report.config.input_dirs.join(", ") || "none")}\``,
  );
  lines.push(
    `- Required report types: \`${escapeMarkdown(report.config.required_report_types.join(", ") || "none")}\``,
  );
  lines.push(
    `- Ignored report types: \`${escapeMarkdown(report.config.ignored_report_types.join(", ") || "none")}\``,
  );
  lines.push(
    `- Fail on report failure: \`${report.config.fail_on_report_failure ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if findings: \`${report.config.fail_if_findings ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail on threshold: \`${report.config.fail_on_threshold ? "true" : "false"}\``,
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
  setGitHubOutput("security_summary_file", report.config.output_file);
  setGitHubOutput(
    "security_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("security_summary_status", report.status);
  setGitHubOutput("security_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "security_reports_found",
    String(report.totals.reports_found),
  );
  setGitHubOutput(
    "security_reports_loaded",
    String(report.totals.reports_loaded),
  );
  setGitHubOutput("security_components", String(report.totals.components));
  setGitHubOutput(
    "security_failed_components",
    String(report.totals.failed_components),
  );

  setGitHubOutput(
    "security_active_findings",
    String(report.totals.active_findings),
  );
  setGitHubOutput(
    "security_failing_findings",
    String(report.totals.failing_findings),
  );
  setGitHubOutput(
    "security_warning_findings",
    String(report.totals.warning_findings),
  );
  setGitHubOutput(
    "security_created_issues",
    String(report.totals.created_issues),
  );

  setGitHubOutput("security_critical", String(report.totals.critical));
  setGitHubOutput("security_high", String(report.totals.high));
  setGitHubOutput("security_medium", String(report.totals.medium));
  setGitHubOutput("security_low", String(report.totals.low));
  setGitHubOutput("security_info", String(report.totals.info));
  setGitHubOutput("security_note", String(report.totals.note));
  setGitHubOutput("security_negligible", String(report.totals.negligible));
  setGitHubOutput("security_unknown", String(report.totals.unknown));

  setGitHubOutput("security_errors", String(report.totals.errors));
  setGitHubOutput("security_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "security_components_json",
    JSON.stringify(report.security.components),
  );
  setGitHubOutput(
    "security_failed_components_json",
    JSON.stringify(report.security.failed_components),
  );
  setGitHubOutput("security_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("security_warnings_json", JSON.stringify(report.warnings));
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

  logger.info("Summarizing unified security results.");

  const loadResult = loadSecurityReports(args, repoRoot);
  const analysis = analyzeSecurity(args, loadResult);
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
