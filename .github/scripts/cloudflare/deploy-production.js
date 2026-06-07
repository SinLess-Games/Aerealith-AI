#!/usr/bin/env node
// .github/scripts/cloudflare/deploy-production.js
// Aerealith AI — Cloudflare Production Deployment Runner
// Deploys discovered Pages/Worker targets. Missing Pages projects are created automatically and retried.

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

let logger;
try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (m) => console.log(`[cloudflare-production] ${m}`),
    warn: (m) => console.warn(`[cloudflare-production] WARN: ${m}`),
    error: (m) => console.error(`[cloudflare-production] ERROR: ${m}`),
    formatError: (e) => e?.message || String(e || "unknown error"),
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_BRANCH = "main";
const DEFAULT_PRODUCTION_BRANCH = "main";

const DEFAULT_INPUT_FILE = process.env.CLOUDFLARE_OUTPUT_DIR
  ? path.join(process.env.CLOUDFLARE_OUTPUT_DIR, "discover-deployments.json")
  : "artifacts/cloudflare/production/discover-deployments.json";

const DEFAULT_OUTPUT_FILE =
  "artifacts/cloudflare/production/deploy-production.json";
const DEFAULT_SUMMARY_FILE =
  "artifacts/cloudflare/production/deploy-production.md";
const DEFAULT_LOG_DIR = "artifacts/cloudflare/deploy-production/logs";

const TRUE = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE = new Set(["false", "0", "no", "n", "off", "disabled"]);

const URL_RE = /https?:\/\/[^\s"'<>]+/g;
const SECRET_RE =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

function s(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function b(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE.has(normalized)) return true;
  if (FALSE.has(normalized)) return false;

  return fallback;
}

function i(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (value === undefined || value === null || value === "") return [];

  const items = Array.isArray(value) ? value : String(value).split(",");

  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function argValue(argv, index, arg) {
  const value = argv[index + 1];

  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for argument: ${arg}`);
  }

  return value;
}

function safeBranch(value, fallback = DEFAULT_BRANCH) {
  return (
    s(value, fallback)
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/pull\//, "pull-")
      .replace(/[^A-Za-z0-9._/-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^-|-$/g, "")
      .slice(0, 180) || fallback
  );
}

function safeId(value) {
  return (
    s(value, "cloudflare-production")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-production"
  );
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    input_file:
      process.env.CLOUDFLARE_PRODUCTION_INPUT_FILE || DEFAULT_INPUT_FILE,
    output_file:
      process.env.CLOUDFLARE_PRODUCTION_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_PRODUCTION_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    log_dir: process.env.CLOUDFLARE_PRODUCTION_LOG_DIR || DEFAULT_LOG_DIR,

    environment:
      process.env.CLOUDFLARE_PRODUCTION_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,
    stage:
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_PRODUCTION_STAGE ||
      DEFAULT_ENVIRONMENT,
    branch:
      process.env.CLOUDFLARE_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PRODUCTION_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_BRANCH,

    target_id:
      process.env.CLOUDFLARE_TARGET_ID ||
      process.env.CLOUDFLARE_PRODUCTION_TARGET_ID ||
      "",
    target_name:
      process.env.CLOUDFLARE_TARGET_NAME ||
      process.env.CLOUDFLARE_PRODUCTION_TARGET_NAME ||
      "",
    target_type:
      process.env.CLOUDFLARE_TARGET_TYPE ||
      process.env.CLOUDFLARE_PRODUCTION_TARGET_TYPE ||
      "",
    target_root:
      process.env.CLOUDFLARE_TARGET_ROOT ||
      process.env.CLOUDFLARE_PRODUCTION_TARGET_ROOT ||
      "",
    target_config:
      process.env.CLOUDFLARE_TARGET_CONFIG ||
      process.env.CLOUDFLARE_PRODUCTION_TARGET_CONFIG ||
      "",

    include_targets: list(process.env.CLOUDFLARE_PRODUCTION_INCLUDE_TARGETS),
    exclude_targets: list(process.env.CLOUDFLARE_PRODUCTION_EXCLUDE_TARGETS),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager:
      process.env.CLOUDFLARE_PRODUCTION_PACKAGE_MANAGER || "auto",

    run_build: b(process.env.CLOUDFLARE_PRODUCTION_RUN_BUILD, true),
    build_command: process.env.CLOUDFLARE_PRODUCTION_BUILD_COMMAND || "",

    changed_only: b(process.env.CLOUDFLARE_PRODUCTION_CHANGED_ONLY, false),
    deploy_pages: b(process.env.CLOUDFLARE_PRODUCTION_DEPLOY_PAGES, true),
    deploy_workers: b(process.env.CLOUDFLARE_PRODUCTION_DEPLOY_WORKERS, true),

    auto_create_pages_project: b(
      process.env.CLOUDFLARE_PRODUCTION_AUTO_CREATE_PAGES_PROJECT ||
        process.env.CLOUDFLARE_AUTO_CREATE_PAGES_PROJECT,
      true,
    ),
    pages_production_branch:
      process.env.CLOUDFLARE_PRODUCTION_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PRODUCTION_BRANCH ||
      DEFAULT_PRODUCTION_BRANCH,

    require_credentials: b(
      process.env.CLOUDFLARE_PRODUCTION_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: b(
      process.env.CLOUDFLARE_PRODUCTION_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_protected_ref: b(
      process.env.CLOUDFLARE_PRODUCTION_REQUIRE_PROTECTED_REF,
      true,
    ),
    require_confirmation: b(
      process.env.CLOUDFLARE_PRODUCTION_REQUIRE_CONFIRMATION,
      false,
    ),
    confirmation_value:
      process.env.CLOUDFLARE_PRODUCTION_CONFIRM ||
      process.env.PRODUCTION_DEPLOY_CONFIRM ||
      "",

    allowed_branches: list(
      process.env.CLOUDFLARE_PRODUCTION_ALLOWED_BRANCHES ||
        "main,master,production",
    ),
    allowed_tags: list(process.env.CLOUDFLARE_PRODUCTION_ALLOWED_TAGS || "v*"),

    allow_worker_default_production: b(
      process.env.CLOUDFLARE_PRODUCTION_ALLOW_WORKER_DEFAULT,
      true,
    ),

    max_deployments: i(process.env.CLOUDFLARE_PRODUCTION_MAX_DEPLOYMENTS, 0),
    timeout_minutes: i(process.env.CLOUDFLARE_PRODUCTION_TIMEOUT_MINUTES, 30),
    max_buffer_mb: i(process.env.CLOUDFLARE_PRODUCTION_MAX_BUFFER_MB, 64),

    continue_on_error: b(
      process.env.CLOUDFLARE_PRODUCTION_CONTINUE_ON_ERROR,
      false,
    ),
    fail_on_error: b(process.env.CLOUDFLARE_PRODUCTION_FAIL_ON_ERROR, true),
    fail_if_empty: b(process.env.CLOUDFLARE_PRODUCTION_FAIL_IF_EMPTY, true),

    dry_run: b(
      process.env.CLOUDFLARE_PRODUCTION_DRY_RUN ||
        process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_logs: b(process.env.CLOUDFLARE_PRODUCTION_WRITE_LOGS, true),
    write_summary_file: b(
      process.env.CLOUDFLARE_PRODUCTION_WRITE_SUMMARY,
      true,
    ),
    print: b(process.env.CLOUDFLARE_PRODUCTION_PRINT, true),
    write_step_summary: b(process.env.CLOUDFLARE_PRODUCTION_STEP_SUMMARY, true),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--input") {
      args.input_file = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--environment" || arg === "--env") {
      args.environment = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--stage" || arg === "--deployment-stage") {
      args.stage = argValue(argv, index, arg);
      index += 1;
    } else if (
      arg === "--branch" ||
      arg === "--ref" ||
      arg === "--deployment-ref"
    ) {
      args.branch = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--target-id") {
      args.target_id = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--target" || arg === "--target-name") {
      args.target_name = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--type" || arg === "--target-type") {
      args.target_type = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--root" || arg === "--target-root") {
      args.target_root = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--config" || arg === "--target-config") {
      args.target_config = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(...list(argValue(argv, index, arg)));
      index += 1;
    } else if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(...list(argValue(argv, index, arg)));
      index += 1;
    } else if (arg === "--wrangler-command") {
      args.wrangler_command = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--package-manager") {
      args.package_manager = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--build-command") {
      args.build_command = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--pages-production-branch") {
      args.pages_production_branch = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--allowed-branch" || arg === "--allowed-branches") {
      args.allowed_branches.push(...list(argValue(argv, index, arg)));
      index += 1;
    } else if (arg === "--allowed-tag" || arg === "--allowed-tags") {
      args.allowed_tags.push(...list(argValue(argv, index, arg)));
      index += 1;
    } else if (arg === "--max-deployments") {
      args.max_deployments = i(
        argValue(argv, index, arg),
        args.max_deployments,
      );
      index += 1;
    } else if (arg === "--timeout-minutes") {
      args.timeout_minutes = i(
        argValue(argv, index, arg),
        args.timeout_minutes,
      );
      index += 1;
    } else if (arg === "--max-buffer-mb") {
      args.max_buffer_mb = i(argValue(argv, index, arg), args.max_buffer_mb);
      index += 1;
    } else if (arg === "--log-dir") {
      args.log_dir = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      args.output_file = argValue(argv, index, arg);
      index += 1;
    } else if (arg === "--summary") {
      args.summary_file = argValue(argv, index, arg);
      args.write_summary_file = true;
      index += 1;
    } else if (arg === "--run-build") {
      args.run_build = true;
    } else if (arg === "--no-build") {
      args.run_build = false;
    } else if (arg === "--changed-only") {
      args.changed_only = true;
    } else if (arg === "--all-targets") {
      args.changed_only = false;
    } else if (arg === "--pages") {
      args.deploy_pages = true;
    } else if (arg === "--no-pages") {
      args.deploy_pages = false;
    } else if (arg === "--workers") {
      args.deploy_workers = true;
    } else if (arg === "--no-workers") {
      args.deploy_workers = false;
    } else if (arg === "--auto-create-pages-project") {
      args.auto_create_pages_project = true;
    } else if (arg === "--no-auto-create-pages-project") {
      args.auto_create_pages_project = false;
    } else if (arg === "--require-credentials") {
      args.require_credentials = true;
    } else if (arg === "--no-require-credentials") {
      args.require_credentials = false;
    } else if (arg === "--require-account-id") {
      args.require_account_id = true;
    } else if (arg === "--no-require-account-id") {
      args.require_account_id = false;
    } else if (arg === "--require-protected-ref") {
      args.require_protected_ref = true;
    } else if (arg === "--no-require-protected-ref") {
      args.require_protected_ref = false;
    } else if (arg === "--require-confirmation") {
      args.require_confirmation = true;
    } else if (arg === "--no-require-confirmation") {
      args.require_confirmation = false;
    } else if (arg === "--confirm") {
      args.confirmation_value = argv[index + 1] || "deploy-production";
      index +=
        argv[index + 1] && !String(argv[index + 1]).startsWith("--") ? 1 : 0;
    } else if (arg === "--allow-worker-default-production") {
      args.allow_worker_default_production = true;
    } else if (arg === "--no-worker-default-production") {
      args.allow_worker_default_production = false;
    } else if (arg === "--continue-on-error") {
      args.continue_on_error = true;
    } else if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
    } else if (arg === "--fail-on-error") {
      args.fail_on_error = true;
    } else if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
    } else if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
    } else if (arg === "--no-fail-if-empty") {
      args.fail_if_empty = false;
    } else if (arg === "--logs") {
      args.write_logs = true;
    } else if (arg === "--no-logs") {
      args.write_logs = false;
    } else if (arg === "--no-summary") {
      args.write_summary_file = false;
    } else if (arg === "--dry-run") {
      args.dry_run = true;
    } else if (arg === "--no-print") {
      args.print = false;
    } else if (arg === "--no-step-summary") {
      args.write_step_summary = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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
Aerealith AI Cloudflare Production Deployment Runner

Usage:
  node .github/scripts/cloudflare/deploy-production.js [options]

Options:
  --input <file>                      Cloudflare discovery or target file.
  --environment <name>                Deployment environment. Default: production.
  --stage <name>                      Deployment stage.
  --branch <name> / --ref <name>      Production branch/ref.
  --target <name>                     Deploy one target by name.
  --type <pages|worker>               Deploy one target type.
  --run-build / --no-build            Toggle build before deploy.
  --pages / --no-pages                Enable or disable Pages deployment.
  --workers / --no-workers            Enable or disable Worker deployment.
  --auto-create-pages-project         Create missing Cloudflare Pages projects. Default.
  --no-auto-create-pages-project      Do not create missing Cloudflare Pages projects.
  --pages-production-branch <branch>  Production branch used when creating Pages projects.
  --require-protected-ref             Require production ref guard. Default.
  --no-require-protected-ref          Disable production ref guard.
  --require-confirmation              Require explicit production confirmation.
  --confirm <value>                   Confirmation value. Use deploy-production.
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
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(start);
}

function abs(filePath, root) {
  if (!filePath) return root;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.normalize(path.join(root, filePath));
}

function posix(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function rel(filePath, root) {
  return posix(path.relative(root, abs(filePath, root))) || ".";
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isDir(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function mkdir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }

  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content, options = {}) {
  mkdir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return;
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
}

function readJson(filePath, root, fallback = null) {
  const resolved = abs(filePath, root);

  if (!isFile(resolved)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
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
  const source = String(pattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${source}$`);
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
    } else if (ch === "\\") {
      escaped = true;
    } else if ((ch === "'" || ch === '"') && !quote) {
      quote = ch;
    } else if (ch === quote) {
      quote = "";
    } else if (/\s/.test(ch) && !quote) {
      if (current) out.push(current);
      current = "";
    } else {
      current += ch;
    }
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

    if (parsed.length) {
      return {
        command: parsed[0],
        args: parsed.slice(1),
        package_manager: "custom",
      };
    }
  }

  const pm = packageManager(root, args.package_manager);

  if (pm === "pnpm") {
    return {
      command: "pnpm",
      args: ["exec", "wrangler"],
      package_manager: "pnpm",
    };
  }

  if (pm === "yarn") {
    return { command: "yarn", args: ["wrangler"], package_manager: "yarn" };
  }

  if (pm === "bun") {
    return { command: "bunx", args: ["wrangler"], package_manager: "bun" };
  }

  if (pm === "npm") {
    return { command: "npx", args: ["wrangler"], package_manager: "npm" };
  }

  return { command: "npx", args: ["wrangler"], package_manager: "npx" };
}

function packageRun(pm, root, script) {
  const targetRoot = posix(root || ".");

  if (pm === "pnpm") {
    return {
      command: "pnpm",
      args:
        targetRoot === "."
          ? ["run", script]
          : ["--dir", targetRoot, "run", script],
      shell: false,
    };
  }

  if (pm === "yarn") {
    return {
      command: "yarn",
      args: targetRoot === "." ? [script] : ["--cwd", targetRoot, script],
      shell: false,
    };
  }

  if (pm === "bun") {
    return {
      command: "bun",
      args:
        targetRoot === "."
          ? ["run", script]
          : ["--cwd", targetRoot, "run", script],
      shell: false,
    };
  }

  return {
    command: "npm",
    args:
      targetRoot === "."
        ? ["run", script]
        : ["--prefix", targetRoot, "run", script],
    shell: false,
  };
}

function inputCandidates(args) {
  const files = [args.input_file];

  if (args.output_file) {
    files.push(
      path.join(path.dirname(args.output_file), "discover-deployments.json"),
    );
  }

  if (process.env.CLOUDFLARE_OUTPUT_DIR) {
    files.push(
      path.join(process.env.CLOUDFLARE_OUTPUT_DIR, "discover-deployments.json"),
    );
  }

  files.push(
    "artifacts/cloudflare/production/discover-deployments.json",
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
    searched_files: searched.map((candidate) =>
      rel(abs(candidate, root), root),
    ),
    data,
  };
}

function arrayFromUnknown(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => arrayFromUnknown(item));
  }

  return [];
}

function targetList(data) {
  if (!data || typeof data !== "object") return [];

  return [
    ...arrayFromUnknown(data.targets),
    ...arrayFromUnknown(data.cloudflare_targets),
    ...arrayFromUnknown(data.deployment_targets),
    ...arrayFromUnknown(data.projects),
    ...arrayFromUnknown(data.cloudflare?.targets),
    ...arrayFromUnknown(data.discovery?.targets),
    ...arrayFromUnknown(data.target_groups),
  ].filter((item) => item && typeof item === "object");
}

function matrixList(data) {
  if (!data || typeof data !== "object") return [];

  const records = [];

  const append = (value, defaults = {}) => {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) append(item, defaults);
      return;
    }

    if (typeof value !== "object") return;

    if (
      value.id ||
      value.name ||
      value.type ||
      value.primary_type ||
      value.target_type ||
      value.project_name ||
      value.service_name ||
      value.config_file ||
      value.wrangler_config ||
      value.pages_build_output_dir ||
      value.output_dir ||
      value.root
    ) {
      records.push({ ...defaults, ...value });
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const lowered = key.toLowerCase();
      const inferredType = lowered.includes("page")
        ? "pages"
        : lowered.includes("worker")
          ? "worker"
          : defaults.type;

      append(child, { ...defaults, type: inferredType || defaults.type });
    }
  };

  append(data.deployment_matrix);
  append(data.deployments);
  append(data.selected_deployments);
  append(data.deployment_targets);
  append(data.targets);
  append(data.pages, { type: "pages" });
  append(data.workers, { type: "worker" });
  append(data.cloudflare?.deployment_matrix);
  append(data.cloudflare?.deployments);
  append(data.cloudflare?.deployment_targets);
  append(data.cloudflare?.targets);
  append(data.cloudflare?.pages, { type: "pages" });
  append(data.cloudflare?.workers, { type: "worker" });
  append(data.deployment_groups);
  append(data.groups);

  if (!records.length && Array.isArray(data.results)) {
    append(data.results);
  }

  return records;
}

function targetMap(targets) {
  const map = new Map();

  for (const target of targets || []) {
    for (const key of [
      target.id,
      target.target_id,
      target.name,
      target.target_name,
      target.project_name,
      target.service_name,
      `${target.name}:${target.root}`,
      `${target.target_name}:${target.root}`,
      `${target.project_name}:${target.root}`,
      `${target.primary_type}:${target.name}`,
      `${target.type}:${target.name}`,
      target.config_file,
      target.wrangler_config,
      target.wrangler_config_file,
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
  ) {
    return null;
  }

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
    wrangler_environment:
      args.environment === DEFAULT_ENVIRONMENT ? "" : args.environment,
    has_config_environment: false,
    affected: true,
    main: "",
    pages_build_output_dir: "",
    compatibility_date: "",
  };
}

function inferType(record, target = {}) {
  const explicit = s(
    record.type ||
      record.primary_type ||
      record.target_type ||
      record.deployment_type ||
      record.kind ||
      target.primary_type ||
      target.type ||
      target.target_type,
  ).toLowerCase();

  if (["page", "pages", "cloudflare-pages"].includes(explicit)) return "pages";
  if (["worker", "workers", "cloudflare-worker"].includes(explicit))
    return "worker";

  if (
    record.pages_build_output_dir ||
    record.output_dir ||
    record.build_output_dir ||
    target.pages_build_output_dir ||
    target.output_dir ||
    target.build_output_dir
  ) {
    return "pages";
  }

  if (
    record.config_file ||
    record.wrangler_config ||
    record.wrangler_config_file ||
    record.main ||
    target.config_file ||
    target.wrangler_config ||
    target.wrangler_config_file ||
    target.main
  ) {
    return "worker";
  }

  return explicit || "unknown";
}

function normalizeDeployment(record, target = {}, args = {}) {
  const type = inferType(record, target);
  const name = s(
    record.name ||
      record.target_name ||
      record.project_name ||
      record.service_name ||
      record.worker_name ||
      record.script_name ||
      target.name ||
      target.target_name ||
      target.project_name ||
      target.service_name ||
      process.env.CLOUDFLARE_PROJECT_NAME ||
      "cloudflare-target",
  );
  const targetRoot = posix(
    record.root ||
      record.working_directory ||
      record.directory ||
      record.path ||
      target.root ||
      target.working_directory ||
      target.directory ||
      target.path ||
      ".",
  );
  const targetTypes = record.target_types ||
    record.types ||
    target.target_types ||
    target.types || [type];

  const environment = s(
    record.environment ||
      record.stage ||
      record.deployment_stage ||
      target.environment ||
      target.stage ||
      target.deployment_stage ||
      args.environment ||
      DEFAULT_ENVIRONMENT,
  ).toLowerCase();

  const wranglerEnvironment =
    record.wrangler_environment === undefined ||
    record.wrangler_environment === null
      ? target.wrangler_environment === undefined ||
        target.wrangler_environment === null
        ? ""
        : String(target.wrangler_environment)
      : String(record.wrangler_environment);

  const hasConfigEnvironment = Boolean(
    record.has_config_environment ??
    record.hasConfigEnvironment ??
    target.has_config_environment ??
    target.hasConfigEnvironment ??
    target.environments?.includes?.(environment),
  );

  const affected = Boolean(
    record.affected ??
    record.changed ??
    target.affected ??
    target.changed ??
    !args.changed_only,
  );

  return {
    id: s(
      record.id ||
        record.target_id ||
        target.id ||
        target.target_id ||
        safeId(`${type}-${name}-${targetRoot}`),
    ),
    name,
    type,
    target_types: Array.isArray(targetTypes) ? targetTypes : [targetTypes],
    root: targetRoot,
    config_file: posix(
      record.config_file ||
        record.wrangler_config ||
        record.wrangler_config_file ||
        target.config_file ||
        target.wrangler_config ||
        target.wrangler_config_file ||
        "",
    ),
    package_json: record.package_json || target.package_json || null,
    package_name: record.package_name || target.package_name || null,
    package_manager_command:
      record.package_manager_command || target.package_manager_command || "",
    environment,
    stage: s(
      record.stage || record.deployment_stage || args.stage || "",
    ).toLowerCase(),
    wrangler_environment: wranglerEnvironment,
    has_config_environment: hasConfigEnvironment,
    affected,
    main: record.main || target.main || "",
    pages_build_output_dir:
      record.pages_build_output_dir ||
      record.output_dir ||
      record.build_output_dir ||
      record.dist_dir ||
      target.pages_build_output_dir ||
      target.output_dir ||
      target.build_output_dir ||
      target.dist_dir ||
      "",
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

function matchesDeployment(deployment, args) {
  const deploymentEnvironment = s(
    deployment.environment,
    args.environment,
  ).toLowerCase();

  if (
    args.environment &&
    deploymentEnvironment &&
    deploymentEnvironment !== args.environment
  ) {
    return false;
  }

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
      targetsByKey.get(entry.project_name) ||
      targetsByKey.get(`${entry.name}:${entry.root}`) ||
      targetsByKey.get(`${entry.target_name}:${entry.root}`) ||
      targetsByKey.get(`${entry.type}:${entry.name}`) ||
      targetsByKey.get(entry.config_file) ||
      targetsByKey.get(entry.wrangler_config) ||
      {};

    return normalizeDeployment(entry, target, args);
  });

  if (!deployments.length) {
    for (const target of targets) {
      deployments.push(
        normalizeDeployment(
          {
            id: target.id,
            name: target.name || target.target_name || target.project_name,
            type: target.primary_type || target.type || target.target_type,
            root: target.root,
            config_file:
              target.config_file ||
              target.wrangler_config ||
              target.wrangler_config_file,
            environment:
              target.environment ||
              target.stage ||
              target.deployment_stage ||
              args.environment,
            wrangler_environment: target.environments?.includes?.(
              args.environment,
            )
              ? args.environment
              : target.wrangler_environment || "",
            has_config_environment:
              target.environments?.includes?.(args.environment) ||
              target.has_config_environment ||
              false,
            affected: target.affected ?? target.changed ?? !args.changed_only,
            pages_build_output_dir:
              target.pages_build_output_dir ||
              target.output_dir ||
              target.build_output_dir,
          },
          target,
          args,
        ),
      );
    }
  }

  const direct = directDeployment(args);
  if (direct) deployments.push(direct);

  const unique = [
    ...new Map(
      deployments.map((deployment) => [deployment.id, deployment]),
    ).values(),
  ];

  let selected = unique.filter((deployment) =>
    matchesDeployment(deployment, args),
  );

  if (!selected.length && args.changed_only) {
    const relaxedArgs = { ...args, changed_only: false };

    selected = unique.filter((deployment) =>
      matchesDeployment(deployment, relaxedArgs),
    );

    if (selected.length) {
      logger.warn(
        "No production deployments matched changed-only filtering. Falling back to all production deployment targets from discovery output.",
      );
    }
  }

  return selected.slice(
    0,
    args.max_deployments > 0 ? args.max_deployments : undefined,
  );
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

  if (!args.require_credentials || args.dry_run) {
    return { ok: true, errors, warnings };
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    errors.push("Missing CLOUDFLARE_API_TOKEN.");
  }

  if (args.require_account_id && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    errors.push("Missing CLOUDFLARE_ACCOUNT_ID.");
  } else if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    warnings.push(
      "CLOUDFLARE_ACCOUNT_ID is not set; Wrangler must infer the account.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

function productionGuard(args, github) {
  const errors = [];
  const warnings = [];
  const ref = s(process.env.GITHUB_REF || github.ref || "");
  const refName = safeBranch(
    process.env.GITHUB_REF_NAME || github.branch || args.branch,
    DEFAULT_BRANCH,
  );
  const isTag = ref.startsWith("refs/tags/");
  const protectedByGitHub = b(process.env.GITHUB_REF_PROTECTED, false);
  const branchAllowed = matchesAny(refName, args.allowed_branches);
  const tagAllowed = isTag && matchesAny(refName, args.allowed_tags);
  const refAllowed = protectedByGitHub || branchAllowed || tagAllowed;

  if (args.require_protected_ref && !refAllowed) {
    errors.push(
      `Production deployment is not allowed from ref "${refName}". Allowed branches: ${args.allowed_branches.join(", ")}. Allowed tags: ${args.allowed_tags.join(", ")}.`,
    );
  }

  if (!protectedByGitHub && branchAllowed && args.require_protected_ref) {
    warnings.push(
      `Ref "${refName}" matched an allowed branch pattern, but GITHUB_REF_PROTECTED is not true.`,
    );
  }

  if (args.require_confirmation) {
    const confirmation = s(args.confirmation_value).toLowerCase();

    if (
      !["deploy-production", "production", "true", "confirmed"].includes(
        confirmation,
      )
    ) {
      errors.push(
        "Production deployment confirmation is required. Set CLOUDFLARE_PRODUCTION_CONFIRM=deploy-production or pass --confirm deploy-production.",
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ref,
    ref_name: refName,
    is_tag: isTag,
    protected_by_github: protectedByGitHub,
    branch_allowed: branchAllowed,
    tag_allowed: tagAllowed,
  };
}

function validateDeployment(deployment, args, root) {
  const errors = [];
  const warnings = [];

  if (deployment.environment !== DEFAULT_ENVIRONMENT) {
    errors.push(
      `Production runner received non-production deployment environment: ${deployment.environment}`,
    );
  }

  if (deployment.type === "pages") {
    const out = targetPath(
      deployment.root,
      deployment.pages_build_output_dir,
      root,
    );

    if (!deployment.pages_build_output_dir) {
      errors.push("Pages target is missing pages_build_output_dir.");
    } else if (!isDir(out) && !args.run_build && !args.dry_run) {
      errors.push(`Pages output directory does not exist: ${rel(out, root)}`);
    }

    if (!deployment.name) {
      errors.push("Pages target is missing a project name.");
    }
  }

  if (deployment.type === "worker") {
    const config = abs(deployment.config_file, root);

    if (!deployment.config_file) {
      errors.push("Worker target is missing config_file.");
    } else if (!isFile(config)) {
      errors.push(
        `Worker Wrangler config does not exist: ${deployment.config_file}`,
      );
    }

    if (
      args.environment === DEFAULT_ENVIRONMENT &&
      !args.allow_worker_default_production &&
      !deployment.has_config_environment
    ) {
      errors.push(
        `Worker target "${deployment.name}" does not declare a Wrangler "${args.environment}" environment. Enable --allow-worker-default-production only when the default Wrangler environment is production-safe.`,
      );
    }

    if (
      deployment.wrangler_environment &&
      deployment.wrangler_environment !== DEFAULT_ENVIRONMENT
    ) {
      errors.push(
        `Worker target "${deployment.name}" resolved to non-production Wrangler environment "${deployment.wrangler_environment}".`,
      );
    }
  }

  if (deployment.type !== "pages" && deployment.type !== "worker") {
    errors.push(`Unsupported Cloudflare target type: ${deployment.type}`);
  }

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

  if (args.dry_run) {
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
  }

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
  ) {
    return false;
  }

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

  if (args.build_command) {
    return {
      id: safeId(`${deployment.id}-build-production`),
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
  }

  const command = packageRun(pm, deployment.root, "build");

  return {
    id: safeId(`${deployment.id}-build-production`),
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

  if (process.env.GITHUB_SHA) {
    wranglerArgs.push("--commit-hash", process.env.GITHUB_SHA);
  }

  const commitMessage = process.env.GITHUB_EVENT_NAME
    ? `${PROJECT_NAME} production deployment from ${process.env.GITHUB_EVENT_NAME}`
    : `${PROJECT_NAME} production deployment`;

  wranglerArgs.push("--commit-message", commitMessage);

  return {
    id: safeId(`${deployment.id}-deploy-pages-production`),
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

  if (deployment.wrangler_environment && deployment.has_config_environment) {
    wranglerArgs.push("--env", deployment.wrangler_environment);
  }

  return {
    id: safeId(`${deployment.id}-deploy-worker-production`),
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
  if (deployment.type === "pages") {
    return pagesDeployCommand(deployment, args, root, wrangler);
  }

  if (deployment.type === "worker") {
    return workerDeployCommand(deployment, args, root, wrangler);
  }

  return null;
}

function createPlan(args, root, input) {
  const github = gitMeta(root);
  const wrangler = wranglerPrefix(args, root);
  const pm = packageManager(root, args.package_manager);
  const credentials = validateCredentials(args);
  const guard = productionGuard(args, github);
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
    production_guard: guard,
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

  if (!plan.credentials.ok) {
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.credentials.errors.join("; "),
    };
  }

  if (!plan.production_guard.ok) {
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.production_guard.errors.join("; "),
    };
  }

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
      logger.warn("Stopping after first failed Cloudflare production command.");
      break;
    }
  }

  const skipped = stoppedEarly
    ? plan.commands.slice(stopIndex + 1).map((command) => ({
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
  const passed = results.filter((result) => result.status === "passed").length;
  const recovered = results.filter(
    (result) => result.status === "recovered",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skippedCommands = results.filter(
    (result) => result.status === "skipped",
  ).length;
  const durationMs = results.reduce(
    (sum, result) => sum + Number(result.duration_ms || 0),
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

    groups[type] ||= {
      count: 0,
      affected: 0,
      targets: [],
    };

    groups[type].count += 1;

    if (deployment.affected) groups[type].affected += 1;

    groups[type].targets.push(deployment.name);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function resultUrls(results) {
  return [...new Set(results.flatMap((result) => result.urls || []))];
}

function createReport(args, root, input, plan, execution) {
  const github = gitMeta(root);
  const totals = summarize(execution.results, plan.skipped);
  const allUrls = resultUrls(execution.results);
  const primaryUrl = allUrls[0] || "";
  const deployResults = execution.results.filter(
    (result) => result.kind === "deploy",
  );
  const buildResults = execution.results.filter(
    (result) => result.kind === "build",
  );
  const setupResults = execution.results.filter(
    (result) => result.kind === "setup",
  );

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
    type: "cloudflare-production-deployment",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    production_url: primaryUrl,
    deployment_url: primaryUrl,
    url: primaryUrl,
    cloudflare: {
      production_url: primaryUrl,
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
      require_protected_ref: args.require_protected_ref,
      require_confirmation: args.require_confirmation,
      allowed_branches: args.allowed_branches,
      allowed_tags: args.allowed_tags,
      allow_worker_default_production: args.allow_worker_default_production,
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
    production_guard: plan.production_guard,
    totals: {
      selected_deployments: plan.deployments.length,
      selected_pages: plan.deployments.filter(
        (deployment) => deployment.type === "pages",
      ).length,
      selected_workers: plan.deployments.filter(
        (deployment) => deployment.type === "worker",
      ).length,
      planned_commands: plan.commands.length,
      build_commands: plan.commands.filter(
        (command) => command.kind === "build",
      ).length,
      deploy_commands: plan.commands.filter(
        (command) => command.kind === "deploy",
      ).length,
      setup_commands: setupResults.length,
      build_passed: buildResults.filter((result) => result.status === "passed")
        .length,
      build_failed: buildResults.filter((result) => result.status === "failed")
        .length,
      deploy_passed: deployResults.filter(
        (result) => result.status === "passed",
      ).length,
      deploy_recovered: deployResults.filter(
        (result) => result.status === "recovered",
      ).length,
      deploy_failed: deployResults.filter(
        (result) => result.status === "failed",
      ).length,
      setup_passed: setupResults.filter((result) => result.status === "passed")
        .length,
      setup_failed: setupResults.filter((result) => result.status === "failed")
        .length,
      urls: allUrls.length,
      ...totals,
    },
    deployments: plan.deployments,
    deployment_groups: groupDeployments(plan.deployments),
    validations: plan.validations,
    planned_commands: plan.commands.map((command) => ({
      id: command.id,
      kind: command.kind,
      target_id: command.target_id,
      target_name: command.target_name,
      target_type: command.target_type,
      display: command.display,
      cwd: command.cwd ? rel(command.cwd, root) : ".",
    })),
    skipped_targets: plan.skipped,
    results: execution.results,
    failures: execution.results.filter((result) => result.status === "failed"),
    urls: allUrls,
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
  };
}

function mdEscape(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function markdown(report) {
  const lines = [
    `# 🚀 ${PROJECT_NAME} Cloudflare Production Deployment`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Stage: \`${report.config.stage}\``,
    `- Branch: \`${report.config.branch}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    `- Auto-create Pages project: \`${report.config.auto_create_pages_project ? "true" : "false"}\``,
    `- Pages production branch: \`${report.config.pages_production_branch}\``,
    "",
    "## Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Git branch: \`${report.github.branch || "unknown"}\``,
    `- Git ref: \`${report.production_guard.ref || report.github.ref || "unknown"}\``,
    `- Ref protected: \`${report.production_guard.protected_by_github ? "true" : "false"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## Production Guard",
    "",
    `- Guard check: \`${report.production_guard.ok ? "passed" : "failed"}\``,
    `- Branch allowed: \`${report.production_guard.branch_allowed ? "true" : "false"}\``,
    `- Tag allowed: \`${report.production_guard.tag_allowed ? "true" : "false"}\``,
    `- Is tag: \`${report.production_guard.is_tag ? "true" : "false"}\``,
    `- Allowed branches: \`${report.config.allowed_branches.join(", ")}\``,
    `- Allowed tags: \`${report.config.allowed_tags.join(", ")}\``,
    "",
    "## Totals",
    "",
    `- Selected deployments: \`${report.totals.selected_deployments}\``,
    `- Pages targets: \`${report.totals.selected_pages}\``,
    `- Worker targets: \`${report.totals.selected_workers}\``,
    `- Planned commands: \`${report.totals.planned_commands}\``,
    `- Setup commands: \`${report.totals.setup_commands}\``,
    `- Passed: \`${report.totals.passed}\``,
    `- Recovered: \`${report.totals.recovered}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Skipped: \`${report.totals.skipped}\``,
    `- URLs: \`${report.totals.urls}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.production_url) {
    lines.push(
      "## Primary Production URL",
      "",
      `- ${report.production_url}`,
      "",
    );
  }

  lines.push("## Selected Deployments", "");

  if (!report.deployments.length) {
    lines.push("No Cloudflare production deployments were selected.");
  } else {
    lines.push("| Target | Type | Root | Config | Affected |");
    lines.push("|---|---|---|---|---:|");

    for (const deployment of report.deployments) {
      lines.push(
        `| \`${deployment.name}\` | \`${deployment.type}\` | \`${deployment.root}\` | \`${deployment.config_file || "none"}\` | \`${deployment.affected ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("", "## Commands", "");

  if (!report.results.length) {
    lines.push("No commands were executed.");
  } else {
    lines.push("| Status | Kind | Target | Type | Duration | Command |");
    lines.push("|---|---|---|---|---:|---|");

    for (const result of report.results.slice(0, 200)) {
      lines.push(
        `| \`${result.status}\` | \`${result.kind}\` | \`${result.target_name}\` | \`${result.target_type}\` | \`${duration(result.duration_ms)}\` | \`${mdEscape(result.display)}\` |`,
      );
    }

    if (report.results.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ${report.results.length - 200} additional command(s) omitted. |`,
      );
    }
  }

  if (report.urls.length) {
    lines.push("", "## URLs", "");

    for (const url of report.urls) {
      lines.push(`- ${url}`);
    }
  }

  if (report.skipped_targets.length) {
    lines.push("", "## Skipped Targets", "");
    lines.push("| Target | Type | Reason |");
    lines.push("|---|---|---|");

    for (const skipped of report.skipped_targets) {
      lines.push(
        `| \`${skipped.target_name}\` | \`${skipped.target_type}\` | ${mdEscape(skipped.reason)} |`,
      );
    }
  }

  const warnings = [
    ...(report.production_guard.warnings || []),
    ...(report.credentials.warnings || []),
  ];

  if (warnings.length) {
    lines.push("", "## Warnings", "");

    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  const guardErrors = [
    ...(report.production_guard.errors || []),
    ...(report.credentials.errors || []),
  ];

  if (guardErrors.length) {
    lines.push("", "## Guard Errors", "");

    for (const error of guardErrors) {
      lines.push(`- ${error}`);
    }
  }

  if (report.failures.length) {
    lines.push("", "## Failures", "");
    lines.push("| Kind | Target | Exit | Error | Stderr Log |");
    lines.push("|---|---|---:|---|---|");

    for (const failure of report.failures.slice(0, 50)) {
      const error =
        failure.error ||
        failure.stderr_preview.split(/\r?\n/).slice(0, 2).join(" ");

      lines.push(
        `| \`${failure.kind}\` | \`${failure.target_name}\` | \`${failure.exit_code ?? "unknown"}\` | ${mdEscape(error || "Command failed.")} | \`${failure.stderr_log || "not written"}\` |`,
      );
    }
  }

  lines.push("", "## Outputs", "");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
  );
  lines.push(`- Log directory: \`${report.config.log_dir || "not written"}\``);

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

function writeOutputs(report) {
  output("cloudflare_production_file", report.config.output_file);
  output(
    "cloudflare_production_summary_file",
    report.config.summary_file || "",
  );
  output("cloudflare_production_log_dir", report.config.log_dir || "");
  output("cloudflare_production_status", report.status);
  output(
    "cloudflare_production_ok",
    report.totals.failed === 0 && !report.blocked ? "true" : "false",
  );
  output("cloudflare_production_environment", report.config.environment);
  output("cloudflare_production_stage", report.config.stage);
  output("cloudflare_production_branch", report.config.branch);
  output("cloudflare_production_url", report.production_url || "");
  output("production_url", report.production_url || "");
  output("deployment_url", report.deployment_url || "");
  output(
    "cloudflare_production_selected_deployments",
    String(report.totals.selected_deployments),
  );
  output("cloudflare_production_pages", String(report.totals.selected_pages));
  output(
    "cloudflare_production_workers",
    String(report.totals.selected_workers),
  );
  output(
    "cloudflare_production_planned_commands",
    String(report.totals.planned_commands),
  );
  output("cloudflare_production_passed", String(report.totals.passed));
  output("cloudflare_production_recovered", String(report.totals.recovered));
  output("cloudflare_production_failed", String(report.totals.failed));
  output("cloudflare_production_blocked", report.blocked ? "true" : "false");
  output("cloudflare_production_block_reason", report.block_reason || "");
  output(
    "cloudflare_production_guard_ok",
    report.production_guard.ok ? "true" : "false",
  );
  output(
    "cloudflare_production_auto_create_pages_project",
    report.config.auto_create_pages_project ? "true" : "false",
  );
  output(
    "cloudflare_production_pages_production_branch",
    report.config.pages_production_branch,
  );
  output("cloudflare_production_urls", report.urls.join(","));
  output("cloudflare_production_urls_json", JSON.stringify(report.urls));
  output(
    "cloudflare_production_target_names",
    report.deployments.map((deployment) => deployment.name).join(","),
  );
  output(
    "cloudflare_production_target_names_json",
    JSON.stringify(report.deployments.map((deployment) => deployment.name)),
  );
  output(
    "cloudflare_production_failures_json",
    JSON.stringify(report.failures),
  );
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const outputFile = abs(args.output_file, root);
  const summaryFile = abs(args.summary_file, root);

  logger.info("Preparing Cloudflare production deployment.");

  const input = loadInput(args, root);

  if (!input.available) {
    logger.warn(
      `No Cloudflare deployment discovery input found. Searched: ${
        (input.searched_files || []).join(", ") || input.file
      }.`,
    );
  } else if (input.file !== rel(abs(args.input_file, root), root)) {
    logger.info(`Using Cloudflare deployment discovery input: ${input.file}.`);
  }

  const plan = createPlan(args, root, input);

  if (args.fail_if_empty && plan.deployments.length === 0) {
    logger.error("No Cloudflare production deployments were selected.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
        }
      : executePlan(plan, args, root);

  const finalReport = createReport(args, root, input, plan, execution);
  const json = `${JSON.stringify(finalReport, null, 2)}\n`;
  const summary = markdown(finalReport);

  writeFile(outputFile, json, { dry_run: args.dry_run });

  if (args.write_summary_file) {
    writeFile(summaryFile, summary, { dry_run: args.dry_run });
  }

  writeOutputs(finalReport);

  if (args.write_step_summary) {
    appendSummary(summary);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_empty && finalReport.totals.selected_deployments === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && finalReport.blocked) {
    logger.error(
      `Cloudflare production deployment blocked: ${finalReport.block_reason}`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && finalReport.totals.failed > 0) {
    logger.error(
      `Cloudflare production deployment failed with ${finalReport.totals.failed} failed command(s).`,
    );
    process.exitCode = 1;
  }
}

main();
