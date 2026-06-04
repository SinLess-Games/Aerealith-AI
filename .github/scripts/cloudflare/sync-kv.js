#!/usr/bin/env node
// .github/scripts/cloudflare/sync-kv.js
// =============================================================================
// Aerealith AI — Cloudflare KV Synchronizer
// -----------------------------------------------------------------------------
// Purpose:
//   Synchronize Cloudflare KV namespace key/value data from local JSON, JSONC,
//   ENV, TXT, Markdown, or directory sources into Cloudflare KV.
//
// Input:
//   - .github/cloudflare/kv-sync.json
//   - .github/cloudflare/kv-sync.jsonc
//   - .github/cloudflare/kv-sync.yaml
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/sync-kv.json
//   - artifacts/cloudflare/sync-kv.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the Cloudflare REST API directly.
//   - Requires CLOUDFLARE_API_TOKEN for real sync operations.
//   - Requires CLOUDFLARE_ACCOUNT_ID by default.
//   - Does not require per-namespace secrets when namespace IDs are provided.
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
    info: (message) => console.log(`[cloudflare-kv] ${message}`),
    warn: (message) => console.warn(`[cloudflare-kv] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-kv] ERROR: ${message}`),
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
  ".github/cloudflare/kv-sync.json",
  ".github/cloudflare/kv-sync.jsonc",
  ".github/cloudflare/kv-sync.yaml",
  ".github/cloudflare/kv-sync.yml",
  "cloudflare/kv-sync.json",
  "cloudflare/kv-sync.jsonc",
  "cloudflare/kv-sync.yaml",
  "cloudflare/kv-sync.yml",
];

const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/sync-kv.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/sync-kv.md";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_STAGE = "";

const MAX_KV_KEY_BYTES = 512;
const MAX_KV_VALUE_BYTES = 25 * 1024 * 1024;
const DEFAULT_WRITE_BATCH_SIZE = 5000;
const DEFAULT_DELETE_BATCH_SIZE = 5000;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);
const KNOWN_DEPLOYMENT_STAGES = new Set(["preview", "staging", "production"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

function requireArgValue(argv, index, arg) {
  const value = argv[index + 1];

  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for argument: ${arg}`);
  }

  return value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.CLOUDFLARE_KV_SYNC_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_KV_SYNC_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,

    output_file:
      process.env.CLOUDFLARE_KV_SYNC_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_KV_SYNC_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environment:
      process.env.CLOUDFLARE_KV_SYNC_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,

    deployment_stage:
      process.env.CLOUDFLARE_KV_SYNC_STAGE ||
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_STAGE ||
      DEFAULT_STAGE,

    deployment_alias:
      process.env.CLOUDFLARE_KV_SYNC_ALIAS ||
      process.env.CLOUDFLARE_DEPLOYMENT_ALIAS ||
      process.env.CLOUDFLARE_PREVIEW_ALIAS ||
      "",

    preview_ref:
      process.env.CLOUDFLARE_KV_SYNC_PREVIEW_REF ||
      process.env.CLOUDFLARE_PREVIEW_REF ||
      "",

    pull_request_number:
      process.env.CLOUDFLARE_KV_SYNC_PULL_REQUEST_NUMBER ||
      process.env.CLOUDFLARE_PULL_REQUEST_NUMBER ||
      "",

    cloudflare_project_name:
      process.env.CLOUDFLARE_KV_SYNC_PROJECT_NAME ||
      process.env.CLOUDFLARE_PROJECT_NAME ||
      process.env.CLOUDFLARE_PAGES_PROJECT_NAME ||
      "",

    account_id:
      process.env.CLOUDFLARE_KV_SYNC_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      "",
    api_token:
      process.env.CLOUDFLARE_KV_SYNC_API_TOKEN ||
      process.env.CLOUDFLARE_API_TOKEN ||
      "",

    namespace_id:
      process.env.CLOUDFLARE_KV_NAMESPACE_ID ||
      process.env.CLOUDFLARE_KV_SYNC_NAMESPACE_ID ||
      "",
    namespace_name:
      process.env.CLOUDFLARE_KV_NAMESPACE_NAME ||
      process.env.CLOUDFLARE_KV_SYNC_NAMESPACE_NAME ||
      "",
    binding:
      process.env.CLOUDFLARE_KV_BINDING ||
      process.env.CLOUDFLARE_KV_SYNC_BINDING ||
      "",

    source:
      process.env.CLOUDFLARE_KV_SYNC_SOURCE ||
      process.env.CLOUDFLARE_KV_SOURCE ||
      "",
    source_key:
      process.env.CLOUDFLARE_KV_SYNC_SOURCE_KEY ||
      process.env.CLOUDFLARE_KV_SOURCE_KEY ||
      "",
    prefix: process.env.CLOUDFLARE_KV_SYNC_PREFIX || "",

    include_namespaces: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_INCLUDE_NAMESPACES,
    ),
    exclude_namespaces: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_EXCLUDE_NAMESPACES,
    ),
    include_bindings: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_INCLUDE_BINDINGS,
    ),
    exclude_bindings: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_EXCLUDE_BINDINGS,
    ),
    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_KV_SYNC_EXCLUDE_TARGETS,
    ),

    exclude: normalizeStringList(process.env.CLOUDFLARE_KV_SYNC_EXCLUDE),

    delete_missing: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_DELETE_MISSING,
      false,
    ),
    compare_values: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_COMPARE_VALUES,
      false,
    ),
    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_REQUIRE_CREDENTIALS,
      true,
    ),
    allow_empty_source: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_ALLOW_EMPTY_SOURCE,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_CONTINUE_ON_ERROR,
      true,
    ),

    max_namespaces: normalizeInteger(
      process.env.CLOUDFLARE_KV_SYNC_MAX_NAMESPACES,
      0,
    ),
    max_entries: normalizeInteger(
      process.env.CLOUDFLARE_KV_SYNC_MAX_ENTRIES,
      0,
    ),
    write_batch_size: normalizeInteger(
      process.env.CLOUDFLARE_KV_SYNC_WRITE_BATCH_SIZE,
      DEFAULT_WRITE_BATCH_SIZE,
    ),
    delete_batch_size: normalizeInteger(
      process.env.CLOUDFLARE_KV_SYNC_DELETE_BATCH_SIZE,
      DEFAULT_DELETE_BATCH_SIZE,
    ),
    retry_count: normalizeInteger(
      process.env.CLOUDFLARE_KV_SYNC_RETRY_COUNT,
      2,
    ),

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_DRY_RUN ||
        process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_KV_SYNC_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_KV_SYNC_STEP_SUMMARY,
      true,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--targets" || arg === "--cloudflare-targets") {
      args.cloudflare_targets_file = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--environment" || arg === "--env") {
      args.environment = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--stage" || arg === "--deployment-stage") {
      args.deployment_stage = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--alias" || arg === "--deployment-alias") {
      args.deployment_alias = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--preview-ref") {
      args.preview_ref = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--pull-request-number" || arg === "--pr-number") {
      args.pull_request_number = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--project-name" || arg === "--cloudflare-project-name") {
      args.cloudflare_project_name = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      args.account_id = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--api-token") {
      args.api_token = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--namespace-id") {
      args.namespace_id = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--namespace" || arg === "--namespace-name") {
      args.namespace_name = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--binding") {
      args.binding = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--source") {
      args.source = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--source-key") {
      args.source_key = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--prefix") {
      args.prefix = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--include-namespace" || arg === "--include-namespaces") {
      args.include_namespaces.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude-namespace" || arg === "--exclude-namespaces") {
      args.exclude_namespaces.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--include-binding" || arg === "--include-bindings") {
      args.include_bindings.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude-binding" || arg === "--exclude-bindings") {
      args.exclude_bindings.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(
        ...normalizeStringList(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude") {
      args.exclude.push(requireArgValue(argv, index, arg));
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

    if (arg === "--compare-values") {
      args.compare_values = true;
      continue;
    }

    if (arg === "--no-compare-values") {
      args.compare_values = false;
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

    if (arg === "--max-namespaces") {
      args.max_namespaces = normalizeInteger(
        requireArgValue(argv, index, arg),
        args.max_namespaces,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-entries") {
      args.max_entries = normalizeInteger(
        requireArgValue(argv, index, arg),
        args.max_entries,
      );
      index += 1;
      continue;
    }

    if (arg === "--write-batch-size") {
      args.write_batch_size = normalizeInteger(
        requireArgValue(argv, index, arg),
        args.write_batch_size,
      );
      index += 1;
      continue;
    }

    if (arg === "--delete-batch-size") {
      args.delete_batch_size = normalizeInteger(
        requireArgValue(argv, index, arg),
        args.delete_batch_size,
      );
      index += 1;
      continue;
    }

    if (arg === "--retry-count") {
      args.retry_count = normalizeInteger(
        requireArgValue(argv, index, arg),
        args.retry_count,
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = requireArgValue(argv, index, arg);
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

  args.deployment_stage = normalizeString(
    args.deployment_stage || args.environment,
    args.environment,
  ).toLowerCase();

  if (
    KNOWN_DEPLOYMENT_STAGES.has(args.deployment_stage) &&
    (!args.environment || args.environment === DEFAULT_ENVIRONMENT)
  ) {
    args.environment = args.deployment_stage;
  }

  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.include_namespaces = [...new Set(args.include_namespaces)];
  args.exclude_namespaces = [...new Set(args.exclude_namespaces)];
  args.include_bindings = [...new Set(args.include_bindings)];
  args.exclude_bindings = [...new Set(args.exclude_bindings)];
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.max_namespaces = Math.max(0, args.max_namespaces);
  args.max_entries = Math.max(0, args.max_entries);
  args.write_batch_size = Math.max(
    1,
    Math.min(args.write_batch_size, DEFAULT_WRITE_BATCH_SIZE),
  );
  args.delete_batch_size = Math.max(
    1,
    Math.min(args.delete_batch_size, DEFAULT_DELETE_BATCH_SIZE),
  );
  args.retry_count = Math.max(0, args.retry_count);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare KV Synchronizer

Usage:
  node .github/scripts/cloudflare/sync-kv.js [options]

Examples:
  node .github/scripts/cloudflare/sync-kv.js --config .github/cloudflare/kv-sync.json --dry-run
  node .github/scripts/cloudflare/sync-kv.js --environment preview --stage preview
  node .github/scripts/cloudflare/sync-kv.js --namespace-id <id> --source .github/cloudflare/kv/public.json
  node .github/scripts/cloudflare/sync-kv.js --binding AEREALITH_PUBLIC_KV --source content/kv --prefix public/
  node .github/scripts/cloudflare/sync-kv.js --config .github/cloudflare/kv-sync.yaml --delete-missing

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        KV sync config file.
      --targets <file>                       cloudflare-targets.json detector file.
      --environment <name>                   Environment name. Default: production.
      --stage <name>                         Deployment stage, such as preview, staging, or production.
      --alias <name>                         Deployment alias, such as preview alias or branch alias.
      --preview-ref <ref>                    Preview source ref.
      --pull-request-number <number>         Pull request number for preview sync.
      --project-name <name>                  Cloudflare project name metadata.
      --account-id <id>                      Cloudflare account ID.
      --api-token <token>                    Cloudflare API token. Prefer environment secrets.
      --namespace-id <id>                    Direct KV namespace ID.
      --namespace <name>                     Direct KV namespace name.
      --binding <name>                       Direct KV binding name.
      --source <file|dir>                    Source data file or directory.
      --source-key <key>                     Key to use for a single raw source file.
      --prefix <prefix>                      Prefix applied to synced keys.
      --include-namespace <list>             Include namespace names or IDs.
      --exclude-namespace <list>             Exclude namespace names or IDs.
      --include-binding <list>               Include KV binding names.
      --exclude-binding <list>               Exclude KV binding names.
      --include-target <list>                Include Cloudflare target names.
      --exclude-target <list>                Exclude Cloudflare target names.
      --exclude <pattern>                    Exclude source path pattern.
      --delete-missing                       Delete remote keys missing from source.
      --no-delete-missing                    Do not delete missing keys. Default.
      --compare-values                       Fetch and skip unchanged values.
      --no-compare-values                    Write planned keys without value comparison. Default.
      --require-account-id                   Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id                Do not require account ID.
      --require-credentials                  Require API token. Default.
      --no-require-credentials               Do not require credentials.
      --allow-empty-source                   Allow empty source without error.
      --no-allow-empty-source                Treat empty source as invalid. Default.
      --fail-if-empty                        Exit non-zero if no namespace plans are selected.
      --fail-on-error                        Exit non-zero on sync failure. Default.
      --no-fail-on-error                     Do not fail when sync has errors.
      --continue-on-error                    Continue after a namespace failure. Default.
      --no-continue-on-error                 Stop after first namespace failure.
      --max-namespaces <number>              Maximum namespaces to sync.
      --max-entries <number>                 Maximum entries per namespace.
      --write-batch-size <number>            Bulk write batch size.
      --delete-batch-size <number>           Bulk delete batch size.
      --retry-count <number>                 Cloudflare API retry count.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not mutate KV.
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

function parseSimpleKvSyncYaml(text) {
  const config = {};
  const namespaces = [];
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

      if (section === "namespaces" || section === "kv_namespaces") {
        config.namespaces = namespaces;
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
      (section === "namespaces" || section === "kv_namespaces") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      namespaces.push(current);

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
    return parseSimpleKvSyncYaml(text);
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

function parseDotenv(text) {
  const entries = [];

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);

    if (!match) continue;

    const key = match[1];
    let value = match[2] || "";

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push({
      key,
      value,
      metadata: null,
      expiration: null,
      expiration_ttl: null,
      base64: false,
      source: "env",
    });
  }

  return entries;
}

function entryValueToString(value) {
  if (value === undefined || value === null) return "";
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

function normalizeKvEntry(key, value, source = "inline") {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "value")
  ) {
    return {
      key: String(value.key || key),
      value: entryValueToString(value.value),
      metadata: value.metadata || null,
      expiration: value.expiration || null,
      expiration_ttl: value.expiration_ttl || value.expirationTtl || null,
      base64: Boolean(value.base64),
      source,
    };
  }

  return {
    key: String(key),
    value: entryValueToString(value),
    metadata: null,
    expiration: null,
    expiration_ttl: null,
    base64: false,
    source,
  };
}

function normalizeKvEntryArrayItem(item, index, source = "array") {
  if (!item || typeof item !== "object") {
    return normalizeKvEntry(String(index), item, source);
  }

  return {
    key: String(item.key || item.name || item.id || index),
    value: entryValueToString(item.value ?? item.text ?? item.content ?? ""),
    metadata: item.metadata || null,
    expiration: item.expiration || null,
    expiration_ttl: item.expiration_ttl || item.expirationTtl || null,
    base64: Boolean(item.base64),
    source,
  };
}

function parseJsonKvEntries(data, source = "json") {
  if (Array.isArray(data)) {
    return data.map((item, index) =>
      normalizeKvEntryArrayItem(item, index, source),
    );
  }

  if (data && typeof data === "object") {
    if (Array.isArray(data.entries)) {
      return data.entries.map((item, index) =>
        normalizeKvEntryArrayItem(item, index, source),
      );
    }

    if (data.values && typeof data.values === "object") {
      return Object.entries(data.values).map(([key, value]) =>
        normalizeKvEntry(key, value, source),
      );
    }

    return Object.entries(data).map(([key, value]) =>
      normalizeKvEntry(key, value, source),
    );
  }

  return [];
}

function keyFromFile(filePath, sourceRoot, repoRoot, namespacePlan) {
  if (namespacePlan.source_key) return namespacePlan.source_key;

  const relativeToSource = sourceRoot
    ? toPosixPath(path.relative(resolvePath(sourceRoot, repoRoot), filePath))
    : path.basename(filePath);

  return relativeToSource.replace(/\\/g, "/");
}

function loadEntriesFromFile(filePath, repoRoot, namespacePlan) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);
  const extension = path.extname(absolutePath).toLowerCase();

  if (!isFile(absolutePath)) return [];

  const raw = fs.readFileSync(absolutePath);

  if (extension === ".json" || extension === ".jsonc") {
    const parsed = safeJsonParse(stripJsonc(raw.toString("utf8")), null);
    return parseJsonKvEntries(parsed, relativePath);
  }

  if (extension === ".env") {
    return parseDotenv(raw.toString("utf8")).map((entry) => ({
      ...entry,
      source: relativePath,
    }));
  }

  const key = keyFromFile(absolutePath, null, repoRoot, namespacePlan);

  return [
    {
      key,
      value: raw.toString("utf8"),
      metadata: null,
      expiration: null,
      expiration_ttl: null,
      base64: false,
      source: relativePath,
    },
  ];
}

function loadEntriesFromDirectory(sourceDir, repoRoot, namespacePlan, args) {
  const files = walkFiles(sourceDir, repoRoot, args);

  return files.map((filePath) => {
    const key = keyFromFile(filePath, sourceDir, repoRoot, namespacePlan);
    const relativePath = toRelativePath(filePath, repoRoot);

    return {
      key,
      value: fs.readFileSync(filePath, "utf8"),
      metadata: {
        source: relativePath,
      },
      expiration: null,
      expiration_ttl: null,
      base64: false,
      source: relativePath,
    };
  });
}

function applyPrefix(key, prefix) {
  const normalizedKey = String(key || "").replace(/^\/+/, "");
  const normalizedPrefix = String(prefix || "");

  if (!normalizedPrefix) return normalizedKey;
  if (normalizedKey.startsWith(normalizedPrefix)) return normalizedKey;

  return `${normalizedPrefix}${normalizedKey}`;
}

function validateEntry(entry) {
  const errors = [];
  const keyBytes = Buffer.byteLength(entry.key || "", "utf8");
  const valueBytes = Buffer.byteLength(entry.value || "", "utf8");

  if (!entry.key) {
    errors.push("KV key is empty.");
  }

  if (keyBytes > MAX_KV_KEY_BYTES) {
    errors.push(`KV key exceeds ${MAX_KV_KEY_BYTES} bytes.`);
  }

  if (valueBytes > MAX_KV_VALUE_BYTES) {
    errors.push(`KV value exceeds ${MAX_KV_VALUE_BYTES} bytes.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    key_bytes: keyBytes,
    value_bytes: valueBytes,
  };
}

function dedupeEntries(entries) {
  const seen = new Map();

  for (const entry of entries) {
    seen.set(entry.key, entry);
  }

  return [...seen.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function loadSourceEntries(namespacePlan, repoRoot, args) {
  const entries = [];

  if (Array.isArray(namespacePlan.entries)) {
    entries.push(
      ...namespacePlan.entries.map((entry, index) =>
        normalizeKvEntryArrayItem(
          entry,
          index,
          `${namespacePlan.name || namespacePlan.binding || "inline"}:entries`,
        ),
      ),
    );
  }

  const source = normalizeString(namespacePlan.source);

  if (source) {
    const absolutePath = resolvePath(source, repoRoot);

    if (isDirectory(absolutePath)) {
      entries.push(
        ...loadEntriesFromDirectory(source, repoRoot, namespacePlan, args),
      );
    } else if (isFile(absolutePath)) {
      entries.push(...loadEntriesFromFile(source, repoRoot, namespacePlan));
    }
  }

  const prefixed = entries.map((entry) => ({
    ...entry,
    key: applyPrefix(entry.key, namespacePlan.prefix),
  }));

  const deduped = dedupeEntries(prefixed);
  const limited =
    args.max_entries > 0 ? deduped.slice(0, args.max_entries) : deduped;

  return limited.map((entry) => ({
    ...entry,
    validation: validateEntry(entry),
  }));
}

function resolveConfigEnvironmentValue(item, args, ...keys) {
  const environments = item.environments || item.env || {};
  const environmentKeys = [
    args.environment,
    args.deployment_stage,
    DEFAULT_ENVIRONMENT,
  ].filter(Boolean);

  if (environments && typeof environments === "object") {
    for (const env of environmentKeys) {
      if (!environments[env]) continue;

      for (const key of keys) {
        if (environments[env][key] !== undefined) return environments[env][key];
      }
    }
  }

  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }

  return "";
}

function safeId(value) {
  return (
    normalizeString(value, "kv-sync")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "kv-sync"
  );
}

function normalizeNamespacePlan(item, args, source = "config") {
  const namespaceId = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "namespace_id",
      "namespaceId",
      "id",
    ),
  );
  const name = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "name",
      "namespace_name",
      "namespaceName",
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
      `${source}-${args.deployment_stage || args.environment}-${name || binding || namespaceId || "kv"}`,
    ),
    source_type: source,
    target_name: normalizeString(item.target_name || item.target || ""),
    environment: args.environment,
    deployment_stage: args.deployment_stage,
    deployment_alias: args.deployment_alias,
    namespace_id: namespaceId,
    namespace_name: name,
    binding,
    source: normalizeString(
      resolveConfigEnvironmentValue(item, args, "source", "file", "directory"),
    ),
    source_key: normalizeString(
      resolveConfigEnvironmentValue(item, args, "source_key", "sourceKey"),
    ),
    prefix: normalizeString(
      resolveConfigEnvironmentValue(item, args, "prefix"),
    ),
    entries: Array.isArray(item.entries) ? item.entries : [],
    delete_missing: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "delete_missing",
        "deleteMissing",
      ),
      args.delete_missing,
    ),
    compare_values: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "compare_values",
        "compareValues",
      ),
      args.compare_values,
    ),
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function extractConfigPlans(config, args) {
  if (!config) return [];

  const namespaces = [
    ...(Array.isArray(config.namespaces) ? config.namespaces : []),
    ...(Array.isArray(config.kv_namespaces) ? config.kv_namespaces : []),
    ...(Array.isArray(config.kvNamespaces) ? config.kvNamespaces : []),
  ];

  if (config.namespace && typeof config.namespace === "object") {
    namespaces.push(config.namespace);
  }

  if (
    !namespaces.length &&
    (config.namespace_id ||
      config.namespaceId ||
      config.binding ||
      config.source ||
      config.entries)
  ) {
    namespaces.push(config);
  }

  return namespaces.map((item) => normalizeNamespacePlan(item, args, "config"));
}

function extractTargetKvNamespaces(targetsData, args) {
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

    const kvCandidates = [
      ...(Array.isArray(target.kv_namespaces) ? target.kv_namespaces : []),
      ...(Array.isArray(target.kvNamespaces) ? target.kvNamespaces : []),
      ...(Array.isArray(target.resources?.kv_namespaces)
        ? target.resources.kv_namespaces
        : []),
      ...(Array.isArray(target.raw_config?.kv_namespaces)
        ? target.raw_config.kv_namespaces
        : []),
    ];

    for (const kv of kvCandidates) {
      const plan = normalizeNamespacePlan(
        {
          ...kv,
          target_name: targetName,
          source: args.source,
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
  if (
    !args.namespace_id &&
    !args.namespace_name &&
    !args.binding &&
    !args.source
  )
    return null;

  return normalizeNamespacePlan(
    {
      namespace_id: args.namespace_id,
      name: args.namespace_name,
      binding: args.binding,
      source: args.source,
      source_key: args.source_key,
      prefix: args.prefix,
      delete_missing: args.delete_missing,
      compare_values: args.compare_values,
      enabled: true,
    },
    args,
    "direct",
  );
}

function namespaceMatchesFilters(plan, args) {
  const namespaceKeys = [plan.namespace_id, plan.namespace_name].filter(
    Boolean,
  );

  if (!plan.enabled) return false;

  if (args.include_namespaces.length) {
    const matched = namespaceKeys.some((key) =>
      args.include_namespaces.includes(key),
    );
    if (!matched) return false;
  }

  if (namespaceKeys.some((key) => args.exclude_namespaces.includes(key))) {
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

function dedupeNamespacePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key =
      plan.namespace_id ||
      `${plan.environment}:${plan.deployment_stage}:${plan.namespace_name}:${plan.binding}:${plan.source}`;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...plan,
      namespace_id: plan.namespace_id || existing.namespace_id,
      namespace_name: plan.namespace_name || existing.namespace_name,
      binding: plan.binding || existing.binding,
      source: plan.source || existing.source,
      entries: [...(existing.entries || []), ...(plan.entries || [])],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.environment.localeCompare(right.environment) ||
      left.deployment_stage.localeCompare(right.deployment_stage) ||
      (left.namespace_name || left.binding || left.namespace_id).localeCompare(
        right.namespace_name || right.binding || right.namespace_id,
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
    ...extractTargetKvNamespaces(targetsData, args),
    ...(directPlan ? [directPlan] : []),
  ];

  const selected = dedupeNamespacePlans(plans)
    .filter((plan) => namespaceMatchesFilters(plan, args))
    .slice(0, args.max_namespaces > 0 ? args.max_namespaces : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    cloudflare_targets_file: toRelativePath(
      resolvePath(args.cloudflare_targets_file, repoRoot),
      repoRoot,
    ),
    cloudflare_targets_available: Boolean(targetsData),
    namespaces: selected,
    discovered_namespaces: plans.length,
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

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeKvKey(key) {
  return encodeURIComponent(key).replace(/%2F/g, "%2F");
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

function cloudflareValueRequest(args, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CLOUDFLARE_API_BASE}${apiPath}`);

    const request = https.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${args.api_token}`,
        },
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          if (response.statusCode === 404) {
            resolve({
              found: false,
              value: "",
            });
            return;
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve({
              found: true,
              value: text,
            });
            return;
          }

          reject(
            new Error(
              `Cloudflare API GET ${apiPath} failed with ${response.statusCode}: ${redactOutput(
                text,
              ).slice(0, 2000)}`,
            ),
          );
        });
      },
    );

    request.on("error", reject);
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

function kvNamespacePath(args, namespaceId, suffix = "") {
  const encodedNamespace = encodeURIComponent(namespaceId);

  return `/accounts/${encodeURIComponent(args.account_id)}/storage/kv/namespaces/${encodedNamespace}${suffix}`;
}

async function listKvKeys(args, namespaceId, prefix = "") {
  const keys = [];
  let cursor = "";

  do {
    const params = new URLSearchParams();
    params.set("limit", "1000");

    if (cursor) params.set("cursor", cursor);
    if (prefix) params.set("prefix", prefix);

    const apiPath = kvNamespacePath(
      args,
      namespaceId,
      `/keys?${params.toString()}`,
    );
    const response = await withRetry(
      () => cloudflareRequest(args, "GET", apiPath),
      args,
      `List KV keys for namespace ${namespaceId}`,
    );

    keys.push(...(Array.isArray(response.result) ? response.result : []));
    cursor = response.result_info?.cursor || "";
  } while (cursor);

  return keys.map((item) => ({
    key: item.name,
    expiration: item.expiration || null,
    metadata: item.metadata || null,
  }));
}

async function bulkWriteKv(args, namespaceId, entries) {
  if (!entries.length) return [];

  const chunks = chunkArray(entries, args.write_batch_size);
  const results = [];

  for (const [index, chunk] of chunks.entries()) {
    const body = chunk.map((entry) => {
      const item = {
        key: entry.key,
        value: entry.value,
      };

      if (entry.metadata) item.metadata = entry.metadata;
      if (entry.expiration) item.expiration = entry.expiration;
      if (entry.expiration_ttl) item.expiration_ttl = entry.expiration_ttl;
      if (entry.base64) item.base64 = true;

      return item;
    });

    const apiPath = kvNamespacePath(args, namespaceId, "/bulk");

    await withRetry(
      () => cloudflareRequest(args, "PUT", apiPath, body),
      args,
      `Bulk write KV batch ${index + 1}/${chunks.length}`,
    );

    results.push({
      batch: index + 1,
      count: chunk.length,
    });
  }

  return results;
}

async function bulkDeleteKv(args, namespaceId, keys) {
  if (!keys.length) return [];

  const chunks = chunkArray(keys, args.delete_batch_size);
  const results = [];

  for (const [index, chunk] of chunks.entries()) {
    const apiPath = kvNamespacePath(args, namespaceId, "/bulk");

    await withRetry(
      () => cloudflareRequest(args, "DELETE", apiPath, chunk),
      args,
      `Bulk delete KV batch ${index + 1}/${chunks.length}`,
    );

    results.push({
      batch: index + 1,
      count: chunk.length,
    });
  }

  return results;
}

async function filterChangedEntries(args, namespaceId, entries) {
  if (!entries.length || !args.compare_values) return entries;

  const changed = [];

  for (const entry of entries) {
    const apiPath = kvNamespacePath(
      args,
      namespaceId,
      `/values/${encodeKvKey(entry.key)}`,
    );
    const existing = await withRetry(
      () => cloudflareValueRequest(args, apiPath),
      args,
      `Read KV value ${entry.key}`,
    );

    if (!existing.found || existing.value !== entry.value) {
      changed.push(entry);
    }
  }

  return changed;
}

function validateNamespacePlan(namespacePlan, sourceEntries, args) {
  const errors = [];
  const warnings = [];
  const invalidEntries = sourceEntries.filter((entry) => !entry.validation.ok);

  if (!namespacePlan.namespace_id) {
    errors.push("Missing KV namespace ID.");
  }

  if (!namespacePlan.source && !namespacePlan.entries.length) {
    errors.push("Missing KV source file, source directory, or inline entries.");
  }

  if (!sourceEntries.length && !args.allow_empty_source) {
    errors.push("KV source produced no entries.");
  }

  if (invalidEntries.length) {
    errors.push(`${invalidEntries.length} KV entrie(s) failed validation.`);
  }

  if (namespacePlan.delete_missing && !namespacePlan.prefix) {
    warnings.push(
      "delete_missing is enabled without a prefix; this may delete every key not present in the source.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    invalid_entries: invalidEntries.map((entry) => ({
      key: entry.key,
      source: entry.source,
      errors: entry.validation.errors,
    })),
  };
}

async function syncNamespace(namespacePlan, args, repoRoot) {
  const startedAt = new Date();
  const sourceEntries = loadSourceEntries(namespacePlan, repoRoot, args);
  const validation = validateNamespacePlan(namespacePlan, sourceEntries, args);
  const validEntries = sourceEntries.filter((entry) => entry.validation.ok);

  const result = {
    id: namespacePlan.id,
    source_type: namespacePlan.source_type,
    target_name: namespacePlan.target_name,
    environment: namespacePlan.environment,
    deployment_stage: namespacePlan.deployment_stage,
    deployment_alias: namespacePlan.deployment_alias,
    namespace_id: namespacePlan.namespace_id,
    namespace_name: namespacePlan.namespace_name,
    binding: namespacePlan.binding,
    source: namespacePlan.source,
    prefix: namespacePlan.prefix,
    delete_missing: namespacePlan.delete_missing,
    compare_values: namespacePlan.compare_values,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    totals: {
      source_entries: sourceEntries.length,
      valid_entries: validEntries.length,
      invalid_entries: validation.invalid_entries.length,
      existing_keys: 0,
      planned_writes: 0,
      skipped_unchanged: 0,
      planned_deletes: 0,
      written: 0,
      deleted: 0,
    },
    write_batches: [],
    delete_batches: [],
    planned_write_keys: validEntries.map((entry) => entry.key),
    planned_delete_keys: [],
    errors: [],
    warnings: validation.warnings,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    let entriesToWrite = validEntries;

    if (namespacePlan.compare_values && !args.dry_run) {
      entriesToWrite = await filterChangedEntries(
        {
          ...args,
          compare_values: namespacePlan.compare_values,
        },
        namespacePlan.namespace_id,
        validEntries,
      );
    }

    result.totals.planned_writes = entriesToWrite.length;
    result.totals.skipped_unchanged =
      validEntries.length - entriesToWrite.length;
    result.planned_write_keys = entriesToWrite.map((entry) => entry.key);

    if (namespacePlan.delete_missing) {
      const existing = args.dry_run
        ? []
        : await listKvKeys(
            args,
            namespacePlan.namespace_id,
            namespacePlan.prefix,
          );

      const desiredKeys = new Set(validEntries.map((entry) => entry.key));
      const deleteKeys = existing
        .map((item) => item.key)
        .filter((key) => !desiredKeys.has(key))
        .filter(
          (key) =>
            !namespacePlan.prefix || key.startsWith(namespacePlan.prefix),
        );

      result.totals.existing_keys = existing.length;
      result.totals.planned_deletes = deleteKeys.length;
      result.planned_delete_keys = deleteKeys;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }

    result.write_batches = await bulkWriteKv(
      args,
      namespacePlan.namespace_id,
      entriesToWrite,
    );
    result.totals.written = entriesToWrite.length;

    if (namespacePlan.delete_missing && result.planned_delete_keys.length) {
      result.delete_batches = await bulkDeleteKv(
        args,
        namespacePlan.namespace_id,
        result.planned_delete_keys,
      );
      result.totals.deleted = result.planned_delete_keys.length;
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

async function executeSync(plans, args, repoRoot) {
  const credentials = validateCredentials(args);
  const results = [];
  let stoppedEarly = false;

  if (!credentials.ok) {
    return {
      credentials,
      results,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
    };
  }

  for (const namespacePlan of plans.namespaces) {
    logger.info(
      `${args.dry_run ? "Planning" : "Syncing"} KV namespace ${
        namespacePlan.namespace_name ||
        namespacePlan.binding ||
        namespacePlan.namespace_id ||
        namespacePlan.id
      }.`,
    );

    const result = await syncNamespace(namespacePlan, args, repoRoot);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed KV namespace sync.");
      break;
    }
  }

  return {
    credentials,
    results,
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

function summarizeResults(results) {
  const synced = results.filter((result) => result.status === "synced").length;
  const planned = results.filter(
    (result) => result.status === "planned",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  const invalid = results.filter(
    (result) => result.status === "invalid",
  ).length;
  const durationMs = results.reduce(
    (sum, result) => sum + Number(result.duration_ms || 0),
    0,
  );

  return {
    namespaces: results.length,
    synced,
    planned,
    failed,
    invalid,
    source_entries: results.reduce(
      (sum, result) => sum + result.totals.source_entries,
      0,
    ),
    valid_entries: results.reduce(
      (sum, result) => sum + result.totals.valid_entries,
      0,
    ),
    invalid_entries: results.reduce(
      (sum, result) => sum + result.totals.invalid_entries,
      0,
    ),
    planned_writes: results.reduce(
      (sum, result) => sum + result.totals.planned_writes,
      0,
    ),
    skipped_unchanged: results.reduce(
      (sum, result) => sum + result.totals.skipped_unchanged,
      0,
    ),
    planned_deletes: results.reduce(
      (sum, result) => sum + result.totals.planned_deletes,
      0,
    ),
    written: results.reduce((sum, result) => sum + result.totals.written, 0),
    deleted: results.reduce((sum, result) => sum + result.totals.deleted, 0),
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: failed === 0 && invalid === 0,
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        synced: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        writes: 0,
        deletes: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "synced") groups[group].synced += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    groups[group].writes += result.totals.planned_writes;
    groups[group].deletes += result.totals.planned_deletes;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results);
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : execution.results.length === 0
          ? "empty"
          : args.dry_run
            ? "planned"
            : "synced";

  return {
    schema_version: 1,
    type: "cloudflare-kv-sync",
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
      deployment_stage: args.deployment_stage,
      deployment_alias: args.deployment_alias,
      preview_ref: args.preview_ref,
      pull_request_number: args.pull_request_number,
      cloudflare_project_name: args.cloudflare_project_name,
      delete_missing: args.delete_missing,
      compare_values: args.compare_values,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      allow_empty_source: args.allow_empty_source,
      max_namespaces: args.max_namespaces,
      max_entries: args.max_entries,
      write_batch_size: args.write_batch_size,
      delete_batch_size: args.delete_batch_size,
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
      discovered_namespaces: plans.discovered_namespaces,
      selected_namespaces: plans.namespaces.length,
    },
    selected_namespaces: plans.namespaces.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      target_name: plan.target_name,
      environment: plan.environment,
      deployment_stage: plan.deployment_stage,
      deployment_alias: plan.deployment_alias,
      namespace_id: plan.namespace_id,
      namespace_name: plan.namespace_name,
      binding: plan.binding,
      source: plan.source,
      prefix: plan.prefix,
      delete_missing: plan.delete_missing,
      compare_values: plan.compare_values,
    })),
    totals,
    groups: {
      by_environment: groupResults(execution.results, "environment"),
      by_stage: groupResults(execution.results, "deployment_stage"),
      by_status: groupResults(execution.results, "status"),
      by_source_type: groupResults(execution.results, "source_type"),
    },
    results: execution.results,
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🗄️ ${PROJECT_NAME} Cloudflare KV Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Stage: \`${report.config.deployment_stage || "not set"}\``,
    `- Alias: \`${report.config.deployment_alias || "not set"}\``,
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
    `- Namespaces: \`${report.totals.namespaces}\``,
    `- Synced: \`${report.totals.synced}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Source entries: \`${report.totals.source_entries}\``,
    `- Valid entries: \`${report.totals.valid_entries}\``,
    `- Invalid entries: \`${report.totals.invalid_entries}\``,
    `- Planned writes: \`${report.totals.planned_writes}\``,
    `- Written: \`${report.totals.written}\``,
    `- Planned deletes: \`${report.totals.planned_deletes}\``,
    `- Deleted: \`${report.totals.deleted}\``,
    `- Skipped unchanged: \`${report.totals.skipped_unchanged}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Namespaces");
  lines.push("");

  if (!report.selected_namespaces.length) {
    lines.push("No KV namespaces were selected.");
  } else {
    lines.push(
      "| Namespace | Binding | Environment | Stage | Source | Prefix | Delete Missing |",
    );
    lines.push("|---|---|---|---|---|---|---:|");

    for (const namespace of report.selected_namespaces) {
      lines.push(
        `| \`${namespace.namespace_name || namespace.namespace_id || "unknown"}\` | \`${namespace.binding || "none"}\` | \`${namespace.environment || "unknown"}\` | \`${namespace.deployment_stage || "none"}\` | \`${namespace.source || "inline"}\` | \`${namespace.prefix || ""}\` | \`${namespace.delete_missing ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Namespace Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No namespace sync results were produced.");
  } else {
    lines.push(
      "| Status | Namespace | Binding | Stage | Entries | Writes | Deletes | Duration |",
    );
    lines.push("|---|---|---|---|---:|---:|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.namespace_name || result.namespace_id || "unknown"}\` | \`${result.binding || "none"}\` | \`${result.deployment_stage || "none"}\` | \`${result.totals.source_entries}\` | \`${result.totals.planned_writes}\` | \`${result.totals.planned_deletes}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Namespace | Binding | Status | Errors |");
    lines.push("|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.namespace_name || failure.namespace_id || "unknown"}\` | \`${failure.binding || "none"}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = [
    ...report.credentials.warnings,
    ...report.results.flatMap((result) =>
      result.warnings.map((warning) => ({
        namespace:
          result.namespace_name ||
          result.binding ||
          result.namespace_id ||
          "unknown",
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
        lines.push(`- \`${warning.namespace}\`: ${warning.warning}`);
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
  setGitHubOutput("cloudflare_kv_sync_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_kv_sync_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_kv_sync_status", report.status);
  setGitHubOutput(
    "cloudflare_kv_sync_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput("cloudflare_kv_sync_environment", report.config.environment);
  setGitHubOutput("cloudflare_kv_sync_stage", report.config.deployment_stage);
  setGitHubOutput("cloudflare_kv_sync_alias", report.config.deployment_alias);
  setGitHubOutput(
    "cloudflare_kv_sync_namespaces",
    String(report.totals.namespaces),
  );
  setGitHubOutput("cloudflare_kv_sync_synced", String(report.totals.synced));
  setGitHubOutput("cloudflare_kv_sync_planned", String(report.totals.planned));
  setGitHubOutput("cloudflare_kv_sync_failed", String(report.totals.failed));
  setGitHubOutput("cloudflare_kv_sync_invalid", String(report.totals.invalid));
  setGitHubOutput(
    "cloudflare_kv_sync_entries",
    String(report.totals.source_entries),
  );
  setGitHubOutput(
    "cloudflare_kv_sync_planned_writes",
    String(report.totals.planned_writes),
  );
  setGitHubOutput("cloudflare_kv_sync_written", String(report.totals.written));
  setGitHubOutput(
    "cloudflare_kv_sync_planned_deletes",
    String(report.totals.planned_deletes),
  );
  setGitHubOutput("cloudflare_kv_sync_deleted", String(report.totals.deleted));
  setGitHubOutput(
    "cloudflare_kv_sync_namespace_names",
    report.selected_namespaces
      .map((item) => item.namespace_name || item.binding || item.namespace_id)
      .join(","),
  );
  setGitHubOutput(
    "cloudflare_kv_sync_namespace_names_json",
    JSON.stringify(
      report.selected_namespaces.map(
        (item) => item.namespace_name || item.binding || item.namespace_id,
      ),
    ),
  );
  setGitHubOutput(
    "cloudflare_kv_sync_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare KV sync.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.namespaces.length === 0) {
    logger.error("No Cloudflare KV namespaces were selected.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          credentials: validateCredentials(args),
          results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
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
    console.log(json.trim());
  }

  if (args.fail_if_empty && report.totals.namespaces === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Cloudflare KV sync blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Cloudflare KV sync completed with ${report.totals.failed} failed and ${report.totals.invalid} invalid namespace(s).`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
