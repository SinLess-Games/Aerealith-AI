// .github/scripts/utils/dry-run.js
// =============================================================================
// Aerealith AI Dry-Run Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared dry-run helpers for GitHub automation scripts.
//
// Used by:
//   - repo management scripts
//   - release scripts
//   - security scripts
//   - Cloudflare deployment scripts
//   - Docker/GHCR publish scripts
//   - npm publish scripts
//   - artifact/evidence scripts
//
// Notes:
//   - Dry-run mode must prevent external mutation.
//   - Local reporting artifacts may still be written when explicitly allowed.
//   - Destructive actions should require both write mode and explicit approval.
//   - This module is CommonJS and has no external package dependencies.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");

const logger = require("./logger");

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_DRY_RUN_ENV_KEYS = [
  "DRY_RUN",
  "PROJECT_SYNC_DRY_RUN",
  "AEREALITH_DRY_RUN",
  "GITHUB_DRY_RUN",
];

const DEFAULT_WRITE_MODE_ENV_KEYS = [
  "WRITE_MODE",
  "PROJECT_SYNC_WRITE_MODE",
  "AEREALITH_WRITE_MODE",
];

const DEFAULT_CONFIRMATION_ENV_KEYS = [
  "CONFIRM_WRITE",
  "PROJECT_SYNC_CONFIRM_WRITE",
  "AEREALITH_CONFIRM_WRITE",
];

const DEFAULT_DESTRUCTIVE_CONFIRMATION_ENV_KEYS = [
  "CONFIRM_DESTRUCTIVE",
  "PROJECT_SYNC_CONFIRM_DESTRUCTIVE",
  "AEREALITH_CONFIRM_DESTRUCTIVE",
];

const DEFAULT_ALLOWED_MUTATION_EVENTS = [
  "workflow_dispatch",
  "schedule",
  "push",
  "pull_request_target",
  "release",
];

const DEFAULT_BLOCKED_MUTATION_EVENTS = ["pull_request"];

const DEFAULT_EXTERNAL_MUTATION_TYPES = [
  "api",
  "github",
  "cloudflare",
  "npm",
  "ghcr",
  "docker-push",
  "release",
  "deployment",
  "discussion",
  "issue",
  "pull-request",
  "label",
  "milestone",
  "project",
  "security-alert",
];

const DEFAULT_DESTRUCTIVE_ACTIONS = [
  "delete",
  "remove",
  "close",
  "archive",
  "dismiss",
  "disable",
  "destroy",
  "purge",
  "revoke",
  "force-push",
];

const DEFAULT_SAFE_LOCAL_ACTIONS = [
  "read",
  "validate",
  "discover",
  "plan",
  "summarize",
  "hash",
  "manifest",
  "artifact",
  "write-local-file",
];

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

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function readFirstBooleanEnv(keys, fallback = false, env = process.env) {
  for (const key of keys) {
    if (env[key] !== undefined && env[key] !== "") {
      return normalizeBoolean(env[key], fallback);
    }
  }

  return fallback;
}

function readFirstStringEnv(keys, fallback = "", env = process.env) {
  for (const key of keys) {
    if (env[key] !== undefined && env[key] !== "") {
      return normalizeString(env[key], fallback);
    }
  }

  return fallback;
}

function getDryRun(options = {}) {
  if (options.dryRun !== undefined)
    return normalizeBoolean(options.dryRun, false);
  if (options.dry_run !== undefined)
    return normalizeBoolean(options.dry_run, false);

  return readFirstBooleanEnv(DEFAULT_DRY_RUN_ENV_KEYS, logger.DRY_RUN || false);
}

function getDebug(options = {}) {
  if (options.debug !== undefined)
    return normalizeBoolean(options.debug, false);

  return normalizeBoolean(
    process.env.DEBUG_PROJECT_SYNC ||
      process.env.PROJECT_SYNC_DEBUG ||
      process.env.ACTIONS_STEP_DEBUG,
    logger.DEBUG || false,
  );
}

function getWriteMode(options = {}) {
  if (options.writeMode !== undefined)
    return normalizeBoolean(options.writeMode, false);
  if (options.write_mode !== undefined)
    return normalizeBoolean(options.write_mode, false);

  return readFirstBooleanEnv(DEFAULT_WRITE_MODE_ENV_KEYS, false);
}

function getConfirmation(options = {}) {
  if (options.confirm !== undefined)
    return normalizeBoolean(options.confirm, false);
  if (options.confirm_write !== undefined)
    return normalizeBoolean(options.confirm_write, false);

  return readFirstBooleanEnv(DEFAULT_CONFIRMATION_ENV_KEYS, false);
}

function getDestructiveConfirmation(options = {}) {
  if (options.confirmDestructive !== undefined) {
    return normalizeBoolean(options.confirmDestructive, false);
  }

  if (options.confirm_destructive !== undefined) {
    return normalizeBoolean(options.confirm_destructive, false);
  }

  return readFirstBooleanEnv(DEFAULT_DESTRUCTIVE_CONFIRMATION_ENV_KEYS, false);
}

function getGitHubEventName(env = process.env) {
  return normalizeString(env.GITHUB_EVENT_NAME);
}

function getGitHubRef(env = process.env) {
  return normalizeString(env.GITHUB_REF);
}

function getGitHubActor(env = process.env) {
  return normalizeString(env.GITHUB_ACTOR);
}

function getGitHubRepository(env = process.env) {
  return normalizeString(env.GITHUB_REPOSITORY);
}

function isTrustedMutationEvent(eventName = getGitHubEventName()) {
  const normalized = normalizeString(eventName);
  if (!normalized) return false;

  return DEFAULT_ALLOWED_MUTATION_EVENTS.includes(normalized);
}

function isBlockedMutationEvent(eventName = getGitHubEventName()) {
  const normalized = normalizeString(eventName);
  if (!normalized) return false;

  return DEFAULT_BLOCKED_MUTATION_EVENTS.includes(normalized);
}

function isExternalMutationType(type) {
  const normalized = normalizeString(type).toLowerCase();
  return DEFAULT_EXTERNAL_MUTATION_TYPES.includes(normalized);
}

function isDestructiveAction(action) {
  const normalized = normalizeString(action).toLowerCase();

  return DEFAULT_DESTRUCTIVE_ACTIONS.some((candidate) => {
    return normalized === candidate || normalized.startsWith(`${candidate}:`);
  });
}

function isSafeLocalAction(action) {
  const normalized = normalizeString(action).toLowerCase();

  return DEFAULT_SAFE_LOCAL_ACTIONS.some((candidate) => {
    return normalized === candidate || normalized.startsWith(`${candidate}:`);
  });
}

function normalizeOperation(operation = {}) {
  if (typeof operation === "string") {
    return {
      action: operation,
      type: "unknown",
      target: null,
      description: operation,
      metadata: {},
    };
  }

  return {
    action: normalizeString(operation.action || operation.name || "operation"),
    type: normalizeString(operation.type || operation.kind || "unknown"),
    target: normalizeString(operation.target || operation.resource || ""),
    description: normalizeString(
      operation.description ||
        operation.message ||
        operation.action ||
        operation.name,
      "operation",
    ),
    metadata:
      operation.metadata && typeof operation.metadata === "object"
        ? operation.metadata
        : {},
  };
}

function classifyOperation(operation = {}) {
  const normalized = normalizeOperation(operation);

  return {
    ...normalized,
    external_mutation: isExternalMutationType(normalized.type),
    destructive: isDestructiveAction(normalized.action),
    safe_local: isSafeLocalAction(normalized.action),
  };
}

function createDryRunState(options = {}) {
  return {
    dry_run: getDryRun(options),
    debug: getDebug(options),
    write_mode: getWriteMode(options),
    confirm_write: getConfirmation(options),
    confirm_destructive: getDestructiveConfirmation(options),
    allow_local_file_writes: normalizeBoolean(
      options.allowLocalFileWrites ?? options.allow_local_file_writes,
      true,
    ),
    allow_untrusted_event_writes: normalizeBoolean(
      options.allowUntrustedEventWrites ?? options.allow_untrusted_event_writes,
      false,
    ),
    event_name: normalizeString(
      options.eventName || options.event_name,
      getGitHubEventName(),
    ),
    ref: normalizeString(options.ref, getGitHubRef()),
    actor: normalizeString(options.actor, getGitHubActor()),
    repository: normalizeString(options.repository, getGitHubRepository()),
  };
}

function shouldSkipMutation(options = {}, operation = {}) {
  const state = createDryRunState(options);
  const classified = classifyOperation(operation);

  if (state.dry_run) {
    return {
      skip: true,
      reason: "Dry-run mode is enabled.",
      state,
      operation: classified,
    };
  }

  if (classified.safe_local && !classified.external_mutation) {
    return {
      skip: false,
      reason: null,
      state,
      operation: classified,
    };
  }

  if (!state.write_mode) {
    return {
      skip: true,
      reason: "Write mode is disabled.",
      state,
      operation: classified,
    };
  }

  if (!state.confirm_write) {
    return {
      skip: true,
      reason: "Write confirmation is missing.",
      state,
      operation: classified,
    };
  }

  if (classified.destructive && !state.confirm_destructive) {
    return {
      skip: true,
      reason: "Destructive confirmation is missing.",
      state,
      operation: classified,
    };
  }

  if (
    isBlockedMutationEvent(state.event_name) &&
    !state.allow_untrusted_event_writes
  ) {
    return {
      skip: true,
      reason: `Mutation is blocked for GitHub event: ${state.event_name}.`,
      state,
      operation: classified,
    };
  }

  if (
    state.event_name &&
    !isTrustedMutationEvent(state.event_name) &&
    !state.allow_untrusted_event_writes
  ) {
    return {
      skip: true,
      reason: `Mutation is not trusted for GitHub event: ${state.event_name}.`,
      state,
      operation: classified,
    };
  }

  return {
    skip: false,
    reason: null,
    state,
    operation: classified,
  };
}

function assertCanMutate(options = {}, operation = {}) {
  const decision = shouldSkipMutation(options, operation);

  if (decision.skip) {
    throw new Error(
      [
        `Mutation blocked: ${decision.reason}`,
        `Action: ${decision.operation.action}`,
        decision.operation.target
          ? `Target: ${decision.operation.target}`
          : null,
        `Dry-run: ${decision.state.dry_run}`,
        `Write mode: ${decision.state.write_mode}`,
        `Confirmed: ${decision.state.confirm_write}`,
        `Event: ${decision.state.event_name || "unknown"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return true;
}

function createDryRunContext(options = {}) {
  const state = createDryRunState(options);

  const records = [];

  function record(operation) {
    const classified = classifyOperation(operation);

    const entry = {
      id: records.length + 1,
      timestamp: new Date().toISOString(),
      dry_run: state.dry_run,
      write_mode: state.write_mode,
      action: classified.action,
      type: classified.type,
      target: classified.target || null,
      description: classified.description,
      external_mutation: classified.external_mutation,
      destructive: classified.destructive,
      safe_local: classified.safe_local,
      metadata: classified.metadata,
    };

    records.push(entry);

    if (state.dry_run) {
      logger.dryRun(
        `${entry.description}${entry.target ? `: ${entry.target}` : ""}`,
      );
    } else {
      logger.debug(`Recorded operation: ${entry.description}`);
    }

    return entry;
  }

  function wouldCreate(target, metadata = {}) {
    return record({
      action: "create",
      type: metadata.type || "github",
      target,
      description: `Would create ${metadata.resource || "resource"}`,
      metadata,
    });
  }

  function wouldUpdate(target, metadata = {}) {
    return record({
      action: "update",
      type: metadata.type || "github",
      target,
      description: `Would update ${metadata.resource || "resource"}`,
      metadata,
    });
  }

  function wouldDelete(target, metadata = {}) {
    return record({
      action: "delete",
      type: metadata.type || "github",
      target,
      description: `Would delete ${metadata.resource || "resource"}`,
      metadata,
    });
  }

  function wouldRun(command, metadata = {}) {
    return record({
      action: "run",
      type: metadata.type || "command",
      target: command,
      description: "Would run command",
      metadata,
    });
  }

  function wouldPublish(target, metadata = {}) {
    return record({
      action: "publish",
      type: metadata.type || "release",
      target,
      description: `Would publish ${metadata.resource || "resource"}`,
      metadata,
    });
  }

  function wouldDeploy(target, metadata = {}) {
    return record({
      action: "deploy",
      type: metadata.type || "deployment",
      target,
      description: `Would deploy ${metadata.resource || "resource"}`,
      metadata,
    });
  }

  function wouldUpload(target, metadata = {}) {
    return record({
      action: "upload",
      type: metadata.type || "artifact",
      target,
      description: `Would upload ${metadata.resource || "artifact"}`,
      metadata,
    });
  }

  function toJSON() {
    return {
      schema_version: 1,
      type: "aerealith-dry-run-plan",
      created_at: new Date().toISOString(),
      state,
      totals: {
        operations: records.length,
        external_mutations: records.filter((item) => item.external_mutation)
          .length,
        destructive: records.filter((item) => item.destructive).length,
        safe_local: records.filter((item) => item.safe_local).length,
      },
      operations: records,
    };
  }

  function summaryMarkdown() {
    const plan = toJSON();

    const lines = [
      "## Dry-Run Plan",
      "",
      `- Dry-run: \`${plan.state.dry_run ? "true" : "false"}\``,
      `- Write mode: \`${plan.state.write_mode ? "true" : "false"}\``,
      `- Event: \`${plan.state.event_name || "unknown"}\``,
      `- Ref: \`${plan.state.ref || "unknown"}\``,
      `- Actor: \`${plan.state.actor || "unknown"}\``,
      `- Operations: \`${plan.totals.operations}\``,
      `- External mutations: \`${plan.totals.external_mutations}\``,
      `- Destructive operations: \`${plan.totals.destructive}\``,
    ];

    if (records.length) {
      lines.push("");
      lines.push("| # | Action | Type | Target | Description |");
      lines.push("|---:|---|---|---|---|");

      for (const entry of records) {
        lines.push(
          `| ${entry.id} | \`${entry.action}\` | \`${entry.type}\` | \`${entry.target || ""}\` | ${entry.description} |`,
        );
      }
    }

    return lines.join("\n");
  }

  function writePlan(
    outputFile = "artifacts/dry-run-plan.json",
    writeOptions = {},
  ) {
    const allowWrite = normalizeBoolean(
      writeOptions.allowLocalFileWrites ?? writeOptions.allow_local_file_writes,
      state.allow_local_file_writes,
    );

    if (!allowWrite) {
      logger.debug(
        `Skipping dry-run plan write because local file writes are disabled: ${outputFile}`,
      );
      return null;
    }

    const absolutePath = path.isAbsolute(outputFile)
      ? outputFile
      : path.join(process.cwd(), outputFile);

    fs.mkdirSync(path.dirname(absolutePath), {
      recursive: true,
    });

    fs.writeFileSync(absolutePath, `${JSON.stringify(toJSON(), null, 2)}\n`);

    logger.info(`Wrote dry-run plan to ${outputFile}.`);

    return absolutePath;
  }

  function appendStepSummary() {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;

    if (!summaryFile) {
      logger.debug(
        "GITHUB_STEP_SUMMARY is not set. Skipping dry-run summary append.",
      );
      return false;
    }

    fs.appendFileSync(summaryFile, `${summaryMarkdown()}\n\n`);

    return true;
  }

  return {
    state,
    records,

    record,
    wouldCreate,
    wouldUpdate,
    wouldDelete,
    wouldRun,
    wouldPublish,
    wouldDeploy,
    wouldUpload,

    toJSON,
    summaryMarkdown,
    writePlan,
    appendStepSummary,
  };
}

function runOrPlan(operation, execute, options = {}) {
  const decision = shouldSkipMutation(options, operation);
  const classified = decision.operation;

  if (decision.skip) {
    logger.dryRun(
      `${classified.description}${classified.target ? `: ${classified.target}` : ""} — ${decision.reason}`,
    );

    return {
      skipped: true,
      dry_run: decision.state.dry_run,
      reason: decision.reason,
      operation: classified,
      result: null,
    };
  }

  if (typeof execute !== "function") {
    throw new TypeError(
      "runOrPlan requires an execute function when mutation is allowed.",
    );
  }

  const result = execute();

  return {
    skipped: false,
    dry_run: false,
    reason: null,
    operation: classified,
    result,
  };
}

async function runOrPlanAsync(operation, execute, options = {}) {
  const decision = shouldSkipMutation(options, operation);
  const classified = decision.operation;

  if (decision.skip) {
    logger.dryRun(
      `${classified.description}${classified.target ? `: ${classified.target}` : ""} — ${decision.reason}`,
    );

    return {
      skipped: true,
      dry_run: decision.state.dry_run,
      reason: decision.reason,
      operation: classified,
      result: null,
    };
  }

  if (typeof execute !== "function") {
    throw new TypeError(
      "runOrPlanAsync requires an execute function when mutation is allowed.",
    );
  }

  const result = await execute();

  return {
    skipped: false,
    dry_run: false,
    reason: null,
    operation: classified,
    result,
  };
}

function requireWriteMode(options = {}, operation = {}) {
  return assertCanMutate(options, operation);
}

function requireNotDryRun(
  options = {},
  message = "Operation cannot run in dry-run mode.",
) {
  if (getDryRun(options)) {
    throw new Error(message);
  }

  return true;
}

function maybeWriteFile(filePath, contents, options = {}) {
  const dryRun = getDryRun(options);
  const allowLocalFileWrites = normalizeBoolean(
    options.allowLocalFileWrites ?? options.allow_local_file_writes,
    true,
  );

  if (dryRun && !allowLocalFileWrites) {
    logger.dryRun(`Would write local file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, contents);
    return {
      written: false,
      dry_run: true,
      path: filePath,
    };
  }

  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, contents);

  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    dry_run: dryRun,
    path: filePath,
  };
}

function maybeWriteJson(filePath, value, options = {}) {
  return maybeWriteFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    options,
  );
}

function setGitHubOutput(name, value, options = {}) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  if (getDryRun(options) && options.skipOutputsInDryRun) {
    logger.dryRun(`Would set GitHub output ${name}.`);
    return false;
  }

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function printState(options = {}) {
  const state = createDryRunState(options);

  logger.info(`Dry-run: ${state.dry_run ? "enabled" : "disabled"}.`);
  logger.info(`Write mode: ${state.write_mode ? "enabled" : "disabled"}.`);
  logger.debug(`Dry-run state: ${JSON.stringify(state, null, 2)}`);

  return state;
}

if (require.main === module) {
  const context = createDryRunContext();

  context.record({
    action: "plan",
    type: "dry-run",
    target: "workflow",
    description: "Dry-run utility validation",
  });

  printState();
  context.appendStepSummary();

  if (process.argv.includes("--write-plan")) {
    context.writePlan();
  }
}

module.exports = {
  TRUE_VALUES,
  FALSE_VALUES,

  DEFAULT_DRY_RUN_ENV_KEYS,
  DEFAULT_WRITE_MODE_ENV_KEYS,
  DEFAULT_CONFIRMATION_ENV_KEYS,
  DEFAULT_DESTRUCTIVE_CONFIRMATION_ENV_KEYS,
  DEFAULT_ALLOWED_MUTATION_EVENTS,
  DEFAULT_BLOCKED_MUTATION_EVENTS,
  DEFAULT_EXTERNAL_MUTATION_TYPES,
  DEFAULT_DESTRUCTIVE_ACTIONS,
  DEFAULT_SAFE_LOCAL_ACTIONS,

  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  readFirstBooleanEnv,
  readFirstStringEnv,

  getDryRun,
  getDebug,
  getWriteMode,
  getConfirmation,
  getDestructiveConfirmation,

  getGitHubEventName,
  getGitHubRef,
  getGitHubActor,
  getGitHubRepository,

  isTrustedMutationEvent,
  isBlockedMutationEvent,
  isExternalMutationType,
  isDestructiveAction,
  isSafeLocalAction,

  normalizeOperation,
  classifyOperation,

  createDryRunState,
  shouldSkipMutation,
  assertCanMutate,
  requireWriteMode,
  requireNotDryRun,

  createDryRunContext,
  runOrPlan,
  runOrPlanAsync,

  maybeWriteFile,
  maybeWriteJson,
  setGitHubOutput,
  printState,
};
