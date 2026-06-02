#!/usr/bin/env node
// .github/scripts/ci/collect-build-artifacts.js
// =============================================================================
// Aerealith AI — CI Build Artifact Collector
// -----------------------------------------------------------------------------
// Purpose:
//   Collect build, test, coverage, report, bundle, Storybook, Playwright,
//   Cypress, Nx, package, and deployment-prep artifacts into a predictable CI
//   artifact directory.
//
// Output:
//   - artifacts/ci/build-artifacts.json
//   - artifacts/ci/build-artifacts.md
//   - artifacts/ci/build-artifacts/files/** when copying is enabled
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not upload artifacts by itself.
//   - Copies artifacts by default so GitHub Actions can upload one directory.
//   - Hashes copied/source files for release evidence.
//   - Excludes secrets, env files, node_modules, git internals, caches, and temp
//     files unless explicitly allowed.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[build-artifacts] ${message}`),
    warn: (message) => console.warn(`[build-artifacts] WARN: ${message}`),
    error: (message) => console.error(`[build-artifacts] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/build-artifacts.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/build-artifacts.md";
const DEFAULT_COPY_DIR = "artifacts/ci/build-artifacts/files";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_INCLUDE_PATHS = [
  "dist",
  "build",
  "out",
  "coverage",
  "reports",
  "test-results",
  "playwright-report",
  "cypress/screenshots",
  "cypress/videos",
  "storybook-static",
  ".next/standalone",
  ".next/static",
  "apps/**/dist",
  "apps/**/build",
  "apps/**/out",
  "apps/**/coverage",
  "apps/**/.next/standalone",
  "apps/**/.next/static",
  "libs/**/dist",
  "libs/**/build",
  "libs/**/coverage",
];

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  ".github/scripts/node_modules/",
  "node_modules/",
  ".nx/cache/",
  ".nx/workspace-data/",
  ".turbo/",
  ".cache/",
  ".pnpm-store/",
  ".wrangler/",
  ".next/cache/",
  "tmp/",
  "temp/",
  ".DS_Store",
  "Thumbs.db",
  "*.tmp",
  "*.temp",
  "*.bak",
  "*.swp",
  "*.swo",
];

const DEFAULT_EXCLUDE_FILENAMES = new Set([".DS_Store", "Thumbs.db"]);

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

const SECRET_CONTENT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/;

const CATEGORY_RULES = [
  { pattern: /(^|\/)(dist|build|out)\//, category: "build" },
  { pattern: /(^|\/)\.next\/standalone\//, category: "next-standalone" },
  { pattern: /(^|\/)\.next\/static\//, category: "next-static" },
  { pattern: /(^|\/)coverage\//, category: "coverage" },
  { pattern: /(^|\/)reports\//, category: "report" },
  { pattern: /(^|\/)test-results\//, category: "test" },
  { pattern: /(^|\/)playwright-report\//, category: "playwright" },
  { pattern: /(^|\/)cypress\/screenshots\//, category: "cypress-screenshot" },
  { pattern: /(^|\/)cypress\/videos\//, category: "cypress-video" },
  { pattern: /(^|\/)storybook-static\//, category: "storybook" },
  { pattern: /\.junit\.xml$|junit.*\.xml$/i, category: "junit" },
  { pattern: /lcov\.info$/i, category: "coverage" },
  { pattern: /\.sarif$/i, category: "security" },
  { pattern: /\.map$/i, category: "source-map" },
  { pattern: /\.html$/i, category: "html-report" },
  { pattern: /\.json$/i, category: "json-report" },
];

const KIND_BY_EXT = new Map([
  [".json", "json"],
  [".jsonc", "json"],
  [".xml", "xml"],
  [".html", "html"],
  [".htm", "html"],
  [".css", "css"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".map", "source-map"],
  [".txt", "text"],
  [".md", "markdown"],
  [".log", "log"],
  [".png", "image"],
  [".jpg", "image"],
  [".jpeg", "image"],
  [".webp", "image"],
  [".svg", "image"],
  [".gif", "image"],
  [".mp4", "video"],
  [".webm", "video"],
  [".zip", "archive"],
  [".tar", "archive"],
  [".tgz", "archive"],
  [".gz", "archive"],
  [".wasm", "wasm"],
  [".sarif", "sarif"],
]);

const MIME_BY_EXT = new Map([
  [".json", "application/json"],
  [".jsonc", "application/jsonc"],
  [".xml", "application/xml"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".cjs", "text/javascript"],
  [".ts", "text/typescript"],
  [".tsx", "text/typescript"],
  [".map", "application/json"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".log", "text/plain"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".gif", "image/gif"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".zip", "application/zip"],
  [".tar", "application/x-tar"],
  [".tgz", "application/gzip"],
  [".gz", "application/gzip"],
  [".wasm", "application/wasm"],
  [".sarif", "application/sarif+json"],
]);

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
    version: process.env.RELEASE_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "ci",

    include: normalizeStringList(process.env.BUILD_ARTIFACTS_INCLUDE),
    exclude: normalizeStringList(process.env.BUILD_ARTIFACTS_EXCLUDE),

    output_file: process.env.BUILD_ARTIFACTS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.BUILD_ARTIFACTS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    copy_dir: process.env.BUILD_ARTIFACTS_COPY_DIR || DEFAULT_COPY_DIR,

    copy_files: normalizeBoolean(process.env.BUILD_ARTIFACTS_COPY_FILES, true),
    clean_copy_dir: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_CLEAN_COPY_DIR,
      true,
    ),
    include_logs: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_INCLUDE_LOGS,
      false,
    ),
    include_hidden: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_INCLUDE_HIDDEN,
      false,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_ALLOW_SECRET_PATHS,
      false,
    ),
    scan_text_for_secrets: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_SCAN_TEXT_FOR_SECRETS,
      true,
    ),
    fail_on_secret_signal: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_FAIL_ON_SECRET_SIGNAL,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_FAIL_IF_EMPTY,
      false,
    ),

    max_file_size_bytes: normalizeInteger(
      process.env.BUILD_ARTIFACTS_MAX_FILE_SIZE_BYTES,
      0,
    ),
    max_files: normalizeInteger(process.env.BUILD_ARTIFACTS_MAX_FILES, 0),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.BUILD_ARTIFACTS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.BUILD_ARTIFACTS_STEP_SUMMARY,
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

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--channel") {
      args.channel = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "-i") {
      args.include.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "-x") {
      args.exclude.push(argv[index + 1]);
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

    if (arg === "--copy-dir") {
      args.copy_dir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--copy") {
      args.copy_files = true;
      continue;
    }

    if (arg === "--no-copy") {
      args.copy_files = false;
      continue;
    }

    if (arg === "--clean") {
      args.clean_copy_dir = true;
      continue;
    }

    if (arg === "--no-clean") {
      args.clean_copy_dir = false;
      continue;
    }

    if (arg === "--include-logs") {
      args.include_logs = true;
      continue;
    }

    if (arg === "--include-hidden") {
      args.include_hidden = true;
      continue;
    }

    if (arg === "--allow-secret-paths") {
      args.allow_secret_paths = true;
      continue;
    }

    if (arg === "--no-secret-scan") {
      args.scan_text_for_secrets = false;
      continue;
    }

    if (arg === "--fail-on-secret-signal") {
      args.fail_on_secret_signal = true;
      continue;
    }

    if (arg === "--no-fail-on-secret-signal") {
      args.fail_on_secret_signal = false;
      continue;
    }

    if (arg === "--max-file-size-bytes") {
      args.max_file_size_bytes = normalizeInteger(argv[index + 1], 0);
      index += 1;
      continue;
    }

    if (arg === "--max-files") {
      args.max_files = normalizeInteger(argv[index + 1], 0);
      index += 1;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

  if (!args.include.length) {
    args.include = [...DEFAULT_INCLUDE_PATHS];
  }

  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];

  if (!args.include_logs) {
    args.exclude.push("*.log");
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI CI Build Artifact Collector

Usage:
  node .github/scripts/ci/collect-build-artifacts.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --version <version>              Release or build version.
      --channel <channel>              Build channel. Default: ci.
  -i, --include <path|glob>            Include artifact path or glob.
  -x, --exclude <pattern>              Exclude path pattern.
  -o, --output <file>                  JSON manifest output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --copy-dir <dir>                 Directory where artifacts are copied.
      --copy                           Copy collected files. Default.
      --no-copy                        Only report source files.
      --clean                          Clean copy directory before copying. Default.
      --no-clean                       Do not clean copy directory first.
      --include-logs                   Include *.log files.
      --include-hidden                 Include hidden files.
      --allow-secret-paths             Allow paths that look secret-like.
      --no-secret-scan                 Disable text secret-signal scan.
      --max-file-size-bytes <bytes>    Skip files larger than this size. 0 means unlimited.
      --max-files <number>             Stop after collecting this many files. 0 means unlimited.
      --fail-if-empty                  Exit non-zero when no artifacts are collected.
      --dry-run                        Do not write or copy files.
      --no-print                       Do not print JSON result.
      --no-step-summary                Do not append GitHub step summary.
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

function removeDir(dirPath, dryRun = false) {
  if (!fs.existsSync(dirPath)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would remove directory: ${dirPath}`);
    return;
  }

  fs.rmSync(dirPath, {
    recursive: true,
    force: true,
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

function copyFile(sourcePath, destinationPath, dryRun = false) {
  ensureDir(path.dirname(destinationPath), dryRun);

  if (dryRun) {
    logger.info(`[dry-run] Would copy ${sourcePath} -> ${destinationPath}.`);
    return {
      copied: false,
      dry_run: true,
    };
  }

  fs.copyFileSync(sourcePath, destinationPath);

  return {
    copied: true,
    dry_run: false,
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

function matchesPattern(relativePath, pattern) {
  const normalizedPath = toPosixPath(relativePath);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith("/")) {
    return normalizedPath.startsWith(normalizedPattern);
  }

  if (hasGlob(normalizedPattern)) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.includes(normalizedPattern)
  );
}

function shouldExcludePath(relativePath, args, outputPaths = []) {
  const normalized = toPosixPath(relativePath);
  const basename = path.basename(normalized);

  if (DEFAULT_EXCLUDE_FILENAMES.has(basename)) return true;

  if (!args.include_hidden && basename.startsWith(".")) return true;

  if (outputPaths.includes(normalized)) return true;

  if (!args.allow_secret_paths && SECRET_PATH_PATTERN.test(normalized))
    return true;

  return args.exclude.some((pattern) => matchesPattern(normalized, pattern));
}

function walkFiles(targetPath, repoRoot, args, outputPaths, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args, outputPaths)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (args.max_files > 0 && files.length >= args.max_files) break;

    walkFiles(
      path.join(absolutePath, entry.name),
      repoRoot,
      args,
      outputPaths,
      files,
    );
  }

  return files;
}

function collectRepositoryFiles(repoRoot, args, outputPaths) {
  return [...new Set(walkFiles(".", repoRoot, args, outputPaths))]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function collectFilesForSpec(spec, repoRoot, allFiles, args, outputPaths) {
  const normalizedSpec = toPosixPath(spec);

  if (!normalizedSpec) return [];

  if (hasGlob(normalizedSpec)) {
    const regex = globToRegExp(normalizedSpec);

    return allFiles.filter((filePath) => {
      const relativePath = toRelativePath(filePath, repoRoot);
      return (
        regex.test(relativePath) &&
        !shouldExcludePath(relativePath, args, outputPaths)
      );
    });
  }

  const absolutePath = resolvePath(normalizedSpec, repoRoot);

  if (isFile(absolutePath)) {
    const relativePath = toRelativePath(absolutePath, repoRoot);
    return shouldExcludePath(relativePath, args, outputPaths)
      ? []
      : [absolutePath];
  }

  if (isDirectory(absolutePath)) {
    return walkFiles(absolutePath, repoRoot, args, outputPaths);
  }

  return [];
}

function collectArtifactFiles(args, repoRoot) {
  const outputPaths = [args.output_file, args.summary_file, args.copy_dir]
    .filter(Boolean)
    .map((item) => toRelativePath(resolvePath(item, repoRoot), repoRoot));

  const allFiles = collectRepositoryFiles(repoRoot, args, outputPaths);
  const files = [];

  for (const spec of args.include) {
    files.push(
      ...collectFilesForSpec(spec, repoRoot, allFiles, args, outputPaths),
    );

    if (args.max_files > 0 && files.length >= args.max_files) {
      break;
    }
  }

  return [...new Set(files)]
    .filter(isFile)
    .slice(0, args.max_files > 0 ? args.max_files : undefined)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function hashFile(filePath, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getCategory(relativePath) {
  const normalized = toPosixPath(relativePath);

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.category;
    }
  }

  return "artifact";
}

function getKind(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();

  return KIND_BY_EXT.get(extension) || "file";
}

function getMimeType(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();

  return MIME_BY_EXT.get(extension) || "application/octet-stream";
}

function isTextLike(relativePath, sizeBytes) {
  if (sizeBytes > 1024 * 1024) return false;

  const extension = path.extname(relativePath).toLowerCase();

  return [
    ".json",
    ".jsonc",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".map",
    ".txt",
    ".md",
    ".log",
    ".yml",
    ".yaml",
    ".sarif",
  ].includes(extension);
}

function hasSecretSignal(filePath, relativePath, args, sizeBytes) {
  if (!args.scan_text_for_secrets) return false;
  if (!isTextLike(relativePath, sizeBytes)) return false;

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return SECRET_CONTENT_PATTERN.test(content);
  } catch {
    return false;
  }
}

function destinationFor(relativePath, args, repoRoot) {
  return resolvePath(path.join(args.copy_dir, relativePath), repoRoot);
}

function createArtifactRecord(filePath, repoRoot, args) {
  const stat = fs.statSync(filePath);
  const relativePath = toRelativePath(filePath, repoRoot);
  const sizeBytes = stat.size;
  const secretSignal = hasSecretSignal(filePath, relativePath, args, sizeBytes);

  if (args.max_file_size_bytes > 0 && sizeBytes > args.max_file_size_bytes) {
    return {
      skipped: true,
      reason: `File exceeds max size ${args.max_file_size_bytes} bytes.`,
      source_path: relativePath,
      size_bytes: sizeBytes,
      size_human: formatBytes(sizeBytes),
      secret_signal: secretSignal,
    };
  }

  if (secretSignal) {
    return {
      skipped: true,
      reason: "Secret-like content detected in text artifact.",
      source_path: relativePath,
      size_bytes: sizeBytes,
      size_human: formatBytes(sizeBytes),
      secret_signal: true,
    };
  }

  const destinationPath = args.copy_files
    ? destinationFor(relativePath, args, repoRoot)
    : null;

  const copied = args.copy_files
    ? copyFile(filePath, destinationPath, args.dry_run)
    : {
        copied: false,
        skipped: true,
        reason: "Copying is disabled.",
      };

  return {
    source_path: relativePath,
    artifact_path: destinationPath
      ? toRelativePath(destinationPath, repoRoot)
      : null,
    name: path.basename(filePath),
    directory: toPosixPath(path.dirname(relativePath)),
    extension: path.extname(filePath).toLowerCase(),
    category: getCategory(relativePath),
    kind: getKind(relativePath),
    mime_type: getMimeType(relativePath),
    size_bytes: sizeBytes,
    size_human: formatBytes(sizeBytes),
    modified_at: stat.mtime.toISOString(),
    sha256: hashFile(filePath, "sha256"),
    sha512: hashFile(filePath, "sha512"),
    copied: Boolean(copied.copied),
    copy_dry_run: Boolean(copied.dry_run),
    secret_signal: false,
  };
}

function groupArtifacts(artifacts) {
  const groups = {};

  for (const artifact of artifacts) {
    const category = artifact.category || "artifact";

    if (!groups[category]) {
      groups[category] = {
        count: 0,
        size_bytes: 0,
        size_human: "0 B",
        files: [],
      };
    }

    groups[category].count += 1;
    groups[category].size_bytes += Number(artifact.size_bytes || 0);
    groups[category].files.push(artifact.artifact_path || artifact.source_path);
  }

  for (const group of Object.values(groups)) {
    group.size_human = formatBytes(group.size_bytes);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createCollection(args, repoRoot) {
  const git = getGitMetadata(repoRoot);

  if (args.copy_files && args.clean_copy_dir) {
    removeDir(resolvePath(args.copy_dir, repoRoot), args.dry_run);
  }

  if (args.copy_files) {
    ensureDir(resolvePath(args.copy_dir, repoRoot), args.dry_run);
  }

  const files = collectArtifactFiles(args, repoRoot);
  const artifacts = [];
  const skipped = [];

  for (const filePath of files) {
    const record = createArtifactRecord(filePath, repoRoot, args);

    if (record.skipped) {
      skipped.push(record);
    } else {
      artifacts.push(record);
    }
  }

  const totalSize = artifacts.reduce(
    (sum, artifact) => sum + Number(artifact.size_bytes || 0),
    0,
  );
  const skippedSecretSignals = skipped.filter(
    (item) => item.secret_signal,
  ).length;

  return {
    schema_version: 1,
    type: "ci-build-artifacts",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    release: {
      version: args.version || null,
      channel: args.channel || "ci",
    },
    github: git,
    config: {
      include: args.include.map(toPosixPath),
      exclude: args.exclude.map(toPosixPath),
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      copy_dir: args.copy_files
        ? toRelativePath(resolvePath(args.copy_dir, repoRoot), repoRoot)
        : null,
      copy_files: args.copy_files,
      clean_copy_dir: args.clean_copy_dir,
      include_logs: args.include_logs,
      include_hidden: args.include_hidden,
      allow_secret_paths: args.allow_secret_paths,
      scan_text_for_secrets: args.scan_text_for_secrets,
      max_file_size_bytes: args.max_file_size_bytes,
      max_files: args.max_files,
    },
    totals: {
      discovered: files.length,
      collected: artifacts.length,
      skipped: skipped.length,
      skipped_secret_signals: skippedSecretSignals,
      size_bytes: totalSize,
      size_human: formatBytes(totalSize),
      categories: groupArtifacts(artifacts),
    },
    artifacts,
    skipped,
    status: skippedSecretSignals > 0 ? "warning" : "completed",
  };
}

function createMarkdownSummary(collection) {
  const lines = [
    `# 📦 ${PROJECT_NAME} CI Build Artifacts`,
    "",
    `Generated: \`${collection.created_at}\``,
    "",
    "## 🧾 Context",
    "",
    `- Repository: \`${collection.repository}\``,
    `- Branch: \`${collection.github.branch || "unknown"}\``,
    `- Commit: \`${collection.github.short_sha || collection.github.sha || "unknown"}\``,
    `- Workflow: \`${collection.github.workflow || "unknown"}\``,
    `- Run: \`${collection.github.run_id || "unknown"}\``,
    `- Channel: \`${collection.release.channel}\``,
    `- Status: \`${collection.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- Discovered: \`${collection.totals.discovered}\``,
    `- Collected: \`${collection.totals.collected}\``,
    `- Skipped: \`${collection.totals.skipped}\``,
    `- Secret-signal skips: \`${collection.totals.skipped_secret_signals}\``,
    `- Total size: \`${collection.totals.size_human}\``,
    `- Copy directory: \`${collection.config.copy_dir || "copy disabled"}\``,
    "",
  ];

  if (Object.keys(collection.totals.categories).length) {
    lines.push("## 🗂️ Categories");
    lines.push("");
    lines.push("| Category | Count | Size |");
    lines.push("|---|---:|---:|");

    for (const [category, group] of Object.entries(
      collection.totals.categories,
    )) {
      lines.push(
        `| \`${category}\` | \`${group.count}\` | \`${group.size_human}\` |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📁 Collected Files");
  lines.push("");

  if (!collection.artifacts.length) {
    lines.push("No build artifacts were collected.");
  } else {
    lines.push("| Source | Artifact | Category | Size | SHA256 |");
    lines.push("|---|---|---|---:|---|");

    for (const artifact of collection.artifacts.slice(0, 250)) {
      lines.push(
        `| \`${artifact.source_path}\` | \`${artifact.artifact_path || "not copied"}\` | \`${artifact.category}\` | \`${artifact.size_human}\` | \`${artifact.sha256.slice(0, 16)}…\` |`,
      );
    }

    if (collection.artifacts.length > 250) {
      lines.push(
        `| ... | ... | ... | ... | ${collection.artifacts.length - 250} additional artifact(s) omitted from summary. |`,
      );
    }
  }

  if (collection.skipped.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped Files");
    lines.push("");
    lines.push("| Source | Size | Reason |");
    lines.push("|---|---:|---|");

    for (const skipped of collection.skipped.slice(0, 100)) {
      lines.push(
        `| \`${skipped.source_path}\` | \`${skipped.size_human}\` | ${skipped.reason} |`,
      );
    }

    if (collection.skipped.length > 100) {
      lines.push(
        `| ... | ... | ${collection.skipped.length - 100} additional skipped file(s) omitted from summary. |`,
      );
    }
  }

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

function writeGitHubOutputs(collection) {
  setGitHubOutput("build_artifacts_file", collection.config.output_file);
  setGitHubOutput(
    "build_artifacts_summary_file",
    collection.config.summary_file || "",
  );
  setGitHubOutput("build_artifacts_copy_dir", collection.config.copy_dir || "");
  setGitHubOutput("build_artifacts_status", collection.status);
  setGitHubOutput(
    "build_artifacts_discovered",
    String(collection.totals.discovered),
  );
  setGitHubOutput(
    "build_artifacts_collected",
    String(collection.totals.collected),
  );
  setGitHubOutput("build_artifacts_skipped", String(collection.totals.skipped));
  setGitHubOutput(
    "build_artifacts_secret_signal_skips",
    String(collection.totals.skipped_secret_signals),
  );
  setGitHubOutput(
    "build_artifacts_size_bytes",
    String(collection.totals.size_bytes),
  );
  setGitHubOutput("build_artifacts_size_human", collection.totals.size_human);

  if (collection.artifacts[0]) {
    setGitHubOutput(
      "build_artifacts_first_path",
      collection.artifacts[0].artifact_path ||
        collection.artifacts[0].source_path,
    );
  } else {
    setGitHubOutput("build_artifacts_first_path", "");
  }
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Collecting CI build artifacts.");

  const collection = createCollection(args, repoRoot);
  const json = `${JSON.stringify(collection, null, 2)}\n`;
  const markdown = createMarkdownSummary(collection);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(collection);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_empty && collection.totals.collected === 0) {
    logger.error("No CI build artifacts were collected.");
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_secret_signal &&
    collection.totals.skipped_secret_signals > 0
  ) {
    logger.error(
      `Skipped ${collection.totals.skipped_secret_signals} artifact(s) because secret-like content was detected.`,
    );
    process.exitCode = 1;
  }
}

main();
