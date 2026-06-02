#!/usr/bin/env node
// .github/scripts/repo/sync-projects.js
// =============================================================================
// Aerealith AI — GitHub Projects Sync
// -----------------------------------------------------------------------------
// Purpose:
//   Sync GitHub Projects v2 definitions from .github/projects.yaml,
//   .github/projects.yml, .github/projects.json, or an explicitly provided
//   projects file.
//
// Supported project shape:
//   - title: "Aerealith AI Roadmap"
//     description: "Planning, delivery, and release tracking."
//     readme: "Project board for Aerealith AI work."
//     public: false
//     closed: false
//     repositories:
//       - "SinLess-Games/Aerealith-AI"
//     aliases:
//       - "Helix AI Roadmap"
//
// Output:
//   - artifacts/repo/sync-projects.json
//   - artifacts/repo/sync-projects.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses GitHub GraphQL for Projects v2.
//   - Safe dry-run mode.
//   - Can create, update, rename through aliases, link repositories, close
//     missing projects, or delete missing projects.
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
    info: (message) => console.log(`[sync-projects] ${message}`),
    warn: (message) => console.warn(`[sync-projects] WARN: ${message}`),
    error: (message) => console.error(`[sync-projects] ERROR: ${message}`),
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
  ".github/repo/sync-projects.json",
  ".github/repo/sync-projects.jsonc",
  ".github/repo/sync-projects.yaml",
  ".github/repo/sync-projects.yml",
  ".github/sync-projects.json",
  ".github/sync-projects.jsonc",
  ".github/sync-projects.yaml",
  ".github/sync-projects.yml",
];

const DEFAULT_PROJECT_FILE_CANDIDATES = [
  ".github/projects.yaml",
  ".github/projects.yml",
  ".github/projects.json",
  ".github/projects.jsonc",
  ".github/repo/projects.yaml",
  ".github/repo/projects.yml",
  ".github/repo/projects.json",
  ".github/repo/projects.jsonc",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/sync-projects.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/sync-projects.md";

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

function normalizeProjectTitle(value) {
  return normalizeString(value);
}

function normalizeProjectKey(value) {
  return normalizeProjectTitle(value).toLowerCase();
}

function splitRepositorySlug(value, fallback = DEFAULT_REPOSITORY) {
  const source = normalizeString(value, fallback);
  const parts = source.split("/").filter(Boolean);

  if (parts.length >= 2) {
    return {
      owner: parts[0],
      name: parts.slice(1).join("/"),
      slug: `${parts[0]}/${parts.slice(1).join("/")}`,
    };
  }

  const fallbackParts = fallback.split("/").filter(Boolean);

  return {
    owner: fallbackParts[0] || "",
    name: fallbackParts[1] || "",
    slug: fallback,
  };
}

function normalizeRepositorySlug(value, fallback = DEFAULT_REPOSITORY) {
  const source = normalizeString(value);

  if (!source) return "";

  if (source.includes("/")) {
    const parts = source.split("/").filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0]}/${parts.slice(1).join("/")}`;
    }
  }

  const fallbackRepo = splitRepositorySlug(fallback);

  return `${fallbackRepo.owner}/${source}`;
}

function normalizeRepositoryList(
  value,
  fallbackRepository = DEFAULT_REPOSITORY,
) {
  return [
    ...new Set(
      normalizeStringList(value)
        .map((item) => normalizeRepositorySlug(item, fallbackRepository))
        .filter(Boolean),
    ),
  ];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    graphql_url:
      process.env.GITHUB_GRAPHQL_URL || "https://api.github.com/graphql",
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.SYNC_PROJECTS_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.SYNC_PROJECTS_CONFIG_FILE || "",
    projects_file:
      process.env.SYNC_PROJECTS_FILE || process.env.PROJECTS_FILE || "",

    output_file: process.env.SYNC_PROJECTS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.SYNC_PROJECTS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_projects: normalizeStringList(
      process.env.SYNC_PROJECTS_INCLUDE || "",
    ),
    exclude_projects: normalizeStringList(
      process.env.SYNC_PROJECTS_EXCLUDE || "",
    ),
    preserve_projects: normalizeStringList(
      process.env.SYNC_PROJECTS_PRESERVE || "",
    ),

    create_missing: normalizeBoolean(
      process.env.SYNC_PROJECTS_CREATE_MISSING,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.SYNC_PROJECTS_UPDATE_EXISTING,
      true,
    ),
    rename_from_aliases: normalizeBoolean(
      process.env.SYNC_PROJECTS_RENAME_FROM_ALIASES,
      true,
    ),
    link_repositories: normalizeBoolean(
      process.env.SYNC_PROJECTS_LINK_REPOSITORIES,
      true,
    ),
    auto_link_current_repository: normalizeBoolean(
      process.env.SYNC_PROJECTS_AUTO_LINK_CURRENT_REPOSITORY,
      true,
    ),
    close_missing: normalizeBoolean(
      process.env.SYNC_PROJECTS_CLOSE_MISSING,
      false,
    ),
    delete_missing: normalizeBoolean(
      process.env.SYNC_PROJECTS_DELETE_MISSING,
      false,
    ),

    fail_if_no_projects: normalizeBoolean(
      process.env.SYNC_PROJECTS_FAIL_IF_NO_PROJECTS,
      true,
    ),
    fail_on_invalid_project: normalizeBoolean(
      process.env.SYNC_PROJECTS_FAIL_ON_INVALID_PROJECT,
      true,
    ),
    fail_on_conflicting_modes: normalizeBoolean(
      process.env.SYNC_PROJECTS_FAIL_ON_CONFLICTING_MODES,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SYNC_PROJECTS_FAIL_ON_ERROR,
      true,
    ),

    max_projects: normalizeInteger(process.env.SYNC_PROJECTS_MAX_PROJECTS, 100),
    timeout_seconds: normalizeInteger(
      process.env.SYNC_PROJECTS_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.SYNC_PROJECTS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.SYNC_PROJECTS_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SYNC_PROJECTS_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SYNC_PROJECTS_STEP_SUMMARY,
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

    if (arg === "--graphql-url") {
      args.graphql_url = argv[index + 1];
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

    if (arg === "--projects-file" || arg === "--file" || arg === "--source") {
      args.projects_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-project" || arg === "--include-projects") {
      args.include_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-project" || arg === "--exclude-projects") {
      args.exclude_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--preserve-project" || arg === "--preserve-projects") {
      args.preserve_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
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

    if (arg === "--link-repositories") {
      args.link_repositories = true;
      continue;
    }

    if (arg === "--no-link-repositories") {
      args.link_repositories = false;
      continue;
    }

    if (arg === "--auto-link-current-repository") {
      args.auto_link_current_repository = true;
      continue;
    }

    if (arg === "--no-auto-link-current-repository") {
      args.auto_link_current_repository = false;
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

    if (arg === "--delete-missing") {
      args.delete_missing = true;
      continue;
    }

    if (arg === "--no-delete-missing") {
      args.delete_missing = false;
      continue;
    }

    if (arg === "--fail-if-no-projects") {
      args.fail_if_no_projects = true;
      continue;
    }

    if (arg === "--no-fail-if-no-projects") {
      args.fail_if_no_projects = false;
      continue;
    }

    if (arg === "--fail-on-invalid-project") {
      args.fail_on_invalid_project = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-project") {
      args.fail_on_invalid_project = false;
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

    if (arg === "--max-projects") {
      args.max_projects = normalizeInteger(argv[index + 1], args.max_projects);
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

  args.repository = normalizeRepositorySlug(
    args.repository,
    DEFAULT_REPOSITORY,
  );
  args.graphql_url = normalizeString(
    args.graphql_url,
    "https://api.github.com/graphql",
  );
  args.api_url = normalizeString(
    args.api_url,
    "https://api.github.com",
  ).replace(/\/+$/g, "");
  args.projects_file = normalizeString(args.projects_file);
  args.include_projects = [
    ...new Set(
      args.include_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  args.exclude_projects = [
    ...new Set(
      args.exclude_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  args.preserve_projects = [
    ...new Set(
      args.preserve_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  args.max_projects = Math.max(1, Math.min(args.max_projects, 100));
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Projects Sync

Usage:
  node .github/scripts/repo/sync-projects.js [options]

Examples:
  node .github/scripts/repo/sync-projects.js
  node .github/scripts/repo/sync-projects.js --projects-file .github/projects.yaml
  node .github/scripts/repo/sync-projects.js --dry-run
  node .github/scripts/repo/sync-projects.js --close-missing
  node .github/scripts/repo/sync-projects.js --include-project "Aerealith AI Roadmap"

Projects YAML:
  - title: "Aerealith AI Roadmap"
    description: "Planning, delivery, and release tracking."
    readme: "Project board for Aerealith AI work."
    public: false
    closed: false
    repositories:
      - "SinLess-Games/Aerealith-AI"

Options:
      --repo <owner/repo>                   Repository slug.
      --graphql-url <url>                   GitHub GraphQL URL.
      --api-url <url>                       GitHub REST API URL.
      --token <token>                       GitHub token.
      --config <file>                       Sync config file.
      --projects-file <file>                Project source file.
      --include-project <title,list>        Only sync matching project titles.
      --exclude-project <title,list>        Exclude matching project titles.
      --preserve-project <title,list>       Never close/delete matching remote projects.
      --create-missing                      Create missing projects. Default.
      --no-create-missing                   Do not create missing projects.
      --update-existing                     Update changed projects. Default.
      --no-update-existing                  Do not update changed projects.
      --rename-from-aliases                 Rename projects from aliases/old_titles. Default.
      --no-rename-from-aliases              Do not rename from aliases.
      --link-repositories                   Link configured repositories. Default.
      --no-link-repositories                Do not link repositories.
      --auto-link-current-repository        Link current repo when repositories are omitted. Default.
      --no-auto-link-current-repository     Do not auto-link current repo.
      --close-missing                       Close remote projects missing from source.
      --delete-missing                      Delete remote projects missing from source.
      --fail-if-no-projects                 Fail when no desired projects are loaded. Default.
      --no-fail-if-no-projects              Allow empty project source.
      --fail-on-invalid-project             Fail on invalid project entries. Default.
      --no-fail-on-invalid-project          Warn on invalid project entries.
      --fail-on-conflicting-modes           Fail when close/delete missing are both enabled. Default.
      --no-fail-on-conflicting-modes        Warn when close/delete missing are both enabled.
      --max-projects <number>               Max owner projects to fetch. Default: 100.
      --timeout-seconds <number>            GitHub API timeout. Default: 60.
      --fail-on-error                       Exit non-zero on errors. Default.
      --no-fail-on-error                    Do not fail workflow.
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

  let currentItem = null;
  let currentList = rootItems;
  let currentNestedListKey = "";
  let section = "";

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
      currentNestedListKey = "";
      continue;
    }

    if (/^-\s*/.test(trimmed)) {
      const rest = trimmed.replace(/^-\s*/, "");

      if (currentItem && currentNestedListKey && indent > 0) {
        currentItem[currentNestedListKey].push(parseYamlScalar(rest));
        continue;
      }

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentItem = {
          [key]: parseYamlScalar(value),
        };
        currentList.push(currentItem);
        currentNestedListKey = "";
        continue;
      }

      const scalar = parseYamlScalar(rest);

      if (typeof scalar === "string" && scalar) {
        currentList.push(scalar);
      } else {
        currentItem = {};
        currentList.push(currentItem);
      }

      currentNestedListKey = "";
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

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
      currentNestedListKey = "";
    }
  }

  if (rootItems.length) {
    config.projects = rootItems;
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

function findProjectsFile(args, repoRoot, config) {
  if (args.projects_file) {
    const absolutePath = resolvePath(args.projects_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.projects_file;
  }

  if (config?.projects_file) {
    const absolutePath = resolvePath(config.projects_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : config.projects_file;
  }

  if (Array.isArray(config?.projects)) {
    return "";
  }

  for (const candidate of DEFAULT_PROJECT_FILE_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = ["projects_file", "output_file", "summary_file"];

  for (const key of stringKeys) {
    if (config[key] !== undefined && !merged[key]) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "include_projects",
    "exclude_projects",
    "preserve_projects",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = [
        ...new Set([...merged[key], ...normalizeStringList(config[key])]),
      ];
    }
  }

  const booleanKeys = [
    "create_missing",
    "update_existing",
    "rename_from_aliases",
    "link_repositories",
    "auto_link_current_repository",
    "close_missing",
    "delete_missing",
    "fail_if_no_projects",
    "fail_on_invalid_project",
    "fail_on_conflicting_modes",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_projects !== undefined) {
    merged.max_projects = normalizeInteger(
      config.max_projects,
      merged.max_projects,
    );
  }

  if (config.timeout_seconds !== undefined) {
    merged.timeout_seconds = normalizeInteger(
      config.timeout_seconds,
      merged.timeout_seconds,
    );
  }

  merged.include_projects = [
    ...new Set(
      merged.include_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  merged.exclude_projects = [
    ...new Set(
      merged.exclude_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  merged.preserve_projects = [
    ...new Set(
      merged.preserve_projects.map(normalizeProjectTitle).filter(Boolean),
    ),
  ];
  merged.max_projects = Math.max(1, Math.min(merged.max_projects, 100));
  merged.timeout_seconds = Math.max(1, merged.timeout_seconds);

  return merged;
}

function normalizeProjectEntry(args, entry, index) {
  if (!entry || typeof entry !== "object") {
    return {
      valid: false,
      error: `Project entry ${index + 1} is not an object.`,
      project: null,
    };
  }

  const title = normalizeProjectTitle(
    entry.title || entry.name || entry.project,
  );
  const description = normalizeString(
    entry.description ||
      entry.short_description ||
      entry.shortDescription ||
      entry.desc ||
      "",
  );
  const readme = normalizeString(entry.readme || entry.body || "");
  const isPublic = normalizeBoolean(entry.public, false);
  const closed = normalizeBoolean(entry.closed, false);
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
        .map(normalizeProjectTitle)
        .filter(Boolean),
    ),
  ];

  let repositories = normalizeRepositoryList(
    entry.repositories ||
      entry.repos ||
      entry.linked_repositories ||
      entry.linkedRepositories ||
      [],
    args.repository,
  );

  if (!repositories.length && args.auto_link_current_repository) {
    repositories = [args.repository];
  }

  if (!title) {
    return {
      valid: false,
      error: `Project entry ${index + 1} is missing a title.`,
      project: null,
    };
  }

  return {
    valid: true,
    error: "",
    project: {
      title,
      description,
      readme,
      public: isPublic,
      closed,
      repositories,
      aliases,
      enabled: normalizeBoolean(entry.enabled, true),
      preserve: normalizeBoolean(entry.preserve, false),
      source_index: index,
    },
  };
}

function loadDesiredProjects(args, projectsData) {
  const sourceProjects = Array.isArray(projectsData)
    ? projectsData
    : Array.isArray(projectsData?.projects)
      ? projectsData.projects
      : [];

  const includeKeys = new Set(args.include_projects.map(normalizeProjectKey));
  const excludeKeys = new Set(args.exclude_projects.map(normalizeProjectKey));

  const projects = [];
  const invalid = [];
  const duplicateTitles = new Set();
  const seen = new Set();

  sourceProjects.forEach((entry, index) => {
    const normalized = normalizeProjectEntry(args, entry, index);

    if (!normalized.valid) {
      invalid.push(normalized.error);
      return;
    }

    const project = normalized.project;
    const key = normalizeProjectKey(project.title);

    if (!project.enabled) return;
    if (includeKeys.size && !includeKeys.has(key)) return;
    if (excludeKeys.has(key)) return;

    if (seen.has(key)) {
      duplicateTitles.add(project.title);
      return;
    }

    seen.add(key);
    projects.push(project);
  });

  return {
    projects,
    invalid,
    duplicate_titles: [...duplicateTitles],
  };
}

function requestGraphql(args, query, variables = {}) {
  const parsed = new URL(args.graphql_url);
  const bodyBuffer = Buffer.from(JSON.stringify({ query, variables }));

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-sync-projects-script`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "Content-Length": String(bodyBuffer.length),
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`;
  }

  const requestOptions = {
    method: "POST",
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: args.timeout_seconds * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const parsedBody = safeJsonParse(responseText, null);

        if (!parsedBody) {
          reject(
            new Error(`GitHub GraphQL returned invalid JSON: ${responseText}`),
          );
          return;
        }

        if (parsedBody.errors?.length) {
          reject(
            new Error(
              parsedBody.errors.map((error) => error.message).join("; "),
            ),
          );
          return;
        }

        resolve(parsedBody.data || {});
      });
    });

    req.on("timeout", () => {
      req.destroy(
        new Error(`Request timed out after ${args.timeout_seconds} second(s).`),
      );
    });

    req.on("error", reject);
    req.write(bodyBuffer);
    req.end();
  });
}

const OWNER_PROJECTS_QUERY = `
query OwnerProjects($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    id
    nameWithOwner
    owner {
      __typename
      login
      ... on Organization {
        id
        projectsV2(first: $first, orderBy: { field: TITLE, direction: ASC }) {
          nodes {
            id
            number
            title
            shortDescription
            readme
            public
            closed
            url
            repositories(first: 100) {
              nodes {
                id
                nameWithOwner
              }
            }
          }
        }
      }
      ... on User {
        id
        projectsV2(first: $first, orderBy: { field: TITLE, direction: ASC }) {
          nodes {
            id
            number
            title
            shortDescription
            readme
            public
            closed
            url
            repositories(first: 100) {
              nodes {
                id
                nameWithOwner
              }
            }
          }
        }
      }
    }
  }
}
`;

const REPOSITORY_ID_QUERY = `
query RepositoryId($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    id
    nameWithOwner
  }
}
`;

const CREATE_PROJECT_MUTATION = `
mutation CreateProject($ownerId: ID!, $title: String!, $repositoryId: ID) {
  createProjectV2(input: { ownerId: $ownerId, title: $title, repositoryId: $repositoryId }) {
    projectV2 {
      id
      number
      title
      shortDescription
      readme
      public
      closed
      url
      repositories(first: 100) {
        nodes {
          id
          nameWithOwner
        }
      }
    }
  }
}
`;

const UPDATE_PROJECT_MUTATION = `
mutation UpdateProject(
  $projectId: ID!
  $title: String!
  $shortDescription: String
  $readme: String
  $public: Boolean!
  $closed: Boolean!
) {
  updateProjectV2(input: {
    projectId: $projectId
    title: $title
    shortDescription: $shortDescription
    readme: $readme
    public: $public
    closed: $closed
  }) {
    projectV2 {
      id
      number
      title
      shortDescription
      readme
      public
      closed
      url
      repositories(first: 100) {
        nodes {
          id
          nameWithOwner
        }
      }
    }
  }
}
`;

const LINK_PROJECT_REPOSITORY_MUTATION = `
mutation LinkProjectToRepository($projectId: ID!, $repositoryId: ID!) {
  linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) {
    repository {
      id
      nameWithOwner
    }
  }
}
`;

const DELETE_PROJECT_MUTATION = `
mutation DeleteProject($projectId: ID!) {
  deleteProjectV2(input: { projectId: $projectId }) {
    clientMutationId
  }
}
`;

function normalizeRemoteProject(project) {
  return {
    id: normalizeString(project?.id),
    number: normalizeInteger(project?.number, 0),
    title: normalizeProjectTitle(project?.title),
    description: normalizeString(project?.shortDescription),
    readme: normalizeString(project?.readme),
    public: Boolean(project?.public),
    closed: Boolean(project?.closed),
    url: normalizeString(project?.url),
    repositories: (project?.repositories?.nodes || []).map((repo) => ({
      id: normalizeString(repo.id),
      name_with_owner: normalizeRepositorySlug(repo.nameWithOwner),
    })),
  };
}

async function fetchOwnerProjects(args) {
  const repoSlug = splitRepositorySlug(args.repository);
  const data = await requestGraphql(args, OWNER_PROJECTS_QUERY, {
    owner: repoSlug.owner,
    repo: repoSlug.name,
    first: args.max_projects,
  });

  const repository = data.repository;

  if (!repository) {
    throw new Error(`Repository not found: ${args.repository}`);
  }

  const owner = repository.owner;
  const projects = owner.projectsV2?.nodes || [];

  return {
    owner: {
      id: owner.id,
      login: owner.login,
      type: owner.__typename,
    },
    repository: {
      id: repository.id,
      name_with_owner: repository.nameWithOwner,
    },
    projects: projects.map(normalizeRemoteProject),
  };
}

async function fetchRepositoryId(args, repositorySlug) {
  const repo = splitRepositorySlug(repositorySlug, args.repository);
  const data = await requestGraphql(args, REPOSITORY_ID_QUERY, {
    owner: repo.owner,
    repo: repo.name,
  });

  if (!data.repository?.id) {
    throw new Error(`Repository not found: ${repositorySlug}`);
  }

  return {
    id: data.repository.id,
    name_with_owner: data.repository.nameWithOwner,
  };
}

async function resolveRepositoryIds(args, project, ownerData) {
  const known = new Map();

  if (ownerData.repository?.id) {
    known.set(normalizeRepositorySlug(ownerData.repository.name_with_owner), {
      id: ownerData.repository.id,
      name_with_owner: normalizeRepositorySlug(
        ownerData.repository.name_with_owner,
      ),
    });
  }

  for (const existingProject of ownerData.projects || []) {
    for (const repository of existingProject.repositories || []) {
      known.set(
        normalizeRepositorySlug(repository.name_with_owner),
        repository,
      );
    }
  }

  const resolved = [];
  const warnings = [];

  for (const slug of project.repositories) {
    const normalizedSlug = normalizeRepositorySlug(slug, args.repository);

    if (known.has(normalizedSlug)) {
      resolved.push(known.get(normalizedSlug));
      continue;
    }

    try {
      const repository = await fetchRepositoryId(args, normalizedSlug);
      known.set(normalizedSlug, repository);
      resolved.push(repository);
    } catch (err) {
      warnings.push(
        `Unable to resolve repository "${normalizedSlug}": ${logger.formatError(err)}`,
      );
    }
  }

  return {
    repositories: resolved,
    warnings,
  };
}

function projectChanged(existing, desired) {
  if (!existing) return true;

  return (
    normalizeProjectTitle(existing.title) !==
      normalizeProjectTitle(desired.title) ||
    normalizeString(existing.description) !==
      normalizeString(desired.description) ||
    normalizeString(existing.readme) !== normalizeString(desired.readme) ||
    Boolean(existing.public) !== Boolean(desired.public) ||
    Boolean(existing.closed) !== Boolean(desired.closed)
  );
}

function buildSyncPlan(args, desiredProjects, existingProjects) {
  const existingByKey = new Map(
    existingProjects.map((project) => [
      normalizeProjectKey(project.title),
      project,
    ]),
  );
  const preserveKeys = new Set([
    ...args.preserve_projects.map(normalizeProjectKey),
    ...desiredProjects
      .filter((project) => project.preserve)
      .map((project) => normalizeProjectKey(project.title)),
  ]);

  const creates = [];
  const updates = [];
  const unchanged = [];
  const links = [];
  const closes = [];
  const deletes = [];
  const skipped = [];

  for (const desired of desiredProjects) {
    const desiredKey = normalizeProjectKey(desired.title);
    const existing = existingByKey.get(desiredKey);

    if (existing) {
      if (projectChanged(existing, desired)) {
        updates.push({
          action: "update",
          from_title: existing.title,
          project: desired,
          existing,
          rename:
            normalizeProjectTitle(existing.title) !==
            normalizeProjectTitle(desired.title),
        });
      } else {
        unchanged.push({
          action: "unchanged",
          project: desired,
          existing,
        });
      }

      for (const repository of desired.repositories) {
        const alreadyLinked = existing.repositories.some(
          (repo) =>
            normalizeRepositorySlug(repo.name_with_owner) ===
            normalizeRepositorySlug(repository, args.repository),
        );

        if (!alreadyLinked && args.link_repositories) {
          links.push({
            action: "link-repository",
            project: desired,
            existing,
            repository: normalizeRepositorySlug(repository, args.repository),
          });
        }
      }

      continue;
    }

    const aliasMatch = args.rename_from_aliases
      ? desired.aliases
          .map((alias) => existingByKey.get(normalizeProjectKey(alias)))
          .find(Boolean)
      : null;

    if (aliasMatch) {
      updates.push({
        action: "rename",
        from_title: aliasMatch.title,
        project: desired,
        existing: aliasMatch,
        rename: true,
      });

      for (const repository of desired.repositories) {
        const alreadyLinked = aliasMatch.repositories.some(
          (repo) =>
            normalizeRepositorySlug(repo.name_with_owner) ===
            normalizeRepositorySlug(repository, args.repository),
        );

        if (!alreadyLinked && args.link_repositories) {
          links.push({
            action: "link-repository",
            project: desired,
            existing: aliasMatch,
            repository: normalizeRepositorySlug(repository, args.repository),
          });
        }
      }

      continue;
    }

    if (args.create_missing) {
      creates.push({
        action: "create",
        project: desired,
      });
    } else {
      skipped.push({
        action: "skip-create-disabled",
        project: desired,
      });
    }
  }

  const desiredAndAliasKeys = new Set();

  for (const desired of desiredProjects) {
    desiredAndAliasKeys.add(normalizeProjectKey(desired.title));

    for (const alias of desired.aliases) {
      desiredAndAliasKeys.add(normalizeProjectKey(alias));
    }
  }

  for (const existing of existingProjects) {
    const key = normalizeProjectKey(existing.title);

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

    if (args.close_missing && !existing.closed) {
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
    links,
    closes,
    deletes,
    skipped,
  };
}

async function createProject(args, ownerData, project) {
  const firstRepository = project.repositories[0]
    ? await fetchRepositoryId(args, project.repositories[0])
    : null;

  const data = await requestGraphql(args, CREATE_PROJECT_MUTATION, {
    ownerId: ownerData.owner.id,
    title: project.title,
    repositoryId: firstRepository?.id || null,
  });

  const created = normalizeRemoteProject(data.createProjectV2?.projectV2);

  if (projectChanged(created, project)) {
    const updated = await updateProject(args, created.id, project);
    return updated;
  }

  return created;
}

async function updateProject(args, projectId, project) {
  const data = await requestGraphql(args, UPDATE_PROJECT_MUTATION, {
    projectId,
    title: project.title,
    shortDescription: project.description || null,
    readme: project.readme || null,
    public: Boolean(project.public),
    closed: Boolean(project.closed),
  });

  return normalizeRemoteProject(data.updateProjectV2?.projectV2);
}

async function linkProjectToRepository(args, projectId, repositoryId) {
  const data = await requestGraphql(args, LINK_PROJECT_REPOSITORY_MUTATION, {
    projectId,
    repositoryId,
  });

  return {
    id: data.linkProjectV2ToRepository?.repository?.id || repositoryId,
    name_with_owner: normalizeRepositorySlug(
      data.linkProjectV2ToRepository?.repository?.nameWithOwner || "",
    ),
  };
}

async function closeProject(args, existing) {
  const desired = {
    title: existing.title,
    description: existing.description,
    readme: existing.readme,
    public: existing.public,
    closed: true,
  };

  return updateProject(args, existing.id, desired);
}

async function deleteProject(args, projectId) {
  await requestGraphql(args, DELETE_PROJECT_MUTATION, {
    projectId,
  });

  return true;
}

async function executeSync(args, ownerData, plan) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    remote_available: Boolean(ownerData.owner?.id),
    created: [],
    updated: [],
    renamed: [],
    linked_repositories: [],
    closed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.project.title),
    skipped: plan.skipped.map(
      (item) => item.project?.title || item.existing?.title || "unknown",
    ),
    errors: [],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!result.remote_available) {
      result.status = args.dry_run ? "planned-without-remote" : "failed";
      result.success = Boolean(args.dry_run);
      result.warnings.push(
        "Remote projects were not fetched, so create/update/link/close/delete accuracy could not be verified.",
      );

      if (args.dry_run) {
        result.created = plan.creates.map((item) => item.project.title);
        result.updated = plan.updates
          .filter((item) => !item.rename)
          .map((item) => item.project.title);
        result.renamed = plan.updates
          .filter((item) => item.rename)
          .map((item) => `${item.from_title} -> ${item.project.title}`);
        result.linked_repositories = plan.links.map(
          (item) => `${item.project.title} -> ${item.repository}`,
        );
        result.closed = plan.closes.map((item) => item.existing.title);
        result.deleted = plan.deletes.map((item) => item.existing.title);
      }

      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.created = plan.creates.map((item) => item.project.title);
      result.updated = plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.project.title);
      result.renamed = plan.updates
        .filter((item) => item.rename)
        .map((item) => `${item.from_title} -> ${item.project.title}`);
      result.linked_repositories = plan.links.map(
        (item) => `${item.project.title} -> ${item.repository}`,
      );
      result.closed = plan.closes.map((item) => item.existing.title);
      result.deleted = plan.deletes.map((item) => item.existing.title);
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_PROJECTS_TOKEN, or --token.",
      );
      return result;
    }

    const projectIdByTitle = new Map();

    for (const existing of ownerData.projects) {
      projectIdByTitle.set(normalizeProjectKey(existing.title), existing.id);
    }

    for (const item of plan.creates) {
      logger.info(`Creating project "${item.project.title}".`);
      const created = await createProject(args, ownerData, item.project);

      result.created.push(item.project.title);
      projectIdByTitle.set(normalizeProjectKey(item.project.title), created.id);

      if (args.link_repositories) {
        const resolved = await resolveRepositoryIds(
          args,
          item.project,
          ownerData,
        );
        result.warnings.push(...resolved.warnings);

        for (const repository of resolved.repositories) {
          logger.info(
            `Linking repository "${repository.name_with_owner}" to project "${item.project.title}".`,
          );
          await linkProjectToRepository(args, created.id, repository.id);
          result.linked_repositories.push(
            `${item.project.title} -> ${repository.name_with_owner}`,
          );
        }
      }
    }

    if (args.update_existing) {
      for (const item of plan.updates) {
        logger.info(
          `${item.rename ? "Renaming/updating" : "Updating"} project "${item.from_title}" -> "${item.project.title}".`,
        );
        await updateProject(args, item.existing.id, item.project);

        if (item.rename) {
          result.renamed.push(`${item.from_title} -> ${item.project.title}`);
        } else {
          result.updated.push(item.project.title);
        }

        projectIdByTitle.set(
          normalizeProjectKey(item.project.title),
          item.existing.id,
        );
      }
    } else if (plan.updates.length) {
      result.skipped.push(...plan.updates.map((item) => item.project.title));
      result.warnings.push("Existing project updates are disabled.");
    }

    if (args.link_repositories) {
      for (const item of plan.links) {
        const projectId =
          item.existing?.id ||
          projectIdByTitle.get(normalizeProjectKey(item.project.title));

        if (!projectId) {
          result.warnings.push(
            `Unable to link repository "${item.repository}" because project id was not resolved for "${item.project.title}".`,
          );
          continue;
        }

        const resolved = await resolveRepositoryIds(
          args,
          item.project,
          ownerData,
        );
        result.warnings.push(...resolved.warnings);

        const repository = resolved.repositories.find(
          (repo) =>
            normalizeRepositorySlug(repo.name_with_owner) ===
            normalizeRepositorySlug(item.repository, args.repository),
        );

        if (!repository) {
          result.warnings.push(
            `Unable to link unresolved repository "${item.repository}".`,
          );
          continue;
        }

        logger.info(
          `Linking repository "${repository.name_with_owner}" to project "${item.project.title}".`,
        );
        await linkProjectToRepository(args, projectId, repository.id);
        result.linked_repositories.push(
          `${item.project.title} -> ${repository.name_with_owner}`,
        );
      }
    }

    for (const item of plan.closes) {
      logger.info(`Closing project "${item.existing.title}".`);
      await closeProject(args, item.existing);
      result.closed.push(item.existing.title);
    }

    for (const item of plan.deletes) {
      logger.info(`Deleting project "${item.existing.title}".`);
      await deleteProject(args, item.existing.id);
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
  projectsFile,
  projectsLoad,
  ownerData,
  plan,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const invalidErrors = args.fail_on_invalid_project
    ? projectsLoad.invalid
    : [];
  const invalidWarnings = args.fail_on_invalid_project
    ? []
    : projectsLoad.invalid;
  const noProjectsError =
    args.fail_if_no_projects && projectsLoad.projects.length === 0
      ? ["No desired projects were loaded."]
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
    ...noProjectsError,
    ...conflictingModeError,
    ...execution.errors,
  ];

  const warnings = [
    ...invalidWarnings,
    ...conflictingModeWarning,
    ...projectsLoad.duplicate_titles.map(
      (title) => `Duplicate project ignored: ${title}`,
    ),
    ...execution.warnings,
  ];

  const ok = execution.success && errors.length === 0;
  const status = ok ? execution.status : "failed";

  return {
    schema_version: 1,
    type: "repo-sync-projects",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    owner: ownerData.owner || null,
    config: {
      config_file: configFile || null,
      projects_file: projectsFile || null,
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
      link_repositories: args.link_repositories,
      auto_link_current_repository: args.auto_link_current_repository,
      include_projects: args.include_projects,
      exclude_projects: args.exclude_projects,
      preserve_projects: args.preserve_projects,
      dry_run: args.dry_run,
    },
    projects: {
      desired: projectsLoad.projects,
      existing: ownerData.projects || [],
      invalid: projectsLoad.invalid,
      duplicate_titles: projectsLoad.duplicate_titles,
    },
    plan: {
      create: plan.creates.map((item) => item.project.title),
      update: plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.project.title),
      rename: plan.updates
        .filter((item) => item.rename)
        .map((item) => ({
          from: item.from_title,
          to: item.project.title,
        })),
      link_repositories: plan.links.map((item) => ({
        project: item.project.title,
        repository: item.repository,
      })),
      close: plan.closes.map((item) => item.existing.title),
      delete: plan.deletes.map((item) => item.existing.title),
      unchanged: plan.unchanged.map((item) => item.project.title),
      skipped: plan.skipped.map((item) => ({
        action: item.action,
        title: item.project?.title || item.existing?.title || "unknown",
      })),
    },
    execution,
    totals: {
      desired_projects: projectsLoad.projects.length,
      existing_projects: (ownerData.projects || []).length,
      invalid_projects: projectsLoad.invalid.length,
      duplicate_projects: projectsLoad.duplicate_titles.length,
      planned_create: plan.creates.length,
      planned_update: plan.updates.filter((item) => !item.rename).length,
      planned_rename: plan.updates.filter((item) => item.rename).length,
      planned_link_repositories: plan.links.length,
      planned_close: plan.closes.length,
      planned_delete: plan.deletes.length,
      unchanged: plan.unchanged.length,
      skipped: plan.skipped.length,
      created: execution.created.length,
      updated: execution.updated.length,
      renamed: execution.renamed.length,
      linked_repositories: execution.linked_repositories.length,
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
    `# 📌 ${PROJECT_NAME} Projects Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Desired projects: \`${report.totals.desired_projects}\``,
    `- Existing projects: \`${report.totals.existing_projects}\``,
    `- Planned create: \`${report.totals.planned_create}\``,
    `- Planned update: \`${report.totals.planned_update}\``,
    `- Planned rename: \`${report.totals.planned_rename}\``,
    `- Planned repository links: \`${report.totals.planned_link_repositories}\``,
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
    `- Owner: \`${escapeMarkdown(report.owner?.login || "unknown")}\``,
    `- Owner type: \`${escapeMarkdown(report.owner?.type || "unknown")}\``,
    `- Branch: \`${escapeMarkdown(report.github.branch || "unknown")}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📋 Project Plan",
    "",
    "| Action | Projects |",
    "|---|---|",
    `| Create | \`${escapeMarkdown(report.plan.create.join(", ") || "none")}\` |`,
    `| Update | \`${escapeMarkdown(report.plan.update.join(", ") || "none")}\` |`,
    `| Rename | \`${escapeMarkdown(report.plan.rename.map((item) => `${item.from} -> ${item.to}`).join(", ") || "none")}\` |`,
    `| Link repositories | \`${escapeMarkdown(report.plan.link_repositories.map((item) => `${item.project} -> ${item.repository}`).join(", ") || "none")}\` |`,
    `| Close | \`${escapeMarkdown(report.plan.close.join(", ") || "none")}\` |`,
    `| Delete | \`${escapeMarkdown(report.plan.delete.join(", ") || "none")}\` |`,
    `| Unchanged | \`${escapeMarkdown(report.plan.unchanged.join(", ") || "none")}\` |`,
    "",
  ];

  if (report.plan.skipped.length) {
    lines.push("## ⏭️ Skipped");
    lines.push("");
    lines.push("| Project | Reason |");
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
    `- Projects file: \`${report.config.projects_file || "inline config projects"}\``,
  );
  lines.push(
    `- Create missing: \`${report.config.create_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Link repositories: \`${report.config.link_repositories ? "true" : "false"}\``,
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
  setGitHubOutput("sync_projects_file", report.config.output_file);
  setGitHubOutput(
    "sync_projects_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("sync_projects_status", report.status);
  setGitHubOutput("sync_projects_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "sync_projects_desired",
    String(report.totals.desired_projects),
  );
  setGitHubOutput(
    "sync_projects_existing",
    String(report.totals.existing_projects),
  );
  setGitHubOutput(
    "sync_projects_planned_create",
    String(report.totals.planned_create),
  );
  setGitHubOutput(
    "sync_projects_planned_update",
    String(report.totals.planned_update),
  );
  setGitHubOutput(
    "sync_projects_planned_rename",
    String(report.totals.planned_rename),
  );
  setGitHubOutput(
    "sync_projects_planned_link_repositories",
    String(report.totals.planned_link_repositories),
  );
  setGitHubOutput(
    "sync_projects_planned_close",
    String(report.totals.planned_close),
  );
  setGitHubOutput(
    "sync_projects_planned_delete",
    String(report.totals.planned_delete),
  );
  setGitHubOutput("sync_projects_created", String(report.totals.created));
  setGitHubOutput("sync_projects_updated", String(report.totals.updated));
  setGitHubOutput("sync_projects_renamed", String(report.totals.renamed));
  setGitHubOutput(
    "sync_projects_linked_repositories",
    String(report.totals.linked_repositories),
  );
  setGitHubOutput("sync_projects_closed", String(report.totals.closed));
  setGitHubOutput("sync_projects_deleted", String(report.totals.deleted));

  setGitHubOutput(
    "sync_projects_create_json",
    JSON.stringify(report.plan.create),
  );
  setGitHubOutput(
    "sync_projects_update_json",
    JSON.stringify(report.plan.update),
  );
  setGitHubOutput(
    "sync_projects_rename_json",
    JSON.stringify(report.plan.rename),
  );
  setGitHubOutput(
    "sync_projects_link_repositories_json",
    JSON.stringify(report.plan.link_repositories),
  );
  setGitHubOutput(
    "sync_projects_close_json",
    JSON.stringify(report.plan.close),
  );
  setGitHubOutput(
    "sync_projects_delete_json",
    JSON.stringify(report.plan.delete),
  );
  setGitHubOutput("sync_projects_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "sync_projects_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readDataFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const projectsFile = findProjectsFile(args, repoRoot, config);
  const projectsData = projectsFile
    ? readDataFile(projectsFile, repoRoot)
    : config;

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing GitHub Projects sync.");

  const projectsLoad = loadDesiredProjects(args, projectsData);
  const preflightErrors = [];

  if (args.fail_if_no_projects && projectsLoad.projects.length === 0) {
    preflightErrors.push("No desired projects were loaded.");
  }

  if (args.fail_on_invalid_project && projectsLoad.invalid.length > 0) {
    preflightErrors.push(...projectsLoad.invalid);
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

  let ownerData = {
    owner: null,
    repository: null,
    projects: [],
  };

  try {
    if (args.token) {
      ownerData = await fetchOwnerProjects(args);
    } else if (!args.dry_run) {
      preflightErrors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_PROJECTS_TOKEN, or --token.",
      );
    }
  } catch (err) {
    preflightErrors.push(
      `Unable to fetch existing projects: ${logger.formatError(err)}`,
    );
  }

  const plan = buildSyncPlan(
    args,
    projectsLoad.projects,
    ownerData.projects || [],
  );

  let execution = {
    status: "failed",
    success: false,
    dry_run: args.dry_run,
    remote_available: Boolean(ownerData.owner?.id),
    created: [],
    updated: [],
    renamed: [],
    linked_repositories: [],
    closed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.project.title),
    skipped: plan.skipped.map(
      (item) => item.project?.title || item.existing?.title || "unknown",
    ),
    errors: preflightErrors,
    warnings: [],
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 0,
  };

  if (!preflightErrors.length) {
    execution = await executeSync(args, ownerData, plan);
  }

  const report = createReport(
    args,
    repoRoot,
    configFile,
    projectsFile,
    projectsLoad,
    ownerData,
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
