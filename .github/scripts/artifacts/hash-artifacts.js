#!/usr/bin/env node
// .github/scripts/artifacts/hash-artifacts.js
// =============================================================================
// Aerealith AI — Artifact Hash Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   Hash release artifacts, workflow evidence, generated manifests, security
//   reports, npm manifests, Docker manifests, Cloudflare reports, AI outputs,
//   build outputs, and other repository artifacts.
//
// Output:
//   - artifacts/release/artifact-hashes.json
//   - artifacts/release/artifact-hashes.md
//   - artifacts/release/ARTIFACT-HASHES.txt
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not upload artifacts.
//   - Does not include file contents.
//   - Excludes secrets, node_modules, git internals, caches, and temp files.
//   - Can hash files discovered by path or listed in an artifact manifest.
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
    info: (message) => console.log(`[artifact-hashes] ${message}`),
    warn: (message) => console.warn(`[artifact-hashes] WARN: ${message}`),
    error: (message) => console.error(`[artifact-hashes] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/release/artifact-hashes.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/artifact-hashes.md";
const DEFAULT_HASHES_FILE = "artifacts/release/ARTIFACT-HASHES.txt";
const DEFAULT_MANIFEST_FILE = "artifacts/release/artifact-manifest.json";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SUPPORTED_ALGORITHMS = new Set([
  "md5",
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

const CATEGORY_RULES = [
  { pattern: /^artifacts\/ai\//, category: "ai" },
  { pattern: /^artifacts\/release\//, category: "release" },
  { pattern: /^artifacts\/security\//, category: "security" },
  { pattern: /^artifacts\/npm\//, category: "npm" },
  { pattern: /^artifacts\/docker\//, category: "docker" },
  { pattern: /^artifacts\/cloudflare\//, category: "cloudflare" },
  { pattern: /^artifacts\/nx\//, category: "nx" },
  { pattern: /^artifacts\/test\//, category: "test" },
  { pattern: /^artifacts\/coverage\//, category: "coverage" },
  { pattern: /^coverage\//, category: "coverage" },
  { pattern: /^dist\//, category: "build" },
  { pattern: /^reports\//, category: "report" },
  { pattern: /sbom/i, category: "sbom" },
  { pattern: /attestation|provenance/i, category: "attestation" },
  { pattern: /checksum|sha256|sha512|hash/i, category: "integrity" },
];

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
  const requested = normalizeStringList(value).length
    ? normalizeStringList(value)
    : DEFAULT_ALGORITHMS;

  const algorithms = requested
    .map((algorithm) => algorithm.toLowerCase())
    .filter((algorithm) => SUPPORTED_ALGORITHMS.has(algorithm));

  return [...new Set(algorithms)].length
    ? [...new Set(algorithms)]
    : DEFAULT_ALGORITHMS;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "release",
    include: normalizeStringList(process.env.ARTIFACT_HASH_INCLUDE),
    exclude: normalizeStringList(process.env.ARTIFACT_HASH_EXCLUDE),
    algorithms: normalizeAlgorithms(process.env.ARTIFACT_HASH_ALGORITHMS),
    manifest_file:
      process.env.ARTIFACT_HASH_MANIFEST_FILE || DEFAULT_MANIFEST_FILE,
    use_manifest: normalizeBoolean(
      process.env.ARTIFACT_HASH_USE_MANIFEST,
      false,
    ),
    output_file: process.env.ARTIFACT_HASH_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ARTIFACT_HASH_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    hashes_file: process.env.ARTIFACT_HASHES_FILE || DEFAULT_HASHES_FILE,
    write_summary_file: normalizeBoolean(
      process.env.ARTIFACT_HASH_WRITE_SUMMARY,
      true,
    ),
    write_hashes_file: normalizeBoolean(
      process.env.ARTIFACT_HASH_WRITE_HASHES,
      true,
    ),
    include_output_files: normalizeBoolean(
      process.env.ARTIFACT_HASH_INCLUDE_OUTPUT_FILES,
      false,
    ),
    include_hidden: normalizeBoolean(
      process.env.ARTIFACT_HASH_INCLUDE_HIDDEN,
      false,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.ARTIFACT_HASH_ALLOW_SECRET_PATHS,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.ARTIFACT_HASH_FAIL_IF_EMPTY,
      false,
    ),
    max_file_size_bytes: normalizeInteger(
      process.env.ARTIFACT_HASH_MAX_FILE_SIZE_BYTES,
      0,
    ),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ARTIFACT_HASH_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.ARTIFACT_HASH_STEP_SUMMARY,
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

    if (arg === "--manifest") {
      args.manifest_file = argv[index + 1];
      args.use_manifest = true;
      index += 1;
      continue;
    }

    if (arg === "--use-manifest") {
      args.use_manifest = true;
      continue;
    }

    if (arg === "--no-manifest") {
      args.use_manifest = false;
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

    if (arg === "--hashes") {
      args.hashes_file = argv[index + 1];
      args.write_hashes_file = true;
      index += 1;
      continue;
    }

    if (arg === "--no-hashes") {
      args.write_hashes_file = false;
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
Aerealith AI Artifact Hash Reporter

Usage:
  node .github/scripts/artifacts/hash-artifacts.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --version <version>              Release version.
      --previous-version <version>     Previous release version.
      --channel <channel>              Release channel.
  -i, --include <path>                 Include artifact path or directory.
  -x, --exclude <pattern>              Exclude path pattern.
      --algorithm <list>               Comma-separated algorithms: sha256,sha512,etc.
      --manifest <file>                Read artifact paths from manifest file.
      --use-manifest                   Use default artifact manifest if available.
      --no-manifest                    Ignore artifact manifest and discover files.
  -o, --output <file>                  JSON hash report output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --hashes <file>                  Text hash list output file.
      --no-hashes                      Do not write text hash list.
      --include-output-files           Include generated hash output files.
      --include-hidden                 Include hidden files.
      --allow-secret-paths             Allow paths that look secret-like.
      --max-file-size-bytes <bytes>    Skip files larger than this size. 0 means unlimited.
      --fail-if-empty                  Exit non-zero when no files are hashed.
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

function readJsonFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(`JSON file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
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

function getOutputPaths(args, repoRoot) {
  return [args.output_file, args.summary_file, args.hashes_file]
    .filter(Boolean)
    .map((filePath) =>
      toRelativePath(resolvePath(filePath, repoRoot), repoRoot),
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

function collectFilesFromManifest(args, repoRoot, outputPaths) {
  const manifestPath = resolvePath(args.manifest_file, repoRoot);

  if (!isFile(manifestPath)) {
    return [];
  }

  const manifest = readJsonFile(manifestPath);
  const artifactPaths = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.map((artifact) => artifact.path).filter(Boolean)
    : [];

  return artifactPaths
    .map((artifactPath) => resolvePath(artifactPath, repoRoot))
    .filter((absolutePath) => isFile(absolutePath))
    .filter((absolutePath) => {
      const relativePath = toRelativePath(absolutePath, repoRoot);
      return !shouldExcludePath(relativePath, args, outputPaths);
    });
}

function collectFiles(args, repoRoot) {
  const outputPaths = getOutputPaths(args, repoRoot);
  const files = [];

  if (args.use_manifest) {
    files.push(...collectFilesFromManifest(args, repoRoot, outputPaths));
  }

  if (!files.length) {
    for (const includePath of args.include) {
      walkFiles(includePath, repoRoot, args, outputPaths, files);
    }
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
  const stream = fs.readFileSync(filePath);

  hash.update(stream);

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

function getCategory(relativePath) {
  const normalized = toPosixPath(relativePath);

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.category;
    }
  }

  return "artifact";
}

function createHashRecord(filePath, repoRoot, args) {
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
    category: getCategory(relativePath),
    size_bytes: stat.size,
    size_human: formatBytes(stat.size),
    modified_at: stat.mtime.toISOString(),
    hashes: hashFileMany(filePath, args.algorithms),
  };
}

function groupByCategory(records) {
  const groups = {};

  for (const record of records) {
    if (!groups[record.category]) {
      groups[record.category] = {
        files: 0,
        size_bytes: 0,
        size_human: "0 B",
      };
    }

    groups[record.category].files += 1;
    groups[record.category].size_bytes += record.size_bytes;
  }

  for (const group of Object.values(groups)) {
    group.size_human = formatBytes(group.size_bytes);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createHashReport(args, repoRoot) {
  const files = collectFiles(args, repoRoot);
  const records = [];
  const skipped = [];

  for (const file of files) {
    const record = createHashRecord(file, repoRoot, args);

    if (record.skipped) {
      skipped.push(record);
    } else {
      records.push(record);
    }
  }

  const totalSize = records.reduce((sum, record) => sum + record.size_bytes, 0);

  return {
    schema_version: 1,
    type: "artifact-hashes",
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
      manifest_file: args.use_manifest
        ? toRelativePath(resolvePath(args.manifest_file, repoRoot), repoRoot)
        : null,
      use_manifest: args.use_manifest,
      include_output_files: args.include_output_files,
      include_hidden: args.include_hidden,
      allow_secret_paths: args.allow_secret_paths,
      max_file_size_bytes: args.max_file_size_bytes,
    },
    outputs: {
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      hashes_file: args.write_hashes_file
        ? toRelativePath(resolvePath(args.hashes_file, repoRoot), repoRoot)
        : null,
    },
    totals: {
      files: records.length,
      skipped: skipped.length,
      size_bytes: totalSize,
      size_human: formatBytes(totalSize),
      categories: groupByCategory(records),
    },
    files: records,
    skipped,
  };
}

function createHashesText(report) {
  const lines = [
    `# ${PROJECT_NAME} Artifact Hashes`,
    `# Generated: ${report.created_at}`,
    `# Repository: ${report.repository}`,
    `# Version: ${report.release.version || "not provided"}`,
    `# Channel: ${report.release.channel}`,
    `# Algorithms: ${report.config.algorithms.join(", ")}`,
    "",
  ];

  for (const record of report.files) {
    lines.push(`# ${record.path}`);

    for (const algorithm of report.config.algorithms) {
      if (record.hashes[algorithm]) {
        lines.push(`${algorithm}:${record.hashes[algorithm]}  ${record.path}`);
      }
    }

    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function createMarkdownSummary(report) {
  const primaryAlgorithm = report.config.algorithms.includes("sha256")
    ? "sha256"
    : report.config.algorithms[0];

  const lines = [
    `# 🔐 ${PROJECT_NAME} Artifact Hashes`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🧾 Release",
    "",
    `- Version: \`${report.release.version || "not provided"}\``,
    `- Previous version: \`${report.release.previous_version || "not provided"}\``,
    `- Channel: \`${report.release.channel}\``,
    `- Repository: \`${report.repository}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Algorithms: \`${report.config.algorithms.join(", ")}\``,
    "",
    "## 📊 Totals",
    "",
    `- Files hashed: \`${report.totals.files}\``,
    `- Files skipped: \`${report.totals.skipped}\``,
    `- Total size: \`${report.totals.size_human}\``,
    "",
  ];

  if (Object.keys(report.totals.categories).length) {
    lines.push("## 🗂️ Categories");
    lines.push("");
    lines.push("| Category | Files | Size |");
    lines.push("|---|---:|---:|");

    for (const [category, group] of Object.entries(report.totals.categories)) {
      lines.push(
        `| \`${category}\` | \`${group.files}\` | \`${group.size_human}\` |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📁 Hashed Files");
  lines.push("");

  if (!report.files.length) {
    lines.push("No files were hashed.");
  } else {
    lines.push("| Path | Category | Size | Hash |");
    lines.push("|---|---|---:|---|");

    for (const record of report.files) {
      lines.push(
        `| \`${record.path}\` | \`${record.category}\` | \`${record.size_human}\` | \`${primaryAlgorithm}:${record.hashes[primaryAlgorithm].slice(0, 24)}…\` |`,
      );
    }
  }

  if (report.skipped.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped Files");
    lines.push("");
    lines.push("| Path | Size | Reason |");
    lines.push("|---|---:|---|");

    for (const skipped of report.skipped) {
      lines.push(
        `| \`${skipped.path}\` | \`${skipped.size_human}\` | ${skipped.reason} |`,
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

function createStepSummary(report) {
  const lines = [
    "## 🔐 Artifact Hashes",
    "",
    `- Files hashed: \`${report.totals.files}\``,
    `- Files skipped: \`${report.totals.skipped}\``,
    `- Total size: \`${report.totals.size_human}\``,
    `- Algorithms: \`${report.config.algorithms.join(", ")}\``,
    `- JSON: \`${report.outputs.output_file}\``,
  ];

  if (report.outputs.summary_file) {
    lines.push(`- Summary: \`${report.outputs.summary_file}\``);
  }

  if (report.outputs.hashes_file) {
    lines.push(`- Hash list: \`${report.outputs.hashes_file}\``);
  }

  if (Object.keys(report.totals.categories).length) {
    lines.push("");
    lines.push("| Category | Files | Size |");
    lines.push("|---|---:|---:|");

    for (const [category, group] of Object.entries(report.totals.categories)) {
      lines.push(
        `| \`${category}\` | \`${group.files}\` | \`${group.size_human}\` |`,
      );
    }
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);
  const hashesFile = resolvePath(args.hashes_file, repoRoot);

  logger.info("Hashing artifacts.");

  const report = createHashReport(args, repoRoot);
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const summaryMarkdown = createMarkdownSummary(report);
  const hashesText = createHashesText(report);

  writeTextFile(outputFile, reportJson, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summaryMarkdown, {
      dry_run: args.dry_run,
    });
  }

  if (args.write_hashes_file) {
    writeTextFile(hashesFile, hashesText, {
      dry_run: args.dry_run,
    });
  }

  setGitHubOutput("artifact_hashes_file", report.outputs.output_file);
  setGitHubOutput(
    "artifact_hashes_summary_file",
    report.outputs.summary_file || "",
  );
  setGitHubOutput(
    "artifact_hashes_text_file",
    report.outputs.hashes_file || "",
  );
  setGitHubOutput("artifact_hashes_count", String(report.totals.files));
  setGitHubOutput(
    "artifact_hashes_skipped_count",
    String(report.totals.skipped),
  );
  setGitHubOutput(
    "artifact_hashes_size_bytes",
    String(report.totals.size_bytes),
  );
  setGitHubOutput("artifact_hashes_size_human", report.totals.size_human);
  setGitHubOutput(
    "artifact_hashes_algorithms",
    report.config.algorithms.join(","),
  );

  if (args.write_step_summary) {
    appendGitHubStepSummary(createStepSummary(report));
  }

  if (args.print) {
    console.log(reportJson.trim());
  }

  if (args.fail_if_empty && report.totals.files === 0) {
    logger.error("No artifacts were hashed.");
    process.exitCode = 1;
  }
}

main();
