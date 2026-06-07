#!/usr/bin/env node
// .github/scripts/cloudflare/discover-deployments.js
// =============================================================================
// Aerealith AI — Cloudflare Deployment Discovery Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   Discover Cloudflare Pages/Workers deployment targets automatically from the
//   repository, merge any existing Cloudflare deployment reports, and emit a
//   deployment inventory that preview, staging, and production deploy runners can
//   consume directly.
//
// Input:
//   - repository files such as wrangler.toml/json/jsonc/yaml/yml
//   - package.json scripts and common monorepo app layouts
//   - optional deployment reports from previous Cloudflare deploy steps
//   - optional artifacts/ci/cloudflare-targets.json, when present
//
// Output:
//   - artifacts/cloudflare/deployments.json, or the provided --output file
//   - artifacts/cloudflare/deployments.md, or the provided --summary file
//   - artifacts/ci/cloudflare-targets.json, generated automatically by default
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not deploy anything.
//   - Does not mutate Cloudflare.
//   - Accepts --stage, --alias, and --ref for workflow compatibility.
//   - Can scan Cloudflare deployment logs for URLs missed by structured reports.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cloudflare-deployments] ${message}`),
    warn: (message) =>
      console.warn(`[cloudflare-deployments] WARN: ${message}`),
    error: (message) =>
      console.error(`[cloudflare-deployments] ERROR: ${message}`),
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

const DEFAULT_PREVIEW_FILE = "artifacts/cloudflare/deploy-preview.json";
const DEFAULT_STAGING_FILE = "artifacts/cloudflare/deploy-staging.json";
const DEFAULT_PRODUCTION_FILE = "artifacts/cloudflare/deploy-production.json";
const DEFAULT_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/deployments.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/deployments.md";

const DEFAULT_LOG_ROOTS = [
  "artifacts/cloudflare/deploy-preview/logs",
  "artifacts/cloudflare/deploy-staging/logs",
  "artifacts/cloudflare/deploy-production/logs",
];

const WRANGLER_CONFIG_NAMES = new Set([
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.yaml",
  "wrangler.yml",
]);

const AUTO_DISCOVERY_IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  ".wrangler",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
  "temp",
]);

const COMMON_PAGES_APP_DIRS = [
  "apps/web",
  "apps/frontend",
  "apps/site",
  "apps/docs",
  "apps/app",
  "web",
  "frontend",
  "site",
];

const COMMON_PAGES_OUTPUT_DIRS = [
  "dist/apps/web",
  "dist/apps/frontend",
  "dist/apps/site",
  "dist/apps/docs",
  "apps/web/dist",
  "apps/web/out",
  "apps/frontend/dist",
  "apps/site/dist",
  "apps/docs/dist",
  ".vercel/output/static",
  "out",
  "dist",
];

const KNOWN_ENVIRONMENTS = new Set(["preview", "staging", "production"]);
const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

function requireValue(argv, index, arg) {
  const value = argv[index + 1];

  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for argument: ${arg}`);
  }

  return value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    preview_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_PREVIEW_FILE || DEFAULT_PREVIEW_FILE,
    staging_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_STAGING_FILE || DEFAULT_STAGING_FILE,
    production_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_PRODUCTION_FILE ||
      DEFAULT_PRODUCTION_FILE,
    targets_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_TARGETS_FILE || DEFAULT_TARGETS_FILE,
    input_files: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_INPUT_FILES,
    ),
    input_dirs: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_INPUT_DIRS,
    ),
    log_roots: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_LOG_ROOTS,
    ),

    deployment_stage:
      process.env.CLOUDFLARE_DEPLOYMENT_STAGE ||
      process.env.CLOUDFLARE_STAGE ||
      "",
    alias:
      process.env.CLOUDFLARE_DEPLOYMENT_ALIAS ||
      process.env.CLOUDFLARE_PREVIEW_ALIAS ||
      "",
    preview_ref:
      process.env.CLOUDFLARE_DEPLOYMENT_REF ||
      process.env.CLOUDFLARE_PREVIEW_REF ||
      process.env.CLOUDFLARE_STAGING_REF ||
      process.env.CLOUDFLARE_PRODUCTION_REF ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      "",
    pull_request_number: process.env.CLOUDFLARE_PULL_REQUEST_NUMBER || "",
    project_name:
      process.env.CLOUDFLARE_PROJECT_NAME ||
      process.env.CLOUDFLARE_PAGES_PROJECT_NAME ||
      "",
    output_root: process.env.CLOUDFLARE_OUTPUT_DIR || "",

    output_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_DEPLOYMENTS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environments: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_ENVIRONMENTS,
    ),
    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_EXCLUDE_TARGETS,
    ),
    include_types: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_INCLUDE_TYPES,
    ),
    exclude_types: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_EXCLUDE_TYPES,
    ),

    include_undeployed_targets: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_INCLUDE_UNDEPLOYED,
      false,
    ),
    auto_discover_targets: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_AUTO_DISCOVER_TARGETS,
      true,
    ),
    write_targets_file: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_WRITE_TARGETS_FILE,
      true,
    ),
    scan_logs: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_SCAN_LOGS,
      true,
    ),
    include_orphan_urls: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_INCLUDE_ORPHAN_URLS,
      true,
    ),
    redact_logs: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_REDACT_LOGS,
      true,
    ),

    max_log_files: normalizeInteger(
      process.env.CLOUDFLARE_DEPLOYMENTS_MAX_LOG_FILES,
      500,
    ),
    max_urls_per_log: normalizeInteger(
      process.env.CLOUDFLARE_DEPLOYMENTS_MAX_URLS_PER_LOG,
      25,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_failed_deployment: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_FAIL_ON_FAILED,
      false,
    ),
    fail_on_blocked_deployment: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_FAIL_ON_BLOCKED,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_DEPLOYMENTS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_DEPLOYMENTS_STEP_SUMMARY,
      true,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      args.preview_file = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--staging") {
      args.staging_file = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--production") {
      args.production_file = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--targets" || arg === "--cloudflare-targets") {
      args.targets_file = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--input-dir" || arg === "--input-dirs") {
      args.input_dirs.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--log-root" || arg === "--log-roots") {
      args.log_roots.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (
      arg === "--environment" ||
      arg === "--environments" ||
      arg === "--env"
    ) {
      args.environments.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--stage" || arg === "--deployment-stage") {
      args.deployment_stage = requireValue(argv, index, arg);
      args.environments.push(...normalizeStringList(args.deployment_stage));
      index += 1;
      continue;
    }

    if (
      arg === "--alias" ||
      arg === "--deployment-alias" ||
      arg === "--preview-alias"
    ) {
      args.alias = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (
      arg === "--ref" ||
      arg === "--deployment-ref" ||
      arg === "--preview-ref" ||
      arg === "--staging-ref" ||
      arg === "--production-ref" ||
      arg === "--ref-name"
    ) {
      args.preview_ref = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--pull-request-number" || arg === "--pr-number") {
      args.pull_request_number = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--project-name" || arg === "--cloudflare-project") {
      args.project_name = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--output-root") {
      args.output_root = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--include-type" || arg === "--include-types") {
      args.include_types.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--exclude-type" || arg === "--exclude-types") {
      args.exclude_types.push(
        ...normalizeStringList(requireValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }

    if (arg === "--include-undeployed") {
      args.include_undeployed_targets = true;
      continue;
    }

    if (arg === "--no-undeployed") {
      args.include_undeployed_targets = false;
      continue;
    }

    if (arg === "--auto-discover-targets") {
      args.auto_discover_targets = true;
      continue;
    }

    if (arg === "--no-auto-discover-targets") {
      args.auto_discover_targets = false;
      continue;
    }

    if (arg === "--write-targets-file") {
      args.write_targets_file = true;
      continue;
    }

    if (arg === "--no-write-targets-file") {
      args.write_targets_file = false;
      continue;
    }

    if (arg === "--scan-logs") {
      args.scan_logs = true;
      continue;
    }

    if (arg === "--no-scan-logs") {
      args.scan_logs = false;
      continue;
    }

    if (arg === "--include-orphan-urls") {
      args.include_orphan_urls = true;
      continue;
    }

    if (arg === "--no-orphan-urls") {
      args.include_orphan_urls = false;
      continue;
    }

    if (arg === "--redact-logs") {
      args.redact_logs = true;
      continue;
    }

    if (arg === "--no-redact-logs") {
      args.redact_logs = false;
      continue;
    }

    if (arg === "--max-log-files") {
      args.max_log_files = normalizeInteger(
        requireValue(argv, index, arg),
        args.max_log_files,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-urls-per-log") {
      args.max_urls_per_log = normalizeInteger(
        requireValue(argv, index, arg),
        args.max_urls_per_log,
      );
      index += 1;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--fail-on-failed") {
      args.fail_on_failed_deployment = true;
      continue;
    }

    if (arg === "--fail-on-blocked") {
      args.fail_on_blocked_deployment = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_failed_deployment = false;
      args.fail_on_blocked_deployment = false;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = requireValue(argv, index, arg);
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

  normalizeArgs(args);

  return args;
}

function normalizeArgs(args) {
  if (!args.log_roots.length) {
    args.log_roots = [...DEFAULT_LOG_ROOTS];
  }

  args.deployment_stage = normalizeString(args.deployment_stage).toLowerCase();
  args.alias = normalizeString(args.alias);
  args.preview_ref = normalizeString(args.preview_ref);
  args.pull_request_number = normalizeString(args.pull_request_number);
  args.project_name = normalizeString(args.project_name);
  args.output_root = toPosixPath(args.output_root);

  args.environments = [
    ...new Set(
      args.environments
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];

  if (
    args.deployment_stage &&
    KNOWN_ENVIRONMENTS.has(args.deployment_stage) &&
    !args.environments.length
  ) {
    args.environments.push(args.deployment_stage);
  }

  if (args.output_root && args.deployment_stage) {
    const stageInputFile = toPosixPath(
      path.join(args.output_root, `deploy-${args.deployment_stage}.json`),
    );
    const genericInputFile = toPosixPath(
      path.join(args.output_root, "deployment.json"),
    );
    const stageLogRoot = toPosixPath(path.join(args.output_root, "logs"));

    args.input_files.push(stageInputFile, genericInputFile);
    args.log_roots.push(stageLogRoot);
  }

  args.include_targets = [
    ...new Set(args.include_targets.map(normalizeString).filter(Boolean)),
  ];
  args.exclude_targets = [
    ...new Set(args.exclude_targets.map(normalizeString).filter(Boolean)),
  ];
  args.include_types = [
    ...new Set(
      args.include_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.exclude_types = [
    ...new Set(
      args.exclude_types
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  args.input_files = [
    ...new Set(args.input_files.map(toPosixPath).filter(Boolean)),
  ];
  args.input_dirs = [
    ...new Set(args.input_dirs.map(toPosixPath).filter(Boolean)),
  ];
  args.log_roots = [
    ...new Set(args.log_roots.map(toPosixPath).filter(Boolean)),
  ];
  args.max_log_files = Math.max(0, args.max_log_files);
  args.max_urls_per_log = Math.max(0, args.max_urls_per_log);
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Deployment Discovery Reporter

Usage:
  node .github/scripts/cloudflare/discover-deployments.js [options]

Examples:
  node .github/scripts/cloudflare/discover-deployments.js
  node .github/scripts/cloudflare/discover-deployments.js --environment production
  node .github/scripts/cloudflare/discover-deployments.js --stage preview --alias main
  node .github/scripts/cloudflare/discover-deployments.js --stage staging --ref main
  node .github/scripts/cloudflare/discover-deployments.js --include-target frontend --scan-logs
  node .github/scripts/cloudflare/discover-deployments.js --include-undeployed
  node .github/scripts/cloudflare/discover-deployments.js --no-auto-discover-targets

Options:
      --repo <owner/repo>                 Repository slug.
      --preview <file>                    Preview deployment report file.
      --staging <file>                    Staging deployment report file.
      --production <file>                 Production deployment report file.
      --targets <file>                    cloudflare-targets.json detector file.
  -i, --input <file>                      Additional Cloudflare deployment report JSON file.
      --input-dir <path,list>             Additional directories to scan for JSON reports.
      --log-root <path,list>              Log roots to scan for deployment URLs.
      --environment <list>                Environment filter: preview, staging, production.
      --stage <stage>                     Stage alias for --environment.
      --alias <alias>                     Deployment alias, such as preview branch alias.
      --ref <ref>                         Deployment branch/ref metadata.
      --deployment-ref <ref>              Deployment branch/ref metadata alias.
      --preview-ref <ref>                 Preview branch/ref metadata alias.
      --staging-ref <ref>                 Staging branch/ref metadata alias.
      --production-ref <ref>              Production branch/ref metadata alias.
      --pull-request-number <number>      Pull request number metadata.
      --project-name <name>               Cloudflare project name metadata.
      --output-root <path>                Stage output root to scan for reports/logs.
      --include-target <list>             Include only target names.
      --exclude-target <list>             Exclude target names.
      --include-type <list>               Include only pages/worker target types.
      --exclude-type <list>               Exclude pages/worker target types.
      --include-undeployed                Include detector targets that have no deployment report.
      --no-undeployed                     Do not include undeployed targets.
      --auto-discover-targets             Automatically scan the repo for targets. Default.
      --no-auto-discover-targets          Disable automatic target discovery.
      --write-targets-file                Write generated artifacts/ci/cloudflare-targets.json. Default.
      --no-write-targets-file             Do not write generated target file.
      --scan-logs                         Scan deployment logs for URLs. Default.
      --no-scan-logs                      Do not scan logs.
      --include-orphan-urls               Include URLs found in logs but not mapped to a target. Default.
      --no-orphan-urls                    Drop unmapped log URLs.
      --redact-logs                       Redact secrets from scanned logs. Default.
      --no-redact-logs                    Do not redact scanned logs before URL extraction.
      --max-log-files <number>            Maximum log files to scan. Default: 500.
      --max-urls-per-log <number>         Maximum URLs kept per log file. Default: 25.
      --fail-if-empty                     Exit non-zero if no deployments are discovered.
      --fail-on-failed                    Exit non-zero if any discovered deployment failed.
      --fail-on-blocked                   Exit non-zero if any discovered deployment was blocked.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Do not write files.
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

function readJsonInput(filePath, repoRoot, key) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {
      key,
      file: relativePath,
      available: false,
      data: null,
      error: "",
    };
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const data = safeJsonParse(raw, null);

  if (!data) {
    return {
      key,
      file: relativePath,
      available: true,
      data: null,
      error: "Input file is not valid JSON.",
    };
  }

  return {
    key,
    file: relativePath,
    available: true,
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

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function cleanUrl(url) {
  return String(url || "")
    .replace(/[),.;]+$/g, "")
    .replace(/\\n.*$/g, "")
    .trim();
}

function extractUrls(...values) {
  const urls = [];

  for (const value of values.flat()) {
    const matches = String(value || "").match(URL_PATTERN) || [];
    urls.push(...matches.map(cleanUrl));
  }

  return [...new Set(urls.filter(Boolean))];
}

function normalizeStatus(value, fallback = "unknown") {
  const status = normalizeString(value, fallback).toLowerCase();

  if (["deployed", "passed", "success", "ok", "done"].includes(status)) {
    return "deployed";
  }

  if (["failed", "failure", "error"].includes(status)) return "failed";
  if (["blocked", "cancelled", "canceled"].includes(status)) return "blocked";
  if (["planned", "skipped", "dry-run", "dry_run"].includes(status)) {
    return "planned";
  }

  if (["empty", "none"].includes(status)) return "empty";
  if (["not-deployed", "not_deployed"].includes(status)) return "not-deployed";

  return status;
}

function safeId(value) {
  return (
    normalizeString(value, "cloudflare-deployment")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-deployment"
  );
}

function deploymentKey(environment, type, name, root) {
  return safeId(
    `${environment || "unknown"}:${type || "unknown"}:${name || "target"}:${root || "."}`,
  );
}

function normalizeDeploymentType(record = {}, report = {}) {
  const raw = normalizeString(
    record.type ||
      record.primary_type ||
      record.target_type ||
      report.config?.type ||
      report.target_type ||
      "unknown",
  ).toLowerCase();

  if (raw === "pages" || raw === "page" || raw.includes("pages")) {
    return "pages";
  }

  if (
    raw === "worker" ||
    raw === "workers" ||
    raw === "service-worker" ||
    raw.includes("worker")
  ) {
    return "worker";
  }

  return raw || "unknown";
}

function shouldIncludeDeployment(deployment, args) {
  if (
    args.environments.length &&
    !args.environments.includes(deployment.environment)
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

  if (
    args.include_types.length &&
    !args.include_types.includes(deployment.type)
  ) {
    return false;
  }

  if (args.exclude_types.includes(deployment.type)) return false;

  return true;
}

function walkFiles(targetPath, repoRoot, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(path.join(absolutePath, entry.name), repoRoot, files);
  }

  return files;
}

function walkRepoFiles(startDir, repoRoot, files = []) {
  const absolutePath = path.resolve(startDir);

  if (!fs.existsSync(absolutePath)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory() && AUTO_DISCOVERY_IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    walkRepoFiles(path.join(absolutePath, entry.name), repoRoot, files);
  }

  return files;
}

function jsonFilesFromDirs(inputDirs, repoRoot) {
  return [
    ...new Set(
      inputDirs
        .flatMap((inputDir) => walkFiles(inputDir, repoRoot))
        .filter(isFile)
        .filter((file) => path.extname(file).toLowerCase() === ".json")
        .map((file) => toRelativePath(file, repoRoot)),
    ),
  ];
}

function inputFiles(args, repoRoot) {
  const base = [
    {
      key: "preview",
      file: args.preview_file,
    },
    {
      key: "staging",
      file: args.staging_file,
    },
    {
      key: "production",
      file: args.production_file,
    },
  ];

  const extraFiles = [
    ...args.input_files,
    ...jsonFilesFromDirs(args.input_dirs, repoRoot),
  ].map((file, index) => ({
    key: `extra-${index + 1}`,
    file,
  }));

  return [...base, ...extraFiles];
}

function stripJsonComments(value) {
  return String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function parseJsonLike(raw) {
  return safeJsonParse(stripJsonComments(raw), null);
}

function parseScalarConfigValue(raw, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*=\\s*["']([^"']+)["']`, "i"),
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*["']?([^"'\\n#]+)["']?`, "i"),
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);

    if (match?.[1]) return normalizeString(match[1]);
  }

  return "";
}

function readPackageJsonAt(dirPath) {
  const packageJsonPath = path.join(dirPath, "package.json");

  if (!isFile(packageJsonPath)) return null;

  return safeJsonParse(fs.readFileSync(packageJsonPath, "utf8"), null);
}

function findNearestPackageJson(startDir, repoRoot) {
  let current = path.resolve(startDir);
  const root = path.resolve(repoRoot);

  while (current.startsWith(root)) {
    const packageJson = readPackageJsonAt(current);

    if (packageJson) {
      return {
        dir: current,
        package_json: packageJson,
        file: toRelativePath(path.join(current, "package.json"), repoRoot),
      };
    }

    if (current === root) break;
    current = path.dirname(current);
  }

  return null;
}

function getParsedValue(parsed, ...keys) {
  let current = parsed;

  for (const key of keys) {
    if (!current || typeof current !== "object") return "";
    current = current[key];
  }

  if (current === undefined || current === null) return "";
  if (typeof current === "string") return normalizeString(current);
  return "";
}

function countConfigResources(raw, parsed, jsonPath, fallbackKey) {
  const pathParts = jsonPath.split(".");
  let current = parsed;

  for (const part of pathParts) {
    if (!current || typeof current !== "object") {
      current = null;
      break;
    }

    current = current[part];
  }

  if (Array.isArray(current)) return current.length;
  if (current && typeof current === "object")
    return Object.keys(current).length;

  const key = fallbackKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = raw.match(new RegExp(`\\[\\[?${key}\\]?\\]`, "gi"));

  return sectionMatch ? sectionMatch.length : 0;
}

function parseWranglerConfig(configFile, repoRoot) {
  const absolutePath = resolvePath(configFile, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const extension = path.extname(absolutePath).toLowerCase();
  const configDir = path.dirname(absolutePath);
  const parsed = [".json", ".jsonc"].includes(extension)
    ? parseJsonLike(raw)
    : null;

  const name = normalizeString(
    getParsedValue(parsed, "name") || parseScalarConfigValue(raw, "name"),
  );
  const main = toPosixPath(
    getParsedValue(parsed, "main") || parseScalarConfigValue(raw, "main"),
  );
  const pagesBuildOutputDir = toPosixPath(
    getParsedValue(parsed, "pages_build_output_dir") ||
      getParsedValue(parsed, "site", "bucket") ||
      getParsedValue(parsed, "assets", "directory") ||
      parseScalarConfigValue(raw, "pages_build_output_dir"),
  );
  const compatibilityDate = normalizeString(
    getParsedValue(parsed, "compatibility_date") ||
      parseScalarConfigValue(raw, "compatibility_date"),
  );
  const envMatches = [...raw.matchAll(/\[env\.([A-Za-z0-9_-]+)\]/g)].map(
    (match) => match[1].toLowerCase(),
  );
  const parsedEnvs =
    parsed?.env && typeof parsed.env === "object"
      ? Object.keys(parsed.env).map((item) => item.toLowerCase())
      : [];
  const environments = [...new Set([...envMatches, ...parsedEnvs])];
  const root = toRelativePath(configDir, repoRoot);
  const packageInfo = findNearestPackageJson(configDir, repoRoot);
  const hasPagesOutput = Boolean(pagesBuildOutputDir);
  const hasWorkerMain = Boolean(main);
  const type = hasPagesOutput && !hasWorkerMain ? "pages" : "worker";

  return {
    id: safeId(`${type}-${name || path.basename(configDir)}-${root}`),
    name,
    type,
    primary_type: type,
    target_types: [type],
    root,
    config_file: relativePath,
    package_json: packageInfo?.file || null,
    package_name: packageInfo?.package_json?.name || null,
    package_manager_command: "",
    environments,
    main,
    pages_build_output_dir: pagesBuildOutputDir,
    compatibility_date: compatibilityDate,
    affected: true,
    resource_counts: {
      d1_databases: countConfigResources(
        raw,
        parsed,
        "d1_databases",
        "d1_databases",
      ),
      kv_namespaces: countConfigResources(
        raw,
        parsed,
        "kv_namespaces",
        "kv_namespaces",
      ),
      r2_buckets: countConfigResources(raw, parsed, "r2_buckets", "r2_buckets"),
      queue_producers: countConfigResources(
        raw,
        parsed,
        "queues.producers",
        "producers",
      ),
      queue_consumers: countConfigResources(
        raw,
        parsed,
        "queues.consumers",
        "consumers",
      ),
      durable_objects: countConfigResources(
        raw,
        parsed,
        "durable_objects.bindings",
        "bindings",
      ),
    },
    auto_discovered: true,
    discovery_reason: `Wrangler config found at ${relativePath}.`,
  };
}

function packageScriptsContain(packageJson, needles) {
  const scripts = packageJson?.scripts || {};
  const values = Object.values(scripts).map(String).join("\n").toLowerCase();

  return needles.some((needle) => values.includes(needle));
}

function inferPagesOutputDir(repoRoot) {
  for (const candidate of COMMON_PAGES_OUTPUT_DIRS) {
    if (fs.existsSync(resolvePath(candidate, repoRoot))) return candidate;
  }

  for (const appDir of COMMON_PAGES_APP_DIRS) {
    if (isDirectory(resolvePath(appDir, repoRoot))) {
      const name = path.basename(appDir);
      return `dist/apps/${name}`;
    }
  }

  return "dist";
}

function finalizeAutoTarget(target, args, repoRoot) {
  const stage = args.deployment_stage || args.environments[0] || "production";
  const environments = target.environments?.length
    ? target.environments
    : ["preview", "staging", "production"];
  const type = normalizeDeploymentType(target, { target_type: target.type });
  const name = normalizeString(
    target.name ||
      args.project_name ||
      target.package_name ||
      "cloudflare-target",
  ).replace(/^@[^/]+\//, "");
  const root = toPosixPath(target.root || ".");

  return {
    ...target,
    id: target.id || deploymentKey(stage, type, name, root),
    name,
    type,
    primary_type: type,
    target_types: Array.isArray(target.target_types)
      ? target.target_types
      : [type],
    root,
    config_file: toPosixPath(target.config_file || ""),
    pages_build_output_dir: toPosixPath(target.pages_build_output_dir || ""),
    environments,
    has_config_environment: environments.includes(stage),
    affected: target.affected !== false,
    auto_discovered: true,
    exists: {
      root: isDirectory(resolvePath(root, repoRoot)),
      config_file: target.config_file
        ? isFile(resolvePath(target.config_file, repoRoot))
        : false,
      pages_build_output_dir: target.pages_build_output_dir
        ? isDirectory(resolvePath(target.pages_build_output_dir, repoRoot)) ||
          isDirectory(
            resolvePath(
              path.join(root, target.pages_build_output_dir),
              repoRoot,
            ),
          )
        : false,
    },
  };
}

function discoverWranglerTargets(repoRoot, args) {
  const files = walkRepoFiles(repoRoot, repoRoot)
    .filter(isFile)
    .filter((file) => WRANGLER_CONFIG_NAMES.has(path.basename(file)))
    .map((file) => toRelativePath(file, repoRoot));

  return files
    .map((file) => parseWranglerConfig(file, repoRoot))
    .map((target) => finalizeAutoTarget(target, args, repoRoot));
}

function discoverPackageScriptWorkerTargets(repoRoot, args, existingTargets) {
  const files = walkRepoFiles(repoRoot, repoRoot)
    .filter(isFile)
    .filter((file) => path.basename(file) === "package.json")
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
  const targets = [];

  for (const file of files) {
    const packageJson = safeJsonParse(fs.readFileSync(file, "utf8"), null);

    if (!packageScriptsContain(packageJson, ["wrangler deploy"])) continue;

    const root = toRelativePath(path.dirname(file), repoRoot);
    const alreadyKnown = existingTargets.some((target) => target.root === root);

    if (alreadyKnown) continue;

    const name = normalizeString(
      packageJson?.name ||
        args.project_name ||
        path.basename(path.dirname(file)),
    ).replace(/^@[^/]+\//, "");

    targets.push(
      finalizeAutoTarget(
        {
          id: safeId(`worker-${name}-${root}`),
          name,
          type: "worker",
          primary_type: "worker",
          target_types: ["worker"],
          root,
          config_file: "",
          package_json: toRelativePath(file, repoRoot),
          package_name: packageJson?.name || null,
          package_manager_command: "",
          environments: [],
          main: "",
          pages_build_output_dir: "",
          compatibility_date: "",
          affected: true,
          resource_counts: emptyResourceCounts(),
          auto_discovered: true,
          discovery_reason: `Worker target inferred from wrangler deploy script in ${toRelativePath(file, repoRoot)}.`,
        },
        args,
        repoRoot,
      ),
    );
  }

  return targets;
}

function discoverFallbackPagesTarget(repoRoot, args, existingTargets) {
  if (existingTargets.some((target) => target.type === "pages")) return [];
  if (!args.project_name) return [];

  const rootPackage = readPackageJsonAt(repoRoot);
  const hasLikelyPagesApp = COMMON_PAGES_APP_DIRS.some((dir) =>
    isDirectory(resolvePath(dir, repoRoot)),
  );
  const hasLikelyBuild = packageScriptsContain(rootPackage, [
    "next build",
    "vite build",
    "astro build",
    "remix",
    "nx build",
    "wrangler pages",
    "pages deploy",
  ]);

  if (!hasLikelyPagesApp && !hasLikelyBuild) return [];

  const outputDir = inferPagesOutputDir(repoRoot);

  return [
    finalizeAutoTarget(
      {
        id: safeId(`pages-${args.project_name}`),
        name: args.project_name,
        type: "pages",
        primary_type: "pages",
        target_types: ["pages"],
        root: ".",
        config_file: "",
        package_json: isFile(resolvePath("package.json", repoRoot))
          ? "package.json"
          : null,
        package_name: rootPackage?.name || null,
        package_manager_command: "",
        environments: [],
        main: "",
        pages_build_output_dir: outputDir,
        compatibility_date: "",
        affected: true,
        resource_counts: emptyResourceCounts(),
        auto_discovered: true,
        discovery_reason:
          "Fallback Pages target inferred from repository structure and CLOUDFLARE_PROJECT_NAME.",
      },
      args,
      repoRoot,
    ),
  ];
}

function emptyResourceCounts() {
  return {
    d1_databases: 0,
    kv_namespaces: 0,
    r2_buckets: 0,
    queue_producers: 0,
    queue_consumers: 0,
    durable_objects: 0,
  };
}

function dedupeTargets(targets) {
  const seen = new Map();

  for (const target of targets) {
    const key = safeId(
      `${target.type}:${target.name}:${target.root}:${target.config_file || target.pages_build_output_dir}`,
    );

    if (!seen.has(key)) {
      seen.set(key, target);
    }
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.type.localeCompare(right.type) ||
      left.name.localeCompare(right.name) ||
      left.root.localeCompare(right.root)
    );
  });
}

function createDeploymentMatrixFromTargets(targets, environments, args) {
  const matrix = [];

  for (const target of targets) {
    for (const environment of environments) {
      if (
        Array.isArray(target.environments) &&
        target.environments.length &&
        !target.environments.includes(environment)
      ) {
        continue;
      }

      matrix.push({
        id: target.id,
        name: target.name,
        type: target.type,
        primary_type: target.primary_type || target.type,
        target_types: target.target_types || [target.type],
        root: target.root,
        config_file: target.config_file || "",
        package_json: target.package_json || null,
        package_name: target.package_name || null,
        package_manager_command: target.package_manager_command || "",
        environment,
        stage: args.deployment_stage || environment,
        wrangler_environment:
          target.type === "worker" && target.environments?.includes(environment)
            ? environment
            : "",
        has_config_environment:
          target.type === "worker" &&
          target.environments?.includes(environment),
        affected: true,
        main: target.main || "",
        pages_build_output_dir: target.pages_build_output_dir || "",
        compatibility_date: target.compatibility_date || "",
        d1_databases: Number(target.resource_counts?.d1_databases || 0),
        kv_namespaces: Number(target.resource_counts?.kv_namespaces || 0),
        r2_buckets: Number(target.resource_counts?.r2_buckets || 0),
        queue_producers: Number(target.resource_counts?.queue_producers || 0),
        queue_consumers: Number(target.resource_counts?.queue_consumers || 0),
        durable_objects: Number(target.resource_counts?.durable_objects || 0),
        auto_discovered: true,
        discovery_reason:
          target.discovery_reason ||
          "Automatically discovered from repository.",
      });
    }
  }

  return matrix;
}

function discoverAutomaticTargets(args, repoRoot) {
  if (!args.auto_discover_targets) {
    return {
      enabled: false,
      targets: [],
      deployment_matrix: [],
      warnings: [],
    };
  }

  const warnings = [];
  const wranglerTargets = discoverWranglerTargets(repoRoot, args);
  const packageWorkerTargets = discoverPackageScriptWorkerTargets(
    repoRoot,
    args,
    wranglerTargets,
  );
  const fallbackPagesTargets = discoverFallbackPagesTarget(repoRoot, args, [
    ...wranglerTargets,
    ...packageWorkerTargets,
  ]);
  const targets = dedupeTargets([
    ...wranglerTargets,
    ...packageWorkerTargets,
    ...fallbackPagesTargets,
  ]);
  const environments = args.environments.length
    ? args.environments
    : args.deployment_stage
      ? [args.deployment_stage]
      : ["preview", "staging", "production"];
  const deploymentMatrix = createDeploymentMatrixFromTargets(
    targets,
    environments,
    args,
  );

  if (!targets.length) {
    warnings.push({
      level: "warning",
      source: "auto-discovery",
      message:
        "No Cloudflare Pages or Worker targets were automatically discovered from Wrangler configs, package scripts, or repository structure.",
      file: ".",
    });
  }

  return {
    enabled: true,
    targets,
    deployment_matrix: deploymentMatrix,
    warnings,
  };
}

function dedupeDeploymentMatrix(items) {
  const seen = new Map();

  for (const item of items) {
    const key = safeId(
      `${item.environment}:${item.type}:${item.name}:${item.root}:${item.config_file || item.pages_build_output_dir}`,
    );

    if (!seen.has(key)) seen.set(key, item);
  }

  return [...seen.values()].sort((left, right) => {
    return (
      String(left.environment || "").localeCompare(
        String(right.environment || ""),
      ) ||
      String(left.type || "").localeCompare(String(right.type || "")) ||
      String(left.name || "").localeCompare(String(right.name || "")) ||
      String(left.root || "").localeCompare(String(right.root || ""))
    );
  });
}

function mergeTargetsData(existingData, automatic, args) {
  const existingTargets = Array.isArray(existingData?.targets)
    ? existingData.targets
    : [];
  const existingMatrix = Array.isArray(existingData?.deployment_matrix)
    ? existingData.deployment_matrix
    : [];
  const targets = dedupeTargets([...existingTargets, ...automatic.targets]);
  const matrix = dedupeDeploymentMatrix([
    ...existingMatrix,
    ...automatic.deployment_matrix,
  ]);

  return {
    schema_version: 1,
    type: "cloudflare-targets",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    source: existingData ? "merged" : "auto-discovery",
    auto_discovery_enabled: args.auto_discover_targets,
    targets,
    deployment_matrix: matrix,
    totals: {
      targets: targets.length,
      deployment_matrix: matrix.length,
      pages: targets.filter((target) => target.type === "pages").length,
      workers: targets.filter((target) => target.type === "worker").length,
      auto_discovered: targets.filter((target) => target.auto_discovered)
        .length,
    },
    status: targets.length ? "detected" : "empty",
  };
}

function createTargetsInput(existingInput, automatic, args) {
  const mergedData = mergeTargetsData(existingInput.data, automatic, args);

  return {
    ...existingInput,
    available: Boolean(existingInput.available || mergedData.targets.length),
    data: mergedData,
    error: existingInput.error || "",
    generated: !existingInput.available && mergedData.targets.length > 0,
  };
}

function writeGeneratedTargetsFile(targetsInput, args, repoRoot) {
  if (!args.write_targets_file || !targetsInput.data) return null;
  if (!targetsInput.data.targets?.length) return null;

  const targetsFile = resolvePath(args.targets_file, repoRoot);

  writeTextFile(
    targetsFile,
    `${JSON.stringify(targetsInput.data, null, 2)}\n`,
    {
      dry_run: args.dry_run,
    },
  );

  return toRelativePath(targetsFile, repoRoot);
}

function environmentFromReportType(type) {
  const value = normalizeString(type).toLowerCase();

  if (value.includes("preview")) return "preview";
  if (value.includes("staging")) return "staging";
  if (value.includes("production")) return "production";

  return "unknown";
}

function environmentFromFile(filePath) {
  const value = normalizeString(filePath).toLowerCase();

  if (value.includes("preview")) return "preview";
  if (value.includes("staging")) return "staging";
  if (value.includes("production")) return "production";

  return "unknown";
}

function extractDeploymentRecords(report) {
  if (!report || typeof report !== "object") return [];

  if (Array.isArray(report.deployments)) return report.deployments;
  if (Array.isArray(report.deployment_results))
    return report.deployment_results;
  if (Array.isArray(report.deployment_matrix)) return report.deployment_matrix;
  if (Array.isArray(report.targets)) return report.targets;
  if (Array.isArray(report.results)) {
    const deployResults = report.results.filter(
      (result) =>
        result.kind === "deploy" ||
        result.kind === "deployment" ||
        result.target_name ||
        result.target_id ||
        extractUrls(
          result.urls || "",
          result.stdout_preview || "",
          result.stderr_preview || "",
        ).length,
    );

    if (deployResults.length) return deployResults;
  }

  if (report.deployment && typeof report.deployment === "object") {
    return [report.deployment];
  }

  if (
    report.name ||
    report.target_name ||
    report.target_id ||
    report.url ||
    report.urls ||
    report.status
  ) {
    return [report];
  }

  return [];
}

function normalizeReportDeployment(record, report, sourceFile, args) {
  const environment = normalizeString(
    record.environment ||
      record.stage ||
      record.deployment_stage ||
      report.config?.environment ||
      report.config?.stage ||
      args.deployment_stage ||
      environmentFromReportType(report.type) ||
      environmentFromFile(sourceFile),
    "unknown",
  ).toLowerCase();

  const type = normalizeDeploymentType(record, report);
  const name = normalizeString(
    record.name ||
      record.target_name ||
      record.project_name ||
      report.config?.project_name ||
      args.project_name ||
      "cloudflare-target",
  );
  const root = toPosixPath(record.root || record.project_root || ".");
  const targetId = normalizeString(record.id || record.target_id || "");
  const urls = extractUrls(
    ...(Array.isArray(record.urls) ? record.urls : []),
    record.url || "",
    record.primary_url || "",
    record.deployment_url || "",
    record.stdout_preview || "",
    record.stderr_preview || "",
    report.url || "",
    ...(Array.isArray(report.urls) ? report.urls : []),
  );

  const reportStatus = normalizeStatus(report.status);
  const recordStatus = normalizeStatus(
    record.status || record.conclusion,
    reportStatus,
  );
  const failed =
    record.success === false ||
    record.ok === false ||
    recordStatus === "failed" ||
    reportStatus === "failed";
  const blocked =
    recordStatus === "blocked" ||
    reportStatus === "blocked" ||
    report.blocked === true;
  const planned =
    recordStatus === "planned" ||
    reportStatus === "planned" ||
    report.config?.dry_run === true ||
    args.dry_run === true;
  const deployed =
    !failed &&
    !blocked &&
    !planned &&
    (record.success === true || record.ok === true || urls.length > 0);
  const status = blocked
    ? "blocked"
    : failed
      ? "failed"
      : deployed
        ? "deployed"
        : planned
          ? "planned"
          : recordStatus;

  return {
    id: targetId || deploymentKey(environment, type, name, root),
    key: deploymentKey(environment, type, name, root),
    source: record.auto_discovered ? "auto-discovery" : "deployment-report",
    source_file: sourceFile,
    report_type: report.type || "unknown",
    report_status: reportStatus,
    environment,
    stage: normalizeString(
      record.stage || args.deployment_stage || environment,
    ),
    alias: normalizeString(record.alias || args.alias),
    preview_ref: normalizeString(record.preview_ref || args.preview_ref),
    pull_request_number: normalizeString(
      record.pull_request_number || args.pull_request_number,
    ),
    branch: normalizeString(
      record.branch ||
        report.config?.branch ||
        report.github?.branch ||
        args.preview_ref ||
        "",
    ),
    commit: normalizeString(record.commit || report.github?.sha || ""),
    short_commit: normalizeString(
      record.short_commit || report.github?.short_sha || "",
    ),
    workflow: normalizeString(report.github?.workflow || ""),
    run_id: normalizeString(report.github?.run_id || ""),
    name,
    type,
    root,
    config_file: toPosixPath(
      record.config_file || report.config?.config_file || "",
    ),
    target_id: targetId,
    target_types: Array.isArray(record.target_types)
      ? record.target_types.map(String)
      : [type],
    affected: record.affected !== false,
    pages_build_output_dir: toPosixPath(
      record.pages_build_output_dir ||
        report.config?.pages_build_output_dir ||
        "",
    ),
    wrangler_environment: normalizeString(
      record.wrangler_environment || report.config?.wrangler_environment || "",
    ),
    has_config_environment: Boolean(record.has_config_environment),
    resource_counts: record.resource_counts || {
      d1_databases: Number(record.d1_databases || 0),
      kv_namespaces: Number(record.kv_namespaces || 0),
      r2_buckets: Number(record.r2_buckets || 0),
      queue_producers: Number(record.queue_producers || 0),
      queue_consumers: Number(record.queue_consumers || 0),
      durable_objects: Number(record.durable_objects || 0),
    },
    status,
    deployed,
    blocked,
    failed,
    planned,
    urls,
    primary_url: urls[0] || "",
    commands: [],
    build_results: [],
    deploy_results: [],
    validation: null,
    skipped_reason: normalizeString(
      record.skipped_reason || record.reason || "",
    ),
    notes: record.discovery_reason ? [record.discovery_reason] : [],
  };
}

function resultBelongsToDeployment(result, deployment, reportDeploymentCount) {
  if (!result) return false;
  if (result.target_id && deployment.id && result.target_id === deployment.id) {
    return true;
  }
  if (
    result.target_id &&
    deployment.target_id &&
    result.target_id === deployment.target_id
  ) {
    return true;
  }
  if (
    result.target_name &&
    deployment.name &&
    result.target_name === deployment.name
  ) {
    return true;
  }
  if (reportDeploymentCount === 1) return true;

  return false;
}

function attachReportEvidence(deployment, report) {
  const reportResults = Array.isArray(report.results) ? report.results : [];
  const reportDeployments = Array.isArray(report.deployments)
    ? report.deployments
    : [];
  const matchingResults = reportResults.filter((result) =>
    resultBelongsToDeployment(result, deployment, reportDeployments.length),
  );
  const buildResults = matchingResults.filter(
    (result) => result.kind === "build",
  );
  const deployResults = matchingResults.filter((result) =>
    ["deploy", "deployment"].includes(result.kind),
  );
  const skippedTarget = (report.skipped_targets || []).find((item) => {
    return (
      item.target_id === deployment.id || item.target_name === deployment.name
    );
  });
  const validation = (report.validations || []).find((item) => {
    return (
      item.target_id === deployment.id || item.target_name === deployment.name
    );
  });
  const urls = extractUrls(
    ...deployResults.map((result) => (result.urls || []).join("\n")),
    ...deployResults.map((result) => result.stdout_preview || ""),
    ...deployResults.map((result) => result.stderr_preview || ""),
  );
  const hasFailure = matchingResults.some(
    (result) => result.status === "failed" || result.success === false,
  );
  const hasDeploySuccess = deployResults.some(
    (result) => result.status === "passed" || result.success === true,
  );

  deployment.commands = matchingResults.map((result) => ({
    id: result.id || "",
    kind: result.kind || "",
    status: normalizeStatus(result.status, "unknown"),
    success: Boolean(result.success),
    display: result.display || "",
    stdout_log: result.stdout_log || null,
    stderr_log: result.stderr_log || null,
    duration_ms: Number(result.duration_ms || 0),
    urls: Array.isArray(result.urls)
      ? result.urls.map(cleanUrl).filter(Boolean)
      : [],
  }));
  deployment.build_results = buildResults.map(
    (result) => result.id || result.display || result.status || "build",
  );
  deployment.deploy_results = deployResults.map(
    (result) => result.id || result.display || result.status || "deploy",
  );
  deployment.validation = validation || null;
  deployment.skipped_reason =
    skippedTarget?.reason || deployment.skipped_reason || "";
  deployment.urls = [...new Set([...deployment.urls, ...urls])];
  deployment.primary_url = deployment.primary_url || deployment.urls[0] || "";

  if (hasFailure) {
    deployment.failed = true;
    deployment.status = "failed";
  }

  if (
    hasDeploySuccess &&
    !deployment.failed &&
    !deployment.blocked &&
    !deployment.planned
  ) {
    deployment.deployed = true;
    deployment.status = "deployed";
  }

  if (deployment.skipped_reason) {
    deployment.status =
      deployment.status === "unknown" ? "skipped" : deployment.status;
    deployment.notes.push(deployment.skipped_reason);
  }

  return deployment;
}

function deploymentsFromReportInput(input, args) {
  const report = input.data;

  if (!report) return [];

  const records = extractDeploymentRecords(report);

  return records
    .map((record) =>
      normalizeReportDeployment(record, report, input.file, args),
    )
    .map((deployment) => attachReportEvidence(deployment, report))
    .filter((deployment) => shouldIncludeDeployment(deployment, args));
}

function deploymentsFromTargetsInput(input, args) {
  const data = input.data;

  if (
    !data ||
    (!args.include_undeployed_targets && !data.auto_discovery_enabled)
  ) {
    return [];
  }

  const targets = Array.isArray(data.targets) ? data.targets : [];
  const matrix = Array.isArray(data.deployment_matrix)
    ? data.deployment_matrix
    : [];
  const environments = args.environments.length
    ? args.environments
    : args.deployment_stage
      ? [args.deployment_stage]
      : ["preview", "staging", "production"];
  const deployments = [];

  if (matrix.length) {
    for (const item of matrix) {
      const type = normalizeDeploymentType(item, data);
      const name = normalizeString(
        item.name || args.project_name || "cloudflare-target",
      );
      const environment = normalizeString(
        item.environment ||
          item.stage ||
          args.deployment_stage ||
          environments[0] ||
          "unknown",
      ).toLowerCase();
      const root = toPosixPath(item.root || ".");
      const deployment = {
        id: normalizeString(
          item.id || deploymentKey(environment, type, name, root),
        ),
        key: deploymentKey(environment, type, name, root),
        source: item.auto_discovered ? "auto-discovery" : "target-detector",
        source_file: input.file,
        report_type: data.type || "cloudflare-targets",
        report_status: normalizeStatus(data.status || "detected"),
        environment,
        stage: item.stage || args.deployment_stage || environment,
        alias: args.alias,
        preview_ref: args.preview_ref,
        pull_request_number: args.pull_request_number,
        branch: "",
        commit: "",
        short_commit: "",
        workflow: "",
        run_id: "",
        name,
        type,
        root,
        config_file: toPosixPath(item.config_file || ""),
        target_id: normalizeString(item.id || ""),
        target_types: Array.isArray(item.target_types)
          ? item.target_types.map(String)
          : [type],
        affected: item.affected !== false,
        pages_build_output_dir: toPosixPath(item.pages_build_output_dir || ""),
        wrangler_environment: normalizeString(item.wrangler_environment || ""),
        has_config_environment: Boolean(item.has_config_environment),
        resource_counts: {
          d1_databases: Number(item.d1_databases || 0),
          kv_namespaces: Number(item.kv_namespaces || 0),
          r2_buckets: Number(item.r2_buckets || 0),
          queue_producers: Number(item.queue_producers || 0),
          queue_consumers: Number(item.queue_consumers || 0),
          durable_objects: Number(item.durable_objects || 0),
        },
        status: "not-deployed",
        deployed: false,
        blocked: false,
        failed: false,
        planned: false,
        urls: [],
        primary_url: "",
        commands: [],
        build_results: [],
        deploy_results: [],
        validation: null,
        skipped_reason: "No deployment report was found for this target.",
        notes: [
          item.discovery_reason || "Included from Cloudflare target discovery.",
        ],
      };

      if (shouldIncludeDeployment(deployment, args))
        deployments.push(deployment);
    }

    return deployments;
  }

  for (const target of targets) {
    const type = normalizeDeploymentType(target, data);
    const targetEnvironments = target.environments?.length
      ? target.environments
      : environments;

    for (const environment of targetEnvironments) {
      const deployment = {
        id: normalizeString(
          target.id ||
            deploymentKey(environment, type, target.name, target.root),
        ),
        key: deploymentKey(environment, type, target.name, target.root),
        source: target.auto_discovered ? "auto-discovery" : "target-detector",
        source_file: input.file,
        report_type: data.type || "cloudflare-targets",
        report_status: normalizeStatus(data.status || "detected"),
        environment,
        stage: args.deployment_stage || environment,
        alias: args.alias,
        preview_ref: args.preview_ref,
        pull_request_number: args.pull_request_number,
        branch: "",
        commit: "",
        short_commit: "",
        workflow: "",
        run_id: "",
        name: target.name,
        type,
        root: toPosixPath(target.root || "."),
        config_file: toPosixPath(target.config_file || ""),
        target_id: normalizeString(target.id || ""),
        target_types: Array.isArray(target.target_types)
          ? target.target_types.map(String)
          : [type],
        affected: target.affected !== false,
        pages_build_output_dir: toPosixPath(
          target.pages_build_output_dir || "",
        ),
        wrangler_environment: "",
        has_config_environment: false,
        resource_counts: target.resource_counts || emptyResourceCounts(),
        status: "not-deployed",
        deployed: false,
        blocked: false,
        failed: false,
        planned: false,
        urls: [],
        primary_url: "",
        commands: [],
        build_results: [],
        deploy_results: [],
        validation: null,
        skipped_reason: "No deployment report was found for this target.",
        notes: [
          target.discovery_reason ||
            "Included from Cloudflare target discovery.",
        ],
      };

      if (shouldIncludeDeployment(deployment, args))
        deployments.push(deployment);
    }
  }

  return deployments;
}

function mergeDeployment(left, right) {
  const preferred =
    left.source === "deployment-report" || right.source !== "deployment-report"
      ? left
      : right;
  const secondary = preferred === left ? right : left;
  const urls = [...new Set([...(left.urls || []), ...(right.urls || [])])];
  const commands = [...(left.commands || []), ...(right.commands || [])];
  const notes = [...new Set([...(left.notes || []), ...(right.notes || [])])];

  return {
    ...secondary,
    ...preferred,
    id: preferred.id || secondary.id,
    urls,
    primary_url:
      preferred.primary_url || secondary.primary_url || urls[0] || "",
    commands,
    build_results: [
      ...new Set([
        ...(left.build_results || []),
        ...(right.build_results || []),
      ]),
    ],
    deploy_results: [
      ...new Set([
        ...(left.deploy_results || []),
        ...(right.deploy_results || []),
      ]),
    ],
    notes,
    failed: left.failed || right.failed,
    blocked: left.blocked || right.blocked,
    planned: left.planned || right.planned,
    deployed: left.deployed || right.deployed,
    status:
      left.failed || right.failed
        ? "failed"
        : left.blocked || right.blocked
          ? "blocked"
          : left.deployed || right.deployed
            ? "deployed"
            : preferred.status || secondary.status,
    source:
      left.source === "deployment-report" ||
      right.source === "deployment-report"
        ? "deployment-report"
        : preferred.source,
  };
}

function dedupeDeployments(deployments) {
  const seen = new Map();

  for (const deployment of deployments) {
    const key =
      deployment.key ||
      deploymentKey(
        deployment.environment,
        deployment.type,
        deployment.name,
        deployment.root,
      );

    if (!seen.has(key)) {
      seen.set(key, deployment);
      continue;
    }

    seen.set(key, mergeDeployment(seen.get(key), deployment));
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.environment.localeCompare(right.environment) ||
      left.type.localeCompare(right.type) ||
      left.name.localeCompare(right.name) ||
      left.root.localeCompare(right.root)
    );
  });
}

function isLogFile(filePath) {
  return /\.(log|txt|md)$/i.test(path.basename(filePath));
}

function scanDeploymentLogs(args, repoRoot) {
  if (!args.scan_logs) return [];

  const files = [];

  for (const root of args.log_roots) {
    files.push(...walkFiles(root, repoRoot));
  }

  return [...new Set(files)]
    .filter(isFile)
    .filter(isLogFile)
    .slice(0, args.max_log_files > 0 ? args.max_log_files : undefined)
    .map((filePath) => {
      const relativePath = toRelativePath(filePath, repoRoot);
      const raw = fs.readFileSync(filePath, "utf8");
      const text = args.redact_logs ? redactOutput(raw) : raw;
      const urls = extractUrls(text).slice(
        0,
        args.max_urls_per_log > 0 ? args.max_urls_per_log : undefined,
      );

      return {
        file: relativePath,
        urls,
      };
    })
    .filter((record) => record.urls.length > 0);
}

function dedupeOrphanUrls(orphanUrls) {
  const seen = new Map();

  for (const item of orphanUrls) {
    if (!seen.has(item.url)) {
      seen.set(item.url, item);
    }
  }

  return [...seen.values()].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
}

function attachLogUrls(deployments, logUrlRecords, args) {
  const deploymentsByToken = new Map();

  for (const deployment of deployments) {
    const tokens = [
      deployment.id,
      deployment.target_id,
      deployment.name,
      deployment.alias,
      deployment.preview_ref,
    ]
      .map((token) => safeId(token))
      .filter(Boolean);

    for (const token of tokens) {
      deploymentsByToken.set(token, deployment);
    }
  }

  const orphanUrls = [];

  for (const record of logUrlRecords) {
    const safeFile = safeId(record.file);
    const matchedDeployment = [...deploymentsByToken.entries()].find(
      ([token]) => token && safeFile.includes(token),
    )?.[1];

    if (matchedDeployment) {
      matchedDeployment.urls = [
        ...new Set([...(matchedDeployment.urls || []), ...record.urls]),
      ];
      matchedDeployment.primary_url =
        matchedDeployment.primary_url || matchedDeployment.urls[0] || "";
      matchedDeployment.notes.push(`URLs also discovered in ${record.file}.`);
      continue;
    }

    orphanUrls.push(
      ...record.urls.map((url) => ({
        url,
        file: record.file,
      })),
    );
  }

  return {
    deployments,
    orphan_urls: args.include_orphan_urls ? dedupeOrphanUrls(orphanUrls) : [],
  };
}

function groupDeployments(deployments, key) {
  const groups = {};

  for (const deployment of deployments) {
    const group = deployment[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        deployed: 0,
        failed: 0,
        blocked: 0,
        planned: 0,
        with_urls: 0,
        targets: [],
      };
    }

    groups[group].count += 1;
    if (deployment.deployed) groups[group].deployed += 1;
    if (deployment.failed) groups[group].failed += 1;
    if (deployment.blocked) groups[group].blocked += 1;
    if (deployment.planned) groups[group].planned += 1;
    if (deployment.urls.length) groups[group].with_urls += 1;
    groups[group].targets.push(deployment.name);
  }

  for (const group of Object.values(groups)) {
    group.targets = [...new Set(group.targets)].sort();
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function collectNotices(inputs, deployments, orphanUrls, automaticTargets) {
  const warnings = [];
  const errors = [];

  for (const input of inputs) {
    if (input.error) {
      errors.push({
        level: "error",
        source: input.key,
        message: input.error,
        file: input.file,
      });
    }
  }

  warnings.push(...(automaticTargets.warnings || []));

  for (const deployment of deployments) {
    if (deployment.failed) {
      errors.push({
        level: "error",
        source: deployment.name,
        message: `Cloudflare ${deployment.environment} ${deployment.type} deployment failed.`,
        file: deployment.source_file,
      });
    }

    if (deployment.blocked) {
      errors.push({
        level: "error",
        source: deployment.name,
        message: `Cloudflare ${deployment.environment} ${deployment.type} deployment was blocked.`,
        file: deployment.source_file,
      });
    }

    if (deployment.deployed && !deployment.urls.length) {
      warnings.push({
        level: "warning",
        source: deployment.name,
        message: `Cloudflare ${deployment.environment} ${deployment.type} deployment has no discovered URL.`,
        file: deployment.source_file,
      });
    }
  }

  if (orphanUrls.length) {
    warnings.push({
      level: "warning",
      source: "log-scan",
      message: `${orphanUrls.length} deployment URL(s) were found in logs but could not be mapped to a target.`,
      file: "logs",
    });
  }

  return {
    warnings,
    errors,
  };
}

function createDiscovery(args, repoRoot) {
  const github = getGitMetadata(repoRoot);
  const deploymentInputs = inputFiles(args, repoRoot).map((input) =>
    readJsonInput(input.file, repoRoot, input.key),
  );
  const existingTargetsInput = readJsonInput(
    args.targets_file,
    repoRoot,
    "cloudflare-targets",
  );
  const automaticTargets = discoverAutomaticTargets(args, repoRoot);
  const targetsInput = createTargetsInput(
    existingTargetsInput,
    automaticTargets,
    args,
  );
  const generatedTargetsFile = writeGeneratedTargetsFile(
    targetsInput,
    args,
    repoRoot,
  );
  const logUrlRecords = scanDeploymentLogs(args, repoRoot);
  const targetDeploymentArgs = {
    ...args,
    include_undeployed_targets:
      args.include_undeployed_targets || automaticTargets.enabled,
  };

  const reportDeployments = deploymentInputs.flatMap((input) =>
    deploymentsFromReportInput(input, args),
  );
  const undeployedDeployments = deploymentsFromTargetsInput(
    targetsInput,
    targetDeploymentArgs,
  );
  const deduped = dedupeDeployments([
    ...reportDeployments,
    ...undeployedDeployments,
  ]);
  const logAttached = attachLogUrls(deduped, logUrlRecords, args);
  const deployments = logAttached.deployments;
  const deploymentUrls = [
    ...new Set(deployments.flatMap((deployment) => deployment.urls)),
  ].sort();
  const orphanUrls = logAttached.orphan_urls;
  const notices = collectNotices(
    [...deploymentInputs, targetsInput],
    deployments,
    orphanUrls,
    automaticTargets,
  );
  const status = notices.errors.length
    ? "failed"
    : deployments.length
      ? "discovered"
      : "empty";

  return {
    schema_version: 1,
    type: "cloudflare-deployments",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      preview_file: toRelativePath(
        resolvePath(args.preview_file, repoRoot),
        repoRoot,
      ),
      staging_file: toRelativePath(
        resolvePath(args.staging_file, repoRoot),
        repoRoot,
      ),
      production_file: toRelativePath(
        resolvePath(args.production_file, repoRoot),
        repoRoot,
      ),
      targets_file: toRelativePath(
        resolvePath(args.targets_file, repoRoot),
        repoRoot,
      ),
      deployment_stage: args.deployment_stage,
      alias: args.alias,
      preview_ref: args.preview_ref,
      pull_request_number: args.pull_request_number,
      project_name: args.project_name,
      output_root: args.output_root,
      input_files: args.input_files.map((file) =>
        toRelativePath(resolvePath(file, repoRoot), repoRoot),
      ),
      input_dirs: args.input_dirs.map((dir) =>
        toRelativePath(resolvePath(dir, repoRoot), repoRoot),
      ),
      log_roots: args.log_roots,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      generated_targets_file: generatedTargetsFile,
      environments: args.environments,
      include_targets: args.include_targets,
      exclude_targets: args.exclude_targets,
      include_types: args.include_types,
      exclude_types: args.exclude_types,
      include_undeployed_targets: args.include_undeployed_targets,
      auto_discover_targets: args.auto_discover_targets,
      write_targets_file: args.write_targets_file,
      scan_logs: args.scan_logs,
      include_orphan_urls: args.include_orphan_urls,
      redact_logs: args.redact_logs,
      max_log_files: args.max_log_files,
      max_urls_per_log: args.max_urls_per_log,
      dry_run: args.dry_run,
    },
    inputs: {
      deployment_reports: deploymentInputs.map((input) => ({
        key: input.key,
        file: input.file,
        available: input.available,
        type: input.data?.type || null,
        status: input.data?.status || null,
        error: input.error,
      })),
      cloudflare_targets: {
        file: targetsInput.file,
        available: targetsInput.available,
        generated: Boolean(targetsInput.generated),
        generated_file: generatedTargetsFile,
        type: targetsInput.data?.type || null,
        status: targetsInput.data?.status || null,
        error: targetsInput.error,
      },
      auto_discovery: {
        enabled: automaticTargets.enabled,
        targets: automaticTargets.targets.length,
        deployment_matrix: automaticTargets.deployment_matrix.length,
        warnings: automaticTargets.warnings,
      },
      log_records: logUrlRecords,
    },
    totals: {
      deployment_reports_available: deploymentInputs.filter(
        (input) => input.available && !input.error,
      ).length,
      deployment_reports_missing: deploymentInputs.filter(
        (input) => !input.available,
      ).length,
      cloudflare_targets_available:
        targetsInput.available && !targetsInput.error ? 1 : 0,
      auto_discovered_targets: automaticTargets.targets.length,
      auto_discovered_deployment_matrix:
        automaticTargets.deployment_matrix.length,
      generated_targets_file: generatedTargetsFile ? 1 : 0,
      report_deployments: reportDeployments.length,
      undeployed_targets: undeployedDeployments.length,
      deployments: deployments.length,
      deployed: deployments.filter((deployment) => deployment.deployed).length,
      failed: deployments.filter((deployment) => deployment.failed).length,
      blocked: deployments.filter((deployment) => deployment.blocked).length,
      planned: deployments.filter((deployment) => deployment.planned).length,
      not_deployed: deployments.filter(
        (deployment) => deployment.status === "not-deployed",
      ).length,
      pages: deployments.filter((deployment) => deployment.type === "pages")
        .length,
      workers: deployments.filter((deployment) => deployment.type === "worker")
        .length,
      with_urls: deployments.filter((deployment) => deployment.urls.length)
        .length,
      urls: deploymentUrls.length,
      orphan_urls: orphanUrls.length,
      scanned_log_files_with_urls: logUrlRecords.length,
      warnings: notices.warnings.length,
      errors: notices.errors.length,
    },
    targets: targetsInput.data?.targets || [],
    deployment_matrix: targetsInput.data?.deployment_matrix || [],
    deployments,
    deployment_names: [
      ...new Set(deployments.map((deployment) => deployment.name)),
    ].sort(),
    deployment_urls: deploymentUrls,
    orphan_urls: orphanUrls,
    environment_groups: groupDeployments(deployments, "environment"),
    type_groups: groupDeployments(deployments, "type"),
    status_groups: groupDeployments(deployments, "status"),
    notices,
    status,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(discovery) {
  const lines = [
    `# ☁️ ${PROJECT_NAME} Cloudflare Deployments`,
    "",
    `Generated: \`${discovery.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${discovery.status}\``,
    `- Deployments: \`${discovery.totals.deployments}\``,
    `- Deployed: \`${discovery.totals.deployed}\``,
    `- Failed: \`${discovery.totals.failed}\``,
    `- Blocked: \`${discovery.totals.blocked}\``,
    `- Planned: \`${discovery.totals.planned}\``,
    `- URLs: \`${discovery.totals.urls}\``,
    `- Warnings: \`${discovery.totals.warnings}\``,
    `- Errors: \`${discovery.totals.errors}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${discovery.repository}\``,
    `- Branch: \`${discovery.github.branch || "unknown"}\``,
    `- Commit: \`${discovery.github.short_sha || discovery.github.sha || "unknown"}\``,
    `- Workflow: \`${discovery.github.workflow || "unknown"}\``,
    `- Run: \`${discovery.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Discovery Context",
    "",
    `- Stage: \`${discovery.config.deployment_stage || "not set"}\``,
    `- Alias: \`${discovery.config.alias || "not set"}\``,
    `- Ref: \`${discovery.config.preview_ref || "not set"}\``,
    `- Pull request: \`${discovery.config.pull_request_number || "not set"}\``,
    `- Cloudflare project: \`${discovery.config.project_name || "not set"}\``,
    `- Auto target discovery: \`${discovery.config.auto_discover_targets ? "true" : "false"}\``,
    `- Generated targets file: \`${discovery.config.generated_targets_file || "not written"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Deployment reports available: \`${discovery.totals.deployment_reports_available}\``,
    `- Cloudflare targets available: \`${discovery.totals.cloudflare_targets_available}\``,
    `- Auto-discovered targets: \`${discovery.totals.auto_discovered_targets}\``,
    `- Auto-discovered deployment matrix entries: \`${discovery.totals.auto_discovered_deployment_matrix}\``,
    `- Report deployments: \`${discovery.totals.report_deployments}\``,
    `- Undeployed targets included: \`${discovery.totals.undeployed_targets}\``,
    `- Pages deployments: \`${discovery.totals.pages}\``,
    `- Worker deployments: \`${discovery.totals.workers}\``,
    `- Deployments with URLs: \`${discovery.totals.with_urls}\``,
    `- Orphan URLs: \`${discovery.totals.orphan_urls}\``,
    `- Log files with URLs: \`${discovery.totals.scanned_log_files_with_urls}\``,
    "",
  ];

  if (Object.keys(discovery.environment_groups).length) {
    lines.push("## 🌎 Environments");
    lines.push("");
    lines.push(
      "| Environment | Count | Deployed | Failed | Blocked | Planned | URLs | Targets |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|---:|---|");

    for (const [environment, group] of Object.entries(
      discovery.environment_groups,
    )) {
      lines.push(
        `| \`${environment}\` | \`${group.count}\` | \`${group.deployed}\` | \`${group.failed}\` | \`${group.blocked}\` | \`${group.planned}\` | \`${group.with_urls}\` | ${group.targets.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🎯 Deployments");
  lines.push("");

  if (!discovery.deployments.length) {
    lines.push("No Cloudflare deployments were discovered.");
  } else {
    lines.push(
      "| Environment | Status | Target | Type | Root | Output/Config | Source |",
    );
    lines.push("|---|---|---|---|---|---|---|");

    for (const deployment of discovery.deployments.slice(0, 200)) {
      const outputOrConfig =
        deployment.type === "pages"
          ? deployment.pages_build_output_dir || "none"
          : deployment.config_file || "none";
      lines.push(
        `| \`${deployment.environment}\` | \`${deployment.status}\` | \`${escapeMarkdown(deployment.name)}\` | \`${deployment.type}\` | \`${escapeMarkdown(deployment.root || ".")}\` | \`${escapeMarkdown(outputOrConfig)}\` | \`${deployment.source}\` |`,
      );
    }

    if (discovery.deployments.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ... | ${discovery.deployments.length - 200} additional deployment(s) omitted. |`,
      );
    }
  }

  if (discovery.targets.length) {
    lines.push("");
    lines.push("## 🧭 Auto/Target Detector Targets");
    lines.push("");
    lines.push(
      "| Target | Type | Root | Config | Pages Output | Environments |",
    );
    lines.push("|---|---|---|---|---|---|");

    for (const target of discovery.targets.slice(0, 100)) {
      lines.push(
        `| \`${escapeMarkdown(target.name)}\` | \`${target.type}\` | \`${target.root || "."}\` | \`${target.config_file || "none"}\` | \`${target.pages_build_output_dir || "none"}\` | \`${(target.environments || []).join(", ") || "all"}\` |`,
      );
    }
  }

  if (discovery.deployment_urls.length) {
    lines.push("");
    lines.push("## 🔗 Deployment URLs");
    lines.push("");

    for (const url of discovery.deployment_urls.slice(0, 100)) {
      lines.push(`- ${url}`);
    }

    if (discovery.deployment_urls.length > 100) {
      lines.push(
        `- ...and \`${discovery.deployment_urls.length - 100}\` more URL(s).`,
      );
    }
  }

  if (discovery.orphan_urls.length) {
    lines.push("");
    lines.push("## 🧭 Unmapped Log URLs");
    lines.push("");
    lines.push("| URL | Log File |");
    lines.push("|---|---|");

    for (const item of discovery.orphan_urls.slice(0, 50)) {
      lines.push(`| ${item.url} | \`${item.file}\` |`);
    }
  }

  if (discovery.notices.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");
    lines.push("| Source | Message | File |");
    lines.push("|---|---|---|");

    for (const error of discovery.notices.errors) {
      lines.push(
        `| \`${escapeMarkdown(error.source)}\` | ${escapeMarkdown(error.message)} | \`${error.file || "unknown"}\` |`,
      );
    }
  }

  if (discovery.notices.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");
    lines.push("| Source | Message | File |");
    lines.push("|---|---|---|");

    for (const warning of discovery.notices.warnings.slice(0, 100)) {
      lines.push(
        `| \`${escapeMarkdown(warning.source)}\` | ${escapeMarkdown(warning.message)} | \`${warning.file || "unknown"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push("| Input | File | Available | Status | Error |");
  lines.push("|---|---|---:|---|---|");

  for (const input of discovery.inputs.deployment_reports) {
    lines.push(
      `| \`${input.key}\` | \`${input.file}\` | \`${input.available ? "true" : "false"}\` | \`${input.status || "unknown"}\` | ${input.error || ""} |`,
    );
  }

  lines.push(
    `| \`cloudflare-targets\` | \`${discovery.inputs.cloudflare_targets.file}\` | \`${discovery.inputs.cloudflare_targets.available ? "true" : "false"}\` | \`${discovery.inputs.cloudflare_targets.status || "unknown"}\` | ${discovery.inputs.cloudflare_targets.error || ""} |`,
  );

  if (discovery.inputs.cloudflare_targets.generated) {
    lines.push(
      `| \`cloudflare-targets-generated\` | \`${discovery.inputs.cloudflare_targets.generated_file || "not written"}\` | \`true\` | \`generated\` | automatic repository discovery |`,
    );
  }

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${discovery.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${discovery.config.summary_file || "not written"}\``,
  );
  lines.push(
    `- Generated targets file: \`${discovery.config.generated_targets_file || "not written"}\``,
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

function writeGitHubOutputs(discovery) {
  setGitHubOutput("cloudflare_deployments_file", discovery.config.output_file);
  setGitHubOutput(
    "cloudflare_deployments_summary_file",
    discovery.config.summary_file || "",
  );
  setGitHubOutput(
    "cloudflare_targets_file",
    discovery.config.generated_targets_file ||
      discovery.inputs.cloudflare_targets.file ||
      "",
  );
  setGitHubOutput("cloudflare_deployments_status", discovery.status);
  setGitHubOutput(
    "cloudflare_deployments_stage",
    discovery.config.deployment_stage || "",
  );
  setGitHubOutput("cloudflare_deployments_alias", discovery.config.alias || "");
  setGitHubOutput(
    "cloudflare_deployments_count",
    String(discovery.totals.deployments),
  );
  setGitHubOutput(
    "cloudflare_auto_discovered_targets_count",
    String(discovery.totals.auto_discovered_targets || 0),
  );
  setGitHubOutput(
    "cloudflare_deployed_count",
    String(discovery.totals.deployed),
  );
  setGitHubOutput(
    "cloudflare_failed_deployments_count",
    String(discovery.totals.failed),
  );
  setGitHubOutput(
    "cloudflare_blocked_deployments_count",
    String(discovery.totals.blocked),
  );
  setGitHubOutput(
    "cloudflare_planned_deployments_count",
    String(discovery.totals.planned),
  );
  setGitHubOutput(
    "cloudflare_deployment_urls_count",
    String(discovery.totals.urls),
  );
  setGitHubOutput(
    "cloudflare_deployment_urls",
    discovery.deployment_urls.join(","),
  );
  setGitHubOutput(
    "cloudflare_deployment_urls_json",
    JSON.stringify(discovery.deployment_urls),
  );
  setGitHubOutput(
    "cloudflare_deployment_names",
    discovery.deployment_names.join(","),
  );
  setGitHubOutput(
    "cloudflare_deployment_names_json",
    JSON.stringify(discovery.deployment_names),
  );
  setGitHubOutput(
    "cloudflare_orphan_urls_count",
    String(discovery.totals.orphan_urls),
  );
  setGitHubOutput(
    "cloudflare_deployment_warnings",
    String(discovery.totals.warnings),
  );
  setGitHubOutput(
    "cloudflare_deployment_errors",
    String(discovery.totals.errors),
  );
  setGitHubOutput(
    "cloudflare_deployments_json",
    JSON.stringify(discovery.deployments),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();
  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Discovering Cloudflare deployments and repository targets.");

  const discovery = createDiscovery(args, repoRoot);
  const json = `${JSON.stringify(discovery, null, 2)}\n`;
  const markdown = createMarkdownSummary(discovery);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(discovery);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_empty && discovery.totals.deployments === 0) {
    logger.error(
      "No Cloudflare deployments or deployable targets were discovered.",
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_failed_deployment && discovery.totals.failed > 0) {
    logger.error(
      `Discovered ${discovery.totals.failed} failed Cloudflare deployment(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_blocked_deployment && discovery.totals.blocked > 0) {
    logger.error(
      `Discovered ${discovery.totals.blocked} blocked Cloudflare deployment(s).`,
    );
    process.exitCode = 1;
  }
}

main();
