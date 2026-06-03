#!/usr/bin/env node
// .github/scripts/repo/link-issues-prs.js
// =============================================================================
// Aerealith AI — Issue / Pull Request Link Automation
// -----------------------------------------------------------------------------
// Purpose:
//   Detect issue references for a pull request and link them by inserting a
//   managed linked-issues block into the PR body and/or posting a PR comment.
//
// Input:
//   - GitHub event payload
//   - GitHub REST API, when a token is available
//   - Direct CLI/env PR and issue inputs
//   - .github/repo/link-issues-prs.json
//   - .github/repo/link-issues-prs.jsonc
//   - .github/repo/link-issues-prs.yaml
//   - .github/repo/link-issues-prs.yml
//
// Output:
//   - artifacts/repo/link-issues-prs.json
//   - artifacts/repo/link-issues-prs.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Safe dry-run mode.
//   - GitHub links issues and PRs when issue references appear in PR bodies or
//     comments. This script uses managed text, not a hidden GitHub API.
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
    info: (message) => console.log(`[link-issues-prs] ${message}`),
    warn: (message) => console.warn(`[link-issues-prs] WARN: ${message}`),
    error: (message) => console.error(`[link-issues-prs] ERROR: ${message}`),
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
  ".github/repo/link-issues-prs.json",
  ".github/repo/link-issues-prs.jsonc",
  ".github/repo/link-issues-prs.yaml",
  ".github/repo/link-issues-prs.yml",
  ".github/repo/issue-pr-links.json",
  ".github/repo/issue-pr-links.jsonc",
  ".github/repo/issue-pr-links.yaml",
  ".github/repo/issue-pr-links.yml",
  ".github/link-issues-prs.json",
  ".github/link-issues-prs.jsonc",
  ".github/link-issues-prs.yaml",
  ".github/link-issues-prs.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/link-issues-prs.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/link-issues-prs.md";

const MANAGED_BLOCK_START = "<!-- AEREALITH-AI-LINKED-ISSUES:START -->";
const MANAGED_BLOCK_END = "<!-- AEREALITH-AI-LINKED-ISSUES:END -->";

const DEFAULT_ISSUE_REFERENCE_PATTERN =
  "(?:^|[\\s([{:;,-])(?:#|GH-|issue\\s+|issues\\s+)([1-9][0-9]{0,8})\\b|/issues/([1-9][0-9]{0,8})\\b";

const DEFAULT_BRANCH_ISSUE_PATTERN =
  "(?:^|/)(?:[a-z]+-)?([1-9][0-9]{0,8})(?:[-_/]|$)";
const DEFAULT_ISSUE_REFERENCE_REGEX = new RegExp(
  DEFAULT_ISSUE_REFERENCE_PATTERN,
  "gi",
);
const DEFAULT_BRANCH_ISSUE_REGEX = new RegExp(
  DEFAULT_BRANCH_ISSUE_PATTERN,
  "gi",
);

const DEFAULT_LINK_KEYWORD = "Refs";

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

function normalizeIssueNumber(value) {
  const raw = normalizeString(value).replace(/^#/, "");
  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

function normalizeIssueNumbers(value) {
  return [
    ...new Set(
      normalizeStringList(value)
        .flatMap((item) => String(item).split(/[,\s]+/g))
        .map(normalizeIssueNumber)
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
      process.env.LINK_ISSUES_PRS_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.LINK_ISSUES_PRS_CONFIG_FILE || "",

    event_path:
      process.env.LINK_ISSUES_PRS_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file: process.env.LINK_ISSUES_PRS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.LINK_ISSUES_PRS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.LINK_ISSUES_PRS_NUMBER ||
      process.env.PR_NUMBER ||
      process.env.PULL_REQUEST_NUMBER ||
      "",
    pull_request_number:
      process.env.LINK_ISSUES_PRS_PR_NUMBER ||
      process.env.PR_NUMBER ||
      process.env.PULL_REQUEST_NUMBER ||
      "",
    issue_numbers: normalizeIssueNumbers(
      process.env.LINK_ISSUES_PRS_ISSUES ||
        process.env.LINKED_ISSUES ||
        process.env.ISSUE_NUMBERS ||
        process.env.ISSUE_NUMBER ||
        "",
    ),
    exclude_issue_numbers: normalizeIssueNumbers(
      process.env.LINK_ISSUES_PRS_EXCLUDE_ISSUES ||
        process.env.EXCLUDED_ISSUE_NUMBERS ||
        "",
    ),

    title: process.env.LINK_ISSUES_PRS_TITLE || "",
    body: process.env.LINK_ISSUES_PRS_BODY || "",
    head_branch:
      process.env.LINK_ISSUES_PRS_HEAD_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      "",
    base_branch:
      process.env.LINK_ISSUES_PRS_BASE_BRANCH ||
      process.env.GITHUB_BASE_REF ||
      "",
    labels: normalizeLabelList(
      process.env.LINK_ISSUES_PRS_LABELS ||
        process.env.PR_LABELS ||
        process.env.ISSUE_LABELS ||
        "",
    ),

    issue_reference_pattern:
      process.env.LINK_ISSUES_PRS_ISSUE_PATTERN ||
      DEFAULT_ISSUE_REFERENCE_PATTERN,
    branch_issue_pattern:
      process.env.LINK_ISSUES_PRS_BRANCH_ISSUE_PATTERN ||
      DEFAULT_BRANCH_ISSUE_PATTERN,

    link_keyword:
      process.env.LINK_ISSUES_PRS_KEYWORD ||
      process.env.LINK_KEYWORD ||
      DEFAULT_LINK_KEYWORD,

    block_heading: process.env.LINK_ISSUES_PRS_BLOCK_HEADING || "Linked issues",

    update_pr_body: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_UPDATE_PR_BODY,
      true,
    ),
    create_comment: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_CREATE_COMMENT,
      false,
    ),
    use_closing_keyword: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_USE_CLOSING_KEYWORD,
      false,
    ),
    replace_existing_block: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_REPLACE_BLOCK,
      true,
    ),

    detect_from_title: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DETECT_TITLE,
      true,
    ),
    detect_from_body: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DETECT_BODY,
      true,
    ),
    detect_from_branch: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DETECT_BRANCH,
      true,
    ),
    detect_from_commits: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DETECT_COMMITS,
      true,
    ),
    detect_from_event_comment: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DETECT_EVENT_COMMENT,
      true,
    ),

    fetch_pull_request: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FETCH_PR,
      true,
    ),
    fetch_issue: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FETCH_ISSUE,
      true,
    ),
    fetch_commits: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FETCH_COMMITS,
      true,
    ),
    verify_issues: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_VERIFY_ISSUES,
      false,
    ),
    use_config: normalizeBoolean(process.env.LINK_ISSUES_PRS_USE_CONFIG, true),

    skip_drafts: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_SKIP_DRAFTS,
      false,
    ),
    allow_self_link: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_ALLOW_SELF_LINK,
      false,
    ),
    allow_pr_references: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_ALLOW_PR_REFERENCES,
      true,
    ),

    require_pull_request: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_REQUIRE_PR,
      true,
    ),
    fail_if_missing_number: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FAIL_IF_MISSING_NUMBER,
      true,
    ),
    fail_if_no_links: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FAIL_IF_NO_LINKS,
      false,
    ),
    fail_if_issue_missing: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FAIL_IF_ISSUE_MISSING,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_FAIL_ON_ERROR,
      true,
    ),

    max_issues: normalizeInteger(process.env.LINK_ISSUES_PRS_MAX_ISSUES, 20),
    timeout_seconds: normalizeInteger(
      process.env.LINK_ISSUES_PRS_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.LINK_ISSUES_PRS_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.LINK_ISSUES_PRS_STEP_SUMMARY,
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
      args.pull_request_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--issue" ||
      arg === "--issues" ||
      arg === "--issue-number" ||
      arg === "--issue-numbers"
    ) {
      args.issue_numbers.push(...normalizeIssueNumbers(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-issue" || arg === "--exclude-issues") {
      args.exclude_issue_numbers.push(
        ...normalizeIssueNumbers(argv[index + 1]),
      );
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

    if (arg === "--head-branch") {
      args.head_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--base-branch") {
      args.base_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--issue-pattern") {
      args.issue_reference_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--branch-issue-pattern") {
      args.branch_issue_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--keyword" || arg === "--link-keyword") {
      args.link_keyword = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--block-heading") {
      args.block_heading = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--update-pr-body") {
      args.update_pr_body = true;
      continue;
    }

    if (arg === "--no-update-pr-body") {
      args.update_pr_body = false;
      continue;
    }

    if (arg === "--comment" || arg === "--create-comment") {
      args.create_comment = true;
      continue;
    }

    if (arg === "--no-comment" || arg === "--no-create-comment") {
      args.create_comment = false;
      continue;
    }

    if (arg === "--closing-keyword") {
      args.use_closing_keyword = true;
      continue;
    }

    if (arg === "--no-closing-keyword") {
      args.use_closing_keyword = false;
      continue;
    }

    if (arg === "--replace-block") {
      args.replace_existing_block = true;
      continue;
    }

    if (arg === "--no-replace-block") {
      args.replace_existing_block = false;
      continue;
    }

    if (arg === "--detect-title") {
      args.detect_from_title = true;
      continue;
    }

    if (arg === "--no-detect-title") {
      args.detect_from_title = false;
      continue;
    }

    if (arg === "--detect-body") {
      args.detect_from_body = true;
      continue;
    }

    if (arg === "--no-detect-body") {
      args.detect_from_body = false;
      continue;
    }

    if (arg === "--detect-branch") {
      args.detect_from_branch = true;
      continue;
    }

    if (arg === "--no-detect-branch") {
      args.detect_from_branch = false;
      continue;
    }

    if (arg === "--detect-commits") {
      args.detect_from_commits = true;
      continue;
    }

    if (arg === "--no-detect-commits") {
      args.detect_from_commits = false;
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

    if (arg === "--fetch-commits") {
      args.fetch_commits = true;
      continue;
    }

    if (arg === "--no-fetch-commits") {
      args.fetch_commits = false;
      continue;
    }

    if (arg === "--verify-issues") {
      args.verify_issues = true;
      continue;
    }

    if (arg === "--no-verify-issues") {
      args.verify_issues = false;
      continue;
    }

    if (arg === "--use-config") {
      args.use_config = true;
      continue;
    }

    if (arg === "--no-config") {
      args.use_config = false;
      continue;
    }

    if (arg === "--skip-drafts") {
      args.skip_drafts = true;
      continue;
    }

    if (arg === "--no-skip-drafts") {
      args.skip_drafts = false;
      continue;
    }

    if (arg === "--allow-self-link") {
      args.allow_self_link = true;
      continue;
    }

    if (arg === "--no-allow-self-link") {
      args.allow_self_link = false;
      continue;
    }

    if (arg === "--allow-pr-references") {
      args.allow_pr_references = true;
      continue;
    }

    if (arg === "--no-allow-pr-references") {
      args.allow_pr_references = false;
      continue;
    }

    if (arg === "--require-pr") {
      args.require_pull_request = true;
      continue;
    }

    if (arg === "--no-require-pr") {
      args.require_pull_request = false;
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

    if (arg === "--fail-if-no-links") {
      args.fail_if_no_links = true;
      continue;
    }

    if (arg === "--no-fail-if-no-links") {
      args.fail_if_no_links = false;
      continue;
    }

    if (arg === "--fail-if-issue-missing") {
      args.fail_if_issue_missing = true;
      continue;
    }

    if (arg === "--no-fail-if-issue-missing") {
      args.fail_if_issue_missing = false;
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

    if (arg === "--max-issues") {
      args.max_issues = normalizeInteger(argv[index + 1], args.max_issues);
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
  args.number = normalizeIssueNumber(args.pull_request_number || args.number);
  args.pull_request_number = args.number;
  args.issue_numbers = [
    ...new Set(args.issue_numbers.map(normalizeIssueNumber).filter(Boolean)),
  ];
  args.exclude_issue_numbers = [
    ...new Set(
      args.exclude_issue_numbers.map(normalizeIssueNumber).filter(Boolean),
    ),
  ];
  args.title = normalizeString(args.title);
  args.body = normalizeString(args.body);
  args.head_branch = normalizeBranch(args.head_branch);
  args.base_branch = normalizeBranch(args.base_branch);
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.link_keyword = normalizeString(args.link_keyword, DEFAULT_LINK_KEYWORD);
  args.block_heading = normalizeString(args.block_heading, "Linked issues");
  args.max_issues = Math.max(1, Math.min(args.max_issues, 100));
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Issue / Pull Request Link Automation

Usage:
  node .github/scripts/repo/link-issues-prs.js [options]

Examples:
  node .github/scripts/repo/link-issues-prs.js --pr 42 --issue 12
  node .github/scripts/repo/link-issues-prs.js --pr 42 --issues "12,13,14"
  node .github/scripts/repo/link-issues-prs.js --pr 42 --closing-keyword
  node .github/scripts/repo/link-issues-prs.js --pr 42 --comment
  node .github/scripts/repo/link-issues-prs.js --dry-run

Default behavior:
  - Detect issue references from direct input, PR title/body, source branch, and
    commit messages.
  - Insert or update a managed block in the PR body:
      <!-- AEREALITH-AI-LINKED-ISSUES:START -->
      Linked issues: Refs #12, Refs #13
      <!-- AEREALITH-AI-LINKED-ISSUES:END -->

Config example:
  {
    "update_pr_body": true,
    "create_comment": false,
    "use_closing_keyword": false,
    "link_keyword": "Refs",
    "detect_from_title": true,
    "detect_from_body": true,
    "detect_from_branch": true,
    "detect_from_commits": true,
    "verify_issues": false,
    "fail_if_no_links": false
  }

Options:
      --repo <owner/repo>               Repository slug.
      --api-url <url>                   GitHub API URL.
      --token <token>                   GitHub token.
      --config <file>                   Link config file.
      --event-path <file>               GitHub event payload path.
      --number, --pr <number>           Pull request number.
      --issue, --issues <list>          Issue number(s) to link.
      --exclude-issue <list>            Issue number(s) to ignore.
      --title <title>                   Title text to scan.
      --body <body>                     Body text to scan.
      --head-branch <branch>            Source branch to scan.
      --base-branch <branch>            Base branch hint.
      --label <label,list>              Label(s) to include in report.
      --issue-pattern <regex>           Issue reference regex.
      --branch-issue-pattern <regex>    Branch issue number regex.
      --keyword <text>                  Link keyword. Default: Refs.
      --closing-keyword                 Use closing keyword. Default keyword: Closes.
      --no-closing-keyword              Use non-closing keyword. Default.
      --block-heading <text>            Managed block heading.
      --update-pr-body                  Update PR body. Default.
      --no-update-pr-body               Do not update PR body.
      --comment                         Add a PR comment.
      --no-comment                      Do not add a PR comment. Default.
      --replace-block                   Replace existing managed block. Default.
      --no-replace-block                Preserve existing managed block.
      --detect-title                    Detect issues from title. Default.
      --no-detect-title                 Do not scan title.
      --detect-body                     Detect issues from body. Default.
      --no-detect-body                  Do not scan body.
      --detect-branch                   Detect issues from source branch. Default.
      --no-detect-branch                Do not scan branch.
      --detect-commits                  Detect issues from commits. Default.
      --no-detect-commits               Do not scan commits.
      --fetch-pr                        Fetch PR metadata. Default.
      --no-fetch-pr                     Do not fetch PR metadata.
      --fetch-issue                     Fetch issue metadata. Default.
      --no-fetch-issue                  Do not fetch issue metadata.
      --fetch-commits                   Fetch PR commits. Default.
      --no-fetch-commits                Do not fetch PR commits.
      --verify-issues                   Verify linked issues through GitHub API.
      --no-verify-issues                Do not verify linked issues. Default.
      --skip-drafts                     Skip draft PRs.
      --no-skip-drafts                  Link draft PRs. Default.
      --allow-self-link                 Allow linking to the current PR number.
      --no-allow-self-link              Exclude current PR number. Default.
      --allow-pr-references             Allow references that resolve to PRs. Default.
      --no-allow-pr-references          Filter references that resolve to PRs.
      --fail-if-missing-number          Fail when PR number is missing. Default.
      --no-fail-if-missing-number       Do not fail when PR number is missing.
      --fail-if-no-links                Fail when no issue links resolve.
      --no-fail-if-no-links             Do not fail when no issue links resolve. Default.
      --fail-if-issue-missing           Fail if a verified issue is missing.
      --no-fail-if-issue-missing        Warn if a verified issue is missing. Default.
      --max-issues <number>             Maximum issues to link. Default: 20.
      --timeout-seconds <number>        GitHub API timeout. Default: 60.
      --fail-on-error                   Exit non-zero on error. Default.
      --no-fail-on-error                Do not fail workflow.
  -o, --output <file>                   JSON output file.
      --summary <file>                  Markdown summary output file.
      --no-summary                      Do not write Markdown summary.
      --dry-run                         Plan but do not mutate GitHub.
      --no-print                        Do not print JSON report.
      --no-step-summary                 Do not append GitHub step summary.
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

  const stringKeys = [
    "issue_reference_pattern",
    "branch_issue_pattern",
    "link_keyword",
    "block_heading",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = ["issue_numbers", "exclude_issue_numbers", "labels"];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      if (key.includes("issue")) {
        merged[key] = [
          ...new Set([...merged[key], ...normalizeIssueNumbers(config[key])]),
        ];
      } else {
        merged[key] = [
          ...new Set([...merged[key], ...normalizeLabelList(config[key])]),
        ];
      }
    }
  }

  const booleanKeys = [
    "update_pr_body",
    "create_comment",
    "use_closing_keyword",
    "replace_existing_block",
    "detect_from_title",
    "detect_from_body",
    "detect_from_branch",
    "detect_from_commits",
    "detect_from_event_comment",
    "fetch_pull_request",
    "fetch_issue",
    "fetch_commits",
    "verify_issues",
    "skip_drafts",
    "allow_self_link",
    "allow_pr_references",
    "require_pull_request",
    "fail_if_missing_number",
    "fail_if_no_links",
    "fail_if_issue_missing",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_issues !== undefined) {
    merged.max_issues = normalizeInteger(config.max_issues, merged.max_issues);
  }

  merged.issue_numbers = [
    ...new Set(merged.issue_numbers.map(normalizeIssueNumber).filter(Boolean)),
  ];
  merged.exclude_issue_numbers = [
    ...new Set(
      merged.exclude_issue_numbers.map(normalizeIssueNumber).filter(Boolean),
    ),
  ];
  merged.labels = [
    ...new Set(merged.labels.map(normalizeLabel).filter(Boolean)),
  ];
  merged.link_keyword = normalizeString(
    merged.link_keyword,
    DEFAULT_LINK_KEYWORD,
  );
  merged.block_heading = normalizeString(merged.block_heading, "Linked issues");
  merged.max_issues = Math.max(1, Math.min(merged.max_issues, 100));

  return merged;
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-link-issues-prs-script`,
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
      allow_error: true,
    },
  );

  if (response.status_code === 404) {
    return null;
  }

  if (!response.ok) {
    const message =
      typeof response.body === "object" && response.body?.message
        ? response.body.message
        : response.raw_body || `HTTP ${response.status_code}`;

    throw new Error(`Unable to fetch issue #${number}: ${message}`);
  }

  return response.body;
}

async function fetchPullRequestCommits(args, number) {
  const commits = [];
  let page = 1;

  while (page <= 10) {
    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(
          args,
          `/pulls/${encodeURIComponent(number)}/commits?per_page=100&page=${page}`,
        ),
      ),
      {
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    commits.push(
      ...body.map((commit) => ({
        sha: normalizeString(commit.sha),
        short_sha: normalizeString(commit.sha).slice(0, 12),
        message: normalizeString(commit.commit?.message),
        author: normalizeUsername(
          commit.author?.login || commit.commit?.author?.name,
        ),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return commits;
}

async function updatePullRequestBody(args, number, body) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/pulls/${encodeURIComponent(number)}`)),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        body,
      },
    },
  );

  return response.body;
}

async function createPullRequestComment(args, number, body) {
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
  return "unknown";
}

function collectEventInput(args, repoRoot, github) {
  const event = args.event_path
    ? readJsonFile(args.event_path, repoRoot, null)
    : null;
  const pull = event?.pull_request || null;
  const issue = event?.issue || null;
  const item = pull || issue || null;
  const eventNumber = getEventNumber(event);
  const number = normalizeIssueNumber(
    args.pull_request_number || args.number || eventNumber,
  );

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
    author: normalizeUsername(item?.user?.login || event?.sender?.login),
    actor: normalizeUsername(github.actor || event?.sender?.login),
    draft: Boolean(pull?.draft),
    head_branch: normalizeBranch(
      args.head_branch || pull?.head?.ref || github.branch,
    ),
    base_branch: normalizeBranch(
      args.base_branch || pull?.base?.ref || github.base_branch,
    ),
    labels: [
      ...new Set(
        [...args.labels, ...labelsFromItems(item?.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
    ],
    event_comment_body: normalizeString(event?.comment?.body),
    direct_issue_numbers: args.issue_numbers,
    commits: [],
    api: {
      fetched_pull_request: false,
      fetched_issue: false,
      fetched_commits: false,
      missing_data_warnings: [],
    },
  };
}

async function enrichInput(args, input) {
  const enriched = {
    ...input,
    labels: [...input.labels],
    commits: [...input.commits],
    api: {
      ...input.api,
      missing_data_warnings: [...input.api.missing_data_warnings],
    },
  };

  if (!args.token) {
    if (
      args.fetch_pull_request ||
      args.fetch_issue ||
      args.fetch_commits ||
      args.verify_issues
    ) {
      enriched.api.missing_data_warnings.push(
        "GitHub token is missing, so API enrichment was skipped.",
      );
    }

    return enriched;
  }

  if (!enriched.number) return enriched;

  if (args.fetch_pull_request) {
    try {
      const pull = await fetchPullRequest(args, enriched.number);

      enriched.api.fetched_pull_request = true;
      enriched.kind = "pull_request";
      enriched.title = enriched.title || normalizeString(pull.title);
      enriched.body = enriched.body || normalizeString(pull.body);
      enriched.author = enriched.author || normalizeUsername(pull.user?.login);
      enriched.draft = Boolean(pull.draft);
      enriched.head_branch =
        enriched.head_branch || normalizeBranch(pull.head?.ref);
      enriched.base_branch =
        enriched.base_branch || normalizeBranch(pull.base?.ref);
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch pull request metadata: ${logger.formatError(err)}`,
      );
    }
  }

  if (args.fetch_issue) {
    try {
      const issue = await fetchIssue(args, enriched.number);

      if (issue) {
        enriched.api.fetched_issue = true;
        enriched.labels = [
          ...new Set(
            [...enriched.labels, ...labelsFromItems(issue.labels)]
              .map(normalizeLabel)
              .filter(Boolean),
          ),
        ];
      }
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch issue metadata: ${logger.formatError(err)}`,
      );
    }
  }

  if (
    args.fetch_commits &&
    args.detect_from_commits &&
    enriched.kind === "pull_request"
  ) {
    try {
      enriched.commits = await fetchPullRequestCommits(args, enriched.number);
      enriched.api.fetched_commits = true;
    } catch (err) {
      enriched.api.missing_data_warnings.push(
        `Unable to fetch pull request commits: ${logger.formatError(err)}`,
      );
    }
  }

  return enriched;
}

function regexFromPattern(pattern, flags = "gi") {
  const source = normalizeString(pattern);

  if (!source) return null;

  if (source === DEFAULT_ISSUE_REFERENCE_PATTERN) {
    return new RegExp(DEFAULT_ISSUE_REFERENCE_REGEX.source, "gi");
  }

  if (source === DEFAULT_BRANCH_ISSUE_PATTERN) {
    return new RegExp(DEFAULT_BRANCH_ISSUE_REGEX.source, "gi");
  }

  return null;
}

function extractIssueNumbersFromText(text, pattern, sourceName) {
  const source = String(text || "");
  const matches = [];

  if (!source.trim()) return matches;

  let regex = null;

  try {
    regex = regexFromPattern(pattern, "gi");
  } catch {
    return matches;
  }

  if (!regex) return matches;

  let match = regex.exec(source);

  while (match) {
    const number =
      normalizeIssueNumber(match[1]) ||
      normalizeIssueNumber(match[2]) ||
      normalizeIssueNumber(match[3]) ||
      normalizeIssueNumber(match[0].match(/[1-9][0-9]{0,8}/)?.[0]) ||
      "";

    if (number) {
      matches.push({
        number,
        source: sourceName,
        match: match[0].trim(),
      });
    }

    if (match.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }

    match = regex.exec(source);
  }

  return matches;
}

function uniqueIssueRecords(records) {
  const map = new Map();

  for (const record of records) {
    const number = normalizeIssueNumber(record.number);

    if (!number) continue;

    if (!map.has(number)) {
      map.set(number, {
        number,
        sources: [],
        matches: [],
      });
    }

    const current = map.get(number);

    if (record.source && !current.sources.includes(record.source)) {
      current.sources.push(record.source);
    }

    if (record.match && !current.matches.includes(record.match)) {
      current.matches.push(record.match);
    }
  }

  return [...map.values()];
}

function resolveIssueLinks(args, input) {
  const records = [];

  for (const number of input.direct_issue_numbers) {
    records.push({
      number,
      source: "direct",
      match: `#${number}`,
    });
  }

  if (args.detect_from_title) {
    records.push(
      ...extractIssueNumbersFromText(
        input.title,
        args.issue_reference_pattern,
        "title",
      ),
    );
  }

  if (args.detect_from_body) {
    records.push(
      ...extractIssueNumbersFromText(
        input.body,
        args.issue_reference_pattern,
        "body",
      ),
    );
  }

  if (args.detect_from_branch) {
    records.push(
      ...extractIssueNumbersFromText(
        input.head_branch,
        args.branch_issue_pattern,
        "head-branch",
      ),
    );
  }

  if (args.detect_from_event_comment) {
    records.push(
      ...extractIssueNumbersFromText(
        input.event_comment_body,
        args.issue_reference_pattern,
        "event-comment",
      ),
    );
  }

  if (args.detect_from_commits) {
    for (const commit of input.commits) {
      records.push(
        ...extractIssueNumbersFromText(
          commit.message,
          args.issue_reference_pattern,
          `commit:${commit.short_sha || commit.sha}`,
        ),
      );
    }
  }

  const excluded = new Set(args.exclude_issue_numbers);
  const filtered = uniqueIssueRecords(records)
    .filter((record) => !excluded.has(record.number))
    .filter((record) => args.allow_self_link || record.number !== input.number)
    .slice(0, args.max_issues);

  const skipped = uniqueIssueRecords(records)
    .filter(
      (record) =>
        excluded.has(record.number) ||
        (!args.allow_self_link && record.number === input.number),
    )
    .map((record) => ({
      ...record,
      reason: excluded.has(record.number) ? "excluded" : "self-link",
    }));

  return {
    records: filtered,
    skipped,
    issue_numbers: filtered.map((record) => record.number),
  };
}

async function verifyResolvedIssues(args, issueRecords) {
  const verified = [];
  const errors = [];
  const warnings = [];

  if (!args.verify_issues || !args.token) {
    return {
      verified,
      errors,
      warnings,
      checked: false,
    };
  }

  for (const record of issueRecords) {
    try {
      const issue = await fetchIssue(args, record.number);

      if (!issue) {
        const message = `Issue #${record.number} was not found.`;

        if (args.fail_if_issue_missing) {
          errors.push(message);
        } else {
          warnings.push(message);
        }

        continue;
      }

      if (issue.pull_request && !args.allow_pr_references) {
        warnings.push(
          `Reference #${record.number} resolves to a pull request and was filtered.`,
        );
        continue;
      }

      verified.push({
        number: record.number,
        title: normalizeString(issue.title),
        state: normalizeString(issue.state),
        html_url: normalizeString(issue.html_url),
        is_pull_request: Boolean(issue.pull_request),
        sources: record.sources,
        matches: record.matches,
      });
    } catch (err) {
      const message = logger.formatError(err);

      if (args.fail_if_issue_missing) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  return {
    verified,
    errors,
    warnings,
    checked: true,
  };
}

function keywordForLinks(args) {
  if (args.use_closing_keyword) return "Closes";
  return normalizeString(args.link_keyword, DEFAULT_LINK_KEYWORD);
}

function renderIssueReference(args, number) {
  return `${keywordForLinks(args)} #${number}`;
}

function renderManagedBlock(args, issueNumbers) {
  const references = issueNumbers
    .map((number) => renderIssueReference(args, number))
    .join(", ");

  return [
    MANAGED_BLOCK_START,
    `${args.block_heading}: ${references}`,
    MANAGED_BLOCK_END,
  ].join("\n");
}

function hasManagedBlock(body) {
  return (
    String(body || "").includes(MANAGED_BLOCK_START) &&
    String(body || "").includes(MANAGED_BLOCK_END)
  );
}

function upsertManagedBlock(body, block, replaceExisting = true) {
  const source = String(body || "").trimEnd();
  const startIndex = source.indexOf(MANAGED_BLOCK_START);
  const endIndex = source.indexOf(MANAGED_BLOCK_END);

  if (startIndex >= 0 && endIndex >= startIndex) {
    if (!replaceExisting) {
      return source;
    }

    const before = source.slice(0, startIndex).trimEnd();
    const after = source.slice(endIndex + MANAGED_BLOCK_END.length).trimStart();

    return [before, block, after].filter(Boolean).join("\n\n").trim();
  }

  return [source, block].filter(Boolean).join("\n\n").trim();
}

function renderCommentBody(args, issueNumbers) {
  return [
    "## 🔗 Linked issues",
    "",
    issueNumbers
      .map((number) => `- ${renderIssueReference(args, number)}`)
      .join("\n"),
    "",
    "_Managed by Aerealith AI repository automation._",
  ].join("\n");
}

function existingBodyContainsIssueLinks(body, issueNumbers) {
  const text = String(body || "");

  return issueNumbers.every((number) =>
    new RegExp(`(^|[^0-9])#${number}([^0-9]|$)`).test(text),
  );
}

async function executeLinking(args, input, resolvedLinks, verification) {
  const startedAt = new Date();

  const issueNumbers = verification.checked
    ? verification.verified.map((issue) => issue.number)
    : resolvedLinks.issue_numbers;

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    issue_numbers,
    skipped_issue_numbers: resolvedLinks.skipped.map((record) => record.number),
    update_pr_body: args.update_pr_body,
    create_comment: args.create_comment,
    body_changed: false,
    comment_created: false,
    comment_url: "",
    managed_block_present_before: hasManagedBlock(input.body),
    errors: [...verification.errors],
    warnings: [...verification.warnings, ...input.api.missing_data_warnings],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!input.number) {
      result.status = args.fail_if_missing_number ? "invalid" : "skipped";
      result.success = !args.fail_if_missing_number;
      result.errors.push("Pull request number could not be resolved.");
      return result;
    }

    if (args.require_pull_request && input.kind !== "pull_request") {
      result.status = "invalid";
      result.success = false;
      result.errors.push(
        `Current item is not confirmed as a pull request: ${input.kind}`,
      );
      return result;
    }

    if (args.skip_drafts && input.draft) {
      result.status = "skipped-draft";
      result.success = true;
      result.warnings.push("Draft pull request linking skipped.");
      return result;
    }

    if (!issueNumbers.length) {
      result.status = args.fail_if_no_links ? "invalid" : "skipped";
      result.success = !args.fail_if_no_links;
      result.errors.push("No issue links resolved.");
      return result;
    }

    if (result.errors.length) {
      result.status = "invalid";
      result.success = false;
      return result;
    }

    const managedBlock = renderManagedBlock(args, issueNumbers);
    const updatedBody = upsertManagedBlock(
      input.body,
      managedBlock,
      args.replace_existing_block,
    );
    const bodyWouldChange =
      args.update_pr_body && updatedBody !== String(input.body || "").trimEnd();
    const alreadyLinked = existingBodyContainsIssueLinks(
      input.body,
      issueNumbers,
    );

    if (!bodyWouldChange && !args.create_comment && alreadyLinked) {
      result.status = "already-linked";
      result.success = true;
      return result;
    }

    if (!args.update_pr_body && !args.create_comment) {
      result.status = alreadyLinked ? "already-linked" : "planned-noop";
      result.success = true;
      result.warnings.push("Neither PR body updates nor comments are enabled.");
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.body_changed = bodyWouldChange;
      result.comment_created = args.create_comment;
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.success = false;
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, LINK_ISSUES_PRS_TOKEN, or --token.",
      );
      return result;
    }

    if (args.update_pr_body && bodyWouldChange) {
      logger.info(`Updating linked issue block on PR #${input.number}.`);
      await updatePullRequestBody(args, input.number, updatedBody);
      result.body_changed = true;
    }

    if (args.create_comment) {
      logger.info(`Creating linked issue comment on PR #${input.number}.`);
      const comment = await createPullRequestComment(
        args,
        input.number,
        renderCommentBody(args, issueNumbers),
      );
      result.comment_created = true;
      result.comment_url = normalizeString(comment?.html_url);
    }

    result.status = "linked";
    result.success = true;

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

function prUrl(repository, number) {
  if (!number) return "";

  const base = /^https?:\/\//.test(repository)
    ? repository.replace(/\/+$/g, "")
    : `https://github.com/${repository}`;

  return `${base}/pull/${number}`;
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
  input,
  resolvedLinks,
  verification,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const ok = execution.success && execution.errors.length === 0;

  return {
    schema_version: 1,
    type: "repo-link-issues-prs",
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
      update_pr_body: args.update_pr_body,
      create_comment: args.create_comment,
      use_closing_keyword: args.use_closing_keyword,
      link_keyword: keywordForLinks(args),
      block_heading: args.block_heading,
      replace_existing_block: args.replace_existing_block,
      detect_from_title: args.detect_from_title,
      detect_from_body: args.detect_from_body,
      detect_from_branch: args.detect_from_branch,
      detect_from_commits: args.detect_from_commits,
      detect_from_event_comment: args.detect_from_event_comment,
      fetch_pull_request: args.fetch_pull_request,
      fetch_issue: args.fetch_issue,
      fetch_commits: args.fetch_commits,
      verify_issues: args.verify_issues,
      allow_self_link: args.allow_self_link,
      allow_pr_references: args.allow_pr_references,
      max_issues: args.max_issues,
      dry_run: args.dry_run,
    },
    pull_request: {
      number: input.number,
      url: prUrl(args.repository, input.number),
      kind: input.kind,
      title: input.title,
      author: input.author,
      actor: input.actor,
      draft: input.draft,
      head_branch: input.head_branch,
      base_branch: input.base_branch,
      labels: input.labels,
      managed_block_present_before: execution.managed_block_present_before,
      api: input.api,
    },
    links: {
      issue_numbers: execution.issue_numbers,
      issue_urls: execution.issue_numbers.map((number) =>
        issueUrl(args.repository, number),
      ),
      records: resolvedLinks.records,
      skipped: resolvedLinks.skipped,
      verified: verification.verified,
      verification_checked: verification.checked,
    },
    execution,
    totals: {
      issue_links: execution.issue_numbers.length,
      skipped_issue_links: execution.skipped_issue_numbers.length,
      detected_records: resolvedLinks.records.length,
      verified_issues: verification.verified.length,
      commits_scanned: input.commits.length,
      errors: execution.errors.length,
      warnings: execution.warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const icon = report.ok
    ? report.status.startsWith("skipped")
      ? "⏭️"
      : "✅"
    : "❌";

  const lines = [
    `# 🔗 ${PROJECT_NAME} Issue / PR Linking`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Pull request: \`#${report.pull_request.number || "unresolved"}\``,
    `- Linked issues: \`${report.links.issue_numbers.map((number) => `#${number}`).join(", ") || "none"}\``,
    `- Body changed: \`${report.execution.body_changed ? "true" : "false"}\``,
    `- Comment created: \`${report.execution.comment_created ? "true" : "false"}\``,
    `- Commits scanned: \`${report.totals.commits_scanned}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
  ];

  if (report.pull_request.url) {
    lines.push(`Pull request URL: ${report.pull_request.url}`);
    lines.push("");
  }

  if (report.execution.comment_url) {
    lines.push(`Comment URL: ${report.execution.comment_url}`);
    lines.push("");
  }

  lines.push("## 🎯 Pull Request");
  lines.push("");
  lines.push(
    `- Title: \`${escapeMarkdown(report.pull_request.title || "none")}\``,
  );
  lines.push(`- Author: \`${report.pull_request.author || "unknown"}\``);
  lines.push(`- Actor: \`${report.pull_request.actor || "unknown"}\``);
  lines.push(`- Draft: \`${report.pull_request.draft ? "true" : "false"}\``);
  lines.push(
    `- Head branch: \`${escapeMarkdown(report.pull_request.head_branch || "unknown")}\``,
  );
  lines.push(
    `- Base branch: \`${escapeMarkdown(report.pull_request.base_branch || "unknown")}\``,
  );
  lines.push(
    `- Labels: \`${report.pull_request.labels.join(", ") || "none"}\``,
  );

  lines.push("");
  lines.push("## 🔗 Resolved Links");
  lines.push("");

  if (!report.links.issue_numbers.length) {
    lines.push("No issue links resolved.");
  } else {
    lines.push("| Issue | Sources | Matches |");
    lines.push("|---|---|---|");

    for (const record of report.links.records) {
      if (!report.links.issue_numbers.includes(record.number)) continue;

      lines.push(
        `| #${record.number} | \`${escapeMarkdown(record.sources.join(", ") || "unknown")}\` | \`${escapeMarkdown(record.matches.join(", ") || "none")}\` |`,
      );
    }
  }

  if (report.links.skipped.length) {
    lines.push("");
    lines.push("## ⏭️ Skipped Links");
    lines.push("");
    lines.push("| Issue | Reason | Sources |");
    lines.push("|---|---|---|");

    for (const record of report.links.skipped) {
      lines.push(
        `| #${record.number} | \`${escapeMarkdown(record.reason || "skipped")}\` | \`${escapeMarkdown(record.sources.join(", ") || "unknown")}\` |`,
      );
    }
  }

  if (report.links.verified.length) {
    lines.push("");
    lines.push("## ✅ Verified Issues");
    lines.push("");
    lines.push("| Issue | State | Type | Title |");
    lines.push("|---|---|---|---|");

    for (const issue of report.links.verified) {
      lines.push(
        `| #${issue.number} | \`${escapeMarkdown(issue.state || "unknown")}\` | \`${issue.is_pull_request ? "pull_request" : "issue"}\` | ${escapeMarkdown(issue.title || "none")} |`,
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
    `- Update PR body: \`${report.config.update_pr_body ? "true" : "false"}\``,
  );
  lines.push(
    `- Create comment: \`${report.config.create_comment ? "true" : "false"}\``,
  );
  lines.push(
    `- Link keyword: \`${escapeMarkdown(report.config.link_keyword)}\``,
  );
  lines.push(
    `- Verify issues: \`${report.config.verify_issues ? "true" : "false"}\``,
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
  setGitHubOutput("link_issues_prs_file", report.config.output_file);
  setGitHubOutput(
    "link_issues_prs_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("link_issues_prs_status", report.status);
  setGitHubOutput("link_issues_prs_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "link_issues_prs_pr_number",
    report.pull_request.number || "",
  );
  setGitHubOutput("link_issues_prs_pr_url", report.pull_request.url || "");
  setGitHubOutput(
    "link_issues_prs_issues",
    report.links.issue_numbers.join(","),
  );
  setGitHubOutput(
    "link_issues_prs_issues_json",
    JSON.stringify(report.links.issue_numbers),
  );
  setGitHubOutput(
    "link_issues_prs_issue_urls_json",
    JSON.stringify(report.links.issue_urls),
  );

  setGitHubOutput(
    "link_issues_prs_body_changed",
    report.execution.body_changed ? "true" : "false",
  );
  setGitHubOutput(
    "link_issues_prs_comment_created",
    report.execution.comment_created ? "true" : "false",
  );
  setGitHubOutput(
    "link_issues_prs_comment_url",
    report.execution.comment_url || "",
  );

  setGitHubOutput("link_issues_prs_errors", String(report.totals.errors));
  setGitHubOutput("link_issues_prs_warnings", String(report.totals.warnings));
  setGitHubOutput(
    "link_issues_prs_records_json",
    JSON.stringify(report.links.records),
  );
  setGitHubOutput(
    "link_issues_prs_verified_json",
    JSON.stringify(report.links.verified),
  );
  setGitHubOutput("link_issues_prs_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "link_issues_prs_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing issue / pull request linking.");

  const github = getGitMetadata(repoRoot);
  let input = collectEventInput(args, repoRoot, github);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    input.api.missing_data_warnings.push(
      `Unable to enrich pull request input: ${logger.formatError(err)}`,
    );
  }

  const resolvedLinks = resolveIssueLinks(args, input);
  const verification = await verifyResolvedIssues(args, resolvedLinks.records);
  const execution = await executeLinking(
    args,
    input,
    resolvedLinks,
    verification,
  );

  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    resolvedLinks,
    verification,
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
