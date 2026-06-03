#!/usr/bin/env node
// .github/scripts/cache/cleanup-caches.js
// =============================================================================
// Aerealith AI — GitHub Actions Cache Cleanup
// -----------------------------------------------------------------------------
// Purpose:
//   Build a safe cleanup plan for GitHub Actions caches and optionally delete
//   stale cache entries by cache ID.
//
// Output:
//   - artifacts/cache/cache-cleanup.json
//   - artifacts/cache/cache-cleanup.md
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Plan-only by default. Deletion requires --delete and --write.
//   - Default policy selects caches unused for 30+ days, keeps the newest 2
//     caches per key/ref, and protects the current ref plus the default branch.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger;
try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (m) => console.log(`[cache-cleanup] ${m}`),
    warn: (m) => console.warn(`[cache-cleanup] WARN: ${m}`),
    error: (m) => console.error(`[cache-cleanup] ERROR: ${m}`),
    debug: () => {},
    dump: () => {},
    formatError: (e) =>
      typeof e === "string" ? e : e?.message || String(e || "unknown error"),
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_OUTPUT_FILE = "artifacts/cache/cache-cleanup.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cache/cache-cleanup.md";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const TRUE = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE = new Set(["false", "0", "no", "n", "off", "disabled"]);

const toStr = (v, f = "") =>
  v === undefined || v === null ? f : String(v).trim() || f;
const toInt = (v, f = 0) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : f;
};
const toNum = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const toBool = (v, f = false) => {
  if (v === undefined || v === null || v === "") return f;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return f;
};
const toList = (v) => {
  if (v === undefined || v === null || v === "") return [];
  const raw = Array.isArray(v) ? v : String(v).split(",");
  return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    output_file: process.env.CACHE_CLEANUP_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CACHE_CLEANUP_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    ids: toList(process.env.CACHE_CLEANUP_IDS),
    key: toStr(process.env.CACHE_CLEANUP_KEY),
    key_prefixes: toList(
      process.env.CACHE_CLEANUP_KEY_PREFIXES ||
        process.env.CACHE_CLEANUP_KEY_PREFIX,
    ),
    key_regex: toStr(process.env.CACHE_CLEANUP_KEY_REGEX),
    ref: toStr(process.env.CACHE_CLEANUP_REF),
    protected_refs: toList(process.env.CACHE_CLEANUP_PROTECTED_REFS),
    unused_days: toInt(
      process.env.CACHE_CLEANUP_UNUSED_DAYS ||
        process.env.CACHE_CLEANUP_OLDER_THAN_DAYS,
      30,
    ),
    created_days: toInt(process.env.CACHE_CLEANUP_CREATED_DAYS, 0),
    min_size_mb: toNum(process.env.CACHE_CLEANUP_MIN_SIZE_MB, 0),
    keep_recent: toInt(process.env.CACHE_CLEANUP_KEEP_RECENT, 2),
    keep_total: toInt(process.env.CACHE_CLEANUP_KEEP_TOTAL, 0),
    max_delete: toInt(process.env.CACHE_CLEANUP_MAX_DELETE, 50),
    sort: toStr(process.env.CACHE_CLEANUP_SORT, "last_accessed_at"),
    direction: toStr(process.env.CACHE_CLEANUP_DIRECTION, "asc"),
    order: toStr(process.env.CACHE_CLEANUP_ORDER, "oldest").toLowerCase(),
    delete_enabled: toBool(
      process.env.CACHE_CLEANUP_DELETE || process.env.DELETE_CACHES,
      false,
    ),
    write_mode: toBool(
      process.env.CACHE_CLEANUP_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    dry_run: toBool(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    force: toBool(process.env.CACHE_CLEANUP_FORCE, false),
    protect_current_ref: toBool(
      process.env.CACHE_CLEANUP_PROTECT_CURRENT_REF,
      true,
    ),
    protect_default_ref: toBool(
      process.env.CACHE_CLEANUP_PROTECT_DEFAULT_REF,
      true,
    ),
    fail_on_error: toBool(process.env.CACHE_CLEANUP_FAIL_ON_ERROR, true),
    fail_if_empty: toBool(process.env.CACHE_CLEANUP_FAIL_IF_EMPTY, false),
    write_summary_file: toBool(process.env.CACHE_CLEANUP_WRITE_SUMMARY, true),
    print: toBool(process.env.CACHE_CLEANUP_PRINT, true),
    write_step_summary: toBool(process.env.CACHE_CLEANUP_STEP_SUMMARY, true),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = () => argv[++i];

    if (["--repo", "--repository"].includes(a)) args.repository = n();
    else if (["--id", "--ids"].includes(a)) args.ids.push(...toList(n()));
    else if (a === "--key") args.key = n();
    else if (["--key-prefix", "--key-prefixes"].includes(a))
      args.key_prefixes.push(...toList(n()));
    else if (a === "--key-regex") args.key_regex = n();
    else if (a === "--ref") args.ref = n();
    else if (["--protect-ref", "--protected-ref"].includes(a))
      args.protected_refs.push(n());
    else if (["--unused-days", "--older-than-days"].includes(a))
      args.unused_days = toInt(n(), args.unused_days);
    else if (a === "--created-days")
      args.created_days = toInt(n(), args.created_days);
    else if (a === "--min-size-mb")
      args.min_size_mb = toNum(n(), args.min_size_mb);
    else if (a === "--keep-recent")
      args.keep_recent = toInt(n(), args.keep_recent);
    else if (a === "--keep-total")
      args.keep_total = toInt(n(), args.keep_total);
    else if (a === "--max-delete")
      args.max_delete = toInt(n(), args.max_delete);
    else if (a === "--sort") args.sort = n();
    else if (a === "--direction") args.direction = n();
    else if (a === "--order") args.order = toStr(n(), args.order).toLowerCase();
    else if (a === "--delete") args.delete_enabled = true;
    else if (a === "--no-delete") args.delete_enabled = false;
    else if (a === "--write") args.write_mode = true;
    else if (a === "--no-write") args.write_mode = false;
    else if (a === "--dry-run") args.dry_run = true;
    else if (a === "--force") args.force = true;
    else if (a === "--no-protect-current-ref") args.protect_current_ref = false;
    else if (a === "--no-protect-default-ref") args.protect_default_ref = false;
    else if (a === "--fail-on-error") args.fail_on_error = true;
    else if (a === "--no-fail-on-error") args.fail_on_error = false;
    else if (a === "--fail-if-empty") args.fail_if_empty = true;
    else if (["--output", "-o"].includes(a)) args.output_file = n();
    else if (a === "--summary") {
      args.summary_file = n();
      args.write_summary_file = true;
    } else if (a === "--no-summary") args.write_summary_file = false;
    else if (a === "--no-print") args.print = false;
    else if (a === "--no-step-summary") args.write_step_summary = false;
    else if (["--help", "-h"].includes(a)) {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }

  args.ids = [...new Set(args.ids.map(String).filter(Boolean))];
  args.key_prefixes = [...new Set(args.key_prefixes)];
  args.protected_refs = [...new Set(args.protected_refs)];
  args.keep_recent = Math.max(0, args.keep_recent);
  args.keep_total = Math.max(0, args.keep_total);
  args.max_delete = Math.max(0, args.max_delete);
  args.unused_days = Math.max(0, args.unused_days);
  args.created_days = Math.max(0, args.created_days);
  args.min_size_mb = Math.max(0, args.min_size_mb);

  if (
    !["created_at", "last_accessed_at", "size_in_bytes"].includes(args.sort)
  ) {
    args.sort = "last_accessed_at";
  }

  if (!["asc", "desc"].includes(args.direction)) {
    args.direction = "asc";
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Actions Cache Cleanup

Usage:
  node .github/scripts/cache/cleanup-caches.js [options]

Examples:
  node .github/scripts/cache/cleanup-caches.js
  node .github/scripts/cache/cleanup-caches.js --unused-days 14 --delete --write
  node .github/scripts/cache/cleanup-caches.js --key-prefix aerealith-ai-v1-pnpm --delete --write

Options:
      --repo <owner/repo>          Repository slug.
      --id <id,list>               Explicit cache ID or comma-separated IDs.
      --key <key>                  Exact cache key.
      --key-prefix <prefix,list>   Cache key prefix filter.
      --key-regex <regex>          Cache key regex filter.
      --ref <ref>                  Git ref filter.
      --protect-ref <ref>          Protected ref. Repeatable.
      --unused-days <days>         Select caches unused this many days. Default: 30.
      --created-days <days>        Select caches created this many days ago.
      --min-size-mb <mb>           Select caches at least this large.
      --keep-recent <number>       Keep newest per key/ref. Default: 2.
      --keep-total <number>        Keep newest globally.
      --max-delete <number>        Max deletions in one run. Default: 50.
      --delete                     Enable deletion.
      --write                      Allow GitHub mutation.
      --dry-run                    Do not delete or write files.
      --force                      Ignore protected refs.
`);
}

function repoRoot(start = process.env.GITHUB_WORKSPACE || process.cwd()) {
  let current = path.resolve(start);

  while (current && current !== path.dirname(current)) {
    if (
      [
        ".git",
        ".github",
        "package.json",
        "pnpm-workspace.yaml",
        "nx.json",
      ].some((m) => fs.existsSync(path.join(current, m)))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(start);
}

const resolvePath = (p, root) =>
  path.isAbsolute(p) ? path.normalize(p) : path.normalize(path.join(root, p));
const posix = (p) =>
  String(p || "")
    .split(path.sep)
    .join("/");
const rel = (p, root) =>
  posix(path.relative(root, resolvePath(p, root))) || ".";

function mkdirFor(file, dryRun) {
  const dir = path.dirname(file);

  if (fs.existsSync(dir)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dir}`);
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(file, content, dryRun) {
  mkdirFor(file, dryRun);

  if (dryRun) {
    logger.info(`[dry-run] Would write ${file}.`);
  } else {
    fs.writeFileSync(file, content);
    logger.info(`Wrote ${file}.`);
  }
}

function git(args, root) {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return "";
  }
}

function gitContext(root) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      git(["rev-parse", "--abbrev-ref", "HEAD"], root),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || git(["rev-parse", "HEAD"], root),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      git(["rev-parse", "--short=12", "HEAD"], root),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      git(["rev-parse", "--abbrev-ref", "HEAD"], root) ||
      DEFAULT_BRANCH,
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
  };
}

function splitRepo(repository) {
  const [owner, repo] = toStr(repository, DEFAULT_REPOSITORY).split("/");

  if (!owner || !repo) {
    throw new Error(
      `Repository must use owner/name format. Received: ${repository}`,
    );
  }

  return { owner, repo, slug: `${owner}/${repo}` };
}

function token() {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.PROJECTS_PAT ||
    process.env.GITHUB_PAT ||
    ""
  );
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function apiUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  return `${GITHUB_API_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function withQuery(endpoint, params) {
  const pairs = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );

  if (!pairs.length) return endpoint;

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${pairs
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&")}`;
}

function linkHeader(header) {
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(",")
      .map((part) => {
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
        return match ? [match[2], match[1]] : [null, null];
      })
      .filter(([key]) => Boolean(key)),
  );
}

async function gh(endpoint, options = {}) {
  if (options.require_token !== false && !token()) {
    throw new Error(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, PROJECTS_PAT, or GITHUB_PAT.",
    );
  }

  const method = toStr(options.method, "GET").toUpperCase();

  const response = await fetch(apiUrl(endpoint), {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "aerealith-ai-cache-cleanup",
      ...(options.json === false ? {} : { "Content-Type": "application/json" }),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? parseJson(text, text) : null;

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

  return { status: response.status, headers: response.headers, data };
}

async function pages(endpoint) {
  const items = [];
  let total = null;
  let next = endpoint;

  for (let page = 0; next && page < 100; page += 1) {
    const response = await gh(next);

    if (Number.isFinite(Number(response.data?.total_count))) {
      total = Number(response.data.total_count);
    }

    if (Array.isArray(response.data?.actions_caches)) {
      items.push(...response.data.actions_caches);
    } else if (Array.isArray(response.data?.items)) {
      items.push(...response.data.items);
    } else if (Array.isArray(response.data)) {
      items.push(...response.data);
    }

    const links = linkHeader(response.headers?.get?.("link"));
    next = links.next || null;
  }

  return { total_count: total ?? items.length, items };
}

async function usage(repository) {
  const { owner, repo } = splitRepo(repository);

  try {
    return (await gh(`/repos/${owner}/${repo}/actions/cache/usage`)).data;
  } catch (err) {
    logger.warn(`Could not read cache usage: ${logger.formatError(err)}`);
    return null;
  }
}

async function listCaches(args) {
  const { owner, repo } = splitRepo(args.repository);

  const endpoint = withQuery(`/repos/${owner}/${repo}/actions/caches`, {
    per_page: 100,
    key: args.key,
    ref: args.ref,
    sort: args.sort,
    direction: args.direction,
  });

  const response = await pages(endpoint);

  return {
    total_count: response.total_count,
    caches: response.items.map(cacheRecord),
  };
}

function cacheRecord(cache) {
  const size = Number(cache.size_in_bytes || 0);
  const created = toStr(cache.created_at);
  const accessed = toStr(cache.last_accessed_at || cache.created_at);

  return {
    id: String(cache.id || ""),
    key: toStr(cache.key),
    ref: toStr(cache.ref),
    version: toStr(cache.version),
    created_at: created,
    last_accessed_at: accessed,
    size_in_bytes: size,
    size_human: bytes(size),
    age_days: daysSince(created),
    unused_days: daysSince(accessed),
  };
}

function bytes(value) {
  const n = Number(value || 0);

  if (n < 1024) return `${n} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = n / 1024;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

function daysSince(timestamp) {
  const time = Date.parse(timestamp || "");

  return Number.isFinite(time)
    ? Math.max(0, Math.floor((Date.now() - time) / 86400000))
    : null;
}

function refVariants(ref) {
  const value = toStr(ref);

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

function protectedRefs(args, ctx) {
  const refs = new Set();
  const add = (ref) => refVariants(ref).forEach((variant) => refs.add(variant));

  args.protected_refs.forEach(add);

  if (args.protect_default_ref) {
    add(DEFAULT_BRANCH);
    add(ctx.base_branch || DEFAULT_BRANCH);
  }

  if (args.protect_current_ref) {
    add(ctx.ref);
    add(ctx.ref_name);
    add(ctx.branch);
  }

  return [...refs].filter(Boolean);
}

function cacheRefProtected(cache, refs) {
  return refVariants(cache.ref).some((ref) => refs.includes(ref));
}

function regexMatch(value, pattern) {
  if (!pattern) return true;

  return String(value || "").includes(String(pattern));
}

function selected(cache, args) {
  if (args.ids.length) return args.ids.includes(cache.id);
  if (args.key && cache.key !== args.key) return false;
  if (
    args.key_prefixes.length &&
    !args.key_prefixes.some((prefix) => cache.key.startsWith(prefix))
  )
    return false;
  if (args.key_regex && !regexMatch(cache.key, args.key_regex)) return false;

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

  return true;
}

function newestFirst(caches) {
  return [...caches].sort((a, b) => {
    const left = Date.parse(a.last_accessed_at || a.created_at || "") || 0;
    const right = Date.parse(b.last_accessed_at || b.created_at || "") || 0;

    return right - left;
  });
}

function deleteOrder(caches, args) {
  return [...caches].sort((a, b) => {
    if (args.order === "largest" && b.size_in_bytes !== a.size_in_bytes) {
      return b.size_in_bytes - a.size_in_bytes;
    }

    const left = Date.parse(a.last_accessed_at || a.created_at || "") || 0;
    const right = Date.parse(b.last_accessed_at || b.created_at || "") || 0;

    return left - right || b.size_in_bytes - a.size_in_bytes;
  });
}

function keepSet(caches, args) {
  const keep = new Set();

  if (args.keep_recent > 0) {
    const groups = new Map();

    for (const cache of caches) {
      const key = `${cache.ref}\0${cache.key}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cache);
    }

    for (const group of groups.values()) {
      newestFirst(group)
        .slice(0, args.keep_recent)
        .forEach((cache) => keep.add(cache.id));
    }
  }

  if (args.keep_total > 0) {
    newestFirst(caches)
      .slice(0, args.keep_total)
      .forEach((cache) => keep.add(cache.id));
  }

  return keep;
}

function reason(cache, args) {
  const parts = [];

  if (args.ids.length) parts.push("explicit cache ID selected");
  if (args.key) parts.push(`key matches \`${args.key}\``);
  if (args.key_prefixes.length) parts.push("key prefix matched");
  if (args.key_regex) parts.push("key regex matched");
  if (args.ref) parts.push(`ref matches \`${args.ref}\``);
  if (args.unused_days > 0)
    parts.push(`unused for ${cache.unused_days} day(s)`);
  if (args.created_days > 0) parts.push(`created ${cache.age_days} day(s) ago`);
  if (args.min_size_mb > 0) parts.push(`size ${cache.size_human}`);

  return parts.join("; ") || "matched cleanup policy";
}

const candidate = (cache, why, protectedReason = "") => ({
  ...cache,
  reason: why,
  protected: Boolean(protectedReason),
  protected_reason: protectedReason,
});

function planCleanup(caches, args, ctx) {
  const refs = protectedRefs(args, ctx);
  const keep = keepSet(caches, args);
  const planned = [];
  const protectedItems = [];
  const kept = [];
  const ignored = [];

  for (const cache of caches) {
    if (!selected(cache, args)) {
      ignored.push(candidate(cache, "Cache did not match cleanup policy."));
      continue;
    }

    if (!args.force && cacheRefProtected(cache, refs)) {
      protectedItems.push(
        candidate(cache, reason(cache, args), "Cache ref is protected."),
      );
      continue;
    }

    if (!args.ids.length && keep.has(cache.id)) {
      kept.push(candidate(cache, "Cache is inside keep policy."));
      continue;
    }

    planned.push(candidate(cache, reason(cache, args)));
  }

  const ordered = deleteOrder(planned, args);

  return {
    protected_refs: refs,
    planned: args.max_delete > 0 ? ordered.slice(0, args.max_delete) : ordered,
    overflow: args.max_delete > 0 ? ordered.slice(args.max_delete) : [],
    protected: protectedItems,
    kept,
    ignored,
  };
}

async function deleteCache(repository, cache) {
  const { owner, repo } = splitRepo(repository);

  const response = await gh(
    `/repos/${owner}/${repo}/actions/caches/${encodeURIComponent(cache.id)}`,
    {
      method: "DELETE",
    },
  );

  return {
    id: cache.id,
    key: cache.key,
    ref: cache.ref,
    size_in_bytes: cache.size_in_bytes,
    size_human: cache.size_human,
    status: response.status,
    deleted: true,
  };
}

async function execute(plan, args) {
  const deleted = [];
  const failed = [];

  if (!args.delete_enabled) {
    return {
      attempted: false,
      skipped: true,
      reason:
        "Deletion disabled. Pass --delete or set CACHE_CLEANUP_DELETE=true.",
      deleted,
      failed,
    };
  }

  if (args.dry_run) {
    return {
      attempted: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      deleted,
      failed,
    };
  }

  if (!args.write_mode) {
    return {
      attempted: false,
      skipped: true,
      reason: "Write mode is disabled. Pass --write or set WRITE_MODE=true.",
      deleted,
      failed,
    };
  }

  for (const cache of plan.planned) {
    try {
      deleted.push(await deleteCache(args.repository, cache));
      logger.info(`Deleted cache ${cache.id}: ${cache.key}`);
    } catch (err) {
      const failure = {
        id: cache.id,
        key: cache.key,
        ref: cache.ref,
        size_in_bytes: cache.size_in_bytes,
        size_human: cache.size_human,
        deleted: false,
        error: logger.formatError(err),
      };

      failed.push(failure);
      logger.warn(`Failed to delete cache ${cache.id}: ${failure.error}`);
    }
  }

  return {
    attempted: true,
    skipped: false,
    dry_run: false,
    reason: failed.length
      ? "Cleanup completed with errors."
      : "Cleanup completed.",
    deleted,
    failed,
  };
}

const sizeOf = (items) =>
  items.reduce((sum, item) => sum + Number(item.size_in_bytes || 0), 0);

function buildOutput(args, ctx, before, after, listed, plan, result) {
  const plannedSize = sizeOf(plan.planned);
  const deletedSize = sizeOf(result.deleted);

  return {
    schema_version: 1,
    type: "cache-cleanup",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: ctx,
    config: {
      ids: args.ids,
      key: args.key || null,
      key_prefixes: args.key_prefixes,
      key_regex: args.key_regex || null,
      ref: args.ref || null,
      protected_refs: plan.protected_refs,
      unused_days: args.unused_days,
      created_days: args.created_days,
      min_size_mb: args.min_size_mb,
      keep_recent: args.keep_recent,
      keep_total: args.keep_total,
      max_delete: args.max_delete,
      delete_enabled: args.delete_enabled,
      write_mode: args.write_mode,
      dry_run: args.dry_run,
      force: args.force,
    },
    usage: { before, after },
    totals: {
      scanned: listed.caches.length,
      planned: plan.planned.length,
      deleted: result.deleted.length,
      failed: result.failed.length,
      protected: plan.protected.length,
      kept: plan.kept.length,
      ignored: plan.ignored.length,
      overflow: plan.overflow.length,
      scanned_size_bytes: sizeOf(listed.caches),
      scanned_size_human: bytes(sizeOf(listed.caches)),
      planned_size_bytes: plannedSize,
      planned_size_human: bytes(plannedSize),
      deleted_size_bytes: deletedSize,
      deleted_size_human: bytes(deletedSize),
    },
    caches: {
      total_count_reported_by_github: listed.total_count,
      scanned: listed.caches,
      planned: plan.planned,
      protected: plan.protected,
      kept: plan.kept,
      overflow: plan.overflow,
    },
    result,
    status: result.failed.length ? "failed" : "completed",
  };
}

function trunc(value, max = 64) {
  const source = String(value || "");

  return source.length <= max ? source : `${source.slice(0, max - 1)}…`;
}

function markdown(output) {
  const lines = [
    `# 🧹 ${PROJECT_NAME} Cache Cleanup`,
    "",
    `Generated: \`${output.created_at}\``,
    "",
    "## 📊 Totals",
    "",
    `- Caches scanned: \`${output.totals.scanned}\``,
    `- Planned deletions: \`${output.totals.planned}\``,
    `- Deleted: \`${output.totals.deleted}\``,
    `- Failed: \`${output.totals.failed}\``,
    `- Protected: \`${output.totals.protected}\``,
    `- Kept: \`${output.totals.kept}\``,
    `- Planned size: \`${output.totals.planned_size_human}\``,
    `- Deleted size: \`${output.totals.deleted_size_human}\``,
    "",
    "## 🗑️ Planned Deletions",
    "",
  ];

  if (!output.caches.planned.length) {
    lines.push("No caches matched the cleanup policy.");
  } else {
    lines.push(
      "| ID | Ref | Key | Last Accessed | Size | Reason |",
      "|---:|---|---|---|---:|---|",
    );

    for (const cache of output.caches.planned.slice(0, 100)) {
      lines.push(
        `| \`${cache.id}\` | \`${cache.ref}\` | \`${trunc(cache.key)}\` | \`${cache.last_accessed_at || "unknown"}\` | \`${cache.size_human}\` | ${cache.reason} |`,
      );
    }
  }

  if (output.caches.protected.length) {
    lines.push(
      "",
      "## 🛡️ Protected Caches",
      "",
      "| ID | Ref | Key | Reason |",
      "|---:|---|---|---|",
    );

    for (const cache of output.caches.protected.slice(0, 50)) {
      lines.push(
        `| \`${cache.id}\` | \`${cache.ref}\` | \`${trunc(cache.key)}\` | ${cache.protected_reason} |`,
      );
    }
  }

  if (output.result.failed.length) {
    lines.push(
      "",
      "## ❌ Delete Failures",
      "",
      "| ID | Ref | Key | Error |",
      "|---:|---|---|---|",
    );

    for (const failure of output.result.failed) {
      lines.push(
        `| \`${failure.id}\` | \`${failure.ref}\` | \`${trunc(failure.key)}\` | ${failure.error} |`,
      );
    }
  }

  lines.push("", "## ⚙️ Policy", "");
  lines.push(`- Unused days: \`${output.config.unused_days}\``);
  lines.push(`- Created days: \`${output.config.created_days}\``);
  lines.push(`- Keep recent per key/ref: \`${output.config.keep_recent}\``);
  lines.push(`- Max delete: \`${output.config.max_delete}\``);
  lines.push(
    `- Protected refs: ${output.config.protected_refs.length ? output.config.protected_refs.map((ref) => `\`${ref}\``).join(", ") : "none"}`,
  );

  return `${lines.join("\n").trim()}\n`;
}

function appendSummary(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text.trim()}\n\n`);
}

function ghOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;

  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${typeof value === "string" ? value : JSON.stringify(value)}\nEOF\n`,
  );
}

function writeGhOutputs(output, args, root) {
  ghOutput("cache_cleanup_file", rel(args.output_file, root));
  ghOutput(
    "cache_cleanup_summary_file",
    args.write_summary_file ? rel(args.summary_file, root) : "",
  );
  ghOutput("cache_cleanup_status", output.status);
  ghOutput("cache_cleanup_scanned", String(output.totals.scanned));
  ghOutput("cache_cleanup_planned", String(output.totals.planned));
  ghOutput("cache_cleanup_deleted", String(output.totals.deleted));
  ghOutput("cache_cleanup_failed", String(output.totals.failed));
  ghOutput(
    "cache_cleanup_planned_size_bytes",
    String(output.totals.planned_size_bytes),
  );
  ghOutput(
    "cache_cleanup_deleted_size_bytes",
    String(output.totals.deleted_size_bytes),
  );
}

async function main() {
  const args = parseArgs();
  const root = repoRoot();
  const ctx = gitContext(root);
  const outputFile = resolvePath(args.output_file, root);
  const summaryFile = resolvePath(args.summary_file, root);

  logger.info("Listing GitHub Actions caches.");

  const before = await usage(args.repository);
  const listed = await listCaches(args);

  if (args.fail_if_empty && listed.caches.length === 0) {
    process.exitCode = 1;
  }

  const plan = planCleanup(listed.caches, args, ctx);
  logger.info(`Planned ${plan.planned.length} cache deletion(s).`);

  const result = await execute(plan, args);
  const after = result.deleted.length ? await usage(args.repository) : null;
  const output = buildOutput(args, ctx, before, after, listed, plan, result);
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const md = markdown(output);

  writeFile(outputFile, json, args.dry_run);

  if (args.write_summary_file) {
    writeFile(summaryFile, md, args.dry_run);
  }

  writeGhOutputs(output, args, root);

  if (args.write_step_summary) {
    appendSummary(md);
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && result.failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
