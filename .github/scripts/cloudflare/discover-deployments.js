#!/usr/bin/env node
// .github/scripts/cloudflare/discover-deployments.js
// =============================================================================
// Aerealith AI — Cloudflare Deployment Discovery Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   Consolidate Cloudflare preview, staging, and production deployment reports
//   into one deployment inventory with URLs, statuses, targets, environments,
//   branch metadata, command evidence, and GitHub Actions outputs.
//
// Input:
//   - artifacts/cloudflare/deploy-preview.json
//   - artifacts/cloudflare/deploy-staging.json
//   - artifacts/cloudflare/deploy-production.json
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/deployments.json
//   - artifacts/cloudflare/deployments.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not deploy anything.
//   - Does not mutate Cloudflare.
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

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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
    log_roots: normalizeStringList(
      process.env.CLOUDFLARE_DEPLOYMENTS_LOG_ROOTS,
    ),

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
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
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
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      args.preview_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--staging") {
      args.staging_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--production") {
      args.production_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--targets" || arg === "--cloudflare-targets") {
      args.targets_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--log-root" || arg === "--log-roots") {
      args.log_roots.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (
      arg === "--environment" ||
      arg === "--environments" ||
      arg === "--env"
    ) {
      args.environments.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--include-type" || arg === "--include-types") {
      args.include_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-type" || arg === "--exclude-types") {
      args.exclude_types.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--max-log-files") {
      args.max_log_files = normalizeInteger(
        argv[index + 1],
        args.max_log_files,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-urls-per-log") {
      args.max_urls_per_log = normalizeInteger(
        argv[index + 1],
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

  if (!args.log_roots.length) {
    args.log_roots = [...DEFAULT_LOG_ROOTS];
  }

  args.environments = [
    ...new Set(args.environments.map((item) => item.toLowerCase())),
  ];
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.include_types = [
    ...new Set(args.include_types.map((item) => item.toLowerCase())),
  ];
  args.exclude_types = [
    ...new Set(args.exclude_types.map((item) => item.toLowerCase())),
  ];
  args.input_files = [...new Set(args.input_files.filter(Boolean))];
  args.log_roots = [...new Set(args.log_roots.map(toPosixPath))];
  args.max_log_files = Math.max(0, args.max_log_files);
  args.max_urls_per_log = Math.max(0, args.max_urls_per_log);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Deployment Discovery Reporter

Usage:
  node .github/scripts/cloudflare/discover-deployments.js [options]

Examples:
  node .github/scripts/cloudflare/discover-deployments.js
  node .github/scripts/cloudflare/discover-deployments.js --environment production
  node .github/scripts/cloudflare/discover-deployments.js --include-target web --scan-logs
  node .github/scripts/cloudflare/discover-deployments.js --include-undeployed

Options:
      --repo <owner/repo>                 Repository slug.
      --preview <file>                    Preview deployment report file.
      --staging <file>                    Staging deployment report file.
      --production <file>                 Production deployment report file.
      --targets <file>                    cloudflare-targets.json detector file.
  -i, --input <file>                      Additional Cloudflare deployment report JSON file.
      --log-root <path,list>              Log roots to scan for deployment URLs.
      --environment <list>                Environment filter: preview, staging, production.
      --include-target <list>             Include only target names.
      --exclude-target <list>             Exclude target names.
      --include-type <list>               Include only pages/worker target types.
      --exclude-type <list>               Exclude pages/worker target types.
      --include-undeployed                Include detector targets that have no deployment report.
      --no-undeployed                     Do not include undeployed targets. Default.
      --scan-logs                         Scan deployment logs for URLs. Default.
      --no-scan-logs                      Do not scan logs.
      --include-orphan-urls               Include URLs found in logs but not mapped to a target. Default.
      --no-orphan-urls                    Drop unmapped log URLs.
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

function extractUrls(...values) {
  const urls = [];

  for (const value of values) {
    const matches = String(value || "").match(URL_PATTERN) || [];
    urls.push(...matches.map(cleanUrl));
  }

  return [...new Set(urls.filter(Boolean))];
}

function cleanUrl(url) {
  return String(url || "")
    .replace(/[),.;]+$/g, "")
    .replace(/\\n.*$/g, "")
    .trim();
}

function normalizeStatus(value, fallback = "unknown") {
  const status = normalizeString(value, fallback).toLowerCase();

  if (["deployed", "passed", "success", "ok"].includes(status))
    return "deployed";
  if (["failed", "failure", "error"].includes(status)) return "failed";
  if (["blocked", "cancelled", "canceled"].includes(status)) return "blocked";
  if (["planned", "skipped", "dry-run"].includes(status)) return "planned";
  if (["empty", "none"].includes(status)) return "empty";

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

function shouldIncludeDeployment(deployment, args) {
  if (
    args.environments.length &&
    !args.environments.includes(deployment.environment)
  )
    return false;
  if (
    args.include_targets.length &&
    !args.include_targets.includes(deployment.name)
  )
    return false;
  if (args.exclude_targets.includes(deployment.name)) return false;
  if (
    args.include_types.length &&
    !args.include_types.includes(deployment.type)
  )
    return false;
  if (args.exclude_types.includes(deployment.type)) return false;

  return true;
}

function inputFiles(args) {
  return [
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
    ...args.input_files.map((file, index) => ({
      key: `extra-${index + 1}`,
      file,
    })),
  ];
}

function normalizeReportDeployment(deployment, report, sourceFile) {
  const environment = normalizeString(
    deployment.environment ||
      report.config?.environment ||
      environmentFromReportType(report.type),
    "unknown",
  ).toLowerCase();
  const type = normalizeString(
    deployment.type || deployment.primary_type || "unknown",
  ).toLowerCase();
  const name = normalizeString(
    deployment.name || deployment.target_name || "cloudflare-target",
  );
  const root = toPosixPath(deployment.root || ".");

  return {
    id: normalizeString(
      deployment.id ||
        deployment.target_id ||
        deploymentKey(environment, type, name, root),
    ),
    key: deploymentKey(environment, type, name, root),
    source: "deployment-report",
    source_file: sourceFile,
    report_type: report.type || "unknown",
    report_status: normalizeStatus(report.status),
    environment,
    branch: normalizeString(
      report.config?.branch || report.github?.branch || "",
    ),
    commit: normalizeString(report.github?.sha || ""),
    short_commit: normalizeString(report.github?.short_sha || ""),
    workflow: normalizeString(report.github?.workflow || ""),
    run_id: normalizeString(report.github?.run_id || ""),
    name,
    type,
    root,
    config_file: toPosixPath(deployment.config_file || ""),
    target_id: normalizeString(deployment.id || deployment.target_id || ""),
    target_types: Array.isArray(deployment.target_types)
      ? deployment.target_types.map(String)
      : [type],
    affected: Boolean(deployment.affected),
    pages_build_output_dir: toPosixPath(
      deployment.pages_build_output_dir || "",
    ),
    wrangler_environment: normalizeString(
      deployment.wrangler_environment || "",
    ),
    has_config_environment: Boolean(deployment.has_config_environment),
    resource_counts: {
      d1_databases: Number(deployment.d1_databases || 0),
      kv_namespaces: Number(deployment.kv_namespaces || 0),
      r2_buckets: Number(deployment.r2_buckets || 0),
      queue_producers: Number(deployment.queue_producers || 0),
      queue_consumers: Number(deployment.queue_consumers || 0),
      durable_objects: Number(deployment.durable_objects || 0),
    },
    status: "unknown",
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
    skipped_reason: "",
    notes: [],
  };
}

function environmentFromReportType(type) {
  const value = normalizeString(type).toLowerCase();

  if (value.includes("preview")) return "preview";
  if (value.includes("staging")) return "staging";
  if (value.includes("production")) return "production";

  return "unknown";
}

function resultBelongsToDeployment(result, deployment, reportDeploymentCount) {
  if (!result) return false;
  if (result.target_id && deployment.id && result.target_id === deployment.id)
    return true;
  if (
    result.target_id &&
    deployment.target_id &&
    result.target_id === deployment.target_id
  )
    return true;
  if (
    result.target_name &&
    deployment.name &&
    result.target_name === deployment.name
  )
    return true;
  if (reportDeploymentCount === 1) return true;

  return false;
}

function attachReportEvidence(deployment, report) {
  const reportResults = Array.isArray(report.results) ? report.results : [];
  const matchingResults = reportResults.filter((result) =>
    resultBelongsToDeployment(
      result,
      deployment,
      Array.isArray(report.deployments) ? report.deployments.length : 0,
    ),
  );
  const buildResults = matchingResults.filter(
    (result) => result.kind === "build",
  );
  const deployResults = matchingResults.filter(
    (result) => result.kind === "deploy",
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
    ...(deployResults.length
      ? deployResults.map((result) => (result.urls || []).join("\n"))
      : []),
    ...(deployResults.length
      ? deployResults.map((result) => result.stdout_preview || "")
      : []),
    ...(deployResults.length
      ? deployResults.map((result) => result.stderr_preview || "")
      : []),
    ...(Array.isArray(report.urls) && (report.deployments || []).length <= 1
      ? report.urls
      : []),
  );

  const hasFailure = matchingResults.some(
    (result) => result.status === "failed" || result.success === false,
  );
  const hasDeploySuccess = deployResults.some(
    (result) => result.status === "passed" || result.success === true,
  );
  const reportStatus = normalizeStatus(report.status);

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
  deployment.skipped_reason = skippedTarget?.reason || "";
  deployment.urls = [...new Set([...deployment.urls, ...urls])];
  deployment.primary_url = deployment.urls[0] || "";
  deployment.failed = hasFailure || reportStatus === "failed";
  deployment.blocked = Boolean(report.blocked) || reportStatus === "blocked";
  deployment.planned =
    reportStatus === "planned" || report.config?.dry_run === true;
  deployment.deployed =
    !deployment.failed &&
    !deployment.blocked &&
    hasDeploySuccess &&
    !deployment.planned;
  deployment.status = deployment.blocked
    ? "blocked"
    : deployment.failed
      ? "failed"
      : deployment.deployed
        ? "deployed"
        : deployment.planned
          ? "planned"
          : reportStatus;

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
  if (!Array.isArray(report.deployments)) return [];

  return report.deployments
    .map((deployment) =>
      normalizeReportDeployment(deployment, report, input.file),
    )
    .map((deployment) => attachReportEvidence(deployment, report))
    .filter((deployment) => shouldIncludeDeployment(deployment, args));
}

function deploymentsFromTargetsInput(input, args) {
  const data = input.data;

  if (!data || !args.include_undeployed_targets) return [];

  const targets = Array.isArray(data.targets) ? data.targets : [];
  const matrix = Array.isArray(data.deployment_matrix)
    ? data.deployment_matrix
    : [];
  const matrixByTarget = new Map(
    matrix.map((item) => [
      item.id || `${item.type}:${item.name}:${item.root}`,
      item,
    ]),
  );
  const deployments = [];

  for (const target of targets) {
    const baseType = normalizeString(
      target.primary_type || target.type || "unknown",
    ).toLowerCase();
    const environments = args.environments.length
      ? args.environments
      : ["preview", "staging", "production"];

    for (const environment of environments) {
      const matrixEntry =
        matrixByTarget.get(target.id) ||
        matrix.find(
          (item) =>
            item.name === target.name && item.environment === environment,
        ) ||
        {};
      const type = normalizeString(
        matrixEntry.type || baseType || "unknown",
      ).toLowerCase();
      const name = normalizeString(
        target.name || matrixEntry.name || "cloudflare-target",
      );
      const root = toPosixPath(target.root || matrixEntry.root || ".");

      const deployment = {
        id: normalizeString(
          target.id ||
            matrixEntry.id ||
            deploymentKey(environment, type, name, root),
        ),
        key: deploymentKey(environment, type, name, root),
        source: "target-detector",
        source_file: input.file,
        report_type: data.type || "cloudflare-targets",
        report_status: normalizeStatus(data.status || "detected"),
        environment,
        branch: "",
        commit: "",
        short_commit: "",
        workflow: "",
        run_id: "",
        name,
        type,
        root,
        config_file: toPosixPath(
          target.config_file || matrixEntry.config_file || "",
        ),
        target_id: normalizeString(target.id || matrixEntry.id || ""),
        target_types: Array.isArray(target.target_types)
          ? target.target_types.map(String)
          : [type],
        affected: Boolean(target.affected || matrixEntry.affected),
        pages_build_output_dir: toPosixPath(
          target.pages_build_output_dir ||
            matrixEntry.pages_build_output_dir ||
            "",
        ),
        wrangler_environment: normalizeString(
          matrixEntry.wrangler_environment || "",
        ),
        has_config_environment: Boolean(matrixEntry.has_config_environment),
        resource_counts: target.resource_counts || {
          d1_databases: Number(matrixEntry.d1_databases || 0),
          kv_namespaces: Number(matrixEntry.kv_namespaces || 0),
          r2_buckets: Number(matrixEntry.r2_buckets || 0),
          queue_producers: Number(matrixEntry.queue_producers || 0),
          queue_consumers: Number(matrixEntry.queue_consumers || 0),
          durable_objects: Number(matrixEntry.durable_objects || 0),
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
          "Included from Cloudflare target detector because include_undeployed_targets is enabled.",
        ],
      };

      if (shouldIncludeDeployment(deployment, args)) {
        deployments.push(deployment);
      }
    }
  }

  return deployments;
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

    const existing = seen.get(key);
    const preferred =
      existing.source === "deployment-report" ? existing : deployment;
    const secondary = preferred === existing ? deployment : existing;

    seen.set(key, {
      ...secondary,
      ...preferred,
      id: preferred.id || secondary.id,
      urls: [
        ...new Set([...(existing.urls || []), ...(deployment.urls || [])]),
      ],
      primary_url:
        preferred.primary_url ||
        secondary.primary_url ||
        existing.urls?.[0] ||
        deployment.urls?.[0] ||
        "",
      commands: [...(existing.commands || []), ...(deployment.commands || [])],
      build_results: [
        ...new Set([
          ...(existing.build_results || []),
          ...(deployment.build_results || []),
        ]),
      ],
      deploy_results: [
        ...new Set([
          ...(existing.deploy_results || []),
          ...(deployment.deploy_results || []),
        ]),
      ],
      notes: [
        ...new Set([...(existing.notes || []), ...(deployment.notes || [])]),
      ],
      source:
        existing.source === "deployment-report" ||
        deployment.source === "deployment-report"
          ? "deployment-report"
          : preferred.source,
    });
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

function attachLogUrls(deployments, logUrlRecords, args) {
  const deploymentsByToken = new Map();

  for (const deployment of deployments) {
    const tokens = [deployment.id, deployment.target_id, deployment.name]
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
      ([token]) => safeFile.includes(token),
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

function collectNotices(inputs, deployments, orphanUrls) {
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
  const deploymentInputs = inputFiles(args).map((input) =>
    readJsonInput(input.file, repoRoot, input.key),
  );
  const targetsInput = readJsonInput(
    args.targets_file,
    repoRoot,
    "cloudflare-targets",
  );
  const logUrlRecords = scanDeploymentLogs(args, repoRoot);

  const reportDeployments = deploymentInputs.flatMap((input) =>
    deploymentsFromReportInput(input, args),
  );
  const undeployedDeployments = deploymentsFromTargetsInput(targetsInput, args);
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
      input_files: args.input_files.map((file) =>
        toRelativePath(resolvePath(file, repoRoot), repoRoot),
      ),
      log_roots: args.log_roots,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      environments: args.environments,
      include_targets: args.include_targets,
      exclude_targets: args.exclude_targets,
      include_types: args.include_types,
      exclude_types: args.exclude_types,
      include_undeployed_targets: args.include_undeployed_targets,
      scan_logs: args.scan_logs,
      include_orphan_urls: args.include_orphan_urls,
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
        type: targetsInput.data?.type || null,
        status: targetsInput.data?.status || null,
        error: targetsInput.error,
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
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
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
    "## 📊 Totals",
    "",
    `- Deployment reports available: \`${discovery.totals.deployment_reports_available}\``,
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
      "| Environment | Status | Target | Type | Branch | URL | Source |",
    );
    lines.push("|---|---|---|---|---|---|---|");

    for (const deployment of discovery.deployments.slice(0, 200)) {
      const url = deployment.primary_url ? deployment.primary_url : "none";
      lines.push(
        `| \`${deployment.environment}\` | \`${deployment.status}\` | \`${deployment.name}\` | \`${deployment.type}\` | \`${deployment.branch || "unknown"}\` | ${url} | \`${deployment.source}\` |`,
      );
    }

    if (discovery.deployments.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ${discovery.deployments.length - 200} additional deployment(s) omitted. | ... |`,
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

function writeGitHubOutputs(discovery) {
  setGitHubOutput("cloudflare_deployments_file", discovery.config.output_file);
  setGitHubOutput(
    "cloudflare_deployments_summary_file",
    discovery.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_deployments_status", discovery.status);
  setGitHubOutput(
    "cloudflare_deployments_count",
    String(discovery.totals.deployments),
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

  logger.info("Discovering Cloudflare deployments.");

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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_if_empty && discovery.totals.deployments === 0) {
    logger.error("No Cloudflare deployments were discovered.");
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
