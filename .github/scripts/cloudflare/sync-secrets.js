#!/usr/bin/env node
// .github/scripts/cloudflare/sync-secrets.js
// =============================================================================
// Aerealith AI — Cloudflare Secrets Synchronizer
// -----------------------------------------------------------------------------
// Purpose:
//   Synchronize Cloudflare Worker secrets from GitHub Actions secrets,
//   environment variables, local secret files, or explicit CI inputs into
//   Cloudflare Workers through Wrangler.
//
// Input:
//   - .github/cloudflare/secrets-sync.json
//   - .github/cloudflare/secrets-sync.jsonc
//   - .github/cloudflare/secrets-sync.yaml
//   - .github/cloudflare/secrets-sync.yml
//   - artifacts/ci/cloudflare-targets.json
//
// Output:
//   - artifacts/cloudflare/sync-secrets.json
//   - artifacts/cloudflare/sync-secrets.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses Wrangler to avoid handling Cloudflare secret APIs directly.
//   - Secret values are never written to logs, reports, outputs, or summaries.
//   - Inline secret values are rejected unless explicitly allowed.
//   - Deleting missing remote secrets is opt-in through --delete-missing.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cloudflare-secrets] ${message}`),
    warn: (message) => console.warn(`[cloudflare-secrets] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-secrets] ERROR: ${message}`),
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
  ".github/cloudflare/secrets-sync.json",
  ".github/cloudflare/secrets-sync.jsonc",
  ".github/cloudflare/secrets-sync.yaml",
  ".github/cloudflare/secrets-sync.yml",
  "cloudflare/secrets-sync.json",
  "cloudflare/secrets-sync.jsonc",
  "cloudflare/secrets-sync.yaml",
  "cloudflare/secrets-sync.yml",
];

const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/cloudflare/sync-secrets.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cloudflare/sync-secrets.md";

const DEFAULT_ENVIRONMENT = "production";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (Array.isArray(value)) {
    return [
      ...new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    ];
  }

  return [
    ...new Set(
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.CLOUDFLARE_SECRETS_SYNC_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_SECRETS_SYNC_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,

    output_file:
      process.env.CLOUDFLARE_SECRETS_SYNC_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_SECRETS_SYNC_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environment:
      process.env.CLOUDFLARE_SECRETS_SYNC_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,

    target_id:
      process.env.CLOUDFLARE_TARGET_ID ||
      process.env.CLOUDFLARE_SECRETS_SYNC_TARGET_ID ||
      "",
    target_name:
      process.env.CLOUDFLARE_TARGET_NAME ||
      process.env.CLOUDFLARE_SECRETS_SYNC_TARGET_NAME ||
      "",
    target_config:
      process.env.CLOUDFLARE_TARGET_CONFIG ||
      process.env.CLOUDFLARE_SECRETS_SYNC_TARGET_CONFIG ||
      "",

    secret_name:
      process.env.CLOUDFLARE_SECRET_NAME ||
      process.env.CLOUDFLARE_SECRETS_SYNC_SECRET_NAME ||
      "",
    secret_source_env:
      process.env.CLOUDFLARE_SECRET_SOURCE_ENV ||
      process.env.CLOUDFLARE_SECRETS_SYNC_SECRET_SOURCE_ENV ||
      "",
    secret_file:
      process.env.CLOUDFLARE_SECRET_FILE ||
      process.env.CLOUDFLARE_SECRETS_SYNC_SECRET_FILE ||
      "",
    secret_value:
      process.env.CLOUDFLARE_SECRET_VALUE ||
      process.env.CLOUDFLARE_SECRETS_SYNC_SECRET_VALUE ||
      "",

    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_SECRETS_SYNC_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_SECRETS_SYNC_EXCLUDE_TARGETS,
    ),
    include_secrets: normalizeStringList(
      process.env.CLOUDFLARE_SECRETS_SYNC_INCLUDE_SECRETS,
    ),
    exclude_secrets: normalizeStringList(
      process.env.CLOUDFLARE_SECRETS_SYNC_EXCLUDE_SECRETS,
    ),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager:
      process.env.CLOUDFLARE_SECRETS_SYNC_PACKAGE_MANAGER || "auto",

    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_REQUIRE_ACCOUNT_ID,
      true,
    ),
    allow_inline_values: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_ALLOW_INLINE_VALUES,
      false,
    ),
    trim_file_values: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_TRIM_FILE_VALUES,
      true,
    ),
    list_remote: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_LIST_REMOTE,
      true,
    ),
    delete_missing: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_DELETE_MISSING,
      false,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_CONTINUE_ON_ERROR,
      true,
    ),

    max_targets: normalizeInteger(
      process.env.CLOUDFLARE_SECRETS_SYNC_MAX_TARGETS,
      0,
    ),
    max_secrets: normalizeInteger(
      process.env.CLOUDFLARE_SECRETS_SYNC_MAX_SECRETS,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.CLOUDFLARE_SECRETS_SYNC_TIMEOUT_MINUTES,
      10,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.CLOUDFLARE_SECRETS_SYNC_MAX_BUFFER_MB,
      16,
    ),

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_SECRETS_SYNC_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_SECRETS_SYNC_STEP_SUMMARY,
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

    if (arg === "--targets" || arg === "--cloudflare-targets") {
      args.cloudflare_targets_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--environment" || arg === "--env") {
      args.environment = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target-id") {
      args.target_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--target-name") {
      args.target_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config-file" || arg === "--target-config") {
      args.target_config = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--secret" || arg === "--secret-name") {
      args.secret_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-env" || arg === "--secret-source-env") {
      args.secret_source_env = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--secret-file") {
      args.secret_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--secret-value") {
      args.secret_value = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-target" || arg === "--include-targets") {
      args.include_targets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-target" || arg === "--exclude-targets") {
      args.exclude_targets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-secret" || arg === "--include-secrets") {
      args.include_secrets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-secret" || arg === "--exclude-secrets") {
      args.exclude_secrets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--wrangler-command") {
      args.wrangler_command = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--require-credentials") {
      args.require_credentials = true;
      continue;
    }

    if (arg === "--no-require-credentials") {
      args.require_credentials = false;
      continue;
    }

    if (arg === "--require-account-id") {
      args.require_account_id = true;
      continue;
    }

    if (arg === "--no-require-account-id") {
      args.require_account_id = false;
      continue;
    }

    if (arg === "--allow-inline-values") {
      args.allow_inline_values = true;
      continue;
    }

    if (arg === "--no-inline-values") {
      args.allow_inline_values = false;
      continue;
    }

    if (arg === "--trim-file-values") {
      args.trim_file_values = true;
      continue;
    }

    if (arg === "--no-trim-file-values") {
      args.trim_file_values = false;
      continue;
    }

    if (arg === "--list-remote") {
      args.list_remote = true;
      continue;
    }

    if (arg === "--no-list-remote") {
      args.list_remote = false;
      continue;
    }

    if (arg === "--delete-missing") {
      args.delete_missing = true;
      args.list_remote = true;
      continue;
    }

    if (arg === "--no-delete-missing") {
      args.delete_missing = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

    if (arg === "--continue-on-error") {
      args.continue_on_error = true;
      continue;
    }

    if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
      continue;
    }

    if (arg === "--max-targets") {
      args.max_targets = normalizeInteger(argv[index + 1], args.max_targets);
      index += 1;
      continue;
    }

    if (arg === "--max-secrets") {
      args.max_secrets = normalizeInteger(argv[index + 1], args.max_secrets);
      index += 1;
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

  args.environment = normalizeString(
    args.environment,
    DEFAULT_ENVIRONMENT,
  ).toLowerCase();
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.include_secrets = [...new Set(args.include_secrets)];
  args.exclude_secrets = [...new Set(args.exclude_secrets)];
  args.package_manager = normalizeString(
    args.package_manager,
    "auto",
  ).toLowerCase();
  args.max_targets = Math.max(0, args.max_targets);
  args.max_secrets = Math.max(0, args.max_secrets);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare Secrets Synchronizer

Usage:
  node .github/scripts/cloudflare/sync-secrets.js [options]

Examples:
  node .github/scripts/cloudflare/sync-secrets.js --config .github/cloudflare/secrets-sync.json --dry-run
  node .github/scripts/cloudflare/sync-secrets.js --target api --secret OPENAI_API_KEY --source-env OPENAI_API_KEY
  node .github/scripts/cloudflare/sync-secrets.js --target-config apps/api/wrangler.toml --secret DATABASE_URL --source-env DATABASE_URL
  node .github/scripts/cloudflare/sync-secrets.js --delete-missing --include-target api

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Secrets sync config file.
      --targets <file>                       cloudflare-targets.json detector file.
      --environment <name>                   Environment name. Default: production.
      --target-id <id>                       Direct target ID.
      --target <name>                        Direct target name.
      --target-config <file>                 Direct Wrangler config file.
      --secret <name>                        Direct secret name.
      --source-env <name>                    Environment variable holding secret value.
      --secret-file <file>                   Local file holding secret value.
      --secret-value <value>                 Inline secret value. Requires --allow-inline-values.
      --include-target <list>                Include Cloudflare target names.
      --exclude-target <list>                Exclude Cloudflare target names.
      --include-secret <list>                Include only secret names.
      --exclude-secret <list>                Exclude secret names.
      --wrangler-command <command>           Custom Wrangler command prefix.
      --package-manager <auto|pnpm|npm|yarn|bun|npx>
      --require-credentials                  Require Cloudflare credentials. Default.
      --no-require-credentials               Do not require Cloudflare credentials.
      --require-account-id                   Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id                Do not require account ID.
      --allow-inline-values                  Allow inline values from config or CLI.
      --no-inline-values                     Reject inline values. Default.
      --trim-file-values                     Trim secret file value. Default.
      --no-trim-file-values                  Preserve secret file whitespace.
      --list-remote                          List remote secrets. Default.
      --no-list-remote                       Do not list remote secrets.
      --delete-missing                       Delete remote secrets not in desired config.
      --no-delete-missing                    Do not delete missing secrets. Default.
      --fail-if-empty                        Exit non-zero when no secrets are selected.
      --fail-on-error                        Exit non-zero on sync failure. Default.
      --no-fail-on-error                     Do not fail when sync has errors.
      --continue-on-error                    Continue after secret failure. Default.
      --no-continue-on-error                 Stop after first secret failure.
      --max-targets <number>                 Maximum targets to sync.
      --max-secrets <number>                 Maximum secrets to sync.
      --timeout-minutes <number>             Wrangler command timeout.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not mutate Cloudflare secrets.
      --no-print                             Do not print JSON result.
      --no-step-summary                      Do not append GitHub step summary.
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

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
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

function parseSimpleSecretsYaml(text) {
  const config = {};
  const targets = [];
  const secrets = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let current = null;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");

      if (section === "targets" || section === "workers")
        config.targets = targets;
      if (section === "secrets") config.secrets = secrets;

      current = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (
      (section === "targets" || section === "workers") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      targets.push(current);

      const rest = trimmed.replace(/^-\s*/, "");
      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        current[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (section === "secrets" && /^-\s*/.test(trimmed)) {
      current = {};
      secrets.push(current);

      const rest = trimmed.replace(/^-\s*/, "");
      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        current[key] = parseYamlScalar(value);
      }

      continue;
    }

    if (current && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      current[key] = parseYamlScalar(value);
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
    return parseSimpleSecretsYaml(text);
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

function safeId(value) {
  return (
    normalizeString(value, "secret-sync")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "secret-sync"
  );
}

function normalizeSecretName(value) {
  return normalizeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function splitCommandLine(value) {
  const input = normalizeString(value);
  if (!input) return [];

  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = "";
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current) parts.push(current);

  return parts;
}

function inferPackageManager(repoRoot, requested) {
  if (requested && requested !== "auto") return requested;
  if (isFile(resolvePath("pnpm-lock.yaml", repoRoot))) return "pnpm";
  if (isFile(resolvePath("yarn.lock", repoRoot))) return "yarn";
  if (isFile(resolvePath("bun.lockb", repoRoot))) return "bun";
  if (isFile(resolvePath("package-lock.json", repoRoot))) return "npm";
  return "pnpm";
}

function createWranglerPrefix(args, repoRoot) {
  if (args.wrangler_command) {
    const parsed = splitCommandLine(args.wrangler_command);

    if (parsed.length) {
      return {
        command: parsed[0],
        args: parsed.slice(1),
        package_manager: "custom",
      };
    }
  }

  const packageManager = inferPackageManager(repoRoot, args.package_manager);

  if (packageManager === "pnpm") {
    return {
      command: "pnpm",
      args: ["exec", "wrangler"],
      package_manager: "pnpm",
    };
  }

  if (packageManager === "yarn") {
    return {
      command: "yarn",
      args: ["wrangler"],
      package_manager: "yarn",
    };
  }

  if (packageManager === "bun") {
    return {
      command: "bunx",
      args: ["wrangler"],
      package_manager: "bun",
    };
  }

  if (packageManager === "npm") {
    return {
      command: "npx",
      args: ["wrangler"],
      package_manager: "npm",
    };
  }

  return {
    command: "npx",
    args: ["wrangler"],
    package_manager: "npx",
  };
}

function commandDisplay(command, commandArgs) {
  return [command, ...commandArgs]
    .map((part) => {
      const value = String(part);

      if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) return value;

      return JSON.stringify(value);
    })
    .join(" ");
}

function targetFromCloudflareRecord(record, args) {
  const environments = Array.isArray(record.environments)
    ? record.environments
    : [];
  const hasEnvironment = environments.includes(args.environment);
  const primaryType = normalizeString(
    record.primary_type || record.type || "",
  ).toLowerCase();

  if (primaryType && primaryType !== "worker") return null;

  return {
    id: normalizeString(
      record.id || safeId(record.name || record.config_file || "worker"),
    ),
    name: normalizeString(
      record.name || record.package_name || path.basename(record.root || ""),
    ),
    root: toPosixPath(record.root || "."),
    config_file: toPosixPath(
      record.config_file || record.wrangler_config || "",
    ),
    wrangler_environment: hasEnvironment ? args.environment : "",
    has_config_environment: hasEnvironment,
    source_type: "cloudflare-targets",
  };
}

function loadCloudflareTargets(args, repoRoot) {
  const data = readJsonFile(args.cloudflare_targets_file, repoRoot, null);
  const targets = Array.isArray(data?.targets) ? data.targets : [];

  return {
    file: toRelativePath(
      resolvePath(args.cloudflare_targets_file, repoRoot),
      repoRoot,
    ),
    available: Boolean(data),
    data,
    targets: targets
      .map((target) => targetFromCloudflareRecord(target, args))
      .filter(Boolean),
  };
}

function resolveConfigEnvironmentValue(item, args, ...keys) {
  const env = args.environment;
  const environments = item.environments || item.env || {};

  if (environments && typeof environments === "object" && environments[env]) {
    for (const key of keys) {
      if (environments[env][key] !== undefined) return environments[env][key];
    }
  }

  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }

  return "";
}

function normalizeSecretRecord(item, args) {
  if (typeof item === "string") {
    return {
      name: normalizeSecretName(item),
      source_env: item,
      file: "",
      value: "",
      required: true,
      enabled: true,
    };
  }

  const name = normalizeSecretName(
    resolveConfigEnvironmentValue(
      item,
      args,
      "name",
      "secret",
      "secret_name",
      "secretName",
      "key",
    ),
  );
  const sourceEnv = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "env",
      "source_env",
      "sourceEnv",
      "from_env",
      "fromEnv",
    ),
  );

  return {
    name,
    source_env: sourceEnv || name,
    file: normalizeString(
      resolveConfigEnvironmentValue(
        item,
        args,
        "file",
        "secret_file",
        "secretFile",
      ),
    ),
    value: resolveConfigEnvironmentValue(
      item,
      args,
      "value",
      "secret_value",
      "secretValue",
    ),
    required: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "required"),
      true,
    ),
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function normalizeTargetRecord(item, args) {
  const targetName = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "target",
      "target_name",
      "targetName",
      "name",
    ),
  );

  const configFile = toPosixPath(
    normalizeString(
      resolveConfigEnvironmentValue(
        item,
        args,
        "config_file",
        "configFile",
        "wrangler_config",
        "wranglerConfig",
      ),
    ),
  );

  const wranglerEnvironment = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "wrangler_environment",
      "wranglerEnvironment",
      "environment",
      "env_name",
    ),
  );

  return {
    id: safeId(
      `config-${args.environment}-${targetName || configFile || "worker"}`,
    ),
    name: targetName,
    root: toPosixPath(
      normalizeString(resolveConfigEnvironmentValue(item, args, "root"), "."),
    ),
    config_file: configFile,
    wrangler_environment: wranglerEnvironment || args.environment,
    has_config_environment: Boolean(wranglerEnvironment || args.environment),
    source_type: "config",
    secrets: Array.isArray(item.secrets)
      ? item.secrets
          .map((secret) => normalizeSecretRecord(secret, args))
          .filter((secret) => secret.name)
      : [],
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function extractConfigTargets(config, args) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.targets) ? config.targets : []),
    ...(Array.isArray(config.workers) ? config.workers : []),
  ];

  if (config.target && typeof config.target === "object") {
    records.push(config.target);
  }

  if (
    !records.length &&
    (config.config_file ||
      config.configFile ||
      config.wrangler_config ||
      config.target)
  ) {
    records.push(config);
  }

  return records
    .map((item) => normalizeTargetRecord(item, args))
    .filter((target) => target.enabled !== false);
}

function extractTopLevelSecretPlans(config, args) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.secrets) ? config.secrets : []),
    ...(Array.isArray(config.worker_secrets) ? config.worker_secrets : []),
    ...(Array.isArray(config.workerSecrets) ? config.workerSecrets : []),
  ];

  return records
    .map((item) => {
      if (typeof item === "string") {
        return {
          target_name: args.target_name,
          target_config: args.target_config,
          secret: normalizeSecretRecord(item, args),
        };
      }

      return {
        target_name: normalizeString(
          item.target ||
            item.target_name ||
            item.targetName ||
            args.target_name,
        ),
        target_config: toPosixPath(
          normalizeString(
            item.config_file ||
              item.configFile ||
              item.wrangler_config ||
              args.target_config,
          ),
        ),
        wrangler_environment: normalizeString(
          item.wrangler_environment || item.wranglerEnvironment || "",
        ),
        secret: normalizeSecretRecord(item, args),
      };
    })
    .filter((item) => item.secret.name);
}

function createDirectSecretPlan(args) {
  if (!args.secret_name) return null;

  return {
    target_name: args.target_name,
    target_config: toPosixPath(args.target_config),
    wrangler_environment: args.environment,
    secret: {
      name: normalizeSecretName(args.secret_name),
      source_env: args.secret_source_env || args.secret_name,
      file: args.secret_file,
      value: args.secret_value,
      required: true,
      enabled: true,
    },
  };
}

function targetMatchesFilters(target, args) {
  if (args.target_id && target.id !== args.target_id) return false;
  if (args.target_name && target.name !== args.target_name) return false;
  if (
    args.target_config &&
    target.config_file !== toPosixPath(args.target_config)
  )
    return false;

  if (
    args.include_targets.length &&
    !args.include_targets.includes(target.name)
  ) {
    return false;
  }

  if (args.exclude_targets.includes(target.name)) {
    return false;
  }

  return true;
}

function secretMatchesFilters(secret, args) {
  if (!secret.enabled) return false;

  if (
    args.include_secrets.length &&
    !args.include_secrets.includes(secret.name)
  ) {
    return false;
  }

  if (args.exclude_secrets.includes(secret.name)) {
    return false;
  }

  return true;
}

function findTargetForSecret(secretPlan, targets) {
  return targets.find((target) => {
    if (
      secretPlan.target_config &&
      target.config_file === secretPlan.target_config
    )
      return true;
    if (secretPlan.target_name && target.name === secretPlan.target_name)
      return true;
    return false;
  });
}

function createSecretTask(target, secret, args, sourceType = "config") {
  return {
    id: safeId(
      `${args.environment}-${target.name || target.config_file}-${secret.name}`,
    ),
    source_type: sourceType,
    environment: args.environment,
    target_id: target.id,
    target_name: target.name,
    target_root: target.root,
    target_config: target.config_file,
    wrangler_environment: target.wrangler_environment || "",
    has_config_environment: Boolean(target.has_config_environment),
    secret_name: secret.name,
    source_env: secret.source_env,
    secret_file: secret.file,
    has_inline_value:
      secret.value !== undefined &&
      secret.value !== null &&
      secret.value !== "",
    inline_value: secret.value,
    required: secret.required,
  };
}

function dedupeSecretTasks(tasks) {
  const seen = new Map();

  for (const task of tasks) {
    const key = `${task.target_config || task.target_name}:${task.wrangler_environment}:${task.secret_name}`;

    if (!seen.has(key)) {
      seen.set(key, task);
      continue;
    }

    const existing = seen.get(key);
    seen.set(key, {
      ...existing,
      ...task,
      source_env: task.source_env || existing.source_env,
      secret_file: task.secret_file || existing.secret_file,
      inline_value: task.inline_value || existing.inline_value,
      has_inline_value: task.has_inline_value || existing.has_inline_value,
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.target_name.localeCompare(right.target_name) ||
      left.target_config.localeCompare(right.target_config) ||
      left.secret_name.localeCompare(right.secret_name)
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const cloudflareTargets = loadCloudflareTargets(args, repoRoot);

  const configTargets = extractConfigTargets(config, args);
  const discoveredTargets = [...configTargets, ...cloudflareTargets.targets]
    .filter((target) => target.config_file)
    .filter((target) => targetMatchesFilters(target, args));

  const targetsByNameAndConfig = new Map();

  for (const target of discoveredTargets) {
    for (const key of [target.id, target.name, target.config_file].filter(
      Boolean,
    )) {
      targetsByNameAndConfig.set(key, target);
    }
  }

  const tasks = [];

  for (const target of configTargets) {
    if (!targetMatchesFilters(target, args)) continue;

    for (const secret of target.secrets.filter((item) =>
      secretMatchesFilters(item, args),
    )) {
      tasks.push(createSecretTask(target, secret, args, target.source_type));
    }
  }

  for (const secretPlan of extractTopLevelSecretPlans(config, args)) {
    if (!secretMatchesFilters(secretPlan.secret, args)) continue;

    const target =
      findTargetForSecret(secretPlan, discoveredTargets) ||
      (secretPlan.target_config
        ? {
            id: safeId(secretPlan.target_config),
            name:
              secretPlan.target_name ||
              path.basename(path.dirname(secretPlan.target_config)),
            root: ".",
            config_file: secretPlan.target_config,
            wrangler_environment:
              secretPlan.wrangler_environment || args.environment,
            has_config_environment: true,
            source_type: "config-secret",
          }
        : null);

    if (target && targetMatchesFilters(target, args)) {
      tasks.push(
        createSecretTask(target, secretPlan.secret, args, "config-secret"),
      );
    }
  }

  const directSecret = createDirectSecretPlan(args);

  if (directSecret) {
    const target =
      findTargetForSecret(directSecret, discoveredTargets) ||
      (directSecret.target_config
        ? {
            id: safeId(directSecret.target_config),
            name:
              directSecret.target_name ||
              path.basename(path.dirname(directSecret.target_config)),
            root: ".",
            config_file: directSecret.target_config,
            wrangler_environment: args.environment,
            has_config_environment: true,
            source_type: "direct",
          }
        : null);

    if (
      target &&
      targetMatchesFilters(target, args) &&
      secretMatchesFilters(directSecret.secret, args)
    ) {
      tasks.push(createSecretTask(target, directSecret.secret, args, "direct"));
    }
  }

  const selectedTasks = dedupeSecretTasks(tasks);
  const limitedTasks =
    args.max_secrets > 0
      ? selectedTasks.slice(0, args.max_secrets)
      : selectedTasks;

  const selectedTargets = dedupeByKey(
    limitedTasks.map((task) => ({
      id: task.target_id,
      name: task.target_name,
      config_file: task.target_config,
      wrangler_environment: task.wrangler_environment,
      has_config_environment: task.has_config_environment,
      root: task.target_root,
    })),
    (target) => `${target.config_file}:${target.wrangler_environment}`,
  );

  const limitedTargets =
    args.max_targets > 0
      ? selectedTargets.slice(0, args.max_targets)
      : selectedTargets;
  const allowedTargetKeys = new Set(
    limitedTargets.map(
      (target) => `${target.config_file}:${target.wrangler_environment}`,
    ),
  );

  return {
    config_file: configFile,
    config_available: Boolean(config),
    cloudflare_targets_file: cloudflareTargets.file,
    cloudflare_targets_available: cloudflareTargets.available,
    discovered_targets: discoveredTargets.length,
    selected_targets: limitedTargets,
    tasks: limitedTasks.filter((task) =>
      allowedTargetKeys.has(
        `${task.target_config}:${task.wrangler_environment}`,
      ),
    ),
  };
}

function dedupeByKey(items, keyFn) {
  const seen = new Map();

  for (const item of items) {
    const key = keyFn(item);

    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

function validateCredentials(args) {
  const errors = [];
  const warnings = [];

  if (!args.require_credentials || args.dry_run) {
    return {
      ok: true,
      errors,
      warnings,
    };
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    errors.push("Missing CLOUDFLARE_API_TOKEN.");
  }

  if (args.require_account_id && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    errors.push("Missing CLOUDFLARE_ACCOUNT_ID.");
  } else if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    warnings.push(
      "CLOUDFLARE_ACCOUNT_ID is not set; Wrangler must infer the account.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSecretTask(task, args, repoRoot) {
  const errors = [];
  const warnings = [];

  if (!task.target_config) {
    errors.push("Missing Wrangler config file for secret target.");
  } else if (!isFile(resolvePath(task.target_config, repoRoot))) {
    errors.push(`Wrangler config file does not exist: ${task.target_config}`);
  }

  if (!task.secret_name) {
    errors.push("Missing secret name.");
  }

  if (task.secret_name && !/^[A-Z][A-Z0-9_]*$/.test(task.secret_name)) {
    errors.push(
      `Invalid secret name: ${task.secret_name}. Use uppercase letters, numbers, and underscores.`,
    );
  }

  if (task.has_inline_value && !args.allow_inline_values) {
    errors.push(
      `Secret ${task.secret_name} uses an inline value but inline values are disabled.`,
    );
  }

  if (!task.source_env && !task.secret_file && !task.has_inline_value) {
    errors.push(
      `Secret ${task.secret_name} has no source_env, secret_file, or allowed inline value.`,
    );
  }

  if (task.secret_file && !isFile(resolvePath(task.secret_file, repoRoot))) {
    errors.push(`Secret source file does not exist: ${task.secret_file}`);
  }

  if (
    task.wrangler_environment &&
    task.wrangler_environment !== args.environment
  ) {
    warnings.push(
      `Secret target uses Wrangler environment "${task.wrangler_environment}" while sync environment is "${args.environment}".`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function resolveSecretValue(task, args, repoRoot) {
  if (task.has_inline_value) {
    return {
      ok: args.allow_inline_values,
      source_type: "inline",
      source_name: "inline",
      value: args.allow_inline_values ? String(task.inline_value) : "",
      length: args.allow_inline_values ? String(task.inline_value).length : 0,
      error: args.allow_inline_values
        ? ""
        : "Inline secret values are disabled.",
    };
  }

  if (task.secret_file) {
    const absolutePath = resolvePath(task.secret_file, repoRoot);
    let value = fs.readFileSync(absolutePath, "utf8");

    if (args.trim_file_values) {
      value = value.trim();
    }

    return {
      ok: value.length > 0 || !task.required,
      source_type: "file",
      source_name: toRelativePath(absolutePath, repoRoot),
      value,
      length: value.length,
      error: value.length > 0 || !task.required ? "" : "Secret file is empty.",
    };
  }

  const value = process.env[task.source_env] || "";

  return {
    ok: value.length > 0 || !task.required,
    source_type: "env",
    source_name: task.source_env,
    value,
    length: value.length,
    error:
      value.length > 0 || !task.required
        ? ""
        : `Environment variable ${task.source_env} is not set.`,
  };
}

function runWrangler(
  args,
  repoRoot,
  wranglerPrefix,
  wranglerArgs,
  options = {},
) {
  const startedAt = new Date();
  const command = wranglerPrefix.command;
  const commandArgs = [...wranglerPrefix.args, ...wranglerArgs];
  const display = commandDisplay(command, commandArgs);
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run) {
    return {
      success: true,
      status: "planned",
      command,
      args: commandArgs,
      display,
      exit_code: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const result = childProcess.spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: process.env.CI || "true",
    },
    input: options.input || undefined,
    encoding: "utf8",
    stdio: options.input
      ? ["pipe", "pipe", "pipe"]
      : ["ignore", "pipe", "pipe"],
    maxBuffer: args.max_buffer_mb * 1024 * 1024,
    timeout,
  });

  const endedAt = new Date();
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;

  return {
    success,
    status: success ? "passed" : "failed",
    command,
    args: commandArgs,
    display,
    exit_code: result.status,
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

function wranglerTargetArgs(task, repoRoot) {
  const targetArgs = ["--config", resolvePath(task.target_config, repoRoot)];

  if (task.wrangler_environment && task.has_config_environment) {
    targetArgs.push("--env", task.wrangler_environment);
  }

  return targetArgs;
}

function parseSecretList(stdout) {
  const parsed = safeJsonParse(stdout, null);

  if (!parsed) return [];

  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.result)
      ? parsed.result
      : Array.isArray(parsed.secrets)
        ? parsed.secrets
        : [];

  return records
    .map((item) => {
      if (typeof item === "string") return normalizeSecretName(item);

      return normalizeSecretName(item.name || item.key || item.secret_name);
    })
    .filter(Boolean)
    .sort();
}

function listRemoteSecretsForTarget(args, repoRoot, wranglerPrefix, target) {
  if (!args.list_remote && !args.delete_missing) {
    return {
      status: "skipped",
      secrets: [],
      command: null,
      error: "",
    };
  }

  const taskLike = {
    target_config: target.config_file,
    wrangler_environment: target.wrangler_environment,
    has_config_environment: target.has_config_environment,
  };

  const command = runWrangler(args, repoRoot, wranglerPrefix, [
    "secret",
    "list",
    ...wranglerTargetArgs(taskLike, repoRoot),
    "--json",
  ]);

  if (!command.success) {
    return {
      status: "failed",
      secrets: [],
      command,
      error:
        command.error || command.stderr || "Unable to list remote secrets.",
    };
  }

  return {
    status: args.dry_run ? "planned" : "listed",
    secrets: parseSecretList(command.stdout),
    command,
    error: "",
  };
}

function putSecret(args, repoRoot, wranglerPrefix, task, secretValue) {
  const wranglerArgs = [
    "secret",
    "put",
    task.secret_name,
    ...wranglerTargetArgs(task, repoRoot),
  ];

  return runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs, {
    input: `${secretValue}\n`,
  });
}

function deleteSecret(args, repoRoot, wranglerPrefix, target, secretName) {
  const taskLike = {
    target_config: target.config_file,
    wrangler_environment: target.wrangler_environment,
    has_config_environment: target.has_config_environment,
  };

  const wranglerArgs = [
    "secret",
    "delete",
    secretName,
    ...wranglerTargetArgs(taskLike, repoRoot),
    "--force",
  ];

  return runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs);
}

async function syncSecretTask(task, args, repoRoot, wranglerPrefix) {
  const startedAt = new Date();
  const validation = validateSecretTask(task, args, repoRoot);
  const valueResolution = validation.ok
    ? resolveSecretValue(task, args, repoRoot)
    : {
        ok: false,
        source_type: "unknown",
        source_name: "",
        value: "",
        length: 0,
        error: "",
      };

  const result = {
    id: task.id,
    source_type: task.source_type,
    environment: task.environment,
    target_id: task.target_id,
    target_name: task.target_name,
    target_config: task.target_config,
    wrangler_environment: task.wrangler_environment,
    secret_name: task.secret_name,
    source: {
      type: valueResolution.source_type,
      name: valueResolution.source_name,
      length: valueResolution.length,
      present: valueResolution.ok,
    },
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    command: null,
    errors: [],
    warnings: validation.warnings,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    if (!valueResolution.ok) {
      result.status = "missing-value";
      result.errors.push(
        valueResolution.error || "Secret value could not be resolved.",
      );
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Syncing"} secret ${task.secret_name} for ${
        task.target_name || task.target_config
      }.`,
    );

    const command = putSecret(
      args,
      repoRoot,
      wranglerPrefix,
      task,
      valueResolution.value,
    );
    result.command = {
      display: command.display,
      status: command.status,
      exit_code: command.exit_code,
      duration_ms: command.duration_ms,
    };

    if (!command.success) {
      result.status = "failed";
      result.errors.push(
        command.error ||
          command.stderr ||
          `Failed to sync secret ${task.secret_name}.`,
      );
      return result;
    }

    result.status = args.dry_run ? "planned" : "synced";
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

function createDeletePlan(target, tasks, remoteSecrets) {
  const desired = new Set(tasks.map((task) => task.secret_name));

  return remoteSecrets.filter((secretName) => !desired.has(secretName));
}

async function executeSync(plans, args, repoRoot) {
  const credentials = validateCredentials(args);
  const wrangler = createWranglerPrefix(args, repoRoot);
  const results = [];
  const remote = [];
  const deleteResults = [];
  let stoppedEarly = false;

  if (!credentials.ok) {
    return {
      credentials,
      wrangler,
      results,
      remote,
      delete_results: deleteResults,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
    };
  }

  for (const target of plans.selected_targets) {
    const targetTasks = plans.tasks.filter((task) => {
      return (
        task.target_config === target.config_file &&
        task.wrangler_environment === target.wrangler_environment
      );
    });

    const remoteListing = listRemoteSecretsForTarget(
      args,
      repoRoot,
      wrangler,
      target,
    );

    remote.push({
      target_name: target.name,
      target_config: target.config_file,
      wrangler_environment: target.wrangler_environment,
      status: remoteListing.status,
      secrets: remoteListing.secrets,
      count: remoteListing.secrets.length,
      error: remoteListing.error,
    });

    if (remoteListing.error && !args.continue_on_error) {
      stoppedEarly = true;
      break;
    }

    for (const task of targetTasks) {
      const result = await syncSecretTask(task, args, repoRoot, wrangler);
      results.push(result);

      if (!result.success && !args.continue_on_error) {
        stoppedEarly = true;
        break;
      }
    }

    if (stoppedEarly) break;

    if (args.delete_missing && remoteListing.secrets.length) {
      const deletePlan = createDeletePlan(
        target,
        targetTasks,
        remoteListing.secrets,
      );

      for (const secretName of deletePlan) {
        const startedAt = new Date();
        const command = deleteSecret(
          args,
          repoRoot,
          wrangler,
          target,
          secretName,
        );
        const endedAt = new Date();

        const deleteResult = {
          target_name: target.name,
          target_config: target.config_file,
          wrangler_environment: target.wrangler_environment,
          secret_name: secretName,
          status: command.success
            ? args.dry_run
              ? "planned"
              : "deleted"
            : "failed",
          success: command.success,
          dry_run: args.dry_run,
          command: {
            display: command.display,
            status: command.status,
            exit_code: command.exit_code,
            duration_ms: command.duration_ms,
          },
          errors: command.success
            ? []
            : [
                command.error ||
                  command.stderr ||
                  `Failed to delete secret ${secretName}.`,
              ],
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_ms: endedAt.getTime() - startedAt.getTime(),
        };

        deleteResults.push(deleteResult);

        if (!deleteResult.success && !args.continue_on_error) {
          stoppedEarly = true;
          break;
        }
      }
    }

    if (stoppedEarly) break;
  }

  return {
    credentials,
    wrangler,
    results,
    remote,
    delete_results: deleteResults,
    stopped_early: stoppedEarly,
    blocked: false,
    block_reason: "",
  };
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

function summarizeResults(results, deleteResults) {
  const synced = results.filter((result) => result.status === "synced").length;
  const planned = results.filter(
    (result) => result.status === "planned",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  const invalid = results.filter(
    (result) => result.status === "invalid",
  ).length;
  const missingValue = results.filter(
    (result) => result.status === "missing-value",
  ).length;
  const deleted = deleteResults.filter(
    (result) => result.status === "deleted",
  ).length;
  const deletePlanned = deleteResults.filter(
    (result) => result.status === "planned",
  ).length;
  const deleteFailed = deleteResults.filter(
    (result) => result.status === "failed",
  ).length;
  const durationMs =
    results.reduce((sum, result) => sum + Number(result.duration_ms || 0), 0) +
    deleteResults.reduce(
      (sum, result) => sum + Number(result.duration_ms || 0),
      0,
    );

  return {
    secrets: results.length,
    synced,
    planned,
    failed,
    invalid,
    missing_value: missingValue,
    delete_planned: deletePlanned,
    deleted,
    delete_failed: deleteFailed,
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok:
      failed === 0 && invalid === 0 && missingValue === 0 && deleteFailed === 0,
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        synced: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        missing_value: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "synced") groups[group].synced += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    if (result.status === "missing-value") groups[group].missing_value += 1;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results, execution.delete_results);
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0 || totals.delete_failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : totals.missing_value > 0
          ? "missing-value"
          : execution.results.length === 0 &&
              execution.delete_results.length === 0
            ? "empty"
            : args.dry_run
              ? "planned"
              : "synced";

  return {
    schema_version: 1,
    type: "cloudflare-secrets-sync",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      cloudflare_targets_file: plans.cloudflare_targets_file,
      cloudflare_targets_available: plans.cloudflare_targets_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      environment: args.environment,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      allow_inline_values: args.allow_inline_values,
      trim_file_values: args.trim_file_values,
      list_remote: args.list_remote,
      delete_missing: args.delete_missing,
      max_targets: args.max_targets,
      max_secrets: args.max_secrets,
      dry_run: args.dry_run,
    },
    wrangler: {
      command: execution.wrangler.command,
      args: execution.wrangler.args,
      package_manager: execution.wrangler.package_manager,
      display: commandDisplay(
        execution.wrangler.command,
        execution.wrangler.args,
      ),
    },
    credentials: {
      ok: execution.credentials.ok,
      api_token_present: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      account_id_present: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
      warnings: execution.credentials.warnings,
      errors: execution.credentials.errors,
    },
    discovery: {
      discovered_targets: plans.discovered_targets,
      selected_targets: plans.selected_targets.length,
      selected_secrets: plans.tasks.length,
      remote_targets_listed: execution.remote.length,
    },
    selected_targets: plans.selected_targets,
    selected_secrets: plans.tasks.map((task) => ({
      id: task.id,
      source_type: task.source_type,
      environment: task.environment,
      target_name: task.target_name,
      target_config: task.target_config,
      wrangler_environment: task.wrangler_environment,
      secret_name: task.secret_name,
      source_type_value: task.secret_file
        ? "file"
        : task.has_inline_value
          ? "inline"
          : "env",
      source_name:
        task.secret_file ||
        task.source_env ||
        (task.has_inline_value ? "inline" : ""),
      required: task.required,
    })),
    remote: execution.remote,
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_target: groupResults(execution.results, "target_name"),
      by_source_type: groupResults(execution.results, "source_type"),
    },
    results: execution.results,
    delete_results: execution.delete_results,
    failures: [
      ...execution.results.filter((result) => !result.success),
      ...execution.delete_results.filter((result) => !result.success),
    ],
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🔐 ${PROJECT_NAME} Cloudflare Secrets Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 🔐 Credentials",
    "",
    `- Credential check: \`${report.credentials.ok ? "passed" : "failed"}\``,
    `- API token present: \`${report.credentials.api_token_present ? "true" : "false"}\``,
    `- Account ID present: \`${report.credentials.account_id_present ? "true" : "false"}\``,
    "",
    "## ⚙️ Wrangler",
    "",
    `- Package manager: \`${report.wrangler.package_manager}\``,
    `- Command: \`${report.wrangler.display}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected targets: \`${report.discovery.selected_targets}\``,
    `- Selected secrets: \`${report.discovery.selected_secrets}\``,
    `- Synced: \`${report.totals.synced}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Missing values: \`${report.totals.missing_value}\``,
    `- Delete planned: \`${report.totals.delete_planned}\``,
    `- Deleted: \`${report.totals.deleted}\``,
    `- Delete failed: \`${report.totals.delete_failed}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Secrets");
  lines.push("");

  if (!report.selected_secrets.length) {
    lines.push("No Cloudflare secrets were selected.");
  } else {
    lines.push("| Target | Environment | Secret | Source | Required |");
    lines.push("|---|---|---|---|---:|");

    for (const secret of report.selected_secrets) {
      lines.push(
        `| \`${secret.target_name || secret.target_config || "unknown"}\` | \`${secret.wrangler_environment || "default"}\` | \`${secret.secret_name}\` | \`${secret.source_type_value}:${secret.source_name || "unknown"}\` | \`${secret.required ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Secret Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No secret sync results were produced.");
  } else {
    lines.push(
      "| Status | Target | Environment | Secret | Source | Duration |",
    );
    lines.push("|---|---|---|---|---|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.target_name || result.target_config || "unknown"}\` | \`${result.wrangler_environment || "default"}\` | \`${result.secret_name}\` | \`${result.source.type}:${result.source.name || "unknown"}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.delete_results.length) {
    lines.push("");
    lines.push("## 🗑️ Delete Results");
    lines.push("");
    lines.push("| Status | Target | Environment | Secret | Duration |");
    lines.push("|---|---|---|---|---:|");

    for (const result of report.delete_results) {
      lines.push(
        `| \`${result.status}\` | \`${result.target_name || result.target_config || "unknown"}\` | \`${result.wrangler_environment || "default"}\` | \`${result.secret_name}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.remote.length) {
    lines.push("");
    lines.push("## 📡 Remote Secret Inventory");
    lines.push("");
    lines.push("| Target | Environment | Status | Count |");
    lines.push("|---|---|---|---:|");

    for (const remote of report.remote) {
      lines.push(
        `| \`${remote.target_name || remote.target_config || "unknown"}\` | \`${remote.wrangler_environment || "default"}\` | \`${remote.status}\` | \`${remote.count}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Target | Secret | Status | Errors |");
    lines.push("|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.target_name || failure.target_config || "unknown"}\` | \`${failure.secret_name || "unknown"}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = [
    ...report.credentials.warnings,
    ...report.results.flatMap((result) =>
      result.warnings.map((warning) => ({
        secret: result.secret_name,
        target: result.target_name || result.target_config,
        warning,
      })),
    ),
  ];

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings) {
      if (typeof warning === "string") {
        lines.push(`- ${warning}`);
      } else {
        lines.push(
          `- \`${warning.target}:${warning.secret}\`: ${warning.warning}`,
        );
      }
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Cloudflare targets file: \`${report.config.cloudflare_targets_file}\``,
  );
  lines.push(
    `- Cloudflare targets available: \`${report.config.cloudflare_targets_available ? "true" : "false"}\``,
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

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("cloudflare_secrets_sync_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_secrets_sync_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_secrets_sync_status", report.status);
  setGitHubOutput(
    "cloudflare_secrets_sync_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_environment",
    report.config.environment,
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_targets",
    String(report.discovery.selected_targets),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_secrets",
    String(report.discovery.selected_secrets),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_synced",
    String(report.totals.synced),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_planned",
    String(report.totals.planned),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_missing_value",
    String(report.totals.missing_value),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_deleted",
    String(report.totals.deleted),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_delete_failed",
    String(report.totals.delete_failed),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_secret_names",
    [...new Set(report.selected_secrets.map((item) => item.secret_name))].join(
      ",",
    ),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_secret_names_json",
    JSON.stringify([
      ...new Set(report.selected_secrets.map((item) => item.secret_name)),
    ]),
  );
  setGitHubOutput(
    "cloudflare_secrets_sync_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare secrets sync.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.tasks.length === 0) {
    logger.error("No Cloudflare secrets were selected.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          credentials: validateCredentials(args),
          wrangler: createWranglerPrefix(args, repoRoot),
          results: [],
          remote: [],
          delete_results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
        }
      : await executeSync(plans, args, repoRoot);

  const report = createReport(args, repoRoot, plans, execution);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

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

  if (args.fail_if_empty && report.discovery.selected_secrets === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Cloudflare secrets sync blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Cloudflare secrets sync completed with ${report.totals.failed} failed, ${report.totals.invalid} invalid, ${report.totals.missing_value} missing value, and ${report.totals.delete_failed} delete failure(s).`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
