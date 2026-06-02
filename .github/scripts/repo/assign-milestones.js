#!/usr/bin/env node
// .github/scripts/repo/assign-milestones.js
// =============================================================================
// Aerealith AI — Repository Milestone Automation
// -----------------------------------------------------------------------------
// Purpose:
//   Assign, replace, or clear GitHub milestones on issues and pull requests from
//   direct inputs, workflow event payloads, labels, changed paths, titles,
//   bodies, authors, and configurable rules.
//
// Input:
//   - GitHub event payload
//   - .github/repo/assign-milestones.json
//   - .github/repo/assign-milestones.jsonc
//   - .github/repo/assign-milestones.yaml
//   - .github/repo/assign-milestones.yml
//   - .github/repo/milestones.json
//   - .github/repo/milestones.yaml
//
// Output:
//   - artifacts/repo/assign-milestones.json
//   - artifacts/repo/assign-milestones.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Safe dry-run mode.
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
    info: (message) => console.log(`[assign-milestones] ${message}`),
    warn: (message) => console.warn(`[assign-milestones] WARN: ${message}`),
    error: (message) => console.error(`[assign-milestones] ERROR: ${message}`),
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
  ".github/repo/assign-milestones.json",
  ".github/repo/assign-milestones.jsonc",
  ".github/repo/assign-milestones.yaml",
  ".github/repo/assign-milestones.yml",
  ".github/repo/milestone-rules.json",
  ".github/repo/milestone-rules.jsonc",
  ".github/repo/milestone-rules.yaml",
  ".github/repo/milestone-rules.yml",
  ".github/repo/milestones.json",
  ".github/repo/milestones.jsonc",
  ".github/repo/milestones.yaml",
  ".github/repo/milestones.yml",
  ".github/assign-milestones.json",
  ".github/assign-milestones.jsonc",
  ".github/assign-milestones.yaml",
  ".github/assign-milestones.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/assign-milestones.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/assign-milestones.md";

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

function normalizeLabel(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeLabelList(value) {
  return [
    ...new Set(normalizeStringList(value).map(normalizeLabel).filter(Boolean)),
  ];
}

function normalizeMilestoneTitle(value) {
  return normalizeString(value);
}

function normalizeMilestoneNumber(value) {
  const parsed = normalizeInteger(value, 0);
  return parsed > 0 ? parsed : 0;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ASSIGN_MILESTONES_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ASSIGN_MILESTONES_CONFIG_FILE || "",

    event_path:
      process.env.ASSIGN_MILESTONES_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ASSIGN_MILESTONES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ASSIGN_MILESTONES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.ASSIGN_MILESTONES_NUMBER ||
      process.env.ISSUE_NUMBER ||
      process.env.PR_NUMBER ||
      "",
    issue_number:
      process.env.ASSIGN_MILESTONES_ISSUE_NUMBER ||
      process.env.ISSUE_NUMBER ||
      "",
    pull_request_number:
      process.env.ASSIGN_MILESTONES_PR_NUMBER || process.env.PR_NUMBER || "",

    milestone: process.env.ASSIGN_MILESTONE || process.env.MILESTONE || "",
    milestone_title:
      process.env.ASSIGN_MILESTONE_TITLE || process.env.MILESTONE_TITLE || "",
    milestone_number:
      process.env.ASSIGN_MILESTONE_NUMBER || process.env.MILESTONE_NUMBER || "",

    fallback_milestone:
      process.env.ASSIGN_MILESTONE_FALLBACK ||
      process.env.FALLBACK_MILESTONE ||
      "",
    fallback_milestone_number:
      process.env.ASSIGN_MILESTONE_FALLBACK_NUMBER ||
      process.env.FALLBACK_MILESTONE_NUMBER ||
      "",

    existing_milestone:
      process.env.ASSIGN_MILESTONE_EXISTING ||
      process.env.EXISTING_MILESTONE ||
      "",
    existing_milestone_number:
      process.env.ASSIGN_MILESTONE_EXISTING_NUMBER ||
      process.env.EXISTING_MILESTONE_NUMBER ||
      "",

    labels: normalizeLabelList(
      process.env.ASSIGN_MILESTONES_LABELS ||
        process.env.ISSUE_LABELS ||
        process.env.PR_LABELS ||
        "",
    ),
    changed_files: normalizeStringList(
      process.env.ASSIGN_MILESTONES_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    clear_milestone: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_CLEAR || process.env.CLEAR_MILESTONE,
      false,
    ),
    create_missing_milestone: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_CREATE_MISSING ||
        process.env.CREATE_MISSING_MILESTONE,
      false,
    ),
    fetch_item: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FETCH_ITEM,
      true,
    ),
    fetch_files: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FETCH_FILES,
      true,
    ),
    fetch_milestones: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FETCH_MILESTONES,
      true,
    ),
    use_config: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_USE_CONFIG,
      true,
    ),

    skip_drafts: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_SKIP_DRAFTS,
      true,
    ),
    skip_existing_milestone: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_SKIP_EXISTING,
      false,
    ),

    fail_if_missing_number: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FAIL_IF_MISSING_NUMBER,
      true,
    ),
    fail_if_no_milestone: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FAIL_IF_NO_MILESTONE,
      false,
    ),
    fail_if_milestone_missing: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FAIL_IF_MILESTONE_MISSING,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_FAIL_ON_ERROR,
      true,
    ),

    milestone_state:
      process.env.ASSIGN_MILESTONES_STATE ||
      process.env.MILESTONE_STATE ||
      "all",

    timeout_seconds: normalizeInteger(
      process.env.ASSIGN_MILESTONES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ASSIGN_MILESTONES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ASSIGN_MILESTONES_STEP_SUMMARY,
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

    if (arg === "--number") {
      args.number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--issue" || arg === "--issue-number") {
      args.issue_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--pr" ||
      arg === "--pull-request" ||
      arg === "--pull-request-number"
    ) {
      args.pull_request_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--milestone") {
      args.milestone = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--milestone-title") {
      args.milestone_title = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--milestone-number") {
      args.milestone_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fallback-milestone") {
      args.fallback_milestone = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fallback-milestone-number") {
      args.fallback_milestone_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--existing-milestone") {
      args.existing_milestone = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--existing-milestone-number") {
      args.existing_milestone_number = argv[index + 1];
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

    if (arg === "--clear-milestone" || arg === "--remove-milestone") {
      args.clear_milestone = true;
      continue;
    }

    if (arg === "--no-clear-milestone") {
      args.clear_milestone = false;
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

    if (arg === "--fetch-item") {
      args.fetch_item = true;
      continue;
    }

    if (arg === "--no-fetch-item") {
      args.fetch_item = false;
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

    if (arg === "--fetch-milestones") {
      args.fetch_milestones = true;
      continue;
    }

    if (arg === "--no-fetch-milestones") {
      args.fetch_milestones = false;
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

    if (arg === "--skip-existing-milestone") {
      args.skip_existing_milestone = true;
      continue;
    }

    if (arg === "--no-skip-existing-milestone") {
      args.skip_existing_milestone = false;
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

    if (arg === "--fail-if-milestone-missing") {
      args.fail_if_milestone_missing = true;
      continue;
    }

    if (arg === "--no-fail-if-milestone-missing") {
      args.fail_if_milestone_missing = false;
      continue;
    }

    if (arg === "--state" || arg === "--milestone-state") {
      args.milestone_state = argv[index + 1];
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
  args.milestone = normalizeMilestoneTitle(args.milestone);
  args.milestone_title = normalizeMilestoneTitle(args.milestone_title);
  args.milestone_number = normalizeMilestoneNumber(args.milestone_number);
  args.fallback_milestone = normalizeMilestoneTitle(args.fallback_milestone);
  args.fallback_milestone_number = normalizeMilestoneNumber(
    args.fallback_milestone_number,
  );
  args.existing_milestone = normalizeMilestoneTitle(args.existing_milestone);
  args.existing_milestone_number = normalizeMilestoneNumber(
    args.existing_milestone_number,
  );
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];
  args.milestone_state = normalizeMilestoneState(args.milestone_state);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Repository Milestone Automation

Usage:
  node .github/scripts/repo/assign-milestones.js [options]

Examples:
  node .github/scripts/repo/assign-milestones.js --dry-run
  node .github/scripts/repo/assign-milestones.js --pr 42 --milestone "v2.10.0"
  node .github/scripts/repo/assign-milestones.js --issue 12 --milestone-number 7
  node .github/scripts/repo/assign-milestones.js --label "release: minor" --fallback-milestone "Next Release"
  node .github/scripts/repo/assign-milestones.js --clear-milestone
  node .github/scripts/repo/assign-milestones.js --create-missing-milestone --milestone "v2.10.0"

Config example:
  {
    "default_milestone": "Backlog",
    "fallback_milestone": "Next Release",
    "rules": [
      {
        "name": "Release minor",
        "labels": ["release: minor"],
        "milestone": "v2.10.0"
      },
      {
        "name": "Docs",
        "paths": ["docs/**", "**/*.md"],
        "milestone": "Documentation"
      }
    ]
  }

Options:
      --repo <owner/repo>                 Repository slug.
      --api-url <url>                     GitHub API URL.
      --token <token>                     GitHub token.
      --config <file>                     Milestone config file.
      --event-path <file>                 GitHub event payload path.
      --number <number>                   Issue or PR number.
      --issue <number>                    Issue number.
      --pr <number>                       Pull request number.
      --milestone <title>                 Milestone title to assign.
      --milestone-title <title>           Milestone title to assign.
      --milestone-number <number>         Milestone number to assign.
      --fallback-milestone <title>        Fallback milestone when no rule matches.
      --fallback-milestone-number <num>   Fallback milestone number.
      --existing-milestone <title>        Existing milestone title hint.
      --existing-milestone-number <num>   Existing milestone number hint.
      --label <label,list>                Label(s) to evaluate.
      --changed-file <file,list>          Changed file path(s) to evaluate.
      --clear-milestone                   Remove the milestone.
      --no-clear-milestone                Do not clear the milestone.
      --create-missing-milestone          Create milestone when title is missing.
      --no-create-missing-milestone       Do not create missing milestones. Default.
      --fetch-item                        Fetch current issue/PR metadata. Default.
      --no-fetch-item                     Do not fetch current item metadata.
      --fetch-files                       Fetch pull request changed files. Default.
      --no-fetch-files                    Do not fetch pull request files.
      --fetch-milestones                  Fetch repo milestones for title lookup. Default.
      --no-fetch-milestones               Do not fetch repo milestones.
      --use-config                        Use config file. Default.
      --no-config                         Ignore config file.
      --skip-drafts                       Skip draft pull requests. Default.
      --no-skip-drafts                    Milestone draft pull requests.
      --skip-existing-milestone           Do nothing if item already has a milestone.
      --no-skip-existing-milestone        Replace existing milestone. Default.
      --fail-if-missing-number            Fail when no issue/PR number resolves. Default.
      --no-fail-if-missing-number         Do not fail when number is missing.
      --fail-if-no-milestone              Fail when no milestone resolves.
      --no-fail-if-no-milestone           Do not fail when no milestone resolves. Default.
      --fail-if-milestone-missing         Fail when named milestone does not exist.
      --no-fail-if-milestone-missing      Do not fail for missing named milestone. Default.
      --state <open|closed|all>           Milestone lookup state. Default: all.
      --fail-on-error                     Exit non-zero on error. Default.
      --no-fail-on-error                  Do not fail workflow.
      --timeout-seconds <number>          API timeout. Default: 60.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not mutate GitHub.
      --no-print                          Do not print JSON report.
      --no-step-summary                   Do not append GitHub step summary.
`);
}

function normalizeMilestoneState(value) {
  const normalized = normalizeString(value, "all").toLowerCase();

  if (["open", "closed", "all"].includes(normalized)) return normalized;

  return "all";
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
  const rules = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let currentRule = null;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");

      if (section === "rules" || section === "milestone_rules") {
        config.rules = rules;
      }

      currentRule = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (
      (section === "rules" || section === "milestone_rules") &&
      /^-\s*/.test(trimmed)
    ) {
      currentRule = {};
      rules.push(currentRule);

      const rest = trimmed.replace(/^-\s*/, "");

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentRule[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (
      (section === "rules" || section === "milestone_rules") &&
      currentRule &&
      /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)
    ) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentRule[key] = parseYamlScalar(value);
      continue;
    }

    if (section && /^-\s*/.test(trimmed)) {
      config[section] = Array.isArray(config[section]) ? config[section] : [];
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
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

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : {};

  const rules = [
    ...(Array.isArray(source.rules) ? source.rules : []),
    ...(Array.isArray(source.milestone_rules) ? source.milestone_rules : []),
    ...(Array.isArray(source.milestones_by_rule)
      ? source.milestones_by_rule
      : []),
  ].map((rule, index) => normalizeRule(rule, index));

  return {
    default_milestone: normalizeMilestoneTitle(
      source.default_milestone ||
        source.defaultMilestone ||
        source.milestone ||
        "",
    ),
    default_milestone_number: normalizeMilestoneNumber(
      source.default_milestone_number ||
        source.defaultMilestoneNumber ||
        source.milestone_number ||
        0,
    ),
    fallback_milestone: normalizeMilestoneTitle(
      source.fallback_milestone || source.fallbackMilestone || "",
    ),
    fallback_milestone_number: normalizeMilestoneNumber(
      source.fallback_milestone_number || source.fallbackMilestoneNumber || 0,
    ),
    create_missing_milestone:
      source.create_missing_milestone === undefined
        ? undefined
        : normalizeBoolean(source.create_missing_milestone, false),
    rules,
    skip_drafts:
      source.skip_drafts === undefined
        ? undefined
        : normalizeBoolean(source.skip_drafts, true),
  };
}

function normalizeRule(rule, index) {
  const source = rule && typeof rule === "object" ? rule : {};

  return {
    id: normalizeString(source.id || source.name || `rule-${index + 1}`),
    name: normalizeString(source.name || source.id || `Rule ${index + 1}`),
    enabled: normalizeBoolean(source.enabled, true),
    priority: normalizeInteger(source.priority, 0),

    labels: normalizeLabelList(
      source.labels || source.label || source.match_labels || [],
    ),
    paths: normalizeStringList(
      source.paths || source.path || source.files || source.file,
    ).map(toPosixPath),
    title_contains: normalizeStringList(
      source.title_contains || source.titleContains || source.title || [],
    ).map((item) => item.toLowerCase()),
    body_contains: normalizeStringList(
      source.body_contains || source.bodyContains || source.body || [],
    ).map((item) => item.toLowerCase()),
    authors: normalizeUserList(source.authors || source.author || []),
    kinds: normalizeStringList(
      source.kinds || source.kind || source.types || source.type,
    ).map((item) => item.toLowerCase()),

    milestone: normalizeMilestoneTitle(
      source.milestone ||
        source.milestone_title ||
        source.assign_milestone ||
        source.set_milestone ||
        "",
    ),
    milestone_number: normalizeMilestoneNumber(
      source.milestone_number ||
        source.assign_milestone_number ||
        source.set_milestone_number ||
        0,
    ),
    clear_milestone: normalizeBoolean(
      source.clear_milestone ||
        source.remove_milestone ||
        source.unset_milestone,
      false,
    ),

    require_all: normalizeBoolean(
      source.require_all || source.requireAll,
      false,
    ),
  };
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const normalized = normalizeConfig(config);
  const merged = { ...args };

  if (
    !merged.milestone &&
    !merged.milestone_title &&
    normalized.default_milestone
  ) {
    merged.milestone = normalized.default_milestone;
  }

  if (!merged.milestone_number && normalized.default_milestone_number) {
    merged.milestone_number = normalized.default_milestone_number;
  }

  if (!merged.fallback_milestone && normalized.fallback_milestone) {
    merged.fallback_milestone = normalized.fallback_milestone;
  }

  if (
    !merged.fallback_milestone_number &&
    normalized.fallback_milestone_number
  ) {
    merged.fallback_milestone_number = normalized.fallback_milestone_number;
  }

  if (normalized.create_missing_milestone !== undefined) {
    merged.create_missing_milestone = normalized.create_missing_milestone;
  }

  if (normalized.skip_drafts !== undefined) {
    merged.skip_drafts = normalized.skip_drafts;
  }

  return merged;
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

function milestoneFromItem(item) {
  if (!item?.milestone) {
    return {
      title: "",
      number: 0,
      state: "",
      due_on: "",
      html_url: "",
    };
  }

  return {
    title: normalizeMilestoneTitle(item.milestone.title),
    number: normalizeMilestoneNumber(item.milestone.number),
    state: normalizeString(item.milestone.state),
    due_on: normalizeString(item.milestone.due_on),
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
  if (event?.issue) return "issue";
  if (
    event?.number &&
    String(process.env.GITHUB_EVENT_NAME || "").includes("pull_request")
  ) {
    return "pull_request";
  }
  if (event?.number) return "issue";
  return "unknown";
}

function collectEventInput(args, repoRoot) {
  const event = args.event_path
    ? readJsonFile(args.event_path, repoRoot, null)
    : null;
  const item = event?.pull_request || event?.issue || null;
  const eventNumber = getEventNumber(event);
  const eventKind = getEventKind(event);

  const number = normalizeString(
    args.pull_request_number || args.issue_number || args.number || eventNumber,
  );

  const kind =
    args.pull_request_number || eventKind === "pull_request"
      ? "pull_request"
      : args.issue_number || eventKind === "issue"
        ? "issue"
        : "unknown";

  const eventMilestone = milestoneFromItem(item);

  return {
    event_available: Boolean(event),
    event_name: normalizeString(process.env.GITHUB_EVENT_NAME || event?.action),
    event_action: normalizeString(event?.action),
    number,
    kind,
    title: normalizeString(item?.title),
    body: normalizeString(item?.body),
    author: normalizeUsername(item?.user?.login || event?.sender?.login),
    actor: normalizeUsername(process.env.GITHUB_ACTOR || event?.sender?.login),
    draft: Boolean(event?.pull_request?.draft),
    labels: [
      ...new Set(
        [...args.labels, ...labelsFromItems(item?.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
    ],
    existing_milestone: {
      title: args.existing_milestone || eventMilestone.title,
      number: args.existing_milestone_number || eventMilestone.number,
      state: eventMilestone.state,
      due_on: eventMilestone.due_on,
      html_url: eventMilestone.html_url,
    },
    changed_files: [
      ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
    ],
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-assign-milestones-script`,
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

async function fetchPullRequest(args, number) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/pulls/${encodeURIComponent(number)}`)),
    {
      method: "GET",
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
    const url = apiUrl(
      args,
      repoEndpoint(
        args,
        `/pulls/${encodeURIComponent(number)}/files?per_page=100&page=${page}`,
      ),
    );

    const response = await requestJson(url, {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    });

    const body = Array.isArray(response.body) ? response.body : [];

    files.push(...body.map((file) => file.filename).filter(Boolean));

    if (body.length < 100) break;

    page += 1;
  }

  return [...new Set(files.map(toPosixPath))];
}

async function fetchMilestones(args) {
  const milestones = [];
  let page = 1;

  while (page <= 10) {
    const url = apiUrl(
      args,
      repoEndpoint(
        args,
        `/milestones?state=${encodeURIComponent(args.milestone_state)}&per_page=100&page=${page}`,
      ),
    );

    const response = await requestJson(url, {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    });

    const body = Array.isArray(response.body) ? response.body : [];

    milestones.push(
      ...body.map((milestone) => ({
        title: normalizeMilestoneTitle(milestone.title),
        number: normalizeMilestoneNumber(milestone.number),
        state: normalizeString(milestone.state),
        description: normalizeString(milestone.description),
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
        state: "open",
      },
    },
  );

  return {
    title: normalizeMilestoneTitle(response.body?.title),
    number: normalizeMilestoneNumber(response.body?.number),
    state: normalizeString(response.body?.state),
    description: normalizeString(response.body?.description),
    due_on: normalizeString(response.body?.due_on),
    html_url: normalizeString(response.body?.html_url),
    open_issues: normalizeInteger(response.body?.open_issues, 0),
    closed_issues: normalizeInteger(response.body?.closed_issues, 0),
    created: true,
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
        milestone: milestoneNumber || null,
      },
    },
  );

  return response.body;
}

async function enrichInput(args, input) {
  const enriched = {
    ...input,
    fetched_item: false,
    fetched_files: false,
    api_item: null,
  };

  if (args.dry_run && !args.token) {
    return enriched;
  }

  if (args.fetch_item && input.number && args.token) {
    const issue = await fetchIssue(args, input.number);
    const issueMilestone = milestoneFromItem(issue);

    enriched.fetched_item = true;
    enriched.api_item = issue;
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
    enriched.existing_milestone = {
      title: enriched.existing_milestone.title || issueMilestone.title,
      number: enriched.existing_milestone.number || issueMilestone.number,
      state: enriched.existing_milestone.state || issueMilestone.state,
      due_on: enriched.existing_milestone.due_on || issueMilestone.due_on,
      html_url: enriched.existing_milestone.html_url || issueMilestone.html_url,
    };

    if (issue.pull_request) {
      enriched.kind = "pull_request";
    } else if (enriched.kind === "unknown") {
      enriched.kind = "issue";
    }
  }

  if (
    args.fetch_files &&
    enriched.kind === "pull_request" &&
    input.number &&
    args.token
  ) {
    const files = await fetchPullRequestFiles(args, input.number);

    enriched.fetched_files = true;
    enriched.changed_files = [
      ...new Set(
        [...enriched.changed_files, ...files].map(toPosixPath).filter(Boolean),
      ),
    ];
  }

  if (
    args.fetch_item &&
    enriched.kind === "pull_request" &&
    input.number &&
    args.token
  ) {
    try {
      const pull = await fetchPullRequest(args, input.number);

      enriched.draft = Boolean(pull.draft);
      enriched.title = enriched.title || normalizeString(pull.title);
      enriched.body = enriched.body || normalizeString(pull.body);
      enriched.author = enriched.author || normalizeUsername(pull.user?.login);
    } catch (err) {
      logger.warn(
        `Unable to fetch pull request details: ${logger.formatError(err)}`,
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
      checks: [],
      rule,
    };
  }

  const checks = [];

  if (rule.labels.length) {
    checks.push({
      type: "labels",
      matched: rule.labels.some((label) => input.labels.includes(label)),
      detail: rule.labels,
    });
  }

  if (rule.paths.length) {
    checks.push({
      type: "paths",
      matched: input.changed_files.some((file) =>
        rule.paths.some((pattern) => matchesPattern(file, pattern)),
      ),
      detail: rule.paths,
    });
  }

  if (rule.title_contains.length) {
    const title = normalizeString(input.title).toLowerCase();

    checks.push({
      type: "title",
      matched: rule.title_contains.some((text) => title.includes(text)),
      detail: rule.title_contains,
    });
  }

  if (rule.body_contains.length) {
    const body = normalizeString(input.body).toLowerCase();

    checks.push({
      type: "body",
      matched: rule.body_contains.some((text) => body.includes(text)),
      detail: rule.body_contains,
    });
  }

  if (rule.authors.length) {
    checks.push({
      type: "author",
      matched: rule.authors.includes(normalizeUsername(input.author)),
      detail: rule.authors,
    });
  }

  if (rule.kinds.length) {
    checks.push({
      type: "kind",
      matched: rule.kinds.includes(normalizeString(input.kind).toLowerCase()),
      detail: rule.kinds,
    });
  }

  if (!checks.length) {
    return {
      matched: false,
      reasons: [],
      checks,
      rule,
    };
  }

  const matched = rule.require_all
    ? checks.every((check) => check.matched)
    : checks.some((check) => check.matched);

  return {
    matched,
    reasons: checks.filter((check) => check.matched).map((check) => check.type),
    checks,
    rule,
  };
}

function milestoneCandidateFromTitle(title, source, priority = 0) {
  const normalizedTitle = normalizeMilestoneTitle(title);

  if (!normalizedTitle) return null;

  return {
    source,
    title: normalizedTitle,
    number: 0,
    clear: false,
    priority,
  };
}

function milestoneCandidateFromNumber(number, source, priority = 0) {
  const normalizedNumber = normalizeMilestoneNumber(number);

  if (!normalizedNumber) return null;

  return {
    source,
    title: "",
    number: normalizedNumber,
    clear: false,
    priority,
  };
}

function clearMilestoneCandidate(source, priority = 0) {
  return {
    source,
    title: "",
    number: 0,
    clear: true,
    priority,
  };
}

function resolveMilestoneCandidates(args, config, input) {
  const ruleResults = config.rules.map((rule) => evaluateRule(rule, input));
  const matchedRules = ruleResults
    .filter((result) => result.matched)
    .sort((left, right) => right.rule.priority - left.rule.priority);

  const candidates = [];

  if (args.clear_milestone) {
    candidates.push(clearMilestoneCandidate("direct-clear", 1_000_000));
  }

  const directNumber = milestoneCandidateFromNumber(
    args.milestone_number,
    "direct-number",
    900_000,
  );
  const directTitle = milestoneCandidateFromTitle(
    args.milestone_title || args.milestone,
    "direct-title",
    900_000,
  );

  if (directNumber) candidates.push(directNumber);
  if (directTitle) candidates.push(directTitle);

  for (const result of matchedRules) {
    if (result.rule.clear_milestone) {
      candidates.push(
        clearMilestoneCandidate(
          `rule:${result.rule.id}`,
          result.rule.priority + 10_000,
        ),
      );
      continue;
    }

    const ruleNumber = milestoneCandidateFromNumber(
      result.rule.milestone_number,
      `rule:${result.rule.id}`,
      result.rule.priority + 10_000,
    );
    const ruleTitle = milestoneCandidateFromTitle(
      result.rule.milestone,
      `rule:${result.rule.id}`,
      result.rule.priority + 10_000,
    );

    if (ruleNumber) candidates.push(ruleNumber);
    if (ruleTitle) candidates.push(ruleTitle);
  }

  const fallbackNumber = milestoneCandidateFromNumber(
    args.fallback_milestone_number,
    "fallback-number",
    1,
  );
  const fallbackTitle = milestoneCandidateFromTitle(
    args.fallback_milestone,
    "fallback-title",
    1,
  );

  if (fallbackNumber) candidates.push(fallbackNumber);
  if (fallbackTitle) candidates.push(fallbackTitle);

  const selected =
    candidates
      .filter(Boolean)
      .sort((left, right) => right.priority - left.priority)[0] || null;

  return {
    selected,
    candidates,
    matched_rules: matchedRules.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      reasons: result.reasons,
      milestone: result.rule.milestone,
      milestone_number: result.rule.milestone_number,
      clear_milestone: result.rule.clear_milestone,
      priority: result.rule.priority,
    })),
    rule_results: ruleResults.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      matched: result.matched,
      reasons: result.reasons,
    })),
  };
}

function findMilestoneByTitle(milestones, title) {
  const wanted = normalizeMilestoneTitle(title).toLowerCase();

  if (!wanted) return null;

  return (
    milestones.find(
      (milestone) =>
        normalizeMilestoneTitle(milestone.title).toLowerCase() === wanted,
    ) ||
    milestones.find((milestone) =>
      normalizeMilestoneTitle(milestone.title).toLowerCase().includes(wanted),
    ) ||
    null
  );
}

function findMilestoneByNumber(milestones, number) {
  const wanted = normalizeMilestoneNumber(number);

  if (!wanted) return null;

  return milestones.find((milestone) => milestone.number === wanted) || null;
}

async function resolveSelectedMilestone(args, candidateInfo, milestones) {
  const selected = candidateInfo.selected;

  const resolution = {
    selected,
    resolved: null,
    milestones_available: milestones.length,
    created_milestone: false,
    errors: [],
    warnings: [],
  };

  if (!selected) {
    return resolution;
  }

  if (selected.clear) {
    resolution.resolved = {
      title: "",
      number: 0,
      state: "",
      html_url: "",
      clear: true,
    };

    return resolution;
  }

  if (selected.number) {
    const found = findMilestoneByNumber(milestones, selected.number);

    resolution.resolved = {
      title: found?.title || selected.title || `#${selected.number}`,
      number: selected.number,
      state: found?.state || "",
      html_url: found?.html_url || "",
      clear: false,
    };

    if (!found && milestones.length) {
      resolution.warnings.push(
        `Milestone number ${selected.number} was not found in fetched milestones.`,
      );
    }

    return resolution;
  }

  if (selected.title) {
    const found = findMilestoneByTitle(milestones, selected.title);

    if (found) {
      resolution.resolved = {
        title: found.title,
        number: found.number,
        state: found.state,
        html_url: found.html_url,
        clear: false,
      };

      return resolution;
    }

    if (args.create_missing_milestone && args.token && !args.dry_run) {
      logger.info(`Creating missing milestone "${selected.title}".`);
      const created = await createMilestone(args, selected.title);

      resolution.created_milestone = true;
      resolution.resolved = {
        title: created.title,
        number: created.number,
        state: created.state,
        html_url: created.html_url,
        clear: false,
      };

      return resolution;
    }

    if (args.create_missing_milestone && args.dry_run) {
      resolution.created_milestone = true;
      resolution.resolved = {
        title: selected.title,
        number: 0,
        state: "open",
        html_url: "",
        clear: false,
        planned_create: true,
      };

      resolution.warnings.push(
        `Milestone "${selected.title}" would be created during a non-dry run.`,
      );
      return resolution;
    }

    const message = `Milestone title was not found: ${selected.title}`;

    if (args.fail_if_milestone_missing) {
      resolution.errors.push(message);
    } else {
      resolution.warnings.push(message);
      resolution.resolved = {
        title: selected.title,
        number: 0,
        state: "",
        html_url: "",
        clear: false,
        unresolved: true,
      };
    }
  }

  return resolution;
}

async function executeMilestoneAssignment(
  args,
  input,
  candidateInfo,
  milestoneResolution,
) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    existing_milestone: input.existing_milestone,
    requested_milestone: milestoneResolution.resolved,
    selected_candidate: candidateInfo.selected,
    action: "none",
    final_milestone: input.existing_milestone,
    errors: [...milestoneResolution.errors],
    warnings: [...milestoneResolution.warnings],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!input.number) {
      result.status = args.fail_if_missing_number ? "invalid" : "skipped";
      result.success = !args.fail_if_missing_number;
      result.errors.push("Issue or pull request number could not be resolved.");
      return result;
    }

    if (args.skip_drafts && input.kind === "pull_request" && input.draft) {
      result.status = "skipped-draft";
      result.success = true;
      result.warnings.push("Draft pull request milestone assignment skipped.");
      return result;
    }

    if (args.skip_existing_milestone && input.existing_milestone.number) {
      result.status = "skipped-existing-milestone";
      result.success = true;
      result.warnings.push(
        "Item already has a milestone and skip_existing_milestone is enabled.",
      );
      return result;
    }

    if (!candidateInfo.selected) {
      result.status = args.fail_if_no_milestone ? "invalid" : "skipped";
      result.success = !args.fail_if_no_milestone;
      result.errors.push("No milestone resolved.");
      return result;
    }

    if (milestoneResolution.errors.length) {
      result.status = "invalid";
      result.success = false;
      return result;
    }

    if (milestoneResolution.resolved?.unresolved && !args.dry_run) {
      result.status = args.fail_if_milestone_missing
        ? "invalid"
        : "skipped-missing-milestone";
      result.success = !args.fail_if_milestone_missing;
      return result;
    }

    if (milestoneResolution.resolved?.clear) {
      if (!input.existing_milestone.number) {
        result.status = "already-clear";
        result.success = true;
        result.action = "none";
        result.final_milestone = {
          title: "",
          number: 0,
          state: "",
          due_on: "",
          html_url: "",
        };
        return result;
      }

      if (args.dry_run) {
        result.status = "planned";
        result.success = true;
        result.action = "clear";
        result.final_milestone = {
          title: "",
          number: 0,
          state: "",
          due_on: "",
          html_url: "",
        };
        return result;
      }

      if (!args.token) {
        result.status = "failed";
        result.errors.push(
          "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_MILESTONES_TOKEN, or --token.",
        );
        return result;
      }

      logger.info(`Clearing milestone from #${input.number}.`);
      const updated = await updateIssueMilestone(args, input.number, null);

      result.status = "cleared";
      result.success = true;
      result.action = "clear";
      result.final_milestone = milestoneFromItem(updated);
      return result;
    }

    const resolvedNumber = normalizeMilestoneNumber(
      milestoneResolution.resolved?.number,
    );
    const resolvedTitle = normalizeMilestoneTitle(
      milestoneResolution.resolved?.title,
    );

    if (!resolvedNumber && !args.dry_run) {
      result.status = args.fail_if_milestone_missing
        ? "invalid"
        : "skipped-missing-milestone";
      result.success = !args.fail_if_milestone_missing;
      result.errors.push(
        `Milestone could not be assigned because no milestone number was resolved for "${resolvedTitle}".`,
      );
      return result;
    }

    if (resolvedNumber && input.existing_milestone.number === resolvedNumber) {
      result.status = "already-assigned";
      result.success = true;
      result.action = "none";
      result.final_milestone = input.existing_milestone;
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.action = input.existing_milestone.number ? "replace" : "assign";
      result.final_milestone = {
        title: resolvedTitle,
        number: resolvedNumber,
        state: milestoneResolution.resolved?.state || "",
        due_on: "",
        html_url: milestoneResolution.resolved?.html_url || "",
      };
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_MILESTONES_TOKEN, or --token.",
      );
      return result;
    }

    logger.info(
      `Assigning milestone "${resolvedTitle || resolvedNumber}" to #${input.number}.`,
    );
    const updated = await updateIssueMilestone(
      args,
      input.number,
      resolvedNumber,
    );

    result.status = "assigned";
    result.success = true;
    result.action = input.existing_milestone.number ? "replace" : "assign";
    result.final_milestone = milestoneFromItem(updated);

    return result;
  } catch (err) {
    result.status = "failed";
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

function itemUrl(repository, kind, number) {
  if (!number) return "";

  const base = /^https?:\/\//.test(repository)
    ? repository.replace(/\/+$/g, "")
    : `https://github.com/${repository}`;

  return `${base}/${kind === "pull_request" ? "pull" : "issues"}/${number}`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  config,
  input,
  milestones,
  candidateInfo,
  milestoneResolution,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const status = execution.status;
  const ok = execution.success && execution.errors.length === 0;

  return {
    schema_version: 1,
    type: "repo-assign-milestones",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      event_path: args.event_path
        ? toRelativePath(resolvePath(args.event_path, repoRoot), repoRoot)
        : null,
      use_config: args.use_config,
      fetch_item: args.fetch_item,
      fetch_files: args.fetch_files,
      fetch_milestones: args.fetch_milestones,
      create_missing_milestone: args.create_missing_milestone,
      skip_drafts: args.skip_drafts,
      skip_existing_milestone: args.skip_existing_milestone,
      clear_milestone: args.clear_milestone,
      milestone_state: args.milestone_state,
      dry_run: args.dry_run,
      rule_count: config.rules.length,
    },
    item: {
      number: input.number,
      kind: input.kind,
      url: itemUrl(args.repository, input.kind, input.number),
      title: input.title,
      author: input.author,
      actor: input.actor,
      draft: input.draft,
      labels: input.labels,
      changed_files: input.changed_files,
      existing_milestone: input.existing_milestone,
      fetched_item: input.fetched_item,
      fetched_files: input.fetched_files,
    },
    milestone_lookup: {
      fetched: args.fetch_milestones && Boolean(args.token || !args.dry_run),
      count: milestones.length,
      selected_candidate: candidateInfo.selected,
      candidates: candidateInfo.candidates,
      resolved_milestone: milestoneResolution.resolved,
      created_milestone: milestoneResolution.created_milestone,
    },
    assignment: {
      matched_rules: candidateInfo.matched_rules,
      rule_results: candidateInfo.rule_results,
      requested_milestone: execution.requested_milestone,
      action: execution.action,
      final_milestone: execution.final_milestone,
    },
    execution,
    totals: {
      labels: input.labels.length,
      changed_files: input.changed_files.length,
      milestones_available: milestones.length,
      rules: config.rules.length,
      matched_rules: candidateInfo.matched_rules.length,
      candidates: candidateInfo.candidates.length,
      errors: execution.errors.length,
      warnings: execution.warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok,
    },
    errors: execution.errors,
    warnings: execution.warnings,
    status,
    ok,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const icon = report.ok
    ? "✅"
    : report.status.startsWith("skipped")
      ? "⏭️"
      : "❌";
  const finalMilestone = report.assignment.final_milestone || {};
  const requestedMilestone = report.assignment.requested_milestone || {};

  const lines = [
    `# 🏁 ${PROJECT_NAME} Milestone Automation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Item: \`${report.item.kind} #${report.item.number || "unresolved"}\``,
    `- Action: \`${report.assignment.action || "none"}\``,
    `- Requested milestone: \`${escapeMarkdown(requestedMilestone.title || requestedMilestone.number || "none")}\``,
    `- Final milestone: \`${escapeMarkdown(finalMilestone.title || finalMilestone.number || "none")}\``,
    `- Matched rules: \`${report.totals.matched_rules}\``,
    `- Available milestones: \`${report.totals.milestones_available}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
  ];

  if (report.item.url) {
    lines.push(`Item URL: ${report.item.url}`);
    lines.push("");
  }

  if (finalMilestone.html_url) {
    lines.push(`Milestone URL: ${finalMilestone.html_url}`);
    lines.push("");
  }

  lines.push("## 🎯 Item");
  lines.push("");
  lines.push(`- Title: \`${escapeMarkdown(report.item.title || "none")}\``);
  lines.push(`- Author: \`${report.item.author || "unknown"}\``);
  lines.push(`- Actor: \`${report.item.actor || "unknown"}\``);
  lines.push(`- Draft: \`${report.item.draft ? "true" : "false"}\``);
  lines.push(
    `- Existing milestone: \`${escapeMarkdown(report.item.existing_milestone.title || report.item.existing_milestone.number || "none")}\``,
  );
  lines.push(`- Labels: \`${report.item.labels.length}\``);
  lines.push(`- Changed files: \`${report.item.changed_files.length}\``);

  lines.push("");
  lines.push("## 🏁 Milestone Resolution");
  lines.push("");
  lines.push(
    `- Selected source: \`${report.milestone_lookup.selected_candidate?.source || "none"}\``,
  );
  lines.push(
    `- Selected title: \`${escapeMarkdown(report.milestone_lookup.selected_candidate?.title || "none")}\``,
  );
  lines.push(
    `- Selected number: \`${report.milestone_lookup.selected_candidate?.number || "none"}\``,
  );
  lines.push(
    `- Clear milestone: \`${report.milestone_lookup.selected_candidate?.clear ? "true" : "false"}\``,
  );
  lines.push(
    `- Created missing milestone: \`${report.milestone_lookup.created_milestone ? "true" : "false"}\``,
  );

  lines.push("");
  lines.push("## 🧩 Matching Rules");
  lines.push("");

  if (!report.assignment.matched_rules.length) {
    lines.push("No config rules matched.");
  } else {
    lines.push("| Rule | Reasons | Milestone | Clear | Priority |");
    lines.push("|---|---|---|---:|---:|");

    for (const rule of report.assignment.matched_rules) {
      lines.push(
        `| \`${escapeMarkdown(rule.name)}\` | \`${escapeMarkdown(rule.reasons.join(", ") || "matched")}\` | \`${escapeMarkdown(rule.milestone || rule.milestone_number || "none")}\` | \`${rule.clear_milestone ? "true" : "false"}\` | \`${rule.priority}\` |`,
      );
    }
  }

  if (report.item.labels.length) {
    lines.push("");
    lines.push("## 🏷️ Labels");
    lines.push("");

    for (const label of report.item.labels) {
      lines.push(`- \`${escapeMarkdown(label)}\``);
    }
  }

  if (report.item.changed_files.length) {
    lines.push("");
    lines.push("## 📁 Changed Files");
    lines.push("");

    for (const file of report.item.changed_files.slice(0, 100)) {
      lines.push(`- \`${escapeMarkdown(file)}\``);
    }

    if (report.item.changed_files.length > 100) {
      lines.push(
        `- ...and \`${report.item.changed_files.length - 100}\` more file(s).`,
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
    `- Fetch item: \`${report.config.fetch_item ? "true" : "false"}\``,
  );
  lines.push(
    `- Fetch files: \`${report.config.fetch_files ? "true" : "false"}\``,
  );
  lines.push(
    `- Fetch milestones: \`${report.config.fetch_milestones ? "true" : "false"}\``,
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
  const requested = report.assignment.requested_milestone || {};
  const final = report.assignment.final_milestone || {};

  setGitHubOutput("assign_milestones_file", report.config.output_file);
  setGitHubOutput(
    "assign_milestones_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("assign_milestones_status", report.status);
  setGitHubOutput("assign_milestones_ok", report.ok ? "true" : "false");

  setGitHubOutput("assign_milestones_number", report.item.number || "");
  setGitHubOutput("assign_milestones_kind", report.item.kind || "");
  setGitHubOutput("assign_milestones_url", report.item.url || "");
  setGitHubOutput("assign_milestones_action", report.assignment.action || "");

  setGitHubOutput("assign_milestone_requested_title", requested.title || "");
  setGitHubOutput(
    "assign_milestone_requested_number",
    String(requested.number || ""),
  );
  setGitHubOutput("assign_milestone_final_title", final.title || "");
  setGitHubOutput("assign_milestone_final_number", String(final.number || ""));
  setGitHubOutput("assign_milestone_final_url", final.html_url || "");

  setGitHubOutput(
    "assign_milestones_matched_rules",
    String(report.totals.matched_rules),
  );
  setGitHubOutput(
    "assign_milestones_matched_rules_json",
    JSON.stringify(report.assignment.matched_rules),
  );
  setGitHubOutput(
    "assign_milestones_errors_json",
    JSON.stringify(report.errors),
  );
  setGitHubOutput(
    "assign_milestones_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const rawConfig =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;
  const normalizedConfig = normalizeConfig(rawConfig);

  args = applyConfig(args, rawConfig);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing milestone automation.");

  let input = collectEventInput(args, repoRoot);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    logger.warn(`Unable to enrich issue/PR input: ${logger.formatError(err)}`);
  }

  let milestones = [];

  try {
    if (args.fetch_milestones && args.token) {
      milestones = await fetchMilestones(args);
    }
  } catch (err) {
    logger.warn(`Unable to fetch milestones: ${logger.formatError(err)}`);
  }

  const candidateInfo = resolveMilestoneCandidates(
    args,
    normalizedConfig,
    input,
  );
  const milestoneResolution = await resolveSelectedMilestone(
    args,
    candidateInfo,
    milestones,
  );
  const execution = await executeMilestoneAssignment(
    args,
    input,
    candidateInfo,
    milestoneResolution,
  );

  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(rawConfig),
    normalizedConfig,
    input,
    milestones,
    candidateInfo,
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
