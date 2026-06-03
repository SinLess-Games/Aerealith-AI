#!/usr/bin/env node
// .github/scripts/repo/assign-reviewers.js
// =============================================================================
// Aerealith AI — Repository Reviewer Automation
// -----------------------------------------------------------------------------
// Purpose:
//   Request, replace, or remove GitHub pull request reviewers from direct inputs,
//   workflow event payloads, labels, changed paths, titles, bodies, authors,
//   teams, and configurable rules.
//
// Input:
//   - GitHub event payload
//   - .github/repo/assign-reviewers.json
//   - .github/repo/assign-reviewers.jsonc
//   - .github/repo/assign-reviewers.yaml
//   - .github/repo/assign-reviewers.yml
//   - .github/repo/reviewers.json
//   - .github/repo/reviewers.yaml
//
// Output:
//   - artifacts/repo/assign-reviewers.json
//   - artifacts/repo/assign-reviewers.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Safe dry-run mode.
//   - Reviewers can only be requested on pull requests.
//   - Pull request authors are excluded by default.
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
    info: (message) => console.log(`[assign-reviewers] ${message}`),
    warn: (message) => console.warn(`[assign-reviewers] WARN: ${message}`),
    error: (message) => console.error(`[assign-reviewers] ERROR: ${message}`),
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
  ".github/repo/assign-reviewers.json",
  ".github/repo/assign-reviewers.jsonc",
  ".github/repo/assign-reviewers.yaml",
  ".github/repo/assign-reviewers.yml",
  ".github/repo/reviewer-rules.json",
  ".github/repo/reviewer-rules.jsonc",
  ".github/repo/reviewer-rules.yaml",
  ".github/repo/reviewer-rules.yml",
  ".github/repo/reviewers.json",
  ".github/repo/reviewers.jsonc",
  ".github/repo/reviewers.yaml",
  ".github/repo/reviewers.yml",
  ".github/assign-reviewers.json",
  ".github/assign-reviewers.jsonc",
  ".github/assign-reviewers.yaml",
  ".github/assign-reviewers.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/assign-reviewers.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/assign-reviewers.md";

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

function normalizeTeamSlug(value) {
  const normalized = normalizeString(value).replace(/^@/, "").trim();

  if (!normalized) return "";

  const parts = normalized.split("/").filter(Boolean);

  return parts[parts.length - 1].toLowerCase();
}

function normalizeTeamList(value) {
  return [
    ...new Set(
      normalizeStringList(value).map(normalizeTeamSlug).filter(Boolean),
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ASSIGN_REVIEWERS_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ASSIGN_REVIEWERS_CONFIG_FILE || "",

    event_path:
      process.env.ASSIGN_REVIEWERS_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ASSIGN_REVIEWERS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ASSIGN_REVIEWERS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.ASSIGN_REVIEWERS_NUMBER ||
      process.env.PR_NUMBER ||
      process.env.PULL_REQUEST_NUMBER ||
      "",

    reviewers: normalizeUserList(
      process.env.ASSIGN_REVIEWERS ||
        process.env.REVIEWERS ||
        process.env.DEFAULT_REVIEWERS ||
        "",
    ),
    team_reviewers: normalizeTeamList(
      process.env.ASSIGN_TEAM_REVIEWERS ||
        process.env.TEAM_REVIEWERS ||
        process.env.DEFAULT_TEAM_REVIEWERS ||
        "",
    ),

    fallback_reviewers: normalizeUserList(
      process.env.ASSIGN_REVIEWERS_FALLBACK ||
        process.env.FALLBACK_REVIEWERS ||
        "",
    ),
    fallback_team_reviewers: normalizeTeamList(
      process.env.ASSIGN_TEAM_REVIEWERS_FALLBACK ||
        process.env.FALLBACK_TEAM_REVIEWERS ||
        "",
    ),

    remove_reviewers: normalizeUserList(
      process.env.ASSIGN_REVIEWERS_REMOVE || process.env.REMOVE_REVIEWERS || "",
    ),
    remove_team_reviewers: normalizeTeamList(
      process.env.ASSIGN_TEAM_REVIEWERS_REMOVE ||
        process.env.REMOVE_TEAM_REVIEWERS ||
        "",
    ),

    exclude_reviewers: normalizeUserList(
      process.env.ASSIGN_REVIEWERS_EXCLUDE ||
        process.env.EXCLUDED_REVIEWERS ||
        "",
    ),
    exclude_team_reviewers: normalizeTeamList(
      process.env.ASSIGN_TEAM_REVIEWERS_EXCLUDE ||
        process.env.EXCLUDED_TEAM_REVIEWERS ||
        "",
    ),

    labels: normalizeLabelList(
      process.env.ASSIGN_REVIEWERS_LABELS ||
        process.env.PR_LABELS ||
        process.env.ISSUE_LABELS ||
        "",
    ),
    changed_files: normalizeStringList(
      process.env.ASSIGN_REVIEWERS_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    request_actor: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_REQUEST_ACTOR,
      false,
    ),
    fetch_item: normalizeBoolean(process.env.ASSIGN_REVIEWERS_FETCH_ITEM, true),
    fetch_files: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_FETCH_FILES,
      true,
    ),
    use_config: normalizeBoolean(process.env.ASSIGN_REVIEWERS_USE_CONFIG, true),

    skip_drafts: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_SKIP_DRAFTS,
      true,
    ),
    skip_bots: normalizeBoolean(process.env.ASSIGN_REVIEWERS_SKIP_BOTS, true),
    skip_author: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_SKIP_AUTHOR,
      true,
    ),
    skip_existing_reviewers: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_SKIP_EXISTING,
      false,
    ),

    clear_existing: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_CLEAR_EXISTING,
      false,
    ),
    replace_existing: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_REPLACE_EXISTING,
      false,
    ),
    remove_unmatched: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_REMOVE_UNMATCHED,
      false,
    ),

    fail_if_missing_number: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_FAIL_IF_MISSING_NUMBER,
      true,
    ),
    fail_if_not_pr: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_FAIL_IF_NOT_PR,
      true,
    ),
    fail_if_no_reviewers: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_FAIL_IF_NO_REVIEWERS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_FAIL_ON_ERROR,
      true,
    ),

    max_reviewers: normalizeInteger(process.env.ASSIGN_REVIEWERS_MAX, 15),
    max_team_reviewers: normalizeInteger(
      process.env.ASSIGN_TEAM_REVIEWERS_MAX,
      15,
    ),
    timeout_seconds: normalizeInteger(
      process.env.ASSIGN_REVIEWERS_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ASSIGN_REVIEWERS_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ASSIGN_REVIEWERS_STEP_SUMMARY,
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
      arg === "--pull-request" ||
      arg === "--pull-request-number"
    ) {
      args.number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--reviewer" || arg === "--reviewers") {
      args.reviewers.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--team-reviewer" || arg === "--team-reviewers") {
      args.team_reviewers.push(...normalizeTeamList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--fallback-reviewer" || arg === "--fallback-reviewers") {
      args.fallback_reviewers.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (
      arg === "--fallback-team-reviewer" ||
      arg === "--fallback-team-reviewers"
    ) {
      args.fallback_team_reviewers.push(...normalizeTeamList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--remove-reviewer" || arg === "--remove-reviewers") {
      args.remove_reviewers.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--remove-team-reviewer" || arg === "--remove-team-reviewers") {
      args.remove_team_reviewers.push(...normalizeTeamList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-reviewer" || arg === "--exclude-reviewers") {
      args.exclude_reviewers.push(...normalizeUserList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (
      arg === "--exclude-team-reviewer" ||
      arg === "--exclude-team-reviewers"
    ) {
      args.exclude_team_reviewers.push(...normalizeTeamList(argv[index + 1]));
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

    if (arg === "--request-actor") {
      args.request_actor = true;
      continue;
    }

    if (arg === "--no-request-actor") {
      args.request_actor = false;
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

    if (arg === "--skip-author") {
      args.skip_author = true;
      continue;
    }

    if (arg === "--no-skip-author") {
      args.skip_author = false;
      continue;
    }

    if (arg === "--skip-existing-reviewers") {
      args.skip_existing_reviewers = true;
      continue;
    }

    if (arg === "--no-skip-existing-reviewers") {
      args.skip_existing_reviewers = false;
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

    if (arg === "--replace-existing") {
      args.replace_existing = true;
      continue;
    }

    if (arg === "--no-replace-existing") {
      args.replace_existing = false;
      continue;
    }

    if (arg === "--remove-unmatched") {
      args.remove_unmatched = true;
      continue;
    }

    if (arg === "--no-remove-unmatched") {
      args.remove_unmatched = false;
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

    if (arg === "--fail-if-not-pr") {
      args.fail_if_not_pr = true;
      continue;
    }

    if (arg === "--no-fail-if-not-pr") {
      args.fail_if_not_pr = false;
      continue;
    }

    if (arg === "--fail-if-no-reviewers") {
      args.fail_if_no_reviewers = true;
      continue;
    }

    if (arg === "--no-fail-if-no-reviewers") {
      args.fail_if_no_reviewers = false;
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

    if (arg === "--max-reviewers") {
      args.max_reviewers = normalizeInteger(
        argv[index + 1],
        args.max_reviewers,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-team-reviewers") {
      args.max_team_reviewers = normalizeInteger(
        argv[index + 1],
        args.max_team_reviewers,
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
  args.reviewers = [
    ...new Set(args.reviewers.map(normalizeUsername).filter(Boolean)),
  ];
  args.team_reviewers = [
    ...new Set(args.team_reviewers.map(normalizeTeamSlug).filter(Boolean)),
  ];
  args.fallback_reviewers = [
    ...new Set(args.fallback_reviewers.map(normalizeUsername).filter(Boolean)),
  ];
  args.fallback_team_reviewers = [
    ...new Set(
      args.fallback_team_reviewers.map(normalizeTeamSlug).filter(Boolean),
    ),
  ];
  args.remove_reviewers = [
    ...new Set(args.remove_reviewers.map(normalizeUsername).filter(Boolean)),
  ];
  args.remove_team_reviewers = [
    ...new Set(
      args.remove_team_reviewers.map(normalizeTeamSlug).filter(Boolean),
    ),
  ];
  args.exclude_reviewers = [
    ...new Set(args.exclude_reviewers.map(normalizeUsername).filter(Boolean)),
  ];
  args.exclude_team_reviewers = [
    ...new Set(
      args.exclude_team_reviewers.map(normalizeTeamSlug).filter(Boolean),
    ),
  ];
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];
  args.max_reviewers = Math.min(Math.max(1, args.max_reviewers), 100);
  args.max_team_reviewers = Math.min(Math.max(1, args.max_team_reviewers), 100);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Repository Reviewer Automation

Usage:
  node .github/scripts/repo/assign-reviewers.js [options]

Examples:
  node .github/scripts/repo/assign-reviewers.js --dry-run
  node .github/scripts/repo/assign-reviewers.js --pr 42 --reviewer sinless777
  node .github/scripts/repo/assign-reviewers.js --pr 42 --team-reviewer frontend
  node .github/scripts/repo/assign-reviewers.js --label "area: ci" --changed-file .github/workflows/ci.yaml
  node .github/scripts/repo/assign-reviewers.js --replace-existing --reviewers "sinless777,octocat"

Config example:
  {
    "default_reviewers": ["sinless777"],
    "fallback_team_reviewers": ["maintainers"],
    "exclude_reviewers": ["dependabot"],
    "rules": [
      {
        "name": "Docs",
        "paths": ["docs/**", "**/*.md"],
        "reviewers": ["sinless777"],
        "team_reviewers": ["docs"]
      },
      {
        "name": "CI",
        "paths": [".github/**"],
        "labels": ["area: ci"],
        "team_reviewers": ["platform"]
      }
    ]
  }

Options:
      --repo <owner/repo>                   Repository slug.
      --api-url <url>                       GitHub API URL.
      --token <token>                       GitHub token.
      --config <file>                       Reviewer config file.
      --event-path <file>                   GitHub event payload path.
      --number <number>                     Pull request number.
      --pr <number>                         Pull request number.
      --reviewer <user,list>                User reviewer(s) to request.
      --team-reviewer <team,list>           Team reviewer slug(s) to request.
      --fallback-reviewer <user,list>       Fallback user reviewer(s).
      --fallback-team-reviewer <team,list>  Fallback team reviewer(s).
      --remove-reviewer <user,list>         User reviewer request(s) to remove.
      --remove-team-reviewer <team,list>    Team reviewer request(s) to remove.
      --exclude-reviewer <user,list>        User reviewer(s) to exclude.
      --exclude-team-reviewer <team,list>   Team reviewer(s) to exclude.
      --label <label,list>                  Label(s) to evaluate.
      --changed-file <file,list>            Changed file path(s) to evaluate.
      --request-actor                       Request current GitHub actor as reviewer.
      --no-request-actor                    Do not request actor. Default.
      --fetch-item                          Fetch current PR and issue metadata. Default.
      --no-fetch-item                       Do not fetch current PR metadata.
      --fetch-files                         Fetch pull request changed files. Default.
      --no-fetch-files                      Do not fetch pull request files.
      --use-config                          Use config file. Default.
      --no-config                           Ignore config file.
      --skip-drafts                         Skip draft pull requests. Default.
      --no-skip-drafts                      Request reviewers on draft pull requests.
      --skip-bots                           Exclude bot reviewers. Default.
      --no-skip-bots                        Allow bot reviewers.
      --skip-author                         Exclude PR author. Default.
      --no-skip-author                      Allow PR author in resolved list.
      --skip-existing-reviewers             Do nothing if reviewers already requested.
      --clear-existing                      Remove existing requested reviewers first.
      --replace-existing                    Replace existing requested reviewers.
      --remove-unmatched                    Remove requested reviewers not in final set.
      --fail-if-missing-number              Fail when no PR number resolves. Default.
      --no-fail-if-missing-number           Do not fail when number is missing.
      --fail-if-not-pr                      Fail when item is not a PR. Default.
      --no-fail-if-not-pr                   Skip when item is not a PR.
      --fail-if-no-reviewers                Fail when no reviewers resolve.
      --no-fail-if-no-reviewers             Do not fail when no reviewers resolve. Default.
      --fail-on-error                       Exit non-zero on error. Default.
      --no-fail-on-error                    Do not fail workflow.
      --max-reviewers <number>              Maximum user reviewers. Default: 15.
      --max-team-reviewers <number>         Maximum team reviewers. Default: 15.
      --timeout-seconds <number>            API timeout. Default: 60.
  -o, --output <file>                       JSON output file.
      --summary <file>                      Markdown summary output file.
      --no-summary                          Do not write Markdown summary.
      --dry-run                             Plan but do not mutate GitHub.
      --no-print                            Do not print JSON report.
      --no-step-summary                     Do not append GitHub step summary.
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

      if (section === "rules" || section === "reviewer_rules") {
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
      (section === "rules" || section === "reviewer_rules") &&
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
      (section === "rules" || section === "reviewer_rules") &&
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
    ...(Array.isArray(source.reviewer_rules) ? source.reviewer_rules : []),
    ...(Array.isArray(source.reviewers_by_rule)
      ? source.reviewers_by_rule
      : []),
  ].map((rule, index) => normalizeRule(rule, index));

  return {
    default_reviewers: normalizeUserList(
      source.default_reviewers ||
        source.reviewers ||
        source.defaultReviewers ||
        [],
    ),
    default_team_reviewers: normalizeTeamList(
      source.default_team_reviewers ||
        source.team_reviewers ||
        source.defaultTeamReviewers ||
        [],
    ),
    fallback_reviewers: normalizeUserList(
      source.fallback_reviewers || source.fallbackReviewers || [],
    ),
    fallback_team_reviewers: normalizeTeamList(
      source.fallback_team_reviewers || source.fallbackTeamReviewers || [],
    ),
    remove_reviewers: normalizeUserList(
      source.remove_reviewers ||
        source.removed_reviewers ||
        source.removeReviewers ||
        [],
    ),
    remove_team_reviewers: normalizeTeamList(
      source.remove_team_reviewers ||
        source.removed_team_reviewers ||
        source.removeTeamReviewers ||
        [],
    ),
    exclude_reviewers: normalizeUserList(
      source.exclude_reviewers ||
        source.excluded_reviewers ||
        source.excludeReviewers ||
        [],
    ),
    exclude_team_reviewers: normalizeTeamList(
      source.exclude_team_reviewers ||
        source.excluded_team_reviewers ||
        source.excludeTeamReviewers ||
        [],
    ),
    rules,
    max_reviewers: normalizeInteger(
      source.max_reviewers || source.maxReviewers,
      0,
    ),
    max_team_reviewers: normalizeInteger(
      source.max_team_reviewers || source.maxTeamReviewers,
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
    skip_author:
      source.skip_author === undefined
        ? undefined
        : normalizeBoolean(source.skip_author, true),
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

    reviewers: normalizeUserList(
      source.reviewers ||
        source.assign_reviewers ||
        source.request_reviewers ||
        source.users ||
        [],
    ),
    team_reviewers: normalizeTeamList(
      source.team_reviewers ||
        source.assign_team_reviewers ||
        source.request_team_reviewers ||
        source.teams ||
        [],
    ),
    remove_reviewers: normalizeUserList(
      source.remove_reviewers || source.dismiss_reviewers || [],
    ),
    remove_team_reviewers: normalizeTeamList(
      source.remove_team_reviewers || source.dismiss_team_reviewers || [],
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

  merged.reviewers = [
    ...new Set([...merged.reviewers, ...normalized.default_reviewers]),
  ];
  merged.team_reviewers = [
    ...new Set([
      ...merged.team_reviewers,
      ...normalized.default_team_reviewers,
    ]),
  ];
  merged.fallback_reviewers = [
    ...new Set([
      ...merged.fallback_reviewers,
      ...normalized.fallback_reviewers,
    ]),
  ];
  merged.fallback_team_reviewers = [
    ...new Set([
      ...merged.fallback_team_reviewers,
      ...normalized.fallback_team_reviewers,
    ]),
  ];
  merged.remove_reviewers = [
    ...new Set([...merged.remove_reviewers, ...normalized.remove_reviewers]),
  ];
  merged.remove_team_reviewers = [
    ...new Set([
      ...merged.remove_team_reviewers,
      ...normalized.remove_team_reviewers,
    ]),
  ];
  merged.exclude_reviewers = [
    ...new Set([...merged.exclude_reviewers, ...normalized.exclude_reviewers]),
  ];
  merged.exclude_team_reviewers = [
    ...new Set([
      ...merged.exclude_team_reviewers,
      ...normalized.exclude_team_reviewers,
    ]),
  ];

  if (normalized.max_reviewers > 0) {
    merged.max_reviewers = Math.min(Math.max(1, normalized.max_reviewers), 100);
  }

  if (normalized.max_team_reviewers > 0) {
    merged.max_team_reviewers = Math.min(
      Math.max(1, normalized.max_team_reviewers),
      100,
    );
  }

  if (normalized.skip_bots !== undefined) {
    merged.skip_bots = normalized.skip_bots;
  }

  if (normalized.skip_drafts !== undefined) {
    merged.skip_drafts = normalized.skip_drafts;
  }

  if (normalized.skip_author !== undefined) {
    merged.skip_author = normalized.skip_author;
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

function reviewersFromItems(items) {
  const reviewers = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      reviewers.push(item);
      continue;
    }

    if (typeof item === "object" && item.login) {
      reviewers.push(item.login);
    }
  }

  return normalizeUserList(reviewers);
}

function teamsFromItems(items) {
  const teams = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      teams.push(item);
      continue;
    }

    if (typeof item === "object" && item.slug) {
      teams.push(item.slug);
      continue;
    }

    if (typeof item === "object" && item.name) {
      teams.push(item.name);
    }
  }

  return normalizeTeamList(teams);
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

  const number = normalizeString(args.number || eventNumber);

  return {
    event_available: Boolean(event),
    event_name: normalizeString(process.env.GITHUB_EVENT_NAME || event?.action),
    event_action: normalizeString(event?.action),
    number,
    kind: eventKind,
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
    changed_files: [
      ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
    ],
    existing_reviewers: reviewersFromItems(
      event?.pull_request?.requested_reviewers,
    ),
    existing_team_reviewers: teamsFromItems(
      event?.pull_request?.requested_teams,
    ),
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-assign-reviewers-script`,
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

async function addReviewers(args, number, reviewers, teamReviewers) {
  if (!reviewers.length && !teamReviewers.length) {
    return {
      added_reviewers: [],
      added_team_reviewers: [],
      response: null,
    };
  }

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(
        args,
        `/pulls/${encodeURIComponent(number)}/requested_reviewers`,
      ),
    ),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        reviewers,
        team_reviewers: teamReviewers,
      },
    },
  );

  return {
    added_reviewers: reviewers,
    added_team_reviewers: teamReviewers,
    response: response.body,
  };
}

async function removeReviewers(args, number, reviewers, teamReviewers) {
  if (!reviewers.length && !teamReviewers.length) {
    return {
      removed_reviewers: [],
      removed_team_reviewers: [],
      response: null,
    };
  }

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(
        args,
        `/pulls/${encodeURIComponent(number)}/requested_reviewers`,
      ),
    ),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        reviewers,
        team_reviewers: teamReviewers,
      },
      allow_error: true,
    },
  );

  if (!response.ok && response.status_code !== 404) {
    const message =
      typeof response.body === "object" && response.body?.message
        ? response.body.message
        : response.raw_body || `HTTP ${response.status_code}`;

    throw new Error(`Failed to remove requested reviewers: ${message}`);
  }

  return {
    removed_reviewers: reviewers,
    removed_team_reviewers: teamReviewers,
    response: response.body,
  };
}

async function enrichInput(args, input) {
  const enriched = {
    ...input,
    fetched_issue: false,
    fetched_pull_request: false,
    fetched_files: false,
    api_issue: null,
    api_pull_request: null,
  };

  if (args.dry_run && !args.token) {
    if (enriched.number && enriched.kind === "unknown") {
      enriched.kind = "pull_request";
    }

    return enriched;
  }

  if (args.fetch_item && input.number && args.token) {
    try {
      const issue = await fetchIssue(args, input.number);

      enriched.fetched_issue = true;
      enriched.api_issue = issue;
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

      if (issue.pull_request) {
        enriched.kind = "pull_request";
      } else if (enriched.kind === "unknown") {
        enriched.kind = "issue";
      }
    } catch (err) {
      logger.warn(`Unable to fetch issue metadata: ${logger.formatError(err)}`);
    }
  }

  if (args.fetch_item && input.number && args.token) {
    try {
      const pull = await fetchPullRequest(args, input.number);

      enriched.fetched_pull_request = true;
      enriched.api_pull_request = pull;
      enriched.kind = "pull_request";
      enriched.draft = Boolean(pull.draft);
      enriched.title = enriched.title || normalizeString(pull.title);
      enriched.body = enriched.body || normalizeString(pull.body);
      enriched.author = enriched.author || normalizeUsername(pull.user?.login);
      enriched.existing_reviewers = [
        ...new Set([
          ...enriched.existing_reviewers,
          ...reviewersFromItems(pull.requested_reviewers),
        ]),
      ];
      enriched.existing_team_reviewers = [
        ...new Set([
          ...enriched.existing_team_reviewers,
          ...teamsFromItems(pull.requested_teams),
        ]),
      ];
    } catch (err) {
      logger.warn(
        `Unable to fetch pull request metadata: ${logger.formatError(err)}`,
      );
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

function resolveReviewers(args, config, input) {
  const ruleResults = config.rules.map((rule) => evaluateRule(rule, input));
  const matchedRules = ruleResults
    .filter((result) => result.matched)
    .sort((left, right) => right.rule.priority - left.rule.priority);

  const userCandidates = [
    ...args.reviewers,
    ...matchedRules.flatMap((result) => result.rule.reviewers),
  ];

  const teamCandidates = [
    ...args.team_reviewers,
    ...matchedRules.flatMap((result) => result.rule.team_reviewers),
  ];

  const removeUserCandidates = [
    ...args.remove_reviewers,
    ...matchedRules.flatMap((result) => result.rule.remove_reviewers),
  ];

  const removeTeamCandidates = [
    ...args.remove_team_reviewers,
    ...matchedRules.flatMap((result) => result.rule.remove_team_reviewers),
  ];

  if (args.request_actor && input.actor) {
    userCandidates.push(input.actor);
  }

  if (!userCandidates.length && !teamCandidates.length) {
    userCandidates.push(...args.fallback_reviewers);
    teamCandidates.push(...args.fallback_team_reviewers);
  }

  const excludedUsers = new Set(
    args.exclude_reviewers.map((user) => user.toLowerCase()),
  );
  const excludedTeams = new Set(
    args.exclude_team_reviewers.map((team) => team.toLowerCase()),
  );
  const author = normalizeUsername(input.author).toLowerCase();

  const skippedReviewers = [
    ...new Set(
      userCandidates
        .map(normalizeUsername)
        .filter(Boolean)
        .filter((user) => {
          const lower = user.toLowerCase();

          return (
            excludedUsers.has(lower) ||
            (args.skip_bots && isBotUsername(user)) ||
            (args.skip_author && author && lower === author)
          );
        }),
    ),
  ];

  const skippedTeamReviewers = [
    ...new Set(
      teamCandidates
        .map(normalizeTeamSlug)
        .filter(Boolean)
        .filter((team) => excludedTeams.has(team.toLowerCase())),
    ),
  ];

  const reviewers = [
    ...new Set(
      userCandidates
        .map(normalizeUsername)
        .filter(Boolean)
        .filter((user) => {
          const lower = user.toLowerCase();

          return (
            !excludedUsers.has(lower) &&
            (!args.skip_bots || !isBotUsername(user)) &&
            (!args.skip_author || !author || lower !== author)
          );
        }),
    ),
  ].slice(0, args.max_reviewers);

  const teamReviewers = [
    ...new Set(
      teamCandidates
        .map(normalizeTeamSlug)
        .filter(Boolean)
        .filter((team) => !excludedTeams.has(team.toLowerCase())),
    ),
  ].slice(0, args.max_team_reviewers);

  const removeReviewers = [
    ...new Set(
      removeUserCandidates
        .map(normalizeUsername)
        .filter(Boolean)
        .filter((user) => {
          const lower = user.toLowerCase();

          return !excludedUsers.has(lower);
        }),
    ),
  ];

  const removeTeamReviewers = [
    ...new Set(
      removeTeamCandidates
        .map(normalizeTeamSlug)
        .filter(Boolean)
        .filter((team) => !excludedTeams.has(team.toLowerCase())),
    ),
  ];

  return {
    reviewers,
    team_reviewers: teamReviewers,
    remove_reviewers: removeReviewers,
    remove_team_reviewers: removeTeamReviewers,
    skipped_reviewers: skippedReviewers,
    skipped_team_reviewers: skippedTeamReviewers,
    matched_rules: matchedRules.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      reasons: result.reasons,
      reviewers: result.rule.reviewers,
      team_reviewers: result.rule.team_reviewers,
      remove_reviewers: result.rule.remove_reviewers,
      remove_team_reviewers: result.rule.remove_team_reviewers,
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

function uniqueUsers(values) {
  return [...new Set(values.map(normalizeUsername).filter(Boolean))];
}

function uniqueTeams(values) {
  return [...new Set(values.map(normalizeTeamSlug).filter(Boolean))];
}

function parseFinalReviewersFromPull(pull, fallbackUsers, fallbackTeams) {
  if (!pull || typeof pull !== "object") {
    return {
      reviewers: fallbackUsers,
      team_reviewers: fallbackTeams,
    };
  }

  return {
    reviewers: reviewersFromItems(pull.requested_reviewers),
    team_reviewers: teamsFromItems(pull.requested_teams),
  };
}

async function executeReviewerAssignment(args, input, assignment) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    existing_reviewers: input.existing_reviewers,
    existing_team_reviewers: input.existing_team_reviewers,
    requested_reviewers: assignment.reviewers,
    requested_team_reviewers: assignment.team_reviewers,
    requested_remove_reviewers: assignment.remove_reviewers,
    requested_remove_team_reviewers: assignment.remove_team_reviewers,
    skipped_reviewers: assignment.skipped_reviewers,
    skipped_team_reviewers: assignment.skipped_team_reviewers,
    added_reviewers: [],
    added_team_reviewers: [],
    removed_reviewers: [],
    removed_team_reviewers: [],
    final_reviewers: input.existing_reviewers,
    final_team_reviewers: input.existing_team_reviewers,
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
      result.errors.push("Pull request number could not be resolved.");
      return result;
    }

    if (input.kind !== "pull_request") {
      result.status = args.fail_if_not_pr ? "invalid" : "skipped-not-pr";
      result.success = !args.fail_if_not_pr;
      result.errors.push("Reviewers can only be requested on pull requests.");
      return result;
    }

    if (args.skip_drafts && input.draft) {
      result.status = "skipped-draft";
      result.success = true;
      result.warnings.push("Draft pull request reviewer request skipped.");
      return result;
    }

    const existingReviewerCount =
      input.existing_reviewers.length + input.existing_team_reviewers.length;

    if (args.skip_existing_reviewers && existingReviewerCount > 0) {
      result.status = "skipped-existing-reviewers";
      result.success = true;
      result.warnings.push(
        "Pull request already has requested reviewers and skip_existing_reviewers is enabled.",
      );
      return result;
    }

    const hasReviewers =
      assignment.reviewers.length ||
      assignment.team_reviewers.length ||
      assignment.remove_reviewers.length ||
      assignment.remove_team_reviewers.length;

    if (!hasReviewers) {
      result.status = args.fail_if_no_reviewers ? "invalid" : "skipped";
      result.success = !args.fail_if_no_reviewers;
      result.errors.push("No reviewers resolved.");
      return result;
    }

    const existingUserSet = new Set(
      input.existing_reviewers.map((user) => user.toLowerCase()),
    );
    const existingTeamSet = new Set(
      input.existing_team_reviewers.map((team) => team.toLowerCase()),
    );
    const desiredUserSet = new Set(
      assignment.reviewers.map((user) => user.toLowerCase()),
    );
    const desiredTeamSet = new Set(
      assignment.team_reviewers.map((team) => team.toLowerCase()),
    );

    const explicitUserRemovals = assignment.remove_reviewers.filter((user) =>
      existingUserSet.has(user.toLowerCase()),
    );
    const explicitTeamRemovals = assignment.remove_team_reviewers.filter(
      (team) => existingTeamSet.has(team.toLowerCase()),
    );

    const replaceExisting = args.replace_existing || args.clear_existing;

    const removeUnmatchedUsers =
      args.remove_unmatched || replaceExisting
        ? input.existing_reviewers.filter(
            (user) => !desiredUserSet.has(user.toLowerCase()),
          )
        : [];

    const removeUnmatchedTeams =
      args.remove_unmatched || replaceExisting
        ? input.existing_team_reviewers.filter(
            (team) => !desiredTeamSet.has(team.toLowerCase()),
          )
        : [];

    const toRemoveUsers = uniqueUsers([
      ...explicitUserRemovals,
      ...removeUnmatchedUsers,
    ]);
    const toRemoveTeams = uniqueTeams([
      ...explicitTeamRemovals,
      ...removeUnmatchedTeams,
    ]);

    const toAddUsers = assignment.reviewers.filter(
      (user) => !existingUserSet.has(user.toLowerCase()) || replaceExisting,
    );
    const toAddTeams = assignment.team_reviewers.filter(
      (team) => !existingTeamSet.has(team.toLowerCase()) || replaceExisting,
    );

    const finalReviewers = replaceExisting
      ? uniqueUsers(assignment.reviewers)
      : uniqueUsers([
          ...input.existing_reviewers.filter(
            (user) =>
              !toRemoveUsers
                .map((item) => item.toLowerCase())
                .includes(user.toLowerCase()),
          ),
          ...assignment.reviewers,
        ]);

    const finalTeamReviewers = replaceExisting
      ? uniqueTeams(assignment.team_reviewers)
      : uniqueTeams([
          ...input.existing_team_reviewers.filter(
            (team) =>
              !toRemoveTeams
                .map((item) => item.toLowerCase())
                .includes(team.toLowerCase()),
          ),
          ...assignment.team_reviewers,
        ]);

    if (
      !toAddUsers.length &&
      !toAddTeams.length &&
      !toRemoveUsers.length &&
      !toRemoveTeams.length
    ) {
      result.status = "already-requested";
      result.success = true;
      result.final_reviewers = input.existing_reviewers;
      result.final_team_reviewers = input.existing_team_reviewers;
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.added_reviewers = toAddUsers;
      result.added_team_reviewers = toAddTeams;
      result.removed_reviewers = toRemoveUsers;
      result.removed_team_reviewers = toRemoveTeams;
      result.final_reviewers = finalReviewers;
      result.final_team_reviewers = finalTeamReviewers;
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_REVIEWERS_TOKEN, or --token.",
      );
      return result;
    }

    if (toRemoveUsers.length || toRemoveTeams.length) {
      logger.info(`Removing requested reviewers from PR #${input.number}.`);
      const removeResult = await removeReviewers(
        args,
        input.number,
        toRemoveUsers,
        toRemoveTeams,
      );

      result.removed_reviewers = removeResult.removed_reviewers;
      result.removed_team_reviewers = removeResult.removed_team_reviewers;
    }

    if (toAddUsers.length || toAddTeams.length) {
      logger.info(`Requesting reviewers on PR #${input.number}.`);
      const addResult = await addReviewers(
        args,
        input.number,
        toAddUsers,
        toAddTeams,
      );
      const final = parseFinalReviewersFromPull(
        addResult.response,
        finalReviewers,
        finalTeamReviewers,
      );

      result.added_reviewers = addResult.added_reviewers;
      result.added_team_reviewers = addResult.added_team_reviewers;
      result.final_reviewers = final.reviewers;
      result.final_team_reviewers = final.team_reviewers;
    } else {
      result.final_reviewers = finalReviewers;
      result.final_team_reviewers = finalTeamReviewers;
    }

    result.status = "reviewers-requested";
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

function itemUrl(repository, number) {
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
    type: "repo-assign-reviewers",
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
      request_actor: args.request_actor,
      skip_drafts: args.skip_drafts,
      skip_bots: args.skip_bots,
      skip_author: args.skip_author,
      skip_existing_reviewers: args.skip_existing_reviewers,
      clear_existing: args.clear_existing,
      replace_existing: args.replace_existing,
      remove_unmatched: args.remove_unmatched,
      max_reviewers: args.max_reviewers,
      max_team_reviewers: args.max_team_reviewers,
      dry_run: args.dry_run,
      rule_count: config.rules.length,
    },
    item: {
      number: input.number,
      kind: input.kind,
      url: itemUrl(args.repository, input.number),
      title: input.title,
      author: input.author,
      actor: input.actor,
      draft: input.draft,
      labels: input.labels,
      changed_files: input.changed_files,
      existing_reviewers: input.existing_reviewers,
      existing_team_reviewers: input.existing_team_reviewers,
      fetched_issue: input.fetched_issue,
      fetched_pull_request: input.fetched_pull_request,
      fetched_files: input.fetched_files,
    },
    assignment: {
      reviewers: assignment.reviewers,
      team_reviewers: assignment.team_reviewers,
      remove_reviewers: assignment.remove_reviewers,
      remove_team_reviewers: assignment.remove_team_reviewers,
      skipped_reviewers: assignment.skipped_reviewers,
      skipped_team_reviewers: assignment.skipped_team_reviewers,
      matched_rules: assignment.matched_rules,
      rule_results: assignment.rule_results,
    },
    execution,
    totals: {
      labels: input.labels.length,
      changed_files: input.changed_files.length,
      rules: config.rules.length,
      matched_rules: assignment.matched_rules.length,
      existing_reviewers: input.existing_reviewers.length,
      existing_team_reviewers: input.existing_team_reviewers.length,
      requested_reviewers: assignment.reviewers.length,
      requested_team_reviewers: assignment.team_reviewers.length,
      requested_remove_reviewers: assignment.remove_reviewers.length,
      requested_remove_team_reviewers: assignment.remove_team_reviewers.length,
      added_reviewers: execution.added_reviewers.length,
      added_team_reviewers: execution.added_team_reviewers.length,
      removed_reviewers: execution.removed_reviewers.length,
      removed_team_reviewers: execution.removed_team_reviewers.length,
      final_reviewers: execution.final_reviewers.length,
      final_team_reviewers: execution.final_team_reviewers.length,
      skipped_reviewers: assignment.skipped_reviewers.length,
      skipped_team_reviewers: assignment.skipped_team_reviewers.length,
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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const icon = report.ok
    ? "✅"
    : report.status.startsWith("skipped")
      ? "⏭️"
      : "❌";

  const lines = [
    `# 👀 ${PROJECT_NAME} Reviewer Automation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Pull request: \`#${report.item.number || "unresolved"}\``,
    `- Requested reviewers: \`${report.totals.requested_reviewers}\``,
    `- Requested team reviewers: \`${report.totals.requested_team_reviewers}\``,
    `- Added reviewers: \`${report.totals.added_reviewers}\``,
    `- Added team reviewers: \`${report.totals.added_team_reviewers}\``,
    `- Removed reviewers: \`${report.totals.removed_reviewers}\``,
    `- Removed team reviewers: \`${report.totals.removed_team_reviewers}\``,
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
    lines.push(`Pull request URL: ${report.item.url}`);
    lines.push("");
  }

  lines.push("## 🎯 Pull Request");
  lines.push("");
  lines.push(`- Title: \`${escapeMarkdown(report.item.title || "none")}\``);
  lines.push(`- Author: \`${report.item.author || "unknown"}\``);
  lines.push(`- Actor: \`${report.item.actor || "unknown"}\``);
  lines.push(`- Draft: \`${report.item.draft ? "true" : "false"}\``);
  lines.push(`- Labels: \`${report.item.labels.length}\``);
  lines.push(`- Changed files: \`${report.item.changed_files.length}\``);
  lines.push(
    `- Existing reviewers: \`${report.item.existing_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Existing team reviewers: \`${report.item.existing_team_reviewers.join(", ") || "none"}\``,
  );

  lines.push("");
  lines.push("## 👀 Reviewers");
  lines.push("");
  lines.push(
    `- User reviewers requested: \`${report.assignment.reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Team reviewers requested: \`${report.assignment.team_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- User reviewers added: \`${report.execution.added_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Team reviewers added: \`${report.execution.added_team_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- User reviewers removed: \`${report.execution.removed_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Team reviewers removed: \`${report.execution.removed_team_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Final user reviewers: \`${report.execution.final_reviewers.join(", ") || "none"}\``,
  );
  lines.push(
    `- Final team reviewers: \`${report.execution.final_team_reviewers.join(", ") || "none"}\``,
  );

  if (
    report.assignment.skipped_reviewers.length ||
    report.assignment.skipped_team_reviewers.length
  ) {
    lines.push("");
    lines.push("## ⏭️ Skipped Reviewers");
    lines.push("");

    if (report.assignment.skipped_reviewers.length) {
      lines.push(
        `- Users: \`${report.assignment.skipped_reviewers.join(", ")}\``,
      );
    }

    if (report.assignment.skipped_team_reviewers.length) {
      lines.push(
        `- Teams: \`${report.assignment.skipped_team_reviewers.join(", ")}\``,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Matching Rules");
  lines.push("");

  if (!report.assignment.matched_rules.length) {
    lines.push("No config rules matched.");
  } else {
    lines.push("| Rule | Reasons | Reviewers | Teams | Priority |");
    lines.push("|---|---|---|---|---:|");

    for (const rule of report.assignment.matched_rules) {
      lines.push(
        `| \`${escapeMarkdown(rule.name)}\` | \`${escapeMarkdown(rule.reasons.join(", ") || "matched")}\` | \`${escapeMarkdown(rule.reviewers.join(", ") || "none")}\` | \`${escapeMarkdown(rule.team_reviewers.join(", ") || "none")}\` | \`${rule.priority}\` |`,
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
  setGitHubOutput("assign_reviewers_file", report.config.output_file);
  setGitHubOutput(
    "assign_reviewers_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("assign_reviewers_status", report.status);
  setGitHubOutput("assign_reviewers_ok", report.ok ? "true" : "false");

  setGitHubOutput("assign_reviewers_number", report.item.number || "");
  setGitHubOutput("assign_reviewers_url", report.item.url || "");

  setGitHubOutput(
    "assign_reviewers_users",
    report.assignment.reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_users_json",
    JSON.stringify(report.assignment.reviewers),
  );
  setGitHubOutput(
    "assign_reviewers_teams",
    report.assignment.team_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_teams_json",
    JSON.stringify(report.assignment.team_reviewers),
  );

  setGitHubOutput(
    "assign_reviewers_added_users",
    report.execution.added_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_added_users_json",
    JSON.stringify(report.execution.added_reviewers),
  );
  setGitHubOutput(
    "assign_reviewers_added_teams",
    report.execution.added_team_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_added_teams_json",
    JSON.stringify(report.execution.added_team_reviewers),
  );

  setGitHubOutput(
    "assign_reviewers_removed_users",
    report.execution.removed_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_removed_users_json",
    JSON.stringify(report.execution.removed_reviewers),
  );
  setGitHubOutput(
    "assign_reviewers_removed_teams",
    report.execution.removed_team_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_removed_teams_json",
    JSON.stringify(report.execution.removed_team_reviewers),
  );

  setGitHubOutput(
    "assign_reviewers_final_users",
    report.execution.final_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_final_users_json",
    JSON.stringify(report.execution.final_reviewers),
  );
  setGitHubOutput(
    "assign_reviewers_final_teams",
    report.execution.final_team_reviewers.join(","),
  );
  setGitHubOutput(
    "assign_reviewers_final_teams_json",
    JSON.stringify(report.execution.final_team_reviewers),
  );

  setGitHubOutput(
    "assign_reviewers_matched_rules",
    String(report.totals.matched_rules),
  );
  setGitHubOutput(
    "assign_reviewers_matched_rules_json",
    JSON.stringify(report.assignment.matched_rules),
  );
  setGitHubOutput(
    "assign_reviewers_errors_json",
    JSON.stringify(report.errors),
  );
  setGitHubOutput(
    "assign_reviewers_warnings_json",
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

  logger.info("Preparing reviewer automation.");

  let input = collectEventInput(args, repoRoot);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    logger.warn(
      `Unable to enrich pull request input: ${logger.formatError(err)}`,
    );
  }

  const assignment = resolveReviewers(args, normalizedConfig, input);
  const execution = await executeReviewerAssignment(args, input, assignment);

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
