#!/usr/bin/env node
// .github/scripts/npm/publish-packages.js
// =============================================================================
// Aerealith AI — NPM Package Publisher
// -----------------------------------------------------------------------------
// Publishes tarballs produced by pack-packages.js. Already-published package
// versions are treated as non-fatal so reruns stay idempotent.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);
const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|_authToken=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|NPM_TOKEN=[^\s]+)/gi;

const logger = {
  info: (message) => console.log(`[npm-publish] ${message}`),
  warn: (message) => console.warn(`[npm-publish] WARN: ${message}`),
  error: (message) => console.error(`[npm-publish] ERROR: ${message}`),
  formatError: (error) => {
    if (!error) return "unknown error";
    if (typeof error === "string") return error;
    return error.stack || error.message || String(error);
  },
};

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
  if (Array.isArray(value))
    return [
      ...new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    ];
  return [
    ...new Set(
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^\/+|\/+$/g, "");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    packages_file:
      process.env.NPM_PUBLISH_PACKAGES_PACKAGES_FILE ||
      "artifacts/ci/npm-packages.json",
    pack_report_file:
      process.env.NPM_PUBLISH_PACKAGES_PACK_REPORT_FILE ||
      "artifacts/npm/pack-packages.json",
    output_file:
      process.env.NPM_PUBLISH_PACKAGES_OUTPUT_FILE ||
      "artifacts/npm/publish-packages.json",
    summary_file:
      process.env.NPM_PUBLISH_PACKAGES_SUMMARY_FILE ||
      "artifacts/npm/publish-packages.md",
    tag: process.env.NPM_PUBLISH_TAG || process.env.NPM_CONFIG_TAG || "latest",
    access:
      process.env.NPM_PUBLISH_ACCESS ||
      process.env.NPM_CONFIG_ACCESS ||
      "public",
    registry: process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org",
    provenance: normalizeBoolean(
      process.env.NPM_PUBLISH_PROVENANCE || process.env.NPM_CONFIG_PROVENANCE,
      true,
    ),
    include_packages: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE,
    ).map(normalizePackageName),
    exclude_packages: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_EXCLUDE,
    ).map(normalizePackageName),
    fail_if_empty: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_CONTINUE_ON_ERROR,
      true,
    ),
    timeout_minutes: normalizeInteger(
      process.env.NPM_PUBLISH_PACKAGES_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.NPM_PUBLISH_PACKAGES_MAX_BUFFER_MB,
      128,
    ),
    dry_run: normalizeBoolean(
      process.env.NPM_PUBLISH_DRY_RUN ||
        process.env.NPM_PUBLISH_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.NPM_PUBLISH_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_STEP_SUMMARY,
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
    if (arg === "--packages" || arg === "--packages-file") {
      args.packages_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--pack-report") {
      args.pack_report_file = argv[index + 1];
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
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--access") {
      args.access = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--registry") {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--provenance") {
      args.provenance = true;
      continue;
    }
    if (arg === "--no-provenance") {
      args.provenance = false;
      continue;
    }
    if (arg === "--include" || arg === "--include-package") {
      args.include_packages.push(
        ...normalizeStringList(argv[index + 1]).map(normalizePackageName),
      );
      index += 1;
      continue;
    }
    if (arg === "--exclude" || arg === "--exclude-package") {
      args.exclude_packages.push(
        ...normalizeStringList(argv[index + 1]).map(normalizePackageName),
      );
      index += 1;
      continue;
    }
    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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
    if (arg === "--timeout-minutes") {
      args.timeout_minutes = normalizeInteger(
        argv[index + 1],
        args.timeout_minutes,
      );
      index += 1;
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

  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Publisher

Usage:
  node .github/scripts/npm/publish-packages.js [options]

Options:
      --pack-report <file>          Pack report containing tarballs.
  -o, --output <file>               JSON output report.
      --summary <file>              Markdown summary.
      --tag <tag>                   NPM dist-tag. Default: latest.
      --access <public|restricted>  NPM access. Default: public.
      --registry <url>              NPM registry URL.
      --provenance                  Enable provenance when not dry-run. Default.
      --dry-run                     Use npm publish --dry-run.
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
    if (markers.some((marker) => fs.existsSync(path.join(current, marker))))
      return current;
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, fallback = null) {
  try {
    return safeJsonParse(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;
  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content, dryRun = false) {
  ensureDir(path.dirname(filePath), dryRun);
  if (dryRun) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return;
  }
  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
}

function runGit(args, repoRoot, fallback = "") {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return fallback;
  }
}

function getGitMetadata(repoRoot) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], repoRoot),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"], repoRoot),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function extractTarballTargets(packReport, repoRoot) {
  const targets = [];

  for (const result of Array.isArray(packReport?.results)
    ? packReport.results
    : []) {
    for (const tarball of Array.isArray(result.tarballs)
      ? result.tarballs
      : []) {
      const file = tarball.file || tarball.absolute_file || tarball.path || "";
      if (!file) continue;
      targets.push({
        name: normalizePackageName(
          result.name || tarball.name || tarball.package || "",
        ),
        version: normalizeString(result.version || tarball.version || ""),
        package_dir: result.package_dir || result.path || "",
        tarball: toRelativePath(file, repoRoot),
        absolute_tarball: resolvePath(file, repoRoot),
        registry: result.registry || "",
        access: result.access || "",
        tag: result.tag || "",
      });
    }
  }

  for (const tarball of Array.isArray(packReport?.tarballs)
    ? packReport.tarballs
    : []) {
    const file = tarball.file || tarball.absolute_file || tarball.path || "";
    if (!file) continue;
    targets.push({
      name: normalizePackageName(tarball.name || tarball.package || ""),
      version: normalizeString(tarball.version || ""),
      package_dir: "",
      tarball: toRelativePath(file, repoRoot),
      absolute_tarball: resolvePath(file, repoRoot),
      registry: tarball.registry || "",
      access: tarball.access || "",
      tag: tarball.tag || "",
    });
  }

  const seen = new Map();
  for (const target of targets) {
    const key = target.absolute_tarball || target.tarball;
    if (!key || seen.has(key)) continue;
    seen.set(key, target);
  }

  return [...seen.values()];
}

function filterTargets(targets, args) {
  return targets
    .filter((target) => fs.existsSync(target.absolute_tarball))
    .filter(
      (target) =>
        !args.include_packages.length ||
        args.include_packages.includes(target.name),
    )
    .filter((target) => !args.exclude_packages.includes(target.name));
}

function commandDisplay(command, args) {
  return redactOutput(
    [command, ...args]
      .map((part) =>
        /^[A-Za-z0-9_./:=@,+,-]+$/.test(String(part))
          ? String(part)
          : JSON.stringify(String(part)),
      )
      .join(" "),
  );
}

function runPublish(target, args, repoRoot) {
  const startedAt = new Date();
  const npmArgs = [
    "publish",
    target.absolute_tarball,
    "--tag",
    target.tag || args.tag,
    "--access",
    target.access || args.access,
    "--registry",
    target.registry || args.registry,
    "--json",
  ];

  if (args.provenance && !args.dry_run) npmArgs.push("--provenance");
  if (args.dry_run) npmArgs.push("--dry-run");

  if (args.dry_run) {
    return {
      ...target,
      status: "planned",
      success: true,
      dry_run: true,
      command: {
        display: commandDisplay("npm", npmArgs),
        status: "planned",
        success: true,
        exit_code: null,
      },
      stdout: "",
      stderr: "",
      errors: [],
      warnings: [],
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const command = childProcess.spawnSync("npm", npmArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_AUTH_TOKEN:
        process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN || "",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: args.max_buffer_mb * 1024 * 1024,
    timeout:
      args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined,
  });

  const endedAt = new Date();
  const stdout = redactOutput(command.stdout || "");
  const stderr = redactOutput(command.stderr || "");
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  const timedOut = command.error?.code === "ETIMEDOUT";
  const alreadyPublished =
    combined.includes("previously published") ||
    combined.includes("cannot publish over") ||
    combined.includes(
      "you cannot publish over the previously published versions",
    ) ||
    (combined.includes("forbidden") &&
      combined.includes("cannot modify pre-existing version"));
  const success = (command.status === 0 && !timedOut) || alreadyPublished;
  const status =
    command.status === 0
      ? "published"
      : alreadyPublished
        ? "already-published"
        : timedOut
          ? "timed-out"
          : "failed";

  return {
    ...target,
    status,
    success,
    dry_run: false,
    command: {
      display: commandDisplay("npm", npmArgs),
      status: success ? "passed" : "failed",
      success,
      exit_code: command.status,
      signal: command.signal || null,
    },
    stdout,
    stderr,
    errors: success
      ? []
      : [
          command.error?.message ||
            stderr ||
            stdout ||
            `Failed to publish ${target.tarball}.`,
        ],
    warnings: alreadyPublished
      ? [`${target.name}@${target.version} is already published.`]
      : [],
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function createMarkdownSummary(report) {
  const lines = [
    `# ${PROJECT_NAME} NPM Package Publish`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Targets: \`${report.totals.targets}\``,
    `- Published: \`${report.totals.published}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Already published: \`${report.totals.already_published}\``,
    `- Failed: \`${report.totals.failed}\``,
    "",
    "## Results",
    "",
  ];

  if (!report.results.length) {
    lines.push("No packages were published.");
  } else {
    lines.push("| Status | Package | Version | Tarball | Duration |");
    lines.push("|---|---|---:|---|---:|");
    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.name}\` | \`${result.version}\` | \`${result.tarball}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of report.errors.slice(0, 100)) lines.push(`- ${error}`);
  }

  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings.slice(0, 100))
      lines.push(`- ${warning}`);
  }

  lines.push("", "## Outputs", "");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(`- Markdown summary: \`${report.config.summary_file}\``);

  return `${lines.join("\n").trim()}\n`;
}

function appendStepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trim()}\n\n`);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  logger.info("Publishing npm packages.");

  if (!args.dry_run && !process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
    logger.warn(
      "NODE_AUTH_TOKEN/NPM_TOKEN is empty. npm publish will likely fail.",
    );
  }

  const packReport = readJsonFile(
    resolvePath(args.pack_report_file, repoRoot),
    null,
  );
  const targets = filterTargets(
    extractTarballTargets(packReport, repoRoot),
    args,
  );
  const results = [];

  if (args.fail_if_empty && targets.length === 0) {
    results.push({
      name: "",
      version: "",
      tarball: "",
      status: "failed",
      success: false,
      errors: ["No package tarballs were selected for publishing."],
      warnings: [],
      duration_ms: 0,
    });
  } else {
    for (const target of targets) {
      const result = runPublish(target, args, repoRoot);
      results.push(result);
      if (!result.success && !args.continue_on_error) break;
    }
  }

  const failed = results.filter(
    (result) => result.status === "failed" || result.status === "timed-out",
  );
  const published = results.filter((result) => result.status === "published");
  const planned = results.filter((result) => result.status === "planned");
  const alreadyPublished = results.filter(
    (result) => result.status === "already-published",
  );
  const errors = results.flatMap((result) =>
    (result.errors || []).map(
      (error) => `${result.name || result.tarball}: ${error}`,
    ),
  );
  const warnings = results.flatMap((result) => result.warnings || []);
  const ok = failed.length === 0 && errors.length === 0;
  const status = ok
    ? args.dry_run
      ? "planned"
      : published.length
        ? "published"
        : alreadyPublished.length
          ? "already-published"
          : "empty"
    : "failed";

  const report = {
    schema_version: 1,
    type: "npm-package-publish",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: getGitMetadata(repoRoot),
    config: {
      packages_file: toRelativePath(args.packages_file, repoRoot),
      pack_report_file: toRelativePath(args.pack_report_file, repoRoot),
      output_file: toRelativePath(args.output_file, repoRoot),
      summary_file: toRelativePath(args.summary_file, repoRoot),
      tag: args.tag,
      access: args.access,
      registry: args.registry,
      provenance: args.provenance,
      dry_run: args.dry_run,
    },
    discovery: {
      targets: targets.length,
    },
    totals: {
      targets: results.length,
      published: published.length,
      planned: planned.length,
      already_published: alreadyPublished.length,
      failed: failed.length,
      errors: errors.length,
      warnings: warnings.length,
      duration_ms: results.reduce(
        (sum, result) => sum + Number(result.duration_ms || 0),
        0,
      ),
    },
    results,
    errors,
    warnings,
    ok,
    status,
  };

  report.totals.duration_human = formatDuration(report.totals.duration_ms);

  const markdown = createMarkdownSummary(report);
  writeTextFile(
    resolvePath(args.output_file, repoRoot),
    `${JSON.stringify(report, null, 2)}\n`,
    args.dry_run,
  );
  writeTextFile(
    resolvePath(args.summary_file, repoRoot),
    markdown,
    args.dry_run,
  );

  setOutput("npm_publish_packages_file", report.config.output_file);
  setOutput("npm_publish_packages_summary_file", report.config.summary_file);
  setOutput("npm_publish_packages_status", report.status);
  setOutput("npm_publish_packages_ok", report.ok ? "true" : "false");
  setOutput("npm_publish_packages_published", String(report.totals.published));
  setOutput("npm_publish_packages_failed", String(report.totals.failed));

  if (args.write_step_summary) appendStepSummary(markdown);
  if (args.print) console.log(JSON.stringify(report, null, 2));

  if (!ok && args.fail_on_error) process.exitCode = 1;
}

main().catch((error) => {
  logger.error(logger.formatError(error));
  process.exitCode = 1;
});
