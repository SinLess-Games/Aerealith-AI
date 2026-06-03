#!/usr/bin/env node
// .github/scripts/cache/list-caches.js
// =============================================================================
// Aerealith AI — GitHub Actions Cache List Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   List GitHub Actions caches for the repository, apply safe filters, summarize
//   storage usage, group cache entries, and write cache inventory artifacts.
//
// Output:
//   - artifacts/cache/cache-list.json
//   - artifacts/cache/cache-list.md
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not delete caches.
//   - Does not mutate GitHub.
//   - Supports filtering by key, key prefix, key regex, ref, age, unused days,
//     size, and cache ID.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cache-list] ${message}`),
    warn: (message) => console.warn(`[cache-list] WARN: ${message}`),
    error: (message) => console.error(`[cache-list] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/cache/cache-list.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cache/cache-list.md";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const VALID_SORT_VALUES = new Set([
  "created_at",
  "last_accessed_at",
  "size_in_bytes",
]);
const VALID_DIRECTION_VALUES = new Set(["asc", "desc"]);
const VALID_GROUP_VALUES = new Set([
  "none",
  "ref",
  "key",
  "key-prefix",
  "age",
  "size",
]);

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
    output_file: process.env.CACHE_LIST_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.CACHE_LIST_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    ids: normalizeStringList(process.env.CACHE_LIST_IDS),
    key: process.env.CACHE_LIST_KEY || "",
    key_prefixes: normalizeStringList(
      process.env.CACHE_LIST_KEY_PREFIXES || process.env.CACHE_LIST_KEY_PREFIX,
    ),
    key_regex: process.env.CACHE_LIST_KEY_REGEX || "",
    ref: process.env.CACHE_LIST_REF || "",

    sort: process.env.CACHE_LIST_SORT || "last_accessed_at",
    direction: process.env.CACHE_LIST_DIRECTION || "asc",
    group_by: process.env.CACHE_LIST_GROUP_BY || "ref",

    unused_days: normalizeInteger(
      process.env.CACHE_LIST_UNUSED_DAYS ||
        process.env.CACHE_LIST_OLDER_THAN_DAYS,
      0,
    ),
    created_days: normalizeInteger(process.env.CACHE_LIST_CREATED_DAYS, 0),
    min_size_mb: normalizeNumber(process.env.CACHE_LIST_MIN_SIZE_MB, 0),
    max_size_mb: normalizeNumber(process.env.CACHE_LIST_MAX_SIZE_MB, 0),

    per_page: normalizeInteger(process.env.CACHE_LIST_PER_PAGE, 100),
    max_pages: normalizeInteger(process.env.CACHE_LIST_MAX_PAGES, 100),
    limit: normalizeInteger(process.env.CACHE_LIST_LIMIT, 0),

    include_usage: normalizeBoolean(process.env.CACHE_LIST_INCLUDE_USAGE, true),
    include_raw: normalizeBoolean(process.env.CACHE_LIST_INCLUDE_RAW, false),
    fail_if_empty: normalizeBoolean(
      process.env.CACHE_LIST_FAIL_IF_EMPTY,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CACHE_LIST_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CACHE_LIST_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CACHE_LIST_STEP_SUMMARY,
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

    if (arg === "--id" || arg === "--ids") {
      args.ids.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--key") {
      args.key = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--key-prefix" || arg === "--key-prefixes") {
      args.key_prefixes.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--key-regex") {
      args.key_regex = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--ref") {
      args.ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--sort") {
      args.sort = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--direction") {
      args.direction = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--group-by") {
      args.group_by = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--unused-days" || arg === "--older-than-days") {
      args.unused_days = normalizeInteger(argv[index + 1], args.unused_days);
      index += 1;
      continue;
    }

    if (arg === "--created-days") {
      args.created_days = normalizeInteger(argv[index + 1], args.created_days);
      index += 1;
      continue;
    }

    if (arg === "--min-size-mb") {
      args.min_size_mb = normalizeNumber(argv[index + 1], args.min_size_mb);
      index += 1;
      continue;
    }

    if (arg === "--max-size-mb") {
      args.max_size_mb = normalizeNumber(argv[index + 1], args.max_size_mb);
      index += 1;
      continue;
    }

    if (arg === "--per-page") {
      args.per_page = normalizeInteger(argv[index + 1], args.per_page);
      index += 1;
      continue;
    }

    if (arg === "--max-pages") {
      args.max_pages = normalizeInteger(argv[index + 1], args.max_pages);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      args.limit = normalizeInteger(argv[index + 1], args.limit);
      index += 1;
      continue;
    }

    if (arg === "--include-usage") {
      args.include_usage = true;
      continue;
    }

    if (arg === "--no-usage") {
      args.include_usage = false;
      continue;
    }

    if (arg === "--include-raw") {
      args.include_raw = true;
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

  args.ids = [...new Set(args.ids.map(String).filter(Boolean))];
  args.key_prefixes = [...new Set(args.key_prefixes)];
  args.per_page = Math.max(1, Math.min(args.per_page, 100));
  args.max_pages = Math.max(1, args.max_pages);
  args.limit = Math.max(0, args.limit);
  args.unused_days = Math.max(0, args.unused_days);
  args.created_days = Math.max(0, args.created_days);
  args.min_size_mb = Math.max(0, args.min_size_mb);
  args.max_size_mb = Math.max(0, args.max_size_mb);

  if (!VALID_SORT_VALUES.has(args.sort)) {
    args.sort = "last_accessed_at";
  }

  if (!VALID_DIRECTION_VALUES.has(args.direction)) {
    args.direction = "asc";
  }

  if (!VALID_GROUP_VALUES.has(args.group_by)) {
    args.group_by = "ref";
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Actions Cache List Reporter

Usage:
  node .github/scripts/cache/list-caches.js [options]

Examples:
  node .github/scripts/cache/list-caches.js
  node .github/scripts/cache/list-caches.js --key-prefix aerealith-ai-v1-pnpm
  node .github/scripts/cache/list-caches.js --unused-days 14 --group-by key-prefix
  node .github/scripts/cache/list-caches.js --ref refs/heads/main --sort size_in_bytes --direction desc

Options:
      --repo <owner/repo>          Repository slug.
      --id <id,list>               Filter by cache ID or comma-separated IDs.
      --key <key>                  Exact cache key filter.
      --key-prefix <prefix,list>   Cache key prefix filter.
      --key-regex <regex>          Cache key regex filter.
      --ref <ref>                  Git ref filter.
      --sort <field>               created_at, last_accessed_at, or size_in_bytes.
      --direction <asc|desc>       Sort direction.
      --group-by <mode>            none, ref, key, key-prefix, age, or size.
      --unused-days <days>         Filter caches unused at least this many days.
      --created-days <days>        Filter caches created at least this many days ago.
      --min-size-mb <mb>           Filter caches at least this large.
      --max-size-mb <mb>           Filter caches at most this large.
      --per-page <number>          GitHub API page size. Default: 100.
      --max-pages <number>         Maximum pages to read. Default: 100.
      --limit <number>             Limit cache records after filtering.
      --include-usage              Include repository cache usage. Default.
      --no-usage                   Skip repository cache usage request.
      --include-raw                Include raw GitHub cache payloads.
      --fail-if-empty              Exit non-zero when no caches match.
  -o, --output <file>              JSON output file.
      --summary <file>             Markdown summary output file.
      --no-summary                 Do not write Markdown summary.
      --dry-run                    Do not write files.
      --no-print                   Do not print JSON result.
      --no-step-summary            Do not append GitHub step summary.
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

function parseRepository(repository) {
  const normalized = normalizeString(repository, DEFAULT_REPOSITORY);

  if (!normalized.includes("/")) {
    throw new Error(
      `Repository must use owner/name format. Received: ${repository}`,
    );
  }

  const [owner, repo] = normalized.split("/");

  if (!owner || !repo) {
    throw new Error(
      `Repository must use owner/name format. Received: ${repository}`,
    );
  }

  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
  };
}

function getGitHubToken() {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.PROJECTS_PAT ||
    process.env.GITHUB_PAT ||
    ""
  );
}

function buildHeaders(options = {}) {
  const token = getGitHubToken();

  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "aerealith-ai-cache-list",
    ...(options.json === false ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
}

function buildApiUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  return `${GITHUB_API_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function withQuery(endpoint, params) {
  const entries = Object.entries(params).filter(([, value]) => {
    return value !== undefined && value !== null && value !== "";
  });

  if (!entries.length) return endpoint;

  const query = entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};

  return Object.fromEntries(
    linkHeader
      .split(",")
      .map((part) => {
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
        if (!match) return [null, null];

        return [match[2], match[1]];
      })
      .filter(([key]) => Boolean(key)),
  );
}

async function githubRequest(endpoint, options = {}) {
  const method = normalizeString(options.method, "GET").toUpperCase();
  const url = buildApiUrl(endpoint);

  if (options.require_token !== false && !getGitHubToken()) {
    throw new Error(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, PROJECTS_PAT, or GITHUB_PAT.",
    );
  }

  const response = await fetch(url, {
    method,
    headers: buildHeaders(options),
    body:
      options.body === undefined || options.body === null
        ? undefined
        : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? safeJsonParse(text, text) : null;

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      response.statusText;

    throw new Error(
      `GitHub API request failed: ${method} ${endpoint}\nStatus: ${response.status}\nMessage: ${message}`,
    );
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

async function getCacheUsage(repository) {
  const repo = parseRepository(repository);

  try {
    const response = await githubRequest(
      `/repos/${repo.owner}/${repo.repo}/actions/cache/usage`,
    );

    return {
      available: true,
      active_caches_size_in_bytes: Number(
        response.data?.active_caches_size_in_bytes || 0,
      ),
      active_caches_size_human: formatBytes(
        response.data?.active_caches_size_in_bytes || 0,
      ),
      active_caches_count: Number(response.data?.active_caches_count || 0),
      raw: response.data,
    };
  } catch (err) {
    logger.warn(
      `Could not read repository cache usage: ${logger.formatError(err)}`,
    );

    return {
      available: false,
      error: logger.formatError(err),
      active_caches_size_in_bytes: 0,
      active_caches_size_human: "0 B",
      active_caches_count: 0,
      raw: null,
    };
  }
}

async function listCachesFromGitHub(args) {
  const repo = parseRepository(args.repository);

  let endpoint = withQuery(`/repos/${repo.owner}/${repo.repo}/actions/caches`, {
    per_page: args.per_page,
    key: args.key,
    ref: args.ref,
    sort: args.sort,
    direction: args.direction,
  });

  const caches = [];
  let reportedTotalCount = null;

  for (let page = 1; endpoint && page <= args.max_pages; page += 1) {
    const response = await githubRequest(endpoint);

    if (Number.isFinite(Number(response.data?.total_count))) {
      reportedTotalCount = Number(response.data.total_count);
    }

    const pageCaches = Array.isArray(response.data?.actions_caches)
      ? response.data.actions_caches
      : [];

    caches.push(...pageCaches);

    const links = parseLinkHeader(response.headers?.get?.("link"));
    endpoint = links.next || null;
  }

  return {
    total_count: reportedTotalCount ?? caches.length,
    caches,
  };
}

function normalizeCacheRecord(cache, includeRaw = false) {
  const size = Number(cache.size_in_bytes || 0);
  const createdAt = normalizeString(cache.created_at);
  const lastAccessedAt = normalizeString(
    cache.last_accessed_at || cache.created_at,
  );

  return {
    id: String(cache.id || ""),
    key: normalizeString(cache.key),
    ref: normalizeString(cache.ref),
    version: normalizeString(cache.version),
    created_at: createdAt,
    last_accessed_at: lastAccessedAt,
    size_in_bytes: size,
    size_human: formatBytes(size),
    age_days: daysSince(createdAt),
    unused_days: daysSince(lastAccessedAt),
    ...(includeRaw ? { raw: cache } : {}),
  };
}

function daysSince(timestamp) {
  const parsed = Date.parse(timestamp || "");

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
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

function refVariants(ref) {
  const value = normalizeString(ref);

  if (!value) return [];

  const refs = new Set([value]);

  if (value.startsWith("refs/")) {
    refs.add(value);
  } else if (!value.includes("/")) {
    refs.add(`refs/heads/${value}`);
  }

  if (value.startsWith("refs/heads/")) {
    refs.add(value.replace(/^refs\/heads\//, ""));
  }

  if (value.startsWith("refs/tags/")) {
    refs.add(value.replace(/^refs\/tags\//, ""));
  }

  return [...refs];
}

function regexMatches(value, pattern) {
  if (!pattern) return true;

  return String(value || "").includes(String(pattern));
}

function cacheMatchesFilters(cache, args) {
  if (args.ids.length && !args.ids.includes(cache.id)) return false;

  if (args.key && cache.key !== args.key) return false;

  if (
    args.key_prefixes.length &&
    !args.key_prefixes.some((prefix) => cache.key.startsWith(prefix))
  ) {
    return false;
  }

  if (args.key_regex && !regexMatches(cache.key, args.key_regex)) return false;

  if (
    args.ref &&
    !refVariants(cache.ref).some((ref) => refVariants(args.ref).includes(ref))
  ) {
    return false;
  }

  if (
    args.unused_days > 0 &&
    (cache.unused_days === null || cache.unused_days < args.unused_days)
  ) {
    return false;
  }

  if (
    args.created_days > 0 &&
    (cache.age_days === null || cache.age_days < args.created_days)
  ) {
    return false;
  }

  if (
    args.min_size_mb > 0 &&
    cache.size_in_bytes < args.min_size_mb * 1024 * 1024
  ) {
    return false;
  }

  if (
    args.max_size_mb > 0 &&
    cache.size_in_bytes > args.max_size_mb * 1024 * 1024
  ) {
    return false;
  }

  return true;
}

function sortCaches(caches, args) {
  const sorted = [...caches].sort((left, right) => {
    if (args.sort === "size_in_bytes") {
      return left.size_in_bytes - right.size_in_bytes;
    }

    const leftTime = Date.parse(left[args.sort] || "") || 0;
    const rightTime = Date.parse(right[args.sort] || "") || 0;

    return leftTime - rightTime;
  });

  if (args.direction === "desc") {
    sorted.reverse();
  }

  return sorted;
}

function keyPrefix(cache) {
  const key = normalizeString(cache.key);

  if (!key) return "unknown";

  const parts = key.split("-");

  if (parts.length >= 3) {
    return parts.slice(0, 3).join("-");
  }

  return parts[0] || "unknown";
}

function ageBucket(cache) {
  const days = Number(cache.unused_days ?? cache.age_days ?? 0);

  if (days >= 90) return "90+ days";
  if (days >= 60) return "60-89 days";
  if (days >= 30) return "30-59 days";
  if (days >= 14) return "14-29 days";
  if (days >= 7) return "7-13 days";
  if (days >= 1) return "1-6 days";

  return "today";
}

function sizeBucket(cache) {
  const mb = cache.size_in_bytes / 1024 / 1024;

  if (mb >= 1024) return "1GB+";
  if (mb >= 500) return "500MB-1GB";
  if (mb >= 100) return "100MB-499MB";
  if (mb >= 50) return "50MB-99MB";
  if (mb >= 10) return "10MB-49MB";
  if (mb > 0) return "under 10MB";

  return "empty";
}

function groupName(cache, groupBy) {
  if (groupBy === "none") return "all";
  if (groupBy === "ref") return cache.ref || "unknown";
  if (groupBy === "key") return cache.key || "unknown";
  if (groupBy === "key-prefix") return keyPrefix(cache);
  if (groupBy === "age") return ageBucket(cache);
  if (groupBy === "size") return sizeBucket(cache);

  return "all";
}

function groupCaches(caches, groupBy) {
  const groups = {};

  for (const cache of caches) {
    const name = groupName(cache, groupBy);

    if (!groups[name]) {
      groups[name] = {
        name,
        count: 0,
        size_in_bytes: 0,
        size_human: "0 B",
        oldest_created_at: null,
        oldest_last_accessed_at: null,
        newest_created_at: null,
        newest_last_accessed_at: null,
        ids: [],
      };
    }

    const group = groups[name];

    group.count += 1;
    group.size_in_bytes += cache.size_in_bytes;
    group.size_human = formatBytes(group.size_in_bytes);
    group.ids.push(cache.id);

    group.oldest_created_at = oldestDate(
      group.oldest_created_at,
      cache.created_at,
    );
    group.oldest_last_accessed_at = oldestDate(
      group.oldest_last_accessed_at,
      cache.last_accessed_at,
    );
    group.newest_created_at = newestDate(
      group.newest_created_at,
      cache.created_at,
    );
    group.newest_last_accessed_at = newestDate(
      group.newest_last_accessed_at,
      cache.last_accessed_at,
    );
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function oldestDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;

  return Date.parse(right) < Date.parse(left) ? right : left;
}

function newestDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;

  return Date.parse(right) > Date.parse(left) ? right : left;
}

function summarizeCaches(allCaches, filteredCaches, args) {
  const totalSize = filteredCaches.reduce(
    (sum, cache) => sum + cache.size_in_bytes,
    0,
  );
  const allSize = allCaches.reduce(
    (sum, cache) => sum + cache.size_in_bytes,
    0,
  );

  const refs = [
    ...new Set(filteredCaches.map((cache) => cache.ref).filter(Boolean)),
  ].sort();
  const keys = [
    ...new Set(filteredCaches.map((cache) => cache.key).filter(Boolean)),
  ].sort();

  const oldestCreated = filteredCaches.reduce(
    (current, cache) => oldestDate(current, cache.created_at),
    null,
  );
  const newestCreated = filteredCaches.reduce(
    (current, cache) => newestDate(current, cache.created_at),
    null,
  );
  const oldestAccessed = filteredCaches.reduce(
    (current, cache) => oldestDate(current, cache.last_accessed_at),
    null,
  );
  const newestAccessed = filteredCaches.reduce(
    (current, cache) => newestDate(current, cache.last_accessed_at),
    null,
  );

  return {
    scanned: allCaches.length,
    matched: filteredCaches.length,
    unmatched: Math.max(0, allCaches.length - filteredCaches.length),
    scanned_size_in_bytes: allSize,
    scanned_size_human: formatBytes(allSize),
    matched_size_in_bytes: totalSize,
    matched_size_human: formatBytes(totalSize),
    refs: refs.length,
    keys: keys.length,
    oldest_created_at: oldestCreated,
    newest_created_at: newestCreated,
    oldest_last_accessed_at: oldestAccessed,
    newest_last_accessed_at: newestAccessed,
    max_unused_days: maxNumber(
      filteredCaches.map((cache) => cache.unused_days),
    ),
    max_age_days: maxNumber(filteredCaches.map((cache) => cache.age_days)),
    groups: groupCaches(filteredCaches, args.group_by),
  };
}

function maxNumber(values) {
  const numbers = values
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);

  if (!numbers.length) return null;

  return Math.max(...numbers);
}

function createOutput(args, github, usage, listed, allCaches, filteredCaches) {
  const summary = summarizeCaches(allCaches, filteredCaches, args);

  return {
    schema_version: 1,
    type: "cache-list",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    query: {
      ids: args.ids,
      key: args.key || null,
      key_prefixes: args.key_prefixes,
      key_regex: args.key_regex || null,
      ref: args.ref || null,
      sort: args.sort,
      direction: args.direction,
      group_by: args.group_by,
      unused_days: args.unused_days,
      created_days: args.created_days,
      min_size_mb: args.min_size_mb,
      max_size_mb: args.max_size_mb,
      per_page: args.per_page,
      max_pages: args.max_pages,
      limit: args.limit,
    },
    usage,
    github_reported_total_count: listed.total_count,
    totals: summary,
    caches: filteredCaches,
  };
}

function truncate(value, maxLength = 72) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function createMarkdownSummary(output) {
  const lines = [
    `# 🧩 ${PROJECT_NAME} GitHub Actions Caches`,
    "",
    `Generated: \`${output.created_at}\``,
    "",
    "## 📊 Totals",
    "",
    `- Repository: \`${output.repository}\``,
    `- Caches scanned: \`${output.totals.scanned}\``,
    `- Caches matched: \`${output.totals.matched}\``,
    `- Matched size: \`${output.totals.matched_size_human}\``,
    `- Scanned size: \`${output.totals.scanned_size_human}\``,
    `- Unique refs: \`${output.totals.refs}\``,
    `- Unique keys: \`${output.totals.keys}\``,
    `- Max unused days: \`${output.totals.max_unused_days ?? "unknown"}\``,
    `- Max age days: \`${output.totals.max_age_days ?? "unknown"}\``,
    "",
  ];

  if (output.usage?.available) {
    lines.push("## 🧮 Repository Usage");
    lines.push("");
    lines.push(`- Active cache count: \`${output.usage.active_caches_count}\``);
    lines.push(
      `- Active cache size: \`${output.usage.active_caches_size_human}\``,
    );
    lines.push("");
  }

  lines.push("## 🔎 Filters");
  lines.push("");
  lines.push(`- Key: \`${output.query.key || "none"}\``);
  lines.push(
    `- Key prefixes: ${
      output.query.key_prefixes.length
        ? output.query.key_prefixes.map((item) => `\`${item}\``).join(", ")
        : "`none`"
    }`,
  );
  lines.push(`- Key regex: \`${output.query.key_regex || "none"}\``);
  lines.push(`- Ref: \`${output.query.ref || "none"}\``);
  lines.push(`- Unused days: \`${output.query.unused_days || 0}\``);
  lines.push(`- Created days: \`${output.query.created_days || 0}\``);
  lines.push(`- Min size MB: \`${output.query.min_size_mb || 0}\``);
  lines.push(`- Max size MB: \`${output.query.max_size_mb || 0}\``);
  lines.push("");

  if (
    Object.keys(output.totals.groups).length &&
    output.query.group_by !== "none"
  ) {
    lines.push(`## 🗂️ Groups by ${output.query.group_by}`);
    lines.push("");
    lines.push("| Group | Count | Size | Oldest Accessed | Newest Accessed |");
    lines.push("|---|---:|---:|---|---|");

    for (const group of Object.values(output.totals.groups)) {
      lines.push(
        `| \`${group.name}\` | \`${group.count}\` | \`${group.size_human}\` | \`${group.oldest_last_accessed_at || "unknown"}\` | \`${group.newest_last_accessed_at || "unknown"}\` |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📦 Cache Entries");
  lines.push("");

  if (!output.caches.length) {
    lines.push("No cache entries matched the requested filters.");
  } else {
    lines.push("| ID | Ref | Key | Last Accessed | Age | Unused | Size |");
    lines.push("|---:|---|---|---|---:|---:|---:|");

    for (const cache of output.caches.slice(0, 200)) {
      lines.push(
        `| \`${cache.id}\` | \`${cache.ref || "unknown"}\` | \`${truncate(cache.key)}\` | \`${cache.last_accessed_at || "unknown"}\` | \`${cache.age_days ?? "?"}d\` | \`${cache.unused_days ?? "?"}d\` | \`${cache.size_human}\` |`,
      );
    }

    if (output.caches.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ... | ${output.caches.length - 200} additional cache entrie(s) omitted from summary. |`,
      );
    }
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

function writeGitHubOutputs(output, args, repoRoot) {
  setGitHubOutput(
    "cache_list_file",
    toRelativePath(resolvePath(args.output_file, repoRoot), repoRoot),
  );
  setGitHubOutput(
    "cache_list_summary_file",
    args.write_summary_file
      ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
      : "",
  );
  setGitHubOutput("cache_list_scanned", String(output.totals.scanned));
  setGitHubOutput("cache_list_matched", String(output.totals.matched));
  setGitHubOutput(
    "cache_list_matched_size_bytes",
    String(output.totals.matched_size_in_bytes),
  );
  setGitHubOutput(
    "cache_list_matched_size_human",
    output.totals.matched_size_human,
  );
  setGitHubOutput(
    "cache_list_scanned_size_bytes",
    String(output.totals.scanned_size_in_bytes),
  );
  setGitHubOutput(
    "cache_list_scanned_size_human",
    output.totals.scanned_size_human,
  );
  setGitHubOutput(
    "cache_list_max_unused_days",
    String(output.totals.max_unused_days ?? ""),
  );
  setGitHubOutput(
    "cache_list_max_age_days",
    String(output.totals.max_age_days ?? ""),
  );

  if (output.caches[0]) {
    setGitHubOutput("cache_list_first_id", output.caches[0].id);
    setGitHubOutput("cache_list_first_key", output.caches[0].key);
    setGitHubOutput("cache_list_first_ref", output.caches[0].ref);
  } else {
    setGitHubOutput("cache_list_first_id", "");
    setGitHubOutput("cache_list_first_key", "");
    setGitHubOutput("cache_list_first_ref", "");
  }
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);
  const github = getGitMetadata(repoRoot);

  logger.info("Listing GitHub Actions caches.");

  const [usage, listed] = await Promise.all([
    args.include_usage
      ? getCacheUsage(args.repository)
      : Promise.resolve({
          available: false,
          skipped: true,
          active_caches_size_in_bytes: 0,
          active_caches_size_human: "0 B",
          active_caches_count: 0,
          raw: null,
        }),
    listCachesFromGitHub(args),
  ]);

  const allCaches = listed.caches.map((cache) =>
    normalizeCacheRecord(cache, args.include_raw),
  );
  const filteredCaches = sortCaches(
    allCaches.filter((cache) => cacheMatchesFilters(cache, args)),
    args,
  );

  const limitedCaches =
    args.limit > 0 ? filteredCaches.slice(0, args.limit) : filteredCaches;

  const output = createOutput(
    args,
    github,
    usage,
    listed,
    allCaches,
    limitedCaches,
  );
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const summary = createMarkdownSummary(output);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summary, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(output, args, repoRoot);

  if (args.write_step_summary) {
    appendGitHubStepSummary(summary);
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_if_empty && output.totals.matched === 0) {
    logger.error("No GitHub Actions caches matched the requested filters.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
