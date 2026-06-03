#!/usr/bin/env node
// .github/scripts/cloudflare/sync-queues.js
// =============================================================================
// Aerealith AI — Cloudflare Queues Synchronizer
// -----------------------------------------------------------------------------
// Purpose:
//   Synchronize Cloudflare Queue definitions from local JSON, JSONC, YAML, or
//   discovered Cloudflare target metadata into Cloudflare Queues.
//
// Input:
//   - .github/cloudflare/queues-sync.json
//   - .github/cloudflare/queues-sync.jsonc
//   - .github/cloudflare/queues-sync.yaml
//   - .github/cloudflare/queues-sync.yml
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/sync-queues.json
//   - artifacts/cloudflare/sync-queues.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the Cloudflare REST API directly.
//   - Requires CLOUDFLARE_API_TOKEN for real sync operations.
//   - Requires CLOUDFLARE_ACCOUNT_ID by default.
//   - Queue creation is supported.
//   - Queue deletion is opt-in through --delete-missing.
//   - Consumer synchronization is planned as metadata evidence unless explicit
//     API support is enabled by configuration.
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
    info: (message) => console.log(`[cloudflare-queues] ${message}`),
    warn: (message) => console.warn(`[cloudflare-queues] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-queues] ERROR: ${message}`),
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
  ".github/cloudflare/queues-sync.json",
  ".github/cloudflare/queues-sync.jsonc",
  ".github/cloudflare/queues-sync.yaml",
  ".github/cloudflare/queues-sync.yml",
  "cloudflare/queues-sync.json",
  "cloudflare/queues-sync.jsonc",
  "cloudflare/queues-sync.yaml",
  "cloudflare/queues-sync.yml",
];

const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/sync-queues.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/sync-queues.md";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ENVIRONMENT = "production";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.CLOUDFLARE_QUEUES_SYNC_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_QUEUES_SYNC_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,

    output_file:
      process.env.CLOUDFLARE_QUEUES_SYNC_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_QUEUES_SYNC_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environment:
      process.env.CLOUDFLARE_QUEUES_SYNC_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,

    account_id: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    api_token: process.env.CLOUDFLARE_API_TOKEN || "",

    queue_id:
      process.env.CLOUDFLARE_QUEUE_ID ||
      process.env.CLOUDFLARE_QUEUES_SYNC_QUEUE_ID ||
      "",
    queue_name:
      process.env.CLOUDFLARE_QUEUE_NAME ||
      process.env.CLOUDFLARE_QUEUES_SYNC_QUEUE_NAME ||
      "",
    binding:
      process.env.CLOUDFLARE_QUEUE_BINDING ||
      process.env.CLOUDFLARE_QUEUES_SYNC_BINDING ||
      "",

    include_queues: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_INCLUDE_QUEUES,
    ),
    exclude_queues: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_EXCLUDE_QUEUES,
    ),
    include_bindings: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_INCLUDE_BINDINGS,
    ),
    exclude_bindings: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_EXCLUDE_BINDINGS,
    ),
    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_QUEUES_SYNC_EXCLUDE_TARGETS,
    ),

    create_missing: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_CREATE_MISSING,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_UPDATE_EXISTING,
      false,
    ),
    delete_missing: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_DELETE_MISSING,
      false,
    ),
    sync_consumers: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_CONSUMERS,
      false,
    ),

    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_REQUIRE_CREDENTIALS,
      true,
    ),
    allow_empty_plan: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_ALLOW_EMPTY_PLAN,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_CONTINUE_ON_ERROR,
      true,
    ),

    max_queues: normalizeInteger(
      process.env.CLOUDFLARE_QUEUES_SYNC_MAX_QUEUES,
      0,
    ),
    retry_count: normalizeInteger(
      process.env.CLOUDFLARE_QUEUES_SYNC_RETRY_COUNT,
      2,
    ),

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_QUEUES_SYNC_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_QUEUES_SYNC_STEP_SUMMARY,
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

    if (arg === "--targets" || arg === "--cloudflare-targets") {
      args.cloudflare_targets_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--environment" || arg === "--env") {
      args.environment = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      args.account_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--queue-id") {
      args.queue_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--queue" || arg === "--queue-name") {
      args.queue_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--binding") {
      args.binding = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-queue" || arg === "--include-queues") {
      args.include_queues.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-queue" || arg === "--exclude-queues") {
      args.exclude_queues.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-binding" || arg === "--include-bindings") {
      args.include_bindings.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-binding" || arg === "--exclude-bindings") {
      args.exclude_bindings.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--delete-missing") {
      args.delete_missing = true;
      continue;
    }

    if (arg === "--no-delete-missing") {
      args.delete_missing = false;
      continue;
    }

    if (arg === "--sync-consumers") {
      args.sync_consumers = true;
      continue;
    }

    if (arg === "--no-sync-consumers") {
      args.sync_consumers = false;
      continue;
    }

    if (arg === "--require-account-id") {
      args.require_account_id = true;
      continue;
    }

    if (arg === "--no-require-account-id") {
      args.require_account_id = false;
      continue;
    }

    if (arg === "--require-credentials") {
      args.require_credentials = true;
      continue;
    }

    if (arg === "--no-require-credentials") {
      args.require_credentials = false;
      continue;
    }

    if (arg === "--allow-empty-plan") {
      args.allow_empty_plan = true;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

    if (arg === "--continue-on-error") {
      args.continue_on_error = true;
      continue;
    }

    if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
      continue;
    }

    if (arg === "--max-queues") {
      args.max_queues = normalizeInteger(argv[index + 1], args.max_queues);
      index += 1;
      continue;
    }

    if (arg === "--retry-count") {
      args.retry_count = normalizeInteger(argv[index + 1], args.retry_count);
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

  args.environment = normalizeString(
    args.environment,
    DEFAULT_ENVIRONMENT,
  ).toLowerCase();
  args.include_queues = [...new Set(args.include_queues)];
  args.exclude_queues = [...new Set(args.exclude_queues)];
  args.include_bindings = [...new Set(args.include_bindings)];
  args.exclude_bindings = [...new Set(args.exclude_bindings)];
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.max_queues = Math.max(0, args.max_queues);
  args.retry_count = Math.max(0, args.retry_count);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Queues Synchronizer

Usage:
  node .github/scripts/cloudflare/sync-queues.js [options]

Examples:
  node .github/scripts/cloudflare/sync-queues.js --config .github/cloudflare/queues-sync.json --dry-run
  node .github/scripts/cloudflare/sync-queues.js --queue aerealith-events --binding AEREALITH_EVENTS_QUEUE
  node .github/scripts/cloudflare/sync-queues.js --targets artifacts/ci/cloudflare-targets.json --environment staging
  node .github/scripts/cloudflare/sync-queues.js --delete-missing --include-queue aerealith-events

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Queue sync config file.
      --targets <file>                       cloudflare-targets.json detector file.
      --environment <name>                   Environment name. Default: production.
      --account-id <id>                      Cloudflare account ID.
      --queue-id <id>                        Direct queue ID.
      --queue <name>                         Direct queue name.
      --binding <name>                       Direct queue binding name.
      --include-queue <list>                 Include queue names or IDs.
      --exclude-queue <list>                 Exclude queue names or IDs.
      --include-binding <list>               Include queue binding names.
      --exclude-binding <list>               Exclude queue binding names.
      --include-target <list>                Include Cloudflare target names.
      --exclude-target <list>                Exclude Cloudflare target names.
      --create-missing                       Create missing queues. Default.
      --no-create-missing                    Do not create missing queues.
      --update-existing                      Attempt to update existing queue settings.
      --no-update-existing                   Do not update existing queues. Default.
      --delete-missing                       Delete remote queues missing from desired plan.
      --no-delete-missing                    Do not delete missing queues. Default.
      --sync-consumers                       Include consumer sync planning.
      --no-sync-consumers                    Do not sync consumers. Default.
      --require-account-id                   Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id                Do not require account ID.
      --require-credentials                  Require API token. Default.
      --no-require-credentials               Do not require credentials.
      --allow-empty-plan                     Allow an empty plan.
      --fail-if-empty                        Exit non-zero if no queue plans are selected.
      --fail-on-error                        Exit non-zero on sync failure. Default.
      --no-fail-on-error                     Do not fail when sync has errors.
      --continue-on-error                    Continue after a queue failure. Default.
      --no-continue-on-error                 Stop after first queue failure.
      --max-queues <number>                  Maximum queues to sync.
      --retry-count <number>                 Cloudflare API retry count.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not mutate queues.
      --no-print                             Do not print JSON result.
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

function parseSimpleQueuesYaml(text) {
  const config = {};
  const queues = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let current = null;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");

      if (section === "queues") {
        config.queues = queues;
      }

      current = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (section === "queues" && /^-\s*/.test(trimmed)) {
      current = {};
      queues.push(current);

      const rest = trimmed.replace(/^-\s*/, "");
      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        current[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (current && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      current[key] = parseYamlScalar(value);
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
    return parseSimpleQueuesYaml(text);
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

function safeId(value) {
  return (
    normalizeString(value, "queue-sync")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "queue-sync"
  );
}

function normalizeQueueName(value) {
  return normalizeString(value)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveConfigEnvironmentValue(item, args, ...keys) {
  const env = args.environment;
  const environments = item.environments || item.env || {};

  if (environments && typeof environments === "object" && environments[env]) {
    for (const key of keys) {
      if (environments[env][key] !== undefined) return environments[env][key];
    }
  }

  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }

  return "";
}

function normalizeConsumer(item) {
  if (!item) return null;

  if (typeof item === "string") {
    return {
      service: item,
      script_name: item,
      environment: "",
      settings: {},
    };
  }

  return {
    service: normalizeString(
      item.service || item.worker || item.script || item.script_name,
    ),
    script_name: normalizeString(
      item.script_name || item.script || item.worker || item.service,
    ),
    environment: normalizeString(item.environment || item.env),
    settings: item.settings || {},
  };
}

function normalizeQueuePlan(item, args, source = "config") {
  const queueId = normalizeString(
    resolveConfigEnvironmentValue(item, args, "queue_id", "queueId", "id"),
  );
  const queueName = normalizeQueueName(
    resolveConfigEnvironmentValue(
      item,
      args,
      "name",
      "queue_name",
      "queueName",
    ),
  );
  const binding = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "binding",
      "binding_name",
      "bindingName",
    ),
  );

  const producers = [
    ...(Array.isArray(item.producers) ? item.producers : []),
    ...(Array.isArray(item.queue_producers) ? item.queue_producers : []),
  ].map((producer) => {
    if (typeof producer === "string") {
      return {
        binding: producer,
        target_name: "",
      };
    }

    return {
      binding: normalizeString(
        producer.binding || producer.binding_name || producer.name,
      ),
      target_name: normalizeString(
        producer.target_name ||
          producer.target ||
          producer.worker ||
          producer.service,
      ),
    };
  });

  const consumers = [
    ...(Array.isArray(item.consumers) ? item.consumers : []),
    ...(Array.isArray(item.queue_consumers) ? item.queue_consumers : []),
  ]
    .map(normalizeConsumer)
    .filter(Boolean);

  return {
    id: safeId(
      `${source}-${args.environment}-${queueName || binding || queueId || "queue"}`,
    ),
    source_type: source,
    target_name: normalizeString(item.target_name || item.target || ""),
    environment: args.environment,
    queue_id: queueId,
    queue_name: queueName,
    binding,
    delivery_delay: normalizeInteger(
      resolveConfigEnvironmentValue(
        item,
        args,
        "delivery_delay",
        "deliveryDelay",
      ),
      0,
    ),
    message_retention_period: normalizeInteger(
      resolveConfigEnvironmentValue(
        item,
        args,
        "message_retention_period",
        "messageRetentionPeriod",
      ),
      0,
    ),
    producers,
    consumers,
    create_missing: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "create_missing",
        "createMissing",
      ),
      args.create_missing,
    ),
    update_existing: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "update_existing",
        "updateExisting",
      ),
      args.update_existing,
    ),
    delete_missing: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "delete_missing",
        "deleteMissing",
      ),
      args.delete_missing,
    ),
    sync_consumers: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "sync_consumers",
        "syncConsumers",
      ),
      args.sync_consumers,
    ),
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function extractConfigPlans(config, args) {
  if (!config) return [];

  const queues = [
    ...(Array.isArray(config.queues) ? config.queues : []),
    ...(Array.isArray(config.cloudflare_queues)
      ? config.cloudflare_queues
      : []),
    ...(Array.isArray(config.cloudflareQueues) ? config.cloudflareQueues : []),
  ];

  if (config.queue && typeof config.queue === "object") {
    queues.push(config.queue);
  }

  if (
    !queues.length &&
    (config.queue_id ||
      config.queueId ||
      config.queue_name ||
      config.name ||
      config.binding)
  ) {
    queues.push(config);
  }

  return queues.map((item) => normalizeQueuePlan(item, args, "config"));
}

function normalizeWranglerQueueProducer(item, target, args) {
  const queueName = normalizeQueueName(
    item.queue || item.queue_name || item.name || item.producer_queue || "",
  );
  const binding = normalizeString(
    item.binding || item.binding_name || item.name || "",
  );

  if (!queueName && !binding) return null;

  return normalizeQueuePlan(
    {
      name: queueName,
      binding,
      target_name: target.name,
      producers: [
        {
          binding,
          target_name: target.name,
        },
      ],
    },
    args,
    "cloudflare-targets",
  );
}

function normalizeWranglerQueueConsumer(item, target, args) {
  const queueName = normalizeQueueName(
    item.queue || item.queue_name || item.name || item.consumer_queue || "",
  );
  const binding = normalizeString(item.binding || item.binding_name || "");
  const consumer = normalizeString(
    item.service || item.worker || item.script_name || target.name || "",
  );

  if (!queueName && !binding) return null;

  return normalizeQueuePlan(
    {
      name: queueName,
      binding,
      target_name: target.name,
      consumers: [
        {
          service: consumer,
          script_name: consumer,
          environment: args.environment,
          settings: item.settings || {},
        },
      ],
    },
    args,
    "cloudflare-targets",
  );
}

function extractTargetQueuePlans(targetsData, args) {
  if (!targetsData) return [];

  const targets = Array.isArray(targetsData.targets) ? targetsData.targets : [];
  const plans = [];

  for (const target of targets) {
    const targetName = normalizeString(target.name);

    if (
      args.include_targets.length &&
      !args.include_targets.includes(targetName)
    )
      continue;
    if (args.exclude_targets.includes(targetName)) continue;

    const rawConfig = target.raw_config || target.config || {};

    const producerCandidates = [
      ...(Array.isArray(target.queue_producers) ? target.queue_producers : []),
      ...(Array.isArray(target.resources?.queue_producers)
        ? target.resources.queue_producers
        : []),
      ...(Array.isArray(rawConfig.queues?.producers)
        ? rawConfig.queues.producers
        : []),
      ...(Array.isArray(rawConfig.queue_producers)
        ? rawConfig.queue_producers
        : []),
    ];

    const consumerCandidates = [
      ...(Array.isArray(target.queue_consumers) ? target.queue_consumers : []),
      ...(Array.isArray(target.resources?.queue_consumers)
        ? target.resources.queue_consumers
        : []),
      ...(Array.isArray(rawConfig.queues?.consumers)
        ? rawConfig.queues.consumers
        : []),
      ...(Array.isArray(rawConfig.queue_consumers)
        ? rawConfig.queue_consumers
        : []),
    ];

    for (const producer of producerCandidates) {
      const plan = normalizeWranglerQueueProducer(producer, target, args);
      if (plan) plans.push(plan);
    }

    for (const consumer of consumerCandidates) {
      const plan = normalizeWranglerQueueConsumer(consumer, target, args);
      if (plan) plans.push(plan);
    }
  }

  return plans;
}

function createDirectPlan(args) {
  if (!args.queue_id && !args.queue_name && !args.binding) return null;

  return normalizeQueuePlan(
    {
      queue_id: args.queue_id,
      name: args.queue_name,
      binding: args.binding,
      enabled: true,
    },
    args,
    "direct",
  );
}

function queueMatchesFilters(plan, args) {
  const queueKeys = [plan.queue_id, plan.queue_name].filter(Boolean);

  if (!plan.enabled) return false;

  if (args.include_queues.length) {
    const matched = queueKeys.some((key) => args.include_queues.includes(key));
    if (!matched) return false;
  }

  if (queueKeys.some((key) => args.exclude_queues.includes(key))) {
    return false;
  }

  if (
    args.include_bindings.length &&
    !args.include_bindings.includes(plan.binding)
  ) {
    return false;
  }

  if (args.exclude_bindings.includes(plan.binding)) {
    return false;
  }

  if (
    args.include_targets.length &&
    plan.target_name &&
    !args.include_targets.includes(plan.target_name)
  ) {
    return false;
  }

  if (args.exclude_targets.includes(plan.target_name)) {
    return false;
  }

  return true;
}

function mergeQueuePlans(existing, next) {
  return {
    ...existing,
    ...next,
    queue_id: next.queue_id || existing.queue_id,
    queue_name: next.queue_name || existing.queue_name,
    binding: next.binding || existing.binding,
    target_name: next.target_name || existing.target_name,
    producers: dedupeByKey(
      [...(existing.producers || []), ...(next.producers || [])],
      (item) => {
        return `${item.binding}:${item.target_name}`;
      },
    ),
    consumers: dedupeByKey(
      [...(existing.consumers || []), ...(next.consumers || [])],
      (item) => {
        return `${item.service}:${item.script_name}:${item.environment}`;
      },
    ),
    create_missing: existing.create_missing || next.create_missing,
    update_existing: existing.update_existing || next.update_existing,
    delete_missing: existing.delete_missing || next.delete_missing,
    sync_consumers: existing.sync_consumers || next.sync_consumers,
  };
}

function dedupeByKey(items, keyFn) {
  const seen = new Map();

  for (const item of items) {
    const key = keyFn(item);

    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

function dedupeQueuePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = plan.queue_id || plan.queue_name || plan.binding;

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    seen.set(key, mergeQueuePlans(seen.get(key), plan));
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.environment.localeCompare(right.environment) ||
      (left.queue_name || left.binding || left.queue_id).localeCompare(
        right.queue_name || right.binding || right.queue_id,
      )
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const targetsData = readJsonFile(
    args.cloudflare_targets_file,
    repoRoot,
    null,
  );
  const directPlan = createDirectPlan(args);

  const plans = [
    ...extractConfigPlans(config, args),
    ...extractTargetQueuePlans(targetsData, args),
    ...(directPlan ? [directPlan] : []),
  ];

  const selected = dedupeQueuePlans(plans)
    .filter((plan) => queueMatchesFilters(plan, args))
    .slice(0, args.max_queues > 0 ? args.max_queues : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    cloudflare_targets_file: toRelativePath(
      resolvePath(args.cloudflare_targets_file, repoRoot),
      repoRoot,
    ),
    cloudflare_targets_available: Boolean(targetsData),
    queues: selected,
    discovered_queues: plans.length,
  };
}

function validateCredentials(args) {
  const errors = [];
  const warnings = [];

  if (!args.require_credentials || args.dry_run) {
    return {
      ok: true,
      errors,
      warnings,
    };
  }

  if (!args.api_token) {
    errors.push("Missing CLOUDFLARE_API_TOKEN.");
  }

  if (args.require_account_id && !args.account_id) {
    errors.push("Missing CLOUDFLARE_ACCOUNT_ID.");
  } else if (!args.account_id) {
    warnings.push("CLOUDFLARE_ACCOUNT_ID is not set.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateQueuePlan(queuePlan) {
  const errors = [];
  const warnings = [];

  if (!queuePlan.queue_name && !queuePlan.queue_id) {
    errors.push("Missing queue name or queue ID.");
  }

  if (queuePlan.queue_name && !/^[A-Za-z0-9_-]+$/.test(queuePlan.queue_name)) {
    errors.push(
      "Queue name may only contain letters, numbers, underscores, and hyphens.",
    );
  }

  if (!queuePlan.binding) {
    warnings.push(
      "Queue binding is not set. This is fine for queue creation but less useful for Worker config evidence.",
    );
  }

  if (queuePlan.sync_consumers && queuePlan.consumers.length) {
    warnings.push(
      "Consumer sync is recorded as planned metadata; direct consumer mutation depends on Cloudflare API support.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloudflareRequest(args, method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CLOUDFLARE_API_BASE}${apiPath}`);
    const payload = body === null ? null : JSON.stringify(body);

    const request = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${args.api_token}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const parsed = safeJsonParse(text, null);

          if (response.statusCode >= 200 && response.statusCode < 300) {
            if (!parsed) {
              resolve({
                success: true,
                result: text,
                raw: text,
              });
              return;
            }

            if (parsed.success === false) {
              reject(
                new Error(
                  `Cloudflare API error: ${
                    (parsed.errors || [])
                      .map((item) => item.message || JSON.stringify(item))
                      .join("; ") || response.statusCode
                  }`,
                ),
              );
              return;
            }

            resolve(parsed);
            return;
          }

          reject(
            new Error(
              `Cloudflare API ${method} ${apiPath} failed with ${response.statusCode}: ${redactOutput(
                text,
              ).slice(0, 2000)}`,
            ),
          );
        });
      },
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

async function withRetry(fn, args, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= args.retry_count; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= args.retry_count) break;

      const waitMs = 500 * 2 ** attempt;
      logger.warn(
        `${label} failed. Retrying in ${waitMs}ms. ${logger.formatError(err)}`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function accountQueuesPath(args, suffix = "") {
  return `/accounts/${encodeURIComponent(args.account_id)}/queues${suffix}`;
}

async function listQueues(args) {
  const queues = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", "100");

    const response = await withRetry(
      () =>
        cloudflareRequest(
          args,
          "GET",
          accountQueuesPath(args, `?${params.toString()}`),
        ),
      args,
      `List Cloudflare Queues page ${page}`,
    );

    const result = Array.isArray(response.result) ? response.result : [];
    queues.push(...result);

    const info = response.result_info || {};
    const totalPages = Number(info.total_pages || 1);

    if (page >= totalPages || !result.length) break;

    page += 1;
  }

  return queues.map((queue) => ({
    id: normalizeString(queue.id),
    queue_id: normalizeString(queue.id),
    queue_name: normalizeString(queue.queue_name || queue.name),
    name: normalizeString(queue.queue_name || queue.name),
    created_on: normalizeString(queue.created_on),
    modified_on: normalizeString(queue.modified_on),
    raw: queue,
  }));
}

async function createQueue(args, queuePlan) {
  const body = {
    queue_name: queuePlan.queue_name,
  };

  if (queuePlan.delivery_delay > 0) {
    body.delivery_delay = queuePlan.delivery_delay;
  }

  if (queuePlan.message_retention_period > 0) {
    body.message_retention_period = queuePlan.message_retention_period;
  }

  const response = await withRetry(
    () => cloudflareRequest(args, "POST", accountQueuesPath(args), body),
    args,
    `Create Cloudflare Queue ${queuePlan.queue_name}`,
  );

  const result = response.result || {};

  return {
    id: normalizeString(result.id),
    queue_id: normalizeString(result.id),
    queue_name: normalizeString(
      result.queue_name || result.name || queuePlan.queue_name,
    ),
    raw: result,
  };
}

async function updateQueue(args, queuePlan, remoteQueue) {
  const body = {};

  if (queuePlan.delivery_delay > 0) {
    body.delivery_delay = queuePlan.delivery_delay;
  }

  if (queuePlan.message_retention_period > 0) {
    body.message_retention_period = queuePlan.message_retention_period;
  }

  if (!Object.keys(body).length) {
    return {
      changed: false,
      raw: remoteQueue.raw || remoteQueue,
    };
  }

  const queueId = remoteQueue.queue_id || remoteQueue.id || queuePlan.queue_id;
  const response = await withRetry(
    () =>
      cloudflareRequest(
        args,
        "PATCH",
        accountQueuesPath(args, `/${encodeURIComponent(queueId)}`),
        body,
      ),
    args,
    `Update Cloudflare Queue ${queuePlan.queue_name || queueId}`,
  );

  return {
    changed: true,
    raw: response.result || {},
  };
}

async function deleteQueue(args, remoteQueue) {
  const queueId = remoteQueue.queue_id || remoteQueue.id;

  await withRetry(
    () =>
      cloudflareRequest(
        args,
        "DELETE",
        accountQueuesPath(args, `/${encodeURIComponent(queueId)}`),
      ),
    args,
    `Delete Cloudflare Queue ${remoteQueue.queue_name || queueId}`,
  );

  return {
    queue_id: queueId,
    queue_name: remoteQueue.queue_name || remoteQueue.name || "",
  };
}

function findRemoteQueue(remoteQueues, queuePlan) {
  return remoteQueues.find((queue) => {
    if (queuePlan.queue_id && queue.queue_id === queuePlan.queue_id)
      return true;
    if (queuePlan.queue_name && queue.queue_name === queuePlan.queue_name)
      return true;
    return false;
  });
}

function createRemoteDeletePlan(remoteQueues, desiredPlans, args) {
  if (!args.delete_missing) return [];

  const desiredNames = new Set(
    desiredPlans.map((plan) => plan.queue_name).filter(Boolean),
  );
  const desiredIds = new Set(
    desiredPlans.map((plan) => plan.queue_id).filter(Boolean),
  );

  return remoteQueues.filter((queue) => {
    if (desiredIds.has(queue.queue_id)) return false;
    if (desiredNames.has(queue.queue_name)) return false;

    if (args.include_queues.length) {
      return (
        args.include_queues.includes(queue.queue_name) ||
        args.include_queues.includes(queue.queue_id)
      );
    }

    if (
      args.exclude_queues.includes(queue.queue_name) ||
      args.exclude_queues.includes(queue.queue_id)
    ) {
      return false;
    }

    return false;
  });
}

async function syncQueue(queuePlan, context, args) {
  const startedAt = new Date();
  const validation = validateQueuePlan(queuePlan);
  const remoteQueue = findRemoteQueue(context.remote_queues, queuePlan);

  const result = {
    id: queuePlan.id,
    source_type: queuePlan.source_type,
    target_name: queuePlan.target_name,
    environment: queuePlan.environment,
    queue_id: queuePlan.queue_id || remoteQueue?.queue_id || "",
    queue_name: queuePlan.queue_name || remoteQueue?.queue_name || "",
    binding: queuePlan.binding,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    exists_remote: Boolean(remoteQueue),
    action: "none",
    producers: queuePlan.producers,
    consumers: queuePlan.consumers,
    validation,
    errors: [],
    warnings: validation.warnings,
    remote: remoteQueue || null,
    created: null,
    updated: null,
    consumer_sync: {
      requested: queuePlan.sync_consumers,
      planned: queuePlan.sync_consumers && queuePlan.consumers.length > 0,
      applied: false,
      consumers: queuePlan.consumers,
      notes: [],
    },
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    if (remoteQueue) {
      if (queuePlan.update_existing) {
        result.action = "update";

        if (args.dry_run) {
          result.status = "planned";
          result.success = true;
          return result;
        }

        result.updated = await updateQueue(args, queuePlan, remoteQueue);
        result.status = "updated";
        result.success = true;
        return result;
      }

      result.action = "noop";
      result.status = "exists";
      result.success = true;

      if (queuePlan.sync_consumers && queuePlan.consumers.length) {
        result.consumer_sync.notes.push(
          "Consumer sync was requested, but this script records consumer intent only.",
        );
      }

      return result;
    }

    if (!queuePlan.create_missing) {
      result.action = "missing";
      result.status = "missing";
      result.errors.push(
        "Queue does not exist and create_missing is disabled.",
      );
      return result;
    }

    result.action = "create";

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }

    result.created = await createQueue(args, queuePlan);
    result.queue_id = result.created.queue_id || result.queue_id;
    result.queue_name = result.created.queue_name || result.queue_name;
    result.status = "created";
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

async function executeSync(plans, args) {
  const credentials = validateCredentials(args);
  const results = [];
  const delete_results = [];
  let stoppedEarly = false;

  if (!credentials.ok) {
    return {
      credentials,
      remote_queues: [],
      delete_plan: [],
      results,
      delete_results,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
    };
  }

  const remoteQueues = args.dry_run ? [] : await listQueues(args);

  const deletePlan = createRemoteDeletePlan(remoteQueues, plans.queues, args);

  for (const queuePlan of plans.queues) {
    logger.info(
      `${args.dry_run ? "Planning" : "Syncing"} Cloudflare Queue ${
        queuePlan.queue_name ||
        queuePlan.binding ||
        queuePlan.queue_id ||
        queuePlan.id
      }.`,
    );

    const result = await syncQueue(
      queuePlan,
      {
        remote_queues: remoteQueues,
      },
      args,
    );

    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed queue sync.");
      break;
    }
  }

  if (!stoppedEarly && deletePlan.length) {
    for (const remoteQueue of deletePlan) {
      const startedAt = new Date();
      const deleteResult = {
        queue_id: remoteQueue.queue_id,
        queue_name: remoteQueue.queue_name,
        status: args.dry_run ? "planned" : "pending",
        success: args.dry_run,
        dry_run: args.dry_run,
        started_at: startedAt.toISOString(),
        ended_at: "",
        duration_ms: 0,
        errors: [],
      };

      try {
        if (!args.dry_run) {
          await deleteQueue(args, remoteQueue);
          deleteResult.status = "deleted";
          deleteResult.success = true;
        }
      } catch (err) {
        deleteResult.status = "failed";
        deleteResult.success = false;
        deleteResult.errors.push(logger.formatError(err));
      } finally {
        const endedAt = new Date();
        deleteResult.ended_at = endedAt.toISOString();
        deleteResult.duration_ms = endedAt.getTime() - startedAt.getTime();
      }

      delete_results.push(deleteResult);

      if (!deleteResult.success && !args.continue_on_error) {
        stoppedEarly = true;
        break;
      }
    }
  }

  return {
    credentials,
    remote_queues: remoteQueues,
    delete_plan: deletePlan,
    results,
    delete_results,
    stopped_early: stoppedEarly,
    blocked: false,
    block_reason: "",
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

function summarizeResults(results, deleteResults) {
  const created = results.filter(
    (result) => result.status === "created",
  ).length;
  const updated = results.filter(
    (result) => result.status === "updated",
  ).length;
  const exists = results.filter((result) => result.status === "exists").length;
  const planned = results.filter(
    (result) => result.status === "planned",
  ).length;
  const missing = results.filter(
    (result) => result.status === "missing",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  const invalid = results.filter(
    (result) => result.status === "invalid",
  ).length;
  const deleted = deleteResults.filter(
    (result) => result.status === "deleted",
  ).length;
  const deleteFailed = deleteResults.filter(
    (result) => result.status === "failed",
  ).length;
  const deletePlanned = deleteResults.filter(
    (result) => result.status === "planned",
  ).length;
  const durationMs =
    results.reduce((sum, result) => sum + Number(result.duration_ms || 0), 0) +
    deleteResults.reduce(
      (sum, result) => sum + Number(result.duration_ms || 0),
      0,
    );

  return {
    queues: results.length,
    created,
    updated,
    exists,
    planned,
    missing,
    failed,
    invalid,
    delete_planned: deletePlanned,
    deleted,
    delete_failed: deleteFailed,
    producers: results.reduce(
      (sum, result) => sum + result.producers.length,
      0,
    ),
    consumers: results.reduce(
      (sum, result) => sum + result.consumers.length,
      0,
    ),
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: failed === 0 && invalid === 0 && missing === 0 && deleteFailed === 0,
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        created: 0,
        updated: 0,
        exists: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        missing: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "created") groups[group].created += 1;
    if (result.status === "updated") groups[group].updated += 1;
    if (result.status === "exists") groups[group].exists += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    if (result.status === "missing") groups[group].missing += 1;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results, execution.delete_results);
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0 || totals.delete_failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : totals.missing > 0
          ? "missing"
          : execution.results.length === 0 &&
              execution.delete_results.length === 0
            ? "empty"
            : args.dry_run
              ? "planned"
              : "synced";

  return {
    schema_version: 1,
    type: "cloudflare-queues-sync",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      cloudflare_targets_file: plans.cloudflare_targets_file,
      cloudflare_targets_available: plans.cloudflare_targets_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      environment: args.environment,
      create_missing: args.create_missing,
      update_existing: args.update_existing,
      delete_missing: args.delete_missing,
      sync_consumers: args.sync_consumers,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      allow_empty_plan: args.allow_empty_plan,
      max_queues: args.max_queues,
      dry_run: args.dry_run,
    },
    credentials: {
      ok: execution.credentials.ok,
      api_token_present: Boolean(args.api_token),
      account_id_present: Boolean(args.account_id),
      warnings: execution.credentials.warnings,
      errors: execution.credentials.errors,
    },
    discovery: {
      discovered_queues: plans.discovered_queues,
      selected_queues: plans.queues.length,
      remote_queues: execution.remote_queues.length,
      delete_plan: execution.delete_plan.length,
    },
    selected_queues: plans.queues.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      target_name: plan.target_name,
      environment: plan.environment,
      queue_id: plan.queue_id,
      queue_name: plan.queue_name,
      binding: plan.binding,
      delivery_delay: plan.delivery_delay,
      message_retention_period: plan.message_retention_period,
      producers: plan.producers,
      consumers: plan.consumers,
      create_missing: plan.create_missing,
      update_existing: plan.update_existing,
      delete_missing: plan.delete_missing,
      sync_consumers: plan.sync_consumers,
    })),
    totals,
    groups: {
      by_environment: groupResults(execution.results, "environment"),
      by_status: groupResults(execution.results, "status"),
      by_source_type: groupResults(execution.results, "source_type"),
    },
    remote_queues: execution.remote_queues.map((queue) => ({
      queue_id: queue.queue_id,
      queue_name: queue.queue_name,
      created_on: queue.created_on,
      modified_on: queue.modified_on,
    })),
    delete_plan: execution.delete_plan.map((queue) => ({
      queue_id: queue.queue_id,
      queue_name: queue.queue_name,
    })),
    results: execution.results,
    delete_results: execution.delete_results,
    failures: [
      ...execution.results.filter((result) => !result.success),
      ...execution.delete_results.filter((result) => !result.success),
    ],
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
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
  const lines = [
    `# 📬 ${PROJECT_NAME} Cloudflare Queues Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 🔐 Credentials",
    "",
    `- Credential check: \`${report.credentials.ok ? "passed" : "failed"}\``,
    `- API token present: \`${report.credentials.api_token_present ? "true" : "false"}\``,
    `- Account ID present: \`${report.credentials.account_id_present ? "true" : "false"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected queues: \`${report.discovery.selected_queues}\``,
    `- Remote queues: \`${report.discovery.remote_queues}\``,
    `- Created: \`${report.totals.created}\``,
    `- Updated: \`${report.totals.updated}\``,
    `- Already exists: \`${report.totals.exists}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Missing: \`${report.totals.missing}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Delete planned: \`${report.totals.delete_planned}\``,
    `- Deleted: \`${report.totals.deleted}\``,
    `- Delete failed: \`${report.totals.delete_failed}\``,
    `- Producers: \`${report.totals.producers}\``,
    `- Consumers: \`${report.totals.consumers}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Queues");
  lines.push("");

  if (!report.selected_queues.length) {
    lines.push("No Cloudflare Queues were selected.");
  } else {
    lines.push("| Queue | Binding | Source | Target | Producers | Consumers |");
    lines.push("|---|---|---|---|---:|---:|");

    for (const queue of report.selected_queues) {
      lines.push(
        `| \`${queue.queue_name || queue.queue_id || "unknown"}\` | \`${queue.binding || "none"}\` | \`${queue.source_type}\` | \`${queue.target_name || "none"}\` | \`${queue.producers.length}\` | \`${queue.consumers.length}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Queue Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No queue sync results were produced.");
  } else {
    lines.push("| Status | Action | Queue | Binding | Remote | Duration |");
    lines.push("|---|---|---|---|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.action}\` | \`${result.queue_name || result.queue_id || "unknown"}\` | \`${result.binding || "none"}\` | \`${result.exists_remote ? "true" : "false"}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.delete_results.length) {
    lines.push("");
    lines.push("## 🗑️ Delete Results");
    lines.push("");
    lines.push("| Status | Queue | Duration |");
    lines.push("|---|---|---:|");

    for (const result of report.delete_results) {
      lines.push(
        `| \`${result.status}\` | \`${result.queue_name || result.queue_id || "unknown"}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Queue | Binding | Status | Errors |");
    lines.push("|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.queue_name || failure.queue_id || "unknown"}\` | \`${failure.binding || "none"}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = [
    ...report.credentials.warnings,
    ...report.results.flatMap((result) =>
      result.warnings.map((warning) => ({
        queue:
          result.queue_name || result.binding || result.queue_id || "unknown",
        warning,
      })),
    ),
  ];

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings) {
      if (typeof warning === "string") {
        lines.push(`- ${warning}`);
      } else {
        lines.push(`- \`${warning.queue}\`: ${warning.warning}`);
      }
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Cloudflare targets file: \`${report.config.cloudflare_targets_file}\``,
  );
  lines.push(
    `- Cloudflare targets available: \`${report.config.cloudflare_targets_available ? "true" : "false"}\``,
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

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("cloudflare_queues_sync_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_queues_sync_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_queues_sync_status", report.status);
  setGitHubOutput(
    "cloudflare_queues_sync_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_queues_sync_environment",
    report.config.environment,
  );
  setGitHubOutput(
    "cloudflare_queues_sync_selected",
    String(report.discovery.selected_queues),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_remote",
    String(report.discovery.remote_queues),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_created",
    String(report.totals.created),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_updated",
    String(report.totals.updated),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_exists",
    String(report.totals.exists),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_planned",
    String(report.totals.planned),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_missing",
    String(report.totals.missing),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_deleted",
    String(report.totals.deleted),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_delete_failed",
    String(report.totals.delete_failed),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_queue_names",
    report.selected_queues
      .map((item) => item.queue_name || item.binding || item.queue_id)
      .join(","),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_queue_names_json",
    JSON.stringify(
      report.selected_queues.map(
        (item) => item.queue_name || item.binding || item.queue_id,
      ),
    ),
  );
  setGitHubOutput(
    "cloudflare_queues_sync_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare Queues sync.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.queues.length === 0) {
    logger.error("No Cloudflare Queues were selected.");
    process.exitCode = 1;
  }

  if (
    !args.allow_empty_plan &&
    plans.queues.length === 0 &&
    !args.fail_if_empty
  ) {
    logger.warn(
      "No Cloudflare Queues were selected. Use --allow-empty-plan to silence this warning.",
    );
  }

  const execution =
    process.exitCode === 1
      ? {
          credentials: validateCredentials(args),
          remote_queues: [],
          delete_plan: [],
          results: [],
          delete_results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
        }
      : await executeSync(plans, args);

  const report = createReport(args, repoRoot, plans, execution);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

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

  if (args.fail_if_empty && report.discovery.selected_queues === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Cloudflare Queues sync blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Cloudflare Queues sync completed with ${report.totals.failed} failed, ${report.totals.invalid} invalid, ${report.totals.missing} missing, and ${report.totals.delete_failed} delete failure(s).`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
