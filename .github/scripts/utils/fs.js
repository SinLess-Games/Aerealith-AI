// .github/scripts/utils/fs.js
// =============================================================================
// Aerealith AI File System Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared filesystem helpers for GitHub workflow scripts.
//
// Used by:
//   - config loaders
//   - validators
//   - repo management scripts
//   - release scripts
//   - security scripts
//   - Cloudflare deployment scripts
//   - Docker/GHCR publish scripts
//   - npm publish scripts
//   - artifact/evidence scripts
//
// Notes:
//   - CommonJS only.
//   - Safe for dry-run workflows.
//   - Local writes are allowed in dry-run unless `allowLocalFileWrites` is false.
//   - External mutation protection belongs in workflow/API helpers.
// =============================================================================

const nodeFs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const yaml = require("js-yaml");

const logger = require("./logger");

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_ENCODING = "utf8";

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".github/.cache",
  ".nx",
  ".next",
  ".open-next",
  ".turbo",
  ".wrangler",
  ".cache",
  "coverage",
  "dist",
  "build",
  "out",
  "tmp",
  "temp",
  "node_modules",
]);

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

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".graphql",
  ".html",
  ".js",
  ".json",
  ".json5",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

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

function toPosixPath(filePath) {
  return normalizeString(filePath).split(path.sep).join("/");
}

function normalizePath(filePath) {
  return toPosixPath(path.normalize(filePath));
}

function isSubPath(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
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
        if (nodeFs.existsSync(path.join(current, marker))) {
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

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot)));
}

function pathExists(filePath) {
  return nodeFs.existsSync(filePath);
}

function statPath(filePath, options = {}) {
  if (!pathExists(filePath)) {
    if (options.required === false) return null;
    throw new Error(`Path does not exist: ${filePath}`);
  }

  return nodeFs.statSync(filePath);
}

function lstatPath(filePath, options = {}) {
  if (!pathExists(filePath)) {
    if (options.required === false) return null;
    throw new Error(`Path does not exist: ${filePath}`);
  }

  return nodeFs.lstatSync(filePath);
}

function isFile(filePath) {
  return pathExists(filePath) && nodeFs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return pathExists(filePath) && nodeFs.statSync(filePath).isDirectory();
}

function isSymlink(filePath) {
  return pathExists(filePath) && nodeFs.lstatSync(filePath).isSymbolicLink();
}

function isReadable(filePath) {
  try {
    nodeFs.accessSync(filePath, nodeFs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isWritable(filePath) {
  try {
    nodeFs.accessSync(filePath, nodeFs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (isDirectory(dirPath)) return dirPath;

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  nodeFs.mkdirSync(dirPath, {
    recursive: true,
  });

  logger.debug(`Ensured directory exists: ${dirPath}`);

  return dirPath;
}

function ensureParentDir(filePath, options = {}) {
  return ensureDir(path.dirname(filePath), options);
}

function removePath(filePath, options = {}) {
  const dryRun = getDryRun(options);

  if (!pathExists(filePath)) {
    return {
      removed: false,
      existed: false,
      path: filePath,
      dry_run: dryRun,
    };
  }

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would remove path: ${filePath}`);

    return {
      removed: false,
      existed: true,
      path: filePath,
      dry_run: true,
    };
  }

  nodeFs.rmSync(filePath, {
    recursive: true,
    force: true,
  });

  logger.info(`Removed ${filePath}.`);

  return {
    removed: true,
    existed: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function emptyDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (!isDirectory(dirPath)) {
    ensureDir(dirPath, options);

    return {
      emptied: true,
      path: dirPath,
      dry_run: dryRun,
    };
  }

  const entries = nodeFs.readdirSync(dirPath);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would empty directory: ${dirPath}`);

    return {
      emptied: false,
      path: dirPath,
      dry_run: true,
    };
  }

  for (const entry of entries) {
    nodeFs.rmSync(path.join(dirPath, entry), {
      recursive: true,
      force: true,
    });
  }

  logger.info(`Emptied ${dirPath}.`);

  return {
    emptied: true,
    path: dirPath,
    dry_run: dryRun,
  };
}

function readFile(filePath, options = {}) {
  const encoding =
    options.encoding === null ? null : options.encoding || DEFAULT_ENCODING;

  if (!isFile(filePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(`File not found: ${filePath}`);
  }

  return nodeFs.readFileSync(filePath, encoding);
}

function readTextFile(filePath, options = {}) {
  return readFile(filePath, {
    ...options,
    encoding: options.encoding || DEFAULT_ENCODING,
  });
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

  if (options.atomic) {
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    nodeFs.writeFileSync(tempFile, contents, encoding);
    nodeFs.renameSync(tempFile, filePath);
  } else {
    nodeFs.writeFileSync(filePath, contents, encoding);
  }

  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function appendFile(filePath, contents, options = {}) {
  const dryRun = getDryRun(options);
  const encoding = options.encoding || DEFAULT_ENCODING;

  ensureParentDir(filePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would append file: ${filePath}`);
    logger.dump(`planned append ${path.basename(filePath)}`, contents);

    return {
      written: false,
      appended: false,
      path: filePath,
      dry_run: true,
    };
  }

  nodeFs.appendFileSync(filePath, contents, encoding);

  logger.debug(`Appended ${filePath}.`);

  return {
    written: true,
    appended: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function readJson(filePath, options = {}) {
  const fallback = options.fallback ?? null;

  if (!isFile(filePath)) {
    if (options.required === false) return fallback;
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

function writeJson(filePath, value, options = {}) {
  const space = options.space ?? 2;
  const contents = `${stableStringify(value, space)}\n`;

  return writeFile(filePath, contents, options);
}

function readYaml(filePath, options = {}) {
  const fallback = options.fallback ?? null;

  if (!isFile(filePath)) {
    if (options.required === false) return fallback;
    throw new Error(`YAML file not found: ${filePath}`);
  }

  try {
    return (
      yaml.load(readTextFile(filePath, options), {
        filename: filePath,
        schema: yaml.DEFAULT_SCHEMA,
      }) ?? fallback
    );
  } catch (err) {
    throw new Error(
      `Failed to parse YAML file ${filePath}: ${logger.formatError(err)}`,
    );
  }
}

function writeYaml(filePath, value, options = {}) {
  const contents = yaml.dump(sortObjectDeep(value), {
    lineWidth: options.lineWidth || options.line_width || 120,
    noRefs: true,
    sortKeys: false,
  });

  return writeFile(filePath, contents, options);
}

function readPackageJson(packageJsonPath = "package.json", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  return readJson(resolvePath(packageJsonPath, repoRoot), options);
}

function writePackageJson(
  packageJsonPath = "package.json",
  value,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  return writeJson(resolvePath(packageJsonPath, repoRoot), value, options);
}

function copyFile(sourcePath, destinationPath, options = {}) {
  const dryRun = getDryRun(options);

  if (!isFile(sourcePath)) {
    throw new Error(`Cannot copy missing file: ${sourcePath}`);
  }

  ensureParentDir(destinationPath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would copy file: ${sourcePath} -> ${destinationPath}`);

    return {
      copied: false,
      source: sourcePath,
      destination: destinationPath,
      dry_run: true,
    };
  }

  nodeFs.copyFileSync(sourcePath, destinationPath);

  if (options.preserveMode !== false) {
    nodeFs.chmodSync(destinationPath, nodeFs.statSync(sourcePath).mode);
  }

  logger.debug(`Copied file: ${sourcePath} -> ${destinationPath}`);

  return {
    copied: true,
    source: sourcePath,
    destination: destinationPath,
    dry_run: dryRun,
  };
}

function copyDirectory(sourceDir, destinationDir, options = {}) {
  const dryRun = getDryRun(options);

  if (!isDirectory(sourceDir)) {
    throw new Error(`Cannot copy missing directory: ${sourceDir}`);
  }

  const files = walkDirectory(sourceDir, {
    ...options,
    includeDirectories: false,
  });

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would copy directory: ${sourceDir} -> ${destinationDir}`);

    return {
      copied: false,
      source: sourceDir,
      destination: destinationDir,
      files: files.length,
      dry_run: true,
    };
  }

  for (const file of files) {
    const relative = path.relative(sourceDir, file.absolute_path);
    copyFile(file.absolute_path, path.join(destinationDir, relative), {
      ...options,
      dryRun: false,
    });
  }

  logger.info(`Copied directory: ${sourceDir} -> ${destinationDir}`);

  return {
    copied: true,
    source: sourceDir,
    destination: destinationDir,
    files: files.length,
    dry_run: dryRun,
  };
}

function chmodPath(filePath, mode, options = {}) {
  const dryRun = getDryRun(options);

  if (!pathExists(filePath)) {
    throw new Error(`Cannot chmod missing path: ${filePath}`);
  }

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would chmod ${mode.toString(8)} ${filePath}`);

    return {
      changed: false,
      path: filePath,
      mode,
      dry_run: true,
    };
  }

  nodeFs.chmodSync(filePath, mode);

  return {
    changed: true,
    path: filePath,
    mode,
    dry_run: dryRun,
  };
}

function touchFile(filePath, options = {}) {
  const dryRun = getDryRun(options);
  const now = new Date();

  ensureParentDir(filePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would touch file: ${filePath}`);

    return {
      touched: false,
      path: filePath,
      dry_run: true,
    };
  }

  if (!pathExists(filePath)) {
    nodeFs.closeSync(nodeFs.openSync(filePath, "w"));
  }

  nodeFs.utimesSync(filePath, now, now);

  return {
    touched: true,
    path: filePath,
    dry_run: dryRun,
  };
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

  if (normalizedPattern === normalizedPath) return true;

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function matchesAnyGlob(filePath, patterns = []) {
  return normalizeStringList(patterns).some((pattern) =>
    matchesGlob(filePath, pattern),
  );
}

function shouldIgnorePath(relativePath, options = {}) {
  const normalized = toPosixPath(relativePath);

  const ignorePatterns = normalizeStringList(
    options.ignorePatterns ||
      options.ignore_patterns ||
      DEFAULT_IGNORE_PATTERNS,
  );

  if (matchesAnyGlob(normalized, ignorePatterns)) return true;

  const segments = normalized.split("/").filter(Boolean);
  const ignoreDirs =
    options.ignoreDirs || options.ignore_dirs || DEFAULT_IGNORE_DIRS;

  return segments.some((segment) => ignoreDirs.has(segment));
}

function createFileRecord(absolutePath, repoRoot = findRepoRoot()) {
  const stat = nodeFs.statSync(absolutePath);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  return {
    absolute_path: absolutePath,
    relative_path: relativePath,
    path: relativePath,
    name: path.basename(absolutePath),
    dirname: toRelativePath(path.dirname(absolutePath), repoRoot),
    extension: path.extname(absolutePath),
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    created_at: stat.birthtime.toISOString(),
    is_file: stat.isFile(),
    is_directory: stat.isDirectory(),
  };
}

function walkDirectory(rootPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteRoot = resolvePath(rootPath, repoRoot);

  if (!pathExists(absoluteRoot)) {
    if (options.required === false) return [];
    throw new Error(`Walk root does not exist: ${rootPath}`);
  }

  const includeDirectories = normalizeBoolean(
    options.includeDirectories,
    false,
  );
  const includeFiles = normalizeBoolean(options.includeFiles, true);
  const followSymlinks = normalizeBoolean(options.followSymlinks, false);
  const maxDepth = Number.isFinite(Number(options.maxDepth))
    ? Number(options.maxDepth)
    : Infinity;

  const results = [];

  function visit(currentPath, depth) {
    const stat = followSymlinks
      ? nodeFs.statSync(currentPath)
      : nodeFs.lstatSync(currentPath);
    const relativePath = toRelativePath(currentPath, repoRoot);

    if (relativePath && shouldIgnorePath(relativePath, options)) {
      return;
    }

    if (stat.isDirectory()) {
      if (includeDirectories && currentPath !== absoluteRoot) {
        results.push(createFileRecord(currentPath, repoRoot));
      }

      if (depth >= maxDepth) return;

      const entries = nodeFs.readdirSync(currentPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        visit(path.join(currentPath, entry.name), depth + 1);
      }

      return;
    }

    if (stat.isFile() && includeFiles) {
      results.push(createFileRecord(currentPath, repoRoot));
    }
  }

  visit(absoluteRoot, 0);

  return results.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function discoverFiles(paths, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const inputPaths = normalizeStringList(paths);
  const extensions = normalizeStringList(options.extensions).map((item) =>
    item.startsWith(".") ? item : `.${item}`,
  );
  const includePatterns = normalizeStringList(
    options.includePatterns || options.include_patterns,
  );
  const required = options.required !== false;

  const files = [];

  for (const inputPath of inputPaths) {
    const absolutePath = resolvePath(inputPath, repoRoot);

    if (!pathExists(absolutePath)) {
      if (required) {
        throw new Error(`Discovery path does not exist: ${inputPath}`);
      }

      continue;
    }

    if (isFile(absolutePath)) {
      files.push(createFileRecord(absolutePath, repoRoot));
      continue;
    }

    files.push(
      ...walkDirectory(absolutePath, {
        ...options,
        repoRoot,
        includeDirectories: false,
        includeFiles: true,
      }),
    );
  }

  return unique(files.map((file) => file.absolute_path))
    .map((absolutePath) => createFileRecord(absolutePath, repoRoot))
    .filter((file) => {
      if (extensions.length && !extensions.includes(file.extension))
        return false;
      if (
        includePatterns.length &&
        !matchesAnyGlob(file.relative_path, includePatterns)
      )
        return false;
      return true;
    })
    .sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function findUp(fileNames, startDir = process.cwd(), options = {}) {
  const names = normalizeStringList(fileNames);

  if (!names.length) {
    throw new Error("findUp requires at least one file name.");
  }

  const stopAt = options.stopAt
    ? path.resolve(options.stopAt)
    : path.parse(startDir).root;
  let current = path.resolve(startDir);

  while (current && current.startsWith(stopAt)) {
    for (const name of names) {
      const candidate = path.join(current, name);

      if (pathExists(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);

    if (parent === current) break;

    current = parent;
  }

  return null;
}

function findNearestFile(startPath, fileNames, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteStart = resolvePath(startPath, repoRoot);
  const startDir = isDirectory(absoluteStart)
    ? absoluteStart
    : path.dirname(absoluteStart);

  const found = findUp(fileNames, startDir, {
    stopAt: repoRoot,
  });

  return found ? toRelativePath(found, repoRoot) : null;
}

function findNearestPackageJson(startPath = process.cwd(), options = {}) {
  return findNearestFile(startPath, ["package.json"], options);
}

function fileHash(filePath, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(nodeFs.readFileSync(filePath));
  return hash.digest("hex");
}

function hashString(value, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(String(value));
  return hash.digest("hex");
}

function hashFiles(files, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const algorithms = normalizeStringList(options.algorithms || ["sha256"]);

  return discoverFiles(files, {
    ...options,
    repoRoot,
  }).map((file) => ({
    ...file,
    hashes: Object.fromEntries(
      algorithms.map((algorithm) => [
        algorithm,
        fileHash(file.absolute_path, algorithm),
      ]),
    ),
  }));
}

function getFileSize(filePath) {
  return nodeFs.statSync(filePath).size;
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

function isTextFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_FILE_EXTENSIONS.has(extension)) return true;

  if (!isFile(filePath)) return false;

  const buffer = nodeFs.readFileSync(filePath);
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  return !sample.includes(0);
}

function readLines(filePath, options = {}) {
  const contents = readTextFile(filePath, options);
  return contents.split(/\r?\n/);
}

function writeLines(filePath, lines, options = {}) {
  const contents = `${normalizeStringList(lines).join(os.EOL)}${os.EOL}`;
  return writeFile(filePath, contents, options);
}

function replaceInFile(filePath, replacements = [], options = {}) {
  const dryRun = getDryRun(options);
  const original = readTextFile(filePath, options);
  let updated = original;

  for (const replacement of replacements) {
    if (Array.isArray(replacement)) {
      const [searchValue, replaceValue] = replacement;
      updated = updated.replaceAll(searchValue, replaceValue);
      continue;
    }

    if (isPlainObject(replacement)) {
      const searchValue = replacement.pattern
        ? new RegExp(replacement.pattern, replacement.flags || "g")
        : replacement.search;

      updated = updated.replace(searchValue, replacement.replace || "");
    }
  }

  const changed = updated !== original;

  if (!changed) {
    return {
      changed: false,
      path: filePath,
      dry_run: dryRun,
    };
  }

  writeFile(filePath, updated, options);

  return {
    changed: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function readDirNames(dirPath, options = {}) {
  if (!isDirectory(dirPath)) {
    if (options.required === false) return [];
    throw new Error(`Directory not found: ${dirPath}`);
  }

  return nodeFs
    .readdirSync(dirPath, {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readFileNames(dirPath, options = {}) {
  if (!isDirectory(dirPath)) {
    if (options.required === false) return [];
    throw new Error(`Directory not found: ${dirPath}`);
  }

  return nodeFs
    .readdirSync(dirPath, {
      withFileTypes: true,
    })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );

  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun && options.executeInDryRun !== true) {
    logger.dryRun(
      `Would run command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
    );

    return {
      command,
      args,
      cwd,
      dry_run: true,
      status: 0,
      stdout: "",
      stderr: "",
    };
  }

  logger.debug(
    `Running command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
  );

  const result = childProcess.spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: options.encoding || DEFAULT_ENCODING,
    shell: normalizeBoolean(options.shell, false),
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    options.allowFailure !== true &&
    options.allow_failure !== true
  ) {
    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        result.stdout ? `stdout:\n${result.stdout}` : null,
        result.stderr ? `stderr:\n${result.stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    command,
    args,
    cwd,
    dry_run: false,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function getGitMetadata(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  function git(args, fallback = null) {
    try {
      return (
        runCommand("git", args, {
          repoRoot,
          executeInDryRun: true,
          allowFailure: true,
        }).stdout.trim() || fallback
      );
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
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    tag: git(["describe", "--tags", "--exact-match"], null),
    run_id: process.env.GITHUB_RUN_ID || null,
    run_number: process.env.GITHUB_RUN_NUMBER || null,
    actor: process.env.GITHUB_ACTOR || null,
  };
}

function createDirectoryManifest(rootPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteRoot = resolvePath(rootPath, repoRoot);
  const files = hashFiles([absoluteRoot], {
    ...options,
    repoRoot,
    algorithms: options.algorithms || ["sha256"],
  });

  return {
    schema_version: 1,
    type: "directory-manifest",
    root: toRelativePath(absoluteRoot, repoRoot),
    created_at: new Date().toISOString(),
    git: getGitMetadata({
      repoRoot,
    }),
    totals: {
      files: files.length,
      size_bytes: files.reduce(
        (total, file) => total + Number(file.size_bytes || 0),
        0,
      ),
      size_human: formatBytes(
        files.reduce((total, file) => total + Number(file.size_bytes || 0), 0),
      ),
    },
    files,
  };
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping filesystem summary append.",
    );
    return false;
  }

  nodeFs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  nodeFs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function printTree(rootPath = ".", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteRoot = resolvePath(rootPath, repoRoot);
  const records = walkDirectory(absoluteRoot, {
    ...options,
    repoRoot,
    includeDirectories: true,
    includeFiles: true,
  });

  const lines = [
    toRelativePath(absoluteRoot, repoRoot) || ".",
    ...records.map((record) => {
      const depth = record.relative_path.split("/").length;
      const prefix = "  ".repeat(Math.max(depth - 1, 0));
      const marker = record.is_directory ? "/" : "";
      return `${prefix}- ${record.name}${marker}`;
    }),
  ];

  const output = lines.join("\n");

  console.log(output);

  return output;
}

function runCli() {
  const command = process.argv[2] || "root";
  const target = process.argv[3] || ".";

  if (command === "root") {
    console.log(findRepoRoot(target));
    return;
  }

  if (command === "tree") {
    printTree(target);
    return;
  }

  if (command === "manifest") {
    const manifest = createDirectoryManifest(target);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (command === "hash") {
    const algorithm = process.argv[4] || "sha256";
    console.log(fileHash(resolvePath(target), algorithm));
    return;
  }

  if (command === "exists") {
    console.log(pathExists(resolvePath(target)) ? "true" : "false");
    return;
  }

  throw new Error(`Unknown fs utility command: ${command}`);
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
  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_ENCODING,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_REPO_ROOT_MARKERS,
  TEXT_FILE_EXTENSIONS,

  isPlainObject,
  unique,
  normalizeBoolean,
  normalizeString,
  normalizeStringList,

  getDryRun,
  allowLocalFileWrites,

  sortObjectDeep,
  stableStringify,

  toPosixPath,
  normalizePath,
  isSubPath,
  findRepoRoot,
  resolvePath,
  toRelativePath,

  pathExists,
  statPath,
  lstatPath,
  isFile,
  isDirectory,
  isSymlink,
  isReadable,
  isWritable,

  ensureDir,
  ensureParentDir,
  removePath,
  emptyDir,

  readFile,
  readTextFile,
  writeFile,
  appendFile,

  readJson,
  writeJson,
  readYaml,
  writeYaml,
  readPackageJson,
  writePackageJson,

  copyFile,
  copyDirectory,
  chmodPath,
  touchFile,

  globToRegExp,
  matchesGlob,
  matchesAnyGlob,
  shouldIgnorePath,

  createFileRecord,
  walkDirectory,
  discoverFiles,
  findUp,
  findNearestFile,
  findNearestPackageJson,

  fileHash,
  hashString,
  hashFiles,
  getFileSize,
  formatBytes,

  isTextFile,
  readLines,
  writeLines,
  replaceInFile,

  readDirNames,
  readFileNames,

  runCommand,
  getGitMetadata,
  createDirectoryManifest,

  appendGitHubStepSummary,
  setGitHubOutput,
  printTree,
};
