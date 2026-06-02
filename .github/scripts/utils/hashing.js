// .github/scripts/utils/hashing.js
// =============================================================================
// Aerealith AI Hashing Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared hashing, checksum, integrity, and manifest helpers for GitHub
//   workflow automation scripts.
//
// Used by:
//   - .github/scripts/artifacts/create-checksums.js
//   - .github/scripts/artifacts/create-manifest.js
//   - .github/scripts/artifacts/create-release-evidence.js
//   - .github/scripts/docker/create-image-manifest.js
//   - .github/scripts/npm/discover-publishable-packages.js
//   - .github/scripts/release/create-github-release.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/security/run-policy-gate.js
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in crypto APIs.
//   - Supports SHA256SUMS and SHA512SUMS release evidence.
//   - Safe for dry-run workflows.
//   - This module does not upload artifacts.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const logger = require("./logger");

const DEFAULT_ALGORITHMS = ["sha256", "sha512"];

const DEFAULT_CHECKSUM_FILES = {
  sha1: "SHA1SUMS",
  sha224: "SHA224SUMS",
  sha256: "SHA256SUMS",
  sha384: "SHA384SUMS",
  sha512: "SHA512SUMS",
};

const DEFAULT_MANIFEST_FILE = "artifact-manifest.json";

const DEFAULT_OUTPUT_DIR = "artifacts";
const DEFAULT_RELEASE_OUTPUT_DIR = "artifacts/release";

const DEFAULT_ENCODING = "utf8";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_IGNORE_PATTERNS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.nx/**",
  "**/.next/**",
  "**/.open-next/**",
  "**/.turbo/**",
  "**/.wrangler/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/tmp/**",
  "**/temp/**",
];

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "pnpm-workspace.yaml",
  "nx.json",
  "package.json",
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

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
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

function allowLocalFileWrites(options = {}) {
  return normalizeBoolean(
    options.allowLocalFileWrites ?? options.allow_local_file_writes,
    true,
  );
}

function normalizeAlgorithm(algorithm = "sha256") {
  const normalized = normalizeString(algorithm, "sha256").toLowerCase();

  if (!crypto.getHashes().includes(normalized)) {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }

  return normalized;
}

function normalizeAlgorithms(algorithms = DEFAULT_ALGORITHMS) {
  const normalized = normalizeStringList(algorithms).length
    ? normalizeStringList(algorithms)
    : DEFAULT_ALGORITHMS;

  return unique(normalized.map((algorithm) => normalizeAlgorithm(algorithm)));
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
  options = {},
) {
  const markers = normalizeStringList(
    options.markers || DEFAULT_REPO_ROOT_MARKERS,
  );
  const candidates = unique([
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ]);

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath = ".", repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);

  return path.normalize(path.join(repoRoot, filePath));
}

function toPosixPath(filePath) {
  return normalizeString(filePath).split(path.sep).join("/");
}

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot)));
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

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  logger.debug(`Ensured directory exists: ${dirPath}`);

  return dirPath;
}

function ensureParentDir(filePath, options = {}) {
  return ensureDir(path.dirname(filePath), options);
}

function writeFile(filePath, contents, options = {}) {
  const dryRun = getDryRun(options);
  const encoding = options.encoding || DEFAULT_ENCODING;

  ensureParentDir(filePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would write file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, contents);

    return {
      written: false,
      path: filePath,
      dry_run: true,
    };
  }

  fs.writeFileSync(filePath, contents, encoding);

  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function writeJson(filePath, value, options = {}) {
  return writeFile(filePath, `${stableStringify(value)}\n`, options);
}

function readTextFile(filePath, options = {}) {
  if (!isFile(filePath)) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, options.encoding || DEFAULT_ENCODING);
}

function readJson(filePath, options = {}) {
  if (!isFile(filePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(`JSON file not found: ${filePath}`);
  }

  try {
    return JSON.parse(readTextFile(filePath, options));
  } catch (err) {
    throw new Error(
      `Failed to parse JSON file ${filePath}: ${logger.formatError(err)}`,
    );
  }
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectDeep(value[key])]),
  );
}

function stableStringify(value, space = 2) {
  return JSON.stringify(sortObjectDeep(value), null, space);
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

function globToRegExp(pattern) {
  const normalized = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*") {
      if (next === "*") {
        const afterNext = normalized[index + 2];

        if (afterNext === "/") {
          output += "(?:.*\\/)?";
          index += 2;
        } else {
          output += ".*";
          index += 1;
        }
      } else {
        output += "[^/]*";
      }

      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      output += `\\${char}`;
      continue;
    }

    output += char;
  }

  output += "$";

  return new RegExp(output);
}

function matchesGlob(filePath, pattern) {
  const normalizedPath = toPosixPath(filePath);
  const normalizedPattern = toPosixPath(pattern);

  if (normalizedPath === normalizedPattern) return true;

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function matchesAnyGlob(filePath, patterns = []) {
  return normalizeStringList(patterns).some((pattern) =>
    matchesGlob(filePath, pattern),
  );
}

function shouldIgnorePath(relativePath, options = {}) {
  const ignorePatterns = normalizeStringList(
    options.ignorePatterns ||
      options.ignore_patterns ||
      DEFAULT_IGNORE_PATTERNS,
  );

  return matchesAnyGlob(toPosixPath(relativePath), ignorePatterns);
}

function walkFiles(rootPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteRoot = resolvePath(rootPath, repoRoot);

  if (!pathExists(absoluteRoot)) {
    if (options.required === false) return [];
    throw new Error(`Hash root does not exist: ${rootPath}`);
  }

  const files = [];

  function visit(currentPath) {
    const stat = fs.statSync(currentPath);
    const relativePath = toRelativePath(currentPath, repoRoot);

    if (relativePath && shouldIgnorePath(relativePath, options)) {
      return;
    }

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(currentPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        visit(path.join(currentPath, entry.name));
      }

      return;
    }

    if (stat.isFile()) {
      files.push(currentPath);
    }
  }

  visit(absoluteRoot);

  return files.sort();
}

function discoverFiles(paths, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const inputPaths = normalizeStringList(paths);
  const includePatterns = normalizeStringList(
    options.includePatterns || options.include_patterns,
  );
  const required = options.required !== false;

  const files = [];

  for (const inputPath of inputPaths) {
    const absolutePath = resolvePath(inputPath, repoRoot);

    if (!pathExists(absolutePath)) {
      if (required) {
        throw new Error(`Hash discovery path does not exist: ${inputPath}`);
      }

      continue;
    }

    if (isFile(absolutePath)) {
      files.push(absolutePath);
      continue;
    }

    files.push(
      ...walkFiles(absolutePath, {
        ...options,
        repoRoot,
      }),
    );
  }

  return unique(files)
    .map((filePath) => path.resolve(filePath))
    .filter((filePath) => {
      const relativePath = toRelativePath(filePath, repoRoot);

      if (
        includePatterns.length &&
        !matchesAnyGlob(relativePath, includePatterns)
      ) {
        return false;
      }

      return !shouldIgnorePath(relativePath, options);
    })
    .sort();
}

function createHash(algorithm = "sha256") {
  return crypto.createHash(normalizeAlgorithm(algorithm));
}

function hashBuffer(buffer, algorithm = "sha256", encoding = "hex") {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function hashString(value, algorithm = "sha256", encoding = "hex") {
  return hashBuffer(
    Buffer.from(String(value), DEFAULT_ENCODING),
    algorithm,
    encoding,
  );
}

function hashJson(value, algorithm = "sha256", encoding = "hex") {
  return hashString(stableStringify(value), algorithm, encoding);
}

function hashFile(filePath, algorithm = "sha256", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    throw new Error(`Cannot hash missing file: ${filePath}`);
  }

  const hash = createHash(algorithm);
  const buffer = fs.readFileSync(absolutePath);

  hash.update(buffer);

  return hash.digest(options.encoding || "hex");
}

function hashFileStream(filePath, algorithm = "sha256", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    return Promise.reject(new Error(`Cannot hash missing file: ${filePath}`));
  }

  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = fs.createReadStream(absolutePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest(options.encoding || "hex")));
  });
}

function hashMany(files, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const algorithms = normalizeAlgorithms(
    options.algorithms || DEFAULT_ALGORITHMS,
  );

  return discoverFiles(files, {
    ...options,
    repoRoot,
  }).map((filePath) => {
    const stat = fs.statSync(filePath);
    const relativePath = toRelativePath(filePath, repoRoot);

    return {
      path: relativePath,
      name: path.basename(filePath),
      directory: toRelativePath(path.dirname(filePath), repoRoot),
      extension: path.extname(filePath),
      size_bytes: stat.size,
      size_human: formatBytes(stat.size),
      modified_at: stat.mtime.toISOString(),
      hashes: Object.fromEntries(
        algorithms.map((algorithm) => [
          algorithm,
          hashFile(filePath, algorithm, { repoRoot }),
        ]),
      ),
    };
  });
}

function createCombinedHash(entries, algorithm = "sha256") {
  const hash = createHash(algorithm);

  const normalizedEntries = [...entries].sort((a, b) => {
    const left = a.path || a.name || "";
    const right = b.path || b.name || "";
    return left.localeCompare(right);
  });

  for (const entry of normalizedEntries) {
    hash.update(String(entry.path || entry.name || ""));
    hash.update("\0");

    if (entry.hashes?.[algorithm]) {
      hash.update(entry.hashes[algorithm]);
    } else if (entry.hash) {
      hash.update(entry.hash);
    } else {
      hash.update(stableStringify(entry));
    }

    hash.update("\0");
  }

  return hash.digest("hex");
}

function createChecksumLine(entry, algorithm = "sha256") {
  const digest = entry.hashes?.[algorithm] || entry.hash;

  if (!digest) {
    throw new Error(
      `Entry does not contain ${algorithm} hash for ${entry.path || entry.name}`,
    );
  }

  return `${digest}  ${entry.path}`;
}

function createChecksumLines(entries, algorithm = "sha256") {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);

  return [...entries]
    .sort((a, b) => String(a.path).localeCompare(String(b.path)))
    .map((entry) => createChecksumLine(entry, normalizedAlgorithm))
    .join("\n");
}

function getChecksumFileName(algorithm = "sha256") {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  return (
    DEFAULT_CHECKSUM_FILES[normalizedAlgorithm] ||
    `${normalizedAlgorithm.toUpperCase()}SUMS`
  );
}

function writeChecksumFile(
  entries,
  algorithm = "sha256",
  outputFile = null,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const outputPath =
    outputFile ||
    path.join(
      resolvePath(
        options.outputDir || options.output_dir || DEFAULT_RELEASE_OUTPUT_DIR,
        repoRoot,
      ),
      getChecksumFileName(algorithm),
    );

  const contents = `${createChecksumLines(entries, algorithm)}\n`;

  writeFile(resolvePath(outputPath, repoRoot), contents, {
    ...options,
    repoRoot,
  });

  return toRelativePath(resolvePath(outputPath, repoRoot), repoRoot);
}

function writeChecksumFiles(entries, options = {}) {
  const algorithms = normalizeAlgorithms(
    options.algorithms || DEFAULT_ALGORITHMS,
  );
  const repoRoot = options.repoRoot || findRepoRoot();
  const outputDir = resolvePath(
    options.outputDir || options.output_dir || DEFAULT_RELEASE_OUTPUT_DIR,
    repoRoot,
  );

  ensureDir(outputDir, {
    ...options,
    repoRoot,
  });

  return Object.fromEntries(
    algorithms.map((algorithm) => [
      algorithm,
      writeChecksumFile(
        entries,
        algorithm,
        path.join(outputDir, getChecksumFileName(algorithm)),
        {
          ...options,
          repoRoot,
        },
      ),
    ]),
  );
}

function parseChecksumLine(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) return null;

  const gnuMatch = /^([A-Fa-f0-9]+)\s+\*?(.+)$/.exec(trimmed);

  if (gnuMatch) {
    return {
      hash: gnuMatch[1].toLowerCase(),
      path: gnuMatch[2].trim(),
      format: "gnu",
    };
  }

  const bsdMatch = /^([A-Za-z0-9-]+)\s+\((.+)\)\s+=\s+([A-Fa-f0-9]+)$/.exec(
    trimmed,
  );

  if (bsdMatch) {
    return {
      algorithm: bsdMatch[1].toLowerCase(),
      path: bsdMatch[2].trim(),
      hash: bsdMatch[3].toLowerCase(),
      format: "bsd",
    };
  }

  throw new Error(`Invalid checksum line: ${line}`);
}

function parseChecksumFile(checksumFile, options = {}) {
  const contents = readTextFile(checksumFile, options);

  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseChecksumLine(line));
}

function inferAlgorithmFromChecksumFile(checksumFile, fallback = "sha256") {
  const fileName = path.basename(checksumFile).toUpperCase();

  for (const [algorithm, name] of Object.entries(DEFAULT_CHECKSUM_FILES)) {
    if (fileName === name.toUpperCase()) {
      return algorithm;
    }
  }

  return normalizeAlgorithm(fallback);
}

function verifyChecksumEntry(entry, algorithm = "sha256", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(entry.path, repoRoot);

  if (!isFile(absolutePath)) {
    return {
      valid: false,
      path: entry.path,
      expected: entry.hash,
      actual: null,
      reason: "file-missing",
    };
  }

  const actual = hashFile(absolutePath, algorithm, {
    repoRoot,
  }).toLowerCase();

  const expected = String(entry.hash).toLowerCase();

  return {
    valid: actual === expected,
    path: entry.path,
    expected,
    actual,
    reason: actual === expected ? null : "hash-mismatch",
  };
}

function verifyChecksumFile(checksumFile, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const algorithm = normalizeAlgorithm(
    options.algorithm || inferAlgorithmFromChecksumFile(checksumFile, "sha256"),
  );

  const entries = parseChecksumFile(resolvePath(checksumFile, repoRoot), {
    ...options,
    repoRoot,
  });

  const results = entries.map((entry) =>
    verifyChecksumEntry(entry, entry.algorithm || algorithm, {
      ...options,
      repoRoot,
    }),
  );

  return {
    valid: results.every((result) => result.valid),
    checksum_file: toRelativePath(
      resolvePath(checksumFile, repoRoot),
      repoRoot,
    ),
    algorithm,
    totals: {
      entries: entries.length,
      valid: results.filter((result) => result.valid).length,
      invalid: results.filter((result) => !result.valid).length,
    },
    results,
  };
}

function assertChecksumFileValid(checksumFile, options = {}) {
  const result = verifyChecksumFile(checksumFile, options);

  if (!result.valid) {
    const invalid = result.results
      .filter((entry) => !entry.valid)
      .map((entry) => `- ${entry.path}: ${entry.reason}`)
      .join("\n");

    throw new Error(
      `Checksum verification failed for ${result.checksum_file}.\n${invalid}`,
    );
  }

  return true;
}

function getGitMetadata(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  function git(args, fallback = null) {
    try {
      return require("node:child_process")
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
      git(["config", "--get", "remote.origin.url"]),
    ref: process.env.GITHUB_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]),
    sha: process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]),
    short_sha:
      process.env.GITHUB_SHA?.slice(0, 12) ||
      git(["rev-parse", "--short=12", "HEAD"]),
    run_id: process.env.GITHUB_RUN_ID || null,
    run_number: process.env.GITHUB_RUN_NUMBER || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    actor: process.env.GITHUB_ACTOR || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    job: process.env.GITHUB_JOB || null,
  };
}

function createHashManifest(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const algorithms = normalizeAlgorithms(
    input.algorithms || DEFAULT_ALGORITHMS,
  );
  const entries = Array.isArray(input.entries)
    ? input.entries
    : hashMany(input.files || input.paths || [], {
        ...input,
        repoRoot,
        algorithms,
      });

  const totalSize = entries.reduce(
    (total, entry) => total + Number(entry.size_bytes || 0),
    0,
  );

  return {
    schema_version: 1,
    type: "hash-manifest",
    name: normalizeString(input.name, "aerealith-hash-manifest"),
    project: normalizeString(input.project, "Aerealith AI"),
    version: normalizeString(input.version, process.env.RELEASE_VERSION || ""),
    channel: normalizeString(input.channel, process.env.RELEASE_CHANNEL || ""),
    created_at: new Date().toISOString(),
    generated_by: "aerealith-github-project-scripts",
    algorithms,
    git: getGitMetadata({
      repoRoot,
    }),
    totals: {
      files: entries.length,
      size_bytes: totalSize,
      size_human: formatBytes(totalSize),
    },
    combined_hashes: Object.fromEntries(
      algorithms.map((algorithm) => [
        algorithm,
        createCombinedHash(entries, algorithm),
      ]),
    ),
    files: entries,
    metadata: isPlainObject(input.metadata)
      ? sortObjectDeep(input.metadata)
      : {},
  };
}

function writeHashManifest(
  manifest,
  outputFile = DEFAULT_MANIFEST_FILE,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  writeJson(absoluteOutputFile, manifest, {
    ...options,
    repoRoot,
  });

  return toRelativePath(absoluteOutputFile, repoRoot);
}

function createReleaseHashEvidence(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const outputDir = resolvePath(
    input.outputDir || input.output_dir || DEFAULT_RELEASE_OUTPUT_DIR,
    repoRoot,
  );
  const manifestFile =
    input.manifestFile || input.manifest_file || DEFAULT_MANIFEST_FILE;
  const algorithms = normalizeAlgorithms(
    input.algorithms || DEFAULT_ALGORITHMS,
  );

  ensureDir(outputDir, {
    ...input,
    repoRoot,
  });

  const entries = hashMany(input.files || input.paths || [], {
    ...input,
    repoRoot,
    algorithms,
  });

  const checksum_files = writeChecksumFiles(entries, {
    ...input,
    repoRoot,
    outputDir,
    algorithms,
  });

  const manifest = createHashManifest({
    ...input,
    repoRoot,
    entries,
    algorithms,
    metadata: {
      ...(input.metadata || {}),
      checksum_files,
    },
  });

  const manifest_file = writeHashManifest(
    manifest,
    path.join(outputDir, manifestFile),
    {
      ...input,
      repoRoot,
    },
  );

  return {
    output_dir: toRelativePath(outputDir, repoRoot),
    manifest_file,
    checksum_files,
    entries,
    manifest,
  };
}

function createIntegritySummary(evidenceOrManifest) {
  const source = evidenceOrManifest?.manifest || evidenceOrManifest || {};
  const files = source.files || evidenceOrManifest?.entries || [];
  const checksumFiles =
    evidenceOrManifest?.checksum_files || source.metadata?.checksum_files || {};

  const lines = [
    "## Integrity Evidence",
    "",
    `- Files: \`${files.length}\``,
    `- Algorithms: \`${normalizeStringList(source.algorithms || DEFAULT_ALGORITHMS).join(", ")}\``,
  ];

  if (source.totals?.size_human) {
    lines.push(`- Total size: \`${source.totals.size_human}\``);
  }

  if (source.combined_hashes) {
    lines.push("");
    lines.push("### Combined Hashes");
    lines.push("");

    for (const [algorithm, hash] of Object.entries(source.combined_hashes)) {
      lines.push(`- ${algorithm.toUpperCase()}: \`${hash}\``);
    }
  }

  if (Object.keys(checksumFiles).length) {
    lines.push("");
    lines.push("### Checksum Files");
    lines.push("");

    for (const [algorithm, filePath] of Object.entries(checksumFiles)) {
      lines.push(`- ${algorithm.toUpperCase()}: \`${filePath}\``);
    }
  }

  if (files.length) {
    lines.push("");
    lines.push("### Files");
    lines.push("");
    lines.push("| File | Size | SHA256 |");
    lines.push("|---|---:|---|");

    for (const entry of files) {
      lines.push(
        `| \`${entry.path}\` | ${entry.size_human || ""} | \`${entry.hashes?.sha256 || ""}\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping hashing summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function appendIntegritySummary(evidenceOrManifest) {
  return appendGitHubStepSummary(createIntegritySummary(evidenceOrManifest));
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function printHashEntries(entries) {
  for (const entry of entries) {
    const hash = entry.hashes?.sha256 || entry.hashes?.sha512 || "";
    logger.info(`${entry.path} ${hash}`);
  }
}

function runCli() {
  const command = process.argv[2] || "hash";
  const target = process.argv[3] || ".";
  const algorithm = process.argv[4] || "sha256";

  const repoRoot = findRepoRoot();

  if (command === "hash") {
    const absoluteTarget = resolvePath(target, repoRoot);

    if (isFile(absoluteTarget)) {
      console.log(hashFile(absoluteTarget, algorithm, { repoRoot }));
      return;
    }

    const entries = hashMany([absoluteTarget], {
      repoRoot,
      algorithms: [algorithm],
    });

    printHashEntries(entries);
    return;
  }

  if (command === "json") {
    const value = readJson(resolvePath(target, repoRoot));
    console.log(hashJson(value, algorithm));
    return;
  }

  if (command === "checksums") {
    const outputDir = process.argv[4] || DEFAULT_RELEASE_OUTPUT_DIR;

    const entries = hashMany([target], {
      repoRoot,
      algorithms: DEFAULT_ALGORITHMS,
    });

    const checksumFiles = writeChecksumFiles(entries, {
      repoRoot,
      outputDir,
      algorithms: DEFAULT_ALGORITHMS,
    });

    console.log(JSON.stringify(checksumFiles, null, 2));
    return;
  }

  if (command === "manifest") {
    const outputFile =
      process.argv[4] ||
      path.join(DEFAULT_RELEASE_OUTPUT_DIR, DEFAULT_MANIFEST_FILE);

    const manifest = createHashManifest({
      repoRoot,
      files: [target],
      algorithms: DEFAULT_ALGORITHMS,
    });

    writeHashManifest(manifest, outputFile, {
      repoRoot,
    });

    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (command === "evidence") {
    const outputDir = process.argv[4] || DEFAULT_RELEASE_OUTPUT_DIR;

    const evidence = createReleaseHashEvidence({
      repoRoot,
      files: [target],
      outputDir,
      algorithms: DEFAULT_ALGORITHMS,
    });

    appendIntegritySummary(evidence);

    console.log(JSON.stringify(evidence, null, 2));
    return;
  }

  if (command === "verify") {
    const result = verifyChecksumFile(target, {
      repoRoot,
      algorithm,
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.valid) {
      process.exitCode = 1;
    }

    return;
  }

  throw new Error(`Unknown hashing utility command: ${command}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_ALGORITHMS,
  DEFAULT_CHECKSUM_FILES,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_RELEASE_OUTPUT_DIR,
  DEFAULT_ENCODING,
  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_REPO_ROOT_MARKERS,

  isPlainObject,
  unique,

  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  normalizeAlgorithm,
  normalizeAlgorithms,

  getDryRun,
  allowLocalFileWrites,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,

  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  ensureParentDir,
  writeFile,
  writeJson,
  readTextFile,
  readJson,

  sortObjectDeep,
  stableStringify,
  formatBytes,

  globToRegExp,
  matchesGlob,
  matchesAnyGlob,
  shouldIgnorePath,
  walkFiles,
  discoverFiles,

  createHash,
  hashBuffer,
  hashString,
  hashJson,
  hashFile,
  hashFileStream,
  hashMany,

  createCombinedHash,

  createChecksumLine,
  createChecksumLines,
  getChecksumFileName,
  writeChecksumFile,
  writeChecksumFiles,

  parseChecksumLine,
  parseChecksumFile,
  inferAlgorithmFromChecksumFile,
  verifyChecksumEntry,
  verifyChecksumFile,
  assertChecksumFileValid,

  getGitMetadata,

  createHashManifest,
  writeHashManifest,
  createReleaseHashEvidence,

  createIntegritySummary,
  appendGitHubStepSummary,
  appendIntegritySummary,
  setGitHubOutput,
  printHashEntries,
};
