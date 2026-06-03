#!/usr/bin/env node
// .github/scripts/release/post-discussion-announcement.js
// =============================================================================
// Aerealith AI — GitHub Discussion Release Announcement Poster
// -----------------------------------------------------------------------------
// Purpose:
//   Create or update a GitHub Discussion announcement for a release using
//   changelog artifacts, GitHub release artifacts, direct Markdown body input,
//   or workflow dispatch inputs.
//
// Input:
//   - artifacts/release/build-changelog.json
//   - artifacts/release/build-changelog.md
//   - artifacts/release/create-github-release.json
//   - .github/release/post-discussion-announcement.json
//   - .github/release/post-discussion-announcement.jsonc
//   - .github/release/post-discussion-announcement.yaml
//   - .github/release/post-discussion-announcement.yml
//
// Output:
//   - artifacts/release/post-discussion-announcement.json
//   - artifacts/release/post-discussion-announcement.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses GitHub GraphQL API directly.
//   - Dry-run mode reports the intended discussion without mutating GitHub.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[discussion-announcement] ${message}`),
    warn: (message) =>
      console.warn(`[discussion-announcement] WARN: ${message}`),
    error: (message) =>
      console.error(`[discussion-announcement] ERROR: ${message}`),
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
  ".github/release/post-discussion-announcement.json",
  ".github/release/post-discussion-announcement.jsonc",
  ".github/release/post-discussion-announcement.yaml",
  ".github/release/post-discussion-announcement.yml",
  ".github/release/discussion-announcement.json",
  ".github/release/discussion-announcement.jsonc",
  ".github/release/discussion-announcement.yaml",
  ".github/release/discussion-announcement.yml",
  "release/post-discussion-announcement.json",
  "release/post-discussion-announcement.jsonc",
  "release/post-discussion-announcement.yaml",
  "release/post-discussion-announcement.yml",
  "release/discussion-announcement.json",
  "release/discussion-announcement.jsonc",
  "release/discussion-announcement.yaml",
  "release/discussion-announcement.yml",
];

const DEFAULT_CHANGELOG_REPORT_FILE = "artifacts/release/build-changelog.json";
const DEFAULT_CHANGELOG_MARKDOWN_FILE = "artifacts/release/build-changelog.md";
const DEFAULT_GITHUB_RELEASE_REPORT_FILE =
  "artifacts/release/create-github-release.json";
const DEFAULT_OUTPUT_FILE =
  "artifacts/release/post-discussion-announcement.json";
const DEFAULT_SUMMARY_FILE =
  "artifacts/release/post-discussion-announcement.md";

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
    graphql_url:
      process.env.GITHUB_GRAPHQL_URL || "https://api.github.com/graphql",
    token:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_TOKEN ||
      process.env.RELEASE_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.POST_DISCUSSION_ANNOUNCEMENT_CONFIG_FILE || "",

    changelog_report_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_CHANGELOG_REPORT_FILE ||
      process.env.RELEASE_CHANGELOG_REPORT_FILE ||
      DEFAULT_CHANGELOG_REPORT_FILE,
    changelog_markdown_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_CHANGELOG_MARKDOWN_FILE ||
      process.env.RELEASE_CHANGELOG_MARKDOWN_FILE ||
      DEFAULT_CHANGELOG_MARKDOWN_FILE,
    github_release_report_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_RELEASE_REPORT_FILE ||
      process.env.GITHUB_RELEASE_REPORT_FILE ||
      DEFAULT_GITHUB_RELEASE_REPORT_FILE,

    body_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_BODY_FILE ||
      process.env.DISCUSSION_ANNOUNCEMENT_BODY_FILE ||
      "",
    body:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_BODY ||
      process.env.DISCUSSION_ANNOUNCEMENT_BODY ||
      "",

    output_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_OUTPUT_FILE ||
      DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_SUMMARY_FILE ||
      DEFAULT_SUMMARY_FILE,

    title:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_TITLE ||
      process.env.DISCUSSION_ANNOUNCEMENT_TITLE ||
      "",
    category_id:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_CATEGORY_ID ||
      process.env.DISCUSSION_CATEGORY_ID ||
      "",
    category_name:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_CATEGORY_NAME ||
      process.env.DISCUSSION_CATEGORY_NAME ||
      "Announcements",

    tag:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_TAG ||
      process.env.RELEASE_TAG ||
      process.env.GITHUB_REF_NAME ||
      "",
    version:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_VERSION ||
      process.env.RELEASE_VERSION ||
      "",
    release_url:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_RELEASE_URL ||
      process.env.GITHUB_RELEASE_URL ||
      "",
    discussion_url:
      process.env.POST_DISCUSSION_ANNOUNCEMENT_DISCUSSION_URL ||
      process.env.DISCUSSION_URL ||
      "",

    post: normalizeBoolean(process.env.POST_DISCUSSION_ANNOUNCEMENT_POST, true),
    update_existing: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_UPDATE_EXISTING,
      true,
    ),
    fail_if_exists: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_FAIL_IF_EXISTS,
      false,
    ),
    fail_if_missing: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_FAIL_IF_MISSING,
      true,
    ),
    fail_if_no_category: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_FAIL_IF_NO_CATEGORY,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_FAIL_ON_ERROR,
      true,
    ),

    append_release_link: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_APPEND_RELEASE_LINK,
      true,
    ),
    append_footer: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_APPEND_FOOTER,
      true,
    ),
    search_existing: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_SEARCH_EXISTING,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_TIMEOUT_SECONDS,
      120,
    ),

    dry_run: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_PRINT,
      true,
    ),
    write_summary_file: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.POST_DISCUSSION_ANNOUNCEMENT_STEP_SUMMARY,
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

    if (arg === "--graphql-url") {
      args.graphql_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--token") {
      args.token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = argv[index + 1];
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

    if (arg === "--release-report") {
      args.github_release_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--body-file") {
      args.body_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--body") {
      args.body = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title") {
      args.title = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--category-id") {
      args.category_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--category" || arg === "--category-name") {
      args.category_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
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

    if (arg === "--post") {
      args.post = true;
      continue;
    }

    if (arg === "--no-post") {
      args.post = false;
      continue;
    }

    if (arg === "--update-existing") {
      args.update_existing = true;
      continue;
    }

    if (arg === "--no-update-existing") {
      args.update_existing = false;
      continue;
    }

    if (arg === "--fail-if-exists") {
      args.fail_if_exists = true;
      continue;
    }

    if (arg === "--fail-if-missing") {
      args.fail_if_missing = true;
      continue;
    }

    if (arg === "--no-fail-if-missing") {
      args.fail_if_missing = false;
      continue;
    }

    if (arg === "--fail-if-no-category") {
      args.fail_if_no_category = true;
      continue;
    }

    if (arg === "--no-fail-if-no-category") {
      args.fail_if_no_category = false;
      continue;
    }

    if (arg === "--search-existing") {
      args.search_existing = true;
      continue;
    }

    if (arg === "--no-search-existing") {
      args.search_existing = false;
      continue;
    }

    if (arg === "--append-release-link") {
      args.append_release_link = true;
      continue;
    }

    if (arg === "--no-release-link") {
      args.append_release_link = false;
      continue;
    }

    if (arg === "--append-footer") {
      args.append_footer = true;
      continue;
    }

    if (arg === "--no-footer") {
      args.append_footer = false;
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

    if (arg === "--timeout-seconds") {
      args.timeout_seconds = normalizeInteger(
        argv[index + 1],
        args.timeout_seconds,
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
  args.graphql_url = normalizeString(
    args.graphql_url,
    "https://api.github.com/graphql",
  );
  args.title = normalizeString(args.title);
  args.category_id = normalizeString(args.category_id);
  args.category_name = normalizeString(args.category_name, "Announcements");
  args.tag = normalizeTag(args.tag);
  args.version = normalizeVersion(args.version);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Discussion Announcement Poster

Usage:
  node .github/scripts/release/post-discussion-announcement.js [options]

Examples:
  node .github/scripts/release/post-discussion-announcement.js --dry-run
  node .github/scripts/release/post-discussion-announcement.js --category Announcements
  node .github/scripts/release/post-discussion-announcement.js --title "🚀 Aerealith AI v2.10.0 is live"
  node .github/scripts/release/post-discussion-announcement.js --tag v2.10.0 --release-url https://github.com/org/repo/releases/tag/v2.10.0
  node .github/scripts/release/post-discussion-announcement.js --no-update-existing --fail-if-exists

Options:
      --repo <owner/repo>                 Repository slug.
      --graphql-url <url>                 GitHub GraphQL URL.
      --token <token>                     GitHub token.
      --config <file>                     Discussion announcement config file.
      --changelog-report <file>           build-changelog JSON report.
      --changelog-markdown <file>         build-changelog Markdown file.
      --release-report <file>             create-github-release JSON report.
      --body-file <file>                  Discussion Markdown body file.
      --body <markdown>                   Direct discussion body.
      --title <title>                     Discussion title.
      --category-id <id>                  GitHub Discussion category node ID.
      --category <name>                   GitHub Discussion category name. Default: Announcements.
      --tag <tag>                         Release tag.
      --version <version>                 Release version.
      --release-url <url>                 GitHub Release URL.
      --discussion-url <url>              Existing discussion URL for reporting.
      --post                              Create/update discussion. Default.
      --no-post                           Plan only; do not post.
      --update-existing                   Update matching existing discussion. Default.
      --no-update-existing                Skip when matching discussion exists.
      --fail-if-exists                    Fail when matching discussion exists.
      --fail-if-missing                   Fail when title/body cannot be resolved. Default.
      --no-fail-if-missing                Do not fail on missing title/body.
      --fail-if-no-category               Fail when category cannot be resolved. Default.
      --no-fail-if-no-category            Continue without category resolution.
      --search-existing                   Search for existing discussion by title. Default.
      --no-search-existing                Do not search for existing discussion.
      --append-release-link               Append GitHub Release link. Default.
      --no-release-link                   Do not append release link.
      --append-footer                     Append generated footer. Default.
      --no-footer                         Do not append generated footer.
      --fail-on-error                     Exit non-zero on failure. Default.
      --no-fail-on-error                  Do not fail workflow on errors.
      --timeout-seconds <number>          API timeout. Default: 120.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not mutate GitHub.
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
    "title",
    "category_id",
    "category_name",
    "tag",
    "version",
    "release_url",
    "discussion_url",
    "body",
    "body_file",
    "changelog_report_file",
    "changelog_markdown_file",
    "github_release_report_file",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "post",
    "update_existing",
    "fail_if_exists",
    "fail_if_missing",
    "fail_if_no_category",
    "append_release_link",
    "append_footer",
    "search_existing",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  merged.tag = normalizeTag(merged.tag);
  merged.version = normalizeVersion(merged.version);

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

function parseRepository(repository) {
  const value = normalizeString(repository, DEFAULT_REPOSITORY);

  if (value.includes("/")) {
    const [owner, name] = value.split("/");

    return {
      owner,
      name,
    };
  }

  throw new Error(`Repository must be in owner/name format: ${repository}`);
}

function releaseFromChangelogReport(changelogReport) {
  if (!changelogReport || typeof changelogReport !== "object") {
    return {
      tag: "",
      version: "",
      title: "",
      body: "",
      date: "",
    };
  }

  return {
    tag: normalizeTag(
      changelogReport.release?.tag || changelogReport.release?.version,
    ),
    version: normalizeVersion(
      changelogReport.release?.version || changelogReport.release?.tag,
    ),
    title: normalizeString(
      changelogReport.release?.title || changelogReport.release?.version,
    ),
    body: normalizeString(changelogReport.markdown?.release_section),
    date: normalizeString(changelogReport.release?.date),
  };
}

function releaseFromGitHubReleaseReport(releaseReport) {
  if (!releaseReport || typeof releaseReport !== "object") {
    return {
      tag: "",
      name: "",
      url: "",
    };
  }

  return {
    tag: normalizeTag(
      releaseReport.release?.tag_name || releaseReport.release_input?.tag,
    ),
    name: normalizeString(
      releaseReport.release?.name || releaseReport.release_input?.name,
    ),
    url: normalizeString(
      releaseReport.release?.html_url || releaseReport.release_input?.url,
    ),
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

function repositoryUrl(repository) {
  const repo = normalizeString(repository, DEFAULT_REPOSITORY);

  if (/^https?:\/\//.test(repo)) return repo.replace(/\/+$/g, "");

  return `https://github.com/${repo}`;
}

function releaseUrl(repository, tag) {
  if (!tag) return "";

  return `${repositoryUrl(repository)}/releases/tag/${encodeURIComponent(tag)}`;
}

function resolveAnnouncementInput(args, repoRoot) {
  const changelogReport = readJsonFile(
    args.changelog_report_file,
    repoRoot,
    null,
  );
  const githubReleaseReport = readJsonFile(
    args.github_release_report_file,
    repoRoot,
    null,
  );
  const changelogMarkdown = readTextFile(
    args.changelog_markdown_file,
    repoRoot,
    "",
  );
  const bodyFromFile = args.body_file
    ? readTextFile(args.body_file, repoRoot, "")
    : "";

  const changelog = releaseFromChangelogReport(changelogReport);
  const githubRelease = releaseFromGitHubReleaseReport(githubReleaseReport);

  const tag = normalizeTag(args.tag || githubRelease.tag || changelog.tag);
  const version = normalizeVersion(args.version || changelog.version || tag);
  const releaseLink =
    normalizeString(args.release_url) ||
    githubRelease.url ||
    releaseUrl(args.repository, tag);

  const title =
    normalizeString(args.title) ||
    normalizeString(githubRelease.name) ||
    normalizeString(changelog.title) ||
    (version
      ? `🚀 ${PROJECT_NAME} ${version} is live`
      : `🚀 ${PROJECT_NAME} release announcement`);

  let body =
    normalizeString(args.body) ||
    normalizeString(bodyFromFile) ||
    normalizeString(changelog.body) ||
    normalizeString(extractReleaseSectionFromSummary(changelogMarkdown));

  if (args.append_release_link && releaseLink && !body.includes(releaseLink)) {
    body = `${body.trim()}\n\n---\n\n🔗 **GitHub Release:** ${releaseLink}\n`;
  }

  if (args.append_footer) {
    body = `${body.trim()}\n\n---\n\n_This announcement was generated from the release workflow._\n`;
  }

  return {
    changelog_report_available: Boolean(changelogReport),
    changelog_markdown_available: Boolean(changelogMarkdown),
    github_release_report_available: Boolean(githubReleaseReport),
    title,
    body: body.trim(),
    tag,
    version,
    release_url: releaseLink,
    category_id: args.category_id,
    category_name: args.category_name,
  };
}

function requestGraphql(args, query, variables = {}, options = {}) {
  const parsed = new URL(args.graphql_url);
  const body = JSON.stringify({
    query,
    variables,
  });

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-discussion-announcement-script`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body)),
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`;
  }

  const requestOptions = {
    method: "POST",
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: (args.timeout_seconds || 120) * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const parsedBody = safeJsonParse(responseText, null);
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 300;

        if (!ok && !options.allow_error) {
          reject(
            new Error(
              `GitHub GraphQL request failed with HTTP ${statusCode}: ${responseText}`,
            ),
          );
          return;
        }

        if (parsedBody?.errors?.length && !options.allow_error) {
          reject(
            new Error(
              `GitHub GraphQL error: ${parsedBody.errors
                .map((error) => error.message || JSON.stringify(error))
                .join("; ")}`,
            ),
          );
          return;
        }

        resolve({
          ok,
          status_code: statusCode,
          body: parsedBody,
          raw_body: responseText,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(
        new Error(
          `Request timed out after ${args.timeout_seconds || 120} second(s).`,
        ),
      );
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getRepositoryAndCategories(args) {
  const { owner, name } = parseRepository(args.repository);

  const query = `
    query RepositoryDiscussionCategories($owner: String!, $name: String!, $first: Int!) {
      repository(owner: $owner, name: $name) {
        id
        nameWithOwner
        discussionCategories(first: $first) {
          nodes {
            id
            name
            emoji
            description
            isAnswerable
          }
        }
      }
    }
  `;

  const response = await requestGraphql(args, query, {
    owner,
    name,
    first: 50,
  });

  return response.body?.data?.repository || null;
}

function findDiscussionCategory(categories, input) {
  if (input.category_id) {
    return (
      categories.find((category) => category.id === input.category_id) || {
        id: input.category_id,
        name: input.category_name || "provided-category-id",
        emoji: "",
        description: "",
      }
    );
  }

  const wanted = normalizeString(input.category_name).toLowerCase();

  return (
    categories.find(
      (category) => normalizeString(category.name).toLowerCase() === wanted,
    ) ||
    categories.find((category) =>
      normalizeString(category.name).toLowerCase().includes(wanted),
    ) ||
    null
  );
}

async function searchExistingDiscussion(args, input) {
  if (!args.search_existing || !input.title) return null;

  const { owner, name } = parseRepository(args.repository);
  const queryText = `repo:${owner}/${name} in:title "${input.title.replace(/"/g, '\\"')}"`;

  const query = `
    query SearchExistingDiscussion($query: String!, $first: Int!) {
      search(query: $query, type: DISCUSSION, first: $first) {
        nodes {
          ... on Discussion {
            id
            number
            title
            url
            body
            createdAt
            updatedAt
            category {
              id
              name
            }
          }
        }
      }
    }
  `;

  const response = await requestGraphql(
    args,
    query,
    {
      query: queryText,
      first: 10,
    },
    {
      allow_error: true,
    },
  );

  const nodes = response.body?.data?.search?.nodes || [];

  return (
    nodes.find(
      (discussion) => normalizeString(discussion.title) === input.title,
    ) ||
    nodes[0] ||
    null
  );
}

async function createDiscussion(args, repositoryId, categoryId, input) {
  const mutation = `
    mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repositoryId,
        categoryId: $categoryId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          number
          title
          url
          body
          createdAt
          updatedAt
          category {
            id
            name
          }
        }
      }
    }
  `;

  const response = await requestGraphql(args, mutation, {
    repositoryId,
    categoryId,
    title: input.title,
    body: input.body,
  });

  return response.body?.data?.createDiscussion?.discussion || null;
}

async function updateDiscussion(args, discussionId, input) {
  const mutation = `
    mutation UpdateDiscussion($discussionId: ID!, $title: String!, $body: String!) {
      updateDiscussion(input: {
        discussionId: $discussionId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          number
          title
          url
          body
          createdAt
          updatedAt
          category {
            id
            name
          }
        }
      }
    }
  `;

  const response = await requestGraphql(args, mutation, {
    discussionId,
    title: input.title,
    body: input.body,
  });

  return response.body?.data?.updateDiscussion?.discussion || null;
}

function createPlannedDiscussion(input, category, existingDiscussion, action) {
  return {
    id: existingDiscussion?.id || "planned",
    number: existingDiscussion?.number || 0,
    title: input.title,
    url: existingDiscussion?.url || input.release_url || "",
    body: input.body,
    createdAt: existingDiscussion?.createdAt || "",
    updatedAt: existingDiscussion?.updatedAt || "",
    category: {
      id: category?.id || input.category_id || "",
      name: category?.name || input.category_name || "",
    },
    planned: true,
    action,
  };
}

async function runAnnouncement(args, repoRoot, input) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    action: "none",
    repository: null,
    category: null,
    existing_discussion: null,
    discussion: null,
    errors: [],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!input.title && args.fail_if_missing) {
      result.status = "invalid";
      result.errors.push("Discussion title could not be resolved.");
      return result;
    }

    if (!input.body && args.fail_if_missing) {
      result.status = "invalid";
      result.errors.push("Discussion body could not be resolved.");
      return result;
    }

    if (!args.post) {
      result.status = "skipped";
      result.success = true;
      result.warnings.push("Posting is disabled.");
      return result;
    }

    if (!args.dry_run && !args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, or --token.",
      );
      return result;
    }

    if (args.dry_run && !args.token) {
      result.category = {
        id: input.category_id || "planned-category",
        name: input.category_name,
      };
      result.discussion = createPlannedDiscussion(
        input,
        result.category,
        null,
        "create-planned",
      );
      result.status = "planned";
      result.action = "create-planned";
      result.success = true;
      return result;
    }

    const repository = await getRepositoryAndCategories(args);
    result.repository = repository;

    if (!repository?.id) {
      result.status = "failed";
      result.errors.push(
        `Repository could not be resolved: ${args.repository}`,
      );
      return result;
    }

    const categories = repository.discussionCategories?.nodes || [];
    const category = findDiscussionCategory(categories, input);
    result.category = category;

    if (!category?.id && args.fail_if_no_category) {
      result.status = "failed";
      result.errors.push(
        `Discussion category could not be resolved: ${input.category_name || input.category_id}`,
      );
      return result;
    }

    const existingDiscussion = await searchExistingDiscussion(args, input);
    result.existing_discussion = existingDiscussion;

    if (existingDiscussion && args.fail_if_exists) {
      result.status = "failed";
      result.errors.push(
        `Discussion already exists: ${existingDiscussion.url || existingDiscussion.title}`,
      );
      return result;
    }

    if (existingDiscussion && !args.update_existing) {
      result.status = "skipped-existing";
      result.action = "skipped-existing";
      result.discussion = existingDiscussion;
      result.success = true;
      result.warnings.push(
        "Matching discussion already exists and update_existing is disabled.",
      );
      return result;
    }

    if (args.dry_run) {
      result.action = existingDiscussion ? "update-planned" : "create-planned";
      result.discussion = createPlannedDiscussion(
        input,
        category,
        existingDiscussion,
        result.action,
      );
      result.status = "planned";
      result.success = true;
      return result;
    }

    if (existingDiscussion) {
      logger.info(`Updating existing discussion: ${existingDiscussion.title}`);
      result.discussion = await updateDiscussion(
        args,
        existingDiscussion.id,
        input,
      );
      result.action = "updated";
      result.status = "updated";
      result.success = true;
      return result;
    }

    logger.info(`Creating discussion announcement: ${input.title}`);
    result.discussion = await createDiscussion(
      args,
      repository.id,
      category.id,
      input,
    );
    result.action = "created";
    result.status = "created";
    result.success = true;

    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
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

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  input,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const discussion = execution.discussion || {};
  const category = execution.category || discussion.category || {};

  return {
    schema_version: 1,
    type: "release-discussion-announcement",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      changelog_report_file: toRelativePath(
        resolvePath(args.changelog_report_file, repoRoot),
        repoRoot,
      ),
      changelog_report_available: input.changelog_report_available,
      changelog_markdown_file: toRelativePath(
        resolvePath(args.changelog_markdown_file, repoRoot),
        repoRoot,
      ),
      changelog_markdown_available: input.changelog_markdown_available,
      github_release_report_file: toRelativePath(
        resolvePath(args.github_release_report_file, repoRoot),
        repoRoot,
      ),
      github_release_report_available: input.github_release_report_available,
      body_file: args.body_file
        ? toRelativePath(resolvePath(args.body_file, repoRoot), repoRoot)
        : null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      graphql_url: args.graphql_url,
      category_name: args.category_name,
      post: args.post,
      update_existing: args.update_existing,
      fail_if_exists: args.fail_if_exists,
      fail_if_missing: args.fail_if_missing,
      fail_if_no_category: args.fail_if_no_category,
      append_release_link: args.append_release_link,
      append_footer: args.append_footer,
      search_existing: args.search_existing,
      dry_run: args.dry_run,
    },
    announcement_input: {
      title: input.title,
      body_length: input.body.length,
      tag: input.tag,
      version: input.version,
      release_url: input.release_url,
      category_id: input.category_id,
      category_name: input.category_name,
    },
    discussion: {
      id: discussion.id || "",
      number: discussion.number || 0,
      title: discussion.title || input.title,
      url: discussion.url || args.discussion_url || "",
      category_id: category.id || "",
      category_name: category.name || "",
      action: execution.action,
      planned: Boolean(discussion.planned),
    },
    existing_discussion: execution.existing_discussion
      ? {
          id: execution.existing_discussion.id,
          number: execution.existing_discussion.number,
          title: execution.existing_discussion.title,
          url: execution.existing_discussion.url,
          category_name: execution.existing_discussion.category?.name || "",
        }
      : null,
    totals: {
      errors: execution.errors.length,
      warnings: execution.warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok: execution.success,
    },
    warnings: execution.warnings,
    errors: execution.errors,
    status: execution.status,
    ok: execution.success,
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

function createMarkdownSummary(report) {
  const lines = [
    `# 📣 ${PROJECT_NAME} Discussion Announcement`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Action: \`${report.discussion.action || "none"}\``,
    `- Title: \`${escapeMarkdown(report.discussion.title || "unresolved")}\``,
    `- Category: \`${escapeMarkdown(report.discussion.category_name || report.config.category_name || "unresolved")}\``,
    `- Tag: \`${report.announcement_input.tag || "none"}\``,
    `- Version: \`${report.announcement_input.version || "none"}\``,
    `- Body length: \`${report.announcement_input.body_length}\``,
    `- Duration: \`${report.totals.duration_human}\``,
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

  if (report.discussion.url) {
    lines.push(`Discussion URL: ${report.discussion.url}`);
    lines.push("");
  }

  if (report.announcement_input.release_url) {
    lines.push(`Release URL: ${report.announcement_input.release_url}`);
    lines.push("");
  }

  lines.push("## ⚙️ Announcement Configuration");
  lines.push("");
  lines.push(`- Post enabled: \`${report.config.post ? "true" : "false"}\``);
  lines.push(
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Search existing: \`${report.config.search_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Append release link: \`${report.config.append_release_link ? "true" : "false"}\``,
  );
  lines.push(
    `- Append footer: \`${report.config.append_footer ? "true" : "false"}\``,
  );

  if (report.existing_discussion) {
    lines.push("");
    lines.push("## 🔁 Existing Discussion");
    lines.push("");
    lines.push(
      `- Title: \`${escapeMarkdown(report.existing_discussion.title)}\``,
    );
    lines.push(`- URL: ${report.existing_discussion.url}`);
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
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
  lines.push(`- Changelog report: \`${report.config.changelog_report_file}\``);
  lines.push(
    `- Changelog report available: \`${report.config.changelog_report_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Changelog markdown: \`${report.config.changelog_markdown_file}\``,
  );
  lines.push(
    `- Changelog markdown available: \`${report.config.changelog_markdown_available ? "true" : "false"}\``,
  );
  lines.push(
    `- GitHub release report: \`${report.config.github_release_report_file}\``,
  );
  lines.push(
    `- GitHub release report available: \`${report.config.github_release_report_available ? "true" : "false"}\``,
  );

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
  setGitHubOutput("discussion_announcement_file", report.config.output_file);
  setGitHubOutput(
    "discussion_announcement_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("discussion_announcement_status", report.status);
  setGitHubOutput("discussion_announcement_ok", report.ok ? "true" : "false");
  setGitHubOutput(
    "discussion_announcement_action",
    report.discussion.action || "",
  );
  setGitHubOutput("discussion_announcement_id", report.discussion.id || "");
  setGitHubOutput(
    "discussion_announcement_number",
    String(report.discussion.number || ""),
  );
  setGitHubOutput(
    "discussion_announcement_title",
    report.discussion.title || "",
  );
  setGitHubOutput("discussion_announcement_url", report.discussion.url || "");
  setGitHubOutput(
    "discussion_announcement_category_id",
    report.discussion.category_id || "",
  );
  setGitHubOutput(
    "discussion_announcement_category_name",
    report.discussion.category_name || "",
  );
  setGitHubOutput(
    "discussion_announcement_release_url",
    report.announcement_input.release_url || "",
  );
  setGitHubOutput(
    "discussion_announcement_errors_json",
    JSON.stringify(report.errors),
  );
  setGitHubOutput(
    "discussion_announcement_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing release discussion announcement.");

  const input = resolveAnnouncementInput(args, repoRoot);
  const execution = await runAnnouncement(args, repoRoot, input);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    execution,
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
