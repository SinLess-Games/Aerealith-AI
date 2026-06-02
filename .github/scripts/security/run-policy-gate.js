#!/usr/bin/env node
// .github/scripts/security/run-policy-gate.js
// =============================================================================
// Aerealith AI — Security Policy Gate
// -----------------------------------------------------------------------------
// Purpose:
//   Evaluate security findings, alert metadata, SARIF-like reports, dependency
//   audit output, changed files, labels, and configurable policy rules. Produces
//   a pass/fail gate report for CI and release workflows.
//
// Input:
//   - GitHub event payload
//   - Optional findings JSON/JSONC/YAML file
//   - Direct CLI/env finding fields
//   - Optional policy config
//   - .github/security/run-policy-gate.json
//   - .github/security/run-policy-gate.jsonc
//   - .github/security/run-policy-gate.yaml
//   - .github/security/run-policy-gate.yml
//
// Output:
//   - artifacts/security/run-policy-gate.json
//   - artifacts/security/run-policy-gate.md
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
    info: (message) => console.log(`[security-policy-gate] ${message}`),
    warn: (message) => console.warn(`[security-policy-gate] WARN: ${message}`),
    error: (message) =>
      console.error(`[security-policy-gate] ERROR: ${message}`),
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
  ".github/security/run-policy-gate.json",
  ".github/security/run-policy-gate.jsonc",
  ".github/security/run-policy-gate.yaml",
  ".github/security/run-policy-gate.yml",
  ".github/security/security-policy-gate.json",
  ".github/security/security-policy-gate.jsonc",
  ".github/security/security-policy-gate.yaml",
  ".github/security/security-policy-gate.yml",
  ".github/repo/run-policy-gate.json",
  ".github/repo/run-policy-gate.jsonc",
  ".github/repo/run-policy-gate.yaml",
  ".github/repo/run-policy-gate.yml",
  ".github/run-policy-gate.json",
  ".github/run-policy-gate.jsonc",
  ".github/run-policy-gate.yaml",
  ".github/run-policy-gate.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/security/run-policy-gate.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/run-policy-gate.md";

const DEFAULT_FAIL_SEVERITIES = ["critical", "high"];
const DEFAULT_WARN_SEVERITIES = ["medium", "low"];
const DEFAULT_SEVERITY_ORDER = [
  "unknown",
  "info",
  "low",
  "medium",
  "high",
  "critical",
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

function severityFromCvss(value) {
  const cvss = normalizeFloat(value, 0);

  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "medium";
  if (cvss > 0) return "low";

  return "unknown";
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

    config_file: process.env.SECURITY_POLICY_GATE_CONFIG_FILE || "",

    event_path:
      process.env.SECURITY_POLICY_GATE_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    findings_file:
      process.env.SECURITY_POLICY_GATE_FINDINGS_FILE ||
      process.env.SECURITY_FINDINGS_FILE ||
      "",

    output_file:
      process.env.SECURITY_POLICY_GATE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.SECURITY_POLICY_GATE_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    title: process.env.SECURITY_POLICY_GATE_TITLE || "",
    body: process.env.SECURITY_POLICY_GATE_BODY || "",
    severity:
      process.env.SECURITY_POLICY_GATE_SEVERITY ||
      process.env.SECURITY_SEVERITY ||
      "",
    cvss:
      process.env.SECURITY_POLICY_GATE_CVSS || process.env.SECURITY_CVSS || "",
    cve: process.env.SECURITY_POLICY_GATE_CVE || process.env.SECURITY_CVE || "",
    cwe: process.env.SECURITY_POLICY_GATE_CWE || process.env.SECURITY_CWE || "",
    package_name:
      process.env.SECURITY_POLICY_GATE_PACKAGE ||
      process.env.SECURITY_PACKAGE ||
      "",
    ecosystem:
      process.env.SECURITY_POLICY_GATE_ECOSYSTEM ||
      process.env.SECURITY_ECOSYSTEM ||
      "",
    alert_type:
      process.env.SECURITY_POLICY_GATE_ALERT_TYPE ||
      process.env.SECURITY_ALERT_TYPE ||
      "",
    advisory_url:
      process.env.SECURITY_POLICY_GATE_ADVISORY_URL ||
      process.env.SECURITY_ADVISORY_URL ||
      "",
    source_url:
      process.env.SECURITY_POLICY_GATE_SOURCE_URL ||
      process.env.SECURITY_SOURCE_URL ||
      "",
    manifest_path:
      process.env.SECURITY_POLICY_GATE_MANIFEST_PATH ||
      process.env.SECURITY_MANIFEST_PATH ||
      "",

    labels: normalizeLabelList(
      process.env.SECURITY_POLICY_GATE_LABELS ||
        process.env.SECURITY_LABELS ||
        process.env.ISSUE_LABELS ||
        process.env.PR_LABELS ||
        "",
    ),

    changed_files: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    fail_on_severities: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_FAIL_ON_SEVERITIES ||
        DEFAULT_FAIL_SEVERITIES.join(","),
    ),

    warn_on_severities: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_WARN_ON_SEVERITIES ||
        DEFAULT_WARN_SEVERITIES.join(","),
    ),

    fail_cvss_at_or_above: normalizeFloat(
      process.env.SECURITY_POLICY_GATE_FAIL_CVSS_AT_OR_ABOVE,
      7,
    ),

    warn_cvss_at_or_above: normalizeFloat(
      process.env.SECURITY_POLICY_GATE_WARN_CVSS_AT_OR_ABOVE,
      4,
    ),

    max_critical: normalizeInteger(
      process.env.SECURITY_POLICY_GATE_MAX_CRITICAL,
      0,
    ),
    max_high: normalizeInteger(process.env.SECURITY_POLICY_GATE_MAX_HIGH, 0),
    max_medium: normalizeInteger(
      process.env.SECURITY_POLICY_GATE_MAX_MEDIUM,
      -1,
    ),
    max_low: normalizeInteger(process.env.SECURITY_POLICY_GATE_MAX_LOW, -1),
    max_info: normalizeInteger(process.env.SECURITY_POLICY_GATE_MAX_INFO, -1),
    max_unknown: normalizeInteger(
      process.env.SECURITY_POLICY_GATE_MAX_UNKNOWN,
      -1,
    ),

    blocked_paths: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_BLOCKED_PATHS || "",
    ),
    sensitive_paths: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_SENSITIVE_PATHS ||
        ".github/**,package.json,pnpm-lock.yaml,**/package.json,**/pnpm-lock.yaml,**/Dockerfile,**/*.sql,**/.env*,**/secrets/**",
    ),
    ignored_paths: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_IGNORED_PATHS || "",
    ),
    ignored_fingerprints: normalizeStringList(
      process.env.SECURITY_POLICY_GATE_IGNORED_FINGERPRINTS || "",
    ),

    require_findings_file: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_REQUIRE_FINDINGS_FILE,
      false,
    ),

    require_security_signal: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_REQUIRE_SECURITY_SIGNAL,
      false,
    ),

    fail_if_no_findings: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_FAIL_IF_NO_FINDINGS,
      false,
    ),

    fail_on_any_secret: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_FAIL_ON_ANY_SECRET,
      true,
    ),

    fail_on_blocked_paths: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_FAIL_ON_BLOCKED_PATHS,
      true,
    ),

    warn_on_sensitive_paths: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_WARN_ON_SENSITIVE_PATHS,
      true,
    ),

    fail_on_invalid_input: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_FAIL_ON_INVALID_INPUT,
      true,
    ),

    fail_on_error: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_FAIL_ON_ERROR,
      true,
    ),

    max_findings: normalizeInteger(
      process.env.SECURITY_POLICY_GATE_MAX_FINDINGS,
      250,
    ),

    dry_run: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),

    print: normalizeBoolean(process.env.SECURITY_POLICY_GATE_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SECURITY_POLICY_GATE_STEP_SUMMARY,
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

    if (arg === "--fail-cvss-at-or-above") {
      args.fail_cvss_at_or_above = normalizeFloat(
        argv[index + 1],
        args.fail_cvss_at_or_above,
      );
      index += 1;
      continue;
    }

    if (arg === "--warn-cvss-at-or-above") {
      args.warn_cvss_at_or_above = normalizeFloat(
        argv[index + 1],
        args.warn_cvss_at_or_above,
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

    if (arg === "--blocked-path" || arg === "--blocked-paths") {
      args.blocked_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--sensitive-path" || arg === "--sensitive-paths") {
      args.sensitive_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignored-path" || arg === "--ignored-paths") {
      args.ignored_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignored-fingerprint" || arg === "--ignored-fingerprints") {
      args.ignored_fingerprints.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--require-findings-file") {
      args.require_findings_file = true;
      continue;
    }

    if (arg === "--no-require-findings-file") {
      args.require_findings_file = false;
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

    if (arg === "--fail-on-any-secret") {
      args.fail_on_any_secret = true;
      continue;
    }

    if (arg === "--no-fail-on-any-secret") {
      args.fail_on_any_secret = false;
      continue;
    }

    if (arg === "--fail-on-blocked-paths") {
      args.fail_on_blocked_paths = true;
      continue;
    }

    if (arg === "--no-fail-on-blocked-paths") {
      args.fail_on_blocked_paths = false;
      continue;
    }

    if (arg === "--warn-on-sensitive-paths") {
      args.warn_on_sensitive_paths = true;
      continue;
    }

    if (arg === "--no-warn-on-sensitive-paths") {
      args.warn_on_sensitive_paths = false;
      continue;
    }

    if (arg === "--max-findings") {
      args.max_findings = normalizeInteger(argv[index + 1], args.max_findings);
      index += 1;
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
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
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
  args.blocked_paths = [
    ...new Set(args.blocked_paths.map(toPosixPath).filter(Boolean)),
  ];
  args.sensitive_paths = [
    ...new Set(args.sensitive_paths.map(toPosixPath).filter(Boolean)),
  ];
  args.ignored_paths = [
    ...new Set(args.ignored_paths.map(toPosixPath).filter(Boolean)),
  ];
  args.ignored_fingerprints = [
    ...new Set(args.ignored_fingerprints.map(normalizeString).filter(Boolean)),
  ];
  args.max_findings = Math.max(1, Math.min(args.max_findings, 1000));

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Security Policy Gate

Usage:
  node .github/scripts/security/run-policy-gate.js [options]

Examples:
  node .github/scripts/security/run-policy-gate.js --findings-file artifacts/security/findings.json
  node .github/scripts/security/run-policy-gate.js --severity critical --title "Hardcoded token"
  node .github/scripts/security/run-policy-gate.js --fail-on-severities "critical,high"
  node .github/scripts/security/run-policy-gate.js --max-high 0 --max-medium 5
  node .github/scripts/security/run-policy-gate.js --dry-run

Config example:
  {
    "fail_on_severities": ["critical", "high"],
    "warn_on_severities": ["medium", "low"],
    "max_allowed_by_severity": {
      "critical": 0,
      "high": 0,
      "medium": 5
    },
    "rules": [
      {
        "name": "Secrets always fail",
        "action": "fail",
        "alert_types": ["secret-scanning"],
        "message": "Secret scanning findings block the gate."
      },
      {
        "name": "Ignore generated reports",
        "action": "ignore",
        "paths": ["artifacts/**"]
      }
    ]
  }

Options:
      --repo <owner/repo>                 Repository slug.
      --config <file>                     Policy config file.
      --event-path <file>                 GitHub event payload path.
      --findings-file <file>              JSON/JSONC/YAML findings file.
      --title <title>                     Direct finding title.
      --body <body>                       Direct finding body.
      --severity <severity>               critical, high, medium, low, info.
      --cvss <score>                      CVSS score.
      --cve <id>                          CVE identifier.
      --cwe <id>                          CWE identifier.
      --package <name>                    Affected package name.
      --ecosystem <name>                  npm, docker, github-actions, etc.
      --alert-type <type>                 dependabot, code-scanning, secret-scanning.
      --advisory-url <url>                Advisory URL.
      --source-url <url>                  Scanner/source URL.
      --manifest-path <path>              Affected manifest path.
      --label <label,list>                Labels to evaluate.
      --changed-file <path,list>          Changed files to evaluate.
      --fail-on-severities <list>         Severities that fail the gate.
      --warn-on-severities <list>         Severities that warn the gate.
      --fail-cvss-at-or-above <score>     CVSS threshold for failure. Default: 7.
      --warn-cvss-at-or-above <score>     CVSS threshold for warnings. Default: 4.
      --max-critical <number>             Max allowed critical findings. Default: 0.
      --max-high <number>                 Max allowed high findings. Default: 0.
      --max-medium <number>               Max allowed medium findings. -1 disables.
      --max-low <number>                  Max allowed low findings. -1 disables.
      --max-info <number>                 Max allowed info findings. -1 disables.
      --max-unknown <number>              Max allowed unknown findings. -1 disables.
      --blocked-path <path,list>          Path pattern(s) that fail when touched.
      --sensitive-path <path,list>        Path pattern(s) that warn when touched.
      --ignored-path <path,list>          Finding path pattern(s) to ignore.
      --ignored-fingerprint <list>        Fingerprints to ignore.
      --require-findings-file             Fail if findings file is missing.
      --require-security-signal           Ignore findings without security signal.
      --fail-if-no-findings               Fail if zero findings are resolved.
      --fail-on-any-secret                Secret findings fail the gate. Default.
      --no-fail-on-any-secret             Do not automatically fail on secrets.
      --fail-on-blocked-paths             Blocked path matches fail. Default.
      --warn-on-sensitive-paths           Sensitive path matches warn. Default.
      --max-findings <number>             Max findings to process. Default: 250.
      --fail-on-error                     Exit non-zero if gate fails. Default.
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
  const rootItems = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let currentItem = null;
  let currentNestedListKey = "";

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      currentItem = null;
      currentNestedListKey = "";
      continue;
    }

    if (
      /^-\s*/.test(trimmed) &&
      currentItem &&
      currentNestedListKey &&
      indent > 0
    ) {
      currentItem[currentNestedListKey].push(
        parseYamlScalar(trimmed.replace(/^-\s*/, "")),
      );
      continue;
    }

    if (
      (section === "rules" ||
        section === "findings" ||
        section === "security_findings") &&
      /^-\s*/.test(trimmed)
    ) {
      currentItem = {};
      config[section].push(currentItem);
      currentNestedListKey = "";

      const rest = trimmed.replace(/^-\s*/, "");

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentItem[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (currentItem && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      const key = trimmed.replace(/:\s*$/, "");
      currentItem[key] = [];
      currentNestedListKey = key;
      continue;
    }

    if (currentItem && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentItem[key] = parseYamlScalar(value);
      currentNestedListKey = "";
      continue;
    }

    if (
      section === "max_allowed_by_severity" &&
      /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)
    ) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config.max_allowed_by_severity = config.max_allowed_by_severity || {};
      config.max_allowed_by_severity[key] = parseYamlScalar(value);
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
      currentNestedListKey = "";
      continue;
    }

    if (!section && /^-\s*/.test(trimmed)) {
      rootItems.push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
    }
  }

  if (rootItems.length) {
    config.findings = rootItems;
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
    id: normalizeString(source.id || source.name || `policy-rule-${index + 1}`),
    name: normalizeString(
      source.name || source.id || `Policy Rule ${index + 1}`,
    ),
    enabled: normalizeBoolean(source.enabled, true),
    action: normalizeString(source.action || "warn").toLowerCase(),
    message: normalizeString(source.message || ""),
    priority: normalizeInteger(source.priority, 0),
    require_all: normalizeBoolean(
      source.require_all || source.requireAll,
      true,
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

    fingerprints: normalizeStringList(
      source.fingerprints || source.fingerprint || [],
    ),

    min_cvss: normalizeFloat(source.min_cvss || source.minCvss, 0),
    max_cvss: normalizeFloat(source.max_cvss || source.maxCvss, 0),
  };
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const listKeys = [
    "fail_on_severities",
    "warn_on_severities",
    "blocked_paths",
    "sensitive_paths",
    "ignored_paths",
    "ignored_fingerprints",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "require_findings_file",
    "require_security_signal",
    "fail_if_no_findings",
    "fail_on_any_secret",
    "fail_on_blocked_paths",
    "warn_on_sensitive_paths",
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
    "max_findings",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  if (config.fail_cvss_at_or_above !== undefined) {
    merged.fail_cvss_at_or_above = normalizeFloat(
      config.fail_cvss_at_or_above,
      merged.fail_cvss_at_or_above,
    );
  }

  if (config.warn_cvss_at_or_above !== undefined) {
    merged.warn_cvss_at_or_above = normalizeFloat(
      config.warn_cvss_at_or_above,
      merged.warn_cvss_at_or_above,
    );
  }

  if (
    config.max_allowed_by_severity &&
    typeof config.max_allowed_by_severity === "object"
  ) {
    if (config.max_allowed_by_severity.critical !== undefined) {
      merged.max_critical = normalizeInteger(
        config.max_allowed_by_severity.critical,
        merged.max_critical,
      );
    }

    if (config.max_allowed_by_severity.high !== undefined) {
      merged.max_high = normalizeInteger(
        config.max_allowed_by_severity.high,
        merged.max_high,
      );
    }

    if (config.max_allowed_by_severity.medium !== undefined) {
      merged.max_medium = normalizeInteger(
        config.max_allowed_by_severity.medium,
        merged.max_medium,
      );
    }

    if (config.max_allowed_by_severity.low !== undefined) {
      merged.max_low = normalizeInteger(
        config.max_allowed_by_severity.low,
        merged.max_low,
      );
    }

    if (config.max_allowed_by_severity.info !== undefined) {
      merged.max_info = normalizeInteger(
        config.max_allowed_by_severity.info,
        merged.max_info,
      );
    }

    if (config.max_allowed_by_severity.unknown !== undefined) {
      merged.max_unknown = normalizeInteger(
        config.max_allowed_by_severity.unknown,
        merged.max_unknown,
      );
    }
  }

  if (config.output_file !== undefined) {
    merged.output_file = normalizeString(
      config.output_file,
      merged.output_file,
    );
  }

  if (config.summary_file !== undefined) {
    merged.summary_file = normalizeString(
      config.summary_file,
      merged.summary_file,
    );
  }

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
  merged.blocked_paths = [
    ...new Set(merged.blocked_paths.map(toPosixPath).filter(Boolean)),
  ];
  merged.sensitive_paths = [
    ...new Set(merged.sensitive_paths.map(toPosixPath).filter(Boolean)),
  ];
  merged.ignored_paths = [
    ...new Set(merged.ignored_paths.map(toPosixPath).filter(Boolean)),
  ];
  merged.ignored_fingerprints = [
    ...new Set(
      merged.ignored_fingerprints.map(normalizeString).filter(Boolean),
    ),
  ];
  merged.max_findings = Math.max(1, Math.min(merged.max_findings, 1000));

  return merged;
}

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : {};

  return {
    rules: (Array.isArray(source.rules) ? source.rules : []).map(normalizeRule),
    inline_findings: Array.isArray(source.findings)
      ? source.findings
      : Array.isArray(source.security_findings)
        ? source.security_findings
        : [],
  };
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
    cvss:
      advisory.cvss?.score ||
      advisory.cvss_score ||
      rule.properties?.securitySeverity ||
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
      const cvss = rule.properties?.securitySeverity || "";

      findings.push({
        title:
          result.message?.text ||
          rule.shortDescription?.text ||
          rule.fullDescription?.text ||
          result.ruleId ||
          "Code scanning finding",
        body: rule.fullDescription?.text || result.message?.text || "",
        severity: cvss
          ? severityFromCvss(cvss)
          : result.level === "error"
            ? "high"
            : result.level === "warning"
              ? "medium"
              : result.level === "note"
                ? "info"
                : "",
        cvss,
        cwe: Array.isArray(rule.properties?.tags)
          ? rule.properties.tags
              .filter((tag) => /^cwe-\d+/i.test(tag))
              .join(", ")
          : "",
        alert_type: "code-scanning",
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

function parseFindingsData(data) {
  if (!data) return [];

  if (Array.isArray(data?.runs)) {
    return extractFindingsFromSarif(data);
  }

  const auditFindings = extractFindingsFromAudit(data);

  if (auditFindings.length) return auditFindings;

  return extractFindingsFromGeneric(data);
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

  const body = normalizeString(
    source.body ||
      source.description ||
      source.details ||
      source.overview ||
      source.help ||
      args.body ||
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

function isSecretFinding(finding) {
  const text = [
    finding.title,
    finding.body,
    finding.alert_type,
    finding.cwe,
    finding.manifest_path,
  ]
    .join("\n")
    .toLowerCase();

  return Boolean(
    finding.alert_type === "secret-scanning" ||
    /\b(secret|private key|token leak|credential|password|api key|access key|bearer token)\b/i.test(
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

function collectFindings(args, repoRoot, config) {
  const findings = [];
  const warnings = [];
  const errors = [];

  const event = args.event_path
    ? readDataFile(args.event_path, repoRoot)
    : null;

  if (args.event_path && !event) {
    warnings.push(
      `Event file was not readable or contained invalid data: ${args.event_path}`,
    );
  }

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
      const message = `Findings file was not readable or contained invalid data: ${args.findings_file}`;

      if (args.require_findings_file) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    } else {
      findings.push(...parseFindingsData(data));
    }
  } else if (args.require_findings_file) {
    errors.push("Findings file is required but was not provided.");
  }

  if (Array.isArray(config.inline_findings) && config.inline_findings.length) {
    findings.push(...config.inline_findings);
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
      source: "direct",
    });
  }

  const normalized = findings
    .map((finding, index) => normalizeFinding(finding, index, args))
    .filter(
      (finding) =>
        finding.title ||
        finding.body ||
        finding.cve ||
        finding.cwe ||
        finding.package_name ||
        finding.alert_type ||
        finding.manifest_path,
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
      secret: isSecretFinding(finding),
    });
  }

  return {
    findings: unique,
    warnings,
    errors,
    event_available: Boolean(event),
  };
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

function findingPathMatches(finding, patterns) {
  const pathValue = finding.manifest_path;

  if (!pathValue) return false;

  return patterns.some((pattern) => matchesPattern(pathValue, pattern));
}

function changedPathMatches(files, patterns) {
  const matches = [];

  for (const file of files) {
    for (const pattern of patterns) {
      if (matchesPattern(file, pattern)) {
        matches.push({
          file,
          pattern,
        });
      }
    }
  }

  return matches;
}

function evaluateRule(rule, finding, args) {
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
      matched: rule.severities.includes(finding.severity),
    });
  }

  if (rule.labels.length) {
    checks.push({
      type: "labels",
      matched: rule.labels.some((label) => args.labels.includes(label)),
    });
  }

  if (rule.title_contains.length) {
    const title = normalizeString(finding.title).toLowerCase();

    checks.push({
      type: "title",
      matched: rule.title_contains.some((text) => title.includes(text)),
    });
  }

  if (rule.body_contains.length) {
    const body = normalizeString(finding.body).toLowerCase();

    checks.push({
      type: "body",
      matched: rule.body_contains.some((text) => body.includes(text)),
    });
  }

  if (rule.alert_types.length) {
    checks.push({
      type: "alert_type",
      matched: rule.alert_types.includes(finding.alert_type),
    });
  }

  if (rule.ecosystems.length) {
    checks.push({
      type: "ecosystem",
      matched: rule.ecosystems.includes(finding.ecosystem),
    });
  }

  if (rule.packages.length) {
    checks.push({
      type: "package",
      matched: rule.packages.includes(finding.package_name.toLowerCase()),
    });
  }

  if (rule.cves.length) {
    checks.push({
      type: "cve",
      matched: rule.cves.includes(finding.cve),
    });
  }

  if (rule.cwes.length) {
    checks.push({
      type: "cwe",
      matched: rule.cwes.some((cwe) => finding.cwe.includes(cwe)),
    });
  }

  if (rule.paths.length) {
    checks.push({
      type: "paths",
      matched: findingPathMatches(finding, rule.paths),
    });
  }

  if (rule.fingerprints.length) {
    checks.push({
      type: "fingerprint",
      matched: rule.fingerprints.includes(finding.fingerprint),
    });
  }

  if (rule.min_cvss > 0) {
    checks.push({
      type: "min_cvss",
      matched: finding.cvss >= rule.min_cvss,
    });
  }

  if (rule.max_cvss > 0) {
    checks.push({
      type: "max_cvss",
      matched: finding.cvss <= rule.max_cvss,
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

function defaultDecision(args, finding) {
  const reasons = [];

  if (args.fail_on_any_secret && finding.secret) {
    reasons.push("secret-finding");
    return {
      action: "fail",
      reason: reasons,
      message: "Secret-related security finding blocks the gate.",
    };
  }

  if (args.fail_on_severities.includes(finding.severity)) {
    reasons.push(`severity:${finding.severity}`);
    return {
      action: "fail",
      reason: reasons,
      message: `Severity "${finding.severity}" blocks the gate.`,
    };
  }

  if (
    args.fail_cvss_at_or_above > 0 &&
    finding.cvss >= args.fail_cvss_at_or_above
  ) {
    reasons.push(`cvss>=${args.fail_cvss_at_or_above}`);
    return {
      action: "fail",
      reason: reasons,
      message: `CVSS ${finding.cvss} meets the failure threshold.`,
    };
  }

  if (args.warn_on_severities.includes(finding.severity)) {
    reasons.push(`severity:${finding.severity}`);
    return {
      action: "warn",
      reason: reasons,
      message: `Severity "${finding.severity}" produces a warning.`,
    };
  }

  if (
    args.warn_cvss_at_or_above > 0 &&
    finding.cvss >= args.warn_cvss_at_or_above
  ) {
    reasons.push(`cvss>=${args.warn_cvss_at_or_above}`);
    return {
      action: "warn",
      reason: reasons,
      message: `CVSS ${finding.cvss} meets the warning threshold.`,
    };
  }

  return {
    action: "pass",
    reason: [],
    message: "Finding does not violate the default policy.",
  };
}

function decideFinding(args, config, finding) {
  if (args.ignored_fingerprints.includes(finding.fingerprint)) {
    return {
      action: "ignore",
      source: "ignored-fingerprint",
      message: "Finding fingerprint is explicitly ignored.",
      matched_rule: null,
      matched_rules: [],
      reasons: ["fingerprint"],
    };
  }

  if (findingPathMatches(finding, args.ignored_paths)) {
    return {
      action: "ignore",
      source: "ignored-path",
      message: "Finding path is explicitly ignored.",
      matched_rule: null,
      matched_rules: [],
      reasons: ["path"],
    };
  }

  if (args.require_security_signal && !finding.security_signal) {
    return {
      action: "ignore",
      source: "no-security-signal",
      message: "Finding does not contain a security signal.",
      matched_rule: null,
      matched_rules: [],
      reasons: ["no-security-signal"],
    };
  }

  const matchedRules = config.rules
    .map((rule) => evaluateRule(rule, finding, args))
    .filter((result) => result.matched)
    .sort((left, right) => right.rule.priority - left.rule.priority);

  const decisiveRule = matchedRules.find((result) =>
    ["fail", "warn", "ignore", "pass"].includes(result.rule.action),
  );

  if (decisiveRule) {
    return {
      action: decisiveRule.rule.action,
      source: "rule",
      message:
        decisiveRule.rule.message ||
        `Matched security policy rule "${decisiveRule.rule.name}".`,
      matched_rule: {
        id: decisiveRule.rule.id,
        name: decisiveRule.rule.name,
        action: decisiveRule.rule.action,
        priority: decisiveRule.rule.priority,
        reasons: decisiveRule.reasons,
      },
      matched_rules: matchedRules.map((result) => ({
        id: result.rule.id,
        name: result.rule.name,
        action: result.rule.action,
        priority: result.rule.priority,
        reasons: result.reasons,
      })),
      reasons: decisiveRule.reasons,
    };
  }

  const decision = defaultDecision(args, finding);

  return {
    action: decision.action,
    source: "default-policy",
    message: decision.message,
    matched_rule: null,
    matched_rules: matchedRules.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      action: result.rule.action,
      priority: result.rule.priority,
      reasons: result.reasons,
    })),
    reasons: decision.reason,
  };
}

function limitViolation(severity, count, maxAllowed) {
  if (maxAllowed < 0) return null;
  if (count <= maxAllowed) return null;

  return {
    severity,
    count,
    max_allowed: maxAllowed,
    message: `Found ${count} ${severity} finding(s); maximum allowed is ${maxAllowed}.`,
  };
}

function evaluateGate(args, config, findingsLoad) {
  const startedAt = new Date();
  const decisions = [];
  const errors = [...findingsLoad.errors];
  const warnings = [...findingsLoad.warnings];

  for (const finding of findingsLoad.findings) {
    const decision = decideFinding(args, config, finding);

    decisions.push({
      finding,
      decision,
    });
  }

  if (!findingsLoad.findings.length && args.fail_if_no_findings) {
    errors.push("No security findings were resolved.");
  }

  const activeDecisions = decisions.filter(
    (item) => item.decision.action !== "ignore",
  );
  const failingFindings = activeDecisions.filter(
    (item) => item.decision.action === "fail",
  );
  const warningFindings = activeDecisions.filter(
    (item) => item.decision.action === "warn",
  );

  const severityCounts = {
    critical: activeDecisions.filter(
      (item) => item.finding.severity === "critical",
    ).length,
    high: activeDecisions.filter((item) => item.finding.severity === "high")
      .length,
    medium: activeDecisions.filter((item) => item.finding.severity === "medium")
      .length,
    low: activeDecisions.filter((item) => item.finding.severity === "low")
      .length,
    info: activeDecisions.filter((item) => item.finding.severity === "info")
      .length,
    unknown: activeDecisions.filter(
      (item) => item.finding.severity === "unknown",
    ).length,
  };

  const limitViolations = [
    limitViolation("critical", severityCounts.critical, args.max_critical),
    limitViolation("high", severityCounts.high, args.max_high),
    limitViolation("medium", severityCounts.medium, args.max_medium),
    limitViolation("low", severityCounts.low, args.max_low),
    limitViolation("info", severityCounts.info, args.max_info),
    limitViolation("unknown", severityCounts.unknown, args.max_unknown),
  ].filter(Boolean);

  errors.push(...limitViolations.map((violation) => violation.message));

  const blockedPathMatches = changedPathMatches(
    args.changed_files,
    args.blocked_paths,
  );
  const sensitivePathMatches = changedPathMatches(
    args.changed_files,
    args.sensitive_paths,
  );

  if (blockedPathMatches.length) {
    const message = `Changed file(s) match blocked security path rules: ${blockedPathMatches.map((match) => match.file).join(", ")}`;

    if (args.fail_on_blocked_paths) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (sensitivePathMatches.length && args.warn_on_sensitive_paths) {
    warnings.push(
      `Changed file(s) touch sensitive security paths: ${sensitivePathMatches.map((match) => match.file).join(", ")}`,
    );
  }

  const endedAt = new Date();
  const ok = errors.length === 0 && failingFindings.length === 0;

  return {
    status: ok
      ? warnings.length || warningFindings.length
        ? "warning"
        : "passed"
      : "failed",
    ok,
    dry_run: args.dry_run,
    decisions,
    failing_findings: failingFindings,
    warning_findings: warningFindings,
    ignored_findings: decisions.filter(
      (item) => item.decision.action === "ignore",
    ),
    passing_findings: decisions.filter(
      (item) => item.decision.action === "pass",
    ),
    severity_counts: severityCounts,
    limit_violations: limitViolations,
    blocked_path_matches: blockedPathMatches,
    sensitive_path_matches: sensitivePathMatches,
    errors: [
      ...errors,
      ...failingFindings.map(
        (item) => `${item.finding.fingerprint}: ${item.decision.message}`,
      ),
    ],
    warnings: [
      ...warnings,
      ...warningFindings.map(
        (item) => `${item.finding.fingerprint}: ${item.decision.message}`,
      ),
    ],
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
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
  config,
  findingsLoad,
  gate,
) {
  const github = getGitMetadata(repoRoot);

  return {
    schema_version: 1,
    type: "security-policy-gate",
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
      fail_on_severities: args.fail_on_severities,
      warn_on_severities: args.warn_on_severities,
      fail_cvss_at_or_above: args.fail_cvss_at_or_above,
      warn_cvss_at_or_above: args.warn_cvss_at_or_above,
      max_allowed_by_severity: {
        critical: args.max_critical,
        high: args.max_high,
        medium: args.max_medium,
        low: args.max_low,
        info: args.max_info,
        unknown: args.max_unknown,
      },
      blocked_paths: args.blocked_paths,
      sensitive_paths: args.sensitive_paths,
      ignored_paths: args.ignored_paths,
      ignored_fingerprints: args.ignored_fingerprints,
      require_findings_file: args.require_findings_file,
      require_security_signal: args.require_security_signal,
      fail_if_no_findings: args.fail_if_no_findings,
      fail_on_any_secret: args.fail_on_any_secret,
      rule_count: config.rules.length,
      dry_run: args.dry_run,
    },
    findings: findingsLoad.findings,
    decisions: gate.decisions,
    gate: {
      status: gate.status,
      ok: gate.ok,
      dry_run: gate.dry_run,
      severity_counts: gate.severity_counts,
      limit_violations: gate.limit_violations,
      blocked_path_matches: gate.blocked_path_matches,
      sensitive_path_matches: gate.sensitive_path_matches,
      started_at: gate.started_at,
      ended_at: gate.ended_at,
      duration_ms: gate.duration_ms,
    },
    totals: {
      findings: findingsLoad.findings.length,
      active_findings: gate.decisions.filter(
        (item) => item.decision.action !== "ignore",
      ).length,
      ignored_findings: gate.ignored_findings.length,
      passing_findings: gate.passing_findings.length,
      warning_findings: gate.warning_findings.length,
      failing_findings: gate.failing_findings.length,
      security_signals: findingsLoad.findings.filter(
        (finding) => finding.security_signal,
      ).length,
      secrets: findingsLoad.findings.filter((finding) => finding.secret).length,
      critical: gate.severity_counts.critical,
      high: gate.severity_counts.high,
      medium: gate.severity_counts.medium,
      low: gate.severity_counts.low,
      info: gate.severity_counts.info,
      unknown: gate.severity_counts.unknown,
      blocked_path_matches: gate.blocked_path_matches.length,
      sensitive_path_matches: gate.sensitive_path_matches.length,
      errors: gate.errors.length,
      warnings: gate.warnings.length,
      duration_ms: gate.duration_ms,
      duration_human: formatDuration(gate.duration_ms),
      ok: gate.ok,
    },
    errors: gate.errors,
    warnings: gate.warnings,
    status: gate.status,
    ok: gate.ok,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const icon = report.ok ? (report.status === "warning" ? "⚠️" : "✅") : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Security Policy Gate`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Findings: \`${report.totals.findings}\``,
    `- Active findings: \`${report.totals.active_findings}\``,
    `- Ignored findings: \`${report.totals.ignored_findings}\``,
    `- Failing findings: \`${report.totals.failing_findings}\``,
    `- Warning findings: \`${report.totals.warning_findings}\``,
    `- Secrets: \`${report.totals.secrets}\``,
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
    `| Info | \`${report.totals.info}\` |`,
    `| Unknown | \`${report.totals.unknown}\` |`,
    "",
  ];

  if (report.decisions.length) {
    lines.push("## 🔐 Finding Decisions");
    lines.push("");
    lines.push(
      "| Decision | Severity | Finding | Package | Path | Fingerprint |",
    );
    lines.push("|---|---|---|---|---|---|");

    const sorted = [...report.decisions].sort((left, right) => {
      const actionRank = { fail: 0, warn: 1, pass: 2, ignore: 3 };
      const leftRank = actionRank[left.decision.action] ?? 9;
      const rightRank = actionRank[right.decision.action] ?? 9;

      if (leftRank !== rightRank) return leftRank - rightRank;

      return (
        severityRank(right.finding.severity) -
        severityRank(left.finding.severity)
      );
    });

    for (const item of sorted.slice(0, 100)) {
      const statusIcon =
        item.decision.action === "fail"
          ? "❌"
          : item.decision.action === "warn"
            ? "⚠️"
            : item.decision.action === "ignore"
              ? "⏭️"
              : "✅";

      lines.push(
        `| ${statusIcon} \`${escapeMarkdown(item.decision.action)}\` | \`${escapeMarkdown(item.finding.severity)}\` | ${escapeMarkdown(item.finding.title || "none")} | \`${escapeMarkdown(item.finding.package_name || "none")}\` | \`${escapeMarkdown(item.finding.manifest_path || "none")}\` | \`${item.finding.fingerprint}\` |`,
      );
    }

    if (sorted.length > 100) {
      lines.push(
        `| … | … | … | … | … | \`${sorted.length - 100}\` more finding(s) omitted |`,
      );
    }

    lines.push("");
  }

  if (report.gate.limit_violations.length) {
    lines.push("## 🚫 Severity Limit Violations");
    lines.push("");

    for (const violation of report.gate.limit_violations) {
      lines.push(`- ${escapeMarkdown(violation.message)}`);
    }

    lines.push("");
  }

  if (report.gate.blocked_path_matches.length) {
    lines.push("## 🚫 Blocked Path Matches");
    lines.push("");
    lines.push("| File | Pattern |");
    lines.push("|---|---|");

    for (const match of report.gate.blocked_path_matches) {
      lines.push(
        `| \`${escapeMarkdown(match.file)}\` | \`${escapeMarkdown(match.pattern)}\` |`,
      );
    }

    lines.push("");
  }

  if (report.gate.sensitive_path_matches.length) {
    lines.push("## ⚠️ Sensitive Path Matches");
    lines.push("");
    lines.push("| File | Pattern |");
    lines.push("|---|---|");

    for (const match of report.gate.sensitive_path_matches) {
      lines.push(
        `| \`${escapeMarkdown(match.file)}\` | \`${escapeMarkdown(match.pattern)}\` |`,
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
  lines.push(`- Event path: \`${report.config.event_path || "none"}\``);
  lines.push(`- Findings file: \`${report.config.findings_file || "none"}\``);
  lines.push(
    `- Fail severities: \`${escapeMarkdown(report.config.fail_on_severities.join(", ") || "none")}\``,
  );
  lines.push(
    `- Warn severities: \`${escapeMarkdown(report.config.warn_on_severities.join(", ") || "none")}\``,
  );
  lines.push(`- Rule count: \`${report.config.rule_count}\``);
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
  setGitHubOutput("security_policy_gate_file", report.config.output_file);
  setGitHubOutput(
    "security_policy_gate_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("security_policy_gate_status", report.status);
  setGitHubOutput("security_policy_gate_ok", report.ok ? "true" : "false");

  setGitHubOutput("security_policy_findings", String(report.totals.findings));
  setGitHubOutput(
    "security_policy_active_findings",
    String(report.totals.active_findings),
  );
  setGitHubOutput(
    "security_policy_ignored_findings",
    String(report.totals.ignored_findings),
  );
  setGitHubOutput(
    "security_policy_failing_findings",
    String(report.totals.failing_findings),
  );
  setGitHubOutput(
    "security_policy_warning_findings",
    String(report.totals.warning_findings),
  );
  setGitHubOutput("security_policy_secrets", String(report.totals.secrets));

  setGitHubOutput("security_policy_critical", String(report.totals.critical));
  setGitHubOutput("security_policy_high", String(report.totals.high));
  setGitHubOutput("security_policy_medium", String(report.totals.medium));
  setGitHubOutput("security_policy_low", String(report.totals.low));
  setGitHubOutput("security_policy_info", String(report.totals.info));
  setGitHubOutput("security_policy_unknown", String(report.totals.unknown));

  setGitHubOutput("security_policy_errors", String(report.totals.errors));
  setGitHubOutput("security_policy_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "security_policy_findings_json",
    JSON.stringify(report.findings),
  );
  setGitHubOutput(
    "security_policy_decisions_json",
    JSON.stringify(report.decisions),
  );
  setGitHubOutput("security_policy_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "security_policy_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const rawConfig = configFile ? readDataFile(configFile, repoRoot) : null;
  const config = normalizeConfig(rawConfig);

  args = applyConfig(args, rawConfig);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Running security policy gate.");

  const findingsLoad = collectFindings(args, repoRoot, config);
  const gate = evaluateGate(args, config, findingsLoad);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(rawConfig),
    config,
    findingsLoad,
    gate,
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
