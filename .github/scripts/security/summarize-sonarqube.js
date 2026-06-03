#!/usr/bin/env node
// .github/scripts/security/summarize-sonarqube.js
// =============================================================================
// Aerealith AI — SonarQube / SonarCloud Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize SonarQube or SonarCloud issues, security hotspots, quality gate
//   status, and project measures into clean JSON and Markdown reports for CI,
//   pull requests, releases, and security review.
//
// Input:
//   - SonarQube/SonarCloud JSON export files
//   - Optional live Sonar API fetch
//   - Optional config file
//
// Output:
//   - artifacts/security/summarize-sonarqube.json
//   - artifacts/security/summarize-sonarqube.md
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
const https = require("node:https");
const http = require("node:http");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[summarize-sonarqube] ${message}`),
    warn: (message) => console.warn(`[summarize-sonarqube] WARN: ${message}`),
    error: (message) =>
      console.error(`[summarize-sonarqube] ERROR: ${message}`),
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
  ".github/security/summarize-sonarqube.json",
  ".github/security/summarize-sonarqube.jsonc",
  ".github/security/summarize-sonarqube.yaml",
  ".github/security/summarize-sonarqube.yml",
  ".github/security/sonarqube-summary.json",
  ".github/security/sonarqube-summary.jsonc",
  ".github/security/sonarqube-summary.yaml",
  ".github/security/sonarqube-summary.yml",
  ".github/repo/summarize-sonarqube.json",
  ".github/repo/summarize-sonarqube.jsonc",
  ".github/repo/summarize-sonarqube.yaml",
  ".github/repo/summarize-sonarqube.yml",
  ".github/summarize-sonarqube.json",
  ".github/summarize-sonarqube.jsonc",
  ".github/summarize-sonarqube.yaml",
  ".github/summarize-sonarqube.yml",
];

const DEFAULT_INPUT_DIRS = [
  "artifacts/security/sonarqube",
  "artifacts/security/sonar",
  "artifacts/sonarqube",
  "artifacts/sonar",
  "results",
  ".outputs/sonarqube",
  ".outputs/sonar",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/summarize-sonarqube.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/summarize-sonarqube.md";

const DEFAULT_METRICS = [
  "bugs",
  "vulnerabilities",
  "security_hotspots",
  "code_smells",
  "coverage",
  "duplicated_lines_density",
  "ncloc",
  "sqale_rating",
  "reliability_rating",
  "security_rating",
  "security_review_rating",
  "alert_status",
];

const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "info",
  "low",
  "medium",
  "high",
  "critical",
];
const DEFAULT_FAIL_SEVERITIES = ["critical", "high"];
const DEFAULT_WARN_SEVERITIES = ["medium"];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf|sqp|sonar)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|SONAR_TOKEN=[^\s]+|SONARQUBE_TOKEN=[^\s]+|SONARCLOUD_TOKEN=[^\s]+|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

  if (["blocker", "critical", "crit"].includes(severity)) return "critical";
  if (["high", "major", "error"].includes(severity)) return "high";
  if (["medium", "moderate", "warning", "warn"].includes(severity))
    return "medium";
  if (["low", "minor"].includes(severity)) return "low";
  if (["info", "informational", "notice", "note"].includes(severity))
    return "info";
  if (["unknown", "none", "untriaged"].includes(severity)) return "unknown";

  return fallback;
}

function normalizeSonarSeverity(value, impacts = []) {
  if (Array.isArray(impacts) && impacts.length) {
    const highestImpact = impacts
      .map((impact) => normalizeSeverity(impact.severity, "unknown"))
      .sort((left, right) => severityRank(right) - severityRank(left))[0];

    if (highestImpact && highestImpact !== "unknown") return highestImpact;
  }

  return normalizeSeverity(value, "unknown");
}

function severityRank(severity) {
  const normalized = normalizeSeverity(severity, "unknown");
  const index = DEFAULT_SEVERITY_ORDER.indexOf(normalized);

  return index === -1 ? 0 : index;
}

function normalizeStatus(value, fallback = "unknown") {
  const status = normalizeString(value, fallback).toLowerCase();

  if (["ok", "passed", "pass", "green"].includes(status)) return "passed";
  if (["warning", "warn", "yellow"].includes(status)) return "warning";
  if (["error", "failed", "fail", "red"].includes(status)) return "failed";
  if (["none", "unknown"].includes(status)) return "unknown";

  return status;
}

function normalizeIssueStatus(value, fallback = "open") {
  const status = normalizeString(value, fallback).toLowerCase();

  if (
    [
      "open",
      "confirmed",
      "reopened",
      "to_review",
      "to-review",
      "reviewed",
    ].includes(status)
  )
    return "open";
  if (["resolved", "closed", "fixed", "removed"].includes(status))
    return "resolved";
  if (
    [
      "false_positive",
      "false-positive",
      "wontfix",
      "accepted",
      "dismissed",
    ].includes(status)
  )
    return "dismissed";

  return fallback;
}

function normalizeIssueType(value, fallback = "unknown") {
  const type = normalizeString(value, fallback).toLowerCase();

  if (["vulnerability", "security"].includes(type)) return "vulnerability";
  if (["security_hotspot", "security-hotspot", "hotspot"].includes(type))
    return "security-hotspot";
  if (["bug", "reliability"].includes(type)) return "bug";
  if (["code_smell", "code-smell", "maintainability"].includes(type))
    return "code-smell";

  return type || fallback;
}

function normalizeCleanCodeAttribute(value) {
  return normalizeString(value).toLowerCase().replace(/_/g, "-");
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

    config_file: process.env.SUMMARIZE_SONARQUBE_CONFIG_FILE || "",

    sonar_url:
      process.env.SUMMARIZE_SONARQUBE_URL ||
      process.env.SONAR_HOST_URL ||
      process.env.SONARQUBE_URL ||
      process.env.SONARCLOUD_URL ||
      "https://sonarcloud.io",

    sonar_token:
      process.env.SUMMARIZE_SONARQUBE_TOKEN ||
      process.env.SONAR_TOKEN ||
      process.env.SONARQUBE_TOKEN ||
      process.env.SONARCLOUD_TOKEN ||
      "",

    organization:
      process.env.SUMMARIZE_SONARQUBE_ORGANIZATION ||
      process.env.SONAR_ORGANIZATION ||
      "",

    project_key:
      process.env.SUMMARIZE_SONARQUBE_PROJECT_KEY ||
      process.env.SONAR_PROJECT_KEY ||
      process.env.SONARQUBE_PROJECT_KEY ||
      "",

    branch:
      process.env.SUMMARIZE_SONARQUBE_BRANCH ||
      process.env.SONAR_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      "",

    pull_request:
      process.env.SUMMARIZE_SONARQUBE_PULL_REQUEST ||
      process.env.SONAR_PULL_REQUEST ||
      process.env.PR_NUMBER ||
      "",

    report_files: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_REPORT_FILES ||
        process.env.SONARQUBE_REPORT_FILES ||
        process.env.SONAR_REPORT_FILES ||
        "",
    ),

    input_dirs: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_INPUT_DIRS ||
        process.env.SONARQUBE_INPUT_DIRS ||
        process.env.SONAR_INPUT_DIRS ||
        DEFAULT_INPUT_DIRS.join(","),
    ),

    output_file:
      process.env.SUMMARIZE_SONARQUBE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SUMMARIZE_SONARQUBE_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    metric_keys: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_METRICS || DEFAULT_METRICS.join(","),
    ),

    issue_types: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_ISSUE_TYPES || "",
    ),

    issue_statuses: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_ISSUE_STATUSES || "",
    ),

    fail_on_severities: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SUMMARIZE_SONARQUBE_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    min_report_severity: normalizeSeverity(
      process.env.SUMMARIZE_SONARQUBE_MIN_REPORT_SEVERITY || "unknown",
      "unknown",
    ),

    max_critical: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_CRITICAL,
      -1,
    ),
    max_high: normalizeInteger(process.env.SUMMARIZE_SONARQUBE_MAX_HIGH, -1),
    max_medium: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_MEDIUM,
      -1,
    ),
    max_low: normalizeInteger(process.env.SUMMARIZE_SONARQUBE_MAX_LOW, -1),
    max_info: normalizeInteger(process.env.SUMMARIZE_SONARQUBE_MAX_INFO, -1),
    max_unknown: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_UNKNOWN,
      -1,
    ),
    max_total_issues: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_TOTAL_ISSUES,
      -1,
    ),
    max_security_hotspots: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_SECURITY_HOTSPOTS,
      -1,
    ),
    max_vulnerabilities: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_VULNERABILITIES,
      -1,
    ),

    min_coverage: normalizeFloat(
      process.env.SUMMARIZE_SONARQUBE_MIN_COVERAGE,
      -1,
    ),
    max_duplication: normalizeFloat(
      process.env.SUMMARIZE_SONARQUBE_MAX_DUPLICATION,
      -1,
    ),

    fetch: normalizeBoolean(process.env.SUMMARIZE_SONARQUBE_FETCH, false),
    fetch_issues: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FETCH_ISSUES,
      true,
    ),
    fetch_hotspots: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FETCH_HOTSPOTS,
      true,
    ),
    fetch_measures: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FETCH_MEASURES,
      true,
    ),
    fetch_quality_gate: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FETCH_QUALITY_GATE,
      true,
    ),

    include_resolved: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_INCLUDE_RESOLVED,
      false,
    ),
    include_dismissed: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_INCLUDE_DISMISSED,
      false,
    ),
    include_hotspots: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_INCLUDE_HOTSPOTS,
      true,
    ),
    include_measures: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_INCLUDE_MEASURES,
      true,
    ),

    fail_if_quality_gate_failed: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FAIL_IF_QUALITY_GATE_FAILED,
      true,
    ),
    fail_if_issues: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FAIL_IF_ISSUES,
      false,
    ),
    fail_on_threshold: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FAIL_ON_THRESHOLD,
      true,
    ),
    fail_on_invalid_input: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FAIL_ON_INVALID_INPUT,
      true,
    ),
    require_results: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_REQUIRE_RESULTS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_FAIL_ON_ERROR,
      true,
    ),

    recursive: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_RECURSIVE,
      true,
    ),
    max_issue_rows: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_MAX_ISSUE_ROWS,
      100,
    ),
    timeout_seconds: normalizeInteger(
      process.env.SUMMARIZE_SONARQUBE_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SUMMARIZE_SONARQUBE_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_SONARQUBE_STEP_SUMMARY,
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
      arg === "--sonar-url" ||
      arg === "--sonarqube-url" ||
      arg === "--sonarcloud-url"
    ) {
      args.sonar_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--token" || arg === "--sonar-token") {
      args.sonar_token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--organization") {
      args.organization = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project-key" || arg === "--project") {
      args.project_key = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--pull-request" || arg === "--pr") {
      args.pull_request = argv[index + 1];
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

    if (arg === "--metric" || arg === "--metrics") {
      args.metric_keys.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--issue-type" || arg === "--issue-types") {
      args.issue_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--issue-status" || arg === "--issue-statuses") {
      args.issue_statuses.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--max-total-issues") {
      args.max_total_issues = normalizeInteger(
        argv[index + 1],
        args.max_total_issues,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-security-hotspots") {
      args.max_security_hotspots = normalizeInteger(
        argv[index + 1],
        args.max_security_hotspots,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-vulnerabilities") {
      args.max_vulnerabilities = normalizeInteger(
        argv[index + 1],
        args.max_vulnerabilities,
      );
      index += 1;
      continue;
    }

    if (arg === "--min-coverage") {
      args.min_coverage = normalizeFloat(argv[index + 1], args.min_coverage);
      index += 1;
      continue;
    }

    if (arg === "--max-duplication") {
      args.max_duplication = normalizeFloat(
        argv[index + 1],
        args.max_duplication,
      );
      index += 1;
      continue;
    }

    if (arg === "--fetch") {
      args.fetch = true;
      continue;
    }

    if (arg === "--no-fetch") {
      args.fetch = false;
      continue;
    }

    if (arg === "--fetch-issues") {
      args.fetch_issues = true;
      continue;
    }

    if (arg === "--no-fetch-issues") {
      args.fetch_issues = false;
      continue;
    }

    if (arg === "--fetch-hotspots") {
      args.fetch_hotspots = true;
      continue;
    }

    if (arg === "--no-fetch-hotspots") {
      args.fetch_hotspots = false;
      continue;
    }

    if (arg === "--fetch-measures") {
      args.fetch_measures = true;
      continue;
    }

    if (arg === "--no-fetch-measures") {
      args.fetch_measures = false;
      continue;
    }

    if (arg === "--fetch-quality-gate") {
      args.fetch_quality_gate = true;
      continue;
    }

    if (arg === "--no-fetch-quality-gate") {
      args.fetch_quality_gate = false;
      continue;
    }

    if (arg === "--include-resolved") {
      args.include_resolved = true;
      continue;
    }

    if (arg === "--include-dismissed") {
      args.include_dismissed = true;
      continue;
    }

    if (arg === "--include-hotspots") {
      args.include_hotspots = true;
      continue;
    }

    if (arg === "--no-hotspots") {
      args.include_hotspots = false;
      continue;
    }

    if (arg === "--fail-if-quality-gate-failed") {
      args.fail_if_quality_gate_failed = true;
      continue;
    }

    if (arg === "--no-fail-if-quality-gate-failed") {
      args.fail_if_quality_gate_failed = false;
      continue;
    }

    if (arg === "--fail-if-issues") {
      args.fail_if_issues = true;
      continue;
    }

    if (arg === "--no-fail-if-issues") {
      args.fail_if_issues = false;
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

    if (arg === "--require-results") {
      args.require_results = true;
      continue;
    }

    if (arg === "--no-require-results") {
      args.require_results = false;
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

    if (arg === "--recursive") {
      args.recursive = true;
      continue;
    }

    if (arg === "--no-recursive") {
      args.recursive = false;
      continue;
    }

    if (arg === "--max-issue-rows") {
      args.max_issue_rows = normalizeInteger(
        argv[index + 1],
        args.max_issue_rows,
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
  args.sonar_url = normalizeUrl(args.sonar_url).replace(/\/+$/g, "");
  args.organization = normalizeString(args.organization);
  args.project_key = normalizeString(args.project_key);
  args.branch = normalizeString(args.branch);
  args.pull_request = normalizeString(args.pull_request);
  args.report_files = [
    ...new Set(args.report_files.map(toPosixPath).filter(Boolean)),
  ];
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.metric_keys = [
    ...new Set(args.metric_keys.map(normalizeString).filter(Boolean)),
  ];
  args.issue_types = [
    ...new Set(
      args.issue_types
        .map((item) => normalizeIssueType(item, ""))
        .filter(Boolean),
    ),
  ];
  args.issue_statuses = [
    ...new Set(
      args.issue_statuses
        .map((item) => normalizeIssueStatus(item, ""))
        .filter(Boolean),
    ),
  ];
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
  args.max_issue_rows = Math.max(1, args.max_issue_rows);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI SonarQube / SonarCloud Summary

Usage:
  node .github/scripts/security/summarize-sonarqube.js [options]

Examples:
  node .github/scripts/security/summarize-sonarqube.js --report-file artifacts/security/sonarqube/issues.json
  node .github/scripts/security/summarize-sonarqube.js --input-dir artifacts/security/sonarqube
  node .github/scripts/security/summarize-sonarqube.js --fetch --project-key my_project --token "$SONAR_TOKEN"
  node .github/scripts/security/summarize-sonarqube.js --fetch --project-key my_project --organization my_org
  node .github/scripts/security/summarize-sonarqube.js --max-critical 0 --max-high 0
  node .github/scripts/security/summarize-sonarqube.js --min-coverage 80 --max-duplication 5

Supported input shapes:
  - SonarQube / SonarCloud issues API JSON
  - SonarQube / SonarCloud hotspots API JSON
  - SonarQube / SonarCloud measures API JSON
  - SonarQube / SonarCloud quality gate API JSON
  - Generic JSON with issues, hotspots, measures, or quality gate fields

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Summary config file.
      --sonar-url <url>                      SonarQube/SonarCloud URL.
      --token <token>                        Sonar token.
      --organization <key>                   SonarCloud organization.
      --project-key <key>                    Sonar project key.
      --branch <name>                        Branch filter.
      --pull-request <number>                Pull request filter.
      --report-file <file,list>              Sonar JSON report file(s).
      --input-dir <dir,list>                 Directories to scan for reports.
      --metric <key,list>                    Measure metric keys.
      --issue-type <type,list>               Filter issue types.
      --issue-status <status,list>           Filter issue statuses.
      --fail-on-severities <list>            Severities that fail the summary.
      --warn-on-severities <list>            Severities that warn the summary.
      --min-report-severity <severity>       Minimum severity included in issue rows.
      --max-critical <number>                Max allowed critical issues. -1 disables.
      --max-high <number>                    Max allowed high issues. -1 disables.
      --max-medium <number>                  Max allowed medium issues. -1 disables.
      --max-low <number>                     Max allowed low issues. -1 disables.
      --max-info <number>                    Max allowed info issues. -1 disables.
      --max-unknown <number>                 Max allowed unknown issues. -1 disables.
      --max-total-issues <number>            Max allowed active issues. -1 disables.
      --max-security-hotspots <number>       Max allowed active hotspots. -1 disables.
      --max-vulnerabilities <number>         Max allowed vulnerability issues. -1 disables.
      --min-coverage <number>                Minimum coverage percentage. -1 disables.
      --max-duplication <number>             Maximum duplicated lines density. -1 disables.
      --fetch                                Fetch from Sonar API.
      --no-fetch                             Do not fetch from Sonar API. Default.
      --fetch-issues                         Fetch issues. Default when --fetch is set.
      --no-fetch-issues                      Do not fetch issues.
      --fetch-hotspots                       Fetch hotspots. Default when --fetch is set.
      --no-fetch-hotspots                    Do not fetch hotspots.
      --fetch-measures                       Fetch measures. Default when --fetch is set.
      --no-fetch-measures                    Do not fetch measures.
      --fetch-quality-gate                   Fetch quality gate. Default when --fetch is set.
      --no-fetch-quality-gate                Do not fetch quality gate.
      --include-resolved                     Include resolved issues.
      --include-dismissed                    Include dismissed issues.
      --include-hotspots                     Include hotspots. Default.
      --no-hotspots                          Exclude hotspots.
      --fail-if-quality-gate-failed          Fail if quality gate fails. Default.
      --no-fail-if-quality-gate-failed       Do not fail on quality gate failure.
      --fail-if-issues                       Fail if active issues exist.
      --no-fail-if-issues                    Do not fail just because issues exist. Default.
      --fail-on-threshold                    Fail when thresholds are exceeded. Default.
      --no-fail-on-threshold                 Convert threshold failures to warnings.
      --require-results                      Fail when no Sonar data is found.
      --fail-on-invalid-input                Fail on invalid input files. Default.
      --fail-on-error                        Exit non-zero when summary is not OK. Default.
      --max-issue-rows <number>              Max issue rows in Markdown. Default: 100.
      --timeout-seconds <number>             Sonar API timeout. Default: 60.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Evaluate but mark as dry run.
      --no-print                             Do not print JSON report.
      --no-step-summary                      Do not append GitHub step summary.
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

  const stringKeys = [
    "sonar_url",
    "organization",
    "project_key",
    "branch",
    "pull_request",
    "output_file",
    "summary_file",
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
    "input_dirs",
    "metric_keys",
    "issue_types",
    "issue_statuses",
    "fail_on_severities",
    "warn_on_severities",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "fetch",
    "fetch_issues",
    "fetch_hotspots",
    "fetch_measures",
    "fetch_quality_gate",
    "include_resolved",
    "include_dismissed",
    "include_hotspots",
    "include_measures",
    "fail_if_quality_gate_failed",
    "fail_if_issues",
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
    "max_total_issues",
    "max_security_hotspots",
    "max_vulnerabilities",
    "max_issue_rows",
    "timeout_seconds",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  const floatKeys = ["min_coverage", "max_duplication"];

  for (const key of floatKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeFloat(config[key], merged[key]);
    }
  }

  merged.sonar_url = normalizeUrl(merged.sonar_url).replace(/\/+$/g, "");
  merged.report_files = [
    ...new Set(merged.report_files.map(toPosixPath).filter(Boolean)),
  ];
  merged.input_dirs = [
    ...new Set(merged.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  merged.metric_keys = [
    ...new Set(merged.metric_keys.map(normalizeString).filter(Boolean)),
  ];
  merged.issue_types = [
    ...new Set(
      merged.issue_types
        .map((item) => normalizeIssueType(item, ""))
        .filter(Boolean),
    ),
  ];
  merged.issue_statuses = [
    ...new Set(
      merged.issue_statuses
        .map((item) => normalizeIssueStatus(item, ""))
        .filter(Boolean),
    ),
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
  merged.max_issue_rows = Math.max(1, merged.max_issue_rows);
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

function looksLikeSonarReport(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  if (![".json", ".jsonc"].includes(extension)) return false;

  return (
    basename.includes("sonar") ||
    basename.includes("sonarqube") ||
    basename.includes("sonarcloud") ||
    basename.includes("quality-gate") ||
    basename.includes("quality_gate") ||
    basename.includes("hotspot") ||
    basename.includes("measure") ||
    basename.includes("issues")
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
    .filter(looksLikeSonarReport);

  return [...new Set([...explicit, ...discovered])].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right)),
  );
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const client = parsed.protocol === "http:" ? http : https;

  const headers = {
    Accept: "application/json",
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-summarize-sonarqube-script`,
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Basic ${Buffer.from(`${options.token}:`).toString("base64")}`;
  }

  const requestOptions = {
    method: "GET",
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: (options.timeout_seconds || 60) * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
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

        if (!ok) {
          const message =
            typeof parsedBody === "object" && parsedBody?.errors?.[0]?.msg
              ? parsedBody.errors[0].msg
              : typeof parsedBody === "object" && parsedBody?.message
                ? parsedBody.message
                : responseText || `HTTP ${statusCode}`;

          const error = new Error(`Sonar API request failed: ${message}`);
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
    req.end();
  });
}

function sonarApiUrl(args, endpoint, params = {}) {
  const url = new URL(`${args.sonar_url}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  if (args.organization && !url.searchParams.has("organization")) {
    url.searchParams.set("organization", args.organization);
  }

  return url.toString();
}

function sonarBranchParams(args) {
  if (args.pull_request) {
    return {
      pullRequest: args.pull_request,
    };
  }

  if (args.branch) {
    return {
      branch: args.branch,
    };
  }

  return {};
}

async function fetchSonarIssues(args) {
  const issues = [];
  let page = 1;

  while (page <= 20) {
    const response = await requestJson(
      sonarApiUrl(args, "/api/issues/search", {
        componentKeys: args.project_key,
        statuses: args.include_resolved ? "" : "OPEN,CONFIRMED,REOPENED",
        resolved: args.include_resolved ? "" : "false",
        types: args.issue_types.length
          ? args.issue_types
              .map((item) => item.toUpperCase().replace(/-/g, "_"))
              .join(",")
          : "",
        ps: 500,
        p: page,
        ...sonarBranchParams(args),
      }),
      {
        token: args.sonar_token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = response.body || {};
    const pageIssues = Array.isArray(body.issues) ? body.issues : [];

    issues.push(...pageIssues);

    const total = normalizeInteger(body.total, pageIssues.length);
    const pageSize = normalizeInteger(body.ps, 500);

    if (!pageIssues.length || page * pageSize >= total) break;

    page += 1;
  }

  return {
    issues,
    source: "sonar-api",
  };
}

async function fetchSonarHotspots(args) {
  const hotspots = [];
  let page = 1;

  while (page <= 20) {
    const response = await requestJson(
      sonarApiUrl(args, "/api/hotspots/search", {
        projectKey: args.project_key,
        status: args.include_resolved ? "" : "TO_REVIEW",
        ps: 500,
        p: page,
        ...sonarBranchParams(args),
      }),
      {
        token: args.sonar_token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = response.body || {};
    const pageHotspots = Array.isArray(body.hotspots) ? body.hotspots : [];

    hotspots.push(...pageHotspots);

    const paging = body.paging || {};
    const total = normalizeInteger(
      paging.total || body.total,
      pageHotspots.length,
    );
    const pageSize = normalizeInteger(paging.pageSize || body.ps, 500);

    if (!pageHotspots.length || page * pageSize >= total) break;

    page += 1;
  }

  return {
    hotspots,
    source: "sonar-api",
  };
}

async function fetchSonarMeasures(args) {
  const response = await requestJson(
    sonarApiUrl(args, "/api/measures/component", {
      component: args.project_key,
      metricKeys: args.metric_keys.join(","),
      ...sonarBranchParams(args),
    }),
    {
      token: args.sonar_token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return {
    measures: response.body,
    source: "sonar-api",
  };
}

async function fetchSonarQualityGate(args) {
  const response = await requestJson(
    sonarApiUrl(args, "/api/qualitygates/project_status", {
      projectKey: args.project_key,
      ...sonarBranchParams(args),
    }),
    {
      token: args.sonar_token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return {
    quality_gate: response.body,
    source: "sonar-api",
  };
}

function issueFingerprint(parts) {
  const stable = parts
    .map((item) => normalizeString(item).toLowerCase())
    .join("|");

  return require("node:crypto")
    .createHash("sha256")
    .update(stable)
    .digest("hex")
    .slice(0, 24);
}

function normalizeSonarIssue(raw, context = {}) {
  const issue = raw && typeof raw === "object" ? raw : {};
  const impacts = Array.isArray(issue.impacts) ? issue.impacts : [];

  const type = normalizeIssueType(
    issue.type ||
      impacts[0]?.softwareQuality ||
      issue.cleanCodeAttributeCategory ||
      context.type ||
      "unknown",
  );

  const severity = normalizeSonarSeverity(
    issue.severity || issue.impactSeverity || issue.prioritizedRule,
    impacts,
  );

  const component = normalizeString(
    issue.component || issue.project || context.project_key,
  );
  const file = toPosixPath(
    issue.path ||
      issue.file ||
      issue.component?.replace(`${context.project_key}:`, "") ||
      issue.component ||
      "",
  );

  const line = normalizeInteger(
    issue.line ||
      issue.textRange?.startLine ||
      issue.flows?.[0]?.locations?.[0]?.textRange?.startLine,
    0,
  );
  const status = normalizeIssueStatus(
    issue.status || issue.resolution || context.status || "open",
  );
  const rule = normalizeString(
    issue.rule || issue.ruleKey || issue.key || issue.message || "",
  );
  const key = normalizeString(issue.key || issue.id || "");

  return {
    source: context.source || "sonar-report",
    source_file: context.source_file || "",
    fingerprint:
      key ||
      issueFingerprint([
        context.project_key,
        rule,
        type,
        severity,
        file,
        line,
        issue.message,
      ]),
    key,
    rule,
    type,
    severity,
    status,
    clean_code_attribute: normalizeCleanCodeAttribute(issue.cleanCodeAttribute),
    clean_code_attribute_category: normalizeCleanCodeAttribute(
      issue.cleanCodeAttributeCategory,
    ),
    software_quality: normalizeString(
      impacts[0]?.softwareQuality || "",
    ).toLowerCase(),
    message: normalizeString(
      issue.message || issue.name || issue.title || "Sonar issue",
    ),
    component,
    project: normalizeString(issue.project || context.project_key),
    file,
    line,
    start_line: normalizeInteger(issue.textRange?.startLine, line),
    end_line: normalizeInteger(issue.textRange?.endLine, line),
    start_offset: normalizeInteger(issue.textRange?.startOffset, 0),
    end_offset: normalizeInteger(issue.textRange?.endOffset, 0),
    effort: normalizeString(issue.effort || issue.debt || ""),
    author: normalizeString(issue.author || ""),
    creation_date: normalizeString(
      issue.creationDate || issue.creation_date || "",
    ),
    update_date: normalizeString(issue.updateDate || issue.update_date || ""),
    tags: normalizeStringList(issue.tags || []),
    url: normalizeUrl(issue.url || ""),
  };
}

function normalizeSonarHotspot(raw, context = {}) {
  const hotspot = raw && typeof raw === "object" ? raw : {};
  const file = toPosixPath(
    hotspot.path ||
      hotspot.file ||
      hotspot.component?.replace(`${context.project_key}:`, "") ||
      hotspot.component ||
      "",
  );

  const line = normalizeInteger(
    hotspot.line || hotspot.textRange?.startLine,
    0,
  );
  const status = normalizeIssueStatus(
    hotspot.status || hotspot.resolution || "open",
  );
  const severity = normalizeSonarSeverity(
    hotspot.vulnerabilityProbability || hotspot.severity || "medium",
  );

  return {
    source: context.source || "sonar-report",
    source_file: context.source_file || "",
    fingerprint:
      normalizeString(hotspot.key || hotspot.id) ||
      issueFingerprint([
        context.project_key,
        hotspot.ruleKey || hotspot.securityCategory,
        file,
        line,
        hotspot.message,
      ]),
    key: normalizeString(hotspot.key || hotspot.id || ""),
    rule: normalizeString(hotspot.ruleKey || hotspot.rule || ""),
    type: "security-hotspot",
    severity,
    status,
    security_category: normalizeString(
      hotspot.securityCategory || hotspot.security_category || "",
    ),
    vulnerability_probability: normalizeString(
      hotspot.vulnerabilityProbability || "",
    ),
    message: normalizeString(
      hotspot.message ||
        hotspot.name ||
        hotspot.title ||
        "Sonar security hotspot",
    ),
    component: normalizeString(hotspot.component || context.project_key),
    project: normalizeString(hotspot.project || context.project_key),
    file,
    line,
    start_line: normalizeInteger(hotspot.textRange?.startLine, line),
    end_line: normalizeInteger(hotspot.textRange?.endLine, line),
    start_offset: normalizeInteger(hotspot.textRange?.startOffset, 0),
    end_offset: normalizeInteger(hotspot.textRange?.endOffset, 0),
    creation_date: normalizeString(
      hotspot.creationDate || hotspot.creation_date || "",
    ),
    update_date: normalizeString(
      hotspot.updateDate || hotspot.update_date || "",
    ),
    tags: normalizeStringList(hotspot.tags || []),
    url: normalizeUrl(hotspot.url || ""),
  };
}

function normalizeMeasure(raw) {
  const measure = raw && typeof raw === "object" ? raw : {};

  return {
    metric: normalizeString(measure.metric || measure.key || measure.name),
    value: normalizeString(measure.value ?? measure.period?.value ?? ""),
    best_value:
      measure.bestValue === undefined ? null : Boolean(measure.bestValue),
    periods: Array.isArray(measure.periods) ? measure.periods : [],
  };
}

function normalizeQualityGate(raw, context = {}) {
  const projectStatus =
    raw?.projectStatus ||
    raw?.quality_gate?.projectStatus ||
    raw?.qualityGate ||
    raw ||
    {};
  const status = normalizeStatus(
    projectStatus.status || projectStatus.alertStatus || projectStatus.value,
    "unknown",
  );

  return {
    source: context.source || "sonar-report",
    source_file: context.source_file || "",
    status,
    raw_status: normalizeString(
      projectStatus.status ||
        projectStatus.alertStatus ||
        projectStatus.value ||
        "",
    ),
    conditions: (projectStatus.conditions || []).map((condition) => ({
      metric_key: normalizeString(condition.metricKey || condition.metric),
      comparator: normalizeString(condition.comparator || condition.op),
      error_threshold: normalizeString(
        condition.errorThreshold || condition.threshold,
      ),
      actual_value: normalizeString(condition.actualValue || condition.value),
      status: normalizeStatus(condition.status || "unknown", "unknown"),
    })),
    ignored_conditions: Boolean(projectStatus.ignoredConditions),
  };
}

function parseSonarData(data, context) {
  const issues = [];
  const hotspots = [];
  const measures = [];
  const qualityGates = [];

  if (!data || typeof data !== "object") {
    return {
      issues,
      hotspots,
      measures,
      quality_gates: qualityGates,
    };
  }

  if (Array.isArray(data.issues)) {
    issues.push(
      ...data.issues.map((item) => normalizeSonarIssue(item, context)),
    );
  }

  if (Array.isArray(data.hotspots)) {
    hotspots.push(
      ...data.hotspots.map((item) => normalizeSonarHotspot(item, context)),
    );
  }

  if (Array.isArray(data.security_hotspots)) {
    hotspots.push(
      ...data.security_hotspots.map((item) =>
        normalizeSonarHotspot(item, context),
      ),
    );
  }

  if (Array.isArray(data.results)) {
    issues.push(
      ...data.results.map((item) => normalizeSonarIssue(item, context)),
    );
  }

  if (Array.isArray(data.findings)) {
    issues.push(
      ...data.findings.map((item) => normalizeSonarIssue(item, context)),
    );
  }

  if (data.component?.measures && Array.isArray(data.component.measures)) {
    measures.push(...data.component.measures.map(normalizeMeasure));
  }

  if (Array.isArray(data.measures)) {
    measures.push(...data.measures.map(normalizeMeasure));
  }

  if (
    data.projectStatus ||
    data.quality_gate ||
    data.qualityGate ||
    data.status
  ) {
    qualityGates.push(normalizeQualityGate(data, context));
  }

  return {
    issues,
    hotspots,
    measures,
    quality_gates: qualityGates,
  };
}

function dedupeByFingerprint(items) {
  const map = new Map();

  for (const item of items) {
    const key =
      item.fingerprint ||
      issueFingerprint([item.rule, item.file, item.line, item.message]);

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function dedupeMeasures(measures) {
  const map = new Map();

  for (const measure of measures) {
    if (!measure.metric) continue;
    map.set(measure.metric, measure);
  }

  return [...map.values()];
}

function loadSonarReports(args, repoRoot) {
  const errors = [];
  const warnings = [];
  const issues = [];
  const hotspots = [];
  const measures = [];
  const qualityGates = [];
  const reportFiles = discoverReportFiles(args, repoRoot);

  for (const filePath of reportFiles) {
    const sourceFile = toRelativePath(filePath, repoRoot);
    const data = readDataFile(filePath, repoRoot);

    if (!data) {
      const message = `Invalid SonarQube/SonarCloud report file: ${sourceFile}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }

      continue;
    }

    const parsed = parseSonarData(data, {
      source: "file",
      source_file: sourceFile,
      project_key: args.project_key,
    });

    issues.push(...parsed.issues);
    hotspots.push(...parsed.hotspots);
    measures.push(...parsed.measures);
    qualityGates.push(...parsed.quality_gates);
  }

  return {
    report_files: reportFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    issues,
    hotspots,
    measures,
    quality_gates: qualityGates,
    errors,
    warnings,
  };
}

async function loadSonarApi(args) {
  const errors = [];
  const warnings = [];
  const issues = [];
  const hotspots = [];
  const measures = [];
  const qualityGates = [];

  if (!args.fetch) {
    return {
      issues,
      hotspots,
      measures,
      quality_gates: qualityGates,
      errors,
      warnings,
      fetched: false,
    };
  }

  if (!args.project_key) {
    errors.push("Sonar project key is required when --fetch is enabled.");
    return {
      issues,
      hotspots,
      measures,
      quality_gates: qualityGates,
      errors,
      warnings,
      fetched: true,
    };
  }

  if (!args.sonar_token) {
    warnings.push(
      "Sonar token is missing. Public SonarCloud projects may still work; private projects will fail.",
    );
  }

  if (args.fetch_issues) {
    try {
      const result = await fetchSonarIssues(args);
      issues.push(
        ...result.issues.map((item) =>
          normalizeSonarIssue(item, {
            source: "sonar-api",
            project_key: args.project_key,
          }),
        ),
      );
    } catch (err) {
      const message = `Unable to fetch Sonar issues: ${logger.formatError(err)}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  if (args.fetch_hotspots && args.include_hotspots) {
    try {
      const result = await fetchSonarHotspots(args);
      hotspots.push(
        ...result.hotspots.map((item) =>
          normalizeSonarHotspot(item, {
            source: "sonar-api",
            project_key: args.project_key,
          }),
        ),
      );
    } catch (err) {
      const message = `Unable to fetch Sonar security hotspots: ${logger.formatError(err)}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  if (args.fetch_measures && args.include_measures) {
    try {
      const result = await fetchSonarMeasures(args);
      const parsed = parseSonarData(result.measures, {
        source: "sonar-api",
        project_key: args.project_key,
      });

      measures.push(...parsed.measures);
    } catch (err) {
      const message = `Unable to fetch Sonar measures: ${logger.formatError(err)}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  if (args.fetch_quality_gate) {
    try {
      const result = await fetchSonarQualityGate(args);
      qualityGates.push(
        normalizeQualityGate(result.quality_gate, {
          source: "sonar-api",
          project_key: args.project_key,
        }),
      );
    } catch (err) {
      const message = `Unable to fetch Sonar quality gate: ${logger.formatError(err)}`;

      if (args.fail_on_invalid_input) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  return {
    issues,
    hotspots,
    measures,
    quality_gates: qualityGates,
    errors,
    warnings,
    fetched: true,
  };
}

function shouldIncludeIssue(args, issue) {
  if (severityRank(issue.severity) < severityRank(args.min_report_severity))
    return false;
  if (!args.include_resolved && issue.status === "resolved") return false;
  if (!args.include_dismissed && issue.status === "dismissed") return false;
  if (args.issue_types.length && !args.issue_types.includes(issue.type))
    return false;
  if (args.issue_statuses.length && !args.issue_statuses.includes(issue.status))
    return false;

  return true;
}

function getMeasureValue(measures, metric) {
  const measure = measures.find((item) => item.metric === metric);

  if (!measure) return null;

  const parsed = Number.parseFloat(measure.value);

  return Number.isFinite(parsed) ? parsed : null;
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
    message: `Found ${count} ${name} Sonar issue(s); maximum allowed is ${maxAllowed}.`,
  };
}

function analyzeSonar(args, loadResult) {
  const allIssues = [
    ...loadResult.issues,
    ...(args.include_hotspots ? loadResult.hotspots : []),
  ];

  const issues = dedupeByFingerprint(allIssues).filter((issue) =>
    shouldIncludeIssue(args, issue),
  );
  const activeIssues = issues.filter((issue) => issue.status === "open");

  const measures = dedupeMeasures(loadResult.measures);
  const qualityGate =
    loadResult.quality_gates[loadResult.quality_gates.length - 1] || null;
  const qualityGateFailed = Boolean(
    qualityGate && qualityGate.status === "failed",
  );

  const severityCounts = {
    critical: activeIssues.filter((item) => item.severity === "critical")
      .length,
    high: activeIssues.filter((item) => item.severity === "high").length,
    medium: activeIssues.filter((item) => item.severity === "medium").length,
    low: activeIssues.filter((item) => item.severity === "low").length,
    info: activeIssues.filter((item) => item.severity === "info").length,
    unknown: activeIssues.filter((item) => item.severity === "unknown").length,
  };

  const typeCounts = countBy(activeIssues, (issue) => issue.type);
  const fileCounts = countBy(
    activeIssues.filter((issue) => issue.file),
    (issue) => issue.file,
  );
  const ruleCounts = countBy(
    activeIssues.filter((issue) => issue.rule),
    (issue) => issue.rule,
  );

  const failingIssues = activeIssues.filter((item) =>
    args.fail_on_severities.includes(item.severity),
  );

  const warningIssues = activeIssues.filter((item) =>
    args.warn_on_severities.includes(item.severity),
  );

  const vulnerabilityCount = activeIssues.filter(
    (item) => item.type === "vulnerability",
  ).length;
  const hotspotCount = activeIssues.filter(
    (item) => item.type === "security-hotspot",
  ).length;

  const coverage = getMeasureValue(measures, "coverage");
  const duplication = getMeasureValue(measures, "duplicated_lines_density");

  const thresholdViolations = [
    limitViolation("total active", activeIssues.length, args.max_total_issues),
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("info", severityCounts.info, args.max_info),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
    limitViolation(
      "vulnerability",
      vulnerabilityCount,
      args.max_vulnerabilities,
    ),
    limitViolation(
      "security hotspot",
      hotspotCount,
      args.max_security_hotspots,
    ),
  ].filter(Boolean);

  if (
    args.min_coverage >= 0 &&
    coverage !== null &&
    coverage < args.min_coverage
  ) {
    thresholdViolations.push({
      name: "coverage",
      count: coverage,
      max_allowed: args.min_coverage,
      message: `Coverage is ${coverage}%; minimum required is ${args.min_coverage}%.`,
    });
  }

  if (
    args.max_duplication >= 0 &&
    duplication !== null &&
    duplication > args.max_duplication
  ) {
    thresholdViolations.push({
      name: "duplication",
      count: duplication,
      max_allowed: args.max_duplication,
      message: `Duplicated lines density is ${duplication}%; maximum allowed is ${args.max_duplication}%.`,
    });
  }

  const errors = [...loadResult.errors];
  const warnings = [...loadResult.warnings];

  if (
    args.require_results &&
    !loadResult.report_files.length &&
    !loadResult.fetched
  ) {
    errors.push(
      "No SonarQube/SonarCloud report files or API results were found.",
    );
  }

  if (args.fail_if_quality_gate_failed && qualityGateFailed) {
    errors.push("Sonar quality gate failed.");
  }

  if (args.fail_if_issues && activeIssues.length) {
    errors.push(`Sonar found ${activeIssues.length} active issue(s).`);
  }

  if (args.fail_on_threshold) {
    errors.push(...thresholdViolations.map((violation) => violation.message));
  } else {
    warnings.push(...thresholdViolations.map((violation) => violation.message));
  }

  errors.push(
    ...failingIssues.map(
      (item) =>
        `${item.fingerprint}: ${item.message || item.rule || "Sonar issue"} (${item.severity})`,
    ),
  );

  warnings.push(
    ...warningIssues.map(
      (item) =>
        `${item.fingerprint}: ${item.message || item.rule || "Sonar issue"} (${item.severity})`,
    ),
  );

  const ok = errors.length === 0;

  return {
    issues,
    active_issues: activeIssues,
    failing_issues: failingIssues,
    warning_issues: warningIssues,
    measures,
    quality_gate: qualityGate,
    quality_gate_failed: qualityGateFailed,
    severity_counts: severityCounts,
    type_counts: typeCounts,
    file_counts: fileCounts,
    rule_counts: ruleCounts,
    coverage,
    duplication,
    vulnerability_count: vulnerabilityCount,
    hotspot_count: hotspotCount,
    threshold_violations: thresholdViolations,
    errors,
    warnings,
    status: ok
      ? warnings.length || warningIssues.length
        ? "warning"
        : "passed"
      : "failed",
    ok,
  };
}

async function loadSonarData(args, repoRoot) {
  const fileLoad = loadSonarReports(args, repoRoot);
  const apiLoad = await loadSonarApi(args);

  return {
    report_files: fileLoad.report_files,
    fetched: apiLoad.fetched,
    issues: [...fileLoad.issues, ...apiLoad.issues],
    hotspots: [...fileLoad.hotspots, ...apiLoad.hotspots],
    measures: [...fileLoad.measures, ...apiLoad.measures],
    quality_gates: [...fileLoad.quality_gates, ...apiLoad.quality_gates],
    errors: [...fileLoad.errors, ...apiLoad.errors],
    warnings: [...fileLoad.warnings, ...apiLoad.warnings],
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
    type: "security-summarize-sonarqube",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: endedAt.toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      sonar_url: args.sonar_url,
      organization: args.organization,
      project_key: args.project_key,
      branch: args.branch,
      pull_request: args.pull_request,
      report_files: loadResult.report_files,
      input_dirs: args.input_dirs,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      metric_keys: args.metric_keys,
      issue_types: args.issue_types,
      issue_statuses: args.issue_statuses,
      fetch: args.fetch,
      fetch_issues: args.fetch_issues,
      fetch_hotspots: args.fetch_hotspots,
      fetch_measures: args.fetch_measures,
      fetch_quality_gate: args.fetch_quality_gate,
      include_resolved: args.include_resolved,
      include_dismissed: args.include_dismissed,
      include_hotspots: args.include_hotspots,
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
      max_total_issues: args.max_total_issues,
      max_security_hotspots: args.max_security_hotspots,
      max_vulnerabilities: args.max_vulnerabilities,
      min_coverage: args.min_coverage,
      max_duplication: args.max_duplication,
      fail_if_quality_gate_failed: args.fail_if_quality_gate_failed,
      fail_if_issues: args.fail_if_issues,
      fail_on_threshold: args.fail_on_threshold,
      require_results: args.require_results,
      dry_run: args.dry_run,
      max_issue_rows: args.max_issue_rows,
    },
    sonarqube: {
      quality_gate: analysis.quality_gate,
      measures: analysis.measures,
      issues: analysis.issues,
      active_issues: analysis.active_issues,
      failing_issues: analysis.failing_issues,
      warning_issues: analysis.warning_issues,
    },
    analysis: {
      severity_counts: analysis.severity_counts,
      type_counts: analysis.type_counts,
      file_counts: analysis.file_counts,
      rule_counts: analysis.rule_counts,
      quality_gate_failed: analysis.quality_gate_failed,
      coverage: analysis.coverage,
      duplication: analysis.duplication,
      vulnerability_count: analysis.vulnerability_count,
      hotspot_count: analysis.hotspot_count,
      threshold_violations: analysis.threshold_violations,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
    },
    totals: {
      report_files: loadResult.report_files.length,
      fetched: loadResult.fetched,
      issues: analysis.issues.length,
      active_issues: analysis.active_issues.length,
      failing_issues: analysis.failing_issues.length,
      warning_issues: analysis.warning_issues.length,
      vulnerabilities: analysis.vulnerability_count,
      security_hotspots: analysis.hotspot_count,
      critical: analysis.severity_counts.critical,
      high: analysis.severity_counts.high,
      medium: analysis.severity_counts.medium,
      low: analysis.severity_counts.low,
      info: analysis.severity_counts.info,
      unknown: analysis.severity_counts.unknown,
      measures: analysis.measures.length,
      quality_gate_failed: analysis.quality_gate_failed,
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function sortedIssues(issues) {
  return [...issues].sort((left, right) => {
    const severityDiff =
      severityRank(right.severity) - severityRank(left.severity);

    if (severityDiff !== 0) return severityDiff;

    const typeDiff = (left.type || "").localeCompare(right.type || "");

    if (typeDiff !== 0) return typeDiff;

    const fileDiff = (left.file || "").localeCompare(right.file || "");

    if (fileDiff !== 0) return fileDiff;

    return (left.line || 0) - (right.line || 0);
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

  const qualityGateStatus = report.sonarqube.quality_gate?.status || "unknown";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} SonarQube Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Quality gate: \`${qualityGateStatus}\``,
    `- Report files: \`${report.totals.report_files}\``,
    `- Fetched from API: \`${report.totals.fetched ? "true" : "false"}\``,
    `- Issues: \`${report.totals.issues}\``,
    `- Active issues: \`${report.totals.active_issues}\``,
    `- Failing issues: \`${report.totals.failing_issues}\``,
    `- Warning issues: \`${report.totals.warning_issues}\``,
    `- Vulnerabilities: \`${report.totals.vulnerabilities}\``,
    `- Security hotspots: \`${report.totals.security_hotspots}\``,
    `- Coverage: \`${report.analysis.coverage === null ? "unknown" : `${report.analysis.coverage}%`}\``,
    `- Duplication: \`${report.analysis.duplication === null ? "unknown" : `${report.analysis.duplication}%`}\``,
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

  if (report.sonarqube.quality_gate?.conditions?.length) {
    lines.push("## 🚪 Quality Gate Conditions");
    lines.push("");
    lines.push("| Status | Metric | Actual | Comparator | Threshold |");
    lines.push("|---|---|---:|---|---:|");

    for (const condition of report.sonarqube.quality_gate.conditions) {
      lines.push(
        `| \`${escapeMarkdown(condition.status)}\` | \`${escapeMarkdown(condition.metric_key)}\` | \`${escapeMarkdown(condition.actual_value)}\` | \`${escapeMarkdown(condition.comparator)}\` | \`${escapeMarkdown(condition.error_threshold)}\` |`,
      );
    }

    lines.push("");
  }

  if (report.sonarqube.measures.length) {
    lines.push("## 📈 Measures");
    lines.push("");
    lines.push("| Metric | Value | Best Value |");
    lines.push("|---|---:|---|");

    for (const measure of report.sonarqube.measures) {
      lines.push(
        `| \`${escapeMarkdown(measure.metric)}\` | \`${escapeMarkdown(measure.value)}\` | \`${measure.best_value === null ? "n/a" : measure.best_value ? "true" : "false"}\` |`,
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

  if (report.sonarqube.active_issues.length) {
    lines.push("## 🔐 Active Sonar Issues");
    lines.push("");
    lines.push("| Severity | Type | Rule | Message | File | Line | Status |");
    lines.push("|---|---|---|---|---|---:|---|");

    for (const issue of sortedIssues(report.sonarqube.active_issues).slice(
      0,
      report.config.max_issue_rows || 100,
    )) {
      lines.push(
        `| \`${escapeMarkdown(issue.severity)}\` | \`${escapeMarkdown(issue.type)}\` | \`${escapeMarkdown(issue.rule || "unknown")}\` | ${escapeMarkdown(issue.message || "none")} | \`${escapeMarkdown(issue.file || "unknown")}\` | \`${issue.line || "n/a"}\` | \`${escapeMarkdown(issue.status)}\` |`,
      );
    }

    if (
      report.sonarqube.active_issues.length >
      (report.config.max_issue_rows || 100)
    ) {
      lines.push(
        `| … | … | … | … | … | … | \`${report.sonarqube.active_issues.length - (report.config.max_issue_rows || 100)}\` more issue(s) omitted |`,
      );
    }

    lines.push("");
  }

  const topFiles = topEntries(report.analysis.file_counts, 20);

  if (topFiles.length) {
    lines.push("## 📁 Most Affected Files");
    lines.push("");
    lines.push("| File | Issues |");
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
    lines.push("| Rule | Issues |");
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
  lines.push(
    `- Sonar URL: \`${escapeMarkdown(report.config.sonar_url || "none")}\``,
  );
  lines.push(
    `- Organization: \`${escapeMarkdown(report.config.organization || "none")}\``,
  );
  lines.push(
    `- Project key: \`${escapeMarkdown(report.config.project_key || "none")}\``,
  );
  lines.push(`- Branch: \`${escapeMarkdown(report.config.branch || "none")}\``);
  lines.push(
    `- Pull request: \`${escapeMarkdown(report.config.pull_request || "none")}\``,
  );
  lines.push(`- Fetch enabled: \`${report.config.fetch ? "true" : "false"}\``);
  lines.push(
    `- Include hotspots: \`${report.config.include_hotspots ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if quality gate failed: \`${report.config.fail_if_quality_gate_failed ? "true" : "false"}\``,
  );
  lines.push(
    `- Fail if issues: \`${report.config.fail_if_issues ? "true" : "false"}\``,
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
  setGitHubOutput("sonarqube_summary_file", report.config.output_file);
  setGitHubOutput(
    "sonarqube_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("sonarqube_summary_status", report.status);
  setGitHubOutput("sonarqube_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "sonarqube_quality_gate",
    report.sonarqube.quality_gate?.status || "unknown",
  );
  setGitHubOutput(
    "sonarqube_quality_gate_failed",
    report.totals.quality_gate_failed ? "true" : "false",
  );

  setGitHubOutput("sonarqube_report_files", String(report.totals.report_files));
  setGitHubOutput(
    "sonarqube_fetched",
    report.totals.fetched ? "true" : "false",
  );
  setGitHubOutput("sonarqube_issues", String(report.totals.issues));
  setGitHubOutput(
    "sonarqube_active_issues",
    String(report.totals.active_issues),
  );
  setGitHubOutput(
    "sonarqube_failing_issues",
    String(report.totals.failing_issues),
  );
  setGitHubOutput(
    "sonarqube_warning_issues",
    String(report.totals.warning_issues),
  );
  setGitHubOutput(
    "sonarqube_vulnerabilities",
    String(report.totals.vulnerabilities),
  );
  setGitHubOutput(
    "sonarqube_security_hotspots",
    String(report.totals.security_hotspots),
  );

  setGitHubOutput("sonarqube_critical", String(report.totals.critical));
  setGitHubOutput("sonarqube_high", String(report.totals.high));
  setGitHubOutput("sonarqube_medium", String(report.totals.medium));
  setGitHubOutput("sonarqube_low", String(report.totals.low));
  setGitHubOutput("sonarqube_info", String(report.totals.info));
  setGitHubOutput("sonarqube_unknown", String(report.totals.unknown));

  setGitHubOutput(
    "sonarqube_coverage",
    report.analysis.coverage === null ? "" : String(report.analysis.coverage),
  );
  setGitHubOutput(
    "sonarqube_duplication",
    report.analysis.duplication === null
      ? ""
      : String(report.analysis.duplication),
  );

  setGitHubOutput("sonarqube_errors", String(report.totals.errors));
  setGitHubOutput("sonarqube_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "sonarqube_active_issues_json",
    JSON.stringify(report.sonarqube.active_issues),
  );
  setGitHubOutput(
    "sonarqube_failing_issues_json",
    JSON.stringify(report.sonarqube.failing_issues),
  );
  setGitHubOutput(
    "sonarqube_warning_issues_json",
    JSON.stringify(report.sonarqube.warning_issues),
  );
  setGitHubOutput("sonarqube_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("sonarqube_warnings_json", JSON.stringify(report.warnings));
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

  logger.info("Summarizing SonarQube/SonarCloud results.");

  const loadResult = await loadSonarData(args, repoRoot);
  const analysis = analyzeSonar(args, loadResult);
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
