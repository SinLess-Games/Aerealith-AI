#!/usr/bin/env node
// .github/scripts/repo/summarize-repo-management.js
// =============================================================================
// Aerealith AI — Repository Management Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Collect repository automation reports from artifacts/repo and produce one
//   clean summary for labels, assignees, milestones, reviewers, branch policy,
//   PR rules, issue/PR linking, and any other repo-management reports.
//
// Input:
//   - artifacts/repo/*.json
//   - Optional config file
//   - Direct CLI/env inputs
//
// Output:
//   - artifacts/repo/repo-management-summary.json
//   - artifacts/repo/repo-management-summary.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Read-only except writing summary artifacts.
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
    info: (message) => console.log(`[repo-management-summary] ${message}`),
    warn: (message) =>
      console.warn(`[repo-management-summary] WARN: ${message}`),
    error: (message) =>
      console.error(`[repo-management-summary] ERROR: ${message}`),
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
  ".github/repo/summarize-repo-management.json",
  ".github/repo/summarize-repo-management.jsonc",
  ".github/repo/summarize-repo-management.yaml",
  ".github/repo/summarize-repo-management.yml",
  ".github/repo/repo-management-summary.json",
  ".github/repo/repo-management-summary.jsonc",
  ".github/repo/repo-management-summary.yaml",
  ".github/repo/repo-management-summary.yml",
  ".github/summarize-repo-management.json",
  ".github/summarize-repo-management.jsonc",
  ".github/summarize-repo-management.yaml",
  ".github/summarize-repo-management.yml",
];

const DEFAULT_INPUT_DIR = "artifacts/repo";
const DEFAULT_OUTPUT_FILE = "artifacts/repo/repo-management-summary.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/repo-management-summary.md";

const DEFAULT_REPORT_ORDER = [
  "repo-assign-labels",
  "repo-assign-assignees",
  "repo-assign-milestones",
  "repo-assign-reviewers",
  "repo-enforce-branch-name",
  "repo-enforce-pr-rules",
  "repo-link-issues-prs",
];

const DEFAULT_EXCLUDE_FILES = [
  "repo-management-summary.json",
  "repo-management-summary.md",
  "summary.json",
  "summary.md",
];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

    config_file: process.env.REPO_MANAGEMENT_SUMMARY_CONFIG_FILE || "",

    input_dir:
      process.env.REPO_MANAGEMENT_SUMMARY_INPUT_DIR ||
      process.env.REPO_AUTOMATION_ARTIFACTS_DIR ||
      DEFAULT_INPUT_DIR,

    output_file:
      process.env.REPO_MANAGEMENT_SUMMARY_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.REPO_MANAGEMENT_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_files: normalizeStringList(
      process.env.REPO_MANAGEMENT_SUMMARY_INCLUDE_FILES || "",
    ),
    exclude_files: normalizeStringList(
      process.env.REPO_MANAGEMENT_SUMMARY_EXCLUDE_FILES ||
        DEFAULT_EXCLUDE_FILES.join(","),
    ),
    include_types: normalizeStringList(
      process.env.REPO_MANAGEMENT_SUMMARY_INCLUDE_TYPES || "",
    ),
    required_types: normalizeStringList(
      process.env.REPO_MANAGEMENT_SUMMARY_REQUIRED_TYPES || "",
    ),

    max_error_items: normalizeInteger(
      process.env.REPO_MANAGEMENT_SUMMARY_MAX_ERRORS,
      50,
    ),
    max_warning_items: normalizeInteger(
      process.env.REPO_MANAGEMENT_SUMMARY_MAX_WARNINGS,
      50,
    ),
    max_report_rows: normalizeInteger(
      process.env.REPO_MANAGEMENT_SUMMARY_MAX_ROWS,
      100,
    ),

    recursive: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_RECURSIVE,
      false,
    ),
    require_reports: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_REQUIRE_REPORTS,
      false,
    ),
    fail_on_missing_required: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_FAIL_ON_MISSING_REQUIRED,
      true,
    ),
    fail_on_report_error: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_FAIL_ON_REPORT_ERROR,
      true,
    ),
    fail_on_warning: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_FAIL_ON_WARNING,
      false,
    ),
    fail_on_invalid_json: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_FAIL_ON_INVALID_JSON,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_FAIL_ON_ERROR,
      true,
    ),

    dry_run: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.REPO_MANAGEMENT_SUMMARY_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.REPO_MANAGEMENT_SUMMARY_STEP_SUMMARY,
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

    if (arg === "--input-dir" || arg === "--artifacts-dir") {
      args.input_dir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-file" || arg === "--include-files") {
      args.include_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-file" || arg === "--exclude-files") {
      args.exclude_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-type" || arg === "--include-types") {
      args.include_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--required-type" || arg === "--required-types") {
      args.required_types.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--recursive") {
      args.recursive = true;
      continue;
    }

    if (arg === "--no-recursive") {
      args.recursive = false;
      continue;
    }

    if (arg === "--require-reports") {
      args.require_reports = true;
      continue;
    }

    if (arg === "--no-require-reports") {
      args.require_reports = false;
      continue;
    }

    if (arg === "--fail-on-missing-required") {
      args.fail_on_missing_required = true;
      continue;
    }

    if (arg === "--no-fail-on-missing-required") {
      args.fail_on_missing_required = false;
      continue;
    }

    if (arg === "--fail-on-report-error") {
      args.fail_on_report_error = true;
      continue;
    }

    if (arg === "--no-fail-on-report-error") {
      args.fail_on_report_error = false;
      continue;
    }

    if (arg === "--fail-on-warning") {
      args.fail_on_warning = true;
      continue;
    }

    if (arg === "--no-fail-on-warning") {
      args.fail_on_warning = false;
      continue;
    }

    if (arg === "--fail-on-invalid-json") {
      args.fail_on_invalid_json = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-json") {
      args.fail_on_invalid_json = false;
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

    if (arg === "--max-errors") {
      args.max_error_items = normalizeInteger(
        argv[index + 1],
        args.max_error_items,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-warnings") {
      args.max_warning_items = normalizeInteger(
        argv[index + 1],
        args.max_warning_items,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-rows") {
      args.max_report_rows = normalizeInteger(
        argv[index + 1],
        args.max_report_rows,
      );
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

  args.repository = normalizeString(args.repository, DEFAULT_REPOSITORY);
  args.input_dir = normalizeString(args.input_dir, DEFAULT_INPUT_DIR);
  args.output_file = normalizeString(args.output_file, DEFAULT_OUTPUT_FILE);
  args.summary_file = normalizeString(args.summary_file, DEFAULT_SUMMARY_FILE);
  args.include_files = [
    ...new Set(args.include_files.map(normalizePathLike).filter(Boolean)),
  ];
  args.exclude_files = [
    ...new Set(args.exclude_files.map(normalizePathLike).filter(Boolean)),
  ];
  args.include_types = [
    ...new Set(args.include_types.map(normalizeString).filter(Boolean)),
  ];
  args.required_types = [
    ...new Set(args.required_types.map(normalizeString).filter(Boolean)),
  ];
  args.max_error_items = Math.max(0, args.max_error_items);
  args.max_warning_items = Math.max(0, args.max_warning_items);
  args.max_report_rows = Math.max(1, args.max_report_rows);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Repository Management Summary

Usage:
  node .github/scripts/repo/summarize-repo-management.js [options]

Examples:
  node .github/scripts/repo/summarize-repo-management.js
  node .github/scripts/repo/summarize-repo-management.js --input-dir artifacts/repo
  node .github/scripts/repo/summarize-repo-management.js --required-types "repo-enforce-pr-rules,repo-enforce-branch-name"
  node .github/scripts/repo/summarize-repo-management.js --fail-on-warning
  node .github/scripts/repo/summarize-repo-management.js --dry-run

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Summary config file.
      --input-dir <dir>                    Repo automation artifacts directory.
      --include-file <list>                Only include matching report filenames.
      --exclude-file <list>                Exclude matching report filenames.
      --include-type <list>                Only include matching report types.
      --required-type <list>               Report type(s) that must be present.
      --recursive                          Scan input directory recursively.
      --no-recursive                       Scan only the input directory. Default.
      --require-reports                    Fail when no reports are found.
      --no-require-reports                 Allow empty report sets. Default.
      --fail-on-missing-required           Fail when a required report is missing. Default.
      --no-fail-on-missing-required        Warn when a required report is missing.
      --fail-on-report-error               Fail when any report has ok=false. Default.
      --no-fail-on-report-error            Do not fail for report failures.
      --fail-on-warning                    Fail when warnings are present.
      --no-fail-on-warning                 Do not fail on warnings. Default.
      --fail-on-invalid-json               Fail on invalid report JSON.
      --no-fail-on-invalid-json            Warn on invalid report JSON. Default.
      --max-errors <number>                Max error details in Markdown. Default: 50.
      --max-warnings <number>              Max warning details in Markdown. Default: 50.
      --max-rows <number>                  Max report rows in Markdown. Default: 100.
      --fail-on-error                      Exit non-zero if summary is not ok. Default.
      --no-fail-on-error                   Do not fail workflow.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not write files.
      --no-print                           Do not print JSON report.
      --no-step-summary                    Do not append GitHub step summary.
`);
}

function normalizePathLike(value) {
  return toPosixPath(normalizeString(value));
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
    event_name: process.env.GITHUB_EVENT_NAME || "",
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

function readJsonFile(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;
  return safeJsonParse(stripJsonc(fs.readFileSync(filePath, "utf8")), fallback);
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

function parseSimpleYaml(text) {
  const config = {};
  const lines = String(text || "").split(/\r?\n/);
  let section = "";

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      continue;
    }

    if (section && /^-\s*/.test(trimmed)) {
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
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
    return parseSimpleYaml(text);
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

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = ["input_dir", "output_file", "summary_file"];

  for (const key of stringKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "include_files",
    "exclude_files",
    "include_types",
    "required_types",
  ];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeStringList(config[key]);
    }
  }

  const booleanKeys = [
    "recursive",
    "require_reports",
    "fail_on_missing_required",
    "fail_on_report_error",
    "fail_on_warning",
    "fail_on_invalid_json",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  const integerKeys = [
    "max_error_items",
    "max_warning_items",
    "max_report_rows",
  ];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.include_files = [
    ...new Set(merged.include_files.map(normalizePathLike).filter(Boolean)),
  ];
  merged.exclude_files = [
    ...new Set(merged.exclude_files.map(normalizePathLike).filter(Boolean)),
  ];
  merged.include_types = [
    ...new Set(merged.include_types.map(normalizeString).filter(Boolean)),
  ];
  merged.required_types = [
    ...new Set(merged.required_types.map(normalizeString).filter(Boolean)),
  ];

  return merged;
}

function listFiles(dirPath, options = {}) {
  if (!isDirectory(dirPath)) return [];

  const files = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && options.recursive) {
      files.push(...listFiles(absolutePath, options));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function fileMatchesList(filePath, patterns, repoRoot, inputDir) {
  if (!patterns.length) return false;

  const basename = toPosixPath(path.basename(filePath));
  const relativeRepo = toRelativePath(filePath, repoRoot);
  const relativeInput = toPosixPath(path.relative(inputDir, filePath));

  return patterns.some((pattern) => {
    const normalizedPattern = normalizePathLike(pattern);

    return (
      basename === normalizedPattern ||
      relativeRepo === normalizedPattern ||
      relativeInput === normalizedPattern ||
      basename.includes(normalizedPattern) ||
      relativeRepo.includes(normalizedPattern) ||
      relativeInput.includes(normalizedPattern)
    );
  });
}

function discoverReportFiles(args, repoRoot) {
  const inputDir = resolvePath(args.input_dir, repoRoot);
  const files = listFiles(inputDir, { recursive: args.recursive })
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".json")
    .filter(
      (filePath) =>
        !fileMatchesList(filePath, args.exclude_files, repoRoot, inputDir),
    )
    .filter((filePath) => {
      if (!args.include_files.length) return true;
      return fileMatchesList(filePath, args.include_files, repoRoot, inputDir);
    })
    .sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right)));

  return {
    input_dir: inputDir,
    files,
  };
}

function readReports(args, repoRoot) {
  const discovered = discoverReportFiles(args, repoRoot);
  const reports = [];
  const invalid = [];

  for (const filePath of discovered.files) {
    const raw = readJsonFile(filePath, null);

    if (!raw || typeof raw !== "object") {
      invalid.push({
        file: toRelativePath(filePath, repoRoot),
        error: "Invalid JSON report.",
      });
      continue;
    }

    const type = normalizeString(
      raw.type || raw.name || path.basename(filePath, ".json"),
    );

    if (args.include_types.length && !args.include_types.includes(type)) {
      continue;
    }

    reports.push({
      file_path: filePath,
      file: toRelativePath(filePath, repoRoot),
      data: raw,
      summary: normalizeReport(raw, filePath, repoRoot),
    });
  }

  reports.sort((left, right) => {
    const leftIndex = DEFAULT_REPORT_ORDER.indexOf(left.summary.type);
    const rightIndex = DEFAULT_REPORT_ORDER.indexOf(right.summary.type);

    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? 999 : leftIndex) -
        (rightIndex === -1 ? 999 : rightIndex)
      );
    }

    return left.summary.type.localeCompare(right.summary.type);
  });

  return {
    input_dir: toRelativePath(discovered.input_dir, repoRoot),
    files_scanned: discovered.files.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    reports,
    invalid,
  };
}

function normalizeReport(report, filePath, repoRoot) {
  const type = normalizeString(report.type || path.basename(filePath, ".json"));
  const status = normalizeString(
    report.status || report.execution?.status || "unknown",
  );
  const ok =
    typeof report.ok === "boolean"
      ? report.ok
      : typeof report.totals?.ok === "boolean"
        ? report.totals.ok
        : !["failed", "invalid", "error"].includes(status);

  const totals =
    report.totals && typeof report.totals === "object" ? report.totals : {};
  const errors = extractMessages(
    report.errors || report.execution?.errors || [],
  );
  const warnings = extractMessages(
    report.warnings || report.execution?.warnings || [],
  );

  return {
    file: toRelativePath(filePath, repoRoot),
    type,
    title: displayNameForType(type),
    project: normalizeString(report.project || PROJECT_NAME),
    repository: normalizeString(
      report.repository || report.github?.repository || DEFAULT_REPOSITORY,
    ),
    created_at: normalizeString(report.created_at),
    status,
    ok,
    errors,
    warnings,
    error_count: normalizeInteger(totals.errors, errors.length),
    warning_count: normalizeInteger(totals.warnings, warnings.length),
    duration_ms: normalizeInteger(
      totals.duration_ms,
      report.execution?.duration_ms || 0,
    ),
    duration_human: normalizeString(totals.duration_human),
    target: summarizeTarget(report),
    highlights: summarizeHighlights(report),
  };
}

function extractMessages(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.message) return item.message;
      if (item?.title && item?.check) return `${item.check}: ${item.title}`;
      if (item?.check) return String(item.check);
      return JSON.stringify(item);
    })
    .map(redactOutput)
    .filter(Boolean);
}

function displayNameForType(type) {
  const names = {
    "repo-assign-labels": "🏷️ Labels",
    "repo-assign-assignees": "👥 Assignees",
    "repo-assign-milestones": "🏁 Milestones",
    "repo-assign-reviewers": "👀 Reviewers",
    "repo-enforce-branch-name": "🌿 Branch Name",
    "repo-enforce-pr-rules": "🧪 PR Rules",
    "repo-link-issues-prs": "🔗 Issue Links",
  };

  return names[type] || type;
}

function summarizeTarget(report) {
  if (report.item) {
    const number = report.item.number ? `#${report.item.number}` : "";
    const kind = report.item.kind || "";
    const title = report.item.title || "";

    return [kind, number, title].filter(Boolean).join(" ");
  }

  if (report.pull_request) {
    const number = report.pull_request.number
      ? `#${report.pull_request.number}`
      : "";
    const title = report.pull_request.title || "";

    return ["pull_request", number, title].filter(Boolean).join(" ");
  }

  if (report.branch) {
    return report.branch.name || report.branch.branch || "";
  }

  return "";
}

function summarizeHighlights(report) {
  const type = normalizeString(report.type);
  const totals = report.totals || {};

  if (type === "repo-assign-labels") {
    return [
      `added ${normalizeInteger(totals.added_labels, 0)}`,
      `removed ${normalizeInteger(totals.removed_labels, 0)}`,
      `final ${normalizeInteger(totals.final_labels, 0)}`,
    ];
  }

  if (type === "repo-assign-assignees") {
    return [
      `added ${normalizeInteger(totals.added_assignees, 0)}`,
      `removed ${normalizeInteger(totals.removed_assignees, 0)}`,
      `requested ${normalizeInteger(totals.requested_assignees, 0)}`,
    ];
  }

  if (type === "repo-assign-milestones") {
    return [
      `action ${report.assignment?.action || report.execution?.action || "none"}`,
      `matched rules ${normalizeInteger(totals.matched_rules, 0)}`,
    ];
  }

  if (type === "repo-assign-reviewers") {
    return [
      `users +${normalizeInteger(totals.added_reviewers, 0)}`,
      `teams +${normalizeInteger(totals.added_team_reviewers, 0)}`,
      `rules ${normalizeInteger(totals.matched_rules, 0)}`,
    ];
  }

  if (type === "repo-enforce-branch-name") {
    return [
      `checks ${normalizeInteger(totals.passed, 0)}/${normalizeInteger(totals.checks, 0)}`,
      `branch ${report.branch?.name || "unknown"}`,
    ];
  }

  if (type === "repo-enforce-pr-rules") {
    return [
      `checks ${normalizeInteger(totals.passed, 0)}/${normalizeInteger(totals.checks, 0)}`,
      `changed files ${report.pull_request?.changed_file_count || 0}`,
      `approvals ${report.pull_request?.approvals || 0}`,
    ];
  }

  if (type === "repo-link-issues-prs") {
    return [
      `links ${normalizeInteger(totals.issue_links, 0)}`,
      `body changed ${report.execution?.body_changed ? "yes" : "no"}`,
      `comment ${report.execution?.comment_created ? "yes" : "no"}`,
    ];
  }

  return [
    `errors ${normalizeInteger(totals.errors, 0)}`,
    `warnings ${normalizeInteger(totals.warnings, 0)}`,
  ];
}

function analyzeReports(args, readResult) {
  const reportSummaries = readResult.reports.map((report) => report.summary);
  const presentTypes = [
    ...new Set(reportSummaries.map((report) => report.type)),
  ];
  const missingRequiredTypes = args.required_types.filter(
    (type) => !presentTypes.includes(type),
  );
  const failedReports = reportSummaries.filter((report) => !report.ok);
  const warningReports = reportSummaries.filter(
    (report) => report.warning_count > 0,
  );

  const invalidJsonErrors = readResult.invalid.map((item) => item.error);
  const missingRequiredErrors = missingRequiredTypes.map(
    (type) => `Required report type missing: ${type}`,
  );

  const errors = [
    ...(args.require_reports && !reportSummaries.length
      ? ["No repository management reports were found."]
      : []),
    ...(args.fail_on_invalid_json ? invalidJsonErrors : []),
    ...(args.fail_on_missing_required ? missingRequiredErrors : []),
    ...(args.fail_on_report_error
      ? failedReports.map(
          (report) => `${report.title} failed with status "${report.status}".`,
        )
      : []),
  ];

  const warnings = [
    ...(!args.fail_on_invalid_json
      ? readResult.invalid.map((item) => `${item.file}: ${item.error}`)
      : []),
    ...(!args.fail_on_missing_required ? missingRequiredErrors : []),
    ...(!args.fail_on_report_error
      ? failedReports.map(
          (report) => `${report.title} failed with status "${report.status}".`,
        )
      : []),
    ...reportSummaries.flatMap((report) =>
      report.warnings.map((warning) => `${report.title}: ${warning}`),
    ),
  ];

  const totalErrors =
    readResult.invalid.length +
    reportSummaries.reduce((sum, report) => sum + report.error_count, 0);

  const totalWarnings =
    warnings.length +
    reportSummaries.reduce((sum, report) => sum + report.warning_count, 0);

  const ok =
    errors.length === 0 && (!args.fail_on_warning || totalWarnings === 0);

  return {
    present_types: presentTypes,
    missing_required_types: missingRequiredTypes,
    failed_reports: failedReports,
    warning_reports: warningReports,
    report_summaries: reportSummaries,
    errors,
    warnings,
    totals: {
      reports: reportSummaries.length,
      files_scanned: readResult.files_scanned.length,
      invalid_reports: readResult.invalid.length,
      passed_reports: reportSummaries.filter((report) => report.ok).length,
      failed_reports: failedReports.length,
      warning_reports: warningReports.length,
      missing_required_types: missingRequiredTypes.length,
      report_errors: reportSummaries.reduce(
        (sum, report) => sum + report.error_count,
        0,
      ),
      report_warnings: reportSummaries.reduce(
        (sum, report) => sum + report.warning_count,
        0,
      ),
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      ok,
    },
    status: ok ? (totalWarnings > 0 ? "warning" : "success") : "failed",
    ok,
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  readResult,
  analysis,
) {
  const github = getGitMetadata(repoRoot);

  return {
    schema_version: 1,
    type: "repo-management-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      input_dir: readResult.input_dir,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      recursive: args.recursive,
      include_files: args.include_files,
      exclude_files: args.exclude_files,
      include_types: args.include_types,
      required_types: args.required_types,
      require_reports: args.require_reports,
      fail_on_missing_required: args.fail_on_missing_required,
      fail_on_report_error: args.fail_on_report_error,
      fail_on_warning: args.fail_on_warning,
      fail_on_invalid_json: args.fail_on_invalid_json,
      dry_run: args.dry_run,
    },
    scan: {
      files_scanned: readResult.files_scanned,
      invalid_reports: readResult.invalid,
    },
    reports: analysis.report_summaries,
    present_types: analysis.present_types,
    missing_required_types: analysis.missing_required_types,
    failed_reports: analysis.failed_reports,
    warning_reports: analysis.warning_reports,
    totals: analysis.totals,
    errors: analysis.errors,
    warnings: analysis.warnings,
    status: analysis.status,
    ok: analysis.ok,
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

function statusIcon(report) {
  if (report.ok && report.warning_count > 0) return "⚠️";
  if (report.ok) return "✅";
  return "❌";
}

function createMarkdownSummary(report, args) {
  const icon = report.ok ? (report.status === "warning" ? "⚠️" : "✅") : "❌";

  const lines = [
    `# 🧰 ${PROJECT_NAME} Repository Management Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Reports: \`${report.totals.reports}\``,
    `- Passed reports: \`${report.totals.passed_reports}\``,
    `- Failed reports: \`${report.totals.failed_reports}\``,
    `- Warning reports: \`${report.totals.warning_reports}\``,
    `- Invalid report files: \`${report.totals.invalid_reports}\``,
    `- Report errors: \`${report.totals.report_errors}\``,
    `- Report warnings: \`${report.totals.report_warnings}\``,
    `- Missing required types: \`${report.totals.missing_required_types}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${escapeMarkdown(report.github.branch || "unknown")}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    `- Input directory: \`${escapeMarkdown(report.config.input_dir)}\``,
    "",
    "## 📋 Report Overview",
    "",
  ];

  if (!report.reports.length) {
    lines.push("No repository management reports were found.");
  } else {
    lines.push("| Status | Report | Result | Target | Highlights | File |");
    lines.push("|---|---|---|---|---|---|");

    for (const item of report.reports.slice(0, args.max_report_rows)) {
      lines.push(
        `| ${statusIcon(item)} | ${escapeMarkdown(item.title)} | \`${escapeMarkdown(item.status)}\` | ${escapeMarkdown(item.target || "none")} | ${escapeMarkdown(item.highlights.join(", ") || "none")} | \`${escapeMarkdown(item.file)}\` |`,
      );
    }

    if (report.reports.length > args.max_report_rows) {
      lines.push(
        `| … | … | … | … | … | \`${report.reports.length - args.max_report_rows}\` more report(s) omitted |`,
      );
    }
  }

  if (report.missing_required_types.length) {
    lines.push("");
    lines.push("## 🚫 Missing Required Reports");
    lines.push("");

    for (const type of report.missing_required_types) {
      lines.push(`- \`${escapeMarkdown(type)}\``);
    }
  }

  if (report.failed_reports.length) {
    lines.push("");
    lines.push("## ❌ Failed Reports");
    lines.push("");

    for (const item of report.failed_reports) {
      lines.push(
        `- **${escapeMarkdown(item.title)}** — \`${escapeMarkdown(item.status)}\` from \`${escapeMarkdown(item.file)}\``,
      );

      for (const error of item.errors.slice(0, 5)) {
        lines.push(`  - ${escapeMarkdown(error)}`);
      }
    }
  }

  const reportErrors = report.reports.flatMap((item) =>
    item.errors.map((error) => ({
      report: item.title,
      file: item.file,
      error,
    })),
  );

  if (reportErrors.length) {
    lines.push("");
    lines.push("## 🧨 Report Error Details");
    lines.push("");

    for (const item of reportErrors.slice(0, args.max_error_items)) {
      lines.push(
        `- **${escapeMarkdown(item.report)}**: ${escapeMarkdown(item.error)} \`${escapeMarkdown(item.file)}\``,
      );
    }

    if (reportErrors.length > args.max_error_items) {
      lines.push(
        `- ...and \`${reportErrors.length - args.max_error_items}\` more error(s).`,
      );
    }
  }

  const reportWarnings = report.reports.flatMap((item) =>
    item.warnings.map((warning) => ({
      report: item.title,
      file: item.file,
      warning,
    })),
  );

  if (reportWarnings.length) {
    lines.push("");
    lines.push("## ⚠️ Report Warning Details");
    lines.push("");

    for (const item of reportWarnings.slice(0, args.max_warning_items)) {
      lines.push(
        `- **${escapeMarkdown(item.report)}**: ${escapeMarkdown(item.warning)} \`${escapeMarkdown(item.file)}\``,
      );
    }

    if (reportWarnings.length > args.max_warning_items) {
      lines.push(
        `- ...and \`${reportWarnings.length - args.max_warning_items}\` more warning(s).`,
      );
    }
  }

  if (report.scan.invalid_reports.length) {
    lines.push("");
    lines.push("## 🧯 Invalid Report Files");
    lines.push("");

    for (const item of report.scan.invalid_reports) {
      lines.push(
        `- \`${escapeMarkdown(item.file)}\`: ${escapeMarkdown(item.error)}`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Summary Errors");
    lines.push("");

    for (const error of report.errors.slice(0, args.max_error_items)) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Summary Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, args.max_warning_items)) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Recursive scan: \`${report.config.recursive ? "true" : "false"}\``,
  );
  lines.push(
    `- Include types: \`${escapeMarkdown(report.config.include_types.join(", ") || "all")}\``,
  );
  lines.push(
    `- Required types: \`${escapeMarkdown(report.config.required_types.join(", ") || "none")}\``,
  );
  lines.push(`- Files scanned: \`${report.totals.files_scanned}\``);

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
  setGitHubOutput("repo_management_summary_file", report.config.output_file);
  setGitHubOutput(
    "repo_management_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("repo_management_summary_status", report.status);
  setGitHubOutput("repo_management_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput("repo_management_reports", String(report.totals.reports));
  setGitHubOutput(
    "repo_management_passed_reports",
    String(report.totals.passed_reports),
  );
  setGitHubOutput(
    "repo_management_failed_reports",
    String(report.totals.failed_reports),
  );
  setGitHubOutput(
    "repo_management_warning_reports",
    String(report.totals.warning_reports),
  );
  setGitHubOutput(
    "repo_management_invalid_reports",
    String(report.totals.invalid_reports),
  );
  setGitHubOutput(
    "repo_management_report_errors",
    String(report.totals.report_errors),
  );
  setGitHubOutput(
    "repo_management_report_warnings",
    String(report.totals.report_warnings),
  );
  setGitHubOutput(
    "repo_management_missing_required_types",
    String(report.totals.missing_required_types),
  );

  setGitHubOutput(
    "repo_management_present_types",
    report.present_types.join(","),
  );
  setGitHubOutput(
    "repo_management_present_types_json",
    JSON.stringify(report.present_types),
  );
  setGitHubOutput(
    "repo_management_missing_required_types_json",
    JSON.stringify(report.missing_required_types),
  );
  setGitHubOutput(
    "repo_management_failed_reports_json",
    JSON.stringify(report.failed_reports),
  );
  setGitHubOutput(
    "repo_management_warnings_json",
    JSON.stringify(report.warnings),
  );
  setGitHubOutput("repo_management_errors_json", JSON.stringify(report.errors));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing repository management reports.");

  const readResult = readReports(args, repoRoot);
  const analysis = analyzeReports(args, readResult);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    readResult,
    analysis,
  );
  const markdown = createMarkdownSummary(report, args);
  const json = `${JSON.stringify(report, null, 2)}\n`;

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

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
