#!/usr/bin/env node
// .github/scripts/release/create-github-release.js
// =============================================================================
// Aerealith AI — GitHub Release Creator
// -----------------------------------------------------------------------------
// Purpose:
//   Create or update a GitHub Release from changelog artifacts, direct release
//   notes, generated notes, and optional uploaded release assets.
//
// Input:
//   - artifacts/release/build-changelog.json
//   - artifacts/release/build-changelog.md
//   - .github/release/create-github-release.json
//   - .github/release/create-github-release.jsonc
//   - .github/release/create-github-release.yaml
//   - .github/release/create-github-release.yml
//
// Output:
//   - artifacts/release/create-github-release.json
//   - artifacts/release/create-github-release.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Dry-run mode reports the intended release without mutating GitHub.
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
    info: (message) => console.log(`[github-release] ${message}`),
    warn: (message) => console.warn(`[github-release] WARN: ${message}`),
    error: (message) => console.error(`[github-release] ERROR: ${message}`),
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
  ".github/release/create-github-release.json",
  ".github/release/create-github-release.jsonc",
  ".github/release/create-github-release.yaml",
  ".github/release/create-github-release.yml",
  ".github/release/github-release.json",
  ".github/release/github-release.jsonc",
  ".github/release/github-release.yaml",
  ".github/release/github-release.yml",
  "release/create-github-release.json",
  "release/create-github-release.jsonc",
  "release/create-github-release.yaml",
  "release/create-github-release.yml",
  "release/github-release.json",
  "release/github-release.jsonc",
  "release/github-release.yaml",
  "release/github-release.yml",
];

const DEFAULT_CHANGELOG_REPORT_FILE = "artifacts/release/build-changelog.json";
const DEFAULT_CHANGELOG_MARKDOWN_FILE = "artifacts/release/build-changelog.md";
const DEFAULT_OUTPUT_FILE = "artifacts/release/create-github-release.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/create-github-release.md";

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
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    upload_url: process.env.GITHUB_UPLOAD_URL || "https://uploads.github.com",
    token:
      process.env.CREATE_GITHUB_RELEASE_TOKEN ||
      process.env.RELEASE_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.CREATE_GITHUB_RELEASE_CONFIG_FILE || "",

    changelog_report_file:
      process.env.CREATE_GITHUB_RELEASE_CHANGELOG_REPORT_FILE ||
      process.env.RELEASE_CHANGELOG_REPORT_FILE ||
      DEFAULT_CHANGELOG_REPORT_FILE,
    changelog_markdown_file:
      process.env.CREATE_GITHUB_RELEASE_CHANGELOG_MARKDOWN_FILE ||
      process.env.RELEASE_CHANGELOG_MARKDOWN_FILE ||
      DEFAULT_CHANGELOG_MARKDOWN_FILE,
    body_file:
      process.env.CREATE_GITHUB_RELEASE_BODY_FILE ||
      process.env.RELEASE_BODY_FILE ||
      "",
    body:
      process.env.CREATE_GITHUB_RELEASE_BODY || process.env.RELEASE_BODY || "",

    output_file:
      process.env.CREATE_GITHUB_RELEASE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CREATE_GITHUB_RELEASE_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    tag:
      process.env.CREATE_GITHUB_RELEASE_TAG ||
      process.env.RELEASE_TAG ||
      process.env.GITHUB_REF_NAME ||
      "",
    name:
      process.env.CREATE_GITHUB_RELEASE_NAME || process.env.RELEASE_NAME || "",
    target_commitish:
      process.env.CREATE_GITHUB_RELEASE_TARGET_COMMITISH ||
      process.env.RELEASE_TARGET_COMMITISH ||
      process.env.GITHUB_SHA ||
      "",
    discussion_category_name:
      process.env.CREATE_GITHUB_RELEASE_DISCUSSION_CATEGORY_NAME ||
      process.env.RELEASE_DISCUSSION_CATEGORY_NAME ||
      "",

    draft: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_DRAFT || process.env.RELEASE_DRAFT,
      false,
    ),
    prerelease: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_PRERELEASE ||
        process.env.RELEASE_PRERELEASE,
      false,
    ),
    generate_release_notes: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_GENERATE_NOTES ||
        process.env.RELEASE_GENERATE_NOTES,
      false,
    ),
    append_generated_notes: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_APPEND_GENERATED_NOTES ||
        process.env.RELEASE_APPEND_GENERATED_NOTES,
      false,
    ),
    update_existing: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_UPDATE_EXISTING ||
        process.env.RELEASE_UPDATE_EXISTING,
      true,
    ),
    fail_if_exists: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_FAIL_IF_EXISTS ||
        process.env.RELEASE_FAIL_IF_EXISTS,
      false,
    ),
    fail_if_missing: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_FAIL_IF_MISSING ||
        process.env.RELEASE_FAIL_IF_MISSING,
      false,
    ),
    delete_existing_assets: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_DELETE_EXISTING_ASSETS ||
        process.env.RELEASE_DELETE_EXISTING_ASSETS,
      true,
    ),
    upload_assets: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_UPLOAD_ASSETS ||
        process.env.RELEASE_UPLOAD_ASSETS,
      true,
    ),
    verify_after_create: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_VERIFY || process.env.RELEASE_VERIFY,
      true,
    ),
    fail_on_asset_error: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_FAIL_ON_ASSET_ERROR ||
        process.env.RELEASE_FAIL_ON_ASSET_ERROR,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_FAIL_ON_ERROR ||
        process.env.RELEASE_FAIL_ON_ERROR,
      true,
    ),

    make_latest:
      process.env.CREATE_GITHUB_RELEASE_MAKE_LATEST ||
      process.env.RELEASE_MAKE_LATEST ||
      "legacy",

    asset_files: normalizeStringList(
      process.env.CREATE_GITHUB_RELEASE_ASSETS ||
        process.env.RELEASE_ASSETS ||
        process.env.RELEASE_ASSET_FILES,
    ),
    asset_globs: normalizeStringList(
      process.env.CREATE_GITHUB_RELEASE_ASSET_GLOBS ||
        process.env.RELEASE_ASSET_GLOBS,
    ),

    timeout_seconds: normalizeInteger(
      process.env.CREATE_GITHUB_RELEASE_TIMEOUT_SECONDS,
      120,
    ),
    max_asset_bytes: normalizeInteger(
      process.env.CREATE_GITHUB_RELEASE_MAX_ASSET_BYTES,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.CREATE_GITHUB_RELEASE_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.CREATE_GITHUB_RELEASE_STEP_SUMMARY,
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

    if (arg === "--api-url") {
      args.api_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--upload-url") {
      args.upload_url = argv[index + 1];
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

    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--name") {
      args.name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--target-commitish") {
      args.target_commitish = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--discussion-category") {
      args.discussion_category_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--draft") {
      args.draft = true;
      continue;
    }

    if (arg === "--no-draft") {
      args.draft = false;
      continue;
    }

    if (arg === "--prerelease") {
      args.prerelease = true;
      continue;
    }

    if (arg === "--no-prerelease") {
      args.prerelease = false;
      continue;
    }

    if (arg === "--generate-notes") {
      args.generate_release_notes = true;
      continue;
    }

    if (arg === "--no-generate-notes") {
      args.generate_release_notes = false;
      continue;
    }

    if (arg === "--append-generated-notes") {
      args.append_generated_notes = true;
      args.generate_release_notes = true;
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

    if (arg === "--delete-existing-assets") {
      args.delete_existing_assets = true;
      continue;
    }

    if (arg === "--keep-existing-assets") {
      args.delete_existing_assets = false;
      continue;
    }

    if (arg === "--upload-assets") {
      args.upload_assets = true;
      continue;
    }

    if (arg === "--no-upload-assets") {
      args.upload_assets = false;
      continue;
    }

    if (arg === "--asset" || arg === "--assets") {
      args.asset_files.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--asset-glob") {
      args.asset_globs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--make-latest") {
      args.make_latest = argv[index + 1] || "true";
      index += 1;
      continue;
    }

    if (arg === "--no-make-latest") {
      args.make_latest = "false";
      continue;
    }

    if (arg === "--verify") {
      args.verify_after_create = true;
      continue;
    }

    if (arg === "--no-verify") {
      args.verify_after_create = false;
      continue;
    }

    if (arg === "--fail-on-asset-error") {
      args.fail_on_asset_error = true;
      continue;
    }

    if (arg === "--no-fail-on-asset-error") {
      args.fail_on_asset_error = false;
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

    if (arg === "--max-asset-bytes") {
      args.max_asset_bytes = normalizeInteger(
        argv[index + 1],
        args.max_asset_bytes,
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
  args.api_url = normalizeString(
    args.api_url,
    "https://api.github.com",
  ).replace(/\/+$/g, "");
  args.upload_url = normalizeString(
    args.upload_url,
    "https://uploads.github.com",
  ).replace(/\/+$/g, "");
  args.make_latest = normalizeMakeLatest(args.make_latest);
  args.asset_files = [...new Set(args.asset_files)];
  args.asset_globs = [...new Set(args.asset_globs)];
  args.timeout_seconds = Math.max(1, args.timeout_seconds);
  args.max_asset_bytes = Math.max(0, args.max_asset_bytes);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Release Creator

Usage:
  node .github/scripts/release/create-github-release.js [options]

Examples:
  node .github/scripts/release/create-github-release.js --dry-run
  node .github/scripts/release/create-github-release.js --tag v2.10.0 --name "v2.10.0"
  node .github/scripts/release/create-github-release.js --tag v2.10.0 --asset artifacts/npm/packages/*.tgz
  node .github/scripts/release/create-github-release.js --tag v2.10.0 --update-existing --delete-existing-assets

Options:
      --repo <owner/repo>                 Repository slug.
      --api-url <url>                     GitHub API URL.
      --upload-url <url>                  GitHub upload URL.
      --token <token>                     GitHub token.
      --config <file>                     Release config file.
      --changelog-report <file>           build-changelog JSON report.
      --changelog-markdown <file>         build-changelog Markdown file.
      --body-file <file>                  Release notes Markdown file.
      --body <markdown>                   Direct release body.
      --tag <tag>                         Release tag name.
      --name <name>                       Release display name.
      --target <sha|branch>               Target commitish.
      --discussion-category <name>        GitHub Discussions category name.
      --draft                             Create/update as draft.
      --no-draft                          Create/update as published release.
      --prerelease                        Mark as prerelease.
      --no-prerelease                     Mark as full release.
      --generate-notes                    Request GitHub generated notes.
      --no-generate-notes                 Do not request generated notes.
      --append-generated-notes            Append generated notes to supplied body.
      --update-existing                   Update release if tag already exists. Default.
      --no-update-existing                Skip existing release.
      --fail-if-exists                    Fail when release already exists.
      --fail-if-missing                   Fail when no tag/body can be resolved.
      --delete-existing-assets            Replace assets with matching names. Default.
      --keep-existing-assets              Keep existing assets.
      --upload-assets                     Upload asset files. Default.
      --no-upload-assets                  Do not upload assets.
      --asset <file,glob>                 Asset file(s) to upload.
      --asset-glob <glob>                 Asset glob to upload.
      --make-latest <true|false|legacy>   GitHub make_latest value. Default: legacy.
      --verify                            Verify release after create/update. Default.
      --no-verify                         Skip verification.
      --fail-on-asset-error               Fail on upload failure. Default.
      --no-fail-on-asset-error            Continue when asset upload fails.
      --fail-on-error                     Exit non-zero on failure. Default.
      --no-fail-on-error                  Do not fail workflow on release errors.
      --timeout-seconds <number>          API request timeout. Default: 120.
      --max-asset-bytes <number>          Maximum asset size. 0 means unlimited.
  -o, --output <file>                     JSON output file.
      --summary <file>                    Markdown summary output file.
      --no-summary                        Do not write Markdown summary.
      --dry-run                           Plan but do not mutate GitHub.
      --no-print                          Do not print JSON report.
      --no-step-summary                   Do not append GitHub step summary.
`);
}

function normalizeMakeLatest(value) {
  const normalized = normalizeString(value, "legacy").toLowerCase();

  if (["true", "false", "legacy"].includes(normalized)) return normalized;

  return "legacy";
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
  const assets = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      continue;
    }

    if (section === "assets" && /^-\s*/.test(trimmed)) {
      assets.push(trimmed.replace(/^-\s*/, "").replace(/^['"]|['"]$/g, ""));
      config.assets = assets;
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

  const stringKeys = [
    "tag",
    "name",
    "target_commitish",
    "discussion_category_name",
    "body",
    "body_file",
    "changelog_report_file",
    "changelog_markdown_file",
    "output_file",
    "summary_file",
    "make_latest",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "draft",
    "prerelease",
    "generate_release_notes",
    "append_generated_notes",
    "update_existing",
    "fail_if_exists",
    "fail_if_missing",
    "delete_existing_assets",
    "upload_assets",
    "verify_after_create",
    "fail_on_asset_error",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (Array.isArray(config.assets)) {
    merged.asset_files.push(...config.assets.map(String));
  }

  if (Array.isArray(config.asset_files)) {
    merged.asset_files.push(...config.asset_files.map(String));
  }

  if (Array.isArray(config.asset_globs)) {
    merged.asset_globs.push(...config.asset_globs.map(String));
  }

  if (config.max_asset_bytes !== undefined) {
    merged.max_asset_bytes = normalizeInteger(
      config.max_asset_bytes,
      merged.max_asset_bytes,
    );
  }

  merged.make_latest = normalizeMakeLatest(merged.make_latest);
  merged.asset_files = [...new Set(merged.asset_files)];
  merged.asset_globs = [...new Set(merged.asset_globs)];

  return merged;
}

function normalizeTag(value) {
  const tag = normalizeString(value);

  if (!tag) return "";

  return tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
}

function releaseFromChangelogReport(changelogReport) {
  if (!changelogReport || typeof changelogReport !== "object") {
    return {
      tag: "",
      name: "",
      body: "",
      target_commitish: "",
    };
  }

  return {
    tag: normalizeString(
      changelogReport.release?.tag || changelogReport.release?.version,
    ),
    name: normalizeString(
      changelogReport.release?.title || changelogReport.release?.version,
    ),
    body: normalizeString(changelogReport.markdown?.release_section),
    target_commitish: normalizeString(
      changelogReport.range?.to_ref || changelogReport.github?.sha,
    ),
  };
}

function resolveReleaseInput(args, repoRoot) {
  const changelogReport = readJsonFile(
    args.changelog_report_file,
    repoRoot,
    null,
  );
  const changelogRelease = releaseFromChangelogReport(changelogReport);
  const bodyFromFile = args.body_file
    ? readTextFile(args.body_file, repoRoot, "")
    : "";
  const changelogMarkdown = readTextFile(
    args.changelog_markdown_file,
    repoRoot,
    "",
  );

  const tag = normalizeTag(args.tag || changelogRelease.tag);
  const name = normalizeString(args.name || changelogRelease.name || tag);
  const targetCommitish = normalizeString(
    args.target_commitish ||
      changelogRelease.target_commitish ||
      runGit(["rev-parse", "HEAD"], { repoRoot, fallback: DEFAULT_BRANCH }) ||
      DEFAULT_BRANCH,
  );

  const body =
    normalizeString(args.body) ||
    normalizeString(bodyFromFile) ||
    normalizeString(changelogRelease.body) ||
    normalizeString(extractReleaseSectionFromSummary(changelogMarkdown)) ||
    "";

  return {
    changelog_report_available: Boolean(changelogReport),
    changelog_markdown_available: Boolean(changelogMarkdown),
    tag,
    name,
    target_commitish: targetCommitish,
    body,
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

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const isBuffer = Buffer.isBuffer(body);
  const bodyBuffer = body
    ? isBuffer
      ? body
      : Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-release-script`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (bodyBuffer && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (bodyBuffer) {
    headers["Content-Length"] = String(bodyBuffer.length);
  }

  const requestOptions = {
    method: options.method || "GET",
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: (options.timeout_seconds || 120) * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const parsedBody = safeJsonParse(responseText, responseText);
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 300;

        const response = {
          ok,
          status_code: statusCode,
          headers: res.headers,
          body: parsedBody,
          raw_body: responseText,
        };

        if (!ok && !options.allow_error) {
          const message =
            typeof parsedBody === "object" && parsedBody?.message
              ? parsedBody.message
              : responseText || `HTTP ${statusCode}`;

          const error = new Error(`GitHub API request failed: ${message}`);
          error.response = response;
          reject(error);
          return;
        }

        resolve(response);
      });
    });

    req.on("timeout", () => {
      req.destroy(
        new Error(
          `Request timed out after ${options.timeout_seconds || 120} second(s).`,
        ),
      );
    });

    req.on("error", reject);

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }

    req.end();
  });
}

function apiUrl(args, endpoint) {
  return `${args.api_url}${endpoint}`;
}

function repoEndpoint(args, suffix) {
  return `/repos/${args.repository}${suffix}`;
}

async function getReleaseByTag(args, tag) {
  const encodedTag = encodeURIComponent(tag);

  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/releases/tags/${encodedTag}`)),
    {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      allow_error: true,
    },
  );

  if (response.status_code === 404) return null;
  if (!response.ok) {
    const message =
      typeof response.body === "object" && response.body?.message
        ? response.body.message
        : response.raw_body || `HTTP ${response.status_code}`;

    throw new Error(`Failed to read release by tag: ${message}`);
  }

  return response.body;
}

async function getReleaseById(args, releaseId) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/releases/${releaseId}`)),
    {
      method: "GET",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return response.body;
}

async function createRelease(args, payload) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, "/releases")),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: payload,
    },
  );

  return response.body;
}

async function updateRelease(args, releaseId, payload) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/releases/${releaseId}`)),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: payload,
    },
  );

  return response.body;
}

async function deleteReleaseAsset(args, assetId) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/releases/assets/${assetId}`)),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
    },
  );

  return response.status_code === 204;
}

function buildReleasePayload(args, releaseInput) {
  const payload = {
    tag_name: releaseInput.tag,
    target_commitish: releaseInput.target_commitish,
    name: releaseInput.name,
    body: releaseInput.body,
    draft: args.draft,
    prerelease: args.prerelease,
    generate_release_notes: args.generate_release_notes,
    make_latest: args.make_latest,
  };

  if (args.discussion_category_name) {
    payload.discussion_category_name = args.discussion_category_name;
  }

  if (args.append_generated_notes) {
    payload.generate_release_notes = true;
  }

  return payload;
}

function createPlannedRelease(args, releaseInput, existingRelease) {
  return {
    id: existingRelease?.id || 0,
    tag_name: releaseInput.tag,
    target_commitish: releaseInput.target_commitish,
    name: releaseInput.name,
    body: releaseInput.body,
    draft: args.draft,
    prerelease: args.prerelease,
    html_url: existingRelease?.html_url || "",
    upload_url: existingRelease?.upload_url || "",
    existing: Boolean(existingRelease),
    planned: true,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasGlob(value) {
  return /[*?]/.test(String(value || ""));
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "*" && next === "*") {
      const afterDoubleStar = source[index + 2];

      if (afterDoubleStar === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }

      continue;
    }

    if (char === "*") {
      output += "[^/]*";
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += escapeRegExp(char);
  }

  output += "$";

  return new RegExp(output);
}

function walkFiles(dirPath, repoRoot, files = []) {
  const absolutePath = resolvePath(dirPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  const ignored = new Set([
    ".git",
    "node_modules",
    ".nx",
    ".turbo",
    ".cache",
    ".pnpm-store",
  ]);

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;

    walkFiles(path.join(absolutePath, entry.name), repoRoot, files);
  }

  return files;
}

function resolveAssetFiles(args, repoRoot) {
  const explicitFiles = [];
  const globPatterns = [...args.asset_globs];

  for (const item of args.asset_files) {
    if (hasGlob(item)) {
      globPatterns.push(item);
    } else {
      explicitFiles.push(item);
    }
  }

  const files = [];

  for (const file of explicitFiles) {
    const absolutePath = resolvePath(file, repoRoot);

    if (isFile(absolutePath)) {
      files.push(absolutePath);
    } else {
      logger.warn(`Release asset does not exist: ${file}`);
    }
  }

  for (const pattern of globPatterns) {
    const regex = globToRegExp(pattern);
    const root = globRoot(pattern);
    const candidates = walkFiles(root, repoRoot);

    for (const candidate of candidates) {
      const relativePath = toRelativePath(candidate, repoRoot);

      if (regex.test(relativePath)) {
        files.push(candidate);
      }
    }
  }

  return [...new Set(files)].sort().map((filePath) => {
    const stat = fs.statSync(filePath);

    return {
      name: path.basename(filePath),
      file: toRelativePath(filePath, repoRoot),
      absolute_file: filePath,
      size_bytes: stat.size,
      content_type: contentTypeForFile(filePath),
      valid: args.max_asset_bytes <= 0 || stat.size <= args.max_asset_bytes,
      errors:
        args.max_asset_bytes > 0 && stat.size > args.max_asset_bytes
          ? [`Asset exceeds max size of ${args.max_asset_bytes} byte(s).`]
          : [],
    };
  });
}

function globRoot(pattern) {
  const parts = toPosixPath(pattern).split("/");
  const rootParts = [];

  for (const part of parts) {
    if (hasGlob(part)) break;
    rootParts.push(part);
  }

  return rootParts.length ? rootParts.join("/") : ".";
}

function contentTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const types = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".yml": "application/yaml",
    ".yaml": "application/yaml",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tgz": "application/gzip",
    ".tar": "application/x-tar",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".sbom": "application/json",
    ".spdx": "text/plain",
  };

  return types[extension] || "application/octet-stream";
}

function cleanUploadUrl(uploadUrl) {
  return String(uploadUrl || "").replace(/\{\?name,label\}$/g, "");
}

async function uploadReleaseAsset(args, release, asset, existingAssets = []) {
  const startedAt = new Date();
  const result = {
    name: asset.name,
    file: asset.file,
    size_bytes: asset.size_bytes,
    content_type: asset.content_type,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    deleted_existing: false,
    url: "",
    browser_download_url: "",
    errors: [...asset.errors],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!asset.valid) {
      result.status = "invalid";
      return result;
    }

    const existing = existingAssets.find((item) => item.name === asset.name);

    if (existing && args.delete_existing_assets) {
      if (args.dry_run) {
        result.deleted_existing = true;
      } else {
        await deleteReleaseAsset(args, existing.id);
        result.deleted_existing = true;
      }
    } else if (existing) {
      result.status = "skipped-existing";
      result.success = true;
      result.url = existing.url || "";
      result.browser_download_url = existing.browser_download_url || "";
      result.warnings.push(
        "Asset already exists and delete_existing_assets is disabled.",
      );
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }

    const uploadBase = cleanUploadUrl(release.upload_url);
    const url = new URL(uploadBase);

    url.searchParams.set("name", asset.name);

    const response = await requestJson(url.toString(), {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      headers: {
        "Content-Type": asset.content_type,
      },
      body: fs.readFileSync(asset.absolute_file),
    });

    result.status = "uploaded";
    result.success = true;
    result.url = response.body?.url || "";
    result.browser_download_url = response.body?.browser_download_url || "";

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

async function uploadAssets(args, release, assets) {
  if (!args.upload_assets || !assets.length) {
    return {
      results: [],
      status: "skipped",
    };
  }

  const existingAssets = Array.isArray(release.assets) ? release.assets : [];
  const results = [];

  for (const asset of assets) {
    logger.info(
      `${args.dry_run ? "Planning upload for" : "Uploading"} release asset ${asset.file}.`,
    );

    const result = await uploadReleaseAsset(
      args,
      release,
      asset,
      existingAssets,
    );
    results.push(result);

    if (!result.success && args.fail_on_asset_error) {
      break;
    }
  }

  const failed = results.filter((result) => !result.success).length;

  return {
    results,
    status: failed > 0 ? "failed" : args.dry_run ? "planned" : "uploaded",
  };
}

function summarizeAssets(assetResults) {
  return {
    assets: assetResults.length,
    uploaded: assetResults.filter((asset) => asset.status === "uploaded")
      .length,
    planned: assetResults.filter((asset) => asset.status === "planned").length,
    skipped_existing: assetResults.filter(
      (asset) => asset.status === "skipped-existing",
    ).length,
    invalid: assetResults.filter((asset) => asset.status === "invalid").length,
    failed: assetResults.filter((asset) => asset.status === "failed").length,
    total_bytes: assetResults.reduce(
      (sum, asset) => sum + Number(asset.size_bytes || 0),
      0,
    ),
  };
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🚀 ${PROJECT_NAME} GitHub Release`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Existing release: \`${report.release.existing ? "true" : "false"}\``,
    `- Action: \`${report.release.action}\``,
    `- Tag: \`${report.release.tag_name || "unknown"}\``,
    `- Name: \`${report.release.name || "unknown"}\``,
    `- Draft: \`${report.release.draft ? "true" : "false"}\``,
    `- Prerelease: \`${report.release.prerelease ? "true" : "false"}\``,
    `- Assets: \`${report.totals.assets}\``,
    `- Uploaded assets: \`${report.totals.uploaded}\``,
    `- Failed assets: \`${report.totals.failed}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Release Configuration",
    "",
    `- Target commitish: \`${report.release.target_commitish || "unknown"}\``,
    `- Make latest: \`${report.config.make_latest}\``,
    `- Generate notes: \`${report.config.generate_release_notes ? "true" : "false"}\``,
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
    `- Upload assets: \`${report.config.upload_assets ? "true" : "false"}\``,
    `- Delete existing assets: \`${report.config.delete_existing_assets ? "true" : "false"}\``,
    "",
  ];

  if (report.release.html_url) {
    lines.push(`Release URL: ${report.release.html_url}`);
    lines.push("");
  }

  lines.push("## 📦 Assets");
  lines.push("");

  if (!report.assets.length) {
    lines.push("No release assets were selected.");
  } else {
    lines.push("| Status | Asset | Size | Download |");
    lines.push("|---|---|---:|---|");

    for (const asset of report.assets) {
      lines.push(
        `| \`${asset.status}\` | \`${escapeMarkdown(asset.name)}\` | \`${formatBytes(asset.size_bytes)}\` | ${asset.browser_download_url ? `[download](${asset.browser_download_url})` : "n/a"} |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Item | Status | Errors |");
    lines.push("|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${escapeMarkdown(failure.name || failure.item || "release")}\` | \`${escapeMarkdown(failure.status || "failed")}\` | ${normalizeStringList(failure.errors).map(escapeMarkdown).join("<br>") || "No error details provided."} |`,
      );
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
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

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
  );

  return `${lines.join("\n").trim()}\n`;
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
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
  setGitHubOutput("github_release_file", report.config.output_file);
  setGitHubOutput(
    "github_release_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("github_release_status", report.status);
  setGitHubOutput("github_release_ok", report.ok ? "true" : "false");
  setGitHubOutput("github_release_id", String(report.release.id || ""));
  setGitHubOutput("github_release_tag", report.release.tag_name || "");
  setGitHubOutput("github_release_name", report.release.name || "");
  setGitHubOutput("github_release_url", report.release.html_url || "");
  setGitHubOutput("github_release_upload_url", report.release.upload_url || "");
  setGitHubOutput("github_release_assets", String(report.totals.assets));
  setGitHubOutput(
    "github_release_uploaded_assets",
    String(report.totals.uploaded),
  );
  setGitHubOutput("github_release_failed_assets", String(report.totals.failed));
  setGitHubOutput(
    "github_release_asset_files",
    report.assets
      .map((asset) => asset.file)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "github_release_asset_files_json",
    JSON.stringify(report.assets.map((asset) => asset.file).filter(Boolean)),
  );
  setGitHubOutput(
    "github_release_asset_urls_json",
    JSON.stringify(
      report.assets
        .filter((asset) => asset.browser_download_url)
        .map((asset) => ({
          name: asset.name,
          url: asset.browser_download_url,
        })),
    ),
  );
  setGitHubOutput(
    "github_release_failures_json",
    JSON.stringify(report.failures),
  );
}

function sanitizeRelease(release, extra = {}) {
  if (!release) {
    return {
      id: 0,
      tag_name: "",
      target_commitish: "",
      name: "",
      draft: false,
      prerelease: false,
      html_url: "",
      upload_url: "",
      existing: false,
      action: "none",
      ...extra,
    };
  }

  return {
    id: release.id || 0,
    tag_name: release.tag_name || "",
    target_commitish: release.target_commitish || "",
    name: release.name || "",
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    html_url: release.html_url || "",
    upload_url: release.upload_url || "",
    existing: Boolean(extra.existing),
    action: extra.action || "",
    planned: Boolean(release.planned),
  };
}

async function runRelease(args, repoRoot, releaseInput, assets) {
  if (!releaseInput.tag) {
    throw new Error(
      "Release tag could not be resolved. Set --tag or provide a changelog report with release.tag.",
    );
  }

  if (!args.dry_run && !args.token) {
    throw new Error(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, or --token.",
    );
  }

  const existingRelease = args.dry_run
    ? null
    : await getReleaseByTag(args, releaseInput.tag);
  const payload = buildReleasePayload(args, releaseInput);

  if (args.fail_if_exists && existingRelease) {
    throw new Error(`Release already exists for tag ${releaseInput.tag}.`);
  }

  if (
    args.fail_if_missing &&
    !releaseInput.body &&
    !args.generate_release_notes
  ) {
    throw new Error("Release body is empty and generated notes are disabled.");
  }

  let release = null;
  let action = "none";

  if (args.dry_run) {
    release = createPlannedRelease(args, releaseInput, existingRelease);
    action = existingRelease
      ? args.update_existing
        ? "update-planned"
        : "skip-existing"
      : "create-planned";
  } else if (existingRelease && args.update_existing) {
    logger.info(`Updating GitHub release for tag ${releaseInput.tag}.`);
    release = await updateRelease(args, existingRelease.id, payload);
    action = "updated";
  } else if (existingRelease && !args.update_existing) {
    logger.info(
      `GitHub release already exists for tag ${releaseInput.tag}; skipping update.`,
    );
    release = existingRelease;
    action = "skipped-existing";
  } else {
    logger.info(`Creating GitHub release for tag ${releaseInput.tag}.`);
    release = await createRelease(args, payload);
    action = "created";
  }

  if (!args.dry_run && args.verify_after_create && release?.id) {
    release = await getReleaseById(args, release.id);
  }

  const uploadExecution = await uploadAssets(args, release, assets);

  return {
    release,
    action,
    asset_results: uploadExecution.results,
    asset_status: uploadExecution.status,
    existing: Boolean(existingRelease),
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  releaseInput,
  assets,
  execution,
  error = null,
) {
  const github = getGitMetadata(repoRoot);
  const assetTotals = summarizeAssets(execution?.asset_results || []);
  const release = sanitizeRelease(execution?.release, {
    action: execution?.action || "failed",
    existing: execution?.existing || false,
  });

  const failures = [
    ...(error
      ? [
          {
            item: "release",
            name: releaseInput.tag || "release",
            status: "failed",
            errors: [logger.formatError(error)],
          },
        ]
      : []),
    ...(execution?.asset_results || [])
      .filter((asset) => !asset.success)
      .map((asset) => ({
        item: "asset",
        name: asset.name,
        status: asset.status,
        errors: asset.errors,
      })),
  ];

  const status = error
    ? "failed"
    : execution?.action === "skipped-existing"
      ? "skipped-existing"
      : assetTotals.failed > 0 || assetTotals.invalid > 0
        ? "asset-failed"
        : args.dry_run
          ? "planned"
          : execution?.action || "completed";

  return {
    schema_version: 1,
    type: "github-release-create",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      changelog_report_file: toRelativePath(
        resolvePath(args.changelog_report_file, repoRoot),
        repoRoot,
      ),
      changelog_report_available: releaseInput.changelog_report_available,
      changelog_markdown_file: toRelativePath(
        resolvePath(args.changelog_markdown_file, repoRoot),
        repoRoot,
      ),
      changelog_markdown_available: releaseInput.changelog_markdown_available,
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
      api_url: args.api_url,
      upload_url: args.upload_url,
      draft: args.draft,
      prerelease: args.prerelease,
      generate_release_notes: args.generate_release_notes,
      append_generated_notes: args.append_generated_notes,
      update_existing: args.update_existing,
      fail_if_exists: args.fail_if_exists,
      fail_if_missing: args.fail_if_missing,
      make_latest: args.make_latest,
      upload_assets: args.upload_assets,
      delete_existing_assets: args.delete_existing_assets,
      verify_after_create: args.verify_after_create,
      dry_run: args.dry_run,
    },
    release_input: {
      tag: releaseInput.tag,
      name: releaseInput.name,
      target_commitish: releaseInput.target_commitish,
      body_length: releaseInput.body.length,
      assets_selected: assets.length,
    },
    release,
    selected_assets: assets.map((asset) => ({
      name: asset.name,
      file: asset.file,
      size_bytes: asset.size_bytes,
      content_type: asset.content_type,
      valid: asset.valid,
      errors: asset.errors,
    })),
    totals: {
      ...assetTotals,
      ok:
        !error &&
        (assetTotals.failed === 0 || !args.fail_on_asset_error) &&
        assetTotals.invalid === 0,
    },
    assets: execution?.asset_results || [],
    failures,
    status,
    ok:
      !error &&
      (assetTotals.failed === 0 || !args.fail_on_asset_error) &&
      assetTotals.invalid === 0,
  };
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing GitHub release.");

  const releaseInput = resolveReleaseInput(args, repoRoot);
  const assets = resolveAssetFiles(args, repoRoot);

  let execution = null;
  let error = null;

  try {
    execution = await runRelease(args, repoRoot, releaseInput, assets);
  } catch (err) {
    error = err;
    logger.error(logger.formatError(err));
  }

  const report = createReport(
    args,
    repoRoot,
    configFile,
    releaseInput,
    assets,
    execution,
    error,
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
    console.log(json.trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
