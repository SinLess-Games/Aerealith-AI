#!/usr/bin/env node
// .github/scripts/databases/run-cockroachdb-migrations.js
// =============================================================================
// Aerealith AI — CockroachDB Migration Runner
// -----------------------------------------------------------------------------
// Purpose:
//   Discover, validate, and run ordered SQL migrations against one or more
//   CockroachDB databases from GitHub Actions or local CI.
//
// Input:
//   - .github/databases/cockroachdb-migrations.json
//   - .github/databases/cockroachdb-migrations.jsonc
//   - .github/databases/cockroachdb-migrations.yaml
//   - .github/databases/cockroachdb-migrations.yml
//   - database/migrations/**/*.sql
//   - databases/migrations/**/*.sql
//   - migrations/**/*.sql
//
// Output:
//   - artifacts/databases/cockroachdb-migrations.json
//   - artifacts/databases/cockroachdb-migrations.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the CockroachDB CLI by default.
//   - Requires COCKROACH_DATABASE_URL or DATABASE_URL for real migrations.
//   - Supports dry-run planning without database credentials.
//   - Tracks applied migrations with checksums.
//   - Fails on checksum drift by default.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cockroachdb-migrations] ${message}`),
    warn: (message) =>
      console.warn(`[cockroachdb-migrations] WARN: ${message}`),
    error: (message) =>
      console.error(`[cockroachdb-migrations] ERROR: ${message}`),
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
  ".github/databases/cockroachdb-migrations.json",
  ".github/databases/cockroachdb-migrations.jsonc",
  ".github/databases/cockroachdb-migrations.yaml",
  ".github/databases/cockroachdb-migrations.yml",
  "databases/cockroachdb-migrations.json",
  "databases/cockroachdb-migrations.jsonc",
  "databases/cockroachdb-migrations.yaml",
  "databases/cockroachdb-migrations.yml",
];

const DEFAULT_MIGRATION_DIRS = [
  "database/migrations",
  "databases/migrations",
  "db/migrations",
  "migrations",
  "apps/api/migrations",
  "services/api/migrations",
];

const DEFAULT_OUTPUT_FILE = "artifacts/databases/cockroachdb-migrations.json";
const DEFAULT_SUMMARY_FILE = "artifacts/databases/cockroachdb-migrations.md";

const DEFAULT_MIGRATIONS_TABLE = "public.schema_migrations";
const DEFAULT_DATABASE_NAME = "default";
const DEFAULT_CLIENT = "cockroach";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((postgres(?:ql)?:\/\/)[^\s"'<>]+|(cockroach(?:db)?:\/\/)[^\s"'<>]+|((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,})|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  "node_modules/",
  ".nx/",
  ".turbo/",
  ".cache/",
  ".pnpm-store/",
  ".wrangler/",
  ".next/cache/",
  "dist/",
  "build/",
  "coverage/",
  "reports/",
  "artifacts/",
  "tmp/",
  "temp/",
  ".DS_Store",
  "Thumbs.db",
];

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

    config_file: process.env.COCKROACHDB_MIGRATIONS_CONFIG_FILE || "",
    output_file:
      process.env.COCKROACHDB_MIGRATIONS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.COCKROACHDB_MIGRATIONS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    database_name:
      process.env.COCKROACHDB_MIGRATIONS_DATABASE_NAME ||
      process.env.COCKROACH_DATABASE_NAME ||
      DEFAULT_DATABASE_NAME,
    database_url:
      process.env.COCKROACH_DATABASE_URL ||
      process.env.COCKROACHDB_DATABASE_URL ||
      process.env.COCKROACH_DATABASE_URI ||
      process.env.DATABASE_URL ||
      "",
    database_url_env:
      process.env.COCKROACHDB_MIGRATIONS_DATABASE_URL_ENV ||
      process.env.COCKROACH_DATABASE_URL_ENV ||
      "",

    migrations: normalizeStringList(process.env.COCKROACHDB_MIGRATIONS_PATHS),
    migrations_table:
      process.env.COCKROACHDB_MIGRATIONS_TABLE ||
      process.env.COCKROACH_MIGRATIONS_TABLE ||
      DEFAULT_MIGRATIONS_TABLE,

    client: process.env.COCKROACHDB_MIGRATIONS_CLIENT || DEFAULT_CLIENT,
    client_command:
      process.env.COCKROACHDB_MIGRATIONS_COMMAND ||
      process.env.COCKROACH_COMMAND ||
      "",

    include_databases: normalizeStringList(
      process.env.COCKROACHDB_MIGRATIONS_INCLUDE_DATABASES,
    ),
    exclude_databases: normalizeStringList(
      process.env.COCKROACHDB_MIGRATIONS_EXCLUDE_DATABASES,
    ),
    include_migrations: normalizeStringList(
      process.env.COCKROACHDB_MIGRATIONS_INCLUDE,
    ),
    exclude_migrations: normalizeStringList(
      process.env.COCKROACHDB_MIGRATIONS_EXCLUDE,
    ),

    create_table: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_CREATE_TABLE,
      true,
    ),
    lock_migrations: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_LOCK,
      true,
    ),
    fail_on_drift: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_FAIL_ON_DRIFT,
      true,
    ),
    fail_on_missing_local: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_FAIL_ON_MISSING_LOCAL,
      false,
    ),
    allow_empty: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_ALLOW_EMPTY,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_FAIL_IF_EMPTY,
      false,
    ),
    continue_on_error: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_CONTINUE_ON_ERROR,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_FAIL_ON_ERROR,
      true,
    ),

    transaction_mode:
      process.env.COCKROACHDB_MIGRATIONS_TRANSACTION_MODE ||
      process.env.COCKROACHDB_MIGRATIONS_TRANSACTIONS ||
      "auto",

    max_databases: normalizeInteger(
      process.env.COCKROACHDB_MIGRATIONS_MAX_DATABASES,
      0,
    ),
    max_migrations: normalizeInteger(
      process.env.COCKROACHDB_MIGRATIONS_MAX_MIGRATIONS,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.COCKROACHDB_MIGRATIONS_TIMEOUT_MINUTES,
      15,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.COCKROACHDB_MIGRATIONS_MAX_BUFFER_MB,
      64,
    ),

    dry_run: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.COCKROACHDB_MIGRATIONS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.COCKROACHDB_MIGRATIONS_STEP_SUMMARY,
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

    if (arg === "--database-name" || arg === "--database") {
      args.database_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--database-url") {
      args.database_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--database-url-env" || arg === "--url-env") {
      args.database_url_env = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--migrations" ||
      arg === "--migrations-dir" ||
      arg === "--migration-dir"
    ) {
      args.migrations.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--table" || arg === "--migrations-table") {
      args.migrations_table = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--client") {
      args.client = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--command" || arg === "--client-command") {
      args.client_command = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-database" || arg === "--include-databases") {
      args.include_databases.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-database" || arg === "--exclude-databases") {
      args.exclude_databases.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-migration") {
      args.include_migrations.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "--exclude-migration") {
      args.exclude_migrations.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--create-table") {
      args.create_table = true;
      continue;
    }

    if (arg === "--no-create-table") {
      args.create_table = false;
      continue;
    }

    if (arg === "--lock") {
      args.lock_migrations = true;
      continue;
    }

    if (arg === "--no-lock") {
      args.lock_migrations = false;
      continue;
    }

    if (arg === "--fail-on-drift") {
      args.fail_on_drift = true;
      continue;
    }

    if (arg === "--no-fail-on-drift") {
      args.fail_on_drift = false;
      continue;
    }

    if (arg === "--fail-on-missing-local") {
      args.fail_on_missing_local = true;
      continue;
    }

    if (arg === "--no-fail-on-missing-local") {
      args.fail_on_missing_local = false;
      continue;
    }

    if (arg === "--allow-empty") {
      args.allow_empty = true;
      continue;
    }

    if (arg === "--no-allow-empty") {
      args.allow_empty = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
      continue;
    }

    if (arg === "--transaction-mode" || arg === "--transactions") {
      args.transaction_mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--max-databases") {
      args.max_databases = normalizeInteger(
        argv[index + 1],
        args.max_databases,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-migrations") {
      args.max_migrations = normalizeInteger(
        argv[index + 1],
        args.max_migrations,
      );
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

  args.client = normalizeString(args.client, DEFAULT_CLIENT).toLowerCase();
  args.transaction_mode = normalizeString(
    args.transaction_mode,
    "auto",
  ).toLowerCase();
  args.migrations = [...new Set(args.migrations)];
  args.include_databases = [...new Set(args.include_databases)];
  args.exclude_databases = [...new Set(args.exclude_databases)];
  args.include_migrations = [...new Set(args.include_migrations)];
  args.exclude_migrations = [
    ...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude_migrations]),
  ];
  args.max_databases = Math.max(0, args.max_databases);
  args.max_migrations = Math.max(0, args.max_migrations);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI CockroachDB Migration Runner

Usage:
  node .github/scripts/databases/run-cockroachdb-migrations.js [options]

Examples:
  node .github/scripts/databases/run-cockroachdb-migrations.js --dry-run
  node .github/scripts/databases/run-cockroachdb-migrations.js --database-url-env DATABASE_URL
  node .github/scripts/databases/run-cockroachdb-migrations.js --migrations database/migrations
  node .github/scripts/databases/run-cockroachdb-migrations.js --config .github/databases/cockroachdb-migrations.json

Options:
      --repo <owner/repo>                   Repository slug.
      --config <file>                       Migration config file.
      --database-name <name>                Database plan name.
      --database-url <url>                  Direct CockroachDB/Postgres URL.
      --database-url-env <name>             Environment variable holding database URL.
      --migrations <path,list>              Migration file or directory path.
      --table <schema.table>                Migration ledger table.
      --client <cockroach|psql>             SQL client. Default: cockroach.
      --command <command>                   Custom client command.
      --include-database <list>             Include database plan names.
      --exclude-database <list>             Exclude database plan names.
      --include <list>                      Include migration IDs or filenames.
      --exclude <pattern>                   Exclude migration path pattern.
      --create-table                        Create migration ledger table. Default.
      --no-create-table                     Do not create migration ledger table.
      --lock                                Use migration lock table. Default.
      --no-lock                             Do not use migration lock table.
      --fail-on-drift                       Fail on checksum drift. Default.
      --no-fail-on-drift                    Warn instead of failing on checksum drift.
      --fail-on-missing-local               Fail if remote applied migration is missing locally.
      --no-fail-on-missing-local            Warn on remote-only migrations. Default.
      --allow-empty                         Allow no migration files. Default.
      --no-allow-empty                      Treat no migration files as invalid.
      --fail-if-empty                       Exit non-zero if no database plans are selected.
      --continue-on-error                   Continue after a database migration failure.
      --no-continue-on-error                Stop after first database failure. Default.
      --fail-on-error                       Exit non-zero on migration errors. Default.
      --no-fail-on-error                    Do not fail when errors occur.
      --transaction-mode <auto|always|never> Wrap migrations in transactions.
      --max-databases <number>              Maximum database plans to run.
      --max-migrations <number>             Maximum pending migrations per database.
      --timeout-minutes <number>            Per SQL command timeout. Default: 15.
  -o, --output <file>                       JSON output file.
      --summary <file>                      Markdown summary output file.
      --no-summary                          Do not write Markdown summary.
      --dry-run                             Plan but do not mutate the database.
      --no-print                            Do not print JSON result.
      --no-step-summary                     Do not append GitHub step summary.
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

function isDirectory(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
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
  return String(value || "").replace(
    SECRET_OUTPUT_PATTERN,
    (match, postgresPrefix, cockroachPrefix) => {
      if (postgresPrefix || cockroachPrefix) {
        return `${postgresPrefix || cockroachPrefix}[REDACTED]`;
      }

      return "[REDACTED]";
    },
  );
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

function parseSimpleMigrationsYaml(text) {
  const config = {};
  const databases = [];
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

      if (section === "databases") {
        config.databases = databases;
      }

      current = null;
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      config[key] = parseYamlScalar(value);
      continue;
    }

    if (section === "databases" && /^-\s*/.test(trimmed)) {
      current = {};
      databases.push(current);

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
    return parseSimpleMigrationsYaml(text);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasGlob(value) {
  return /[*?]/.test(String(value || ""));
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "*" && next === "*") {
      const afterDoubleStar = source[index + 2];

      if (afterDoubleStar === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }

      continue;
    }

    if (char === "*") {
      output += "[^/]*";
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += escapeRegExp(char);
  }

  output += "$";

  return new RegExp(output);
}

function matchesPattern(relativePath, pattern) {
  const normalizedPath = toPosixPath(relativePath);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith("/")) {
    return normalizedPath.startsWith(normalizedPattern);
  }

  if (hasGlob(normalizedPattern)) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.includes(normalizedPattern)
  );
}

function shouldExcludePath(relativePath, patterns) {
  return patterns.some((pattern) => matchesPattern(relativePath, pattern));
}

function walkFiles(targetPath, repoRoot, excludePatterns, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, excludePatterns)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(
      path.join(absolutePath, entry.name),
      repoRoot,
      excludePatterns,
      files,
    );
  }

  return files;
}

function safeId(value) {
  return (
    normalizeString(value, "cockroachdb-migrations")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cockroachdb-migrations"
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function naturalCompare(left, right) {
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function migrationIdFromFile(filePath) {
  return path.basename(filePath).replace(/\.sql$/i, "");
}

function migrationWantsNoTransaction(sql) {
  return (
    /migrate:\s*no-transaction/i.test(sql) ||
    /migration:\s*no-transaction/i.test(sql)
  );
}

function normalizeMigrationFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);
  const sql = fs.readFileSync(absolutePath, "utf8");
  const id = migrationIdFromFile(absolutePath);

  return {
    id,
    filename: path.basename(absolutePath),
    file: relativePath,
    absolute_file: absolutePath,
    checksum: fileSha256(absolutePath),
    bytes: Buffer.byteLength(sql),
    no_transaction: migrationWantsNoTransaction(sql),
  };
}

function discoverMigrationFiles(paths, repoRoot, args) {
  const candidates = paths.length
    ? paths
    : DEFAULT_MIGRATION_DIRS.filter((candidate) =>
        fs.existsSync(resolvePath(candidate, repoRoot)),
      );

  const files = [];

  for (const candidate of candidates) {
    const absolutePath = resolvePath(candidate, repoRoot);

    if (!fs.existsSync(absolutePath)) continue;

    if (isFile(absolutePath)) {
      files.push(absolutePath);
      continue;
    }

    files.push(...walkFiles(absolutePath, repoRoot, args.exclude_migrations));
  }

  const migrations = [...new Set(files)]
    .filter((filePath) => /\.sql$/i.test(filePath))
    .map((filePath) => normalizeMigrationFile(filePath, repoRoot))
    .filter((migration) => {
      if (args.include_migrations.length) {
        const matched = args.include_migrations.some((pattern) => {
          return (
            migration.id === pattern ||
            migration.filename === pattern ||
            matchesPattern(migration.file, pattern)
          );
        });

        if (!matched) return false;
      }

      return !shouldExcludePath(migration.file, args.exclude_migrations);
    })
    .sort(
      (left, right) =>
        naturalCompare(left.id, right.id) ||
        naturalCompare(left.file, right.file),
    );

  return args.max_migrations > 0
    ? migrations.slice(0, args.max_migrations)
    : migrations;
}

function normalizeDatabasePlan(item, args) {
  const name = normalizeString(
    item.name || item.database_name || item.databaseName,
    args.database_name,
  );
  const urlEnv = normalizeString(
    item.url_env || item.database_url_env || item.databaseUrlEnv,
    args.database_url_env,
  );
  const directUrl = normalizeString(
    item.url || item.database_url || item.databaseUrl,
    "",
  );

  return {
    id: safeId(name),
    name,
    database_url:
      directUrl ||
      args.database_url ||
      (urlEnv ? process.env[urlEnv] || "" : ""),
    database_url_env:
      urlEnv ||
      (args.database_url ? "" : "COCKROACH_DATABASE_URL|DATABASE_URL"),
    migrations: normalizeStringList(
      item.migrations ||
        item.migration_dirs ||
        item.migrationDirs ||
        args.migrations,
    ),
    migrations_table: normalizeString(
      item.table || item.migrations_table || item.migrationsTable,
      args.migrations_table,
    ),
    client: normalizeString(item.client, args.client).toLowerCase(),
    client_command: normalizeString(
      item.command || item.client_command || item.clientCommand,
      args.client_command,
    ),
    create_table: normalizeBoolean(
      item.create_table ?? item.createTable,
      args.create_table,
    ),
    lock_migrations: normalizeBoolean(
      item.lock_migrations ?? item.lockMigrations,
      args.lock_migrations,
    ),
    fail_on_drift: normalizeBoolean(
      item.fail_on_drift ?? item.failOnDrift,
      args.fail_on_drift,
    ),
    fail_on_missing_local: normalizeBoolean(
      item.fail_on_missing_local ?? item.failOnMissingLocal,
      args.fail_on_missing_local,
    ),
    allow_empty: normalizeBoolean(
      item.allow_empty ?? item.allowEmpty,
      args.allow_empty,
    ),
    transaction_mode: normalizeString(
      item.transaction_mode || item.transactionMode,
      args.transaction_mode,
    ).toLowerCase(),
    enabled: normalizeBoolean(item.enabled, true),
  };
}

function extractDatabasePlans(config, args) {
  if (!config) return [];

  const databases = [
    ...(Array.isArray(config.databases) ? config.databases : []),
    ...(Array.isArray(config.cockroachdb) ? config.cockroachdb : []),
    ...(Array.isArray(config.cockroach) ? config.cockroach : []),
  ];

  if (config.database && typeof config.database === "object") {
    databases.push(config.database);
  }

  if (
    !databases.length &&
    (config.database_url ||
      config.databaseUrl ||
      config.url_env ||
      config.database_url_env ||
      config.migrations ||
      config.migration_dirs)
  ) {
    databases.push(config);
  }

  return databases.map((item) => normalizeDatabasePlan(item, args));
}

function createDirectDatabasePlan(args) {
  return normalizeDatabasePlan(
    {
      name: args.database_name,
      database_url: args.database_url,
      database_url_env: args.database_url_env,
      migrations: args.migrations,
      migrations_table: args.migrations_table,
      client: args.client,
      client_command: args.client_command,
      create_table: args.create_table,
      lock_migrations: args.lock_migrations,
      fail_on_drift: args.fail_on_drift,
      fail_on_missing_local: args.fail_on_missing_local,
      allow_empty: args.allow_empty,
      transaction_mode: args.transaction_mode,
      enabled: true,
    },
    args,
  );
}

function databaseMatchesFilters(plan, args) {
  if (!plan.enabled) return false;

  if (
    args.include_databases.length &&
    !args.include_databases.includes(plan.name)
  ) {
    return false;
  }

  if (args.exclude_databases.includes(plan.name)) {
    return false;
  }

  return true;
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const configPlans = extractDatabasePlans(config, args);
  const directPlan = createDirectDatabasePlan(args);

  const rawPlans = configPlans.length ? configPlans : [directPlan];
  const selected = rawPlans
    .filter((plan) => databaseMatchesFilters(plan, args))
    .slice(0, args.max_databases > 0 ? args.max_databases : undefined);

  const plans = selected.map((plan) => ({
    ...plan,
    migrations_discovered: discoverMigrationFiles(
      plan.migrations,
      repoRoot,
      args,
    ),
  }));

  return {
    config_file: configFile,
    config_available: Boolean(config),
    discovered_databases: rawPlans.length,
    databases: plans,
  };
}

function quoteIdentifierPart(value) {
  const identifier = normalizeString(value);

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteTableName(value) {
  return normalizeString(value, DEFAULT_MIGRATIONS_TABLE)
    .split(".")
    .map(quoteIdentifierPart)
    .join(".");
}

function migrationLockTable(value) {
  const parts = normalizeString(value, DEFAULT_MIGRATIONS_TABLE).split(".");
  const table = parts.pop();
  const lockTable = `${table}_lock`;

  return [...parts, lockTable].map(quoteIdentifierPart).join(".");
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function createMigrationsTableSql(tableName) {
  const table = quoteTableName(tableName);

  return `
CREATE TABLE IF NOT EXISTS ${table} (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_ms BIGINT NOT NULL DEFAULT 0,
  source TEXT NULL,
  git_sha TEXT NULL
);
`.trim();
}

function createLockTableSql(tableName) {
  const table = migrationLockTable(tableName);

  return `
CREATE TABLE IF NOT EXISTS ${table} (
  id INT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT NOT NULL
);
`.trim();
}

function acquireLockSql(tableName) {
  const table = migrationLockTable(tableName);
  const owner = `${os.hostname()}:${process.pid}`;

  return `
INSERT INTO ${table} (id, locked_by)
VALUES (1, ${sqlLiteral(owner)})
ON CONFLICT (id) DO UPDATE
SET locked_at = now(),
    locked_by = excluded.locked_by;
`.trim();
}

function releaseLockSql(tableName) {
  const table = migrationLockTable(tableName);

  return `DELETE FROM ${table} WHERE id = 1;`;
}

function selectAppliedMigrationsSql(tableName) {
  const table = quoteTableName(tableName);

  return `
SELECT
  id,
  filename,
  checksum,
  applied_at::TEXT AS applied_at,
  execution_ms::TEXT AS execution_ms,
  COALESCE(source, '') AS source,
  COALESCE(git_sha, '') AS git_sha
FROM ${table}
ORDER BY id;
`.trim();
}

function insertMigrationRecordSql(tableName, migration, executionMs, github) {
  const table = quoteTableName(tableName);

  return `
INSERT INTO ${table} (
  id,
  filename,
  checksum,
  execution_ms,
  source,
  git_sha
)
VALUES (
  ${sqlLiteral(migration.id)},
  ${sqlLiteral(migration.filename)},
  ${sqlLiteral(migration.checksum)},
  ${Number(executionMs || 0)},
  ${sqlLiteral(migration.file)},
  ${sqlLiteral(github.sha || "")}
);
`.trim();
}

function updateMigrationExecutionSql(tableName, migration, executionMs) {
  const table = quoteTableName(tableName);

  return `
UPDATE ${table}
SET execution_ms = ${Number(executionMs || 0)}
WHERE id = ${sqlLiteral(migration.id)}
  AND checksum = ${sqlLiteral(migration.checksum)};
`.trim();
}

function shouldWrapTransaction(plan, migration) {
  if (plan.transaction_mode === "never") return false;
  if (plan.transaction_mode === "always") return true;
  return !migration.no_transaction;
}

function createMigrationScript(plan, migration, github) {
  const sql = fs.readFileSync(migration.absolute_file, "utf8");
  const wrapped = shouldWrapTransaction(plan, migration);
  const insert = insertMigrationRecordSql(
    plan.migrations_table,
    migration,
    0,
    github,
  );

  if (!wrapped) {
    return {
      wrapped: false,
      sql,
    };
  }

  return {
    wrapped: true,
    sql: `
BEGIN;

${sql.trim()}

${insert}

COMMIT;
`.trim(),
  };
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

function clientPrefix(plan) {
  if (plan.client_command) {
    const parsed = splitCommandLine(plan.client_command);

    if (parsed.length) {
      return {
        command: parsed[0],
        args: parsed.slice(1),
        client: "custom",
      };
    }
  }

  if (plan.client === "psql") {
    return {
      command: "psql",
      args: [],
      client: "psql",
    };
  }

  return {
    command: "cockroach",
    args: ["sql"],
    client: "cockroach",
  };
}

function commandDisplay(command, commandArgs) {
  return redactOutput(
    [command, ...commandArgs]
      .map((part) => {
        const value = String(part);

        if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) return value;

        return JSON.stringify(value);
      })
      .join(" "),
  );
}

function createExecuteCommand(plan, sql, repoRoot) {
  const prefix = clientPrefix(plan);

  if (prefix.client === "psql") {
    return {
      command: prefix.command,
      args: [
        ...prefix.args,
        plan.database_url,
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--command",
        sql,
      ],
      cwd: repoRoot,
      display: commandDisplay(prefix.command, [
        ...prefix.args,
        "[DATABASE_URL]",
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--command",
        "[SQL]",
      ]),
    };
  }

  return {
    command: prefix.command,
    args: [...prefix.args, "--url", plan.database_url, "--execute", sql],
    cwd: repoRoot,
    display: commandDisplay(prefix.command, [
      ...prefix.args,
      "--url",
      "[DATABASE_URL]",
      "--execute",
      "[SQL]",
    ]),
  };
}

function createQueryCommand(plan, sql, repoRoot) {
  const prefix = clientPrefix(plan);

  if (prefix.client === "psql") {
    return {
      command: prefix.command,
      args: [
        ...prefix.args,
        plan.database_url,
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--csv",
        "--command",
        sql,
      ],
      cwd: repoRoot,
      display: commandDisplay(prefix.command, [
        ...prefix.args,
        "[DATABASE_URL]",
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--csv",
        "--command",
        "[SQL]",
      ]),
    };
  }

  return {
    command: prefix.command,
    args: [
      ...prefix.args,
      "--url",
      plan.database_url,
      "--format=csv",
      "--execute",
      sql,
    ],
    cwd: repoRoot,
    display: commandDisplay(prefix.command, [
      ...prefix.args,
      "--url",
      "[DATABASE_URL]",
      "--format=csv",
      "--execute",
      "[SQL]",
    ]),
  };
}

function createFileCommand(plan, filePath, repoRoot) {
  const prefix = clientPrefix(plan);

  if (prefix.client === "psql") {
    return {
      command: prefix.command,
      args: [
        ...prefix.args,
        plan.database_url,
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        filePath,
      ],
      cwd: repoRoot,
      display: commandDisplay(prefix.command, [
        ...prefix.args,
        "[DATABASE_URL]",
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        toRelativePath(filePath, repoRoot),
      ]),
    };
  }

  return {
    command: prefix.command,
    args: [...prefix.args, "--url", plan.database_url, "--file", filePath],
    cwd: repoRoot,
    display: commandDisplay(prefix.command, [
      ...prefix.args,
      "--url",
      "[DATABASE_URL]",
      "--file",
      toRelativePath(filePath, repoRoot),
    ]),
  };
}

function runCommand(commandRecord, args) {
  const startedAt = new Date();
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run) {
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

function parseCsv(text) {
  const input = String(text || "").trim();

  if (!input) return [];

  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        quoted = false;
        continue;
      }

      current += char;
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);

  const headers = rows.shift() || [];

  return rows.map((values) => {
    const record = {};

    for (const [index, header] of headers.entries()) {
      record[header] = values[index] || "";
    }

    return record;
  });
}

function runSqlExecute(plan, sql, args, repoRoot) {
  const command = createExecuteCommand(plan, sql, repoRoot);
  return runCommand(command, args);
}

function runSqlQuery(plan, sql, args, repoRoot) {
  const command = createQueryCommand(plan, sql, repoRoot);
  const result = runCommand(command, args);

  if (!result.success) {
    return {
      ...result,
      rows: [],
    };
  }

  return {
    ...result,
    rows: parseCsv(result.stdout),
  };
}

function runSqlFile(plan, filePath, args, repoRoot) {
  const command = createFileCommand(plan, filePath, repoRoot);
  return runCommand(command, args);
}

function writeTempSqlFile(databaseName, migrationId, sql) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aerealith-cockroachdb-migration-"),
  );
  const file = path.join(
    dir,
    `${safeId(databaseName)}-${safeId(migrationId)}.sql`,
  );

  fs.writeFileSync(file, `${sql.trim()}\n`);

  return {
    dir,
    file,
  };
}

function cleanupTempFile(record) {
  if (!record) return;

  try {
    fs.rmSync(record.dir, {
      recursive: true,
      force: true,
    });
  } catch {
    // Ignore cleanup errors.
  }
}

function validateDatabasePlan(plan, args) {
  const errors = [];
  const warnings = [];

  if (!plan.name) {
    errors.push("Database plan is missing a name.");
  }

  if (!args.dry_run && !plan.database_url) {
    errors.push(
      `Database "${plan.name}" is missing a database URL. Set COCKROACH_DATABASE_URL, DATABASE_URL, or database_url_env.`,
    );
  }

  if (
    !["cockroach", "psql", "custom"].includes(plan.client) &&
    !plan.client_command
  ) {
    warnings.push(
      `Unknown client "${plan.client}". The script will attempt to run it as configured.`,
    );
  }

  try {
    quoteTableName(plan.migrations_table);
  } catch (err) {
    errors.push(logger.formatError(err));
  }

  if (!plan.migrations_discovered.length && !plan.allow_empty) {
    errors.push(`Database "${plan.name}" produced no migration files.`);
  }

  if (!["auto", "always", "never"].includes(plan.transaction_mode)) {
    errors.push(
      `Invalid transaction mode "${plan.transaction_mode}". Use auto, always, or never.`,
    );
  }

  const ids = new Set();
  const duplicateIds = new Set();

  for (const migration of plan.migrations_discovered) {
    if (ids.has(migration.id)) {
      duplicateIds.add(migration.id);
    }

    ids.add(migration.id);
  }

  if (duplicateIds.size) {
    errors.push(`Duplicate migration id(s): ${[...duplicateIds].join(", ")}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function compareMigrations(localMigrations, remoteRows) {
  const localById = new Map(
    localMigrations.map((migration) => [migration.id, migration]),
  );
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]));

  const applied = [];
  const pending = [];
  const drift = [];
  const remoteOnly = [];

  for (const migration of localMigrations) {
    const remote = remoteById.get(migration.id);

    if (!remote) {
      pending.push(migration);
      continue;
    }

    if (remote.checksum !== migration.checksum) {
      drift.push({
        id: migration.id,
        filename: migration.filename,
        file: migration.file,
        local_checksum: migration.checksum,
        remote_checksum: remote.checksum,
        applied_at: remote.applied_at,
      });
      continue;
    }

    applied.push({
      ...migration,
      applied_at: remote.applied_at,
      execution_ms: Number(remote.execution_ms || 0),
    });
  }

  for (const remote of remoteRows) {
    if (!localById.has(remote.id)) {
      remoteOnly.push(remote);
    }
  }

  return {
    applied,
    pending,
    drift,
    remote_only: remoteOnly,
  };
}

function setupDatabase(plan, args, repoRoot) {
  const commands = [];

  if (!plan.create_table || args.dry_run) return commands;

  commands.push(
    runSqlExecute(
      plan,
      createMigrationsTableSql(plan.migrations_table),
      args,
      repoRoot,
    ),
  );

  if (plan.lock_migrations) {
    commands.push(
      runSqlExecute(
        plan,
        createLockTableSql(plan.migrations_table),
        args,
        repoRoot,
      ),
    );
    commands.push(
      runSqlExecute(
        plan,
        acquireLockSql(plan.migrations_table),
        args,
        repoRoot,
      ),
    );
  }

  return commands;
}

function releaseDatabaseLock(plan, args, repoRoot) {
  if (!plan.lock_migrations || args.dry_run) return null;

  return runSqlExecute(
    plan,
    releaseLockSql(plan.migrations_table),
    args,
    repoRoot,
  );
}

function readAppliedMigrations(plan, args, repoRoot) {
  if (args.dry_run) {
    return {
      status: "planned",
      success: true,
      rows: [],
      command: null,
      error: "",
    };
  }

  const result = runSqlQuery(
    plan,
    selectAppliedMigrationsSql(plan.migrations_table),
    args,
    repoRoot,
  );

  return {
    status: result.status,
    success: result.success,
    rows: result.rows,
    command: {
      display: result.display,
      status: result.status,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
    },
    error: result.success
      ? ""
      : result.error || result.stderr || "Failed to read applied migrations.",
  };
}

function applyMigration(plan, migration, args, repoRoot, github) {
  const startedAt = new Date();
  const script = createMigrationScript(plan, migration, github);
  const temp = writeTempSqlFile(plan.name, migration.id, script.sql);

  const result = {
    id: migration.id,
    filename: migration.filename,
    file: migration.file,
    checksum: migration.checksum,
    wrapped_transaction: script.wrapped,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    command: null,
    ledger_command: null,
    errors: [],
  };

  try {
    logger.info(
      `${args.dry_run ? "Planning" : "Applying"} migration ${migration.id} for ${plan.name}.`,
    );

    const command = runSqlFile(plan, temp.file, args, repoRoot);

    result.command = {
      display: command.display,
      status: command.status,
      exit_code: command.exit_code,
      duration_ms: command.duration_ms,
    };

    if (!command.success) {
      result.status = "failed";
      result.errors.push(
        command.error || command.stderr || `Migration ${migration.id} failed.`,
      );
      return result;
    }

    const executionMs = command.duration_ms;

    if (!script.wrapped && !args.dry_run) {
      const insertCommand = runSqlExecute(
        plan,
        insertMigrationRecordSql(
          plan.migrations_table,
          migration,
          executionMs,
          github,
        ),
        args,
        repoRoot,
      );

      result.ledger_command = {
        display: insertCommand.display,
        status: insertCommand.status,
        exit_code: insertCommand.exit_code,
        duration_ms: insertCommand.duration_ms,
      };

      if (!insertCommand.success) {
        result.status = "failed";
        result.errors.push(
          insertCommand.error ||
            insertCommand.stderr ||
            `Migration ${migration.id} applied, but ledger insert failed.`,
        );
        return result;
      }
    }

    if (script.wrapped && !args.dry_run) {
      const updateCommand = runSqlExecute(
        plan,
        updateMigrationExecutionSql(
          plan.migrations_table,
          migration,
          executionMs,
        ),
        args,
        repoRoot,
      );

      result.ledger_command = {
        display: updateCommand.display,
        status: updateCommand.status,
        exit_code: updateCommand.exit_code,
        duration_ms: updateCommand.duration_ms,
      };

      if (!updateCommand.success) {
        result.errors.push(
          updateCommand.error ||
            updateCommand.stderr ||
            `Migration ${migration.id} applied, but ledger duration update failed.`,
        );
      }
    }

    result.status = args.dry_run ? "planned" : "applied";
    result.success = true;
    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    cleanupTempFile(temp);

    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

async function runDatabaseMigrations(plan, args, repoRoot, github) {
  const startedAt = new Date();
  const validation = validateDatabasePlan(plan, args);

  const result = {
    id: plan.id,
    name: plan.name,
    client: plan.client,
    client_command: plan.client_command ? "[configured]" : "",
    database_url_present: Boolean(plan.database_url),
    database_url_env: plan.database_url_env,
    migrations_table: plan.migrations_table,
    transaction_mode: plan.transaction_mode,
    create_table: plan.create_table,
    lock_migrations: plan.lock_migrations,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    setup_commands: [],
    release_lock_command: null,
    applied_remote: [],
    local_migrations: plan.migrations_discovered.map((migration) => ({
      id: migration.id,
      filename: migration.filename,
      file: migration.file,
      checksum: migration.checksum,
      bytes: migration.bytes,
      no_transaction: migration.no_transaction,
    })),
    comparison: {
      applied: [],
      pending: [],
      drift: [],
      remote_only: [],
    },
    migration_results: [],
    errors: [],
    warnings: [...validation.warnings],
    totals: {
      local_migrations: plan.migrations_discovered.length,
      remote_applied: 0,
      already_applied: 0,
      pending: 0,
      drift: 0,
      remote_only: 0,
      planned: 0,
      applied: 0,
      failed: 0,
    },
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    result.setup_commands = setupDatabase(plan, args, repoRoot).map(
      (command) => ({
        display: command.display,
        status: command.status,
        success: command.success,
        exit_code: command.exit_code,
        duration_ms: command.duration_ms,
        error: command.success ? "" : command.error || command.stderr,
      }),
    );

    const setupFailure = result.setup_commands.find(
      (command) => !command.success,
    );

    if (setupFailure) {
      result.status = "failed";
      result.errors.push(
        setupFailure.error || "Failed to set up migration table.",
      );
      return result;
    }

    const applied = readAppliedMigrations(plan, args, repoRoot);

    if (!applied.success) {
      result.status = "failed";
      result.errors.push(applied.error);
      return result;
    }

    result.applied_remote = applied.rows;
    result.totals.remote_applied = applied.rows.length;

    const comparison = compareMigrations(
      plan.migrations_discovered,
      applied.rows,
    );

    result.comparison = {
      applied: comparison.applied.map((migration) => ({
        id: migration.id,
        filename: migration.filename,
        file: migration.file,
        checksum: migration.checksum,
        applied_at: migration.applied_at,
        execution_ms: migration.execution_ms,
      })),
      pending: comparison.pending.map((migration) => ({
        id: migration.id,
        filename: migration.filename,
        file: migration.file,
        checksum: migration.checksum,
        bytes: migration.bytes,
        no_transaction: migration.no_transaction,
      })),
      drift: comparison.drift,
      remote_only: comparison.remote_only,
    };

    result.totals.already_applied = comparison.applied.length;
    result.totals.pending = comparison.pending.length;
    result.totals.drift = comparison.drift.length;
    result.totals.remote_only = comparison.remote_only.length;

    if (comparison.drift.length) {
      const message = `Checksum drift detected for ${comparison.drift.length} migration(s).`;

      if (plan.fail_on_drift) {
        result.status = "drift";
        result.errors.push(message);
        return result;
      }

      result.warnings.push(message);
    }

    if (comparison.remote_only.length) {
      const message = `${comparison.remote_only.length} remote migration(s) are missing locally.`;

      if (plan.fail_on_missing_local) {
        result.status = "missing-local";
        result.errors.push(message);
        return result;
      }

      result.warnings.push(message);
    }

    for (const migration of comparison.pending) {
      const migrationResult = applyMigration(
        plan,
        migration,
        args,
        repoRoot,
        github,
      );
      result.migration_results.push(migrationResult);

      if (!migrationResult.success && !args.continue_on_error) {
        break;
      }
    }

    result.totals.planned = result.migration_results.filter(
      (item) => item.status === "planned",
    ).length;
    result.totals.applied = result.migration_results.filter(
      (item) => item.status === "applied",
    ).length;
    result.totals.failed = result.migration_results.filter(
      (item) => item.status === "failed",
    ).length;

    if (result.totals.failed > 0) {
      result.status = "failed";
      result.errors.push(`${result.totals.failed} migration(s) failed.`);
      return result;
    }

    result.status = args.dry_run
      ? comparison.pending.length
        ? "planned"
        : "current"
      : comparison.pending.length
        ? "migrated"
        : "current";
    result.success = true;

    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const release = releaseDatabaseLock(plan, args, repoRoot);

    if (release) {
      result.release_lock_command = {
        display: release.display,
        status: release.status,
        success: release.success,
        exit_code: release.exit_code,
        duration_ms: release.duration_ms,
        error: release.success ? "" : release.error || release.stderr,
      };
    }

    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

async function executePlans(plans, args, repoRoot) {
  const github = getGitMetadata(repoRoot);
  const results = [];
  let stoppedEarly = false;

  for (const plan of plans.databases) {
    const result = await runDatabaseMigrations(plan, args, repoRoot, github);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed database migration plan.");
      break;
    }
  }

  return {
    results,
    stopped_early: stoppedEarly,
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

function summarizeResults(results) {
  const durationMs = results.reduce(
    (sum, result) => sum + Number(result.duration_ms || 0),
    0,
  );

  return {
    databases: results.length,
    current: results.filter((result) => result.status === "current").length,
    migrated: results.filter((result) => result.status === "migrated").length,
    planned: results.filter((result) => result.status === "planned").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    drift: results.filter((result) => result.status === "drift").length,
    missing_local: results.filter((result) => result.status === "missing-local")
      .length,
    local_migrations: results.reduce(
      (sum, result) => sum + result.totals.local_migrations,
      0,
    ),
    remote_applied: results.reduce(
      (sum, result) => sum + result.totals.remote_applied,
      0,
    ),
    already_applied: results.reduce(
      (sum, result) => sum + result.totals.already_applied,
      0,
    ),
    pending: results.reduce((sum, result) => sum + result.totals.pending, 0),
    applied: results.reduce((sum, result) => sum + result.totals.applied, 0),
    migration_failures: results.reduce(
      (sum, result) => sum + result.totals.failed,
      0,
    ),
    checksum_drift: results.reduce(
      (sum, result) => sum + result.totals.drift,
      0,
    ),
    remote_only: results.reduce(
      (sum, result) => sum + result.totals.remote_only,
      0,
    ),
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok:
      results.every((result) => result.success) &&
      results.every((result) => result.totals.failed === 0) &&
      results.every(
        (result) => result.totals.drift === 0 || result.status !== "drift",
      ),
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        current: 0,
        migrated: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        drift: 0,
        pending: 0,
        applied: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "current") groups[group].current += 1;
    if (result.status === "migrated") groups[group].migrated += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    if (result.status === "drift") groups[group].drift += 1;
    groups[group].pending += result.totals.pending;
    groups[group].applied += result.totals.applied;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results);
  const status =
    totals.failed > 0 || totals.migration_failures > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : totals.drift > 0
          ? "drift"
          : execution.results.length === 0
            ? "empty"
            : args.dry_run
              ? "planned"
              : totals.applied > 0
                ? "migrated"
                : "current";

  return {
    schema_version: 1,
    type: "cockroachdb-migrations",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      create_table: args.create_table,
      lock_migrations: args.lock_migrations,
      fail_on_drift: args.fail_on_drift,
      fail_on_missing_local: args.fail_on_missing_local,
      allow_empty: args.allow_empty,
      transaction_mode: args.transaction_mode,
      max_databases: args.max_databases,
      max_migrations: args.max_migrations,
      dry_run: args.dry_run,
    },
    discovery: {
      discovered_databases: plans.discovered_databases,
      selected_databases: plans.databases.length,
    },
    selected_databases: plans.databases.map((plan) => ({
      id: plan.id,
      name: plan.name,
      client: plan.client,
      database_url_present: Boolean(plan.database_url),
      database_url_env: plan.database_url_env,
      migrations_table: plan.migrations_table,
      migrations: plan.migrations,
      migrations_discovered: plan.migrations_discovered.length,
      transaction_mode: plan.transaction_mode,
      create_table: plan.create_table,
      lock_migrations: plan.lock_migrations,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_client: groupResults(execution.results, "client"),
    },
    results: execution.results,
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
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
    `# 🪳 ${PROJECT_NAME} CockroachDB Migrations`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Databases: \`${report.totals.databases}\``,
    `- Current: \`${report.totals.current}\``,
    `- Migrated: \`${report.totals.migrated}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Drift: \`${report.totals.drift}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Local migrations: \`${report.totals.local_migrations}\``,
    `- Remote applied: \`${report.totals.remote_applied}\``,
    `- Already applied: \`${report.totals.already_applied}\``,
    `- Pending: \`${report.totals.pending}\``,
    `- Applied this run: \`${report.totals.applied}\``,
    `- Migration failures: \`${report.totals.migration_failures}\``,
    `- Checksum drift: \`${report.totals.checksum_drift}\``,
    `- Remote-only migrations: \`${report.totals.remote_only}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🎯 Selected Databases",
    "",
  ];

  if (!report.selected_databases.length) {
    lines.push("No database migration plans were selected.");
  } else {
    lines.push(
      "| Database | Client | URL Present | Table | Migrations | Transactions |",
    );
    lines.push("|---|---|---:|---|---:|---|");

    for (const database of report.selected_databases) {
      lines.push(
        `| \`${database.name}\` | \`${database.client}\` | \`${database.database_url_present ? "true" : "false"}\` | \`${database.migrations_table}\` | \`${database.migrations_discovered}\` | \`${database.transaction_mode}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Database Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No database results were produced.");
  } else {
    lines.push(
      "| Status | Database | Local | Already Applied | Pending | Applied | Failed | Duration |",
    );
    lines.push("|---|---|---:|---:|---:|---:|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.name}\` | \`${result.totals.local_migrations}\` | \`${result.totals.already_applied}\` | \`${result.totals.pending}\` | \`${result.totals.applied}\` | \`${result.totals.failed}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  const pending = report.results.flatMap((result) =>
    result.comparison.pending.map((migration) => ({
      database: result.name,
      ...migration,
    })),
  );

  if (pending.length) {
    lines.push("");
    lines.push("## ⏳ Pending Migrations");
    lines.push("");
    lines.push("| Database | Migration | File | Checksum |");
    lines.push("|---|---|---|---|");

    for (const migration of pending.slice(0, 100)) {
      lines.push(
        `| \`${migration.database}\` | \`${migration.id}\` | \`${migration.file}\` | \`${migration.checksum.slice(0, 12)}\` |`,
      );
    }

    if (pending.length > 100) {
      lines.push(
        `| ... | ... | ... | ${pending.length - 100} additional migration(s) omitted. |`,
      );
    }
  }

  const applied = report.results.flatMap((result) =>
    result.migration_results.map((migration) => ({
      database: result.name,
      ...migration,
    })),
  );

  if (applied.length) {
    lines.push("");
    lines.push("## 🚀 Migration Actions");
    lines.push("");
    lines.push("| Status | Database | Migration | Wrapped | Duration |");
    lines.push("|---|---|---|---:|---:|");

    for (const migration of applied) {
      lines.push(
        `| \`${migration.status}\` | \`${migration.database}\` | \`${migration.id}\` | \`${migration.wrapped_transaction ? "true" : "false"}\` | \`${formatDuration(migration.duration_ms)}\` |`,
      );
    }
  }

  const drift = report.results.flatMap((result) =>
    result.comparison.drift.map((item) => ({
      database: result.name,
      ...item,
    })),
  );

  if (drift.length) {
    lines.push("");
    lines.push("## ⚠️ Checksum Drift");
    lines.push("");
    lines.push("| Database | Migration | Local | Remote |");
    lines.push("|---|---|---|---|");

    for (const item of drift) {
      lines.push(
        `| \`${item.database}\` | \`${item.id}\` | \`${item.local_checksum.slice(0, 12)}\` | \`${item.remote_checksum.slice(0, 12)}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Database | Status | Errors |");
    lines.push("|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.name}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = report.results.flatMap((result) =>
    result.warnings.map((warning) => ({
      database: result.name,
      warning,
    })),
  );

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings) {
      lines.push(`- \`${warning.database}\`: ${warning.warning}`);
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
    `- Create table: \`${report.config.create_table ? "true" : "false"}\``,
  );
  lines.push(
    `- Lock migrations: \`${report.config.lock_migrations ? "true" : "false"}\``,
  );
  lines.push(`- Transaction mode: \`${report.config.transaction_mode}\``);

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
  setGitHubOutput("cockroachdb_migrations_file", report.config.output_file);
  setGitHubOutput(
    "cockroachdb_migrations_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cockroachdb_migrations_status", report.status);
  setGitHubOutput(
    "cockroachdb_migrations_ok",
    report.totals.ok ? "true" : "false",
  );
  setGitHubOutput(
    "cockroachdb_migrations_databases",
    String(report.totals.databases),
  );
  setGitHubOutput(
    "cockroachdb_migrations_current",
    String(report.totals.current),
  );
  setGitHubOutput(
    "cockroachdb_migrations_migrated",
    String(report.totals.migrated),
  );
  setGitHubOutput(
    "cockroachdb_migrations_planned",
    String(report.totals.planned),
  );
  setGitHubOutput(
    "cockroachdb_migrations_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "cockroachdb_migrations_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput("cockroachdb_migrations_drift", String(report.totals.drift));
  setGitHubOutput(
    "cockroachdb_migrations_local",
    String(report.totals.local_migrations),
  );
  setGitHubOutput(
    "cockroachdb_migrations_pending",
    String(report.totals.pending),
  );
  setGitHubOutput(
    "cockroachdb_migrations_applied",
    String(report.totals.applied),
  );
  setGitHubOutput(
    "cockroachdb_migrations_failures",
    String(report.totals.migration_failures),
  );
  setGitHubOutput(
    "cockroachdb_migrations_database_names",
    report.selected_databases.map((database) => database.name).join(","),
  );
  setGitHubOutput(
    "cockroachdb_migrations_database_names_json",
    JSON.stringify(report.selected_databases.map((database) => database.name)),
  );
  setGitHubOutput(
    "cockroachdb_migrations_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing CockroachDB migrations.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.databases.length === 0) {
    logger.error("No CockroachDB migration database plans were selected.");
    process.exitCode = 1;
  }

  if (
    !args.allow_empty &&
    plans.databases.every((plan) => plan.migrations_discovered.length === 0)
  ) {
    logger.error("No CockroachDB migration files were discovered.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          results: [],
          stopped_early: false,
        }
      : await executePlans(plans, args, repoRoot);

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

  if (args.fail_if_empty && report.discovery.selected_databases === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `CockroachDB migrations completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}, drift=${report.totals.drift}, migration_failures=${report.totals.migration_failures}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
