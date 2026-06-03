// .github/scripts/utils/logger.js
// =============================================================================
// Aerealith AI GitHub Automation Logger
// -----------------------------------------------------------------------------
// Purpose:
//   Shared logger for GitHub workflow helper scripts.
//
// Features:
//   - Stable CommonJS API.
//   - Backward compatible with existing `info`, `warn`, `error`, `debug`,
//     `dump`, and `formatError` calls.
//   - GitHub Actions annotations when running in Actions.
//   - Debug and dry-run awareness.
//   - Secret redaction.
//   - Safe JSON rendering.
//   - Grouped logs.
//   - Timing helpers.
// =============================================================================

const DEFAULT_PREFIX = "[project-sync]";

const prefix = process.env.PROJECT_SYNC_LOG_PREFIX || DEFAULT_PREFIX;

const DEBUG =
  ["true", "1", "yes", "on"].includes(
    String(process.env.DEBUG_PROJECT_SYNC || "").toLowerCase(),
  ) ||
  ["true", "1", "yes", "on"].includes(
    String(process.env.PROJECT_SYNC_DEBUG || "").toLowerCase(),
  ) ||
  ["true", "1", "yes", "on"].includes(
    String(process.env.ACTIONS_STEP_DEBUG || "").toLowerCase(),
  );

const DRY_RUN = ["true", "1", "yes", "on"].includes(
  String(
    process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN || "",
  ).toLowerCase(),
);

const GITHUB_ACTIONS =
  String(process.env.GITHUB_ACTIONS || "").toLowerCase() === "true";

let actionsCore = null;

if (GITHUB_ACTIONS) {
  try {
    actionsCore = require("@actions/core");
  } catch {
    actionsCore = null;
  }
}

const USE_GITHUB_ANNOTATIONS =
  GITHUB_ACTIONS &&
  String(
    process.env.PROJECT_SYNC_GITHUB_ANNOTATIONS || "true",
  ).toLowerCase() !== "false";

const USE_GROUPS =
  GITHUB_ACTIONS &&
  String(process.env.PROJECT_SYNC_GITHUB_GROUPS || "true").toLowerCase() !==
    "false";

const LEVELS = {
  debug: 10,
  info: 20,
  notice: 25,
  warn: 30,
  error: 40,
};

const LOG_LEVEL = String(
  process.env.PROJECT_SYNC_LOG_LEVEL || "debug",
).toLowerCase();

const MIN_LEVEL = LEVELS[LOG_LEVEL] || LEVELS.debug;

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|pwd|private[_-]?key|api[_-]?key|access[_-]?key|auth|credential)/i;

const REDACTION_PLACEHOLDER = "[REDACTED]";

function shouldLog(level) {
  if (level === "debug") return DEBUG;
  return (LEVELS[level] || LEVELS.info) >= MIN_LEVEL;
}

function toString(value) {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);

  return safeStringify(value);
}

function safeStringify(value, space = 2) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(
      value,
      (key, item) => {
        if (typeof item === "bigint") return item.toString();

        if (typeof item === "object" && item !== null) {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }

        if (SECRET_KEY_PATTERN.test(key)) {
          return REDACTION_PLACEHOLDER;
        }

        return item;
      },
      space,
    );
  } catch (err) {
    return `[Unserializable value: ${formatError(err)}]`;
  }
}

function getSecretValuesFromEnv() {
  return Object.entries(process.env)
    .filter(
      ([key, value]) =>
        SECRET_KEY_PATTERN.test(key) && typeof value === "string",
    )
    .map(([, value]) => value)
    .filter((value) => value && value.length >= 8);
}

function getCustomRedactionPatterns() {
  const raw = process.env.PROJECT_SYNC_REDACT_PATTERNS;

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string" && item.trim());
    }
  } catch {
    // Fall back to comma-separated parsing below.
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function redact(value) {
  let rendered = toString(value);

  for (const secret of getSecretValuesFromEnv()) {
    rendered = rendered.split(secret).join(REDACTION_PLACEHOLDER);
  }

  for (const pattern of getCustomRedactionPatterns()) {
    try {
      rendered = rendered.replace(
        new RegExp(pattern, "g"),
        REDACTION_PLACEHOLDER,
      );
    } catch {
      // Do not let a bad custom redaction pattern break workflow logging.
    }
  }

  return rendered;
}

function escapeGithubCommandValue(value) {
  return toString(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function emitGithubAnnotation(type, message, options = {}) {
  if (!USE_GITHUB_ANNOTATIONS) return;

  const annotation = {
    title: options.title,
    file: options.file,
    line: options.line,
    endLine: options.endLine,
    col: options.col,
    endColumn: options.endColumn,
  };

  const metadata = Object.entries(annotation)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([key, value]) => `${key}=${escapeGithubCommandValue(value)}`)
    .join(",");

  const suffix = metadata ? ` ${metadata}` : "";

  console.log(
    `::${type}${suffix}::${escapeGithubCommandValue(redact(message))}`,
  );
}

function format(level, message) {
  const text = redact(message);

  if (level === "debug") return `${prefix} DEBUG: ${text}`;
  if (level === "notice") return `${prefix} NOTICE: ${text}`;
  if (level === "warn") return `${prefix} WARN: ${text}`;
  if (level === "error") return `${prefix} ERROR: ${text}`;

  return `${prefix} ${text}`;
}

function log(level, message, options = {}) {
  if (!shouldLog(level)) return;

  const rendered = format(level, message);

  if (level === "error") {
    console.error(rendered);
    emitGithubAnnotation("error", message, options);
    return;
  }

  if (level === "warn") {
    console.warn(rendered);
    emitGithubAnnotation("warning", message, options);
    return;
  }

  if (level === "notice") {
    console.log(rendered);
    emitGithubAnnotation("notice", message, options);
    return;
  }

  console.log(rendered);
}

function info(message, options = {}) {
  log("info", message, options);
}

function notice(message, options = {}) {
  log("notice", message, options);
}

function warn(message, options = {}) {
  log("warn", message, options);
}

function error(message, options = {}) {
  log("error", message, options);
}

function debug(message, options = {}) {
  log("debug", message, options);
}

function success(message, options = {}) {
  info(`SUCCESS: ${message}`, options);
}

function dryRun(message, options = {}) {
  if (DRY_RUN) {
    notice(`DRY-RUN: ${message}`, options);
    return;
  }

  debug(`DRY-RUN disabled: ${message}`, options);
}

function dump(label, value) {
  if (!DEBUG) return;

  const rendered = typeof value === "string" ? value : safeStringify(value, 2);

  console.log(`${prefix} DEBUG ${redact(label)}: ${redact(rendered)}`);
}

function group(title) {
  const rendered = redact(title);

  if (USE_GROUPS) {
    console.log(`::group::${escapeGithubCommandValue(rendered)}`);
    return;
  }

  info(`--- ${rendered} ---`);
}

function endGroup() {
  if (USE_GROUPS) {
    console.log("::endgroup::");
  }
}

function withGroup(title, callback) {
  group(title);

  try {
    return callback();
  } finally {
    endGroup();
  }
}

function startTimer(label) {
  const startedAt = Date.now();

  debug(`Started ${label}.`);

  return function stopTimer(message = null) {
    const elapsedMs = Date.now() - startedAt;
    const rendered = message || `Finished ${label}`;

    info(`${rendered} in ${elapsedMs}ms.`);

    return elapsedMs;
  };
}

function formatError(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return redact(err);

  const parts = [];

  const base = err.message || String(err);
  parts.push(base);

  if (err.code) {
    parts.push(`code=${err.code}`);
  }

  if (err.status) {
    parts.push(`status=${err.status}`);
  }

  if (err.statusCode) {
    parts.push(`statusCode=${err.statusCode}`);
  }

  if (Array.isArray(err.errors) && err.errors.length) {
    const details = err.errors
      .map((item) => {
        if (!item) return "unknown nested error";
        if (typeof item === "string") return item;
        return item.message || safeStringify(item);
      })
      .join("; ");

    parts.push(`details=${details}`);
  }

  if (DEBUG && err.stack) {
    parts.push(`stack=${err.stack}`);
  }

  return redact(parts.join(" | "));
}

function fail(err, options = {}) {
  error(formatError(err), options);
  process.exitCode = 1;
}

function mask(value) {
  const rendered = toString(value);

  if (!rendered) return;

  if (actionsCore?.setSecret) {
    actionsCore.setSecret(rendered);
  }
}

function getState() {
  return {
    prefix,
    debug: DEBUG,
    dryRun: DRY_RUN,
    githubActions: GITHUB_ACTIONS,
    githubAnnotations: USE_GITHUB_ANNOTATIONS,
    githubGroups: USE_GROUPS,
    logLevel: LOG_LEVEL,
  };
}

module.exports = {
  prefix,
  DEBUG,
  DRY_RUN,
  GITHUB_ACTIONS,

  info,
  notice,
  warn,
  error,
  debug,
  success,
  dryRun,
  dump,

  group,
  endGroup,
  withGroup,
  startTimer,

  formatError,
  fail,

  redact,
  mask,
  safeStringify,
  getState,
};
