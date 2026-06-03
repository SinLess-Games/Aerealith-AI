#!/usr/bin/env node
// .github/scripts/docker/summarize-images.js
// =============================================================================
// Aerealith AI — Docker Image Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Consolidate Docker discovery, build, and publish artifacts into one CI
//   summary report for workflow summaries, release notes, and downstream jobs.
//
// Input:
//   - .github/docker/summarize-images.json
//   - .github/docker/summarize-images.jsonc
//   - .github/docker/summarize-images.yaml
//   - .github/docker/summarize-images.yml
//   - artifacts/docker/discover-images.json
//   - artifacts/ci/dockerfiles.json
//   - artifacts/docker/build-images.json
//   - artifacts/docker/publish-images.json
//
// Output:
//   - artifacts/docker/summarize-images.json
//   - artifacts/docker/summarize-images.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not call Docker.
//   - Reads prior CI artifacts and produces a single normalized image inventory.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[docker-summary] ${message}`),
    warn: (message) => console.warn(`[docker-summary] WARN: ${message}`),
    error: (message) => console.error(`[docker-summary] ERROR: ${message}`),
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

const DEFAULT_CONFIG_CANDIDATES = [
  ".github/docker/summarize-images.json",
  ".github/docker/summarize-images.jsonc",
  ".github/docker/summarize-images.yaml",
  ".github/docker/summarize-images.yml",
  ".github/docker/images.json",
  ".github/docker/images.jsonc",
  ".github/docker/images.yaml",
  ".github/docker/images.yml",
  "docker/summarize-images.json",
  "docker/summarize-images.jsonc",
  "docker/summarize-images.yaml",
  "docker/summarize-images.yml",
  "docker/images.json",
  "docker/images.jsonc",
  "docker/images.yaml",
  "docker/images.yml",
];

const DEFAULT_DISCOVERY_REPORT_FILE = "artifacts/docker/discover-images.json";
const DEFAULT_DOCKERFILES_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_BUILD_REPORT_FILE = "artifacts/docker/build-images.json";
const DEFAULT_PUBLISH_REPORT_FILE = "artifacts/docker/publish-images.json";
const DEFAULT_OUTPUT_FILE = "artifacts/docker/summarize-images.json";
const DEFAULT_SUMMARY_FILE = "artifacts/docker/summarize-images.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.DOCKER_SUMMARIZE_IMAGES_CONFIG_FILE || "",
    discovery_report_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_DISCOVERY_REPORT_FILE ||
      DEFAULT_DISCOVERY_REPORT_FILE,
    dockerfiles_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_DOCKERFILES_FILE ||
      DEFAULT_DOCKERFILES_FILE,
    build_report_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_BUILD_REPORT_FILE ||
      DEFAULT_BUILD_REPORT_FILE,
    publish_report_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_PUBLISH_REPORT_FILE ||
      DEFAULT_PUBLISH_REPORT_FILE,

    output_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.DOCKER_SUMMARIZE_IMAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_images: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE,
    ),
    exclude_images: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_EXCLUDE_PROJECTS,
    ),
    include_registries: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_REGISTRIES,
    ),
    exclude_registries: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_EXCLUDE_REGISTRIES,
    ),
    include_statuses: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_STATUSES,
    ),
    exclude_statuses: normalizeStringList(
      process.env.DOCKER_SUMMARIZE_IMAGES_EXCLUDE_STATUSES,
    ),

    use_config: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_USE_CONFIG,
      true,
    ),
    use_discovery_report: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_USE_DISCOVERY_REPORT,
      true,
    ),
    use_dockerfiles: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_USE_DOCKERFILES,
      true,
    ),
    use_build_report: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_USE_BUILD_REPORT,
      true,
    ),
    use_publish_report: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_USE_PUBLISH_REPORT,
      true,
    ),

    include_raw_records: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_RAW,
      false,
    ),
    include_failures: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_FAILURES,
      true,
    ),
    include_warnings: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_WARNINGS,
      true,
    ),
    include_successful: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_INCLUDE_SUCCESSFUL,
      true,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_failed_images: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_FAIL_ON_FAILED_IMAGES,
      false,
    ),
    fail_on_invalid_images: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_FAIL_ON_INVALID_IMAGES,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_FAIL_ON_ERROR,
      true,
    ),

    max_images: normalizeInteger(
      process.env.DOCKER_SUMMARIZE_IMAGES_MAX_IMAGES,
      0,
    ),
    max_refs: normalizeInteger(process.env.DOCKER_SUMMARIZE_IMAGES_MAX_REFS, 0),
    max_failures: normalizeInteger(
      process.env.DOCKER_SUMMARIZE_IMAGES_MAX_FAILURES,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.DOCKER_SUMMARIZE_IMAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.DOCKER_SUMMARIZE_IMAGES_STEP_SUMMARY,
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

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--discovery-report" || arg === "--discover-report") {
      args.discovery_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dockerfiles") {
      args.dockerfiles_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--build-report") {
      args.build_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--publish-report") {
      args.publish_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-image") {
      args.include_images.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "--exclude-image") {
      args.exclude_images.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-project") {
      args.include_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-project") {
      args.exclude_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-registry") {
      args.include_registries.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-registry") {
      args.exclude_registries.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-status") {
      args.include_statuses.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-status") {
      args.exclude_statuses.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--use-config") {
      args.use_config = true;
      continue;
    }

    if (arg === "--no-config") {
      args.use_config = false;
      continue;
    }

    if (arg === "--use-discovery-report") {
      args.use_discovery_report = true;
      continue;
    }

    if (arg === "--no-discovery-report") {
      args.use_discovery_report = false;
      continue;
    }

    if (arg === "--use-dockerfiles") {
      args.use_dockerfiles = true;
      continue;
    }

    if (arg === "--no-dockerfiles") {
      args.use_dockerfiles = false;
      continue;
    }

    if (arg === "--use-build-report") {
      args.use_build_report = true;
      continue;
    }

    if (arg === "--no-build-report") {
      args.use_build_report = false;
      continue;
    }

    if (arg === "--use-publish-report") {
      args.use_publish_report = true;
      continue;
    }

    if (arg === "--no-publish-report") {
      args.use_publish_report = false;
      continue;
    }

    if (arg === "--include-raw") {
      args.include_raw_records = true;
      continue;
    }

    if (arg === "--no-raw") {
      args.include_raw_records = false;
      continue;
    }

    if (arg === "--include-failures") {
      args.include_failures = true;
      continue;
    }

    if (arg === "--no-failures") {
      args.include_failures = false;
      continue;
    }

    if (arg === "--include-warnings") {
      args.include_warnings = true;
      continue;
    }

    if (arg === "--no-warnings") {
      args.include_warnings = false;
      continue;
    }

    if (arg === "--include-successful") {
      args.include_successful = true;
      continue;
    }

    if (arg === "--no-successful") {
      args.include_successful = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--fail-on-failed-images") {
      args.fail_on_failed_images = true;
      continue;
    }

    if (arg === "--no-fail-on-failed-images") {
      args.fail_on_failed_images = false;
      continue;
    }

    if (arg === "--fail-on-invalid-images") {
      args.fail_on_invalid_images = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-images") {
      args.fail_on_invalid_images = false;
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

    if (arg === "--max-images") {
      args.max_images = normalizeInteger(argv[index + 1], args.max_images);
      index += 1;
      continue;
    }

    if (arg === "--max-refs") {
      args.max_refs = normalizeInteger(argv[index + 1], args.max_refs);
      index += 1;
      continue;
    }

    if (arg === "--max-failures") {
      args.max_failures = normalizeInteger(argv[index + 1], args.max_failures);
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

  args.include_images = [...new Set(args.include_images)];
  args.exclude_images = [...new Set(args.exclude_images)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.include_registries = [...new Set(args.include_registries)];
  args.exclude_registries = [...new Set(args.exclude_registries)];
  args.include_statuses = [...new Set(args.include_statuses)];
  args.exclude_statuses = [...new Set(args.exclude_statuses)];
  args.max_images = Math.max(0, args.max_images);
  args.max_refs = Math.max(0, args.max_refs);
  args.max_failures = Math.max(0, args.max_failures);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Docker Image Summary

Usage:
  node .github/scripts/docker/summarize-images.js [options]

Examples:
  node .github/scripts/docker/summarize-images.js
  node .github/scripts/docker/summarize-images.js --build-report artifacts/docker/build-images.json
  node .github/scripts/docker/summarize-images.js --publish-report artifacts/docker/publish-images.json
  node .github/scripts/docker/summarize-images.js --fail-on-failed-images

Options:
      --repo <owner/repo>                 Repository slug.
      --config <file>                     Summary config file.
      --discovery-report <file>           Discovery report file.
      --dockerfiles <file>                Dockerfiles artifact file.
      --build-report <file>               Build report file.
      --publish-report <file>             Publish report file.
      --include <list>                    Include image names.
      --exclude <list>                    Exclude image names.
      --include-project <list>            Include project names.
      --exclude-project <list>            Exclude project names.
      --include-registry <list>           Include registries.
      --exclude-registry <list>           Exclude registries.
      --include-status <list>             Include normalized image statuses.
      --exclude-status <list>             Exclude normalized image statuses.
      --use-config                        Use config image records. Default.
      --no-config                         Ignore config image records.
      --use-discovery-report              Use Docker discovery report. Default.
      --no-discovery-report               Ignore Docker discovery report.
      --use-dockerfiles                   Use Dockerfiles artifact. Default.
      --no-dockerfiles                    Ignore Dockerfiles artifact.
      --use-build-report                  Use Docker build report. Default.
      --no-build-report                   Ignore Docker build report.
      --use-publish-report                Use Docker publish report. Default.
      --no-publish-report                 Ignore Docker publish report.
      --include-raw                       Include raw source records in JSON.
      --no-raw                            Omit raw source records. Default.
      --include-failures                  Include failure details. Default.
      --no-failures                       Omit failure details.
      --include-warnings                  Include warning details. Default.
      --no-warnings                       Omit warning details.
      --include-successful                Include successful image summaries. Default.
      --no-successful                     Only include failed/invalid/warning image summaries.
      --fail-if-empty                     Exit non-zero when no images are summarized.
      --fail-on-failed-images             Exit non-zero when any image failed.
      --fail-on-invalid-images            Exit non-zero when any image is invalid.
      --fail-on-error                     Exit non-zero on summary failure. Default.
      --no-fail-on-error                  Do not fail when summary reports problems.
      --max-images <number>               Maximum image summaries.
      --max-refs <number>                 Maximum refs preserved per image.
      --max-failures <number>             Maximum failures preserved in report.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not write files.
      --no-print                          Do not print JSON report.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(
    stripJsonc(fs.readFileSync(absolutePath, "utf8")),
    fallback,
  );
}

function parseYamlScalar(value) {
  const source = normalizeString(value);

  if (!source) return "";
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+$/.test(source)) return Number(source);

  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }

  if (source.startsWith("[") && source.endsWith("]")) {
    return source
      .slice(1, -1)
      .split(",")
      .map((item) => parseYamlScalar(item.trim()))
      .filter((item) => item !== "");
  }

  return source;
}

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;

    if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index).trimEnd();
    }
  }

  return line.trimEnd();
}

function parseSimpleSummaryYaml(text) {
  const config = {};
  const images = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let current = null;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");

      if (section === "images" || section === "docker_images") {
        config.images = images;
      }

      current = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (
      (section === "images" || section === "docker_images") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      images.push(current);

      const rest = trimmed.replace(/^-\s*/, "");
      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        current[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (current && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      current[key] = parseYamlScalar(value);
    }
  }

  return config;
}

function readConfigFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const extension = path.extname(absolutePath).toLowerCase();
  const text = fs.readFileSync(absolutePath, "utf8");

  if (extension === ".json" || extension === ".jsonc") {
    return safeJsonParse(stripJsonc(text), null);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleSummaryYaml(text);
  }

  return safeJsonParse(stripJsonc(text), null);
}

function findConfigFile(args, repoRoot) {
  if (args.config_file) {
    const absolutePath = resolvePath(args.config_file, repoRoot);

    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.config_file;
  }

  for (const candidate of DEFAULT_CONFIG_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function normalizeImageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/dockerfile$/i, "")
    .replace(/^dockerfile[.-]?/i, "");
}

function normalizeRegistry(value) {
  return normalizeString(value)
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function imageHasTag(ref) {
  const value = normalizeString(ref);
  const slashIndex = value.lastIndexOf("/");
  const colonIndex = value.lastIndexOf(":");

  return colonIndex > slashIndex;
}

function removeImageTag(ref) {
  const value = normalizeString(ref);

  if (!imageHasTag(value)) return value;

  return value.slice(0, value.lastIndexOf(":"));
}

function imageTag(ref) {
  const value = normalizeString(ref);

  if (!imageHasTag(value)) return "";

  return value.slice(value.lastIndexOf(":") + 1);
}

function imageNameFromRef(ref) {
  const repo = removeImageTag(ref);
  const parts = repo.split("/");

  return normalizeImageName(parts[parts.length - 1] || repo);
}

function registryFromRef(ref) {
  const value = removeImageTag(ref);
  const firstPart = value.split("/")[0] || "";

  if (
    firstPart.includes(".") ||
    firstPart.includes(":") ||
    firstPart === "localhost"
  ) {
    return normalizeRegistry(firstPart);
  }

  return "";
}

function safeId(value) {
  return (
    normalizeString(value, "docker-summary")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "docker-summary"
  );
}

function compactArray(values, limit = 0) {
  const output = [...new Set(normalizeStringList(values))].sort();

  return limit > 0 ? output.slice(0, limit) : output;
}

function compactObjects(values, keyFn, limit = 0) {
  const seen = new Map();

  for (const value of values) {
    const key = keyFn(value);

    if (!key || seen.has(key)) continue;

    seen.set(key, value);
  }

  const output = [...seen.values()];

  return limit > 0 ? output.slice(0, limit) : output;
}

function configImageRecords(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.images) ? config.images : []),
    ...(Array.isArray(config.docker_images) ? config.docker_images : []),
    ...(Array.isArray(config.dockerImages) ? config.dockerImages : []),
  ];

  if (config.image && typeof config.image === "object") {
    records.push(config.image);
  }

  if (
    !records.length &&
    (config.name || config.image_name || config.image || config.dockerfile)
  ) {
    records.push(config);
  }

  return records;
}

function artifactImageRecords(artifact) {
  if (!artifact) return [];

  return [
    ...(Array.isArray(artifact.images) ? artifact.images : []),
    ...(Array.isArray(artifact.dockerfiles) ? artifact.dockerfiles : []),
    ...(Array.isArray(artifact.targets) ? artifact.targets : []),
    ...(Array.isArray(artifact.selected_images)
      ? artifact.selected_images
      : []),
  ];
}

function resultRecords(artifact) {
  if (!artifact) return [];

  return Array.isArray(artifact.results) ? artifact.results : [];
}

function failureRecords(artifact) {
  if (!artifact) return [];

  return Array.isArray(artifact.failures) ? artifact.failures : [];
}

function normalizeRecord(record, sourceType, phase) {
  const imageRefs = compactArray([
    ...(Array.isArray(record.image_refs) ? record.image_refs : []),
    ...(Array.isArray(record.published_refs) ? record.published_refs : []),
    ...(Array.isArray(record.target_refs) ? record.target_refs : []),
    ...(record.image ? [record.image] : []),
    ...(record.target_image ? [record.target_image] : []),
    ...(record.source_image ? [record.source_image] : []),
  ]);

  const publishRefs = Array.isArray(record.publish_refs)
    ? record.publish_refs.map((item) => ({
        source_ref: normalizeString(item.source_ref),
        target_ref: normalizeString(item.target_ref),
        tag: normalizeString(
          item.tag || imageTag(item.target_ref || item.source_ref),
        ),
      }))
    : [];

  const refDerivedName =
    imageRefs.map(imageNameFromRef).find(Boolean) ||
    publishRefs
      .map((item) => imageNameFromRef(item.target_ref || item.source_ref))
      .find(Boolean);

  const name = normalizeImageName(
    record.name ||
      record.image_name ||
      record.imageName ||
      record.image ||
      refDerivedName ||
      record.project ||
      "",
  );

  const registry =
    normalizeRegistry(record.registry) ||
    imageRefs.map(registryFromRef).find(Boolean) ||
    publishRefs
      .map((item) => registryFromRef(item.target_ref || item.source_ref))
      .find(Boolean) ||
    "";

  const status = normalizeString(
    record.status,
    phase === "discovery" ? "discovered" : "unknown",
  ).toLowerCase();

  return {
    id: safeId(`${sourceType}:${phase}:${name || refDerivedName || "image"}`),
    source_type: sourceType,
    phase,
    name,
    image_name: name,
    project: normalizeString(
      record.project || record.project_name || record.projectName || name,
    ),
    registry,
    namespace: normalizeString(record.namespace),
    dockerfile: toPosixPath(record.dockerfile || ""),
    context: toPosixPath(record.context || record.root || ""),
    target: normalizeString(record.target),
    status,
    success:
      record.success === undefined
        ? status !== "failed" && status !== "invalid"
        : Boolean(record.success),
    valid:
      record.valid === undefined ? status !== "invalid" : Boolean(record.valid),
    enabled: record.enabled === undefined ? true : Boolean(record.enabled),
    tags: compactArray(record.tags || []),
    platforms: compactArray(record.platforms || []),
    image_refs: imageRefs,
    published_refs: compactArray(record.published_refs || []),
    publish_refs: publishRefs,
    errors: compactArray(record.errors || []),
    warnings: compactArray(record.warnings || []),
    duration_ms: Number(record.duration_ms || 0),
    totals: record.totals || {},
    raw: record,
  };
}

function collectRecords(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;

  const discoveryReport = args.use_discovery_report
    ? readJsonFile(args.discovery_report_file, repoRoot, null)
    : null;
  const dockerfilesArtifact = args.use_dockerfiles
    ? readJsonFile(args.dockerfiles_file, repoRoot, null)
    : null;
  const buildReport = args.use_build_report
    ? readJsonFile(args.build_report_file, repoRoot, null)
    : null;
  const publishReport = args.use_publish_report
    ? readJsonFile(args.publish_report_file, repoRoot, null)
    : null;

  const records = [
    ...configImageRecords(config).map((record) =>
      normalizeRecord(record, "config", "config"),
    ),
    ...artifactImageRecords(discoveryReport).map((record) =>
      normalizeRecord(record, "discovery-report", "discovery"),
    ),
    ...artifactImageRecords(dockerfilesArtifact).map((record) =>
      normalizeRecord(record, "dockerfiles-artifact", "discovery"),
    ),
    ...artifactImageRecords(buildReport).map((record) =>
      normalizeRecord(record, "build-report", "build-plan"),
    ),
    ...resultRecords(buildReport).map((record) =>
      normalizeRecord(record, "build-report-result", "build"),
    ),
    ...artifactImageRecords(publishReport).map((record) =>
      normalizeRecord(record, "publish-report", "publish-plan"),
    ),
    ...resultRecords(publishReport).map((record) =>
      normalizeRecord(record, "publish-report-result", "publish"),
    ),
    ...failureRecords(buildReport).map((record) =>
      normalizeRecord(record, "build-failure", "build"),
    ),
    ...failureRecords(publishReport).map((record) =>
      normalizeRecord(record, "publish-failure", "publish"),
    ),
  ];

  return {
    config_file: configFile,
    config_available: Boolean(config),
    discovery_report_file: toRelativePath(
      resolvePath(args.discovery_report_file, repoRoot),
      repoRoot,
    ),
    discovery_report_available: Boolean(discoveryReport),
    dockerfiles_file: toRelativePath(
      resolvePath(args.dockerfiles_file, repoRoot),
      repoRoot,
    ),
    dockerfiles_available: Boolean(dockerfilesArtifact),
    build_report_file: toRelativePath(
      resolvePath(args.build_report_file, repoRoot),
      repoRoot,
    ),
    build_report_available: Boolean(buildReport),
    publish_report_file: toRelativePath(
      resolvePath(args.publish_report_file, repoRoot),
      repoRoot,
    ),
    publish_report_available: Boolean(publishReport),
    source_statuses: {
      discovery: normalizeString(discoveryReport?.status),
      dockerfiles: normalizeString(dockerfilesArtifact?.status),
      build: normalizeString(buildReport?.status),
      publish: normalizeString(publishReport?.status),
    },
    source_totals: {
      discovery: discoveryReport?.totals || {},
      dockerfiles: dockerfilesArtifact?.totals || {},
      build: buildReport?.totals || {},
      publish: publishReport?.totals || {},
    },
    records,
  };
}

function imageKey(record) {
  return `${record.name || record.image_name || imageNameFromRef(record.image_refs[0] || "")}:${record.project || ""}`;
}

function resolveImageStatus(summary) {
  if (summary.status_counts.failed > 0) return "failed";
  if (summary.status_counts.invalid > 0) return "invalid";
  if (summary.status_counts["missing-local"] > 0) return "missing-local";
  if (summary.status_counts.published > 0) return "published";
  if (summary.status_counts.pushed > 0) return "pushed";
  if (summary.status_counts.built > 0) return "built";
  if (summary.status_counts.migrated > 0) return "migrated";
  if (summary.status_counts.tagged > 0) return "tagged";
  if (summary.status_counts.planned > 0) return "planned";
  if (summary.status_counts.pending > 0) return "pending";
  if (summary.status_counts.current > 0) return "current";
  if (summary.discovered) return "discovered";

  return "unknown";
}

function createEmptyImageSummary(record) {
  return {
    id: safeId(`${record.name || "image"}:${record.project || ""}`),
    name: record.name,
    image_name: record.image_name,
    project: record.project,
    registry: record.registry,
    namespace: record.namespace,
    dockerfiles: [],
    contexts: [],
    targets: [],
    tags: [],
    platforms: [],
    image_refs: [],
    published_refs: [],
    publish_refs: [],
    phases: [],
    sources: [],
    statuses: [],
    status_counts: {},
    source_type_counts: {},
    phase_counts: {},
    discovered: false,
    configured: false,
    build_planned: false,
    built: false,
    pushed: false,
    publish_planned: false,
    published: false,
    failed: false,
    invalid: false,
    warnings: [],
    errors: [],
    failure_records: [],
    duration_ms: 0,
    raw_records: [],
    status: "unknown",
  };
}

function mergeRecordIntoSummary(summary, record, args) {
  summary.name = summary.name || record.name;
  summary.image_name = summary.image_name || record.image_name;
  summary.project = summary.project || record.project;
  summary.registry = summary.registry || record.registry;
  summary.namespace = summary.namespace || record.namespace;

  summary.dockerfiles.push(record.dockerfile);
  summary.contexts.push(record.context);
  summary.targets.push(record.target);
  summary.tags.push(...record.tags);
  summary.platforms.push(...record.platforms);
  summary.image_refs.push(...record.image_refs);
  summary.published_refs.push(...record.published_refs);
  summary.publish_refs.push(...record.publish_refs);
  summary.phases.push(record.phase);
  summary.sources.push(record.source_type);
  summary.statuses.push(record.status);
  summary.warnings.push(...record.warnings);
  summary.errors.push(...record.errors);
  summary.duration_ms += Number(record.duration_ms || 0);

  summary.status_counts[record.status] =
    (summary.status_counts[record.status] || 0) + 1;
  summary.source_type_counts[record.source_type] =
    (summary.source_type_counts[record.source_type] || 0) + 1;
  summary.phase_counts[record.phase] =
    (summary.phase_counts[record.phase] || 0) + 1;

  if (record.phase === "discovery") summary.discovered = true;
  if (record.phase === "config") summary.configured = true;
  if (record.phase === "build-plan") summary.build_planned = true;
  if (
    record.phase === "build" &&
    ["built", "pushed", "planned"].includes(record.status)
  )
    summary.built = true;
  if (record.status === "pushed") summary.pushed = true;
  if (record.phase === "publish-plan") summary.publish_planned = true;
  if (record.phase === "publish" && record.status === "published")
    summary.published = true;
  if (record.status === "failed" || record.success === false)
    summary.failed = true;
  if (record.status === "invalid" || record.valid === false)
    summary.invalid = true;

  if (
    record.errors.length ||
    record.status === "failed" ||
    record.status === "invalid"
  ) {
    summary.failure_records.push({
      source_type: record.source_type,
      phase: record.phase,
      status: record.status,
      errors: record.errors,
      warnings: record.warnings,
      image_refs: record.image_refs,
      duration_ms: record.duration_ms,
    });
  }

  if (args.include_raw_records) {
    summary.raw_records.push(record.raw);
  }
}

function finalizeImageSummary(summary, args) {
  summary.dockerfiles = compactArray(summary.dockerfiles);
  summary.contexts = compactArray(summary.contexts);
  summary.targets = compactArray(summary.targets);
  summary.tags = compactArray(summary.tags);
  summary.platforms = compactArray(summary.platforms);
  summary.image_refs = compactArray(summary.image_refs, args.max_refs);
  summary.published_refs = compactArray(summary.published_refs, args.max_refs);
  summary.publish_refs = compactObjects(
    summary.publish_refs,
    (item) => `${item.source_ref}->${item.target_ref}`,
    args.max_refs,
  );
  summary.phases = compactArray(summary.phases);
  summary.sources = compactArray(summary.sources);
  summary.statuses = compactArray(summary.statuses);
  summary.warnings = compactArray(summary.warnings);
  summary.errors = compactArray(summary.errors);
  summary.failure_records = args.include_failures
    ? summary.failure_records.slice(0, args.max_failures || undefined)
    : [];
  summary.status = resolveImageStatus(summary);

  if (!args.include_warnings) {
    summary.warnings = [];
  }

  if (!args.include_raw_records) {
    delete summary.raw_records;
  }

  return summary;
}

function summarizeImages(records, args) {
  const summaries = new Map();

  for (const record of records) {
    const key = imageKey(record);

    if (
      !record.name &&
      !record.image_refs.length &&
      !record.publish_refs.length
    )
      continue;

    if (!summaries.has(key)) {
      summaries.set(key, createEmptyImageSummary(record));
    }

    mergeRecordIntoSummary(summaries.get(key), record, args);
  }

  return [...summaries.values()]
    .map((summary) => finalizeImageSummary(summary, args))
    .filter((summary) => imageMatchesFilters(summary, args))
    .filter((summary) => {
      if (args.include_successful) return true;
      return summary.failed || summary.invalid || summary.warnings.length > 0;
    })
    .sort((left, right) => {
      const statusWeight = statusRank(left.status) - statusRank(right.status);

      if (statusWeight !== 0) return statusWeight;

      return (
        left.name.localeCompare(right.name) ||
        left.project.localeCompare(right.project)
      );
    })
    .slice(0, args.max_images > 0 ? args.max_images : undefined);
}

function statusRank(status) {
  const ranks = {
    failed: 0,
    invalid: 1,
    "missing-local": 2,
    pending: 3,
    planned: 4,
    published: 5,
    pushed: 6,
    built: 7,
    tagged: 8,
    current: 9,
    discovered: 10,
    unknown: 11,
  };

  return ranks[status] ?? 50;
}

function imageMatchesFilters(summary, args) {
  if (
    args.include_images.length &&
    !args.include_images.includes(summary.name)
  ) {
    return false;
  }

  if (args.exclude_images.includes(summary.name)) {
    return false;
  }

  if (
    args.include_projects.length &&
    !args.include_projects.includes(summary.project)
  ) {
    return false;
  }

  if (args.exclude_projects.includes(summary.project)) {
    return false;
  }

  if (
    args.include_registries.length &&
    !args.include_registries.includes(summary.registry)
  ) {
    return false;
  }

  if (args.exclude_registries.includes(summary.registry)) {
    return false;
  }

  if (
    args.include_statuses.length &&
    !args.include_statuses.includes(summary.status)
  ) {
    return false;
  }

  if (args.exclude_statuses.includes(summary.status)) {
    return false;
  }

  return true;
}

function summarizeTotals(images, records) {
  const imageRefs = compactArray(images.flatMap((image) => image.image_refs));
  const publishedRefs = compactArray(
    images.flatMap((image) => image.published_refs),
  );
  const targetRefs = compactArray(
    images.flatMap((image) =>
      image.publish_refs.map((item) => item.target_ref),
    ),
  );

  return {
    images: images.length,
    records: records.length,
    configured: images.filter((image) => image.configured).length,
    discovered: images.filter((image) => image.discovered).length,
    build_planned: images.filter((image) => image.build_planned).length,
    built: images.filter((image) => image.built).length,
    pushed: images.filter((image) => image.pushed).length,
    publish_planned: images.filter((image) => image.publish_planned).length,
    published: images.filter((image) => image.published).length,
    failed: images.filter((image) => image.failed).length,
    invalid: images.filter((image) => image.invalid).length,
    warnings: images.filter((image) => image.warnings.length > 0).length,
    image_refs: imageRefs.length,
    published_refs: publishedRefs.length,
    target_refs: targetRefs.length,
    projects: compactArray(images.map((image) => image.project)).length,
    registries: compactArray(images.map((image) => image.registry)).length,
    dockerfiles: compactArray(images.flatMap((image) => image.dockerfiles))
      .length,
    platforms: compactArray(images.flatMap((image) => image.platforms)).length,
    duration_ms: images.reduce(
      (sum, image) => sum + Number(image.duration_ms || 0),
      0,
    ),
  };
}

function groupImages(images, key) {
  const groups = {};

  for (const image of images) {
    const group = image[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        configured: 0,
        discovered: 0,
        built: 0,
        pushed: 0,
        published: 0,
        failed: 0,
        invalid: 0,
        warnings: 0,
        refs: 0,
      };
    }

    groups[group].count += 1;
    if (image.configured) groups[group].configured += 1;
    if (image.discovered) groups[group].discovered += 1;
    if (image.built) groups[group].built += 1;
    if (image.pushed) groups[group].pushed += 1;
    if (image.published) groups[group].published += 1;
    if (image.failed) groups[group].failed += 1;
    if (image.invalid) groups[group].invalid += 1;
    if (image.warnings.length) groups[group].warnings += 1;
    groups[group].refs += image.image_refs.length;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function groupByStatus(images) {
  const groups = {};

  for (const image of images) {
    if (!groups[image.status]) {
      groups[image.status] = {
        count: 0,
        refs: 0,
        published_refs: 0,
      };
    }

    groups[image.status].count += 1;
    groups[image.status].refs += image.image_refs.length;
    groups[image.status].published_refs += image.published_refs.length;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
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

function createReport(args, repoRoot, sources, images) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeTotals(images, sources.records);
  const failures = images
    .filter((image) => image.failed || image.invalid || image.errors.length)
    .flatMap((image) =>
      image.failure_records.length
        ? image.failure_records.map((failure) => ({
            image: image.name,
            project: image.project,
            registry: image.registry,
            status: failure.status,
            phase: failure.phase,
            source_type: failure.source_type,
            errors: failure.errors,
            warnings: failure.warnings,
          }))
        : [
            {
              image: image.name,
              project: image.project,
              registry: image.registry,
              status: image.status,
              phase: "summary",
              source_type: "summary",
              errors: image.errors,
              warnings: image.warnings,
            },
          ],
    )
    .slice(0, args.max_failures || undefined);

  const status =
    totals.images === 0
      ? "empty"
      : totals.failed > 0
        ? "failed"
        : totals.invalid > 0
          ? "invalid"
          : totals.warnings > 0
            ? "warning"
            : totals.published > 0
              ? "published"
              : totals.pushed > 0
                ? "pushed"
                : totals.built > 0
                  ? "built"
                  : totals.discovered > 0
                    ? "discovered"
                    : "summarized";

  return {
    schema_version: 1,
    type: "docker-image-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: sources.config_file || null,
      config_available: sources.config_available,
      discovery_report_file: sources.discovery_report_file,
      discovery_report_available: sources.discovery_report_available,
      dockerfiles_file: sources.dockerfiles_file,
      dockerfiles_available: sources.dockerfiles_available,
      build_report_file: sources.build_report_file,
      build_report_available: sources.build_report_available,
      publish_report_file: sources.publish_report_file,
      publish_report_available: sources.publish_report_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      use_config: args.use_config,
      use_discovery_report: args.use_discovery_report,
      use_dockerfiles: args.use_dockerfiles,
      use_build_report: args.use_build_report,
      use_publish_report: args.use_publish_report,
      include_raw_records: args.include_raw_records,
      include_failures: args.include_failures,
      include_warnings: args.include_warnings,
      include_successful: args.include_successful,
      max_images: args.max_images,
      max_refs: args.max_refs,
      dry_run: args.dry_run,
    },
    source_statuses: sources.source_statuses,
    source_totals: sources.source_totals,
    discovery: {
      source_records: sources.records.length,
      summarized_images: images.length,
    },
    totals: {
      ...totals,
      duration_human: formatDuration(totals.duration_ms),
      ok: totals.failed === 0 && totals.invalid === 0,
    },
    groups: {
      by_status: groupByStatus(images),
      by_project: groupImages(images, "project"),
      by_registry: groupImages(images, "registry"),
    },
    images,
    image_refs: compactArray(images.flatMap((image) => image.image_refs)),
    published_refs: compactArray(
      images.flatMap((image) => image.published_refs),
    ),
    target_refs: compactArray(
      images.flatMap((image) =>
        image.publish_refs.map((item) => item.target_ref),
      ),
    ),
    failures: args.include_failures ? failures : [],
    warnings: args.include_warnings
      ? images.flatMap((image) =>
          image.warnings.map((warning) => ({
            image: image.name,
            project: image.project,
            warning,
          })),
        )
      : [],
    status,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🐳 ${PROJECT_NAME} Docker Image Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Images: \`${report.totals.images}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Built: \`${report.totals.built}\``,
    `- Pushed: \`${report.totals.pushed}\``,
    `- Published: \`${report.totals.published}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📥 Sources",
    "",
    `- Config file: \`${report.config.config_file || "not found"}\``,
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
    `- Discovery report: \`${report.config.discovery_report_file}\``,
    `- Discovery report available: \`${report.config.discovery_report_available ? "true" : "false"}\``,
    `- Dockerfiles artifact: \`${report.config.dockerfiles_file}\``,
    `- Dockerfiles available: \`${report.config.dockerfiles_available ? "true" : "false"}\``,
    `- Build report: \`${report.config.build_report_file}\``,
    `- Build report available: \`${report.config.build_report_available ? "true" : "false"}\``,
    `- Publish report: \`${report.config.publish_report_file}\``,
    `- Publish report available: \`${report.config.publish_report_available ? "true" : "false"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Source records: \`${report.discovery.source_records}\``,
    `- Configured images: \`${report.totals.configured}\``,
    `- Discovered images: \`${report.totals.discovered}\``,
    `- Build planned: \`${report.totals.build_planned}\``,
    `- Publish planned: \`${report.totals.publish_planned}\``,
    `- Image refs: \`${report.totals.image_refs}\``,
    `- Published refs: \`${report.totals.published_refs}\``,
    `- Target refs: \`${report.totals.target_refs}\``,
    `- Projects: \`${report.totals.projects}\``,
    `- Registries: \`${report.totals.registries}\``,
    `- Dockerfiles: \`${report.totals.dockerfiles}\``,
    `- Platforms: \`${report.totals.platforms}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🎯 Image Inventory",
    "",
  ];

  if (!report.images.length) {
    lines.push("No Docker images were summarized.");
  } else {
    lines.push(
      "| Status | Image | Project | Registry | Refs | Published Refs | Dockerfiles |",
    );
    lines.push("|---|---|---|---|---:|---:|---:|");

    for (const image of report.images) {
      lines.push(
        `| \`${image.status}\` | \`${escapeMarkdown(image.name || "unknown")}\` | \`${escapeMarkdown(image.project || "none")}\` | \`${escapeMarkdown(image.registry || "none")}\` | \`${image.image_refs.length}\` | \`${image.published_refs.length}\` | \`${image.dockerfiles.length}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Image | Project | Phase | Status | Errors |");
    lines.push("|---|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${escapeMarkdown(failure.image || "unknown")}\` | \`${escapeMarkdown(failure.project || "none")}\` | \`${escapeMarkdown(failure.phase || "unknown")}\` | \`${escapeMarkdown(failure.status || "unknown")}\` | ${normalizeStringList(failure.errors).map(escapeMarkdown).join("<br>") || "No error details provided."} |`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, 100)) {
      lines.push(
        `- \`${escapeMarkdown(warning.image)}\`: ${escapeMarkdown(warning.warning)}`,
      );
    }

    if (report.warnings.length > 100) {
      lines.push(
        `- ...and \`${report.warnings.length - 100}\` more warning(s).`,
      );
    }
  }

  if (report.published_refs.length) {
    lines.push("");
    lines.push("## 🏷️ Published References");
    lines.push("");

    for (const ref of report.published_refs.slice(0, 100)) {
      lines.push(`- \`${ref}\``);
    }

    if (report.published_refs.length > 100) {
      lines.push(
        `- ...and \`${report.published_refs.length - 100}\` more published reference(s).`,
      );
    }
  }

  if (report.image_refs.length && !report.published_refs.length) {
    lines.push("");
    lines.push("## 🏷️ Image References");
    lines.push("");

    for (const ref of report.image_refs.slice(0, 100)) {
      lines.push(`- \`${ref}\``);
    }

    if (report.image_refs.length > 100) {
      lines.push(
        `- ...and \`${report.image_refs.length - 100}\` more image reference(s).`,
      );
    }
  }

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
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

function writeGitHubOutputs(report) {
  setGitHubOutput("docker_summarize_images_file", report.config.output_file);
  setGitHubOutput(
    "docker_summarize_images_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("docker_summarize_images_status", report.status);
  setGitHubOutput(
    "docker_summarize_images_ok",
    report.totals.ok ? "true" : "false",
  );
  setGitHubOutput(
    "docker_summarize_images_count",
    String(report.totals.images),
  );
  setGitHubOutput(
    "docker_summarize_images_configured",
    String(report.totals.configured),
  );
  setGitHubOutput(
    "docker_summarize_images_discovered",
    String(report.totals.discovered),
  );
  setGitHubOutput("docker_summarize_images_built", String(report.totals.built));
  setGitHubOutput(
    "docker_summarize_images_pushed",
    String(report.totals.pushed),
  );
  setGitHubOutput(
    "docker_summarize_images_published",
    String(report.totals.published),
  );
  setGitHubOutput(
    "docker_summarize_images_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "docker_summarize_images_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "docker_summarize_images_warnings",
    String(report.totals.warnings),
  );
  setGitHubOutput(
    "docker_summarize_images_refs_count",
    String(report.totals.image_refs),
  );
  setGitHubOutput(
    "docker_summarize_images_published_refs_count",
    String(report.totals.published_refs),
  );
  setGitHubOutput("docker_summarize_images_refs", report.image_refs.join(","));
  setGitHubOutput(
    "docker_summarize_images_refs_json",
    JSON.stringify(report.image_refs),
  );
  setGitHubOutput(
    "docker_summarize_images_published_refs",
    report.published_refs.join(","),
  );
  setGitHubOutput(
    "docker_summarize_images_published_refs_json",
    JSON.stringify(report.published_refs),
  );
  setGitHubOutput(
    "docker_summarize_images_names",
    report.images.map((image) => image.name).join(","),
  );
  setGitHubOutput(
    "docker_summarize_images_names_json",
    JSON.stringify(report.images.map((image) => image.name)),
  );
  setGitHubOutput(
    "docker_summarize_images_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing Docker images.");

  const sources = collectRecords(args, repoRoot);
  const images = summarizeImages(sources.records, args);
  const report = createReport(args, repoRoot, sources, images);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  if (args.fail_if_empty && report.totals.images === 0) {
    logger.error("No Docker images were summarized.");
    process.exitCode = 1;
  }

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
    console.log(logger.redact(json).trim());
  }

  if (
    args.fail_on_error &&
    args.fail_on_failed_images &&
    report.totals.failed > 0
  ) {
    logger.error(
      `Docker image summary found ${report.totals.failed} failed image(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_error &&
    args.fail_on_invalid_images &&
    report.totals.invalid > 0
  ) {
    logger.error(
      `Docker image summary found ${report.totals.invalid} invalid image(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_empty && report.totals.images === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
