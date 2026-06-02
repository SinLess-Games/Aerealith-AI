// .github/scripts/utils/config-loaders/labels.js
// =============================================================================
// Aerealith AI Labels Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query `.github/labels.yaml`.
//
// Used by:
//   - .github/scripts/repo/sync-labels.js
//   - .github/scripts/repo/validate-labels.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/security/run-policy-gate.js
//
// Supported `.github/labels.yaml` formats:
//
//   Preferred:
//     - name: kind:feature
//       color: 1d76db
//       description: New feature or enhancement.
//
//   Also supported:
//     labels:
//       - name: kind:feature
//         color: 1d76db
//         description: New feature or enhancement.
//
// Notes:
//   - GitHub label colors must be 6-character hex values without `#`.
//   - This loader accepts colors with or without `#`, then normalizes them.
//   - GitHub label descriptions should stay at or below 100 characters.
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const logger = require("../logger");

const DEFAULT_CONFIG_PATH = ".github/labels.yaml";

const GITHUB_LABEL_DESCRIPTION_MAX_LENGTH = 100;

const DEFAULT_PROTECTED_LABELS = [
  "do-not-merge",
  "blocked-by-security",
  "needs-security-review",
  "needs-maintainer-review",
  "needs-architecture-review",
  "automation:needs-review",
  "release:major",
  "release:minor",
  "release:patch",
  "no-release",
];

const DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS = {
  status: [
    "status:triage",
    "status:backlog",
    "status:ready",
    "status:in-progress",
    "status:needs-info",
    "status:needs-review",
    "status:changes-requested",
    "status:blocked",
    "status:ready-to-merge",
    "status:merged",
  ],

  priority: [
    "priority:critical",
    "priority:high",
    "priority:medium",
    "priority:low",
  ],

  severity: [
    "severity:critical",
    "severity:high",
    "severity:medium",
    "severity:low",
  ],

  release: ["release:major", "release:minor", "release:patch"],
};

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
    value = String(value);
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
    value = String(value);
  }

  return value.trim() || null;
}

function normalizeStringList(value, fieldPath, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (allowEmpty) return [];
    throw new TypeError(`${fieldPath} is required.`);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const trimmed = String(value).trim();

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
      if (
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      ) {
        throw new TypeError(`${fieldPath}[${index}] must be a string.`);
      }

      return String(item).trim();
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

function normalizeColor(value, fieldPath) {
  if (value === undefined || value === null || value === "") {
    throw new TypeError(`${fieldPath} is required.`);
  }

  let color = String(value).trim();

  if (color.startsWith("#")) {
    color = color.slice(1);
  }

  color = color.toLowerCase();

  if (/^[0-9]+$/.test(color) && color.length < 6) {
    color = color.padStart(6, "0");
  }

  if (!/^[0-9a-f]{6}$/i.test(color)) {
    throw new TypeError(
      `${fieldPath} must be a 6-character hex color, with or without '#'. Received: ${value}`,
    );
  }

  return color;
}

function normalizeDescription(value, fieldPath) {
  const description = normalizeNullableString(value, fieldPath) || "";

  return description.replace(/\s+/g, " ").trim();
}

function normalizeLabelName(value, fieldPath = "label.name") {
  const name = normalizeString(value, fieldPath, {
    allowEmpty: false,
  });

  if (name.length > 50) {
    logger.warn(
      `Label "${name}" is longer than 50 characters. GitHub allows it, but shorter labels are easier to use.`,
    );
  }

  return name;
}

function normalizeLabelEntry(entry, index) {
  if (!isPlainObject(entry)) {
    throw new TypeError(`labels[${index}] must be an object.`);
  }

  const fieldPath = `labels[${index}]`;

  const name = normalizeLabelName(entry.name, `${fieldPath}.name`);
  const color = normalizeColor(entry.color, `${fieldPath}.color`);
  const description = normalizeDescription(
    entry.description,
    `${fieldPath}.description`,
  );

  return {
    ...entry,
    name,
    color,
    description,
  };
}

function normalizeGroups(groups) {
  groups = normalizeObject(groups, "groups");

  return Object.fromEntries(
    Object.entries(groups).map(([groupName, labels]) => [
      groupName,
      normalizeStringList(labels, `groups.${groupName}`),
    ]),
  );
}

function normalizePolicy(policy) {
  policy = normalizeObject(policy, "policy");

  return {
    ...policy,

    dry_run_supported: normalizeBoolean(policy.dry_run_supported, true),
    debug_supported: normalizeBoolean(policy.debug_supported, true),

    create_missing: normalizeBoolean(policy.create_missing, true),
    update_existing: normalizeBoolean(policy.update_existing, true),

    // The user explicitly wants unmanaged labels deleted.
    delete_unmanaged: normalizeBoolean(policy.delete_unmanaged, true),

    report_unmanaged: normalizeBoolean(policy.report_unmanaged, true),
    preserve_protected_labels: normalizeBoolean(
      policy.preserve_protected_labels,
      true,
    ),

    fail_on_duplicate_names: normalizeBoolean(
      policy.fail_on_duplicate_names,
      true,
    ),
    fail_on_invalid_color: normalizeBoolean(policy.fail_on_invalid_color, true),
    fail_on_long_description: normalizeBoolean(
      policy.fail_on_long_description,
      true,
    ),
  };
}

function normalizeMutuallyExclusiveGroups(groups) {
  if (groups === undefined || groups === null) {
    return { ...DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS };
  }

  groups = normalizeObject(groups, "mutually_exclusive_groups");

  return {
    ...DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS,
    ...Object.fromEntries(
      Object.entries(groups).map(([groupName, labels]) => [
        groupName,
        normalizeStringList(labels, `mutually_exclusive_groups.${groupName}`),
      ]),
    ),
  };
}

function normalizeRawLabelsConfig(rawConfig) {
  if (Array.isArray(rawConfig)) {
    return {
      version: 1,
      policy: {},
      protected_labels: DEFAULT_PROTECTED_LABELS,
      mutually_exclusive_groups: DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS,
      groups: {},
      labels: rawConfig,
    };
  }

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Labels config must be a YAML array or object.");
  }

  return {
    version: rawConfig.version || 1,
    policy: rawConfig.policy || {},
    protected_labels: rawConfig.protected_labels || DEFAULT_PROTECTED_LABELS,
    mutually_exclusive_groups:
      rawConfig.mutually_exclusive_groups || DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS,
    groups: rawConfig.groups || {},
    labels: rawConfig.labels || [],
    ...rawConfig,
  };
}

function buildLabelMap(labels) {
  const labelMap = {};

  for (const label of labels) {
    labelMap[label.name] = label;
  }

  return labelMap;
}

function normalizeLabelsConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  const normalizedRaw = normalizeRawLabelsConfig(rawConfig);

  if (!Array.isArray(normalizedRaw.labels)) {
    throw new TypeError("labels must be an array.");
  }

  const labels = normalizedRaw.labels.map((entry, index) =>
    normalizeLabelEntry(entry, index),
  );

  const labelMap = buildLabelMap(labels);

  return {
    ...normalizedRaw,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: Number(normalizedRaw.version || 1),
    policy: normalizePolicy(normalizedRaw.policy),
    protected_labels: unique([
      ...DEFAULT_PROTECTED_LABELS,
      ...normalizeStringList(
        normalizedRaw.protected_labels,
        "protected_labels",
      ),
    ]),
    mutually_exclusive_groups: normalizeMutuallyExclusiveGroups(
      normalizedRaw.mutually_exclusive_groups,
    ),
    groups: normalizeGroups(normalizedRaw.groups),
    labels,
    label_map: labelMap,
  };
}

function detectDuplicateLabelNames(labels) {
  const seen = new Set();
  const duplicates = [];

  for (const label of labels || []) {
    if (!label?.name) continue;

    if (seen.has(label.name)) {
      duplicates.push(label.name);
    } else {
      seen.add(label.name);
    }
  }

  return unique(duplicates);
}

function validateLabelEntry(label, fieldPath) {
  if (!isPlainObject(label)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (typeof label.name !== "string" || !label.name.trim()) {
    throw new TypeError(`${fieldPath}.name must be a non-empty string.`);
  }

  if (typeof label.color !== "string" || !/^[0-9a-f]{6}$/i.test(label.color)) {
    throw new TypeError(
      `${fieldPath}.color must be a normalized 6-character hex color.`,
    );
  }

  if (typeof label.description !== "string") {
    throw new TypeError(`${fieldPath}.description must be a string.`);
  }

  if (label.description.length > GITHUB_LABEL_DESCRIPTION_MAX_LENGTH) {
    throw new TypeError(
      `${fieldPath}.description must be ${GITHUB_LABEL_DESCRIPTION_MAX_LENGTH} characters or fewer for GitHub labels. Label "${label.name}" has ${label.description.length} characters.`,
    );
  }
}

function validateLabelsConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Labels config must be an object.");
  }

  if (!Array.isArray(config.labels)) {
    throw new TypeError("labels must be an array.");
  }

  const duplicates = detectDuplicateLabelNames(config.labels);

  if (duplicates.length) {
    throw new TypeError(
      `Duplicate label names detected: ${duplicates.join(", ")}`,
    );
  }

  config.labels.forEach((label, index) =>
    validateLabelEntry(label, `labels[${index}]`),
  );

  if (!config.labels.length) {
    logger.warn("No labels were found in .github/labels.yaml.");
  }

  for (const [groupName, groupLabels] of Object.entries(
    config.mutually_exclusive_groups || {},
  )) {
    if (!Array.isArray(groupLabels)) {
      throw new TypeError(
        `mutually_exclusive_groups.${groupName} must be an array.`,
      );
    }

    for (const labelName of groupLabels) {
      if (!config.label_map[labelName]) {
        logger.warn(
          `Mutually exclusive group "${groupName}" references missing label "${labelName}".`,
        );
      }
    }
  }

  for (const [groupName, groupLabels] of Object.entries(config.groups || {})) {
    if (!Array.isArray(groupLabels)) {
      throw new TypeError(`groups.${groupName} must be an array.`);
    }

    for (const labelName of groupLabels) {
      if (!config.label_map[labelName]) {
        logger.warn(
          `Group "${groupName}" references missing label "${labelName}".`,
        );
      }
    }
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

  return parsed || [];
}

function loadLabelsConfig(options = {}) {
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
        `Labels config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeLabelsConfig([], {
        configPath: absolutePath,
        repoRoot,
      });
    }

    throw new Error(`Labels config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeLabelsConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateLabelsConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded labels config from ${displayPath}.`);
      logger.debug(
        `Labels config contains ${normalizedConfig.labels.length} labels.`,
      );
      logger.dump("labels config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load labels config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function normalizeRemoteLabel(remoteLabel) {
  if (!isPlainObject(remoteLabel)) {
    throw new TypeError("remoteLabel must be an object.");
  }

  return {
    name: normalizeLabelName(remoteLabel.name, "remoteLabel.name"),
    color: normalizeColor(remoteLabel.color, "remoteLabel.color"),
    description: normalizeDescription(
      remoteLabel.description,
      "remoteLabel.description",
    ),
    id: remoteLabel.id || null,
    node_id: remoteLabel.node_id || null,
    url: remoteLabel.url || null,
  };
}

function normalizeRemoteLabels(remoteLabels) {
  if (!Array.isArray(remoteLabels)) {
    throw new TypeError("remoteLabels must be an array.");
  }

  return remoteLabels.map((label) => normalizeRemoteLabel(label));
}

function labelsEqual(desiredLabel, remoteLabel) {
  const desired = normalizeLabelEntry(desiredLabel, 0);
  const remote = normalizeRemoteLabel(remoteLabel);

  return (
    desired.name === remote.name &&
    desired.color.toLowerCase() === remote.color.toLowerCase() &&
    desired.description === remote.description
  );
}

function getLabel(config, labelName) {
  validateLabelsConfig(config);

  if (!labelName || typeof labelName !== "string") return null;

  return config.label_map[labelName] || null;
}

function hasLabel(config, labelName) {
  return Boolean(getLabel(config, labelName));
}

function listLabels(config) {
  validateLabelsConfig(config);
  return [...config.labels];
}

function listLabelNames(config) {
  validateLabelsConfig(config);
  return config.labels.map((label) => label.name);
}

function getLabelsByPrefix(config, prefix) {
  validateLabelsConfig(config);

  const normalizedPrefix = normalizeString(prefix, "prefix", {
    allowEmpty: false,
  });

  return config.labels.filter((label) =>
    label.name.startsWith(normalizedPrefix),
  );
}

function getLabelNamesByPrefix(config, prefix) {
  return getLabelsByPrefix(config, prefix).map((label) => label.name);
}

function getLabelsByPrefixes(config, prefixes) {
  validateLabelsConfig(config);

  const normalizedPrefixes = normalizeStringList(prefixes, "prefixes");

  return config.labels.filter((label) =>
    normalizedPrefixes.some((prefix) => label.name.startsWith(prefix)),
  );
}

function getKindLabels(config) {
  return getLabelNamesByPrefix(config, "kind:");
}

function getAreaLabels(config) {
  return getLabelNamesByPrefix(config, "area:");
}

function getStatusLabels(config) {
  return getLabelNamesByPrefix(config, "status:");
}

function getPriorityLabels(config) {
  return getLabelNamesByPrefix(config, "priority:");
}

function getSeverityLabels(config) {
  return getLabelNamesByPrefix(config, "severity:");
}

function getReleaseLabels(config) {
  return getLabelNamesByPrefix(config, "release:");
}

function getAutomationLabels(config) {
  return getLabelNamesByPrefix(config, "automation:");
}

function getLabelsInGroup(config, groupName) {
  validateLabelsConfig(config);

  if (!groupName || typeof groupName !== "string") return [];

  return config.groups?.[groupName] || [];
}

function getMutuallyExclusiveGroup(config, groupName) {
  validateLabelsConfig(config);

  if (!groupName || typeof groupName !== "string") return [];

  return config.mutually_exclusive_groups?.[groupName] || [];
}

function findMutuallyExclusiveGroupForLabel(config, labelName) {
  validateLabelsConfig(config);

  for (const [groupName, labels] of Object.entries(
    config.mutually_exclusive_groups || {},
  )) {
    if (labels.includes(labelName)) {
      return {
        name: groupName,
        labels,
      };
    }
  }

  return null;
}

function getConflictingLabels(config, labels) {
  validateLabelsConfig(config);

  const normalizedLabels = normalizeStringList(labels, "labels");
  const conflicts = [];

  for (const [groupName, groupLabels] of Object.entries(
    config.mutually_exclusive_groups || {},
  )) {
    const matched = normalizedLabels.filter((label) =>
      groupLabels.includes(label),
    );

    if (matched.length > 1) {
      conflicts.push({
        group: groupName,
        labels: matched,
      });
    }
  }

  return conflicts;
}

function removeConflictingLabels(config, currentLabels, labelsToAdd) {
  validateLabelsConfig(config);

  const current = normalizeStringList(currentLabels, "currentLabels");
  const additions = normalizeStringList(labelsToAdd, "labelsToAdd");

  const labelsToRemove = [];

  for (const label of additions) {
    const group = findMutuallyExclusiveGroupForLabel(config, label);

    if (!group) continue;

    for (const existingLabel of current) {
      if (existingLabel !== label && group.labels.includes(existingLabel)) {
        labelsToRemove.push(existingLabel);
      }
    }
  }

  return unique(labelsToRemove);
}

function categorizeLabel(labelName) {
  const name = normalizeLabelName(labelName, "labelName");

  if (name.includes(":")) {
    const [prefix, ...rest] = name.split(":");

    return {
      category: prefix,
      value: rest.join(":"),
      is_scoped: true,
    };
  }

  if (name.startsWith("release")) {
    return {
      category: "release",
      value: name,
      is_scoped: false,
    };
  }

  if (name.includes("security")) {
    return {
      category: "security",
      value: name,
      is_scoped: false,
    };
  }

  if (name.includes("dependency") || name === "dependencies") {
    return {
      category: "dependencies",
      value: name,
      is_scoped: false,
    };
  }

  if (name.includes("automation")) {
    return {
      category: "automation",
      value: name,
      is_scoped: false,
    };
  }

  return {
    category: "general",
    value: name,
    is_scoped: false,
  };
}

function groupLabelsByCategory(config) {
  validateLabelsConfig(config);

  const grouped = {};

  for (const label of config.labels) {
    const category = categorizeLabel(label.name).category;

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push(label);
  }

  return grouped;
}

function isProtectedLabel(config, labelName) {
  validateLabelsConfig(config);

  const name = normalizeLabelName(labelName, "labelName");

  return config.protected_labels.includes(name);
}

function getMissingLabels(config, labels) {
  validateLabelsConfig(config);

  const normalizedLabels = normalizeStringList(labels, "labels");

  return normalizedLabels.filter((label) => !hasLabel(config, label));
}

function validateLabelNamesExist(config, labels, options = {}) {
  const { warnOnly = false } = options;

  const missing = getMissingLabels(config, labels);

  if (!missing.length) return true;

  const message = `Unknown labels referenced: ${missing.join(", ")}`;

  if (warnOnly) {
    logger.warn(message);
    return false;
  }

  throw new Error(message);
}

function labelNeedsUpdate(desiredLabel, remoteLabel) {
  return !labelsEqual(desiredLabel, remoteLabel);
}

function createRemoteLabelMap(remoteLabels) {
  const map = new Map();

  for (const label of normalizeRemoteLabels(remoteLabels)) {
    map.set(label.name, label);
  }

  return map;
}

function planLabelSync(config, remoteLabels = [], options = {}) {
  validateLabelsConfig(config);

  const {
    deleteUnmanaged = config.policy.delete_unmanaged,
    preserveProtectedLabels = config.policy.preserve_protected_labels,
  } = options;

  const remoteMap = createRemoteLabelMap(remoteLabels);
  const desiredMap = new Map(config.labels.map((label) => [label.name, label]));

  const toCreate = [];
  const toUpdate = [];
  const unchanged = [];
  const unmanaged = [];
  const toDelete = [];
  const protectedUnmanaged = [];

  for (const desiredLabel of config.labels) {
    const remoteLabel = remoteMap.get(desiredLabel.name);

    if (!remoteLabel) {
      toCreate.push(desiredLabel);
      continue;
    }

    if (labelNeedsUpdate(desiredLabel, remoteLabel)) {
      toUpdate.push({
        current: remoteLabel,
        desired: desiredLabel,
        changes: diffLabel(desiredLabel, remoteLabel),
      });
      continue;
    }

    unchanged.push(desiredLabel);
  }

  for (const remoteLabel of remoteMap.values()) {
    if (desiredMap.has(remoteLabel.name)) continue;

    unmanaged.push(remoteLabel);

    if (preserveProtectedLabels && isProtectedLabel(config, remoteLabel.name)) {
      protectedUnmanaged.push(remoteLabel);
      continue;
    }

    if (deleteUnmanaged) {
      toDelete.push(remoteLabel);
    }
  }

  return {
    to_create: toCreate,
    to_update: toUpdate,
    to_delete: toDelete,
    unchanged,
    unmanaged,
    protected_unmanaged: protectedUnmanaged,

    counts: {
      create: toCreate.length,
      update: toUpdate.length,
      delete: toDelete.length,
      unchanged: unchanged.length,
      unmanaged: unmanaged.length,
      protected_unmanaged: protectedUnmanaged.length,
    },
  };
}

function diffLabel(desiredLabel, remoteLabel) {
  const desired = normalizeLabelEntry(desiredLabel, 0);
  const remote = normalizeRemoteLabel(remoteLabel);

  const changes = {};

  if (desired.color !== remote.color) {
    changes.color = {
      from: remote.color,
      to: desired.color,
    };
  }

  if (desired.description !== remote.description) {
    changes.description = {
      from: remote.description,
      to: desired.description,
    };
  }

  return changes;
}

function toGitHubLabelCreatePayload(label) {
  const normalized = normalizeLabelEntry(label, 0);

  return {
    name: normalized.name,
    color: normalized.color,
    description: normalized.description,
  };
}

function toGitHubLabelUpdatePayload(label) {
  const normalized = normalizeLabelEntry(label, 0);

  return {
    name: normalized.name,
    color: normalized.color,
    description: normalized.description,
  };
}

function formatLabelForSummary(label) {
  const normalized = normalizeLabelEntry(label, 0);

  return `${normalized.name} (#${normalized.color}) — ${normalized.description}`;
}

function summarizeLabelSyncPlan(plan) {
  return [
    `Create: ${plan.counts.create}`,
    `Update: ${plan.counts.update}`,
    `Delete: ${plan.counts.delete}`,
    `Unchanged: ${plan.counts.unchanged}`,
    `Unmanaged: ${plan.counts.unmanaged}`,
    `Protected unmanaged: ${plan.counts.protected_unmanaged}`,
  ].join("\n");
}

function assertNoLongDescriptions(config) {
  validateLabelsConfig(config);

  const longDescriptions = config.labels.filter(
    (label) => label.description.length > GITHUB_LABEL_DESCRIPTION_MAX_LENGTH,
  );

  if (!longDescriptions.length) return true;

  throw new Error(
    `Labels with descriptions over ${GITHUB_LABEL_DESCRIPTION_MAX_LENGTH} characters: ${longDescriptions
      .map((label) => `${label.name} (${label.description.length})`)
      .join(", ")}`,
  );
}

function assertRequiredLabelsPresent(config, requiredLabels) {
  validateLabelsConfig(config);

  const missing = getMissingLabels(config, requiredLabels);

  if (missing.length) {
    throw new Error(
      `Required labels are missing from labels config: ${missing.join(", ")}`,
    );
  }

  return true;
}

function getRequiredReleaseLabels(config) {
  const labels = getReleaseLabels(config);

  return labels.filter((label) =>
    ["release:major", "release:minor", "release:patch"].includes(label),
  );
}

function assertRequiredReleaseLabelsPresent(config) {
  return assertRequiredLabelsPresent(config, [
    "release:major",
    "release:minor",
    "release:patch",
    "no-release",
  ]);
}

function assertSecurityLabelsPresent(config) {
  return assertRequiredLabelsPresent(config, [
    "kind:security",
    "area:security",
    "needs-security-review",
    "blocked-by-security",
  ]);
}

function assertDependencyLabelsPresent(config) {
  return assertRequiredLabelsPresent(config, [
    "dependencies",
    "no-release",
    "security:dependency",
  ]);
}

if (require.main === module) {
  try {
    const config = loadLabelsConfig();

    assertRequiredReleaseLabelsPresent(config);
    assertSecurityLabelsPresent(config);
    assertDependencyLabelsPresent(config);

    logger.info(
      `Labels config validation passed with ${config.labels.length} labels.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  GITHUB_LABEL_DESCRIPTION_MAX_LENGTH,
  DEFAULT_PROTECTED_LABELS,
  DEFAULT_MUTUALLY_EXCLUSIVE_GROUPS,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadLabelsConfig,
  normalizeLabelsConfig,
  validateLabelsConfig,

  normalizeLabelEntry,
  normalizeLabelName,
  normalizeColor,
  normalizeDescription,
  normalizeRemoteLabel,
  normalizeRemoteLabels,

  detectDuplicateLabelNames,

  getLabel,
  hasLabel,
  listLabels,
  listLabelNames,

  getLabelsByPrefix,
  getLabelNamesByPrefix,
  getLabelsByPrefixes,

  getKindLabels,
  getAreaLabels,
  getStatusLabels,
  getPriorityLabels,
  getSeverityLabels,
  getReleaseLabels,
  getAutomationLabels,

  getLabelsInGroup,
  getMutuallyExclusiveGroup,
  findMutuallyExclusiveGroupForLabel,
  getConflictingLabels,
  removeConflictingLabels,

  categorizeLabel,
  groupLabelsByCategory,

  isProtectedLabel,
  getMissingLabels,
  validateLabelNamesExist,

  labelsEqual,
  labelNeedsUpdate,
  diffLabel,

  createRemoteLabelMap,
  planLabelSync,

  toGitHubLabelCreatePayload,
  toGitHubLabelUpdatePayload,

  formatLabelForSummary,
  summarizeLabelSyncPlan,

  assertNoLongDescriptions,
  assertRequiredLabelsPresent,
  getRequiredReleaseLabels,
  assertRequiredReleaseLabelsPresent,
  assertSecurityLabelsPresent,
  assertDependencyLabelsPresent,
};
