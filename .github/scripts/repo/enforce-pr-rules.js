#!/usr/bin/env node
// .github/scripts/repo/enforce-pr-rules.js
// =============================================================================
// Aerealith AI — Pull Request Rule Enforcement
// -----------------------------------------------------------------------------
// Purpose:
//   Validate pull requests against repository standards before merge. Checks can
//   evaluate title, body, labels, assignees, reviewers, approvals, milestone,
//   draft state, source/target branches, changed files, diff size, and blocked
//   paths.
//
// Input:
//   - GitHub event payload
//   - GitHub REST API, when a token is available
//   - .github/repo/enforce-pr-rules.json
//   - .github/repo/enforce-pr-rules.jsonc
//   - .github/repo/enforce-pr-rules.yaml
//   - .github/repo/enforce-pr-rules.yml
//   - .github/repo/pr-rules.json
//   - .github/repo/pr-rules.yaml
//
// Output:
//   - artifacts/repo/enforce-pr-rules.json
//   - artifacts/repo/enforce-pr-rules.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Read-only against GitHub.
//   - Safe for pull requests.
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
    info: (message) => console.log(`[pr-rules] ${message}`),
    warn: (message) => console.warn(`[pr-rules] WARN: ${message}`),
    error: (message) => console.error(`[pr-rules] ERROR: ${message}`),
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
  ".github/repo/enforce-pr-rules.json",
  ".github/repo/enforce-pr-rules.jsonc",
  ".github/repo/enforce-pr-rules.yaml",
  ".github/repo/enforce-pr-rules.yml",
  ".github/repo/pr-rules.json",
  ".github/repo/pr-rules.jsonc",
  ".github/repo/pr-rules.yaml",
  ".github/repo/pr-rules.yml",
  ".github/enforce-pr-rules.json",
  ".github/enforce-pr-rules.jsonc",
  ".github/enforce-pr-rules.yaml",
  ".github/enforce-pr-rules.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/enforce-pr-rules.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/enforce-pr-rules.md";

const DEFAULT_ALLOWED_TITLE_PATTERN =
  "^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security|release)(\\([a-z0-9._/-]+\\))?!?: .{3,}$";

const DEFAULT_LINKED_ISSUE_PATTERN =
  "(closes|close|closed|fixes|fix|fixed|resolves|resolve|resolved)\\s+#\\d+|#[0-9]+|[A-Z]+-[0-9]+";

const DEFAULT_BLOCKED_TITLE_PATTERN =
  "\\b(wip|work in progress|do not merge|draft)\\b";

const DEFAULT_TEMPLATE_LEFTOVERS = [
  "todo",
  "tbd",
  "n/a?",
  "describe your changes",
  "add screenshots",
  "checklist goes here",
  "delete this section",
  "replace this text",
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

function normalizeBranch(value) {
  const branch = normalizeString(value);

  if (!branch) return "";
  if (branch.startsWith("refs/heads/"))
    return branch.slice("refs/heads/".length);
  if (branch.startsWith("origin/")) return branch.slice("origin/".length);

  return branch;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ENFORCE_PR_RULES_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ENFORCE_PR_RULES_CONFIG_FILE || "",

    event_path:
      process.env.ENFORCE_PR_RULES_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ENFORCE_PR_RULES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ENFORCE_PR_RULES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.ENFORCE_PR_RULES_NUMBER ||
      process.env.PR_NUMBER ||
      process.env.PULL_REQUEST_NUMBER ||
      "",

    title: process.env.ENFORCE_PR_RULES_TITLE || "",
    body: process.env.ENFORCE_PR_RULES_BODY || "",
    author: process.env.ENFORCE_PR_RULES_AUTHOR || "",

    base_branch:
      process.env.ENFORCE_PR_RULES_BASE_BRANCH ||
      process.env.GITHUB_BASE_REF ||
      "",
    head_branch:
      process.env.ENFORCE_PR_RULES_HEAD_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      "",

    labels: normalizeLabelList(
      process.env.ENFORCE_PR_RULES_LABELS ||
        process.env.PR_LABELS ||
        process.env.ISSUE_LABELS ||
        "",
    ),
    assignees: normalizeUserList(
      process.env.ENFORCE_PR_RULES_ASSIGNEES ||
        process.env.PR_ASSIGNEES ||
        process.env.ISSUE_ASSIGNEES ||
        "",
    ),
    reviewers: normalizeUserList(
      process.env.ENFORCE_PR_RULES_REVIEWERS || process.env.PR_REVIEWERS || "",
    ),
    changed_files: normalizeStringList(
      process.env.ENFORCE_PR_RULES_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    allowed_base_branches: normalizeStringList(
      process.env.ENFORCE_PR_RULES_ALLOWED_BASE_BRANCHES ||
        process.env.ALLOWED_BASE_BRANCHES ||
        "main,dev,staging,production",
    ),
    blocked_base_branches: normalizeStringList(
      process.env.ENFORCE_PR_RULES_BLOCKED_BASE_BRANCHES ||
        process.env.BLOCKED_BASE_BRANCHES ||
        "",
    ),
    blocked_head_patterns: normalizeStringList(
      process.env.ENFORCE_PR_RULES_BLOCKED_HEAD_PATTERNS ||
        process.env.BLOCKED_HEAD_PATTERNS ||
        "wip/**,tmp/**,temp/**,scratch/**",
    ),
    blocked_paths: normalizeStringList(
      process.env.ENFORCE_PR_RULES_BLOCKED_PATHS ||
        process.env.BLOCKED_PR_PATHS ||
        "",
    ),
    sensitive_paths: normalizeStringList(
      process.env.ENFORCE_PR_RULES_SENSITIVE_PATHS ||
        process.env.SENSITIVE_PR_PATHS ||
        ".github/**,package.json,pnpm-lock.yaml,**/migrations/**,**/*.sql",
    ),

    required_labels: normalizeLabelList(
      process.env.ENFORCE_PR_RULES_REQUIRED_LABELS || "",
    ),
    blocked_labels: normalizeLabelList(
      process.env.ENFORCE_PR_RULES_BLOCKED_LABELS ||
        "do-not-merge,blocked,invalid,wontfix",
    ),
    allowed_labels: normalizeLabelList(
      process.env.ENFORCE_PR_RULES_ALLOWED_LABELS || "",
    ),

    title_pattern:
      process.env.ENFORCE_PR_RULES_TITLE_PATTERN ||
      DEFAULT_ALLOWED_TITLE_PATTERN,
    blocked_title_pattern:
      process.env.ENFORCE_PR_RULES_BLOCKED_TITLE_PATTERN ||
      DEFAULT_BLOCKED_TITLE_PATTERN,
    linked_issue_pattern:
      process.env.ENFORCE_PR_RULES_LINKED_ISSUE_PATTERN ||
      DEFAULT_LINKED_ISSUE_PATTERN,

    template_leftovers: normalizeStringList(
      process.env.ENFORCE_PR_RULES_TEMPLATE_LEFTOVERS ||
        DEFAULT_TEMPLATE_LEFTOVERS.join(","),
    ),

    require_pull_request: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_PR,
      true,
    ),
    require_title: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_TITLE,
      true,
    ),
    require_title_pattern: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_TITLE_PATTERN,
      true,
    ),
    require_body: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_BODY,
      true,
    ),
    require_linked_issue: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_LINKED_ISSUE,
      false,
    ),
    require_labels: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_LABELS,
      true,
    ),
    require_assignee: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_ASSIGNEE,
      false,
    ),
    require_milestone: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_MILESTONE,
      false,
    ),
    require_reviewers: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_REVIEWERS,
      false,
    ),
    require_approvals: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_APPROVALS,
      false,
    ),
    require_checked_checklist: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_REQUIRE_CHECKED_CHECKLIST,
      false,
    ),

    allow_drafts: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_ALLOW_DRAFTS,
      false,
    ),
    allow_bots: normalizeBoolean(process.env.ENFORCE_PR_RULES_ALLOW_BOTS, true),
    allow_empty_diff: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_ALLOW_EMPTY_DIFF,
      false,
    ),
    allow_missing_api_data: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_ALLOW_MISSING_API_DATA,
      true,
    ),

    fetch_pull_request: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FETCH_PR,
      true,
    ),
    fetch_issue: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FETCH_ISSUE,
      true,
    ),
    fetch_files: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FETCH_FILES,
      true,
    ),
    fetch_reviews: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FETCH_REVIEWS,
      true,
    ),

    min_title_length: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MIN_TITLE_LENGTH,
      8,
    ),
    max_title_length: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MAX_TITLE_LENGTH,
      120,
    ),
    min_body_length: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MIN_BODY_LENGTH,
      20,
    ),
    max_files_changed: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MAX_FILES_CHANGED,
      150,
    ),
    max_additions: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MAX_ADDITIONS,
      5000,
    ),
    max_deletions: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MAX_DELETIONS,
      5000,
    ),
    max_changed_lines: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MAX_CHANGED_LINES,
      8000,
    ),
    min_approvals: normalizeInteger(
      process.env.ENFORCE_PR_RULES_MIN_APPROVALS,
      1,
    ),

    fail_on_warnings: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FAIL_ON_WARNINGS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_FAIL_ON_ERROR,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.ENFORCE_PR_RULES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ENFORCE_PR_RULES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ENFORCE_PR_RULES_STEP_SUMMARY,
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
      arg === "--pr" ||
      arg === "--pull-request-number"
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

    if (arg === "--base-branch") {
      args.base_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head-branch") {
      args.head_branch = argv[index + 1];
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

    if (arg === "--reviewer" || arg === "--reviewers") {
      args.reviewers.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--changed-file" || arg === "--changed-files") {
      args.changed_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-base-branch" || arg === "--allowed-base-branches") {
      args.allowed_base_branches.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--blocked-base-branch" || arg === "--blocked-base-branches") {
      args.blocked_base_branches.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--blocked-head-pattern" || arg === "--blocked-head-patterns") {
      args.blocked_head_patterns.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--required-label" || arg === "--required-labels") {
      args.required_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--blocked-label" || arg === "--blocked-labels") {
      args.blocked_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-label" || arg === "--allowed-labels") {
      args.allowed_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--title-pattern") {
      args.title_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--blocked-title-pattern") {
      args.blocked_title_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--linked-issue-pattern") {
      args.linked_issue_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--template-leftover" || arg === "--template-leftovers") {
      args.template_leftovers.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--require-title-pattern") {
      args.require_title_pattern = true;
      continue;
    }

    if (arg === "--no-require-title-pattern") {
      args.require_title_pattern = false;
      continue;
    }

    if (arg === "--require-body") {
      args.require_body = true;
      continue;
    }

    if (arg === "--no-require-body") {
      args.require_body = false;
      continue;
    }

    if (arg === "--require-linked-issue") {
      args.require_linked_issue = true;
      continue;
    }

    if (arg === "--no-require-linked-issue") {
      args.require_linked_issue = false;
      continue;
    }

    if (arg === "--require-labels") {
      args.require_labels = true;
      continue;
    }

    if (arg === "--no-require-labels") {
      args.require_labels = false;
      continue;
    }

    if (arg === "--require-assignee") {
      args.require_assignee = true;
      continue;
    }

    if (arg === "--no-require-assignee") {
      args.require_assignee = false;
      continue;
    }

    if (arg === "--require-milestone") {
      args.require_milestone = true;
      continue;
    }

    if (arg === "--no-require-milestone") {
      args.require_milestone = false;
      continue;
    }

    if (arg === "--require-reviewers") {
      args.require_reviewers = true;
      continue;
    }

    if (arg === "--no-require-reviewers") {
      args.require_reviewers = false;
      continue;
    }

    if (arg === "--require-approvals") {
      args.require_approvals = true;
      continue;
    }

    if (arg === "--no-require-approvals") {
      args.require_approvals = false;
      continue;
    }

    if (arg === "--require-checked-checklist") {
      args.require_checked_checklist = true;
      continue;
    }

    if (arg === "--no-require-checked-checklist") {
      args.require_checked_checklist = false;
      continue;
    }

    if (arg === "--allow-drafts") {
      args.allow_drafts = true;
      continue;
    }

    if (arg === "--no-allow-drafts") {
      args.allow_drafts = false;
      continue;
    }

    if (arg === "--allow-bots") {
      args.allow_bots = true;
      continue;
    }

    if (arg === "--no-allow-bots") {
      args.allow_bots = false;
      continue;
    }

    if (arg === "--allow-empty-diff") {
      args.allow_empty_diff = true;
      continue;
    }

    if (arg === "--no-allow-empty-diff") {
      args.allow_empty_diff = false;
      continue;
    }

    if (arg === "--allow-missing-api-data") {
      args.allow_missing_api_data = true;
      continue;
    }

    if (arg === "--no-allow-missing-api-data") {
      args.allow_missing_api_data = false;
      continue;
    }

    if (arg === "--min-title-length") {
      args.min_title_length = normalizeInteger(
        argv[index + 1],
        args.min_title_length,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-title-length") {
      args.max_title_length = normalizeInteger(
        argv[index + 1],
        args.max_title_length,
      );
      index += 1;
      continue;
    }

    if (arg === "--min-body-length") {
      args.min_body_length = normalizeInteger(
        argv[index + 1],
        args.min_body_length,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-files-changed") {
      args.max_files_changed = normalizeInteger(
        argv[index + 1],
        args.max_files_changed,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-additions") {
      args.max_additions = normalizeInteger(
        argv[index + 1],
        args.max_additions,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-deletions") {
      args.max_deletions = normalizeInteger(
        argv[index + 1],
        args.max_deletions,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-changed-lines") {
      args.max_changed_lines = normalizeInteger(
        argv[index + 1],
        args.max_changed_lines,
      );
      index += 1;
      continue;
    }

    if (arg === "--min-approvals") {
      args.min_approvals = normalizeInteger(
        argv[index + 1],
        args.min_approvals,
      );
      index += 1;
      continue;
    }

    if (arg === "--fetch-pr") {
      args.fetch_pull_request = true;
      continue;
    }

    if (arg === "--no-fetch-pr") {
      args.fetch_pull_request = false;
      continue;
    }

    if (arg === "--fetch-issue") {
      args.fetch_issue = true;
      continue;
    }

    if (arg === "--no-fetch-issue") {
      args.fetch_issue = false;
      continue;
    }

    if (arg === "--fetch-files") {
      args.fetch_files = true;
      continue;
    }

    if (arg === "--no-fetch-files") {
      args.fetch_files = false;
      continue;
    }

    if (arg === "--fetch-reviews") {
      args.fetch_reviews = true;
      continue;
    }

    if (arg === "--no-fetch-reviews") {
      args.fetch_reviews = false;
      continue;
    }

    if (arg === "--fail-on-warnings") {
      args.fail_on_warnings = true;
      continue;
    }

    if (arg === "--no-fail-on-warnings") {
      args.fail_on_warnings = false;
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
  args.base_branch = normalizeBranch(args.base_branch);
  args.head_branch = normalizeBranch(args.head_branch);

  args.allowed_base_branches = [
    ...new Set(args.allowed_base_branches.map(normalizeBranch).filter(Boolean)),
  ];
  args.blocked_base_branches = [
    ...new Set(args.blocked_base_branches.map(normalizeBranch).filter(Boolean)),
  ];
  args.blocked_head_patterns = [
    ...new Set(args.blocked_head_patterns.map(normalizeString).filter(Boolean)),
  ];
  args.blocked_paths = [
    ...new Set(args.blocked_paths.map(toPosixPath).filter(Boolean)),
  ];
  args.sensitive_paths = [
    ...new Set(args.sensitive_paths.map(toPosixPath).filter(Boolean)),
  ];

  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.required_labels = [
    ...new Set(args.required_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.blocked_labels = [
    ...new Set(args.blocked_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.allowed_labels = [
    ...new Set(args.allowed_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.assignees = [
    ...new Set(args.assignees.map(normalizeUsername).filter(Boolean)),
  ];
  args.reviewers = [
    ...new Set(args.reviewers.map(normalizeUsername).filter(Boolean)),
  ];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];

  args.min_title_length = Math.max(1, args.min_title_length);
  args.max_title_length = Math.max(
    args.min_title_length,
    args.max_title_length,
  );
  args.min_body_length = Math.max(0, args.min_body_length);
  args.max_files_changed = Math.max(0, args.max_files_changed);
  args.max_additions = Math.max(0, args.max_additions);
  args.max_deletions = Math.max(0, args.max_deletions);
  args.max_changed_lines = Math.max(0, args.max_changed_lines);
  args.min_approvals = Math.max(0, args.min_approvals);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Pull Request Rule Enforcement

Usage:
  node .github/scripts/repo/enforce-pr-rules.js [options]

Examples:
  node .github/scripts/repo/enforce-pr-rules.js --pr 42
  node .github/scripts/repo/enforce-pr-rules.js --require-linked-issue
  node .github/scripts/repo/enforce-pr-rules.js --required-label "type: feature"
  node .github/scripts/repo/enforce-pr-rules.js --blocked-path ".github/workflows/**"
  node .github/scripts/repo/enforce-pr-rules.js --require-approvals --min-approvals 2

Recommended PR title format:
  type(scope): short description

Examples:
  feat(auth): add session refresh
  fix(ci): repair release workflow
  docs(readme): update setup guide
  security(api): harden token handling

Config example:
  {
    "allowed_base_branches": ["main", "dev", "staging"],
    "blocked_labels": ["do-not-merge", "blocked"],
    "required_labels": ["needs-review"],
    "blocked_paths": ["secrets/**"],
    "sensitive_paths": [".github/**", "package.json", "pnpm-lock.yaml"],
    "require_title_pattern": true,
    "require_body": true,
    "require_linked_issue": false,
    "require_approvals": false,
    "min_approvals": 1,
    "max_files_changed": 150,
    "max_changed_lines": 8000
  }

Options:
      --repo <owner/repo>                  Repository slug.
      --api-url <url>                      GitHub API URL.
      --token <token>                      GitHub token.
      --config <file>                      PR rules config file.
      --event-path <file>                  GitHub event payload path.
      --number, --pr <number>              Pull request number.
      --title <title>                      PR title override.
      --body <body>                        PR body override.
      --author <user>                      PR author override.
      --base-branch <branch>               Base branch override.
      --head-branch <branch>               Head branch override.
      --label <label,list>                 Label(s) to evaluate.
      --assignee <user,list>               Assignee(s) to evaluate.
      --reviewer <user,list>               Reviewer(s) to evaluate.
      --changed-file <file,list>           Changed file(s) to evaluate.
      --allowed-base-branch <list>         Allowed target branch(es).
      --blocked-base-branch <list>         Blocked target branch(es).
      --blocked-head-pattern <list>        Blocked source branch patterns.
      --blocked-path <path,list>           Blocked changed path patterns.
      --sensitive-path <path,list>         Sensitive changed path patterns.
      --required-label <label,list>        Required label(s).
      --blocked-label <label,list>         Blocked label(s).
      --allowed-label <label,list>         Allowed label allowlist.
      --title-pattern <regex>              Required title regex.
      --blocked-title-pattern <regex>      Blocked title regex.
      --linked-issue-pattern <regex>       Linked issue regex.
      --template-leftover <text,list>      Template placeholder text to block.
      --require-title-pattern              Require title pattern. Default.
      --no-require-title-pattern           Skip title pattern check.
      --require-body                       Require PR body. Default.
      --no-require-body                    Do not require PR body.
      --require-linked-issue               Require issue reference/link.
      --no-require-linked-issue            Do not require issue reference. Default.
      --require-labels                     Require at least one label. Default.
      --no-require-labels                  Do not require labels.
      --require-assignee                   Require at least one assignee.
      --require-milestone                  Require a milestone.
      --require-reviewers                  Require requested reviewers.
      --require-approvals                  Require approving reviews.
      --require-checked-checklist          Require all checklist items checked.
      --allow-drafts                       Allow draft PRs.
      --no-allow-drafts                    Block draft PRs. Default.
      --allow-bots                         Allow bot authors. Default.
      --no-allow-bots                      Block bot authors.
      --allow-empty-diff                   Allow PRs with no changed files.
      --no-allow-empty-diff                Block empty diffs. Default.
      --allow-missing-api-data             Downgrade missing API data to warnings. Default.
      --no-allow-missing-api-data          Treat missing API data as errors.
      --min-title-length <number>          Minimum title length. Default: 8.
      --max-title-length <number>          Maximum title length. Default: 120.
      --min-body-length <number>           Minimum body length. Default: 20.
      --max-files-changed <number>         Maximum changed files. Default: 150.
      --max-additions <number>             Maximum additions. Default: 5000.
      --max-deletions <number>             Maximum deletions. Default: 5000.
      --max-changed-lines <number>         Maximum total changed lines. Default: 8000.
      --min-approvals <number>             Minimum approving reviews. Default: 1.
      --fetch-pr                           Fetch PR metadata. Default.
      --no-fetch-pr                        Do not fetch PR metadata.
      --fetch-issue                        Fetch issue metadata. Default.
      --no-fetch-issue                     Do not fetch issue metadata.
      --fetch-files                        Fetch changed files. Default.
      --no-fetch-files                     Do not fetch changed files.
      --fetch-reviews                      Fetch PR reviews. Default.
      --no-fetch-reviews                   Do not fetch reviews.
      --fail-on-warnings                   Exit non-zero on warnings.
      --no-fail-on-warnings                Do not fail on warnings. Default.
      --fail-on-error                      Exit non-zero on errors. Default.
      --no-fail-on-error                   Do not fail workflow.
      --timeout-seconds <number>           GitHub API timeout. Default: 60.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Validate without writing files.
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

  fs.mkdirSync(dirPath, {
    recursive: true,
  });
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

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(
    stripJsonc(fs.readFileSync(absolutePath, "utf8")),
    fallback,
  );
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
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
    }
  }

  return config;
}

function readConfigFile(filePath, repoRoot) {
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

  const listKeys = [
    "allowed_base_branches",
    "blocked_base_branches",
    "blocked_head_patterns",
    "blocked_paths",
    "sensitive_paths",
    "required_labels",
    "blocked_labels",
    "allowed_labels",
    "template_leftovers",
  ];

  for (const key of listKeys) {
    if (Array.isArray(config[key])) {
      merged[key] = config[key].map(String).filter(Boolean);
    }
  }

  const stringKeys = [
    "title_pattern",
    "blocked_title_pattern",
    "linked_issue_pattern",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "require_pull_request",
    "require_title",
    "require_title_pattern",
    "require_body",
    "require_linked_issue",
    "require_labels",
    "require_assignee",
    "require_milestone",
    "require_reviewers",
    "require_approvals",
    "require_checked_checklist",
    "allow_drafts",
    "allow_bots",
    "allow_empty_diff",
    "allow_missing_api_data",
    "fetch_pull_request",
    "fetch_issue",
    "fetch_files",
    "fetch_reviews",
    "fail_on_warnings",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  const integerKeys = [
    "min_title_length",
    "max_title_length",
    "min_body_length",
    "max_files_changed",
    "max_additions",
    "max_deletions",
    "max_changed_lines",
    "min_approvals",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.allowed_base_branches = [
    ...new Set(
      normalizeStringList(merged.allowed_base_branches)
        .map(normalizeBranch)
        .filter(Boolean),
    ),
  ];
  merged.blocked_base_branches = [
    ...new Set(
      normalizeStringList(merged.blocked_base_branches)
        .map(normalizeBranch)
        .filter(Boolean),
    ),
  ];
  merged.blocked_head_patterns = [
    ...new Set(
      normalizeStringList(merged.blocked_head_patterns)
        .map(normalizeString)
        .filter(Boolean),
    ),
  ];
  merged.blocked_paths = [
    ...new Set(
      normalizeStringList(merged.blocked_paths)
        .map(toPosixPath)
        .filter(Boolean),
    ),
  ];
  merged.sensitive_paths = [
    ...new Set(
      normalizeStringList(merged.sensitive_paths)
        .map(toPosixPath)
        .filter(Boolean),
    ),
  ];
  merged.required_labels = [
    ...new Set(normalizeLabelList(merged.required_labels)),
  ];
  merged.blocked_labels = [
    ...new Set(normalizeLabelList(merged.blocked_labels)),
  ];
  merged.allowed_labels = [
    ...new Set(normalizeLabelList(merged.allowed_labels)),
  ];
  merged.template_leftovers = [
    ...new Set(
      normalizeStringList(merged.template_leftovers).map((item) =>
        item.toLowerCase(),
      ),
    ),
  ];

  return merged;
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-enforce-pr-rules-script`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
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
    req.end();
  });
}

function apiUrl(args, endpoint) {
  return `${args.api_url}${endpoint}`;
}

function repoEndpoint(args, suffix) {
  return `/repos/${args.repository}${suffix}`;
}

async function fetchPullRequest(args, number) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/pulls/${encodeURIComponent(number)}`)),
    {
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return response.body;
}

async function fetchIssue(args, number) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/issues/${encodeURIComponent(number)}`)),
    {
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return response.body;
}

async function fetchPullRequestFiles(args, number) {
  const files = [];
  let page = 1;

  while (page <= 10) {
    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(
          args,
          `/pulls/${encodeURIComponent(number)}/files?per_page=100&page=${page}`,
        ),
      ),
      {
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    files.push(
      ...body.map((file) => ({
        filename: toPosixPath(file.filename),
        status: normalizeString(file.status),
        additions: normalizeInteger(file.additions, 0),
        deletions: normalizeInteger(file.deletions, 0),
        changes: normalizeInteger(file.changes, 0),
        patch_available: Boolean(file.patch),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return files;
}

async function fetchPullRequestReviews(args, number) {
  const reviews = [];
  let page = 1;

  while (page <= 10) {
    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(
          args,
          `/pulls/${encodeURIComponent(number)}/reviews?per_page=100&page=${page}`,
        ),
      ),
      {
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    reviews.push(
      ...body.map((review) => ({
        id: review.id,
        user: normalizeUsername(review.user?.login),
        state: normalizeString(review.state).toUpperCase(),
        submitted_at: normalizeString(review.submitted_at),
        commit_id: normalizeString(review.commit_id),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return reviews;
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

function usersFromItems(items) {
  const users = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      users.push(item);
      continue;
    }

    if (typeof item === "object" && item.login) {
      users.push(item.login);
    }
  }

  return normalizeUserList(users);
}

function milestoneFromItem(item) {
  if (!item?.milestone) {
    return {
      title: "",
      number: 0,
      state: "",
      html_url: "",
    };
  }

  return {
    title: normalizeString(item.milestone.title),
    number: normalizeInteger(item.milestone.number, 0),
    state: normalizeString(item.milestone.state),
    html_url: normalizeString(item.milestone.html_url),
  };
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
  return "unknown";
}

function collectEventInput(args, repoRoot, github) {
  const event = args.event_path
    ? readJsonFile(args.event_path, repoRoot, null)
    : null;
  const pull = event?.pull_request || null;
  const issue = event?.issue || null;
  const item = pull || issue || null;
  const number = normalizeString(args.number || getEventNumber(event));

  return {
    event_available: Boolean(event),
    event_name: normalizeString(
      process.env.GITHUB_EVENT_NAME || github.event_name,
    ),
    event_action: normalizeString(event?.action),
    kind: getEventKind(event),
    number,
    title: normalizeString(args.title || item?.title),
    body: normalizeString(args.body || item?.body),
    author: normalizeUsername(
      args.author || item?.user?.login || event?.sender?.login,
    ),
    actor: normalizeUsername(github.actor || event?.sender?.login),
    draft: Boolean(pull?.draft),
    base_branch: normalizeBranch(
      args.base_branch || pull?.base?.ref || github.base_branch,
    ),
    head_branch: normalizeBranch(
      args.head_branch || pull?.head?.ref || github.branch,
    ),
    base_sha: normalizeString(pull?.base?.sha),
    head_sha: normalizeString(pull?.head?.sha),
    labels: [
      ...new Set(
        [...args.labels, ...labelsFromItems(item?.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
    ],
    assignees: [
      ...new Set(
        [...args.assignees, ...usersFromItems(item?.assignees)]
          .map(normalizeUsername)
          .filter(Boolean),
      ),
    ],
    reviewers: [
      ...new Set(
        [...args.reviewers, ...usersFromItems(pull?.requested_reviewers)]
          .map(normalizeUsername)
          .filter(Boolean),
      ),
    ],
    milestone: milestoneFromItem(item),
    changed_files: args.changed_files.map((filename) => ({
      filename: toPosixPath(filename),
      status: "",
      additions: 0,
      deletions: 0,
      changes: 0,
      patch_available: false,
    })),
    additions: normalizeInteger(pull?.additions, 0),
    deletions: normalizeInteger(pull?.deletions, 0),
    changed_file_count: normalizeInteger(
      pull?.changed_files,
      args.changed_files.length,
    ),
    mergeable: pull?.mergeable,
    mergeable_state: normalizeString(pull?.mergeable_state),
    api: {
      fetched_pull_request: false,
      fetched_issue: false,
      fetched_files: false,
      fetched_reviews: false,
      missing_data_warnings: [],
    },
    reviews: [],
  };
}

async function enrichInput(args, input) {
  const enriched = {
    ...input,
    labels: [...input.labels],
    assignees: [...input.assignees],
    reviewers: [...input.reviewers],
    changed_files: [...input.changed_files],
    reviews: [...input.reviews],
    api: {
      ...input.api,
      missing_data_warnings: [...input.api.missing_data_warnings],
    },
  };

  if (!args.token) {
    if (
      args.fetch_pull_request ||
      args.fetch_issue ||
      args.fetch_files ||
      args.fetch_reviews
    ) {
      enriched.api.missing_data_warnings.push(
        "GitHub token is missing, so API enrichment was skipped.",
      );
    }

    return enriched;
  }

  if (!enriched.number) {
    return enriched;
  }

  if (args.fetch_pull_request) {
    try {
      const pull = await fetchPullRequest(args, enriched.number);

      enriched.api.fetched_pull_request = true;
      enriched.kind = "pull_request";
      enriched.title = enriched.title || normalizeString(pull.title);
      enriched.body = enriched.body || normalizeString(pull.body);
      enriched.author = enriched.author || normalizeUsername(pull.user?.login);
      enriched.draft = Boolean(pull.draft);
      enriched.base_branch =
        enriched.base_branch || normalizeBranch(pull.base?.ref);
      enriched.head_branch =
        enriched.head_branch || normalizeBranch(pull.head?.ref);
      enriched.base_sha = enriched.base_sha || normalizeString(pull.base?.sha);
      enriched.head_sha = enriched.head_sha || normalizeString(pull.head?.sha);
      enriched.reviewers = [
        ...new Set([
          ...enriched.reviewers,
          ...usersFromItems(pull.requested_reviewers),
        ]),
      ];
      enriched.additions = normalizeInteger(pull.additions, enriched.additions);
      enriched.deletions = normalizeInteger(pull.deletions, enriched.deletions);
      enriched.changed_file_count = normalizeInteger(
        pull.changed_files,
        enriched.changed_file_count,
      );
      enriched.mergeable = pull.mergeable;
      enriched.mergeable_state = normalizeString(pull.mergeable_state);
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch pull request metadata: ${logger.formatError(err)}`,
      );
    }
  }

  if (args.fetch_issue) {
    try {
      const issue = await fetchIssue(args, enriched.number);

      enriched.api.fetched_issue = true;
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
      enriched.assignees = [
        ...new Set(
          [...enriched.assignees, ...usersFromItems(issue.assignees)]
            .map(normalizeUsername)
            .filter(Boolean),
        ),
      ];
      const issueMilestone = milestoneFromItem(issue);

      if (!enriched.milestone.number && issueMilestone.number) {
        enriched.milestone = issueMilestone;
      }

      if (issue.pull_request) {
        enriched.kind = "pull_request";
      }
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch issue metadata: ${logger.formatError(err)}`,
      );
    }
  }

  if (args.fetch_files) {
    try {
      const files = await fetchPullRequestFiles(args, enriched.number);

      enriched.api.fetched_files = true;

      if (files.length) {
        enriched.changed_files = files;
        enriched.changed_file_count = files.length;
        enriched.additions = files.reduce(
          (sum, file) => sum + file.additions,
          0,
        );
        enriched.deletions = files.reduce(
          (sum, file) => sum + file.deletions,
          0,
        );
      }
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch pull request files: ${logger.formatError(err)}`,
      );
    }
  }

  if (args.fetch_reviews) {
    try {
      const reviews = await fetchPullRequestReviews(args, enriched.number);

      enriched.api.fetched_reviews = true;
      enriched.reviews = reviews;
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch pull request reviews: ${logger.formatError(err)}`,
      );
    }
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

function regexFromPattern(pattern, flags = "") {
  const source = normalizeString(pattern);

  if (!source) return null;

  if (hasGlob(source)) {
    return globToRegExp(source);
  }

  const safeFlags = String(flags || "")
    .replace(/[^dgimsuvy]/g, "")
    .split("")
    .filter((flag, index, array) => array.indexOf(flag) === index)
    .join("");

  return new RegExp(escapeRegExp(source), safeFlags);
}

function safeTest(pattern, value, flags = "") {
  try {
    const regex = regexFromPattern(pattern, flags);
    return regex ? regex.test(String(value || "")) : false;
  } catch {
    return false;
  }
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

function findMatchingPatterns(files, patterns) {
  const matches = [];

  for (const file of files) {
    for (const pattern of patterns) {
      if (matchesPattern(file.filename, pattern)) {
        matches.push({
          file: file.filename,
          pattern,
        });
      }
    }
  }

  return matches;
}

function isBotUsername(username) {
  const value = normalizeUsername(username).toLowerCase();

  return (
    value.endsWith("[bot]") ||
    value.includes("bot") ||
    value === "github-actions" ||
    value === "dependabot" ||
    value === "renovate"
  );
}

function latestReviewStates(reviews) {
  const latest = new Map();

  for (const review of reviews) {
    if (!review.user) continue;

    latest.set(review.user.toLowerCase(), review);
  }

  return [...latest.values()];
}

function approvalCount(reviews, author) {
  const authorName = normalizeUsername(author).toLowerCase();

  return latestReviewStates(reviews).filter((review) => {
    if (review.state !== "APPROVED") return false;
    if (authorName && review.user.toLowerCase() === authorName) return false;

    return true;
  }).length;
}

function checklistStats(body) {
  const items = String(body || "").match(/^\s*[-*]\s+\[[ xX]\]\s+.+$/gm) || [];
  const checked = items.filter((item) => /\[[xX]\]/.test(item)).length;
  const unchecked = items.length - checked;

  return {
    total: items.length,
    checked,
    unchecked,
  };
}

function makeCheck(id, title, ok, severity, message, details = {}) {
  return {
    id,
    title,
    ok: Boolean(ok),
    severity: ok ? "pass" : severity,
    status: ok ? "pass" : severity,
    message,
    details,
  };
}

function validatePullRequest(args, input) {
  const checks = [];
  const missingDataSeverity = args.allow_missing_api_data ? "warning" : "error";

  const title = normalizeString(input.title);
  const body = normalizeString(input.body);
  const linkedIssueText = `${title}\n${body}\n${input.head_branch}`;
  const changedLines = input.additions + input.deletions;
  const blockedPathMatches = findMatchingPatterns(
    input.changed_files,
    args.blocked_paths,
  );
  const sensitivePathMatches = findMatchingPatterns(
    input.changed_files,
    args.sensitive_paths,
  );
  const blockedHeadPattern = args.blocked_head_patterns.find((pattern) =>
    safeTest(pattern, input.head_branch),
  );
  const blockedLabelMatches = input.labels.filter((label) =>
    args.blocked_labels.includes(label),
  );
  const missingRequiredLabels = args.required_labels.filter(
    (label) => !input.labels.includes(label),
  );
  const disallowedLabels = args.allowed_labels.length
    ? input.labels.filter((label) => !args.allowed_labels.includes(label))
    : [];
  const templateLeftovers = args.template_leftovers.filter((text) =>
    body.toLowerCase().includes(text.toLowerCase()),
  );
  const checklist = checklistStats(body);
  const approvals = approvalCount(input.reviews, input.author);

  checks.push(
    makeCheck(
      "pull-request-number",
      "Pull request number",
      Boolean(input.number),
      "error",
      input.number
        ? `Pull request number resolved: #${input.number}`
        : "Pull request number could not be resolved.",
      {
        number: input.number,
      },
    ),
  );

  checks.push(
    makeCheck(
      "pull-request-kind",
      "Pull request event",
      !args.require_pull_request || input.kind === "pull_request",
      "error",
      input.kind === "pull_request"
        ? "Current item is a pull request."
        : `Current item is not confirmed as a pull request: ${input.kind}`,
      {
        kind: input.kind,
        require_pull_request: args.require_pull_request,
      },
    ),
  );

  checks.push(
    makeCheck(
      "draft-policy",
      "Draft pull request policy",
      args.allow_drafts || !input.draft,
      "error",
      input.draft ? "Pull request is a draft." : "Pull request is not a draft.",
      {
        draft: input.draft,
        allow_drafts: args.allow_drafts,
      },
    ),
  );

  checks.push(
    makeCheck(
      "bot-author-policy",
      "Bot author policy",
      args.allow_bots || !isBotUsername(input.author),
      "error",
      isBotUsername(input.author)
        ? `Pull request author appears to be a bot: ${input.author}`
        : "Pull request author is not detected as a bot.",
      {
        author: input.author,
        allow_bots: args.allow_bots,
      },
    ),
  );

  checks.push(
    makeCheck(
      "title-present",
      "Title present",
      !args.require_title || Boolean(title),
      "error",
      title
        ? "Pull request title is present."
        : "Pull request title is missing.",
      {
        title,
      },
    ),
  );

  checks.push(
    makeCheck(
      "title-length",
      "Title length",
      !title ||
        (title.length >= args.min_title_length &&
          title.length <= args.max_title_length),
      "error",
      `Title length is ${title.length}; allowed range is ${args.min_title_length}-${args.max_title_length}.`,
      {
        length: title.length,
        min_title_length: args.min_title_length,
        max_title_length: args.max_title_length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "title-pattern",
      "Title format",
      !args.require_title_pattern ||
        !title ||
        safeTest(args.title_pattern, title),
      "error",
      safeTest(args.title_pattern, title)
        ? "Pull request title matches the required pattern."
        : "Pull request title does not match the required pattern.",
      {
        title_pattern: args.title_pattern,
      },
    ),
  );

  checks.push(
    makeCheck(
      "title-not-blocked",
      "Blocked title text",
      !title || !safeTest(args.blocked_title_pattern, title, "i"),
      "error",
      safeTest(args.blocked_title_pattern, title, "i")
        ? "Pull request title contains blocked wording."
        : "Pull request title does not contain blocked wording.",
      {
        blocked_title_pattern: args.blocked_title_pattern,
      },
    ),
  );

  checks.push(
    makeCheck(
      "body-present",
      "Body present",
      !args.require_body || body.length >= args.min_body_length,
      "error",
      body.length >= args.min_body_length
        ? "Pull request body is present and long enough."
        : `Pull request body must be at least ${args.min_body_length} character(s).`,
      {
        body_length: body.length,
        min_body_length: args.min_body_length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "body-template-clean",
      "Template placeholders removed",
      templateLeftovers.length === 0,
      "error",
      templateLeftovers.length
        ? `Pull request body appears to contain template leftovers: ${templateLeftovers.join(", ")}`
        : "Pull request body does not contain configured template leftovers.",
      {
        template_leftovers: templateLeftovers,
      },
    ),
  );

  checks.push(
    makeCheck(
      "checklist-complete",
      "Checklist complete",
      !args.require_checked_checklist || checklist.unchecked === 0,
      "error",
      checklist.unchecked === 0
        ? "All checklist items are checked."
        : `Pull request has ${checklist.unchecked} unchecked checklist item(s).`,
      checklist,
    ),
  );

  checks.push(
    makeCheck(
      "linked-issue",
      "Linked issue reference",
      !args.require_linked_issue ||
        safeTest(args.linked_issue_pattern, linkedIssueText, "i"),
      "error",
      safeTest(args.linked_issue_pattern, linkedIssueText, "i")
        ? "Pull request contains a linked issue reference."
        : "Pull request must include a linked issue reference.",
      {
        linked_issue_pattern: args.linked_issue_pattern,
      },
    ),
  );

  checks.push(
    makeCheck(
      "base-branch-allowed",
      "Allowed base branch",
      !args.allowed_base_branches.length ||
        args.allowed_base_branches.includes(input.base_branch),
      "error",
      args.allowed_base_branches.includes(input.base_branch)
        ? `Base branch is allowed: ${input.base_branch}`
        : `Base branch is not in the allowed list: ${input.base_branch || "unknown"}`,
      {
        base_branch: input.base_branch,
        allowed_base_branches: args.allowed_base_branches,
      },
    ),
  );

  checks.push(
    makeCheck(
      "base-branch-not-blocked",
      "Blocked base branch",
      !args.blocked_base_branches.includes(input.base_branch),
      "error",
      args.blocked_base_branches.includes(input.base_branch)
        ? `Base branch is blocked: ${input.base_branch}`
        : "Base branch is not blocked.",
      {
        base_branch: input.base_branch,
        blocked_base_branches: args.blocked_base_branches,
      },
    ),
  );

  checks.push(
    makeCheck(
      "head-branch-not-base",
      "Head/base branch separation",
      !input.head_branch ||
        !input.base_branch ||
        input.head_branch !== input.base_branch,
      "error",
      input.head_branch &&
        input.base_branch &&
        input.head_branch === input.base_branch
        ? "Head branch must not be the same as the base branch."
        : "Head branch differs from base branch.",
      {
        head_branch: input.head_branch,
        base_branch: input.base_branch,
      },
    ),
  );

  checks.push(
    makeCheck(
      "head-branch-not-blocked",
      "Blocked head branch patterns",
      !blockedHeadPattern,
      "error",
      blockedHeadPattern
        ? `Head branch matches blocked pattern: ${blockedHeadPattern}`
        : "Head branch does not match a blocked pattern.",
      {
        head_branch: input.head_branch,
        blocked_head_pattern: blockedHeadPattern || "",
      },
    ),
  );

  checks.push(
    makeCheck(
      "labels-present",
      "Labels present",
      !args.require_labels || input.labels.length > 0,
      "error",
      input.labels.length
        ? `Pull request has ${input.labels.length} label(s).`
        : "Pull request must have at least one label.",
      {
        labels: input.labels,
      },
    ),
  );

  checks.push(
    makeCheck(
      "required-labels",
      "Required labels",
      missingRequiredLabels.length === 0,
      "error",
      missingRequiredLabels.length
        ? `Pull request is missing required label(s): ${missingRequiredLabels.join(", ")}`
        : "Pull request has all required labels.",
      {
        required_labels: args.required_labels,
        missing_required_labels: missingRequiredLabels,
      },
    ),
  );

  checks.push(
    makeCheck(
      "blocked-labels",
      "Blocked labels",
      blockedLabelMatches.length === 0,
      "error",
      blockedLabelMatches.length
        ? `Pull request has blocked label(s): ${blockedLabelMatches.join(", ")}`
        : "Pull request has no blocked labels.",
      {
        blocked_labels: args.blocked_labels,
        blocked_label_matches: blockedLabelMatches,
      },
    ),
  );

  checks.push(
    makeCheck(
      "allowed-labels",
      "Allowed labels",
      disallowedLabels.length === 0,
      "error",
      disallowedLabels.length
        ? `Pull request has label(s) outside the allowlist: ${disallowedLabels.join(", ")}`
        : "Pull request labels are allowed.",
      {
        allowed_labels: args.allowed_labels,
        disallowed_labels: disallowedLabels,
      },
    ),
  );

  checks.push(
    makeCheck(
      "assignee-required",
      "Assignee required",
      !args.require_assignee || input.assignees.length > 0,
      "error",
      input.assignees.length
        ? `Pull request has ${input.assignees.length} assignee(s).`
        : "Pull request must have at least one assignee.",
      {
        assignees: input.assignees,
      },
    ),
  );

  checks.push(
    makeCheck(
      "milestone-required",
      "Milestone required",
      !args.require_milestone ||
        Boolean(input.milestone.number || input.milestone.title),
      "error",
      input.milestone.number || input.milestone.title
        ? `Pull request has milestone: ${input.milestone.title || input.milestone.number}`
        : "Pull request must have a milestone.",
      {
        milestone: input.milestone,
      },
    ),
  );

  checks.push(
    makeCheck(
      "reviewers-required",
      "Reviewers required",
      !args.require_reviewers || input.reviewers.length > 0,
      "error",
      input.reviewers.length
        ? `Pull request has ${input.reviewers.length} requested reviewer(s).`
        : "Pull request must have at least one requested reviewer.",
      {
        reviewers: input.reviewers,
      },
    ),
  );

  checks.push(
    makeCheck(
      "approvals-required",
      "Approvals required",
      !args.require_approvals || approvals >= args.min_approvals,
      "error",
      approvals >= args.min_approvals
        ? `Pull request has ${approvals} approval(s).`
        : `Pull request needs ${args.min_approvals} approval(s); found ${approvals}.`,
      {
        approvals,
        min_approvals: args.min_approvals,
        reviews_available: input.reviews.length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "diff-not-empty",
      "Diff is not empty",
      args.allow_empty_diff ||
        input.changed_file_count > 0 ||
        input.changed_files.length > 0,
      "error",
      input.changed_file_count || input.changed_files.length
        ? "Pull request has changed files."
        : "Pull request has no changed files.",
      {
        changed_file_count: input.changed_file_count,
        changed_files_available: input.changed_files.length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "max-files-changed",
      "Changed file count",
      args.max_files_changed === 0 ||
        input.changed_file_count <= args.max_files_changed,
      "error",
      `Pull request changes ${input.changed_file_count} file(s); maximum is ${args.max_files_changed}.`,
      {
        changed_file_count: input.changed_file_count,
        max_files_changed: args.max_files_changed,
      },
    ),
  );

  checks.push(
    makeCheck(
      "max-additions",
      "Additions limit",
      args.max_additions === 0 || input.additions <= args.max_additions,
      "error",
      `Pull request has ${input.additions} addition(s); maximum is ${args.max_additions}.`,
      {
        additions: input.additions,
        max_additions: args.max_additions,
      },
    ),
  );

  checks.push(
    makeCheck(
      "max-deletions",
      "Deletions limit",
      args.max_deletions === 0 || input.deletions <= args.max_deletions,
      "error",
      `Pull request has ${input.deletions} deletion(s); maximum is ${args.max_deletions}.`,
      {
        deletions: input.deletions,
        max_deletions: args.max_deletions,
      },
    ),
  );

  checks.push(
    makeCheck(
      "max-changed-lines",
      "Changed lines limit",
      args.max_changed_lines === 0 || changedLines <= args.max_changed_lines,
      "error",
      `Pull request changes ${changedLines} line(s); maximum is ${args.max_changed_lines}.`,
      {
        changed_lines: changedLines,
        max_changed_lines: args.max_changed_lines,
      },
    ),
  );

  checks.push(
    makeCheck(
      "blocked-paths",
      "Blocked changed paths",
      blockedPathMatches.length === 0,
      "error",
      blockedPathMatches.length
        ? `Pull request changes blocked path(s): ${blockedPathMatches.map((match) => match.file).join(", ")}`
        : "Pull request does not change blocked paths.",
      {
        blocked_paths: args.blocked_paths,
        matches: blockedPathMatches,
      },
    ),
  );

  checks.push(
    makeCheck(
      "sensitive-paths",
      "Sensitive changed paths",
      true,
      "warning",
      sensitivePathMatches.length
        ? `Pull request changes sensitive path(s): ${sensitivePathMatches.map((match) => match.file).join(", ")}`
        : "Pull request does not change configured sensitive paths.",
      {
        sensitive_paths: args.sensitive_paths,
        matches: sensitivePathMatches,
      },
    ),
  );

  checks.push(
    makeCheck(
      "api-data-available",
      "API data availability",
      input.api.missing_data_warnings.length === 0,
      missingDataSeverity,
      input.api.missing_data_warnings.length
        ? "Some GitHub API data could not be fetched."
        : "GitHub API data was fetched successfully or was not required.",
      {
        warnings: input.api.missing_data_warnings,
        fetched_pull_request: input.api.fetched_pull_request,
        fetched_issue: input.api.fetched_issue,
        fetched_files: input.api.fetched_files,
        fetched_reviews: input.api.fetched_reviews,
      },
    ),
  );

  return checks;
}

function summarizeChecks(checks, args) {
  const errors = checks.filter(
    (check) => !check.ok && check.severity === "error",
  );
  const warnings = checks.filter(
    (check) => !check.ok && check.severity === "warning",
  );
  const passed = checks.filter((check) => check.ok);

  return {
    checks: checks.length,
    passed: passed.length,
    failed: errors.length,
    warnings: warnings.length,
    ok:
      errors.length === 0 && (!args.fail_on_warnings || warnings.length === 0),
  };
}

function prUrl(repository, number) {
  if (!number) return "";

  const base = /^https?:\/\//.test(repository)
    ? repository.replace(/\/+$/g, "")
    : `https://github.com/${repository}`;

  return `${base}/pull/${number}`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  input,
  checks,
) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeChecks(checks, args);
  const errors = checks
    .filter((check) => !check.ok && check.severity === "error")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const warnings = checks
    .filter((check) => !check.ok && check.severity === "warning")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const status =
    totals.failed > 0 ? "invalid" : totals.warnings > 0 ? "warning" : "valid";

  return {
    schema_version: 1,
    type: "repo-enforce-pr-rules",
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
      allowed_base_branches: args.allowed_base_branches,
      blocked_base_branches: args.blocked_base_branches,
      blocked_head_patterns: args.blocked_head_patterns,
      blocked_paths: args.blocked_paths,
      sensitive_paths: args.sensitive_paths,
      required_labels: args.required_labels,
      blocked_labels: args.blocked_labels,
      allowed_labels: args.allowed_labels,
      title_pattern: args.title_pattern,
      blocked_title_pattern: args.blocked_title_pattern,
      linked_issue_pattern: args.linked_issue_pattern,
      require_title_pattern: args.require_title_pattern,
      require_body: args.require_body,
      require_linked_issue: args.require_linked_issue,
      require_labels: args.require_labels,
      require_assignee: args.require_assignee,
      require_milestone: args.require_milestone,
      require_reviewers: args.require_reviewers,
      require_approvals: args.require_approvals,
      require_checked_checklist: args.require_checked_checklist,
      allow_drafts: args.allow_drafts,
      allow_bots: args.allow_bots,
      allow_empty_diff: args.allow_empty_diff,
      allow_missing_api_data: args.allow_missing_api_data,
      min_title_length: args.min_title_length,
      max_title_length: args.max_title_length,
      min_body_length: args.min_body_length,
      max_files_changed: args.max_files_changed,
      max_additions: args.max_additions,
      max_deletions: args.max_deletions,
      max_changed_lines: args.max_changed_lines,
      min_approvals: args.min_approvals,
      fail_on_warnings: args.fail_on_warnings,
      dry_run: args.dry_run,
    },
    pull_request: {
      number: input.number,
      url: prUrl(args.repository, input.number),
      kind: input.kind,
      title: input.title,
      body_length: input.body.length,
      author: input.author,
      actor: input.actor,
      draft: input.draft,
      base_branch: input.base_branch,
      head_branch: input.head_branch,
      base_sha: input.base_sha,
      head_sha: input.head_sha,
      labels: input.labels,
      assignees: input.assignees,
      reviewers: input.reviewers,
      milestone: input.milestone,
      additions: input.additions,
      deletions: input.deletions,
      changed_lines: input.additions + input.deletions,
      changed_file_count: input.changed_file_count,
      changed_files: input.changed_files,
      approvals: approvalCount(input.reviews, input.author),
      reviews: input.reviews,
      mergeable: input.mergeable,
      mergeable_state: input.mergeable_state,
      api: input.api,
    },
    checks,
    totals,
    errors,
    warnings,
    status,
    ok: totals.ok,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const icon = report.ok ? "✅" : report.status === "warning" ? "⚠️" : "❌";

  const lines = [
    `# 🧪 ${PROJECT_NAME} Pull Request Rules`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Pull request: \`#${report.pull_request.number || "unresolved"}\``,
    `- Title: \`${escapeMarkdown(report.pull_request.title || "none")}\``,
    `- Author: \`${report.pull_request.author || "unknown"}\``,
    `- Draft: \`${report.pull_request.draft ? "true" : "false"}\``,
    `- Base branch: \`${escapeMarkdown(report.pull_request.base_branch || "unknown")}\``,
    `- Head branch: \`${escapeMarkdown(report.pull_request.head_branch || "unknown")}\``,
    `- Checks: \`${report.totals.passed}/${report.totals.checks}\` passed`,
    `- Errors: \`${report.totals.failed}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
  ];

  if (report.pull_request.url) {
    lines.push(`Pull request URL: ${report.pull_request.url}`);
    lines.push("");
  }

  lines.push("## 📊 Pull Request Size");
  lines.push("");
  lines.push(`- Changed files: \`${report.pull_request.changed_file_count}\``);
  lines.push(`- Additions: \`${report.pull_request.additions}\``);
  lines.push(`- Deletions: \`${report.pull_request.deletions}\``);
  lines.push(`- Changed lines: \`${report.pull_request.changed_lines}\``);
  lines.push(`- Approvals: \`${report.pull_request.approvals}\``);
  lines.push(
    `- Labels: \`${report.pull_request.labels.join(", ") || "none"}\``,
  );
  lines.push(
    `- Assignees: \`${report.pull_request.assignees.join(", ") || "none"}\``,
  );
  lines.push(
    `- Reviewers: \`${report.pull_request.reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Milestone: \`${escapeMarkdown(report.pull_request.milestone.title || report.pull_request.milestone.number || "none")}\``,
  );

  lines.push("");
  lines.push("## 🧪 Validation Checks");
  lines.push("");
  lines.push("| Status | Check | Severity | Message |");
  lines.push("|---|---|---|---|");

  for (const check of report.checks) {
    const statusIcon = check.ok
      ? "✅"
      : check.severity === "warning"
        ? "⚠️"
        : "❌";

    lines.push(
      `| ${statusIcon} \`${check.status}\` | ${escapeMarkdown(check.title)} | \`${check.severity}\` | ${escapeMarkdown(check.message)} |`,
    );
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(
        `- \`${escapeMarkdown(error.check)}\`: ${escapeMarkdown(error.message)}`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(
        `- \`${escapeMarkdown(warning.check)}\`: ${escapeMarkdown(warning.message)}`,
      );
    }
  }

  if (report.pull_request.changed_files.length) {
    lines.push("");
    lines.push("## 📁 Changed Files");
    lines.push("");

    for (const file of report.pull_request.changed_files.slice(0, 100)) {
      const stats =
        file.additions || file.deletions
          ? ` (+${file.additions}/-${file.deletions})`
          : "";

      lines.push(`- \`${escapeMarkdown(file.filename)}\`${stats}`);
    }

    if (report.pull_request.changed_files.length > 100) {
      lines.push(
        `- ...and \`${report.pull_request.changed_files.length - 100}\` more file(s).`,
      );
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
    `- Fetched PR: \`${report.pull_request.api.fetched_pull_request ? "true" : "false"}\``,
  );
  lines.push(
    `- Fetched issue: \`${report.pull_request.api.fetched_issue ? "true" : "false"}\``,
  );
  lines.push(
    `- Fetched files: \`${report.pull_request.api.fetched_files ? "true" : "false"}\``,
  );
  lines.push(
    `- Fetched reviews: \`${report.pull_request.api.fetched_reviews ? "true" : "false"}\``,
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
  setGitHubOutput("pr_rules_file", report.config.output_file);
  setGitHubOutput("pr_rules_summary_file", report.config.summary_file || "");
  setGitHubOutput("pr_rules_status", report.status);
  setGitHubOutput("pr_rules_ok", report.ok ? "true" : "false");

  setGitHubOutput("pr_number", report.pull_request.number || "");
  setGitHubOutput("pr_url", report.pull_request.url || "");
  setGitHubOutput("pr_title", report.pull_request.title || "");
  setGitHubOutput("pr_author", report.pull_request.author || "");
  setGitHubOutput("pr_base_branch", report.pull_request.base_branch || "");
  setGitHubOutput("pr_head_branch", report.pull_request.head_branch || "");
  setGitHubOutput("pr_draft", report.pull_request.draft ? "true" : "false");

  setGitHubOutput("pr_labels", report.pull_request.labels.join(","));
  setGitHubOutput("pr_labels_json", JSON.stringify(report.pull_request.labels));
  setGitHubOutput("pr_assignees", report.pull_request.assignees.join(","));
  setGitHubOutput(
    "pr_assignees_json",
    JSON.stringify(report.pull_request.assignees),
  );
  setGitHubOutput("pr_reviewers", report.pull_request.reviewers.join(","));
  setGitHubOutput(
    "pr_reviewers_json",
    JSON.stringify(report.pull_request.reviewers),
  );

  setGitHubOutput(
    "pr_changed_files",
    String(report.pull_request.changed_file_count),
  );
  setGitHubOutput("pr_additions", String(report.pull_request.additions));
  setGitHubOutput("pr_deletions", String(report.pull_request.deletions));
  setGitHubOutput(
    "pr_changed_lines",
    String(report.pull_request.changed_lines),
  );
  setGitHubOutput("pr_approvals", String(report.pull_request.approvals));

  setGitHubOutput("pr_rules_checks", String(report.totals.checks));
  setGitHubOutput("pr_rules_passed", String(report.totals.passed));
  setGitHubOutput("pr_rules_errors", String(report.totals.failed));
  setGitHubOutput("pr_rules_warnings", String(report.totals.warnings));
  setGitHubOutput("pr_rules_checks_json", JSON.stringify(report.checks));
  setGitHubOutput("pr_rules_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("pr_rules_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Enforcing pull request rules.");

  const github = getGitMetadata(repoRoot);
  let input = collectEventInput(args, repoRoot, github);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    input.api.missing_data_warnings.push(
      `Unable to enrich pull request input: ${logger.formatError(err)}`,
    );
  }

  const checks = validatePullRequest(args, input);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    checks,
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
