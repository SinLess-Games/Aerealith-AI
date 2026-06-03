#!/usr/bin/env node
// .github/scripts/cloudflare/sync-r2.js
// =============================================================================
// Aerealith AI — Cloudflare R2 Synchronizer
// -----------------------------------------------------------------------------
// Purpose:
//   Synchronize Cloudflare R2 bucket definitions and optional object contents
//   from local JSON, JSONC, YAML, files, directories, or discovered Cloudflare
//   target metadata.
//
// Input:
//   - .github/cloudflare/r2-sync.json
//   - .github/cloudflare/r2-sync.jsonc
//   - .github/cloudflare/r2-sync.yaml
//   - .github/cloudflare/r2-sync.yml
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/sync-r2.json
//   - artifacts/cloudflare/sync-r2.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the Cloudflare REST API for bucket discovery/create/delete.
//   - Uses Wrangler for object list/put/delete operations.
//   - Requires CLOUDFLARE_API_TOKEN for real sync operations.
//   - Requires CLOUDFLARE_ACCOUNT_ID by default.
//   - Bucket deletion and object deletion are opt-in through --delete-missing.
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
    info: (message) => console.log(`[cloudflare-r2] ${message}`),
    warn: (message) => console.warn(`[cloudflare-r2] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-r2] ERROR: ${message}`),
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
  ".github/cloudflare/r2-sync.json",
  ".github/cloudflare/r2-sync.jsonc",
  ".github/cloudflare/r2-sync.yaml",
  ".github/cloudflare/r2-sync.yml",
  "cloudflare/r2-sync.json",
  "cloudflare/r2-sync.jsonc",
  "cloudflare/r2-sync.yaml",
  "cloudflare/r2-sync.yml",
];

const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/sync-r2.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/sync-r2.md";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ENVIRONMENT = "production";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  "node_modules/",
  ".nx/",
  ".turbo/",
  ".cache/",
  ".pnpm-store/",
  ".wrangler/",
  ".next/cache/",
  "dist/",
  "build/",
  "coverage/",
  "reports/",
  "artifacts/",
  "tmp/",
  "temp/",
  ".DS_Store",
  "Thumbs.db",
];

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

    config_file: process.env.CLOUDFLARE_R2_SYNC_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_R2_SYNC_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,

    output_file:
      process.env.CLOUDFLARE_R2_SYNC_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_R2_SYNC_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environment:
      process.env.CLOUDFLARE_R2_SYNC_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,

    account_id: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    api_token: process.env.CLOUDFLARE_API_TOKEN || "",

    bucket_id:
      process.env.CLOUDFLARE_R2_BUCKET_ID ||
      process.env.CLOUDFLARE_R2_SYNC_BUCKET_ID ||
      "",
    bucket_name:
      process.env.CLOUDFLARE_R2_BUCKET_NAME ||
      process.env.CLOUDFLARE_R2_SYNC_BUCKET_NAME ||
      "",
    binding:
      process.env.CLOUDFLARE_R2_BINDING ||
      process.env.CLOUDFLARE_R2_SYNC_BINDING ||
      "",

    source:
      process.env.CLOUDFLARE_R2_SYNC_SOURCE ||
      process.env.CLOUDFLARE_R2_SOURCE ||
      "",
    source_key:
      process.env.CLOUDFLARE_R2_SYNC_SOURCE_KEY ||
      process.env.CLOUDFLARE_R2_SOURCE_KEY ||
      "",
    prefix: process.env.CLOUDFLARE_R2_SYNC_PREFIX || "",

    include_buckets: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_INCLUDE_BUCKETS,
    ),
    exclude_buckets: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_BUCKETS,
    ),
    include_bindings: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_INCLUDE_BINDINGS,
    ),
    exclude_bindings: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_BINDINGS,
    ),
    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_TARGETS,
    ),

    exclude: normalizeStringList(process.env.CLOUDFLARE_R2_SYNC_EXCLUDE),

    create_missing: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_CREATE_MISSING,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_UPDATE_EXISTING,
      false,
    ),
    sync_objects: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_OBJECTS,
      true,
    ),
    compare_objects: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_COMPARE_OBJECTS,
      true,
    ),
    delete_missing: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_DELETE_MISSING,
      false,
    ),

    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_REQUIRE_CREDENTIALS,
      true,
    ),
    allow_empty_source: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_ALLOW_EMPTY_SOURCE,
      true,
    ),
    allow_empty_plan: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_ALLOW_EMPTY_PLAN,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_CONTINUE_ON_ERROR,
      true,
    ),

    max_buckets: normalizeInteger(
      process.env.CLOUDFLARE_R2_SYNC_MAX_BUCKETS,
      0,
    ),
    max_objects: normalizeInteger(
      process.env.CLOUDFLARE_R2_SYNC_MAX_OBJECTS,
      0,
    ),
    retry_count: normalizeInteger(
      process.env.CLOUDFLARE_R2_SYNC_RETRY_COUNT,
      2,
    ),
    timeout_minutes: normalizeInteger(
      process.env.CLOUDFLARE_R2_SYNC_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.CLOUDFLARE_R2_SYNC_MAX_BUFFER_MB,
      64,
    ),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager: process.env.CLOUDFLARE_R2_SYNC_PACKAGE_MANAGER || "auto",

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_R2_SYNC_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_R2_SYNC_STEP_SUMMARY,
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

    if (arg === "--bucket-id") {
      args.bucket_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--bucket" || arg === "--bucket-name") {
      args.bucket_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--binding") {
      args.binding = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source") {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-key") {
      args.source_key = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--prefix") {
      args.prefix = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-bucket" || arg === "--include-buckets") {
      args.include_buckets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-bucket" || arg === "--exclude-buckets") {
      args.exclude_buckets.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--exclude") {
      args.exclude.push(argv[index + 1]);
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

    if (arg === "--sync-objects") {
      args.sync_objects = true;
      continue;
    }

    if (arg === "--no-sync-objects") {
      args.sync_objects = false;
      continue;
    }

    if (arg === "--compare-objects") {
      args.compare_objects = true;
      continue;
    }

    if (arg === "--no-compare-objects") {
      args.compare_objects = false;
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

    if (arg === "--allow-empty-source") {
      args.allow_empty_source = true;
      continue;
    }

    if (arg === "--no-allow-empty-source") {
      args.allow_empty_source = false;
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

    if (arg === "--max-buckets") {
      args.max_buckets = normalizeInteger(argv[index + 1], args.max_buckets);
      index += 1;
      continue;
    }

    if (arg === "--max-objects") {
      args.max_objects = normalizeInteger(argv[index + 1], args.max_objects);
      index += 1;
      continue;
    }

    if (arg === "--retry-count") {
      args.retry_count = normalizeInteger(argv[index + 1], args.retry_count);
      index += 1;
      continue;
    }

    if (arg === "--timeout-minutes") {
      args.timeout_minutes = normalizeInteger(
        argv[index + 1],
        args.timeout_minutes,
      );
      index += 1;
      continue;
    }

    if (arg === "--wrangler-command") {
      args.wrangler_command = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
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
  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.include_buckets = [...new Set(args.include_buckets)];
  args.exclude_buckets = [...new Set(args.exclude_buckets)];
  args.include_bindings = [...new Set(args.include_bindings)];
  args.exclude_bindings = [...new Set(args.exclude_bindings)];
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.package_manager = normalizeString(
    args.package_manager,
    "auto",
  ).toLowerCase();
  args.max_buckets = Math.max(0, args.max_buckets);
  args.max_objects = Math.max(0, args.max_objects);
  args.retry_count = Math.max(0, args.retry_count);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare R2 Synchronizer

Usage:
  node .github/scripts/cloudflare/sync-r2.js [options]

Examples:
  node .github/scripts/cloudflare/sync-r2.js --config .github/cloudflare/r2-sync.json --dry-run
  node .github/scripts/cloudflare/sync-r2.js --bucket aerealith-assets --binding AEREALITH_ASSETS_BUCKET
  node .github/scripts/cloudflare/sync-r2.js --bucket aerealith-assets --source public/assets --prefix assets/
  node .github/scripts/cloudflare/sync-r2.js --delete-missing --include-bucket aerealith-assets

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        R2 sync config file.
      --targets <file>                       cloudflare-targets.json detector file.
      --environment <name>                   Environment name. Default: production.
      --account-id <id>                      Cloudflare account ID.
      --bucket-id <id>                       Direct bucket ID.
      --bucket <name>                        Direct bucket name.
      --binding <name>                       Direct R2 binding name.
      --source <file|dir>                    Source object file or directory.
      --source-key <key>                     Object key for a single source file.
      --prefix <prefix>                      Prefix applied to synced object keys.
      --include-bucket <list>                Include bucket names or IDs.
      --exclude-bucket <list>                Exclude bucket names or IDs.
      --include-binding <list>               Include R2 binding names.
      --exclude-binding <list>               Exclude R2 binding names.
      --include-target <list>                Include Cloudflare target names.
      --exclude-target <list>                Exclude Cloudflare target names.
      --exclude <pattern>                    Exclude source path pattern.
      --create-missing                       Create missing buckets. Default.
      --no-create-missing                    Do not create missing buckets.
      --update-existing                      Record existing bucket update intent.
      --no-update-existing                   Do not update existing buckets. Default.
      --sync-objects                         Upload local source objects. Default.
      --no-sync-objects                      Only synchronize bucket definitions.
      --compare-objects                      Skip same-size remote objects when possible. Default.
      --no-compare-objects                   Upload every discovered local object.
      --delete-missing                       Delete remote objects under prefix missing from source.
      --no-delete-missing                    Do not delete missing objects. Default.
      --require-account-id                   Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id                Do not require account ID.
      --require-credentials                  Require API token. Default.
      --no-require-credentials               Do not require credentials.
      --allow-empty-source                   Allow empty object source. Default.
      --no-allow-empty-source                Treat empty object source as invalid.
      --allow-empty-plan                     Allow an empty bucket plan.
      --fail-if-empty                        Exit non-zero if no bucket plans are selected.
      --fail-on-error                        Exit non-zero on sync failure. Default.
      --no-fail-on-error                     Do not fail when sync has errors.
      --continue-on-error                    Continue after a bucket failure. Default.
      --no-continue-on-error                 Stop after first bucket failure.
      --max-buckets <number>                 Maximum buckets to sync.
      --max-objects <number>                 Maximum objects per bucket.
      --retry-count <number>                 Cloudflare API retry count.
      --timeout-minutes <number>             Wrangler command timeout.
      --wrangler-command <command>           Custom Wrangler command prefix.
      --package-manager <auto|pnpm|npm|yarn|bun|npx>
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not mutate R2.
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

function isDirectory(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
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

function parseSimpleR2Yaml(text) {
  const config = {};
  const buckets = [];
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

      if (section === "buckets" || section === "r2_buckets") {
        config.buckets = buckets;
      }

      current = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (
      (section === "buckets" || section === "r2_buckets") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      buckets.push(current);

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
    return parseSimpleR2Yaml(text);
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
    normalizeString(value, "r2-sync")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "r2-sync"
  );
}

function normalizeBucketName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
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

function normalizeBucketPlan(item, args, source = "config") {
  const bucketId = normalizeString(
    resolveConfigEnvironmentValue(item, args, "bucket_id", "bucketId", "id"),
  );
  const bucketName = normalizeBucketName(
    resolveConfigEnvironmentValue(
      item,
      args,
      "bucket_name",
      "bucketName",
      "name",
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

  return {
    id: safeId(
      `${source}-${args.environment}-${bucketName || binding || bucketId || "r2"}`,
    ),
    source_type: source,
    target_name: normalizeString(item.target_name || item.target || ""),
    environment: args.environment,
    bucket_id: bucketId,
    bucket_name: bucketName,
    binding,
    source: normalizeString(
      resolveConfigEnvironmentValue(item, args, "source", "directory", "file"),
    ),
    source_key: normalizeString(
      resolveConfigEnvironmentValue(item, args, "source_key", "sourceKey"),
    ),
    prefix: normalizeString(
      resolveConfigEnvironmentValue(item, args, "prefix"),
    ),
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
    sync_objects: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "sync_objects", "syncObjects"),
      args.sync_objects,
    ),
    compare_objects: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "compare_objects",
        "compareObjects",
      ),
      args.compare_objects,
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
    public_access: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "public_access",
        "publicAccess",
      ),
      false,
    ),
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function extractConfigPlans(config, args) {
  if (!config) return [];

  const buckets = [
    ...(Array.isArray(config.buckets) ? config.buckets : []),
    ...(Array.isArray(config.r2_buckets) ? config.r2_buckets : []),
    ...(Array.isArray(config.r2Buckets) ? config.r2Buckets : []),
  ];

  if (config.bucket && typeof config.bucket === "object") {
    buckets.push(config.bucket);
  }

  if (
    !buckets.length &&
    (config.bucket_id ||
      config.bucketId ||
      config.bucket_name ||
      config.name ||
      config.binding)
  ) {
    buckets.push(config);
  }

  return buckets.map((item) => normalizeBucketPlan(item, args, "config"));
}

function extractTargetBucketPlans(targetsData, args) {
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

    const bucketCandidates = [
      ...(Array.isArray(target.r2_buckets) ? target.r2_buckets : []),
      ...(Array.isArray(target.r2Buckets) ? target.r2Buckets : []),
      ...(Array.isArray(target.resources?.r2_buckets)
        ? target.resources.r2_buckets
        : []),
      ...(Array.isArray(rawConfig.r2_buckets) ? rawConfig.r2_buckets : []),
    ];

    for (const bucket of bucketCandidates) {
      const plan = normalizeBucketPlan(
        {
          ...bucket,
          target_name: targetName,
          source: args.source,
          source_key: args.source_key,
          prefix: args.prefix,
        },
        args,
        "cloudflare-targets",
      );

      plans.push(plan);
    }
  }

  return plans;
}

function createDirectPlan(args) {
  if (!args.bucket_id && !args.bucket_name && !args.binding && !args.source)
    return null;

  return normalizeBucketPlan(
    {
      bucket_id: args.bucket_id,
      bucket_name: args.bucket_name,
      name: args.bucket_name,
      binding: args.binding,
      source: args.source,
      source_key: args.source_key,
      prefix: args.prefix,
      enabled: true,
    },
    args,
    "direct",
  );
}

function bucketMatchesFilters(plan, args) {
  const bucketKeys = [plan.bucket_id, plan.bucket_name].filter(Boolean);

  if (!plan.enabled) return false;

  if (args.include_buckets.length) {
    const matched = bucketKeys.some((key) =>
      args.include_buckets.includes(key),
    );
    if (!matched) return false;
  }

  if (bucketKeys.some((key) => args.exclude_buckets.includes(key))) {
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

function mergeBucketPlans(existing, next) {
  return {
    ...existing,
    ...next,
    bucket_id: next.bucket_id || existing.bucket_id,
    bucket_name: next.bucket_name || existing.bucket_name,
    binding: next.binding || existing.binding,
    target_name: next.target_name || existing.target_name,
    source: next.source || existing.source,
    source_key: next.source_key || existing.source_key,
    prefix: next.prefix || existing.prefix,
    create_missing: existing.create_missing || next.create_missing,
    update_existing: existing.update_existing || next.update_existing,
    sync_objects: existing.sync_objects || next.sync_objects,
    compare_objects: existing.compare_objects || next.compare_objects,
    delete_missing: existing.delete_missing || next.delete_missing,
  };
}

function dedupeBucketPlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = plan.bucket_id || plan.bucket_name || plan.binding;

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    seen.set(key, mergeBucketPlans(seen.get(key), plan));
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.environment.localeCompare(right.environment) ||
      (left.bucket_name || left.binding || left.bucket_id).localeCompare(
        right.bucket_name || right.binding || right.bucket_id,
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
    ...extractTargetBucketPlans(targetsData, args),
    ...(directPlan ? [directPlan] : []),
  ];

  const selected = dedupeBucketPlans(plans)
    .filter((plan) => bucketMatchesFilters(plan, args))
    .slice(0, args.max_buckets > 0 ? args.max_buckets : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    cloudflare_targets_file: toRelativePath(
      resolvePath(args.cloudflare_targets_file, repoRoot),
      repoRoot,
    ),
    cloudflare_targets_available: Boolean(targetsData),
    buckets: selected,
    discovered_buckets: plans.length,
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

function matchesPattern(relativePath, pattern) {
  const normalizedPath = toPosixPath(relativePath);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith("/")) {
    return normalizedPath.startsWith(normalizedPattern);
  }

  if (hasGlob(normalizedPattern)) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.includes(normalizedPattern)
  );
}

function shouldExcludePath(relativePath, args) {
  return args.exclude.some((pattern) => matchesPattern(relativePath, pattern));
}

function walkFiles(targetPath, repoRoot, args, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(path.join(absolutePath, entry.name), repoRoot, args, files);
  }

  return files;
}

function applyPrefix(key, prefix) {
  const normalizedKey = String(key || "").replace(/^\/+/, "");
  const normalizedPrefix = String(prefix || "");

  if (!normalizedPrefix) return normalizedKey;
  if (normalizedKey.startsWith(normalizedPrefix)) return normalizedKey;

  return `${normalizedPrefix}${normalizedKey}`;
}

function objectKeyFromFile(filePath, sourceRoot, repoRoot, bucketPlan) {
  if (bucketPlan.source_key) return bucketPlan.source_key;

  if (sourceRoot && isDirectory(resolvePath(sourceRoot, repoRoot))) {
    return toPosixPath(
      path.relative(resolvePath(sourceRoot, repoRoot), filePath),
    );
  }

  return path.basename(filePath);
}

function detectContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".xml": "application/xml; charset=utf-8",
    ".yaml": "application/yaml; charset=utf-8",
    ".yml": "application/yaml; charset=utf-8",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function loadSourceObjects(bucketPlan, repoRoot, args) {
  const source = normalizeString(bucketPlan.source);

  if (!bucketPlan.sync_objects || !source) return [];

  const absoluteSource = resolvePath(source, repoRoot);
  let files = [];

  if (isDirectory(absoluteSource)) {
    files = walkFiles(source, repoRoot, args);
  } else if (isFile(absoluteSource)) {
    files = [absoluteSource];
  }

  const objects = files.map((filePath) => {
    const key = applyPrefix(
      objectKeyFromFile(filePath, source, repoRoot, bucketPlan),
      bucketPlan.prefix,
    );
    const stat = fs.statSync(filePath);

    return {
      key,
      file: toRelativePath(filePath, repoRoot),
      absolute_file: filePath,
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      content_type: detectContentType(filePath),
    };
  });

  const deduped = [
    ...new Map(objects.map((object) => [object.key, object])).values(),
  ].sort((left, right) => left.key.localeCompare(right.key));

  return args.max_objects > 0 ? deduped.slice(0, args.max_objects) : deduped;
}

function validateBucketPlan(bucketPlan, sourceObjects, args) {
  const errors = [];
  const warnings = [];

  if (!bucketPlan.bucket_name && !bucketPlan.bucket_id) {
    errors.push("Missing R2 bucket name or bucket ID.");
  }

  if (
    bucketPlan.bucket_name &&
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketPlan.bucket_name)
  ) {
    errors.push(
      "Bucket name must be 3-63 characters and use lowercase letters, numbers, dots, or hyphens.",
    );
  }

  if (!bucketPlan.binding) {
    warnings.push(
      "R2 binding is not set. This is fine for bucket creation but less useful for Worker config evidence.",
    );
  }

  if (
    bucketPlan.sync_objects &&
    bucketPlan.source &&
    !fs.existsSync(resolvePath(bucketPlan.source, findRepoRoot()))
  ) {
    errors.push(`Source path does not exist: ${bucketPlan.source}`);
  }

  if (
    bucketPlan.sync_objects &&
    bucketPlan.source &&
    !sourceObjects.length &&
    !args.allow_empty_source
  ) {
    errors.push("R2 source produced no objects.");
  }

  if (bucketPlan.delete_missing && !bucketPlan.prefix) {
    warnings.push(
      "delete_missing is enabled without a prefix; this may delete every remote object not present in the source.",
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

function accountBucketsPath(args, suffix = "") {
  return `/accounts/${encodeURIComponent(args.account_id)}/r2/buckets${suffix}`;
}

async function listBuckets(args) {
  const response = await withRetry(
    () => cloudflareRequest(args, "GET", accountBucketsPath(args)),
    args,
    "List Cloudflare R2 buckets",
  );

  const result = response.result || {};
  const buckets = Array.isArray(result)
    ? result
    : Array.isArray(result.buckets)
      ? result.buckets
      : [];

  return buckets.map((bucket) => ({
    id: normalizeString(bucket.id),
    bucket_id: normalizeString(bucket.id),
    bucket_name: normalizeString(bucket.name || bucket.bucket_name),
    name: normalizeString(bucket.name || bucket.bucket_name),
    created_on: normalizeString(
      bucket.created || bucket.creation_date || bucket.created_on,
    ),
    raw: bucket,
  }));
}

async function createBucket(args, bucketPlan) {
  const body = {
    name: bucketPlan.bucket_name,
  };

  const response = await withRetry(
    () => cloudflareRequest(args, "POST", accountBucketsPath(args), body),
    args,
    `Create R2 bucket ${bucketPlan.bucket_name}`,
  );

  const result = response.result || {};

  return {
    id: normalizeString(result.id),
    bucket_id: normalizeString(result.id),
    bucket_name: normalizeString(
      result.name || result.bucket_name || bucketPlan.bucket_name,
    ),
    raw: result,
  };
}

async function deleteBucket(args, remoteBucket) {
  const bucketName = remoteBucket.bucket_name || remoteBucket.name;

  await withRetry(
    () =>
      cloudflareRequest(
        args,
        "DELETE",
        accountBucketsPath(args, `/${encodeURIComponent(bucketName)}`),
      ),
    args,
    `Delete R2 bucket ${bucketName}`,
  );

  return {
    bucket_id: remoteBucket.bucket_id || remoteBucket.id,
    bucket_name: bucketName,
  };
}

function findRemoteBucket(remoteBuckets, bucketPlan) {
  return remoteBuckets.find((bucket) => {
    if (bucketPlan.bucket_id && bucket.bucket_id === bucketPlan.bucket_id)
      return true;
    if (bucketPlan.bucket_name && bucket.bucket_name === bucketPlan.bucket_name)
      return true;
    return false;
  });
}

function createRemoteDeletePlan(remoteBuckets, desiredPlans, args) {
  if (!args.delete_missing) return [];

  const desiredNames = new Set(
    desiredPlans.map((plan) => plan.bucket_name).filter(Boolean),
  );
  const desiredIds = new Set(
    desiredPlans.map((plan) => plan.bucket_id).filter(Boolean),
  );

  return remoteBuckets.filter((bucket) => {
    if (desiredIds.has(bucket.bucket_id)) return false;
    if (desiredNames.has(bucket.bucket_name)) return false;

    if (args.include_buckets.length) {
      return (
        args.include_buckets.includes(bucket.bucket_name) ||
        args.include_buckets.includes(bucket.bucket_id)
      );
    }

    return false;
  });
}

function splitCommandLine(value) {
  const input = normalizeString(value);
  if (!input) return [];

  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = "";
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current) parts.push(current);

  return parts;
}

function inferPackageManager(repoRoot, requested) {
  if (requested && requested !== "auto") return requested;
  if (isFile(resolvePath("pnpm-lock.yaml", repoRoot))) return "pnpm";
  if (isFile(resolvePath("yarn.lock", repoRoot))) return "yarn";
  if (isFile(resolvePath("bun.lockb", repoRoot))) return "bun";
  if (isFile(resolvePath("package-lock.json", repoRoot))) return "npm";
  return "pnpm";
}

function createWranglerPrefix(args, repoRoot) {
  if (args.wrangler_command) {
    const parsed = splitCommandLine(args.wrangler_command);

    if (parsed.length) {
      return {
        command: parsed[0],
        args: parsed.slice(1),
        package_manager: "custom",
      };
    }
  }

  const packageManager = inferPackageManager(repoRoot, args.package_manager);

  if (packageManager === "pnpm") {
    return {
      command: "pnpm",
      args: ["exec", "wrangler"],
      package_manager: "pnpm",
    };
  }

  if (packageManager === "yarn") {
    return {
      command: "yarn",
      args: ["wrangler"],
      package_manager: "yarn",
    };
  }

  if (packageManager === "bun") {
    return {
      command: "bunx",
      args: ["wrangler"],
      package_manager: "bun",
    };
  }

  if (packageManager === "npm") {
    return {
      command: "npx",
      args: ["wrangler"],
      package_manager: "npm",
    };
  }

  return {
    command: "npx",
    args: ["wrangler"],
    package_manager: "npx",
  };
}

function commandDisplay(command, commandArgs) {
  return [command, ...commandArgs]
    .map((part) => {
      const value = String(part);

      if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) return value;

      return JSON.stringify(value);
    })
    .join(" ");
}

function runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs) {
  const startedAt = new Date();
  const command = wranglerPrefix.command;
  const commandArgs = [...wranglerPrefix.args, ...wranglerArgs];
  const display = commandDisplay(command, commandArgs);
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run) {
    return {
      success: true,
      status: "planned",
      command,
      args: commandArgs,
      display,
      exit_code: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const result = childProcess.spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: process.env.CI || "true",
      CLOUDFLARE_API_TOKEN:
        args.api_token || process.env.CLOUDFLARE_API_TOKEN || "",
      CLOUDFLARE_ACCOUNT_ID:
        args.account_id || process.env.CLOUDFLARE_ACCOUNT_ID || "",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: args.max_buffer_mb * 1024 * 1024,
    timeout,
  });

  const endedAt = new Date();
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;

  return {
    success,
    status: success ? "passed" : "failed",
    command,
    args: commandArgs,
    display,
    exit_code: result.status,
    stdout: redactOutput(result.stdout || ""),
    stderr: redactOutput(result.stderr || ""),
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function parseRemoteObjectList(stdout) {
  const parsed = safeJsonParse(stdout, null);

  if (!parsed) return [];

  const objects = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.objects)
      ? parsed.objects
      : Array.isArray(parsed.result)
        ? parsed.result
        : [];

  return objects
    .map((object) => ({
      key: normalizeString(object.key || object.name),
      size_bytes: Number(object.size || object.size_bytes || 0),
      etag: normalizeString(object.etag || object.httpEtag),
      uploaded_at: normalizeString(
        object.uploaded || object.last_modified || object.modified,
      ),
      raw: object,
    }))
    .filter((object) => object.key);
}

function listRemoteObjects(args, repoRoot, wranglerPrefix, bucketPlan) {
  const wranglerArgs = [
    "r2",
    "object",
    "list",
    bucketPlan.bucket_name,
    "--json",
  ];

  if (bucketPlan.prefix) {
    wranglerArgs.push("--prefix", bucketPlan.prefix);
  }

  const result = runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs);

  if (!result.success) {
    throw new Error(
      result.error ||
        result.stderr ||
        `Failed to list R2 objects for ${bucketPlan.bucket_name}.`,
    );
  }

  return {
    command: result,
    objects: parseRemoteObjectList(result.stdout),
  };
}

function uploadObject(args, repoRoot, wranglerPrefix, bucketPlan, object) {
  const wranglerArgs = [
    "r2",
    "object",
    "put",
    `${bucketPlan.bucket_name}/${object.key}`,
    "--file",
    object.absolute_file,
  ];

  if (object.content_type) {
    wranglerArgs.push("--content-type", object.content_type);
  }

  return runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs);
}

function deleteObject(args, repoRoot, wranglerPrefix, bucketPlan, key) {
  const wranglerArgs = [
    "r2",
    "object",
    "delete",
    `${bucketPlan.bucket_name}/${key}`,
  ];

  return runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs);
}

function planObjectChanges(bucketPlan, sourceObjects, remoteObjects, args) {
  const remoteByKey = new Map(
    remoteObjects.map((object) => [object.key, object]),
  );
  const sourceByKey = new Map(
    sourceObjects.map((object) => [object.key, object]),
  );

  const uploads = sourceObjects.filter((object) => {
    if (!bucketPlan.compare_objects || !args.compare_objects) return true;

    const remote = remoteByKey.get(object.key);

    if (!remote) return true;

    return Number(remote.size_bytes || 0) !== Number(object.size_bytes || 0);
  });

  const skippedUnchanged = sourceObjects.filter((object) => {
    if (!bucketPlan.compare_objects || !args.compare_objects) return false;

    const remote = remoteByKey.get(object.key);

    return (
      remote &&
      Number(remote.size_bytes || 0) === Number(object.size_bytes || 0)
    );
  });

  const deletes = bucketPlan.delete_missing
    ? remoteObjects
        .map((object) => object.key)
        .filter((key) => !sourceByKey.has(key))
        .filter(
          (key) => !bucketPlan.prefix || key.startsWith(bucketPlan.prefix),
        )
    : [];

  return {
    uploads,
    skipped_unchanged: skippedUnchanged,
    deletes,
  };
}

async function syncBucket(bucketPlan, context, args, repoRoot) {
  const startedAt = new Date();
  const wranglerPrefix = context.wrangler;
  const sourceObjects = loadSourceObjects(bucketPlan, repoRoot, args);
  const validation = validateBucketPlan(bucketPlan, sourceObjects, args);
  const remoteBucket = findRemoteBucket(context.remote_buckets, bucketPlan);

  const result = {
    id: bucketPlan.id,
    source_type: bucketPlan.source_type,
    target_name: bucketPlan.target_name,
    environment: bucketPlan.environment,
    bucket_id: bucketPlan.bucket_id || remoteBucket?.bucket_id || "",
    bucket_name: bucketPlan.bucket_name || remoteBucket?.bucket_name || "",
    binding: bucketPlan.binding,
    source: bucketPlan.source,
    prefix: bucketPlan.prefix,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    exists_remote: Boolean(remoteBucket),
    action: "none",
    create_missing: bucketPlan.create_missing,
    update_existing: bucketPlan.update_existing,
    sync_objects: bucketPlan.sync_objects,
    compare_objects: bucketPlan.compare_objects,
    delete_missing: bucketPlan.delete_missing,
    validation,
    remote: remoteBucket || null,
    created: null,
    updated: null,
    object_list_command: null,
    object_upload_results: [],
    object_delete_results: [],
    source_objects: sourceObjects.map((object) => ({
      key: object.key,
      file: object.file,
      size_bytes: object.size_bytes,
      content_type: object.content_type,
    })),
    remote_objects: [],
    planned_upload_keys: [],
    planned_delete_keys: [],
    errors: [],
    warnings: validation.warnings,
    totals: {
      source_objects: sourceObjects.length,
      remote_objects: 0,
      planned_uploads: 0,
      skipped_unchanged: 0,
      uploaded: 0,
      upload_failed: 0,
      planned_deletes: 0,
      deleted: 0,
      delete_failed: 0,
    },
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    let activeRemoteBucket = remoteBucket;

    if (!remoteBucket) {
      if (!bucketPlan.create_missing) {
        result.action = "missing";
        result.status = "missing";
        result.errors.push(
          "Bucket does not exist and create_missing is disabled.",
        );
        return result;
      }

      result.action = "create";

      if (!args.dry_run) {
        result.created = await createBucket(args, bucketPlan);
        result.bucket_id = result.created.bucket_id || result.bucket_id;
        result.bucket_name = result.created.bucket_name || result.bucket_name;
        activeRemoteBucket = result.created;
      }
    } else if (bucketPlan.update_existing) {
      result.action = "update";
      result.updated = {
        changed: false,
        note: "R2 bucket update intent recorded. Bucket metadata updates are not mutated by this script.",
      };
    } else {
      result.action = "noop";
    }

    if (!bucketPlan.sync_objects || !bucketPlan.source) {
      result.status = args.dry_run
        ? "planned"
        : remoteBucket
          ? "exists"
          : "created";
      result.success = true;
      return result;
    }

    let remoteObjects = [];

    if (!args.dry_run && activeRemoteBucket) {
      const remoteListing = listRemoteObjects(
        args,
        repoRoot,
        wranglerPrefix,
        bucketPlan,
      );
      result.object_list_command = {
        display: remoteListing.command.display,
        status: remoteListing.command.status,
        exit_code: remoteListing.command.exit_code,
        duration_ms: remoteListing.command.duration_ms,
      };
      remoteObjects = remoteListing.objects;
    }

    result.remote_objects = remoteObjects;
    result.totals.remote_objects = remoteObjects.length;

    const objectPlan = planObjectChanges(
      bucketPlan,
      sourceObjects,
      remoteObjects,
      args,
    );

    result.planned_upload_keys = objectPlan.uploads.map((object) => object.key);
    result.planned_delete_keys = objectPlan.deletes;
    result.totals.planned_uploads = objectPlan.uploads.length;
    result.totals.skipped_unchanged = objectPlan.skipped_unchanged.length;
    result.totals.planned_deletes = objectPlan.deletes.length;

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }

    for (const object of objectPlan.uploads) {
      const upload = uploadObject(
        args,
        repoRoot,
        wranglerPrefix,
        bucketPlan,
        object,
      );

      result.object_upload_results.push({
        key: object.key,
        file: object.file,
        status: upload.status,
        success: upload.success,
        exit_code: upload.exit_code,
        duration_ms: upload.duration_ms,
        error: upload.error || upload.stderr,
      });

      if (upload.success) {
        result.totals.uploaded += 1;
      } else {
        result.totals.upload_failed += 1;
        result.errors.push(
          `Failed to upload ${object.key}: ${upload.error || upload.stderr || "unknown error"}`,
        );

        if (!args.continue_on_error) break;
      }
    }

    if (result.totals.upload_failed === 0) {
      for (const key of objectPlan.deletes) {
        const deletion = deleteObject(
          args,
          repoRoot,
          wranglerPrefix,
          bucketPlan,
          key,
        );

        result.object_delete_results.push({
          key,
          status: deletion.status,
          success: deletion.success,
          exit_code: deletion.exit_code,
          duration_ms: deletion.duration_ms,
          error: deletion.error || deletion.stderr,
        });

        if (deletion.success) {
          result.totals.deleted += 1;
        } else {
          result.totals.delete_failed += 1;
          result.errors.push(
            `Failed to delete ${key}: ${deletion.error || deletion.stderr || "unknown error"}`,
          );

          if (!args.continue_on_error) break;
        }
      }
    }

    if (result.totals.upload_failed > 0 || result.totals.delete_failed > 0) {
      result.status = "failed";
      result.success = false;
      return result;
    }

    result.status = remoteBucket ? "synced" : "created";
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

async function executeSync(plans, args, repoRoot) {
  const credentials = validateCredentials(args);
  const results = [];
  const delete_results = [];
  let stoppedEarly = false;

  if (!credentials.ok) {
    return {
      credentials,
      remote_buckets: [],
      delete_plan: [],
      results,
      delete_results,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
      wrangler: createWranglerPrefix(args, repoRoot),
    };
  }

  const wrangler = createWranglerPrefix(args, repoRoot);
  const remoteBuckets = args.dry_run ? [] : await listBuckets(args);

  const deletePlan = createRemoteDeletePlan(remoteBuckets, plans.buckets, args);

  for (const bucketPlan of plans.buckets) {
    logger.info(
      `${args.dry_run ? "Planning" : "Syncing"} R2 bucket ${
        bucketPlan.bucket_name ||
        bucketPlan.binding ||
        bucketPlan.bucket_id ||
        bucketPlan.id
      }.`,
    );

    const result = await syncBucket(
      bucketPlan,
      {
        remote_buckets: remoteBuckets,
        wrangler,
      },
      args,
      repoRoot,
    );

    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed R2 bucket sync.");
      break;
    }
  }

  if (!stoppedEarly && deletePlan.length) {
    for (const remoteBucket of deletePlan) {
      const startedAt = new Date();
      const deleteResult = {
        bucket_id: remoteBucket.bucket_id,
        bucket_name: remoteBucket.bucket_name,
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
          await deleteBucket(args, remoteBucket);
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
    remote_buckets: remoteBuckets,
    delete_plan: deletePlan,
    results,
    delete_results,
    stopped_early: stoppedEarly,
    blocked: false,
    block_reason: "",
    wrangler,
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
  const synced = results.filter((result) => result.status === "synced").length;
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
    buckets: results.length,
    created,
    synced,
    exists,
    planned,
    missing,
    failed,
    invalid,
    delete_planned: deletePlanned,
    deleted,
    delete_failed: deleteFailed,
    source_objects: results.reduce(
      (sum, result) => sum + result.totals.source_objects,
      0,
    ),
    remote_objects: results.reduce(
      (sum, result) => sum + result.totals.remote_objects,
      0,
    ),
    planned_uploads: results.reduce(
      (sum, result) => sum + result.totals.planned_uploads,
      0,
    ),
    skipped_unchanged: results.reduce(
      (sum, result) => sum + result.totals.skipped_unchanged,
      0,
    ),
    uploaded: results.reduce((sum, result) => sum + result.totals.uploaded, 0),
    upload_failed: results.reduce(
      (sum, result) => sum + result.totals.upload_failed,
      0,
    ),
    planned_object_deletes: results.reduce(
      (sum, result) => sum + result.totals.planned_deletes,
      0,
    ),
    object_deleted: results.reduce(
      (sum, result) => sum + result.totals.deleted,
      0,
    ),
    object_delete_failed: results.reduce(
      (sum, result) => sum + result.totals.delete_failed,
      0,
    ),
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok:
      failed === 0 &&
      invalid === 0 &&
      missing === 0 &&
      deleteFailed === 0 &&
      results.every(
        (result) =>
          result.totals.upload_failed === 0 &&
          result.totals.delete_failed === 0,
      ),
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
        synced: 0,
        exists: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        missing: 0,
        uploads: 0,
        deletes: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "created") groups[group].created += 1;
    if (result.status === "synced") groups[group].synced += 1;
    if (result.status === "exists") groups[group].exists += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    if (result.status === "missing") groups[group].missing += 1;
    groups[group].uploads += result.totals.planned_uploads;
    groups[group].deletes += result.totals.planned_deletes;
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
    : totals.failed > 0 ||
        totals.delete_failed > 0 ||
        totals.upload_failed > 0 ||
        totals.object_delete_failed > 0
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
    type: "cloudflare-r2-sync",
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
      sync_objects: args.sync_objects,
      compare_objects: args.compare_objects,
      delete_missing: args.delete_missing,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      allow_empty_source: args.allow_empty_source,
      allow_empty_plan: args.allow_empty_plan,
      max_buckets: args.max_buckets,
      max_objects: args.max_objects,
      dry_run: args.dry_run,
    },
    wrangler: {
      command: execution.wrangler.command,
      args: execution.wrangler.args,
      package_manager: execution.wrangler.package_manager,
      display: commandDisplay(
        execution.wrangler.command,
        execution.wrangler.args,
      ),
    },
    credentials: {
      ok: execution.credentials.ok,
      api_token_present: Boolean(args.api_token),
      account_id_present: Boolean(args.account_id),
      warnings: execution.credentials.warnings,
      errors: execution.credentials.errors,
    },
    discovery: {
      discovered_buckets: plans.discovered_buckets,
      selected_buckets: plans.buckets.length,
      remote_buckets: execution.remote_buckets.length,
      delete_plan: execution.delete_plan.length,
    },
    selected_buckets: plans.buckets.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      target_name: plan.target_name,
      environment: plan.environment,
      bucket_id: plan.bucket_id,
      bucket_name: plan.bucket_name,
      binding: plan.binding,
      source: plan.source,
      prefix: plan.prefix,
      create_missing: plan.create_missing,
      update_existing: plan.update_existing,
      sync_objects: plan.sync_objects,
      compare_objects: plan.compare_objects,
      delete_missing: plan.delete_missing,
      public_access: plan.public_access,
    })),
    totals,
    groups: {
      by_environment: groupResults(execution.results, "environment"),
      by_status: groupResults(execution.results, "status"),
      by_source_type: groupResults(execution.results, "source_type"),
    },
    remote_buckets: execution.remote_buckets.map((bucket) => ({
      bucket_id: bucket.bucket_id,
      bucket_name: bucket.bucket_name,
      created_on: bucket.created_on,
    })),
    delete_plan: execution.delete_plan.map((bucket) => ({
      bucket_id: bucket.bucket_id,
      bucket_name: bucket.bucket_name,
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
    `# 🪣 ${PROJECT_NAME} Cloudflare R2 Sync`,
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
    "## ⚙️ Wrangler",
    "",
    `- Package manager: \`${report.wrangler.package_manager}\``,
    `- Command: \`${report.wrangler.display}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected buckets: \`${report.discovery.selected_buckets}\``,
    `- Remote buckets: \`${report.discovery.remote_buckets}\``,
    `- Created: \`${report.totals.created}\``,
    `- Synced: \`${report.totals.synced}\``,
    `- Already exists: \`${report.totals.exists}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Missing: \`${report.totals.missing}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Bucket delete planned: \`${report.totals.delete_planned}\``,
    `- Buckets deleted: \`${report.totals.deleted}\``,
    `- Bucket delete failed: \`${report.totals.delete_failed}\``,
    `- Source objects: \`${report.totals.source_objects}\``,
    `- Remote objects scanned: \`${report.totals.remote_objects}\``,
    `- Planned uploads: \`${report.totals.planned_uploads}\``,
    `- Uploaded: \`${report.totals.uploaded}\``,
    `- Upload failed: \`${report.totals.upload_failed}\``,
    `- Skipped unchanged: \`${report.totals.skipped_unchanged}\``,
    `- Planned object deletes: \`${report.totals.planned_object_deletes}\``,
    `- Objects deleted: \`${report.totals.object_deleted}\``,
    `- Object delete failed: \`${report.totals.object_delete_failed}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Buckets");
  lines.push("");

  if (!report.selected_buckets.length) {
    lines.push("No R2 buckets were selected.");
  } else {
    lines.push(
      "| Bucket | Binding | Source | Prefix | Sync Objects | Delete Missing |",
    );
    lines.push("|---|---|---|---|---:|---:|");

    for (const bucket of report.selected_buckets) {
      lines.push(
        `| \`${bucket.bucket_name || bucket.bucket_id || "unknown"}\` | \`${bucket.binding || "none"}\` | \`${bucket.source || "none"}\` | \`${bucket.prefix || ""}\` | \`${bucket.sync_objects ? "true" : "false"}\` | \`${bucket.delete_missing ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Bucket Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No R2 bucket sync results were produced.");
  } else {
    lines.push(
      "| Status | Action | Bucket | Binding | Uploads | Deletes | Duration |",
    );
    lines.push("|---|---|---|---|---:|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.action}\` | \`${result.bucket_name || result.bucket_id || "unknown"}\` | \`${result.binding || "none"}\` | \`${result.totals.planned_uploads}\` | \`${result.totals.planned_deletes}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.delete_results.length) {
    lines.push("");
    lines.push("## 🗑️ Bucket Delete Results");
    lines.push("");
    lines.push("| Status | Bucket | Duration |");
    lines.push("|---|---|---:|");

    for (const result of report.delete_results) {
      lines.push(
        `| \`${result.status}\` | \`${result.bucket_name || result.bucket_id || "unknown"}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Bucket | Binding | Status | Errors |");
    lines.push("|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.bucket_name || failure.bucket_id || "unknown"}\` | \`${failure.binding || "none"}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = [
    ...report.credentials.warnings,
    ...report.results.flatMap((result) =>
      result.warnings.map((warning) => ({
        bucket:
          result.bucket_name || result.binding || result.bucket_id || "unknown",
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
        lines.push(`- \`${warning.bucket}\`: ${warning.warning}`);
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
  setGitHubOutput("cloudflare_r2_sync_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_r2_sync_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_r2_sync_status", report.status);
  setGitHubOutput(
    "cloudflare_r2_sync_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput("cloudflare_r2_sync_environment", report.config.environment);
  setGitHubOutput(
    "cloudflare_r2_sync_selected",
    String(report.discovery.selected_buckets),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_remote",
    String(report.discovery.remote_buckets),
  );
  setGitHubOutput("cloudflare_r2_sync_created", String(report.totals.created));
  setGitHubOutput("cloudflare_r2_sync_synced", String(report.totals.synced));
  setGitHubOutput("cloudflare_r2_sync_exists", String(report.totals.exists));
  setGitHubOutput("cloudflare_r2_sync_planned", String(report.totals.planned));
  setGitHubOutput("cloudflare_r2_sync_failed", String(report.totals.failed));
  setGitHubOutput("cloudflare_r2_sync_invalid", String(report.totals.invalid));
  setGitHubOutput("cloudflare_r2_sync_missing", String(report.totals.missing));
  setGitHubOutput(
    "cloudflare_r2_sync_bucket_deleted",
    String(report.totals.deleted),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_bucket_delete_failed",
    String(report.totals.delete_failed),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_source_objects",
    String(report.totals.source_objects),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_planned_uploads",
    String(report.totals.planned_uploads),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_uploaded",
    String(report.totals.uploaded),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_upload_failed",
    String(report.totals.upload_failed),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_object_deleted",
    String(report.totals.object_deleted),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_object_delete_failed",
    String(report.totals.object_delete_failed),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_bucket_names",
    report.selected_buckets
      .map((item) => item.bucket_name || item.binding || item.bucket_id)
      .join(","),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_bucket_names_json",
    JSON.stringify(
      report.selected_buckets.map(
        (item) => item.bucket_name || item.binding || item.bucket_id,
      ),
    ),
  );
  setGitHubOutput(
    "cloudflare_r2_sync_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare R2 sync.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.buckets.length === 0) {
    logger.error("No Cloudflare R2 buckets were selected.");
    process.exitCode = 1;
  }

  if (
    !args.allow_empty_plan &&
    plans.buckets.length === 0 &&
    !args.fail_if_empty
  ) {
    logger.warn(
      "No Cloudflare R2 buckets were selected. Use --allow-empty-plan to silence this warning.",
    );
  }

  const execution =
    process.exitCode === 1
      ? {
          credentials: validateCredentials(args),
          remote_buckets: [],
          delete_plan: [],
          results: [],
          delete_results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
          wrangler: createWranglerPrefix(args, repoRoot),
        }
      : await executeSync(plans, args, repoRoot);

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

  if (args.fail_if_empty && report.discovery.selected_buckets === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Cloudflare R2 sync blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Cloudflare R2 sync completed with ${report.totals.failed} failed, ${report.totals.invalid} invalid, ${report.totals.missing} missing, ${report.totals.upload_failed} upload failure(s), and ${report.totals.object_delete_failed} object delete failure(s).`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
