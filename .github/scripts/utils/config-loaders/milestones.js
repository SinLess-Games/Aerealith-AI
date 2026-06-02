// .github/scripts/utils/config-loaders/milestones.js
// =============================================================================
// Aerealith AI Milestones Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query `.github/milestones.yaml`.
//
// Used by:
//   - .github/scripts/repo/sync-milestones.js
//   - .github/scripts/repo/validate-milestones.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/determine-release-version.js
//   - .github/scripts/release/validate-release-source.js
//
// Supported `.github/milestones.yaml` formats:
//
//   Preferred:
//     - title: V0.1.0 — Foundation
//       description: Foundational repository, workspace, and platform setup.
//       state: open
//
//   Also supported:
//     milestones:
//       - title: V0.1.0 — Foundation
//         description: Foundational repository, workspace, and platform setup.
//         state: open
//
// Notes:
//   - Milestone titles must be unique.
//   - GitHub milestone states are `open` or `closed`.
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - Milestone assignment scripts should not create milestones directly.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const logger = require("../logger");

const DEFAULT_CONFIG_PATH = ".github/milestones.yaml";

const VALID_MILESTONE_STATES = ["open", "closed"];

const DEFAULT_POLICY = {
  dry_run_supported: true,
  debug_supported: true,
  create_missing: true,
  update_existing: true,
  close_when_state_closed: true,
  reopen_when_state_open: true,
  delete_unmanaged: false,
  close_unmanaged: false,
  report_unmanaged: true,
  fail_on_duplicate_titles: true,
  require_description: true,
  require_state: true,
};

const DEFAULT_PROTECTED_MILESTONES = [
  "Backlog",
  "Security — Strict Pull Request Gate",
  "Security — Dependency Vulnerability Response",
  "Security — Supply Chain Integrity",
  "Cloudflare — Production Environment",
  "V1.0.0 — General Availability",
];

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

function normalizeMilestoneState(value, fieldPath = "milestone.state") {
  const state = normalizeString(value, fieldPath, {
    fallback: "open",
    allowEmpty: false,
  }).toLowerCase();

  if (!VALID_MILESTONE_STATES.includes(state)) {
    throw new TypeError(
      `${fieldPath} must be one of: ${VALID_MILESTONE_STATES.join(", ")}. Received: ${value}`,
    );
  }

  return state;
}

function normalizeMilestoneTitle(value, fieldPath = "milestone.title") {
  const title = normalizeString(value, fieldPath, {
    allowEmpty: false,
  });

  if (title.length > 256) {
    logger.warn(
      `Milestone "${title}" is longer than 256 characters. GitHub may reject overly long milestone titles.`,
    );
  }

  return title;
}

function normalizeMilestoneDescription(
  value,
  fieldPath = "milestone.description",
) {
  const description = normalizeString(value, fieldPath, {
    fallback: "",
    allowEmpty: true,
  });

  return description.trim();
}

function normalizePolicy(policy) {
  policy = normalizeObject(policy, "policy");

  return {
    ...DEFAULT_POLICY,
    ...policy,

    dry_run_supported: normalizeBoolean(
      policy.dry_run_supported,
      DEFAULT_POLICY.dry_run_supported,
    ),

    debug_supported: normalizeBoolean(
      policy.debug_supported,
      DEFAULT_POLICY.debug_supported,
    ),

    create_missing: normalizeBoolean(
      policy.create_missing,
      DEFAULT_POLICY.create_missing,
    ),

    update_existing: normalizeBoolean(
      policy.update_existing,
      DEFAULT_POLICY.update_existing,
    ),

    close_when_state_closed: normalizeBoolean(
      policy.close_when_state_closed,
      DEFAULT_POLICY.close_when_state_closed,
    ),

    reopen_when_state_open: normalizeBoolean(
      policy.reopen_when_state_open,
      DEFAULT_POLICY.reopen_when_state_open,
    ),

    delete_unmanaged: normalizeBoolean(
      policy.delete_unmanaged,
      DEFAULT_POLICY.delete_unmanaged,
    ),

    close_unmanaged: normalizeBoolean(
      policy.close_unmanaged,
      DEFAULT_POLICY.close_unmanaged,
    ),

    report_unmanaged: normalizeBoolean(
      policy.report_unmanaged,
      DEFAULT_POLICY.report_unmanaged,
    ),

    fail_on_duplicate_titles: normalizeBoolean(
      policy.fail_on_duplicate_titles,
      DEFAULT_POLICY.fail_on_duplicate_titles,
    ),

    require_description: normalizeBoolean(
      policy.require_description,
      DEFAULT_POLICY.require_description,
    ),

    require_state: normalizeBoolean(
      policy.require_state,
      DEFAULT_POLICY.require_state,
    ),
  };
}

function normalizeGroups(groups) {
  groups = normalizeObject(groups, "groups");

  return Object.fromEntries(
    Object.entries(groups).map(([groupName, milestones]) => [
      groupName,
      normalizeStringList(milestones, `groups.${groupName}`),
    ]),
  );
}

function normalizeMilestoneEntry(entry, index = 0) {
  if (!isPlainObject(entry)) {
    throw new TypeError(`milestones[${index}] must be an object.`);
  }

  const fieldPath = `milestones[${index}]`;

  const title = normalizeMilestoneTitle(entry.title, `${fieldPath}.title`);
  const description = normalizeMilestoneDescription(
    entry.description,
    `${fieldPath}.description`,
  );
  const state = normalizeMilestoneState(entry.state, `${fieldPath}.state`);

  return {
    ...entry,
    title,
    description,
    state,
  };
}

function normalizeRawMilestonesConfig(rawConfig) {
  if (Array.isArray(rawConfig)) {
    return {
      version: 1,
      policy: {},
      protected_milestones: DEFAULT_PROTECTED_MILESTONES,
      groups: {},
      milestones: rawConfig,
    };
  }

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Milestones config must be a YAML array or object.");
  }

  return {
    version: rawConfig.version || 1,
    policy: rawConfig.policy || {},
    protected_milestones:
      rawConfig.protected_milestones || DEFAULT_PROTECTED_MILESTONES,
    groups: rawConfig.groups || {},
    milestones: rawConfig.milestones || [],
    ...rawConfig,
  };
}

function buildMilestoneMap(milestones) {
  const milestoneMap = {};

  for (const milestone of milestones) {
    milestoneMap[milestone.title] = milestone;
  }

  return milestoneMap;
}

function normalizeMilestonesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  const normalizedRaw = normalizeRawMilestonesConfig(rawConfig);

  if (!Array.isArray(normalizedRaw.milestones)) {
    throw new TypeError("milestones must be an array.");
  }

  const policy = normalizePolicy(normalizedRaw.policy);

  const milestones = normalizedRaw.milestones.map((entry, index) =>
    normalizeMilestoneEntry(entry, index),
  );

  const milestoneMap = buildMilestoneMap(milestones);

  return {
    ...normalizedRaw,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: Number(normalizedRaw.version || 1),
    policy,
    protected_milestones: unique([
      ...DEFAULT_PROTECTED_MILESTONES,
      ...normalizeStringList(
        normalizedRaw.protected_milestones,
        "protected_milestones",
      ),
    ]),
    groups: normalizeGroups(normalizedRaw.groups),
    milestones,
    milestone_map: milestoneMap,
  };
}

function detectDuplicateMilestoneTitles(milestones) {
  const seen = new Set();
  const duplicates = [];

  for (const milestone of milestones || []) {
    if (!milestone?.title) continue;

    if (seen.has(milestone.title)) {
      duplicates.push(milestone.title);
    } else {
      seen.add(milestone.title);
    }
  }

  return unique(duplicates);
}

function validateMilestoneEntry(milestone, fieldPath) {
  if (!isPlainObject(milestone)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (typeof milestone.title !== "string" || !milestone.title.trim()) {
    throw new TypeError(`${fieldPath}.title must be a non-empty string.`);
  }

  if (typeof milestone.description !== "string") {
    throw new TypeError(`${fieldPath}.description must be a string.`);
  }

  if (!VALID_MILESTONE_STATES.includes(milestone.state)) {
    throw new TypeError(
      `${fieldPath}.state must be one of: ${VALID_MILESTONE_STATES.join(", ")}`,
    );
  }
}

function validateMilestonesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Milestones config must be an object.");
  }

  if (!Array.isArray(config.milestones)) {
    throw new TypeError("milestones must be an array.");
  }

  const duplicates = detectDuplicateMilestoneTitles(config.milestones);

  if (duplicates.length && config.policy.fail_on_duplicate_titles) {
    throw new TypeError(
      `Duplicate milestone titles detected: ${duplicates.join(", ")}`,
    );
  }

  config.milestones.forEach((milestone, index) =>
    validateMilestoneEntry(milestone, `milestones[${index}]`),
  );

  if (!config.milestones.length) {
    logger.warn("No milestones were found in .github/milestones.yaml.");
  }

  if (config.policy.require_description) {
    const missingDescriptions = config.milestones.filter(
      (milestone) => !milestone.description.trim(),
    );

    if (missingDescriptions.length) {
      throw new TypeError(
        `Milestones missing descriptions: ${missingDescriptions
          .map((milestone) => milestone.title)
          .join(", ")}`,
      );
    }
  }

  for (const [groupName, groupMilestones] of Object.entries(
    config.groups || {},
  )) {
    if (!Array.isArray(groupMilestones)) {
      throw new TypeError(`groups.${groupName} must be an array.`);
    }

    for (const title of groupMilestones) {
      if (!config.milestone_map[title]) {
        logger.warn(
          `Group "${groupName}" references missing milestone "${title}".`,
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

function loadMilestonesConfig(options = {}) {
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
        `Milestones config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeMilestonesConfig([], {
        configPath: absolutePath,
        repoRoot,
      });
    }

    throw new Error(`Milestones config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeMilestonesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateMilestonesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded milestones config from ${displayPath}.`);
      logger.debug(
        `Milestones config contains ${normalizedConfig.milestones.length} milestones.`,
      );
      logger.dump("milestones config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load milestones config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function normalizeRemoteMilestone(remoteMilestone) {
  if (!isPlainObject(remoteMilestone)) {
    throw new TypeError("remoteMilestone must be an object.");
  }

  return {
    title: normalizeMilestoneTitle(
      remoteMilestone.title,
      "remoteMilestone.title",
    ),
    description: normalizeMilestoneDescription(
      remoteMilestone.description,
      "remoteMilestone.description",
    ),
    state: normalizeMilestoneState(
      remoteMilestone.state,
      "remoteMilestone.state",
    ),
    number: remoteMilestone.number || null,
    id: remoteMilestone.id || null,
    node_id: remoteMilestone.node_id || null,
    url: remoteMilestone.url || null,
    html_url: remoteMilestone.html_url || null,
    due_on: remoteMilestone.due_on || null,
    open_issues: Number(remoteMilestone.open_issues || 0),
    closed_issues: Number(remoteMilestone.closed_issues || 0),
    created_at: remoteMilestone.created_at || null,
    updated_at: remoteMilestone.updated_at || null,
    closed_at: remoteMilestone.closed_at || null,
  };
}

function normalizeRemoteMilestones(remoteMilestones) {
  if (!Array.isArray(remoteMilestones)) {
    throw new TypeError("remoteMilestones must be an array.");
  }

  return remoteMilestones.map((milestone) =>
    normalizeRemoteMilestone(milestone),
  );
}

function createRemoteMilestoneMap(remoteMilestones) {
  const map = new Map();

  for (const milestone of normalizeRemoteMilestones(remoteMilestones)) {
    map.set(milestone.title, milestone);
  }

  return map;
}

function milestonesEqual(desiredMilestone, remoteMilestone) {
  const desired = normalizeMilestoneEntry(desiredMilestone, 0);
  const remote = normalizeRemoteMilestone(remoteMilestone);

  return (
    desired.title === remote.title &&
    desired.description === remote.description &&
    desired.state === remote.state
  );
}

function diffMilestone(desiredMilestone, remoteMilestone) {
  const desired = normalizeMilestoneEntry(desiredMilestone, 0);
  const remote = normalizeRemoteMilestone(remoteMilestone);

  const changes = {};

  if (desired.description !== remote.description) {
    changes.description = {
      from: remote.description,
      to: desired.description,
    };
  }

  if (desired.state !== remote.state) {
    changes.state = {
      from: remote.state,
      to: desired.state,
    };
  }

  return changes;
}

function milestoneNeedsUpdate(desiredMilestone, remoteMilestone) {
  return !milestonesEqual(desiredMilestone, remoteMilestone);
}

function getMilestone(config, title) {
  validateMilestonesConfig(config);

  if (!title || typeof title !== "string") return null;

  return config.milestone_map[title] || null;
}

function hasMilestone(config, title) {
  return Boolean(getMilestone(config, title));
}

function listMilestones(config) {
  validateMilestonesConfig(config);
  return [...config.milestones];
}

function listMilestoneTitles(config) {
  validateMilestonesConfig(config);
  return config.milestones.map((milestone) => milestone.title);
}

function listOpenMilestones(config) {
  validateMilestonesConfig(config);
  return config.milestones.filter((milestone) => milestone.state === "open");
}

function listClosedMilestones(config) {
  validateMilestonesConfig(config);
  return config.milestones.filter((milestone) => milestone.state === "closed");
}

function listMilestoneTitlesByState(config, state) {
  const normalizedState = normalizeMilestoneState(state, "state");

  return listMilestones(config)
    .filter((milestone) => milestone.state === normalizedState)
    .map((milestone) => milestone.title);
}

function getMilestonesInGroup(config, groupName) {
  validateMilestonesConfig(config);

  if (!groupName || typeof groupName !== "string") return [];

  return config.groups?.[groupName] || [];
}

function getMilestoneObjectsInGroup(config, groupName) {
  return getMilestonesInGroup(config, groupName)
    .map((title) => getMilestone(config, title))
    .filter(Boolean);
}

function getMilestonesByPrefix(config, prefix) {
  validateMilestonesConfig(config);

  const normalizedPrefix = normalizeString(prefix, "prefix", {
    allowEmpty: false,
  });

  return config.milestones.filter((milestone) =>
    milestone.title.startsWith(normalizedPrefix),
  );
}

function getMilestoneTitlesByPrefix(config, prefix) {
  return getMilestonesByPrefix(config, prefix).map(
    (milestone) => milestone.title,
  );
}

function getVersionMilestones(config) {
  validateMilestonesConfig(config);

  return config.milestones.filter((milestone) =>
    /^V[0-9]+\.[0-9]+\.[0-9]+/.test(milestone.title),
  );
}

function getOpenVersionMilestones(config) {
  return getVersionMilestones(config).filter(
    (milestone) => milestone.state === "open",
  );
}

function getBacklogMilestone(config) {
  return getMilestone(config, "Backlog");
}

function isProtectedMilestone(config, title) {
  validateMilestonesConfig(config);

  if (!title || typeof title !== "string") return false;

  return config.protected_milestones.includes(title);
}

function getMissingMilestones(config, titles) {
  validateMilestonesConfig(config);

  const normalizedTitles = normalizeStringList(titles, "titles");

  return normalizedTitles.filter((title) => !hasMilestone(config, title));
}

function validateMilestoneTitlesExist(config, titles, options = {}) {
  const { warnOnly = false } = options;

  const missing = getMissingMilestones(config, titles);

  if (!missing.length) return true;

  const message = `Unknown milestones referenced: ${missing.join(", ")}`;

  if (warnOnly) {
    logger.warn(message);
    return false;
  }

  throw new Error(message);
}

function planMilestoneSync(config, remoteMilestones = [], options = {}) {
  validateMilestonesConfig(config);

  const {
    createMissing = config.policy.create_missing,
    updateExisting = config.policy.update_existing,
    closeWhenStateClosed = config.policy.close_when_state_closed,
    reopenWhenStateOpen = config.policy.reopen_when_state_open,
    deleteUnmanaged = config.policy.delete_unmanaged,
    closeUnmanaged = config.policy.close_unmanaged,
    reportUnmanaged = config.policy.report_unmanaged,
  } = options;

  const remoteMap = createRemoteMilestoneMap(remoteMilestones);
  const desiredMap = new Map(
    config.milestones.map((milestone) => [milestone.title, milestone]),
  );

  const toCreate = [];
  const toUpdate = [];
  const toClose = [];
  const toReopen = [];
  const unchanged = [];
  const unmanaged = [];
  const toDelete = [];
  const unmanagedToClose = [];
  const protectedUnmanaged = [];

  for (const desiredMilestone of config.milestones) {
    const remoteMilestone = remoteMap.get(desiredMilestone.title);

    if (!remoteMilestone) {
      if (createMissing) {
        toCreate.push(desiredMilestone);
      }

      continue;
    }

    const changes = diffMilestone(desiredMilestone, remoteMilestone);

    if (!Object.keys(changes).length) {
      unchanged.push(desiredMilestone);
      continue;
    }

    if (changes.state?.to === "closed" && closeWhenStateClosed) {
      toClose.push({
        current: remoteMilestone,
        desired: desiredMilestone,
        changes,
      });
    }

    if (changes.state?.to === "open" && reopenWhenStateOpen) {
      toReopen.push({
        current: remoteMilestone,
        desired: desiredMilestone,
        changes,
      });
    }

    if (updateExisting) {
      toUpdate.push({
        current: remoteMilestone,
        desired: desiredMilestone,
        changes,
      });
    }
  }

  for (const remoteMilestone of remoteMap.values()) {
    if (desiredMap.has(remoteMilestone.title)) continue;

    if (reportUnmanaged) {
      unmanaged.push(remoteMilestone);
    }

    if (isProtectedMilestone(config, remoteMilestone.title)) {
      protectedUnmanaged.push(remoteMilestone);
      continue;
    }

    if (deleteUnmanaged) {
      toDelete.push(remoteMilestone);
      continue;
    }

    if (closeUnmanaged && remoteMilestone.state === "open") {
      unmanagedToClose.push(remoteMilestone);
    }
  }

  return {
    to_create: toCreate,
    to_update: toUpdate,
    to_close: toClose,
    to_reopen: toReopen,
    to_delete: toDelete,
    unmanaged_to_close: unmanagedToClose,
    unchanged,
    unmanaged,
    protected_unmanaged: protectedUnmanaged,

    counts: {
      create: toCreate.length,
      update: toUpdate.length,
      close: toClose.length,
      reopen: toReopen.length,
      delete: toDelete.length,
      unmanaged_close: unmanagedToClose.length,
      unchanged: unchanged.length,
      unmanaged: unmanaged.length,
      protected_unmanaged: protectedUnmanaged.length,
    },
  };
}

function toGitHubMilestoneCreatePayload(milestone) {
  const normalized = normalizeMilestoneEntry(milestone, 0);

  return {
    title: normalized.title,
    description: normalized.description,
    state: normalized.state,
  };
}

function toGitHubMilestoneUpdatePayload(milestone) {
  const normalized = normalizeMilestoneEntry(milestone, 0);

  return {
    title: normalized.title,
    description: normalized.description,
    state: normalized.state,
  };
}

function formatMilestoneForSummary(milestone) {
  const normalized = normalizeMilestoneEntry(milestone, 0);

  return `${normalized.title} [${normalized.state}] — ${normalized.description}`;
}

function summarizeMilestoneSyncPlan(plan) {
  return [
    `Create: ${plan.counts.create}`,
    `Update: ${plan.counts.update}`,
    `Close: ${plan.counts.close}`,
    `Reopen: ${plan.counts.reopen}`,
    `Delete: ${plan.counts.delete}`,
    `Close unmanaged: ${plan.counts.unmanaged_close}`,
    `Unchanged: ${plan.counts.unchanged}`,
    `Unmanaged: ${plan.counts.unmanaged}`,
    `Protected unmanaged: ${plan.counts.protected_unmanaged}`,
  ].join("\n");
}

function assertBacklogMilestonePresent(config) {
  validateMilestonesConfig(config);

  if (!hasMilestone(config, "Backlog")) {
    throw new Error("Required milestone missing: Backlog");
  }

  return true;
}

function assertVersionMilestonesPresent(config, requiredVersions) {
  validateMilestonesConfig(config);

  const missing = getMissingMilestones(config, requiredVersions);

  if (missing.length) {
    throw new Error(
      `Required version milestones missing: ${missing.join(", ")}`,
    );
  }

  return true;
}

function assertSecurityMilestonesPresent(config) {
  return validateMilestoneTitlesExist(config, [
    "Security — Strict Pull Request Gate",
    "Security — Main Branch Monitoring",
    "Security — Dependency Vulnerability Response",
    "Security — Supply Chain Integrity",
  ]);
}

function assertDependencyMilestonesPresent(config) {
  return validateMilestoneTitlesExist(config, [
    "Dependencies — Renovate Weekly Updates",
    "Dependencies — Major Upgrade Program",
    "Dependencies — Mend Management",
  ]);
}

function assertReleaseMilestonesPresent(config) {
  return validateMilestoneTitlesExist(config, [
    "V0.5.0 — Release Automation",
    "V0.6.0 — Publishing Pipeline",
    "V1.0.0 — General Availability",
  ]);
}

function assertCloudflareMilestonesPresent(config) {
  return validateMilestoneTitlesExist(config, [
    "Cloudflare — Preview Environments",
    "Cloudflare — Staging Environment",
    "Cloudflare — Production Environment",
  ]);
}

if (require.main === module) {
  try {
    const config = loadMilestonesConfig();

    assertBacklogMilestonePresent(config);
    assertSecurityMilestonesPresent(config);
    assertDependencyMilestonesPresent(config);
    assertReleaseMilestonesPresent(config);
    assertCloudflareMilestonesPresent(config);

    logger.info(
      `Milestones config validation passed with ${config.milestones.length} milestones.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  VALID_MILESTONE_STATES,
  DEFAULT_POLICY,
  DEFAULT_PROTECTED_MILESTONES,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadMilestonesConfig,
  normalizeMilestonesConfig,
  validateMilestonesConfig,

  normalizeMilestoneEntry,
  normalizeMilestoneTitle,
  normalizeMilestoneDescription,
  normalizeMilestoneState,

  normalizeRemoteMilestone,
  normalizeRemoteMilestones,
  createRemoteMilestoneMap,

  detectDuplicateMilestoneTitles,

  milestonesEqual,
  milestoneNeedsUpdate,
  diffMilestone,

  getMilestone,
  hasMilestone,
  listMilestones,
  listMilestoneTitles,
  listOpenMilestones,
  listClosedMilestones,
  listMilestoneTitlesByState,

  getMilestonesInGroup,
  getMilestoneObjectsInGroup,

  getMilestonesByPrefix,
  getMilestoneTitlesByPrefix,

  getVersionMilestones,
  getOpenVersionMilestones,
  getBacklogMilestone,

  isProtectedMilestone,
  getMissingMilestones,
  validateMilestoneTitlesExist,

  planMilestoneSync,

  toGitHubMilestoneCreatePayload,
  toGitHubMilestoneUpdatePayload,

  formatMilestoneForSummary,
  summarizeMilestoneSyncPlan,

  assertBacklogMilestonePresent,
  assertVersionMilestonesPresent,
  assertSecurityMilestonesPresent,
  assertDependencyMilestonesPresent,
  assertReleaseMilestonesPresent,
  assertCloudflareMilestonesPresent,
};
