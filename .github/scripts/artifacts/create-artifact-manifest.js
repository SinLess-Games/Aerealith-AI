#!/usr/bin/env node
// .github/scripts/artifacts/create-artifact-manifest.js
// =============================================================================
// Aerealith AI — Artifact Manifest Generator
// -----------------------------------------------------------------------------
// Purpose:
//   Discover generated workflow artifacts, calculate checksums, and write a
//   release-safe artifact manifest for GitHub Actions, release publishing,
//   security evidence, changelogs, Docker manifests, npm manifests, Cloudflare
//   deployment reports, and AI automation outputs.
//
// Output:
//   - artifacts/release/artifact-manifest.json
//   - artifacts/release/artifact-manifest.md
//   - artifacts/release/SHA256SUMS
//   - artifacts/release/SHA512SUMS
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not upload artifacts by itself.
//   - Does not include file contents.
//   - Calculates hashes from local files.
//   - Excludes secrets, node_modules, git internals, caches, and temporary files.
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
    info: (message) => console.log(`[artifact-manifest] ${message}`),
    warn: (message) => console.warn(`[artifact-manifest] WARN: ${message}`),
    error: (message) => console.error(`[artifact-manifest] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/release/artifact-manifest.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/artifact-manifest.md";
const DEFAULT_SHA256_FILE = "artifacts/release/SHA256SUMS";
const DEFAULT_SHA512_FILE = "artifacts/release/SHA512SUMS";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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
  { pattern: /SHA256SUMS|SHA512SUMS/i, category: "checksum" },
];

const MIME_BY_EXT = new Map([
  [".json", "application/json"],
  [".jsonc", "application/jsonc"],
  [".sarif", "application/sarif+json"],
  [".spdx", "text/spdx"],
  [".md", "text/markdown"],
  [".txt", "text/plain"],
  [".log", "text/plain"],
  [".yml", "application/yaml"],
  [".yaml", "application/yaml"],
  [".xml", "application/xml"],
  [".html", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".cjs", "text/javascript"],
  [".ts", "text/typescript"],
  [".tsx", "text/typescript"],
  [".zip", "application/zip"],
  [".gz", "application/gzip"],
  [".tgz", "application/gzip"],
  [".tar", "application/x-tar"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
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
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "release",
    include: normalizeStringList(process.env.ARTIFACT_MANIFEST_INCLUDE),
    exclude: normalizeStringList(process.env.ARTIFACT_MANIFEST_EXCLUDE),
    output_file:
      process.env.ARTIFACT_MANIFEST_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ARTIFACT_MANIFEST_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    sha256_file:
      process.env.ARTIFACT_MANIFEST_SHA256_FILE || DEFAULT_SHA256_FILE,
    sha512_file:
      process.env.ARTIFACT_MANIFEST_SHA512_FILE || DEFAULT_SHA512_FILE,
    write_summary_file: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_WRITE_SUMMARY,
      true,
    ),
    write_sha256: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_WRITE_SHA256,
      true,
    ),
    write_sha512: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_WRITE_SHA512,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_FAIL_IF_EMPTY,
      false,
    ),
    include_output_files: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_INCLUDE_OUTPUT_FILES,
      false,
    ),
    include_hidden: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_INCLUDE_HIDDEN,
      false,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_ALLOW_SECRET_PATHS,
      false,
    ),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ARTIFACT_MANIFEST_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.ARTIFACT_MANIFEST_STEP_SUMMARY,
      true,
    ),
    max_file_size_bytes: normalizeInteger(
      process.env.ARTIFACT_MANIFEST_MAX_FILE_SIZE_BYTES,
      0,
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

    if (arg === "--sha256") {
      args.sha256_file = argv[index + 1];
      args.write_sha256 = true;
      index += 1;
      continue;
    }

    if (arg === "--no-sha256") {
      args.write_sha256 = false;
      continue;
    }

    if (arg === "--sha512") {
      args.sha512_file = argv[index + 1];
      args.write_sha512 = true;
      index += 1;
      continue;
    }

    if (arg === "--no-sha512") {
      args.write_sha512 = false;
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

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Artifact Manifest Generator

Usage:
  node .github/scripts/artifacts/create-artifact-manifest.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --version <version>              Release version.
      --previous-version <version>     Previous release version.
      --channel <channel>              Release channel.
  -i, --include <path>                 Include artifact path or directory.
  -x, --exclude <pattern>              Exclude path pattern.
  -o, --output <file>                  Manifest JSON output file.
      --summary <file>                 Manifest Markdown summary file.
      --no-summary                     Do not write Markdown summary.
      --sha256 <file>                  SHA256SUMS output file.
      --no-sha256                      Do not write SHA256SUMS.
      --sha512 <file>                  SHA512SUMS output file.
      --no-sha512                      Do not write SHA512SUMS.
      --include-output-files           Include generated manifest/checksum files in manifest.
      --include-hidden                 Include hidden files.
      --allow-secret-paths             Allow paths that look secret-like.
      --max-file-size-bytes <bytes>    Skip files larger than this size. 0 means unlimited.
      --fail-if-empty                  Exit non-zero when no artifacts are found.
      --dry-run                        Do not write files.
      --no-print                       Do not print manifest JSON.
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

function shouldExcludePath(relativePath, args, generatedOutputPaths = []) {
  const normalized = toPosixPath(relativePath);
  const basename = path.basename(normalized);

  if (DEFAULT_EXCLUDE_FILENAMES.has(basename)) return true;

  if (!args.include_hidden && basename.startsWith(".")) return true;

  if (!args.include_output_files && generatedOutputPaths.includes(normalized))
    return true;

  if (!args.allow_secret_paths && SECRET_PATH_PATTERN.test(normalized))
    return true;

  return args.exclude.some((pattern) => matchesPattern(normalized, pattern));
}

function walkFiles(
  targetPath,
  repoRoot,
  args,
  generatedOutputPaths,
  output = [],
) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return output;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args, generatedOutputPaths))
    return output;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    output.push(absolutePath);
    return output;
  }

  if (!stat.isDirectory()) return output;

  const entries = fs.readdirSync(absolutePath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    walkFiles(
      path.join(absolutePath, entry.name),
      repoRoot,
      args,
      generatedOutputPaths,
      output,
    );
  }

  return output;
}

function collectArtifactFiles(args, repoRoot) {
  const generatedOutputPaths = [
    args.output_file,
    args.summary_file,
    args.sha256_file,
    args.sha512_file,
  ]
    .filter(Boolean)
    .map((filePath) =>
      toRelativePath(resolvePath(filePath, repoRoot), repoRoot),
    );

  const files = [];

  for (const includePath of args.include) {
    walkFiles(includePath, repoRoot, args, generatedOutputPaths, files);
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

function getFileKind(relativePath) {
  const normalized = relativePath.toLowerCase();

  if (normalized.endsWith("sha256sums") || normalized.endsWith("sha512sums"))
    return "checksum";
  if (normalized.includes("sbom")) return "sbom";
  if (normalized.includes("attestation") || normalized.includes("provenance"))
    return "attestation";
  if (normalized.endsWith(".sarif")) return "sarif";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  if (normalized.endsWith(".txt")) return "text";
  if (
    normalized.endsWith(".zip") ||
    normalized.endsWith(".tar") ||
    normalized.endsWith(".tgz") ||
    normalized.endsWith(".gz")
  ) {
    return "archive";
  }
  if (normalized.includes("coverage")) return "coverage";
  if (normalized.includes("manifest")) return "manifest";
  if (normalized.includes("report")) return "report";

  return "file";
}

function getFileCategory(relativePath) {
  const normalized = toPosixPath(relativePath);

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.category;
    }
  }

  return "artifact";
}

function getMimeType(filePath) {
  const basename = path.basename(filePath);

  if (basename === "SHA256SUMS" || basename === "SHA512SUMS") {
    return "text/plain";
  }

  const extension = path.extname(filePath).toLowerCase();

  return MIME_BY_EXT.get(extension) || "application/octet-stream";
}

function createArtifactRecord(filePath, repoRoot, args) {
  const stat = fs.statSync(filePath);
  const relativePath = toRelativePath(filePath, repoRoot);
  const extension = path.extname(filePath).toLowerCase();
  const sizeBytes = stat.size;

  if (args.max_file_size_bytes > 0 && sizeBytes > args.max_file_size_bytes) {
    return {
      skipped: true,
      reason: `File exceeds max size ${args.max_file_size_bytes} bytes.`,
      path: relativePath,
      size_bytes: sizeBytes,
    };
  }

  return {
    path: relativePath,
    name: path.basename(filePath),
    directory: toPosixPath(path.dirname(relativePath)),
    extension,
    kind: getFileKind(relativePath),
    category: getFileCategory(relativePath),
    mime_type: getMimeType(filePath),
    size_bytes: sizeBytes,
    size_human: formatBytes(sizeBytes),
    modified_at: stat.mtime.toISOString(),
    sha256: hashFile(filePath, "sha256"),
    sha512: hashFile(filePath, "sha512"),
  };
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

function groupArtifactsByCategory(artifacts) {
  const groups = {};

  for (const artifact of artifacts) {
    if (!groups[artifact.category]) {
      groups[artifact.category] = {
        count: 0,
        size_bytes: 0,
        size_human: "0 B",
        artifacts: [],
      };
    }

    groups[artifact.category].count += 1;
    groups[artifact.category].size_bytes += artifact.size_bytes;
    groups[artifact.category].artifacts.push(artifact.path);
  }

  for (const group of Object.values(groups)) {
    group.size_human = formatBytes(group.size_bytes);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createManifest(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const files = collectArtifactFiles(args, repoRoot);

  const artifacts = [];
  const skipped = [];

  for (const file of files) {
    const record = createArtifactRecord(file, repoRoot, args);

    if (record.skipped) {
      skipped.push(record);
    } else {
      artifacts.push(record);
    }
  }

  const totalSize = artifacts.reduce(
    (sum, artifact) => sum + artifact.size_bytes,
    0,
  );

  return {
    schema_version: 1,
    type: "artifact-manifest",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    release: {
      version: args.version || null,
      previous_version: args.previous_version || null,
      channel: args.channel || "release",
    },
    github: git,
    manifest: {
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      sha256_file: args.write_sha256
        ? toRelativePath(resolvePath(args.sha256_file, repoRoot), repoRoot)
        : null,
      sha512_file: args.write_sha512
        ? toRelativePath(resolvePath(args.sha512_file, repoRoot), repoRoot)
        : null,
      include: args.include.map((item) => toPosixPath(item)),
      exclude: args.exclude.map((item) => toPosixPath(item)),
      include_output_files: args.include_output_files,
      include_hidden: args.include_hidden,
      allow_secret_paths: args.allow_secret_paths,
      max_file_size_bytes: args.max_file_size_bytes,
    },
    totals: {
      artifacts: artifacts.length,
      skipped: skipped.length,
      size_bytes: totalSize,
      size_human: formatBytes(totalSize),
      categories: groupArtifactsByCategory(artifacts),
    },
    artifacts,
    skipped,
  };
}

function createChecksumFile(artifacts, algorithm) {
  const key = algorithm.toLowerCase();

  return `${artifacts
    .map((artifact) => `${artifact[key]}  ${artifact.path}`)
    .join("\n")}\n`;
}

function createMarkdownSummary(manifest) {
  const lines = [
    `# 📦 ${PROJECT_NAME} Artifact Manifest`,
    "",
    `Generated: \`${manifest.created_at}\``,
    "",
    "## 🧾 Release",
    "",
    `- Version: \`${manifest.release.version || "not provided"}\``,
    `- Previous version: \`${manifest.release.previous_version || "not provided"}\``,
    `- Channel: \`${manifest.release.channel}\``,
    `- Repository: \`${manifest.repository}\``,
    `- Commit: \`${manifest.github.short_sha || manifest.github.sha || "unknown"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Artifacts: \`${manifest.totals.artifacts}\``,
    `- Skipped: \`${manifest.totals.skipped}\``,
    `- Total size: \`${manifest.totals.size_human}\``,
    "",
  ];

  if (Object.keys(manifest.totals.categories).length) {
    lines.push("## 🗂️ Categories");
    lines.push("");
    lines.push("| Category | Count | Size |");
    lines.push("|---|---:|---:|");

    for (const [category, group] of Object.entries(
      manifest.totals.categories,
    )) {
      lines.push(
        `| \`${category}\` | \`${group.count}\` | \`${group.size_human}\` |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📁 Artifacts");
  lines.push("");

  if (!manifest.artifacts.length) {
    lines.push("No artifacts were found.");
  } else {
    lines.push("| Path | Category | Kind | Size | SHA256 |");
    lines.push("|---|---|---|---:|---|");

    for (const artifact of manifest.artifacts) {
      lines.push(
        `| \`${artifact.path}\` | \`${artifact.category}\` | \`${artifact.kind}\` | \`${artifact.size_human}\` | \`${artifact.sha256.slice(0, 16)}…\` |`,
      );
    }
  }

  if (manifest.skipped.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped");
    lines.push("");
    lines.push("| Path | Size | Reason |");
    lines.push("|---|---:|---|");

    for (const skipped of manifest.skipped) {
      lines.push(
        `| \`${skipped.path}\` | \`${formatBytes(skipped.size_bytes || 0)}\` | ${skipped.reason} |`,
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

function createStepSummary(manifest) {
  const lines = [
    "## 📦 Artifact Manifest",
    "",
    `- Artifacts: \`${manifest.totals.artifacts}\``,
    `- Skipped: \`${manifest.totals.skipped}\``,
    `- Total size: \`${manifest.totals.size_human}\``,
    `- Manifest: \`${manifest.manifest.output_file}\``,
  ];

  if (manifest.manifest.sha256_file) {
    lines.push(`- SHA256SUMS: \`${manifest.manifest.sha256_file}\``);
  }

  if (manifest.manifest.sha512_file) {
    lines.push(`- SHA512SUMS: \`${manifest.manifest.sha512_file}\``);
  }

  if (Object.keys(manifest.totals.categories).length) {
    lines.push("");
    lines.push("| Category | Count | Size |");
    lines.push("|---|---:|---:|");

    for (const [category, group] of Object.entries(
      manifest.totals.categories,
    )) {
      lines.push(
        `| \`${category}\` | \`${group.count}\` | \`${group.size_human}\` |`,
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
  const sha256File = resolvePath(args.sha256_file, repoRoot);
  const sha512File = resolvePath(args.sha512_file, repoRoot);

  logger.info("Creating artifact manifest.");

  const manifest = createManifest(args, repoRoot);
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const summaryMarkdown = createMarkdownSummary(manifest);

  writeTextFile(outputFile, manifestJson, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summaryMarkdown, {
      dry_run: args.dry_run,
    });
  }

  if (args.write_sha256) {
    writeTextFile(
      sha256File,
      createChecksumFile(manifest.artifacts, "sha256"),
      {
        dry_run: args.dry_run,
      },
    );
  }

  if (args.write_sha512) {
    writeTextFile(
      sha512File,
      createChecksumFile(manifest.artifacts, "sha512"),
      {
        dry_run: args.dry_run,
      },
    );
  }

  setGitHubOutput("artifact_manifest_file", manifest.manifest.output_file);
  setGitHubOutput(
    "artifact_manifest_summary_file",
    manifest.manifest.summary_file || "",
  );
  setGitHubOutput(
    "artifact_manifest_sha256_file",
    manifest.manifest.sha256_file || "",
  );
  setGitHubOutput(
    "artifact_manifest_sha512_file",
    manifest.manifest.sha512_file || "",
  );
  setGitHubOutput("artifact_manifest_count", String(manifest.totals.artifacts));
  setGitHubOutput(
    "artifact_manifest_size_bytes",
    String(manifest.totals.size_bytes),
  );
  setGitHubOutput("artifact_manifest_size_human", manifest.totals.size_human);

  if (args.write_step_summary) {
    appendGitHubStepSummary(createStepSummary(manifest));
  }

  if (args.print) {
    console.log(manifestJson.trim());
  }

  if (args.fail_if_empty && manifest.totals.artifacts === 0) {
    logger.error("No artifacts were found.");
    process.exitCode = 1;
  }
}

main();
