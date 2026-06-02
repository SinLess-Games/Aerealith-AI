// .github/scripts/utils/artifacts.js
// =============================================================================
// Aerealith AI Artifact Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared helpers for discovering, validating, hashing, manifesting, and
//   packaging CI/CD build artifacts.
//
// Used by:
//   - .github/scripts/artifacts/create-checksums.js
//   - .github/scripts/artifacts/create-manifest.js
//   - .github/scripts/artifacts/create-release-evidence.js
//   - .github/scripts/npm/discover-publishable-packages.js
//   - .github/scripts/docker/discover-images.js
//   - .github/scripts/release/create-github-release.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//
// Notes:
//   - This module does not upload artifacts by itself.
//   - Uploading should be done by `actions/upload-artifact` in workflows.
//   - This module writes deterministic evidence files such as:
//       - artifact-manifest.json
//       - SHA256SUMS
//       - SHA512SUMS
//   - Safe for dry-run mode.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const logger = require("./logger");

const DEFAULT_OUTPUT_DIR = "artifacts";
const DEFAULT_RELEASE_OUTPUT_DIR = "artifacts/release";

const DEFAULT_HASH_ALGORITHMS = ["sha256", "sha512"];

const CHECKSUM_FILES = {
  sha256: "SHA256SUMS",
  sha512: "SHA512SUMS",
};

const DEFAULT_IGNORE_PATTERNS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.nx/**",
  "**/.next/**",
  "**/.open-next/**",
  "**/.wrangler/**",
  "**/coverage/**",
  "**/tmp/**",
  "**/.cache/**",
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value === "boolean") return value;

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [String(value).trim()].filter(Boolean);
  }

  return unique(value.map((item) => String(item).trim()).filter(Boolean));
}

function getDryRun(options = {}) {
  return normalizeBoolean(
    options.dryRun ??
      options.dry_run ??
      process.env.DRY_RUN ??
      process.env.PROJECT_SYNC_DRY_RUN,
    logger.DRY_RUN,
  );
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const candidates = [
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ];

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, ".git"))) return current;
      if (fs.existsSync(path.join(current, ".github"))) return current;

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath, repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return filePath;

  return path.join(repoRoot, filePath);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toRelativePath(filePath, baseDir = findRepoRoot()) {
  return toPosixPath(path.relative(baseDir, filePath));
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function isFile(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isDirectory();
}

function ensureDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (isDirectory(dirPath)) return dirPath;

  if (dryRun) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  return dirPath;
}

function removeFile(filePath, options = {}) {
  const dryRun = getDryRun(options);

  if (!pathExists(filePath)) return false;

  if (dryRun) {
    logger.dryRun(`Would remove file: ${filePath}`);
    return true;
  }

  fs.rmSync(filePath, {
    force: true,
  });

  return true;
}

function writeFile(filePath, contents, options = {}) {
  const dryRun = getDryRun(options);

  ensureDir(path.dirname(filePath), options);

  if (dryRun) {
    logger.dryRun(`Would write file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, contents);
    return filePath;
  }

  fs.writeFileSync(filePath, contents);
  logger.info(`Wrote ${filePath}.`);

  return filePath;
}

function writeJson(filePath, value, options = {}) {
  const json = `${stableStringify(value)}\n`;
  return writeFile(filePath, json, options);
}

function readJson(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableStringify(value) {
  return JSON.stringify(sortObjectDeep(value), null, 2);
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectDeep(value[key])]),
  );
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];

  let size = Number(bytes) || 0;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function sanitizeArtifactName(name) {
  return normalizeString(name, "artifact")
    .replace(/^@/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function createHumanReadableArtifactName(parts = []) {
  return normalizeStringList(parts)
    .map((part) => sanitizeArtifactName(part))
    .filter(Boolean)
    .join("-");
}

function shouldIgnorePath(
  relativePath,
  ignorePatterns = DEFAULT_IGNORE_PATTERNS,
) {
  const normalized = toPosixPath(relativePath);

  return normalizeStringList(ignorePatterns).some((pattern) => {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");

    return new RegExp(`^${escaped}$`).test(normalized);
  });
}

function walkFiles(inputPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(inputPath, repoRoot);
  const ignorePatterns = normalizeStringList(
    options.ignorePatterns || options.ignore_patterns,
  );
  const effectiveIgnorePatterns = ignorePatterns.length
    ? ignorePatterns
    : DEFAULT_IGNORE_PATTERNS;

  if (!pathExists(absolutePath)) {
    if (options.required === false) return [];
    throw new Error(`Artifact path does not exist: ${inputPath}`);
  }

  if (isFile(absolutePath)) {
    const relativePath = toRelativePath(absolutePath, repoRoot);

    if (shouldIgnorePath(relativePath, effectiveIgnorePatterns)) return [];

    return [absolutePath];
  }

  const results = [];

  function visit(currentPath) {
    const entries = fs.readdirSync(currentPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const relativePath = toRelativePath(entryPath, repoRoot);

      if (shouldIgnorePath(relativePath, effectiveIgnorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (entry.isFile()) {
        results.push(entryPath);
      }
    }
  }

  visit(absolutePath);

  return results.sort();
}

function discoverFiles(paths, options = {}) {
  return unique(
    normalizeStringList(paths)
      .flatMap((item) => walkFiles(item, options))
      .map((item) => path.resolve(item)),
  ).sort();
}

function assertFilesExist(files, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const missing = normalizeStringList(files).filter(
    (file) => !isFile(resolvePath(file, repoRoot)),
  );

  if (missing.length) {
    throw new Error(`Missing required artifact files: ${missing.join(", ")}`);
  }

  return true;
}

function hashFile(filePath, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  const buffer = fs.readFileSync(filePath);

  hash.update(buffer);

  return hash.digest("hex");
}

function hashBuffer(buffer, algorithm = "sha256") {
  return crypto.createHash(algorithm).update(buffer).digest("hex");
}

function getFileInfo(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);
  const stat = fs.statSync(absolutePath);

  const algorithms = normalizeStringList(
    options.algorithms || DEFAULT_HASH_ALGORITHMS,
  );

  const hashes = Object.fromEntries(
    algorithms.map((algorithm) => [
      algorithm,
      hashFile(absolutePath, algorithm),
    ]),
  );

  return {
    path: toRelativePath(absolutePath, repoRoot),
    name: path.basename(absolutePath),
    extension: path.extname(absolutePath),
    size_bytes: stat.size,
    size_human: formatBytes(stat.size),
    modified_at: stat.mtime.toISOString(),
    hashes,
  };
}

function createHashEntries(files, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const algorithms = normalizeStringList(
    options.algorithms || DEFAULT_HASH_ALGORITHMS,
  );

  return discoverFiles(files, {
    ...options,
    repoRoot,
  }).map((filePath) =>
    getFileInfo(filePath, {
      repoRoot,
      algorithms,
    }),
  );
}

function createChecksumLines(entries, algorithm = "sha256") {
  return entries
    .filter((entry) => entry.hashes?.[algorithm])
    .map((entry) => `${entry.hashes[algorithm]}  ${entry.path}`)
    .join("\n");
}

function writeChecksumFile(entries, algorithm, outputFile, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);
  const lines = createChecksumLines(entries, algorithm);
  const contents = lines ? `${lines}\n` : "";

  writeFile(absoluteOutputFile, contents, options);

  return absoluteOutputFile;
}

function writeChecksumFiles(
  entries,
  outputDir = DEFAULT_RELEASE_OUTPUT_DIR,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputDir = resolvePath(outputDir, repoRoot);
  const algorithms = normalizeStringList(
    options.algorithms || DEFAULT_HASH_ALGORITHMS,
  );

  ensureDir(absoluteOutputDir, options);

  const files = {};

  for (const algorithm of algorithms) {
    const fileName =
      CHECKSUM_FILES[algorithm] || `${algorithm.toUpperCase()}SUMS`;
    const outputFile = path.join(absoluteOutputDir, fileName);

    files[algorithm] = toRelativePath(
      writeChecksumFile(entries, algorithm, outputFile, {
        ...options,
        repoRoot,
      }),
      repoRoot,
    );
  }

  return files;
}

function getGitMetadata(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  function runGit(args, fallback = null) {
    try {
      return childProcess
        .execFileSync("git", args, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
        .trim();
    } catch {
      return fallback;
    }
  }

  return {
    repository:
      process.env.GITHUB_REPOSITORY ||
      runGit(["config", "--get", "remote.origin.url"]),
    ref:
      process.env.GITHUB_REF || runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"]),
    short_sha:
      process.env.GITHUB_SHA?.slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"]),
    run_id: process.env.GITHUB_RUN_ID || null,
    run_number: process.env.GITHUB_RUN_NUMBER || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    actor: process.env.GITHUB_ACTOR || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    job: process.env.GITHUB_JOB || null,
  };
}

function createArtifactManifest(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const files = input.files || [];
  const entries = Array.isArray(input.entries)
    ? input.entries
    : createHashEntries(files, {
        ...input,
        repoRoot,
      });

  const git = getGitMetadata({
    repoRoot,
  });

  return {
    schema_version: 1,
    name: normalizeString(input.name, "aerealith-artifacts"),
    project: normalizeString(input.project, "Aerealith AI"),
    version: normalizeString(
      input.version,
      process.env.RELEASE_VERSION || null,
    ),
    channel: normalizeString(
      input.channel,
      process.env.RELEASE_CHANNEL || null,
    ),
    created_at: new Date().toISOString(),
    generated_by: "aerealith-github-project-scripts",
    git,
    totals: {
      files: entries.length,
      size_bytes: entries.reduce(
        (total, entry) => total + Number(entry.size_bytes || 0),
        0,
      ),
      size_human: formatBytes(
        entries.reduce(
          (total, entry) => total + Number(entry.size_bytes || 0),
          0,
        ),
      ),
    },
    files: entries,
    metadata: isPlainObject(input.metadata) ? input.metadata : {},
  };
}

function writeArtifactManifest(manifest, outputFile, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  writeJson(absoluteOutputFile, manifest, options);

  return absoluteOutputFile;
}

function createArtifactEvidence(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const outputDir = resolvePath(
    input.outputDir || input.output_dir || DEFAULT_RELEASE_OUTPUT_DIR,
    repoRoot,
  );
  const manifestFileName =
    input.manifestFile || input.manifest_file || "artifact-manifest.json";
  const algorithms = normalizeStringList(
    input.algorithms || DEFAULT_HASH_ALGORITHMS,
  );

  ensureDir(outputDir, {
    ...input,
    repoRoot,
  });

  const entries = createHashEntries(input.files || [], {
    ...input,
    repoRoot,
    algorithms,
  });

  const checksumFiles = writeChecksumFiles(entries, outputDir, {
    ...input,
    repoRoot,
    algorithms,
  });

  const manifest = createArtifactManifest({
    ...input,
    repoRoot,
    entries,
    algorithms,
    metadata: {
      ...(input.metadata || {}),
      checksum_files: checksumFiles,
    },
  });

  const manifestPath = writeArtifactManifest(
    manifest,
    path.join(outputDir, manifestFileName),
    {
      ...input,
      repoRoot,
    },
  );

  return {
    output_dir: toRelativePath(outputDir, repoRoot),
    manifest_file: toRelativePath(manifestPath, repoRoot),
    checksum_files: checksumFiles,
    entries,
    manifest,
  };
}

function commandExists(command) {
  try {
    childProcess.execFileSync(command, ["--version"], {
      stdio: "ignore",
    });

    return true;
  } catch {
    return false;
  }
}

function createTarGzArtifact(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const dryRun = getDryRun(input);

  const name = sanitizeArtifactName(input.name || "artifact");
  const outputDir = resolvePath(
    input.outputDir || input.output_dir || DEFAULT_OUTPUT_DIR,
    repoRoot,
  );
  const outputFile = resolvePath(
    input.outputFile ||
      input.output_file ||
      path.join(outputDir, `${name}.tar.gz`),
    repoRoot,
  );

  const sourcePaths = normalizeStringList(
    input.sourcePaths || input.source_paths || input.files,
  );

  if (!sourcePaths.length) {
    throw new Error("createTarGzArtifact requires at least one source path.");
  }

  ensureDir(path.dirname(outputFile), {
    ...input,
    repoRoot,
  });

  if (!commandExists("tar")) {
    throw new Error("`tar` is required to create .tar.gz artifacts.");
  }

  const args = [
    "-czf",
    outputFile,
    ...sourcePaths.map((sourcePath) =>
      toRelativePath(resolvePath(sourcePath, repoRoot), repoRoot),
    ),
  ];

  if (dryRun) {
    logger.dryRun(`Would create tar.gz artifact: tar ${args.join(" ")}`);
    return {
      artifact_file: toRelativePath(outputFile, repoRoot),
      created: false,
      dry_run: true,
    };
  }

  childProcess.execFileSync("tar", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  logger.info(
    `Created artifact bundle ${toRelativePath(outputFile, repoRoot)}.`,
  );

  return {
    artifact_file: toRelativePath(outputFile, repoRoot),
    created: true,
    dry_run: false,
  };
}

function createArtifactPlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const paths = normalizeStringList(
    input.paths || input.files || input.sourcePaths,
  );

  const discoveredFiles = discoverFiles(paths, {
    ...input,
    repoRoot,
    required: input.required !== false,
  });

  return {
    name: sanitizeArtifactName(input.name || "artifact"),
    repo_root: repoRoot,
    paths: paths.map((item) =>
      toRelativePath(resolvePath(item, repoRoot), repoRoot),
    ),
    files: discoveredFiles.map((item) => toRelativePath(item, repoRoot)),
    totals: {
      files: discoveredFiles.length,
      size_bytes: discoveredFiles.reduce(
        (total, filePath) => total + fs.statSync(filePath).size,
        0,
      ),
    },
  };
}

function writeArtifactPlan(plan, outputFile, options = {}) {
  return writeJson(outputFile, plan, options);
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping artifact summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${markdown.trim()}\n\n`);

  return true;
}

function createEvidenceSummary(evidence) {
  const lines = [
    "## Artifact Evidence",
    "",
    `- Manifest: \`${evidence.manifest_file}\``,
    `- Files: \`${evidence.entries.length}\``,
  ];

  for (const [algorithm, filePath] of Object.entries(
    evidence.checksum_files || {},
  )) {
    lines.push(`- ${algorithm.toUpperCase()}: \`${filePath}\``);
  }

  if (evidence.entries.length) {
    lines.push("");
    lines.push("| File | Size | SHA256 |");
    lines.push("|---|---:|---|");

    for (const entry of evidence.entries) {
      lines.push(
        `| \`${entry.path}\` | ${entry.size_human} | \`${entry.hashes?.sha256 || ""}\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendEvidenceSummary(evidence) {
  return appendGitHubStepSummary(createEvidenceSummary(evidence));
}

function requireReleaseArtifacts(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const required = normalizeStringList(
    options.required || [
      "SHA256SUMS",
      "SHA512SUMS",
      "artifact-manifest.json",
      "sbom.spdx.json",
    ],
  );

  const outputDir = resolvePath(
    options.outputDir || options.output_dir || DEFAULT_RELEASE_OUTPUT_DIR,
    repoRoot,
  );

  const missing = required.filter(
    (fileName) => !isFile(path.join(outputDir, fileName)),
  );

  if (missing.length) {
    throw new Error(
      `Missing required release artifacts: ${missing.join(", ")}`,
    );
  }

  return true;
}

function discoverBuildOutputPaths(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const candidates = normalizeStringList(
    options.candidates || [
      "dist",
      "build",
      "out",
      ".next",
      ".open-next",
      "coverage",
      "artifacts",
    ],
  );

  return candidates
    .map((candidate) => resolvePath(candidate, repoRoot))
    .filter((candidate) => pathExists(candidate))
    .map((candidate) => toRelativePath(candidate, repoRoot));
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_RELEASE_OUTPUT_DIR,
  DEFAULT_HASH_ALGORITHMS,
  CHECKSUM_FILES,
  DEFAULT_IGNORE_PATTERNS,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,

  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  removeFile,
  writeFile,
  writeJson,
  readJson,

  stableStringify,
  sortObjectDeep,
  formatBytes,

  sanitizeArtifactName,
  createHumanReadableArtifactName,

  shouldIgnorePath,
  walkFiles,
  discoverFiles,
  assertFilesExist,

  hashFile,
  hashBuffer,
  getFileInfo,
  createHashEntries,

  createChecksumLines,
  writeChecksumFile,
  writeChecksumFiles,

  getGitMetadata,

  createArtifactManifest,
  writeArtifactManifest,
  createArtifactEvidence,

  commandExists,
  createTarGzArtifact,

  createArtifactPlan,
  writeArtifactPlan,

  appendGitHubStepSummary,
  createEvidenceSummary,
  appendEvidenceSummary,

  requireReleaseArtifacts,
  discoverBuildOutputPaths,
};
