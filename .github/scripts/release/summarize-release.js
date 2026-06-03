#!/usr/bin/env node
// .github/scripts/release/summarize-release.js
// =============================================================================
// Aerealith AI — Release Summary
// -----------------------------------------------------------------------------
// Purpose:
//   Consolidate release workflow artifacts into one final release report and
//   GitHub step summary.
//
// Input:
//   - artifacts/release/detect-release-label.json
//   - artifacts/release/determine-release-version.json
//   - artifacts/release/build-changelog.json
//   - artifacts/release/build-changelog.md
//   - artifacts/release/create-release-tag.json
//   - artifacts/release/create-github-release.json
//   - artifacts/release/post-discussion-announcement.json
//   - optional .github/release/summarize-release.{json,jsonc,yaml,yml}
//
// Output:
//   - artifacts/release/summarize-release.json
//   - artifacts/release/summarize-release.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate git, GitHub, npm, or release assets.
//   - Safe for pull requests.
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
    info: (message) => console.log(`[release-summary] ${message}`),
    warn: (message) => console.warn(`[release-summary] WARN: ${message}`),
    error: (message) => console.error(`[release-summary] ERROR: ${message}`),
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
  ".github/release/summarize-release.json",
  ".github/release/summarize-release.jsonc",
  ".github/release/summarize-release.yaml",
  ".github/release/summarize-release.yml",
  ".github/release/release-summary.json",
  ".github/release/release-summary.jsonc",
  ".github/release/release-summary.yaml",
  ".github/release/release-summary.yml",
  "release/summarize-release.json",
  "release/summarize-release.jsonc",
  "release/summarize-release.yaml",
  "release/summarize-release.yml",
  "release/release-summary.json",
  "release/release-summary.jsonc",
  "release/release-summary.yaml",
  "release/release-summary.yml",
];

const DEFAULT_LABEL_REPORT_FILE = "artifacts/release/detect-release-label.json";
const DEFAULT_VERSION_REPORT_FILE =
  "artifacts/release/determine-release-version.json";
const DEFAULT_CHANGELOG_REPORT_FILE = "artifacts/release/build-changelog.json";
const DEFAULT_CHANGELOG_MARKDOWN_FILE = "artifacts/release/build-changelog.md";
const DEFAULT_TAG_REPORT_FILE = "artifacts/release/create-release-tag.json";
const DEFAULT_GITHUB_RELEASE_REPORT_FILE =
  "artifacts/release/create-github-release.json";
const DEFAULT_DISCUSSION_REPORT_FILE =
  "artifacts/release/post-discussion-announcement.json";
const DEFAULT_NPM_SUMMARY_FILE = "artifacts/npm/summarize-packages.json";
const DEFAULT_OUTPUT_FILE = "artifacts/release/summarize-release.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/summarize-release.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const FAILURE_STATUSES = new Set([
  "failed",
  "invalid",
  "blocked",
  "asset-failed",
  "duplicate-names",
]);

const WARNING_STATUSES = new Set([
  "warning",
  "tag-exists",
  "skipped-existing",
  "skipped",
  "no-release",
  "empty",
]);

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

    config_file: process.env.SUMMARIZE_RELEASE_CONFIG_FILE || "",

    label_report_file:
      process.env.SUMMARIZE_RELEASE_LABEL_REPORT_FILE ||
      process.env.RELEASE_LABEL_REPORT_FILE ||
      DEFAULT_LABEL_REPORT_FILE,
    version_report_file:
      process.env.SUMMARIZE_RELEASE_VERSION_REPORT_FILE ||
      process.env.RELEASE_VERSION_REPORT_FILE ||
      DEFAULT_VERSION_REPORT_FILE,
    changelog_report_file:
      process.env.SUMMARIZE_RELEASE_CHANGELOG_REPORT_FILE ||
      process.env.RELEASE_CHANGELOG_REPORT_FILE ||
      DEFAULT_CHANGELOG_REPORT_FILE,
    changelog_markdown_file:
      process.env.SUMMARIZE_RELEASE_CHANGELOG_MARKDOWN_FILE ||
      process.env.RELEASE_CHANGELOG_MARKDOWN_FILE ||
      DEFAULT_CHANGELOG_MARKDOWN_FILE,
    tag_report_file:
      process.env.SUMMARIZE_RELEASE_TAG_REPORT_FILE ||
      process.env.RELEASE_TAG_REPORT_FILE ||
      DEFAULT_TAG_REPORT_FILE,
    github_release_report_file:
      process.env.SUMMARIZE_RELEASE_GITHUB_RELEASE_REPORT_FILE ||
      process.env.GITHUB_RELEASE_REPORT_FILE ||
      DEFAULT_GITHUB_RELEASE_REPORT_FILE,
    discussion_report_file:
      process.env.SUMMARIZE_RELEASE_DISCUSSION_REPORT_FILE ||
      process.env.DISCUSSION_ANNOUNCEMENT_REPORT_FILE ||
      DEFAULT_DISCUSSION_REPORT_FILE,
    npm_summary_file:
      process.env.SUMMARIZE_RELEASE_NPM_SUMMARY_FILE ||
      process.env.NPM_SUMMARY_FILE ||
      DEFAULT_NPM_SUMMARY_FILE,

    output_file:
      process.env.SUMMARIZE_RELEASE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.SUMMARIZE_RELEASE_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    release_tag:
      process.env.SUMMARIZE_RELEASE_TAG || process.env.RELEASE_TAG || "",
    release_version:
      process.env.SUMMARIZE_RELEASE_VERSION ||
      process.env.RELEASE_VERSION ||
      "",
    release_url:
      process.env.SUMMARIZE_RELEASE_URL || process.env.GITHUB_RELEASE_URL || "",
    discussion_url:
      process.env.SUMMARIZE_RELEASE_DISCUSSION_URL ||
      process.env.DISCUSSION_URL ||
      "",

    require_version_report: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_REQUIRE_VERSION_REPORT,
      false,
    ),
    require_changelog_report: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_REQUIRE_CHANGELOG_REPORT,
      false,
    ),
    require_github_release: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_REQUIRE_GITHUB_RELEASE,
      false,
    ),
    require_release_tag: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_REQUIRE_RELEASE_TAG,
      false,
    ),
    require_discussion: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_REQUIRE_DISCUSSION,
      false,
    ),

    include_npm_summary: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_INCLUDE_NPM_SUMMARY,
      true,
    ),
    include_changelog_markdown: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_INCLUDE_CHANGELOG_MARKDOWN,
      true,
    ),
    include_source_reports: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_INCLUDE_SOURCE_REPORTS,
      false,
    ),

    fail_if_no_release: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_FAIL_IF_NO_RELEASE,
      false,
    ),
    fail_on_missing_required: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_FAIL_ON_MISSING_REQUIRED,
      true,
    ),
    fail_on_failed_stage: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_FAIL_ON_FAILED_STAGE,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_FAIL_ON_ERROR,
      true,
    ),

    max_changelog_chars: normalizeInteger(
      process.env.SUMMARIZE_RELEASE_MAX_CHANGELOG_CHARS,
      12000,
    ),

    dry_run: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.SUMMARIZE_RELEASE_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SUMMARIZE_RELEASE_STEP_SUMMARY,
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

    if (arg === "--label-report") {
      args.label_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version-report") {
      args.version_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changelog-report") {
      args.changelog_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changelog-markdown") {
      args.changelog_markdown_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag-report") {
      args.tag_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--github-release-report" || arg === "--release-report") {
      args.github_release_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--discussion-report") {
      args.discussion_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--npm-summary") {
      args.npm_summary_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.release_tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.release_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--release-url") {
      args.release_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--discussion-url") {
      args.discussion_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--require-version-report") {
      args.require_version_report = true;
      continue;
    }

    if (arg === "--require-changelog-report") {
      args.require_changelog_report = true;
      continue;
    }

    if (arg === "--require-github-release") {
      args.require_github_release = true;
      continue;
    }

    if (arg === "--require-release-tag") {
      args.require_release_tag = true;
      continue;
    }

    if (arg === "--require-discussion") {
      args.require_discussion = true;
      continue;
    }

    if (arg === "--include-npm-summary") {
      args.include_npm_summary = true;
      continue;
    }

    if (arg === "--no-npm-summary") {
      args.include_npm_summary = false;
      continue;
    }

    if (arg === "--include-changelog-markdown") {
      args.include_changelog_markdown = true;
      continue;
    }

    if (arg === "--no-changelog-markdown") {
      args.include_changelog_markdown = false;
      continue;
    }

    if (arg === "--include-source-reports") {
      args.include_source_reports = true;
      continue;
    }

    if (arg === "--no-source-reports") {
      args.include_source_reports = false;
      continue;
    }

    if (arg === "--fail-if-no-release") {
      args.fail_if_no_release = true;
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

    if (arg === "--fail-on-failed-stage") {
      args.fail_on_failed_stage = true;
      continue;
    }

    if (arg === "--no-fail-on-failed-stage") {
      args.fail_on_failed_stage = false;
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

    if (arg === "--max-changelog-chars") {
      args.max_changelog_chars = normalizeInteger(
        argv[index + 1],
        args.max_changelog_chars,
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
  args.release_tag = normalizeTag(args.release_tag);
  args.release_version = normalizeVersion(args.release_version);
  args.max_changelog_chars = Math.max(0, args.max_changelog_chars);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Summary

Usage:
  node .github/scripts/release/summarize-release.js [options]

Examples:
  node .github/scripts/release/summarize-release.js
  node .github/scripts/release/summarize-release.js --require-github-release
  node .github/scripts/release/summarize-release.js --tag v2.10.0 --version 2.10.0
  node .github/scripts/release/summarize-release.js --fail-if-no-release --fail-on-failed-stage

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Release summary config file.
      --label-report <file>                Release label detection report.
      --version-report <file>              Release version report.
      --changelog-report <file>            Changelog JSON report.
      --changelog-markdown <file>          Changelog Markdown file.
      --tag-report <file>                  Release tag report.
      --github-release-report <file>       GitHub Release report.
      --discussion-report <file>           Discussion announcement report.
      --npm-summary <file>                 NPM package summary report.
      --tag <tag>                          Release tag override.
      --version <version>                  Release version override.
      --release-url <url>                  GitHub Release URL override.
      --discussion-url <url>               Discussion URL override.
      --require-version-report             Require version report.
      --require-changelog-report           Require changelog report.
      --require-github-release             Require GitHub Release report/success.
      --require-release-tag                Require release tag report/success.
      --require-discussion                 Require discussion report/success.
      --include-npm-summary                Include npm package summary. Default.
      --no-npm-summary                     Do not include npm package summary.
      --include-changelog-markdown         Include Markdown changelog excerpt. Default.
      --no-changelog-markdown              Do not include Markdown changelog excerpt.
      --include-source-reports             Embed source reports in JSON.
      --no-source-reports                  Omit embedded source reports. Default.
      --fail-if-no-release                 Exit non-zero when no release is selected.
      --fail-on-missing-required           Exit non-zero for missing required reports. Default.
      --no-fail-on-missing-required        Do not fail for missing required reports.
      --fail-on-failed-stage               Exit non-zero when any release stage failed. Default.
      --no-fail-on-failed-stage            Do not fail when a stage failed.
      --fail-on-error                      Exit non-zero on summary failure. Default.
      --no-fail-on-error                   Do not fail workflow for summary errors.
      --max-changelog-chars <number>       Changelog excerpt limit. Default: 12000.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not write files.
      --no-print                           Do not print JSON report.
      --no-step-summary                    Do not append GitHub step summary.
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

function readTextFile(filePath, repoRoot, fallback = "") {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return fs.readFileSync(absolutePath, "utf8");
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

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

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

  const stringKeys = [
    "label_report_file",
    "version_report_file",
    "changelog_report_file",
    "changelog_markdown_file",
    "tag_report_file",
    "github_release_report_file",
    "discussion_report_file",
    "npm_summary_file",
    "output_file",
    "summary_file",
    "release_tag",
    "release_version",
    "release_url",
    "discussion_url",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "require_version_report",
    "require_changelog_report",
    "require_github_release",
    "require_release_tag",
    "require_discussion",
    "include_npm_summary",
    "include_changelog_markdown",
    "include_source_reports",
    "fail_if_no_release",
    "fail_on_missing_required",
    "fail_on_failed_stage",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_changelog_chars !== undefined) {
    merged.max_changelog_chars = normalizeInteger(
      config.max_changelog_chars,
      merged.max_changelog_chars,
    );
  }

  merged.release_tag = normalizeTag(merged.release_tag);
  merged.release_version = normalizeVersion(merged.release_version);

  return merged;
}

function normalizeTag(value) {
  const tag = normalizeString(value);

  if (!tag) return "";

  return tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
}

function normalizeVersion(value) {
  const version = normalizeString(value);

  if (!version) return "";

  return version.startsWith("v") ? version : `v${version}`;
}

function stripVersionPrefix(value) {
  return normalizeString(value)
    .replace(/^refs\/tags\//, "")
    .replace(/^v/, "");
}

function repositoryUrl(repository) {
  const repo = normalizeString(repository, DEFAULT_REPOSITORY);

  if (/^https?:\/\//.test(repo)) return repo.replace(/\/+$/g, "");

  return `https://github.com/${repo}`;
}

function releaseUrl(repository, tag) {
  if (!tag) return "";

  return `${repositoryUrl(repository)}/releases/tag/${encodeURIComponent(tag)}`;
}

function compareUrl(repository, fromRef, toRef) {
  if (!fromRef || !toRef) return "";

  return `${repositoryUrl(repository)}/compare/${encodeURIComponent(fromRef)}...${encodeURIComponent(toRef)}`;
}

function stageRecord(id, title, file, report, required = false) {
  const available = Boolean(report);
  const status = normalizeString(
    report?.status,
    available ? "available" : "missing",
  );
  const ok = available
    ? report?.ok !== false &&
      report?.totals?.ok !== false &&
      !FAILURE_STATUSES.has(status)
    : !required;

  return {
    id,
    title,
    file,
    available,
    required,
    status,
    ok,
    url:
      report?.release?.tag_url ||
      report?.release?.html_url ||
      report?.release?.url ||
      report?.discussion?.url ||
      report?.discussion_announcement_url ||
      "",
    errors: normalizeErrors(report),
    warnings: normalizeWarnings(report),
  };
}

function normalizeErrors(report) {
  if (!report || typeof report !== "object") return [];

  return [
    ...normalizeStringList(report.errors),
    ...normalizeStringList(
      report.failures?.flatMap?.((failure) => failure.errors || []) || [],
    ),
  ].map(redactOutput);
}

function normalizeWarnings(report) {
  if (!report || typeof report !== "object") return [];

  return [
    ...normalizeStringList(report.warnings),
    ...normalizeStringList(
      report.failures?.flatMap?.((failure) => failure.warnings || []) || [],
    ),
  ].map(redactOutput);
}

function readSources(args, repoRoot) {
  const labelReport = readJsonFile(args.label_report_file, repoRoot, null);
  const versionReport = readJsonFile(args.version_report_file, repoRoot, null);
  const changelogReport = readJsonFile(
    args.changelog_report_file,
    repoRoot,
    null,
  );
  const changelogMarkdown = args.include_changelog_markdown
    ? readTextFile(args.changelog_markdown_file, repoRoot, "")
    : "";
  const tagReport = readJsonFile(args.tag_report_file, repoRoot, null);
  const githubReleaseReport = readJsonFile(
    args.github_release_report_file,
    repoRoot,
    null,
  );
  const discussionReport = readJsonFile(
    args.discussion_report_file,
    repoRoot,
    null,
  );
  const npmSummary = args.include_npm_summary
    ? readJsonFile(args.npm_summary_file, repoRoot, null)
    : null;

  return {
    label_report: labelReport,
    version_report: versionReport,
    changelog_report: changelogReport,
    changelog_markdown: changelogMarkdown,
    tag_report: tagReport,
    github_release_report: githubReleaseReport,
    discussion_report: discussionReport,
    npm_summary: npmSummary,
  };
}

function resolveRelease(args, sources) {
  const label = sources.label_report || {};
  const version = sources.version_report || {};
  const changelog = sources.changelog_report || {};
  const tag = sources.tag_report || {};
  const ghRelease = sources.github_release_report || {};
  const discussion = sources.discussion_report || {};

  const releaseTag =
    normalizeTag(args.release_tag) ||
    normalizeTag(version.release?.tag) ||
    normalizeTag(tag.release?.tag) ||
    normalizeTag(ghRelease.release?.tag_name) ||
    normalizeTag(ghRelease.release_input?.tag) ||
    normalizeTag(changelog.release?.tag) ||
    normalizeTag(label.release?.tag);

  const releaseVersion =
    normalizeVersion(args.release_version) ||
    normalizeVersion(version.release?.version) ||
    normalizeVersion(tag.release?.version) ||
    normalizeVersion(changelog.release?.version) ||
    normalizeVersion(releaseTag);

  const releaseName =
    normalizeString(ghRelease.release?.name) ||
    normalizeString(ghRelease.release_input?.name) ||
    normalizeString(changelog.release?.title) ||
    normalizeString(releaseVersion || releaseTag || "Release");

  const releaseChannel =
    normalizeString(version.release?.release_channel) ||
    normalizeString(label.release?.release_channel) ||
    "stable";

  const releaseType =
    normalizeString(version.release?.release_type) ||
    normalizeString(label.release?.release_type) ||
    "none";

  const shouldRelease =
    version.release?.should_release ??
    label.release?.should_release ??
    label.detection?.should_release ??
    Boolean(releaseTag || releaseVersion);

  const skipRelease =
    version.release?.skip_release ??
    label.release?.skip_release ??
    label.detection?.skip_release ??
    false;

  const prerelease =
    version.release?.prerelease ??
    label.release?.prerelease ??
    ghRelease.release?.prerelease ??
    releaseChannel !== "stable";

  const stable =
    version.release?.stable ??
    label.release?.stable ??
    (!prerelease && releaseChannel === "stable");

  const tagUrl =
    normalizeString(version.release?.tag_url) ||
    normalizeString(tag.release?.url) ||
    normalizeString(args.release_url) ||
    normalizeString(ghRelease.release?.html_url) ||
    normalizeString(ghRelease.release_input?.url) ||
    releaseUrl(args.repository, releaseTag);

  const compare =
    normalizeString(version.release?.compare_url) ||
    normalizeString(changelog.links?.compare) ||
    normalizeString(changelog.release?.compare_url) ||
    compareUrl(
      args.repository,
      version.git?.latest_version_tag || changelog.range?.from_ref,
      releaseTag || changelog.range?.to_ref,
    );

  return {
    should_release: Boolean(shouldRelease && !skipRelease),
    skip_release: Boolean(skipRelease),
    release_type: releaseType,
    release_channel: releaseChannel,
    prerelease: Boolean(prerelease),
    stable: Boolean(stable),
    version: releaseVersion,
    version_without_prefix: stripVersionPrefix(releaseVersion),
    tag: releaseTag,
    name: releaseName,
    tag_url: tagUrl,
    release_url:
      normalizeString(args.release_url) ||
      normalizeString(ghRelease.release?.html_url) ||
      tagUrl,
    discussion_url:
      normalizeString(args.discussion_url) ||
      normalizeString(discussion.discussion?.url),
    compare_url: compare,
    reason:
      normalizeString(version.release?.reason) ||
      normalizeString(label.release?.reason) ||
      normalizeString(label.detection?.reason) ||
      "",
  };
}

function summarizeChangelog(args, sources) {
  const changelog = sources.changelog_report || {};
  const totals = changelog.totals || {};
  const markdown = normalizeString(sources.changelog_markdown);

  const releaseSection =
    normalizeString(changelog.markdown?.release_section) ||
    extractReleaseSectionFromSummary(markdown);

  const excerpt =
    args.max_changelog_chars > 0 &&
    releaseSection.length > args.max_changelog_chars
      ? `${releaseSection.slice(0, args.max_changelog_chars).trim()}\n\n_...truncated by summarize-release._`
      : releaseSection;

  return {
    available: Boolean(sources.changelog_report),
    markdown_available: Boolean(markdown),
    commits: Number(totals.commits || 0),
    breaking_changes: Number(totals.breaking_changes || 0),
    authors: Number(totals.authors || 0),
    files_changed: Number(totals.files_changed || 0),
    insertions: Number(totals.insertions || 0),
    deletions: Number(totals.deletions || 0),
    categories: totals.categories || {},
    excerpt,
  };
}

function extractReleaseSectionFromSummary(markdown) {
  const text = String(markdown || "");

  if (!text) return "";

  const separatorIndex = text.indexOf("\n---\n");

  if (separatorIndex >= 0) {
    return text.slice(separatorIndex + "\n---\n".length).trim();
  }

  const releaseHeading = text.match(/^##\s+.+$/m);

  if (!releaseHeading) return text.trim();

  return text.slice(releaseHeading.index).trim();
}

function summarizeNpm(sources) {
  const npm = sources.npm_summary || {};

  return {
    available: Boolean(sources.npm_summary),
    status: normalizeString(npm.status),
    packages: Number(npm.totals?.packages || 0),
    publishable: Number(npm.totals?.publishable || 0),
    packed: Number(npm.totals?.packed || 0),
    published: Number(npm.totals?.published || 0),
    failed: Number(npm.totals?.failed || 0),
    invalid: Number(npm.totals?.invalid || 0),
    warnings: Number(npm.totals?.warnings || 0),
    tarballs: Number(npm.totals?.tarballs || 0),
    tarball_bytes: Number(npm.totals?.tarball_bytes || 0),
    published_packages: Array.isArray(npm.published_packages)
      ? npm.published_packages.map((pkg) => ({
          name: pkg.name,
          version: pkg.version,
          tag: pkg.tag,
          registry: pkg.registry,
        }))
      : [],
  };
}

function buildStages(args, repoRoot, sources) {
  return [
    stageRecord(
      "release-label",
      "Release Label Detection",
      toRelativePath(resolvePath(args.label_report_file, repoRoot), repoRoot),
      sources.label_report,
      false,
    ),
    stageRecord(
      "release-version",
      "Determine Release Version",
      toRelativePath(resolvePath(args.version_report_file, repoRoot), repoRoot),
      sources.version_report,
      args.require_version_report,
    ),
    stageRecord(
      "changelog",
      "Build Changelog",
      toRelativePath(
        resolvePath(args.changelog_report_file, repoRoot),
        repoRoot,
      ),
      sources.changelog_report,
      args.require_changelog_report,
    ),
    stageRecord(
      "release-tag",
      "Create Release Tag",
      toRelativePath(resolvePath(args.tag_report_file, repoRoot), repoRoot),
      sources.tag_report,
      args.require_release_tag,
    ),
    stageRecord(
      "github-release",
      "Create GitHub Release",
      toRelativePath(
        resolvePath(args.github_release_report_file, repoRoot),
        repoRoot,
      ),
      sources.github_release_report,
      args.require_github_release,
    ),
    stageRecord(
      "discussion-announcement",
      "Post Discussion Announcement",
      toRelativePath(
        resolvePath(args.discussion_report_file, repoRoot),
        repoRoot,
      ),
      sources.discussion_report,
      args.require_discussion,
    ),
    stageRecord(
      "npm-summary",
      "NPM Package Summary",
      toRelativePath(resolvePath(args.npm_summary_file, repoRoot), repoRoot),
      sources.npm_summary,
      false,
    ),
  ];
}

function summarizeStages(stages) {
  return {
    stages: stages.length,
    available: stages.filter((stage) => stage.available).length,
    missing: stages.filter((stage) => !stage.available).length,
    required_missing: stages.filter(
      (stage) => stage.required && !stage.available,
    ).length,
    ok: stages.filter((stage) => stage.ok).length,
    failed: stages.filter((stage) => stage.available && !stage.ok).length,
    warnings: stages.filter((stage) => WARNING_STATUSES.has(stage.status))
      .length,
    errors: stages.reduce((sum, stage) => sum + stage.errors.length, 0),
  };
}

function determineOverallStatus(args, release, stages, totals) {
  if (!release.should_release) {
    return args.fail_if_no_release ? "no-release-failed" : "no-release";
  }

  if (args.fail_on_missing_required && totals.required_missing > 0) {
    return "missing-required";
  }

  if (args.fail_on_failed_stage && totals.failed > 0) {
    return "failed";
  }

  const failedRequired = stages.filter((stage) => stage.required && !stage.ok);

  if (failedRequired.length) {
    return "required-stage-failed";
  }

  if (totals.failed > 0) {
    return "warning";
  }

  if (totals.warnings > 0) {
    return "warning";
  }

  if (release.prerelease) {
    return "prerelease-ready";
  }

  return "release-ready";
}

function createReport(args, repoRoot, configFile, configAvailable, sources) {
  const github = getGitMetadata(repoRoot);
  const release = resolveRelease(args, sources);
  const changelog = summarizeChangelog(args, sources);
  const npm = summarizeNpm(sources);
  const stages = buildStages(args, repoRoot, sources);
  const stageTotals = summarizeStages(stages);
  const status = determineOverallStatus(args, release, stages, stageTotals);

  const errors = [
    ...stages.flatMap((stage) =>
      stage.errors.map((error) => ({
        stage: stage.id,
        message: error,
      })),
    ),
  ];

  const warnings = [
    ...stages.flatMap((stage) =>
      stage.warnings.map((warning) => ({
        stage: stage.id,
        message: warning,
      })),
    ),
  ];

  if (!release.should_release && args.fail_if_no_release) {
    errors.push({
      stage: "release",
      message: "No release was selected.",
    });
  }

  if (args.fail_on_missing_required) {
    for (const stage of stages.filter(
      (item) => item.required && !item.available,
    )) {
      errors.push({
        stage: stage.id,
        message: `Required release report is missing: ${stage.file}`,
      });
    }
  }

  const ok =
    errors.length === 0 &&
    status !== "failed" &&
    status !== "missing-required" &&
    status !== "required-stage-failed" &&
    status !== "no-release-failed";

  const report = {
    schema_version: 1,
    type: "release-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      label_report_file: toRelativePath(
        resolvePath(args.label_report_file, repoRoot),
        repoRoot,
      ),
      version_report_file: toRelativePath(
        resolvePath(args.version_report_file, repoRoot),
        repoRoot,
      ),
      changelog_report_file: toRelativePath(
        resolvePath(args.changelog_report_file, repoRoot),
        repoRoot,
      ),
      changelog_markdown_file: toRelativePath(
        resolvePath(args.changelog_markdown_file, repoRoot),
        repoRoot,
      ),
      tag_report_file: toRelativePath(
        resolvePath(args.tag_report_file, repoRoot),
        repoRoot,
      ),
      github_release_report_file: toRelativePath(
        resolvePath(args.github_release_report_file, repoRoot),
        repoRoot,
      ),
      discussion_report_file: toRelativePath(
        resolvePath(args.discussion_report_file, repoRoot),
        repoRoot,
      ),
      npm_summary_file: toRelativePath(
        resolvePath(args.npm_summary_file, repoRoot),
        repoRoot,
      ),
      require_version_report: args.require_version_report,
      require_changelog_report: args.require_changelog_report,
      require_github_release: args.require_github_release,
      require_release_tag: args.require_release_tag,
      require_discussion: args.require_discussion,
      include_npm_summary: args.include_npm_summary,
      include_changelog_markdown: args.include_changelog_markdown,
      include_source_reports: args.include_source_reports,
      fail_if_no_release: args.fail_if_no_release,
      fail_on_missing_required: args.fail_on_missing_required,
      fail_on_failed_stage: args.fail_on_failed_stage,
      dry_run: args.dry_run,
    },
    release,
    changelog,
    npm,
    stages,
    totals: {
      ...stageTotals,
      changelog_commits: changelog.commits,
      changelog_breaking_changes: changelog.breaking_changes,
      npm_packages: npm.packages,
      npm_published: npm.published,
      npm_failed: npm.failed,
      errors: errors.length,
      warnings: warnings.length,
      ok,
    },
    errors,
    warnings,
    status,
    ok,
  };

  if (args.include_source_reports) {
    report.sources = {
      label_report: sources.label_report,
      version_report: sources.version_report,
      changelog_report: sources.changelog_report,
      tag_report: sources.tag_report,
      github_release_report: sources.github_release_report,
      discussion_report: sources.discussion_report,
      npm_summary: sources.npm_summary,
    };
  }

  return report;
}

function escapeMarkdown(value) {
  return String(value ?? "")
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
  const releaseIcon = report.release.should_release
    ? report.release.prerelease
      ? "🧪"
      : "🚀"
    : "⏭️";

  const lines = [
    `# 🧾 ${PROJECT_NAME} Release Summary`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Decision: ${releaseIcon} \`${report.release.should_release ? "release" : "do not release"}\``,
    `- Release: \`${escapeMarkdown(report.release.name || "unresolved")}\``,
    `- Version: \`${report.release.version || "unresolved"}\``,
    `- Tag: \`${report.release.tag || "unresolved"}\``,
    `- Type: \`${report.release.release_type || "none"}\``,
    `- Channel: \`${report.release.release_channel || "stable"}\``,
    `- Prerelease: \`${report.release.prerelease ? "true" : "false"}\``,
    `- Stages available: \`${report.totals.available}/${report.totals.stages}\``,
    `- Failed stages: \`${report.totals.failed}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
  ];

  if (report.release.release_url) {
    lines.push(`GitHub Release: ${report.release.release_url}`);
    lines.push("");
  }

  if (report.release.discussion_url) {
    lines.push(`Discussion Announcement: ${report.release.discussion_url}`);
    lines.push("");
  }

  if (report.release.compare_url) {
    lines.push(`Compare: ${report.release.compare_url}`);
    lines.push("");
  }

  if (report.release.reason) {
    lines.push("## 🧠 Release Reason");
    lines.push("");
    lines.push(escapeMarkdown(report.release.reason));
    lines.push("");
  }

  lines.push("## 🧩 Release Stages");
  lines.push("");
  lines.push("| Stage | Status | Available | Required | OK | File |");
  lines.push("|---|---|---:|---:|---:|---|");

  for (const stage of report.stages) {
    lines.push(
      `| ${escapeMarkdown(stage.title)} | \`${escapeMarkdown(stage.status)}\` | \`${stage.available ? "true" : "false"}\` | \`${stage.required ? "true" : "false"}\` | \`${stage.ok ? "true" : "false"}\` | \`${escapeMarkdown(stage.file)}\` |`,
    );
  }

  lines.push("");
  lines.push("## 📝 Changelog");
  lines.push("");
  lines.push(
    `- Available: \`${report.changelog.available ? "true" : "false"}\``,
  );
  lines.push(`- Commits: \`${report.changelog.commits}\``);
  lines.push(`- Breaking changes: \`${report.changelog.breaking_changes}\``);
  lines.push(`- Authors: \`${report.changelog.authors}\``);
  lines.push(`- Files changed: \`${report.changelog.files_changed}\``);
  lines.push(
    `- Diff: \`+${report.changelog.insertions}/-${report.changelog.deletions}\``,
  );

  if (report.npm.available) {
    lines.push("");
    lines.push("## 📦 NPM Packages");
    lines.push("");
    lines.push(`- Status: \`${report.npm.status || "unknown"}\``);
    lines.push(`- Packages: \`${report.npm.packages}\``);
    lines.push(`- Publishable: \`${report.npm.publishable}\``);
    lines.push(`- Packed: \`${report.npm.packed}\``);
    lines.push(`- Published: \`${report.npm.published}\``);
    lines.push(`- Failed: \`${report.npm.failed}\``);
    lines.push(`- Invalid: \`${report.npm.invalid}\``);
    lines.push(`- Tarballs: \`${report.npm.tarballs}\``);
    lines.push(`- Tarball size: \`${formatBytes(report.npm.tarball_bytes)}\``);

    if (report.npm.published_packages.length) {
      lines.push("");
      lines.push("### 🚀 Published Packages");
      lines.push("");

      for (const pkg of report.npm.published_packages) {
        lines.push(
          `- \`${escapeMarkdown(pkg.name)}@${escapeMarkdown(pkg.version || "unknown")}\``,
        );
      }
    }
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");
    lines.push("| Stage | Error |");
    lines.push("|---|---|");

    for (const error of report.errors) {
      lines.push(
        `| \`${escapeMarkdown(error.stage)}\` | ${escapeMarkdown(error.message)} |`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, 100)) {
      lines.push(
        `- \`${escapeMarkdown(warning.stage)}\`: ${escapeMarkdown(warning.message)}`,
      );
    }

    if (report.warnings.length > 100) {
      lines.push(
        `- ...and \`${report.warnings.length - 100}\` more warning(s).`,
      );
    }
  }

  if (report.changelog.excerpt) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## 📜 Release Notes");
    lines.push("");
    lines.push(report.changelog.excerpt.trim());
  }

  lines.push("");
  lines.push("---");
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
  setGitHubOutput("release_summary_file", report.config.output_file);
  setGitHubOutput(
    "release_summary_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("release_summary_status", report.status);
  setGitHubOutput("release_summary_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "release_should_release",
    report.release.should_release ? "true" : "false",
  );
  setGitHubOutput(
    "release_skip",
    report.release.skip_release ? "true" : "false",
  );
  setGitHubOutput("release_type", report.release.release_type || "");
  setGitHubOutput("release_channel", report.release.release_channel || "");
  setGitHubOutput(
    "release_prerelease",
    report.release.prerelease ? "true" : "false",
  );
  setGitHubOutput("release_stable", report.release.stable ? "true" : "false");

  setGitHubOutput("release_version", report.release.version || "");
  setGitHubOutput(
    "release_version_without_prefix",
    report.release.version_without_prefix || "",
  );
  setGitHubOutput("release_tag", report.release.tag || "");
  setGitHubOutput("release_name", report.release.name || "");
  setGitHubOutput("release_url", report.release.release_url || "");
  setGitHubOutput("release_tag_url", report.release.tag_url || "");
  setGitHubOutput("release_compare_url", report.release.compare_url || "");
  setGitHubOutput(
    "release_discussion_url",
    report.release.discussion_url || "",
  );
  setGitHubOutput("release_reason", report.release.reason || "");

  setGitHubOutput("release_stages_available", String(report.totals.available));
  setGitHubOutput("release_stages_failed", String(report.totals.failed));
  setGitHubOutput("release_errors", String(report.totals.errors));
  setGitHubOutput("release_warnings", String(report.totals.warnings));

  setGitHubOutput(
    "release_changelog_commits",
    String(report.changelog.commits),
  );
  setGitHubOutput(
    "release_changelog_breaking_changes",
    String(report.changelog.breaking_changes),
  );
  setGitHubOutput("release_npm_packages", String(report.npm.packages));
  setGitHubOutput("release_npm_published", String(report.npm.published));

  setGitHubOutput("release_stage_results_json", JSON.stringify(report.stages));
  setGitHubOutput("release_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("release_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing release workflow.");

  const sources = readSources(args, repoRoot);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    sources,
  );
  const markdown = createMarkdownSummary(report);
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
