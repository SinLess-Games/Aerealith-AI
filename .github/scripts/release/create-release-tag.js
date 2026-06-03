#!/usr/bin/env node
// .github/scripts/release/create-release-tag.js
// =============================================================================
// Aerealith AI — Release Tag Creator
// -----------------------------------------------------------------------------
// Purpose:
//   Create, verify, and optionally push a release git tag from direct inputs,
//   package metadata, or changelog artifacts.
//
// Input:
//   - artifacts/release/build-changelog.json
//   - .github/release/create-release-tag.json
//   - .github/release/create-release-tag.jsonc
//   - .github/release/create-release-tag.yaml
//   - .github/release/create-release-tag.yml
//   - package.json
//
// Output:
//   - artifacts/release/create-release-tag.json
//   - artifacts/release/create-release-tag.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses git CLI.
//   - Creates annotated tags by default.
//   - Dry-run mode reports intended git commands without mutating the repo.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[release-tag] ${message}`),
    warn: (message) => console.warn(`[release-tag] WARN: ${message}`),
    error: (message) => console.error(`[release-tag] ERROR: ${message}`),
    debug: () => {},
    dump: () => {},
    formatError: (err) => {
      if (!err) return "unknown error";
      if (typeof err === "string") return err;
      return err.message || String(err);
    },
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const DEFAULT_CONFIG_CANDIDATES = [
  ".github/release/create-release-tag.json",
  ".github/release/create-release-tag.jsonc",
  ".github/release/create-release-tag.yaml",
  ".github/release/create-release-tag.yml",
  ".github/release/release-tag.json",
  ".github/release/release-tag.jsonc",
  ".github/release/release-tag.yaml",
  ".github/release/release-tag.yml",
  "release/create-release-tag.json",
  "release/create-release-tag.jsonc",
  "release/create-release-tag.yaml",
  "release/create-release-tag.yml",
  "release/release-tag.json",
  "release/release-tag.jsonc",
  "release/release-tag.yaml",
  "release/release-tag.yml",
];

const DEFAULT_CHANGELOG_REPORT_FILE = "artifacts/release/build-changelog.json";
const DEFAULT_OUTPUT_FILE = "artifacts/release/create-release-tag.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/create-release-tag.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.CREATE_RELEASE_TAG_CONFIG_FILE || "",
    changelog_report_file:
      process.env.CREATE_RELEASE_TAG_CHANGELOG_REPORT_FILE ||
      process.env.RELEASE_CHANGELOG_REPORT_FILE ||
      DEFAULT_CHANGELOG_REPORT_FILE,

    output_file:
      process.env.CREATE_RELEASE_TAG_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CREATE_RELEASE_TAG_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    tag:
      process.env.CREATE_RELEASE_TAG_TAG ||
      process.env.RELEASE_TAG ||
      process.env.GITHUB_REF_NAME ||
      "",
    version:
      process.env.CREATE_RELEASE_TAG_VERSION ||
      process.env.RELEASE_VERSION ||
      "",
    target_ref:
      process.env.CREATE_RELEASE_TAG_TARGET_REF ||
      process.env.RELEASE_TARGET_REF ||
      process.env.RELEASE_TARGET_COMMITISH ||
      process.env.GITHUB_SHA ||
      "HEAD",
    message:
      process.env.CREATE_RELEASE_TAG_MESSAGE ||
      process.env.RELEASE_TAG_MESSAGE ||
      "",
    message_file:
      process.env.CREATE_RELEASE_TAG_MESSAGE_FILE ||
      process.env.RELEASE_TAG_MESSAGE_FILE ||
      "",

    remote:
      process.env.CREATE_RELEASE_TAG_REMOTE ||
      process.env.RELEASE_REMOTE ||
      "origin",

    annotated: normalizeBoolean(process.env.CREATE_RELEASE_TAG_ANNOTATED, true),
    signed: normalizeBoolean(process.env.CREATE_RELEASE_TAG_SIGNED, false),
    force: normalizeBoolean(process.env.CREATE_RELEASE_TAG_FORCE, false),
    update_existing: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_UPDATE_EXISTING,
      false,
    ),
    fail_if_exists: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_FAIL_IF_EXISTS,
      false,
    ),
    fail_if_missing: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_FAIL_IF_MISSING,
      true,
    ),

    push: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_PUSH || process.env.RELEASE_PUSH_TAG,
      false,
    ),
    push_force: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_PUSH_FORCE,
      false,
    ),
    verify_after_create: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_VERIFY,
      true,
    ),
    check_remote: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_CHECK_REMOTE,
      true,
    ),

    fail_on_error: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_FAIL_ON_ERROR,
      true,
    ),

    timeout_minutes: normalizeInteger(
      process.env.CREATE_RELEASE_TAG_TIMEOUT_MINUTES,
      10,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.CREATE_RELEASE_TAG_MAX_BUFFER_MB,
      64,
    ),

    dry_run: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.CREATE_RELEASE_TAG_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.CREATE_RELEASE_TAG_STEP_SUMMARY,
      true,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changelog-report") {
      args.changelog_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--target" ||
      arg === "--target-ref" ||
      arg === "--target-commitish"
    ) {
      args.target_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--message") {
      args.message = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--message-file") {
      args.message_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--remote") {
      args.remote = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--annotated") {
      args.annotated = true;
      continue;
    }

    if (arg === "--lightweight") {
      args.annotated = false;
      continue;
    }

    if (arg === "--signed") {
      args.signed = true;
      args.annotated = true;
      continue;
    }

    if (arg === "--no-signed") {
      args.signed = false;
      continue;
    }

    if (arg === "--force") {
      args.force = true;
      continue;
    }

    if (arg === "--no-force") {
      args.force = false;
      continue;
    }

    if (arg === "--update-existing") {
      args.update_existing = true;
      continue;
    }

    if (arg === "--no-update-existing") {
      args.update_existing = false;
      continue;
    }

    if (arg === "--fail-if-exists") {
      args.fail_if_exists = true;
      continue;
    }

    if (arg === "--fail-if-missing") {
      args.fail_if_missing = true;
      continue;
    }

    if (arg === "--no-fail-if-missing") {
      args.fail_if_missing = false;
      continue;
    }

    if (arg === "--push") {
      args.push = true;
      continue;
    }

    if (arg === "--no-push") {
      args.push = false;
      continue;
    }

    if (arg === "--push-force") {
      args.push_force = true;
      args.push = true;
      continue;
    }

    if (arg === "--no-push-force") {
      args.push_force = false;
      continue;
    }

    if (arg === "--verify") {
      args.verify_after_create = true;
      continue;
    }

    if (arg === "--no-verify") {
      args.verify_after_create = false;
      continue;
    }

    if (arg === "--check-remote") {
      args.check_remote = true;
      continue;
    }

    if (arg === "--no-check-remote") {
      args.check_remote = false;
      continue;
    }

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
      continue;
    }

    if (arg === "--timeout-minutes") {
      args.timeout_minutes = normalizeInteger(
        argv[index + 1],
        args.timeout_minutes,
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = argv[index + 1];
      args.write_summary_file = true;
      index += 1;
      continue;
    }

    if (arg === "--no-summary") {
      args.write_summary_file = false;
      continue;
    }

    if (arg === "--dry-run") {
      args.dry_run = true;
      continue;
    }

    if (arg === "--no-print") {
      args.print = false;
      continue;
    }

    if (arg === "--no-step-summary") {
      args.write_step_summary = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  args.repository = normalizeString(args.repository, DEFAULT_REPOSITORY);
  args.tag = normalizeTagName(args.tag);
  args.version = normalizeVersion(args.version);
  args.target_ref = normalizeString(args.target_ref, "HEAD");
  args.remote = normalizeString(args.remote, "origin");
  args.timeout_minutes = Math.max(1, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Tag Creator

Usage:
  node .github/scripts/release/create-release-tag.js [options]

Examples:
  node .github/scripts/release/create-release-tag.js --dry-run
  node .github/scripts/release/create-release-tag.js --tag v2.10.0
  node .github/scripts/release/create-release-tag.js --version 2.10.0 --target HEAD --push
  node .github/scripts/release/create-release-tag.js --tag v2.10.0 --annotated --message "Release v2.10.0"
  node .github/scripts/release/create-release-tag.js --tag v2.10.0 --update-existing --force --push-force

Options:
      --repo <owner/repo>              Repository slug.
      --config <file>                  Release tag config file.
      --changelog-report <file>        build-changelog JSON report.
      --tag <tag>                      Release tag name.
      --version <version>              Release version. Adds v prefix when tag is omitted.
      --target <ref>                   Target commit/ref. Default: GITHUB_SHA or HEAD.
      --message <text>                 Annotated tag message.
      --message-file <file>            Annotated tag message file.
      --remote <name>                  Git remote. Default: origin.
      --annotated                      Create annotated tag. Default.
      --lightweight                    Create lightweight tag.
      --signed                         Create signed annotated tag.
      --no-signed                      Do not sign tag. Default.
      --force                          Recreate local tag when allowed.
      --update-existing                Update existing local tag.
      --fail-if-exists                 Fail if local tag already exists.
      --fail-if-missing                Fail if tag cannot be resolved. Default.
      --no-fail-if-missing             Do not fail on missing tag.
      --push                           Push tag to remote.
      --no-push                        Do not push tag. Default.
      --push-force                     Force-push tag to remote.
      --verify                         Verify tag after creation. Default.
      --no-verify                      Skip verification.
      --check-remote                   Check whether tag exists on remote. Default.
      --no-check-remote                Skip remote tag check.
      --fail-on-error                  Exit non-zero on failure. Default.
      --no-fail-on-error               Do not fail workflow.
      --timeout-minutes <number>       Per git command timeout. Default: 10.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not mutate git state.
      --no-print                       Do not print JSON report.
      --no-step-summary                Do not append GitHub step summary.
`);
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const markers = [
    ".git",
    ".github",
    "package.json",
    "pnpm-workspace.yaml",
    "nx.json",
  ];
  let current = path.resolve(startDir);

  while (current && current !== path.dirname(current)) {
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

function resolvePath(filePath, repoRoot) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.normalize(path.join(repoRoot, filePath));
}

function toPosixPath(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .join("/");
}

function toRelativePath(filePath, repoRoot) {
  return (
    toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot))) || "."
  );
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });
}

function writeTextFile(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return {
      written: false,
      dry_run: true,
      path: filePath,
    };
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    dry_run: false,
    path: filePath,
  };
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function commandDisplay(command, commandArgs) {
  return redactOutput(
    [command, ...commandArgs]
      .map((part) => {
        const value = String(part);

        if (/^[A-Za-z0-9_./:=@,+,-]+$/.test(value)) return value;

        return JSON.stringify(value);
      })
      .join(" "),
  );
}

function runCommand(commandRecord, args) {
  const startedAt = new Date();
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run && commandRecord.mutates) {
    return {
      ...commandRecord,
      status: "planned",
      success: true,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const result = childProcess.spawnSync(
    commandRecord.command,
    commandRecord.args,
    {
      cwd: commandRecord.cwd,
      env: {
        ...process.env,
        CI: process.env.CI || "true",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout,
    },
  );

  const endedAt = new Date();
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;

  return {
    ...commandRecord,
    status: success ? "passed" : "failed",
    success,
    exit_code: result.status,
    signal: result.signal || null,
    stdout: redactOutput(result.stdout || ""),
    stderr: redactOutput(result.stderr || ""),
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function sanitizeCommand(command) {
  if (!command) return null;

  return {
    display: redactOutput(
      command.display || commandDisplay(command.command, command.args || []),
    ),
    status: command.status,
    success: command.success,
    exit_code: command.exit_code,
    duration_ms: command.duration_ms,
    error: redactOutput(command.error || ""),
    stdout_preview: redactOutput(command.stdout || "").slice(0, 4000),
    stderr_preview: redactOutput(command.stderr || "").slice(0, 4000),
  };
}

function git(args, repoRoot, options = {}) {
  const command = {
    command: "git",
    args,
    cwd: repoRoot,
    display: commandDisplay("git", args),
    mutates: Boolean(options.mutates),
  };

  return runCommand(command, options.args || options.runtimeArgs || {});
}

function runGit(args, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return options.fallback ?? "";
  }
}

function getGitMetadata(repoRoot) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], { repoRoot }),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"], { repoRoot }),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }) ||
      DEFAULT_BRANCH,
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(
    stripJsonc(fs.readFileSync(absolutePath, "utf8")),
    fallback,
  );
}

function readTextFile(filePath, repoRoot, fallback = "") {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return fs.readFileSync(absolutePath, "utf8");
}

function parseYamlScalar(value) {
  const source = normalizeString(value);

  if (!source) return "";
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+$/.test(source)) return Number(source);

  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }

  if (source.startsWith("[") && source.endsWith("]")) {
    return source
      .slice(1, -1)
      .split(",")
      .map((item) => parseYamlScalar(item.trim()))
      .filter((item) => item !== "");
  }

  return source;
}

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;

    if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index).trimEnd();
    }
  }

  return line.trimEnd();
}

function parseSimpleYaml(text) {
  const config = {};
  const lines = String(text || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
    }
  }

  return config;
}

function readConfigFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const extension = path.extname(absolutePath).toLowerCase();
  const text = fs.readFileSync(absolutePath, "utf8");

  if (extension === ".json" || extension === ".jsonc") {
    return safeJsonParse(stripJsonc(text), null);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleYaml(text);
  }

  return safeJsonParse(stripJsonc(text), null);
}

function findConfigFile(args, repoRoot) {
  if (args.config_file) {
    const absolutePath = resolvePath(args.config_file, repoRoot);

    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.config_file;
  }

  for (const candidate of DEFAULT_CONFIG_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = [
    "tag",
    "version",
    "target_ref",
    "message",
    "message_file",
    "remote",
    "changelog_report_file",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "annotated",
    "signed",
    "force",
    "update_existing",
    "fail_if_exists",
    "fail_if_missing",
    "push",
    "push_force",
    "verify_after_create",
    "check_remote",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.timeout_minutes !== undefined) {
    merged.timeout_minutes = normalizeInteger(
      config.timeout_minutes,
      merged.timeout_minutes,
    );
  }

  merged.tag = normalizeTagName(merged.tag);
  merged.version = normalizeVersion(merged.version);
  merged.target_ref = normalizeString(merged.target_ref, "HEAD");
  merged.remote = normalizeString(merged.remote, "origin");

  return merged;
}

function normalizeTagName(value) {
  const tag = normalizeString(value);

  if (!tag) return "";

  if (tag.startsWith("refs/tags/")) return tag.slice("refs/tags/".length);

  return tag;
}

function normalizeVersion(value) {
  const version = normalizeString(value);

  if (!version) return "";

  return version.startsWith("v") ? version : `v${version}`;
}

function readPackageVersion(repoRoot) {
  const packageJson = readJsonFile("package.json", repoRoot, null);

  return normalizeVersion(packageJson?.version);
}

function releaseFromChangelogReport(changelogReport) {
  if (!changelogReport || typeof changelogReport !== "object") {
    return {
      tag: "",
      version: "",
      target_ref: "",
      message: "",
    };
  }

  return {
    tag: normalizeTagName(
      changelogReport.release?.tag || changelogReport.release?.version,
    ),
    version: normalizeVersion(
      changelogReport.release?.version || changelogReport.release?.tag,
    ),
    target_ref: normalizeString(
      changelogReport.range?.to_ref || changelogReport.github?.sha,
    ),
    message:
      normalizeString(changelogReport.markdown?.release_section) ||
      normalizeString(changelogReport.release?.title),
  };
}

function resolveTagInput(args, repoRoot) {
  const changelogReport = readJsonFile(
    args.changelog_report_file,
    repoRoot,
    null,
  );
  const changelog = releaseFromChangelogReport(changelogReport);
  const packageVersion = readPackageVersion(repoRoot);

  const version = normalizeVersion(
    args.version || changelog.version || packageVersion,
  );
  const tag = normalizeTagName(args.tag || changelog.tag || version);
  const messageFromFile = args.message_file
    ? readTextFile(args.message_file, repoRoot, "")
    : "";
  const message =
    normalizeString(args.message) ||
    normalizeString(messageFromFile) ||
    normalizeString(changelog.message) ||
    `Release ${tag || version}`;

  const targetRef = normalizeString(
    args.target_ref || changelog.target_ref || "HEAD",
  );

  return {
    changelog_report_available: Boolean(changelogReport),
    package_version: packageVersion,
    tag,
    version,
    target_ref: targetRef,
    message,
  };
}

function validateTagInput(input, args) {
  const errors = [];
  const warnings = [];

  if (!input.tag) {
    const message = "Release tag could not be resolved.";

    if (args.fail_if_missing) errors.push(message);
    else warnings.push(message);
  }

  if (input.tag && /\s/.test(input.tag)) {
    errors.push(`Release tag must not contain whitespace: ${input.tag}`);
  }

  if (input.tag && input.tag.startsWith("-")) {
    errors.push(`Release tag must not start with "-": ${input.tag}`);
  }

  if (!input.target_ref) {
    errors.push("Target ref could not be resolved.");
  }

  if (args.signed && !args.annotated) {
    errors.push("Signed tags must be annotated tags.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function getTargetSha(repoRoot, targetRef) {
  return runGit(["rev-parse", targetRef], {
    repoRoot,
    fallback: "",
  });
}

function getTagSha(repoRoot, tag) {
  return runGit(["rev-parse", `refs/tags/${tag}`], {
    repoRoot,
    fallback: "",
  });
}

function localTagExists(repoRoot, tag) {
  if (!tag) return false;

  return Boolean(getTagSha(repoRoot, tag));
}

function remoteTagExists(repoRoot, remote, tag) {
  if (!remote || !tag) return false;

  const output = runGit(["ls-remote", "--tags", remote, `refs/tags/${tag}`], {
    repoRoot,
    fallback: "",
  });

  return Boolean(output.trim());
}

function tagType(repoRoot, tag) {
  if (!tag) return "";

  return runGit(["cat-file", "-t", `refs/tags/${tag}`], {
    repoRoot,
    fallback: "",
  });
}

function createTagCommands(args, repoRoot, input, state) {
  const commands = [];

  if (state.local_exists && (args.update_existing || args.force)) {
    commands.push({
      id: "delete-local-tag",
      command: "git",
      args: ["tag", "-d", input.tag],
      cwd: repoRoot,
      display: commandDisplay("git", ["tag", "-d", input.tag]),
      mutates: true,
    });
  }

  const tagArgs = ["tag"];

  if (args.force) tagArgs.push("-f");

  if (args.signed) {
    tagArgs.push("-s", input.tag, input.target_ref, "-m", input.message);
  } else if (args.annotated) {
    tagArgs.push("-a", input.tag, input.target_ref, "-m", input.message);
  } else {
    tagArgs.push(input.tag, input.target_ref);
  }

  commands.push({
    id: "create-local-tag",
    command: "git",
    args: tagArgs,
    cwd: repoRoot,
    display: commandDisplay("git", tagArgs),
    mutates: true,
  });

  if (args.verify_after_create) {
    commands.push({
      id: "verify-local-tag",
      command: "git",
      args: ["rev-parse", "--verify", `refs/tags/${input.tag}`],
      cwd: repoRoot,
      display: commandDisplay("git", [
        "rev-parse",
        "--verify",
        `refs/tags/${input.tag}`,
      ]),
      mutates: false,
    });
  }

  if (args.push) {
    const pushArgs = ["push"];

    if (args.push_force || args.force) pushArgs.push("--force");

    pushArgs.push(args.remote, `refs/tags/${input.tag}`);

    commands.push({
      id: "push-tag",
      command: "git",
      args: pushArgs,
      cwd: repoRoot,
      display: commandDisplay("git", pushArgs),
      mutates: true,
    });
  }

  return commands;
}

function executeTagCreation(args, repoRoot, input, validation) {
  const startedAt = new Date();

  const state = {
    target_sha: getTargetSha(repoRoot, input.target_ref),
    local_exists: localTagExists(repoRoot, input.tag),
    local_tag_sha_before: getTagSha(repoRoot, input.tag),
    local_tag_type_before: tagType(repoRoot, input.tag),
    remote_exists: false,
  };

  if (args.check_remote && input.tag && args.remote) {
    state.remote_exists = remoteTagExists(repoRoot, args.remote, input.tag);
  }

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    validation,
    state_before: state,
    state_after: {},
    commands: [],
    errors: [],
    warnings: [...validation.warnings],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    if (!state.target_sha) {
      result.status = "invalid";
      result.errors.push(
        `Target ref could not be resolved: ${input.target_ref}`,
      );
      return result;
    }

    if (state.local_exists && args.fail_if_exists) {
      result.status = "failed";
      result.errors.push(`Local tag already exists: ${input.tag}`);
      return result;
    }

    if (state.local_exists && !args.update_existing && !args.force) {
      result.status = "skipped-existing";
      result.success = true;
      result.warnings.push(`Local tag already exists: ${input.tag}`);
      return result;
    }

    if (state.remote_exists && args.push && !args.push_force && !args.force) {
      result.warnings.push(
        `Remote tag already exists: ${args.remote}/${input.tag}. Push may fail without --push-force.`,
      );
    }

    const commands = createTagCommands(args, repoRoot, input, state);

    logger.info(
      `${args.dry_run ? "Planning" : "Creating"} release tag ${input.tag} at ${input.target_ref}.`,
    );

    for (const command of commands) {
      const commandResult = runCommand(command, args);
      result.commands.push(sanitizeCommand(commandResult));

      if (!commandResult.success) {
        result.status = "failed";
        result.errors.push(
          commandResult.error ||
            commandResult.stderr ||
            `Command failed: ${command.display}`,
        );
        return result;
      }
    }

    result.state_after = {
      local_exists: args.dry_run ? true : localTagExists(repoRoot, input.tag),
      local_tag_sha: args.dry_run
        ? state.target_sha
        : getTagSha(repoRoot, input.tag),
      local_tag_type: args.dry_run
        ? args.annotated
          ? "tag"
          : "commit"
        : tagType(repoRoot, input.tag),
      remote_exists:
        args.dry_run && args.push
          ? true
          : args.check_remote && args.remote
            ? remoteTagExists(repoRoot, args.remote, input.tag)
            : false,
    };

    result.status = args.dry_run
      ? "planned"
      : args.push
        ? "created-and-pushed"
        : "created";
    result.success = true;

    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (value < 1000) return `${value}ms`;

  const seconds = value / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

function repositoryUrl(repository) {
  const repo = normalizeString(repository, DEFAULT_REPOSITORY);

  if (/^https?:\/\//.test(repo)) return repo.replace(/\/+$/g, "");

  return `https://github.com/${repo}`;
}

function tagUrl(repository, tag) {
  if (!tag) return "";

  return `${repositoryUrl(repository)}/releases/tag/${encodeURIComponent(tag)}`;
}

function compareUrl(repository, fromTag, toTag) {
  if (!fromTag || !toTag) return "";

  return `${repositoryUrl(repository)}/compare/${encodeURIComponent(fromTag)}...${encodeURIComponent(toTag)}`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  input,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const commandCount = execution.commands.length;
  const failedCommands = execution.commands.filter(
    (command) => !command.success,
  ).length;

  return {
    schema_version: 1,
    type: "release-create-tag",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      changelog_report_file: toRelativePath(
        resolvePath(args.changelog_report_file, repoRoot),
        repoRoot,
      ),
      changelog_report_available: input.changelog_report_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      annotated: args.annotated,
      signed: args.signed,
      force: args.force,
      update_existing: args.update_existing,
      fail_if_exists: args.fail_if_exists,
      fail_if_missing: args.fail_if_missing,
      push: args.push,
      push_force: args.push_force,
      remote: args.remote,
      verify_after_create: args.verify_after_create,
      check_remote: args.check_remote,
      dry_run: args.dry_run,
    },
    release: {
      tag: input.tag,
      version: input.version,
      package_version: input.package_version,
      target_ref: input.target_ref,
      target_sha: execution.state_before.target_sha || "",
      message_length: input.message.length,
      url: tagUrl(args.repository, input.tag),
    },
    state_before: execution.state_before,
    state_after: execution.state_after,
    totals: {
      commands: commandCount,
      failed_commands: failedCommands,
      warnings: execution.warnings.length,
      errors: execution.errors.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok: execution.success,
    },
    commands: execution.commands,
    warnings: execution.warnings,
    errors: execution.errors,
    status: execution.status,
    ok: execution.success,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🏷️ ${PROJECT_NAME} Release Tag`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Tag: \`${report.release.tag || "unresolved"}\``,
    `- Version: \`${report.release.version || "unresolved"}\``,
    `- Target ref: \`${report.release.target_ref || "unknown"}\``,
    `- Target SHA: \`${report.release.target_sha || "unknown"}\``,
    `- Local tag existed: \`${report.state_before.local_exists ? "true" : "false"}\``,
    `- Remote tag existed: \`${report.state_before.remote_exists ? "true" : "false"}\``,
    `- Pushed: \`${report.config.push ? "true" : "false"}\``,
    `- Commands: \`${report.totals.commands}\``,
    `- Failed commands: \`${report.totals.failed_commands}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Tag Configuration",
    "",
    `- Annotated: \`${report.config.annotated ? "true" : "false"}\``,
    `- Signed: \`${report.config.signed ? "true" : "false"}\``,
    `- Force: \`${report.config.force ? "true" : "false"}\``,
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
    `- Remote: \`${report.config.remote}\``,
    `- Push force: \`${report.config.push_force ? "true" : "false"}\``,
    "",
  ];

  if (report.release.url) {
    lines.push(`Release tag URL: ${report.release.url}`);
    lines.push("");
  }

  lines.push("## 🧩 Git Commands");
  lines.push("");

  if (!report.commands.length) {
    lines.push("No git commands were executed.");
  } else {
    lines.push("| Status | Command | Duration |");
    lines.push("|---|---|---:|");

    for (const command of report.commands) {
      lines.push(
        `| \`${command.status}\` | \`${escapeMarkdown(command.display)}\` | \`${formatDuration(command.duration_ms)}\` |`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Changelog report: \`${report.config.changelog_report_file}\``);
  lines.push(
    `- Changelog report available: \`${report.config.changelog_report_available ? "true" : "false"}\``,
  );

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
  );

  return `${lines.join("\n").trim()}\n`;
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) return false;

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);
  return true;
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) return false;

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(
    outputFile,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("release_tag_file", report.config.output_file);
  setGitHubOutput("release_tag_summary_file", report.config.summary_file || "");
  setGitHubOutput("release_tag_status", report.status);
  setGitHubOutput("release_tag_ok", report.ok ? "true" : "false");
  setGitHubOutput("release_tag", report.release.tag || "");
  setGitHubOutput("release_tag_version", report.release.version || "");
  setGitHubOutput("release_tag_target_ref", report.release.target_ref || "");
  setGitHubOutput("release_tag_target_sha", report.release.target_sha || "");
  setGitHubOutput("release_tag_url", report.release.url || "");
  setGitHubOutput(
    "release_tag_local_exists_before",
    report.state_before.local_exists ? "true" : "false",
  );
  setGitHubOutput(
    "release_tag_remote_exists_before",
    report.state_before.remote_exists ? "true" : "false",
  );
  setGitHubOutput("release_tag_pushed", report.config.push ? "true" : "false");
  setGitHubOutput("release_tag_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("release_tag_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing release tag.");

  const input = resolveTagInput(args, repoRoot);
  const validation = validateTagInput(input, args);
  const execution = executeTagCreation(args, repoRoot, input, validation);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    execution,
  );
  const markdown = createMarkdownSummary(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(report);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
