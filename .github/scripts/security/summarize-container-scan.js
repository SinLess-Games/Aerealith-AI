#!/usr/bin/env node
// .github/scripts/security/summarize-container-scan.js
// =============================================================================
// Aerealith AI — Container Scan Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize container image vulnerability scan output from Trivy, Grype,
//   Docker Scout, SARIF-like scanners, and generic JSON reports into clean JSON
//   and Markdown reports for CI, release, and security workflows.
//
// Input:
//   - Container scan JSON/SARIF file(s)
//   - Optional config file
//   - Direct CLI/env inputs
//
// Output:
//   - artifacts/security/summarize-container-scan.json
//   - artifacts/security/summarize-container-scan.md
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
    info: (message) => console.log(`[summarize-container-scan] ${message}`),
    warn: (message) =>
      console.warn(`[summarize-container-scan] WARN: ${message}`),
    error: (message) =>
      console.error(`[summarize-container-scan] ERROR: ${message}`),
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
  ".github/security/summarize-container-scan.json",
  ".github/security/summarize-container-scan.jsonc",
  ".github/security/summarize-container-scan.yaml",
  ".github/security/summarize-container-scan.yml",
  ".github/security/container-scan-summary.json",
  ".github/security/container-scan-summary.jsonc",
  ".github/security/container-scan-summary.yaml",
  ".github/security/container-scan-summary.yml",
  ".github/repo/summarize-container-scan.json",
  ".github/repo/summarize-container-scan.jsonc",
  ".github/repo/summarize-container-scan.yaml",
  ".github/repo/summarize-container-scan.yml",
  ".github/summarize-container-scan.json",
  ".github/summarize-container-scan.jsonc",
  ".github/summarize-container-scan.yaml",
  ".github/summarize-container-scan.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security/container",
  "artifacts/security/container-scan",
  "artifacts/security/containers",
  "artifacts/container-scan",
  "artifacts/trivy",
  "artifacts/grype",
  "artifacts/docker-scout",
  "results",
  ".outputs/container-scan",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-container-scan.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-container-scan.md";

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "negligible",
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
  if (["high", "major"].includes(severity)) return "high";
  if (["medium", "moderate", "med"].includes(severity)) return "medium";
  if (["low", "minor"].includes(severity)) return "low";
  if (["negligible", "none", "minimal"].includes(severity)) return "negligible";
  if (["unknown", "untriaged"].includes(severity)) return "unknown";

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

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function normalizeImage(value) {
  return normalizeString(value);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.SUMMARIZE_CONTAINER_SCAN_CONFIG_FILE || "",

    scan_files: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_FILES ||
        process.env.CONTAINER_SCAN_FILES ||
        process.env.TRIVY_SCAN_FILES ||
        process.env.GRYPE_SCAN_FILES ||
        "",
    ),

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_INPUT_DIRS ||
        process.env.CONTAINER_SCAN_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_CONTAINER_SCAN_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_CONTAINER_SCAN_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    image:
      process.env.SUMMARIZE_CONTAINER_SCAN_IMAGE ||
      process.env.CONTAINER_IMAGE ||
      process.env.IMAGE ||
      "",

    scanner:
      process.env.SUMMARIZE_CONTAINER_SCAN_SCANNER ||
      process.env.CONTAINER_SCANNER ||
      "",

    fail_on_severities: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    min_report_severity: normalizeSeverity(
      process.env.SUMMARIZE_CONTAINER_SCAN_MIN_REPORT_SEVERITY || "unknown",
      "unknown",
    ),

    max_critical: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_CRITICAL,
      -1,
    ),
    max_high: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_HIGH,
      -1,
    ),
    max_medium: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_MEDIUM,
      -1,
    ),
    max_low: normalizeInteger(process.env.SUMMARIZE_CONTAINER_SCAN_MAX_LOW, -1),
    max_negligible: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_NEGLIGIBLE,
      -1,
    ),
    max_unknown: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_UNKNOWN,
      -1,
    ),
    max_total: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_TOTAL,
      -1,
    ),

    ignore_unfixed: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_IGNORE_UNFIXED,
      false,
    ),
    include_unfixed: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_INCLUDE_UNFIXED,
      true,
    ),
    include_os_packages: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_INCLUDE_OS_PACKAGES,
      true,
    ),
    include_library_packages: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_INCLUDE_LIBRARY_PACKAGES,
      true,
    ),

    ignored_vulnerabilities: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_IGNORED_VULNERABILITIES ||
        process.env.CONTAINER_SCAN_IGNORED_VULNERABILITIES ||
        "",
    ),

    ignored_packages: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_IGNORED_PACKAGES ||
        process.env.CONTAINER_SCAN_IGNORED_PACKAGES ||
        "",
    ),

    ignored_images: normalizeStringList(
      process.env.SUMMARIZE_CONTAINER_SCAN_IGNORED_IMAGES ||
        process.env.CONTAINER_SCAN_IGNORED_IMAGES ||
        "",
    ),

    recursive: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_RECURSIVE,
      true,
    ),
    require_results: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_REQUIRE_RESULTS,
      false,
    ),
    fail_if_vulnerabilities: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_FAIL_IF_VULNERABILITIES,
      false,
    ),
    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_FAIL_ON_THRESHOLD,
      true,
    ),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_FAIL_ON_INVALID_INPUT,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_FAIL_ON_ERROR,
      true,
    ),

    max_vulnerability_rows: normalizeInteger(
      process.env.SUMMARIZE_CONTAINER_SCAN_MAX_ROWS,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_CONTAINER_SCAN_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_CONTAINER_SCAN_STEP_SUMMARY,
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

    if (arg === "--scan-file" || arg === "--scan-files" || arg === "--file") {
      args.scan_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--image") {
      args.image = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--scanner") {
      args.scanner = argv[index + 1];
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

    if (arg === "--max-total") {
      args.max_total = normalizeInteger(argv[index + 1], args.max_total);
      index += 1;
      continue;
    }

    if (arg === "--ignore-unfixed") {
      args.ignore_unfixed = true;
      args.include_unfixed = false;
      continue;
    }

    if (arg === "--include-unfixed") {
      args.include_unfixed = true;
      args.ignore_unfixed = false;
      continue;
    }

    if (arg === "--no-os-packages") {
      args.include_os_packages = false;
      continue;
    }

    if (arg === "--no-library-packages") {
      args.include_library_packages = false;
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

    if (arg === "--ignore-image" || arg === "--ignored-image") {
      args.ignored_images.push(...normalizeStringList(argv[index + 1]));
      index += 1;
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

    if (arg === "--max-rows") {
      args.max_vulnerability_rows = normalizeInteger(
        argv[index + 1],
        args.max_vulnerability_rows,
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
  args.image = normalizeImage(args.image);
  args.scanner = normalizeString(args.scanner).toLowerCase();
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
  args.ignored_images = [
    ...new Set(
      args.ignored_images
        .map((item) => normalizeImage(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.max_vulnerability_rows = Math.max(1, args.max_vulnerability_rows);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Container Scan Summary

Usage:
  node .github/scripts/security/summarize-container-scan.js [options]

Examples:
  node .github/scripts/security/summarize-container-scan.js --scan-file artifacts/security/trivy.json
  node .github/scripts/security/summarize-container-scan.js --input-dir artifacts/security/container-scan
  node .github/scripts/security/summarize-container-scan.js --image ghcr.io/sinless-games/aerealith-ai:latest
  node .github/scripts/security/summarize-container-scan.js --max-critical 0 --max-high 0
  node .github/scripts/security/summarize-container-scan.js --fail-if-vulnerabilities
  node .github/scripts/security/summarize-container-scan.js --ignore-unfixed

Supported scanner shapes:
  - Trivy JSON
  - Grype JSON
  - Docker Scout JSON
  - SARIF-like JSON
  - Generic JSON with vulnerabilities/findings/results/matches arrays

Options:
      --repo <owner/repo>                 Repository slug.
      --config <file>                     Summary config file.
      --scan-file <file,list>             Container scan JSON/SARIF file(s).
      --input-dir <dir,list>              Directories to scan for reports.
      --image <image>                     Image name override.
      --scanner <name>                    Scanner name override.
      --fail-on-severities <list>         Severities that fail the summary.
      --warn-on-severities <list>         Severities that warn the summary.
      --min-report-severity <severity>    Minimum severity included in rows.
      --max-critical <number>             Max allowed critical vulns. -1 disables.
      --max-high <number>                 Max allowed high vulns. -1 disables.
      --max-medium <number>               Max allowed medium vulns. -1 disables.
      --max-low <number>                  Max allowed low vulns. -1 disables.
      --max-negligible <number>           Max allowed negligible vulns. -1 disables.
      --max-unknown <number>              Max allowed unknown vulns. -1 disables.
      --max-total <number>                Max allowed total vulns. -1 disables.
      --ignore-unfixed                    Exclude vulnerabilities with no fixed version.
      --include-unfixed                   Include vulnerabilities with no fixed version. Default.
      --no-os-packages                    Exclude OS/package-manager findings.
      --no-library-packages               Exclude application/library findings.
      --ignore-vulnerability <id,list>    Vulnerability IDs to ignore.
      --ignore-package <name,list>        Package names to ignore.
      --ignore-image <image,list>         Image names to ignore.
      --recursive                         Recursively scan input dirs. Default.
      --no-recursive                      Scan only direct files in input dirs.
      --require-results                   Fail when no scan results are found.
      --fail-if-vulnerabilities           Fail when active vulnerabilities exist.
      --fail-on-threshold                 Fail when thresholds are exceeded. Default.
      --fail-on-invalid-input             Fail on invalid input files. Default.
      --fail-on-error                     Exit non-zero when summary is not ok. Default.
      --max-rows <number>                 Max vulnerability rows in Markdown. Default: 100.
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
    "output_file",
    "summary_file",
    "image",
    "scanner",
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
    "scan_files",
    "input_dirs",
    "fail_on_severities",
    "warn_on_severities",
    "ignored_vulnerabilities",
    "ignored_packages",
    "ignored_images",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "ignore_unfixed",
    "include_unfixed",
    "include_os_packages",
    "include_library_packages",
    "recursive",
    "require_results",
    "fail_if_vulnerabilities",
    "fail_on_threshold",
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
    "max_negligible",
    "max_unknown",
    "max_total",
    "max_vulnerability_rows",
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
  merged.image = normalizeImage(merged.image);
  merged.scanner = normalizeString(merged.scanner).toLowerCase();
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
  merged.ignored_images = [
    ...new Set(
      merged.ignored_images
        .map((item) => normalizeImage(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.max_vulnerability_rows = Math.max(1, merged.max_vulnerability_rows);

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

function looksLikeScanFile(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  if (![".json", ".jsonc", ".sarif"].includes(extension)) return false;

  return (
    basename.includes("trivy") ||
    basename.includes("grype") ||
    basename.includes("scout") ||
    basename.includes("docker-scout") ||
    basename.includes("container") ||
    basename.includes("image-scan") ||
    basename.includes("vulnerability") ||
    basename.includes("vulnerabilities") ||
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
    .filter(looksLikeScanFile);

  return [...new Set([...explicit, ...discovered])].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right)),
  );
}

function fingerprintVulnerability(parts) {
  const stable = parts
    .map((item) => normalizeString(item).toLowerCase())
    .join("|");

  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function detectScanner(data, filePath, args) {
  if (args.scanner) return args.scanner;

  const basename = path.basename(filePath).toLowerCase();

  if (
    Array.isArray(data?.Results) &&
    (data.ArtifactName || data.ArtifactType || data.SchemaVersion)
  )
    return "trivy";
  if (Array.isArray(data?.matches) && data?.source) return "grype";
  if (Array.isArray(data?.runs) && data.version && data.$schema) return "sarif";
  if (basename.includes("trivy")) return "trivy";
  if (basename.includes("grype")) return "grype";
  if (basename.includes("scout")) return "docker-scout";
  if (basename.endsWith(".sarif") || basename.endsWith(".sarif.json"))
    return "sarif";

  return "generic";
}

function normalizeReferenceList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeUrl).filter(Boolean))];
  }

  return normalizeStringList(value).map(normalizeUrl).filter(Boolean);
}

function normalizeFixedVersion(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean).join(", ");
  }

  return normalizeString(value);
}

function normalizePackageType(value, targetType = "") {
  const source = normalizeString(value || targetType).toLowerCase();

  if (
    [
      "os",
      "deb",
      "rpm",
      "apk",
      "alpine",
      "redhat",
      "debian",
      "ubuntu",
      "amazon",
      "photon",
      "alma",
      "rocky",
      "oracle",
    ].includes(source)
  ) {
    return "os";
  }

  if (
    [
      "library",
      "lang-pkgs",
      "npm",
      "yarn",
      "pnpm",
      "pip",
      "poetry",
      "gem",
      "maven",
      "gradle",
      "go",
      "gomod",
      "cargo",
      "composer",
      "nuget",
    ].includes(source)
  ) {
    return "library";
  }

  if (source.includes("package")) return "os";
  if (source.includes("library")) return "library";

  return "unknown";
}

function normalizeVulnerability(raw, context) {
  const id = normalizeString(
    raw.id ||
      raw.vulnerability_id ||
      raw.vulnerabilityId ||
      raw.VulnerabilityID ||
      raw.cve ||
      raw.name ||
      raw.rule_id ||
      raw.ruleId ||
      raw.advisory_id ||
      raw.advisoryId,
  ).toUpperCase();

  const packageName = normalizeString(
    raw.package_name ||
      raw.packageName ||
      raw.pkg_name ||
      raw.pkgName ||
      raw.PkgName ||
      raw.package ||
      raw.artifact_name ||
      raw.artifactName ||
      raw.module_name ||
      raw.moduleName,
  );

  const installedVersion = normalizeString(
    raw.installed_version ||
      raw.installedVersion ||
      raw.InstalledVersion ||
      raw.version ||
      raw.current_version ||
      raw.currentVersion,
  );

  const fixedVersion = normalizeFixedVersion(
    raw.fixed_version ||
      raw.fixedVersion ||
      raw.FixedVersion ||
      raw.fix_version ||
      raw.fixVersion ||
      raw.patched_version ||
      raw.patchedVersion ||
      raw.fixedInVersion ||
      raw.fix?.versions ||
      "",
  );

  const cvss = normalizeFloat(
    raw.cvss ||
      raw.cvss_score ||
      raw.cvssScore ||
      raw.CVSS?.nvd?.V3Score ||
      raw.CVSS?.redhat?.V3Score ||
      raw.CVSS?.ghsa?.V3Score ||
      raw.cvss?.[0]?.metrics?.baseScore ||
      0,
    0,
  );

  const severity = normalizeSeverity(
    raw.severity ||
      raw.Severity ||
      raw.cvssSeverity ||
      raw.risk ||
      raw.level ||
      severityFromCvss(cvss),
    "unknown",
  );

  const target = normalizeString(raw.target || raw.Target || context.target);
  const image = normalizeImage(
    raw.image || raw.image_name || raw.imageName || context.image,
  );
  const packageType = normalizePackageType(
    raw.package_type ||
      raw.packageType ||
      raw.PkgType ||
      raw.type ||
      raw.Type ||
      context.package_type,
    context.target_type,
  );

  const title = normalizeString(
    raw.title ||
      raw.Title ||
      raw.summary ||
      raw.Summary ||
      raw.description ||
      raw.Description ||
      id ||
      "Container vulnerability",
  );

  const description = normalizeString(
    raw.description ||
      raw.Description ||
      raw.details ||
      raw.Detail ||
      raw.summary ||
      raw.Summary ||
      "",
  );

  const primaryUrl = normalizeUrl(
    raw.primary_url ||
      raw.primaryUrl ||
      raw.PrimaryURL ||
      raw.url ||
      raw.URL ||
      raw.advisory_url ||
      raw.advisoryUrl ||
      "",
  );

  const references = normalizeReferenceList(
    raw.references ||
      raw.References ||
      raw.urls ||
      raw.URLs ||
      raw.advisory?.references ||
      [],
  );

  const datasource = normalizeString(
    raw.datasource ||
      raw.DataSource?.Name ||
      raw.feed ||
      raw.namespace ||
      context.scanner,
  );

  const layer = normalizeString(
    raw.layer ||
      raw.Layer?.Digest ||
      raw.layerDigest ||
      raw.blob_digest ||
      raw.blobDigest ||
      "",
  );

  const fingerprint = fingerprintVulnerability([
    image,
    target,
    packageName,
    installedVersion,
    id,
    severity,
    fixedVersion,
    context.source_file,
  ]);

  return {
    source: context.scanner,
    source_file: context.source_file,
    fingerprint,
    id,
    title,
    description,
    severity,
    cvss,
    package_name: packageName,
    package_type: packageType,
    installed_version: installedVersion,
    fixed_version: fixedVersion,
    fixed: Boolean(fixedVersion),
    target,
    target_type: normalizeString(context.target_type),
    image,
    layer,
    datasource,
    primary_url: primaryUrl,
    references,
  };
}

function parseTrivy(data, context) {
  const image = normalizeImage(
    data.ArtifactName || data.artifactName || context.image,
  );
  const scanner = "trivy";
  const metadata = {
    scanner,
    schema_version: normalizeInteger(data.SchemaVersion, 0),
    artifact_name: image,
    artifact_type: normalizeString(data.ArtifactType),
    created_at: normalizeString(data.CreatedAt),
    result_count: Array.isArray(data.Results) ? data.Results.length : 0,
  };

  const vulnerabilities = [];

  for (const result of data.Results || []) {
    const target = normalizeString(result.Target);
    const targetType = normalizeString(result.Type);

    for (const vulnerability of result.Vulnerabilities || []) {
      vulnerabilities.push(
        normalizeVulnerability(vulnerability, {
          ...context,
          scanner,
          image,
          target,
          target_type: targetType,
          package_type: vulnerability.PkgType || targetType,
        }),
      );
    }

    for (const misconfiguration of result.Misconfigurations || []) {
      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: misconfiguration.ID,
            title: misconfiguration.Title,
            description:
              misconfiguration.Description || misconfiguration.Message,
            severity: misconfiguration.Severity,
            primary_url: misconfiguration.PrimaryURL,
            package_name: result.Target,
            installed_version: "",
            fixed_version: "",
            type: "configuration",
          },
          {
            ...context,
            scanner,
            image,
            target,
            target_type: targetType,
            package_type: "configuration",
          },
        ),
      );
    }
  }

  return {
    vulnerabilities,
    metadata,
  };
}

function parseGrype(data, context) {
  const source = data.source || {};
  const image = normalizeImage(
    source.target?.userInput ||
      source.target?.imageID ||
      source.target?.tags?.[0] ||
      context.image,
  );

  const scanner = "grype";
  const metadata = {
    scanner,
    artifact_name: image,
    artifact_type: normalizeString(source.type || source.target?.mediaType),
    distro_name: normalizeString(data.distro?.name),
    distro_version: normalizeString(data.distro?.version),
    descriptor_name: normalizeString(data.descriptor?.name),
    descriptor_version: normalizeString(data.descriptor?.version),
    result_count: Array.isArray(data.matches) ? data.matches.length : 0,
  };

  const vulnerabilities = [];

  for (const match of data.matches || []) {
    const vulnerability = match.vulnerability || {};
    const artifact = match.artifact || {};
    const related = Array.isArray(match.relatedVulnerabilities)
      ? match.relatedVulnerabilities
      : [];
    const bestCvss = Array.isArray(vulnerability.cvss)
      ? vulnerability.cvss.find((item) => item.version === "3.1") ||
        vulnerability.cvss[0]
      : null;

    vulnerabilities.push(
      normalizeVulnerability(
        {
          id: vulnerability.id,
          title: vulnerability.dataSource || vulnerability.id,
          description: vulnerability.description,
          severity: vulnerability.severity,
          cvss: bestCvss?.metrics?.baseScore,
          package_name: artifact.name,
          installed_version: artifact.version,
          fixed_version: vulnerability.fix?.versions || "",
          primary_url: vulnerability.dataSource,
          references: [
            vulnerability.dataSource,
            ...related.map((item) => item.dataSource).filter(Boolean),
          ],
          package_type: artifact.type,
          layer: artifact.locations?.[0]?.layerID,
          datasource: vulnerability.namespace,
        },
        {
          ...context,
          scanner,
          image,
          target: artifact.locations?.[0]?.path || artifact.name,
          target_type: artifact.type,
          package_type: artifact.type,
        },
      ),
    );
  }

  return {
    vulnerabilities,
    metadata,
  };
}

function parseDockerScout(data, context) {
  const scanner = "docker-scout";
  const image = normalizeImage(
    data.image ||
      data.imageName ||
      data.image_name ||
      data.ref ||
      data.target ||
      context.image,
  );

  const rawVulnerabilities = [
    ...(Array.isArray(data.vulnerabilities) ? data.vulnerabilities : []),
    ...(Array.isArray(data.Vulnerabilities) ? data.Vulnerabilities : []),
  ];

  if (Array.isArray(data.packages)) {
    for (const pkg of data.packages) {
      for (const vulnerability of pkg.vulnerabilities ||
        pkg.Vulnerabilities ||
        []) {
        rawVulnerabilities.push({
          ...vulnerability,
          package_name:
            vulnerability.package_name || vulnerability.packageName || pkg.name,
          installed_version:
            vulnerability.installed_version ||
            vulnerability.installedVersion ||
            pkg.version,
          package_type:
            vulnerability.package_type || vulnerability.packageType || pkg.type,
        });
      }
    }
  }

  const metadata = {
    scanner,
    artifact_name: image,
    artifact_type: "container-image",
    result_count: rawVulnerabilities.length,
  };

  const vulnerabilities = rawVulnerabilities.map((vulnerability) =>
    normalizeVulnerability(vulnerability, {
      ...context,
      scanner,
      image,
      target: vulnerability.path || vulnerability.location || "",
      target_type: vulnerability.package_type || vulnerability.type || "",
      package_type: vulnerability.package_type || vulnerability.type || "",
    }),
  );

  return {
    vulnerabilities,
    metadata,
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
  };
}

function parseSarif(data, context) {
  const scanner = "sarif";
  const vulnerabilities = [];
  const metadata = {
    scanner,
    artifact_name: context.image,
    artifact_type: "sarif",
    result_count: 0,
    runs: [],
  };

  for (const run of data.runs || []) {
    const rules = ruleMapFromRun(run);
    const toolName = normalizeString(
      run.tool?.driver?.name || "container-scanner",
    );
    const results = Array.isArray(run.results) ? run.results : [];

    metadata.runs.push({
      tool_name: toolName,
      tool_version: normalizeString(
        run.tool?.driver?.semanticVersion || run.tool?.driver?.version,
      ),
      rule_count: rules.size,
      result_count: results.length,
    });

    metadata.result_count += results.length;

    for (const result of results) {
      const rule = rules.get(result.ruleId) || {};
      const location = normalizeSarifLocation(result.locations?.[0] || {});
      const cvss = normalizeFloat(
        rule.properties?.securitySeverity ||
          rule.properties?.["security-severity"] ||
          result.properties?.securitySeverity ||
          result.properties?.["security-severity"] ||
          0,
        0,
      );

      vulnerabilities.push(
        normalizeVulnerability(
          {
            id: result.ruleId,
            title:
              result.message?.text ||
              rule.shortDescription?.text ||
              rule.fullDescription?.text ||
              result.ruleId,
            description:
              rule.fullDescription?.text || result.message?.text || "",
            severity: cvss ? severityFromCvss(cvss) : result.level,
            cvss,
            package_name:
              result.properties?.package ||
              result.properties?.packageName ||
              location.file ||
              result.ruleId,
            installed_version: result.properties?.version || "",
            fixed_version:
              result.properties?.fixedVersion ||
              result.properties?.fixed_version ||
              "",
            primary_url: rule.helpUri || "",
            references: rule.helpUri ? [rule.helpUri] : [],
            package_type: result.properties?.packageType || "unknown",
          },
          {
            ...context,
            scanner: toolName.toLowerCase(),
            target: location.file,
            target_type: "sarif",
            package_type: result.properties?.packageType || "unknown",
          },
        ),
      );
    }
  }

  return {
    vulnerabilities,
    metadata,
  };
}

function parseGeneric(data, context) {
  const scanner = context.scanner || "generic";
  const image = normalizeImage(
    data.image ||
      data.imageName ||
      data.image_name ||
      data.artifactName ||
      data.ArtifactName ||
      data.target ||
      context.image,
  );

  const rawVulnerabilities = [];

  if (Array.isArray(data.vulnerabilities))
    rawVulnerabilities.push(...data.vulnerabilities);
  if (Array.isArray(data.Vulnerabilities))
    rawVulnerabilities.push(...data.Vulnerabilities);
  if (Array.isArray(data.findings)) rawVulnerabilities.push(...data.findings);
  if (Array.isArray(data.security_findings))
    rawVulnerabilities.push(...data.security_findings);
  if (Array.isArray(data.results)) rawVulnerabilities.push(...data.results);
  if (Array.isArray(data.alerts)) rawVulnerabilities.push(...data.alerts);

  if (Array.isArray(data.matches)) {
    rawVulnerabilities.push(...data.matches);
  }

  const metadata = {
    scanner,
    artifact_name: image,
    artifact_type: normalizeString(
      data.artifact_type || data.artifactType || "container-image",
    ),
    result_count: rawVulnerabilities.length,
  };

  const vulnerabilities = rawVulnerabilities.map((item) => {
    if (item.vulnerability || item.artifact) {
      return normalizeVulnerability(
        {
          ...(item.vulnerability || {}),
          package_name: item.artifact?.name,
          installed_version: item.artifact?.version,
          package_type: item.artifact?.type,
          fixed_version: item.vulnerability?.fix?.versions || "",
        },
        {
          ...context,
          scanner,
          image,
          target: item.artifact?.locations?.[0]?.path || "",
          target_type: item.artifact?.type || "",
          package_type: item.artifact?.type || "",
        },
      );
    }

    return normalizeVulnerability(item, {
      ...context,
      scanner,
      image,
      target: item.target || item.path || item.location || "",
      target_type: item.type || "",
      package_type: item.package_type || item.packageType || item.type || "",
    });
  });

  return {
    vulnerabilities,
    metadata,
  };
}

function parseScanFile(filePath, repoRoot, args) {
  const data = readDataFile(filePath, repoRoot);
  const sourceFile = toRelativePath(filePath, repoRoot);

  if (!data || typeof data !== "object") {
    return {
      vulnerabilities: [],
      metadata: null,
      error: `Invalid container scan file: ${sourceFile}`,
    };
  }

  const scanner = detectScanner(data, filePath, args);
  const context = {
    scanner,
    source_file: sourceFile,
    image: args.image,
    target: "",
    target_type: "",
    package_type: "",
  };

  try {
    if (scanner === "trivy") return parseTrivy(data, context);
    if (scanner === "grype") return parseGrype(data, context);
    if (scanner === "docker-scout") return parseDockerScout(data, context);
    if (scanner === "sarif") return parseSarif(data, context);

    return parseGeneric(data, context);
  } catch (err) {
    return {
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

  if (args.ignore_unfixed && !vulnerability.fixed) return false;
  if (!args.include_unfixed && !vulnerability.fixed) return false;

  if (!args.include_os_packages && vulnerability.package_type === "os")
    return false;
  if (
    !args.include_library_packages &&
    vulnerability.package_type === "library"
  )
    return false;

  if (args.ignored_vulnerabilities.includes(vulnerability.id.toUpperCase()))
    return false;
  if (args.ignored_packages.includes(vulnerability.package_name.toLowerCase()))
    return false;
  if (args.ignored_images.includes(vulnerability.image.toLowerCase()))
    return false;

  return true;
}

function dedupeVulnerabilities(vulnerabilities) {
  const map = new Map();

  for (const vulnerability of vulnerabilities) {
    const key = [
      vulnerability.image,
      vulnerability.target,
      vulnerability.package_name,
      vulnerability.installed_version,
      vulnerability.id,
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
    message: `Found ${count} ${name} container vulnerability/vulnerabilities; maximum allowed is ${maxAllowed}.`,
  };
}

function analyzeVulnerabilities(args, loadResult) {
  const vulnerabilities = loadResult.vulnerabilities.filter((vulnerability) =>
    shouldIncludeVulnerability(args, vulnerability),
  );

  const severityCounts = {
    critical: vulnerabilities.filter((item) => item.severity === "critical")
      .length,
    high: vulnerabilities.filter((item) => item.severity === "high").length,
    medium: vulnerabilities.filter((item) => item.severity === "medium").length,
    low: vulnerabilities.filter((item) => item.severity === "low").length,
    negligible: vulnerabilities.filter((item) => item.severity === "negligible")
      .length,
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
    limitViolation(
      "negligible",
      severityCounts.negligible,
      args.max_negligible,
    ),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];

  if (args.require_results && !loadResult.vulnerabilities.length) {
    errors.push("No container scan vulnerabilities or results were found.");
  }

  if (args.fail_if_vulnerabilities && vulnerabilities.length) {
    errors.push(
      `Container scan found ${vulnerabilities.length} active vulnerability/vulnerabilities.`,
    );
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
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
    vulnerabilities,
    failing_vulnerabilities: failingSeverityVulnerabilities,
    warning_vulnerabilities: warningSeverityVulnerabilities,
    severity_counts: severityCounts,
    image_counts: countBy(vulnerabilities, (item) => item.image || "unknown"),
    package_counts: countBy(
      vulnerabilities,
      (item) => item.package_name || "unknown",
    ),
    target_counts: countBy(vulnerabilities, (item) => item.target || "unknown"),
    vulnerability_counts: countBy(
      vulnerabilities,
      (item) => item.id || "unknown",
    ),
    package_type_counts: countBy(
      vulnerabilities,
      (item) => item.package_type || "unknown",
    ),
    scanner_counts: countBy(
      vulnerabilities,
      (item) => item.source || "unknown",
    ),
    fixed_count: vulnerabilities.filter((item) => item.fixed).length,
    unfixed_count: vulnerabilities.filter((item) => !item.fixed).length,
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

function loadContainerScanData(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const metadata = [];
  const vulnerabilities = [];

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

    vulnerabilities.push(...parsed.vulnerabilities);
  }

  return {
    scan_files: scanFiles.map((filePath) => toRelativePath(filePath, repoRoot)),
    metadata,
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
    type: "security-summarize-container-scan",
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
      image: args.image,
      scanner: args.scanner || "auto",
      min_report_severity: args.min_report_severity,
      fail_on_severities: args.fail_on_severities,
      warn_on_severities: args.warn_on_severities,
      max_by_severity: {
        critical: args.max_critical,
        high: args.max_high,
        medium: args.max_medium,
        low: args.max_low,
        negligible: args.max_negligible,
        unknown: args.max_unknown,
      },
      max_total: args.max_total,
      ignore_unfixed: args.ignore_unfixed,
      include_unfixed: args.include_unfixed,
      include_os_packages: args.include_os_packages,
      include_library_packages: args.include_library_packages,
      ignored_vulnerabilities: args.ignored_vulnerabilities,
      ignored_packages: args.ignored_packages,
      ignored_images: args.ignored_images,
      require_results: args.require_results,
      fail_if_vulnerabilities: args.fail_if_vulnerabilities,
      fail_on_threshold: args.fail_on_threshold,
      dry_run: args.dry_run,
    },
    container_scan: {
      scans: loadResult.metadata,
      vulnerabilities: analysis.vulnerabilities,
      failing_vulnerabilities: analysis.failing_vulnerabilities,
      warning_vulnerabilities: analysis.warning_vulnerabilities,
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      image_counts: analysis.image_counts,
      package_counts: analysis.package_counts,
      target_counts: analysis.target_counts,
      vulnerability_counts: analysis.vulnerability_counts,
      package_type_counts: analysis.package_type_counts,
      scanner_counts: analysis.scanner_counts,
      fixed_count: analysis.fixed_count,
      unfixed_count: analysis.unfixed_count,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      scan_files: loadResult.scan_files.length,
      scans: loadResult.metadata.length,
      raw_vulnerabilities: loadResult.vulnerabilities.length,
      vulnerabilities: analysis.vulnerabilities.length,
      failing_vulnerabilities: analysis.failing_vulnerabilities.length,
      warning_vulnerabilities: analysis.warning_vulnerabilities.length,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      negligible: analysis.severity_counts.negligible,
      unknown: analysis.severity_counts.unknown,
      fixed: analysis.fixed_count,
      unfixed: analysis.unfixed_count,
      images: Object.keys(analysis.image_counts).length,
      packages: Object.keys(analysis.package_counts).length,
      targets: Object.keys(analysis.target_counts).length,
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
    `# 🛡️ ${PROJECT_NAME} Container Scan Summary`,
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
    `- Vulnerabilities: \`${report.totals.vulnerabilities}\``,
    `- Failing vulnerabilities: \`${report.totals.failing_vulnerabilities}\``,
    `- Warning vulnerabilities: \`${report.totals.warning_vulnerabilities}\``,
    `- Fixed available: \`${report.totals.fixed}\``,
    `- Unfixed: \`${report.totals.unfixed}\``,
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
    "## 📊 Severity Counts",
    "",
    "| Severity | Count |",
    "|---|---:|",
    `| Critical | \`${report.totals.critical}\` |`,
    `| High | \`${report.totals.high}\` |`,
    `| Medium | \`${report.totals.medium}\` |`,
    `| Low | \`${report.totals.low}\` |`,
    `| Negligible | \`${report.totals.negligible}\` |`,
    `| Unknown | \`${report.totals.unknown}\` |`,
    "",
  ];

  if (report.container_scan.scans.length) {
    lines.push("## 🧪 Scan Inputs");
    lines.push("");
    lines.push("| Scanner | Image / Artifact | Type | Results | Source |");
    lines.push("|---|---|---|---:|---|");

    for (const scan of report.container_scan.scans) {
      lines.push(
        `| \`${escapeMarkdown(scan.scanner || "unknown")}\` | \`${escapeMarkdown(scan.artifact_name || "unknown")}\` | \`${escapeMarkdown(scan.artifact_type || "unknown")}\` | \`${scan.result_count || 0}\` | \`${escapeMarkdown(scan.source_file || "unknown")}\` |`,
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

  if (report.container_scan.vulnerabilities.length) {
    lines.push("## 🔐 Vulnerabilities");
    lines.push("");
    lines.push(
      "| Severity | ID | Package | Installed | Fixed | Image | Target | Source |",
    );
    lines.push("|---|---|---|---|---|---|---|---|");

    for (const vuln of sortedVulnerabilities(
      report.container_scan.vulnerabilities,
    ).slice(0, report.config.max_vulnerability_rows || 100)) {
      const source = vuln.primary_url || vuln.source || "unknown";

      lines.push(
        `| \`${escapeMarkdown(vuln.severity)}\` | \`${escapeMarkdown(vuln.id || "unknown")}\` | \`${escapeMarkdown(vuln.package_name || "unknown")}\` | \`${escapeMarkdown(vuln.installed_version || "unknown")}\` | \`${escapeMarkdown(vuln.fixed_version || "unfixed")}\` | \`${escapeMarkdown(vuln.image || "unknown")}\` | \`${escapeMarkdown(vuln.target || "none")}\` | ${escapeMarkdown(source)} |`,
      );
    }

    if (
      report.container_scan.vulnerabilities.length >
      (report.config.max_vulnerability_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | … | \`${report.container_scan.vulnerabilities.length - (report.config.max_vulnerability_rows || 100)}\` more vulnerability/vulnerabilities omitted |`,
      );
    }

    lines.push("");
  }

  const topPackages = topEntries(report.analysis.package_counts, 20);

  if (topPackages.length) {
    lines.push("## 📦 Most Affected Packages");
    lines.push("");
    lines.push("| Package | Vulnerabilities |");
    lines.push("|---|---:|");

    for (const [pkg, count] of topPackages) {
      lines.push(`| \`${escapeMarkdown(pkg)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  const topImages = topEntries(report.analysis.image_counts, 20);

  if (topImages.length) {
    lines.push("## 🐳 Most Affected Images");
    lines.push("");
    lines.push("| Image | Vulnerabilities |");
    lines.push("|---|---:|");

    for (const [image, count] of topImages) {
      lines.push(`| \`${escapeMarkdown(image)}\` | \`${count}\` |`);
    }

    lines.push("");
  }

  const topVulnerabilities = topEntries(
    report.analysis.vulnerability_counts,
    20,
  );

  if (topVulnerabilities.length) {
    lines.push("## 🧬 Most Frequent Vulnerabilities");
    lines.push("");
    lines.push("| Vulnerability | Occurrences |");
    lines.push("|---|---:|");

    for (const [vulnerability, count] of topVulnerabilities) {
      lines.push(`| \`${escapeMarkdown(vulnerability)}\` | \`${count}\` |`);
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
    `- Image override: \`${escapeMarkdown(report.config.image || "none")}\``,
  );
  lines.push(
    `- Scanner override: \`${escapeMarkdown(report.config.scanner || "auto")}\``,
  );
  lines.push(
    `- Ignore unfixed: \`${report.config.ignore_unfixed ? "true" : "false"}\``,
  );
  lines.push(
    `- Include OS packages: \`${report.config.include_os_packages ? "true" : "false"}\``,
  );
  lines.push(
    `- Include library packages: \`${report.config.include_library_packages ? "true" : "false"}\``,
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
  setGitHubOutput("container_scan_summary_file", report.config.output_file);
  setGitHubOutput(
    "container_scan_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("container_scan_summary_status", report.status);
  setGitHubOutput("container_scan_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput("container_scan_files", String(report.totals.scan_files));
  setGitHubOutput("container_scan_scans", String(report.totals.scans));
  setGitHubOutput(
    "container_scan_vulnerabilities",
    String(report.totals.vulnerabilities),
  );
  setGitHubOutput(
    "container_scan_failing_vulnerabilities",
    String(report.totals.failing_vulnerabilities),
  );
  setGitHubOutput(
    "container_scan_warning_vulnerabilities",
    String(report.totals.warning_vulnerabilities),
  );

  setGitHubOutput("container_scan_critical", String(report.totals.critical));
  setGitHubOutput("container_scan_high", String(report.totals.high));
  setGitHubOutput("container_scan_medium", String(report.totals.medium));
  setGitHubOutput("container_scan_low", String(report.totals.low));
  setGitHubOutput(
    "container_scan_negligible",
    String(report.totals.negligible),
  );
  setGitHubOutput("container_scan_unknown", String(report.totals.unknown));
  setGitHubOutput("container_scan_fixed", String(report.totals.fixed));
  setGitHubOutput("container_scan_unfixed", String(report.totals.unfixed));

  setGitHubOutput("container_scan_errors", String(report.totals.errors));
  setGitHubOutput("container_scan_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "container_scan_vulnerabilities_json",
    JSON.stringify(report.container_scan.vulnerabilities),
  );
  setGitHubOutput(
    "container_scan_failing_vulnerabilities_json",
    JSON.stringify(report.container_scan.failing_vulnerabilities),
  );
  setGitHubOutput(
    "container_scan_warning_vulnerabilities_json",
    JSON.stringify(report.container_scan.warning_vulnerabilities),
  );
  setGitHubOutput("container_scan_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "container_scan_warnings_json",
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

  logger.info("Summarizing container scan results.");

  const loadResult = loadContainerScanData(args, repoRoot);
  const analysis = analyzeVulnerabilities(args, loadResult);
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
