#!/usr/bin/env node
// .github/scripts/security/assign-security-milestones.js
// =============================================================================
// Aerealith AI — Security Milestone Assignment
// -----------------------------------------------------------------------------
// Purpose:
//   Assign milestones to security issues and pull requests based on severity,
//   labels, titles, bodies, alert metadata, changed files, ecosystems, packages,
//   and configurable rules.
//
// Input:
//   - GitHub event payload
//   - GitHub REST API, when a token is available
//   - Direct CLI/env inputs
//   - .github/security/assign-security-milestones.json
//   - .github/security/assign-security-milestones.jsonc
//   - .github/security/assign-security-milestones.yaml
//   - .github/security/assign-security-milestones.yml
//
// Output:
//   - artifacts/security/assign-security-milestones.json
//   - artifacts/security/assign-security-milestones.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Safe dry-run mode.
//   - GitHub milestones can only be applied to issues and pull requests.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[assign-security-milestones] ${message}`),
    warn: (message) =>
      console.warn(`[assign-security-milestones] WARN: ${message}`),
    error: (message) =>
      console.error(`[assign-security-milestones] ERROR: ${message}`),
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
  ".github/security/assign-security-milestones.json",
  ".github/security/assign-security-milestones.jsonc",
  ".github/security/assign-security-milestones.yaml",
  ".github/security/assign-security-milestones.yml",
  ".github/security/security-milestones.json",
  ".github/security/security-milestones.jsonc",
  ".github/security/security-milestones.yaml",
  ".github/security/security-milestones.yml",
  ".github/repo/assign-security-milestones.json",
  ".github/repo/assign-security-milestones.jsonc",
  ".github/repo/assign-security-milestones.yaml",
  ".github/repo/assign-security-milestones.yml",
  ".github/assign-security-milestones.json",
  ".github/assign-security-milestones.jsonc",
  ".github/assign-security-milestones.yaml",
  ".github/assign-security-milestones.yml",
];

const DEFAULT_OUTPUT_FILE =
  "artifacts/security/assign-security-milestones.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/assign-security-milestones.md";

const DEFAULT_MILESTONE_BY_SEVERITY = {
  critical: "Security: Critical",
  high: "Security: High",
  medium: "Security: Medium",
  low: "Security: Low",
  info: "Security: Review",
  unknown: "Security: Review",
};

const DEFAULT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
  "unknown",
];

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

function normalizeLabel(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeLabelList(value) {
  return [
    ...new Set(normalizeStringList(value).map(normalizeLabel).filter(Boolean)),
  ];
}

function normalizeUsername(value) {
  return normalizeString(value).replace(/^@/, "").trim();
}

function normalizeSeverity(value, fallback = "unknown") {
  const severity = normalizeString(value, fallback).toLowerCase();

  if (["critical", "crit", "blocker"].includes(severity)) return "critical";
  if (["high", "major"].includes(severity)) return "high";
  if (["medium", "moderate", "med"].includes(severity)) return "medium";
  if (["low", "minor"].includes(severity)) return "low";
  if (["info", "informational", "notice"].includes(severity)) return "info";
  if (["unknown", "none", "untriaged"].includes(severity)) return "unknown";

  return fallback;
}

function severityFromCvss(value) {
  const cvss = normalizeFloat(value, 0);

  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "medium";
  if (cvss > 0) return "low";

  return "unknown";
}

function normalizeMilestoneTitle(value) {
  return normalizeString(value);
}

function normalizeMilestoneKey(value) {
  return normalizeMilestoneTitle(value).toLowerCase();
}

function normalizeDateTime(value) {
  const source = normalizeString(value);

  if (!source) return null;

  const date = new Date(source);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ASSIGN_SECURITY_MILESTONES_TOKEN ||
      process.env.SECURITY_AUTOMATION_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ASSIGN_SECURITY_MILESTONES_CONFIG_FILE || "",

    event_path:
      process.env.ASSIGN_SECURITY_MILESTONES_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ASSIGN_SECURITY_MILESTONES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.ASSIGN_SECURITY_MILESTONES_SUMMARY_FILE ||
      DEFAULT_SUMMARY_FILE,

    number:
      process.env.ASSIGN_SECURITY_MILESTONES_NUMBER ||
      process.env.SECURITY_ISSUE_NUMBER ||
      process.env.ISSUE_NUMBER ||
      process.env.PR_NUMBER ||
      process.env.PULL_REQUEST_NUMBER ||
      "",

    title: process.env.ASSIGN_SECURITY_MILESTONES_TITLE || "",
    body: process.env.ASSIGN_SECURITY_MILESTONES_BODY || "",
    author: process.env.ASSIGN_SECURITY_MILESTONES_AUTHOR || "",

    severity:
      process.env.ASSIGN_SECURITY_MILESTONES_SEVERITY ||
      process.env.SECURITY_SEVERITY ||
      "",

    cvss:
      process.env.ASSIGN_SECURITY_MILESTONES_CVSS ||
      process.env.SECURITY_CVSS ||
      "",

    cve:
      process.env.ASSIGN_SECURITY_MILESTONES_CVE ||
      process.env.SECURITY_CVE ||
      "",

    cwe:
      process.env.ASSIGN_SECURITY_MILESTONES_CWE ||
      process.env.SECURITY_CWE ||
      "",

    package_name:
      process.env.ASSIGN_SECURITY_MILESTONES_PACKAGE ||
      process.env.SECURITY_PACKAGE ||
      "",

    ecosystem:
      process.env.ASSIGN_SECURITY_MILESTONES_ECOSYSTEM ||
      process.env.SECURITY_ECOSYSTEM ||
      "",

    alert_type:
      process.env.ASSIGN_SECURITY_MILESTONES_ALERT_TYPE ||
      process.env.SECURITY_ALERT_TYPE ||
      "",

    manifest_path:
      process.env.ASSIGN_SECURITY_MILESTONES_MANIFEST_PATH ||
      process.env.SECURITY_MANIFEST_PATH ||
      "",

    labels: normalizeLabelList(
      process.env.ASSIGN_SECURITY_MILESTONES_LABELS ||
        process.env.SECURITY_LABELS ||
        process.env.ISSUE_LABELS ||
        process.env.PR_LABELS ||
        "",
    ),

    changed_files: normalizeStringList(
      process.env.ASSIGN_SECURITY_MILESTONES_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    milestone_title:
      process.env.ASSIGN_SECURITY_MILESTONES_MILESTONE ||
      process.env.SECURITY_MILESTONE ||
      "",

    default_milestone:
      process.env.ASSIGN_SECURITY_MILESTONES_DEFAULT_MILESTONE ||
      "Security: Review",

    milestone_description:
      process.env.ASSIGN_SECURITY_MILESTONES_MILESTONE_DESCRIPTION || "",

    milestone_due_on:
      process.env.ASSIGN_SECURITY_MILESTONES_MILESTONE_DUE_ON || "",

    create_missing_milestone: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_CREATE_MISSING,
      true,
    ),

    clear_milestone: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_CLEAR,
      false,
    ),

    replace_existing: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_REPLACE_EXISTING,
      true,
    ),

    skip_existing: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_SKIP_EXISTING,
      false,
    ),

    fetch_item: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FETCH_ITEM,
      true,
    ),

    fetch_milestones: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FETCH_MILESTONES,
      true,
    ),

    use_config: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_USE_CONFIG,
      true,
    ),

    require_security_signal: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_REQUIRE_SECURITY_SIGNAL,
      false,
    ),

    fail_if_missing_number: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FAIL_IF_MISSING_NUMBER,
      true,
    ),

    fail_if_no_milestone: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FAIL_IF_NO_MILESTONE,
      false,
    ),

    fail_if_missing_milestone: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FAIL_IF_MISSING_MILESTONE,
      false,
    ),

    fail_on_error: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_FAIL_ON_ERROR,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.ASSIGN_SECURITY_MILESTONES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.ASSIGN_SECURITY_MILESTONES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ASSIGN_SECURITY_MILESTONES_STEP_SUMMARY,
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

    if (arg === "--event-path") {
      args.event_path = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--number" ||
      arg === "--issue" ||
      arg === "--pr" ||
      arg === "--pull-request"
    ) {
      args.number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title") {
      args.title = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--body") {
      args.body = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--author") {
      args.author = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--severity") {
      args.severity = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cvss") {
      args.cvss = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cve") {
      args.cve = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cwe") {
      args.cwe = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package" || arg === "--package-name") {
      args.package_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--ecosystem") {
      args.ecosystem = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--alert-type") {
      args.alert_type = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--manifest-path") {
      args.manifest_path = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--changed-file" || arg === "--changed-files") {
      args.changed_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--milestone" || arg === "--milestone-title") {
      args.milestone_title = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--default-milestone") {
      args.default_milestone = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--milestone-description") {
      args.milestone_description = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--milestone-due-on") {
      args.milestone_due_on = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--create-missing-milestone") {
      args.create_missing_milestone = true;
      continue;
    }

    if (arg === "--no-create-missing-milestone") {
      args.create_missing_milestone = false;
      continue;
    }

    if (arg === "--clear") {
      args.clear_milestone = true;
      continue;
    }

    if (arg === "--replace-existing") {
      args.replace_existing = true;
      continue;
    }

    if (arg === "--no-replace-existing") {
      args.replace_existing = false;
      continue;
    }

    if (arg === "--skip-existing") {
      args.skip_existing = true;
      continue;
    }

    if (arg === "--no-skip-existing") {
      args.skip_existing = false;
      continue;
    }

    if (arg === "--fetch-item") {
      args.fetch_item = true;
      continue;
    }

    if (arg === "--no-fetch-item") {
      args.fetch_item = false;
      continue;
    }

    if (arg === "--fetch-milestones") {
      args.fetch_milestones = true;
      continue;
    }

    if (arg === "--no-fetch-milestones") {
      args.fetch_milestones = false;
      continue;
    }

    if (arg === "--require-security-signal") {
      args.require_security_signal = true;
      continue;
    }

    if (arg === "--no-require-security-signal") {
      args.require_security_signal = false;
      continue;
    }

    if (arg === "--fail-if-missing-number") {
      args.fail_if_missing_number = true;
      continue;
    }

    if (arg === "--no-fail-if-missing-number") {
      args.fail_if_missing_number = false;
      continue;
    }

    if (arg === "--fail-if-no-milestone") {
      args.fail_if_no_milestone = true;
      continue;
    }

    if (arg === "--no-fail-if-no-milestone") {
      args.fail_if_no_milestone = false;
      continue;
    }

    if (arg === "--fail-if-missing-milestone") {
      args.fail_if_missing_milestone = true;
      continue;
    }

    if (arg === "--no-fail-if-missing-milestone") {
      args.fail_if_missing_milestone = false;
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
  args.number = normalizeString(args.number);
  args.title = normalizeString(args.title);
  args.body = normalizeString(args.body);
  args.author = normalizeUsername(args.author);
  args.severity = normalizeSeverity(args.severity, "");
  args.cvss = normalizeString(args.cvss);
  args.cve = normalizeString(args.cve);
  args.cwe = normalizeString(args.cwe);
  args.package_name = normalizeString(args.package_name);
  args.ecosystem = normalizeString(args.ecosystem).toLowerCase();
  args.alert_type = normalizeString(args.alert_type).toLowerCase();
  args.manifest_path = toPosixPath(args.manifest_path);
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];
  args.milestone_title = normalizeMilestoneTitle(args.milestone_title);
  args.default_milestone = normalizeMilestoneTitle(args.default_milestone);
  args.milestone_description = normalizeString(args.milestone_description);
  args.milestone_due_on = normalizeDateTime(args.milestone_due_on);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Security Milestone Assignment

Usage:
  node .github/scripts/security/assign-security-milestones.js [options]

Examples:
  node .github/scripts/security/assign-security-milestones.js --issue 42 --severity critical
  node .github/scripts/security/assign-security-milestones.js --pr 42 --milestone "Security: High"
  node .github/scripts/security/assign-security-milestones.js --issue 42 --clear
  node .github/scripts/security/assign-security-milestones.js --dry-run
  node .github/scripts/security/assign-security-milestones.js --require-security-signal

Config example:
  {
    "default_milestone": "Security: Review",
    "milestone_by_severity": {
      "critical": "Security: Critical",
      "high": "Security: High",
      "medium": "Security: Medium",
      "low": "Security: Low"
    },
    "rules": [
      {
        "name": "Critical runtime vulnerability",
        "priority": 100,
        "severities": ["critical"],
        "ecosystems": ["npm"],
        "paths": ["package.json", "pnpm-lock.yaml"],
        "milestone": "Security: Critical"
      }
    ]
  }

Options:
      --repo <owner/repo>                 Repository slug.
      --api-url <url>                     GitHub API URL.
      --token <token>                     GitHub token.
      --config <file>                     Security milestone config file.
      --event-path <file>                 GitHub event payload path.
      --number, --issue, --pr <number>    Issue or pull request number.
      --title <title>                     Title override.
      --body <body>                       Body override.
      --author <user>                     Author override.
      --severity <severity>               critical, high, medium, low, info.
      --cvss <score>                      CVSS score used to infer severity.
      --cve <id>                          CVE identifier.
      --cwe <id>                          CWE identifier.
      --package <name>                    Affected package name.
      --ecosystem <name>                  npm, github-actions, docker, etc.
      --alert-type <type>                 dependabot, code-scanning, secret-scanning.
      --manifest-path <path>              Vulnerable manifest path.
      --label <label,list>                Labels to evaluate.
      --changed-file <path,list>          Changed files to evaluate.
      --milestone <title>                 Explicit milestone title.
      --default-milestone <title>         Fallback milestone title.
      --milestone-description <text>      Description for created milestone.
      --milestone-due-on <datetime>       Due date for created milestone.
      --create-missing-milestone          Create milestone when missing. Default.
      --no-create-missing-milestone       Do not create missing milestone.
      --clear                             Clear the current milestone.
      --replace-existing                  Replace existing milestone. Default.
      --no-replace-existing               Do not replace existing milestone.
      --skip-existing                     Skip if item already has a milestone.
      --fetch-item                        Fetch issue/PR metadata. Default.
      --no-fetch-item                     Do not fetch issue/PR metadata.
      --fetch-milestones                  Fetch repository milestones. Default.
      --no-fetch-milestones               Do not fetch milestones.
      --require-security-signal           Skip when no security signal is detected.
      --fail-if-missing-number            Fail when number is missing. Default.
      --no-fail-if-missing-number         Do not fail when number is missing.
      --fail-if-no-milestone              Fail when no milestone resolves.
      --fail-if-missing-milestone         Fail instead of creating missing milestones.
      --fail-on-error                     Exit non-zero on errors. Default.
      --no-fail-on-error                  Do not fail workflow.
      --timeout-seconds <number>          GitHub API timeout. Default: 60.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not mutate GitHub.
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

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function toRelativePath(filePath, repoRoot) {
  return (
    toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot))) || "."
  );
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
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
  let currentItem = null;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      currentItem = null;
      continue;
    }

    if (
      (section === "rules" || section === "security_milestone_rules") &&
      /^-\s*/.test(trimmed)
    ) {
      currentItem = {};
      config[section].push(currentItem);

      const rest = trimmed.replace(/^-\s*/, "");

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentItem[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (
      (section === "rules" || section === "security_milestone_rules") &&
      currentItem &&
      /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)
    ) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentItem[key] = parseYamlScalar(value);
      continue;
    }

    if (
      section === "milestone_by_severity" &&
      /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)
    ) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config.milestone_by_severity = config.milestone_by_severity || {};
      config.milestone_by_severity[key] = parseYamlScalar(value);
      continue;
    }

    if (section && /^-\s*/.test(trimmed)) {
      config[section] = Array.isArray(config[section]) ? config[section] : [];
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
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

function normalizeRule(rule, index) {
  const source = rule && typeof rule === "object" ? rule : {};

  return {
    id: normalizeString(
      source.id || source.name || `security-rule-${index + 1}`,
    ),
    name: normalizeString(
      source.name || source.id || `Security Rule ${index + 1}`,
    ),
    enabled: normalizeBoolean(source.enabled, true),
    priority: normalizeInteger(source.priority, 0),
    require_all: normalizeBoolean(
      source.require_all || source.requireAll,
      false,
    ),

    severities: normalizeStringList(source.severities || source.severity || [])
      .map((item) => normalizeSeverity(item, ""))
      .filter(Boolean),

    labels: normalizeLabelList(source.labels || source.label || []),

    title_contains: normalizeStringList(
      source.title_contains || source.titleContains || [],
    ).map((item) => item.toLowerCase()),

    body_contains: normalizeStringList(
      source.body_contains || source.bodyContains || [],
    ).map((item) => item.toLowerCase()),

    alert_types: normalizeStringList(
      source.alert_types || source.alertTypes || source.alert_type || [],
    ).map((item) => item.toLowerCase()),

    ecosystems: normalizeStringList(
      source.ecosystems || source.ecosystem || [],
    ).map((item) => item.toLowerCase()),

    packages: normalizeStringList(
      source.packages ||
        source.package_names ||
        source.packageNames ||
        source.package ||
        [],
    ).map((item) => item.toLowerCase()),

    cves: normalizeStringList(source.cves || source.cve || []).map((item) =>
      item.toUpperCase(),
    ),

    cwes: normalizeStringList(source.cwes || source.cwe || []).map((item) =>
      item.toUpperCase(),
    ),

    paths: normalizeStringList(
      source.paths || source.path || source.files || source.file || [],
    ).map(toPosixPath),

    min_cvss: normalizeFloat(source.min_cvss || source.minCvss, 0),
    max_cvss: normalizeFloat(source.max_cvss || source.maxCvss, 0),

    milestone: normalizeMilestoneTitle(
      source.milestone || source.milestone_title || source.milestoneTitle || "",
    ),

    clear_milestone: normalizeBoolean(
      source.clear_milestone || source.clearMilestone,
      false,
    ),
  };
}

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const rawMilestoneMap =
    source.milestone_by_severity ||
    source.milestoneBySeverity ||
    source.severity_milestones ||
    source.severityMilestones ||
    {};

  const milestoneBySeverity = { ...DEFAULT_MILESTONE_BY_SEVERITY };

  for (const severity of DEFAULT_SEVERITIES) {
    const title = normalizeMilestoneTitle(rawMilestoneMap[severity]);

    if (title) {
      milestoneBySeverity[severity] = title;
    }
  }

  const rules = [
    ...(Array.isArray(source.rules) ? source.rules : []),
    ...(Array.isArray(source.security_milestone_rules)
      ? source.security_milestone_rules
      : []),
    ...(Array.isArray(source.securityMilestoneRules)
      ? source.securityMilestoneRules
      : []),
  ].map(normalizeRule);

  return {
    default_milestone: normalizeMilestoneTitle(
      source.default_milestone || source.defaultMilestone || "Security: Review",
    ),
    milestone_by_severity: milestoneBySeverity,
    milestone_description: normalizeString(
      source.milestone_description || source.milestoneDescription || "",
    ),
    milestone_due_on: normalizeDateTime(
      source.milestone_due_on || source.milestoneDueOn || "",
    ),
    create_missing_milestone:
      source.create_missing_milestone === undefined &&
      source.createMissingMilestone === undefined
        ? undefined
        : normalizeBoolean(
            source.create_missing_milestone ?? source.createMissingMilestone,
            true,
          ),
    replace_existing:
      source.replace_existing === undefined &&
      source.replaceExisting === undefined
        ? undefined
        : normalizeBoolean(
            source.replace_existing ?? source.replaceExisting,
            true,
          ),
    skip_existing:
      source.skip_existing === undefined && source.skipExisting === undefined
        ? undefined
        : normalizeBoolean(source.skip_existing ?? source.skipExisting, false),
    require_security_signal:
      source.require_security_signal === undefined &&
      source.requireSecuritySignal === undefined
        ? undefined
        : normalizeBoolean(
            source.require_security_signal ?? source.requireSecuritySignal,
            false,
          ),
    rules,
  };
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const normalized = normalizeConfig(config);
  const merged = { ...args };

  if (!merged.default_milestone && normalized.default_milestone) {
    merged.default_milestone = normalized.default_milestone;
  }

  if (!merged.milestone_description && normalized.milestone_description) {
    merged.milestone_description = normalized.milestone_description;
  }

  if (!merged.milestone_due_on && normalized.milestone_due_on) {
    merged.milestone_due_on = normalized.milestone_due_on;
  }

  if (normalized.create_missing_milestone !== undefined) {
    merged.create_missing_milestone = normalized.create_missing_milestone;
  }

  if (normalized.replace_existing !== undefined) {
    merged.replace_existing = normalized.replace_existing;
  }

  if (normalized.skip_existing !== undefined) {
    merged.skip_existing = normalized.skip_existing;
  }

  if (normalized.require_security_signal !== undefined) {
    merged.require_security_signal = normalized.require_security_signal;
  }

  return merged;
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-assign-security-milestones-script`,
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

async function fetchIssue(args, number) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/issues/${encodeURIComponent(number)}`)),
    {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return response.body;
}

async function fetchMilestones(args) {
  const milestones = [];
  let page = 1;

  while (page <= 20) {
    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(
          args,
          `/milestones?state=all&sort=due_on&direction=asc&per_page=100&page=${page}`,
        ),
      ),
      {
        method: "GET",
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    milestones.push(
      ...body.map((milestone) => ({
        id: milestone.id,
        node_id: milestone.node_id,
        number: normalizeInteger(milestone.number, 0),
        title: normalizeMilestoneTitle(milestone.title),
        description: normalizeString(milestone.description),
        state: normalizeString(milestone.state),
        due_on: normalizeString(milestone.due_on),
        html_url: normalizeString(milestone.html_url),
        open_issues: normalizeInteger(milestone.open_issues, 0),
        closed_issues: normalizeInteger(milestone.closed_issues, 0),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return milestones;
}

async function createMilestone(args, title) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, "/milestones")),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        title,
        description:
          args.milestone_description ||
          `Security milestone automatically created by ${PROJECT_NAME} automation.`,
        state: "open",
        due_on: args.milestone_due_on || null,
      },
    },
  );

  return {
    id: response.body.id,
    node_id: response.body.node_id,
    number: normalizeInteger(response.body.number, 0),
    title: normalizeMilestoneTitle(response.body.title),
    description: normalizeString(response.body.description),
    state: normalizeString(response.body.state),
    due_on: normalizeString(response.body.due_on),
    html_url: normalizeString(response.body.html_url),
    open_issues: normalizeInteger(response.body.open_issues, 0),
    closed_issues: normalizeInteger(response.body.closed_issues, 0),
  };
}

async function updateIssueMilestone(args, number, milestoneNumber) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/issues/${encodeURIComponent(number)}`)),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        milestone: milestoneNumber,
      },
    },
  );

  return response.body;
}

function labelsFromItems(items) {
  const labels = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      labels.push(item);
      continue;
    }

    if (typeof item === "object" && item.name) {
      labels.push(item.name);
    }
  }

  return normalizeLabelList(labels);
}

function getEventNumber(event) {
  return (
    event?.pull_request?.number || event?.issue?.number || event?.number || ""
  );
}

function getEventKind(event) {
  if (event?.pull_request) return "pull_request";
  if (event?.issue?.pull_request) return "pull_request";
  if (event?.issue) return "issue";
  if (
    event?.number &&
    String(process.env.GITHUB_EVENT_NAME || "").includes("pull_request")
  ) {
    return "pull_request";
  }
  if (
    event?.alert ||
    event?.dependabot_alert ||
    event?.code_scanning_alert ||
    event?.secret_scanning_alert
  ) {
    return "security_alert";
  }
  return "unknown";
}

function getEventAlert(event) {
  return (
    event?.alert ||
    event?.dependabot_alert ||
    event?.code_scanning_alert ||
    event?.secret_scanning_alert ||
    null
  );
}

function getAlertType(event, args) {
  if (args.alert_type) return args.alert_type;

  const eventName = normalizeString(
    process.env.GITHUB_EVENT_NAME || event?.action,
  ).toLowerCase();

  if (eventName.includes("dependabot")) return "dependabot";
  if (eventName.includes("code_scanning")) return "code-scanning";
  if (eventName.includes("secret_scanning")) return "secret-scanning";
  if (event?.dependabot_alert) return "dependabot";
  if (event?.code_scanning_alert) return "code-scanning";
  if (event?.secret_scanning_alert) return "secret-scanning";

  return "";
}

function extractAlertMetadata(alert) {
  if (!alert || typeof alert !== "object") {
    return {
      severity: "",
      cvss: "",
      cve: "",
      cwe: "",
      package_name: "",
      ecosystem: "",
      manifest_path: "",
      description: "",
    };
  }

  const advisory = alert.security_advisory || alert.securityAdvisory || {};
  const vulnerability =
    alert.security_vulnerability || alert.securityVulnerability || {};
  const rule = alert.rule || {};
  const mostRecentInstance =
    alert.most_recent_instance || alert.mostRecentInstance || {};

  const identifiers = Array.isArray(advisory.identifiers)
    ? advisory.identifiers
    : [];
  const cve =
    identifiers.find(
      (item) => normalizeString(item.type).toUpperCase() === "CVE",
    )?.value ||
    advisory.cve_id ||
    "";
  const cwe = Array.isArray(advisory.cwes)
    ? advisory.cwes
        .map((item) => item.cwe_id || item.name || item)
        .filter(Boolean)
        .join(",")
    : advisory.cwe || "";

  return {
    severity:
      advisory.severity ||
      rule.security_severity_level ||
      rule.severity ||
      alert.severity ||
      "",
    cvss:
      advisory.cvss?.score ||
      advisory.cvss_score ||
      rule.security_severity_level ||
      "",
    cve,
    cwe,
    package_name:
      vulnerability.package?.name ||
      alert.dependency?.package?.name ||
      alert.package?.name ||
      "",
    ecosystem:
      vulnerability.package?.ecosystem ||
      alert.dependency?.package?.ecosystem ||
      alert.package?.ecosystem ||
      "",
    manifest_path:
      vulnerability.manifest_path ||
      alert.dependency?.manifest_path ||
      mostRecentInstance.location?.path ||
      alert.location?.path ||
      "",
    description:
      advisory.summary ||
      advisory.description ||
      rule.description ||
      alert.message?.text ||
      "",
  };
}

function collectEventInput(args, repoRoot, github) {
  const event = args.event_path
    ? readDataFile(args.event_path, repoRoot)
    : null;
  const pull = event?.pull_request || null;
  const issue = event?.issue || null;
  const item = pull || issue || null;
  const alert = getEventAlert(event);
  const alertMetadata = extractAlertMetadata(alert);
  const number = normalizeString(args.number || getEventNumber(event));
  const labels = [
    ...new Set(
      [...args.labels, ...labelsFromItems(item?.labels)]
        .map(normalizeLabel)
        .filter(Boolean),
    ),
  ];

  const changedFiles = [
    ...args.changed_files,
    args.manifest_path,
    alertMetadata.manifest_path,
  ]
    .map(toPosixPath)
    .filter(Boolean);

  const explicitSeverity =
    args.severity ||
    normalizeSeverity(alertMetadata.severity, "") ||
    severityFromCvss(args.cvss || alertMetadata.cvss);

  return {
    event_available: Boolean(event),
    event_name: normalizeString(
      process.env.GITHUB_EVENT_NAME || github.event_name,
    ),
    event_action: normalizeString(event?.action),
    kind: getEventKind(event),
    number,
    title: normalizeString(
      args.title || item?.title || alertMetadata.description,
    ),
    body: normalizeString(args.body || item?.body || alertMetadata.description),
    author: normalizeUsername(
      args.author || item?.user?.login || event?.sender?.login,
    ),
    actor: normalizeUsername(github.actor || event?.sender?.login),
    labels,
    severity: normalizeSeverity(explicitSeverity, "unknown"),
    cvss: normalizeFloat(args.cvss || alertMetadata.cvss, 0),
    cve: normalizeString(args.cve || alertMetadata.cve).toUpperCase(),
    cwe: normalizeString(args.cwe || alertMetadata.cwe).toUpperCase(),
    package_name: normalizeString(
      args.package_name || alertMetadata.package_name,
    ),
    ecosystem: normalizeString(
      args.ecosystem || alertMetadata.ecosystem,
    ).toLowerCase(),
    alert_type: getAlertType(event || {}, args),
    manifest_path: toPosixPath(
      args.manifest_path || alertMetadata.manifest_path,
    ),
    changed_files: [...new Set(changedFiles)],
    current_milestone: item?.milestone
      ? {
          number: normalizeInteger(item.milestone.number, 0),
          title: normalizeMilestoneTitle(item.milestone.title),
          state: normalizeString(item.milestone.state),
          html_url: normalizeString(item.milestone.html_url),
        }
      : null,
    api: {
      fetched_item: false,
      fetched_milestones: false,
      missing_data_warnings: [],
    },
  };
}

async function enrichInput(args, input) {
  const enriched = {
    ...input,
    labels: [...input.labels],
    changed_files: [...input.changed_files],
    api: {
      ...input.api,
      missing_data_warnings: [...input.api.missing_data_warnings],
    },
  };

  if (!args.token) {
    if (args.fetch_item) {
      enriched.api.missing_data_warnings.push(
        "GitHub token is missing, so issue/PR metadata enrichment was skipped.",
      );
    }

    return enriched;
  }

  if (!args.fetch_item || !input.number) {
    return enriched;
  }

  try {
    const issue = await fetchIssue(args, input.number);

    enriched.api.fetched_item = true;
    enriched.kind = issue.pull_request ? "pull_request" : "issue";
    enriched.title = enriched.title || normalizeString(issue.title);
    enriched.body = enriched.body || normalizeString(issue.body);
    enriched.author = enriched.author || normalizeUsername(issue.user?.login);
    enriched.labels = [
      ...new Set(
        [...enriched.labels, ...labelsFromItems(issue.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
    ];
    enriched.current_milestone = issue.milestone
      ? {
          number: normalizeInteger(issue.milestone.number, 0),
          title: normalizeMilestoneTitle(issue.milestone.title),
          state: normalizeString(issue.milestone.state),
          html_url: normalizeString(issue.milestone.html_url),
        }
      : null;
  } catch (err) {
    enriched.api.missing_data_warnings.push(
      `Unable to fetch issue/PR metadata: ${logger.formatError(err)}`,
    );
  }

  return enriched;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    output += escapeRegExp(char);
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

function evaluateRule(rule, input) {
  if (!rule.enabled) {
    return {
      matched: false,
      reasons: [],
      rule,
    };
  }

  const checks = [];

  if (rule.severities.length) {
    checks.push({
      type: "severity",
      matched: rule.severities.includes(input.severity),
    });
  }

  if (rule.labels.length) {
    checks.push({
      type: "labels",
      matched: rule.labels.some((label) => input.labels.includes(label)),
    });
  }

  if (rule.title_contains.length) {
    const title = normalizeString(input.title).toLowerCase();

    checks.push({
      type: "title",
      matched: rule.title_contains.some((text) => title.includes(text)),
    });
  }

  if (rule.body_contains.length) {
    const body = normalizeString(input.body).toLowerCase();

    checks.push({
      type: "body",
      matched: rule.body_contains.some((text) => body.includes(text)),
    });
  }

  if (rule.alert_types.length) {
    checks.push({
      type: "alert_type",
      matched: rule.alert_types.includes(input.alert_type),
    });
  }

  if (rule.ecosystems.length) {
    checks.push({
      type: "ecosystem",
      matched: rule.ecosystems.includes(input.ecosystem),
    });
  }

  if (rule.packages.length) {
    checks.push({
      type: "package",
      matched: rule.packages.includes(input.package_name.toLowerCase()),
    });
  }

  if (rule.cves.length) {
    checks.push({
      type: "cve",
      matched: rule.cves.includes(input.cve),
    });
  }

  if (rule.cwes.length) {
    checks.push({
      type: "cwe",
      matched: rule.cwes.some((cwe) => input.cwe.includes(cwe)),
    });
  }

  if (rule.paths.length) {
    const files = [...input.changed_files, input.manifest_path].filter(Boolean);

    checks.push({
      type: "paths",
      matched: files.some((file) =>
        rule.paths.some((pattern) => matchesPattern(file, pattern)),
      ),
    });
  }

  if (rule.min_cvss > 0) {
    checks.push({
      type: "min_cvss",
      matched: input.cvss >= rule.min_cvss,
    });
  }

  if (rule.max_cvss > 0) {
    checks.push({
      type: "max_cvss",
      matched: input.cvss <= rule.max_cvss,
    });
  }

  if (!checks.length) {
    return {
      matched: false,
      reasons: [],
      rule,
    };
  }

  const matched = rule.require_all
    ? checks.every((check) => check.matched)
    : checks.some((check) => check.matched);

  return {
    matched,
    reasons: checks.filter((check) => check.matched).map((check) => check.type),
    rule,
  };
}

function detectSecuritySignal(input) {
  const text =
    `${input.title}\n${input.body}\n${input.labels.join("\n")}`.toLowerCase();

  return Boolean(
    input.alert_type ||
    input.cve ||
    input.cwe ||
    input.cvss > 0 ||
    input.package_name ||
    input.ecosystem ||
    input.labels.some(
      (label) => label.includes("security") || label.includes("vulnerability"),
    ) ||
    /\b(cve-\d{4}-\d+|vulnerabilit|security|xss|csrf|rce|sql injection|secret|token leak|dependency)\b/i.test(
      text,
    ),
  );
}

function resolveMilestoneCandidate(args, config, input) {
  const securitySignal = detectSecuritySignal(input);

  if (args.clear_milestone) {
    return {
      action: "clear",
      milestone_title: "",
      source: "direct-clear",
      matched_rule: null,
      matched_rules: [],
      security_signal: securitySignal,
    };
  }

  if (args.milestone_title) {
    return {
      action: "set",
      milestone_title: args.milestone_title,
      source: "direct",
      matched_rule: null,
      matched_rules: [],
      security_signal: securitySignal,
    };
  }

  const ruleResults = config.rules
    .map((rule) => evaluateRule(rule, input))
    .filter((result) => result.matched)
    .sort((left, right) => right.rule.priority - left.rule.priority);

  const matchedRule = ruleResults[0] || null;

  if (matchedRule) {
    if (matchedRule.rule.clear_milestone) {
      return {
        action: "clear",
        milestone_title: "",
        source: "rule",
        matched_rule: {
          id: matchedRule.rule.id,
          name: matchedRule.rule.name,
          reasons: matchedRule.reasons,
          priority: matchedRule.rule.priority,
        },
        matched_rules: ruleResults.map((result) => ({
          id: result.rule.id,
          name: result.rule.name,
          reasons: result.reasons,
          milestone: result.rule.milestone,
          clear_milestone: result.rule.clear_milestone,
          priority: result.rule.priority,
        })),
        security_signal: securitySignal,
      };
    }

    if (matchedRule.rule.milestone) {
      return {
        action: "set",
        milestone_title: matchedRule.rule.milestone,
        source: "rule",
        matched_rule: {
          id: matchedRule.rule.id,
          name: matchedRule.rule.name,
          reasons: matchedRule.reasons,
          priority: matchedRule.rule.priority,
        },
        matched_rules: ruleResults.map((result) => ({
          id: result.rule.id,
          name: result.rule.name,
          reasons: result.reasons,
          milestone: result.rule.milestone,
          clear_milestone: result.rule.clear_milestone,
          priority: result.rule.priority,
        })),
        security_signal: securitySignal,
      };
    }
  }

  const severityMilestone = normalizeMilestoneTitle(
    config.milestone_by_severity[input.severity] ||
      config.milestone_by_severity.unknown ||
      args.default_milestone ||
      config.default_milestone,
  );

  if (severityMilestone) {
    return {
      action: "set",
      milestone_title: severityMilestone,
      source: `severity:${input.severity}`,
      matched_rule: null,
      matched_rules: ruleResults.map((result) => ({
        id: result.rule.id,
        name: result.rule.name,
        reasons: result.reasons,
        milestone: result.rule.milestone,
        clear_milestone: result.rule.clear_milestone,
        priority: result.rule.priority,
      })),
      security_signal: securitySignal,
    };
  }

  return {
    action: "none",
    milestone_title: "",
    source: "none",
    matched_rule: null,
    matched_rules: [],
    security_signal: securitySignal,
  };
}

async function resolveMilestoneNumber(args, candidate) {
  if (candidate.action === "clear") {
    return {
      resolved: true,
      milestone: null,
      milestone_number: null,
      created: false,
      remote_available: false,
      errors: [],
      warnings: [],
    };
  }

  if (candidate.action !== "set" || !candidate.milestone_title) {
    return {
      resolved: false,
      milestone: null,
      milestone_number: null,
      created: false,
      remote_available: false,
      errors: ["No milestone title resolved."],
      warnings: [],
    };
  }

  if (!args.token) {
    return {
      resolved: args.dry_run,
      milestone: {
        title: candidate.milestone_title,
        number: null,
      },
      milestone_number: null,
      created: false,
      remote_available: false,
      errors: args.dry_run
        ? []
        : [
            "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_SECURITY_MILESTONES_TOKEN, or --token.",
          ],
      warnings: [
        "Milestone number could not be resolved without GitHub API access.",
      ],
    };
  }

  if (!args.fetch_milestones) {
    return {
      resolved: false,
      milestone: null,
      milestone_number: null,
      created: false,
      remote_available: false,
      errors: [
        "Milestone lookup is disabled, so a milestone number cannot be resolved.",
      ],
      warnings: [],
    };
  }

  const milestones = await fetchMilestones(args);
  const existing = milestones.find(
    (milestone) =>
      normalizeMilestoneKey(milestone.title) ===
      normalizeMilestoneKey(candidate.milestone_title),
  );

  if (existing) {
    return {
      resolved: true,
      milestone: existing,
      milestone_number: existing.number,
      created: false,
      remote_available: true,
      errors: [],
      warnings: [],
    };
  }

  if (args.fail_if_missing_milestone || !args.create_missing_milestone) {
    return {
      resolved: false,
      milestone: null,
      milestone_number: null,
      created: false,
      remote_available: true,
      errors: [`Milestone does not exist: ${candidate.milestone_title}`],
      warnings: [],
    };
  }

  if (args.dry_run) {
    return {
      resolved: true,
      milestone: {
        title: candidate.milestone_title,
        number: null,
      },
      milestone_number: null,
      created: true,
      remote_available: true,
      errors: [],
      warnings: [`Milestone would be created: ${candidate.milestone_title}`],
    };
  }

  const created = await createMilestone(args, candidate.milestone_title);

  return {
    resolved: true,
    milestone: created,
    milestone_number: created.number,
    created: true,
    remote_available: true,
    errors: [],
    warnings: [],
  };
}

async function executeAssignment(args, input, candidate, milestoneResolution) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    action: candidate.action,
    source: candidate.source,
    milestone_title: candidate.milestone_title,
    milestone_number: milestoneResolution.milestone_number,
    milestone_created: milestoneResolution.created,
    previous_milestone: input.current_milestone,
    final_milestone: input.current_milestone,
    changed: false,
    skipped_reason: "",
    errors: [...milestoneResolution.errors],
    warnings: [
      ...milestoneResolution.warnings,
      ...input.api.missing_data_warnings,
    ],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!input.number) {
      result.status = args.fail_if_missing_number ? "invalid" : "skipped";
      result.success = !args.fail_if_missing_number;
      result.skipped_reason = "missing-number";
      result.errors.push("Issue or pull request number could not be resolved.");
      return result;
    }

    if (!["issue", "pull_request"].includes(input.kind)) {
      result.status = "skipped";
      result.success = true;
      result.skipped_reason = "not-issue-or-pr";
      result.warnings.push(
        "Milestones can only be assigned to GitHub issues and pull requests.",
      );
      return result;
    }

    if (args.require_security_signal && !candidate.security_signal) {
      result.status = "skipped";
      result.success = true;
      result.skipped_reason = "no-security-signal";
      result.warnings.push("No security signal was detected.");
      return result;
    }

    if (args.skip_existing && input.current_milestone) {
      result.status = "skipped-existing";
      result.success = true;
      result.skipped_reason = "existing-milestone";
      return result;
    }

    if (
      input.current_milestone &&
      !args.replace_existing &&
      candidate.action === "set"
    ) {
      result.status = "skipped-existing";
      result.success = true;
      result.skipped_reason = "replace-disabled";
      return result;
    }

    if (candidate.action === "none") {
      result.status = args.fail_if_no_milestone ? "invalid" : "skipped";
      result.success = !args.fail_if_no_milestone;
      result.skipped_reason = "no-milestone";
      result.errors.push("No milestone was resolved.");
      return result;
    }

    if (result.errors.length) {
      result.status = "invalid";
      result.success = false;
      return result;
    }

    const desiredMilestoneNumber =
      candidate.action === "clear"
        ? null
        : milestoneResolution.milestone_number;

    const currentMilestoneNumber = input.current_milestone?.number ?? null;

    if (
      candidate.action === "set" &&
      input.current_milestone?.title === candidate.milestone_title
    ) {
      result.status = "already-set";
      result.success = true;
      result.final_milestone = input.current_milestone;
      return result;
    }

    if (candidate.action === "clear" && !input.current_milestone) {
      result.status = "already-clear";
      result.success = true;
      result.final_milestone = null;
      return result;
    }

    if (
      desiredMilestoneNumber === null &&
      candidate.action === "set" &&
      !args.dry_run
    ) {
      result.status = "invalid";
      result.success = false;
      result.errors.push("Milestone number could not be resolved.");
      return result;
    }

    if (desiredMilestoneNumber === currentMilestoneNumber) {
      result.status = "already-set";
      result.success = true;
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.changed = true;
      result.final_milestone =
        candidate.action === "clear"
          ? null
          : {
              number: desiredMilestoneNumber,
              title: candidate.milestone_title,
              state: "planned",
              html_url: "",
            };
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.success = false;
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_SECURITY_MILESTONES_TOKEN, or --token.",
      );
      return result;
    }

    logger.info(
      candidate.action === "clear"
        ? `Clearing milestone on #${input.number}.`
        : `Assigning milestone "${candidate.milestone_title}" to #${input.number}.`,
    );

    const updated = await updateIssueMilestone(
      args,
      input.number,
      desiredMilestoneNumber,
    );

    result.status = candidate.action === "clear" ? "cleared" : "assigned";
    result.success = true;
    result.changed = true;
    result.final_milestone = updated.milestone
      ? {
          number: normalizeInteger(updated.milestone.number, 0),
          title: normalizeMilestoneTitle(updated.milestone.title),
          state: normalizeString(updated.milestone.state),
          html_url: normalizeString(updated.milestone.html_url),
        }
      : null;

    return result;
  } catch (err) {
    result.status = "failed";
    result.success = false;
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
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

function issueUrl(repository, number) {
  if (!number) return "";

  const base = /^https?:\/\//.test(repository)
    ? repository.replace(/\/+$/g, "")
    : `https://github.com/${repository}`;

  return `${base}/issues/${number}`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  config,
  input,
  candidate,
  milestoneResolution,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const ok = execution.success && execution.errors.length === 0;

  return {
    schema_version: 1,
    type: "security-assign-milestones",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      event_path: args.event_path
        ? toRelativePath(resolvePath(args.event_path, repoRoot), repoRoot)
        : null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      default_milestone: args.default_milestone || config.default_milestone,
      milestone_by_severity: config.milestone_by_severity,
      rule_count: config.rules.length,
      create_missing_milestone: args.create_missing_milestone,
      replace_existing: args.replace_existing,
      skip_existing: args.skip_existing,
      require_security_signal: args.require_security_signal,
      dry_run: args.dry_run,
    },
    item: {
      number: input.number,
      url: issueUrl(args.repository, input.number),
      kind: input.kind,
      title: input.title,
      author: input.author,
      actor: input.actor,
      labels: input.labels,
      current_milestone: input.current_milestone,
      api: input.api,
    },
    security: {
      security_signal: candidate.security_signal,
      severity: input.severity,
      cvss: input.cvss,
      cve: input.cve,
      cwe: input.cwe,
      package_name: input.package_name,
      ecosystem: input.ecosystem,
      alert_type: input.alert_type,
      manifest_path: input.manifest_path,
      changed_files: input.changed_files,
    },
    assignment: {
      action: candidate.action,
      source: candidate.source,
      milestone_title: candidate.milestone_title,
      matched_rule: candidate.matched_rule,
      matched_rules: candidate.matched_rules,
      milestone_resolution: {
        resolved: milestoneResolution.resolved,
        milestone: milestoneResolution.milestone,
        milestone_number: milestoneResolution.milestone_number,
        created: milestoneResolution.created,
        remote_available: milestoneResolution.remote_available,
      },
    },
    execution,
    totals: {
      matched_rules: candidate.matched_rules.length,
      labels: input.labels.length,
      changed_files: input.changed_files.length,
      errors: execution.errors.length,
      warnings: execution.warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      changed: execution.changed,
      ok,
    },
    errors: execution.errors,
    warnings: execution.warnings,
    status: execution.status,
    ok,
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

function createMarkdownSummary(report) {
  const icon = report.ok
    ? report.status.startsWith("skipped")
      ? "⏭️"
      : report.config.dry_run
        ? "🧪"
        : "✅"
    : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Security Milestone Assignment`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Item: \`#${report.item.number || "unresolved"}\``,
    `- Kind: \`${report.item.kind || "unknown"}\``,
    `- Action: \`${report.assignment.action}\``,
    `- Source: \`${report.assignment.source}\``,
    `- Milestone: \`${escapeMarkdown(report.assignment.milestone_title || "none")}\``,
    `- Previous milestone: \`${escapeMarkdown(report.item.current_milestone?.title || "none")}\``,
    `- Final milestone: \`${escapeMarkdown(report.execution.final_milestone?.title || "none")}\``,
    `- Changed: \`${report.execution.changed ? "true" : "false"}\``,
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
  ];

  if (report.item.url) {
    lines.push(`Item URL: ${report.item.url}`);
    lines.push("");
  }

  lines.push("## 🔐 Security Signal");
  lines.push("");
  lines.push(
    `- Security signal detected: \`${report.security.security_signal ? "true" : "false"}\``,
  );
  lines.push(`- Severity: \`${report.security.severity}\``);
  lines.push(`- CVSS: \`${report.security.cvss || "none"}\``);
  lines.push(`- CVE: \`${escapeMarkdown(report.security.cve || "none")}\``);
  lines.push(`- CWE: \`${escapeMarkdown(report.security.cwe || "none")}\``);
  lines.push(
    `- Package: \`${escapeMarkdown(report.security.package_name || "none")}\``,
  );
  lines.push(
    `- Ecosystem: \`${escapeMarkdown(report.security.ecosystem || "none")}\``,
  );
  lines.push(
    `- Alert type: \`${escapeMarkdown(report.security.alert_type || "none")}\``,
  );
  lines.push(
    `- Manifest path: \`${escapeMarkdown(report.security.manifest_path || "none")}\``,
  );
  lines.push(
    `- Labels: \`${escapeMarkdown(report.item.labels.join(", ") || "none")}\``,
  );

  lines.push("");
  lines.push("## 🧩 Matching Rules");
  lines.push("");

  if (!report.assignment.matched_rules.length) {
    lines.push("No milestone rules matched.");
  } else {
    lines.push("| Rule | Reasons | Milestone | Priority |");
    lines.push("|---|---|---|---:|");

    for (const rule of report.assignment.matched_rules) {
      lines.push(
        `| \`${escapeMarkdown(rule.name)}\` | \`${escapeMarkdown(rule.reasons.join(", ") || "matched")}\` | \`${escapeMarkdown(rule.milestone || "none")}\` | \`${rule.priority}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🏁 Milestone Resolution");
  lines.push("");
  lines.push(
    `- Resolved: \`${report.assignment.milestone_resolution.resolved ? "true" : "false"}\``,
  );
  lines.push(
    `- Milestone number: \`${report.assignment.milestone_resolution.milestone_number ?? "none"}\``,
  );
  lines.push(
    `- Created: \`${report.assignment.milestone_resolution.created ? "true" : "false"}\``,
  );
  lines.push(
    `- Remote available: \`${report.assignment.milestone_resolution.remote_available ? "true" : "false"}\``,
  );

  if (report.security.changed_files.length) {
    lines.push("");
    lines.push("## 📁 Security-Related Files");
    lines.push("");

    for (const file of report.security.changed_files.slice(0, 100)) {
      lines.push(`- \`${escapeMarkdown(file)}\``);
    }

    if (report.security.changed_files.length > 100) {
      lines.push(
        `- ...and \`${report.security.changed_files.length - 100}\` more file(s).`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Event path: \`${report.config.event_path || "none"}\``);
  lines.push(
    `- Create missing milestone: \`${report.config.create_missing_milestone ? "true" : "false"}\``,
  );
  lines.push(
    `- Replace existing: \`${report.config.replace_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Skip existing: \`${report.config.skip_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Require security signal: \`${report.config.require_security_signal ? "true" : "false"}\``,
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
  setGitHubOutput("assign_security_milestones_file", report.config.output_file);
  setGitHubOutput(
    "assign_security_milestones_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("assign_security_milestones_status", report.status);
  setGitHubOutput(
    "assign_security_milestones_ok",
    report.ok ? "true" : "false",
  );

  setGitHubOutput("security_item_number", report.item.number || "");
  setGitHubOutput("security_item_url", report.item.url || "");
  setGitHubOutput("security_item_kind", report.item.kind || "");

  setGitHubOutput("security_severity", report.security.severity || "");
  setGitHubOutput("security_cvss", String(report.security.cvss || ""));
  setGitHubOutput("security_cve", report.security.cve || "");
  setGitHubOutput("security_cwe", report.security.cwe || "");
  setGitHubOutput("security_package", report.security.package_name || "");
  setGitHubOutput("security_ecosystem", report.security.ecosystem || "");
  setGitHubOutput("security_alert_type", report.security.alert_type || "");
  setGitHubOutput(
    "security_signal",
    report.security.security_signal ? "true" : "false",
  );

  setGitHubOutput("security_milestone_action", report.assignment.action);
  setGitHubOutput(
    "security_milestone_title",
    report.assignment.milestone_title || "",
  );
  setGitHubOutput(
    "security_milestone_number",
    String(report.assignment.milestone_resolution.milestone_number ?? ""),
  );
  setGitHubOutput(
    "security_milestone_created",
    report.assignment.milestone_resolution.created ? "true" : "false",
  );
  setGitHubOutput(
    "security_milestone_changed",
    report.execution.changed ? "true" : "false",
  );

  setGitHubOutput(
    "security_matched_rules",
    String(report.totals.matched_rules),
  );
  setGitHubOutput(
    "security_matched_rules_json",
    JSON.stringify(report.assignment.matched_rules),
  );
  setGitHubOutput("security_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("security_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const rawConfig =
    args.use_config && configFile ? readDataFile(configFile, repoRoot) : null;
  const config = normalizeConfig(rawConfig);

  args = applyConfig(args, rawConfig);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing security milestone assignment.");

  const github = getGitMetadata(repoRoot);
  let input = collectEventInput(args, repoRoot, github);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    input.api.missing_data_warnings.push(
      `Unable to enrich issue/PR input: ${logger.formatError(err)}`,
    );
  }

  const candidate = resolveMilestoneCandidate(args, config, input);

  let milestoneResolution = {
    resolved: false,
    milestone: null,
    milestone_number: null,
    created: false,
    remote_available: false,
    errors: [],
    warnings: [],
  };

  try {
    milestoneResolution = await resolveMilestoneNumber(args, candidate);
  } catch (err) {
    milestoneResolution.errors.push(logger.formatError(err));
  }

  const execution = await executeAssignment(
    args,
    input,
    candidate,
    milestoneResolution,
  );

  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(rawConfig),
    config,
    input,
    candidate,
    milestoneResolution,
    execution,
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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
