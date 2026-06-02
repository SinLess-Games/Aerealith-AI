// .github/scripts/utils/cloudflare.js
// =============================================================================
// Aerealith AI Cloudflare Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared Cloudflare helpers for GitHub workflow scripts.
//
// Used by:
//   - .github/scripts/cloudflare/discover-deployments.js
//   - .github/scripts/cloudflare/validate-cloudflare-config.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/security/run-policy-gate.js
//
// Notes:
//   - This module does not require Cloudflare API packages.
//   - Deployment execution is done through Wrangler.
//   - Secrets are referenced by environment variable names only.
//   - Production deployment is intentionally strict.
//   - Safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("./logger");

const DEFAULT_WRANGLER_CONFIG_NAMES = [
  "wrangler.jsonc",
  "wrangler.json",
  "wrangler.toml",
];

const DEFAULT_DISCOVERY_ROOTS = [
  "apps/frontend",
  "apps/connectors",
  "apps/engines",
  "apps/integrations",
  "apps/services",
];

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".github",
  ".nx",
  ".next",
  ".open-next",
  ".turbo",
  ".wrangler",
  "coverage",
  "dist",
  "build",
  "out",
  "node_modules",
  "tmp",
]);

const DEFAULT_ENVIRONMENTS = {
  preview: {
    github_environment: "preview",
    cloudflare_environment: "preview",
    automatic_on_pull_request: true,
    automatic_on_main: false,
    release_tag_only: false,
    approval_required: false,
  },
  staging: {
    github_environment: "staging",
    cloudflare_environment: "staging",
    automatic_on_pull_request: false,
    automatic_on_main: true,
    release_tag_only: false,
    approval_required: false,
  },
  production: {
    github_environment: "production",
    cloudflare_environment: "production",
    automatic_on_pull_request: false,
    automatic_on_main: false,
    release_tag_only: true,
    approval_required: true,
  },
};

const DEFAULT_CLOUDFLARE_SERVICES = {
  workers: true,
  queues: true,
  r2: true,
  d1: true,
  kv: true,
  secrets_store: true,
  flagship: true,
};

const RELEASE_TAG_PATTERN = /^V[0-9]+\.[0-9]+\.[0-9]+$/;

const DEPENDENCY_BRANCH_PATTERNS = [
  /^renovate\/.+$/,
  /^dependabot\/.+$/,
  /^mend\/.+$/,
];

const OPENAI_BRANCH_PATTERNS = [
  /^openai\/.+$/,
  /^ai\/.+$/,
  /^automation\/openai-.+$/,
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

function normalizeEnvironment(environment) {
  const normalized = normalizeString(environment, "preview").toLowerCase();

  if (normalized === "prod") return "production";
  if (normalized === "prd") return "production";
  if (normalized === "stage") return "staging";
  if (normalized === "stg") return "staging";
  if (normalized === "pr") return "preview";
  if (normalized === "pull-request") return "preview";

  if (!["preview", "staging", "production"].includes(normalized)) {
    throw new Error(`Unsupported Cloudflare environment: ${environment}`);
  }

  return normalized;
}

function normalizeReleaseChannel(channel) {
  const normalized = normalizeString(channel, "release").toLowerCase();

  if (!["alpha", "beta", "test", "release"].includes(normalized)) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  return normalized;
}

function normalizeBranchName(branchNameOrRef) {
  return normalizeString(branchNameOrRef)
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  return normalizeString(refOrTag)
    .replace(/^refs\/tags\//, "")
    .trim();
}

function isReleaseTag(refOrTag) {
  return RELEASE_TAG_PATTERN.test(normalizeTagName(refOrTag));
}

function isDependencyBranch(branchNameOrRef) {
  const branch = normalizeBranchName(branchNameOrRef);
  return DEPENDENCY_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
}

function isOpenAiBranch(branchNameOrRef) {
  const branch = normalizeBranchName(branchNameOrRef);
  return OPENAI_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
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

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, filePath));
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

function writeJson(filePath, value, options = {}) {
  const dryRun = getDryRun(options);
  const rendered = `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`;

  ensureDir(path.dirname(filePath), options);

  if (dryRun) {
    logger.dryRun(`Would write JSON file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, value);
    return filePath;
  }

  fs.writeFileSync(filePath, rendered);
  logger.info(`Wrote ${filePath}.`);

  return filePath;
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

function sanitizeName(value) {
  return normalizeString(value, "cloudflare-project")
    .replace(/^@/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function sanitizeWorkerName(value) {
  return sanitizeName(value).slice(0, 63);
}

function shouldIgnoreDirectory(dirName) {
  return DEFAULT_IGNORE_DIRS.has(dirName);
}

function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let stringQuote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

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

function parseJsonc(raw, filePath = "wrangler.jsonc") {
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${logger.formatError(err)}`);
  }
}

function parseTomlScalar(value) {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();

    if (!inner) return [];

    return inner.split(",").map((item) => parseTomlScalar(item.trim()));
  }

  return trimmed;
}

function parseTomlBasic(raw) {
  const root = {};
  let current = root;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();

    if (!line) continue;

    const sectionMatch = /^\[([^\]]+)]$/.exec(line);

    if (sectionMatch) {
      const sectionPath = sectionMatch[1].split(".").map((part) => part.trim());
      current = root;

      for (const part of sectionPath) {
        current[part] = current[part] || {};
        current = current[part];
      }

      continue;
    }

    const assignment = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);

    if (!assignment) continue;

    current[assignment[1]] = parseTomlScalar(assignment[2]);
  }

  return root;
}

function readWranglerConfig(configPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(configPath, repoRoot);

  if (!isFile(absolutePath)) {
    throw new Error(
      `Wrangler config not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const ext = path.extname(absolutePath).toLowerCase();

  if (ext === ".json" || ext === ".jsonc") {
    return parseJsonc(raw, absolutePath);
  }

  if (ext === ".toml") {
    return parseTomlBasic(raw);
  }

  throw new Error(
    `Unsupported Wrangler config type: ${toRelativePath(absolutePath, repoRoot)}`,
  );
}

function discoverWranglerConfigFiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const roots = normalizeStringList(options.roots || DEFAULT_DISCOVERY_ROOTS);
  const configNames = normalizeStringList(
    options.configNames || DEFAULT_WRANGLER_CONFIG_NAMES,
  );

  const discovered = [];

  function visit(dirPath) {
    if (!isDirectory(dirPath)) return;

    const entries = fs.readdirSync(dirPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name)) continue;
        visit(entryPath);
        continue;
      }

      if (entry.isFile() && configNames.includes(entry.name)) {
        discovered.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    const absoluteRoot = resolvePath(root, repoRoot);
    visit(absoluteRoot);
  }

  return unique(discovered)
    .sort()
    .map((filePath) => toRelativePath(filePath, repoRoot));
}

function discoverPackageJsonFiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const roots = normalizeStringList(options.roots || DEFAULT_DISCOVERY_ROOTS);
  const discovered = [];

  function visit(dirPath) {
    if (!isDirectory(dirPath)) return;

    const entries = fs.readdirSync(dirPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name)) continue;
        visit(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === "package.json") {
        discovered.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    visit(resolvePath(root, repoRoot));
  }

  return unique(discovered)
    .sort()
    .map((filePath) => toRelativePath(filePath, repoRoot));
}

function findNearestPackageJson(startPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  let current = isDirectory(startPath) ? startPath : path.dirname(startPath);

  while (current.startsWith(repoRoot)) {
    const candidate = path.join(current, "package.json");

    if (isFile(candidate)) {
      return toRelativePath(candidate, repoRoot);
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function readPackageJson(packageJsonPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(packageJsonPath, repoRoot);

  if (!isFile(absolutePath)) return null;

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function inferProjectType(projectRoot, wranglerConfig = {}) {
  const normalizedRoot = toPosixPath(projectRoot);

  if (
    normalizedRoot === "apps/frontend" ||
    normalizedRoot.includes("/frontend")
  ) {
    return "frontend";
  }

  if (normalizedRoot.includes("/connectors/")) return "connector";
  if (normalizedRoot.includes("/engines/")) return "engine";
  if (normalizedRoot.includes("/integrations/")) return "integration";
  if (normalizedRoot.includes("/services/")) return "service";

  if (wranglerConfig.pages_build_output_dir) return "pages";
  if (wranglerConfig.main || wranglerConfig.name) return "worker";

  return "worker";
}

function extractBindings(wranglerConfig = {}) {
  const bindings = {
    queues: [],
    r2_buckets: [],
    d1_databases: [],
    kv_namespaces: [],
    services: [],
    vars: [],
  };

  const queueProducers = Array.isArray(wranglerConfig.queues?.producers)
    ? wranglerConfig.queues.producers
    : [];

  const queueConsumers = Array.isArray(wranglerConfig.queues?.consumers)
    ? wranglerConfig.queues.consumers
    : [];

  bindings.queues = [...queueProducers, ...queueConsumers]
    .map((item) => item.binding || item.queue)
    .filter(Boolean);

  bindings.r2_buckets = Array.isArray(wranglerConfig.r2_buckets)
    ? wranglerConfig.r2_buckets
        .map((item) => item.binding || item.bucket_name)
        .filter(Boolean)
    : [];

  bindings.d1_databases = Array.isArray(wranglerConfig.d1_databases)
    ? wranglerConfig.d1_databases
        .map((item) => item.binding || item.database_name)
        .filter(Boolean)
    : [];

  bindings.kv_namespaces = Array.isArray(wranglerConfig.kv_namespaces)
    ? wranglerConfig.kv_namespaces
        .map((item) => item.binding || item.id)
        .filter(Boolean)
    : [];

  bindings.services = Array.isArray(wranglerConfig.services)
    ? wranglerConfig.services
        .map((item) => item.binding || item.service)
        .filter(Boolean)
    : [];

  bindings.vars =
    wranglerConfig.vars && isPlainObject(wranglerConfig.vars)
      ? Object.keys(wranglerConfig.vars)
      : [];

  return bindings;
}

function getWranglerEnvironments(wranglerConfig = {}) {
  const env =
    wranglerConfig.env && isPlainObject(wranglerConfig.env)
      ? Object.keys(wranglerConfig.env)
      : [];

  return unique(["preview", "staging", "production", ...env]);
}

function discoverCloudflareProjects(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const wranglerConfigs = discoverWranglerConfigFiles({
    ...options,
    repoRoot,
  });

  const projects = [];

  for (const configPath of wranglerConfigs) {
    const absoluteConfigPath = resolvePath(configPath, repoRoot);
    const projectRoot = toRelativePath(
      path.dirname(absoluteConfigPath),
      repoRoot,
    );
    const wranglerConfig = readWranglerConfig(configPath, {
      repoRoot,
    });

    const packageJsonPath = findNearestPackageJson(absoluteConfigPath, {
      repoRoot,
    });

    const packageJson = packageJsonPath
      ? readPackageJson(packageJsonPath, {
          repoRoot,
        })
      : null;

    const packageName = packageJson?.name
      ? sanitizeName(packageJson.name)
      : null;
    const configName = wranglerConfig.name
      ? sanitizeName(wranglerConfig.name)
      : null;
    const directoryName = sanitizeName(path.basename(projectRoot));

    const name = configName || packageName || directoryName;
    const projectType = inferProjectType(projectRoot, wranglerConfig);

    projects.push({
      name,
      service: projectType,
      path: projectRoot,
      package_json: packageJsonPath,
      wrangler_config: configPath,
      worker_name: sanitizeWorkerName(wranglerConfig.name || name),
      main: wranglerConfig.main || null,
      compatibility_date: wranglerConfig.compatibility_date || null,
      environments: getWranglerEnvironments(wranglerConfig),
      bindings: extractBindings(wranglerConfig),
      deploy: true,
      labels: [
        "area:cloudflare",
        projectType === "frontend" ? "area:frontend" : `area:${projectType}`,
      ],
    });
  }

  return projects.sort((a, b) => a.path.localeCompare(b.path));
}

function projectChanged(project, changedFiles = []) {
  const files = normalizeStringList(changedFiles);

  if (!files.length) return true;

  const projectPath = toPosixPath(project.path).replace(/\/$/, "");

  return files.some((file) => {
    const normalized = toPosixPath(file);
    return (
      normalized === projectPath || normalized.startsWith(`${projectPath}/`)
    );
  });
}

function filterChangedProjects(projects, changedFiles = [], options = {}) {
  if (normalizeBoolean(options.deployAll || options.deploy_all, false)) {
    return projects;
  }

  return projects.filter((project) => projectChanged(project, changedFiles));
}

function getEnvironmentConfig(rules = {}, environment = "preview") {
  const normalizedEnvironment = normalizeEnvironment(environment);

  return {
    ...DEFAULT_ENVIRONMENTS[normalizedEnvironment],
    ...(rules.environments?.[normalizedEnvironment] || {}),
  };
}

function getCloudflareEnvironmentName(rules = {}, environment = "preview") {
  return (
    getEnvironmentConfig(rules, environment).cloudflare_environment ||
    environment
  );
}

function getGithubEnvironmentName(rules = {}, environment = "preview") {
  return (
    getEnvironmentConfig(rules, environment).github_environment || environment
  );
}

function getCloudflareServices(rules = {}) {
  return {
    ...DEFAULT_CLOUDFLARE_SERVICES,
    ...(rules.services || {}),
  };
}

function getRequiredSecrets(rules = {}, environment = "preview") {
  const normalizedEnvironment = normalizeEnvironment(environment);

  const globalSecrets = normalizeStringList(
    rules.runtime?.required_secrets?.global,
  );
  const environmentSecrets = normalizeStringList(
    rules.runtime?.required_secrets?.[normalizedEnvironment],
  );

  const account = rules.account || {};

  const accountSecrets = [
    account.api_token_secret || "CLOUDFLARE_API_TOKEN",
    account[`api_token_${normalizedEnvironment}_secret`],
  ].filter(Boolean);

  return unique([...globalSecrets, ...environmentSecrets, ...accountSecrets]);
}

function getRequiredVariables(rules = {}, environment = "preview") {
  const normalizedEnvironment = normalizeEnvironment(environment);

  const globalVariables = normalizeStringList(
    rules.runtime?.required_variables?.global,
  );
  const environmentVariables = normalizeStringList(
    rules.runtime?.required_variables?.[normalizedEnvironment],
  );

  const account = rules.account || {};

  const accountVariables = [
    account.account_id_variable || "CLOUDFLARE_ACCOUNT_ID",
    account.zone_id_variable,
    account.project_name_variable,
  ].filter(Boolean);

  return unique([
    ...globalVariables,
    ...environmentVariables,
    ...accountVariables,
  ]);
}

function validateRuntimeConfiguration(
  rules = {},
  environment = "preview",
  env = process.env,
) {
  const requiredSecrets = getRequiredSecrets(rules, environment);
  const requiredVariables = getRequiredVariables(rules, environment);

  const missing = {
    secrets: requiredSecrets.filter((name) => !env[name]),
    variables: requiredVariables.filter((name) => !env[name]),
  };

  return {
    valid: missing.secrets.length === 0 && missing.variables.length === 0,
    environment: normalizeEnvironment(environment),
    missing,
  };
}

function getCloudflareAccountId(rules = {}, env = process.env) {
  const variableName =
    rules.account?.account_id_variable || "CLOUDFLARE_ACCOUNT_ID";
  return env[variableName] || env.CLOUDFLARE_ACCOUNT_ID || "";
}

function getCloudflareZoneId(rules = {}, env = process.env) {
  const variableName = rules.account?.zone_id_variable || "CLOUDFLARE_ZONE_ID";
  return env[variableName] || env.CLOUDFLARE_ZONE_ID || "";
}

function getCloudflareApiTokenSecretName(rules = {}, environment = "preview") {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const account = rules.account || {};

  const environmentSpecific =
    account[`api_token_${normalizedEnvironment}_secret`] ||
    account[`api_token_${normalizedEnvironment}`];

  return (
    environmentSpecific || account.api_token_secret || "CLOUDFLARE_API_TOKEN"
  );
}

function getCloudflareApiToken(
  rules = {},
  environment = "preview",
  env = process.env,
) {
  const secretName = getCloudflareApiTokenSecretName(rules, environment);
  return env[secretName] || env.CLOUDFLARE_API_TOKEN || "";
}

function createCloudflareCommandEnv(
  rules = {},
  environment = "preview",
  env = process.env,
) {
  return {
    ...env,
    CLOUDFLARE_ACCOUNT_ID: getCloudflareAccountId(rules, env),
    CLOUDFLARE_API_TOKEN: getCloudflareApiToken(rules, environment, env),
    CLOUDFLARE_ZONE_ID: getCloudflareZoneId(rules, env),
  };
}

function getEventDeploymentEnvironment(input = {}) {
  const eventName = normalizeString(
    input.event_name || input.eventName || process.env.GITHUB_EVENT_NAME,
  );
  const ref = normalizeString(input.ref || process.env.GITHUB_REF);
  const baseBranch = normalizeBranchName(
    input.base_branch || input.baseBranch || process.env.GITHUB_BASE_REF,
  );
  const branch = normalizeBranchName(
    input.branch || input.head_branch || input.headBranch || ref,
  );

  if (input.environment) {
    return normalizeEnvironment(input.environment);
  }

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    return "preview";
  }

  if (isReleaseTag(ref)) {
    return "production";
  }

  if (branch === "main" || baseBranch === "main") {
    return "staging";
  }

  return "preview";
}

function validateDeploymentGate(rules = {}, input = {}) {
  const environment = normalizeEnvironment(
    input.environment || getEventDeploymentEnvironment(input),
  );

  const branch = normalizeBranchName(
    input.branch || input.head_branch || input.ref || "",
  );
  const ref = normalizeString(input.ref || process.env.GITHUB_REF || "");
  const labels = normalizeStringList(input.labels);
  const checks = isPlainObject(input.checks) ? input.checks : {};
  const isFork = normalizeBoolean(input.is_fork || input.fork, false);
  const approved = normalizeBoolean(
    input.approved || input.environment_approved,
    false,
  );
  const dryRun = getDryRun(input);

  const envConfig = getEnvironmentConfig(rules, environment);
  const blockers = [];
  const warnings = [];

  if (dryRun) {
    warnings.push({
      type: "dry_run",
      reason: "Dry-run mode is enabled. Deployment mutation should not occur.",
    });
  }

  if (
    isFork &&
    rules.policy?.block_fork_prs_from_using_cloudflare_secrets !== false &&
    environment !== "preview"
  ) {
    blockers.push({
      type: "fork",
      reason: "Fork pull requests may not use Cloudflare deployment secrets.",
    });
  }

  for (const label of normalizeStringList(envConfig.required_labels_absent)) {
    if (labels.includes(label)) {
      blockers.push({
        type: "label",
        value: label,
        reason: `Deployment-blocking label is present: ${label}`,
      });
    }
  }

  for (const label of normalizeStringList(envConfig.required_labels_all)) {
    if (!labels.includes(label)) {
      blockers.push({
        type: "missing_label",
        value: label,
        reason: `Required deployment label is missing: ${label}`,
      });
    }
  }

  const anyLabels = normalizeStringList(envConfig.required_labels_any);

  if (anyLabels.length && !anyLabels.some((label) => labels.includes(label))) {
    blockers.push({
      type: "missing_any_label",
      labels: anyLabels,
      reason: `At least one deployment label is required: ${anyLabels.join(", ")}`,
    });
  }

  for (const checkName of normalizeStringList(envConfig.required_checks)) {
    if (checks[checkName] !== "success") {
      blockers.push({
        type: "check",
        value: checkName,
        reason: `Required deployment check has not passed: ${checkName}`,
      });
    }
  }

  if (environment === "production") {
    if (
      rules.policy?.block_dependency_prs_from_deploying_production !== false
    ) {
      if (isDependencyBranch(branch)) {
        blockers.push({
          type: "dependency_branch",
          value: branch,
          reason: "Dependency branches may not deploy production.",
        });
      }
    }

    if (rules.policy?.block_openai_prs_from_deploying_production !== false) {
      if (isOpenAiBranch(branch)) {
        blockers.push({
          type: "openai_branch",
          value: branch,
          reason: "OpenAI automation branches may not deploy production.",
        });
      }
    }

    if (envConfig.release_tag_only !== false && !isReleaseTag(ref)) {
      blockers.push({
        type: "release_tag",
        value: ref,
        reason:
          "Production deployment requires a V-prefixed semantic release tag.",
      });
    }

    if (envConfig.approval_required !== false && !approved) {
      blockers.push({
        type: "approval",
        reason: "Production deployment requires environment approval.",
      });
    }
  }

  return {
    allowed: blockers.length === 0 && !dryRun,
    dry_run: dryRun,
    environment,
    blockers,
    warnings,
  };
}

function assertDeploymentAllowed(rules = {}, input = {}) {
  const gate = validateDeploymentGate(rules, input);

  if (!gate.allowed) {
    const reasons = gate.blockers
      .map((blocker) => `- ${blocker.reason}`)
      .join("\n");
    throw new Error(
      `Cloudflare deployment is blocked for ${gate.environment}.\n${reasons}`,
    );
  }

  return true;
}

function buildWranglerDeployArgs(project, options = {}) {
  const environment = normalizeEnvironment(options.environment || "preview");
  const cloudflareEnvironment = normalizeString(
    options.cloudflareEnvironment || options.cloudflare_environment,
    environment,
  );

  const dryRun = getDryRun(options);
  const configPath =
    project.wrangler_config || project.wranglerConfig || "wrangler.jsonc";

  const args = ["exec", "wrangler", "deploy", "--config", configPath];

  if (options.useEnvFlag !== false && cloudflareEnvironment) {
    args.push("--env", cloudflareEnvironment);
  }

  if (dryRun) {
    args.push("--dry-run");
  }

  if (options.minify) {
    args.push("--minify");
  }

  if (options.outdir) {
    args.push("--outdir", options.outdir);
  }

  return args;
}

function buildWranglerPagesDeployArgs(project, options = {}) {
  const environment = normalizeEnvironment(options.environment || "preview");
  const dryRun = getDryRun(options);

  const outputDir =
    options.outputDir ||
    options.output_dir ||
    project.pages_build_output_dir ||
    project.output_dir ||
    "dist";

  const projectName =
    options.projectName ||
    options.project_name ||
    project.project_name ||
    project.worker_name ||
    project.name;

  const branch =
    options.branch ||
    process.env.GITHUB_HEAD_REF ||
    normalizeBranchName(process.env.GITHUB_REF || "");

  const args = [
    "exec",
    "wrangler",
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    projectName,
  ];

  if (environment !== "production" && branch) {
    args.push("--branch", branch);
  }

  if (dryRun) {
    args.push("--dry-run");
  }

  return args;
}

function buildWranglerCommand(project, options = {}) {
  const service = normalizeString(project.service, "worker");

  if (service === "pages") {
    return {
      command: "pnpm",
      args: buildWranglerPagesDeployArgs(project, options),
    };
  }

  return {
    command: "pnpm",
    args: buildWranglerDeployArgs(project, options),
  };
}

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );

  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun) {
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

  logger.info(
    `Running command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
  );

  const result = childProcess.spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: "utf8",
    shell: false,
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    const stdout = result.stdout || "";

    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        stdout.trim() ? `stdout:\n${stdout}` : null,
        stderr.trim() ? `stderr:\n${stderr}` : null,
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

function validateWranglerInstalled(options = {}) {
  const result = runCommand("pnpm", ["exec", "wrangler", "--version"], {
    ...options,
    dryRun: false,
  });

  return normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0];
}

function validateWranglerConfig(project, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);

  const configPath = project.wrangler_config || project.wranglerConfig;

  if (!configPath) {
    throw new Error(
      `Project ${project.name} does not define a Wrangler config.`,
    );
  }

  if (!isFile(resolvePath(configPath, repoRoot))) {
    throw new Error(
      `Wrangler config does not exist for ${project.name}: ${configPath}`,
    );
  }

  const wranglerConfig = readWranglerConfig(configPath, {
    repoRoot,
  });

  if (!wranglerConfig.name && project.service !== "pages") {
    throw new Error(`Wrangler config for ${project.name} is missing \`name\`.`);
  }

  if (!wranglerConfig.compatibility_date && project.service !== "pages") {
    throw new Error(
      `Wrangler config for ${project.name} is missing \`compatibility_date\`.`,
    );
  }

  if (dryRun) {
    logger.dryRun(
      `Validated Wrangler config for ${project.name}: ${configPath}`,
    );
  }

  return {
    valid: true,
    project: project.name,
    wrangler_config: configPath,
    parsed: wranglerConfig,
  };
}

function deployProject(project, rules = {}, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const environment = normalizeEnvironment(options.environment || "preview");
  const cloudflareEnvironment = getCloudflareEnvironmentName(
    rules,
    environment,
  );
  const dryRun = getDryRun(options);

  validateWranglerConfig(project, {
    ...options,
    repoRoot,
    dryRun,
  });

  const commandEnv = createCloudflareCommandEnv(
    rules,
    environment,
    options.env || process.env,
  );
  const command = buildWranglerCommand(project, {
    ...options,
    environment,
    cloudflareEnvironment,
    dryRun,
  });

  const startedAt = new Date();

  const result = runCommand(command.command, command.args, {
    ...options,
    repoRoot,
    cwd: project.path || ".",
    env: commandEnv,
    dryRun,
  });

  const finishedAt = new Date();

  return {
    project: project.name,
    service: project.service || "worker",
    environment,
    cloudflare_environment: cloudflareEnvironment,
    wrangler_config: project.wrangler_config,
    command: `${command.command} ${command.args.join(" ")}`,
    dry_run: dryRun,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function deployProjects(projects, rules = {}, options = {}) {
  const environment = normalizeEnvironment(options.environment || "preview");

  const gate = validateDeploymentGate(rules, {
    ...options,
    environment,
  });

  if (gate.blockers.length) {
    const reasons = gate.blockers
      .map((blocker) => `- ${blocker.reason}`)
      .join("\n");
    throw new Error(
      `Cloudflare deployment gate failed for ${environment}.\n${reasons}`,
    );
  }

  return projects.map((project) =>
    deployProject(project, rules, {
      ...options,
      environment,
    }),
  );
}

function createDeploymentPlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const rules = input.rules || {};
  const environment = normalizeEnvironment(
    input.environment || getEventDeploymentEnvironment(input),
  );

  const discoveredProjects =
    input.projects ||
    discoverCloudflareProjects({
      ...input,
      repoRoot,
    });

  const deployAll =
    normalizeBoolean(input.deploy_all || input.deployAll, false) ||
    (environment === "production" &&
      rules.policy?.deploy_all_on_release !== false);

  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
  );

  const selectedProjects = filterChangedProjects(
    discoveredProjects,
    changedFiles,
    {
      deployAll,
    },
  ).filter((project) => project.deploy !== false);

  const gate = validateDeploymentGate(rules, {
    ...input,
    environment,
  });

  return {
    schema_version: 1,
    environment,
    github_environment: getGithubEnvironmentName(rules, environment),
    cloudflare_environment: getCloudflareEnvironmentName(rules, environment),
    dry_run: getDryRun(input),
    deploy_all: deployAll,
    created_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    services: getCloudflareServices(rules),
    changed_files: changedFiles,
    gate,
    totals: {
      discovered_projects: discoveredProjects.length,
      selected_projects: selectedProjects.length,
    },
    projects: selectedProjects,
  };
}

function createDeploymentManifest(input = {}) {
  const plan = input.plan || createDeploymentPlan(input);
  const results = Array.isArray(input.results) ? input.results : [];

  return {
    schema_version: 1,
    type: "cloudflare-deployment-manifest",
    project: "Aerealith AI",
    environment: plan.environment,
    github_environment: plan.github_environment,
    cloudflare_environment: plan.cloudflare_environment,
    dry_run: plan.dry_run,
    created_at: new Date().toISOString(),
    repository: plan.repository,
    ref: plan.ref,
    sha: plan.sha,
    run_id: plan.run_id,
    services: plan.services,
    totals: {
      planned_projects: plan.projects.length,
      deployed_projects: results.length,
      failed_projects: results.filter((result) => result.status !== 0).length,
    },
    planned_projects: plan.projects,
    results,
  };
}

function writeDeploymentManifest(
  manifest,
  outputFile = "artifacts/cloudflare/cloudflare-deployment-manifest.json",
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  return writeJson(absoluteOutputFile, manifest, {
    ...options,
    repoRoot,
  });
}

function createDeploymentSummary(manifestOrPlan) {
  const source = manifestOrPlan || {};
  const projects = source.planned_projects || source.projects || [];
  const results = source.results || [];

  const lines = [
    "## Cloudflare Deployment",
    "",
    `- Environment: \`${source.environment || "unknown"}\``,
    `- Cloudflare environment: \`${source.cloudflare_environment || "unknown"}\``,
    `- Dry-run: \`${source.dry_run ? "true" : "false"}\``,
    `- Planned projects: \`${projects.length}\``,
  ];

  if (results.length) {
    lines.push(`- Completed projects: \`${results.length}\``);
  }

  if (source.gate?.blockers?.length) {
    lines.push("");
    lines.push("### Blockers");
    for (const blocker of source.gate.blockers) {
      lines.push(`- ${blocker.reason}`);
    }
  }

  if (projects.length) {
    lines.push("");
    lines.push("### Projects");
    lines.push("");
    lines.push("| Project | Service | Path | Wrangler Config |");
    lines.push("|---|---|---|---|");

    for (const project of projects) {
      lines.push(
        `| \`${project.name}\` | \`${project.service || "worker"}\` | \`${project.path}\` | \`${project.wrangler_config}\` |`,
      );
    }
  }

  if (results.length) {
    lines.push("");
    lines.push("### Results");
    lines.push("");
    lines.push("| Project | Status | Duration |");
    lines.push("|---|---:|---:|");

    for (const result of results) {
      lines.push(
        `| \`${result.project}\` | \`${result.status}\` | \`${result.duration_ms}ms\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping Cloudflare summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${markdown.trim()}\n\n`);

  return true;
}

function appendDeploymentSummary(manifestOrPlan) {
  return appendGitHubStepSummary(createDeploymentSummary(manifestOrPlan));
}

function setGithubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function maskCloudflareSecrets(
  rules = {},
  environment = "preview",
  env = process.env,
) {
  const token = getCloudflareApiToken(rules, environment, env);
  const accountId = getCloudflareAccountId(rules, env);
  const zoneId = getCloudflareZoneId(rules, env);

  for (const value of [token, accountId, zoneId]) {
    if (value) {
      logger.mask(value);
    }
  }
}

function printDeploymentPlan(plan) {
  logger.info(`Cloudflare deployment plan for ${plan.environment}.`);
  logger.info(`Selected ${plan.projects.length} project(s).`);

  for (const project of plan.projects) {
    logger.info(
      `- ${project.name}: ${project.path} (${project.wrangler_config})`,
    );
  }

  if (plan.gate.blockers.length) {
    logger.warn(`Deployment gate has ${plan.gate.blockers.length} blocker(s).`);

    for (const blocker of plan.gate.blockers) {
      logger.warn(blocker.reason);
    }
  }

  logger.dump("cloudflare deployment plan", plan);
}

function loadRulesFromFile(
  filePath = ".github/repo-management/cloudflare-rules.yaml",
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {};
  }

  const yaml = require("js-yaml");
  return yaml.load(fs.readFileSync(absolutePath, "utf8")) || {};
}

function runCli() {
  const command = process.argv[2] || "plan";
  const environment =
    process.argv[3] || process.env.CLOUDFLARE_ENVIRONMENT || null;

  const repoRoot = findRepoRoot();
  const rules = loadRulesFromFile(
    ".github/repo-management/cloudflare-rules.yaml",
    {
      repoRoot,
    },
  );

  if (command === "discover") {
    const projects = discoverCloudflareProjects({
      repoRoot,
    });

    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  if (command === "validate") {
    const projects = discoverCloudflareProjects({
      repoRoot,
    });

    for (const project of projects) {
      validateWranglerConfig(project, {
        repoRoot,
      });
    }

    logger.info(`Validated ${projects.length} Cloudflare project(s).`);
    return;
  }

  if (command === "plan") {
    const plan = createDeploymentPlan({
      repoRoot,
      rules,
      environment: environment || getEventDeploymentEnvironment(),
    });

    printDeploymentPlan(plan);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "deploy") {
    const plan = createDeploymentPlan({
      repoRoot,
      rules,
      environment: environment || getEventDeploymentEnvironment(),
    });

    printDeploymentPlan(plan);
    maskCloudflareSecrets(rules, plan.environment);

    const results = deployProjects(plan.projects, rules, {
      repoRoot,
      environment: plan.environment,
    });

    const manifest = createDeploymentManifest({
      plan,
      results,
    });

    writeDeploymentManifest(manifest, undefined, {
      repoRoot,
    });

    appendDeploymentSummary(manifest);
    return;
  }

  throw new Error(`Unknown Cloudflare utility command: ${command}`);
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
  DEFAULT_WRANGLER_CONFIG_NAMES,
  DEFAULT_DISCOVERY_ROOTS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_ENVIRONMENTS,
  DEFAULT_CLOUDFLARE_SERVICES,
  RELEASE_TAG_PATTERN,
  DEPENDENCY_BRANCH_PATTERNS,
  OPENAI_BRANCH_PATTERNS,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,

  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  writeJson,
  sortObjectDeep,

  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  normalizeEnvironment,
  normalizeReleaseChannel,
  normalizeBranchName,
  normalizeTagName,
  isReleaseTag,
  isDependencyBranch,
  isOpenAiBranch,
  getDryRun,

  sanitizeName,
  sanitizeWorkerName,

  stripJsonComments,
  parseJsonc,
  parseTomlBasic,
  readWranglerConfig,

  discoverWranglerConfigFiles,
  discoverPackageJsonFiles,
  findNearestPackageJson,
  readPackageJson,
  inferProjectType,
  extractBindings,
  getWranglerEnvironments,
  discoverCloudflareProjects,
  projectChanged,
  filterChangedProjects,

  getEnvironmentConfig,
  getCloudflareEnvironmentName,
  getGithubEnvironmentName,
  getCloudflareServices,

  getRequiredSecrets,
  getRequiredVariables,
  validateRuntimeConfiguration,
  getCloudflareAccountId,
  getCloudflareZoneId,
  getCloudflareApiTokenSecretName,
  getCloudflareApiToken,
  createCloudflareCommandEnv,

  getEventDeploymentEnvironment,
  validateDeploymentGate,
  assertDeploymentAllowed,

  buildWranglerDeployArgs,
  buildWranglerPagesDeployArgs,
  buildWranglerCommand,
  runCommand,
  validateWranglerInstalled,
  validateWranglerConfig,
  deployProject,
  deployProjects,

  createDeploymentPlan,
  createDeploymentManifest,
  writeDeploymentManifest,
  createDeploymentSummary,
  appendGitHubStepSummary,
  appendDeploymentSummary,
  setGithubOutput,
  maskCloudflareSecrets,
  printDeploymentPlan,
  loadRulesFromFile,
};
