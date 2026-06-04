#!/usr/bin/env node
// .github/scripts/npm/summarize-packages.js
// =============================================================================
// Aerealith AI — NPM Package Summary
// -----------------------------------------------------------------------------
// Consolidates discovery, validation, pack, and publish reports into one summary.
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
  info: (message) => console.log(`[npm-summary] ${message}`),
  warn: (message) => console.warn(`[npm-summary] WARN: ${message}`),
  error: (message) => console.error(`[npm-summary] ERROR: ${message}`),
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
    discovery_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_DISCOVERY_REPORT_FILE ||
      "artifacts/npm/discover-packages.json",
    packages_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PACKAGES_FILE ||
      "artifacts/ci/npm-packages.json",
    validation_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_VALIDATION_REPORT_FILE ||
      "artifacts/npm/validate-packages.json",
    pack_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PACK_REPORT_FILE ||
      "artifacts/npm/pack-packages.json",
    publish_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PUBLISH_REPORT_FILE ||
      "artifacts/npm/publish-packages.json",
    artifact_dir:
      process.env.NPM_SUMMARIZE_PACKAGES_ARTIFACT_DIR ||
      "artifacts/npm-artifacts",
    output_file:
      process.env.NPM_SUMMARIZE_PACKAGES_OUTPUT_FILE ||
      "artifacts/npm/summarize-packages.json",
    summary_file:
      process.env.NPM_SUMMARIZE_PACKAGES_SUMMARY_FILE ||
      "artifacts/npm/summarize-packages.md",
    include_packages: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE,
    ).map(normalizePackageName),
    exclude_packages: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE,
    ).map(normalizePackageName),
    fail_if_empty: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_failed_packages: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_ON_FAILED_PACKAGES,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    max_packages: normalizeInteger(
      process.env.NPM_SUMMARIZE_PACKAGES_MAX_PACKAGES,
      0,
    ),
    dry_run: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.NPM_SUMMARIZE_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_STEP_SUMMARY,
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
    if (arg === "--discovery-report" || arg === "--discover-report") {
      args.discovery_report_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--packages" || arg === "--packages-file") {
      args.packages_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--validation-report") {
      args.validation_report_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--pack-report") {
      args.pack_report_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--publish-report") {
      args.publish_report_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--artifact-dir") {
      args.artifact_dir = argv[index + 1];
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
    if (arg === "--fail-on-failed-packages") {
      args.fail_on_failed_packages = true;
      continue;
    }
    if (arg === "--no-fail-on-failed-packages") {
      args.fail_on_failed_packages = false;
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
    if (arg === "--max-packages") {
      args.max_packages = normalizeInteger(argv[index + 1], args.max_packages);
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
  args.max_packages = Math.max(0, args.max_packages);
  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Summary

Usage:
  node .github/scripts/npm/summarize-packages.js [options]

Options:
      --discovery-report <file>
      --packages <file>
      --validation-report <file>
      --pack-report <file>
      --publish-report <file>
  -o, --output <file>
      --summary <file>
      --fail-on-failed-packages
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

function extractPackages(...artifacts) {
  const records = [];
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") continue;
    if (Array.isArray(artifact.packages)) records.push(...artifact.packages);
    if (Array.isArray(artifact.publishable_packages))
      records.push(...artifact.publishable_packages);
    if (Array.isArray(artifact.selected_packages))
      records.push(...artifact.selected_packages);
    if (Array.isArray(artifact.matrix?.include))
      records.push(...artifact.matrix.include);
  }

  const seen = new Map();
  for (const record of records) {
    const name = normalizePackageName(record.name || record.package || "");
    const key =
      name || record.package_json || record.path || record.package_dir;
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      name,
      version: normalizeString(record.version || ""),
      package_json: toPosixPath(
        record.package_json || record.package_json_file || "",
      ),
      package_dir: toPosixPath(
        record.package_dir || record.path || record.root || "",
      ),
      publishable: Boolean(record.publishable),
      private: Boolean(record.private),
      registry: normalizeString(record.registry || ""),
      access: normalizeString(record.access || ""),
      tag: normalizeString(record.tag || record.default_tag || ""),
    });
  }

  return [...seen.values()];
}

function tarballRecords(packReport) {
  const records = [];
  for (const result of Array.isArray(packReport?.results)
    ? packReport.results
    : []) {
    for (const tarball of Array.isArray(result.tarballs)
      ? result.tarballs
      : []) {
      records.push({
        package: normalizePackageName(
          result.name || tarball.name || tarball.package || "",
        ),
        version: normalizeString(result.version || tarball.version || ""),
        file: toPosixPath(
          tarball.file || tarball.path || tarball.absolute_file || "",
        ),
        filename: normalizeString(
          tarball.filename || path.basename(tarball.file || ""),
        ),
        size_bytes: Number(tarball.size_bytes || 0),
        sha256: normalizeString(tarball.sha256 || ""),
        integrity: normalizeString(tarball.integrity || ""),
      });
    }
  }
  return records;
}

function normalizePackageSummary(pkg, validation, pack, publish) {
  const validationResult = Array.isArray(validation?.packages)
    ? validation.packages.find(
        (item) => normalizePackageName(item.name) === pkg.name,
      )
    : null;
  const packResult = Array.isArray(pack?.results)
    ? pack.results.find((item) => normalizePackageName(item.name) === pkg.name)
    : null;
  const publishResult = Array.isArray(publish?.results)
    ? publish.results.find(
        (item) => normalizePackageName(item.name) === pkg.name,
      )
    : null;

  const status =
    publishResult?.status ||
    packResult?.status ||
    validationResult?.status ||
    "discovered";

  return {
    name: pkg.name,
    version:
      pkg.version ||
      validationResult?.version ||
      packResult?.version ||
      publishResult?.version ||
      "",
    package_json:
      pkg.package_json ||
      validationResult?.package_json ||
      packResult?.package_json ||
      "",
    package_dir:
      pkg.package_dir ||
      validationResult?.package_dir ||
      packResult?.package_dir ||
      "",
    registry: pkg.registry || publishResult?.registry || "",
    access: pkg.access || publishResult?.access || "",
    tag: pkg.tag || publishResult?.tag || "",
    publishable: pkg.publishable,
    private: pkg.private,
    valid: validationResult ? validationResult.valid : true,
    packed: packResult?.status === "packed",
    published: publishResult?.status === "published",
    already_published: publishResult?.status === "already-published",
    failed:
      [
        validationResult?.status,
        packResult?.status,
        publishResult?.status,
      ].includes("failed") ||
      [
        validationResult?.status,
        packResult?.status,
        publishResult?.status,
      ].includes("invalid"),
    status,
    tarballs: Array.isArray(packResult?.tarballs) ? packResult.tarballs : [],
    errors: [
      ...(Array.isArray(validationResult?.errors)
        ? validationResult.errors
        : []),
      ...(Array.isArray(packResult?.errors) ? packResult.errors : []),
      ...(Array.isArray(publishResult?.errors) ? publishResult.errors : []),
    ],
    warnings: [
      ...(Array.isArray(validationResult?.warnings)
        ? validationResult.warnings
        : []),
      ...(Array.isArray(packResult?.warnings) ? packResult.warnings : []),
      ...(Array.isArray(publishResult?.warnings) ? publishResult.warnings : []),
    ],
  };
}

function filterPackages(packages, args) {
  return packages
    .filter(
      (pkg) =>
        !args.include_packages.length ||
        args.include_packages.includes(pkg.name),
    )
    .filter((pkg) => !args.exclude_packages.includes(pkg.name))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);
}

function scanArtifactFiles(artifactDirAbs, repoRoot) {
  if (!fs.existsSync(artifactDirAbs)) return [];
  const files = [];
  for (const entry of fs.readdirSync(artifactDirAbs, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(artifactDirAbs, entry.name);
    const stat = fs.statSync(absolute);
    files.push({
      file: toRelativePath(absolute, repoRoot),
      size_bytes: stat.size,
    });
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
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
    `# ${PROJECT_NAME} NPM Package Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Packages: \`${report.totals.packages}\``,
    `- Valid: \`${report.totals.valid}\``,
    `- Packed: \`${report.totals.packed}\``,
    `- Published: \`${report.totals.published}\``,
    `- Already published: \`${report.totals.already_published}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Tarballs: \`${report.totals.tarballs}\``,
    `- Artifact files: \`${report.totals.artifact_files}\``,
    "",
    "## Packages",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No package records were summarized.");
  } else {
    lines.push("| Status | Package | Version | Directory | Tarballs |");
    lines.push("|---|---|---:|---|---:|");
    for (const pkg of report.packages) {
      lines.push(
        `| \`${pkg.status}\` | \`${pkg.name}\` | \`${pkg.version}\` | \`${pkg.package_dir}\` | \`${pkg.tarballs.length}\` |`,
      );
    }
  }

  if (report.tarballs.length) {
    lines.push("", "## Tarballs", "");
    for (const tarball of report.tarballs)
      lines.push(
        `- \`${tarball.file}\` — \`${tarball.sha256 || "no-sha256"}\``,
      );
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

  logger.info("Summarizing npm packages.");

  const discovery = readJsonFile(
    resolvePath(args.discovery_report_file, repoRoot),
    null,
  );
  const packagesArtifact = readJsonFile(
    resolvePath(args.packages_file, repoRoot),
    null,
  );
  const validation = readJsonFile(
    resolvePath(args.validation_report_file, repoRoot),
    null,
  );
  const pack = readJsonFile(resolvePath(args.pack_report_file, repoRoot), null);
  const publish = readJsonFile(
    resolvePath(args.publish_report_file, repoRoot),
    null,
  );

  const basePackages = filterPackages(
    extractPackages(packagesArtifact, discovery, validation),
    args,
  );
  const packages = basePackages.map((pkg) =>
    normalizePackageSummary(pkg, validation, pack, publish),
  );
  const tarballs = tarballRecords(pack);
  const artifactFiles = scanArtifactFiles(
    resolvePath(args.artifact_dir, repoRoot),
    repoRoot,
  );

  const errors = [
    ...(args.fail_if_empty && packages.length === 0
      ? ["No package records were summarized."]
      : []),
    ...packages.flatMap((pkg) =>
      pkg.errors.map((error) => `${pkg.name}: ${error}`),
    ),
  ];
  const warnings = packages.flatMap((pkg) =>
    pkg.warnings.map((warning) => `${pkg.name}: ${warning}`),
  );
  const failed = packages.filter((pkg) => pkg.failed).length;

  if (args.fail_on_failed_packages && failed > 0) {
    errors.push(`${failed} package(s) have failed status.`);
  }

  const ok = errors.length === 0;
  const status = ok ? (packages.length ? "summarized" : "empty") : "failed";

  const report = {
    schema_version: 1,
    type: "npm-package-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: getGitMetadata(repoRoot),
    config: {
      discovery_report_file: toRelativePath(
        args.discovery_report_file,
        repoRoot,
      ),
      packages_file: toRelativePath(args.packages_file, repoRoot),
      validation_report_file: toRelativePath(
        args.validation_report_file,
        repoRoot,
      ),
      pack_report_file: toRelativePath(args.pack_report_file, repoRoot),
      publish_report_file: toRelativePath(args.publish_report_file, repoRoot),
      artifact_dir: toRelativePath(args.artifact_dir, repoRoot),
      output_file: toRelativePath(args.output_file, repoRoot),
      summary_file: toRelativePath(args.summary_file, repoRoot),
      dry_run: args.dry_run,
    },
    source_statuses: {
      discovery: discovery?.status || "missing",
      validation: validation?.status || "missing",
      pack: pack?.status || "missing",
      publish: publish?.status || "missing",
    },
    totals: {
      packages: packages.length,
      valid: packages.filter((pkg) => pkg.valid).length,
      packed: packages.filter((pkg) => pkg.packed).length,
      published: packages.filter((pkg) => pkg.published).length,
      already_published: packages.filter((pkg) => pkg.already_published).length,
      failed,
      tarballs: tarballs.length,
      artifact_files: artifactFiles.length,
      errors: errors.length,
      warnings: warnings.length,
      duration_ms:
        Number(validation?.totals?.duration_ms || 0) +
        Number(pack?.totals?.duration_ms || 0) +
        Number(publish?.totals?.duration_ms || 0),
    },
    packages,
    tarballs,
    artifact_files: artifactFiles,
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

  setOutput("npm_summarize_packages_file", report.config.output_file);
  setOutput("npm_summarize_packages_summary_file", report.config.summary_file);
  setOutput("npm_summarize_packages_status", report.status);
  setOutput("npm_summarize_packages_ok", report.ok ? "true" : "false");
  setOutput("npm_summarize_packages_count", String(report.totals.packages));
  setOutput("npm_summarize_packages_tarballs", String(report.totals.tarballs));

  if (args.write_step_summary) appendStepSummary(markdown);
  if (args.print) console.log(JSON.stringify(report, null, 2));

  if (!ok && args.fail_on_error) process.exitCode = 1;
}

main().catch((error) => {
  logger.error(logger.formatError(error));
  process.exitCode = 1;
});
