#!/usr/bin/env node
// .github/scripts/cloudflare/deploy-preview.js
// Aerealith AI — Cloudflare Preview Deployment Runner
// Deploys discovered Cloudflare Worker/Pages targets.
// Worker targets are preferred over inferred fallback Pages targets so OpenNext
// and microservice Workers deploy through Wrangler config instead of a missing
// dist/apps/* Pages directory.

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger;
try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cloudflare-preview] ${message}`),
    warn: (message) => console.warn(`[cloudflare-preview] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-preview] ERROR: ${message}`),
    formatError: (error) => error?.message || String(error || "unknown error"),
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_ENVIRONMENT = "preview";

const DEFAULT_INPUT_FILE = process.env.CLOUDFLARE_OUTPUT_DIR
  ? path.join(process.env.CLOUDFLARE_OUTPUT_DIR, "discover-deployments.json")
  : "artifacts/cloudflare/preview/discover-deployments.json";

const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/preview/deploy-preview.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/preview/deploy-preview.md";
const DEFAULT_LOG_DIR = "artifacts/cloudflare/deploy-preview/logs";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

function str(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

function int(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (value === undefined || value === null || value === "") return [];

  const items = Array.isArray(value) ? value : String(value).split(",");

  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function valueFor(argv, index, arg) {
  const value = argv[index + 1];

  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for argument: ${arg}`);
  }

  return value;
}

function safeBranch(value) {
  return (
    str(value, DEFAULT_BRANCH)
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
    str(value, "cloudflare-preview")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-preview"
  );
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
      process.env.CLOUDFLARE_PREVIEW_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,
    deployment_stage:
      process.env.CLOUDFLARE_PREVIEW_STAGE ||
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_STAGE ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,
    deployment_alias:
      process.env.CLOUDFLARE_PREVIEW_ALIAS ||
      process.env.CLOUDFLARE_DEPLOYMENT_ALIAS ||
      "",
    preview_ref:
      process.env.CLOUDFLARE_PREVIEW_REF ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_BRANCH,
    branch:
      process.env.CLOUDFLARE_PREVIEW_BRANCH ||
      process.env.CLOUDFLARE_PREVIEW_REF ||
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

    include_targets: list(process.env.CLOUDFLARE_PREVIEW_INCLUDE_TARGETS),
    exclude_targets: list(process.env.CLOUDFLARE_PREVIEW_EXCLUDE_TARGETS),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager: process.env.CLOUDFLARE_PREVIEW_PACKAGE_MANAGER || "auto",

    run_build: bool(process.env.CLOUDFLARE_PREVIEW_RUN_BUILD, true),
    build_command: process.env.CLOUDFLARE_PREVIEW_BUILD_COMMAND || "",

    changed_only: bool(process.env.CLOUDFLARE_PREVIEW_CHANGED_ONLY, true),
    deploy_pages: bool(process.env.CLOUDFLARE_PREVIEW_DEPLOY_PAGES, true),
    deploy_workers: bool(process.env.CLOUDFLARE_PREVIEW_DEPLOY_WORKERS, true),

    prefer_workers_over_pages: bool(
      process.env.CLOUDFLARE_PREVIEW_PREFER_WORKERS_OVER_PAGES ||
        process.env.CLOUDFLARE_PREFER_WORKERS_OVER_PAGES,
      true,
    ),
    skip_missing_pages_output: bool(
      process.env.CLOUDFLARE_PREVIEW_SKIP_MISSING_PAGES_OUTPUT ||
        process.env.CLOUDFLARE_SKIP_MISSING_PAGES_OUTPUT,
      true,
    ),

    auto_create_pages_project: bool(
      process.env.CLOUDFLARE_PREVIEW_AUTO_CREATE_PAGES_PROJECT ||
        process.env.CLOUDFLARE_AUTO_CREATE_PAGES_PROJECT,
      true,
    ),
    pages_production_branch:
      process.env.CLOUDFLARE_PREVIEW_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH ||
      process.env.CLOUDFLARE_PRODUCTION_BRANCH ||
      DEFAULT_BRANCH,

    require_credentials: bool(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: bool(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_ACCOUNT_ID,
      true,
    ),
    require_worker_preview_env: bool(
      process.env.CLOUDFLARE_PREVIEW_REQUIRE_WORKER_ENV,
      true,
    ),
    allow_worker_default_preview: bool(
      process.env.CLOUDFLARE_PREVIEW_ALLOW_WORKER_DEFAULT,
      false,
    ),

    max_deployments: int(process.env.CLOUDFLARE_PREVIEW_MAX_DEPLOYMENTS, 0),
    timeout_minutes: int(process.env.CLOUDFLARE_PREVIEW_TIMEOUT_MINUTES, 20),
    max_buffer_mb: int(process.env.CLOUDFLARE_PREVIEW_MAX_BUFFER_MB, 64),

    continue_on_error: bool(
      process.env.CLOUDFLARE_PREVIEW_CONTINUE_ON_ERROR,
      true,
    ),
    fail_on_error: bool(process.env.CLOUDFLARE_PREVIEW_FAIL_ON_ERROR, true),
    fail_if_empty: bool(process.env.CLOUDFLARE_PREVIEW_FAIL_IF_EMPTY, false),

    dry_run: bool(
      process.env.CLOUDFLARE_PREVIEW_DRY_RUN ||
        process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_logs: bool(process.env.CLOUDFLARE_PREVIEW_WRITE_LOGS, true),
    write_summary_file: bool(
      process.env.CLOUDFLARE_PREVIEW_WRITE_SUMMARY,
      true,
    ),
    print: bool(process.env.CLOUDFLARE_PREVIEW_PRINT, true),
    write_step_summary: bool(process.env.CLOUDFLARE_PREVIEW_STEP_SUMMARY, true),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--input") {
      args.input_file = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--environment" || arg === "--env") {
      args.environment = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--stage" || arg === "--deployment-stage") {
      args.deployment_stage = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--alias" || arg === "--deployment-alias") {
      args.deployment_alias = valueFor(argv, index, arg);
      index += 1;
    } else if (
      arg === "--ref" ||
      arg === "--preview-ref" ||
      arg === "--deployment-ref"
    ) {
      args.preview_ref = valueFor(argv, index, arg);
      args.branch = args.preview_ref;
      index += 1;
    } else if (arg === "--branch") {
      args.branch = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--target-id") {
      args.target_id = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--target" || arg === "--target-name") {
      args.target_name = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--type" || arg === "--target-type") {
      args.target_type = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--root" || arg === "--target-root") {
      args.target_root = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--config" || arg === "--target-config") {
      args.target_config = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(...list(valueFor(argv, index, arg)));
      index += 1;
    } else if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(...list(valueFor(argv, index, arg)));
      index += 1;
    } else if (arg === "--wrangler-command") {
      args.wrangler_command = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--package-manager") {
      args.package_manager = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--build-command") {
      args.build_command = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--pages-production-branch") {
      args.pages_production_branch = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--max-deployments") {
      args.max_deployments = int(
        valueFor(argv, index, arg),
        args.max_deployments,
      );
      index += 1;
    } else if (arg === "--timeout-minutes") {
      args.timeout_minutes = int(
        valueFor(argv, index, arg),
        args.timeout_minutes,
      );
      index += 1;
    } else if (arg === "--max-buffer-mb") {
      args.max_buffer_mb = int(valueFor(argv, index, arg), args.max_buffer_mb);
      index += 1;
    } else if (arg === "--log-dir") {
      args.log_dir = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      args.output_file = valueFor(argv, index, arg);
      index += 1;
    } else if (arg === "--summary") {
      args.summary_file = valueFor(argv, index, arg);
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
    } else if (arg === "--prefer-workers-over-pages") {
      args.prefer_workers_over_pages = true;
    } else if (arg === "--no-prefer-workers-over-pages") {
      args.prefer_workers_over_pages = false;
    } else if (arg === "--skip-missing-pages-output") {
      args.skip_missing_pages_output = true;
    } else if (arg === "--no-skip-missing-pages-output") {
      args.skip_missing_pages_output = false;
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
    } else if (arg === "--require-worker-preview-env") {
      args.require_worker_preview_env = true;
    } else if (arg === "--no-require-worker-preview-env") {
      args.require_worker_preview_env = false;
    } else if (arg === "--allow-worker-default-preview") {
      args.allow_worker_default_preview = true;
    } else if (arg === "--no-allow-worker-default-preview") {
      args.allow_worker_default_preview = false;
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

  args.environment = str(args.environment, DEFAULT_ENVIRONMENT).toLowerCase();
  args.deployment_stage = str(
    args.deployment_stage || args.environment,
    args.environment,
  ).toLowerCase();
  args.preview_ref = safeBranch(args.preview_ref || args.branch);
  args.branch = safeBranch(
    args.branch || args.preview_ref || args.deployment_alias,
  );
  args.pages_production_branch = safeBranch(
    args.pages_production_branch || DEFAULT_BRANCH,
  );
  args.target_type = str(args.target_type).toLowerCase();
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.package_manager = str(args.package_manager, "auto").toLowerCase();
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

Common options:
  --input <file>
  --environment <name>
  --stage <name>
  --alias <name>
  --ref <ref>
  --branch <branch>
  --target <name>
  --type <pages|worker>
  --run-build / --no-build
  --pages / --no-pages
  --workers / --no-workers
  --prefer-workers-over-pages / --no-prefer-workers-over-pages
  --skip-missing-pages-output / --no-skip-missing-pages-output
  --auto-create-pages-project / --no-auto-create-pages-project
  --pages-production-branch <branch>
  --output <file>
  --summary <file>
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

  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return;
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
}

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch {
    return fallback;
  }
}

function stripJsonComments(value) {
  return String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readJsonOrJsoncFile(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;

  try {
    return JSON.parse(stripJsonComments(fs.readFileSync(filePath, "utf8")));
  } catch {
    return fallback;
  }
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
  const sha =
    process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], { repoRoot });

  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha,
    short_sha:
      sha.slice(0, 12) ||
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

function splitCommandLine(value) {
  const input = str(value);
  if (!input) return [];

  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if ((char === "'" || char === '"') && !quote) {
      quote = char;
    } else if (char === quote) {
      quote = "";
    } else if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);

  return parts;
}

function commandDisplay(command, commandArgs) {
  return [command, ...commandArgs]
    .map((part) =>
      /^[A-Za-z0-9_./:=@,+-]+$/.test(String(part))
        ? String(part)
        : JSON.stringify(String(part)),
    )
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

function candidateInputFiles(args) {
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
    "artifacts/cloudflare/preview/discover-deployments.json",
    "artifacts/ci/cloudflare-targets.json",
  );

  return [...new Set(files.map(toPosixPath).filter(Boolean))];
}

function loadCloudflareInput(args, repoRoot) {
  const searched = candidateInputFiles(args);
  const selectedFile = searched.find((file) =>
    isFile(resolvePath(file, repoRoot)),
  );
  const file = selectedFile || args.input_file;
  const absolutePath = resolvePath(file, repoRoot);
  const data = readJsonFile(absolutePath, repoRoot, null);

  return {
    file: toRelativePath(absolutePath, repoRoot),
    available: Boolean(data),
    searched_files: searched.map((candidate) =>
      toRelativePath(resolvePath(candidate, repoRoot), repoRoot),
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

function inputTargets(data) {
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

function inputMatrix(data) {
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
      value.wrangler_config_file ||
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

function byTargetKey(targets) {
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
    environment: args.environment,
    deployment_stage: args.deployment_stage,
    deployment_alias: args.deployment_alias,
    preview_ref: args.preview_ref,
    wrangler_environment: args.environment,
    has_config_environment: false,
    affected: true,
    main: "",
    pages_build_output_dir: "",
    compatibility_date: "",
  };
}

function inferType(record, target = {}) {
  const explicit = str(
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
  const name = str(
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
  const root = toPosixPath(
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

  const environment = str(
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

  const affected =
    record.affected === undefined &&
    record.changed === undefined &&
    target.affected === undefined &&
    target.changed === undefined
      ? true
      : Boolean(
          record.affected ??
          record.changed ??
          target.affected ??
          target.changed,
        );

  return {
    id: str(
      record.id ||
        record.target_id ||
        target.id ||
        target.target_id ||
        safeId(`${type}-${name}-${root}`),
    ),
    name,
    type,
    target_types: Array.isArray(targetTypes) ? targetTypes : [targetTypes],
    root,
    config_file: toPosixPath(
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
    deployment_stage: str(
      record.deployment_stage || record.stage || args.deployment_stage || "",
    ).toLowerCase(),
    deployment_alias: str(
      record.deployment_alias || record.alias || args.deployment_alias || "",
    ),
    preview_ref: str(
      record.preview_ref || record.ref || args.preview_ref || "",
    ),
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

function deploymentMatchesFilters(deployment, args) {
  if (args.environment && deployment.environment !== args.environment) {
    return false;
  }

  if (args.target_id && deployment.id !== args.target_id) return false;
  if (args.target_name && deployment.name !== args.target_name) return false;
  if (args.target_type && deployment.type !== args.target_type) return false;
  if (args.target_root && deployment.root !== toPosixPath(args.target_root)) {
    return false;
  }
  if (
    args.target_config &&
    deployment.config_file !== toPosixPath(args.target_config)
  ) {
    return false;
  }
  if (
    args.include_targets.length &&
    !args.include_targets.includes(deployment.name)
  ) {
    return false;
  }
  if (args.exclude_targets.includes(deployment.name)) return false;
  if (args.changed_only && !deployment.affected) return false;
  if (deployment.type === "pages" && !args.deploy_pages) return false;
  if (deployment.type === "worker" && !args.deploy_workers) return false;

  return deployment.type === "pages" || deployment.type === "worker";
}

function appNameFromPagesOutputDir(outputDir) {
  const normalized = toPosixPath(outputDir);
  const match = normalized.match(/(?:^|\/)dist\/apps\/([^/]+)/);

  return match?.[1] || "";
}

function pageTargetLooksInferred(deployment) {
  if (!deployment || deployment.type !== "pages") return false;
  if (deployment.config_file) return false;

  return (
    deployment.id.startsWith("pages-") ||
    deployment.root === "." ||
    deployment.pages_build_output_dir.startsWith("dist/apps/")
  );
}

function workerMatchesPagesTarget(worker, pagesTarget) {
  if (!worker || !pagesTarget) return false;
  if (worker.type !== "worker" || pagesTarget.type !== "pages") return false;

  const appName = appNameFromPagesOutputDir(pagesTarget.pages_build_output_dir);
  const workerRoot = toPosixPath(worker.root);
  const workerConfig = toPosixPath(worker.config_file);

  if (appName) {
    if (workerRoot === `apps/${appName}`) return true;
    if (workerConfig.startsWith(`apps/${appName}/`)) return true;
  }

  if (worker.name && pagesTarget.name && worker.name === pagesTarget.name) {
    return true;
  }

  if (
    worker.pages_build_output_dir &&
    worker.pages_build_output_dir.includes(".open-next")
  ) {
    return true;
  }

  if (
    workerConfig.endsWith("wrangler.toml") ||
    workerConfig.endsWith("wrangler.jsonc")
  ) {
    return pageTargetLooksInferred(pagesTarget);
  }

  return false;
}

function removeWorkerShadowedPages(deployments, args) {
  if (!args.prefer_workers_over_pages) return deployments;

  const workers = deployments.filter(
    (deployment) => deployment.type === "worker",
  );
  const filtered = [];

  for (const deployment of deployments) {
    if (
      deployment.type === "pages" &&
      pageTargetLooksInferred(deployment) &&
      workers.some((worker) => workerMatchesPagesTarget(worker, deployment))
    ) {
      logger.warn(
        `Skipping inferred Pages target "${deployment.name}" because a Worker target for the same frontend/service was discovered.`,
      );
      continue;
    }

    filtered.push(deployment);
  }

  return filtered;
}

function selectDeployments(input, args) {
  const data = input.data || {};
  const targets = inputTargets(data);
  const targetMap = byTargetKey(targets);
  const matrix = inputMatrix(data);
  const deployments = matrix.map((entry) => {
    const target =
      targetMap.get(entry.id) ||
      targetMap.get(entry.target_id) ||
      targetMap.get(entry.name) ||
      targetMap.get(entry.target_name) ||
      targetMap.get(entry.project_name) ||
      targetMap.get(`${entry.name}:${entry.root}`) ||
      targetMap.get(`${entry.target_name}:${entry.root}`) ||
      targetMap.get(`${entry.type}:${entry.name}`) ||
      targetMap.get(`${entry.primary_type}:${entry.name}`) ||
      targetMap.get(entry.config_file) ||
      targetMap.get(entry.wrangler_config) ||
      {};

    return normalizeDeployment(
      {
        ...entry,
        environment: entry.environment || args.environment,
        deployment_stage: entry.deployment_stage || args.deployment_stage,
        deployment_alias: entry.deployment_alias || args.deployment_alias,
        preview_ref: entry.preview_ref || args.preview_ref,
      },
      target,
      args,
    );
  });

  if (!deployments.length && targets.length) {
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
            environment: args.environment,
            deployment_stage: args.deployment_stage,
            deployment_alias: args.deployment_alias,
            preview_ref: args.preview_ref,
            wrangler_environment: target.environments?.includes?.(
              args.environment,
            )
              ? args.environment
              : target.wrangler_environment || "",
            has_config_environment:
              target.environments?.includes?.(args.environment) ||
              target.has_config_environment ||
              false,
            affected: target.affected,
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

  const direct = createDirectDeploymentFromEnv(args);
  if (direct) deployments.push(direct);

  const unique = [
    ...new Map(
      deployments.map((deployment) => [deployment.id, deployment]),
    ).values(),
  ];

  let selected = unique.filter((deployment) =>
    deploymentMatchesFilters(deployment, args),
  );

  selected = removeWorkerShadowedPages(selected, args);

  if (!selected.length && args.changed_only) {
    const relaxedArgs = {
      ...args,
      changed_only: false,
    };

    selected = unique.filter((deployment) =>
      deploymentMatchesFilters(deployment, relaxedArgs),
    );

    selected = removeWorkerShadowedPages(selected, relaxedArgs);

    if (selected.length) {
      logger.warn(
        "No preview deployments matched changed-only filtering. Falling back to all preview deployment targets from discovery output.",
      );
    }
  }

  return selected.slice(
    0,
    args.max_deployments > 0 ? args.max_deployments : undefined,
  );
}

function resolveTargetPath(targetRoot, targetPath, repoRoot) {
  const normalizedPath = str(targetPath);
  if (!normalizedPath) return "";
  if (path.isAbsolute(normalizedPath)) return path.normalize(normalizedPath);

  const fromRepoRoot = resolvePath(normalizedPath, repoRoot);
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;

  return resolvePath(path.join(targetRoot || ".", normalizedPath), repoRoot);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wranglerConfigHasEnvironment(configFile, environmentName) {
  if (!configFile || !isFile(configFile) || !environmentName) return false;

  const ext = path.extname(configFile).toLowerCase();
  const content = fs.readFileSync(configFile, "utf8");
  const env = escapeRegExp(environmentName);

  if (ext === ".toml") {
    return new RegExp(`^\\s*\\[\\s*env\\.${env}\\s*\\]`, "m").test(content);
  }

  if (ext === ".json" || ext === ".jsonc") {
    const parsed = readJsonOrJsoncFile(configFile, null);

    if (
      parsed?.env &&
      Object.prototype.hasOwnProperty.call(parsed.env, environmentName)
    ) {
      return true;
    }

    return new RegExp(`"env"\\s*:\\s*\\{[\\s\\S]*?"${env}"\\s*:`, "m").test(
      content,
    );
  }

  return false;
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
      if (args.skip_missing_pages_output) {
        warnings.push(
          `Pages output directory does not exist and will be skipped if still missing at deploy time: ${toRelativePath(outputDir, repoRoot)}`,
        );
      } else {
        errors.push(
          `Pages output directory does not exist: ${toRelativePath(outputDir, repoRoot)}`,
        );
      }
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

    const configHasPreviewEnv =
      deployment.has_config_environment ||
      wranglerConfigHasEnvironment(configFile, args.environment);

    deployment.has_config_environment = configHasPreviewEnv;

    if (
      args.environment === DEFAULT_ENVIRONMENT &&
      args.require_worker_preview_env &&
      !args.allow_worker_default_preview &&
      !configHasPreviewEnv
    ) {
      errors.push(
        `Worker target "${deployment.name}" does not declare a Wrangler "${args.environment}" environment.`,
      );
    }
  }

  if (deployment.type !== "pages" && deployment.type !== "worker") {
    errors.push(`Unsupported Cloudflare target type: ${deployment.type}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function redact(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function cleanUrl(url) {
  return String(url || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[),.;]+$/g, "")
    .trim();
}

function extractUrls(...values) {
  const urls = [];

  for (const value of values) {
    urls.push(...(String(value || "").match(URL_PATTERN) || []).map(cleanUrl));
  }

  return [...new Set(urls.filter(Boolean))];
}

function writeLogFile(logDir, name, content, repoRoot, args) {
  if (!args.write_logs) return null;

  const logPath = resolvePath(path.join(logDir, name), repoRoot);

  writeTextFile(logPath, redact(content), { dry_run: args.dry_run });

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
      env: { ...process.env, CI: process.env.CI || "true" },
      shell: Boolean(commandRecord.shell),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout,
    },
  );

  const endedAt = new Date();
  const stdout = redact(result.stdout || "");
  const stderr = redact(result.stderr || "");
  const exitCode = result.status;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = exitCode === 0 && !timedOut;

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
    stdout_log: writeLogFile(
      args.log_dir,
      `${commandRecord.id}.stdout.log`,
      stdout,
      repoRoot,
      args,
    ),
    stderr_log: writeLogFile(
      args.log_dir,
      `${commandRecord.id}.stderr.log`,
      stderr,
      repoRoot,
      args,
    ),
    stdout_preview: stdout.slice(0, 4000),
    stderr_preview: stderr.slice(0, 4000),
    urls: extractUrls(stdout, stderr),
  };
}

function createSkippedCommandResult(commandRecord, reason) {
  return {
    ...commandRecord,
    status: "skipped",
    success: true,
    skipped: true,
    dry_run: false,
    exit_code: null,
    signal: null,
    error: reason,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 0,
    stdout_log: null,
    stderr_log: null,
    stdout_preview: "",
    stderr_preview: "",
    urls: [],
  };
}

function isPagesDeployCommand(commandRecord) {
  return (
    commandRecord?.kind === "deploy" && commandRecord?.target_type === "pages"
  );
}

function shouldSkipMissingPagesDeploy(commandRecord, args) {
  if (!args.skip_missing_pages_output) return false;
  if (!isPagesDeployCommand(commandRecord)) return false;
  if (!commandRecord.pages_output_dir) return false;

  return !isDirectory(commandRecord.pages_output_dir);
}

function isPagesProjectNotFoundResult(result) {
  if (!result || result.success) return false;
  if (result.target_type !== "pages" || result.kind !== "deploy") return false;

  const output = `${result.stdout_preview || ""}\n${result.stderr_preview || ""}\n${result.error || ""}`;

  return (
    /project not found/i.test(output) ||
    /code:\s*8000007/i.test(output) ||
    /\/pages\/projects\//i.test(output)
  );
}

function isPagesProjectAlreadyExistsResult(result) {
  if (!result || result.success) return false;

  const output = `${result.stdout_preview || ""}\n${result.stderr_preview || ""}\n${result.error || ""}`;

  return (
    /already exists/i.test(output) ||
    /project already exists/i.test(output) ||
    /name already exists/i.test(output)
  );
}

function createPagesProjectCommand(commandRecord, args, repoRoot) {
  const commandArgs = Array.isArray(commandRecord.args)
    ? commandRecord.args
    : [];
  const pagesIndex = commandArgs.indexOf("pages");
  const wranglerPrefixArgs =
    pagesIndex >= 0 ? commandArgs.slice(0, pagesIndex) : ["exec", "wrangler"];
  const projectName =
    commandRecord.pages_project_name ||
    commandRecord.target_name ||
    str(process.env.CLOUDFLARE_PROJECT_NAME);

  if (!projectName) return null;

  const projectArgs = [
    ...wranglerPrefixArgs,
    "pages",
    "project",
    "create",
    projectName,
    "--production-branch",
    args.pages_production_branch || DEFAULT_BRANCH,
  ];

  return {
    id: safeId(
      `${commandRecord.target_id || projectName}-create-pages-project-${args.deployment_stage || args.environment}`,
    ),
    kind: "setup",
    target_id: commandRecord.target_id,
    target_name: commandRecord.target_name || projectName,
    target_type: "pages",
    command: commandRecord.command,
    args: projectArgs,
    shell: false,
    cwd: repoRoot,
    pages_project_name: projectName,
    pages_production_branch: args.pages_production_branch || DEFAULT_BRANCH,
    display: commandDisplay(commandRecord.command, projectArgs),
  };
}

function createPagesDeployRetryCommand(commandRecord) {
  return {
    ...commandRecord,
    id: safeId(`${commandRecord.id || commandRecord.target_id}-retry`),
    retry_of: commandRecord.id || "",
    display: `${commandRecord.display} (retry after Pages project create)`,
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
    ? `${PROJECT_NAME} ${args.deployment_stage || args.environment} deployment from ${process.env.GITHUB_EVENT_NAME}`
    : `${PROJECT_NAME} ${args.deployment_stage || args.environment} deployment`;

  wranglerArgs.push("--commit-message", commitMessage);

  return {
    id: safeId(
      `${deployment.id}-deploy-pages-${args.deployment_stage || args.environment}`,
    ),
    kind: "deploy",
    target_id: deployment.id,
    target_name: deployment.name,
    target_type: deployment.type,
    command: wranglerPrefix.command,
    args: wranglerArgs,
    shell: false,
    cwd: repoRoot,
    pages_project_name: deployment.name,
    pages_production_branch: args.pages_production_branch,
    pages_output_dir: outputDir,
    display: commandDisplay(wranglerPrefix.command, wranglerArgs),
  };
}

function createWorkerDeployCommand(deployment, args, repoRoot, wranglerPrefix) {
  const configFile = resolvePath(deployment.config_file, repoRoot);
  const configHasEnv =
    deployment.has_config_environment ||
    wranglerConfigHasEnvironment(configFile, args.environment);

  const wranglerArgs = [
    ...wranglerPrefix.args,
    "deploy",
    "--config",
    configFile,
  ];

  if (configHasEnv) {
    wranglerArgs.push("--env", args.environment);
  } else if (
    deployment.wrangler_environment &&
    deployment.has_config_environment
  ) {
    wranglerArgs.push("--env", deployment.wrangler_environment);
  }

  return {
    id: safeId(
      `${deployment.id}-deploy-worker-${args.deployment_stage || args.environment}`,
    ),
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
  let stopIndex = -1;

  if (!plan.credentials.ok) {
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: plan.credentials.errors.join("; "),
    };
  }

  for (let index = 0; index < plan.commands.length; index += 1) {
    const commandRecord = plan.commands[index];

    if (shouldSkipMissingPagesDeploy(commandRecord, args)) {
      const reason = `Skipped Pages deploy because the output directory does not exist: ${toRelativePath(commandRecord.pages_output_dir, repoRoot)}`;
      logger.warn(reason);
      results.push(createSkippedCommandResult(commandRecord, reason));
      continue;
    }

    let result = runCommand(commandRecord, args, repoRoot);
    results.push(result);

    if (
      !result.success &&
      args.auto_create_pages_project &&
      isPagesProjectNotFoundResult(result)
    ) {
      const createProjectCommand = createPagesProjectCommand(
        commandRecord,
        args,
        repoRoot,
      );

      if (createProjectCommand) {
        logger.warn(
          `Cloudflare Pages project "${createProjectCommand.pages_project_name}" was not found. Creating it and retrying deployment.`,
        );

        const createResult = runCommand(createProjectCommand, args, repoRoot);
        results.push(createResult);

        if (
          createResult.success ||
          isPagesProjectAlreadyExistsResult(createResult)
        ) {
          const retryCommand = createPagesDeployRetryCommand(commandRecord);
          const retryResult = runCommand(retryCommand, args, repoRoot);
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
      logger.warn("Stopping after first failed Cloudflare preview command.");
      break;
    }
  }

  const skippedAfterStop =
    stoppedEarly && stopIndex >= 0
      ? plan.commands.slice(stopIndex + 1).map((commandRecord) => ({
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

  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function summarizeResults(results, skipped) {
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
    duration_human: formatDuration(durationMs),
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
  const primaryUrl = urls[0] || "";
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
    type: "cloudflare-preview-deployment",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    preview_url: primaryUrl,
    deployment_url: primaryUrl,
    url: primaryUrl,
    cloudflare: {
      preview_url: primaryUrl,
      deployment_url: primaryUrl,
      urls,
      environment: args.environment,
      stage: args.deployment_stage,
      alias: args.deployment_alias,
      ref: args.preview_ref,
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
      deployment_stage: args.deployment_stage,
      deployment_alias: args.deployment_alias,
      preview_ref: args.preview_ref,
      branch: args.branch,
      changed_only: args.changed_only,
      deploy_pages: args.deploy_pages,
      deploy_workers: args.deploy_workers,
      prefer_workers_over_pages: args.prefer_workers_over_pages,
      skip_missing_pages_output: args.skip_missing_pages_output,
      auto_create_pages_project: args.auto_create_pages_project,
      pages_production_branch: args.pages_production_branch,
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
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Stage: \`${report.config.deployment_stage}\``,
    `- Alias: \`${report.config.deployment_alias || "not set"}\``,
    `- Ref: \`${report.config.preview_ref || "not set"}\``,
    `- Branch: \`${report.config.branch}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Worker-first deploys: \`${report.config.prefer_workers_over_pages ? "true" : "false"}\``,
    `- Skip missing Pages output: \`${report.config.skip_missing_pages_output ? "true" : "false"}\``,
    `- Auto-create Pages project: \`${report.config.auto_create_pages_project ? "true" : "false"}\``,
    `- Pages production branch: \`${report.config.pages_production_branch}\``,
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

  if (report.preview_url) {
    lines.push("## Primary Preview URL", "", `- ${report.preview_url}`, "");
  }

  lines.push("## Selected Deployments", "");

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

  lines.push("", "## Commands", "");

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
        `| \`${skipped.target_name}\` | \`${skipped.target_type}\` | ${escapeMarkdown(skipped.reason)} |`,
      );
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
        `| \`${failure.kind}\` | \`${failure.target_name}\` | \`${failure.exit_code ?? "unknown"}\` | ${escapeMarkdown(error || "Command failed.")} | \`${failure.stderr_log || "not written"}\` |`,
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

  fs.appendFileSync(outputFile, `${name}<<EOF\n${redact(rendered)}\nEOF\n`);

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
  setGitHubOutput("cloudflare_preview_stage", report.config.deployment_stage);
  setGitHubOutput("cloudflare_preview_alias", report.config.deployment_alias);
  setGitHubOutput("cloudflare_preview_ref", report.config.preview_ref);
  setGitHubOutput("cloudflare_preview_branch", report.config.branch);
  setGitHubOutput("cloudflare_preview_url", report.preview_url || "");
  setGitHubOutput("preview_url", report.preview_url || "");
  setGitHubOutput("deployment_url", report.deployment_url || "");
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
  setGitHubOutput(
    "cloudflare_preview_recovered",
    String(report.totals.recovered),
  );
  setGitHubOutput("cloudflare_preview_failed", String(report.totals.failed));
  setGitHubOutput(
    "cloudflare_preview_prefer_workers_over_pages",
    report.config.prefer_workers_over_pages ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_preview_skip_missing_pages_output",
    report.config.skip_missing_pages_output ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_preview_auto_create_pages_project",
    report.config.auto_create_pages_project ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_preview_pages_production_branch",
    report.config.pages_production_branch,
  );
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

  if (!input.available) {
    logger.warn(
      `No Cloudflare deployment discovery input found. Searched: ${
        (input.searched_files || []).join(", ") || input.file
      }.`,
    );
  } else if (
    input.file !==
    toRelativePath(resolvePath(args.input_file, repoRoot), repoRoot)
  ) {
    logger.info(`Using Cloudflare deployment discovery input: ${input.file}.`);
  }

  const plan = createPlan(args, repoRoot, input);

  if (args.fail_if_empty && plan.deployments.length === 0) {
    logger.error("No Cloudflare preview deployments were selected.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? { results: [], stopped_early: false, blocked: false, block_reason: "" }
      : executePlan(plan, args, repoRoot);

  const report = createReport(args, repoRoot, input, plan, execution);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  writeTextFile(outputFile, json, { dry_run: args.dry_run });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, { dry_run: args.dry_run });
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
