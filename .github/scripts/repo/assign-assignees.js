#!/usr/bin/env node
// .github/scripts/repo/assign-assignees.js
// =============================================================================
// Aerealith AI — Repository Assignee Automation
// -----------------------------------------------------------------------------
// Purpose:
//   Assign users to GitHub issues and pull requests from direct inputs,
//   workflow event payloads, labels, changed paths, authors, and config rules.
//
// Input:
//   - GitHub event payload
//   - .github/repo/assign-assignees.json
//   - .github/repo/assign-assignees.jsonc
//   - .github/repo/assign-assignees.yaml
//   - .github/repo/assign-assignees.yml
//
// Output:
//   - artifacts/repo/assign-assignees.json
//   - artifacts/repo/assign-assignees.md
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
    info: (message) => console.log(`[assign-assignees] ${message}`),
    warn: (message) => console.warn(`[assign-assignees] WARN: ${message}`),
    error: (message) => console.error(`[assign-assignees] ERROR: ${message}`),
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
  ".github/repo/assign-assignees.json",
  ".github/repo/assign-assignees.jsonc",
  ".github/repo/assign-assignees.yaml",
  ".github/repo/assign-assignees.yml",
  ".github/repo/assignees.json",
  ".github/repo/assignees.jsonc",
  ".github/repo/assignees.yaml",
  ".github/repo/assignees.yml",
  ".github/assign-assignees.json",
  ".github/assign-assignees.jsonc",
  ".github/assign-assignees.yaml",
  ".github/assign-assignees.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/assign-assignees.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/assign-assignees.md";

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ASSIGN_ASSIGNEES_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ASSIGN_ASSIGNEES_CONFIG_FILE || "",

    event_path:
      process.env.ASSIGN_ASSIGNEES_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ASSIGN_ASSIGNEES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ASSIGN_ASSIGNEES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.ASSIGN_ASSIGNEES_NUMBER ||
      process.env.ISSUE_NUMBER ||
      process.env.PR_NUMBER ||
      "",
    issue_number:
      process.env.ASSIGN_ASSIGNEES_ISSUE_NUMBER ||
      process.env.ISSUE_NUMBER ||
      "",
    pull_request_number:
      process.env.ASSIGN_ASSIGNEES_PR_NUMBER || process.env.PR_NUMBER || "",

    assignees: normalizeUserList(
      process.env.ASSIGN_ASSIGNEES || process.env.DEFAULT_ASSIGNEES || "",
    ),
    fallback_assignees: normalizeUserList(
      process.env.ASSIGN_ASSIGNEES_FALLBACK ||
        process.env.FALLBACK_ASSIGNEES ||
        "",
    ),
    exclude_assignees: normalizeUserList(
      process.env.ASSIGN_ASSIGNEES_EXCLUDE ||
        process.env.EXCLUDED_ASSIGNEES ||
        "",
    ),

    labels: normalizeStringList(
      process.env.ASSIGN_ASSIGNEES_LABELS ||
        process.env.ISSUE_LABELS ||
        process.env.PR_LABELS ||
        "",
    ),
    changed_files: normalizeStringList(
      process.env.ASSIGN_ASSIGNEES_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    assign_author: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_ASSIGN_AUTHOR,
      false,
    ),
    assign_actor: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_ASSIGN_ACTOR,
      false,
    ),
    fetch_item: normalizeBoolean(process.env.ASSIGN_ASSIGNEES_FETCH_ITEM, true),
    fetch_files: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_FETCH_FILES,
      true,
    ),
    use_config: normalizeBoolean(process.env.ASSIGN_ASSIGNEES_USE_CONFIG, true),

    skip_drafts: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_SKIP_DRAFTS,
      true,
    ),
    skip_bots: normalizeBoolean(process.env.ASSIGN_ASSIGNEES_SKIP_BOTS, true),
    skip_existing_assignees: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_SKIP_EXISTING_ASSIGNEES,
      false,
    ),

    clear_existing: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_CLEAR_EXISTING,
      false,
    ),
    fail_if_missing_number: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_FAIL_IF_MISSING_NUMBER,
      true,
    ),
    fail_if_no_assignees: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_FAIL_IF_NO_ASSIGNEES,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_FAIL_ON_ERROR,
      true,
    ),

    max_assignees: normalizeInteger(process.env.ASSIGN_ASSIGNEES_MAX, 10),
    timeout_seconds: normalizeInteger(
      process.env.ASSIGN_ASSIGNEES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ASSIGN_ASSIGNEES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ASSIGN_ASSIGNEES_STEP_SUMMARY,
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

    if (arg === "--assignee" || arg === "--assignees") {
      args.assignees.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--fallback-assignee" || arg === "--fallback-assignees") {
      args.fallback_assignees.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-assignee" || arg === "--exclude-assignees") {
      args.exclude_assignees.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--changed-file" || arg === "--changed-files") {
      args.changed_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--assign-author") {
      args.assign_author = true;
      continue;
    }

    if (arg === "--no-assign-author") {
      args.assign_author = false;
      continue;
    }

    if (arg === "--assign-actor") {
      args.assign_actor = true;
      continue;
    }

    if (arg === "--no-assign-actor") {
      args.assign_actor = false;
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

    if (arg === "--skip-bots") {
      args.skip_bots = true;
      continue;
    }

    if (arg === "--no-skip-bots") {
      args.skip_bots = false;
      continue;
    }

    if (arg === "--skip-existing-assignees") {
      args.skip_existing_assignees = true;
      continue;
    }

    if (arg === "--no-skip-existing-assignees") {
      args.skip_existing_assignees = false;
      continue;
    }

    if (arg === "--clear-existing") {
      args.clear_existing = true;
      continue;
    }

    if (arg === "--no-clear-existing") {
      args.clear_existing = false;
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

    if (arg === "--fail-if-no-assignees") {
      args.fail_if_no_assignees = true;
      continue;
    }

    if (arg === "--no-fail-if-no-assignees") {
      args.fail_if_no_assignees = false;
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

    if (arg === "--max-assignees") {
      args.max_assignees = normalizeInteger(
        argv[index + 1],
        args.max_assignees,
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
  args.assignees = [
    ...new Set(args.assignees.map(normalizeUsername).filter(Boolean)),
  ];
  args.fallback_assignees = [
    ...new Set(args.fallback_assignees.map(normalizeUsername).filter(Boolean)),
  ];
  args.exclude_assignees = [
    ...new Set(args.exclude_assignees.map(normalizeUsername).filter(Boolean)),
  ];
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];
  args.max_assignees = Math.min(Math.max(1, args.max_assignees), 10);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Repository Assignee Automation

Usage:
  node .github/scripts/repo/assign-assignees.js [options]

Examples:
  node .github/scripts/repo/assign-assignees.js --dry-run
  node .github/scripts/repo/assign-assignees.js --pr 42 --assignee sinless777
  node .github/scripts/repo/assign-assignees.js --issue 12 --assignees "sinless777,octocat"
  node .github/scripts/repo/assign-assignees.js --label "area:docs" --changed-file docs/index.md
  node .github/scripts/repo/assign-assignees.js --assign-author --skip-bots

Config example:
  {
    "default_assignees": ["sinless777"],
    "fallback_assignees": ["sinless777"],
    "exclude_assignees": ["dependabot"],
    "rules": [
      {
        "name": "Docs",
        "labels": ["area: docs"],
        "paths": ["docs/**", "**/*.md"],
        "assignees": ["sinless777"]
      }
    ]
  }

Options:
      --repo <owner/repo>              Repository slug.
      --api-url <url>                  GitHub API URL.
      --token <token>                  GitHub token.
      --config <file>                  Assignee config file.
      --event-path <file>              GitHub event payload path.
      --number <number>                Issue or PR number.
      --issue <number>                 Issue number.
      --pr <number>                    Pull request number.
      --assignee <user,list>           User(s) to assign.
      --fallback-assignee <user,list>  Fallback user(s) when no rule matches.
      --exclude-assignee <user,list>   User(s) to exclude.
      --label <label,list>             Label(s) to evaluate.
      --changed-file <file,list>       Changed file path(s) to evaluate.
      --assign-author                  Assign the item author.
      --no-assign-author               Do not assign the author. Default.
      --assign-actor                   Assign the GitHub actor.
      --no-assign-actor                Do not assign the actor. Default.
      --fetch-item                     Fetch current issue/PR metadata. Default.
      --no-fetch-item                  Do not fetch current item metadata.
      --fetch-files                    Fetch pull request changed files. Default.
      --no-fetch-files                 Do not fetch pull request files.
      --use-config                     Use config file. Default.
      --no-config                      Ignore config file.
      --skip-drafts                    Skip draft pull requests. Default.
      --no-skip-drafts                 Assign draft pull requests.
      --skip-bots                      Skip bot users. Default.
      --no-skip-bots                   Allow bot users.
      --skip-existing-assignees        Do nothing if item already has assignees.
      --clear-existing                 Remove existing assignees before assigning.
      --fail-if-missing-number         Fail when no issue/PR number resolves. Default.
      --no-fail-if-missing-number      Do not fail when number is missing.
      --fail-if-no-assignees           Fail when no assignees resolve.
      --no-fail-if-no-assignees        Do not fail when no assignees resolve. Default.
      --fail-on-error                  Exit non-zero on error. Default.
      --no-fail-on-error               Do not fail workflow.
      --max-assignees <number>         Maximum assignees to submit. Max 10. Default: 10.
      --timeout-seconds <number>       API timeout. Default: 60.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not mutate GitHub.
      --no-print                       Do not print JSON report.
      --no-step-summary                Do not append GitHub step summary.
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

      if (section === "rules") {
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

    if (section === "rules" && /^-\s*/.test(trimmed)) {
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
      section === "rules" &&
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
    ...(Array.isArray(source.assignee_rules) ? source.assignee_rules : []),
    ...(Array.isArray(source.assignees_by_rule)
      ? source.assignees_by_rule
      : []),
  ].map((rule, index) => normalizeRule(rule, index));

  return {
    default_assignees: normalizeUserList(
      source.default_assignees ||
        source.assignees ||
        source.defaultAssignees ||
        [],
    ),
    fallback_assignees: normalizeUserList(
      source.fallback_assignees || source.fallbackAssignees || [],
    ),
    exclude_assignees: normalizeUserList(
      source.exclude_assignees ||
        source.excluded_assignees ||
        source.excludeAssignees ||
        [],
    ),
    rules,
    max_assignees: normalizeInteger(
      source.max_assignees || source.maxAssignees,
      0,
    ),
    skip_bots:
      source.skip_bots === undefined
        ? undefined
        : normalizeBoolean(source.skip_bots, true),
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
    labels: normalizeStringList(source.labels || source.label)
      .map(normalizeLabel)
      .filter(Boolean),
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
    assignees: normalizeUserList(source.assignees || source.assign || []),
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

  merged.assignees = [
    ...new Set([...merged.assignees, ...normalized.default_assignees]),
  ];
  merged.fallback_assignees = [
    ...new Set([
      ...merged.fallback_assignees,
      ...normalized.fallback_assignees,
    ]),
  ];
  merged.exclude_assignees = [
    ...new Set([...merged.exclude_assignees, ...normalized.exclude_assignees]),
  ];

  if (normalized.max_assignees > 0) {
    merged.max_assignees = Math.min(Math.max(1, normalized.max_assignees), 10);
  }

  if (normalized.skip_bots !== undefined) {
    merged.skip_bots = normalized.skip_bots;
  }

  if (normalized.skip_drafts !== undefined) {
    merged.skip_drafts = normalized.skip_drafts;
  }

  return merged;
}

function normalizeLabel(value) {
  return normalizeString(value).toLowerCase();
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

  return labels;
}

function assigneesFromItems(items) {
  const assignees = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      assignees.push(item);
      continue;
    }

    if (typeof item === "object" && item.login) {
      assignees.push(item.login);
    }
  }

  return normalizeUserList(assignees);
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
    existing_assignees: assigneesFromItems(item?.assignees),
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
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-assign-assignees-script`,
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

async function removeAssignees(args, number, assignees) {
  if (!assignees.length) {
    return {
      removed: [],
      response: null,
    };
  }

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/assignees`),
    ),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        assignees,
      },
    },
  );

  return {
    removed: assignees,
    response: response.body,
  };
}

async function addAssignees(args, number, assignees) {
  if (!assignees.length) {
    return {
      added: [],
      response: null,
    };
  }

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/assignees`),
    ),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        assignees,
      },
    },
  );

  return {
    added: assignees,
    response: response.body,
  };
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
    enriched.existing_assignees = [
      ...new Set([
        ...enriched.existing_assignees,
        ...assigneesFromItems(issue.assignees),
      ]),
    ];

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

function evaluateRule(rule, input) {
  if (!rule.enabled) {
    return {
      matched: false,
      reasons: [],
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
    checks,
    rule,
  };
}

function resolveAssignees(args, config, input) {
  const ruleResults = config.rules.map((rule) => evaluateRule(rule, input));
  const matchedRules = ruleResults.filter((result) => result.matched);
  const ruleAssignees = matchedRules.flatMap((result) => result.rule.assignees);

  const assignees = [];

  assignees.push(...args.assignees);
  assignees.push(...ruleAssignees);

  if (args.assign_author && input.author) {
    assignees.push(input.author);
  }

  if (args.assign_actor && input.actor) {
    assignees.push(input.actor);
  }

  if (!assignees.length) {
    assignees.push(...args.fallback_assignees);
  }

  const excluded = new Set(
    args.exclude_assignees.map((user) => user.toLowerCase()),
  );

  const resolved = [
    ...new Set(
      assignees
        .map(normalizeUsername)
        .filter(Boolean)
        .filter((user) => !excluded.has(user.toLowerCase()))
        .filter((user) => !args.skip_bots || !isBotUsername(user)),
    ),
  ].slice(0, args.max_assignees);

  const skipped = [
    ...new Set(
      assignees
        .map(normalizeUsername)
        .filter(Boolean)
        .filter(
          (user) =>
            excluded.has(user.toLowerCase()) ||
            (args.skip_bots && isBotUsername(user)),
        ),
    ),
  ];

  return {
    assignees: resolved,
    skipped_assignees: skipped,
    matched_rules: matchedRules.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      reasons: result.reasons,
      assignees: result.rule.assignees,
    })),
    rule_results: ruleResults.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      matched: result.matched,
      reasons: result.reasons,
    })),
  };
}

async function executeAssignment(args, input, assignment) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    existing_assignees: input.existing_assignees,
    requested_assignees: assignment.assignees,
    skipped_assignees: assignment.skipped_assignees,
    added_assignees: [],
    removed_assignees: [],
    final_assignees: input.existing_assignees,
    errors: [],
    warnings: [],
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
      result.warnings.push("Draft pull request assignment skipped.");
      return result;
    }

    if (args.skip_existing_assignees && input.existing_assignees.length) {
      result.status = "skipped-existing-assignees";
      result.success = true;
      result.warnings.push(
        "Item already has assignees and skip_existing_assignees is enabled.",
      );
      return result;
    }

    if (!assignment.assignees.length) {
      result.status = args.fail_if_no_assignees ? "invalid" : "skipped";
      result.success = !args.fail_if_no_assignees;
      result.errors.push("No assignees resolved.");
      return result;
    }

    const existingSet = new Set(
      input.existing_assignees.map((user) => user.toLowerCase()),
    );
    const requestedSet = new Set(
      assignment.assignees.map((user) => user.toLowerCase()),
    );

    const toRemove = args.clear_existing
      ? input.existing_assignees.filter(
          (user) => !requestedSet.has(user.toLowerCase()),
        )
      : [];

    const toAdd = assignment.assignees.filter(
      (user) => !existingSet.has(user.toLowerCase()) || args.clear_existing,
    );

    if (!toAdd.length && !toRemove.length) {
      result.status = "already-assigned";
      result.success = true;
      result.final_assignees = input.existing_assignees;
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.added_assignees = toAdd;
      result.removed_assignees = toRemove;
      result.final_assignees = args.clear_existing
        ? assignment.assignees
        : [...new Set([...input.existing_assignees, ...toAdd])];
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_ASSIGNEES_TOKEN, or --token.",
      );
      return result;
    }

    if (toRemove.length) {
      logger.info(
        `Removing ${toRemove.length} assignee(s) from #${input.number}.`,
      );
      const removeResult = await removeAssignees(args, input.number, toRemove);
      result.removed_assignees = removeResult.removed;
    }

    if (toAdd.length) {
      logger.info(`Adding ${toAdd.length} assignee(s) to #${input.number}.`);
      const addResult = await addAssignees(args, input.number, toAdd);
      result.added_assignees = addResult.added;
      result.final_assignees = assigneesFromItems(
        addResult.response?.assignees || [],
      );
    } else {
      result.final_assignees = assignment.assignees;
    }

    result.status = "assigned";
    result.success = true;

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
  assignment,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const status = execution.status;
  const ok = execution.success && execution.errors.length === 0;

  return {
    schema_version: 1,
    type: "repo-assign-assignees",
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
      assign_author: args.assign_author,
      assign_actor: args.assign_actor,
      skip_drafts: args.skip_drafts,
      skip_bots: args.skip_bots,
      skip_existing_assignees: args.skip_existing_assignees,
      clear_existing: args.clear_existing,
      max_assignees: args.max_assignees,
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
      existing_assignees: input.existing_assignees,
      fetched_item: input.fetched_item,
      fetched_files: input.fetched_files,
    },
    assignment: {
      requested_assignees: assignment.assignees,
      skipped_assignees: assignment.skipped_assignees,
      matched_rules: assignment.matched_rules,
      rule_results: assignment.rule_results,
    },
    execution,
    totals: {
      labels: input.labels.length,
      changed_files: input.changed_files.length,
      rules: config.rules.length,
      matched_rules: assignment.matched_rules.length,
      existing_assignees: input.existing_assignees.length,
      requested_assignees: assignment.assignees.length,
      added_assignees: execution.added_assignees.length,
      removed_assignees: execution.removed_assignees.length,
      skipped_assignees: assignment.skipped_assignees.length,
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

  const lines = [
    `# 👥 ${PROJECT_NAME} Assignee Automation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Item: \`${report.item.kind} #${report.item.number || "unresolved"}\``,
    `- Requested assignees: \`${report.totals.requested_assignees}\``,
    `- Added assignees: \`${report.totals.added_assignees}\``,
    `- Removed assignees: \`${report.totals.removed_assignees}\``,
    `- Matched rules: \`${report.totals.matched_rules}\``,
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

  lines.push("## 🎯 Item");
  lines.push("");
  lines.push(`- Title: \`${escapeMarkdown(report.item.title || "none")}\``);
  lines.push(`- Author: \`${report.item.author || "unknown"}\``);
  lines.push(`- Actor: \`${report.item.actor || "unknown"}\``);
  lines.push(`- Draft: \`${report.item.draft ? "true" : "false"}\``);
  lines.push(`- Labels: \`${report.item.labels.length}\``);
  lines.push(`- Changed files: \`${report.item.changed_files.length}\``);
  lines.push(
    `- Existing assignees: \`${report.item.existing_assignees.join(", ") || "none"}\``,
  );

  lines.push("");
  lines.push("## 👤 Assignees");
  lines.push("");
  lines.push(
    `- Requested: \`${report.assignment.requested_assignees.join(", ") || "none"}\``,
  );
  lines.push(
    `- Added: \`${report.execution.added_assignees.join(", ") || "none"}\``,
  );
  lines.push(
    `- Removed: \`${report.execution.removed_assignees.join(", ") || "none"}\``,
  );
  lines.push(
    `- Final: \`${report.execution.final_assignees.join(", ") || "none"}\``,
  );

  if (report.assignment.skipped_assignees.length) {
    lines.push(
      `- Skipped: \`${report.assignment.skipped_assignees.join(", ")}\``,
    );
  }

  lines.push("");
  lines.push("## 🧩 Matching Rules");
  lines.push("");

  if (!report.assignment.matched_rules.length) {
    lines.push("No config rules matched.");
  } else {
    lines.push("| Rule | Reasons | Assignees |");
    lines.push("|---|---|---|");

    for (const rule of report.assignment.matched_rules) {
      lines.push(
        `| \`${escapeMarkdown(rule.name)}\` | \`${escapeMarkdown(rule.reasons.join(", ") || "matched")}\` | \`${escapeMarkdown(rule.assignees.join(", ") || "none")}\` |`,
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
  setGitHubOutput("assign_assignees_file", report.config.output_file);
  setGitHubOutput(
    "assign_assignees_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("assign_assignees_status", report.status);
  setGitHubOutput("assign_assignees_ok", report.ok ? "true" : "false");

  setGitHubOutput("assign_assignees_number", report.item.number || "");
  setGitHubOutput("assign_assignees_kind", report.item.kind || "");
  setGitHubOutput("assign_assignees_url", report.item.url || "");

  setGitHubOutput(
    "assign_assignees_requested",
    report.assignment.requested_assignees.join(","),
  );
  setGitHubOutput(
    "assign_assignees_requested_json",
    JSON.stringify(report.assignment.requested_assignees),
  );
  setGitHubOutput(
    "assign_assignees_added",
    report.execution.added_assignees.join(","),
  );
  setGitHubOutput(
    "assign_assignees_added_json",
    JSON.stringify(report.execution.added_assignees),
  );
  setGitHubOutput(
    "assign_assignees_removed",
    report.execution.removed_assignees.join(","),
  );
  setGitHubOutput(
    "assign_assignees_removed_json",
    JSON.stringify(report.execution.removed_assignees),
  );
  setGitHubOutput(
    "assign_assignees_final",
    report.execution.final_assignees.join(","),
  );
  setGitHubOutput(
    "assign_assignees_final_json",
    JSON.stringify(report.execution.final_assignees),
  );

  setGitHubOutput(
    "assign_assignees_matched_rules",
    String(report.totals.matched_rules),
  );
  setGitHubOutput(
    "assign_assignees_matched_rules_json",
    JSON.stringify(report.assignment.matched_rules),
  );
  setGitHubOutput(
    "assign_assignees_errors_json",
    JSON.stringify(report.errors),
  );
  setGitHubOutput(
    "assign_assignees_warnings_json",
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

  logger.info("Preparing assignee automation.");

  let input = collectEventInput(args, repoRoot);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    logger.warn(`Unable to enrich issue/PR input: ${logger.formatError(err)}`);
  }

  const assignment = resolveAssignees(args, normalizedConfig, input);
  const execution = await executeAssignment(args, input, assignment);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(rawConfig),
    normalizedConfig,
    input,
    assignment,
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
