// .github/scripts/utils/config-loaders/projects.js
// =============================================================================
// Aerealith AI GitHub Project Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query `.github/projects/kanban-board.yaml`.
//
// Used by:
//   - .github/scripts/repo/sync-projects.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/link-issues-prs.js
//
// Supported `.github/projects/kanban-board.yaml` structure:
//
//   project:
//     name: "Aerealith AI Task Board"
//     description: "Central Kanban board."
//     owner: "SinLess-Games"
//     public: true
//
//   fields:
//     - type: single_select
//       name: Status
//       options:
//         - { name: "Todo", color: "gray" }
//
//   views:
//     - name: Kanban
//       layout: board
//       filters: ""
//       fields: ["Status", "Priority"]
//       group_by: Status
//
// Notes:
//   - This loader does not mutate GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - Project sync scripts should perform GitHub API mutations.
//   - This loader normalizes `grey` to `gray` because GitHub Project fields use
//     the American color spelling.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const logger = require("../logger");

const DEFAULT_CONFIG_PATH = ".github/projects/kanban-board.yaml";

const VALID_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "single_select",
  "iteration",
  "milestone",
  "labels",
  "assignees",
  "reviewers",
  "repository",
  "linked_pull_requests",
  "tracks",
  "tracked_by",
];

const VALID_VIEW_LAYOUTS = ["table", "board", "roadmap"];

const VALID_SINGLE_SELECT_COLORS = [
  "gray",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
];

const DEFAULT_PROJECT = {
  name: "Aerealith AI Task Board",
  description: "Central project board for tracking Aerealith AI development.",
  owner: "SinLess-Games",
  public: true,
};

const DEFAULT_POLICY = {
  dry_run_supported: true,
  debug_supported: true,
  create_missing_project: true,
  update_existing_project: true,
  create_missing_fields: true,
  update_existing_fields: true,
  create_missing_views: true,
  update_existing_views: true,
  delete_unmanaged_project: false,
  delete_unmanaged_fields: false,
  delete_unmanaged_views: false,
  archive_completed_items: true,
  archive_completed_after_days: 30,
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

function normalizeNumber(value, fallback = 0, fieldPath = "value") {
  if (value === undefined || value === null || value === "") return fallback;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${fieldPath} must be a finite number.`);
  }

  return number;
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

function normalizeProjectOwner(value, fieldPath = "project.owner") {
  return normalizeString(value, fieldPath, {
    fallback: DEFAULT_PROJECT.owner,
    allowEmpty: false,
  }).replace(/^@/, "");
}

function normalizeProjectName(value, fieldPath = "project.name") {
  return normalizeString(value, fieldPath, {
    fallback: DEFAULT_PROJECT.name,
    allowEmpty: false,
  });
}

function normalizeProjectDescription(value, fieldPath = "project.description") {
  return normalizeString(value, fieldPath, {
    fallback: DEFAULT_PROJECT.description,
    allowEmpty: true,
  });
}

function normalizeFieldType(value, fieldPath = "field.type") {
  const type = normalizeString(value, fieldPath, {
    allowEmpty: false,
  }).toLowerCase();

  if (!VALID_FIELD_TYPES.includes(type)) {
    throw new TypeError(
      `${fieldPath} must be one of: ${VALID_FIELD_TYPES.join(", ")}. Received: ${value}`,
    );
  }

  return type;
}

function normalizeViewLayout(value, fieldPath = "view.layout") {
  const layout = normalizeString(value, fieldPath, {
    fallback: "table",
    allowEmpty: false,
  }).toLowerCase();

  if (!VALID_VIEW_LAYOUTS.includes(layout)) {
    throw new TypeError(
      `${fieldPath} must be one of: ${VALID_VIEW_LAYOUTS.join(", ")}. Received: ${value}`,
    );
  }

  return layout;
}

function normalizeSingleSelectColor(value, fieldPath = "option.color") {
  let color = normalizeString(value, fieldPath, {
    fallback: "gray",
    allowEmpty: false,
  }).toLowerCase();

  if (color === "grey") {
    color = "gray";
  }

  if (!VALID_SINGLE_SELECT_COLORS.includes(color)) {
    throw new TypeError(
      `${fieldPath} must be one of: ${VALID_SINGLE_SELECT_COLORS.join(", ")}. Received: ${value}`,
    );
  }

  return color;
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

    create_missing_project: normalizeBoolean(
      policy.create_missing_project,
      DEFAULT_POLICY.create_missing_project,
    ),

    update_existing_project: normalizeBoolean(
      policy.update_existing_project,
      DEFAULT_POLICY.update_existing_project,
    ),

    create_missing_fields: normalizeBoolean(
      policy.create_missing_fields,
      DEFAULT_POLICY.create_missing_fields,
    ),

    update_existing_fields: normalizeBoolean(
      policy.update_existing_fields,
      DEFAULT_POLICY.update_existing_fields,
    ),

    create_missing_views: normalizeBoolean(
      policy.create_missing_views,
      DEFAULT_POLICY.create_missing_views,
    ),

    update_existing_views: normalizeBoolean(
      policy.update_existing_views,
      DEFAULT_POLICY.update_existing_views,
    ),

    delete_unmanaged_project: normalizeBoolean(
      policy.delete_unmanaged_project,
      DEFAULT_POLICY.delete_unmanaged_project,
    ),

    delete_unmanaged_fields: normalizeBoolean(
      policy.delete_unmanaged_fields,
      DEFAULT_POLICY.delete_unmanaged_fields,
    ),

    delete_unmanaged_views: normalizeBoolean(
      policy.delete_unmanaged_views,
      DEFAULT_POLICY.delete_unmanaged_views,
    ),

    archive_completed_items: normalizeBoolean(
      policy.archive_completed_items,
      DEFAULT_POLICY.archive_completed_items,
    ),

    archive_completed_after_days: normalizeNumber(
      policy.archive_completed_after_days,
      DEFAULT_POLICY.archive_completed_after_days,
      "policy.archive_completed_after_days",
    ),
  };
}

function normalizeProject(project) {
  project = normalizeObject(project, "project");

  return {
    ...project,
    name: normalizeProjectName(project.name),
    description: normalizeProjectDescription(project.description),
    owner: normalizeProjectOwner(project.owner),
    public: normalizeBoolean(project.public, DEFAULT_PROJECT.public),
  };
}

function normalizeFieldOption(option, index, fieldPath) {
  if (!isPlainObject(option)) {
    throw new TypeError(`${fieldPath}.options[${index}] must be an object.`);
  }

  return {
    ...option,

    name: normalizeString(option.name, `${fieldPath}.options[${index}].name`, {
      allowEmpty: false,
    }),

    color: normalizeSingleSelectColor(
      option.color,
      `${fieldPath}.options[${index}].color`,
    ),

    description: normalizeNullableString(
      option.description,
      `${fieldPath}.options[${index}].description`,
    ),
  };
}

function normalizeFieldOptions(options, fieldPath) {
  if (options === undefined || options === null) return [];

  if (!Array.isArray(options)) {
    throw new TypeError(`${fieldPath}.options must be an array.`);
  }

  return options.map((option, index) =>
    normalizeFieldOption(option, index, fieldPath),
  );
}

function normalizeIterationConfiguration(configuration, fieldPath) {
  configuration = normalizeObject(configuration, fieldPath);

  return {
    ...configuration,
    start_day: normalizeNumber(
      configuration.start_day,
      1,
      `${fieldPath}.start_day`,
    ),
    duration: normalizeNumber(
      configuration.duration,
      14,
      `${fieldPath}.duration`,
    ),
    iterations: normalizeNumber(
      configuration.iterations,
      10,
      `${fieldPath}.iterations`,
    ),
  };
}

function normalizeField(field, index) {
  if (!isPlainObject(field)) {
    throw new TypeError(`fields[${index}] must be an object.`);
  }

  const fieldPath = `fields[${index}]`;
  const type = normalizeFieldType(field.type, `${fieldPath}.type`);

  const normalized = {
    ...field,

    type,

    name: normalizeString(field.name, `${fieldPath}.name`, {
      allowEmpty: false,
    }),

    description: normalizeNullableString(
      field.description,
      `${fieldPath}.description`,
    ),

    options: normalizeFieldOptions(field.options, fieldPath),

    required: normalizeBoolean(field.required, false),

    hidden: normalizeBoolean(field.hidden, false),
  };

  if (type === "single_select" && !normalized.options.length) {
    throw new TypeError(
      `${fieldPath}.options cannot be empty for single_select fields.`,
    );
  }

  if (type !== "single_select" && normalized.options.length) {
    logger.warn(
      `${fieldPath} has options, but field type "${type}" does not use single-select options.`,
    );
  }

  if (type === "iteration") {
    normalized.configuration = normalizeIterationConfiguration(
      field.configuration,
      `${fieldPath}.configuration`,
    );
  }

  return normalized;
}

function normalizeFields(fields) {
  if (fields === undefined || fields === null) return [];

  if (!Array.isArray(fields)) {
    throw new TypeError("fields must be an array.");
  }

  return fields.map((field, index) => normalizeField(field, index));
}

function normalizeView(view, index) {
  if (!isPlainObject(view)) {
    throw new TypeError(`views[${index}] must be an object.`);
  }

  const fieldPath = `views[${index}]`;

  return {
    ...view,

    name: normalizeString(view.name, `${fieldPath}.name`, {
      allowEmpty: false,
    }),

    layout: normalizeViewLayout(view.layout, `${fieldPath}.layout`),

    filters: normalizeString(view.filters, `${fieldPath}.filters`, {
      fallback: "",
      allowEmpty: true,
    }),

    fields: normalizeStringList(view.fields, `${fieldPath}.fields`),

    group_by: normalizeNullableString(view.group_by, `${fieldPath}.group_by`),

    sort_by: normalizeStringList(view.sort_by, `${fieldPath}.sort_by`),

    visible_fields: normalizeStringList(
      view.visible_fields,
      `${fieldPath}.visible_fields`,
    ),

    hidden_fields: normalizeStringList(
      view.hidden_fields,
      `${fieldPath}.hidden_fields`,
    ),

    number:
      view.number === undefined || view.number === null
        ? null
        : normalizeNumber(view.number, null, `${fieldPath}.number`),
  };
}

function normalizeViews(views) {
  if (views === undefined || views === null) return [];

  if (!Array.isArray(views)) {
    throw new TypeError("views must be an array.");
  }

  return views.map((view, index) => normalizeView(view, index));
}

function normalizeAutomation(automation) {
  automation = normalizeObject(automation, "automation");

  const autoAdd = normalizeObject(automation.auto_add, "automation.auto_add");
  const statusMapping = normalizeObject(
    automation.status_mapping,
    "automation.status_mapping",
  );
  const priorityMapping = normalizeObject(
    automation.priority_mapping,
    "automation.priority_mapping",
  );
  const areaMapping = normalizeObject(
    automation.area_mapping,
    "automation.area_mapping",
  );

  return {
    ...automation,

    enabled: normalizeBoolean(automation.enabled, true),

    auto_add: {
      ...autoAdd,
      issues: normalizeBoolean(autoAdd.issues, true),
      pull_requests: normalizeBoolean(autoAdd.pull_requests, true),
      draft_pull_requests: normalizeBoolean(autoAdd.draft_pull_requests, true),
      dependency_pull_requests: normalizeBoolean(
        autoAdd.dependency_pull_requests,
        true,
      ),
    },

    status_mapping: Object.fromEntries(
      Object.entries(statusMapping).map(([key, value]) => [
        key,
        normalizeString(value, `automation.status_mapping.${key}`),
      ]),
    ),

    priority_mapping: Object.fromEntries(
      Object.entries(priorityMapping).map(([key, value]) => [
        key,
        normalizeString(value, `automation.priority_mapping.${key}`),
      ]),
    ),

    area_mapping: Object.fromEntries(
      Object.entries(areaMapping).map(([key, value]) => [
        key,
        normalizeString(value, `automation.area_mapping.${key}`),
      ]),
    ),
  };
}

function normalizeReporting(reporting) {
  reporting = normalizeObject(reporting, "reporting");

  const summary = normalizeObject(reporting.summary, "reporting.summary");

  return {
    ...reporting,

    add_workflow_summary: normalizeBoolean(
      reporting.add_workflow_summary,
      true,
    ),
    add_pr_comment_on_failure: normalizeBoolean(
      reporting.add_pr_comment_on_failure,
      true,
    ),
    add_pr_comment_on_success: normalizeBoolean(
      reporting.add_pr_comment_on_success,
      false,
    ),

    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [
        key,
        normalizeBoolean(value, true),
      ]),
    ),
  };
}

function normalizeSafety(safety) {
  safety = normalizeObject(safety, "safety");

  return {
    ...safety,

    dry_run_supported: normalizeBoolean(safety.dry_run_supported, true),
    debug_supported: normalizeBoolean(safety.debug_supported, true),

    do_not_delete_project: normalizeBoolean(safety.do_not_delete_project, true),
    do_not_delete_fields: normalizeBoolean(safety.do_not_delete_fields, true),
    do_not_delete_views: normalizeBoolean(safety.do_not_delete_views, true),
    do_not_remove_items: normalizeBoolean(safety.do_not_remove_items, true),
    do_not_archive_open_items: normalizeBoolean(
      safety.do_not_archive_open_items,
      true,
    ),
    do_not_create_duplicate_project: normalizeBoolean(
      safety.do_not_create_duplicate_project,
      true,
    ),

    protected_fields: normalizeStringList(
      safety.protected_fields,
      "safety.protected_fields",
    ),

    protected_views: normalizeStringList(
      safety.protected_views,
      "safety.protected_views",
    ),
  };
}

function buildFieldMap(fields) {
  const fieldMap = {};

  for (const field of fields) {
    fieldMap[field.name] = field;
  }

  return fieldMap;
}

function buildViewMap(views) {
  const viewMap = {};

  for (const view of views) {
    viewMap[view.name] = view;
  }

  return viewMap;
}

function normalizeProjectsConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Project config must be a YAML object.");
  }

  const fields = normalizeFields(rawConfig.fields);
  const views = normalizeViews(rawConfig.views);

  return {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: Number(rawConfig.version || 1),
    policy: normalizePolicy(rawConfig.policy),
    project: normalizeProject(rawConfig.project),
    fields,
    views,
    field_map: buildFieldMap(fields),
    view_map: buildViewMap(views),
    automation: normalizeAutomation(rawConfig.automation),
    reporting: normalizeReporting(rawConfig.reporting),
    safety: normalizeSafety(rawConfig.safety),
  };
}

function detectDuplicateNames(items, key = "name") {
  const seen = new Set();
  const duplicates = [];

  for (const item of items || []) {
    if (!item?.[key]) continue;

    if (seen.has(item[key])) {
      duplicates.push(item[key]);
    } else {
      seen.add(item[key]);
    }
  }

  return unique(duplicates);
}

function validateFieldOption(option, fieldPath) {
  if (!isPlainObject(option)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (typeof option.name !== "string" || !option.name.trim()) {
    throw new TypeError(`${fieldPath}.name must be a non-empty string.`);
  }

  if (!VALID_SINGLE_SELECT_COLORS.includes(option.color)) {
    throw new TypeError(
      `${fieldPath}.color must be one of: ${VALID_SINGLE_SELECT_COLORS.join(", ")}`,
    );
  }
}

function validateField(field, fieldPath) {
  if (!isPlainObject(field)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (!VALID_FIELD_TYPES.includes(field.type)) {
    throw new TypeError(
      `${fieldPath}.type must be one of: ${VALID_FIELD_TYPES.join(", ")}`,
    );
  }

  if (typeof field.name !== "string" || !field.name.trim()) {
    throw new TypeError(`${fieldPath}.name must be a non-empty string.`);
  }

  if (!Array.isArray(field.options)) {
    throw new TypeError(`${fieldPath}.options must be an array.`);
  }

  const duplicateOptions = detectDuplicateNames(field.options, "name");

  if (duplicateOptions.length) {
    throw new TypeError(
      `${fieldPath}.options contains duplicate option names: ${duplicateOptions.join(", ")}`,
    );
  }

  field.options.forEach((option, index) =>
    validateFieldOption(option, `${fieldPath}.options[${index}]`),
  );
}

function validateView(view, fieldPath, config) {
  if (!isPlainObject(view)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  if (typeof view.name !== "string" || !view.name.trim()) {
    throw new TypeError(`${fieldPath}.name must be a non-empty string.`);
  }

  if (!VALID_VIEW_LAYOUTS.includes(view.layout)) {
    throw new TypeError(
      `${fieldPath}.layout must be one of: ${VALID_VIEW_LAYOUTS.join(", ")}`,
    );
  }

  for (const fieldName of view.fields || []) {
    if (!config.field_map[fieldName]) {
      logger.warn(
        `${fieldPath}.fields references missing project field "${fieldName}".`,
      );
    }
  }

  for (const fieldName of view.visible_fields || []) {
    if (!config.field_map[fieldName]) {
      logger.warn(
        `${fieldPath}.visible_fields references missing project field "${fieldName}".`,
      );
    }
  }

  for (const fieldName of view.hidden_fields || []) {
    if (!config.field_map[fieldName]) {
      logger.warn(
        `${fieldPath}.hidden_fields references missing project field "${fieldName}".`,
      );
    }
  }

  if (view.group_by && !config.field_map[view.group_by]) {
    logger.warn(
      `${fieldPath}.group_by references missing project field "${view.group_by}".`,
    );
  }

  for (const fieldName of view.sort_by || []) {
    if (!config.field_map[fieldName]) {
      logger.warn(
        `${fieldPath}.sort_by references missing project field "${fieldName}".`,
      );
    }
  }
}

function validateProjectsConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Project config must be an object.");
  }

  if (!config.project?.name) {
    throw new TypeError("project.name is required.");
  }

  if (!config.project?.owner) {
    throw new TypeError("project.owner is required.");
  }

  if (!Array.isArray(config.fields)) {
    throw new TypeError("fields must be an array.");
  }

  if (!Array.isArray(config.views)) {
    throw new TypeError("views must be an array.");
  }

  const duplicateFields = detectDuplicateNames(config.fields, "name");

  if (duplicateFields.length) {
    throw new TypeError(
      `Duplicate project field names detected: ${duplicateFields.join(", ")}`,
    );
  }

  const duplicateViews = detectDuplicateNames(config.views, "name");

  if (duplicateViews.length) {
    throw new TypeError(
      `Duplicate project view names detected: ${duplicateViews.join(", ")}`,
    );
  }

  config.fields.forEach((field, index) =>
    validateField(field, `fields[${index}]`),
  );

  config.views.forEach((view, index) =>
    validateView(view, `views[${index}]`, config),
  );

  if (!config.fields.length) {
    logger.warn("Project config has no fields.");
  }

  if (!config.views.length) {
    logger.warn("Project config has no views.");
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

function loadProjectsConfig(options = {}) {
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
        `Project config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeProjectsConfig(
        {
          version: 1,
          project: DEFAULT_PROJECT,
          policy: DEFAULT_POLICY,
          fields: [],
          views: [],
          automation: {},
          reporting: {},
          safety: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Project config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeProjectsConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateProjectsConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded project config from ${displayPath}.`);
      logger.debug(
        `Project config contains ${normalizedConfig.fields.length} fields and ${normalizedConfig.views.length} views.`,
      );
      logger.dump("project config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load project config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function getProject(config) {
  validateProjectsConfig(config);
  return config.project;
}

function getProjectName(config) {
  return getProject(config).name;
}

function getProjectOwner(config) {
  return getProject(config).owner;
}

function isProjectPublic(config) {
  return getProject(config).public;
}

function listFields(config) {
  validateProjectsConfig(config);
  return [...config.fields];
}

function listFieldNames(config) {
  return listFields(config).map((field) => field.name);
}

function getField(config, fieldName) {
  validateProjectsConfig(config);

  if (!fieldName || typeof fieldName !== "string") return null;

  return config.field_map[fieldName] || null;
}

function hasField(config, fieldName) {
  return Boolean(getField(config, fieldName));
}

function getFieldsByType(config, type) {
  validateProjectsConfig(config);

  const normalizedType = normalizeFieldType(type, "type");

  return config.fields.filter((field) => field.type === normalizedType);
}

function getSingleSelectFields(config) {
  return getFieldsByType(config, "single_select");
}

function getNumberFields(config) {
  return getFieldsByType(config, "number");
}

function getTextFields(config) {
  return getFieldsByType(config, "text");
}

function getDateFields(config) {
  return getFieldsByType(config, "date");
}

function getFieldOptions(config, fieldName) {
  const field = getField(config, fieldName);

  if (!field) return [];

  return field.options || [];
}

function getFieldOption(config, fieldName, optionName) {
  const options = getFieldOptions(config, fieldName);

  return options.find((option) => option.name === optionName) || null;
}

function hasFieldOption(config, fieldName, optionName) {
  return Boolean(getFieldOption(config, fieldName, optionName));
}

function listViews(config) {
  validateProjectsConfig(config);
  return [...config.views];
}

function listViewNames(config) {
  return listViews(config).map((view) => view.name);
}

function getView(config, viewName) {
  validateProjectsConfig(config);

  if (!viewName || typeof viewName !== "string") return null;

  return config.view_map[viewName] || null;
}

function hasView(config, viewName) {
  return Boolean(getView(config, viewName));
}

function getViewsByLayout(config, layout) {
  validateProjectsConfig(config);

  const normalizedLayout = normalizeViewLayout(layout, "layout");

  return config.views.filter((view) => view.layout === normalizedLayout);
}

function getBoardViews(config) {
  return getViewsByLayout(config, "board");
}

function getTableViews(config) {
  return getViewsByLayout(config, "table");
}

function getRoadmapViews(config) {
  return getViewsByLayout(config, "roadmap");
}

function getDefaultView(config) {
  validateProjectsConfig(config);

  return config.views[0] || null;
}

function getKanbanView(config) {
  return getView(config, "Kanban") || getBoardViews(config)[0] || null;
}

function getStatusField(config) {
  return getField(config, "Status");
}

function getPriorityField(config) {
  return getField(config, "Priority");
}

function getAreaField(config) {
  return getField(config, "Area");
}

function getStoryPointsField(config) {
  return getField(config, "Story Points");
}

function getStatusOptions(config) {
  return getFieldOptions(config, "Status");
}

function getPriorityOptions(config) {
  return getFieldOptions(config, "Priority");
}

function getAreaOptions(config) {
  return getFieldOptions(config, "Area");
}

function normalizeRemoteProject(remoteProject) {
  if (remoteProject === undefined || remoteProject === null) return null;

  if (!isPlainObject(remoteProject)) {
    throw new TypeError("remoteProject must be an object.");
  }

  return {
    id: remoteProject.id || null,
    number: remoteProject.number || null,
    name: remoteProject.name || remoteProject.title || null,
    title: remoteProject.title || remoteProject.name || null,
    description:
      remoteProject.description ||
      remoteProject.shortDescription ||
      remoteProject.short_description ||
      "",
    owner: remoteProject.owner || null,
    public: normalizeBoolean(remoteProject.public, false),
    closed: normalizeBoolean(remoteProject.closed, false),
    url: remoteProject.url || null,
    fields: Array.isArray(remoteProject.fields) ? remoteProject.fields : [],
    views: Array.isArray(remoteProject.views) ? remoteProject.views : [],
  };
}

function normalizeRemoteField(remoteField) {
  if (!isPlainObject(remoteField)) {
    throw new TypeError("remoteField must be an object.");
  }

  return {
    id: remoteField.id || null,
    name: remoteField.name || remoteField.title || null,
    type: remoteField.type ? String(remoteField.type).toLowerCase() : null,
    options: Array.isArray(remoteField.options) ? remoteField.options : [],
  };
}

function normalizeRemoteView(remoteView) {
  if (!isPlainObject(remoteView)) {
    throw new TypeError("remoteView must be an object.");
  }

  return {
    id: remoteView.id || null,
    name: remoteView.name || remoteView.title || null,
    layout: remoteView.layout ? String(remoteView.layout).toLowerCase() : null,
    number: remoteView.number || null,
  };
}

function createRemoteFieldMap(remoteFields = []) {
  const map = new Map();

  for (const field of remoteFields.map((item) => normalizeRemoteField(item))) {
    if (field.name) {
      map.set(field.name, field);
    }
  }

  return map;
}

function createRemoteViewMap(remoteViews = []) {
  const map = new Map();

  for (const view of remoteViews.map((item) => normalizeRemoteView(item))) {
    if (view.name) {
      map.set(view.name, view);
    }
  }

  return map;
}

function fieldNeedsUpdate(desiredField, remoteField) {
  const desired = normalizeField(desiredField, 0);
  const remote = normalizeRemoteField(remoteField);

  if (desired.name !== remote.name) return true;

  if (remote.type && desired.type !== remote.type) return true;

  if (desired.type === "single_select") {
    const remoteOptionNames = new Set(
      (remote.options || []).map((option) => option.name),
    );
    const missingOptions = desired.options.filter(
      (option) => !remoteOptionNames.has(option.name),
    );

    if (missingOptions.length) return true;
  }

  return false;
}

function viewNeedsUpdate(desiredView, remoteView) {
  const desired = normalizeView(desiredView, 0);
  const remote = normalizeRemoteView(remoteView);

  if (desired.name !== remote.name) return true;

  if (remote.layout && desired.layout !== remote.layout) return true;

  return false;
}

function planProjectSync(config, remoteProject = null, options = {}) {
  validateProjectsConfig(config);

  const {
    createMissingProject = config.policy.create_missing_project,
    updateExistingProject = config.policy.update_existing_project,
    createMissingFields = config.policy.create_missing_fields,
    updateExistingFields = config.policy.update_existing_fields,
    createMissingViews = config.policy.create_missing_views,
    updateExistingViews = config.policy.update_existing_views,
  } = options;

  const remote = normalizeRemoteProject(remoteProject);

  const plan = {
    project: {
      create: false,
      update: false,
      desired: config.project,
      current: remote,
    },

    fields: {
      create: [],
      update: [],
      unchanged: [],
      unmanaged: [],
    },

    views: {
      create: [],
      update: [],
      unchanged: [],
      unmanaged: [],
    },

    counts: {
      project_create: 0,
      project_update: 0,
      field_create: 0,
      field_update: 0,
      field_unchanged: 0,
      field_unmanaged: 0,
      view_create: 0,
      view_update: 0,
      view_unchanged: 0,
      view_unmanaged: 0,
    },
  };

  if (!remote) {
    if (createMissingProject) {
      plan.project.create = true;
      plan.counts.project_create = 1;
    }

    if (createMissingFields) {
      plan.fields.create.push(...config.fields);
    }

    if (createMissingViews) {
      plan.views.create.push(...config.views);
    }

    plan.counts.field_create = plan.fields.create.length;
    plan.counts.view_create = plan.views.create.length;

    return plan;
  }

  const projectDescription =
    remote.description ||
    remote.shortDescription ||
    remote.short_description ||
    "";

  if (
    updateExistingProject &&
    (remote.name !== config.project.name ||
      projectDescription !== config.project.description ||
      remote.public !== config.project.public)
  ) {
    plan.project.update = true;
    plan.counts.project_update = 1;
  }

  const remoteFieldMap = createRemoteFieldMap(remote.fields || []);
  const desiredFieldMap = new Map(
    config.fields.map((field) => [field.name, field]),
  );

  for (const desiredField of config.fields) {
    const remoteField = remoteFieldMap.get(desiredField.name);

    if (!remoteField) {
      if (createMissingFields) {
        plan.fields.create.push(desiredField);
      }

      continue;
    }

    if (fieldNeedsUpdate(desiredField, remoteField)) {
      if (updateExistingFields) {
        plan.fields.update.push({
          current: remoteField,
          desired: desiredField,
        });
      }

      continue;
    }

    plan.fields.unchanged.push(desiredField);
  }

  for (const remoteField of remoteFieldMap.values()) {
    if (!desiredFieldMap.has(remoteField.name)) {
      plan.fields.unmanaged.push(remoteField);
    }
  }

  const remoteViewMap = createRemoteViewMap(remote.views || []);
  const desiredViewMap = new Map(config.views.map((view) => [view.name, view]));

  for (const desiredView of config.views) {
    const remoteView = remoteViewMap.get(desiredView.name);

    if (!remoteView) {
      if (createMissingViews) {
        plan.views.create.push(desiredView);
      }

      continue;
    }

    if (viewNeedsUpdate(desiredView, remoteView)) {
      if (updateExistingViews) {
        plan.views.update.push({
          current: remoteView,
          desired: desiredView,
        });
      }

      continue;
    }

    plan.views.unchanged.push(desiredView);
  }

  for (const remoteView of remoteViewMap.values()) {
    if (!desiredViewMap.has(remoteView.name)) {
      plan.views.unmanaged.push(remoteView);
    }
  }

  plan.counts.field_create = plan.fields.create.length;
  plan.counts.field_update = plan.fields.update.length;
  plan.counts.field_unchanged = plan.fields.unchanged.length;
  plan.counts.field_unmanaged = plan.fields.unmanaged.length;

  plan.counts.view_create = plan.views.create.length;
  plan.counts.view_update = plan.views.update.length;
  plan.counts.view_unchanged = plan.views.unchanged.length;
  plan.counts.view_unmanaged = plan.views.unmanaged.length;

  return plan;
}

function toGitHubProjectCreatePayload(config) {
  validateProjectsConfig(config);

  return {
    owner: config.project.owner,
    title: config.project.name,
    shortDescription: config.project.description,
    public: config.project.public,
  };
}

function toGitHubProjectUpdatePayload(config, projectId) {
  validateProjectsConfig(config);

  return {
    projectId,
    title: config.project.name,
    shortDescription: config.project.description,
    public: config.project.public,
  };
}

function toGitHubFieldCreatePayload(field, projectId) {
  const normalized = normalizeField(field, 0);

  return {
    projectId,
    name: normalized.name,
    dataType: normalized.type,
    options: normalized.options.map((option) => ({
      name: option.name,
      color: option.color.toUpperCase(),
      description: option.description,
    })),
  };
}

function toGitHubViewCreatePayload(view, projectId) {
  const normalized = normalizeView(view, 0);

  return {
    projectId,
    name: normalized.name,
    layout: normalized.layout.toUpperCase(),
    filter: normalized.filters,
    groupBy: normalized.group_by,
    fields: normalized.fields,
    sortBy: normalized.sort_by,
  };
}

function formatProjectForSummary(config) {
  validateProjectsConfig(config);

  return `${config.project.name} — ${config.project.description}`;
}

function formatFieldForSummary(field) {
  const normalized = normalizeField(field, 0);

  if (normalized.type === "single_select") {
    return `${normalized.name} [${normalized.type}] — ${normalized.options
      .map((option) => option.name)
      .join(", ")}`;
  }

  return `${normalized.name} [${normalized.type}]`;
}

function formatViewForSummary(view) {
  const normalized = normalizeView(view, 0);

  const groupBy = normalized.group_by
    ? ` grouped by ${normalized.group_by}`
    : "";

  return `${normalized.name} [${normalized.layout}]${groupBy}`;
}

function summarizeProjectSyncPlan(plan) {
  return [
    `Project create: ${plan.counts.project_create}`,
    `Project update: ${plan.counts.project_update}`,
    `Field create: ${plan.counts.field_create}`,
    `Field update: ${plan.counts.field_update}`,
    `Field unchanged: ${plan.counts.field_unchanged}`,
    `Field unmanaged: ${plan.counts.field_unmanaged}`,
    `View create: ${plan.counts.view_create}`,
    `View update: ${plan.counts.view_update}`,
    `View unchanged: ${plan.counts.view_unchanged}`,
    `View unmanaged: ${plan.counts.view_unmanaged}`,
  ].join("\n");
}

function assertRequiredCoreFieldsPresent(config) {
  validateProjectsConfig(config);

  const required = ["Status", "Priority", "Area"];
  const missing = required.filter((fieldName) => !hasField(config, fieldName));

  if (missing.length) {
    throw new Error(`Required project fields missing: ${missing.join(", ")}`);
  }

  return true;
}

function assertRequiredCoreViewsPresent(config) {
  validateProjectsConfig(config);

  const required = ["Kanban", "All Issues"];
  const missing = required.filter((viewName) => !hasView(config, viewName));

  if (missing.length) {
    throw new Error(`Required project views missing: ${missing.join(", ")}`);
  }

  return true;
}

if (require.main === module) {
  try {
    const config = loadProjectsConfig();

    assertRequiredCoreFieldsPresent(config);
    assertRequiredCoreViewsPresent(config);

    logger.info(
      `Project config validation passed for "${config.project.name}" with ${config.fields.length} fields and ${config.views.length} views.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  VALID_FIELD_TYPES,
  VALID_VIEW_LAYOUTS,
  VALID_SINGLE_SELECT_COLORS,
  DEFAULT_PROJECT,
  DEFAULT_POLICY,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadProjectsConfig,
  normalizeProjectsConfig,
  validateProjectsConfig,

  normalizeProject,
  normalizePolicy,
  normalizeField,
  normalizeFieldOption,
  normalizeFieldType,
  normalizeView,
  normalizeViewLayout,
  normalizeSingleSelectColor,

  detectDuplicateNames,

  getProject,
  getProjectName,
  getProjectOwner,
  isProjectPublic,

  listFields,
  listFieldNames,
  getField,
  hasField,
  getFieldsByType,
  getSingleSelectFields,
  getNumberFields,
  getTextFields,
  getDateFields,

  getFieldOptions,
  getFieldOption,
  hasFieldOption,

  listViews,
  listViewNames,
  getView,
  hasView,
  getViewsByLayout,
  getBoardViews,
  getTableViews,
  getRoadmapViews,
  getDefaultView,
  getKanbanView,

  getStatusField,
  getPriorityField,
  getAreaField,
  getStoryPointsField,

  getStatusOptions,
  getPriorityOptions,
  getAreaOptions,

  normalizeRemoteProject,
  normalizeRemoteField,
  normalizeRemoteView,
  createRemoteFieldMap,
  createRemoteViewMap,

  fieldNeedsUpdate,
  viewNeedsUpdate,
  planProjectSync,

  toGitHubProjectCreatePayload,
  toGitHubProjectUpdatePayload,
  toGitHubFieldCreatePayload,
  toGitHubViewCreatePayload,

  formatProjectForSummary,
  formatFieldForSummary,
  formatViewForSummary,
  summarizeProjectSyncPlan,

  assertRequiredCoreFieldsPresent,
  assertRequiredCoreViewsPresent,
};
