#!/usr/bin/env node
// .github/scripts/cloudflare/deploy-preview.js
// =============================================================================
// Aerealith AI — Cloudflare Preview Deployment Runner
// -----------------------------------------------------------------------------
// Purpose:
//   Deploy Cloudflare preview targets discovered by CI into Cloudflare Pages
//   branch previews or Worker preview environments.
//
// Input:
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/deploy-preview.json
//   - artifacts/cloudflare/deploy-preview.md
//   - artifacts/cloudflare/deploy-preview/logs/*.stdout.log
//   - artifacts/cloudflare/deploy-preview/logs/*.stderr.log
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses Wrangler through pnpm/npx/yarn/bunx or a custom command.
//   - Does not require per-resource secrets.
//   - Does require CLOUDFLARE_API_TOKEN for real deployments.
//   - CLOUDFLARE_ACCOUNT_ID is recommended and required by default.
//   - Worker preview deploys are protected by default and require a configured
//     Wrangler preview environment unless explicitly allowed.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cloudflare-preview] ${message}`),
    warn: (message) => console.warn(`[cloudflare-preview] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-preview] ERROR: ${message}`),
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

const DEFAULT_INPUT_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/deploy-preview.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/deploy-preview.md";
const DEFAULT_LOG_DIR = "artifacts/cloudflare/deploy-preview/logs";

const DEFAULT_ENVIRONMENT = "preview";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

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

    input_file: process.env.CLOUDFLARE_PREVIEW_INPUT_FILE || DEFAULT_INPUT_FILE,
    output_file:
      process.env.CLOUDFLARE_PREVIEW_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_PREVIEW_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    log_dir: process.env.CLOUDFLARE_PREVIEW_LOG_DIR || DEFAULT_LOG_DIR,

    environment:
      process.env.CLOUDFLARE_PREVIEW_ENVIRONMENT || DEFAULT_ENVIRONMENT,
    branch:
      process.env.CLOUDFLARE_PREVIEW_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_BRANCH,

    target_id:
      process.env.CLOUDFLARE_TARGET_ID ||
      process.env.CLOUDFLARE_PREVIEW_TARGET_ID ||
      "",
    target_name:
      process.env.CLOUDFLARE_TARGET_NAME ||
      process.env.CLOUDFLARE_PREVIEW_TARGET_NAME ||
      "",
    target_type:
      process.env.CLOUDFLARE_TARGET_TYPE ||
      process.env.CLOUDFLARE_PREVIEW_TARGET_TYPE ||
      "",
    target_root:
      process.env.CLOUDFLARE_TARGET_ROOT ||
      process.env.CLOUDFLARE_PREVIEW_TARGET_ROOT ||
      "",
    target_config:
      process.env.CLOUDFLARE_TARGET_CONFIG ||
      process.env.CLOUDFLARE_PREVIEW_TARGET_CONFIG ||
      "",

    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_PREVIEW_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_PREVIEW_EXCLUDE_TARGETS,
    ),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager: process.env.CLOUDFLARE_PREVIEW_PACKAGE_MANAGER || "auto",

    run_build: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_RUN_BUILD,
      false,
    ),
    build_command: process.env.CLOUDFLARE_PREVIEW_BUILD_COMMAND || "",

    changed_only: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_CHANGED_ONLY,
      true,
    ),
    deploy_pages: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_DEPLOY_PAGES,
      true,
    ),
    deploy_workers: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_DEPLOY_WORKERS,
      true,
    ),

    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_worker_preview_env: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_WORKER_ENV,
      true,
    ),
    allow_worker_default_preview: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_ALLOW_WORKER_DEFAULT,
      false,
    ),

    max_deployments: normalizeInteger(
      process.env.CLOUDFLARE_PREVIEW_MAX_DEPLOYMENTS,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.CLOUDFLARE_PREVIEW_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.CLOUDFLARE_PREVIEW_MAX_BUFFER_MB,
      64,
    ),

    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_CONTINUE_ON_ERROR,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_FAIL_ON_ERROR,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_FAIL_IF_EMPTY,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_logs: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_WRITE_LOGS,
      true,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_PREVIEW_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_PREVIEW_STEP_SUMMARY,
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

    if (arg === "--input") {
      args.input_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--environment" || arg === "--env") {
      args.environment = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target-id") {
      args.target_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--target-name") {
      args.target_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--type" || arg === "--target-type") {
      args.target_type = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--root" || arg === "--target-root") {
      args.target_root = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config" || arg === "--target-config") {
      args.target_config = argv[index + 1];
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

    if (arg === "--run-build") {
      args.run_build = true;
      continue;
    }

    if (arg === "--no-build") {
      args.run_build = false;
      continue;
    }

    if (arg === "--build-command") {
      args.build_command = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changed-only") {
      args.changed_only = true;
      continue;
    }

    if (arg === "--all-targets") {
      args.changed_only = false;
      continue;
    }

    if (arg === "--pages") {
      args.deploy_pages = true;
      continue;
    }

    if (arg === "--no-pages") {
      args.deploy_pages = false;
      continue;
    }

    if (arg === "--workers") {
      args.deploy_workers = true;
      continue;
    }

    if (arg === "--no-workers") {
      args.deploy_workers = false;
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

    if (arg === "--require-account-id") {
      args.require_account_id = true;
      continue;
    }

    if (arg === "--no-require-account-id") {
      args.require_account_id = false;
      continue;
    }

    if (arg === "--require-worker-preview-env") {
      args.require_worker_preview_env = true;
      continue;
    }

    if (arg === "--allow-worker-default-preview") {
      args.allow_worker_default_preview = true;
      continue;
    }

    if (arg === "--max-deployments") {
      args.max_deployments = normalizeInteger(
        argv[index + 1],
        args.max_deployments,
      );
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

    if (arg === "--continue-on-error") {
      args.continue_on_error = true;
      continue;
    }

    if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
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

    if (arg === "--logs") {
      args.write_logs = true;
      continue;
    }

    if (arg === "--no-logs") {
      args.write_logs = false;
      continue;
    }

    if (arg === "--log-dir") {
      args.log_dir = argv[index + 1];
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
  args.branch = safeBranchName(args.branch);
  args.target_type = args.target_type.toLowerCase();
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.package_manager = args.package_manager.toLowerCase();
  args.max_deployments = Math.max(0, args.max_deployments);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Preview Deployment Runner

Usage:
  node .github/scripts/cloudflare/deploy-preview.js [options]

Examples:
  node .github/scripts/cloudflare/deploy-preview.js
  node .github/scripts/cloudflare/deploy-preview.js --target web --environment preview
  node .github/scripts/cloudflare/deploy-preview.js --all-targets --run-build
  node .github/scripts/cloudflare/deploy-preview.js --target api --allow-worker-default-preview

Options:
      --repo <owner/repo>                 Repository slug.
      --input <file>                      cloudflare-targets.json input file.
      --environment <name>                Deployment environment. Default: preview.
      --branch <name>                     Preview branch name.
      --target-id <id>                    Deploy one target by detector ID.
      --target <name>                     Deploy one target by name.
      --type <pages|worker>               Deploy one target type.
      --root <path>                       Deploy one target root.
      --config <path>                     Deploy one Wrangler config.
      --include-target <list>             Include target names.
      --exclude-target <list>             Exclude target names.
      --wrangler-command <command>        Custom Wrangler command prefix.
      --package-manager <auto|pnpm|npm|yarn|bun|npx>
      --run-build                         Run build before deploy.
      --no-build                          Do not run build. Default.
      --build-command <command>           Custom build command.
      --changed-only                      Deploy affected targets only. Default.
      --all-targets                       Deploy all matching targets.
      --pages / --no-pages                Enable or disable Pages deployment.
      --workers / --no-workers            Enable or disable Worker deployment.
      --require-credentials               Require Cloudflare credentials. Default.
      --no-require-credentials            Do not require credentials.
      --require-account-id                Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id             Do not require CLOUDFLARE_ACCOUNT_ID.
      --require-worker-preview-env        Require Worker preview env. Default.
      --allow-worker-default-preview      Allow Worker deploy without preview env.
      --max-deployments <number>          Maximum deployments to run.
      --timeout-minutes <number>          Per-command timeout. Default: 20.
      --continue-on-error                 Continue after failed deployments. Default.
      --no-continue-on-error              Stop after first failure.
      --fail-on-error                     Exit non-zero on deployment failure. Default.
      --no-fail-on-error                  Do not fail when deployment fails.
      --fail-if-empty                     Exit non-zero when no deployment is selected.
      --logs / --no-logs                  Write stdout/stderr logs.
      --log-dir <dir>                     Log output directory.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not deploy.
      --no-print                          Do not print JSON result.
      --no-step-summary                   Do not append GitHub step summary.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(fs.readFileSync(absolutePath, "utf8"), fallback);
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

function safeBranchName(value) {
  return (
    normalizeString(value, DEFAULT_BRANCH)
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/pull\//, "pull-")
      .replace(/[^A-Za-z0-9._/-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^-|-$/g, "")
      .slice(0, 180) || DEFAULT_BRANCH
  );
}

function safeId(value) {
  return (
    normalizeString(value, "cloudflare-preview")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-preview"
  );
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

function commandDisplay(command, commandArgs) {
  return [command, ...commandArgs]
    .map((part) => {
      const value = String(part);

      if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) return value;

      return JSON.stringify(value);
    })
    .join(" ");
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

function createPackageRunCommand(packageManager, root, script) {
  const normalizedRoot = toPosixPath(root || ".");

  if (packageManager === "pnpm") {
    return {
      command: "pnpm",
      args:
        normalizedRoot === "."
          ? ["run", script]
          : ["--dir", normalizedRoot, "run", script],
      shell: false,
    };
  }

  if (packageManager === "yarn") {
    return {
      command: "yarn",
      args:
        normalizedRoot === "." ? [script] : ["--cwd", normalizedRoot, script],
      shell: false,
    };
  }

  if (packageManager === "bun") {
    return {
      command: "bun",
      args:
        normalizedRoot === "."
          ? ["run", script]
          : ["--cwd", normalizedRoot, "run", script],
      shell: false,
    };
  }

  return {
    command: "npm",
    args:
      normalizedRoot === "."
        ? ["run", script]
        : ["--prefix", normalizedRoot, "run", script],
    shell: false,
  };
}

function loadCloudflareInput(args, repoRoot) {
  const absolutePath = resolvePath(args.input_file, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);
  const data = readJsonFile(absolutePath, repoRoot, null);

  return {
    file: relativePath,
    available: Boolean(data),
    data,
  };
}

function byTargetKey(targets) {
  const map = new Map();

  for (const target of targets || []) {
    for (const key of [
      target.id,
      target.name,
      `${target.name}:${target.root}`,
      `${target.primary_type}:${target.name}`,
      target.config_file,
    ]) {
      if (key) map.set(String(key), target);
    }
  }

  return map;
}

function createDirectDeploymentFromEnv(args) {
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
    package_json: null,
    package_name: null,
    package_manager_command: "",
    environment: args.environment,
    wrangler_environment: args.environment,
    has_config_environment: false,
    affected: true,
    main: "",
    pages_build_output_dir: "",
    compatibility_date: "",
    d1_databases: 0,
    kv_namespaces: 0,
    r2_buckets: 0,
    queue_producers: 0,
    queue_consumers: 0,
    durable_objects: 0,
  };
}

function normalizeDeployment(record, target = {}) {
  const type = normalizeString(
    record.type || record.primary_type || target.primary_type || "unknown",
  ).toLowerCase();
  const name = normalizeString(
    record.name || target.name || "cloudflare-target",
  );
  const root = toPosixPath(record.root || target.root || ".");

  return {
    id: normalizeString(
      record.id || target.id || safeId(`${type}-${name}-${root}`),
    ),
    name,
    type,
    target_types: record.target_types || target.target_types || [type],
    root,
    config_file: toPosixPath(record.config_file || target.config_file || ""),
    package_json: record.package_json || target.package_json || null,
    package_name: record.package_name || target.package_name || null,
    package_manager_command:
      record.package_manager_command || target.package_manager_command || "",
    environment: normalizeString(
      record.environment || DEFAULT_ENVIRONMENT,
    ).toLowerCase(),
    wrangler_environment:
      record.wrangler_environment === undefined ||
      record.wrangler_environment === null
        ? ""
        : String(record.wrangler_environment),
    has_config_environment: Boolean(record.has_config_environment),
    affected: Boolean(record.affected || target.affected),
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

function deploymentMatchesFilters(deployment, args) {
  if (args.environment && deployment.environment !== args.environment)
    return false;

  if (args.target_id && deployment.id !== args.target_id) return false;
  if (args.target_name && deployment.name !== args.target_name) return false;
  if (args.target_type && deployment.type !== args.target_type) return false;
  if (args.target_root && deployment.root !== toPosixPath(args.target_root))
    return false;
  if (
    args.target_config &&
    deployment.config_file !== toPosixPath(args.target_config)
  )
    return false;

  if (
    args.include_targets.length &&
    !args.include_targets.includes(deployment.name)
  ) {
    return false;
  }

  if (args.exclude_targets.includes(deployment.name)) {
    return false;
  }

  if (args.changed_only && !deployment.affected) return false;
  if (deployment.type === "pages" && !args.deploy_pages) return false;
  if (deployment.type === "worker" && !args.deploy_workers) return false;

  return deployment.type === "pages" || deployment.type === "worker";
}

function selectDeployments(input, args) {
  const data = input.data || {};
  const targetMap = byTargetKey(data.targets || []);
  const matrix = Array.isArray(data.deployment_matrix)
    ? data.deployment_matrix
    : [];

  const deployments = matrix.map((entry) => {
    const target =
      targetMap.get(entry.id) ||
      targetMap.get(entry.name) ||
      targetMap.get(`${entry.name}:${entry.root}`) ||
      targetMap.get(`${entry.type}:${entry.name}`) ||
      targetMap.get(entry.config_file) ||
      {};

    return normalizeDeployment(entry, target);
  });

  if (!deployments.length && Array.isArray(data.targets)) {
    for (const target of data.targets) {
      deployments.push(
        normalizeDeployment(
          {
            id: target.id,
            name: target.name,
            type: target.primary_type,
            root: target.root,
            config_file: target.config_file,
            environment: args.environment,
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
        ),
      );
    }
  }

  const direct = createDirectDeploymentFromEnv(args);
  if (direct) deployments.push(direct);

  const selected = deployments
    .filter((deployment) => deploymentMatchesFilters(deployment, args))
    .slice(0, args.max_deployments > 0 ? args.max_deployments : undefined);

  return [
    ...new Map(
      selected.map((deployment) => [deployment.id, deployment]),
    ).values(),
  ];
}

function resolveTargetPath(targetRoot, targetPath, repoRoot) {
  const normalizedPath = normalizeString(targetPath);

  if (!normalizedPath) return "";

  if (path.isAbsolute(normalizedPath)) return path.normalize(normalizedPath);

  const fromRepoRoot = resolvePath(normalizedPath, repoRoot);

  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;

  return resolvePath(path.join(targetRoot || ".", normalizedPath), repoRoot);
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

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateDeployment(deployment, args, repoRoot) {
  const errors = [];
  const warnings = [];

  if (deployment.type === "pages") {
    const outputDir = resolveTargetPath(
      deployment.root,
      deployment.pages_build_output_dir,
      repoRoot,
    );

    if (!deployment.pages_build_output_dir) {
      errors.push("Pages target is missing pages_build_output_dir.");
    } else if (!isDirectory(outputDir) && !args.run_build && !args.dry_run) {
      errors.push(
        `Pages output directory does not exist: ${toRelativePath(outputDir, repoRoot)}`,
      );
    }

    if (!deployment.name) {
      errors.push("Pages target is missing a project name.");
    }
  }

  if (deployment.type === "worker") {
    const configFile = resolvePath(deployment.config_file, repoRoot);

    if (!deployment.config_file) {
      errors.push("Worker target is missing config_file.");
    } else if (!isFile(configFile)) {
      errors.push(
        `Worker Wrangler config does not exist: ${deployment.config_file}`,
      );
    }

    if (
      args.environment === DEFAULT_ENVIRONMENT &&
      args.require_worker_preview_env &&
      !args.allow_worker_default_preview &&
      !deployment.has_config_environment
    ) {
      errors.push(
        `Worker target "${deployment.name}" does not declare a Wrangler "${args.environment}" environment. ` +
          "This guard prevents accidentally deploying preview changes to the default Worker.",
      );
    }
  }

  if (deployment.type !== "pages" && deployment.type !== "worker") {
    errors.push(`Unsupported Cloudflare target type: ${deployment.type}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function extractUrls(...values) {
  const urls = [];

  for (const value of values) {
    const matches = String(value || "").match(URL_PATTERN) || [];
    urls.push(...matches.map((url) => url.replace(/[),.;]+$/g, "")));
  }

  return [...new Set(urls)];
}

function writeLogFile(logDir, name, content, repoRoot, args) {
  if (!args.write_logs) return null;

  const logPath = resolvePath(path.join(logDir, name), repoRoot);

  writeTextFile(logPath, redactOutput(content), {
    dry_run: args.dry_run,
  });

  return toRelativePath(logPath, repoRoot);
}

function runCommand(commandRecord, args, repoRoot) {
  const startedAt = new Date();
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
      started_at: startedAt.toISOString(),
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

  const result = childProcess.spawnSync(
    commandRecord.command,
    commandRecord.args,
    {
      cwd: commandRecord.cwd || repoRoot,
      env: {
        ...process.env,
        CI: process.env.CI || "true",
      },
      shell: Boolean(commandRecord.shell),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout,
    },
  );

  const endedAt = new Date();
  const stdout = redactOutput(result.stdout || "");
  const stderr = redactOutput(result.stderr || "");
  const exitCode = result.status;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = exitCode === 0 && !timedOut;

  const stdoutLog = writeLogFile(
    args.log_dir,
    `${commandRecord.id}.stdout.log`,
    stdout,
    repoRoot,
    args,
  );
  const stderrLog = writeLogFile(
    args.log_dir,
    `${commandRecord.id}.stderr.log`,
    stderr,
    repoRoot,
    args,
  );

  return {
    ...commandRecord,
    status: success ? "passed" : "failed",
    success,
    skipped: false,
    dry_run: false,
    exit_code: exitCode,
    signal: result.signal || null,
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    stdout_log: stdoutLog,
    stderr_log: stderrLog,
    stdout_preview: stdout.slice(0, 4000),
    stderr_preview: stderr.slice(0, 4000),
    urls: extractUrls(stdout, stderr),
  };
}

function createBuildCommand(deployment, args, repoRoot, packageManager) {
  if (!args.run_build) return null;

  const cwd = resolvePath(deployment.root || ".", repoRoot);

  if (args.build_command) {
    return {
      id: safeId(`${deployment.id}-build`),
      kind: "build",
      target_id: deployment.id,
      target_name: deployment.name,
      target_type: deployment.type,
      command: args.build_command,
      args: [],
      shell: true,
      cwd,
      display: args.build_command,
    };
  }

  const command = createPackageRunCommand(
    packageManager,
    deployment.root,
    "build",
  );

  return {
    id: safeId(`${deployment.id}-build`),
    kind: "build",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: command.command,
    args: command.args,
    shell: command.shell,
    cwd: repoRoot,
    display: commandDisplay(command.command, command.args),
  };
}

function createPagesDeployCommand(deployment, args, repoRoot, wranglerPrefix) {
  const outputDir = resolveTargetPath(
    deployment.root,
    deployment.pages_build_output_dir,
    repoRoot,
  );

  const wranglerArgs = [
    ...wranglerPrefix.args,
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    deployment.name,
    "--branch",
    args.branch,
  ];

  if (process.env.GITHUB_SHA) {
    wranglerArgs.push("--commit-hash", process.env.GITHUB_SHA);
  }

  const commitMessage = process.env.GITHUB_EVENT_NAME
    ? `${PROJECT_NAME} ${args.environment} deployment from ${process.env.GITHUB_EVENT_NAME}`
    : `${PROJECT_NAME} ${args.environment} deployment`;

  wranglerArgs.push("--commit-message", commitMessage);

  return {
    id: safeId(`${deployment.id}-deploy-pages-${args.environment}`),
    kind: "deploy",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: wranglerPrefix.command,
    args: wranglerArgs,
    shell: false,
    cwd: repoRoot,
    display: commandDisplay(wranglerPrefix.command, wranglerArgs),
  };
}

function createWorkerDeployCommand(deployment, args, repoRoot, wranglerPrefix) {
  const wranglerArgs = [
    ...wranglerPrefix.args,
    "deploy",
    "--config",
    resolvePath(deployment.config_file, repoRoot),
  ];

  if (deployment.wrangler_environment && deployment.has_config_environment) {
    wranglerArgs.push("--env", deployment.wrangler_environment);
  }

  return {
    id: safeId(`${deployment.id}-deploy-worker-${args.environment}`),
    kind: "deploy",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: wranglerPrefix.command,
    args: wranglerArgs,
    shell: false,
    cwd: repoRoot,
    display: commandDisplay(wranglerPrefix.command, wranglerArgs),
  };
}

function createDeployCommand(deployment, args, repoRoot, wranglerPrefix) {
  if (deployment.type === "pages") {
    return createPagesDeployCommand(deployment, args, repoRoot, wranglerPrefix);
  }

  if (deployment.type === "worker") {
    return createWorkerDeployCommand(
      deployment,
      args,
      repoRoot,
      wranglerPrefix,
    );
  }

  return null;
}

function createPlan(args, repoRoot, input) {
  const wranglerPrefix = createWranglerPrefix(args, repoRoot);
  const packageManager = inferPackageManager(repoRoot, args.package_manager);
  const credentials = validateCredentials(args);
  const deployments = selectDeployments(input, args);

  const commands = [];
  const skipped = [];
  const validations = [];

  for (const deployment of deployments) {
    const validation = validateDeployment(deployment, args, repoRoot);

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

    const buildCommand = createBuildCommand(
      deployment,
      args,
      repoRoot,
      packageManager,
    );
    const deployCommand = createDeployCommand(
      deployment,
      args,
      repoRoot,
      wranglerPrefix,
    );

    if (buildCommand) commands.push(buildCommand);
    if (deployCommand) commands.push(deployCommand);
  }

  return {
    credentials,
    wrangler: {
      command: wranglerPrefix.command,
      args: wranglerPrefix.args,
      package_manager: wranglerPrefix.package_manager,
      display: commandDisplay(wranglerPrefix.command, wranglerPrefix.args),
    },
    package_manager: packageManager,
    deployments,
    validations,
    commands,
    skipped,
  };
}

function executePlan(plan, args, repoRoot) {
  const results = [];
  let stoppedEarly = false;

  if (!plan.credentials.ok) {
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.credentials.errors.join("; "),
    };
  }

  for (const commandRecord of plan.commands) {
    const result = runCommand(commandRecord, args, repoRoot);

    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed Cloudflare preview command.");
      break;
    }
  }

  const skippedAfterStop = stoppedEarly
    ? plan.commands.slice(results.length).map((commandRecord) => ({
        ...commandRecord,
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
    results: [...results, ...skippedAfterStop],
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

function summarizeResults(results, skipped) {
  const passed = results.filter((result) => result.status === "passed").length;
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
    failed,
    skipped: skippedCommands + skipped.length,
    skipped_targets: skipped.length,
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: failed === 0,
  };
}

function groupDeployments(deployments) {
  const groups = {};

  for (const deployment of deployments) {
    const type = deployment.type || "unknown";

    if (!groups[type]) {
      groups[type] = {
        count: 0,
        affected: 0,
        targets: [],
      };
    }

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

function createReport(args, repoRoot, input, plan, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results, plan.skipped);
  const urls = resultUrls(execution.results);
  const deployResults = execution.results.filter(
    (result) => result.kind === "deploy",
  );
  const buildResults = execution.results.filter(
    (result) => result.kind === "build",
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
    type: "cloudflare-preview-deployment",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    input: {
      file: input.file,
      available: input.available,
      type: input.data?.type || null,
      created_at: input.data?.created_at || null,
    },
    config: {
      input_file: toRelativePath(
        resolvePath(args.input_file, repoRoot),
        repoRoot,
      ),
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      log_dir: args.write_logs
        ? toRelativePath(resolvePath(args.log_dir, repoRoot), repoRoot)
        : null,
      environment: args.environment,
      branch: args.branch,
      changed_only: args.changed_only,
      deploy_pages: args.deploy_pages,
      deploy_workers: args.deploy_workers,
      run_build: args.run_build,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      require_worker_preview_env: args.require_worker_preview_env,
      allow_worker_default_preview: args.allow_worker_default_preview,
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
      build_passed: buildResults.filter((result) => result.status === "passed")
        .length,
      build_failed: buildResults.filter((result) => result.status === "failed")
        .length,
      deploy_passed: deployResults.filter(
        (result) => result.status === "passed",
      ).length,
      deploy_failed: deployResults.filter(
        (result) => result.status === "failed",
      ).length,
      urls: urls.length,
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
      cwd: command.cwd ? toRelativePath(command.cwd, repoRoot) : ".",
    })),
    skipped_targets: plan.skipped,
    results: execution.results,
    failures: execution.results.filter((result) => result.status === "failed"),
    urls,
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
    `# ☁️ ${PROJECT_NAME} Cloudflare Preview Deployment`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Branch: \`${report.config.branch}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Git branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected deployments: \`${report.totals.selected_deployments}\``,
    `- Pages targets: \`${report.totals.selected_pages}\``,
    `- Worker targets: \`${report.totals.selected_workers}\``,
    `- Planned commands: \`${report.totals.planned_commands}\``,
    `- Build commands: \`${report.totals.build_commands}\``,
    `- Deploy commands: \`${report.totals.deploy_commands}\``,
    `- Passed: \`${report.totals.passed}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Skipped: \`${report.totals.skipped}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🔐 Credentials",
    "",
    `- Credential check: \`${report.credentials.ok ? "passed" : "failed"}\``,
    `- API token present: \`${report.credentials.api_token_present ? "true" : "false"}\``,
    `- Account ID present: \`${report.credentials.account_id_present ? "true" : "false"}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  if (Object.keys(report.deployment_groups).length) {
    lines.push("## 🗂️ Deployment Groups");
    lines.push("");
    lines.push("| Type | Count | Affected | Targets |");
    lines.push("|---|---:|---:|---|");

    for (const [type, group] of Object.entries(report.deployment_groups)) {
      lines.push(
        `| \`${type}\` | \`${group.count}\` | \`${group.affected}\` | ${group.targets.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🎯 Selected Deployments");
  lines.push("");

  if (!report.deployments.length) {
    lines.push("No Cloudflare preview deployments were selected.");
  } else {
    lines.push("| Target | Type | Root | Config | Affected |");
    lines.push("|---|---|---|---|---:|");

    for (const deployment of report.deployments) {
      lines.push(
        `| \`${deployment.name}\` | \`${deployment.type}\` | \`${deployment.root}\` | \`${deployment.config_file || "none"}\` | \`${deployment.affected ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🚀 Commands");
  lines.push("");

  if (!report.results.length) {
    lines.push("No commands were executed.");
  } else {
    lines.push("| Status | Kind | Target | Type | Duration | Command |");
    lines.push("|---|---|---|---|---:|---|");

    for (const result of report.results.slice(0, 200)) {
      lines.push(
        `| \`${result.status}\` | \`${result.kind}\` | \`${result.target_name}\` | \`${result.target_type}\` | \`${formatDuration(result.duration_ms)}\` | \`${escapeMarkdown(result.display)}\` |`,
      );
    }

    if (report.results.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ${report.results.length - 200} additional command(s) omitted. |`,
      );
    }
  }

  if (report.urls.length) {
    lines.push("");
    lines.push("## 🔗 Preview URLs");
    lines.push("");

    for (const url of report.urls) {
      lines.push(`- ${url}`);
    }
  }

  if (report.skipped_targets.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped Targets");
    lines.push("");
    lines.push("| Target | Type | Reason |");
    lines.push("|---|---|---|");

    for (const skipped of report.skipped_targets) {
      lines.push(
        `| \`${skipped.target_name}\` | \`${skipped.target_type}\` | ${escapeMarkdown(skipped.reason)} |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Kind | Target | Exit | Error | Stderr Log |");
    lines.push("|---|---|---:|---|---|");

    for (const failure of report.failures.slice(0, 50)) {
      const error =
        failure.error ||
        failure.stderr_preview.split(/\r?\n/).slice(0, 2).join(" ");

      lines.push(
        `| \`${failure.kind}\` | \`${failure.target_name}\` | \`${failure.exit_code ?? "unknown"}\` | ${escapeMarkdown(error || "Command failed.")} | \`${failure.stderr_log || "not written"}\` |`,
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

function writeGitHubOutputs(report) {
  setGitHubOutput("cloudflare_preview_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_preview_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_preview_log_dir", report.config.log_dir || "");
  setGitHubOutput("cloudflare_preview_status", report.status);
  setGitHubOutput(
    "cloudflare_preview_ok",
    report.totals.failed === 0 && !report.blocked ? "true" : "false",
  );
  setGitHubOutput("cloudflare_preview_environment", report.config.environment);
  setGitHubOutput("cloudflare_preview_branch", report.config.branch);
  setGitHubOutput(
    "cloudflare_preview_selected_deployments",
    String(report.totals.selected_deployments),
  );
  setGitHubOutput(
    "cloudflare_preview_pages",
    String(report.totals.selected_pages),
  );
  setGitHubOutput(
    "cloudflare_preview_workers",
    String(report.totals.selected_workers),
  );
  setGitHubOutput(
    "cloudflare_preview_planned_commands",
    String(report.totals.planned_commands),
  );
  setGitHubOutput("cloudflare_preview_passed", String(report.totals.passed));
  setGitHubOutput("cloudflare_preview_failed", String(report.totals.failed));
  setGitHubOutput("cloudflare_preview_urls", report.urls.join(","));
  setGitHubOutput("cloudflare_preview_urls_json", JSON.stringify(report.urls));
  setGitHubOutput(
    "cloudflare_preview_target_names",
    report.deployments.map((deployment) => deployment.name).join(","),
  );
  setGitHubOutput(
    "cloudflare_preview_target_names_json",
    JSON.stringify(report.deployments.map((deployment) => deployment.name)),
  );
  setGitHubOutput(
    "cloudflare_preview_failures_json",
    JSON.stringify(report.failures),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare preview deployment.");

  const input = loadCloudflareInput(args, repoRoot);
  const plan = createPlan(args, repoRoot, input);

  if (args.fail_if_empty && plan.deployments.length === 0) {
    logger.error("No Cloudflare preview deployments were selected.");
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
      : executePlan(plan, args, repoRoot);

  const report = createReport(args, repoRoot, input, plan, execution);
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

  if (args.fail_if_empty && report.totals.selected_deployments === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(
      `Cloudflare preview deployment blocked: ${report.block_reason}`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.totals.failed > 0) {
    logger.error(
      `Cloudflare preview deployment failed with ${report.totals.failed} failed command(s).`,
    );
    process.exitCode = 1;
  }
}

main();
