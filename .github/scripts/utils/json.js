// .github/scripts/utils/json.js
// =============================================================================
// Aerealith AI JSON Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared JSON, JSONC, stable stringify, deep merge, object path, normalization,
//   and lightweight validation helpers for GitHub workflow scripts.
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
//   - No external dependencies.
//   - Supports JSON and JSONC-style comments/trailing commas.
//   - Does not replace a full JSON Schema validator such as Ajv.
//   - Safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");

const logger = require("./logger");

const DEFAULT_ENCODING = "utf8";
const DEFAULT_JSON_INDENT = 2;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "pnpm-workspace.yaml",
  "nx.json",
  "package.json",
];

const JSON_EXTENSIONS = new Set([".json", ".jsonc"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object";
}

function isEmptyObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
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

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);

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
  const absolutePath = resolvePath(
    filePath,
    options.repoRoot || findRepoRoot(),
  );

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(`File not found: ${filePath}`);
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
      path: absolutePath,
      relative_path: toRelativePath(absolutePath, repoRoot),
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
    path: absolutePath,
    relative_path: toRelativePath(absolutePath, repoRoot),
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

function stripJsonComments(input) {
  const source = stripBom(input);
  let output = "";

  let inString = false;
  let stringQuote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        output += current;
      }

      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }

      continue;
    }

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === stringQuote) {
        inString = false;
        stringQuote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringQuote = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function stripTrailingCommas(input) {
  const source = String(input ?? "");
  let output = "";

  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === stringQuote) {
        inString = false;
        stringQuote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringQuote = current;
      output += current;
      continue;
    }

    if (current === ",") {
      let cursor = index + 1;

      while (cursor < source.length && /\s/.test(source[cursor])) {
        cursor += 1;
      }

      if (source[cursor] === "}" || source[cursor] === "]") {
        continue;
      }
    }

    output += current;
  }

  return output;
}

function normalizeJsonInput(input, options = {}) {
  let text = stripBom(String(input ?? ""));

  if (options.allowComments !== false && options.allow_comments !== false) {
    text = stripJsonComments(text);
  }

  if (
    options.allowTrailingCommas !== false &&
    options.allow_trailing_commas !== false
  ) {
    text = stripTrailingCommas(text);
  }

  return text.trim();
}

function parseJson(input, options = {}) {
  const source = normalizeJsonInput(input, options);

  if (!source) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error("Cannot parse empty JSON input.");
  }

  try {
    return JSON.parse(source);
  } catch (err) {
    const location =
      options.filePath || options.file_path || options.filename || "JSON input";
    throw new Error(`Failed to parse ${location}: ${logger.formatError(err)}`);
  }
}

function parseJsonc(input, options = {}) {
  return parseJson(input, {
    ...options,
    allowComments: true,
    allowTrailingCommas: true,
  });
}

function tryParseJson(input, fallback = null, options = {}) {
  try {
    return parseJson(input, {
      ...options,
      required: false,
      fallback,
    });
  } catch {
    return fallback;
  }
}

function stringifyJson(value, options = {}) {
  const indent = options.indent ?? options.space ?? DEFAULT_JSON_INDENT;
  const sorted =
    options.sortKeys === false || options.sort_keys === false
      ? value
      : sortObjectDeep(value);

  const rendered = JSON.stringify(sorted, options.replacer || null, indent);

  if (rendered === undefined) {
    if (options.required === false) return "";
    throw new Error("Value cannot be serialized as JSON.");
  }

  return options.trailingNewline === false || options.trailing_newline === false
    ? rendered
    : `${rendered}\n`;
}

function readJson(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `JSON file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  const raw = fs.readFileSync(
    absolutePath,
    options.encoding || DEFAULT_ENCODING,
  );

  return parseJson(raw, {
    ...options,
    filePath: toRelativePath(absolutePath, repoRoot),
  });
}

function readJsonc(filePath, options = {}) {
  return readJson(filePath, {
    ...options,
    allowComments: true,
    allowTrailingCommas: true,
  });
}

function readJsonAuto(filePath, options = {}) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jsonc") {
    return readJsonc(filePath, options);
  }

  return readJson(filePath, options);
}

function writeJson(filePath, value, options = {}) {
  const contents = stringifyJson(value, options);
  return writeTextFile(filePath, contents, options);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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

function stableStringify(value, options = {}) {
  return stringifyJson(value, {
    ...options,
    sortKeys: true,
    trailingNewline: false,
  });
}

function deepFreeze(value) {
  if (!isObjectLike(value)) return value;

  Object.freeze(value);

  for (const item of Object.values(value)) {
    if (isObjectLike(item) && !Object.isFrozen(item)) {
      deepFreeze(item);
    }
  }

  return value;
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
    if (right === undefined) return cloneJson(left);
    if (left === undefined) return cloneJson(right);

    if (Array.isArray(left) && Array.isArray(right)) {
      if (arrayMode === "concat") {
        return [...cloneJson(left), ...cloneJson(right)];
      }

      if (arrayMode === "unique") {
        return unique([...cloneJson(left), ...cloneJson(right)]);
      }

      return cloneJson(right);
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const output = cloneJson(left);

      for (const [key, value] of Object.entries(right)) {
        output[key] = mergeTwo(output[key], value);
      }

      return output;
    }

    return cloneJson(right);
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
  if (value === undefined) return cloneJson(defaults);
  if (defaults === undefined) return cloneJson(value);

  if (Array.isArray(value)) return cloneJson(value);

  if (isPlainObject(value) && isPlainObject(defaults)) {
    const output = cloneJson(value);

    for (const [key, defaultValue] of Object.entries(defaults)) {
      output[key] = deepDefaults(output[key], defaultValue);
    }

    return output;
  }

  return cloneJson(value);
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
    if (!isPlainObject(current[part]) && !Array.isArray(current[part])) {
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
      setPath(output, objectPath, cloneJson(value));
    }
  }

  return output;
}

function omitPaths(object, paths = []) {
  const output = cloneJson(object);

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

function normalizeJsonValue(value, options = {}) {
  let output = cloneJson(value);

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

  if (options.sortKeys !== false && options.sort_keys !== false) {
    output = sortObjectDeep(output);
  }

  return output;
}

function diffJson(left, right, options = {}) {
  const changes = [];

  function visit(leftValue, rightValue, currentPath) {
    if (stableStringify(leftValue) === stableStringify(rightValue)) {
      return;
    }

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
      before: cloneJson(leftValue),
      after: cloneJson(rightValue),
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

function createPatchOperations(left, right) {
  return diffJson(left, right).map((change) => {
    const pointer = `/${change.path === "$" ? "" : change.path.split(".").map(escapeJsonPointerPart).join("/")}`;

    if (change.type === "added") {
      return {
        op: "add",
        path: pointer,
        value: change.after,
      };
    }

    if (change.type === "removed") {
      return {
        op: "remove",
        path: pointer,
      };
    }

    return {
      op: "replace",
      path: pointer,
      value: change.after,
    };
  });
}

function escapeJsonPointerPart(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerPart(value) {
  return String(value).replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseJsonPointer(pointer) {
  const source = normalizeString(pointer);

  if (!source || source === "/") return [];

  if (!source.startsWith("/")) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }

  return source
    .slice(1)
    .split("/")
    .map((part) => unescapeJsonPointerPart(part));
}

function getPointer(object, pointer, fallback = undefined) {
  return getPath(object, parseJsonPointer(pointer), fallback);
}

function setPointer(object, pointer, value) {
  return setPath(object, parseJsonPointer(pointer), value);
}

function deletePointer(object, pointer) {
  return deletePath(object, parseJsonPointer(pointer));
}

function validateJsonValue(value, schema = {}, options = {}) {
  const errors = [];

  function addError(pathName, message) {
    errors.push({
      path: pathName || "$",
      message,
    });
  }

  function validateType(currentValue, expectedType, pathName) {
    if (expectedType === "array") return Array.isArray(currentValue);
    if (expectedType === "object") return isPlainObject(currentValue);
    if (expectedType === "integer") return Number.isInteger(currentValue);
    if (Array.isArray(expectedType)) {
      return expectedType.some((type) =>
        validateType(currentValue, type, pathName),
      );
    }

    return typeof currentValue === expectedType;
  }

  function visit(currentValue, currentSchema, pathName) {
    if (!currentSchema || !isPlainObject(currentSchema)) return;

    if (
      currentSchema.type &&
      !validateType(currentValue, currentSchema.type, pathName)
    ) {
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
        try {
          const pattern = new RegExp(currentSchema.pattern);

          if (!pattern.test(currentValue)) {
            addError(
              pathName,
              `Expected string to match pattern ${currentSchema.pattern}.`,
            );
          }
        } catch (err) {
          addError(
            pathName,
            `Invalid schema pattern: ${logger.formatError(err)}.`,
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
        const serialized = currentValue.map((item) => stableStringify(item));
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
      const required = normalizeStringList(currentSchema.required);

      for (const key of required) {
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

function assertValidJsonValue(value, schema = {}, options = {}) {
  const result = validateJsonValue(value, schema, options);

  if (!result.valid) {
    const details = result.errors
      .map((error) => `- ${error.path}: ${error.message}`)
      .join("\n");

    throw new Error(`JSON validation failed.\n${details}`);
  }

  return true;
}

function createJsonSummary(value, options = {}) {
  const flattened = flattenObject(value);
  const keys = Object.keys(flattened).sort();

  const lines = [
    "## JSON Summary",
    "",
    `- Type: \`${Array.isArray(value) ? "array" : typeof value}\``,
    `- Top-level keys: \`${isPlainObject(value) ? Object.keys(value).length : 0}\``,
    `- Flattened paths: \`${keys.length}\``,
  ];

  const maxRows = normalizeInteger(options.maxRows || options.max_rows, 50);

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
      "GITHUB_STEP_SUMMARY is not set. Skipping JSON summary append.",
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

function printJson(value, options = {}) {
  const output = stringifyJson(value, {
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
    if (!target) throw new Error("Target JSON file is required.");

    const value = readJsonAuto(target);
    printJson(value);
    return;
  }

  if (command === "summary") {
    if (!target) throw new Error("Target JSON file is required.");

    const value = readJsonAuto(target);
    const summary = createJsonSummary(value);

    appendGitHubStepSummary(summary);
    console.log(summary);
    return;
  }

  if (command === "get") {
    if (!target) throw new Error("Target JSON file is required.");

    const objectPath = process.argv[4];

    if (!objectPath) throw new Error("Object path is required.");

    const value = readJsonAuto(target);
    printJson(getPath(value, objectPath, null));
    return;
  }

  if (command === "set") {
    if (!target) throw new Error("Target JSON file is required.");

    const objectPath = process.argv[4];
    const rawValue = process.argv[5];

    if (!objectPath) throw new Error("Object path is required.");

    const value = readJsonAuto(target);
    setPath(value, objectPath, tryParseJson(rawValue, rawValue));

    writeJson(target, value);
    return;
  }

  if (command === "format") {
    if (!target) throw new Error("Target JSON file is required.");

    const value = readJsonAuto(target);
    writeJson(target, value);
    return;
  }

  if (command === "diff") {
    const leftPath = process.argv[3];
    const rightPath = process.argv[4];

    if (!leftPath || !rightPath) {
      throw new Error("Two JSON files are required for diff.");
    }

    const left = readJsonAuto(leftPath);
    const right = readJsonAuto(rightPath);

    printJson(diffJson(left, right));
    return;
  }

  throw new Error(`Unknown JSON utility command: ${command}`);
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
  DEFAULT_JSON_INDENT,
  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_REPO_ROOT_MARKERS,
  JSON_EXTENSIONS,

  isPlainObject,
  isObjectLike,
  isEmptyObject,
  unique,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,
  normalizeNumber,

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

  readTextFile,
  writeTextFile,

  stripBom,
  stripJsonComments,
  stripTrailingCommas,
  normalizeJsonInput,

  parseJson,
  parseJsonc,
  tryParseJson,

  stringifyJson,
  stableStringify,

  readJson,
  readJsonc,
  readJsonAuto,
  writeJson,

  cloneJson,
  sortObjectDeep,
  deepFreeze,

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
  normalizeJsonValue,

  diffJson,
  createPatchOperations,

  escapeJsonPointerPart,
  unescapeJsonPointerPart,
  parseJsonPointer,
  getPointer,
  setPointer,
  deletePointer,

  validateJsonValue,
  assertValidJsonValue,

  createJsonSummary,
  appendGitHubStepSummary,
  setGitHubOutput,
  printJson,
};
