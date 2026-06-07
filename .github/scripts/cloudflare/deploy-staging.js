#!/usr/bin/env node
// .github/scripts/cloudflare/deploy-staging.js
// Aerealith AI — Cloudflare Staging Deployment Runner
// Deploys discovered Pages/Worker targets. Missing Pages projects are created automatically and retried.

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

let logger;
try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (m) => console.log(`[cloudflare-staging] ${m}`),
    warn: (m) => console.warn(`[cloudflare-staging] WARN: ${m}`),
    error: (m) => console.error(`[cloudflare-staging] ERROR: ${m}`),
    formatError: (e) => e?.message || String(e || "unknown error"),
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_ENVIRONMENT = "staging";
const DEFAULT_BRANCH = "staging";
const DEFAULT_PRODUCTION_BRANCH = "main";
const DEFAULT_INPUT_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/staging/deploy-staging.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/staging/deploy-staging.md";
const DEFAULT_LOG_DIR = "artifacts/cloudflare/deploy-staging/logs";
const TRUE = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE = new Set(["false", "0", "no", "n", "off", "disabled"]);
const URL_RE = /https?:\/\/[^\s"'<>]+/g;
const SECRET_RE =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

function s(v, f = "") {
  if (v === undefined || v === null) return f;
  return String(v).trim() || f;
}

function b(v, f = false) {
  if (v === undefined || v === null || v === "") return f;
  if (typeof v === "boolean") return v;
  const n = String(v).trim().toLowerCase();
  if (TRUE.has(n)) return true;
  if (FALSE.has(n)) return false;
  return f;
}

function i(v, f = 0) {
  if (v === undefined || v === null || v === "") return f;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : f;
}

function list(v) {
  if (v === undefined || v === null || v === "") return [];
  return [
    ...new Set(
      (Array.isArray(v) ? v : String(v).split(","))
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
}

function argValue(argv, index, arg) {
  const value = argv[index + 1];
  if (value === undefined || String(value).startsWith("--"))
    throw new Error(`Missing value for argument: ${arg}`);
  return value;
}

function safeBranch(v, f = DEFAULT_BRANCH) {
  return (
    s(v, f)
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/pull\//, "pull-")
      .replace(/[^A-Za-z0-9._/-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^-|-$/g, "")
      .slice(0, 180) || f
  );
}

function safeId(v) {
  return (
    s(v, "cloudflare-staging")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-staging"
  );
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    input_file: process.env.CLOUDFLARE_STAGING_INPUT_FILE || DEFAULT_INPUT_FILE,
    output_file:
      process.env.CLOUDFLARE_STAGING_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_STAGING_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    log_dir: process.env.CLOUDFLARE_STAGING_LOG_DIR || DEFAULT_LOG_DIR,
    environment:
      process.env.CLOUDFLARE_STAGING_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,
    stage:
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_STAGING_STAGE ||
      DEFAULT_ENVIRONMENT,
    branch:
      process.env.CLOUDFLARE_STAGING_BRANCH ||
      process.env.CLOUDFLARE_STAGING_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_BRANCH,
    target_id:
      process.env.CLOUDFLARE_TARGET_ID ||
      process.env.CLOUDFLARE_STAGING_TARGET_ID ||
      "",
    target_name:
      process.env.CLOUDFLARE_TARGET_NAME ||
      process.env.CLOUDFLARE_STAGING_TARGET_NAME ||
      "",
    target_type:
      process.env.CLOUDFLARE_TARGET_TYPE ||
      process.env.CLOUDFLARE_STAGING_TARGET_TYPE ||
      "",
    target_root:
      process.env.CLOUDFLARE_TARGET_ROOT ||
      process.env.CLOUDFLARE_STAGING_TARGET_ROOT ||
      "",
    target_config:
      process.env.CLOUDFLARE_TARGET_CONFIG ||
      process.env.CLOUDFLARE_STAGING_TARGET_CONFIG ||
      "",
    include_targets: list(process.env.CLOUDFLARE_STAGING_INCLUDE_TARGETS),
    exclude_targets: list(process.env.CLOUDFLARE_STAGING_EXCLUDE_TARGETS),
    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager: process.env.CLOUDFLARE_STAGING_PACKAGE_MANAGER || "auto",
    run_build: b(process.env.CLOUDFLARE_STAGING_RUN_BUILD, true),
    build_command: process.env.CLOUDFLARE_STAGING_BUILD_COMMAND || "",
    changed_only: b(process.env.CLOUDFLARE_STAGING_CHANGED_ONLY, true),
    deploy_pages: b(process.env.CLOUDFLARE_STAGING_DEPLOY_PAGES, true),
    deploy_workers: b(process.env.CLOUDFLARE_STAGING_DEPLOY_WORKERS, true),
    auto_create_pages_project: b(
      process.env.CLOUDFLARE_STAGING_AUTO_CREATE_PAGES_PROJECT ||
        process.env.CLOUDFLARE_AUTO_CREATE_PAGES_PROJECT,
      true,
    ),
    pages_production_branch:
      process.env.CLOUDFLARE_STAGING_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PRODUCTION_BRANCH ||
      DEFAULT_PRODUCTION_BRANCH,
    require_credentials: b(
      process.env.CLOUDFLARE_STAGING_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: b(
      process.env.CLOUDFLARE_STAGING_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_allowed_ref: b(
      process.env.CLOUDFLARE_STAGING_REQUIRE_ALLOWED_REF,
      false,
    ),
    require_worker_staging_env: b(
      process.env.CLOUDFLARE_STAGING_REQUIRE_WORKER_ENV,
      true,
    ),
    allow_worker_default_staging: b(
      process.env.CLOUDFLARE_STAGING_ALLOW_WORKER_DEFAULT,
      false,
    ),
    allowed_branches: list(
      process.env.CLOUDFLARE_STAGING_ALLOWED_BRANCHES ||
        "staging,develop,dev,main,master",
    ),
    allowed_tags: list(
      process.env.CLOUDFLARE_STAGING_ALLOWED_TAGS || "staging-*",
    ),
    max_deployments: i(process.env.CLOUDFLARE_STAGING_MAX_DEPLOYMENTS, 0),
    timeout_minutes: i(process.env.CLOUDFLARE_STAGING_TIMEOUT_MINUTES, 25),
    max_buffer_mb: i(process.env.CLOUDFLARE_STAGING_MAX_BUFFER_MB, 64),
    continue_on_error: b(
      process.env.CLOUDFLARE_STAGING_CONTINUE_ON_ERROR,
      true,
    ),
    fail_on_error: b(process.env.CLOUDFLARE_STAGING_FAIL_ON_ERROR, true),
    fail_if_empty: b(process.env.CLOUDFLARE_STAGING_FAIL_IF_EMPTY, false),
    dry_run: b(
      process.env.CLOUDFLARE_STAGING_DRY_RUN ||
        process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_logs: b(process.env.CLOUDFLARE_STAGING_WRITE_LOGS, true),
    write_summary_file: b(process.env.CLOUDFLARE_STAGING_WRITE_SUMMARY, true),
    print: b(process.env.CLOUDFLARE_STAGING_PRINT, true),
    write_step_summary: b(process.env.CLOUDFLARE_STAGING_STEP_SUMMARY, true),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo" || arg === "--repository")
      args.repository = argValue(argv, index++, arg);
    else if (arg === "--input") args.input_file = argValue(argv, index++, arg);
    else if (arg === "--environment" || arg === "--env")
      args.environment = argValue(argv, index++, arg);
    else if (arg === "--stage" || arg === "--deployment-stage")
      args.stage = argValue(argv, index++, arg);
    else if (
      arg === "--branch" ||
      arg === "--ref" ||
      arg === "--deployment-ref"
    )
      args.branch = argValue(argv, index++, arg);
    else if (arg === "--target-id")
      args.target_id = argValue(argv, index++, arg);
    else if (arg === "--target" || arg === "--target-name")
      args.target_name = argValue(argv, index++, arg);
    else if (arg === "--type" || arg === "--target-type")
      args.target_type = argValue(argv, index++, arg);
    else if (arg === "--root" || arg === "--target-root")
      args.target_root = argValue(argv, index++, arg);
    else if (arg === "--config" || arg === "--target-config")
      args.target_config = argValue(argv, index++, arg);
    else if (arg === "--include-target" || arg === "--include-targets")
      args.include_targets.push(...list(argValue(argv, index++, arg)));
    else if (arg === "--exclude-target" || arg === "--exclude-targets")
      args.exclude_targets.push(...list(argValue(argv, index++, arg)));
    else if (arg === "--wrangler-command")
      args.wrangler_command = argValue(argv, index++, arg);
    else if (arg === "--package-manager")
      args.package_manager = argValue(argv, index++, arg);
    else if (arg === "--build-command")
      args.build_command = argValue(argv, index++, arg);
    else if (arg === "--pages-production-branch")
      args.pages_production_branch = argValue(argv, index++, arg);
    else if (arg === "--allowed-branch" || arg === "--allowed-branches")
      args.allowed_branches.push(...list(argValue(argv, index++, arg)));
    else if (arg === "--allowed-tag" || arg === "--allowed-tags")
      args.allowed_tags.push(...list(argValue(argv, index++, arg)));
    else if (arg === "--max-deployments")
      args.max_deployments = i(
        argValue(argv, index++, arg),
        args.max_deployments,
      );
    else if (arg === "--timeout-minutes")
      args.timeout_minutes = i(
        argValue(argv, index++, arg),
        args.timeout_minutes,
      );
    else if (arg === "--max-buffer-mb")
      args.max_buffer_mb = i(argValue(argv, index++, arg), args.max_buffer_mb);
    else if (arg === "--log-dir") args.log_dir = argValue(argv, index++, arg);
    else if (arg === "--output" || arg === "-o")
      args.output_file = argValue(argv, index++, arg);
    else if (arg === "--summary") {
      args.summary_file = argValue(argv, index++, arg);
      args.write_summary_file = true;
    } else if (arg === "--run-build") args.run_build = true;
    else if (arg === "--no-build") args.run_build = false;
    else if (arg === "--changed-only") args.changed_only = true;
    else if (arg === "--all-targets") args.changed_only = false;
    else if (arg === "--pages") args.deploy_pages = true;
    else if (arg === "--no-pages") args.deploy_pages = false;
    else if (arg === "--workers") args.deploy_workers = true;
    else if (arg === "--no-workers") args.deploy_workers = false;
    else if (arg === "--auto-create-pages-project")
      args.auto_create_pages_project = true;
    else if (arg === "--no-auto-create-pages-project")
      args.auto_create_pages_project = false;
    else if (arg === "--require-credentials") args.require_credentials = true;
    else if (arg === "--no-require-credentials")
      args.require_credentials = false;
    else if (arg === "--require-account-id") args.require_account_id = true;
    else if (arg === "--no-require-account-id") args.require_account_id = false;
    else if (arg === "--require-allowed-ref") args.require_allowed_ref = true;
    else if (arg === "--no-require-allowed-ref")
      args.require_allowed_ref = false;
    else if (arg === "--require-worker-staging-env")
      args.require_worker_staging_env = true;
    else if (arg === "--no-require-worker-staging-env")
      args.require_worker_staging_env = false;
    else if (arg === "--allow-worker-default-staging")
      args.allow_worker_default_staging = true;
    else if (arg === "--no-allow-worker-default-staging")
      args.allow_worker_default_staging = false;
    else if (arg === "--continue-on-error") args.continue_on_error = true;
    else if (arg === "--no-continue-on-error") args.continue_on_error = false;
    else if (arg === "--fail-on-error") args.fail_on_error = true;
    else if (arg === "--no-fail-on-error") args.fail_on_error = false;
    else if (arg === "--fail-if-empty") args.fail_if_empty = true;
    else if (arg === "--no-fail-if-empty") args.fail_if_empty = false;
    else if (arg === "--logs") args.write_logs = true;
    else if (arg === "--no-logs") args.write_logs = false;
    else if (arg === "--no-summary") args.write_summary_file = false;
    else if (arg === "--dry-run") args.dry_run = true;
    else if (arg === "--no-print") args.print = false;
    else if (arg === "--no-step-summary") args.write_step_summary = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }

  args.environment = s(args.environment, DEFAULT_ENVIRONMENT).toLowerCase();
  args.stage = s(args.stage, args.environment).toLowerCase();
  args.branch = safeBranch(args.branch, DEFAULT_BRANCH);
  args.pages_production_branch = safeBranch(
    args.pages_production_branch,
    DEFAULT_PRODUCTION_BRANCH,
  );
  args.target_type = s(args.target_type).toLowerCase();
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.allowed_branches = [...new Set(args.allowed_branches)];
  args.allowed_tags = [...new Set(args.allowed_tags)];
  args.package_manager = s(args.package_manager, "auto").toLowerCase();
  args.max_deployments = Math.max(0, args.max_deployments);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);
  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Staging Deployment Runner

Usage:
  node .github/scripts/cloudflare/deploy-staging.js [options]

Options:
  --input <file>                      Cloudflare discovery or target file.
  --environment <name>                Deployment environment. Default: staging.
  --stage <name>                      Deployment stage.
  --branch <name> / --ref <name>      Staging branch/ref.
  --target <name>                     Deploy one target by name.
  --type <pages|worker>               Deploy one target type.
  --run-build / --no-build            Toggle build before deploy.
  --pages / --no-pages                Enable or disable Pages deployment.
  --workers / --no-workers            Enable or disable Worker deployment.
  --auto-create-pages-project         Create missing Cloudflare Pages projects. Default.
  --no-auto-create-pages-project      Do not create missing Cloudflare Pages projects.
  --pages-production-branch <branch>  Production branch used when creating Pages projects.
  --output <file>                     JSON output file.
  --summary <file>                    Markdown summary output file.
`);
}

function repoRoot(start = process.env.GITHUB_WORKSPACE || process.cwd()) {
  const markers = [
    ".git",
    ".github",
    "package.json",
    "pnpm-workspace.yaml",
    "nx.json",
  ];
  let current = path.resolve(start);
  while (current && current !== path.dirname(current)) {
    if (markers.some((marker) => fs.existsSync(path.join(current, marker))))
      return current;
    current = path.dirname(current);
  }
  return path.resolve(start);
}

function abs(p, root) {
  if (!p) return root;
  return path.isAbsolute(p)
    ? path.normalize(p)
    : path.normalize(path.join(root, p));
}

function posix(p) {
  return String(p || "")
    .split(path.sep)
    .join("/");
}

function rel(p, root) {
  return posix(path.relative(root, abs(p, root))) || ".";
}

function isFile(p) {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

function isDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function mkdir(dir, dryRun = false) {
  if (fs.existsSync(dir)) return;
  if (dryRun) return logger.info(`[dry-run] Would create directory: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, content, opts = {}) {
  mkdir(path.dirname(file), opts.dry_run);
  if (opts.dry_run) return logger.info(`[dry-run] Would write ${file}.`);
  fs.writeFileSync(file, content);
  logger.info(`Wrote ${file}.`);
}

function readJson(file, root, fallback = null) {
  const p = abs(file, root);
  if (!isFile(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function git(args, root) {
  try {
    return cp
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

function gitMeta(root) {
  const sha = process.env.GITHUB_SHA || git(["rev-parse", "HEAD"], root);
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      git(["rev-parse", "--abbrev-ref", "HEAD"], root),
    ref_name: process.env.GITHUB_REF_NAME || "",
    ref_protected: b(process.env.GITHUB_REF_PROTECTED, false),
    sha,
    short_sha:
      sha.slice(0, 12) || git(["rev-parse", "--short=12", "HEAD"], root),
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

function globToRegExp(pattern) {
  return new RegExp(
    `^${String(pattern || "")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
}

function matchesAny(value, patterns) {
  const source = s(value);
  return patterns.some((pattern) => {
    const candidate = s(pattern);
    if (!candidate) return false;
    return candidate.includes("*") || candidate.includes("?")
      ? globToRegExp(candidate).test(source)
      : source === candidate;
  });
}

function splitCommandLine(value) {
  const input = s(value);
  if (!input) return [];
  const out = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === "\\") escaped = true;
    else if ((ch === "'" || ch === '"') && !quote) quote = ch;
    else if (ch === quote) quote = "";
    else if (/\s/.test(ch) && !quote) {
      if (current) out.push(current);
      current = "";
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

function display(command, args) {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:=@,+-]+$/.test(String(part))
        ? String(part)
        : JSON.stringify(String(part)),
    )
    .join(" ");
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
    const parsed = splitCommandLine(args.wrangler_command);
    if (parsed.length)
      return {
        command: parsed[0],
        args: parsed.slice(1),
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

function packageRun(pm, root, script) {
  const r = posix(root || ".");
  if (pm === "pnpm")
    return {
      command: "pnpm",
      args: r === "." ? ["run", script] : ["--dir", r, "run", script],
      shell: false,
    };
  if (pm === "yarn")
    return {
      command: "yarn",
      args: r === "." ? [script] : ["--cwd", r, script],
      shell: false,
    };
  if (pm === "bun")
    return {
      command: "bun",
      args: r === "." ? ["run", script] : ["--cwd", r, "run", script],
      shell: false,
    };
  return {
    command: "npm",
    args: r === "." ? ["run", script] : ["--prefix", r, "run", script],
    shell: false,
  };
}

function inputCandidates(args) {
  const files = [args.input_file];
  if (args.output_file)
    files.push(
      path.join(path.dirname(args.output_file), "discover-deployments.json"),
    );
  if (process.env.CLOUDFLARE_OUTPUT_DIR)
    files.push(
      path.join(process.env.CLOUDFLARE_OUTPUT_DIR, "discover-deployments.json"),
    );
  files.push(
    "artifacts/cloudflare/staging/discover-deployments.json",
    "artifacts/ci/cloudflare-targets.json",
  );
  return [...new Set(files.map(posix).filter(Boolean))];
}

function loadInput(args, root) {
  const searched = inputCandidates(args);
  const file =
    searched.find((candidate) => isFile(abs(candidate, root))) ||
    args.input_file;
  const data = readJson(file, root, null);
  return {
    file: rel(abs(file, root), root),
    available: Boolean(data),
    searched_files: searched.map((x) => rel(abs(x, root), root)),
    data,
  };
}

function targetList(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.targets)) return data.targets;
  if (Array.isArray(data.cloudflare_targets)) return data.cloudflare_targets;
  if (Array.isArray(data.deployment_targets)) return data.deployment_targets;
  if (Array.isArray(data.projects)) return data.projects;
  return [];
}

function matrixList(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.deployment_matrix)) return data.deployment_matrix;
  if (Array.isArray(data.deployments)) return data.deployments;
  if (Array.isArray(data.deployment_targets)) return data.deployment_targets;
  if (Array.isArray(data.results))
    return data.results.filter(
      (x) =>
        x &&
        (x.type || x.primary_type || x.target_type || x.target_name || x.name),
    );
  return [];
}

function targetMap(targets) {
  const map = new Map();
  for (const target of targets || []) {
    for (const key of [
      target.id,
      target.name,
      `${target.name}:${target.root}`,
      `${target.primary_type}:${target.name}`,
      `${target.type}:${target.name}`,
      target.config_file,
    ]) {
      if (key) map.set(String(key), target);
    }
  }
  return map;
}

function directDeployment(args) {
  if (
    !args.target_name &&
    !args.target_config &&
    !args.target_root &&
    !args.target_type
  )
    return null;
  const type = args.target_type || "worker";
  const name =
    args.target_name ||
    path.basename(
      args.target_root ||
        path.dirname(args.target_config || "cloudflare-target"),
    );
  return {
    id:
      args.target_id ||
      safeId(`${type}-${name}-${args.target_root || args.target_config}`),
    name,
    type,
    target_types: [type],
    root: args.target_root || ".",
    config_file: args.target_config || "",
    environment: args.environment,
    stage: args.stage,
    wrangler_environment: args.environment,
    has_config_environment: false,
    affected: true,
    main: "",
    pages_build_output_dir: "",
    compatibility_date: "",
  };
}

function normalizeDeployment(record, target, args) {
  const type = s(
    record.type ||
      record.primary_type ||
      record.target_type ||
      target.primary_type ||
      target.type ||
      "unknown",
  ).toLowerCase();
  const name = s(
    record.name ||
      record.target_name ||
      target.name ||
      process.env.CLOUDFLARE_PROJECT_NAME ||
      "cloudflare-target",
  );
  const root = posix(record.root || target.root || ".");
  const affected =
    record.affected === undefined && target.affected === undefined
      ? true
      : Boolean(record.affected || target.affected);
  return {
    id: s(
      record.id ||
        record.target_id ||
        target.id ||
        safeId(`${type}-${name}-${root}`),
    ),
    name,
    type,
    target_types: record.target_types || target.target_types || [type],
    root,
    config_file: posix(record.config_file || target.config_file || ""),
    package_json: record.package_json || target.package_json || null,
    package_name: record.package_name || target.package_name || null,
    package_manager_command:
      record.package_manager_command || target.package_manager_command || "",
    environment: s(
      record.environment ||
        target.environment ||
        args.environment ||
        DEFAULT_ENVIRONMENT,
    ).toLowerCase(),
    stage: s(record.stage || args.stage || "").toLowerCase(),
    wrangler_environment:
      record.wrangler_environment === undefined ||
      record.wrangler_environment === null
        ? target.wrangler_environment || ""
        : String(record.wrangler_environment),
    has_config_environment: Boolean(
      record.has_config_environment || target.has_config_environment,
    ),
    affected,
    main: record.main || target.main || "",
    pages_build_output_dir:
      record.pages_build_output_dir || target.pages_build_output_dir || "",
    compatibility_date:
      record.compatibility_date || target.compatibility_date || "",
    d1_databases: Number(
      record.d1_databases || target.resource_counts?.d1_databases || 0,
    ),
    kv_namespaces: Number(
      record.kv_namespaces || target.resource_counts?.kv_namespaces || 0,
    ),
    r2_buckets: Number(
      record.r2_buckets || target.resource_counts?.r2_buckets || 0,
    ),
    queue_producers: Number(
      record.queue_producers || target.resource_counts?.queue_producers || 0,
    ),
    queue_consumers: Number(
      record.queue_consumers || target.resource_counts?.queue_consumers || 0,
    ),
    durable_objects: Number(
      record.durable_objects || target.resource_counts?.durable_objects || 0,
    ),
  };
}

function selectDeployments(input, args) {
  const data = input.data || {};
  const targets = targetList(data);
  const targetsByKey = targetMap(targets);
  const deployments = matrixList(data).map((entry) => {
    const target =
      targetsByKey.get(entry.id) ||
      targetsByKey.get(entry.target_id) ||
      targetsByKey.get(entry.name) ||
      targetsByKey.get(entry.target_name) ||
      targetsByKey.get(`${entry.name}:${entry.root}`) ||
      targetsByKey.get(`${entry.type}:${entry.name}`) ||
      targetsByKey.get(`${entry.primary_type}:${entry.name}`) ||
      targetsByKey.get(entry.config_file) ||
      {};
    return normalizeDeployment(
      {
        ...entry,
        environment: entry.environment || args.environment,
        stage: entry.stage || args.stage,
      },
      target,
      args,
    );
  });
  if (!deployments.length) {
    for (const target of targets) {
      deployments.push(
        normalizeDeployment(
          {
            id: target.id,
            name: target.name,
            type: target.primary_type || target.type,
            root: target.root,
            config_file: target.config_file,
            environment: args.environment,
            stage: args.stage,
            wrangler_environment: target.environments?.includes?.(
              args.environment,
            )
              ? args.environment
              : "",
            has_config_environment:
              target.environments?.includes?.(args.environment) || false,
            affected: target.affected,
            pages_build_output_dir: target.pages_build_output_dir,
          },
          target,
          args,
        ),
      );
    }
  }
  const direct = directDeployment(args);
  if (direct) deployments.push(direct);
  return [
    ...new Map(
      deployments
        .filter((deployment) => matchesDeployment(deployment, args))
        .slice(0, args.max_deployments > 0 ? args.max_deployments : undefined)
        .map((deployment) => [deployment.id, deployment]),
    ).values(),
  ];
}

function matchesDeployment(deployment, args) {
  if (args.environment && deployment.environment !== args.environment)
    return false;
  if (args.target_id && deployment.id !== args.target_id) return false;
  if (args.target_name && deployment.name !== args.target_name) return false;
  if (args.target_type && deployment.type !== args.target_type) return false;
  if (args.target_root && deployment.root !== posix(args.target_root))
    return false;
  if (
    args.target_config &&
    deployment.config_file !== posix(args.target_config)
  )
    return false;
  if (
    args.include_targets.length &&
    !args.include_targets.includes(deployment.name)
  )
    return false;
  if (args.exclude_targets.includes(deployment.name)) return false;
  if (args.changed_only && !deployment.affected) return false;
  if (deployment.type === "pages" && !args.deploy_pages) return false;
  if (deployment.type === "worker" && !args.deploy_workers) return false;
  return deployment.type === "pages" || deployment.type === "worker";
}

function targetPath(targetRoot, targetPathValue, root) {
  const value = s(targetPathValue);
  if (!value) return "";
  if (path.isAbsolute(value)) return path.normalize(value);
  const fromRoot = abs(value, root);
  return fs.existsSync(fromRoot)
    ? fromRoot
    : abs(path.join(targetRoot || ".", value), root);
}

function validateCredentials(args) {
  const errors = [];
  const warnings = [];
  if (!args.require_credentials || args.dry_run)
    return { ok: true, errors, warnings };
  if (!process.env.CLOUDFLARE_API_TOKEN)
    errors.push("Missing CLOUDFLARE_API_TOKEN.");
  if (args.require_account_id && !process.env.CLOUDFLARE_ACCOUNT_ID)
    errors.push("Missing CLOUDFLARE_ACCOUNT_ID.");
  else if (!process.env.CLOUDFLARE_ACCOUNT_ID)
    warnings.push(
      "CLOUDFLARE_ACCOUNT_ID is not set; Wrangler must infer the account.",
    );
  return { ok: errors.length === 0, errors, warnings };
}

function stagingGuard(args, github) {
  const errors = [];
  const warnings = [];
  const ref = s(process.env.GITHUB_REF || github.ref || "");
  const refName = safeBranch(
    process.env.GITHUB_REF_NAME || github.branch || args.branch,
    DEFAULT_BRANCH,
  );
  const isTag = ref.startsWith("refs/tags/");
  const branchAllowed = matchesAny(refName, args.allowed_branches);
  const tagAllowed = isTag && matchesAny(refName, args.allowed_tags);
  if (args.require_allowed_ref && !branchAllowed && !tagAllowed)
    errors.push(
      `Staging deployment is not allowed from ref "${refName}". Allowed branches: ${args.allowed_branches.join(", ")}. Allowed tags: ${args.allowed_tags.join(", ")}.`,
    );
  if (!args.require_allowed_ref && !branchAllowed && !tagAllowed)
    warnings.push(
      `Ref "${refName}" does not match the configured staging branch/tag allow-list, but the guard is not required.`,
    );
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ref,
    ref_name: refName,
    is_tag: isTag,
    branch_allowed: branchAllowed,
    tag_allowed: tagAllowed,
  };
}

function validateDeployment(deployment, args, root) {
  const errors = [];
  const warnings = [];
  if (deployment.environment !== args.environment)
    errors.push(
      `Staging runner received mismatched deployment environment: ${deployment.environment}`,
    );
  if (deployment.type === "pages") {
    const out = targetPath(
      deployment.root,
      deployment.pages_build_output_dir,
      root,
    );
    if (!deployment.pages_build_output_dir)
      errors.push("Pages target is missing pages_build_output_dir.");
    else if (!isDir(out) && !args.run_build && !args.dry_run)
      errors.push(`Pages output directory does not exist: ${rel(out, root)}`);
    if (!deployment.name)
      errors.push("Pages target is missing a project name.");
  }
  if (deployment.type === "worker") {
    const config = abs(deployment.config_file, root);
    if (!deployment.config_file)
      errors.push("Worker target is missing config_file.");
    else if (!isFile(config))
      errors.push(
        `Worker Wrangler config does not exist: ${deployment.config_file}`,
      );
    if (
      args.require_worker_staging_env &&
      !args.allow_worker_default_staging &&
      !deployment.has_config_environment
    )
      errors.push(
        `Worker target "${deployment.name}" does not declare a Wrangler "${args.environment}" environment. Enable --allow-worker-default-staging only when the default Wrangler environment is staging-safe.`,
      );
    if (
      deployment.wrangler_environment &&
      deployment.wrangler_environment !== args.environment &&
      deployment.has_config_environment
    )
      errors.push(
        `Worker target "${deployment.name}" resolved to non-staging Wrangler environment "${deployment.wrangler_environment}".`,
      );
  }
  if (deployment.type !== "pages" && deployment.type !== "worker")
    errors.push(`Unsupported Cloudflare target type: ${deployment.type}`);
  return { ok: errors.length === 0, errors, warnings };
}

function redact(value) {
  return String(value || "").replace(SECRET_RE, "[REDACTED]");
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[),.;]+$/g, "")
    .trim();
}

function urls(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => String(value || "").match(URL_RE) || [])
        .map(cleanUrl)
        .filter(Boolean),
    ),
  ];
}

function logFile(logDir, name, content, root, args) {
  if (!args.write_logs) return null;
  const file = abs(path.join(logDir, name), root);
  writeFile(file, redact(content), { dry_run: args.dry_run });
  return rel(file, root);
}

function run(commandRecord, args, root) {
  const started = new Date();
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;
  if (args.dry_run)
    return {
      ...commandRecord,
      status: "skipped",
      success: true,
      skipped: true,
      dry_run: true,
      exit_code: null,
      signal: null,
      error: "",
      started_at: started.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
      stdout_log: null,
      stderr_log: null,
      stdout_preview: "",
      stderr_preview: "",
      urls: [],
    };
  logger.info(`Running ${commandRecord.display}`);
  const result = cp.spawnSync(commandRecord.command, commandRecord.args, {
    cwd: commandRecord.cwd || root,
    env: { ...process.env, CI: process.env.CI || "true" },
    shell: Boolean(commandRecord.shell),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: args.max_buffer_mb * 1024 * 1024,
    timeout,
  });
  const ended = new Date();
  const stdout = redact(result.stdout || "");
  const stderr = redact(result.stderr || "");
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;
  return {
    ...commandRecord,
    status: success ? "passed" : "failed",
    success,
    skipped: false,
    dry_run: false,
    exit_code: result.status,
    signal: result.signal || null,
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_ms: ended.getTime() - started.getTime(),
    stdout_log: logFile(
      args.log_dir,
      `${commandRecord.id}.stdout.log`,
      stdout,
      root,
      args,
    ),
    stderr_log: logFile(
      args.log_dir,
      `${commandRecord.id}.stderr.log`,
      stderr,
      root,
      args,
    ),
    stdout_preview: stdout.slice(0, 4000),
    stderr_preview: stderr.slice(0, 4000),
    urls: urls(stdout, stderr),
  };
}

function pagesProjectNotFound(result) {
  if (
    !result ||
    result.success ||
    result.kind !== "deploy" ||
    result.target_type !== "pages"
  )
    return false;
  const output = `${result.stdout_preview || ""}\n${result.stderr_preview || ""}\n${result.error || ""}`;
  return (
    /project not found/i.test(output) ||
    /code:\s*8000007/i.test(output) ||
    /\/pages\/projects\//i.test(output)
  );
}

function pagesProjectAlreadyExists(result) {
  if (!result || result.success) return false;
  const output = `${result.stdout_preview || ""}\n${result.stderr_preview || ""}\n${result.error || ""}`;
  return (
    /already exists/i.test(output) ||
    /project already exists/i.test(output) ||
    /name already exists/i.test(output)
  );
}

function createPagesProjectCommand(commandRecord, args, root) {
  const commandArgs = Array.isArray(commandRecord.args)
    ? commandRecord.args
    : [];
  const pagesIndex = commandArgs.indexOf("pages");
  const wranglerArgs =
    pagesIndex >= 0 ? commandArgs.slice(0, pagesIndex) : ["exec", "wrangler"];
  const projectName =
    commandRecord.pages_project_name ||
    commandRecord.target_name ||
    s(process.env.CLOUDFLARE_PROJECT_NAME);
  if (!projectName) return null;
  const projectArgs = [
    ...wranglerArgs,
    "pages",
    "project",
    "create",
    projectName,
    "--production-branch",
    args.pages_production_branch || DEFAULT_PRODUCTION_BRANCH,
  ];
  return {
    id: safeId(
      `${commandRecord.target_id || projectName}-create-pages-project-${args.stage || args.environment}`,
    ),
    kind: "setup",
    target_id: commandRecord.target_id,
    target_name: commandRecord.target_name || projectName,
    target_type: "pages",
    command: commandRecord.command,
    args: projectArgs,
    shell: false,
    cwd: root,
    pages_project_name: projectName,
    pages_production_branch:
      args.pages_production_branch || DEFAULT_PRODUCTION_BRANCH,
    display: display(commandRecord.command, projectArgs),
  };
}

function retryCommand(commandRecord) {
  return {
    ...commandRecord,
    id: safeId(`${commandRecord.id || commandRecord.target_id}-retry`),
    retry_of: commandRecord.id || "",
    display: `${commandRecord.display} (retry after Pages project create)`,
  };
}

function buildCommand(deployment, args, root, pm) {
  if (!args.run_build) return null;
  if (args.build_command)
    return {
      id: safeId(`${deployment.id}-build-staging`),
      kind: "build",
      target_id: deployment.id,
      target_name: deployment.name,
      target_type: deployment.type,
      command: args.build_command,
      args: [],
      shell: true,
      cwd: abs(deployment.root || ".", root),
      display: args.build_command,
    };
  const command = packageRun(pm, deployment.root, "build");
  return {
    id: safeId(`${deployment.id}-build-staging`),
    kind: "build",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: command.command,
    args: command.args,
    shell: command.shell,
    cwd: root,
    display: display(command.command, command.args),
  };
}

function pagesDeployCommand(deployment, args, root, wrangler) {
  const outputDir = targetPath(
    deployment.root,
    deployment.pages_build_output_dir,
    root,
  );
  const wranglerArgs = [
    ...wrangler.args,
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    deployment.name,
    "--branch",
    args.branch,
    "--commit-dirty=true",
  ];
  if (process.env.GITHUB_SHA)
    wranglerArgs.push("--commit-hash", process.env.GITHUB_SHA);
  wranglerArgs.push(
    "--commit-message",
    process.env.GITHUB_EVENT_NAME
      ? `${PROJECT_NAME} staging deployment from ${process.env.GITHUB_EVENT_NAME}`
      : `${PROJECT_NAME} staging deployment`,
  );
  return {
    id: safeId(`${deployment.id}-deploy-pages-staging`),
    kind: "deploy",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: wrangler.command,
    args: wranglerArgs,
    shell: false,
    cwd: root,
    pages_project_name: deployment.name,
    pages_production_branch: args.pages_production_branch,
    display: display(wrangler.command, wranglerArgs),
  };
}

function workerDeployCommand(deployment, args, root, wrangler) {
  const wranglerArgs = [
    ...wrangler.args,
    "deploy",
    "--config",
    abs(deployment.config_file, root),
  ];
  if (deployment.wrangler_environment && deployment.has_config_environment)
    wranglerArgs.push("--env", deployment.wrangler_environment);
  return {
    id: safeId(`${deployment.id}-deploy-worker-staging`),
    kind: "deploy",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: wrangler.command,
    args: wranglerArgs,
    shell: false,
    cwd: root,
    display: display(wrangler.command, wranglerArgs),
  };
}

function deployCommand(deployment, args, root, wrangler) {
  if (deployment.type === "pages")
    return pagesDeployCommand(deployment, args, root, wrangler);
  if (deployment.type === "worker")
    return workerDeployCommand(deployment, args, root, wrangler);
  return null;
}

function createPlan(args, root, input) {
  const github = gitMeta(root);
  const wrangler = wranglerPrefix(args, root);
  const pm = packageManager(root, args.package_manager);
  const credentials = validateCredentials(args);
  const guard = stagingGuard(args, github);
  const deployments = selectDeployments(input, args);
  const commands = [];
  const skipped = [];
  const validations = [];
  for (const deployment of deployments) {
    const validation = validateDeployment(deployment, args, root);
    validations.push({
      target_id: deployment.id,
      target_name: deployment.name,
      target_type: deployment.type,
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    });
    if (!validation.ok) {
      skipped.push({
        target_id: deployment.id,
        target_name: deployment.name,
        target_type: deployment.type,
        reason: validation.errors.join("; "),
      });
      continue;
    }
    const build = buildCommand(deployment, args, root, pm);
    const deploy = deployCommand(deployment, args, root, wrangler);
    if (build) commands.push(build);
    if (deploy) commands.push(deploy);
  }
  return {
    credentials,
    staging_guard: guard,
    wrangler: {
      command: wrangler.command,
      args: wrangler.args,
      package_manager: wrangler.package_manager,
      display: display(wrangler.command, wrangler.args),
    },
    package_manager: pm,
    deployments,
    validations,
    commands,
    skipped,
  };
}

function executePlan(plan, args, root) {
  const results = [];
  if (!plan.credentials.ok)
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.credentials.errors.join("; "),
    };
  if (!plan.staging_guard.ok)
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.staging_guard.errors.join("; "),
    };
  let stoppedEarly = false;
  let stopIndex = -1;
  for (let index = 0; index < plan.commands.length; index += 1) {
    const command = plan.commands[index];
    let result = run(command, args, root);
    results.push(result);
    if (
      !result.success &&
      args.auto_create_pages_project &&
      pagesProjectNotFound(result)
    ) {
      const createCommand = createPagesProjectCommand(command, args, root);
      if (createCommand) {
        logger.warn(
          `Cloudflare Pages project "${createCommand.pages_project_name}" was not found. Creating it and retrying deployment.`,
        );
        const createResult = run(createCommand, args, root);
        if (pagesProjectAlreadyExists(createResult)) {
          createResult.status = "recovered";
          createResult.success = true;
          createResult.recovered = true;
        }
        results.push(createResult);
        if (createResult.success) {
          const retryResult = run(retryCommand(command), args, root);
          results.push(retryResult);
          if (retryResult.success) {
            result.status = "recovered";
            result.success = true;
            result.recovered = true;
            result.recovered_by = retryResult.id;
          }
          result = retryResult;
        }
      }
    }
    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      stopIndex = index;
      logger.warn("Stopping after first failed Cloudflare staging command.");
      break;
    }
  }
  const skipped = stoppedEarly
    ? plan.commands
        .slice(stopIndex + 1)
        .map((command) => ({
          ...command,
          status: "skipped",
          success: true,
          skipped: true,
          dry_run: args.dry_run,
          exit_code: null,
          signal: null,
          error: "Skipped because a previous command failed.",
          started_at: null,
          ended_at: null,
          duration_ms: 0,
          stdout_log: null,
          stderr_log: null,
          stdout_preview: "",
          stderr_preview: "",
          urls: [],
        }))
    : [];
  return {
    results: [...results, ...skipped],
    stopped_early: stoppedEarly,
    blocked: false,
    block_reason: "",
  };
}

function duration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function summarize(results, skipped) {
  const passed = results.filter((r) => r.status === "passed").length;
  const recovered = results.filter((r) => r.status === "recovered").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skippedCommands = results.filter((r) => r.status === "skipped").length;
  const durationMs = results.reduce(
    (sum, r) => sum + Number(r.duration_ms || 0),
    0,
  );
  return {
    total_commands: results.length,
    passed,
    recovered,
    failed,
    skipped: skippedCommands + skipped.length,
    skipped_targets: skipped.length,
    duration_ms: durationMs,
    duration_human: duration(durationMs),
    ok: failed === 0,
  };
}

function groupDeployments(deployments) {
  const groups = {};
  for (const deployment of deployments) {
    const type = deployment.type || "unknown";
    groups[type] ||= { count: 0, affected: 0, targets: [] };
    groups[type].count += 1;
    if (deployment.affected) groups[type].affected += 1;
    groups[type].targets.push(deployment.name);
  }
  return Object.fromEntries(
    Object.entries(groups).sort(([a], [z]) => a.localeCompare(z)),
  );
}

function resultUrls(results) {
  return [...new Set(results.flatMap((result) => result.urls || []))];
}

function report(args, root, input, plan, execution) {
  const github = gitMeta(root);
  const totals = summarize(execution.results, plan.skipped);
  const allUrls = resultUrls(execution.results);
  const primaryUrl = allUrls[0] || "";
  const deployResults = execution.results.filter((r) => r.kind === "deploy");
  const buildResults = execution.results.filter((r) => r.kind === "build");
  const setupResults = execution.results.filter((r) => r.kind === "setup");
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0
      ? "failed"
      : plan.deployments.length === 0
        ? "empty"
        : args.dry_run
          ? "planned"
          : "deployed";
  return {
    schema_version: 1,
    type: "cloudflare-staging-deployment",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    staging_url: primaryUrl,
    deployment_url: primaryUrl,
    url: primaryUrl,
    cloudflare: {
      staging_url: primaryUrl,
      deployment_url: primaryUrl,
      urls: allUrls,
      environment: args.environment,
      stage: args.stage,
      branch: args.branch,
    },
    github,
    input: {
      file: input.file,
      available: input.available,
      searched_files: input.searched_files || [],
      type: input.data?.type || null,
      created_at: input.data?.created_at || null,
    },
    config: {
      input_file: rel(abs(args.input_file, root), root),
      output_file: rel(abs(args.output_file, root), root),
      summary_file: args.write_summary_file
        ? rel(abs(args.summary_file, root), root)
        : null,
      log_dir: args.write_logs ? rel(abs(args.log_dir, root), root) : null,
      environment: args.environment,
      stage: args.stage,
      branch: args.branch,
      changed_only: args.changed_only,
      deploy_pages: args.deploy_pages,
      deploy_workers: args.deploy_workers,
      auto_create_pages_project: args.auto_create_pages_project,
      pages_production_branch: args.pages_production_branch,
      run_build: args.run_build,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      require_allowed_ref: args.require_allowed_ref,
      require_worker_staging_env: args.require_worker_staging_env,
      allowed_branches: args.allowed_branches,
      allowed_tags: args.allowed_tags,
      allow_worker_default_staging: args.allow_worker_default_staging,
      max_deployments: args.max_deployments,
      dry_run: args.dry_run,
      fail_on_error: args.fail_on_error,
      continue_on_error: args.continue_on_error,
    },
    wrangler: plan.wrangler,
    credentials: {
      ok: plan.credentials.ok,
      api_token_present: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      account_id_present: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
      warnings: plan.credentials.warnings,
      errors: plan.credentials.errors,
    },
    staging_guard: plan.staging_guard,
    totals: {
      selected_deployments: plan.deployments.length,
      selected_pages: plan.deployments.filter((d) => d.type === "pages").length,
      selected_workers: plan.deployments.filter((d) => d.type === "worker")
        .length,
      planned_commands: plan.commands.length,
      build_commands: plan.commands.filter((c) => c.kind === "build").length,
      deploy_commands: plan.commands.filter((c) => c.kind === "deploy").length,
      setup_commands: setupResults.length,
      build_passed: buildResults.filter((r) => r.status === "passed").length,
      build_failed: buildResults.filter((r) => r.status === "failed").length,
      deploy_passed: deployResults.filter((r) => r.status === "passed").length,
      deploy_recovered: deployResults.filter((r) => r.status === "recovered")
        .length,
      deploy_failed: deployResults.filter((r) => r.status === "failed").length,
      setup_passed: setupResults.filter((r) => r.status === "passed").length,
      setup_failed: setupResults.filter((r) => r.status === "failed").length,
      urls: allUrls.length,
      ...totals,
    },
    deployments: plan.deployments,
    deployment_groups: groupDeployments(plan.deployments),
    validations: plan.validations,
    planned_commands: plan.commands.map((c) => ({
      id: c.id,
      kind: c.kind,
      target_id: c.target_id,
      target_name: c.target_name,
      target_type: c.target_type,
      display: c.display,
      cwd: c.cwd ? rel(c.cwd, root) : ".",
    })),
    skipped_targets: plan.skipped,
    results: execution.results,
    failures: execution.results.filter((r) => r.status === "failed"),
    urls: allUrls,
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
  };
}

function mdEscape(v) {
  return String(v || "").replace(/\|/g, "\\|");
}

function markdown(r) {
  const lines = [
    `# 🧪 ${PROJECT_NAME} Cloudflare Staging Deployment`,
    "",
    `Generated: \`${r.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${r.status}\``,
    `- Environment: \`${r.config.environment}\``,
    `- Stage: \`${r.config.stage}\``,
    `- Branch: \`${r.config.branch}\``,
    `- Dry run: \`${r.config.dry_run ? "true" : "false"}\``,
    `- Auto-create Pages project: \`${r.config.auto_create_pages_project ? "true" : "false"}\``,
    `- Pages production branch: \`${r.config.pages_production_branch}\``,
    "",
    "## Totals",
    "",
    `- Selected deployments: \`${r.totals.selected_deployments}\``,
    `- Pages targets: \`${r.totals.selected_pages}\``,
    `- Worker targets: \`${r.totals.selected_workers}\``,
    `- Planned commands: \`${r.totals.planned_commands}\``,
    `- Setup commands: \`${r.totals.setup_commands}\``,
    `- Passed: \`${r.totals.passed}\``,
    `- Recovered: \`${r.totals.recovered}\``,
    `- Failed: \`${r.totals.failed}\``,
    `- Skipped: \`${r.totals.skipped}\``,
    `- URLs: \`${r.totals.urls}\``,
    `- Duration: \`${r.totals.duration_human}\``,
    "",
  ];
  if (r.staging_url)
    lines.push("## Primary Staging URL", "", `- ${r.staging_url}`, "");
  lines.push("## Selected Deployments", "");
  if (!r.deployments.length)
    lines.push("No Cloudflare staging deployments were selected.");
  else {
    lines.push(
      "| Target | Type | Root | Config | Affected |",
      "|---|---|---|---|---:|",
    );
    for (const d of r.deployments)
      lines.push(
        `| \`${d.name}\` | \`${d.type}\` | \`${d.root}\` | \`${d.config_file || "none"}\` | \`${d.affected ? "true" : "false"}\` |`,
      );
  }
  lines.push("", "## Commands", "");
  if (!r.results.length) lines.push("No commands were executed.");
  else {
    lines.push(
      "| Status | Kind | Target | Type | Duration | Command |",
      "|---|---|---|---|---:|---|",
    );
    for (const result of r.results.slice(0, 200))
      lines.push(
        `| \`${result.status}\` | \`${result.kind}\` | \`${result.target_name}\` | \`${result.target_type}\` | \`${duration(result.duration_ms)}\` | \`${mdEscape(result.display)}\` |`,
      );
  }
  if (r.urls.length) {
    lines.push("", "## URLs", "");
    for (const url of r.urls) lines.push(`- ${url}`);
  }
  if (r.skipped_targets.length) {
    lines.push(
      "",
      "## Skipped Targets",
      "",
      "| Target | Type | Reason |",
      "|---|---|---|",
    );
    for (const skipped of r.skipped_targets)
      lines.push(
        `| \`${skipped.target_name}\` | \`${skipped.target_type}\` | ${mdEscape(skipped.reason)} |`,
      );
  }
  const warnings = [
    ...(r.staging_guard.warnings || []),
    ...(r.credentials.warnings || []),
  ];
  if (warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of warnings) lines.push(`- ${warning}`);
  }
  const guardErrors = [
    ...(r.staging_guard.errors || []),
    ...(r.credentials.errors || []),
  ];
  if (guardErrors.length) {
    lines.push("", "## Guard Errors", "");
    for (const error of guardErrors) lines.push(`- ${error}`);
  }
  if (r.failures.length) {
    lines.push(
      "",
      "## Failures",
      "",
      "| Kind | Target | Exit | Error | Stderr Log |",
      "|---|---|---:|---|---|",
    );
    for (const failure of r.failures.slice(0, 50)) {
      const error =
        failure.error ||
        failure.stderr_preview.split(/\r?\n/).slice(0, 2).join(" ");
      lines.push(
        `| \`${failure.kind}\` | \`${failure.target_name}\` | \`${failure.exit_code ?? "unknown"}\` | ${mdEscape(error || "Command failed.")} | \`${failure.stderr_log || "not written"}\` |`,
      );
    }
  }
  lines.push(
    "",
    "## Outputs",
    "",
    `- JSON report: \`${r.config.output_file}\``,
    `- Markdown summary: \`${r.config.summary_file || "not written"}\``,
    `- Log directory: \`${r.config.log_dir || "not written"}\``,
  );
  return `${lines.join("\n").trim()}\n`;
}

function appendSummary(markdownText) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return false;
  fs.appendFileSync(file, `${String(markdownText).trim()}\n\n`);
  return true;
}

function output(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return false;
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(file, `${name}<<EOF\n${redact(rendered)}\nEOF\n`);
  return true;
}

function writeOutputs(r) {
  output("cloudflare_staging_file", r.config.output_file);
  output("cloudflare_staging_summary_file", r.config.summary_file || "");
  output("cloudflare_staging_log_dir", r.config.log_dir || "");
  output("cloudflare_staging_status", r.status);
  output(
    "cloudflare_staging_ok",
    r.totals.failed === 0 && !r.blocked ? "true" : "false",
  );
  output("cloudflare_staging_environment", r.config.environment);
  output("cloudflare_staging_stage", r.config.stage);
  output("cloudflare_staging_branch", r.config.branch);
  output("cloudflare_staging_url", r.staging_url || "");
  output("staging_url", r.staging_url || "");
  output("deployment_url", r.deployment_url || "");
  output(
    "cloudflare_staging_selected_deployments",
    String(r.totals.selected_deployments),
  );
  output("cloudflare_staging_pages", String(r.totals.selected_pages));
  output("cloudflare_staging_workers", String(r.totals.selected_workers));
  output(
    "cloudflare_staging_planned_commands",
    String(r.totals.planned_commands),
  );
  output("cloudflare_staging_passed", String(r.totals.passed));
  output("cloudflare_staging_recovered", String(r.totals.recovered));
  output("cloudflare_staging_failed", String(r.totals.failed));
  output("cloudflare_staging_blocked", r.blocked ? "true" : "false");
  output("cloudflare_staging_block_reason", r.block_reason || "");
  output("cloudflare_staging_guard_ok", r.staging_guard.ok ? "true" : "false");
  output(
    "cloudflare_staging_auto_create_pages_project",
    r.config.auto_create_pages_project ? "true" : "false",
  );
  output(
    "cloudflare_staging_pages_production_branch",
    r.config.pages_production_branch,
  );
  output("cloudflare_staging_urls", r.urls.join(","));
  output("cloudflare_staging_urls_json", JSON.stringify(r.urls));
  output(
    "cloudflare_staging_target_names",
    r.deployments.map((deployment) => deployment.name).join(","),
  );
  output(
    "cloudflare_staging_target_names_json",
    JSON.stringify(r.deployments.map((deployment) => deployment.name)),
  );
  output("cloudflare_staging_failures_json", JSON.stringify(r.failures));
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const outputFile = abs(args.output_file, root);
  const summaryFile = abs(args.summary_file, root);
  logger.info("Preparing Cloudflare staging deployment.");
  const input = loadInput(args, root);
  const plan = createPlan(args, root, input);
  if (args.fail_if_empty && plan.deployments.length === 0) {
    logger.error("No Cloudflare staging deployments were selected.");
    process.exitCode = 1;
  }
  const execution =
    process.exitCode === 1
      ? { results: [], stopped_early: false, blocked: false, block_reason: "" }
      : executePlan(plan, args, root);
  const finalReport = report(args, root, input, plan, execution);
  const json = `${JSON.stringify(finalReport, null, 2)}\n`;
  const summary = markdown(finalReport);
  writeFile(outputFile, json, { dry_run: args.dry_run });
  if (args.write_summary_file)
    writeFile(summaryFile, summary, { dry_run: args.dry_run });
  writeOutputs(finalReport);
  if (args.write_step_summary) appendSummary(summary);
  if (args.print) console.log(json.trim());
  if (args.fail_if_empty && finalReport.totals.selected_deployments === 0) {
    process.exitCode = 1;
    return;
  }
  if (args.fail_on_error && finalReport.blocked) {
    logger.error(
      `Cloudflare staging deployment blocked: ${finalReport.block_reason}`,
    );
    process.exitCode = 1;
    return;
  }
  if (args.fail_on_error && finalReport.totals.failed > 0) {
    logger.error(
      `Cloudflare staging deployment failed with ${finalReport.totals.failed} failed command(s).`,
    );
    process.exitCode = 1;
  }
}

main();
