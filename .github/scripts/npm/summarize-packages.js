#!/usr/bin/env node
// .github/scripts/npm/summarize-packages.js
// =============================================================================
// Aerealith AI — NPM Package Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Consolidate npm package discovery, pack, and publish artifacts into one CI
//   summary report for workflow summaries, release notes, and downstream jobs.
//
// Input:
//   - .github/npm/summarize-packages.json
//   - .github/npm/summarize-packages.jsonc
//   - .github/npm/summarize-packages.yaml
//   - .github/npm/summarize-packages.yml
//   - .github/npm/packages.json
//   - artifacts/npm/discover-packages.json
//   - artifacts/ci/npm-packages.json
//   - artifacts/npm/pack-packages.json
//   - artifacts/npm/publish-packages.json
//
// Output:
//   - artifacts/npm/summarize-packages.json
//   - artifacts/npm/summarize-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not call npm, pnpm, yarn, or bun.
//   - Reads prior CI artifacts and produces a normalized package inventory.
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
    info: (message) => console.log(`[npm-summary] ${message}`),
    warn: (message) => console.warn(`[npm-summary] WARN: ${message}`),
    error: (message) => console.error(`[npm-summary] ERROR: ${message}`),
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
  ".github/npm/summarize-packages.json",
  ".github/npm/summarize-packages.jsonc",
  ".github/npm/summarize-packages.yaml",
  ".github/npm/summarize-packages.yml",
  ".github/npm/packages.json",
  ".github/npm/packages.jsonc",
  ".github/npm/packages.yaml",
  ".github/npm/packages.yml",
  "npm/summarize-packages.json",
  "npm/summarize-packages.jsonc",
  "npm/summarize-packages.yaml",
  "npm/summarize-packages.yml",
  "npm/packages.json",
  "npm/packages.jsonc",
  "npm/packages.yaml",
  "npm/packages.yml",
];

const DEFAULT_DISCOVERY_REPORT_FILE = "artifacts/npm/discover-packages.json";
const DEFAULT_PACKAGES_FILE = "artifacts/ci/npm-packages.json";
const DEFAULT_PACK_REPORT_FILE = "artifacts/npm/pack-packages.json";
const DEFAULT_PUBLISH_REPORT_FILE = "artifacts/npm/publish-packages.json";
const DEFAULT_OUTPUT_FILE = "artifacts/npm/summarize-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/npm/summarize-packages.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|\/\/registry\.npmjs\.org\/:_authToken=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|--\/\/[^=]+:_authToken\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

    config_file: process.env.NPM_SUMMARIZE_PACKAGES_CONFIG_FILE || "",
    discovery_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_DISCOVERY_REPORT_FILE ||
      DEFAULT_DISCOVERY_REPORT_FILE,
    packages_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PACKAGES_FILE || DEFAULT_PACKAGES_FILE,
    pack_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PACK_REPORT_FILE ||
      DEFAULT_PACK_REPORT_FILE,
    publish_report_file:
      process.env.NPM_SUMMARIZE_PACKAGES_PUBLISH_REPORT_FILE ||
      DEFAULT_PUBLISH_REPORT_FILE,

    output_file:
      process.env.NPM_SUMMARIZE_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.NPM_SUMMARIZE_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_packages: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE_PROJECTS,
    ),
    include_scopes: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_SCOPES,
    ),
    exclude_scopes: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE_SCOPES,
    ),
    include_registries: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_REGISTRIES,
    ),
    exclude_registries: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE_REGISTRIES,
    ),
    include_statuses: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_STATUSES,
    ),
    exclude_statuses: normalizeStringList(
      process.env.NPM_SUMMARIZE_PACKAGES_EXCLUDE_STATUSES,
    ),

    use_config: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_USE_CONFIG,
      true,
    ),
    use_discovery_report: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_USE_DISCOVERY_REPORT,
      true,
    ),
    use_packages_file: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_USE_PACKAGES_FILE,
      true,
    ),
    use_pack_report: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_USE_PACK_REPORT,
      true,
    ),
    use_publish_report: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_USE_PUBLISH_REPORT,
      true,
    ),

    include_raw_records: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_RAW,
      false,
    ),
    include_failures: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_FAILURES,
      true,
    ),
    include_warnings: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_WARNINGS,
      true,
    ),
    include_successful: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_INCLUDE_SUCCESSFUL,
      true,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_failed_packages: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_ON_FAILED_PACKAGES,
      false,
    ),
    fail_on_invalid_packages: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_ON_INVALID_PACKAGES,
      false,
    ),
    fail_on_duplicate_names: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_FAIL_ON_DUPLICATE_NAMES,
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
    max_tarballs: normalizeInteger(
      process.env.NPM_SUMMARIZE_PACKAGES_MAX_TARBALLS,
      0,
    ),
    max_failures: normalizeInteger(
      process.env.NPM_SUMMARIZE_PACKAGES_MAX_FAILURES,
      100,
    ),

    dry_run: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NPM_SUMMARIZE_PACKAGES_WRITE_SUMMARY,
      true,
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

    if (arg === "--publish-report") {
      args.publish_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-package") {
      args.include_packages.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "--exclude-package") {
      args.exclude_packages.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--include-scope") {
      args.include_scopes.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-scope") {
      args.exclude_scopes.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--use-packages-file") {
      args.use_packages_file = true;
      continue;
    }

    if (arg === "--no-packages-file") {
      args.use_packages_file = false;
      continue;
    }

    if (arg === "--use-pack-report") {
      args.use_pack_report = true;
      continue;
    }

    if (arg === "--no-pack-report") {
      args.use_pack_report = false;
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

    if (arg === "--fail-on-failed-packages") {
      args.fail_on_failed_packages = true;
      continue;
    }

    if (arg === "--no-fail-on-failed-packages") {
      args.fail_on_failed_packages = false;
      continue;
    }

    if (arg === "--fail-on-invalid-packages") {
      args.fail_on_invalid_packages = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-packages") {
      args.fail_on_invalid_packages = false;
      continue;
    }

    if (arg === "--fail-on-duplicate-names") {
      args.fail_on_duplicate_names = true;
      continue;
    }

    if (arg === "--no-fail-on-duplicate-names") {
      args.fail_on_duplicate_names = false;
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

    if (arg === "--max-tarballs") {
      args.max_tarballs = normalizeInteger(argv[index + 1], args.max_tarballs);
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

  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.include_scopes = [...new Set(args.include_scopes)];
  args.exclude_scopes = [...new Set(args.exclude_scopes)];
  args.include_registries = [...new Set(args.include_registries)];
  args.exclude_registries = [...new Set(args.exclude_registries)];
  args.include_statuses = [...new Set(args.include_statuses)];
  args.exclude_statuses = [...new Set(args.exclude_statuses)];
  args.max_packages = Math.max(0, args.max_packages);
  args.max_tarballs = Math.max(0, args.max_tarballs);
  args.max_failures = Math.max(0, args.max_failures);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Summary

Usage:
  node .github/scripts/npm/summarize-packages.js [options]

Examples:
  node .github/scripts/npm/summarize-packages.js
  node .github/scripts/npm/summarize-packages.js --pack-report artifacts/npm/pack-packages.json
  node .github/scripts/npm/summarize-packages.js --publish-report artifacts/npm/publish-packages.json
  node .github/scripts/npm/summarize-packages.js --fail-on-failed-packages

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Summary config file.
      --discovery-report <file>              Discovery report file.
      --packages <file>                      Package matrix artifact file.
      --pack-report <file>                   Pack report file.
      --publish-report <file>                Publish report file.
      --include <list>                       Include package names.
      --exclude <list>                       Exclude package names.
      --include-project <list>               Include project names.
      --exclude-project <list>               Exclude project names.
      --include-scope <list>                 Include npm scopes.
      --exclude-scope <list>                 Exclude npm scopes.
      --include-registry <list>              Include registries.
      --exclude-registry <list>              Exclude registries.
      --include-status <list>                Include normalized package statuses.
      --exclude-status <list>                Exclude normalized package statuses.
      --use-config                           Use config records. Default.
      --no-config                            Ignore config records.
      --use-discovery-report                 Use npm discovery report. Default.
      --no-discovery-report                  Ignore npm discovery report.
      --use-packages-file                    Use package matrix artifact. Default.
      --no-packages-file                     Ignore package matrix artifact.
      --use-pack-report                      Use npm pack report. Default.
      --no-pack-report                       Ignore npm pack report.
      --use-publish-report                   Use npm publish report. Default.
      --no-publish-report                    Ignore npm publish report.
      --include-raw                          Include raw source records in JSON.
      --no-raw                               Omit raw source records. Default.
      --include-failures                     Include failure details. Default.
      --no-failures                          Omit failure details.
      --include-warnings                     Include warning details. Default.
      --no-warnings                          Omit warning details.
      --include-successful                   Include successful package summaries. Default.
      --no-successful                        Only include failed/invalid/warning package summaries.
      --fail-if-empty                        Exit non-zero when no packages are summarized.
      --fail-on-failed-packages              Exit non-zero when any package failed.
      --fail-on-invalid-packages             Exit non-zero when any package is invalid.
      --fail-on-duplicate-names              Exit non-zero when duplicate package names are found.
      --fail-on-error                        Exit non-zero on summary failure. Default.
      --no-fail-on-error                     Do not fail when summary reports problems.
      --max-packages <number>                Maximum package summaries.
      --max-tarballs <number>                Maximum tarballs preserved per package.
      --max-failures <number>                Maximum failures preserved in report.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not write files.
      --no-print                             Do not print JSON report.
      --no-step-summary                      Do not append GitHub step summary.
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
  const packages = [];
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

      if (section === "packages" || section === "npm_packages") {
        config.packages = packages;
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
      (section === "packages" || section === "npm_packages") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      packages.push(current);

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

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeRegistry(value) {
  const registry = normalizeString(value);

  if (!registry) return "";

  return registry.endsWith("/") ? registry : `${registry}/`;
}

function normalizeScope(packageName) {
  const name = normalizeString(packageName);

  if (!name.startsWith("@")) return "";

  return name.split("/")[0] || "";
}

function safeId(value) {
  return (
    normalizeString(value, "npm-summary")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/@-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "npm-summary"
  );
}

function compactArray(values, limit = 0) {
  const output = [
    ...new Set(
      values
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ].sort();

  return limit > 0 ? output.slice(0, limit) : output;
}

function compactObjects(values, keyFn, limit = 0) {
  const seen = new Map();

  for (const value of values) {
    if (!value || typeof value !== "object") continue;

    const key = keyFn(value);

    if (!key || seen.has(key)) continue;

    seen.set(key, value);
  }

  const output = [...seen.values()];

  return limit > 0 ? output.slice(0, limit) : output;
}

function packageRecordsFromConfig(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.packages) ? config.packages : []),
    ...(Array.isArray(config.npm_packages) ? config.npm_packages : []),
    ...(Array.isArray(config.npmPackages) ? config.npmPackages : []),
  ];

  if (config.package && typeof config.package === "object") {
    records.push(config.package);
  }

  if (
    !records.length &&
    (config.name || config.package_json || config.packageJson || config.path)
  ) {
    records.push(config);
  }

  return records;
}

function packageRecordsFromArtifact(artifact) {
  if (!artifact) return [];

  return [
    ...(Array.isArray(artifact.packages) ? artifact.packages : []),
    ...(Array.isArray(artifact.npm_packages) ? artifact.npm_packages : []),
    ...(Array.isArray(artifact.publishable_packages)
      ? artifact.publishable_packages
      : []),
    ...(Array.isArray(artifact.selected_packages)
      ? artifact.selected_packages
      : []),
    ...(Array.isArray(artifact.matrix?.include) ? artifact.matrix.include : []),
    ...(Array.isArray(artifact.publish_matrix?.include)
      ? artifact.publish_matrix.include
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

function normalizeTarballRecord(record) {
  if (!record) return null;

  if (typeof record === "string") {
    return {
      package: "",
      name: "",
      version: "",
      file: record,
      filename: path.basename(record),
      size_bytes: 0,
      sha256: "",
      integrity: "",
      exists: false,
    };
  }

  return {
    package: normalizeString(record.package || record.name),
    name: normalizeString(record.name || record.package),
    version: normalizeString(record.version),
    file: toPosixPath(record.file || record.path || record.filename || ""),
    filename: normalizeString(
      record.filename || path.basename(record.file || record.path || ""),
    ),
    size_bytes: Number(record.size_bytes || record.size || 0),
    sha256: normalizeString(record.sha256),
    sha512: normalizeString(record.sha512),
    integrity: normalizeString(record.integrity),
    shasum: normalizeString(record.shasum),
    exists: Boolean(record.exists),
  };
}

function normalizeRecord(record, sourceType, phase) {
  const rawTarballs = [
    ...(Array.isArray(record.tarballs) ? record.tarballs : []),
    ...(record.tarball ? [record.tarball] : []),
    ...(record.tgz ? [record.tgz] : []),
    ...(record.file && /\.tgz$/i.test(String(record.file))
      ? [record.file]
      : []),
  ];

  const tarballs = rawTarballs.map(normalizeTarballRecord).filter(Boolean);

  const name =
    normalizePackageName(
      record.name ||
        record.package ||
        record.package_name ||
        record.packageName,
    ) ||
    normalizePackageName(
      tarballs.map((tarball) => tarball.package || tarball.name).find(Boolean),
    );

  const registry = normalizeRegistry(
    record.registry ||
      record.publish_config?.registry ||
      record.publishConfig?.registry,
  );

  const status = normalizeString(
    record.status,
    phase === "discovery" ? "discovered" : "unknown",
  ).toLowerCase();
  const success =
    record.success === undefined
      ? !["failed", "invalid"].includes(status)
      : Boolean(record.success);

  const valid =
    record.valid === undefined ? status !== "invalid" : Boolean(record.valid);

  return {
    id: safeId(
      `${sourceType}:${phase}:${name || record.package_json || record.path || "package"}`,
    ),
    source_type: sourceType,
    phase,
    name,
    package_name: name,
    version: normalizeString(record.version),
    project: normalizeString(
      record.project || record.project_name || record.projectName || name,
    ),
    scope: normalizeString(record.scope || normalizeScope(name)),
    package_json: toPosixPath(
      record.package_json ||
        record.packageJson ||
        record.package_json_file ||
        record.packageJsonFile ||
        "",
    ),
    path: toPosixPath(record.path || record.root || ""),
    registry,
    access: normalizeString(
      record.access ||
        record.publish_config?.access ||
        record.publishConfig?.access,
    ),
    tag: normalizeString(
      record.tag ||
        record.default_tag ||
        record.defaultTag ||
        record.publish_config?.tag ||
        record.publishConfig?.tag,
    ),
    status,
    success,
    valid,
    enabled: record.enabled === undefined ? true : Boolean(record.enabled),
    private: Boolean(record.private),
    publishable: Boolean(record.publishable),
    workspace: Boolean(record.workspace),
    package_manager: normalizeString(
      record.package_manager || record.packageManager,
    ),
    type: normalizeString(record.type),
    tarball: toPosixPath(record.tarball || ""),
    publish_target: toPosixPath(
      record.publish_target || record.publishTarget || "",
    ),
    tarballs,
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
  const packagesArtifact = args.use_packages_file
    ? readJsonFile(args.packages_file, repoRoot, null)
    : null;
  const packReport = args.use_pack_report
    ? readJsonFile(args.pack_report_file, repoRoot, null)
    : null;
  const publishReport = args.use_publish_report
    ? readJsonFile(args.publish_report_file, repoRoot, null)
    : null;

  const records = [
    ...packageRecordsFromConfig(config).map((record) =>
      normalizeRecord(record, "config", "config"),
    ),

    ...packageRecordsFromArtifact(discoveryReport).map((record) =>
      normalizeRecord(record, "discovery-report", "discovery"),
    ),
    ...packageRecordsFromArtifact(packagesArtifact).map((record) =>
      normalizeRecord(record, "packages-artifact", "discovery"),
    ),

    ...packageRecordsFromArtifact(packReport).map((record) =>
      normalizeRecord(record, "pack-report", "pack-plan"),
    ),
    ...resultRecords(packReport).map((record) =>
      normalizeRecord(record, "pack-report-result", "pack"),
    ),

    ...packageRecordsFromArtifact(publishReport).map((record) =>
      normalizeRecord(record, "publish-report", "publish-plan"),
    ),
    ...resultRecords(publishReport).map((record) =>
      normalizeRecord(record, "publish-report-result", "publish"),
    ),

    ...failureRecords(packReport).map((record) =>
      normalizeRecord(record, "pack-failure", "pack"),
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
    packages_file: toRelativePath(
      resolvePath(args.packages_file, repoRoot),
      repoRoot,
    ),
    packages_available: Boolean(packagesArtifact),
    pack_report_file: toRelativePath(
      resolvePath(args.pack_report_file, repoRoot),
      repoRoot,
    ),
    pack_report_available: Boolean(packReport),
    publish_report_file: toRelativePath(
      resolvePath(args.publish_report_file, repoRoot),
      repoRoot,
    ),
    publish_report_available: Boolean(publishReport),
    source_statuses: {
      discovery: normalizeString(discoveryReport?.status),
      packages: normalizeString(packagesArtifact?.status),
      pack: normalizeString(packReport?.status),
      publish: normalizeString(publishReport?.status),
    },
    source_totals: {
      discovery: discoveryReport?.totals || {},
      packages: packagesArtifact?.totals || {},
      pack: packReport?.totals || {},
      publish: publishReport?.totals || {},
    },
    records,
  };
}

function packageKey(record) {
  return (
    record.name ||
    record.package_json ||
    record.path ||
    record.tarball ||
    record.publish_target ||
    record.id
  );
}

function createEmptyPackageSummary(record) {
  return {
    id: safeId(`${record.name || "package"}:${record.project || ""}`),
    name: record.name,
    package_name: record.package_name,
    version: record.version,
    project: record.project,
    scope: record.scope,
    registry: record.registry,
    access: record.access,
    tag: record.tag,
    package_jsons: [],
    paths: [],
    package_managers: [],
    types: [],
    tags: [],
    tarballs: [],
    publish_targets: [],
    phases: [],
    sources: [],
    statuses: [],
    status_counts: {},
    source_type_counts: {},
    phase_counts: {},
    configured: false,
    discovered: false,
    packed: false,
    published: false,
    skipped_existing: false,
    publishable: false,
    private: false,
    workspace: false,
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
  summary.package_name = summary.package_name || record.package_name;
  summary.version = summary.version || record.version;
  summary.project = summary.project || record.project;
  summary.scope = summary.scope || record.scope;
  summary.registry = summary.registry || record.registry;
  summary.access = summary.access || record.access;
  summary.tag = summary.tag || record.tag;

  summary.package_jsons.push(record.package_json);
  summary.paths.push(record.path);
  summary.package_managers.push(record.package_manager);
  summary.types.push(record.type);
  summary.tags.push(record.tag);
  summary.tarballs.push(...record.tarballs);
  summary.publish_targets.push(record.publish_target);
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

  if (record.phase === "config") summary.configured = true;
  if (record.phase === "discovery") summary.discovered = true;
  if (record.phase === "pack" && ["packed", "planned"].includes(record.status))
    summary.packed = true;
  if (record.phase === "publish" && record.status === "published")
    summary.published = true;
  if (record.status === "skipped-existing") summary.skipped_existing = true;
  if (record.publishable) summary.publishable = true;
  if (record.private) summary.private = true;
  if (record.workspace) summary.workspace = true;
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
      tarballs: record.tarballs,
      duration_ms: record.duration_ms,
    });
  }

  if (args.include_raw_records) {
    summary.raw_records.push(record.raw);
  }
}

function resolvePackageStatus(summary) {
  if (summary.failed || summary.status_counts.failed > 0) return "failed";
  if (summary.invalid || summary.status_counts.invalid > 0) return "invalid";
  if (summary.published || summary.status_counts.published > 0)
    return "published";
  if (summary.skipped_existing || summary.status_counts["skipped-existing"] > 0)
    return "skipped-existing";
  if (summary.packed || summary.status_counts.packed > 0) return "packed";
  if (summary.status_counts.planned > 0) return "planned";
  if (summary.status_counts.skipped > 0) return "skipped";
  if (summary.publishable) return "publishable";
  if (summary.discovered) return "discovered";
  if (summary.configured) return "configured";

  return "unknown";
}

function finalizePackageSummary(summary, args) {
  summary.package_jsons = compactArray(summary.package_jsons);
  summary.paths = compactArray(summary.paths);
  summary.package_managers = compactArray(summary.package_managers);
  summary.types = compactArray(summary.types);
  summary.tags = compactArray(summary.tags);
  summary.tarballs = compactObjects(
    summary.tarballs,
    (tarball) =>
      tarball.file || tarball.filename || `${tarball.name}:${tarball.version}`,
    args.max_tarballs,
  );
  summary.publish_targets = compactArray(summary.publish_targets);
  summary.phases = compactArray(summary.phases);
  summary.sources = compactArray(summary.sources);
  summary.statuses = compactArray(summary.statuses);
  summary.warnings = compactArray(summary.warnings);
  summary.errors = compactArray(summary.errors);
  summary.failure_records = args.include_failures
    ? summary.failure_records.slice(0, args.max_failures || undefined)
    : [];
  summary.status = resolvePackageStatus(summary);

  if (!args.include_warnings) {
    summary.warnings = [];
  }

  if (!args.include_raw_records) {
    delete summary.raw_records;
  }

  return summary;
}

function summarizePackages(records, args) {
  const summaries = new Map();

  for (const record of records) {
    const key = packageKey(record);

    if (!key) continue;

    if (!summaries.has(key)) {
      summaries.set(key, createEmptyPackageSummary(record));
    }

    mergeRecordIntoSummary(summaries.get(key), record, args);
  }

  return [...summaries.values()]
    .map((summary) => finalizePackageSummary(summary, args))
    .filter((summary) => packageMatchesFilters(summary, args))
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
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);
}

function statusRank(status) {
  const ranks = {
    failed: 0,
    invalid: 1,
    "skipped-existing": 2,
    published: 3,
    packed: 4,
    planned: 5,
    publishable: 6,
    discovered: 7,
    configured: 8,
    skipped: 9,
    unknown: 10,
  };

  return ranks[status] ?? 50;
}

function packageMatchesFilters(summary, args) {
  if (
    args.include_packages.length &&
    !args.include_packages.includes(summary.name)
  ) {
    return false;
  }

  if (args.exclude_packages.includes(summary.name)) {
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
    args.include_scopes.length &&
    !args.include_scopes.includes(summary.scope)
  ) {
    return false;
  }

  if (args.exclude_scopes.includes(summary.scope)) {
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

function findDuplicatePackageNames(packages) {
  const names = new Map();

  for (const pkg of packages) {
    if (!pkg.name) continue;

    if (!names.has(pkg.name)) {
      names.set(pkg.name, []);
    }

    names.get(pkg.name).push(...pkg.package_jsons);
  }

  return [...names.entries()]
    .filter(([, files]) => [...new Set(files)].length > 1)
    .map(([name, files]) => ({
      name,
      files: [...new Set(files)].sort(),
    }));
}

function summarizeTotals(packages, records) {
  const tarballs = packages.flatMap((pkg) => pkg.tarballs);
  const duplicateNames = findDuplicatePackageNames(packages);

  return {
    packages: packages.length,
    records: records.length,
    configured: packages.filter((pkg) => pkg.configured).length,
    discovered: packages.filter((pkg) => pkg.discovered).length,
    publishable: packages.filter((pkg) => pkg.publishable).length,
    private: packages.filter((pkg) => pkg.private).length,
    workspace: packages.filter((pkg) => pkg.workspace).length,
    packed: packages.filter((pkg) => pkg.packed).length,
    published: packages.filter((pkg) => pkg.published).length,
    skipped_existing: packages.filter((pkg) => pkg.skipped_existing).length,
    failed: packages.filter((pkg) => pkg.failed).length,
    invalid: packages.filter((pkg) => pkg.invalid).length,
    warnings: packages.filter((pkg) => pkg.warnings.length > 0).length,
    duplicate_names: duplicateNames.length,
    tarballs: tarballs.length,
    tarballs_existing: tarballs.filter((tarball) => tarball.exists).length,
    tarball_bytes: tarballs.reduce(
      (sum, tarball) => sum + Number(tarball.size_bytes || 0),
      0,
    ),
    projects: compactArray(packages.map((pkg) => pkg.project)).length,
    scopes: compactArray(packages.map((pkg) => pkg.scope)).length,
    registries: compactArray(packages.map((pkg) => pkg.registry)).length,
    package_managers: compactArray(
      packages.flatMap((pkg) => pkg.package_managers),
    ).length,
    duration_ms: packages.reduce(
      (sum, pkg) => sum + Number(pkg.duration_ms || 0),
      0,
    ),
  };
}

function groupPackages(packages, key) {
  const groups = {};

  for (const pkg of packages) {
    const group = pkg[key] || "none";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        publishable: 0,
        packed: 0,
        published: 0,
        failed: 0,
        invalid: 0,
        warnings: 0,
        tarballs: 0,
      };
    }

    groups[group].count += 1;
    if (pkg.publishable) groups[group].publishable += 1;
    if (pkg.packed) groups[group].packed += 1;
    if (pkg.published) groups[group].published += 1;
    if (pkg.failed) groups[group].failed += 1;
    if (pkg.invalid) groups[group].invalid += 1;
    if (pkg.warnings.length) groups[group].warnings += 1;
    groups[group].tarballs += pkg.tarballs.length;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function groupByStatus(packages) {
  const groups = {};

  for (const pkg of packages) {
    if (!groups[pkg.status]) {
      groups[pkg.status] = {
        count: 0,
        tarballs: 0,
      };
    }

    groups[pkg.status].count += 1;
    groups[pkg.status].tarballs += pkg.tarballs.length;
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

function createReport(args, repoRoot, sources, packages) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeTotals(packages, sources.records);
  const duplicateNames = findDuplicatePackageNames(packages);

  const failures = packages
    .filter((pkg) => pkg.failed || pkg.invalid || pkg.errors.length)
    .flatMap((pkg) =>
      pkg.failure_records.length
        ? pkg.failure_records.map((failure) => ({
            package: pkg.name,
            version: pkg.version,
            project: pkg.project,
            registry: pkg.registry,
            status: failure.status,
            phase: failure.phase,
            source_type: failure.source_type,
            errors: failure.errors,
            warnings: failure.warnings,
          }))
        : [
            {
              package: pkg.name,
              version: pkg.version,
              project: pkg.project,
              registry: pkg.registry,
              status: pkg.status,
              phase: "summary",
              source_type: "summary",
              errors: pkg.errors,
              warnings: pkg.warnings,
            },
          ],
    )
    .slice(0, args.max_failures || undefined);

  const status =
    totals.packages === 0
      ? "empty"
      : totals.failed > 0
        ? "failed"
        : totals.invalid > 0
          ? "invalid"
          : totals.duplicate_names > 0
            ? "duplicate-names"
            : totals.warnings > 0
              ? "warning"
              : totals.published > 0
                ? "published"
                : totals.packed > 0
                  ? "packed"
                  : totals.publishable > 0
                    ? "publishable"
                    : totals.discovered > 0
                      ? "discovered"
                      : "summarized";

  return {
    schema_version: 1,
    type: "npm-package-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: sources.config_file || null,
      config_available: sources.config_available,
      discovery_report_file: sources.discovery_report_file,
      discovery_report_available: sources.discovery_report_available,
      packages_file: sources.packages_file,
      packages_available: sources.packages_available,
      pack_report_file: sources.pack_report_file,
      pack_report_available: sources.pack_report_available,
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
      use_packages_file: args.use_packages_file,
      use_pack_report: args.use_pack_report,
      use_publish_report: args.use_publish_report,
      include_raw_records: args.include_raw_records,
      include_failures: args.include_failures,
      include_warnings: args.include_warnings,
      include_successful: args.include_successful,
      max_packages: args.max_packages,
      max_tarballs: args.max_tarballs,
      dry_run: args.dry_run,
    },
    source_statuses: sources.source_statuses,
    source_totals: sources.source_totals,
    discovery: {
      source_records: sources.records.length,
      summarized_packages: packages.length,
    },
    totals: {
      ...totals,
      duration_human: formatDuration(totals.duration_ms),
      ok: totals.failed === 0 && totals.invalid === 0,
    },
    groups: {
      by_status: groupByStatus(packages),
      by_project: groupPackages(packages, "project"),
      by_scope: groupPackages(packages, "scope"),
      by_registry: groupPackages(packages, "registry"),
    },
    packages,
    npm_packages: packages,
    publishable_packages: packages.filter((pkg) => pkg.publishable),
    packed_packages: packages.filter((pkg) => pkg.packed),
    published_packages: packages.filter((pkg) => pkg.published),
    tarballs: packages.flatMap((pkg) =>
      pkg.tarballs.map((tarball) => ({
        package: pkg.name,
        version: pkg.version,
        project: pkg.project,
        ...tarball,
      })),
    ),
    duplicate_names: duplicateNames,
    failures: args.include_failures ? failures : [],
    warnings: args.include_warnings
      ? packages.flatMap((pkg) =>
          pkg.warnings.map((warning) => ({
            package: pkg.name,
            version: pkg.version,
            project: pkg.project,
            warning,
          })),
        )
      : [],
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function createMarkdownSummary(report) {
  const lines = [
    `# 📦 ${PROJECT_NAME} NPM Package Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Packages: \`${report.totals.packages}\``,
    `- Publishable: \`${report.totals.publishable}\``,
    `- Packed: \`${report.totals.packed}\``,
    `- Published: \`${report.totals.published}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Duplicate names: \`${report.totals.duplicate_names}\``,
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
    `- Packages artifact: \`${report.config.packages_file}\``,
    `- Packages available: \`${report.config.packages_available ? "true" : "false"}\``,
    `- Pack report: \`${report.config.pack_report_file}\``,
    `- Pack report available: \`${report.config.pack_report_available ? "true" : "false"}\``,
    `- Publish report: \`${report.config.publish_report_file}\``,
    `- Publish report available: \`${report.config.publish_report_available ? "true" : "false"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Source records: \`${report.discovery.source_records}\``,
    `- Configured packages: \`${report.totals.configured}\``,
    `- Discovered packages: \`${report.totals.discovered}\``,
    `- Private packages: \`${report.totals.private}\``,
    `- Workspace packages: \`${report.totals.workspace}\``,
    `- Skipped existing: \`${report.totals.skipped_existing}\``,
    `- Tarballs: \`${report.totals.tarballs}\``,
    `- Existing tarballs: \`${report.totals.tarballs_existing}\``,
    `- Tarball size: \`${formatBytes(report.totals.tarball_bytes)}\``,
    `- Projects: \`${report.totals.projects}\``,
    `- Scopes: \`${report.totals.scopes}\``,
    `- Registries: \`${report.totals.registries}\``,
    `- Package managers: \`${report.totals.package_managers}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🎯 Package Inventory",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No npm packages were summarized.");
  } else {
    lines.push(
      "| Status | Package | Version | Project | Scope | Registry | Tarballs |",
    );
    lines.push("|---|---|---|---|---|---|---:|");

    for (const pkg of report.packages) {
      lines.push(
        `| \`${pkg.status}\` | \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.version || "none")}\` | \`${escapeMarkdown(pkg.project || "none")}\` | \`${escapeMarkdown(pkg.scope || "none")}\` | \`${escapeMarkdown(pkg.registry || "none")}\` | \`${pkg.tarballs.length}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Package | Version | Phase | Status | Errors |");
    lines.push("|---|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${escapeMarkdown(failure.package || "unknown")}\` | \`${escapeMarkdown(failure.version || "none")}\` | \`${escapeMarkdown(failure.phase || "unknown")}\` | \`${escapeMarkdown(failure.status || "unknown")}\` | ${normalizeStringList(failure.errors).map(escapeMarkdown).join("<br>") || "No error details provided."} |`,
      );
    }
  }

  if (report.duplicate_names.length) {
    lines.push("");
    lines.push("## ⚠️ Duplicate Package Names");
    lines.push("");
    lines.push("| Package | Files |");
    lines.push("|---|---|");

    for (const duplicate of report.duplicate_names) {
      lines.push(
        `| \`${escapeMarkdown(duplicate.name)}\` | ${duplicate.files.map((file) => `\`${escapeMarkdown(file)}\``).join("<br>")} |`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, 100)) {
      lines.push(
        `- \`${escapeMarkdown(warning.package)}\`: ${escapeMarkdown(warning.warning)}`,
      );
    }

    if (report.warnings.length > 100) {
      lines.push(
        `- ...and \`${report.warnings.length - 100}\` more warning(s).`,
      );
    }
  }

  if (report.tarballs.length) {
    lines.push("");
    lines.push("## 📦 Tarballs");
    lines.push("");
    lines.push("| Package | File | Size | SHA256 |");
    lines.push("|---|---|---:|---|");

    for (const tarball of report.tarballs.slice(0, 100)) {
      lines.push(
        `| \`${escapeMarkdown(tarball.package || tarball.name || "unknown")}\` | \`${escapeMarkdown(tarball.file || tarball.filename || "unknown")}\` | \`${formatBytes(tarball.size_bytes)}\` | \`${String(tarball.sha256 || "").slice(0, 16)}\` |`,
      );
    }

    if (report.tarballs.length > 100) {
      lines.push(
        `| ... | ...and ${report.tarballs.length - 100} more tarball(s) |  |  |`,
      );
    }
  }

  if (report.published_packages.length) {
    lines.push("");
    lines.push("## 🚀 Published Packages");
    lines.push("");

    for (const pkg of report.published_packages) {
      lines.push(
        `- \`${pkg.name}@${pkg.version || "unknown"}\` using tag \`${pkg.tag || "latest"}\``,
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
  setGitHubOutput("npm_summarize_packages_file", report.config.output_file);
  setGitHubOutput(
    "npm_summarize_packages_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("npm_summarize_packages_status", report.status);
  setGitHubOutput(
    "npm_summarize_packages_ok",
    report.totals.ok ? "true" : "false",
  );
  setGitHubOutput(
    "npm_summarize_packages_count",
    String(report.totals.packages),
  );
  setGitHubOutput(
    "npm_summarize_packages_publishable",
    String(report.totals.publishable),
  );
  setGitHubOutput(
    "npm_summarize_packages_private",
    String(report.totals.private),
  );
  setGitHubOutput(
    "npm_summarize_packages_packed",
    String(report.totals.packed),
  );
  setGitHubOutput(
    "npm_summarize_packages_published",
    String(report.totals.published),
  );
  setGitHubOutput(
    "npm_summarize_packages_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "npm_summarize_packages_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "npm_summarize_packages_warnings",
    String(report.totals.warnings),
  );
  setGitHubOutput(
    "npm_summarize_packages_duplicate_names",
    String(report.totals.duplicate_names),
  );
  setGitHubOutput(
    "npm_summarize_packages_tarballs",
    String(report.totals.tarballs),
  );
  setGitHubOutput(
    "npm_summarize_packages_tarball_bytes",
    String(report.totals.tarball_bytes),
  );
  setGitHubOutput(
    "npm_summarize_packages_names",
    report.packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_summarize_packages_names_json",
    JSON.stringify(report.packages.map((pkg) => pkg.name).filter(Boolean)),
  );
  setGitHubOutput(
    "npm_summarize_packages_publishable_names",
    report.publishable_packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_summarize_packages_publishable_names_json",
    JSON.stringify(
      report.publishable_packages.map((pkg) => pkg.name).filter(Boolean),
    ),
  );
  setGitHubOutput(
    "npm_summarize_packages_published_names",
    report.published_packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_summarize_packages_published_names_json",
    JSON.stringify(
      report.published_packages.map((pkg) => pkg.name).filter(Boolean),
    ),
  );
  setGitHubOutput(
    "npm_summarize_packages_tarball_files",
    report.tarballs
      .map((tarball) => tarball.file)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_summarize_packages_tarball_files_json",
    JSON.stringify(
      report.tarballs.map((tarball) => tarball.file).filter(Boolean),
    ),
  );
  setGitHubOutput(
    "npm_summarize_packages_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing npm packages.");

  const sources = collectRecords(args, repoRoot);
  const packages = summarizePackages(sources.records, args);
  const report = createReport(args, repoRoot, sources, packages);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  if (args.fail_if_empty && report.totals.packages === 0) {
    logger.error("No npm packages were summarized.");
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
    args.fail_on_failed_packages &&
    report.totals.failed > 0
  ) {
    logger.error(
      `npm package summary found ${report.totals.failed} failed package(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_error &&
    args.fail_on_invalid_packages &&
    report.totals.invalid > 0
  ) {
    logger.error(
      `npm package summary found ${report.totals.invalid} invalid package(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_error &&
    args.fail_on_duplicate_names &&
    report.totals.duplicate_names > 0
  ) {
    logger.error(
      `npm package summary found ${report.totals.duplicate_names} duplicate package name group(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_empty && report.totals.packages === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
