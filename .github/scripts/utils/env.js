// .github/scripts/utils/env.js
// =============================================================================
// Aerealith AI Environment Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared environment helpers for GitHub workflow scripts.
//
// Used by:
//   - repo management scripts
//   - CI/CD scripts
//   - release scripts
//   - security scripts
//   - Cloudflare deployment scripts
//   - Docker/GHCR publish scripts
//   - npm publish scripts
//   - artifact/evidence scripts
//
// Notes:
//   - Secrets are referenced by environment variable name only.
//   - Secret values are redacted from snapshots and summaries.
//   - Works in GitHub Actions and local dry-run testing.
//   - CommonJS only.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const logger = require("./logger");

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_ENVIRONMENT = "local";

const DEFAULT_NODE_VERSION = "24.15.0";
const DEFAULT_PNPM_VERSION = "10.23.0";
const DEFAULT_DEFAULT_BRANCH = "main";

const DEFAULT_RELEASE_CHANNEL = "release";
const VALID_RELEASE_CHANNELS = ["alpha", "beta", "test", "release"];

const RELEASE_TAG_PATTERN = /^V[0-9]+\.[0-9]+\.[0-9]+$/;

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|pwd|private[_-]?key|api[_-]?key|access[_-]?key|auth|credential|webhook)/i;

const SAFE_ENV_KEYS = [
  "CI",
  "NODE_ENV",
  "DRY_RUN",
  "DEBUG_PROJECT_SYNC",
  "PROJECT_SYNC_DRY_RUN",
  "PROJECT_SYNC_DEBUG",
  "PROJECT_SYNC_LOG_LEVEL",
  "PROJECT_SYNC_LOG_PREFIX",
  "PROJECT_SYNC_WRITE_MODE",
  "PROJECT_SYNC_CONFIRM_WRITE",
  "PROJECT_SYNC_CONFIRM_DESTRUCTIVE",

  "GITHUB_ACTIONS",
  "GITHUB_ACTOR",
  "GITHUB_API_URL",
  "GITHUB_BASE_REF",
  "GITHUB_EVENT_NAME",
  "GITHUB_GRAPHQL_URL",
  "GITHUB_HEAD_REF",
  "GITHUB_JOB",
  "GITHUB_REF",
  "GITHUB_REF_NAME",
  "GITHUB_REF_TYPE",
  "GITHUB_REPOSITORY",
  "GITHUB_REPOSITORY_OWNER",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_NUMBER",
  "GITHUB_SERVER_URL",
  "GITHUB_SHA",
  "GITHUB_TRIGGERING_ACTOR",
  "GITHUB_WORKFLOW",
  "GITHUB_WORKSPACE",

  "NX_BRANCH",
  "NX_CLOUD_ACCESS_TOKEN",
  "NX_HEAD",
  "NX_BASE",

  "NODE_VERSION",
  "PNPM_VERSION",

  "RELEASE_VERSION",
  "RELEASE_CHANNEL",
  "RELEASE_TAG",

  "CLOUDFLARE_ENVIRONMENT",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",

  "SONAR_PROJECT_KEY",
  "SONAR_ORGANIZATION",

  "NPM_CONFIG_REGISTRY",
];

const DEFAULT_REQUIRED_GROUPS = {
  github: ["GITHUB_TOKEN"],
  openai: ["OPENAI_API_KEY"],
  sonarqube: ["SONAR_TOKEN"],
  npm: ["NPM_ACCESS_TOKEN"],
  ghcr: ["GITHUB_TOKEN"],
  cloudflare: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
  security: ["GITHUB_TOKEN"],
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

  const number = Number.parseInt(String(value), 10);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeJson(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

function normalizeReleaseChannel(channel = DEFAULT_RELEASE_CHANNEL) {
  const normalized = normalizeString(
    channel,
    DEFAULT_RELEASE_CHANNEL,
  ).toLowerCase();

  if (!VALID_RELEASE_CHANNELS.includes(normalized)) {
    throw new Error(
      `Invalid release channel "${channel}". Expected one of: ${VALID_RELEASE_CHANNELS.join(", ")}`,
    );
  }

  return normalized;
}

function isReleaseTag(value) {
  return RELEASE_TAG_PATTERN.test(normalizeTagName(value));
}

function getEnv(name, fallback = "", env = process.env) {
  return normalizeString(env[name], fallback);
}

function getOptionalEnv(name, env = process.env) {
  const value = env[name];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

function getBooleanEnv(name, fallback = false, env = process.env) {
  return normalizeBoolean(env[name], fallback);
}

function getIntegerEnv(name, fallback = 0, env = process.env) {
  return normalizeInteger(env[name], fallback);
}

function getNumberEnv(name, fallback = 0, env = process.env) {
  return normalizeNumber(env[name], fallback);
}

function getJsonEnv(name, fallback = null, env = process.env) {
  return normalizeJson(env[name], fallback);
}

function getListEnv(name, fallback = [], env = process.env) {
  const value = normalizeStringList(env[name]);

  return value.length ? value : fallback;
}

function getFirstEnv(names, fallback = "", env = process.env) {
  for (const name of normalizeStringList(names)) {
    const value = getOptionalEnv(name, env);

    if (value !== null) return value;
  }

  return fallback;
}

function getFirstBooleanEnv(names, fallback = false, env = process.env) {
  for (const name of normalizeStringList(names)) {
    if (env[name] !== undefined && env[name] !== "") {
      return normalizeBoolean(env[name], fallback);
    }
  }

  return fallback;
}

function hasEnv(name, env = process.env) {
  return env[name] !== undefined && env[name] !== null && env[name] !== "";
}

function setEnv(name, value, env = process.env) {
  env[name] = String(value);
  return env[name];
}

function unsetEnv(name, env = process.env) {
  delete env[name];
}

function requireEnv(name, env = process.env) {
  const value = getOptionalEnv(name, env);

  if (value === null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getMissingEnv(names, env = process.env) {
  return normalizeStringList(names).filter((name) => !hasEnv(name, env));
}

function validateRequiredEnv(names, env = process.env) {
  const required = normalizeStringList(names);
  const missing = getMissingEnv(required, env);

  return {
    valid: missing.length === 0,
    required,
    missing,
  };
}

function assertRequiredEnv(names, env = process.env) {
  const result = validateRequiredEnv(names, env);

  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(", ")}`,
    );
  }

  return true;
}

function validateRequiredGroups(
  groups = {},
  selectedGroups = [],
  env = process.env,
) {
  const effectiveGroups = {
    ...DEFAULT_REQUIRED_GROUPS,
    ...(isPlainObject(groups) ? groups : {}),
  };

  const names = normalizeStringList(selectedGroups);

  const selected = names.length ? names : Object.keys(effectiveGroups);

  const result = {
    valid: true,
    groups: {},
    missing: [],
  };

  for (const groupName of selected) {
    const required = normalizeStringList(effectiveGroups[groupName]);
    const validation = validateRequiredEnv(required, env);

    result.groups[groupName] = validation;
    result.missing.push(...validation.missing);

    if (!validation.valid) {
      result.valid = false;
    }
  }

  result.missing = unique(result.missing);

  return result;
}

function assertRequiredGroups(
  groups = {},
  selectedGroups = [],
  env = process.env,
) {
  const result = validateRequiredGroups(groups, selectedGroups, env);

  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(", ")}`,
    );
  }

  return true;
}

function isSecretKey(key) {
  return SECRET_KEY_PATTERN.test(String(key));
}

function redactValue(value) {
  if (value === undefined || value === null) return value;

  const rendered = String(value);

  if (!rendered) return rendered;

  if (rendered.length <= 4) return "[REDACTED]";

  return "[REDACTED]";
}

function redactEnvObject(envObject = process.env, options = {}) {
  const includeOnly = normalizeStringList(
    options.includeOnly || options.include_only,
  );
  const exclude = new Set(normalizeStringList(options.exclude));

  const source = isPlainObject(envObject) ? envObject : {};

  const keys = includeOnly.length ? includeOnly : Object.keys(source).sort();

  return Object.fromEntries(
    keys
      .filter((key) => key in source)
      .filter((key) => !exclude.has(key))
      .map((key) => {
        const value = source[key];

        if (isSecretKey(key)) {
          return [key, redactValue(value)];
        }

        if (options.redactAll || options.redact_all) {
          return [key, redactValue(value)];
        }

        return [key, value];
      }),
  );
}

function maskEnv(name, env = process.env) {
  if (!hasEnv(name, env)) return false;

  logger.mask(env[name]);

  return true;
}

function maskEnvGroup(names, env = process.env) {
  return normalizeStringList(names).map((name) => ({
    name,
    masked: maskEnv(name, env),
  }));
}

function maskKnownSecrets(env = process.env) {
  const masked = [];

  for (const [key, value] of Object.entries(env)) {
    if (!isSecretKey(key)) continue;
    if (!value) continue;

    logger.mask(value);
    masked.push(key);
  }

  return masked;
}

function getGitHubContext(env = process.env) {
  const ref = getEnv("GITHUB_REF", "", env);
  const refName = getEnv("GITHUB_REF_NAME", "", env);
  const headRef = getEnv("GITHUB_HEAD_REF", "", env);
  const baseRef = getEnv("GITHUB_BASE_REF", "", env);
  const repository = getEnv("GITHUB_REPOSITORY", "", env);
  const [owner = "", repo = ""] = repository.split("/");

  return {
    actions: getBooleanEnv("GITHUB_ACTIONS", false, env),
    actor: getEnv("GITHUB_ACTOR", "", env),
    triggering_actor: getEnv("GITHUB_TRIGGERING_ACTOR", "", env),
    api_url: getEnv("GITHUB_API_URL", "https://api.github.com", env),
    graphql_url: getEnv(
      "GITHUB_GRAPHQL_URL",
      "https://api.github.com/graphql",
      env,
    ),
    server_url: getEnv("GITHUB_SERVER_URL", "https://github.com", env),
    repository,
    repository_owner: getEnv("GITHUB_REPOSITORY_OWNER", owner, env),
    owner,
    repo,
    event_name: getEnv("GITHUB_EVENT_NAME", "", env),
    event_path: getEnv("GITHUB_EVENT_PATH", "", env),
    workflow: getEnv("GITHUB_WORKFLOW", "", env),
    job: getEnv("GITHUB_JOB", "", env),
    run_id: getEnv("GITHUB_RUN_ID", "", env),
    run_number: getEnv("GITHUB_RUN_NUMBER", "", env),
    run_attempt: getEnv("GITHUB_RUN_ATTEMPT", "", env),
    workspace: getEnv("GITHUB_WORKSPACE", process.cwd(), env),
    sha: getEnv("GITHUB_SHA", "", env),
    ref,
    ref_name: refName,
    ref_type: getEnv("GITHUB_REF_TYPE", "", env),
    head_ref: headRef,
    base_ref: baseRef,
    branch:
      normalizeBranchName(headRef) ||
      normalizeBranchName(refName) ||
      normalizeBranchName(ref),
    base_branch: normalizeBranchName(baseRef),
    tag: normalizeTagName(refName) || normalizeTagName(ref),
    is_pull_request: ["pull_request", "pull_request_target"].includes(
      getEnv("GITHUB_EVENT_NAME", "", env),
    ),
    is_push: getEnv("GITHUB_EVENT_NAME", "", env) === "push",
    is_schedule: getEnv("GITHUB_EVENT_NAME", "", env) === "schedule",
    is_workflow_dispatch:
      getEnv("GITHUB_EVENT_NAME", "", env) === "workflow_dispatch",
    is_release: getEnv("GITHUB_EVENT_NAME", "", env) === "release",
  };
}

function readGitHubEventPayload(env = process.env) {
  const eventPath = getEnv("GITHUB_EVENT_PATH", "", env);

  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to read GitHub event payload: ${logger.formatError(err)}`,
    );
  }
}

function getPullRequestContext(env = process.env) {
  const payload = readGitHubEventPayload(env);
  const pullRequest = payload.pull_request || {};

  return {
    number: pullRequest.number || payload.number || null,
    title: pullRequest.title || "",
    body: pullRequest.body || "",
    state: pullRequest.state || "",
    merged: Boolean(pullRequest.merged),
    draft: Boolean(pullRequest.draft),
    author: pullRequest.user?.login || "",
    base_branch: pullRequest.base?.ref || getEnv("GITHUB_BASE_REF", "", env),
    head_branch: pullRequest.head?.ref || getEnv("GITHUB_HEAD_REF", "", env),
    head_sha: pullRequest.head?.sha || "",
    base_sha: pullRequest.base?.sha || "",
    from_fork: Boolean(pullRequest.head?.repo?.fork),
    labels: Array.isArray(pullRequest.labels)
      ? pullRequest.labels.map((label) => label.name).filter(Boolean)
      : [],
    milestone: pullRequest.milestone?.title || null,
    html_url: pullRequest.html_url || "",
  };
}

function getIssueContext(env = process.env) {
  const payload = readGitHubEventPayload(env);
  const issue = payload.issue || {};

  return {
    number: issue.number || payload.number || null,
    title: issue.title || "",
    body: issue.body || "",
    state: issue.state || "",
    author: issue.user?.login || "",
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label) => label.name).filter(Boolean)
      : [],
    milestone: issue.milestone?.title || null,
    html_url: issue.html_url || "",
  };
}

function getWorkflowContext(env = process.env) {
  const github = getGitHubContext(env);

  return {
    environment: getEnv(
      "GITHUB_ENVIRONMENT",
      getEnv("ENVIRONMENT", DEFAULT_ENVIRONMENT, env),
      env,
    ),
    node_version: getEnv("NODE_VERSION", DEFAULT_NODE_VERSION, env),
    pnpm_version: getEnv("PNPM_VERSION", DEFAULT_PNPM_VERSION, env),
    default_branch: getEnv("DEFAULT_BRANCH", DEFAULT_DEFAULT_BRANCH, env),
    dry_run: getFirstBooleanEnv(
      ["DRY_RUN", "PROJECT_SYNC_DRY_RUN"],
      logger.DRY_RUN,
      env,
    ),
    debug: getFirstBooleanEnv(
      ["DEBUG_PROJECT_SYNC", "PROJECT_SYNC_DEBUG", "ACTIONS_STEP_DEBUG"],
      logger.DEBUG,
      env,
    ),
    write_mode: getFirstBooleanEnv(
      ["WRITE_MODE", "PROJECT_SYNC_WRITE_MODE", "AEREALITH_WRITE_MODE"],
      false,
      env,
    ),
    confirm_write: getFirstBooleanEnv(
      [
        "CONFIRM_WRITE",
        "PROJECT_SYNC_CONFIRM_WRITE",
        "AEREALITH_CONFIRM_WRITE",
      ],
      false,
      env,
    ),
    confirm_destructive: getFirstBooleanEnv(
      [
        "CONFIRM_DESTRUCTIVE",
        "PROJECT_SYNC_CONFIRM_DESTRUCTIVE",
        "AEREALITH_CONFIRM_DESTRUCTIVE",
      ],
      false,
      env,
    ),
    github,
  };
}

function getReleaseContext(env = process.env) {
  const github = getGitHubContext(env);

  const releaseVersion =
    getEnv("RELEASE_VERSION", "", env) ||
    getEnv("RELEASE_TAG", "", env) ||
    (isReleaseTag(github.ref) ? normalizeTagName(github.ref) : "");

  const releaseChannel = normalizeReleaseChannel(
    getEnv("RELEASE_CHANNEL", DEFAULT_RELEASE_CHANNEL, env),
  );

  return {
    version: releaseVersion,
    tag: normalizeTagName(getEnv("RELEASE_TAG", releaseVersion, env)),
    channel: releaseChannel,
    is_release_tag: isReleaseTag(releaseVersion) || isReleaseTag(github.ref),
    github,
  };
}

function getCloudflareContext(env = process.env) {
  return {
    environment: getEnv("CLOUDFLARE_ENVIRONMENT", DEFAULT_ENVIRONMENT, env),
    account_id: getEnv("CLOUDFLARE_ACCOUNT_ID", "", env),
    zone_id: getEnv("CLOUDFLARE_ZONE_ID", "", env),
    api_token_present: hasEnv("CLOUDFLARE_API_TOKEN", env),
    project_name: getEnv("CLOUDFLARE_PROJECT_NAME", "", env),
  };
}

function getSonarContext(env = process.env) {
  return {
    project_key: getEnv("SONAR_PROJECT_KEY", "", env),
    organization: getEnv("SONAR_ORGANIZATION", "", env),
    token_present: hasEnv("SONAR_TOKEN", env),
  };
}

function getNpmContext(env = process.env) {
  return {
    registry: getEnv("NPM_CONFIG_REGISTRY", "https://registry.npmjs.org", env),
    token_present:
      hasEnv("NPM_ACCESS_TOKEN", env) || hasEnv("NODE_AUTH_TOKEN", env),
  };
}

function getGhcrContext(env = process.env) {
  return {
    registry: getEnv("GHCR_REGISTRY", "ghcr.io", env),
    owner: getEnv("GHCR_OWNER", "sinless-games", env),
    namespace: getEnv("GHCR_NAMESPACE", "aerealith-ai", env),
    username: getEnv("GHCR_USERNAME", getEnv("GITHUB_ACTOR", "", env), env),
    token_present: hasEnv("GHCR_TOKEN", env) || hasEnv("GITHUB_TOKEN", env),
  };
}

function createEnvironmentSnapshot(options = {}) {
  const env = options.env || process.env;
  const includeOnly = normalizeStringList(
    options.includeOnly || options.include_only,
  );

  const keys = includeOnly.length ? includeOnly : SAFE_ENV_KEYS;

  return {
    schema_version: 1,
    type: "aerealith-environment-snapshot",
    created_at: new Date().toISOString(),
    platform: {
      os: os.platform(),
      arch: os.arch(),
      node: process.version,
      cwd: process.cwd(),
    },
    workflow: getWorkflowContext(env),
    release: getReleaseContext(env),
    cloudflare: getCloudflareContext(env),
    sonar: getSonarContext(env),
    npm: getNpmContext(env),
    ghcr: getGhcrContext(env),
    env: redactEnvObject(env, {
      includeOnly: keys,
    }),
  };
}

function writeEnvironmentSnapshot(
  outputFile = "artifacts/environment/environment-snapshot.json",
  options = {},
) {
  const snapshot = createEnvironmentSnapshot(options);
  const absolutePath = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(process.cwd(), outputFile);

  fs.mkdirSync(path.dirname(absolutePath), {
    recursive: true,
  });

  fs.writeFileSync(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`);

  logger.info(`Wrote environment snapshot to ${outputFile}.`);

  return absolutePath;
}

function createEnvironmentSummary(snapshot = createEnvironmentSnapshot()) {
  const workflow = snapshot.workflow || {};
  const github = workflow.github || {};
  const release = snapshot.release || {};
  const cloudflare = snapshot.cloudflare || {};
  const sonar = snapshot.sonar || {};
  const npm = snapshot.npm || {};
  const ghcr = snapshot.ghcr || {};

  return [
    "## Environment",
    "",
    `- Repository: \`${github.repository || "unknown"}\``,
    `- Event: \`${github.event_name || "unknown"}\``,
    `- Ref: \`${github.ref || "unknown"}\``,
    `- Branch: \`${github.branch || "unknown"}\``,
    `- SHA: \`${github.sha || "unknown"}\``,
    `- Actor: \`${github.actor || "unknown"}\``,
    `- Dry-run: \`${workflow.dry_run ? "true" : "false"}\``,
    `- Write mode: \`${workflow.write_mode ? "true" : "false"}\``,
    `- Node.js: \`${workflow.node_version || DEFAULT_NODE_VERSION}\``,
    `- pnpm: \`${workflow.pnpm_version || DEFAULT_PNPM_VERSION}\``,
    "",
    "### Release",
    "",
    `- Version: \`${release.version || "none"}\``,
    `- Channel: \`${release.channel || "none"}\``,
    `- Release tag: \`${release.is_release_tag ? "true" : "false"}\``,
    "",
    "### Services",
    "",
    `- Cloudflare environment: \`${cloudflare.environment || "none"}\``,
    `- Cloudflare token present: \`${cloudflare.api_token_present ? "true" : "false"}\``,
    `- SonarQube project: \`${sonar.project_key || "none"}\``,
    `- SonarQube token present: \`${sonar.token_present ? "true" : "false"}\``,
    `- npm token present: \`${npm.token_present ? "true" : "false"}\``,
    `- GHCR token present: \`${ghcr.token_present ? "true" : "false"}\``,
  ].join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping environment summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${markdown.trim()}\n\n`);

  return true;
}

function appendEnvironmentSummary(snapshot = createEnvironmentSnapshot()) {
  return appendGitHubStepSummary(createEnvironmentSummary(snapshot));
}

function escapeGithubCommandValue(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
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

function exportGitHubEnv(name, value) {
  const envFile = process.env.GITHUB_ENV;

  if (!envFile) {
    process.env[name] = String(value);
    logger.debug(`GITHUB_ENV is not set. Updated process.env.${name} only.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(envFile, `${name}<<EOF\n${rendered}\nEOF\n`);
  process.env[name] = rendered;

  return true;
}

function addGitHubPath(value) {
  const pathFile = process.env.GITHUB_PATH;

  if (!pathFile) {
    logger.debug(`GITHUB_PATH is not set. Skipping PATH append for ${value}.`);
    return false;
  }

  fs.appendFileSync(pathFile, `${value}\n`);

  return true;
}

function setStepNotice(message) {
  console.log(`::notice::${escapeGithubCommandValue(message)}`);
}

function setStepWarning(message) {
  console.log(`::warning::${escapeGithubCommandValue(message)}`);
}

function setStepError(message) {
  console.log(`::error::${escapeGithubCommandValue(message)}`);
}

function printEnvironment(options = {}) {
  const snapshot = createEnvironmentSnapshot(options);

  logger.info("Environment context loaded.");
  logger.info(
    `Repository: ${snapshot.workflow.github.repository || "unknown"}`,
  );
  logger.info(`Event: ${snapshot.workflow.github.event_name || "unknown"}`);
  logger.info(`Ref: ${snapshot.workflow.github.ref || "unknown"}`);
  logger.info(
    `Dry-run: ${snapshot.workflow.dry_run ? "enabled" : "disabled"}.`,
  );
  logger.info(
    `Write mode: ${snapshot.workflow.write_mode ? "enabled" : "disabled"}.`,
  );

  logger.dump("environment snapshot", snapshot);

  return snapshot;
}

function runCli() {
  const command = process.argv[2] || "summary";

  maskKnownSecrets();

  if (command === "print") {
    const snapshot = printEnvironment();
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (command === "summary") {
    const snapshot = createEnvironmentSnapshot();
    appendEnvironmentSummary(snapshot);
    console.log(createEnvironmentSummary(snapshot));
    return;
  }

  if (command === "snapshot") {
    writeEnvironmentSnapshot(
      process.argv[3] || "artifacts/environment/environment-snapshot.json",
    );
    return;
  }

  if (command === "validate") {
    const groups = normalizeStringList(process.argv.slice(3));

    const result = validateRequiredGroups(DEFAULT_REQUIRED_GROUPS, groups);

    if (!result.valid) {
      throw new Error(
        `Missing required environment variables: ${result.missing.join(", ")}`,
      );
    }

    logger.info("Required environment validation passed.");
    return;
  }

  throw new Error(`Unknown env utility command: ${command}`);
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

  DEFAULT_ENVIRONMENT,
  DEFAULT_NODE_VERSION,
  DEFAULT_PNPM_VERSION,
  DEFAULT_DEFAULT_BRANCH,
  DEFAULT_RELEASE_CHANNEL,
  VALID_RELEASE_CHANNELS,
  RELEASE_TAG_PATTERN,
  SECRET_KEY_PATTERN,
  SAFE_ENV_KEYS,
  DEFAULT_REQUIRED_GROUPS,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,
  normalizeNumber,
  normalizeJson,
  normalizeBranchName,
  normalizeTagName,
  normalizeReleaseChannel,
  isReleaseTag,

  getEnv,
  getOptionalEnv,
  getBooleanEnv,
  getIntegerEnv,
  getNumberEnv,
  getJsonEnv,
  getListEnv,
  getFirstEnv,
  getFirstBooleanEnv,
  hasEnv,
  setEnv,
  unsetEnv,
  requireEnv,
  getMissingEnv,
  validateRequiredEnv,
  assertRequiredEnv,
  validateRequiredGroups,
  assertRequiredGroups,

  isSecretKey,
  redactValue,
  redactEnvObject,
  maskEnv,
  maskEnvGroup,
  maskKnownSecrets,

  getGitHubContext,
  readGitHubEventPayload,
  getPullRequestContext,
  getIssueContext,
  getWorkflowContext,
  getReleaseContext,
  getCloudflareContext,
  getSonarContext,
  getNpmContext,
  getGhcrContext,

  createEnvironmentSnapshot,
  writeEnvironmentSnapshot,
  createEnvironmentSummary,
  appendGitHubStepSummary,
  appendEnvironmentSummary,

  setGitHubOutput,
  exportGitHubEnv,
  addGitHubPath,
  setStepNotice,
  setStepWarning,
  setStepError,

  printEnvironment,
};
