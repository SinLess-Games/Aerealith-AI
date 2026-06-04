#!/usr/bin/env node
// .github/scripts/cloudflare/sync-r2.js
// Aerealith AI — Cloudflare R2 Synchronizer
// CommonJS only. No external dependencies.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const childProcess = require("node:child_process");

let logger;
try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (m) => console.log(`[cloudflare-r2] ${m}`),
    warn: (m) => console.warn(`[cloudflare-r2] WARN: ${m}`),
    error: (m) => console.error(`[cloudflare-r2] ERROR: ${m}`),
    debug: () => {},
    dump: () => {},
    formatError: (e) =>
      e
        ? typeof e === "string"
          ? e
          : e.message || String(e)
        : "unknown error",
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/sync-r2.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/sync-r2.md";
const API_BASE = "https://api.cloudflare.com/client/v4";
const TRUE = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE = new Set(["false", "0", "no", "n", "off", "disabled"]);
const STAGES = new Set(["preview", "staging", "production"]);
const SECRET_RE =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;
const CONFIG_CANDIDATES = [
  ".github/cloudflare/r2-sync.json",
  ".github/cloudflare/r2-sync.jsonc",
  ".github/cloudflare/r2-sync.yaml",
  ".github/cloudflare/r2-sync.yml",
  "cloudflare/r2-sync.json",
  "cloudflare/r2-sync.jsonc",
  "cloudflare/r2-sync.yaml",
  "cloudflare/r2-sync.yml",
];
const DEFAULT_EXCLUDES = [
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

const s = (v, f = "") =>
  v === undefined || v === null ? f : String(v).trim() || f;
const b = (v, f = false) => {
  if (v === undefined || v === null || v === "") return f;
  if (typeof v === "boolean") return v;
  const n = String(v).trim().toLowerCase();
  if (TRUE.has(n)) return true;
  if (FALSE.has(n)) return false;
  return f;
};
const i = (v, f = 0) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : f;
};
const list = (v) => {
  if (v === undefined || v === null || v === "") return [];
  const raw = Array.isArray(v) ? v : String(v).split(",");
  return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
};
const redact = (v) => String(v || "").replace(SECRET_RE, "[REDACTED]");
const posix = (p) =>
  String(p || "")
    .split(path.sep)
    .join("/");
const jsonParse = (txt, fallback = null) => {
  try {
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
};
const stripJsonc = (txt) =>
  String(txt || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
const val = (argv, idx, arg) => {
  const out = argv[idx + 1];
  if (out === undefined || String(out).startsWith("--"))
    throw new Error(`Missing value for argument: ${arg}`);
  return out;
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    config_file: process.env.CLOUDFLARE_R2_SYNC_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_R2_SYNC_TARGETS_FILE || DEFAULT_TARGETS_FILE,
    output_file:
      process.env.CLOUDFLARE_R2_SYNC_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_R2_SYNC_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    environment:
      process.env.CLOUDFLARE_R2_SYNC_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,
    deployment_stage:
      process.env.CLOUDFLARE_R2_SYNC_STAGE ||
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_STAGE ||
      "",
    deployment_alias:
      process.env.CLOUDFLARE_R2_SYNC_ALIAS ||
      process.env.CLOUDFLARE_DEPLOYMENT_ALIAS ||
      process.env.CLOUDFLARE_PREVIEW_ALIAS ||
      "",
    preview_ref: process.env.CLOUDFLARE_PREVIEW_REF || "",
    pull_request_number: process.env.CLOUDFLARE_PULL_REQUEST_NUMBER || "",
    project_name:
      process.env.CLOUDFLARE_PROJECT_NAME ||
      process.env.CLOUDFLARE_PAGES_PROJECT_NAME ||
      "",
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
    include_buckets: list(process.env.CLOUDFLARE_R2_SYNC_INCLUDE_BUCKETS),
    exclude_buckets: list(process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_BUCKETS),
    include_bindings: list(process.env.CLOUDFLARE_R2_SYNC_INCLUDE_BINDINGS),
    exclude_bindings: list(process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_BINDINGS),
    include_targets: list(process.env.CLOUDFLARE_R2_SYNC_INCLUDE_TARGETS),
    exclude_targets: list(process.env.CLOUDFLARE_R2_SYNC_EXCLUDE_TARGETS),
    exclude: list(process.env.CLOUDFLARE_R2_SYNC_EXCLUDE),
    create_missing: b(process.env.CLOUDFLARE_R2_SYNC_CREATE_MISSING, true),
    update_existing: b(process.env.CLOUDFLARE_R2_SYNC_UPDATE_EXISTING, false),
    sync_objects: b(process.env.CLOUDFLARE_R2_SYNC_OBJECTS, true),
    compare_objects: b(process.env.CLOUDFLARE_R2_SYNC_COMPARE_OBJECTS, true),
    delete_missing: b(process.env.CLOUDFLARE_R2_SYNC_DELETE_MISSING, false),
    require_account_id: b(
      process.env.CLOUDFLARE_R2_SYNC_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_credentials: b(
      process.env.CLOUDFLARE_R2_SYNC_REQUIRE_CREDENTIALS,
      true,
    ),
    allow_empty_source: b(
      process.env.CLOUDFLARE_R2_SYNC_ALLOW_EMPTY_SOURCE,
      true,
    ),
    allow_empty_plan: b(process.env.CLOUDFLARE_R2_SYNC_ALLOW_EMPTY_PLAN, false),
    fail_if_empty: b(process.env.CLOUDFLARE_R2_SYNC_FAIL_IF_EMPTY, false),
    fail_on_error: b(process.env.CLOUDFLARE_R2_SYNC_FAIL_ON_ERROR, true),
    continue_on_error: b(
      process.env.CLOUDFLARE_R2_SYNC_CONTINUE_ON_ERROR,
      true,
    ),
    max_buckets: i(process.env.CLOUDFLARE_R2_SYNC_MAX_BUCKETS, 0),
    max_objects: i(process.env.CLOUDFLARE_R2_SYNC_MAX_OBJECTS, 0),
    retry_count: i(process.env.CLOUDFLARE_R2_SYNC_RETRY_COUNT, 2),
    timeout_minutes: i(process.env.CLOUDFLARE_R2_SYNC_TIMEOUT_MINUTES, 20),
    max_buffer_mb: i(process.env.CLOUDFLARE_R2_SYNC_MAX_BUFFER_MB, 64),
    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager: process.env.CLOUDFLARE_R2_SYNC_PACKAGE_MANAGER || "auto",
    dry_run: b(
      process.env.CLOUDFLARE_R2_SYNC_DRY_RUN ||
        process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: b(process.env.CLOUDFLARE_R2_SYNC_WRITE_SUMMARY, true),
    print: b(process.env.CLOUDFLARE_R2_SYNC_PRINT, true),
    write_step_summary: b(process.env.CLOUDFLARE_R2_SYNC_STEP_SUMMARY, true),
  };
  const valueOpts = new Map([
    ["--repo", "repository"],
    ["--repository", "repository"],
    ["--config", "config_file"],
    ["--targets", "cloudflare_targets_file"],
    ["--cloudflare-targets", "cloudflare_targets_file"],
    ["--environment", "environment"],
    ["--env", "environment"],
    ["--stage", "deployment_stage"],
    ["--deployment-stage", "deployment_stage"],
    ["--alias", "deployment_alias"],
    ["--deployment-alias", "deployment_alias"],
    ["--preview-ref", "preview_ref"],
    ["--pull-request-number", "pull_request_number"],
    ["--pr-number", "pull_request_number"],
    ["--project-name", "project_name"],
    ["--account-id", "account_id"],
    ["--bucket-id", "bucket_id"],
    ["--bucket", "bucket_name"],
    ["--bucket-name", "bucket_name"],
    ["--binding", "binding"],
    ["--source", "source"],
    ["--source-key", "source_key"],
    ["--prefix", "prefix"],
    ["--retry-count", "retry_count"],
    ["--timeout-minutes", "timeout_minutes"],
    ["--max-buckets", "max_buckets"],
    ["--max-objects", "max_objects"],
    ["--wrangler-command", "wrangler_command"],
    ["--package-manager", "package_manager"],
    ["--output", "output_file"],
    ["-o", "output_file"],
    ["--summary", "summary_file"],
  ]);
  const listOpts = new Map([
    ["--include-bucket", "include_buckets"],
    ["--include-buckets", "include_buckets"],
    ["--exclude-bucket", "exclude_buckets"],
    ["--exclude-buckets", "exclude_buckets"],
    ["--include-binding", "include_bindings"],
    ["--include-bindings", "include_bindings"],
    ["--exclude-binding", "exclude_bindings"],
    ["--exclude-bindings", "exclude_bindings"],
    ["--include-target", "include_targets"],
    ["--include-targets", "include_targets"],
    ["--exclude-target", "exclude_targets"],
    ["--exclude-targets", "exclude_targets"],
    ["--exclude", "exclude"],
  ]);
  const boolOpts = {
    "--create-missing": ["create_missing", true],
    "--no-create-missing": ["create_missing", false],
    "--update-existing": ["update_existing", true],
    "--no-update-existing": ["update_existing", false],
    "--sync-objects": ["sync_objects", true],
    "--no-sync-objects": ["sync_objects", false],
    "--compare-objects": ["compare_objects", true],
    "--no-compare-objects": ["compare_objects", false],
    "--delete-missing": ["delete_missing", true],
    "--no-delete-missing": ["delete_missing", false],
    "--require-account-id": ["require_account_id", true],
    "--no-require-account-id": ["require_account_id", false],
    "--require-credentials": ["require_credentials", true],
    "--no-require-credentials": ["require_credentials", false],
    "--allow-empty-source": ["allow_empty_source", true],
    "--no-allow-empty-source": ["allow_empty_source", false],
    "--allow-empty-plan": ["allow_empty_plan", true],
    "--fail-if-empty": ["fail_if_empty", true],
    "--fail-on-error": ["fail_on_error", true],
    "--no-fail-on-error": ["fail_on_error", false],
    "--continue-on-error": ["continue_on_error", true],
    "--no-continue-on-error": ["continue_on_error", false],
    "--dry-run": ["dry_run", true],
    "--no-summary": ["write_summary_file", false],
    "--no-print": ["print", false],
    "--no-step-summary": ["write_step_summary", false],
  };
  for (let n = 0; n < argv.length; n += 1) {
    const a = argv[n];
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
    if (valueOpts.has(a)) {
      const k = valueOpts.get(a),
        v = val(argv, n, a);
      args[k] =
        k.startsWith("max_") || k === "retry_count" || k === "timeout_minutes"
          ? i(v, args[k])
          : v;
      if (k === "summary_file") args.write_summary_file = true;
      n += 1;
      continue;
    }
    if (listOpts.has(a)) {
      args[listOpts.get(a)].push(...list(val(argv, n, a)));
      n += 1;
      continue;
    }
    if (boolOpts[a]) {
      args[boolOpts[a][0]] = boolOpts[a][1];
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  args.environment = s(args.environment, DEFAULT_ENVIRONMENT).toLowerCase();
  args.deployment_stage = s(
    args.deployment_stage || args.environment,
  ).toLowerCase();
  if (
    STAGES.has(args.deployment_stage) &&
    (!args.environment || args.environment === DEFAULT_ENVIRONMENT)
  )
    args.environment = args.deployment_stage;
  args.exclude = [...new Set([...DEFAULT_EXCLUDES, ...args.exclude])];
  for (const k of [
    "include_buckets",
    "exclude_buckets",
    "include_bindings",
    "exclude_bindings",
    "include_targets",
    "exclude_targets",
  ])
    args[k] = [...new Set(args[k])];
  args.package_manager = s(args.package_manager, "auto").toLowerCase();
  args.max_buckets = Math.max(0, args.max_buckets);
  args.max_objects = Math.max(0, args.max_objects);
  args.retry_count = Math.max(0, args.retry_count);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);
  return args;
}

function printHelp() {
  console.log(`Aerealith AI Cloudflare R2 Synchronizer

Usage:
  node .github/scripts/cloudflare/sync-r2.js [options]

Common:
  --environment <name> --stage <preview|staging|production> --bucket <name>
  --binding <name> --source <file|dir> --prefix <prefix>
  --output <file> --summary <file> --dry-run
`);
}

function repoRoot(start = process.env.GITHUB_WORKSPACE || process.cwd()) {
  let cur = path.resolve(start);
  while (cur && cur !== path.dirname(cur)) {
    if (
      [
        ".git",
        ".github",
        "package.json",
        "pnpm-workspace.yaml",
        "nx.json",
      ].some((m) => fs.existsSync(path.join(cur, m)))
    )
      return cur;
    cur = path.dirname(cur);
  }
  return path.resolve(start);
}
const abs = (p, root) =>
  !p
    ? root
    : path.isAbsolute(p)
      ? path.normalize(p)
      : path.normalize(path.join(root, p));
const rel = (p, root) => posix(path.relative(root, abs(p, root))) || ".";
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
function mkdirp(dir, dry) {
  if (!fs.existsSync(dir) && !dry) fs.mkdirSync(dir, { recursive: true });
}
function writeFile(file, content, dry) {
  mkdirp(path.dirname(file), dry);
  if (dry) logger.info(`[dry-run] Would write ${file}.`);
  else fs.writeFileSync(file, content);
}
function git(cmd, root) {
  try {
    return childProcess
      .execFileSync("git", cmd, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return "";
  }
}
function gitMeta(root) {
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
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function yamlScalar(v) {
  const x = s(v);
  if (!x) return "";
  if (x === "true") return true;
  if (x === "false") return false;
  if (x === "null") return null;
  if (/^-?\d+$/.test(x)) return Number(x);
  if (
    (x.startsWith('"') && x.endsWith('"')) ||
    (x.startsWith("'") && x.endsWith("'"))
  )
    return x.slice(1, -1);
  if (x.startsWith("[") && x.endsWith("]"))
    return x
      .slice(1, -1)
      .split(",")
      .map((y) => yamlScalar(y.trim()))
      .filter((y) => y !== "");
  return x;
}
function stripYamlComment(line) {
  let sq = false,
    dq = false;
  for (let n = 0; n < line.length; n += 1) {
    const c = line[n],
      p = line[n - 1];
    if (c === "'" && !dq) sq = !sq;
    if (c === '"' && !sq && p !== "\\") dq = !dq;
    if (c === "#" && !sq && !dq) return line.slice(0, n).trimEnd();
  }
  return line.trimEnd();
}
function parseYaml(text) {
  const cfg = {},
    buckets = [];
  let section = "",
    current = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = stripYamlComment(raw);
    if (!line.trim()) continue;
    const indent = line.match(/^(\s*)/)?.[1].length || 0,
      t = line.trim();
    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(t)) {
      section = t.replace(/:\s*$/, "");
      if (["buckets", "r2_buckets"].includes(section)) cfg.buckets = buckets;
      current = null;
      continue;
    }
    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(t)) {
      const [, k, v] = t.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      cfg[k] = yamlScalar(v);
      continue;
    }
    if (["buckets", "r2_buckets"].includes(section) && /^-\s*/.test(t)) {
      current = {};
      buckets.push(current);
      const rest = t.replace(/^-\s*/, "");
      if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, k, v] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        current[k] = yamlScalar(v);
      }
      continue;
    }
    if (current && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(t)) {
      const [, k, v] = t.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      current[k] = yamlScalar(v);
    }
  }
  return cfg;
}
function readConfig(file, root) {
  const p = abs(file, root);
  if (!isFile(p)) return null;
  const ext = path.extname(p).toLowerCase(),
    txt = fs.readFileSync(p, "utf8");
  if ([".json", ".jsonc"].includes(ext))
    return jsonParse(stripJsonc(txt), null);
  if ([".yaml", ".yml"].includes(ext)) return parseYaml(txt);
  return jsonParse(stripJsonc(txt), null);
}
function readJson(file, root, fallback = null) {
  const p = abs(file, root);
  return isFile(p)
    ? jsonParse(stripJsonc(fs.readFileSync(p, "utf8")), fallback)
    : fallback;
}
function findConfig(args, root) {
  if (args.config_file)
    return isFile(abs(args.config_file, root))
      ? rel(args.config_file, root)
      : args.config_file;
  return CONFIG_CANDIDATES.find((x) => isFile(abs(x, root))) || "";
}

function safeId(v) {
  return (
    s(v, "r2-sync")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "r2-sync"
  );
}
function bucketName(v) {
  return s(v)
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function envValue(obj, args, ...keys) {
  const envs = obj.environments || obj.env || {};
  for (const env of [args.environment, args.deployment_stage].filter(Boolean))
    if (envs && typeof envs === "object" && envs[env])
      for (const k of keys) if (envs[env][k] !== undefined) return envs[env][k];
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return "";
}
function normPlan(item, args, sourceType = "config") {
  const name = bucketName(
    envValue(item, args, "bucket_name", "bucketName", "name"),
  );
  const id = s(envValue(item, args, "bucket_id", "bucketId", "id"));
  const binding = s(
    envValue(item, args, "binding", "binding_name", "bindingName"),
  );
  return {
    id: safeId(
      `${sourceType}-${args.deployment_stage || args.environment}-${name || binding || id || "r2"}`,
    ),
    source_type: sourceType,
    target_name: s(item.target_name || item.target || ""),
    environment: args.environment,
    deployment_stage: args.deployment_stage,
    deployment_alias: args.deployment_alias,
    bucket_id: id,
    bucket_name: name,
    binding,
    source: s(envValue(item, args, "source", "directory", "file"), args.source),
    source_key: s(
      envValue(item, args, "source_key", "sourceKey"),
      args.source_key,
    ),
    prefix: s(envValue(item, args, "prefix"), args.prefix),
    create_missing: b(
      envValue(item, args, "create_missing", "createMissing"),
      args.create_missing,
    ),
    update_existing: b(
      envValue(item, args, "update_existing", "updateExisting"),
      args.update_existing,
    ),
    sync_objects: b(
      envValue(item, args, "sync_objects", "syncObjects"),
      args.sync_objects,
    ),
    compare_objects: b(
      envValue(item, args, "compare_objects", "compareObjects"),
      args.compare_objects,
    ),
    delete_missing: b(
      envValue(item, args, "delete_missing", "deleteMissing"),
      args.delete_missing,
    ),
    public_access: b(
      envValue(item, args, "public_access", "publicAccess"),
      false,
    ),
    enabled: b(envValue(item, args, "enabled"), true),
  };
}
function plansFromConfig(cfg, args) {
  if (!cfg) return [];
  const buckets = [
    ...(Array.isArray(cfg.buckets) ? cfg.buckets : []),
    ...(Array.isArray(cfg.r2_buckets) ? cfg.r2_buckets : []),
    ...(Array.isArray(cfg.r2Buckets) ? cfg.r2Buckets : []),
  ];
  if (cfg.bucket && typeof cfg.bucket === "object") buckets.push(cfg.bucket);
  if (
    !buckets.length &&
    (cfg.bucket_id ||
      cfg.bucketId ||
      cfg.bucket_name ||
      cfg.name ||
      cfg.binding)
  )
    buckets.push(cfg);
  return buckets.map((x) => normPlan(x, args, "config"));
}
function plansFromTargets(data, args) {
  if (!data) return [];
  const out = [];
  for (const target of Array.isArray(data.targets) ? data.targets : []) {
    const targetName = s(target.name);
    if (
      args.include_targets.length &&
      !args.include_targets.includes(targetName)
    )
      continue;
    if (args.exclude_targets.includes(targetName)) continue;
    const raw = target.raw_config || target.config || {};
    const buckets = [
      ...(Array.isArray(target.r2_buckets) ? target.r2_buckets : []),
      ...(Array.isArray(target.r2Buckets) ? target.r2Buckets : []),
      ...(Array.isArray(target.resources?.r2_buckets)
        ? target.resources.r2_buckets
        : []),
      ...(Array.isArray(raw.r2_buckets) ? raw.r2_buckets : []),
    ];
    for (const bucket of buckets)
      out.push(
        normPlan(
          {
            ...bucket,
            target_name: targetName,
            source: bucket.source || args.source,
            source_key: bucket.source_key || args.source_key,
            prefix: bucket.prefix || args.prefix,
          },
          args,
          "cloudflare-targets",
        ),
      );
  }
  return out;
}
function directPlan(args) {
  return !args.bucket_id && !args.bucket_name && !args.binding && !args.source
    ? null
    : normPlan(
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
function matchesFilters(p, args) {
  const keys = [p.bucket_id, p.bucket_name].filter(Boolean);
  if (!p.enabled) return false;
  if (
    args.include_buckets.length &&
    !keys.some((x) => args.include_buckets.includes(x))
  )
    return false;
  if (keys.some((x) => args.exclude_buckets.includes(x))) return false;
  if (
    args.include_bindings.length &&
    !args.include_bindings.includes(p.binding)
  )
    return false;
  if (args.exclude_bindings.includes(p.binding)) return false;
  if (
    args.include_targets.length &&
    p.target_name &&
    !args.include_targets.includes(p.target_name)
  )
    return false;
  if (args.exclude_targets.includes(p.target_name)) return false;
  return true;
}
function dedupePlans(plans) {
  const seen = new Map();
  for (const p of plans) {
    const key = p.bucket_id || p.bucket_name || p.binding;
    if (!key) continue;
    seen.set(
      key,
      seen.has(key)
        ? {
            ...seen.get(key),
            ...p,
            bucket_id: p.bucket_id || seen.get(key).bucket_id,
            bucket_name: p.bucket_name || seen.get(key).bucket_name,
            binding: p.binding || seen.get(key).binding,
            source: p.source || seen.get(key).source,
            prefix: p.prefix || seen.get(key).prefix,
            create_missing: seen.get(key).create_missing || p.create_missing,
            update_existing: seen.get(key).update_existing || p.update_existing,
            sync_objects: seen.get(key).sync_objects || p.sync_objects,
            compare_objects: seen.get(key).compare_objects || p.compare_objects,
            delete_missing: seen.get(key).delete_missing || p.delete_missing,
          }
        : p,
    );
  }
  return [...seen.values()].sort(
    (a, z) =>
      a.environment.localeCompare(z.environment) ||
      (a.bucket_name || a.binding || a.bucket_id).localeCompare(
        z.bucket_name || z.binding || z.bucket_id,
      ),
  );
}
function createPlans(args, root) {
  const configFile = findConfig(args, root);
  const cfg = configFile ? readConfig(configFile, root) : null;
  const targets = readJson(args.cloudflare_targets_file, root, null);
  const direct = directPlan(args);
  const raw = [
    ...plansFromConfig(cfg, args),
    ...plansFromTargets(targets, args),
    ...(direct ? [direct] : []),
  ];
  return {
    config_file: configFile,
    config_available: Boolean(cfg),
    cloudflare_targets_file: rel(args.cloudflare_targets_file, root),
    cloudflare_targets_available: Boolean(targets),
    discovered_buckets: raw.length,
    buckets: dedupePlans(raw)
      .filter((p) => matchesFilters(p, args))
      .slice(0, args.max_buckets > 0 ? args.max_buckets : undefined),
  };
}

function validateCreds(args) {
  const errors = [],
    warnings = [];
  if (!args.require_credentials || args.dry_run)
    return { ok: true, errors, warnings };
  if (!args.api_token) errors.push("Missing CLOUDFLARE_API_TOKEN.");
  if (args.require_account_id && !args.account_id)
    errors.push("Missing CLOUDFLARE_ACCOUNT_ID.");
  else if (!args.account_id) warnings.push("CLOUDFLARE_ACCOUNT_ID is not set.");
  return { ok: errors.length === 0, errors, warnings };
}
function escRe(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function globRe(pat) {
  const src = posix(pat);
  let out = "^";
  for (let n = 0; n < src.length; n += 1) {
    const c = src[n],
      nx = src[n + 1];
    if (c === "*" && nx === "*") {
      if (src[n + 2] === "/") {
        out += "(?:.*/)?";
        n += 2;
      } else {
        out += ".*";
        n += 1;
      }
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += escRe(c);
  }
  return new RegExp(`${out}$`);
}
function matchPath(file, pat) {
  const f = posix(file),
    p = posix(pat);
  if (!p) return false;
  if (p.endsWith("/")) return f.startsWith(p);
  if (/[*?]/.test(p)) return globRe(p).test(f);
  return f === p || f.includes(p);
}
function excluded(file, args) {
  return args.exclude.some((p) => matchPath(file, p));
}
function walk(target, root, args, files = []) {
  const p = abs(target, root);
  if (!fs.existsSync(p)) return files;
  if (excluded(rel(p, root), args)) return files;
  const st = fs.statSync(p);
  if (st.isFile()) {
    files.push(p);
    return files;
  }
  if (!st.isDirectory()) return files;
  for (const e of fs.readdirSync(p, { withFileTypes: true }))
    walk(path.join(p, e.name), root, args, files);
  return files;
}
function contentType(file) {
  return (
    {
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
    }[path.extname(file).toLowerCase()] || "application/octet-stream"
  );
}
function addPrefix(key, prefix) {
  const k = String(key || "").replace(/^\/+/, ""),
    p = String(prefix || "");
  return !p || k.startsWith(p) ? k : `${p}${k}`;
}
function objectKey(file, source, root, plan) {
  if (plan.source_key) return plan.source_key;
  return source && isDir(abs(source, root))
    ? posix(path.relative(abs(source, root), file))
    : path.basename(file);
}
function sourceObjects(plan, root, args) {
  if (!plan.sync_objects || !plan.source) return [];
  const p = abs(plan.source, root);
  const files = isDir(p) ? walk(plan.source, root, args) : isFile(p) ? [p] : [];
  const objs = files.map((file) => {
    const st = fs.statSync(file);
    return {
      key: addPrefix(objectKey(file, plan.source, root, plan), plan.prefix),
      file: rel(file, root),
      absolute_file: file,
      size_bytes: st.size,
      modified_at: st.mtime.toISOString(),
      content_type: contentType(file),
    };
  });
  const out = [...new Map(objs.map((o) => [o.key, o])).values()].sort((a, z) =>
    a.key.localeCompare(z.key),
  );
  return args.max_objects > 0 ? out.slice(0, args.max_objects) : out;
}
function validatePlan(plan, objects, args, root) {
  const errors = [],
    warnings = [];
  if (!plan.bucket_name && !plan.bucket_id)
    errors.push("Missing R2 bucket name or bucket ID.");
  if (
    plan.bucket_name &&
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(plan.bucket_name)
  )
    errors.push(
      "Bucket name must be 3-63 characters and use lowercase letters, numbers, dots, or hyphens.",
    );
  if (!plan.binding)
    warnings.push(
      "R2 binding is not set. This is fine for bucket creation but less useful for Worker config evidence.",
    );
  if (
    plan.sync_objects &&
    plan.source &&
    !fs.existsSync(abs(plan.source, root))
  )
    errors.push(`Source path does not exist: ${plan.source}`);
  if (
    plan.sync_objects &&
    plan.source &&
    !objects.length &&
    !args.allow_empty_source
  )
    errors.push("R2 source produced no objects.");
  if (plan.delete_missing && !plan.prefix)
    warnings.push(
      "delete_missing is enabled without a prefix; this may delete every remote object not present in the source.",
    );
  return { ok: errors.length === 0, errors, warnings };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function cfRequest(args, method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = https.request(
      new URL(`${API_BASE}${apiPath}`),
      {
        method,
        headers: {
          Authorization: `Bearer ${args.api_token}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8"),
            parsed = jsonParse(text, null);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (!parsed)
              return resolve({ success: true, result: text, raw: text });
            if (parsed.success === false)
              return reject(
                new Error(
                  `Cloudflare API error: ${(parsed.errors || []).map((e) => e.message || JSON.stringify(e)).join("; ") || res.statusCode}`,
                ),
              );
            return resolve(parsed);
          }
          reject(
            new Error(
              `Cloudflare API ${method} ${apiPath} failed with ${res.statusCode}: ${redact(text).slice(0, 2000)}`,
            ),
          );
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
async function retry(fn, args, label) {
  let last;
  for (let n = 0; n <= args.retry_count; n += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (n >= args.retry_count) break;
      const ms = 500 * 2 ** n;
      logger.warn(
        `${label} failed. Retrying in ${ms}ms. ${logger.formatError(e)}`,
      );
      await wait(ms);
    }
  }
  throw last;
}
const bucketsPath = (args, suffix = "") =>
  `/accounts/${encodeURIComponent(args.account_id)}/r2/buckets${suffix}`;
async function listBuckets(args) {
  const res = await retry(
    () => cfRequest(args, "GET", bucketsPath(args)),
    args,
    "List Cloudflare R2 buckets",
  );
  const raw = res.result || {};
  const buckets = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.buckets)
      ? raw.buckets
      : [];
  return buckets.map((x) => ({
    id: s(x.id),
    bucket_id: s(x.id),
    bucket_name: s(x.name || x.bucket_name),
    name: s(x.name || x.bucket_name),
    created_on: s(x.created || x.creation_date || x.created_on),
    raw: x,
  }));
}
async function createBucket(args, plan) {
  const res = await retry(
    () =>
      cfRequest(args, "POST", bucketsPath(args), { name: plan.bucket_name }),
    args,
    `Create R2 bucket ${plan.bucket_name}`,
  );
  const raw = res.result || {};
  return {
    id: s(raw.id),
    bucket_id: s(raw.id),
    bucket_name: s(raw.name || raw.bucket_name || plan.bucket_name),
    raw,
  };
}
async function deleteBucket(args, bucket) {
  const name = bucket.bucket_name || bucket.name;
  await retry(
    () =>
      cfRequest(
        args,
        "DELETE",
        bucketsPath(args, `/${encodeURIComponent(name)}`),
      ),
    args,
    `Delete R2 bucket ${name}`,
  );
  return { bucket_id: bucket.bucket_id || bucket.id, bucket_name: name };
}
const remoteMatch = (buckets, plan) =>
  buckets.find(
    (bkt) =>
      (plan.bucket_id && bkt.bucket_id === plan.bucket_id) ||
      (plan.bucket_name && bkt.bucket_name === plan.bucket_name),
  );
function remoteDeletePlan(remote, desired, args) {
  if (!args.delete_missing) return [];
  const names = new Set(desired.map((p) => p.bucket_name).filter(Boolean)),
    ids = new Set(desired.map((p) => p.bucket_id).filter(Boolean));
  return remote.filter(
    (bkt) =>
      !ids.has(bkt.bucket_id) &&
      !names.has(bkt.bucket_name) &&
      args.include_buckets.length &&
      (args.include_buckets.includes(bkt.bucket_name) ||
        args.include_buckets.includes(bkt.bucket_id)),
  );
}

function splitCmd(input) {
  const out = [];
  let cur = "",
    quote = "",
    esc = false;
  for (const c of s(input)) {
    if (esc) {
      cur += c;
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if ((c === "'" || c === '"') && !quote) {
      quote = c;
      continue;
    }
    if (c === quote) {
      quote = "";
      continue;
    }
    if (/\s/.test(c) && !quote) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
function packageManager(root, requested) {
  if (requested && requested !== "auto") return requested;
  if (isFile(abs("pnpm-lock.yaml", root))) return "pnpm";
  if (isFile(abs("yarn.lock", root))) return "yarn";
  if (isFile(abs("bun.lockb", root))) return "bun";
  if (isFile(abs("package-lock.json", root))) return "npm";
  return "pnpm";
}
function wranglerPrefix(args, root) {
  if (args.wrangler_command) {
    const parts = splitCmd(args.wrangler_command);
    if (parts.length)
      return {
        command: parts[0],
        args: parts.slice(1),
        package_manager: "custom",
      };
  }
  const pm = packageManager(root, args.package_manager);
  if (pm === "pnpm")
    return {
      command: "pnpm",
      args: ["exec", "wrangler"],
      package_manager: "pnpm",
    };
  if (pm === "yarn")
    return { command: "yarn", args: ["wrangler"], package_manager: "yarn" };
  if (pm === "bun")
    return { command: "bunx", args: ["wrangler"], package_manager: "bun" };
  if (pm === "npm")
    return { command: "npx", args: ["wrangler"], package_manager: "npm" };
  return { command: "npx", args: ["wrangler"], package_manager: "npx" };
}
function cmdDisplay(cmd, argv) {
  return redact(
    [cmd, ...argv]
      .map((p) =>
        /^[A-Za-z0-9_./:=@,+-]+$/.test(String(p))
          ? String(p)
          : JSON.stringify(String(p)),
      )
      .join(" "),
  );
}
function runWrangler(args, root, prefix, wranglerArgs) {
  const start = new Date(),
    command = prefix.command,
    commandArgs = [...prefix.args, ...wranglerArgs],
    display = cmdDisplay(command, commandArgs),
    timeout =
      args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;
  if (args.dry_run)
    return {
      success: true,
      status: "planned",
      command,
      args: commandArgs,
      display,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: start.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  const r = childProcess.spawnSync(command, commandArgs, {
    cwd: root,
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
  const end = new Date(),
    timedOut = r.error?.code === "ETIMEDOUT",
    ok = r.status === 0 && !timedOut;
  return {
    success: ok,
    status: ok ? "passed" : "failed",
    command,
    args: commandArgs,
    display,
    exit_code: r.status,
    signal: r.signal || null,
    stdout: redact(r.stdout || ""),
    stderr: redact(r.stderr || ""),
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : r.error
        ? logger.formatError(r.error)
        : "",
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_ms: end.getTime() - start.getTime(),
  };
}
const cmdSummary = (c) =>
  c
    ? {
        display: c.display,
        status: c.status,
        success: c.success,
        exit_code: c.exit_code,
        duration_ms: c.duration_ms,
        error: redact(c.error || ""),
        stdout_preview: redact(c.stdout || "").slice(0, 2000),
        stderr_preview: redact(c.stderr || "").slice(0, 4000),
      }
    : null;
function parseObjects(stdout) {
  const p = jsonParse(stdout, null);
  if (!p) return [];
  const raw = Array.isArray(p)
    ? p
    : Array.isArray(p.objects)
      ? p.objects
      : Array.isArray(p.result)
        ? p.result
        : [];
  return raw
    .map((o) => ({
      key: s(o.key || o.name),
      size_bytes: Number(o.size || o.size_bytes || 0),
      etag: s(o.etag || o.httpEtag),
      uploaded_at: s(o.uploaded || o.last_modified || o.modified),
      raw: o,
    }))
    .filter((o) => o.key);
}
function listObjects(args, root, prefix, plan) {
  const argv = ["r2", "object", "list", plan.bucket_name, "--json"];
  if (plan.prefix) argv.push("--prefix", plan.prefix);
  const r = runWrangler(args, root, prefix, argv);
  if (!r.success)
    throw new Error(
      r.error ||
        r.stderr ||
        `Failed to list R2 objects for ${plan.bucket_name}.`,
    );
  return { command: r, objects: parseObjects(r.stdout) };
}
function putObject(args, root, prefix, plan, obj) {
  const argv = [
    "r2",
    "object",
    "put",
    `${plan.bucket_name}/${obj.key}`,
    "--file",
    obj.absolute_file,
  ];
  if (obj.content_type) argv.push("--content-type", obj.content_type);
  return runWrangler(args, root, prefix, argv);
}
const delObject = (args, root, prefix, plan, key) =>
  runWrangler(args, root, prefix, [
    "r2",
    "object",
    "delete",
    `${plan.bucket_name}/${key}`,
  ]);
function objectPlan(plan, local, remote, args) {
  const remoteByKey = new Map(remote.map((o) => [o.key, o])),
    localByKey = new Map(local.map((o) => [o.key, o]));
  const uploads = local.filter((o) => {
    if (!plan.compare_objects || !args.compare_objects) return true;
    const r = remoteByKey.get(o.key);
    return !r || Number(r.size_bytes || 0) !== Number(o.size_bytes || 0);
  });
  const skipped = local.filter((o) => {
    if (!plan.compare_objects || !args.compare_objects) return false;
    const r = remoteByKey.get(o.key);
    return r && Number(r.size_bytes || 0) === Number(o.size_bytes || 0);
  });
  const deletes = plan.delete_missing
    ? remote
        .map((o) => o.key)
        .filter((k) => !localByKey.has(k))
        .filter((k) => !plan.prefix || k.startsWith(plan.prefix))
    : [];
  return { uploads, skipped_unchanged: skipped, deletes };
}

async function syncBucket(plan, ctx, args, root) {
  const start = new Date(),
    local = sourceObjects(plan, root, args),
    validation = validatePlan(plan, local, args, root),
    remote = remoteMatch(ctx.remote_buckets, plan);
  const result = {
    id: plan.id,
    source_type: plan.source_type,
    target_name: plan.target_name,
    environment: plan.environment,
    deployment_stage: plan.deployment_stage,
    deployment_alias: plan.deployment_alias,
    bucket_id: plan.bucket_id || remote?.bucket_id || "",
    bucket_name: plan.bucket_name || remote?.bucket_name || "",
    binding: plan.binding,
    source: plan.source,
    prefix: plan.prefix,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: start.toISOString(),
    ended_at: "",
    duration_ms: 0,
    exists_remote: Boolean(remote),
    action: "none",
    create_missing: plan.create_missing,
    update_existing: plan.update_existing,
    sync_objects: plan.sync_objects,
    compare_objects: plan.compare_objects,
    delete_missing: plan.delete_missing,
    validation,
    remote: remote || null,
    created: null,
    updated: null,
    object_list_command: null,
    object_upload_results: [],
    object_delete_results: [],
    source_objects: local.map((o) => ({
      key: o.key,
      file: o.file,
      size_bytes: o.size_bytes,
      content_type: o.content_type,
    })),
    remote_objects: [],
    planned_upload_keys: [],
    planned_delete_keys: [],
    errors: [],
    warnings: validation.warnings,
    totals: {
      source_objects: local.length,
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
    let active = remote;
    if (!remote) {
      if (!plan.create_missing) {
        result.action = "missing";
        result.status = "missing";
        result.errors.push(
          "Bucket does not exist and create_missing is disabled.",
        );
        return result;
      }
      result.action = "create";
      if (!args.dry_run) {
        result.created = await createBucket(args, plan);
        result.bucket_id = result.created.bucket_id || result.bucket_id;
        result.bucket_name = result.created.bucket_name || result.bucket_name;
        active = result.created;
      }
    } else if (plan.update_existing) {
      result.action = "update";
      result.updated = {
        changed: false,
        note: "R2 bucket update intent recorded. Bucket metadata updates are not mutated by this script.",
      };
    } else result.action = "noop";
    if (!plan.sync_objects || !plan.source) {
      result.status = args.dry_run ? "planned" : remote ? "exists" : "created";
      result.success = true;
      return result;
    }
    let remoteObjects = [];
    if (!args.dry_run && active) {
      const listing = listObjects(args, root, ctx.wrangler, plan);
      result.object_list_command = cmdSummary(listing.command);
      remoteObjects = listing.objects;
    }
    result.remote_objects = remoteObjects;
    result.totals.remote_objects = remoteObjects.length;
    const changes = objectPlan(plan, local, remoteObjects, args);
    result.planned_upload_keys = changes.uploads.map((o) => o.key);
    result.planned_delete_keys = changes.deletes;
    result.totals.planned_uploads = changes.uploads.length;
    result.totals.skipped_unchanged = changes.skipped_unchanged.length;
    result.totals.planned_deletes = changes.deletes.length;
    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }
    for (const obj of changes.uploads) {
      const up = putObject(args, root, ctx.wrangler, plan, obj);
      result.object_upload_results.push({
        key: obj.key,
        file: obj.file,
        status: up.status,
        success: up.success,
        exit_code: up.exit_code,
        duration_ms: up.duration_ms,
        error: up.error || up.stderr,
      });
      if (up.success) result.totals.uploaded += 1;
      else {
        result.totals.upload_failed += 1;
        result.errors.push(
          `Failed to upload ${obj.key}: ${up.error || up.stderr || "unknown error"}`,
        );
        if (!args.continue_on_error) break;
      }
    }
    if (result.totals.upload_failed === 0)
      for (const key of changes.deletes) {
        const d = delObject(args, root, ctx.wrangler, plan, key);
        result.object_delete_results.push({
          key,
          status: d.status,
          success: d.success,
          exit_code: d.exit_code,
          duration_ms: d.duration_ms,
          error: d.error || d.stderr,
        });
        if (d.success) result.totals.deleted += 1;
        else {
          result.totals.delete_failed += 1;
          result.errors.push(
            `Failed to delete ${key}: ${d.error || d.stderr || "unknown error"}`,
          );
          if (!args.continue_on_error) break;
        }
      }
    if (result.totals.upload_failed || result.totals.delete_failed) {
      result.status = "failed";
      return result;
    }
    result.status = remote ? "synced" : "created";
    result.success = true;
    return result;
  } catch (e) {
    result.status = "failed";
    result.errors.push(logger.formatError(e));
    return result;
  } finally {
    const end = new Date();
    result.ended_at = end.toISOString();
    result.duration_ms = end.getTime() - start.getTime();
  }
}
async function execute(plans, args, root) {
  const credentials = validateCreds(args),
    wrangler = wranglerPrefix(args, root),
    results = [],
    delete_results = [];
  if (!credentials.ok)
    return {
      credentials,
      remote_buckets: [],
      delete_plan: [],
      results,
      delete_results,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
      wrangler,
    };
  const remote = args.dry_run ? [] : await listBuckets(args),
    delPlan = remoteDeletePlan(remote, plans.buckets, args);
  let stopped = false;
  for (const p of plans.buckets) {
    logger.info(
      `${args.dry_run ? "Planning" : "Syncing"} R2 bucket ${p.bucket_name || p.binding || p.bucket_id || p.id}.`,
    );
    const r = await syncBucket(
      p,
      { remote_buckets: remote, wrangler },
      args,
      root,
    );
    results.push(r);
    if (!r.success && !args.continue_on_error) {
      stopped = true;
      logger.warn("Stopping after first failed R2 bucket sync.");
      break;
    }
  }
  if (!stopped && delPlan.length)
    for (const bkt of delPlan) {
      const start = new Date(),
        r = {
          bucket_id: bkt.bucket_id,
          bucket_name: bkt.bucket_name,
          status: args.dry_run ? "planned" : "pending",
          success: args.dry_run,
          dry_run: args.dry_run,
          started_at: start.toISOString(),
          ended_at: "",
          duration_ms: 0,
          errors: [],
        };
      try {
        if (!args.dry_run) {
          await deleteBucket(args, bkt);
          r.status = "deleted";
          r.success = true;
        }
      } catch (e) {
        r.status = "failed";
        r.errors.push(logger.formatError(e));
      } finally {
        const end = new Date();
        r.ended_at = end.toISOString();
        r.duration_ms = end.getTime() - start.getTime();
      }
      delete_results.push(r);
      if (!r.success && !args.continue_on_error) {
        stopped = true;
        break;
      }
    }
  return {
    credentials,
    remote_buckets: remote,
    delete_plan: delPlan,
    results,
    delete_results,
    stopped_early: stopped,
    blocked: false,
    block_reason: "",
    wrangler,
  };
}

function dur(ms) {
  const v = Number(ms || 0);
  if (v < 1000) return `${v}ms`;
  const sec = v / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}
function totals(results, deletes) {
  const count = (arr, st) => arr.filter((x) => x.status === st).length,
    duration_ms =
      results.reduce((a, x) => a + Number(x.duration_ms || 0), 0) +
      deletes.reduce((a, x) => a + Number(x.duration_ms || 0), 0);
  const t = {
    buckets: results.length,
    created: count(results, "created"),
    synced: count(results, "synced"),
    exists: count(results, "exists"),
    planned: count(results, "planned"),
    missing: count(results, "missing"),
    failed: count(results, "failed"),
    invalid: count(results, "invalid"),
    delete_planned: count(deletes, "planned"),
    deleted: count(deletes, "deleted"),
    delete_failed: count(deletes, "failed"),
    source_objects: results.reduce((a, x) => a + x.totals.source_objects, 0),
    remote_objects: results.reduce((a, x) => a + x.totals.remote_objects, 0),
    planned_uploads: results.reduce((a, x) => a + x.totals.planned_uploads, 0),
    skipped_unchanged: results.reduce(
      (a, x) => a + x.totals.skipped_unchanged,
      0,
    ),
    uploaded: results.reduce((a, x) => a + x.totals.uploaded, 0),
    upload_failed: results.reduce((a, x) => a + x.totals.upload_failed, 0),
    planned_object_deletes: results.reduce(
      (a, x) => a + x.totals.planned_deletes,
      0,
    ),
    object_deleted: results.reduce((a, x) => a + x.totals.deleted, 0),
    object_delete_failed: results.reduce(
      (a, x) => a + x.totals.delete_failed,
      0,
    ),
    duration_ms,
    duration_human: dur(duration_ms),
  };
  t.ok =
    !t.failed &&
    !t.invalid &&
    !t.missing &&
    !t.delete_failed &&
    !t.upload_failed &&
    !t.object_delete_failed;
  return t;
}
function groups(results, key) {
  const g = {};
  for (const r of results) {
    const k = r[key] || "unknown";
    g[k] ||= {
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
    g[k].count += 1;
    if (g[k][r.status] !== undefined) g[k][r.status] += 1;
    g[k].uploads += r.totals.planned_uploads;
    g[k].deletes += r.totals.planned_deletes;
  }
  return Object.fromEntries(
    Object.entries(g).sort(([a], [z]) => a.localeCompare(z)),
  );
}
function report(args, root, plans, ex) {
  const t = totals(ex.results, ex.delete_results);
  const status = ex.blocked
    ? "blocked"
    : t.failed || t.delete_failed || t.upload_failed || t.object_delete_failed
      ? "failed"
      : t.invalid
        ? "invalid"
        : t.missing
          ? "missing"
          : !ex.results.length && !ex.delete_results.length
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
    github: gitMeta(root),
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      cloudflare_targets_file: plans.cloudflare_targets_file,
      cloudflare_targets_available: plans.cloudflare_targets_available,
      output_file: rel(args.output_file, root),
      summary_file: args.write_summary_file
        ? rel(args.summary_file, root)
        : null,
      environment: args.environment,
      deployment_stage: args.deployment_stage,
      deployment_alias: args.deployment_alias,
      preview_ref: args.preview_ref,
      pull_request_number: args.pull_request_number,
      project_name: args.project_name,
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
      command: ex.wrangler.command,
      args: ex.wrangler.args,
      package_manager: ex.wrangler.package_manager,
      display: cmdDisplay(ex.wrangler.command, ex.wrangler.args),
    },
    credentials: {
      ok: ex.credentials.ok,
      api_token_present: Boolean(args.api_token),
      account_id_present: Boolean(args.account_id),
      warnings: ex.credentials.warnings,
      errors: ex.credentials.errors,
    },
    discovery: {
      discovered_buckets: plans.discovered_buckets,
      selected_buckets: plans.buckets.length,
      remote_buckets: ex.remote_buckets.length,
      delete_plan: ex.delete_plan.length,
    },
    selected_buckets: plans.buckets.map((p) => ({
      id: p.id,
      source_type: p.source_type,
      target_name: p.target_name,
      environment: p.environment,
      deployment_stage: p.deployment_stage,
      deployment_alias: p.deployment_alias,
      bucket_id: p.bucket_id,
      bucket_name: p.bucket_name,
      binding: p.binding,
      source: p.source,
      prefix: p.prefix,
      create_missing: p.create_missing,
      update_existing: p.update_existing,
      sync_objects: p.sync_objects,
      compare_objects: p.compare_objects,
      delete_missing: p.delete_missing,
      public_access: p.public_access,
    })),
    totals: t,
    groups: {
      by_environment: groups(ex.results, "environment"),
      by_status: groups(ex.results, "status"),
      by_source_type: groups(ex.results, "source_type"),
    },
    remote_buckets: ex.remote_buckets.map((bkt) => ({
      bucket_id: bkt.bucket_id,
      bucket_name: bkt.bucket_name,
      created_on: bkt.created_on,
    })),
    delete_plan: ex.delete_plan.map((bkt) => ({
      bucket_id: bkt.bucket_id,
      bucket_name: bkt.bucket_name,
    })),
    results: ex.results,
    delete_results: ex.delete_results,
    failures: [
      ...ex.results.filter((x) => !x.success),
      ...ex.delete_results.filter((x) => !x.success),
    ],
    stopped_early: ex.stopped_early,
    blocked: ex.blocked,
    block_reason: ex.block_reason,
    status,
  };
}
function md(r) {
  const lines = [
    `# 🪣 ${PROJECT_NAME} Cloudflare R2 Sync`,
    "",
    `Generated: \`${r.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${r.status}\``,
    `- Environment: \`${r.config.environment}\``,
    `- Stage: \`${r.config.deployment_stage || "not set"}\``,
    `- Alias: \`${r.config.deployment_alias || "not set"}\``,
    `- Dry run: \`${r.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${r.blocked ? "true" : "false"}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${r.repository}\``,
    `- Branch: \`${r.github.branch || "unknown"}\``,
    `- Commit: \`${r.github.short_sha || r.github.sha || "unknown"}\``,
    `- Workflow: \`${r.github.workflow || "unknown"}\``,
    `- Run: \`${r.github.run_id || "unknown"}\``,
    "",
    "## 🔐 Credentials",
    "",
    `- Credential check: \`${r.credentials.ok ? "passed" : "failed"}\``,
    `- API token present: \`${r.credentials.api_token_present ? "true" : "false"}\``,
    `- Account ID present: \`${r.credentials.account_id_present ? "true" : "false"}\``,
    "",
    "## ⚙️ Wrangler",
    "",
    `- Package manager: \`${r.wrangler.package_manager}\``,
    `- Command: \`${r.wrangler.display}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected buckets: \`${r.discovery.selected_buckets}\``,
    `- Remote buckets: \`${r.discovery.remote_buckets}\``,
    `- Created: \`${r.totals.created}\``,
    `- Synced: \`${r.totals.synced}\``,
    `- Already exists: \`${r.totals.exists}\``,
    `- Planned: \`${r.totals.planned}\``,
    `- Missing: \`${r.totals.missing}\``,
    `- Invalid: \`${r.totals.invalid}\``,
    `- Failed: \`${r.totals.failed}\``,
    `- Source objects: \`${r.totals.source_objects}\``,
    `- Planned uploads: \`${r.totals.planned_uploads}\``,
    `- Uploaded: \`${r.totals.uploaded}\``,
    `- Upload failed: \`${r.totals.upload_failed}\``,
    `- Planned object deletes: \`${r.totals.planned_object_deletes}\``,
    `- Objects deleted: \`${r.totals.object_deleted}\``,
    `- Object delete failed: \`${r.totals.object_delete_failed}\``,
    `- Duration: \`${r.totals.duration_human}\``,
    "",
  ];
  if (r.block_reason) lines.push(`Blocked reason: ${r.block_reason}`, "");
  lines.push("## 🎯 Selected Buckets", "");
  if (!r.selected_buckets.length) lines.push("No R2 buckets were selected.");
  else {
    lines.push(
      "| Bucket | Binding | Source | Prefix | Stage | Sync Objects | Delete Missing |",
      "|---|---|---|---|---|---:|---:|",
    );
    for (const bkt of r.selected_buckets)
      lines.push(
        `| \`${bkt.bucket_name || bkt.bucket_id || "unknown"}\` | \`${bkt.binding || "none"}\` | \`${bkt.source || "none"}\` | \`${bkt.prefix || ""}\` | \`${bkt.deployment_stage || "none"}\` | \`${bkt.sync_objects ? "true" : "false"}\` | \`${bkt.delete_missing ? "true" : "false"}\` |`,
      );
  }
  lines.push("", "## 🧩 Bucket Results", "");
  if (!r.results.length) lines.push("No R2 bucket sync results were produced.");
  else {
    lines.push(
      "| Status | Action | Bucket | Binding | Uploads | Deletes | Duration |",
      "|---|---|---|---|---:|---:|---:|",
    );
    for (const x of r.results)
      lines.push(
        `| \`${x.status}\` | \`${x.action}\` | \`${x.bucket_name || x.bucket_id || "unknown"}\` | \`${x.binding || "none"}\` | \`${x.totals.planned_uploads}\` | \`${x.totals.planned_deletes}\` | \`${dur(x.duration_ms)}\` |`,
      );
  }
  if (r.failures.length) {
    lines.push(
      "",
      "## ❌ Failures",
      "",
      "| Bucket | Binding | Status | Errors |",
      "|---|---|---|---|",
    );
    for (const f of r.failures)
      lines.push(
        `| \`${f.bucket_name || f.bucket_id || "unknown"}\` | \`${f.binding || "none"}\` | \`${f.status}\` | ${(f.errors || []).map((x) => String(x).replace(/\|/g, "\\|")).join("<br>")} |`,
      );
  }
  const warnings = [
    ...r.credentials.warnings,
    ...r.results.flatMap((x) =>
      x.warnings.map((w) => ({
        bucket: x.bucket_name || x.binding || x.bucket_id || "unknown",
        warning: w,
      })),
    ),
  ];
  if (warnings.length) {
    lines.push("", "## ⚠️ Warnings", "");
    for (const w of warnings)
      lines.push(
        typeof w === "string" ? `- ${w}` : `- \`${w.bucket}\`: ${w.warning}`,
      );
  }
  lines.push(
    "",
    "## 📥 Inputs",
    "",
    `- Config file: \`${r.config.config_file || "not found"}\``,
    `- Config available: \`${r.config.config_available ? "true" : "false"}\``,
    `- Cloudflare targets file: \`${r.config.cloudflare_targets_file}\``,
    `- Cloudflare targets available: \`${r.config.cloudflare_targets_available ? "true" : "false"}\``,
    "",
    "## 📤 Outputs",
    "",
    `- JSON report: \`${r.config.output_file}\``,
    `- Markdown summary: \`${r.config.summary_file || "not written"}\``,
  );
  return `${lines.join("\n").trim()}\n`;
}
function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return false;
  const v = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${redact(v)}\nEOF\n`,
  );
  return true;
}
function outputs(r) {
  output("cloudflare_r2_sync_file", r.config.output_file);
  output("cloudflare_r2_sync_summary_file", r.config.summary_file || "");
  output("cloudflare_r2_sync_status", r.status);
  output("cloudflare_r2_sync_ok", r.totals.ok && !r.blocked ? "true" : "false");
  output("cloudflare_r2_sync_environment", r.config.environment);
  output("cloudflare_r2_sync_stage", r.config.deployment_stage);
  output("cloudflare_r2_sync_alias", r.config.deployment_alias);
  output("cloudflare_r2_sync_selected", String(r.discovery.selected_buckets));
  output("cloudflare_r2_sync_remote", String(r.discovery.remote_buckets));
  output("cloudflare_r2_sync_created", String(r.totals.created));
  output("cloudflare_r2_sync_synced", String(r.totals.synced));
  output("cloudflare_r2_sync_exists", String(r.totals.exists));
  output("cloudflare_r2_sync_planned", String(r.totals.planned));
  output("cloudflare_r2_sync_failed", String(r.totals.failed));
  output("cloudflare_r2_sync_invalid", String(r.totals.invalid));
  output("cloudflare_r2_sync_missing", String(r.totals.missing));
  output("cloudflare_r2_sync_bucket_deleted", String(r.totals.deleted));
  output(
    "cloudflare_r2_sync_bucket_delete_failed",
    String(r.totals.delete_failed),
  );
  output("cloudflare_r2_sync_source_objects", String(r.totals.source_objects));
  output(
    "cloudflare_r2_sync_planned_uploads",
    String(r.totals.planned_uploads),
  );
  output("cloudflare_r2_sync_uploaded", String(r.totals.uploaded));
  output("cloudflare_r2_sync_upload_failed", String(r.totals.upload_failed));
  output("cloudflare_r2_sync_object_deleted", String(r.totals.object_deleted));
  output(
    "cloudflare_r2_sync_object_delete_failed",
    String(r.totals.object_delete_failed),
  );
  output(
    "cloudflare_r2_sync_bucket_names",
    r.selected_buckets
      .map((x) => x.bucket_name || x.binding || x.bucket_id)
      .join(","),
  );
  output(
    "cloudflare_r2_sync_bucket_names_json",
    JSON.stringify(
      r.selected_buckets.map((x) => x.bucket_name || x.binding || x.bucket_id),
    ),
  );
  output("cloudflare_r2_sync_failures_json", JSON.stringify(r.failures));
}

async function main() {
  const args = parseArgs(),
    root = repoRoot(),
    outputFile = abs(args.output_file, root),
    summaryFile = abs(args.summary_file, root);
  logger.info("Preparing Cloudflare R2 sync.");
  const plans = createPlans(args, root);
  if (args.fail_if_empty && !plans.buckets.length) {
    logger.error("No Cloudflare R2 buckets were selected.");
    process.exitCode = 1;
  }
  if (!args.allow_empty_plan && !plans.buckets.length && !args.fail_if_empty)
    logger.warn(
      "No Cloudflare R2 buckets were selected. Use --allow-empty-plan to silence this warning.",
    );
  const ex =
    process.exitCode === 1
      ? {
          credentials: validateCreds(args),
          remote_buckets: [],
          delete_plan: [],
          results: [],
          delete_results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
          wrangler: wranglerPrefix(args, root),
        }
      : await execute(plans, args, root);
  const r = report(args, root, plans, ex),
    json = `${JSON.stringify(r, null, 2)}\n`,
    markdown = md(r);
  writeFile(outputFile, json, args.dry_run);
  if (args.write_summary_file) writeFile(summaryFile, markdown, args.dry_run);
  outputs(r);
  if (args.write_step_summary && process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${markdown.trim()}\n\n`,
    );
  if (args.print) console.log(json.trim());
  if (args.fail_if_empty && r.discovery.selected_buckets === 0) {
    process.exitCode = 1;
    return;
  }
  if (args.fail_on_error && r.blocked) {
    logger.error(`Cloudflare R2 sync blocked: ${r.block_reason}`);
    process.exitCode = 1;
    return;
  }
  if (args.fail_on_error && !r.totals.ok) {
    logger.error(
      `Cloudflare R2 sync completed with ${r.totals.failed} failed, ${r.totals.invalid} invalid, ${r.totals.missing} missing, ${r.totals.upload_failed} upload failure(s), and ${r.totals.object_delete_failed} object delete failure(s).`,
    );
    process.exitCode = 1;
  }
}
main().catch((e) => {
  logger.error(logger.formatError(e));
  process.exitCode = 1;
});
