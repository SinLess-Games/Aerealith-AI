#!/usr/bin/env node
// .github/scripts/repo/sync-milestones.js
// =============================================================================
// Aerealith AI — GitHub Milestone Sync
// -----------------------------------------------------------------------------
// Purpose:
//   Sync repository milestones from .github/milestones.yaml,
//   .github/milestones.yml, .github/milestones.json, or an explicitly provided
//   milestones file.
//
// Supported milestone shape:
//   - title: "v2.10.0"
//     description: "Aerealith AI 2.10 release milestone."
//     state: "open"
//     due_on: "2026-06-30T23:59:59Z"
//
// Output:
//   - artifacts/repo/sync-milestones.json
//   - artifacts/repo/sync-milestones.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Safe dry-run mode.
//   - Can create, update, rename through aliases, close missing, or delete missing.
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
    info: (message) => console.log(`[sync-milestones] ${message}`),
    warn: (message) => console.warn(`[sync-milestones] WARN: ${message}`),
    error: (message) => console.error(`[sync-milestones] ERROR: ${message}`),
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
  ".github/repo/sync-milestones.json",
  ".github/repo/sync-milestones.jsonc",
  ".github/repo/sync-milestones.yaml",
  ".github/repo/sync-milestones.yml",
  ".github/sync-milestones.json",
  ".github/sync-milestones.jsonc",
  ".github/sync-milestones.yaml",
  ".github/sync-milestones.yml",
];

const DEFAULT_MILESTONE_FILE_CANDIDATES = [
  ".github/milestones.yaml",
  ".github/milestones.yml",
  ".github/milestones.json",
  ".github/milestones.jsonc",
  ".github/repo/milestones.yaml",
  ".github/repo/milestones.yml",
  ".github/repo/milestones.json",
  ".github/repo/milestones.jsonc",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/sync-milestones.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/sync-milestones.md";

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

function normalizeMilestoneTitle(value) {
  return normalizeString(value);
}

function normalizeMilestoneKey(value) {
  return normalizeMilestoneTitle(value).toLowerCase();
}

function normalizeMilestoneState(value, fallback = "open") {
  const state = normalizeString(value, fallback).toLowerCase();

  if (state === "open" || state === "closed") return state;

  return fallback;
}

function normalizeDateTime(value) {
  const source = normalizeString(value);

  if (!source) return null;

  const date = new Date(source);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function normalizeNullableDateTime(value) {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;

  return normalizeDateTime(value);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.SYNC_MILESTONES_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.SYNC_MILESTONES_CONFIG_FILE || "",
    milestones_file:
      process.env.SYNC_MILESTONES_FILE || process.env.MILESTONES_FILE || "",

    output_file: process.env.SYNC_MILESTONES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.SYNC_MILESTONES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_milestones: normalizeStringList(
      process.env.SYNC_MILESTONES_INCLUDE || "",
    ),
    exclude_milestones: normalizeStringList(
      process.env.SYNC_MILESTONES_EXCLUDE || "",
    ),
    preserve_milestones: normalizeStringList(
      process.env.SYNC_MILESTONES_PRESERVE || "",
    ),

    delete_missing: normalizeBoolean(
      process.env.SYNC_MILESTONES_DELETE_MISSING,
      false,
    ),
    close_missing: normalizeBoolean(
      process.env.SYNC_MILESTONES_CLOSE_MISSING,
      false,
    ),
    create_missing: normalizeBoolean(
      process.env.SYNC_MILESTONES_CREATE_MISSING,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.SYNC_MILESTONES_UPDATE_EXISTING,
      true,
    ),
    rename_from_aliases: normalizeBoolean(
      process.env.SYNC_MILESTONES_RENAME_FROM_ALIASES,
      true,
    ),

    fetch_state:
      process.env.SYNC_MILESTONES_FETCH_STATE ||
      process.env.MILESTONE_STATE ||
      "all",

    fail_if_no_milestones: normalizeBoolean(
      process.env.SYNC_MILESTONES_FAIL_IF_NO_MILESTONES,
      true,
    ),
    fail_on_invalid_milestone: normalizeBoolean(
      process.env.SYNC_MILESTONES_FAIL_ON_INVALID_MILESTONE,
      true,
    ),
    fail_on_conflicting_modes: normalizeBoolean(
      process.env.SYNC_MILESTONES_FAIL_ON_CONFLICTING_MODES,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SYNC_MILESTONES_FAIL_ON_ERROR,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.SYNC_MILESTONES_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.SYNC_MILESTONES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.SYNC_MILESTONES_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SYNC_MILESTONES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SYNC_MILESTONES_STEP_SUMMARY,
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

    if (arg === "--milestones-file" || arg === "--file" || arg === "--source") {
      args.milestones_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-milestone" || arg === "--include-milestones") {
      args.include_milestones.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-milestone" || arg === "--exclude-milestones") {
      args.exclude_milestones.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--preserve-milestone" || arg === "--preserve-milestones") {
      args.preserve_milestones.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--delete-missing") {
      args.delete_missing = true;
      continue;
    }

    if (arg === "--no-delete-missing") {
      args.delete_missing = false;
      continue;
    }

    if (arg === "--close-missing") {
      args.close_missing = true;
      continue;
    }

    if (arg === "--no-close-missing") {
      args.close_missing = false;
      continue;
    }

    if (arg === "--create-missing") {
      args.create_missing = true;
      continue;
    }

    if (arg === "--no-create-missing") {
      args.create_missing = false;
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

    if (arg === "--rename-from-aliases") {
      args.rename_from_aliases = true;
      continue;
    }

    if (arg === "--no-rename-from-aliases") {
      args.rename_from_aliases = false;
      continue;
    }

    if (arg === "--fetch-state" || arg === "--state") {
      args.fetch_state = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fail-if-no-milestones") {
      args.fail_if_no_milestones = true;
      continue;
    }

    if (arg === "--no-fail-if-no-milestones") {
      args.fail_if_no_milestones = false;
      continue;
    }

    if (arg === "--fail-on-invalid-milestone") {
      args.fail_on_invalid_milestone = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-milestone") {
      args.fail_on_invalid_milestone = false;
      continue;
    }

    if (arg === "--fail-on-conflicting-modes") {
      args.fail_on_conflicting_modes = true;
      continue;
    }

    if (arg === "--no-fail-on-conflicting-modes") {
      args.fail_on_conflicting_modes = false;
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
  args.milestones_file = normalizeString(args.milestones_file);
  args.include_milestones = [
    ...new Set(
      args.include_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  args.exclude_milestones = [
    ...new Set(
      args.exclude_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  args.preserve_milestones = [
    ...new Set(
      args.preserve_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  args.fetch_state = normalizeFetchState(args.fetch_state);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Milestone Sync

Usage:
  node .github/scripts/repo/sync-milestones.js [options]

Examples:
  node .github/scripts/repo/sync-milestones.js
  node .github/scripts/repo/sync-milestones.js --milestones-file .github/milestones.yaml
  node .github/scripts/repo/sync-milestones.js --dry-run
  node .github/scripts/repo/sync-milestones.js --close-missing
  node .github/scripts/repo/sync-milestones.js --delete-missing
  node .github/scripts/repo/sync-milestones.js --include-milestone "v2.10.0"

Milestones YAML:
  - title: "v2.10.0"
    description: "Aerealith AI 2.10 release milestone."
    state: "open"
  - title: "Backlog"
    description: "Accepted work not yet scheduled."
    state: "open"

Options:
      --repo <owner/repo>                    Repository slug.
      --api-url <url>                        GitHub API URL.
      --token <token>                        GitHub token.
      --config <file>                        Sync config file.
      --milestones-file <file>               Milestone source file.
      --include-milestone <title,list>       Only sync matching milestone titles.
      --exclude-milestone <title,list>       Exclude matching milestone titles.
      --preserve-milestone <title,list>      Never close/delete matching remote milestones.
      --delete-missing                       Delete remote milestones missing from source.
      --no-delete-missing                    Do not delete missing milestones. Default.
      --close-missing                        Close remote milestones missing from source.
      --no-close-missing                     Do not close missing milestones. Default.
      --create-missing                       Create missing milestones. Default.
      --no-create-missing                    Do not create missing milestones.
      --update-existing                      Update changed milestones. Default.
      --no-update-existing                   Do not update changed milestones.
      --rename-from-aliases                  Rename milestones from aliases/old_titles. Default.
      --no-rename-from-aliases               Do not rename milestones from aliases.
      --fetch-state <open|closed|all>        Existing milestone lookup state. Default: all.
      --fail-if-no-milestones                Fail when no desired milestones are loaded. Default.
      --no-fail-if-no-milestones             Allow empty milestone source.
      --fail-on-invalid-milestone            Fail on invalid milestone entries. Default.
      --no-fail-on-invalid-milestone         Warn on invalid milestone entries.
      --fail-on-conflicting-modes            Fail when close/delete missing are both enabled. Default.
      --no-fail-on-conflicting-modes         Warn when close/delete missing are both enabled.
      --fail-on-error                        Exit non-zero on errors. Default.
      --no-fail-on-error                     Do not fail workflow.
      --timeout-seconds <number>             GitHub API timeout. Default: 60.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not mutate GitHub.
      --no-print                             Do not print JSON report.
      --no-step-summary                      Do not append GitHub step summary.
`);
}

function normalizeFetchState(value) {
  const state = normalizeString(value, "all").toLowerCase();

  if (["open", "closed", "all"].includes(state)) return state;

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
  let currentList = rootItems;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      currentList = Array.isArray(config[section])
        ? config[section]
        : rootItems;
      currentItem = null;
      continue;
    }

    if (/^-\s*/.test(trimmed)) {
      const rest = trimmed.replace(/^-\s*/, "");

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentItem = {
          [key]: parseYamlScalar(value),
        };
        currentList.push(currentItem);
        continue;
      }

      const scalar = parseYamlScalar(rest);

      if (typeof scalar === "string" && scalar) {
        currentList.push(scalar);
      } else {
        currentItem = {};
        currentList.push(currentItem);
      }

      continue;
    }

    if (currentItem && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentItem[key] = parseYamlScalar(value);
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
    }
  }

  if (rootItems.length) {
    config.milestones = rootItems;
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

function findMilestonesFile(args, repoRoot, config) {
  if (args.milestones_file) {
    const absolutePath = resolvePath(args.milestones_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.milestones_file;
  }

  if (config?.milestones_file) {
    const absolutePath = resolvePath(config.milestones_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : config.milestones_file;
  }

  if (Array.isArray(config?.milestones)) {
    return "";
  }

  for (const candidate of DEFAULT_MILESTONE_FILE_CANDIDATES) {
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
    "milestones_file",
    "output_file",
    "summary_file",
    "fetch_state",
  ];

  for (const key of stringKeys) {
    if (config[key] !== undefined && (!merged[key] || key === "fetch_state")) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "include_milestones",
    "exclude_milestones",
    "preserve_milestones",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = [
        ...new Set([...merged[key], ...normalizeStringList(config[key])]),
      ];
    }
  }

  const booleanKeys = [
    "delete_missing",
    "close_missing",
    "create_missing",
    "update_existing",
    "rename_from_aliases",
    "fail_if_no_milestones",
    "fail_on_invalid_milestone",
    "fail_on_conflicting_modes",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.timeout_seconds !== undefined) {
    merged.timeout_seconds = normalizeInteger(
      config.timeout_seconds,
      merged.timeout_seconds,
    );
  }

  merged.include_milestones = [
    ...new Set(
      merged.include_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  merged.exclude_milestones = [
    ...new Set(
      merged.exclude_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  merged.preserve_milestones = [
    ...new Set(
      merged.preserve_milestones.map(normalizeMilestoneTitle).filter(Boolean),
    ),
  ];
  merged.fetch_state = normalizeFetchState(merged.fetch_state);
  merged.timeout_seconds = Math.max(1, merged.timeout_seconds);

  return merged;
}

function normalizeMilestoneEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return {
      valid: false,
      error: `Milestone entry ${index + 1} is not an object.`,
      milestone: null,
    };
  }

  const title = normalizeMilestoneTitle(
    entry.title || entry.name || entry.milestone,
  );
  const description = normalizeString(entry.description || entry.desc || "");
  const state = normalizeMilestoneState(entry.state || "open", "open");
  const dueOn = normalizeNullableDateTime(
    entry.due_on ||
      entry.dueOn ||
      entry.due ||
      entry.due_date ||
      entry.dueDate ||
      "",
  );

  const aliases = [
    ...new Set(
      normalizeStringList(
        entry.aliases ||
          entry.old_titles ||
          entry.oldTitles ||
          entry.previous_titles ||
          entry.previousTitles ||
          [],
      )
        .map(normalizeMilestoneTitle)
        .filter(Boolean),
    ),
  ];

  if (!title) {
    return {
      valid: false,
      error: `Milestone entry ${index + 1} is missing a title.`,
      milestone: null,
    };
  }

  if (!["open", "closed"].includes(state)) {
    return {
      valid: false,
      error: `Milestone "${title}" has invalid state "${entry.state}".`,
      milestone: null,
    };
  }

  if (
    dueOn === null &&
    entry.due_on !== null &&
    entry.dueOn !== null &&
    (entry.due_on ||
      entry.dueOn ||
      entry.due ||
      entry.due_date ||
      entry.dueDate)
  ) {
    return {
      valid: false,
      error: `Milestone "${title}" has invalid due date.`,
      milestone: null,
    };
  }

  return {
    valid: true,
    error: "",
    milestone: {
      title,
      description,
      state,
      due_on: dueOn === undefined ? null : dueOn,
      aliases,
      enabled: normalizeBoolean(entry.enabled, true),
      preserve: normalizeBoolean(entry.preserve, false),
      source_index: index,
    },
  };
}

function loadDesiredMilestones(args, milestonesData) {
  const sourceMilestones = Array.isArray(milestonesData)
    ? milestonesData
    : Array.isArray(milestonesData?.milestones)
      ? milestonesData.milestones
      : [];

  const includeKeys = new Set(
    args.include_milestones.map(normalizeMilestoneKey),
  );
  const excludeKeys = new Set(
    args.exclude_milestones.map(normalizeMilestoneKey),
  );

  const milestones = [];
  const invalid = [];
  const duplicateTitles = new Set();
  const seen = new Set();

  sourceMilestones.forEach((entry, index) => {
    const normalized = normalizeMilestoneEntry(entry, index);

    if (!normalized.valid) {
      invalid.push(normalized.error);
      return;
    }

    const milestone = normalized.milestone;
    const key = normalizeMilestoneKey(milestone.title);

    if (!milestone.enabled) return;
    if (includeKeys.size && !includeKeys.has(key)) return;
    if (excludeKeys.has(key)) return;

    if (seen.has(key)) {
      duplicateTitles.add(milestone.title);
      return;
    }

    seen.add(key);
    milestones.push(milestone);
  });

  return {
    milestones,
    invalid,
    duplicate_titles: [...duplicateTitles],
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-sync-milestones-script`,
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

function normalizeRemoteMilestone(milestone) {
  return {
    id: milestone.id,
    node_id: milestone.node_id,
    number: normalizeInteger(milestone.number, 0),
    title: normalizeMilestoneTitle(milestone.title),
    description: normalizeString(milestone.description),
    state: normalizeMilestoneState(milestone.state, "open"),
    due_on: milestone.due_on ? normalizeDateTime(milestone.due_on) : null,
    html_url: normalizeString(milestone.html_url),
    open_issues: normalizeInteger(milestone.open_issues, 0),
    closed_issues: normalizeInteger(milestone.closed_issues, 0),
    created_at: normalizeString(milestone.created_at),
    updated_at: normalizeString(milestone.updated_at),
    closed_at: normalizeString(milestone.closed_at),
  };
}

async function fetchExistingMilestones(args) {
  const milestones = [];
  let page = 1;

  while (page <= 20) {
    const response = await requestJson(
      apiUrl(
        args,
        repoEndpoint(
          args,
          `/milestones?state=${encodeURIComponent(args.fetch_state)}&sort=due_on&direction=asc&per_page=100&page=${page}`,
        ),
      ),
      {
        method: "GET",
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    milestones.push(...body.map(normalizeRemoteMilestone));

    if (body.length < 100) break;

    page += 1;
  }

  return milestones;
}

async function createMilestone(args, milestone) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, "/milestones")),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        title: milestone.title,
        description: milestone.description,
        state: milestone.state,
        due_on: milestone.due_on,
      },
    },
  );

  return normalizeRemoteMilestone(response.body);
}

async function updateMilestone(args, number, milestone) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/milestones/${encodeURIComponent(number)}`),
    ),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        title: milestone.title,
        description: milestone.description,
        state: milestone.state,
        due_on: milestone.due_on,
      },
    },
  );

  return normalizeRemoteMilestone(response.body);
}

async function closeMilestone(args, number, existing) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/milestones/${encodeURIComponent(number)}`),
    ),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        title: existing.title,
        description: existing.description,
        state: "closed",
        due_on: existing.due_on,
      },
    },
  );

  return normalizeRemoteMilestone(response.body);
}

async function deleteMilestone(args, number) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/milestones/${encodeURIComponent(number)}`),
    ),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      allow_error: true,
    },
  );

  if (response.status_code === 204 || response.status_code === 404) {
    return true;
  }

  const message =
    typeof response.body === "object" && response.body?.message
      ? response.body.message
      : response.raw_body || `HTTP ${response.status_code}`;

  throw new Error(`Unable to delete milestone #${number}: ${message}`);
}

function milestoneChanged(existing, desired) {
  if (!existing) return true;

  return (
    normalizeMilestoneTitle(existing.title) !==
      normalizeMilestoneTitle(desired.title) ||
    normalizeString(existing.description) !==
      normalizeString(desired.description) ||
    normalizeMilestoneState(existing.state, "open") !==
      normalizeMilestoneState(desired.state, "open") ||
    normalizeString(existing.due_on || "") !==
      normalizeString(desired.due_on || "")
  );
}

function buildSyncPlan(args, desiredMilestones, existingMilestones) {
  const existingByKey = new Map(
    existingMilestones.map((milestone) => [
      normalizeMilestoneKey(milestone.title),
      milestone,
    ]),
  );
  const desiredByKey = new Map(
    desiredMilestones.map((milestone) => [
      normalizeMilestoneKey(milestone.title),
      milestone,
    ]),
  );
  const preserveKeys = new Set([
    ...args.preserve_milestones.map(normalizeMilestoneKey),
    ...desiredMilestones
      .filter((milestone) => milestone.preserve)
      .map((milestone) => normalizeMilestoneKey(milestone.title)),
  ]);

  const creates = [];
  const updates = [];
  const unchanged = [];
  const closes = [];
  const deletes = [];
  const skipped = [];

  for (const desired of desiredMilestones) {
    const desiredKey = normalizeMilestoneKey(desired.title);
    const existing = existingByKey.get(desiredKey);

    if (existing) {
      if (milestoneChanged(existing, desired)) {
        updates.push({
          action: "update",
          from_title: existing.title,
          number: existing.number,
          milestone: desired,
          existing,
          rename:
            normalizeMilestoneTitle(existing.title) !==
            normalizeMilestoneTitle(desired.title),
        });
      } else {
        unchanged.push({
          action: "unchanged",
          milestone: desired,
          existing,
        });
      }

      continue;
    }

    const aliasMatch = args.rename_from_aliases
      ? desired.aliases
          .map((alias) => existingByKey.get(normalizeMilestoneKey(alias)))
          .find(Boolean)
      : null;

    if (aliasMatch) {
      updates.push({
        action: "rename",
        from_title: aliasMatch.title,
        number: aliasMatch.number,
        milestone: desired,
        existing: aliasMatch,
        rename: true,
      });
      continue;
    }

    if (args.create_missing) {
      creates.push({
        action: "create",
        milestone: desired,
      });
    } else {
      skipped.push({
        action: "skip-create-disabled",
        milestone: desired,
      });
    }
  }

  const desiredAndAliasKeys = new Set();

  for (const desired of desiredMilestones) {
    desiredAndAliasKeys.add(normalizeMilestoneKey(desired.title));

    for (const alias of desired.aliases) {
      desiredAndAliasKeys.add(normalizeMilestoneKey(alias));
    }
  }

  for (const existing of existingMilestones) {
    const key = normalizeMilestoneKey(existing.title);

    if (desiredAndAliasKeys.has(key)) continue;

    if (preserveKeys.has(key)) {
      skipped.push({
        action: "preserved",
        existing,
      });
      continue;
    }

    if (args.delete_missing) {
      deletes.push({
        action: "delete",
        existing,
      });
      continue;
    }

    if (args.close_missing && existing.state !== "closed") {
      closes.push({
        action: "close",
        existing,
      });
      continue;
    }

    skipped.push({
      action: args.close_missing ? "already-closed" : "missing-action-disabled",
      existing,
    });
  }

  return {
    creates,
    updates,
    unchanged,
    closes,
    deletes,
    skipped,
  };
}

async function executeSync(args, plan, remoteAvailable) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    remote_available: remoteAvailable,
    created: [],
    updated: [],
    renamed: [],
    closed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.milestone.title),
    skipped: plan.skipped.map(
      (item) => item.milestone?.title || item.existing?.title || "unknown",
    ),
    errors: [],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!remoteAvailable) {
      result.status = args.dry_run ? "planned-without-remote" : "failed";
      result.success = Boolean(args.dry_run);
      result.warnings.push(
        "Remote milestones were not fetched, so create/update/close/delete accuracy could not be verified.",
      );

      if (args.dry_run) {
        result.created = plan.creates.map((item) => item.milestone.title);
        result.updated = plan.updates
          .filter((item) => !item.rename)
          .map((item) => item.milestone.title);
        result.renamed = plan.updates
          .filter((item) => item.rename)
          .map((item) => `${item.from_title} -> ${item.milestone.title}`);
        result.closed = plan.closes.map((item) => item.existing.title);
        result.deleted = plan.deletes.map((item) => item.existing.title);
      }

      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.created = plan.creates.map((item) => item.milestone.title);
      result.updated = plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.milestone.title);
      result.renamed = plan.updates
        .filter((item) => item.rename)
        .map((item) => `${item.from_title} -> ${item.milestone.title}`);
      result.closed = plan.closes.map((item) => item.existing.title);
      result.deleted = plan.deletes.map((item) => item.existing.title);
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_MILESTONES_TOKEN, or --token.",
      );
      return result;
    }

    for (const item of plan.creates) {
      logger.info(`Creating milestone "${item.milestone.title}".`);
      await createMilestone(args, item.milestone);
      result.created.push(item.milestone.title);
    }

    if (args.update_existing) {
      for (const item of plan.updates) {
        logger.info(
          `${item.rename ? "Renaming/updating" : "Updating"} milestone "${item.from_title}" -> "${item.milestone.title}".`,
        );
        await updateMilestone(args, item.number, item.milestone);

        if (item.rename) {
          result.renamed.push(`${item.from_title} -> ${item.milestone.title}`);
        } else {
          result.updated.push(item.milestone.title);
        }
      }
    } else if (plan.updates.length) {
      result.skipped.push(...plan.updates.map((item) => item.milestone.title));
      result.warnings.push("Existing milestone updates are disabled.");
    }

    for (const item of plan.closes) {
      logger.info(`Closing milestone "${item.existing.title}".`);
      await closeMilestone(args, item.existing.number, item.existing);
      result.closed.push(item.existing.title);
    }

    for (const item of plan.deletes) {
      logger.info(`Deleting milestone "${item.existing.title}".`);
      await deleteMilestone(args, item.existing.number);
      result.deleted.push(item.existing.title);
    }

    result.status = "synced";
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

function createReport(
  args,
  repoRoot,
  configFile,
  milestonesFile,
  milestonesLoad,
  existingMilestones,
  plan,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const invalidErrors = args.fail_on_invalid_milestone
    ? milestonesLoad.invalid
    : [];
  const invalidWarnings = args.fail_on_invalid_milestone
    ? []
    : milestonesLoad.invalid;
  const noMilestonesError =
    args.fail_if_no_milestones && milestonesLoad.milestones.length === 0
      ? ["No desired milestones were loaded."]
      : [];
  const conflictingModeError =
    args.fail_on_conflicting_modes && args.delete_missing && args.close_missing
      ? [
          "Conflicting modes enabled: delete_missing and close_missing cannot safely run together.",
        ]
      : [];
  const conflictingModeWarning =
    !args.fail_on_conflicting_modes && args.delete_missing && args.close_missing
      ? [
          "Conflicting modes enabled: delete_missing takes precedence over close_missing.",
        ]
      : [];

  const errors = [
    ...invalidErrors,
    ...noMilestonesError,
    ...conflictingModeError,
    ...execution.errors,
  ];

  const warnings = [
    ...invalidWarnings,
    ...conflictingModeWarning,
    ...milestonesLoad.duplicate_titles.map(
      (title) => `Duplicate milestone ignored: ${title}`,
    ),
    ...execution.warnings,
  ];

  const ok = execution.success && errors.length === 0;
  const status = ok ? execution.status : "failed";

  return {
    schema_version: 1,
    type: "repo-sync-milestones",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      milestones_file: milestonesFile || null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      create_missing: args.create_missing,
      update_existing: args.update_existing,
      close_missing: args.close_missing,
      delete_missing: args.delete_missing,
      rename_from_aliases: args.rename_from_aliases,
      include_milestones: args.include_milestones,
      exclude_milestones: args.exclude_milestones,
      preserve_milestones: args.preserve_milestones,
      fetch_state: args.fetch_state,
      dry_run: args.dry_run,
    },
    milestones: {
      desired: milestonesLoad.milestones,
      existing: existingMilestones,
      invalid: milestonesLoad.invalid,
      duplicate_titles: milestonesLoad.duplicate_titles,
    },
    plan: {
      create: plan.creates.map((item) => item.milestone.title),
      update: plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.milestone.title),
      rename: plan.updates
        .filter((item) => item.rename)
        .map((item) => ({
          from: item.from_title,
          to: item.milestone.title,
          number: item.number,
        })),
      close: plan.closes.map((item) => item.existing.title),
      delete: plan.deletes.map((item) => item.existing.title),
      unchanged: plan.unchanged.map((item) => item.milestone.title),
      skipped: plan.skipped.map((item) => ({
        action: item.action,
        title: item.milestone?.title || item.existing?.title || "unknown",
      })),
    },
    execution,
    totals: {
      desired_milestones: milestonesLoad.milestones.length,
      existing_milestones: existingMilestones.length,
      invalid_milestones: milestonesLoad.invalid.length,
      duplicate_milestones: milestonesLoad.duplicate_titles.length,
      planned_create: plan.creates.length,
      planned_update: plan.updates.filter((item) => !item.rename).length,
      planned_rename: plan.updates.filter((item) => item.rename).length,
      planned_close: plan.closes.length,
      planned_delete: plan.deletes.length,
      unchanged: plan.unchanged.length,
      skipped: plan.skipped.length,
      created: execution.created.length,
      updated: execution.updated.length,
      renamed: execution.renamed.length,
      closed: execution.closed.length,
      deleted: execution.deleted.length,
      errors: errors.length,
      warnings: warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok,
    },
    errors,
    warnings,
    status,
    ok,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const icon = report.ok ? (report.config.dry_run ? "🧪" : "✅") : "❌";

  const lines = [
    `# 🏁 ${PROJECT_NAME} Milestone Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Desired milestones: \`${report.totals.desired_milestones}\``,
    `- Existing milestones: \`${report.totals.existing_milestones}\``,
    `- Planned create: \`${report.totals.planned_create}\``,
    `- Planned update: \`${report.totals.planned_update}\``,
    `- Planned rename: \`${report.totals.planned_rename}\``,
    `- Planned close: \`${report.totals.planned_close}\``,
    `- Planned delete: \`${report.totals.planned_delete}\``,
    `- Unchanged: \`${report.totals.unchanged}\``,
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
    "## 📋 Milestone Plan",
    "",
    "| Action | Milestones |",
    "|---|---|",
    `| Create | \`${escapeMarkdown(report.plan.create.join(", ") || "none")}\` |`,
    `| Update | \`${escapeMarkdown(report.plan.update.join(", ") || "none")}\` |`,
    `| Rename | \`${escapeMarkdown(report.plan.rename.map((item) => `${item.from} -> ${item.to}`).join(", ") || "none")}\` |`,
    `| Close | \`${escapeMarkdown(report.plan.close.join(", ") || "none")}\` |`,
    `| Delete | \`${escapeMarkdown(report.plan.delete.join(", ") || "none")}\` |`,
    `| Unchanged | \`${escapeMarkdown(report.plan.unchanged.join(", ") || "none")}\` |`,
    "",
  ];

  if (report.plan.skipped.length) {
    lines.push("## ⏭️ Skipped");
    lines.push("");
    lines.push("| Milestone | Reason |");
    lines.push("|---|---|");

    for (const item of report.plan.skipped) {
      lines.push(
        `| \`${escapeMarkdown(item.title)}\` | \`${escapeMarkdown(item.action)}\` |`,
      );
    }

    lines.push("");
  }

  if (report.errors.length) {
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }

    lines.push("");
  }

  if (report.warnings.length) {
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }

    lines.push("");
  }

  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Milestones file: \`${report.config.milestones_file || "inline config milestones"}\``,
  );
  lines.push(`- Fetch state: \`${report.config.fetch_state}\``);
  lines.push(
    `- Create missing: \`${report.config.create_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Close missing: \`${report.config.close_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Delete missing: \`${report.config.delete_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Rename from aliases: \`${report.config.rename_from_aliases ? "true" : "false"}\``,
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
  setGitHubOutput("sync_milestones_file", report.config.output_file);
  setGitHubOutput(
    "sync_milestones_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("sync_milestones_status", report.status);
  setGitHubOutput("sync_milestones_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "sync_milestones_desired",
    String(report.totals.desired_milestones),
  );
  setGitHubOutput(
    "sync_milestones_existing",
    String(report.totals.existing_milestones),
  );
  setGitHubOutput(
    "sync_milestones_planned_create",
    String(report.totals.planned_create),
  );
  setGitHubOutput(
    "sync_milestones_planned_update",
    String(report.totals.planned_update),
  );
  setGitHubOutput(
    "sync_milestones_planned_rename",
    String(report.totals.planned_rename),
  );
  setGitHubOutput(
    "sync_milestones_planned_close",
    String(report.totals.planned_close),
  );
  setGitHubOutput(
    "sync_milestones_planned_delete",
    String(report.totals.planned_delete),
  );
  setGitHubOutput("sync_milestones_created", String(report.totals.created));
  setGitHubOutput("sync_milestones_updated", String(report.totals.updated));
  setGitHubOutput("sync_milestones_renamed", String(report.totals.renamed));
  setGitHubOutput("sync_milestones_closed", String(report.totals.closed));
  setGitHubOutput("sync_milestones_deleted", String(report.totals.deleted));

  setGitHubOutput(
    "sync_milestones_create_json",
    JSON.stringify(report.plan.create),
  );
  setGitHubOutput(
    "sync_milestones_update_json",
    JSON.stringify(report.plan.update),
  );
  setGitHubOutput(
    "sync_milestones_rename_json",
    JSON.stringify(report.plan.rename),
  );
  setGitHubOutput(
    "sync_milestones_close_json",
    JSON.stringify(report.plan.close),
  );
  setGitHubOutput(
    "sync_milestones_delete_json",
    JSON.stringify(report.plan.delete),
  );
  setGitHubOutput("sync_milestones_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "sync_milestones_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readDataFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const milestonesFile = findMilestonesFile(args, repoRoot, config);
  const milestonesData = milestonesFile
    ? readDataFile(milestonesFile, repoRoot)
    : config;

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing GitHub milestone sync.");

  const milestonesLoad = loadDesiredMilestones(args, milestonesData);
  const preflightErrors = [];

  if (args.fail_if_no_milestones && milestonesLoad.milestones.length === 0) {
    preflightErrors.push("No desired milestones were loaded.");
  }

  if (args.fail_on_invalid_milestone && milestonesLoad.invalid.length > 0) {
    preflightErrors.push(...milestonesLoad.invalid);
  }

  if (
    args.delete_missing &&
    args.close_missing &&
    args.fail_on_conflicting_modes
  ) {
    preflightErrors.push(
      "Conflicting modes enabled: delete_missing and close_missing cannot safely run together.",
    );
  }

  let existingMilestones = [];
  let remoteAvailable = false;

  try {
    if (args.token) {
      existingMilestones = await fetchExistingMilestones(args);
      remoteAvailable = true;
    } else if (!args.dry_run) {
      preflightErrors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_MILESTONES_TOKEN, or --token.",
      );
    }
  } catch (err) {
    preflightErrors.push(
      `Unable to fetch existing milestones: ${logger.formatError(err)}`,
    );
  }

  const plan = buildSyncPlan(
    args,
    milestonesLoad.milestones,
    existingMilestones,
  );

  let execution = {
    status: "failed",
    success: false,
    dry_run: args.dry_run,
    remote_available: remoteAvailable,
    created: [],
    updated: [],
    renamed: [],
    closed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.milestone.title),
    skipped: plan.skipped.map(
      (item) => item.milestone?.title || item.existing?.title || "unknown",
    ),
    errors: preflightErrors,
    warnings: [],
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 0,
  };

  if (!preflightErrors.length) {
    execution = await executeSync(args, plan, remoteAvailable);
  }

  const report = createReport(
    args,
    repoRoot,
    configFile,
    milestonesFile,
    milestonesLoad,
    existingMilestones,
    plan,
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
