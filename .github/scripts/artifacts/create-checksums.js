#!/usr/bin/env node
// .github/scripts/artifacts/create-checksums.js
// =============================================================================
// Aerealith AI — Checksum Generator
// -----------------------------------------------------------------------------
// Purpose:
//   Generate and optionally verify checksums for workflow artifacts, release
//   evidence, npm manifests, Docker manifests, Cloudflare deployment reports,
//   security reports, AI automation outputs, and build outputs.
//
// Output:
//   - artifacts/release/checksums.json
//   - artifacts/release/checksums.md
//   - artifacts/release/SHA256SUMS
//   - artifacts/release/SHA512SUMS
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not upload artifacts.
//   - Does not include file contents.
//   - Excludes secrets, node_modules, git internals, caches, and temp files.
//   - Supports verification with --verify.
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
    info: (message) => console.log(`[checksums] ${message}`),
    warn: (message) => console.warn(`[checksums] WARN: ${message}`),
    error: (message) => console.error(`[checksums] ERROR: ${message}`),
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

const DEFAULT_JSON_FILE = "artifacts/release/checksums.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/checksums.md";
const DEFAULT_SHA256_FILE = "artifacts/release/SHA256SUMS";
const DEFAULT_SHA512_FILE = "artifacts/release/SHA512SUMS";

const SUPPORTED_ALGORITHMS = new Set([
  "sha1",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
]);

const DEFAULT_ALGORITHMS = ["sha256", "sha512"];

const DEFAULT_INCLUDE_DIRS = ["artifacts", "dist", "coverage", "reports"];

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  ".github/scripts/node_modules/",
  "node_modules/",
  ".nx/",
  ".turbo/",
  ".cache/",
  ".pnpm-store/",
  ".wrangler/",
  ".next/cache/",
  "tmp/",
  "temp/",
  ".DS_Store",
  "*.log",
  "*.tmp",
  "*.temp",
  "*.bak",
  "*.swp",
  "*.swo",
];

const DEFAULT_EXCLUDE_FILENAMES = new Set([".DS_Store", "Thumbs.db"]);

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

function normalizeAlgorithms(value) {
  const algorithms = normalizeStringList(value).length
    ? normalizeStringList(value)
    : DEFAULT_ALGORITHMS;

  const normalized = algorithms
    .map((algorithm) => algorithm.toLowerCase())
    .filter((algorithm) => SUPPORTED_ALGORITHMS.has(algorithm));

  return [...new Set(normalized)].length
    ? [...new Set(normalized)]
    : DEFAULT_ALGORITHMS;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "release",
    include: normalizeStringList(process.env.CHECKSUM_INCLUDE),
    exclude: normalizeStringList(process.env.CHECKSUM_EXCLUDE),
    algorithms: normalizeAlgorithms(process.env.CHECKSUM_ALGORITHMS),
    json_file: process.env.CHECKSUM_JSON_FILE || DEFAULT_JSON_FILE,
    summary_file: process.env.CHECKSUM_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    sha256_file: process.env.CHECKSUM_SHA256_FILE || DEFAULT_SHA256_FILE,
    sha512_file: process.env.CHECKSUM_SHA512_FILE || DEFAULT_SHA512_FILE,
    verify: normalizeBoolean(process.env.CHECKSUM_VERIFY, false),
    verify_file: process.env.CHECKSUM_VERIFY_FILE || "",
    write_json: normalizeBoolean(process.env.CHECKSUM_WRITE_JSON, true),
    write_summary_file: normalizeBoolean(
      process.env.CHECKSUM_WRITE_SUMMARY,
      true,
    ),
    write_sums: normalizeBoolean(process.env.CHECKSUM_WRITE_SUMS, true),
    include_output_files: normalizeBoolean(
      process.env.CHECKSUM_INCLUDE_OUTPUT_FILES,
      false,
    ),
    include_hidden: normalizeBoolean(
      process.env.CHECKSUM_INCLUDE_HIDDEN,
      false,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.CHECKSUM_ALLOW_SECRET_PATHS,
      false,
    ),
    fail_if_empty: normalizeBoolean(process.env.CHECKSUM_FAIL_IF_EMPTY, false),
    fail_on_verify_error: normalizeBoolean(
      process.env.CHECKSUM_FAIL_ON_VERIFY_ERROR,
      true,
    ),
    max_file_size_bytes: normalizeInteger(
      process.env.CHECKSUM_MAX_FILE_SIZE_BYTES,
      0,
    ),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.CHECKSUM_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CHECKSUM_STEP_SUMMARY,
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

    if (arg === "--previous-version") {
      args.previous_version = argv[index + 1];
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

    if (arg === "--algorithm" || arg === "--algorithms") {
      args.algorithms = normalizeAlgorithms(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      args.json_file = argv[index + 1];
      args.write_json = true;
      index += 1;
      continue;
    }

    if (arg === "--no-json") {
      args.write_json = false;
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

    if (arg === "--sha256") {
      args.sha256_file = argv[index + 1];
      args.write_sums = true;
      if (!args.algorithms.includes("sha256")) args.algorithms.push("sha256");
      index += 1;
      continue;
    }

    if (arg === "--sha512") {
      args.sha512_file = argv[index + 1];
      args.write_sums = true;
      if (!args.algorithms.includes("sha512")) args.algorithms.push("sha512");
      index += 1;
      continue;
    }

    if (arg === "--no-sums") {
      args.write_sums = false;
      continue;
    }

    if (arg === "--verify") {
      args.verify = true;
      continue;
    }

    if (arg === "--verify-file") {
      args.verify = true;
      args.verify_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-output-files") {
      args.include_output_files = true;
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

    if (arg === "--max-file-size-bytes") {
      args.max_file_size_bytes = normalizeInteger(argv[index + 1], 0);
      index += 1;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--no-fail-on-verify-error") {
      args.fail_on_verify_error = false;
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
    args.include = [...DEFAULT_INCLUDE_DIRS];
  }

  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.algorithms = normalizeAlgorithms(args.algorithms);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Checksum Generator

Usage:
  node .github/scripts/artifacts/create-checksums.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --version <version>              Release version.
      --previous-version <version>     Previous release version.
      --channel <channel>              Release channel.
  -i, --include <path>                 Include artifact path or directory.
  -x, --exclude <pattern>              Exclude path pattern.
      --algorithm <list>               Comma-separated algorithms: sha256,sha512,etc.
      --json <file>                    checksums.json output file.
      --no-json                        Do not write checksums.json.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --sha256 <file>                  SHA256SUMS output file.
      --sha512 <file>                  SHA512SUMS output file.
      --no-sums                        Do not write SUMS files.
      --verify                         Verify checksum file instead of only generating.
      --verify-file <file>             Checksum file to verify.
      --include-output-files           Include generated checksum output files.
      --include-hidden                 Include hidden files.
      --allow-secret-paths             Allow paths that look secret-like.
      --max-file-size-bytes <bytes>    Skip files larger than this size. 0 means unlimited.
      --fail-if-empty                  Exit non-zero when no files are found.
      --no-fail-on-verify-error        Do not fail process on verification mismatch.
      --dry-run                        Do not write files.
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
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".__DOUBLE_STAR__.")
    .replace(/\*/g, "[^/]*")
    .replace(/.__DOUBLE_STAR__./g, ".*");

  return new RegExp(`^${source}$`);
}

function matchesPattern(relativePath, pattern) {
  const normalizedPath = toPosixPath(relativePath);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith("/")) {
    return normalizedPath.startsWith(normalizedPattern);
  }

  if (normalizedPattern.includes("*")) {
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

  if (!args.include_output_files && outputPaths.includes(normalized))
    return true;

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

function getOutputPaths(args, repoRoot) {
  return [args.json_file, args.summary_file, args.sha256_file, args.sha512_file]
    .filter(Boolean)
    .map((filePath) =>
      toRelativePath(resolvePath(filePath, repoRoot), repoRoot),
    );
}

function collectFiles(args, repoRoot) {
  const outputPaths = getOutputPaths(args, repoRoot);
  const files = [];

  for (const includePath of args.include) {
    walkFiles(includePath, repoRoot, args, outputPaths, files);
  }

  return [...new Set(files)]
    .filter((filePath) => isFile(filePath))
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function hashFile(filePath, algorithm) {
  const hash = crypto.createHash(algorithm);
  const buffer = fs.readFileSync(filePath);

  hash.update(buffer);

  return hash.digest("hex");
}

function hashFileMany(filePath, algorithms) {
  return Object.fromEntries(
    algorithms.map((algorithm) => [algorithm, hashFile(filePath, algorithm)]),
  );
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

function createChecksumRecord(filePath, repoRoot, args) {
  const stat = fs.statSync(filePath);
  const relativePath = toRelativePath(filePath, repoRoot);

  if (args.max_file_size_bytes > 0 && stat.size > args.max_file_size_bytes) {
    return {
      skipped: true,
      path: relativePath,
      size_bytes: stat.size,
      size_human: formatBytes(stat.size),
      reason: `File exceeds max size ${args.max_file_size_bytes} bytes.`,
    };
  }

  return {
    path: relativePath,
    name: path.basename(filePath),
    directory: toPosixPath(path.dirname(relativePath)),
    size_bytes: stat.size,
    size_human: formatBytes(stat.size),
    modified_at: stat.mtime.toISOString(),
    hashes: hashFileMany(filePath, args.algorithms),
  };
}

function createChecksums(args, repoRoot) {
  const files = collectFiles(args, repoRoot);
  const records = [];
  const skipped = [];

  for (const file of files) {
    const record = createChecksumRecord(file, repoRoot, args);

    if (record.skipped) {
      skipped.push(record);
    } else {
      records.push(record);
    }
  }

  const totalSize = records.reduce((sum, record) => sum + record.size_bytes, 0);

  return {
    schema_version: 1,
    type: "checksums",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    release: {
      version: args.version || null,
      previous_version: args.previous_version || null,
      channel: args.channel || "release",
    },
    github: getGitMetadata(repoRoot),
    config: {
      include: args.include.map(toPosixPath),
      exclude: args.exclude.map(toPosixPath),
      algorithms: args.algorithms,
      include_output_files: args.include_output_files,
      include_hidden: args.include_hidden,
      allow_secret_paths: args.allow_secret_paths,
      max_file_size_bytes: args.max_file_size_bytes,
    },
    outputs: {
      json_file: args.write_json
        ? toRelativePath(resolvePath(args.json_file, repoRoot), repoRoot)
        : null,
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      sha256_file:
        args.write_sums && args.algorithms.includes("sha256")
          ? toRelativePath(resolvePath(args.sha256_file, repoRoot), repoRoot)
          : null,
      sha512_file:
        args.write_sums && args.algorithms.includes("sha512")
          ? toRelativePath(resolvePath(args.sha512_file, repoRoot), repoRoot)
          : null,
    },
    totals: {
      files: records.length,
      skipped: skipped.length,
      size_bytes: totalSize,
      size_human: formatBytes(totalSize),
    },
    files: records,
    skipped,
  };
}

function createSumsFile(checksums, algorithm) {
  return `${checksums.files
    .filter((record) => record.hashes?.[algorithm])
    .map((record) => `${record.hashes[algorithm]}  ${record.path}`)
    .join("\n")}\n`;
}

function inferAlgorithmFromSumsFile(filePath) {
  const basename = path.basename(filePath).toUpperCase();

  if (basename.includes("SHA512")) return "sha512";
  if (basename.includes("SHA384")) return "sha384";
  if (basename.includes("SHA256")) return "sha256";
  if (basename.includes("SHA224")) return "sha224";
  if (basename.includes("SHA1")) return "sha1";

  return "";
}

function parseSumsFile(filePath, repoRoot, algorithm = "") {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    throw new Error(`Checksum file not found: ${filePath}`);
  }

  const resolvedAlgorithm =
    algorithm || inferAlgorithmFromSumsFile(absolutePath);

  if (!resolvedAlgorithm) {
    throw new Error(
      `Unable to infer checksum algorithm from file name: ${filePath}`,
    );
  }

  const entries = fs
    .readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([a-fA-F0-9]+)\s+\*?(.+)$/);

      if (!match) {
        return {
          valid: false,
          algorithm: resolvedAlgorithm,
          expected: "",
          path: "",
          raw: line,
          error: "Invalid checksum line format.",
        };
      }

      return {
        valid: true,
        algorithm: resolvedAlgorithm,
        expected: match[1].toLowerCase(),
        path: match[2].trim(),
        raw: line,
      };
    });

  return {
    file: toRelativePath(absolutePath, repoRoot),
    algorithm: resolvedAlgorithm,
    entries,
  };
}

function verifySumsFile(filePath, repoRoot, algorithm = "") {
  const parsed = parseSumsFile(filePath, repoRoot, algorithm);

  const results = parsed.entries.map((entry) => {
    if (!entry.valid) {
      return {
        ...entry,
        ok: false,
        actual: "",
        exists: false,
      };
    }

    const absoluteTarget = resolvePath(entry.path, repoRoot);

    if (!isFile(absoluteTarget)) {
      return {
        ...entry,
        ok: false,
        actual: "",
        exists: false,
        error: "Referenced file does not exist.",
      };
    }

    const actual = hashFile(absoluteTarget, parsed.algorithm).toLowerCase();

    return {
      ...entry,
      ok: actual === entry.expected,
      actual,
      exists: true,
      error: actual === entry.expected ? "" : "Checksum mismatch.",
    };
  });

  const failures = results.filter((result) => !result.ok);

  return {
    file: parsed.file,
    algorithm: parsed.algorithm,
    checked: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    ok: failures.length === 0,
    results,
    failures,
  };
}

function createSummaryMarkdown(checksums, verification = null) {
  const lines = [
    `# 🔐 ${PROJECT_NAME} Checksums`,
    "",
    `Generated: \`${checksums.created_at}\``,
    "",
    "## 🧾 Release",
    "",
    `- Version: \`${checksums.release.version || "not provided"}\``,
    `- Previous version: \`${checksums.release.previous_version || "not provided"}\``,
    `- Channel: \`${checksums.release.channel}\``,
    `- Repository: \`${checksums.repository}\``,
    `- Commit: \`${checksums.github.short_sha || checksums.github.sha || "unknown"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Files: \`${checksums.totals.files}\``,
    `- Skipped: \`${checksums.totals.skipped}\``,
    `- Total size: \`${checksums.totals.size_human}\``,
    `- Algorithms: \`${checksums.config.algorithms.join(", ")}\``,
    "",
  ];

  if (verification) {
    lines.push("## ✅ Verification");
    lines.push("");
    lines.push(`- File: \`${verification.file}\``);
    lines.push(`- Algorithm: \`${verification.algorithm}\``);
    lines.push(`- Checked: \`${verification.checked}\``);
    lines.push(`- Passed: \`${verification.passed}\``);
    lines.push(`- Failed: \`${verification.failed}\``);
    lines.push(`- Result: \`${verification.ok ? "passed" : "failed"}\``);
    lines.push("");
  }

  lines.push("## 📁 Files");
  lines.push("");

  if (!checksums.files.length) {
    lines.push("No files were checksummed.");
  } else {
    const algorithm = checksums.config.algorithms.includes("sha256")
      ? "sha256"
      : checksums.config.algorithms[0];

    lines.push("| Path | Size | Hash |");
    lines.push("|---|---:|---|");

    for (const record of checksums.files) {
      lines.push(
        `| \`${record.path}\` | \`${record.size_human}\` | \`${algorithm}:${record.hashes[algorithm].slice(0, 20)}…\` |`,
      );
    }
  }

  if (checksums.skipped.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped");
    lines.push("");
    lines.push("| Path | Size | Reason |");
    lines.push("|---|---:|---|");

    for (const skipped of checksums.skipped) {
      lines.push(
        `| \`${skipped.path}\` | \`${skipped.size_human}\` | ${skipped.reason} |`,
      );
    }
  }

  if (verification?.failures?.length) {
    lines.push("");
    lines.push("## ❌ Verification Failures");
    lines.push("");
    lines.push("| Path | Error |");
    lines.push("|---|---|");

    for (const failure of verification.failures) {
      lines.push(
        `| \`${failure.path || failure.raw}\` | ${failure.error || "Failed"} |`,
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

function createStepSummary(checksums, verification = null) {
  const lines = [
    "## 🔐 Checksums",
    "",
    `- Files: \`${checksums.totals.files}\``,
    `- Skipped: \`${checksums.totals.skipped}\``,
    `- Total size: \`${checksums.totals.size_human}\``,
    `- Algorithms: \`${checksums.config.algorithms.join(", ")}\``,
  ];

  if (checksums.outputs.json_file) {
    lines.push(`- JSON: \`${checksums.outputs.json_file}\``);
  }

  if (checksums.outputs.sha256_file) {
    lines.push(`- SHA256SUMS: \`${checksums.outputs.sha256_file}\``);
  }

  if (checksums.outputs.sha512_file) {
    lines.push(`- SHA512SUMS: \`${checksums.outputs.sha512_file}\``);
  }

  if (verification) {
    lines.push("");
    lines.push("### Verification");
    lines.push("");
    lines.push(`- Result: \`${verification.ok ? "passed" : "failed"}\``);
    lines.push(`- Checked: \`${verification.checked}\``);
    lines.push(`- Failed: \`${verification.failed}\``);
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const jsonFile = resolvePath(args.json_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);
  const sha256File = resolvePath(args.sha256_file, repoRoot);
  const sha512File = resolvePath(args.sha512_file, repoRoot);

  logger.info("Creating checksums.");

  const checksums = createChecksums(args, repoRoot);

  let verification = null;

  if (args.verify) {
    const verifyFile =
      args.verify_file ||
      (args.algorithms.includes("sha256")
        ? args.sha256_file
        : args.sha512_file);

    verification = verifySumsFile(verifyFile, repoRoot);
  }

  const output = {
    ...checksums,
    verification,
  };

  const json = `${JSON.stringify(output, null, 2)}\n`;
  const summaryMarkdown = createSummaryMarkdown(checksums, verification);

  if (args.write_json) {
    writeTextFile(jsonFile, json, {
      dry_run: args.dry_run,
    });
  }

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summaryMarkdown, {
      dry_run: args.dry_run,
    });
  }

  if (args.write_sums && args.algorithms.includes("sha256")) {
    writeTextFile(sha256File, createSumsFile(checksums, "sha256"), {
      dry_run: args.dry_run,
    });
  }

  if (args.write_sums && args.algorithms.includes("sha512")) {
    writeTextFile(sha512File, createSumsFile(checksums, "sha512"), {
      dry_run: args.dry_run,
    });
  }

  setGitHubOutput("checksums_json_file", checksums.outputs.json_file || "");
  setGitHubOutput(
    "checksums_summary_file",
    checksums.outputs.summary_file || "",
  );
  setGitHubOutput("checksums_sha256_file", checksums.outputs.sha256_file || "");
  setGitHubOutput("checksums_sha512_file", checksums.outputs.sha512_file || "");
  setGitHubOutput("checksums_file_count", String(checksums.totals.files));
  setGitHubOutput("checksums_skipped_count", String(checksums.totals.skipped));
  setGitHubOutput("checksums_size_bytes", String(checksums.totals.size_bytes));
  setGitHubOutput("checksums_size_human", checksums.totals.size_human);
  setGitHubOutput(
    "checksums_verify_ok",
    verification ? String(verification.ok) : "",
  );
  setGitHubOutput(
    "checksums_verify_failed",
    verification ? String(verification.failed) : "",
  );

  if (args.write_step_summary) {
    appendGitHubStepSummary(createStepSummary(checksums, verification));
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_empty && checksums.totals.files === 0) {
    logger.error("No files were found for checksum generation.");
    process.exitCode = 1;
  }

  if (verification && !verification.ok && args.fail_on_verify_error) {
    logger.error(
      `Checksum verification failed for ${verification.failed} file(s).`,
    );
    process.exitCode = 1;
  }
}

main();
