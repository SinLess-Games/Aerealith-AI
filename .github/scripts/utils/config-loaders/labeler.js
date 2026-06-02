// .github/scripts/utils/config-loaders/labeler.js
// =============================================================================
// Aerealith AI Labeler Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query `.github/labeler.yaml`.
//
// Used by:
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//
// Supports:
//   - GitHub actions/labeler-style rules.
//   - Simple legacy labeler rules.
//   - Path-based matching.
//   - Branch-based matching.
//   - Base-branch matching.
//   - Dry-run safe evaluation.
//   - Human-readable reporting.
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - Duplicate YAML keys are rejected by js-yaml during parsing.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/labeler.yaml";

const KNOWN_CHANGED_FILE_KEYS = new Set([
  "any-glob-to-any-file",
  "all-globs-to-any-file",
  "any-glob-to-all-files",
  "all-globs-to-all-files",
]);

const KNOWN_CONDITION_KEYS = new Set([
  "changed-files",
  "head-branch",
  "base-branch",
  "paths",
  "files",
  "branches",
  "labels",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeString(value, fieldPath, options = {}) {
  const { fallback = "", allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (!allowEmpty && !fallback) {
      throw new TypeError(`${fieldPath} is required.`);
    }

    return fallback;
  }

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return trimmed || fallback;
}

function normalizeNullableString(value, fieldPath) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string when provided.`);
  }

  return value.trim() || null;
}

function normalizeStringList(value, fieldPath, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (allowEmpty) return [];
    throw new TypeError(`${fieldPath} is required.`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed && !allowEmpty) {
      throw new TypeError(`${fieldPath} cannot be empty.`);
    }

    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      `${fieldPath} must be a string or an array of strings.`,
    );
  }

  const normalized = value
    .map((item, index) => {
      if (typeof item !== "string") {
        throw new TypeError(`${fieldPath}[${index}] must be a string.`);
      }

      return item.trim();
    })
    .filter(Boolean);

  if (!normalized.length && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return unique(normalized);
}

function normalizeObject(value, fieldPath) {
  if (value === undefined || value === null) return {};

  if (!isPlainObject(value)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  return value;
}

function compileRegex(pattern, fieldPath) {
  if (!pattern || typeof pattern !== "string") {
    throw new TypeError(`${fieldPath} must be a non-empty regex string.`);
  }

  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new TypeError(`${fieldPath} is not a valid regex: ${err.message}`);
  }
}

function looksLikeRegex(pattern) {
  if (!pattern || typeof pattern !== "string") return false;

  return (
    pattern.startsWith("^") ||
    pattern.endsWith("$") ||
    pattern.includes(".*") ||
    pattern.includes("\\d") ||
    pattern.includes("[") ||
    pattern.includes("(") ||
    pattern.includes("|")
  );
}

function matchesRegex(pattern, value) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!value || typeof value !== "string") return false;

  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function matchesGlob(pattern, filePath) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!filePath || typeof filePath !== "string") return false;

  return minimatch(filePath, pattern, {
    dot: true,
    nocase: false,
    matchBase: false,
  });
}

function matchesAnyGlob(patterns, filePath) {
  return normalizeStringList(patterns, "patterns").some((pattern) =>
    matchesGlob(pattern, filePath),
  );
}

function hasAnyFileMatching(patterns, changedFiles) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const globs = normalizeStringList(patterns, "patterns");

  return files.some((file) => matchesAnyGlob(globs, file));
}

function hasAllGlobsMatchingAnyFile(patterns, changedFiles) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const globs = normalizeStringList(patterns, "patterns");

  return globs.every((pattern) =>
    files.some((file) => matchesGlob(pattern, file)),
  );
}

function hasAnyGlobMatchingAllFiles(patterns, changedFiles) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const globs = normalizeStringList(patterns, "patterns");

  if (!files.length) return false;

  return globs.some((pattern) =>
    files.every((file) => matchesGlob(pattern, file)),
  );
}

function hasAllGlobsMatchingAllFiles(patterns, changedFiles) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const globs = normalizeStringList(patterns, "patterns");

  if (!files.length) return false;

  return globs.every((pattern) =>
    files.every((file) => matchesGlob(pattern, file)),
  );
}

function matchesBranchPattern(pattern, branchName) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!branchName || typeof branchName !== "string") return false;

  if (looksLikeRegex(pattern)) {
    return matchesRegex(pattern, branchName);
  }

  return matchesGlob(pattern, branchName);
}

function matchesAnyBranchPattern(patterns, branchName) {
  const normalizedPatterns = normalizeStringList(patterns, "patterns");

  return normalizedPatterns.some((pattern) =>
    matchesBranchPattern(pattern, branchName),
  );
}

function normalizeBranchName(branchNameOrRef) {
  if (!branchNameOrRef || typeof branchNameOrRef !== "string") return "";

  return branchNameOrRef
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeChangedFilesRule(rule, fieldPath) {
  if (rule === undefined || rule === null) {
    return {
      any_glob_to_any_file: [],
      all_globs_to_any_file: [],
      any_glob_to_all_files: [],
      all_globs_to_all_files: [],
    };
  }

  if (typeof rule === "string" || Array.isArray(rule)) {
    return {
      any_glob_to_any_file: normalizeStringList(rule, fieldPath),
      all_globs_to_any_file: [],
      any_glob_to_all_files: [],
      all_globs_to_all_files: [],
    };
  }

  if (!isPlainObject(rule)) {
    throw new TypeError(`${fieldPath} must be a string, array, or object.`);
  }

  return {
    any_glob_to_any_file: normalizeStringList(
      rule["any-glob-to-any-file"],
      `${fieldPath}.any-glob-to-any-file`,
    ),

    all_globs_to_any_file: normalizeStringList(
      rule["all-globs-to-any-file"],
      `${fieldPath}.all-globs-to-any-file`,
    ),

    any_glob_to_all_files: normalizeStringList(
      rule["any-glob-to-all-files"],
      `${fieldPath}.any-glob-to-all-files`,
    ),

    all_globs_to_all_files: normalizeStringList(
      rule["all-globs-to-all-files"],
      `${fieldPath}.all-globs-to-all-files`,
    ),
  };
}

function normalizeChangedFilesRules(value, fieldPath) {
  if (value === undefined || value === null) return [];

  if (typeof value === "string") {
    return [normalizeChangedFilesRule(value, fieldPath)];
  }

  if (Array.isArray(value)) {
    if (!value.length) return [];

    return value.map((item, index) =>
      normalizeChangedFilesRule(item, `${fieldPath}[${index}]`),
    );
  }

  if (isPlainObject(value)) {
    return [normalizeChangedFilesRule(value, fieldPath)];
  }

  throw new TypeError(`${fieldPath} must be a string, array, or object.`);
}

function normalizeCondition(condition, fieldPath) {
  if (condition === undefined || condition === null) {
    return {
      changed_files: [],
      head_branch: [],
      base_branch: [],
      required_labels: [],
      raw: condition,
    };
  }

  if (typeof condition === "string" || Array.isArray(condition)) {
    return {
      changed_files: normalizeChangedFilesRules(
        condition,
        `${fieldPath}.changed-files`,
      ),
      head_branch: [],
      base_branch: [],
      required_labels: [],
      raw: condition,
    };
  }

  if (!isPlainObject(condition)) {
    throw new TypeError(`${fieldPath} must be a string, array, or object.`);
  }

  const unknownKeys = Object.keys(condition).filter(
    (key) => !KNOWN_CONDITION_KEYS.has(key),
  );

  if (unknownKeys.length) {
    logger.warn(
      `${fieldPath} contains unknown condition keys: ${unknownKeys.join(", ")}.`,
    );
  }

  return {
    changed_files: [
      ...normalizeChangedFilesRules(
        condition["changed-files"],
        `${fieldPath}.changed-files`,
      ),
      ...normalizeChangedFilesRules(condition.paths, `${fieldPath}.paths`),
      ...normalizeChangedFilesRules(condition.files, `${fieldPath}.files`),
    ],

    head_branch: unique([
      ...normalizeStringList(
        condition["head-branch"],
        `${fieldPath}.head-branch`,
      ),
      ...normalizeStringList(condition.branches, `${fieldPath}.branches`),
    ]),

    base_branch: normalizeStringList(
      condition["base-branch"],
      `${fieldPath}.base-branch`,
    ),

    required_labels: normalizeStringList(
      condition.labels,
      `${fieldPath}.labels`,
    ),

    raw: condition,
  };
}

function normalizeLabelRule(labelName, labelRule) {
  const label = normalizeString(labelName, "label name", {
    allowEmpty: false,
  });

  if (labelRule === undefined || labelRule === null) {
    return {
      label,
      conditions: [],
      raw: labelRule,
    };
  }

  if (typeof labelRule === "string") {
    return {
      label,
      conditions: [normalizeCondition(labelRule, `rules.${label}`)],
      raw: labelRule,
    };
  }

  if (Array.isArray(labelRule)) {
    return {
      label,
      conditions: labelRule.map((condition, index) =>
        normalizeCondition(condition, `rules.${label}[${index}]`),
      ),
      raw: labelRule,
    };
  }

  if (isPlainObject(labelRule)) {
    return {
      label,
      conditions: [normalizeCondition(labelRule, `rules.${label}`)],
      raw: labelRule,
    };
  }

  throw new TypeError(`rules.${label} must be a string, array, or object.`);
}

function normalizeLabelerConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Labeler config must be a YAML object.");
  }

  const rules = Object.fromEntries(
    Object.entries(rawConfig).map(([labelName, labelRule]) => [
      labelName,
      normalizeLabelRule(labelName, labelRule),
    ]),
  );

  return {
    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    rules,
  };
}

function validateChangedFilesRule(rule, fieldPath) {
  if (!isPlainObject(rule)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  for (const key of [
    "any_glob_to_any_file",
    "all_globs_to_any_file",
    "any_glob_to_all_files",
    "all_globs_to_all_files",
  ]) {
    if (!Array.isArray(rule[key])) {
      throw new TypeError(`${fieldPath}.${key} must be an array.`);
    }

    for (const [index, value] of rule[key].entries()) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
          `${fieldPath}.${key}[${index}] must be a non-empty string.`,
        );
      }
    }
  }
}

function validateCondition(condition, fieldPath) {
  if (!isPlainObject(condition)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (!Array.isArray(condition.changed_files)) {
    throw new TypeError(`${fieldPath}.changed_files must be an array.`);
  }

  condition.changed_files.forEach((rule, index) =>
    validateChangedFilesRule(rule, `${fieldPath}.changed_files[${index}]`),
  );

  for (const key of ["head_branch", "base_branch", "required_labels"]) {
    if (!Array.isArray(condition[key])) {
      throw new TypeError(`${fieldPath}.${key} must be an array.`);
    }

    for (const [index, value] of condition[key].entries()) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
          `${fieldPath}.${key}[${index}] must be a non-empty string.`,
        );
      }

      if (
        (key === "head_branch" || key === "base_branch") &&
        looksLikeRegex(value)
      ) {
        compileRegex(value, `${fieldPath}.${key}[${index}]`);
      }
    }
  }
}

function validateLabelRule(rule, fieldPath) {
  if (!isPlainObject(rule)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (typeof rule.label !== "string" || !rule.label.trim()) {
    throw new TypeError(`${fieldPath}.label must be a non-empty string.`);
  }

  if (!Array.isArray(rule.conditions)) {
    throw new TypeError(`${fieldPath}.conditions must be an array.`);
  }

  rule.conditions.forEach((condition, index) =>
    validateCondition(condition, `${fieldPath}.conditions[${index}]`),
  );
}

function validateLabelerConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Labeler config must be an object.");
  }

  if (!isPlainObject(config.rules)) {
    throw new TypeError("Labeler config rules must be an object.");
  }

  const labelNames = Object.keys(config.rules);

  if (!labelNames.length) {
    logger.warn("No labeler rules were found in .github/labeler.yaml.");
  }

  const seenLabels = new Set();

  for (const labelName of labelNames) {
    if (seenLabels.has(labelName)) {
      throw new TypeError(
        `Duplicate labeler rule detected for label: ${labelName}`,
      );
    }

    seenLabels.add(labelName);
    validateLabelRule(config.rules[labelName], `rules.${labelName}`);
  }

  return true;
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const candidates = [
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../../.."),
  ];

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      const githubDir = path.join(current, ".github");

      if (fs.existsSync(githubDir) && fs.statSync(githubDir).isDirectory()) {
        return current;
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolveConfigPath(
  configPath = DEFAULT_CONFIG_PATH,
  repoRoot = findRepoRoot(),
) {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  return path.join(repoRoot, configPath);
}

function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw, {
    filename: filePath,
    schema: yaml.DEFAULT_SCHEMA,
  });

  return parsed || {};
}

function loadLabelerConfig(options = {}) {
  const {
    configPath = DEFAULT_CONFIG_PATH,
    repoRoot = findRepoRoot(),
    required = true,
    validate = true,
    log = true,
  } = options;

  const absolutePath = resolveConfigPath(configPath, repoRoot);
  const displayPath = path.relative(repoRoot, absolutePath) || absolutePath;

  if (!fs.existsSync(absolutePath)) {
    if (!required) {
      logger.warn(
        `Labeler config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeLabelerConfig({}, { configPath: absolutePath, repoRoot });
    }

    throw new Error(`Labeler config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeLabelerConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateLabelerConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded labeler config from ${displayPath}.`);
      logger.debug(
        `Labeler config contains ${Object.keys(normalizedConfig.rules || {}).length} rules.`,
      );
      logger.dump("labeler config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load labeler config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function ruleHasPathMatchers(rule) {
  return [
    "any_glob_to_any_file",
    "all_globs_to_any_file",
    "any_glob_to_all_files",
    "all_globs_to_all_files",
  ].some((key) => Array.isArray(rule[key]) && rule[key].length > 0);
}

function evaluateChangedFilesRule(rule, changedFiles = []) {
  validateChangedFilesRule(rule, "changed_files_rule");

  const files = normalizeStringList(changedFiles, "changedFiles");

  if (!ruleHasPathMatchers(rule)) {
    return {
      matched: false,
      reason: "No changed-file matchers are defined.",
      matched_files: [],
    };
  }

  const checks = [];

  if (rule.any_glob_to_any_file.length) {
    const matchedFiles = files.filter((file) =>
      matchesAnyGlob(rule.any_glob_to_any_file, file),
    );

    checks.push({
      type: "any_glob_to_any_file",
      matched: matchedFiles.length > 0,
      matched_files: matchedFiles,
    });
  }

  if (rule.all_globs_to_any_file.length) {
    const matched = hasAllGlobsMatchingAnyFile(
      rule.all_globs_to_any_file,
      files,
    );
    const matchedFiles = files.filter((file) =>
      matchesAnyGlob(rule.all_globs_to_any_file, file),
    );

    checks.push({
      type: "all_globs_to_any_file",
      matched,
      matched_files: matchedFiles,
    });
  }

  if (rule.any_glob_to_all_files.length) {
    const matched = hasAnyGlobMatchingAllFiles(
      rule.any_glob_to_all_files,
      files,
    );
    const matchedFiles = matched
      ? files
      : files.filter((file) =>
          matchesAnyGlob(rule.any_glob_to_all_files, file),
        );

    checks.push({
      type: "any_glob_to_all_files",
      matched,
      matched_files: matchedFiles,
    });
  }

  if (rule.all_globs_to_all_files.length) {
    const matched = hasAllGlobsMatchingAllFiles(
      rule.all_globs_to_all_files,
      files,
    );
    const matchedFiles = matched
      ? files
      : files.filter((file) =>
          matchesAnyGlob(rule.all_globs_to_all_files, file),
        );

    checks.push({
      type: "all_globs_to_all_files",
      matched,
      matched_files: matchedFiles,
    });
  }

  const matched = checks.every((check) => check.matched);

  return {
    matched,
    checks,
    matched_files: unique(checks.flatMap((check) => check.matched_files || [])),
  };
}

function evaluateCondition(condition, input = {}) {
  validateCondition(condition, "condition");

  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
    "input.changed_files",
  );

  const headBranch = normalizeBranchName(
    input.head_branch || input.headBranch || input.branch || "",
  );

  const baseBranch = normalizeBranchName(
    input.base_branch || input.baseBranch || "",
  );

  const labels = normalizeStringList(input.labels, "input.labels");

  const checks = [];
  const matchedFiles = [];

  if (condition.changed_files.length) {
    const changedFileResults = condition.changed_files.map((rule) =>
      evaluateChangedFilesRule(rule, changedFiles),
    );

    const changedFilesMatched = changedFileResults.some(
      (result) => result.matched,
    );

    checks.push({
      type: "changed_files",
      matched: changedFilesMatched,
      results: changedFileResults,
    });

    matchedFiles.push(
      ...changedFileResults.flatMap((result) => result.matched_files || []),
    );
  }

  if (condition.head_branch.length) {
    const matched = matchesAnyBranchPattern(condition.head_branch, headBranch);

    checks.push({
      type: "head_branch",
      matched,
      branch: headBranch,
      patterns: condition.head_branch,
    });
  }

  if (condition.base_branch.length) {
    const matched = matchesAnyBranchPattern(condition.base_branch, baseBranch);

    checks.push({
      type: "base_branch",
      matched,
      branch: baseBranch,
      patterns: condition.base_branch,
    });
  }

  if (condition.required_labels.length) {
    const labelSet = new Set(labels);
    const missingLabels = condition.required_labels.filter(
      (label) => !labelSet.has(label),
    );

    checks.push({
      type: "required_labels",
      matched: missingLabels.length === 0,
      required_labels: condition.required_labels,
      missing_labels: missingLabels,
    });
  }

  if (!checks.length) {
    return {
      matched: false,
      checks,
      matched_files: [],
      reason: "Condition contains no supported matchers.",
    };
  }

  return {
    matched: checks.every((check) => check.matched),
    checks,
    matched_files: unique(matchedFiles),
  };
}

function evaluateLabelRule(rule, input = {}) {
  validateLabelRule(rule, `rules.${rule.label}`);

  const conditionResults = rule.conditions.map((condition) =>
    evaluateCondition(condition, input),
  );

  const matchedConditions = conditionResults.filter((result) => result.matched);

  return {
    label: rule.label,
    matched: matchedConditions.length > 0,
    condition_results: conditionResults,
    matched_files: unique(
      matchedConditions.flatMap((result) => result.matched_files || []),
    ),
  };
}

function evaluateLabeler(config, input = {}) {
  validateLabelerConfig(config);

  const ruleResults = Object.values(config.rules || {}).map((rule) =>
    evaluateLabelRule(rule, input),
  );

  const matched = ruleResults.filter((result) => result.matched);

  return {
    labels: unique(matched.map((result) => result.label)),
    matches: matched,
    results: ruleResults,
  };
}

function collectLabelsForChangedFiles(config, changedFiles = [], options = {}) {
  const input = {
    ...options,
    changed_files: changedFiles,
  };

  return evaluateLabeler(config, input).labels;
}

function collectLabelsForBranches(config, options = {}) {
  return evaluateLabeler(config, options).labels;
}

function collectMatchedFilesByLabel(config, input = {}) {
  const evaluation = evaluateLabeler(config, input);

  return Object.fromEntries(
    evaluation.matches.map((match) => [match.label, match.matched_files || []]),
  );
}

function getRule(config, labelName) {
  validateLabelerConfig(config);

  if (!labelName || typeof labelName !== "string") return null;

  return config.rules?.[labelName] || null;
}

function listRules(config) {
  validateLabelerConfig(config);

  return Object.values(config.rules || {});
}

function listLabels(config) {
  validateLabelerConfig(config);

  return Object.keys(config.rules || {});
}

function getRulesUsingLabelPrefix(config, prefix) {
  validateLabelerConfig(config);

  const normalizedPrefix = normalizeString(prefix, "prefix", {
    allowEmpty: false,
  });

  return listRules(config).filter((rule) =>
    rule.label.startsWith(normalizedPrefix),
  );
}

function getRulesUsingAreaLabels(config) {
  return getRulesUsingLabelPrefix(config, "area:");
}

function getRulesUsingKindLabels(config) {
  return getRulesUsingLabelPrefix(config, "kind:");
}

function getRulesUsingStatusLabels(config) {
  return getRulesUsingLabelPrefix(config, "status:");
}

function getRulesUsingReleaseLabels(config) {
  return getRulesUsingLabelPrefix(config, "release:");
}

function getAllPathPatternsForRule(rule) {
  validateLabelRule(rule, `rules.${rule.label}`);

  const patterns = [];

  for (const condition of rule.conditions) {
    for (const changedFilesRule of condition.changed_files) {
      patterns.push(...changedFilesRule.any_glob_to_any_file);
      patterns.push(...changedFilesRule.all_globs_to_any_file);
      patterns.push(...changedFilesRule.any_glob_to_all_files);
      patterns.push(...changedFilesRule.all_globs_to_all_files);
    }
  }

  return unique(patterns);
}

function getAllPathPatterns(config) {
  validateLabelerConfig(config);

  return unique(
    listRules(config).flatMap((rule) => getAllPathPatternsForRule(rule)),
  );
}

function getAllBranchPatternsForRule(rule) {
  validateLabelRule(rule, `rules.${rule.label}`);

  return unique(
    rule.conditions.flatMap((condition) => [
      ...condition.head_branch,
      ...condition.base_branch,
    ]),
  );
}

function getAllBranchPatterns(config) {
  validateLabelerConfig(config);

  return unique(
    listRules(config).flatMap((rule) => getAllBranchPatternsForRule(rule)),
  );
}

function detectDuplicateEquivalentRules(config) {
  validateLabelerConfig(config);

  const signatures = new Map();
  const duplicates = [];

  for (const rule of listRules(config)) {
    const signature = JSON.stringify({
      paths: getAllPathPatternsForRule(rule).sort(),
      branches: getAllBranchPatternsForRule(rule).sort(),
    });

    if (signatures.has(signature)) {
      duplicates.push({
        label: rule.label,
        duplicate_of: signatures.get(signature),
      });
    } else {
      signatures.set(signature, rule.label);
    }
  }

  return duplicates;
}

function validateNoDuplicateEquivalentRules(config, options = {}) {
  const { warnOnly = true } = options;
  const duplicates = detectDuplicateEquivalentRules(config);

  if (!duplicates.length) return true;

  const message = `Labeler contains duplicate-equivalent rules: ${duplicates
    .map((item) => `${item.label} duplicates ${item.duplicate_of}`)
    .join("; ")}`;

  if (warnOnly) {
    logger.warn(message);
    return true;
  }

  throw new Error(message);
}

if (require.main === module) {
  try {
    const config = loadLabelerConfig();
    validateNoDuplicateEquivalentRules(config, { warnOnly: true });

    logger.info(
      `Labeler config validation passed with ${Object.keys(config.rules || {}).length} rules.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,

  KNOWN_CHANGED_FILE_KEYS,
  KNOWN_CONDITION_KEYS,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadLabelerConfig,
  normalizeLabelerConfig,
  validateLabelerConfig,

  normalizeBranchName,

  matchesGlob,
  matchesAnyGlob,
  matchesRegex,
  matchesBranchPattern,
  matchesAnyBranchPattern,

  normalizeChangedFilesRule,
  normalizeChangedFilesRules,
  normalizeCondition,
  normalizeLabelRule,

  evaluateChangedFilesRule,
  evaluateCondition,
  evaluateLabelRule,
  evaluateLabeler,

  collectLabelsForChangedFiles,
  collectLabelsForBranches,
  collectMatchedFilesByLabel,

  getRule,
  listRules,
  listLabels,

  getRulesUsingLabelPrefix,
  getRulesUsingAreaLabels,
  getRulesUsingKindLabels,
  getRulesUsingStatusLabels,
  getRulesUsingReleaseLabels,

  getAllPathPatternsForRule,
  getAllPathPatterns,
  getAllBranchPatternsForRule,
  getAllBranchPatterns,

  detectDuplicateEquivalentRules,
  validateNoDuplicateEquivalentRules,
};
