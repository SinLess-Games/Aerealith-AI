#!/usr/bin/env node
// .github/scripts/security/create-security-issues.js
// =============================================================================
// Aerealith AI — Security Issue Creation
// -----------------------------------------------------------------------------
// Purpose:
//   Create or update GitHub issues from security alerts, scanner findings,
//   dependency vulnerabilities, secret scanning events, code scanning alerts,
//   SARIF-like JSON, audit JSON, or direct CLI/env inputs.
//
// Input:
//   - GitHub event payload
//   - Optional findings JSON/JSONC file
//   - Direct CLI/env finding fields
//   - GitHub REST API, when a token is available
//   - .github/security/create-security-issues.json
//   - .github/security/create-security-issues.jsonc
//   - .github/security/create-security-issues.yaml
//   - .github/security/create-security-issues.yml
//
// Output:
//   - artifacts/security/create-security-issues.json
//   - artifacts/security/create-security-issues.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Safe dry-run mode.
//   - Searches open issues before creating duplicates.
//   - Can reopen/update matching existing issues.
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
    info: (message) => console.log(`[create-security-issues] ${message}`),
    warn: (message) =>
      console.warn(`[create-security-issues] WARN: ${message}`),
    error: (message) =>
      console.error(`[create-security-issues] ERROR: ${message}`),
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
  ".github/security/create-security-issues.json",
  ".github/security/create-security-issues.jsonc",
  ".github/security/create-security-issues.yaml",
  ".github/security/create-security-issues.yml",
  ".github/security/security-issues.json",
  ".github/security/security-issues.jsonc",
  ".github/security/security-issues.yaml",
  ".github/security/security-issues.yml",
  ".github/repo/create-security-issues.json",
  ".github/repo/create-security-issues.jsonc",
  ".github/repo/create-security-issues.yaml",
  ".github/repo/create-security-issues.yml",
  ".github/create-security-issues.json",
  ".github/create-security-issues.jsonc",
  ".github/create-security-issues.yaml",
  ".github/create-security-issues.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/create-security-issues.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/create-security-issues.md";

const DEFAULT_SECURITY_LABELS = ["security", "needs-triage"];
const DEFAULT_SEVERITY_LABEL_PREFIX = "severity:";
const DEFAULT_ALERT_TYPE_LABEL_PREFIX = "security:";
const DEFAULT_DEDUPE_MARKER_PREFIX = "AEREALITH-SECURITY-FINGERPRINT";

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

function normalizeUserList(value) {
  return [
    ...new Set(
      normalizeStringList(value).map(normalizeUsername).filter(Boolean),
    ),
  ];
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

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.CREATE_SECURITY_ISSUES_TOKEN ||
      process.env.SECURITY_AUTOMATION_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.CREATE_SECURITY_ISSUES_CONFIG_FILE || "",

    event_path:
      process.env.CREATE_SECURITY_ISSUES_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    findings_file:
      process.env.CREATE_SECURITY_ISSUES_FINDINGS_FILE ||
      process.env.SECURITY_FINDINGS_FILE ||
      "",

    output_file:
      process.env.CREATE_SECURITY_ISSUES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.CREATE_SECURITY_ISSUES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    title: process.env.CREATE_SECURITY_ISSUES_TITLE || "",
    body: process.env.CREATE_SECURITY_ISSUES_BODY || "",
    severity:
      process.env.CREATE_SECURITY_ISSUES_SEVERITY ||
      process.env.SECURITY_SEVERITY ||
      "",
    cvss:
      process.env.CREATE_SECURITY_ISSUES_CVSS ||
      process.env.SECURITY_CVSS ||
      "",
    cve:
      process.env.CREATE_SECURITY_ISSUES_CVE || process.env.SECURITY_CVE || "",
    cwe:
      process.env.CREATE_SECURITY_ISSUES_CWE || process.env.SECURITY_CWE || "",
    package_name:
      process.env.CREATE_SECURITY_ISSUES_PACKAGE ||
      process.env.SECURITY_PACKAGE ||
      "",
    ecosystem:
      process.env.CREATE_SECURITY_ISSUES_ECOSYSTEM ||
      process.env.SECURITY_ECOSYSTEM ||
      "",
    alert_type:
      process.env.CREATE_SECURITY_ISSUES_ALERT_TYPE ||
      process.env.SECURITY_ALERT_TYPE ||
      "",
    advisory_url:
      process.env.CREATE_SECURITY_ISSUES_ADVISORY_URL ||
      process.env.SECURITY_ADVISORY_URL ||
      "",
    source_url:
      process.env.CREATE_SECURITY_ISSUES_SOURCE_URL ||
      process.env.SECURITY_SOURCE_URL ||
      "",
    manifest_path:
      process.env.CREATE_SECURITY_ISSUES_MANIFEST_PATH ||
      process.env.SECURITY_MANIFEST_PATH ||
      "",
    vulnerable_version:
      process.env.CREATE_SECURITY_ISSUES_VULNERABLE_VERSION ||
      process.env.SECURITY_VULNERABLE_VERSION ||
      "",
    patched_version:
      process.env.CREATE_SECURITY_ISSUES_PATCHED_VERSION ||
      process.env.SECURITY_PATCHED_VERSION ||
      "",
    recommendation:
      process.env.CREATE_SECURITY_ISSUES_RECOMMENDATION ||
      process.env.SECURITY_RECOMMENDATION ||
      "",

    labels: normalizeLabelList(
      process.env.CREATE_SECURITY_ISSUES_LABELS ||
        process.env.SECURITY_LABELS ||
        "",
    ),

    assignees: normalizeUserList(
      process.env.CREATE_SECURITY_ISSUES_ASSIGNEES ||
        process.env.SECURITY_ASSIGNEES ||
        "",
    ),

    milestone:
      process.env.CREATE_SECURITY_ISSUES_MILESTONE ||
      process.env.SECURITY_MILESTONE ||
      "",

    dedupe_marker_prefix:
      process.env.CREATE_SECURITY_ISSUES_DEDUPE_MARKER_PREFIX ||
      DEFAULT_DEDUPE_MARKER_PREFIX,

    title_prefix:
      process.env.CREATE_SECURITY_ISSUES_TITLE_PREFIX || "[Security]",

    default_body:
      process.env.CREATE_SECURITY_ISSUES_DEFAULT_BODY ||
      "A security finding requires review.",

    create_issues: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_CREATE,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_UPDATE_EXISTING,
      true,
    ),
    reopen_existing: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_REOPEN_EXISTING,
      false,
    ),
    comment_existing: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_COMMENT_EXISTING,
      true,
    ),
    search_existing: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_SEARCH_EXISTING,
      true,
    ),
    add_dedupe_marker: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_ADD_DEDUPE_MARKER,
      true,
    ),

    include_severity_label: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_INCLUDE_SEVERITY_LABEL,
      true,
    ),
    include_alert_type_label: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_INCLUDE_ALERT_TYPE_LABEL,
      true,
    ),
    include_default_labels: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_INCLUDE_DEFAULT_LABELS,
      true,
    ),

    require_security_signal: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_REQUIRE_SECURITY_SIGNAL,
      true,
    ),

    fail_if_no_findings: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_FAIL_IF_NO_FINDINGS,
      false,
    ),
    fail_if_no_security_signal: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_FAIL_IF_NO_SECURITY_SIGNAL,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_FAIL_ON_ERROR,
      true,
    ),

    max_findings: normalizeInteger(
      process.env.CREATE_SECURITY_ISSUES_MAX_FINDINGS,
      50,
    ),
    timeout_seconds: normalizeInteger(
      process.env.CREATE_SECURITY_ISSUES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.CREATE_SECURITY_ISSUES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.CREATE_SECURITY_ISSUES_STEP_SUMMARY,
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

    if (arg === "--findings-file" || arg === "--findings" || arg === "--file") {
      args.findings_file = argv[index + 1];
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

    if (arg === "--advisory-url") {
      args.advisory_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-url") {
      args.source_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--manifest-path") {
      args.manifest_path = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--vulnerable-version") {
      args.vulnerable_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--patched-version") {
      args.patched_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--recommendation") {
      args.recommendation = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--assignee" || arg === "--assignees") {
      args.assignees.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--milestone") {
      args.milestone = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title-prefix") {
      args.title_prefix = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--default-body") {
      args.default_body = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dedupe-marker-prefix") {
      args.dedupe_marker_prefix = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--create") {
      args.create_issues = true;
      continue;
    }

    if (arg === "--no-create") {
      args.create_issues = false;
      continue;
    }

    if (arg === "--update-existing") {
      args.update_existing = true;
      continue;
    }

    if (arg === "--no-update-existing") {
      args.update_existing = false;
      continue;
    }

    if (arg === "--reopen-existing") {
      args.reopen_existing = true;
      continue;
    }

    if (arg === "--no-reopen-existing") {
      args.reopen_existing = false;
      continue;
    }

    if (arg === "--comment-existing") {
      args.comment_existing = true;
      continue;
    }

    if (arg === "--no-comment-existing") {
      args.comment_existing = false;
      continue;
    }

    if (arg === "--search-existing") {
      args.search_existing = true;
      continue;
    }

    if (arg === "--no-search-existing") {
      args.search_existing = false;
      continue;
    }

    if (arg === "--add-dedupe-marker") {
      args.add_dedupe_marker = true;
      continue;
    }

    if (arg === "--no-dedupe-marker") {
      args.add_dedupe_marker = false;
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

    if (arg === "--fail-if-no-findings") {
      args.fail_if_no_findings = true;
      continue;
    }

    if (arg === "--no-fail-if-no-findings") {
      args.fail_if_no_findings = false;
      continue;
    }

    if (arg === "--fail-if-no-security-signal") {
      args.fail_if_no_security_signal = true;
      continue;
    }

    if (arg === "--no-fail-if-no-security-signal") {
      args.fail_if_no_security_signal = false;
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

    if (arg === "--max-findings") {
      args.max_findings = normalizeInteger(argv[index + 1], args.max_findings);
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
  args.findings_file = normalizeString(args.findings_file);
  args.title = normalizeString(args.title);
  args.body = normalizeString(args.body);
  args.severity = normalizeSeverity(args.severity, "");
  args.cvss = normalizeString(args.cvss);
  args.cve = normalizeString(args.cve).toUpperCase();
  args.cwe = normalizeString(args.cwe).toUpperCase();
  args.package_name = normalizeString(args.package_name);
  args.ecosystem = normalizeString(args.ecosystem).toLowerCase();
  args.alert_type = normalizeString(args.alert_type).toLowerCase();
  args.advisory_url = normalizeUrl(args.advisory_url);
  args.source_url = normalizeUrl(args.source_url);
  args.manifest_path = toPosixPath(args.manifest_path);
  args.vulnerable_version = normalizeString(args.vulnerable_version);
  args.patched_version = normalizeString(args.patched_version);
  args.recommendation = normalizeString(args.recommendation);
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.assignees = [
    ...new Set(args.assignees.map(normalizeUsername).filter(Boolean)),
  ];
  args.milestone = normalizeString(args.milestone);
  args.title_prefix = normalizeString(args.title_prefix, "[Security]");
  args.default_body = normalizeString(
    args.default_body,
    "A security finding requires review.",
  );
  args.dedupe_marker_prefix = normalizeString(
    args.dedupe_marker_prefix,
    DEFAULT_DEDUPE_MARKER_PREFIX,
  );
  args.max_findings = Math.max(1, Math.min(args.max_findings, 250));
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Security Issue Creation

Usage:
  node .github/scripts/security/create-security-issues.js [options]

Examples:
  node .github/scripts/security/create-security-issues.js --title "Critical dependency vulnerability" --severity critical
  node .github/scripts/security/create-security-issues.js --findings-file artifacts/security/findings.json
  node .github/scripts/security/create-security-issues.js --event-path "$GITHUB_EVENT_PATH"
  node .github/scripts/security/create-security-issues.js --dry-run
  node .github/scripts/security/create-security-issues.js --no-create --update-existing

Options:
      --repo <owner/repo>                  Repository slug.
      --api-url <url>                      GitHub API URL.
      --token <token>                      GitHub token.
      --config <file>                      Security issue config file.
      --event-path <file>                  GitHub event payload path.
      --findings-file <file>               JSON/JSONC findings source.
      --title <title>                      Finding title.
      --body <body>                        Finding body/details.
      --severity <severity>                critical, high, medium, low, info.
      --cvss <score>                       CVSS score.
      --cve <id>                           CVE identifier.
      --cwe <id>                           CWE identifier.
      --package <name>                     Affected package name.
      --ecosystem <name>                   npm, docker, github-actions, etc.
      --alert-type <type>                  dependabot, code-scanning, secret-scanning.
      --advisory-url <url>                 Advisory URL.
      --source-url <url>                   Scanner/source URL.
      --manifest-path <path>               Affected manifest path.
      --vulnerable-version <text>          Vulnerable version/range.
      --patched-version <text>             Patched/fixed version.
      --recommendation <text>              Remediation guidance.
      --label <label,list>                 Extra labels.
      --assignee <user,list>               Issue assignees.
      --milestone <title>                  Issue milestone title.
      --title-prefix <text>                Issue title prefix. Default: [Security].
      --default-body <text>                Body fallback.
      --dedupe-marker-prefix <text>        Fingerprint marker prefix.
      --create                            Create missing issues. Default.
      --no-create                         Do not create new issues.
      --update-existing                   Update matching existing issues. Default.
      --no-update-existing                Do not update matching existing issues.
      --reopen-existing                   Reopen matching closed issues.
      --no-reopen-existing                Do not reopen closed issues. Default.
      --comment-existing                  Comment on matching existing issues. Default.
      --no-comment-existing               Do not comment on matching existing issues.
      --search-existing                   Search existing issues before create. Default.
      --no-search-existing                Skip duplicate search.
      --add-dedupe-marker                 Add fingerprint marker to body. Default.
      --no-dedupe-marker                  Do not add fingerprint marker.
      --require-security-signal           Skip findings without security signal. Default.
      --no-require-security-signal        Allow generic findings.
      --fail-if-no-findings               Fail when no findings are resolved.
      --fail-if-no-security-signal        Fail when findings lack security signal.
      --fail-on-error                     Exit non-zero on errors. Default.
      --no-fail-on-error                  Do not fail workflow.
      --max-findings <number>             Max findings to process. Default: 50.
      --timeout-seconds <number>          GitHub API timeout. Default: 60.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not mutate GitHub.
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
      (section === "findings" || section === "security_findings") &&
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
      (section === "findings" || section === "security_findings") &&
      currentItem &&
      /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)
    ) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentItem[key] = parseYamlScalar(value);
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

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = [
    "findings_file",
    "output_file",
    "summary_file",
    "title_prefix",
    "default_body",
    "dedupe_marker_prefix",
    "milestone",
  ];

  for (const key of stringKeys) {
    if (
      config[key] !== undefined &&
      (!merged[key] || key !== "findings_file")
    ) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = ["labels", "assignees"];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      const values =
        key === "labels"
          ? normalizeLabelList(config[key])
          : normalizeUserList(config[key]);

      merged[key] = [...new Set([...merged[key], ...values])];
    }
  }

  const booleanKeys = [
    "create_issues",
    "update_existing",
    "reopen_existing",
    "comment_existing",
    "search_existing",
    "add_dedupe_marker",
    "include_severity_label",
    "include_alert_type_label",
    "include_default_labels",
    "require_security_signal",
    "fail_if_no_findings",
    "fail_if_no_security_signal",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_findings !== undefined) {
    merged.max_findings = normalizeInteger(
      config.max_findings,
      merged.max_findings,
    );
  }

  if (config.timeout_seconds !== undefined) {
    merged.timeout_seconds = normalizeInteger(
      config.timeout_seconds,
      merged.timeout_seconds,
    );
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
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-create-security-issues-script`,
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

async function searchIssues(args, query) {
  const encodedQuery = encodeURIComponent(query);
  const response = await requestJson(
    apiUrl(args, `/search/issues?q=${encodedQuery}&per_page=10`),
    {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return Array.isArray(response.body?.items) ? response.body.items : [];
}

async function createIssue(args, issue) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, "/issues")),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: issue,
    },
  );

  return response.body;
}

async function updateIssue(args, number, patch) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/issues/${encodeURIComponent(number)}`)),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: patch,
    },
  );

  return response.body;
}

async function createIssueComment(args, number, body) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/comments`),
    ),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        body,
      },
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
        repoEndpoint(args, `/milestones?state=all&per_page=100&page=${page}`),
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
        number: normalizeInteger(milestone.number, 0),
        title: normalizeString(milestone.title),
        state: normalizeString(milestone.state),
        html_url: normalizeString(milestone.html_url),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return milestones;
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

function getAlertType(event, fallback = "") {
  const eventName = normalizeString(
    process.env.GITHUB_EVENT_NAME || "",
  ).toLowerCase();

  if (fallback) return fallback;
  if (eventName.includes("dependabot")) return "dependabot";
  if (eventName.includes("code_scanning")) return "code-scanning";
  if (eventName.includes("secret_scanning")) return "secret-scanning";
  if (event?.dependabot_alert) return "dependabot";
  if (event?.code_scanning_alert) return "code-scanning";
  if (event?.secret_scanning_alert) return "secret-scanning";

  return "";
}

function extractAlertFinding(event, args) {
  const alert = getEventAlert(event);

  if (!alert || typeof alert !== "object") return null;

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
        .join(", ")
    : advisory.cwe || "";

  return {
    title:
      advisory.summary ||
      rule.description ||
      rule.name ||
      alert.rule?.id ||
      alert.secret_type_display_name ||
      args.title ||
      "Security alert",
    body:
      advisory.description ||
      rule.full_description ||
      rule.description ||
      alert.message?.text ||
      args.body ||
      "",
    severity:
      advisory.severity ||
      rule.security_severity_level ||
      rule.severity ||
      alert.severity ||
      "",
    cvss: advisory.cvss?.score || advisory.cvss_score || "",
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
    alert_type: getAlertType(event, args.alert_type),
    advisory_url:
      advisory.url ||
      advisory.references?.[0]?.url ||
      alert.html_url ||
      alert.url ||
      "",
    source_url: alert.html_url || alert.url || "",
    manifest_path:
      vulnerability.manifest_path ||
      alert.dependency?.manifest_path ||
      mostRecentInstance.location?.path ||
      alert.location?.path ||
      "",
    vulnerable_version:
      vulnerability.vulnerable_version_range ||
      vulnerability.vulnerableVersionRange ||
      "",
    patched_version:
      vulnerability.first_patched_version?.identifier ||
      vulnerability.firstPatchedVersion?.identifier ||
      "",
    recommendation: advisory.recommendation || advisory.withdrawn_reason || "",
    source: "event-alert",
  };
}

function extractGenericEventFinding(event, args) {
  const item = event?.issue || event?.pull_request || null;

  if (!item && !args.title) return null;

  return {
    title: args.title || item?.title || "",
    body: args.body || item?.body || "",
    severity: args.severity,
    cvss: args.cvss,
    cve: args.cve,
    cwe: args.cwe,
    package_name: args.package_name,
    ecosystem: args.ecosystem,
    alert_type: args.alert_type,
    advisory_url: args.advisory_url,
    source_url: args.source_url,
    manifest_path: args.manifest_path,
    vulnerable_version: args.vulnerable_version,
    patched_version: args.patched_version,
    recommendation: args.recommendation,
    source: "event-item",
  };
}

function extractFindingsFromSarif(data) {
  const findings = [];

  for (const run of data?.runs || []) {
    const rules = new Map();

    for (const rule of run.tool?.driver?.rules || []) {
      rules.set(rule.id, rule);
    }

    for (const result of run.results || []) {
      const rule = rules.get(result.ruleId) || {};
      const location = result.locations?.[0]?.physicalLocation || {};
      const artifactLocation = location.artifactLocation || {};

      findings.push({
        title:
          result.message?.text ||
          rule.shortDescription?.text ||
          rule.fullDescription?.text ||
          result.ruleId ||
          "Code scanning finding",
        body: rule.fullDescription?.text || result.message?.text || "",
        severity:
          result.level === "error"
            ? "high"
            : result.level === "warning"
              ? "medium"
              : result.level === "note"
                ? "info"
                : rule.properties?.securitySeverity
                  ? severityFromCvss(rule.properties.securitySeverity)
                  : "",
        cvss: rule.properties?.securitySeverity || "",
        cwe: Array.isArray(rule.properties?.tags)
          ? rule.properties.tags
              .filter((tag) => /^cwe-\d+/i.test(tag))
              .join(", ")
          : "",
        alert_type: "code-scanning",
        source_url: "",
        manifest_path: toPosixPath(artifactLocation.uri || ""),
        recommendation: rule.help?.text || "",
        source: "sarif",
      });
    }
  }

  return findings;
}

function extractFindingsFromAudit(data) {
  const findings = [];

  const vulnerabilities =
    data?.vulnerabilities && typeof data.vulnerabilities === "object"
      ? Object.entries(data.vulnerabilities).map(([name, value]) => ({
          name,
          ...value,
        }))
      : [];

  for (const vulnerability of vulnerabilities) {
    findings.push({
      title: vulnerability.title || `${vulnerability.name} vulnerability`,
      body: vulnerability.overview || vulnerability.description || "",
      severity: vulnerability.severity || "",
      cvss: vulnerability.cvss?.score || "",
      cve: Array.isArray(vulnerability.cves)
        ? vulnerability.cves.join(", ")
        : vulnerability.cve || "",
      cwe: Array.isArray(vulnerability.cwe)
        ? vulnerability.cwe.join(", ")
        : vulnerability.cwe || "",
      package_name: vulnerability.name,
      ecosystem: "npm",
      alert_type: "dependency-audit",
      advisory_url: vulnerability.url || "",
      vulnerable_version: Array.isArray(vulnerability.range)
        ? vulnerability.range.join(", ")
        : vulnerability.range || "",
      patched_version: vulnerability.fixAvailable?.version || "",
      recommendation: vulnerability.fixAvailable
        ? "Update the affected package to a patched version."
        : "",
      source: "audit",
    });
  }

  if (Array.isArray(data?.advisories)) {
    for (const advisory of data.advisories) {
      findings.push({
        title: advisory.title || `${advisory.module_name} vulnerability`,
        body: advisory.overview || "",
        severity: advisory.severity || "",
        cvss: advisory.cvss || "",
        cve: Array.isArray(advisory.cves) ? advisory.cves.join(", ") : "",
        cwe: Array.isArray(advisory.cwe)
          ? advisory.cwe.join(", ")
          : advisory.cwe || "",
        package_name: advisory.module_name || "",
        ecosystem: "npm",
        alert_type: "dependency-audit",
        advisory_url: advisory.url || "",
        vulnerable_version: advisory.vulnerable_versions || "",
        patched_version: advisory.patched_versions || "",
        recommendation: advisory.recommendation || "",
        source: "audit-advisory",
      });
    }
  }

  return findings;
}

function extractFindingsFromGeneric(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.findings)) return data.findings;
  if (Array.isArray(data?.security_findings)) return data.security_findings;
  if (Array.isArray(data?.issues)) return data.issues;
  if (Array.isArray(data?.alerts)) return data.alerts;
  if (Array.isArray(data?.results)) return data.results;

  if (
    data &&
    typeof data === "object" &&
    (data.title || data.name || data.message)
  ) {
    return [data];
  }

  return [];
}

function normalizeFinding(raw, index, args) {
  const source = raw && typeof raw === "object" ? raw : {};

  const cvss = normalizeFloat(
    source.cvss || source.cvss_score || source.cvssScore || args.cvss,
    0,
  );
  const severity = normalizeSeverity(
    source.severity ||
      source.security_severity ||
      source.securitySeverity ||
      args.severity ||
      severityFromCvss(cvss),
    "unknown",
  );

  const title = normalizeString(
    source.title ||
      source.name ||
      source.summary ||
      source.message ||
      source.rule_id ||
      source.ruleId ||
      args.title ||
      "",
  );

  const packageName = normalizeString(
    source.package_name ||
      source.packageName ||
      source.package ||
      source.module_name ||
      source.moduleName ||
      source.dependency ||
      args.package_name,
  );

  const ecosystem = normalizeString(
    source.ecosystem ||
      source.package_ecosystem ||
      source.packageEcosystem ||
      args.ecosystem,
  ).toLowerCase();

  const cve = normalizeString(
    source.cve || source.cves || source.CVE || args.cve,
  ).toUpperCase();

  const cwe = normalizeString(
    source.cwe || source.cwes || source.CWE || args.cwe,
  ).toUpperCase();

  const alertType = normalizeString(
    source.alert_type || source.alertType || source.type || args.alert_type,
  ).toLowerCase();

  const manifestPath = toPosixPath(
    source.manifest_path ||
      source.manifestPath ||
      source.path ||
      source.file ||
      source.location ||
      args.manifest_path,
  );

  const body = normalizeString(
    source.body ||
      source.description ||
      source.details ||
      source.overview ||
      source.help ||
      args.body ||
      args.default_body,
  );

  const advisoryUrl = normalizeUrl(
    source.advisory_url ||
      source.advisoryUrl ||
      source.url ||
      source.html_url ||
      args.advisory_url,
  );

  const sourceUrl = normalizeUrl(
    source.source_url ||
      source.sourceUrl ||
      source.scan_url ||
      source.scanUrl ||
      args.source_url,
  );

  const vulnerableVersion = normalizeString(
    source.vulnerable_version ||
      source.vulnerableVersion ||
      source.vulnerable_versions ||
      source.vulnerableVersions ||
      source.range ||
      args.vulnerable_version,
  );

  const patchedVersion = normalizeString(
    source.patched_version ||
      source.patchedVersion ||
      source.fixed_version ||
      source.fixedVersion ||
      source.patched_versions ||
      source.patchedVersions ||
      args.patched_version,
  );

  const recommendation = normalizeString(
    source.recommendation ||
      source.remediation ||
      source.fix ||
      source.solution ||
      args.recommendation,
  );

  return {
    index,
    raw_source: normalizeString(source.source || "direct"),
    title,
    body,
    severity,
    cvss,
    cve,
    cwe,
    package_name: packageName,
    ecosystem,
    alert_type: alertType,
    advisory_url: advisoryUrl,
    source_url: sourceUrl,
    manifest_path: manifestPath,
    vulnerable_version: vulnerableVersion,
    patched_version: patchedVersion,
    recommendation,
  };
}

function detectSecuritySignal(finding) {
  const text = [
    finding.title,
    finding.body,
    finding.severity,
    finding.cve,
    finding.cwe,
    finding.package_name,
    finding.ecosystem,
    finding.alert_type,
    finding.advisory_url,
    finding.manifest_path,
  ]
    .join("\n")
    .toLowerCase();

  return Boolean(
    finding.alert_type ||
    finding.cve ||
    finding.cwe ||
    finding.cvss > 0 ||
    finding.package_name ||
    finding.ecosystem ||
    ["critical", "high", "medium", "low", "info"].includes(finding.severity) ||
    /\b(cve-\d{4}-\d+|cwe-\d+|vulnerabilit|security|xss|csrf|rce|sql injection|secret|token leak|dependency|advisory)\b/i.test(
      text,
    ),
  );
}

function fingerprintFinding(finding) {
  const stable = [
    finding.alert_type,
    finding.severity,
    finding.cve,
    finding.cwe,
    finding.package_name,
    finding.ecosystem,
    finding.manifest_path,
    finding.title,
    finding.advisory_url,
  ]
    .map((item) => normalizeString(item).toLowerCase())
    .join("|");

  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function issueTitle(args, finding) {
  const title = finding.title || "Security finding";
  const severity =
    finding.severity && finding.severity !== "unknown"
      ? `[${finding.severity.toUpperCase()}]`
      : "";

  const pieces = [args.title_prefix, severity, title].filter(Boolean).join(" ");

  return pieces.replace(/\s+/g, " ").trim().slice(0, 240);
}

function issueLabels(args, finding) {
  const labels = [];

  if (args.include_default_labels) {
    labels.push(...DEFAULT_SECURITY_LABELS);
  }

  if (args.include_severity_label && finding.severity) {
    labels.push(`${DEFAULT_SEVERITY_LABEL_PREFIX}${finding.severity}`);
  }

  if (args.include_alert_type_label && finding.alert_type) {
    labels.push(`${DEFAULT_ALERT_TYPE_LABEL_PREFIX}${finding.alert_type}`);
  }

  labels.push(...args.labels);

  return [...new Set(labels.map(normalizeLabel).filter(Boolean))];
}

function dedupeMarker(args, fingerprint) {
  return `<!-- ${args.dedupe_marker_prefix}: ${fingerprint} -->`;
}

function renderIssueBody(args, finding, fingerprint) {
  const lines = [
    args.add_dedupe_marker ? dedupeMarker(args, fingerprint) : "",
    "## Security finding",
    "",
    finding.body || args.default_body,
    "",
    "## Details",
    "",
    `- Severity: \`${finding.severity || "unknown"}\``,
    `- CVSS: \`${finding.cvss || "none"}\``,
    `- CVE: \`${finding.cve || "none"}\``,
    `- CWE: \`${finding.cwe || "none"}\``,
    `- Package: \`${finding.package_name || "none"}\``,
    `- Ecosystem: \`${finding.ecosystem || "none"}\``,
    `- Alert type: \`${finding.alert_type || "none"}\``,
    `- Manifest/path: \`${finding.manifest_path || "none"}\``,
    `- Vulnerable version: \`${finding.vulnerable_version || "none"}\``,
    `- Patched version: \`${finding.patched_version || "none"}\``,
    "",
    "## Remediation",
    "",
    finding.recommendation ||
      "Review the finding, confirm impact, and apply an appropriate fix.",
    "",
    "## References",
    "",
  ];

  if (finding.advisory_url) {
    lines.push(`- Advisory: ${finding.advisory_url}`);
  }

  if (finding.source_url) {
    lines.push(`- Source: ${finding.source_url}`);
  }

  if (!finding.advisory_url && !finding.source_url) {
    lines.push("- No external reference provided.");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`Fingerprint: \`${fingerprint}\``);
  lines.push("");
  lines.push("_Managed by Aerealith AI security automation._");

  return `${lines.filter((line) => line !== "").join("\n")}\n`;
}

function renderExistingComment(args, finding, fingerprint) {
  return [
    "## Security finding observed again",
    "",
    `The security automation saw this finding again and matched it to fingerprint \`${fingerprint}\`.`,
    "",
    `- Severity: \`${finding.severity || "unknown"}\``,
    `- Package: \`${finding.package_name || "none"}\``,
    `- Path: \`${finding.manifest_path || "none"}\``,
    `- Advisory: ${finding.advisory_url || "none"}`,
    "",
    "_Managed by Aerealith AI security automation._",
  ].join("\n");
}

function parseFindingsData(data) {
  if (!data) return [];

  if (Array.isArray(data?.runs)) {
    return extractFindingsFromSarif(data);
  }

  const auditFindings = extractFindingsFromAudit(data);

  if (auditFindings.length) return auditFindings;

  return extractFindingsFromGeneric(data);
}

function collectFindings(args, repoRoot) {
  const findings = [];
  const warnings = [];

  const event = args.event_path
    ? readDataFile(args.event_path, repoRoot)
    : null;
  const eventAlertFinding = event ? extractAlertFinding(event, args) : null;
  const eventGenericFinding = event
    ? extractGenericEventFinding(event, args)
    : null;

  if (eventAlertFinding) {
    findings.push(eventAlertFinding);
  } else if (eventGenericFinding) {
    findings.push(eventGenericFinding);
  }

  if (args.findings_file) {
    const data = readDataFile(args.findings_file, repoRoot);

    if (!data) {
      warnings.push(
        `Findings file was not readable or contained invalid data: ${args.findings_file}`,
      );
    } else {
      findings.push(...parseFindingsData(data));
    }
  }

  if (
    args.title ||
    args.body ||
    args.cve ||
    args.cwe ||
    args.package_name ||
    args.alert_type ||
    args.advisory_url
  ) {
    findings.push({
      title: args.title,
      body: args.body,
      severity: args.severity,
      cvss: args.cvss,
      cve: args.cve,
      cwe: args.cwe,
      package_name: args.package_name,
      ecosystem: args.ecosystem,
      alert_type: args.alert_type,
      advisory_url: args.advisory_url,
      source_url: args.source_url,
      manifest_path: args.manifest_path,
      vulnerable_version: args.vulnerable_version,
      patched_version: args.patched_version,
      recommendation: args.recommendation,
      source: "direct",
    });
  }

  const normalized = findings
    .map((finding, index) => normalizeFinding(finding, index, args))
    .filter(
      (finding) =>
        finding.title || finding.body || finding.cve || finding.package_name,
    )
    .slice(0, args.max_findings);

  const seen = new Set();
  const unique = [];

  for (const finding of normalized) {
    const fingerprint = fingerprintFinding(finding);

    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);
    unique.push({
      ...finding,
      fingerprint,
      security_signal: detectSecuritySignal(finding),
    });
  }

  return {
    findings: unique,
    warnings,
    event_available: Boolean(event),
  };
}

function buildSearchQuery(args, finding) {
  const terms = [
    `repo:${args.repository}`,
    "is:issue",
    "in:body",
    finding.fingerprint,
  ];

  return terms.join(" ");
}

function normalizeIssue(item) {
  if (!item) return null;

  return {
    number: normalizeInteger(item.number, 0),
    title: normalizeString(item.title),
    state: normalizeString(item.state),
    html_url: normalizeString(item.html_url),
    labels: (item.labels || []).map((label) =>
      normalizeLabel(label.name || label),
    ),
    created_at: normalizeString(item.created_at),
    updated_at: normalizeString(item.updated_at),
  };
}

async function resolveMilestoneNumber(args, title) {
  if (!title) return null;

  if (!args.token || args.dry_run) {
    return null;
  }

  const milestones = await fetchMilestones(args);
  const match = milestones.find(
    (milestone) => milestone.title.toLowerCase() === title.toLowerCase(),
  );

  return match?.number || null;
}

async function processFinding(args, finding, milestoneNumber) {
  const startedAt = new Date();
  const title = issueTitle(args, finding);
  const labels = issueLabels(args, finding);
  const body = renderIssueBody(args, finding, finding.fingerprint);

  const result = {
    fingerprint: finding.fingerprint,
    title,
    severity: finding.severity,
    package_name: finding.package_name,
    ecosystem: finding.ecosystem,
    alert_type: finding.alert_type,
    security_signal: finding.security_signal,
    status: "pending",
    action: "none",
    success: false,
    issue: null,
    created: false,
    updated: false,
    commented: false,
    reopened: false,
    skipped_reason: "",
    errors: [],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (args.require_security_signal && !finding.security_signal) {
      result.status = args.fail_if_no_security_signal ? "invalid" : "skipped";
      result.success = !args.fail_if_no_security_signal;
      result.skipped_reason = "no-security-signal";

      if (args.fail_if_no_security_signal) {
        result.errors.push("Finding does not contain a security signal.");
      }

      return result;
    }

    let existingIssue = null;

    if (args.search_existing) {
      if (!args.token) {
        result.warnings.push(
          "Missing GitHub token; duplicate search was skipped.",
        );
      } else {
        const matches = await searchIssues(
          args,
          buildSearchQuery(args, finding),
        );
        existingIssue = normalizeIssue(matches[0]);
      }
    }

    if (existingIssue) {
      result.issue = existingIssue;

      if (args.dry_run) {
        result.status = "planned-update-existing";
        result.action = "update-existing";
        result.success = true;
        result.updated = args.update_existing;
        result.commented = args.comment_existing;
        result.reopened =
          args.reopen_existing && existingIssue.state === "closed";
        return result;
      }

      if (
        !args.update_existing &&
        !args.comment_existing &&
        !args.reopen_existing
      ) {
        result.status = "already-exists";
        result.action = "none";
        result.success = true;
        return result;
      }

      if (args.update_existing) {
        const patch = {
          labels,
        };

        if (args.reopen_existing && existingIssue.state === "closed") {
          patch.state = "open";
        }

        const updated = await updateIssue(args, existingIssue.number, patch);
        result.issue = normalizeIssue(updated);
        result.updated = true;
        result.reopened = Boolean(patch.state === "open");
      }

      if (args.comment_existing) {
        await createIssueComment(
          args,
          existingIssue.number,
          renderExistingComment(args, finding, finding.fingerprint),
        );
        result.commented = true;
      }

      result.status = "updated-existing";
      result.action = "update-existing";
      result.success = true;

      return result;
    }

    if (!args.create_issues) {
      result.status = "skipped";
      result.action = "none";
      result.success = true;
      result.skipped_reason = "create-disabled";
      return result;
    }

    if (args.dry_run) {
      result.status = "planned-create";
      result.action = "create";
      result.success = true;
      result.created = true;
      result.issue = {
        number: 0,
        title,
        state: "planned",
        html_url: "",
        labels,
      };
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.success = false;
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, CREATE_SECURITY_ISSUES_TOKEN, or --token.",
      );
      return result;
    }

    logger.info(`Creating security issue: ${title}`);

    const payload = {
      title,
      body,
      labels,
    };

    if (args.assignees.length) {
      payload.assignees = args.assignees;
    }

    if (milestoneNumber) {
      payload.milestone = milestoneNumber;
    }

    const created = await createIssue(args, payload);

    result.issue = normalizeIssue(created);
    result.status = "created";
    result.action = "create";
    result.success = true;
    result.created = true;

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

async function execute(args, findingsLoad) {
  const startedAt = new Date();
  const errors = [];
  const warnings = [...findingsLoad.warnings];

  if (!findingsLoad.findings.length && args.fail_if_no_findings) {
    errors.push("No security findings were resolved.");
  }

  let milestoneNumber = null;

  try {
    milestoneNumber = await resolveMilestoneNumber(args, args.milestone);
  } catch (err) {
    warnings.push(
      `Unable to resolve milestone "${args.milestone}": ${logger.formatError(err)}`,
    );
  }

  const results = [];

  if (!errors.length) {
    for (const finding of findingsLoad.findings) {
      results.push(await processFinding(args, finding, milestoneNumber));
    }
  }

  const endedAt = new Date();

  const executionErrors = [
    ...errors,
    ...results.flatMap((result) => result.errors),
  ];

  const executionWarnings = [
    ...warnings,
    ...results.flatMap((result) => result.warnings),
  ];

  return {
    status: executionErrors.length
      ? "failed"
      : results.some((result) => result.created)
        ? "created"
        : results.some((result) => result.updated || result.commented)
          ? "updated"
          : results.length
            ? "completed"
            : "skipped",
    success: executionErrors.length === 0,
    dry_run: args.dry_run,
    milestone_title: args.milestone,
    milestone_number: milestoneNumber,
    results,
    errors: executionErrors,
    warnings: executionWarnings,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  findingsLoad,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const ok = execution.success && execution.errors.length === 0;

  return {
    schema_version: 1,
    type: "security-create-issues",
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
      findings_file: args.findings_file
        ? toRelativePath(resolvePath(args.findings_file, repoRoot), repoRoot)
        : null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      title_prefix: args.title_prefix,
      default_body: args.default_body,
      create_issues: args.create_issues,
      update_existing: args.update_existing,
      reopen_existing: args.reopen_existing,
      comment_existing: args.comment_existing,
      search_existing: args.search_existing,
      add_dedupe_marker: args.add_dedupe_marker,
      require_security_signal: args.require_security_signal,
      labels: args.labels,
      assignees: args.assignees,
      milestone: args.milestone,
      max_findings: args.max_findings,
      dry_run: args.dry_run,
    },
    findings: findingsLoad.findings,
    execution,
    totals: {
      findings: findingsLoad.findings.length,
      security_signals: findingsLoad.findings.filter(
        (finding) => finding.security_signal,
      ).length,
      created: execution.results.filter((result) => result.created).length,
      updated: execution.results.filter((result) => result.updated).length,
      commented: execution.results.filter((result) => result.commented).length,
      reopened: execution.results.filter((result) => result.reopened).length,
      skipped: execution.results.filter((result) =>
        result.status.startsWith("skipped"),
      ).length,
      failed: execution.results.filter((result) => !result.success).length,
      errors: execution.errors.length,
      warnings: execution.warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok,
    },
    issues: execution.results
      .filter((result) => result.issue)
      .map((result) => ({
        fingerprint: result.fingerprint,
        number: result.issue.number,
        title: result.issue.title,
        state: result.issue.state,
        url: result.issue.html_url,
        action: result.action,
        status: result.status,
      })),
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
  const icon = report.ok ? (report.config.dry_run ? "🧪" : "✅") : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Security Issue Creation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Findings: \`${report.totals.findings}\``,
    `- Security signals: \`${report.totals.security_signals}\``,
    `- Created: \`${report.totals.created}\``,
    `- Updated: \`${report.totals.updated}\``,
    `- Commented: \`${report.totals.commented}\``,
    `- Reopened: \`${report.totals.reopened}\``,
    `- Skipped: \`${report.totals.skipped}\``,
    `- Failed: \`${report.totals.failed}\``,
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
    "## 📋 Issue Results",
    "",
  ];

  if (!report.execution.results.length) {
    lines.push("No security issue actions were performed.");
  } else {
    lines.push(
      "| Status | Action | Issue | Severity | Finding | Fingerprint |",
    );
    lines.push("|---|---|---|---|---|---|");

    for (const result of report.execution.results) {
      const statusIcon = result.success ? "✅" : "❌";
      const issue = result.issue?.number
        ? `#${result.issue.number}`
        : result.issue?.state === "planned"
          ? "planned"
          : "none";

      lines.push(
        `| ${statusIcon} \`${escapeMarkdown(result.status)}\` | \`${escapeMarkdown(result.action)}\` | \`${issue}\` | \`${escapeMarkdown(result.severity || "unknown")}\` | ${escapeMarkdown(result.title || "none")} | \`${result.fingerprint}\` |`,
      );
    }
  }

  if (report.issues.length) {
    lines.push("");
    lines.push("## 🔗 Issues");
    lines.push("");

    for (const issue of report.issues) {
      if (issue.url) {
        lines.push(
          `- #${issue.number}: ${escapeMarkdown(issue.title)} — ${issue.url}`,
        );
      } else {
        lines.push(
          `- ${issue.number || "planned"}: ${escapeMarkdown(issue.title)} — \`${issue.status}\``,
        );
      }
    }
  }

  if (report.findings.length) {
    lines.push("");
    lines.push("## 🔐 Findings");
    lines.push("");
    lines.push("| Severity | Package | Ecosystem | Alert type | Path | CVE |");
    lines.push("|---|---|---|---|---|---|");

    for (const finding of report.findings) {
      lines.push(
        `| \`${escapeMarkdown(finding.severity || "unknown")}\` | \`${escapeMarkdown(finding.package_name || "none")}\` | \`${escapeMarkdown(finding.ecosystem || "none")}\` | \`${escapeMarkdown(finding.alert_type || "none")}\` | \`${escapeMarkdown(finding.manifest_path || "none")}\` | \`${escapeMarkdown(finding.cve || "none")}\` |`,
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
  lines.push(`- Findings file: \`${report.config.findings_file || "none"}\``);
  lines.push(
    `- Search existing: \`${report.config.search_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Create issues: \`${report.config.create_issues ? "true" : "false"}\``,
  );
  lines.push(
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
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
  setGitHubOutput("create_security_issues_file", report.config.output_file);
  setGitHubOutput(
    "create_security_issues_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("create_security_issues_status", report.status);
  setGitHubOutput("create_security_issues_ok", report.ok ? "true" : "false");

  setGitHubOutput("security_findings", String(report.totals.findings));
  setGitHubOutput("security_signals", String(report.totals.security_signals));
  setGitHubOutput("security_issues_created", String(report.totals.created));
  setGitHubOutput("security_issues_updated", String(report.totals.updated));
  setGitHubOutput("security_issues_commented", String(report.totals.commented));
  setGitHubOutput("security_issues_reopened", String(report.totals.reopened));
  setGitHubOutput("security_issues_skipped", String(report.totals.skipped));
  setGitHubOutput("security_issues_failed", String(report.totals.failed));

  setGitHubOutput(
    "security_issue_numbers",
    report.issues
      .map((issue) => issue.number)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput("security_issues_json", JSON.stringify(report.issues));
  setGitHubOutput("security_findings_json", JSON.stringify(report.findings));
  setGitHubOutput("security_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("security_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readDataFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing security issue creation.");

  const findingsLoad = collectFindings(args, repoRoot);
  const execution = await execute(args, findingsLoad);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    findingsLoad,
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
