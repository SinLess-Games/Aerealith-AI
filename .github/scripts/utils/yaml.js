// .github/scripts/utils/yaml.js
// =============================================================================
// Aerealith AI YAML Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared YAML parsing, loading, writing, normalization, validation, duplicate
//   key detection, and object-path helpers for GitHub workflow automation scripts.
//
// Used by:
//   - config loaders
//   - validators
//   - repo management scripts
//   - label / milestone / labeler sync scripts
//   - release rules scripts
//   - security rules scripts
//   - Cloudflare rules scripts
//   - dependency rules scripts
//
// Notes:
//   - CommonJS only.
//   - Requires `js-yaml`.
//   - Safe for dry-run workflows.
//   - Local writes are allowed in dry-run unless `allowLocalFileWrites` is false.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");

const yaml = require("js-yaml");

const logger = require("./logger");

const DEFAULT_ENCODING = "utf8";
const DEFAULT_LINE_WIDTH = 120;
const DEFAULT_INDENT = 2;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "pnpm-workspace.yaml",
  "nx.json",
  "package.json",
];

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object";
}

function unique(values) {
  return [...new Set(values)];
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

function cloneYamlValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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

function readTextFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(
      `File not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  return fs.readFileSync(absolutePath, options.encoding || DEFAULT_ENCODING);
}

function writeTextFile(filePath, contents, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);
  const dryRun = getDryRun(options);

  ensureParentDir(absolutePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(
      `Would write file: ${toRelativePath(absolutePath, repoRoot)}`,
    );
    logger.dump(`planned ${path.basename(absolutePath)}`, contents);

    return {
      written: false,
      path: toRelativePath(absolutePath, repoRoot),
      dry_run: true,
    };
  }

  fs.writeFileSync(
    absolutePath,
    contents,
    options.encoding || DEFAULT_ENCODING,
  );

  logger.info(`Wrote ${toRelativePath(absolutePath, repoRoot)}.`);

  return {
    written: true,
    path: toRelativePath(absolutePath, repoRoot),
    dry_run: dryRun,
  };
}

function stripBom(input) {
  const text = String(input ?? "");

  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }

  return text;
}

function normalizeYamlInput(input) {
  return stripBom(String(input ?? ""));
}

function createYamlLoadOptions(options = {}) {
  return {
    filename: options.filename || options.filePath || options.file_path,
    schema: options.schema || yaml.DEFAULT_SCHEMA,
    json: options.json === true,
    onWarning:
      options.onWarning ||
      ((warning) => logger.warn(logger.formatError(warning))),
  };
}

function createYamlDumpOptions(options = {}) {
  return {
    schema: options.schema || yaml.DEFAULT_SCHEMA,
    indent: normalizeInteger(options.indent, DEFAULT_INDENT),
    lineWidth: normalizeInteger(
      options.lineWidth || options.line_width,
      DEFAULT_LINE_WIDTH,
    ),
    noRefs: options.noRefs !== false && options.no_refs !== false,
    sortKeys: options.sortKeys === true || options.sort_keys === true,
    quotingType: options.quotingType || options.quoting_type || '"',
    forceQuotes: Boolean(options.forceQuotes || options.force_quotes),
    skipInvalid: Boolean(options.skipInvalid || options.skip_invalid),
  };
}

function parseYaml(input, options = {}) {
  const source = normalizeYamlInput(input);

  if (!source.trim()) {
    if (options.required === false) return options.fallback ?? null;
    return options.fallback ?? null;
  }

  try {
    return (
      yaml.load(source, createYamlLoadOptions(options)) ??
      options.fallback ??
      null
    );
  } catch (err) {
    const location =
      options.filePath || options.file_path || options.filename || "YAML input";
    throw new Error(`Failed to parse ${location}: ${logger.formatError(err)}`);
  }
}

function parseYamlDocuments(input, options = {}) {
  const source = normalizeYamlInput(input);
  const documents = [];

  if (!source.trim()) {
    return documents;
  }

  try {
    yaml.loadAll(
      source,
      (document) => {
        documents.push(document ?? null);
      },
      createYamlLoadOptions(options),
    );

    return documents;
  } catch (err) {
    const location =
      options.filePath || options.file_path || options.filename || "YAML input";
    throw new Error(
      `Failed to parse YAML documents from ${location}: ${logger.formatError(err)}`,
    );
  }
}

function tryParseYaml(input, fallback = null, options = {}) {
  try {
    return parseYaml(input, {
      ...options,
      required: false,
      fallback,
    });
  } catch {
    return fallback;
  }
}

function stringifyYaml(value, options = {}) {
  const normalized =
    options.sortKeys || options.sort_keys ? sortObjectDeep(value) : value;

  const rendered = yaml.dump(normalized, createYamlDumpOptions(options));

  return options.trailingNewline === false || options.trailing_newline === false
    ? rendered.replace(/\n$/, "")
    : rendered;
}

function readYaml(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `YAML file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  return parseYaml(
    fs.readFileSync(absolutePath, options.encoding || DEFAULT_ENCODING),
    {
      ...options,
      filePath: toRelativePath(absolutePath, repoRoot),
    },
  );
}

function readYamlDocuments(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return [];
    throw new Error(
      `YAML file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  return parseYamlDocuments(
    fs.readFileSync(absolutePath, options.encoding || DEFAULT_ENCODING),
    {
      ...options,
      filePath: toRelativePath(absolutePath, repoRoot),
    },
  );
}

function writeYaml(filePath, value, options = {}) {
  return writeTextFile(filePath, stringifyYaml(value, options), options);
}

function writeYamlDocuments(filePath, documents = [], options = {}) {
  const rendered = normalizeStringList(documents).length
    ? documents
        .map((document) => stringifyYaml(document, options).trim())
        .join("\n---\n")
    : normalizeStringList(documents).join("\n---\n");

  return writeTextFile(
    filePath,
    options.trailingNewline === false || options.trailing_newline === false
      ? rendered
      : `${rendered.trim()}\n`,
    options,
  );
}

function isYamlFile(filePath) {
  return YAML_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function readYamlAuto(filePath, options = {}) {
  if (!isYamlFile(filePath)) {
    throw new Error(`Expected a YAML file extension for ${filePath}.`);
  }

  return readYaml(filePath, options);
}

function deepMerge(...values) {
  const mergeOptions =
    isPlainObject(values[values.length - 1]) &&
    values[values.length - 1].__mergeOptions === true
      ? values.pop()
      : {};

  const arrayMode =
    mergeOptions.arrayMode || mergeOptions.array_mode || "replace";

  function mergeTwo(left, right) {
    if (right === undefined) return cloneYamlValue(left);
    if (left === undefined) return cloneYamlValue(right);

    if (Array.isArray(left) && Array.isArray(right)) {
      if (arrayMode === "concat") {
        return [...cloneYamlValue(left), ...cloneYamlValue(right)];
      }

      if (arrayMode === "unique") {
        return unique([...cloneYamlValue(left), ...cloneYamlValue(right)]);
      }

      return cloneYamlValue(right);
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const output = cloneYamlValue(left);

      for (const [key, value] of Object.entries(right)) {
        output[key] = mergeTwo(output[key], value);
      }

      return output;
    }

    return cloneYamlValue(right);
  }

  return values.reduce((result, value) => mergeTwo(result, value), undefined);
}

function mergeOptions(options = {}) {
  return {
    __mergeOptions: true,
    ...options,
  };
}

function deepDefaults(value, defaults) {
  if (value === undefined) return cloneYamlValue(defaults);
  if (defaults === undefined) return cloneYamlValue(value);

  if (Array.isArray(value)) return cloneYamlValue(value);

  if (isPlainObject(value) && isPlainObject(defaults)) {
    const output = cloneYamlValue(value);

    for (const [key, defaultValue] of Object.entries(defaults)) {
      output[key] = deepDefaults(output[key], defaultValue);
    }

    return output;
  }

  return cloneYamlValue(value);
}

function parseObjectPath(objectPath) {
  if (Array.isArray(objectPath)) {
    return objectPath.map((part) => String(part)).filter(Boolean);
  }

  const source = normalizeString(objectPath);

  if (!source) return [];

  const parts = [];
  let current = "";
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === ".") {
      if (current) parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) parts.push(current);

  return parts;
}

function getPath(object, objectPath, fallback = undefined) {
  const parts = parseObjectPath(objectPath);
  let current = object;

  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }

  return current === undefined ? fallback : current;
}

function hasPath(object, objectPath) {
  const sentinel = Symbol("missing");
  return getPath(object, objectPath, sentinel) !== sentinel;
}

function setPath(object, objectPath, value) {
  const parts = parseObjectPath(objectPath);

  if (!parts.length) {
    throw new Error("setPath requires a non-empty object path.");
  }

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!isObjectLike(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts[parts.length - 1]] = value;

  return object;
}

function deletePath(object, objectPath) {
  const parts = parseObjectPath(objectPath);

  if (!parts.length) return false;

  let current = object;

  for (const part of parts.slice(0, -1)) {
    if (!isObjectLike(current[part])) return false;
    current = current[part];
  }

  const finalKey = parts[parts.length - 1];

  if (!(finalKey in current)) return false;

  delete current[finalKey];

  return true;
}

function pickPaths(object, paths = []) {
  const output = {};

  for (const objectPath of normalizeStringList(paths)) {
    const value = getPath(object, objectPath);

    if (value !== undefined) {
      setPath(output, objectPath, cloneYamlValue(value));
    }
  }

  return output;
}

function omitPaths(object, paths = []) {
  const output = cloneYamlValue(object);

  for (const objectPath of normalizeStringList(paths)) {
    deletePath(output, objectPath);
  }

  return output;
}

function flattenObject(object, options = {}) {
  const separator = options.separator || ".";
  const output = {};

  function visit(value, prefix) {
    if (!isPlainObject(value)) {
      output[prefix] = value;
      return;
    }

    const entries = Object.entries(value);

    if (!entries.length && prefix) {
      output[prefix] = {};
      return;
    }

    for (const [key, child] of entries) {
      const nextPrefix = prefix ? `${prefix}${separator}${key}` : key;
      visit(child, nextPrefix);
    }
  }

  visit(object, "");

  return output;
}

function unflattenObject(object, options = {}) {
  const separator = options.separator || ".";
  const output = {};

  for (const [key, value] of Object.entries(object || {})) {
    setPath(output, String(key).split(separator), value);
  }

  return output;
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefined(item))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeUndefined(item)])
        .filter(([, item]) => item !== undefined),
    );
  }

  return value === undefined ? undefined : value;
}

function removeNullish(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeNullish(item))
      .filter((item) => item !== null && item !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeNullish(item)])
        .filter(([, item]) => item !== null && item !== undefined),
    );
  }

  return value;
}

function removeEmpty(value, options = {}) {
  const removeEmptyArrays =
    options.removeEmptyArrays !== false &&
    options.remove_empty_arrays !== false;
  const removeEmptyObjects =
    options.removeEmptyObjects !== false &&
    options.remove_empty_objects !== false;
  const removeEmptyStrings =
    options.removeEmptyStrings !== false &&
    options.remove_empty_strings !== false;

  if (Array.isArray(value)) {
    return value
      .map((item) => removeEmpty(item, options))
      .filter((item) => {
        if (item === undefined || item === null) return false;
        if (removeEmptyStrings && item === "") return false;
        if (removeEmptyArrays && Array.isArray(item) && item.length === 0)
          return false;
        if (
          removeEmptyObjects &&
          isPlainObject(item) &&
          Object.keys(item).length === 0
        )
          return false;
        return true;
      });
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeEmpty(item, options)])
        .filter(([, item]) => {
          if (item === undefined || item === null) return false;
          if (removeEmptyStrings && item === "") return false;
          if (removeEmptyArrays && Array.isArray(item) && item.length === 0)
            return false;
          if (
            removeEmptyObjects &&
            isPlainObject(item) &&
            Object.keys(item).length === 0
          )
            return false;
          return true;
        }),
    );
  }

  return value;
}

function normalizeYamlValue(value, options = {}) {
  let output = cloneYamlValue(value);

  if (options.defaults) {
    output = deepDefaults(output, options.defaults);
  }

  if (options.omitPaths || options.omit_paths) {
    output = omitPaths(output, options.omitPaths || options.omit_paths);
  }

  if (options.pickPaths || options.pick_paths) {
    output = pickPaths(output, options.pickPaths || options.pick_paths);
  }

  if (options.removeUndefined || options.remove_undefined) {
    output = removeUndefined(output);
  }

  if (options.removeNullish || options.remove_nullish) {
    output = removeNullish(output);
  }

  if (options.removeEmpty || options.remove_empty) {
    output = removeEmpty(output, options);
  }

  if (options.sortKeys || options.sort_keys) {
    output = sortObjectDeep(output);
  }

  return output;
}

function diffYaml(left, right, options = {}) {
  const changes = [];

  function stable(value) {
    return JSON.stringify(sortObjectDeep(value));
  }

  function visit(leftValue, rightValue, currentPath) {
    if (stable(leftValue) === stable(rightValue)) return;

    if (isPlainObject(leftValue) && isPlainObject(rightValue)) {
      const keys = unique([
        ...Object.keys(leftValue),
        ...Object.keys(rightValue),
      ]).sort();

      for (const key of keys) {
        visit(
          leftValue[key],
          rightValue[key],
          currentPath ? `${currentPath}.${key}` : key,
        );
      }

      return;
    }

    changes.push({
      path: currentPath || "$",
      before: cloneYamlValue(leftValue),
      after: cloneYamlValue(rightValue),
      type:
        leftValue === undefined
          ? "added"
          : rightValue === undefined
            ? "removed"
            : "changed",
    });
  }

  visit(left, right, "");

  if (options.type) {
    return changes.filter((change) => change.type === options.type);
  }

  return changes;
}

function stripYamlLineComment(line) {
  let output = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inDoubleQuote) {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      output += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      output += char;
      continue;
    }

    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      const previous = line[index - 1];

      if (index === 0 || /\s/.test(previous)) {
        break;
      }
    }

    output += char;
  }

  return output;
}

function extractYamlMappingKey(line) {
  const cleaned = stripYamlLineComment(line);

  if (!cleaned.trim()) return null;
  if (/^\s*---\s*$/.test(cleaned)) return null;
  if (/^\s*\.\.\.\s*$/.test(cleaned)) return null;

  const match =
    /^(\s*)(?:-\s*)?((?:"[^"]+")|(?:'[^']+')|(?:[^:[\]{},#][^:#]*?))\s*:(?:\s|$)/.exec(
      cleaned,
    );

  if (!match) return null;

  const indent = match[1].length;
  let key = match[2].trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  if (!key) return null;

  return {
    indent,
    key,
  };
}

function findDuplicateMappingKeys(input, options = {}) {
  const source = normalizeYamlInput(input);
  const filePath =
    options.filePath || options.file_path || options.filename || null;
  const lines = source.split(/\r?\n/);

  const stack = [
    {
      indent: -1,
      path: [],
      keys: new Map(),
    },
  ];

  const duplicates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = extractYamlMappingKey(lines[index]);

    if (!parsed) continue;

    while (
      stack.length > 1 &&
      parsed.indent <= stack[stack.length - 1].indent
    ) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const keyPath = [...parent.path, parsed.key].join(".");

    if (parent.keys.has(parsed.key)) {
      duplicates.push({
        key: parsed.key,
        path: keyPath,
        line: index + 1,
        first_line: parent.keys.get(parsed.key),
        indent: parsed.indent,
        file: filePath,
        message: `Duplicate YAML mapping key "${parsed.key}" at line ${index + 1}; first seen at line ${parent.keys.get(parsed.key)}.`,
      });
    } else {
      parent.keys.set(parsed.key, index + 1);
    }

    stack.push({
      indent: parsed.indent,
      path: [...parent.path, parsed.key],
      keys: new Map(),
    });
  }

  return duplicates;
}

function findDuplicateMappingKeysInFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  return findDuplicateMappingKeys(readTextFile(absolutePath, options), {
    ...options,
    filePath: toRelativePath(absolutePath, repoRoot),
  });
}

function assertNoDuplicateMappingKeys(input, options = {}) {
  const duplicates = findDuplicateMappingKeys(input, options);

  if (duplicates.length) {
    const details = duplicates
      .map((duplicate) => {
        const file = duplicate.file ? `${duplicate.file}:` : "";
        return `- ${file}${duplicate.line}: ${duplicate.message}`;
      })
      .join("\n");

    throw new Error(`Duplicate YAML mapping keys detected.\n${details}`);
  }

  return true;
}

function assertNoDuplicateMappingKeysInFile(filePath, options = {}) {
  const duplicates = findDuplicateMappingKeysInFile(filePath, options);

  if (duplicates.length) {
    const details = duplicates
      .map(
        (duplicate) =>
          `- ${duplicate.file || filePath}:${duplicate.line}: ${duplicate.message}`,
      )
      .join("\n");

    throw new Error(`Duplicate YAML mapping keys detected.\n${details}`);
  }

  return true;
}

function validateYamlValue(value, schema = {}, options = {}) {
  const errors = [];

  function addError(pathName, message) {
    errors.push({
      path: pathName || "$",
      message,
    });
  }

  function validateType(currentValue, expectedType) {
    if (expectedType === "array") return Array.isArray(currentValue);
    if (expectedType === "object") return isPlainObject(currentValue);
    if (expectedType === "integer") return Number.isInteger(currentValue);
    if (Array.isArray(expectedType)) {
      return expectedType.some((type) => validateType(currentValue, type));
    }

    return typeof currentValue === expectedType;
  }

  function visit(currentValue, currentSchema, pathName) {
    if (!currentSchema || !isPlainObject(currentSchema)) return;

    if (currentSchema.type && !validateType(currentValue, currentSchema.type)) {
      addError(
        pathName,
        `Expected type ${JSON.stringify(currentSchema.type)}.`,
      );
      return;
    }

    if (currentSchema.enum && !currentSchema.enum.includes(currentValue)) {
      addError(pathName, `Expected one of: ${currentSchema.enum.join(", ")}.`);
    }

    if (typeof currentValue === "string") {
      if (
        currentSchema.minLength !== undefined &&
        currentValue.length < currentSchema.minLength
      ) {
        addError(
          pathName,
          `Expected string length >= ${currentSchema.minLength}.`,
        );
      }

      if (
        currentSchema.maxLength !== undefined &&
        currentValue.length > currentSchema.maxLength
      ) {
        addError(
          pathName,
          `Expected string length <= ${currentSchema.maxLength}.`,
        );
      }

      if (currentSchema.pattern) {
        const pattern = new RegExp(currentSchema.pattern);

        if (!pattern.test(currentValue)) {
          addError(
            pathName,
            `Expected string to match pattern ${currentSchema.pattern}.`,
          );
        }
      }
    }

    if (typeof currentValue === "number") {
      if (
        currentSchema.minimum !== undefined &&
        currentValue < currentSchema.minimum
      ) {
        addError(pathName, `Expected number >= ${currentSchema.minimum}.`);
      }

      if (
        currentSchema.maximum !== undefined &&
        currentValue > currentSchema.maximum
      ) {
        addError(pathName, `Expected number <= ${currentSchema.maximum}.`);
      }
    }

    if (Array.isArray(currentValue)) {
      if (
        currentSchema.minItems !== undefined &&
        currentValue.length < currentSchema.minItems
      ) {
        addError(
          pathName,
          `Expected at least ${currentSchema.minItems} item(s).`,
        );
      }

      if (
        currentSchema.maxItems !== undefined &&
        currentValue.length > currentSchema.maxItems
      ) {
        addError(
          pathName,
          `Expected no more than ${currentSchema.maxItems} item(s).`,
        );
      }

      if (currentSchema.uniqueItems) {
        const serialized = currentValue.map((item) =>
          JSON.stringify(sortObjectDeep(item)),
        );

        if (serialized.length !== unique(serialized).length) {
          addError(pathName, "Expected array items to be unique.");
        }
      }

      if (currentSchema.items) {
        currentValue.forEach((item, index) => {
          visit(item, currentSchema.items, `${pathName}[${index}]`);
        });
      }
    }

    if (isPlainObject(currentValue)) {
      for (const key of normalizeStringList(currentSchema.required)) {
        if (currentValue[key] === undefined) {
          addError(
            pathName ? `${pathName}.${key}` : key,
            "Required property is missing.",
          );
        }
      }

      const properties = currentSchema.properties || {};

      for (const [key, propertySchema] of Object.entries(properties)) {
        if (currentValue[key] !== undefined) {
          visit(
            currentValue[key],
            propertySchema,
            pathName ? `${pathName}.${key}` : key,
          );
        }
      }

      if (currentSchema.additionalProperties === false) {
        const allowed = new Set(Object.keys(properties));

        for (const key of Object.keys(currentValue)) {
          if (!allowed.has(key)) {
            addError(
              pathName ? `${pathName}.${key}` : key,
              "Additional property is not allowed.",
            );
          }
        }
      }
    }
  }

  visit(value, schema, options.rootPath || options.root_path || "$");

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertValidYamlValue(value, schema = {}, options = {}) {
  const result = validateYamlValue(value, schema, options);

  if (!result.valid) {
    const details = result.errors
      .map((error) => `- ${error.path}: ${error.message}`)
      .join("\n");

    throw new Error(`YAML validation failed.\n${details}`);
  }

  return true;
}

function validateYamlFile(filePath, schema = null, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);
  const source = readTextFile(absolutePath, options);
  const duplicate_keys = findDuplicateMappingKeys(source, {
    ...options,
    filePath: toRelativePath(absolutePath, repoRoot),
  });

  let parsed = null;
  const errors = [];

  try {
    parsed = parseYaml(source, {
      ...options,
      filePath: toRelativePath(absolutePath, repoRoot),
    });
  } catch (err) {
    errors.push({
      path: "$",
      message: logger.formatError(err),
    });
  }

  if (schema && parsed !== null) {
    const schemaValidation = validateYamlValue(parsed, schema, options);
    errors.push(...schemaValidation.errors);
  }

  return {
    valid: duplicate_keys.length === 0 && errors.length === 0,
    file: toRelativePath(absolutePath, repoRoot),
    duplicate_keys,
    errors,
    value: parsed,
  };
}

function assertValidYamlFile(filePath, schema = null, options = {}) {
  const result = validateYamlFile(filePath, schema, options);

  if (!result.valid) {
    const duplicateDetails = result.duplicate_keys
      .map(
        (duplicate) =>
          `- ${duplicate.file}:${duplicate.line}: ${duplicate.message}`,
      )
      .join("\n");

    const errorDetails = result.errors
      .map((error) => `- ${error.path}: ${error.message}`)
      .join("\n");

    throw new Error(
      [
        `YAML file validation failed: ${result.file}`,
        duplicateDetails ? `Duplicate keys:\n${duplicateDetails}` : null,
        errorDetails ? `Errors:\n${errorDetails}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return true;
}

function createYamlSummary(value, options = {}) {
  const flattened = flattenObject(value || {});
  const keys = Object.keys(flattened).sort();
  const maxRows = normalizeInteger(options.maxRows || options.max_rows, 50);

  const lines = [
    "## YAML Summary",
    "",
    `- Type: \`${Array.isArray(value) ? "array" : typeof value}\``,
    `- Top-level keys: \`${isPlainObject(value) ? Object.keys(value).length : 0}\``,
    `- Flattened paths: \`${keys.length}\``,
  ];

  if (keys.length) {
    lines.push("");
    lines.push("| Path | Type | Value |");
    lines.push("|---|---|---|");

    for (const key of keys.slice(0, maxRows)) {
      const item = flattened[key];
      const itemType = Array.isArray(item)
        ? "array"
        : item === null
          ? "null"
          : typeof item;
      const rendered =
        itemType === "object" || itemType === "array"
          ? JSON.stringify(item)
          : String(item);

      lines.push(
        `| \`${key}\` | \`${itemType}\` | \`${rendered.slice(0, 100)}\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping YAML summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
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

function printYaml(value, options = {}) {
  const output = stringifyYaml(value, {
    ...options,
    trailingNewline: false,
  });

  console.log(output);

  return output;
}

function runCli() {
  const command = process.argv[2] || "parse";
  const target = process.argv[3];

  if (command === "parse") {
    if (!target) throw new Error("Target YAML file is required.");

    printYaml(readYaml(target));
    return;
  }

  if (command === "json") {
    if (!target) throw new Error("Target YAML file is required.");

    console.log(JSON.stringify(readYaml(target), null, 2));
    return;
  }

  if (command === "format") {
    if (!target) throw new Error("Target YAML file is required.");

    writeYaml(target, readYaml(target));
    return;
  }

  if (command === "summary") {
    if (!target) throw new Error("Target YAML file is required.");

    const value = readYaml(target);
    const summary = createYamlSummary(value);

    appendGitHubStepSummary(summary);
    console.log(summary);
    return;
  }

  if (command === "get") {
    if (!target) throw new Error("Target YAML file is required.");

    const objectPath = process.argv[4];

    if (!objectPath) throw new Error("Object path is required.");

    const value = readYaml(target);
    printYaml(getPath(value, objectPath, null));
    return;
  }

  if (command === "set") {
    if (!target) throw new Error("Target YAML file is required.");

    const objectPath = process.argv[4];
    const rawValue = process.argv[5];

    if (!objectPath) throw new Error("Object path is required.");

    const value = readYaml(target);
    setPath(value, objectPath, tryParseYaml(rawValue, rawValue));

    writeYaml(target, value);
    return;
  }

  if (command === "duplicates") {
    if (!target) throw new Error("Target YAML file is required.");

    console.log(
      JSON.stringify(findDuplicateMappingKeysInFile(target), null, 2),
    );
    return;
  }

  if (command === "validate") {
    if (!target) throw new Error("Target YAML file is required.");

    const result = validateYamlFile(target);

    console.log(JSON.stringify(result, null, 2));

    if (!result.valid) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "diff") {
    const leftPath = process.argv[3];
    const rightPath = process.argv[4];

    if (!leftPath || !rightPath) {
      throw new Error("Two YAML files are required for diff.");
    }

    console.log(
      JSON.stringify(
        diffYaml(readYaml(leftPath), readYaml(rightPath)),
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(`Unknown YAML utility command: ${command}`);
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
  DEFAULT_ENCODING,
  DEFAULT_LINE_WIDTH,
  DEFAULT_INDENT,
  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_REPO_ROOT_MARKERS,
  YAML_EXTENSIONS,

  isPlainObject,
  isObjectLike,
  unique,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,

  getDryRun,
  allowLocalFileWrites,

  sortObjectDeep,
  cloneYamlValue,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,

  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  ensureParentDir,

  readTextFile,
  writeTextFile,

  stripBom,
  normalizeYamlInput,
  createYamlLoadOptions,
  createYamlDumpOptions,

  parseYaml,
  parseYamlDocuments,
  tryParseYaml,
  stringifyYaml,

  readYaml,
  readYamlDocuments,
  writeYaml,
  writeYamlDocuments,
  isYamlFile,
  readYamlAuto,

  deepMerge,
  mergeOptions,
  deepDefaults,

  parseObjectPath,
  getPath,
  hasPath,
  setPath,
  deletePath,
  pickPaths,
  omitPaths,

  flattenObject,
  unflattenObject,

  removeUndefined,
  removeNullish,
  removeEmpty,
  normalizeYamlValue,

  diffYaml,

  stripYamlLineComment,
  extractYamlMappingKey,
  findDuplicateMappingKeys,
  findDuplicateMappingKeysInFile,
  assertNoDuplicateMappingKeys,
  assertNoDuplicateMappingKeysInFile,

  validateYamlValue,
  assertValidYamlValue,
  validateYamlFile,
  assertValidYamlFile,

  createYamlSummary,
  appendGitHubStepSummary,
  setGitHubOutput,
  printYaml,
};
