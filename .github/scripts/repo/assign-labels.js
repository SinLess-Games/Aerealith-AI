#!/usr/bin/env node
// .github/scripts/repo/assign-labels.js
// =============================================================================
// Aerealith AI — Repository Label Automation
// -----------------------------------------------------------------------------
// Purpose:
//   Apply GitHub labels to issues and pull requests from direct inputs,
//   workflow event payloads, changed paths, titles, bodies, authors, and
//   configurable rules.
//
// Input:
//   - GitHub event payload
//   - .github/repo/assign-labels.json
//   - .github/repo/assign-labels.jsonc
//   - .github/repo/assign-labels.yaml
//   - .github/repo/assign-labels.yml
//   - .github/repo/labels.json
//   - .github/repo/labels.yaml
//
// Output:
//   - artifacts/repo/assign-labels.json
//   - artifacts/repo/assign-labels.md
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
    info: (message) => console.log(`[assign-labels] ${message}`),
    warn: (message) => console.warn(`[assign-labels] WARN: ${message}`),
    error: (message) => console.error(`[assign-labels] ERROR: ${message}`),
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
  ".github/repo/assign-labels.json",
  ".github/repo/assign-labels.jsonc",
  ".github/repo/assign-labels.yaml",
  ".github/repo/assign-labels.yml",
  ".github/repo/labels.json",
  ".github/repo/labels.jsonc",
  ".github/repo/labels.yaml",
  ".github/repo/labels.yml",
  ".github/assign-labels.json",
  ".github/assign-labels.jsonc",
  ".github/assign-labels.yaml",
  ".github/assign-labels.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/assign-labels.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/assign-labels.md";

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.ASSIGN_LABELS_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.ASSIGN_LABELS_CONFIG_FILE || "",

    event_path:
      process.env.ASSIGN_LABELS_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file: process.env.ASSIGN_LABELS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ASSIGN_LABELS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    number:
      process.env.ASSIGN_LABELS_NUMBER ||
      process.env.ISSUE_NUMBER ||
      process.env.PR_NUMBER ||
      "",
    issue_number:
      process.env.ASSIGN_LABELS_ISSUE_NUMBER || process.env.ISSUE_NUMBER || "",
    pull_request_number:
      process.env.ASSIGN_LABELS_PR_NUMBER || process.env.PR_NUMBER || "",

    labels: normalizeLabelList(
      process.env.ASSIGN_LABELS || process.env.LABELS_TO_ADD || "",
    ),
    fallback_labels: normalizeLabelList(
      process.env.ASSIGN_LABELS_FALLBACK || process.env.FALLBACK_LABELS || "",
    ),
    remove_labels: normalizeLabelList(
      process.env.ASSIGN_LABELS_REMOVE || process.env.LABELS_TO_REMOVE || "",
    ),
    exclude_labels: normalizeLabelList(
      process.env.ASSIGN_LABELS_EXCLUDE || process.env.EXCLUDED_LABELS || "",
    ),

    existing_labels: normalizeLabelList(
      process.env.ASSIGN_LABELS_EXISTING ||
        process.env.EXISTING_LABELS ||
        process.env.ISSUE_LABELS ||
        process.env.PR_LABELS ||
        "",
    ),
    changed_files: normalizeStringList(
      process.env.ASSIGN_LABELS_CHANGED_FILES ||
        process.env.CHANGED_FILES ||
        "",
    ),

    fetch_item: normalizeBoolean(process.env.ASSIGN_LABELS_FETCH_ITEM, true),
    fetch_files: normalizeBoolean(process.env.ASSIGN_LABELS_FETCH_FILES, true),
    use_config: normalizeBoolean(process.env.ASSIGN_LABELS_USE_CONFIG, true),

    skip_drafts: normalizeBoolean(process.env.ASSIGN_LABELS_SKIP_DRAFTS, true),
    skip_existing_labels: normalizeBoolean(
      process.env.ASSIGN_LABELS_SKIP_EXISTING_LABELS,
      false,
    ),

    clear_existing: normalizeBoolean(
      process.env.ASSIGN_LABELS_CLEAR_EXISTING,
      false,
    ),
    replace_existing: normalizeBoolean(
      process.env.ASSIGN_LABELS_REPLACE_EXISTING,
      false,
    ),
    remove_unmatched: normalizeBoolean(
      process.env.ASSIGN_LABELS_REMOVE_UNMATCHED,
      false,
    ),

    fail_if_missing_number: normalizeBoolean(
      process.env.ASSIGN_LABELS_FAIL_IF_MISSING_NUMBER,
      true,
    ),
    fail_if_no_labels: normalizeBoolean(
      process.env.ASSIGN_LABELS_FAIL_IF_NO_LABELS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ASSIGN_LABELS_FAIL_ON_ERROR,
      true,
    ),

    max_labels: normalizeInteger(process.env.ASSIGN_LABELS_MAX, 100),
    timeout_seconds: normalizeInteger(
      process.env.ASSIGN_LABELS_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.ASSIGN_LABELS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ASSIGN_LABELS_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ASSIGN_LABELS_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ASSIGN_LABELS_STEP_SUMMARY,
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

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--fallback-label" || arg === "--fallback-labels") {
      args.fallback_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--remove-label" || arg === "--remove-labels") {
      args.remove_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-label" || arg === "--exclude-labels") {
      args.exclude_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--existing-label" || arg === "--existing-labels") {
      args.existing_labels.push(...normalizeLabelList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--changed-file" || arg === "--changed-files") {
      args.changed_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
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

    if (arg === "--skip-existing-labels") {
      args.skip_existing_labels = true;
      continue;
    }

    if (arg === "--no-skip-existing-labels") {
      args.skip_existing_labels = false;
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

    if (arg === "--fail-if-no-labels") {
      args.fail_if_no_labels = true;
      continue;
    }

    if (arg === "--no-fail-if-no-labels") {
      args.fail_if_no_labels = false;
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

    if (arg === "--max-labels") {
      args.max_labels = normalizeInteger(argv[index + 1], args.max_labels);
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
  args.labels = [...new Set(args.labels.map(normalizeLabel).filter(Boolean))];
  args.fallback_labels = [
    ...new Set(args.fallback_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.remove_labels = [
    ...new Set(args.remove_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.exclude_labels = [
    ...new Set(args.exclude_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.existing_labels = [
    ...new Set(args.existing_labels.map(normalizeLabel).filter(Boolean)),
  ];
  args.changed_files = [
    ...new Set(args.changed_files.map(toPosixPath).filter(Boolean)),
  ];
  args.max_labels = Math.min(Math.max(1, args.max_labels), 100);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Repository Label Automation

Usage:
  node .github/scripts/repo/assign-labels.js [options]

Examples:
  node .github/scripts/repo/assign-labels.js --dry-run
  node .github/scripts/repo/assign-labels.js --pr 42 --label "area: ci"
  node .github/scripts/repo/assign-labels.js --issue 12 --labels "bug,priority: high"
  node .github/scripts/repo/assign-labels.js --changed-file docs/index.md
  node .github/scripts/repo/assign-labels.js --replace-existing --labels "release: minor"

Config example:
  {
    "default_labels": ["needs-triage"],
    "fallback_labels": ["needs-review"],
    "exclude_labels": ["wontfix"],
    "rules": [
      {
        "name": "Docs",
        "paths": ["docs/**", "**/*.md"],
        "add_labels": ["area: docs", "type: documentation"]
      },
      {
        "name": "CI",
        "paths": [".github/**"],
        "add_labels": ["area: ci"]
      }
    ]
  }

Options:
      --repo <owner/repo>              Repository slug.
      --api-url <url>                  GitHub API URL.
      --token <token>                  GitHub token.
      --config <file>                  Label config file.
      --event-path <file>              GitHub event payload path.
      --number <number>                Issue or PR number.
      --issue <number>                 Issue number.
      --pr <number>                    Pull request number.
      --label <label,list>             Label(s) to add.
      --fallback-label <label,list>    Fallback label(s) when no rule matches.
      --remove-label <label,list>      Label(s) to remove.
      --exclude-label <label,list>     Label(s) to exclude from additions.
      --existing-label <label,list>    Existing labels to evaluate.
      --changed-file <file,list>       Changed file path(s) to evaluate.
      --fetch-item                     Fetch current issue/PR metadata. Default.
      --no-fetch-item                  Do not fetch current item metadata.
      --fetch-files                    Fetch pull request changed files. Default.
      --no-fetch-files                 Do not fetch pull request files.
      --use-config                     Use config file. Default.
      --no-config                      Ignore config file.
      --skip-drafts                    Skip draft pull requests. Default.
      --no-skip-drafts                 Label draft pull requests.
      --skip-existing-labels           Do nothing if item already has labels.
      --clear-existing                 Remove all existing labels before adding.
      --replace-existing               Replace all labels with resolved labels.
      --remove-unmatched               Remove labels that were matched by remove rules.
      --fail-if-missing-number         Fail when no issue/PR number resolves. Default.
      --no-fail-if-missing-number      Do not fail when number is missing.
      --fail-if-no-labels              Fail when no labels resolve.
      --no-fail-if-no-labels           Do not fail when no labels resolve. Default.
      --fail-on-error                  Exit non-zero on error. Default.
      --no-fail-on-error               Do not fail workflow.
      --max-labels <number>            Maximum labels to submit. Default: 100.
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

      if (section === "rules" || section === "label_rules") {
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
      (section === "rules" || section === "label_rules") &&
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
      (section === "rules" || section === "label_rules") &&
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
    ...(Array.isArray(source.label_rules) ? source.label_rules : []),
    ...(Array.isArray(source.labels_by_rule) ? source.labels_by_rule : []),
  ].map((rule, index) => normalizeRule(rule, index));

  return {
    default_labels: normalizeLabelList(
      source.default_labels || source.labels || source.defaultLabels || [],
    ),
    fallback_labels: normalizeLabelList(
      source.fallback_labels || source.fallbackLabels || [],
    ),
    remove_labels: normalizeLabelList(
      source.remove_labels ||
        source.removed_labels ||
        source.removeLabels ||
        [],
    ),
    exclude_labels: normalizeLabelList(
      source.exclude_labels ||
        source.excluded_labels ||
        source.excludeLabels ||
        [],
    ),
    rules,
    max_labels: normalizeInteger(source.max_labels || source.maxLabels, 0),
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

    match_labels: normalizeLabelList(
      source.match_labels ||
        source.if_labels ||
        source.when_labels ||
        source.existing_labels ||
        [],
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

    add_labels: normalizeLabelList(
      source.add_labels ||
        source.labels_to_add ||
        source.apply_labels ||
        source.assign_labels ||
        source.labels ||
        source.label ||
        [],
    ),
    remove_labels: normalizeLabelList(
      source.remove_labels || source.labels_to_remove || source.unlabel || [],
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

  merged.labels = [
    ...new Set([...merged.labels, ...normalized.default_labels]),
  ];
  merged.fallback_labels = [
    ...new Set([...merged.fallback_labels, ...normalized.fallback_labels]),
  ];
  merged.remove_labels = [
    ...new Set([...merged.remove_labels, ...normalized.remove_labels]),
  ];
  merged.exclude_labels = [
    ...new Set([...merged.exclude_labels, ...normalized.exclude_labels]),
  ];

  if (normalized.max_labels > 0) {
    merged.max_labels = Math.min(Math.max(1, normalized.max_labels), 100);
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
    existing_labels: [
      ...new Set(
        [...args.existing_labels, ...labelsFromItems(item?.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
    ],
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
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-assign-labels-script`,
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

async function addLabels(args, number, labels) {
  if (!labels.length) {
    return {
      added: [],
      response: null,
    };
  }

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/labels`),
    ),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        labels,
      },
    },
  );

  return {
    added: labels,
    response: response.body,
  };
}

async function setLabels(args, number, labels) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/labels`),
    ),
    {
      method: "PUT",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        labels,
      },
    },
  );

  return {
    set: labels,
    response: response.body,
  };
}

async function removeLabel(args, number, label) {
  const encodedLabel = encodeURIComponent(label);

  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(
        args,
        `/issues/${encodeURIComponent(number)}/labels/${encodedLabel}`,
      ),
    ),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      allow_error: true,
    },
  );

  if (response.status_code === 404) {
    return {
      removed: false,
      missing: true,
      label,
      response: response.body,
    };
  }

  if (!response.ok) {
    const message =
      typeof response.body === "object" && response.body?.message
        ? response.body.message
        : response.raw_body || `HTTP ${response.status_code}`;

    throw new Error(`Failed to remove label "${label}": ${message}`);
  }

  return {
    removed: true,
    missing: false,
    label,
    response: response.body,
  };
}

async function clearLabels(args, number) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/issues/${encodeURIComponent(number)}/labels`),
    ),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      allow_error: true,
    },
  );

  if (
    response.status_code === 204 ||
    response.status_code === 200 ||
    response.status_code === 404
  ) {
    return {
      cleared: true,
      response: response.body,
    };
  }

  const message =
    typeof response.body === "object" && response.body?.message
      ? response.body.message
      : response.raw_body || `HTTP ${response.status_code}`;

  throw new Error(`Failed to clear labels: ${message}`);
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
    enriched.existing_labels = [
      ...new Set(
        [...enriched.existing_labels, ...labelsFromItems(issue.labels)]
          .map(normalizeLabel)
          .filter(Boolean),
      ),
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

  if (rule.match_labels.length) {
    checks.push({
      type: "labels",
      matched: rule.match_labels.some((label) =>
        input.existing_labels.includes(label),
      ),
      detail: rule.match_labels,
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

function resolveLabels(args, config, input) {
  const ruleResults = config.rules.map((rule) => evaluateRule(rule, input));
  const matchedRules = ruleResults.filter((result) => result.matched);

  const labelsFromRules = matchedRules.flatMap(
    (result) => result.rule.add_labels,
  );
  const removeFromRules = matchedRules.flatMap(
    (result) => result.rule.remove_labels,
  );

  const addCandidates = [...args.labels, ...labelsFromRules];

  if (!addCandidates.length) {
    addCandidates.push(...args.fallback_labels);
  }

  const excluded = new Set(
    args.exclude_labels.map((label) => label.toLowerCase()),
  );

  const addLabels = [
    ...new Set(
      addCandidates
        .map(normalizeLabel)
        .filter(Boolean)
        .filter((label) => !excluded.has(label.toLowerCase())),
    ),
  ].slice(0, args.max_labels);

  const skippedLabels = [
    ...new Set(
      addCandidates
        .map(normalizeLabel)
        .filter(Boolean)
        .filter((label) => excluded.has(label.toLowerCase())),
    ),
  ];

  const removeLabels = [
    ...new Set(
      [...args.remove_labels, ...removeFromRules]
        .map(normalizeLabel)
        .filter(Boolean),
    ),
  ];

  return {
    add_labels: addLabels,
    remove_labels: removeLabels,
    skipped_labels: skippedLabels,
    matched_rules: matchedRules.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      reasons: result.reasons,
      add_labels: result.rule.add_labels,
      remove_labels: result.rule.remove_labels,
    })),
    rule_results: ruleResults.map((result) => ({
      id: result.rule.id,
      name: result.rule.name,
      matched: result.matched,
      reasons: result.reasons,
    })),
  };
}

function uniqueLabels(labels) {
  return [...new Set(labels.map(normalizeLabel).filter(Boolean))];
}

async function executeLabelAssignment(args, input, assignment) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    number: input.number,
    kind: input.kind,
    existing_labels: input.existing_labels,
    requested_add_labels: assignment.add_labels,
    requested_remove_labels: assignment.remove_labels,
    skipped_labels: assignment.skipped_labels,
    added_labels: [],
    removed_labels: [],
    final_labels: input.existing_labels,
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
      result.warnings.push("Draft pull request labeling skipped.");
      return result;
    }

    if (args.skip_existing_labels && input.existing_labels.length) {
      result.status = "skipped-existing-labels";
      result.success = true;
      result.warnings.push(
        "Item already has labels and skip_existing_labels is enabled.",
      );
      return result;
    }

    if (!assignment.add_labels.length && !assignment.remove_labels.length) {
      result.status = args.fail_if_no_labels ? "invalid" : "skipped";
      result.success = !args.fail_if_no_labels;
      result.errors.push("No labels resolved.");
      return result;
    }

    const existingSet = new Set(
      input.existing_labels.map((label) => label.toLowerCase()),
    );
    const addSet = new Set(
      assignment.add_labels.map((label) => label.toLowerCase()),
    );
    const removeSet = new Set(
      assignment.remove_labels.map((label) => label.toLowerCase()),
    );

    const toAdd = assignment.add_labels.filter(
      (label) =>
        !existingSet.has(label.toLowerCase()) ||
        args.clear_existing ||
        args.replace_existing,
    );

    const explicitRemove = assignment.remove_labels.filter((label) =>
      existingSet.has(label.toLowerCase()),
    );

    const toRemove = args.remove_unmatched
      ? uniqueLabels([
          ...explicitRemove,
          ...input.existing_labels.filter(
            (label) => !addSet.has(label.toLowerCase()),
          ),
        ])
      : explicitRemove;

    const finalLabels =
      args.replace_existing || args.clear_existing
        ? uniqueLabels(assignment.add_labels)
        : uniqueLabels([
            ...input.existing_labels.filter(
              (label) => !removeSet.has(label.toLowerCase()),
            ),
            ...assignment.add_labels,
          ]);

    if (
      !toAdd.length &&
      !toRemove.length &&
      !args.clear_existing &&
      !args.replace_existing
    ) {
      result.status = "already-labeled";
      result.success = true;
      result.final_labels = input.existing_labels;
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.added_labels = toAdd;
      result.removed_labels =
        args.replace_existing || args.clear_existing
          ? input.existing_labels.filter(
              (label) => !addSet.has(label.toLowerCase()),
            )
          : toRemove;
      result.final_labels = finalLabels;
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, ASSIGN_LABELS_TOKEN, or --token.",
      );
      return result;
    }

    if (args.replace_existing) {
      logger.info(`Replacing labels on #${input.number}.`);
      const setResult = await setLabels(
        args,
        input.number,
        assignment.add_labels,
      );
      result.added_labels = toAdd;
      result.removed_labels = input.existing_labels.filter(
        (label) => !addSet.has(label.toLowerCase()),
      );
      result.final_labels = labelsFromItems(setResult.response);
      result.status = "labeled";
      result.success = true;
      return result;
    }

    if (args.clear_existing) {
      logger.info(`Clearing labels from #${input.number}.`);
      await clearLabels(args, input.number);
      result.removed_labels = input.existing_labels;

      if (assignment.add_labels.length) {
        logger.info(
          `Adding ${assignment.add_labels.length} label(s) to #${input.number}.`,
        );
        const addResult = await addLabels(
          args,
          input.number,
          assignment.add_labels,
        );
        result.added_labels = assignment.add_labels;
        result.final_labels = labelsFromItems(addResult.response);
      } else {
        result.final_labels = [];
      }

      result.status = "labeled";
      result.success = true;
      return result;
    }

    if (toRemove.length) {
      logger.info(
        `Removing ${toRemove.length} label(s) from #${input.number}.`,
      );

      for (const label of toRemove) {
        const removeResult = await removeLabel(args, input.number, label);

        if (removeResult.removed) {
          result.removed_labels.push(label);
        }
      }
    }

    if (toAdd.length) {
      logger.info(`Adding ${toAdd.length} label(s) to #${input.number}.`);
      const addResult = await addLabels(args, input.number, toAdd);

      result.added_labels = toAdd;
      result.final_labels = labelsFromItems(addResult.response);
    } else {
      result.final_labels = finalLabels;
    }

    result.status = "labeled";
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
    type: "repo-assign-labels",
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
      skip_drafts: args.skip_drafts,
      skip_existing_labels: args.skip_existing_labels,
      clear_existing: args.clear_existing,
      replace_existing: args.replace_existing,
      remove_unmatched: args.remove_unmatched,
      max_labels: args.max_labels,
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
      existing_labels: input.existing_labels,
      changed_files: input.changed_files,
      fetched_item: input.fetched_item,
      fetched_files: input.fetched_files,
    },
    assignment: {
      add_labels: assignment.add_labels,
      remove_labels: assignment.remove_labels,
      skipped_labels: assignment.skipped_labels,
      matched_rules: assignment.matched_rules,
      rule_results: assignment.rule_results,
    },
    execution,
    totals: {
      existing_labels: input.existing_labels.length,
      changed_files: input.changed_files.length,
      rules: config.rules.length,
      matched_rules: assignment.matched_rules.length,
      requested_add_labels: assignment.add_labels.length,
      requested_remove_labels: assignment.remove_labels.length,
      added_labels: execution.added_labels.length,
      removed_labels: execution.removed_labels.length,
      final_labels: execution.final_labels.length,
      skipped_labels: assignment.skipped_labels.length,
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
    `# 🏷️ ${PROJECT_NAME} Label Automation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Item: \`${report.item.kind} #${report.item.number || "unresolved"}\``,
    `- Requested add labels: \`${report.totals.requested_add_labels}\``,
    `- Requested remove labels: \`${report.totals.requested_remove_labels}\``,
    `- Added labels: \`${report.totals.added_labels}\``,
    `- Removed labels: \`${report.totals.removed_labels}\``,
    `- Final labels: \`${report.totals.final_labels}\``,
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
  lines.push(
    `- Existing labels: \`${report.item.existing_labels.join(", ") || "none"}\``,
  );
  lines.push(`- Changed files: \`${report.item.changed_files.length}\``);

  lines.push("");
  lines.push("## 🏷️ Labels");
  lines.push("");
  lines.push(
    `- Add requested: \`${report.assignment.add_labels.join(", ") || "none"}\``,
  );
  lines.push(
    `- Remove requested: \`${report.assignment.remove_labels.join(", ") || "none"}\``,
  );
  lines.push(
    `- Added: \`${report.execution.added_labels.join(", ") || "none"}\``,
  );
  lines.push(
    `- Removed: \`${report.execution.removed_labels.join(", ") || "none"}\``,
  );
  lines.push(
    `- Final: \`${report.execution.final_labels.join(", ") || "none"}\``,
  );

  if (report.assignment.skipped_labels.length) {
    lines.push(`- Skipped: \`${report.assignment.skipped_labels.join(", ")}\``);
  }

  lines.push("");
  lines.push("## 🧩 Matching Rules");
  lines.push("");

  if (!report.assignment.matched_rules.length) {
    lines.push("No config rules matched.");
  } else {
    lines.push("| Rule | Reasons | Add Labels | Remove Labels |");
    lines.push("|---|---|---|---|");

    for (const rule of report.assignment.matched_rules) {
      lines.push(
        `| \`${escapeMarkdown(rule.name)}\` | \`${escapeMarkdown(rule.reasons.join(", ") || "matched")}\` | \`${escapeMarkdown(rule.add_labels.join(", ") || "none")}\` | \`${escapeMarkdown(rule.remove_labels.join(", ") || "none")}\` |`,
      );
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
  setGitHubOutput("assign_labels_file", report.config.output_file);
  setGitHubOutput(
    "assign_labels_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("assign_labels_status", report.status);
  setGitHubOutput("assign_labels_ok", report.ok ? "true" : "false");

  setGitHubOutput("assign_labels_number", report.item.number || "");
  setGitHubOutput("assign_labels_kind", report.item.kind || "");
  setGitHubOutput("assign_labels_url", report.item.url || "");

  setGitHubOutput("assign_labels_add", report.assignment.add_labels.join(","));
  setGitHubOutput(
    "assign_labels_add_json",
    JSON.stringify(report.assignment.add_labels),
  );
  setGitHubOutput(
    "assign_labels_remove",
    report.assignment.remove_labels.join(","),
  );
  setGitHubOutput(
    "assign_labels_remove_json",
    JSON.stringify(report.assignment.remove_labels),
  );
  setGitHubOutput(
    "assign_labels_added",
    report.execution.added_labels.join(","),
  );
  setGitHubOutput(
    "assign_labels_added_json",
    JSON.stringify(report.execution.added_labels),
  );
  setGitHubOutput(
    "assign_labels_removed",
    report.execution.removed_labels.join(","),
  );
  setGitHubOutput(
    "assign_labels_removed_json",
    JSON.stringify(report.execution.removed_labels),
  );
  setGitHubOutput(
    "assign_labels_final",
    report.execution.final_labels.join(","),
  );
  setGitHubOutput(
    "assign_labels_final_json",
    JSON.stringify(report.execution.final_labels),
  );

  setGitHubOutput(
    "assign_labels_matched_rules",
    String(report.totals.matched_rules),
  );
  setGitHubOutput(
    "assign_labels_matched_rules_json",
    JSON.stringify(report.assignment.matched_rules),
  );
  setGitHubOutput("assign_labels_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "assign_labels_warnings_json",
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

  logger.info("Preparing label automation.");

  let input = collectEventInput(args, repoRoot);

  try {
    input = await enrichInput(args, input);
  } catch (err) {
    logger.warn(`Unable to enrich issue/PR input: ${logger.formatError(err)}`);
  }

  const assignment = resolveLabels(args, normalizedConfig, input);
  const execution = await executeLabelAssignment(args, input, assignment);
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
