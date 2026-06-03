#!/usr/bin/env node
// .github/scripts/cache/summarize-caches.js
// =============================================================================
// Aerealith AI — Cache Summary Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize cache automation artifacts from cache key generation, GitHub
//   Actions cache inventory, and cache cleanup planning/execution.
//
// Input:
//   - artifacts/cache/cache-keys.json
//   - artifacts/cache/cache-list.json
//   - artifacts/cache/cache-cleanup.json
//
// Output:
//   - artifacts/cache/cache-summary.json
//   - artifacts/cache/cache-summary.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate GitHub.
//   - Does not list or delete caches by itself.
//   - Designed to run after build-cache-keys.js, list-caches.js, and/or
//     cleanup-caches.js.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cache-summary] ${message}`),
    warn: (message) => console.warn(`[cache-summary] WARN: ${message}`),
    error: (message) => console.error(`[cache-summary] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/cache/cache-summary.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cache/cache-summary.md";

const DEFAULT_CACHE_KEYS_FILE = "artifacts/cache/cache-keys.json";
const DEFAULT_CACHE_LIST_FILE = "artifacts/cache/cache-list.json";
const DEFAULT_CACHE_CLEANUP_FILE = "artifacts/cache/cache-cleanup.json";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);

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

    cache_keys_file:
      process.env.CACHE_SUMMARY_KEYS_FILE || DEFAULT_CACHE_KEYS_FILE,
    cache_list_file:
      process.env.CACHE_SUMMARY_LIST_FILE || DEFAULT_CACHE_LIST_FILE,
    cache_cleanup_file:
      process.env.CACHE_SUMMARY_CLEANUP_FILE || DEFAULT_CACHE_CLEANUP_FILE,
    input_files: normalizeStringList(process.env.CACHE_SUMMARY_INPUT_FILES),

    output_file: process.env.CACHE_SUMMARY_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CACHE_SUMMARY_MARKDOWN_FILE || DEFAULT_SUMMARY_FILE,

    warn_unused_days: normalizeInteger(
      process.env.CACHE_SUMMARY_WARN_UNUSED_DAYS,
      30,
    ),
    warn_cache_size_mb: normalizeNumber(
      process.env.CACHE_SUMMARY_WARN_CACHE_SIZE_MB,
      500,
    ),
    warn_total_size_mb: normalizeNumber(
      process.env.CACHE_SUMMARY_WARN_TOTAL_SIZE_MB,
      5000,
    ),
    warn_cleanup_failures: normalizeBoolean(
      process.env.CACHE_SUMMARY_WARN_CLEANUP_FAILURES,
      true,
    ),

    require_cache_keys: normalizeBoolean(
      process.env.CACHE_SUMMARY_REQUIRE_KEYS,
      false,
    ),
    require_cache_list: normalizeBoolean(
      process.env.CACHE_SUMMARY_REQUIRE_LIST,
      false,
    ),
    require_cache_cleanup: normalizeBoolean(
      process.env.CACHE_SUMMARY_REQUIRE_CLEANUP,
      false,
    ),

    fail_on_warning: normalizeBoolean(
      process.env.CACHE_SUMMARY_FAIL_ON_WARNING,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CACHE_SUMMARY_FAIL_ON_ERROR,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CACHE_SUMMARY_FAIL_IF_EMPTY,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CACHE_SUMMARY_WRITE_MARKDOWN,
      true,
    ),
    print: normalizeBoolean(process.env.CACHE_SUMMARY_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CACHE_SUMMARY_STEP_SUMMARY,
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

    if (arg === "--keys" || arg === "--cache-keys") {
      args.cache_keys_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--list" || arg === "--cache-list") {
      args.cache_list_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cleanup" || arg === "--cache-cleanup") {
      args.cache_cleanup_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(argv[index + 1]);
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

    if (arg === "--warn-unused-days") {
      args.warn_unused_days = normalizeInteger(
        argv[index + 1],
        args.warn_unused_days,
      );
      index += 1;
      continue;
    }

    if (arg === "--warn-cache-size-mb") {
      args.warn_cache_size_mb = normalizeNumber(
        argv[index + 1],
        args.warn_cache_size_mb,
      );
      index += 1;
      continue;
    }

    if (arg === "--warn-total-size-mb") {
      args.warn_total_size_mb = normalizeNumber(
        argv[index + 1],
        args.warn_total_size_mb,
      );
      index += 1;
      continue;
    }

    if (arg === "--require-keys") {
      args.require_cache_keys = true;
      continue;
    }

    if (arg === "--require-list") {
      args.require_cache_list = true;
      continue;
    }

    if (arg === "--require-cleanup") {
      args.require_cache_cleanup = true;
      continue;
    }

    if (arg === "--fail-on-warning") {
      args.fail_on_warning = true;
      continue;
    }

    if (arg === "--no-fail-on-warning") {
      args.fail_on_warning = false;
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

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

  args.input_files = [...new Set(args.input_files.filter(Boolean))];

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cache Summary Reporter

Usage:
  node .github/scripts/cache/summarize-caches.js [options]

Options:
      --repo <owner/repo>             Repository slug.
      --keys <file>                  cache-keys.json input file.
      --list <file>                  cache-list.json input file.
      --cleanup <file>               cache-cleanup.json input file.
  -i, --input <file>                 Extra cache artifact JSON input file.
  -o, --output <file>                cache-summary.json output file.
      --summary <file>               cache-summary.md output file.
      --no-summary                   Do not write Markdown summary.
      --warn-unused-days <days>      Warn when caches are unused this many days.
      --warn-cache-size-mb <mb>      Warn when a single cache is this large.
      --warn-total-size-mb <mb>      Warn when matched/scanned cache size is this large.
      --require-keys                 Error when cache-keys.json is missing.
      --require-list                 Error when cache-list.json is missing.
      --require-cleanup              Error when cache-cleanup.json is missing.
      --fail-on-warning              Exit non-zero when warnings exist.
      --fail-on-error                Exit non-zero when errors exist.
      --fail-if-empty                Exit non-zero when no cache data exists.
      --dry-run                      Do not write files.
      --no-print                     Do not print JSON result.
      --no-step-summary              Do not append GitHub step summary.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonInput(filePath, repoRoot, options = {}) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {
      file: relativePath,
      available: false,
      required: Boolean(options.required),
      type: options.type || "unknown",
      data: null,
      error: options.required ? "Required input file is missing." : "",
    };
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const data = safeJsonParse(raw, null);

  if (!data) {
    return {
      file: relativePath,
      available: true,
      required: Boolean(options.required),
      type: options.type || "unknown",
      data: null,
      error: "Input file is not valid JSON.",
    };
  }

  return {
    file: relativePath,
    available: true,
    required: Boolean(options.required),
    type: data.type || options.type || "unknown",
    data,
    error: "",
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function mbToBytes(value) {
  return Number(value || 0) * 1024 * 1024;
}

function truncate(value, maxLength = 80) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function unique(values) {
  return [
    ...new Set(
      values.filter(
        (value) => value !== undefined && value !== null && value !== "",
      ),
    ),
  ];
}

function createNotice(level, source, message, details = {}) {
  return {
    level,
    source,
    message,
    details,
  };
}

function summarizeCacheKeys(data) {
  if (!data) {
    return {
      available: false,
      cache_targets: 0,
      input_files: 0,
      repository_files_scanned: 0,
      keys: [],
      warnings: [],
    };
  }

  const caches = Array.isArray(data.caches) ? data.caches : [];

  return {
    available: true,
    created_at: data.created_at || null,
    cache_targets: Number(data.totals?.caches || caches.length || 0),
    input_files: Number(data.totals?.input_files || 0),
    repository_files_scanned: Number(
      data.totals?.repository_files_scanned || 0,
    ),
    namespace: data.config
      ? `${data.config.cache_prefix || "cache"}-${data.config.cache_version || "v1"}`
      : null,
    hash_algorithm: data.config?.hash_algorithm || null,
    keys: caches.map((cache) => ({
      id: cache.id,
      title: cache.title || cache.id,
      key: cache.key,
      restore_keys: cache.restore_keys || [],
      files_matched: Number(cache.files_matched || 0),
      hash_short: cache.hash_short || "",
    })),
    warnings: caches
      .filter((cache) => Number(cache.files_matched || 0) === 0)
      .map((cache) =>
        createNotice(
          "warning",
          "cache-keys",
          `Cache target "${cache.id}" matched no files.`,
          {
            id: cache.id,
            key: cache.key,
          },
        ),
      ),
  };
}

function summarizeCacheList(data, args) {
  if (!data) {
    return {
      available: false,
      scanned: 0,
      matched: 0,
      matched_size_bytes: 0,
      matched_size_human: "0 B",
      caches: [],
      warnings: [],
    };
  }

  const caches = Array.isArray(data.caches) ? data.caches : [];
  const totalSizeBytes = Number(
    data.totals?.matched_size_in_bytes ??
      data.totals?.scanned_size_in_bytes ??
      caches.reduce((sum, cache) => sum + Number(cache.size_in_bytes || 0), 0),
  );

  const warnings = [];

  if (
    args.warn_total_size_mb > 0 &&
    totalSizeBytes >= mbToBytes(args.warn_total_size_mb)
  ) {
    warnings.push(
      createNotice(
        "warning",
        "cache-list",
        "Matched GitHub Actions cache size exceeds configured warning threshold.",
        {
          matched_size_bytes: totalSizeBytes,
          matched_size_human: formatBytes(totalSizeBytes),
          threshold_mb: args.warn_total_size_mb,
        },
      ),
    );
  }

  for (const cache of caches) {
    if (
      args.warn_unused_days > 0 &&
      Number(cache.unused_days || 0) >= args.warn_unused_days
    ) {
      warnings.push(
        createNotice(
          "warning",
          "cache-list",
          "Cache has not been accessed recently.",
          {
            id: cache.id,
            key: cache.key,
            ref: cache.ref,
            unused_days: cache.unused_days,
          },
        ),
      );
    }

    if (
      args.warn_cache_size_mb > 0 &&
      Number(cache.size_in_bytes || 0) >= mbToBytes(args.warn_cache_size_mb)
    ) {
      warnings.push(
        createNotice(
          "warning",
          "cache-list",
          "Cache size exceeds configured per-cache warning threshold.",
          {
            id: cache.id,
            key: cache.key,
            ref: cache.ref,
            size_in_bytes: cache.size_in_bytes,
            size_human: cache.size_human || formatBytes(cache.size_in_bytes),
            threshold_mb: args.warn_cache_size_mb,
          },
        ),
      );
    }
  }

  return {
    available: true,
    created_at: data.created_at || null,
    scanned: Number(data.totals?.scanned || caches.length || 0),
    matched: Number(data.totals?.matched || caches.length || 0),
    unmatched: Number(data.totals?.unmatched || 0),
    matched_size_bytes: totalSizeBytes,
    matched_size_human: formatBytes(totalSizeBytes),
    scanned_size_bytes: Number(
      data.totals?.scanned_size_in_bytes || totalSizeBytes,
    ),
    scanned_size_human: formatBytes(
      data.totals?.scanned_size_in_bytes || totalSizeBytes,
    ),
    refs: Number(
      data.totals?.refs || unique(caches.map((cache) => cache.ref)).length,
    ),
    keys: Number(
      data.totals?.keys || unique(caches.map((cache) => cache.key)).length,
    ),
    max_unused_days: data.totals?.max_unused_days ?? null,
    max_age_days: data.totals?.max_age_days ?? null,
    usage: data.usage || null,
    groups: data.totals?.groups || {},
    caches: caches.map((cache) => ({
      id: cache.id,
      key: cache.key,
      ref: cache.ref,
      created_at: cache.created_at,
      last_accessed_at: cache.last_accessed_at,
      age_days: cache.age_days ?? null,
      unused_days: cache.unused_days ?? null,
      size_in_bytes: Number(cache.size_in_bytes || 0),
      size_human: cache.size_human || formatBytes(cache.size_in_bytes),
    })),
    warnings,
  };
}

function summarizeCacheCleanup(data, args) {
  if (!data) {
    return {
      available: false,
      planned: 0,
      deleted: 0,
      failed: 0,
      protected: 0,
      kept: 0,
      warnings: [],
    };
  }

  const failed = Number(
    data.totals?.failed || data.result?.failed?.length || 0,
  );
  const warnings = [];

  if (args.warn_cleanup_failures && failed > 0) {
    warnings.push(
      createNotice(
        "warning",
        "cache-cleanup",
        "One or more cache deletions failed.",
        {
          failed,
        },
      ),
    );
  }

  if (
    data.config?.delete_enabled &&
    !data.config?.write_mode &&
    Number(data.totals?.planned || 0) > 0
  ) {
    warnings.push(
      createNotice(
        "warning",
        "cache-cleanup",
        "Cache cleanup requested deletion, but write mode was disabled.",
        {
          planned: data.totals?.planned || 0,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    scanned: Number(data.totals?.scanned || 0),
    planned: Number(data.totals?.planned || 0),
    deleted: Number(data.totals?.deleted || 0),
    failed,
    protected: Number(data.totals?.protected || 0),
    kept: Number(data.totals?.kept || 0),
    ignored: Number(data.totals?.ignored || 0),
    overflow: Number(data.totals?.overflow || 0),
    planned_size_bytes: Number(data.totals?.planned_size_bytes || 0),
    planned_size_human:
      data.totals?.planned_size_human ||
      formatBytes(data.totals?.planned_size_bytes || 0),
    deleted_size_bytes: Number(data.totals?.deleted_size_bytes || 0),
    deleted_size_human:
      data.totals?.deleted_size_human ||
      formatBytes(data.totals?.deleted_size_bytes || 0),
    delete_enabled: Boolean(data.config?.delete_enabled),
    write_mode: Boolean(data.config?.write_mode),
    dry_run: Boolean(data.config?.dry_run),
    protected_refs: data.config?.protected_refs || [],
    planned_caches: data.caches?.planned || [],
    protected_caches: data.caches?.protected || [],
    failed_deletions: data.result?.failed || [],
    warnings,
  };
}

function summarizeExtraInputs(inputs) {
  return inputs.map((input) => {
    const data = input.data || {};

    return {
      file: input.file,
      available: input.available,
      type: input.type || data.type || "unknown",
      created_at: data.created_at || null,
      totals: data.totals || null,
      status: data.status || null,
      error: input.error || "",
    };
  });
}

function buildRecommendations(summary) {
  const recommendations = [];

  if (summary.cache_keys.available && summary.cache_keys.warnings.length) {
    recommendations.push(
      "Review cache key targets with zero matched files and remove or fix stale path patterns.",
    );
  }

  if (
    summary.cache_list.available &&
    summary.cache_list.max_unused_days >= 30
  ) {
    recommendations.push(
      "Run cache cleanup against stale caches that have not been accessed in 30+ days.",
    );
  }

  if (
    summary.cache_list.available &&
    summary.cache_list.matched_size_bytes >= mbToBytes(5000)
  ) {
    recommendations.push(
      "Review large cache groups and consider tightening restore scopes to reduce storage pressure.",
    );
  }

  if (
    summary.cache_cleanup.available &&
    summary.cache_cleanup.planned > 0 &&
    summary.cache_cleanup.deleted === 0
  ) {
    recommendations.push(
      "Cache cleanup created a deletion plan but did not delete anything; enable --delete and --write when ready.",
    );
  }

  if (summary.cache_cleanup.available && summary.cache_cleanup.failed > 0) {
    recommendations.push(
      "Inspect failed cache deletions and confirm the token has Actions write permissions.",
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "No cache maintenance action is required from the available cache artifacts.",
    );
  }

  return recommendations;
}

function buildStatus(errors, warnings) {
  if (errors.length) return "failed";
  if (warnings.length) return "warning";
  return "passed";
}

function createSummary(args, repoRoot) {
  const git = getGitMetadata(repoRoot);

  const baseInputs = [
    readJsonInput(args.cache_keys_file, repoRoot, {
      type: "cache-keys",
      required: args.require_cache_keys,
    }),
    readJsonInput(args.cache_list_file, repoRoot, {
      type: "cache-list",
      required: args.require_cache_list,
    }),
    readJsonInput(args.cache_cleanup_file, repoRoot, {
      type: "cache-cleanup",
      required: args.require_cache_cleanup,
    }),
  ];

  const extraInputs = args.input_files.map((filePath) =>
    readJsonInput(filePath, repoRoot, {
      type: "extra",
      required: false,
    }),
  );

  const cacheKeysInput = baseInputs[0];
  const cacheListInput = baseInputs[1];
  const cacheCleanupInput = baseInputs[2];

  const errors = [];

  for (const input of [...baseInputs, ...extraInputs]) {
    if (input.error && input.required) {
      errors.push(
        createNotice("error", input.type, input.error, {
          file: input.file,
        }),
      );
    } else if (input.error && input.available) {
      errors.push(
        createNotice("error", input.type, input.error, {
          file: input.file,
        }),
      );
    }
  }

  const cacheKeys = summarizeCacheKeys(cacheKeysInput.data);
  const cacheList = summarizeCacheList(cacheListInput.data, args);
  const cacheCleanup = summarizeCacheCleanup(cacheCleanupInput.data, args);

  const warnings = [
    ...cacheKeys.warnings,
    ...cacheList.warnings,
    ...cacheCleanup.warnings,
  ];

  const availableInputs = [...baseInputs, ...extraInputs].filter(
    (input) => input.available,
  ).length;

  if (args.fail_if_empty && availableInputs === 0) {
    errors.push(
      createNotice(
        "error",
        "cache-summary",
        "No cache summary input artifacts were available.",
        {
          expected_files: [
            args.cache_keys_file,
            args.cache_list_file,
            args.cache_cleanup_file,
            ...args.input_files,
          ],
        },
      ),
    );
  }

  const summary = {
    schema_version: 1,
    type: "cache-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: git,
    config: {
      cache_keys_file: toRelativePath(
        resolvePath(args.cache_keys_file, repoRoot),
        repoRoot,
      ),
      cache_list_file: toRelativePath(
        resolvePath(args.cache_list_file, repoRoot),
        repoRoot,
      ),
      cache_cleanup_file: toRelativePath(
        resolvePath(args.cache_cleanup_file, repoRoot),
        repoRoot,
      ),
      input_files: args.input_files.map((filePath) =>
        toRelativePath(resolvePath(filePath, repoRoot), repoRoot),
      ),
      warn_unused_days: args.warn_unused_days,
      warn_cache_size_mb: args.warn_cache_size_mb,
      warn_total_size_mb: args.warn_total_size_mb,
      require_cache_keys: args.require_cache_keys,
      require_cache_list: args.require_cache_list,
      require_cache_cleanup: args.require_cache_cleanup,
      fail_on_warning: args.fail_on_warning,
      fail_on_error: args.fail_on_error,
    },
    outputs: {
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
    },
    inputs: {
      available: availableInputs,
      total: baseInputs.length + extraInputs.length,
      base: baseInputs.map((input) => ({
        file: input.file,
        type: input.type,
        available: input.available,
        required: input.required,
        error: input.error,
      })),
      extra: summarizeExtraInputs(extraInputs),
    },
    cache_keys: cacheKeys,
    cache_list: cacheList,
    cache_cleanup: cacheCleanup,
    recommendations: [],
    notices: {
      errors,
      warnings,
    },
    totals: {
      errors: errors.length,
      warnings: warnings.length,
      available_inputs: availableInputs,
      cache_targets: cacheKeys.cache_targets,
      cache_key_input_files: cacheKeys.input_files,
      caches_scanned: cacheList.scanned || cacheCleanup.scanned || 0,
      caches_matched: cacheList.matched || 0,
      caches_planned_for_delete: cacheCleanup.planned || 0,
      caches_deleted: cacheCleanup.deleted || 0,
      cache_delete_failures: cacheCleanup.failed || 0,
      matched_cache_size_bytes: cacheList.matched_size_bytes || 0,
      matched_cache_size_human: cacheList.matched_size_human || "0 B",
      planned_delete_size_bytes: cacheCleanup.planned_size_bytes || 0,
      planned_delete_size_human: cacheCleanup.planned_size_human || "0 B",
      deleted_size_bytes: cacheCleanup.deleted_size_bytes || 0,
      deleted_size_human: cacheCleanup.deleted_size_human || "0 B",
    },
    status: "unknown",
  };

  summary.recommendations = buildRecommendations(summary);
  summary.status = buildStatus(errors, warnings);

  return summary;
}

function createMarkdownSummary(summary) {
  const lines = [
    `# 🧩 ${PROJECT_NAME} Cache Summary`,
    "",
    `Generated: \`${summary.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${summary.status}\``,
    `- Errors: \`${summary.totals.errors}\``,
    `- Warnings: \`${summary.totals.warnings}\``,
    `- Available input artifacts: \`${summary.inputs.available}/${summary.inputs.total}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${summary.repository}\``,
    `- Branch: \`${summary.github.branch || "unknown"}\``,
    `- Commit: \`${summary.github.short_sha || summary.github.sha || "unknown"}\``,
    `- Workflow: \`${summary.github.workflow || "unknown"}\``,
    "",
    "## 🔑 Cache Keys",
    "",
  ];

  if (!summary.cache_keys.available) {
    lines.push("Cache key data was not available.");
  } else {
    lines.push(`- Cache targets: \`${summary.cache_keys.cache_targets}\``);
    lines.push(`- Hashed input files: \`${summary.cache_keys.input_files}\``);
    lines.push(
      `- Repository files scanned: \`${summary.cache_keys.repository_files_scanned}\``,
    );
    lines.push(`- Namespace: \`${summary.cache_keys.namespace || "unknown"}\``);
    lines.push("");
    lines.push("| Target | Files | Key |");
    lines.push("|---|---:|---|");

    for (const item of summary.cache_keys.keys) {
      lines.push(
        `| \`${item.id}\` | \`${item.files_matched}\` | \`${truncate(item.key, 96)}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 📦 Cache Inventory");
  lines.push("");

  if (!summary.cache_list.available) {
    lines.push("Cache inventory data was not available.");
  } else {
    lines.push(`- Caches scanned: \`${summary.cache_list.scanned}\``);
    lines.push(`- Caches matched: \`${summary.cache_list.matched}\``);
    lines.push(`- Matched size: \`${summary.cache_list.matched_size_human}\``);
    lines.push(`- Unique refs: \`${summary.cache_list.refs}\``);
    lines.push(`- Unique keys: \`${summary.cache_list.keys}\``);
    lines.push(
      `- Max unused days: \`${summary.cache_list.max_unused_days ?? "unknown"}\``,
    );
    lines.push("");

    if (Object.keys(summary.cache_list.groups || {}).length) {
      lines.push("| Group | Count | Size |");
      lines.push("|---|---:|---:|");

      for (const group of Object.values(summary.cache_list.groups)) {
        lines.push(
          `| \`${group.name}\` | \`${group.count}\` | \`${group.size_human}\` |`,
        );
      }

      lines.push("");
    }

    if (summary.cache_list.caches.length) {
      lines.push("| ID | Ref | Key | Unused | Size |");
      lines.push("|---:|---|---|---:|---:|");

      for (const cache of summary.cache_list.caches.slice(0, 50)) {
        lines.push(
          `| \`${cache.id}\` | \`${cache.ref || "unknown"}\` | \`${truncate(cache.key, 72)}\` | \`${cache.unused_days ?? "?"}d\` | \`${cache.size_human}\` |`,
        );
      }

      if (summary.cache_list.caches.length > 50) {
        lines.push(
          `| ... | ... | ... | ... | ${summary.cache_list.caches.length - 50} additional cache(s) omitted from summary. |`,
        );
      }
    }
  }

  lines.push("");
  lines.push("## 🧹 Cache Cleanup");
  lines.push("");

  if (!summary.cache_cleanup.available) {
    lines.push("Cache cleanup data was not available.");
  } else {
    lines.push(`- Cleanup status: \`${summary.cache_cleanup.status}\``);
    lines.push(`- Planned deletions: \`${summary.cache_cleanup.planned}\``);
    lines.push(`- Deleted: \`${summary.cache_cleanup.deleted}\``);
    lines.push(`- Failed: \`${summary.cache_cleanup.failed}\``);
    lines.push(`- Protected: \`${summary.cache_cleanup.protected}\``);
    lines.push(`- Kept: \`${summary.cache_cleanup.kept}\``);
    lines.push(
      `- Planned delete size: \`${summary.cache_cleanup.planned_size_human}\``,
    );
    lines.push(
      `- Deleted size: \`${summary.cache_cleanup.deleted_size_human}\``,
    );
    lines.push(
      `- Delete enabled: \`${summary.cache_cleanup.delete_enabled ? "true" : "false"}\``,
    );
    lines.push(
      `- Write mode: \`${summary.cache_cleanup.write_mode ? "true" : "false"}\``,
    );
    lines.push(
      `- Dry run: \`${summary.cache_cleanup.dry_run ? "true" : "false"}\``,
    );
  }

  if (summary.notices.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");
    lines.push("| Source | Message |");
    lines.push("|---|---|");

    for (const error of summary.notices.errors) {
      lines.push(`| \`${error.source}\` | ${error.message} |`);
    }
  }

  if (summary.notices.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");
    lines.push("| Source | Message | Details |");
    lines.push("|---|---|---|");

    for (const warning of summary.notices.warnings.slice(0, 100)) {
      lines.push(
        `| \`${warning.source}\` | ${warning.message} | \`${truncate(JSON.stringify(warning.details || {}), 120)}\` |`,
      );
    }

    if (summary.notices.warnings.length > 100) {
      lines.push(
        `| ... | ${summary.notices.warnings.length - 100} additional warning(s) omitted from summary. | ... |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🛠️ Recommendations");
  lines.push("");

  for (const recommendation of summary.recommendations) {
    lines.push(`- ${recommendation}`);
  }

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

function writeGitHubOutputs(summary) {
  setGitHubOutput("cache_summary_file", summary.outputs.output_file);
  setGitHubOutput(
    "cache_summary_markdown_file",
    summary.outputs.summary_file || "",
  );
  setGitHubOutput("cache_summary_status", summary.status);
  setGitHubOutput("cache_summary_errors", String(summary.totals.errors));
  setGitHubOutput("cache_summary_warnings", String(summary.totals.warnings));
  setGitHubOutput(
    "cache_summary_available_inputs",
    String(summary.totals.available_inputs),
  );
  setGitHubOutput(
    "cache_summary_cache_targets",
    String(summary.totals.cache_targets),
  );
  setGitHubOutput(
    "cache_summary_caches_scanned",
    String(summary.totals.caches_scanned),
  );
  setGitHubOutput(
    "cache_summary_caches_matched",
    String(summary.totals.caches_matched),
  );
  setGitHubOutput(
    "cache_summary_caches_planned_for_delete",
    String(summary.totals.caches_planned_for_delete),
  );
  setGitHubOutput(
    "cache_summary_caches_deleted",
    String(summary.totals.caches_deleted),
  );
  setGitHubOutput(
    "cache_summary_cache_delete_failures",
    String(summary.totals.cache_delete_failures),
  );
  setGitHubOutput(
    "cache_summary_matched_cache_size_bytes",
    String(summary.totals.matched_cache_size_bytes),
  );
  setGitHubOutput(
    "cache_summary_matched_cache_size_human",
    summary.totals.matched_cache_size_human,
  );
  setGitHubOutput(
    "cache_summary_deleted_size_bytes",
    String(summary.totals.deleted_size_bytes),
  );
  setGitHubOutput(
    "cache_summary_deleted_size_human",
    summary.totals.deleted_size_human,
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing cache artifacts.");

  const summary = createSummary(args, repoRoot);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  const markdown = createMarkdownSummary(summary);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(summary);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_if_empty && summary.inputs.available === 0) {
    logger.error("No cache summary input artifacts were available.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && summary.notices.errors.length) {
    logger.error(
      `Cache summary completed with ${summary.notices.errors.length} error(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_warning && summary.notices.warnings.length) {
    logger.error(
      `Cache summary completed with ${summary.notices.warnings.length} warning(s).`,
    );
    process.exitCode = 1;
  }
}

main();
