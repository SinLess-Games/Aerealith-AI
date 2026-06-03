#!/usr/bin/env node
// .github/scripts/databases/run-d1-migrations.js
// =============================================================================
// Aerealith AI — Cloudflare D1 Migration Runner
// -----------------------------------------------------------------------------
// Purpose:
//   Discover, validate, and run Cloudflare D1 migrations for one or more D1
//   databases from local configuration, Wrangler config metadata, or CI target
//   discovery artifacts.
//
// Input:
//   - .github/databases/d1-migrations.json
//   - .github/databases/d1-migrations.jsonc
//   - .github/databases/d1-migrations.yaml
//   - .github/databases/d1-migrations.yml
//   - .github/cloudflare/d1-migrations.json
//   - artifacts/ci/cloudflare-targets.json
//   - database/d1/migrations/**/*.sql
//   - databases/d1/migrations/**/*.sql
//   - d1/migrations/**/*.sql
//
// Output:
//   - artifacts/databases/d1-migrations.json
//   - artifacts/databases/d1-migrations.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses Wrangler for D1 migration list/apply.
//   - Requires CLOUDFLARE_API_TOKEN for real remote migrations.
//   - Requires CLOUDFLARE_ACCOUNT_ID by default for remote migrations.
//   - Dry-run mode plans and reports without mutating D1.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[d1-migrations] ${message}`),
    warn: (message) => console.warn(`[d1-migrations] WARN: ${message}`),
    error: (message) => console.error(`[d1-migrations] ERROR: ${message}`),
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
  ".github/databases/d1-migrations.json",
  ".github/databases/d1-migrations.jsonc",
  ".github/databases/d1-migrations.yaml",
  ".github/databases/d1-migrations.yml",
  ".github/cloudflare/d1-migrations.json",
  ".github/cloudflare/d1-migrations.jsonc",
  ".github/cloudflare/d1-migrations.yaml",
  ".github/cloudflare/d1-migrations.yml",
  "databases/d1-migrations.json",
  "databases/d1-migrations.jsonc",
  "databases/d1-migrations.yaml",
  "databases/d1-migrations.yml",
  "cloudflare/d1-migrations.json",
  "cloudflare/d1-migrations.jsonc",
  "cloudflare/d1-migrations.yaml",
  "cloudflare/d1-migrations.yml",
];

const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_OUTPUT_FILE = "artifacts/databases/d1-migrations.json";
const DEFAULT_SUMMARY_FILE = "artifacts/databases/d1-migrations.md";

const DEFAULT_MIGRATION_DIRS = [
  "database/d1/migrations",
  "databases/d1/migrations",
  "db/d1/migrations",
  "d1/migrations",
  "migrations/d1",
  "apps/api/d1/migrations",
  "services/api/d1/migrations",
  "cloudflare/d1/migrations",
];

const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_PACKAGE_MANAGER = "auto";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    config_file: process.env.CLOUDFLARE_D1_MIGRATIONS_CONFIG_FILE || "",
    cloudflare_targets_file:
      process.env.CLOUDFLARE_D1_MIGRATIONS_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,

    output_file:
      process.env.CLOUDFLARE_D1_MIGRATIONS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_D1_MIGRATIONS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    environment:
      process.env.CLOUDFLARE_D1_MIGRATIONS_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      DEFAULT_ENVIRONMENT,

    database_name:
      process.env.CLOUDFLARE_D1_DATABASE_NAME ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_DATABASE_NAME ||
      "",
    database_id:
      process.env.CLOUDFLARE_D1_DATABASE_ID ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_DATABASE_ID ||
      "",
    binding:
      process.env.CLOUDFLARE_D1_BINDING ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_BINDING ||
      "",

    target_id:
      process.env.CLOUDFLARE_TARGET_ID ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_TARGET_ID ||
      "",
    target_name:
      process.env.CLOUDFLARE_TARGET_NAME ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_TARGET_NAME ||
      "",
    target_config:
      process.env.CLOUDFLARE_TARGET_CONFIG ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_TARGET_CONFIG ||
      "",

    migrations_dir:
      process.env.CLOUDFLARE_D1_MIGRATIONS_DIR ||
      process.env.CLOUDFLARE_D1_MIGRATIONS_PATH ||
      "",
    migrations: normalizeStringList(process.env.CLOUDFLARE_D1_MIGRATIONS_PATHS),

    include_databases: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_INCLUDE_DATABASES,
    ),
    exclude_databases: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_EXCLUDE_DATABASES,
    ),
    include_bindings: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_INCLUDE_BINDINGS,
    ),
    exclude_bindings: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_EXCLUDE_BINDINGS,
    ),
    include_targets: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_INCLUDE_TARGETS,
    ),
    exclude_targets: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_EXCLUDE_TARGETS,
    ),
    include_migrations: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_INCLUDE,
    ),
    exclude_migrations: normalizeStringList(
      process.env.CLOUDFLARE_D1_MIGRATIONS_EXCLUDE,
    ),

    remote: normalizeBoolean(process.env.CLOUDFLARE_D1_MIGRATIONS_REMOTE, true),
    local: normalizeBoolean(process.env.CLOUDFLARE_D1_MIGRATIONS_LOCAL, false),
    preview: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_PREVIEW,
      false,
    ),

    list_remote: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_LIST_REMOTE,
      true,
    ),
    apply_migrations: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_APPLY,
      true,
    ),
    require_credentials: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_REQUIRE_CREDENTIALS,
      true,
    ),
    require_account_id: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_REQUIRE_ACCOUNT_ID,
      true,
    ),
    fail_on_missing_local: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_FAIL_ON_MISSING_LOCAL,
      false,
    ),
    allow_empty: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_ALLOW_EMPTY,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_CONTINUE_ON_ERROR,
      false,
    ),

    max_databases: normalizeInteger(
      process.env.CLOUDFLARE_D1_MIGRATIONS_MAX_DATABASES,
      0,
    ),
    max_migrations: normalizeInteger(
      process.env.CLOUDFLARE_D1_MIGRATIONS_MAX_MIGRATIONS,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.CLOUDFLARE_D1_MIGRATIONS_TIMEOUT_MINUTES,
      15,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.CLOUDFLARE_D1_MIGRATIONS_MAX_BUFFER_MB,
      64,
    ),

    wrangler_command:
      process.env.CLOUDFLARE_WRANGLER_COMMAND ||
      process.env.WRANGLER_COMMAND ||
      "",
    package_manager:
      process.env.CLOUDFLARE_D1_MIGRATIONS_PACKAGE_MANAGER ||
      DEFAULT_PACKAGE_MANAGER,

    dry_run: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_D1_MIGRATIONS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_D1_MIGRATIONS_STEP_SUMMARY,
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

    if (arg === "--database" || arg === "--database-name") {
      args.database_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--database-id") {
      args.database_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--binding") {
      args.binding = argv[index + 1];
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

    if (arg === "--target-config" || arg === "--config-file") {
      args.target_config = argv[index + 1];
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

    if (arg === "--include-binding" || arg === "--include-bindings") {
      args.include_bindings.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-binding" || arg === "--exclude-bindings") {
      args.exclude_bindings.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--remote") {
      args.remote = true;
      args.local = false;
      continue;
    }

    if (arg === "--local") {
      args.local = true;
      args.remote = false;
      continue;
    }

    if (arg === "--preview") {
      args.preview = true;
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

    if (arg === "--apply") {
      args.apply_migrations = true;
      continue;
    }

    if (arg === "--no-apply") {
      args.apply_migrations = false;
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
  args.package_manager = normalizeString(
    args.package_manager,
    DEFAULT_PACKAGE_MANAGER,
  ).toLowerCase();
  args.migrations = [
    ...new Set([
      ...(args.migrations_dir ? [args.migrations_dir] : []),
      ...args.migrations,
    ]),
  ];
  args.include_databases = [...new Set(args.include_databases)];
  args.exclude_databases = [...new Set(args.exclude_databases)];
  args.include_bindings = [...new Set(args.include_bindings)];
  args.exclude_bindings = [...new Set(args.exclude_bindings)];
  args.include_targets = [...new Set(args.include_targets)];
  args.exclude_targets = [...new Set(args.exclude_targets)];
  args.include_migrations = [...new Set(args.include_migrations)];
  args.exclude_migrations = [
    ...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude_migrations]),
  ];
  args.max_databases = Math.max(0, args.max_databases);
  args.max_migrations = Math.max(0, args.max_migrations);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  if (!args.remote && !args.local) {
    args.remote = true;
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cloudflare D1 Migration Runner

Usage:
  node .github/scripts/databases/run-d1-migrations.js [options]

Examples:
  node .github/scripts/databases/run-d1-migrations.js --dry-run
  node .github/scripts/databases/run-d1-migrations.js --database aerealith-prod --binding DB --remote
  node .github/scripts/databases/run-d1-migrations.js --target api --environment staging
  node .github/scripts/databases/run-d1-migrations.js --config .github/databases/d1-migrations.json

Options:
      --repo <owner/repo>                   Repository slug.
      --config <file>                       D1 migrations config file.
      --targets <file>                      cloudflare-targets.json detector file.
      --environment <name>                  Wrangler environment. Default: production.
      --database <name>                     Direct D1 database name.
      --database-id <id>                    Direct D1 database ID.
      --binding <name>                      Direct D1 binding name.
      --target-id <id>                      Include one discovered target ID.
      --target <name>                       Include one discovered target name.
      --target-config <file>                Include one Wrangler config file.
      --migrations <path,list>              Migration file or directory path.
      --include-database <list>             Include database names or IDs.
      --exclude-database <list>             Exclude database names or IDs.
      --include-binding <list>              Include D1 bindings.
      --exclude-binding <list>              Exclude D1 bindings.
      --include-target <list>               Include target names.
      --exclude-target <list>               Exclude target names.
      --include <list>                      Include migration IDs, filenames, or paths.
      --exclude <pattern>                   Exclude migration path pattern.
      --remote                              Apply remote D1 migrations. Default.
      --local                               Apply local D1 migrations.
      --preview                             Add Wrangler preview flag where supported.
      --list-remote                         List applied migrations before apply. Default.
      --no-list-remote                      Skip migration listing.
      --apply                               Apply pending migrations. Default.
      --no-apply                            Report only; do not apply.
      --require-credentials                 Require Cloudflare credentials. Default.
      --no-require-credentials              Do not require Cloudflare credentials.
      --require-account-id                  Require CLOUDFLARE_ACCOUNT_ID. Default.
      --no-require-account-id               Do not require account ID.
      --fail-on-missing-local               Fail if remote migrations are missing locally.
      --no-fail-on-missing-local            Warn on remote-only migrations. Default.
      --allow-empty                         Allow no migration files. Default.
      --no-allow-empty                      Treat no migration files as invalid.
      --fail-if-empty                       Exit non-zero if no database plans are selected.
      --fail-on-error                       Exit non-zero on migration errors. Default.
      --no-fail-on-error                    Do not fail when errors occur.
      --continue-on-error                   Continue after a database failure.
      --no-continue-on-error                Stop after first database failure. Default.
      --max-databases <number>              Maximum database plans to run.
      --max-migrations <number>             Maximum local migrations to report.
      --timeout-minutes <number>            Per Wrangler command timeout. Default: 15.
      --wrangler-command <command>          Custom Wrangler command prefix.
      --package-manager <auto|pnpm|npm|yarn|bun|npx>
  -o, --output <file>                       JSON output file.
      --summary <file>                      Markdown summary output file.
      --no-summary                          Do not write Markdown summary.
      --dry-run                             Plan but do not mutate D1.
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

function parseSimpleD1Yaml(text) {
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

      if (section === "databases" || section === "d1_databases") {
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

    if (
      (section === "databases" || section === "d1_databases") &&
      /^-\s*/.test(trimmed)
    ) {
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
    return parseSimpleD1Yaml(text);
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
    normalizeString(value, "d1-migrations")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "d1-migrations"
  );
}

function sha256File(filePath) {
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

function normalizeMigrationFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);
  const id = migrationIdFromFile(absolutePath);
  const stat = fs.statSync(absolutePath);

  return {
    id,
    filename: path.basename(absolutePath),
    file: relativePath,
    absolute_file: absolutePath,
    checksum: sha256File(absolutePath),
    bytes: stat.size,
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

function normalizeD1Name(value) {
  return normalizeString(value)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-");
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

function normalizeDatabasePlan(item, args, source = "config") {
  const databaseName = normalizeD1Name(
    resolveConfigEnvironmentValue(
      item,
      args,
      "database_name",
      "databaseName",
      "name",
    ),
  );
  const databaseId = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "database_id",
      "databaseId",
      "id",
    ),
  );
  const binding = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "binding",
      "binding_name",
      "bindingName",
    ),
  );
  const targetName = normalizeString(
    item.target_name || item.target || args.target_name,
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
      args.target_config,
    ),
  );
  const root = toPosixPath(
    normalizeString(resolveConfigEnvironmentValue(item, args, "root"), "."),
  );
  const wranglerEnvironment = normalizeString(
    resolveConfigEnvironmentValue(
      item,
      args,
      "wrangler_environment",
      "wranglerEnvironment",
      "environment",
    ),
    args.environment,
  );

  return {
    id: safeId(
      `${source}-${args.environment}-${targetName || databaseName || binding || databaseId || "d1"}`,
    ),
    source_type: source,
    target_name: targetName,
    target_id: normalizeString(
      item.target_id || item.targetId || args.target_id,
    ),
    root,
    config_file: configFile,
    environment: args.environment,
    wrangler_environment: wranglerEnvironment,
    has_config_environment: Boolean(wranglerEnvironment),
    database_name: databaseName,
    database_id: databaseId,
    binding,
    database_argument: normalizeString(
      resolveConfigEnvironmentValue(
        item,
        args,
        "database",
        "database_argument",
        "databaseArgument",
      ),
      binding || databaseName || databaseId,
    ),
    migrations: normalizeStringList(
      resolveConfigEnvironmentValue(
        item,
        args,
        "migrations",
        "migrations_dir",
        "migrationsDir",
        "migration_dir",
      ),
    ),
    remote: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "remote"),
      args.remote,
    ),
    local: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "local"),
      args.local,
    ),
    preview: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "preview"),
      args.preview,
    ),
    list_remote: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "list_remote", "listRemote"),
      args.list_remote,
    ),
    apply_migrations: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "apply",
        "apply_migrations",
        "applyMigrations",
      ),
      args.apply_migrations,
    ),
    fail_on_missing_local: normalizeBoolean(
      resolveConfigEnvironmentValue(
        item,
        args,
        "fail_on_missing_local",
        "failOnMissingLocal",
      ),
      args.fail_on_missing_local,
    ),
    allow_empty: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "allow_empty", "allowEmpty"),
      args.allow_empty,
    ),
    enabled: normalizeBoolean(
      resolveConfigEnvironmentValue(item, args, "enabled"),
      true,
    ),
  };
}

function extractConfigPlans(config, args) {
  if (!config) return [];

  const databases = [
    ...(Array.isArray(config.databases) ? config.databases : []),
    ...(Array.isArray(config.d1_databases) ? config.d1_databases : []),
    ...(Array.isArray(config.d1Databases) ? config.d1Databases : []),
  ];

  if (config.database && typeof config.database === "object") {
    databases.push(config.database);
  }

  if (
    !databases.length &&
    (config.database_name ||
      config.databaseName ||
      config.database_id ||
      config.databaseId ||
      config.binding ||
      config.migrations ||
      config.migrations_dir)
  ) {
    databases.push(config);
  }

  return databases.map((item) => normalizeDatabasePlan(item, args, "config"));
}

function normalizeTargetD1Database(item, target, args) {
  if (!item) return null;

  const databaseName = normalizeD1Name(
    item.database_name || item.databaseName || item.name || "",
  );
  const databaseId = normalizeString(
    item.database_id || item.databaseId || item.id || "",
  );
  const binding = normalizeString(
    item.binding || item.binding_name || item.bindingName || "",
  );

  if (!databaseName && !databaseId && !binding) return null;

  const environments = Array.isArray(target.environments)
    ? target.environments
    : [];
  const hasEnvironment = environments.includes(args.environment);

  return normalizeDatabasePlan(
    {
      target_name: target.name,
      target_id: target.id,
      root: target.root || ".",
      config_file: target.config_file || target.wrangler_config || "",
      wrangler_environment: hasEnvironment
        ? args.environment
        : args.environment,
      database_name: databaseName,
      database_id: databaseId,
      binding,
      migrations: args.migrations,
    },
    args,
    "cloudflare-targets",
  );
}

function extractTargetPlans(targetsData, args) {
  if (!targetsData) return [];

  const targets = Array.isArray(targetsData.targets) ? targetsData.targets : [];
  const plans = [];

  for (const target of targets) {
    const targetName = normalizeString(target.name);
    const targetId = normalizeString(target.id);
    const configFile = toPosixPath(
      target.config_file || target.wrangler_config || "",
    );

    if (args.target_id && targetId !== args.target_id) continue;
    if (args.target_name && targetName !== args.target_name) continue;
    if (args.target_config && configFile !== toPosixPath(args.target_config))
      continue;
    if (
      args.include_targets.length &&
      !args.include_targets.includes(targetName)
    )
      continue;
    if (args.exclude_targets.includes(targetName)) continue;

    const rawConfig = target.raw_config || target.config || {};
    const candidates = [
      ...(Array.isArray(target.d1_databases) ? target.d1_databases : []),
      ...(Array.isArray(target.d1Databases) ? target.d1Databases : []),
      ...(Array.isArray(target.resources?.d1_databases)
        ? target.resources.d1_databases
        : []),
      ...(Array.isArray(rawConfig.d1_databases) ? rawConfig.d1_databases : []),
    ];

    for (const candidate of candidates) {
      const plan = normalizeTargetD1Database(candidate, target, args);
      if (plan) plans.push(plan);
    }
  }

  return plans;
}

function createDirectPlan(args) {
  if (
    !args.database_name &&
    !args.database_id &&
    !args.binding &&
    !args.target_config &&
    !args.migrations.length
  ) {
    return null;
  }

  return normalizeDatabasePlan(
    {
      database_name: args.database_name,
      database_id: args.database_id,
      binding: args.binding,
      target_name: args.target_name,
      target_id: args.target_id,
      config_file: args.target_config,
      migrations: args.migrations,
      remote: args.remote,
      local: args.local,
      preview: args.preview,
      list_remote: args.list_remote,
      apply: args.apply_migrations,
      enabled: true,
    },
    args,
    "direct",
  );
}

function databaseMatchesFilters(plan, args) {
  const databaseKeys = [plan.database_name, plan.database_id].filter(Boolean);

  if (!plan.enabled) return false;

  if (args.target_id && plan.target_id !== args.target_id) return false;
  if (args.target_name && plan.target_name !== args.target_name) return false;
  if (
    args.target_config &&
    plan.config_file !== toPosixPath(args.target_config)
  )
    return false;

  if (args.include_databases.length) {
    const matched = databaseKeys.some((key) =>
      args.include_databases.includes(key),
    );
    if (!matched) return false;
  }

  if (databaseKeys.some((key) => args.exclude_databases.includes(key))) {
    return false;
  }

  if (
    args.include_bindings.length &&
    !args.include_bindings.includes(plan.binding)
  ) {
    return false;
  }

  if (args.exclude_bindings.includes(plan.binding)) {
    return false;
  }

  if (
    args.include_targets.length &&
    plan.target_name &&
    !args.include_targets.includes(plan.target_name)
  ) {
    return false;
  }

  if (args.exclude_targets.includes(plan.target_name)) {
    return false;
  }

  return true;
}

function mergeDatabasePlans(existing, next) {
  return {
    ...existing,
    ...next,
    target_name: next.target_name || existing.target_name,
    target_id: next.target_id || existing.target_id,
    config_file: next.config_file || existing.config_file,
    root: next.root || existing.root,
    wrangler_environment:
      next.wrangler_environment || existing.wrangler_environment,
    database_name: next.database_name || existing.database_name,
    database_id: next.database_id || existing.database_id,
    binding: next.binding || existing.binding,
    database_argument: next.database_argument || existing.database_argument,
    migrations: [
      ...new Set([...(existing.migrations || []), ...(next.migrations || [])]),
    ],
    remote: existing.remote || next.remote,
    local: existing.local || next.local,
    preview: existing.preview || next.preview,
    list_remote: existing.list_remote || next.list_remote,
    apply_migrations: existing.apply_migrations || next.apply_migrations,
  };
}

function dedupeDatabasePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key =
      plan.database_id ||
      `${plan.config_file}:${plan.wrangler_environment}:${plan.binding || plan.database_name || plan.database_argument}`;

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    seen.set(key, mergeDatabasePlans(seen.get(key), plan));
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.environment.localeCompare(right.environment) ||
      (left.target_name || left.config_file).localeCompare(
        right.target_name || right.config_file,
      ) ||
      (left.binding || left.database_name || left.database_id).localeCompare(
        right.binding || right.database_name || right.database_id,
      )
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const targetsData = readJsonFile(
    args.cloudflare_targets_file,
    repoRoot,
    null,
  );
  const directPlan = createDirectPlan(args);

  const rawPlans = [
    ...extractConfigPlans(config, args),
    ...extractTargetPlans(targetsData, args),
    ...(directPlan ? [directPlan] : []),
  ];

  const selected = dedupeDatabasePlans(rawPlans)
    .filter((plan) => databaseMatchesFilters(plan, args))
    .slice(0, args.max_databases > 0 ? args.max_databases : undefined)
    .map((plan) => ({
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
    cloudflare_targets_file: toRelativePath(
      resolvePath(args.cloudflare_targets_file, repoRoot),
      repoRoot,
    ),
    cloudflare_targets_available: Boolean(targetsData),
    discovered_databases: rawPlans.length,
    databases: selected,
  };
}

function validateCredentials(args) {
  const errors = [];
  const warnings = [];

  if (!args.require_credentials || args.dry_run || args.local) {
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

function validateDatabasePlan(plan, args, repoRoot) {
  const errors = [];
  const warnings = [];

  if (!plan.database_argument) {
    errors.push(
      "Missing D1 database argument. Set binding, database_name, or database_id.",
    );
  }

  if (plan.config_file && !isFile(resolvePath(plan.config_file, repoRoot))) {
    errors.push(`Wrangler config file does not exist: ${plan.config_file}`);
  }

  if (!plan.config_file) {
    warnings.push(
      "No Wrangler config file is configured. Wrangler must infer D1 configuration from the working directory.",
    );
  }

  if (!plan.migrations_discovered.length && !plan.allow_empty) {
    errors.push("No D1 migration files were discovered.");
  }

  if (plan.local && plan.remote) {
    errors.push("Plan cannot run both local and remote D1 migrations.");
  }

  if (args.max_migrations > 0 && plan.apply_migrations) {
    warnings.push(
      "max_migrations limits the report's local migration discovery, but Wrangler applies migrations according to its configured migrations_dir.",
    );
  }

  const ids = new Set();
  const duplicateIds = new Set();

  for (const migration of plan.migrations_discovered) {
    if (ids.has(migration.id)) duplicateIds.add(migration.id);
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

function wranglerScopeArgs(plan, repoRoot) {
  const scope = [];

  if (plan.config_file) {
    scope.push("--config", resolvePath(plan.config_file, repoRoot));
  }

  if (plan.wrangler_environment && plan.has_config_environment) {
    scope.push("--env", plan.wrangler_environment);
  }

  if (plan.remote) {
    scope.push("--remote");
  }

  if (plan.local) {
    scope.push("--local");
  }

  if (plan.preview) {
    scope.push("--preview");
  }

  return scope;
}

function runWrangler(args, repoRoot, wranglerPrefix, wranglerArgs) {
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
      signal: null,
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
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

function parseMigrationList(stdout) {
  const parsed = safeJsonParse(stdout, null);

  if (parsed) {
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.result)
        ? parsed.result
        : Array.isArray(parsed.migrations)
          ? parsed.migrations
          : Array.isArray(parsed.applied_migrations)
            ? parsed.applied_migrations
            : [];

    return rows
      .map((item) => {
        if (typeof item === "string") {
          return {
            id: item.replace(/\.sql$/i, ""),
            filename: item,
            applied_at: "",
          };
        }

        const name =
          item.name ||
          item.id ||
          item.migration ||
          item.migration_name ||
          item.filename ||
          item.file ||
          item.version ||
          "";

        return {
          id: normalizeString(name).replace(/\.sql$/i, ""),
          filename: normalizeString(item.filename || item.file || name),
          applied_at: normalizeString(
            item.applied_at ||
              item.appliedAt ||
              item.created_at ||
              item.createdAt,
          ),
        };
      })
      .filter((item) => item.id)
      .sort((left, right) => naturalCompare(left.id, right.id));
  }

  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\.sql\b/i.test(line) || /^\d+[_-]/.test(line))
    .map((line) => {
      const match = line.match(/([A-Za-z0-9_.-]+\.sql|[0-9][A-Za-z0-9_.-]+)/);
      const filename = match ? match[1] : line;

      return {
        id: filename.replace(/\.sql$/i, ""),
        filename,
        applied_at: "",
      };
    })
    .filter((item) => item.id)
    .sort((left, right) => naturalCompare(left.id, right.id));
}

function listD1Migrations(plan, args, repoRoot, wranglerPrefix) {
  if (!plan.list_remote) {
    return {
      status: "skipped",
      success: true,
      command: null,
      rows: [],
      error: "",
    };
  }

  const command = runWrangler(args, repoRoot, wranglerPrefix, [
    "d1",
    "migrations",
    "list",
    plan.database_argument,
    ...wranglerScopeArgs(plan, repoRoot),
    "--json",
  ]);

  if (!command.success) {
    return {
      status: "failed",
      success: false,
      command: {
        display: command.display,
        status: command.status,
        exit_code: command.exit_code,
        duration_ms: command.duration_ms,
      },
      rows: [],
      error: command.error || command.stderr || "Failed to list D1 migrations.",
    };
  }

  return {
    status: args.dry_run ? "planned" : "listed",
    success: true,
    command: {
      display: command.display,
      status: command.status,
      exit_code: command.exit_code,
      duration_ms: command.duration_ms,
    },
    rows: parseMigrationList(command.stdout),
    error: "",
  };
}

function applyD1Migrations(plan, args, repoRoot, wranglerPrefix) {
  if (!plan.apply_migrations) {
    return {
      status: "skipped",
      success: true,
      command: null,
      error: "",
    };
  }

  const command = runWrangler(args, repoRoot, wranglerPrefix, [
    "d1",
    "migrations",
    "apply",
    plan.database_argument,
    ...wranglerScopeArgs(plan, repoRoot),
    "--yes",
  ]);

  if (!command.success) {
    return {
      status: "failed",
      success: false,
      command: {
        display: command.display,
        status: command.status,
        exit_code: command.exit_code,
        duration_ms: command.duration_ms,
      },
      stdout_preview: command.stdout.slice(0, 4000),
      stderr_preview: command.stderr.slice(0, 4000),
      error:
        command.error || command.stderr || "Failed to apply D1 migrations.",
    };
  }

  return {
    status: args.dry_run ? "planned" : "applied",
    success: true,
    command: {
      display: command.display,
      status: command.status,
      exit_code: command.exit_code,
      duration_ms: command.duration_ms,
    },
    stdout_preview: command.stdout.slice(0, 4000),
    stderr_preview: command.stderr.slice(0, 4000),
    error: "",
  };
}

function compareMigrations(localMigrations, remoteRows) {
  const localById = new Map(
    localMigrations.map((migration) => [migration.id, migration]),
  );
  const remoteById = new Map(
    remoteRows.map((migration) => [migration.id, migration]),
  );

  const applied = [];
  const pending = [];
  const remoteOnly = [];

  for (const migration of localMigrations) {
    const remote = remoteById.get(migration.id);

    if (!remote) {
      pending.push(migration);
      continue;
    }

    applied.push({
      ...migration,
      applied_at: remote.applied_at || "",
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
    remote_only: remoteOnly,
  };
}

async function runDatabaseMigrations(plan, args, repoRoot, wranglerPrefix) {
  const startedAt = new Date();
  const validation = validateDatabasePlan(plan, args, repoRoot);

  const result = {
    id: plan.id,
    source_type: plan.source_type,
    target_name: plan.target_name,
    target_id: plan.target_id,
    target_config: plan.config_file,
    root: plan.root,
    environment: plan.environment,
    wrangler_environment: plan.wrangler_environment,
    database_name: plan.database_name,
    database_id: plan.database_id,
    binding: plan.binding,
    database_argument: plan.database_argument,
    mode: plan.remote ? "remote" : plan.local ? "local" : "default",
    preview: plan.preview,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    local_migrations: plan.migrations_discovered.map((migration) => ({
      id: migration.id,
      filename: migration.filename,
      file: migration.file,
      checksum: migration.checksum,
      bytes: migration.bytes,
    })),
    remote_migrations: [],
    comparison: {
      applied: [],
      pending: [],
      remote_only: [],
    },
    list_result: null,
    apply_result: null,
    errors: [],
    warnings: [...validation.warnings],
    totals: {
      local_migrations: plan.migrations_discovered.length,
      remote_applied: 0,
      already_applied: 0,
      pending: 0,
      remote_only: 0,
      applied_command_ran: 0,
      failed: 0,
    },
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    const listResult = listD1Migrations(plan, args, repoRoot, wranglerPrefix);
    result.list_result = listResult;

    if (!listResult.success) {
      result.status = "failed";
      result.errors.push(listResult.error);
      return result;
    }

    result.remote_migrations = listResult.rows;
    result.totals.remote_applied = listResult.rows.length;

    const comparison = compareMigrations(
      plan.migrations_discovered,
      listResult.rows,
    );

    result.comparison = {
      applied: comparison.applied.map((migration) => ({
        id: migration.id,
        filename: migration.filename,
        file: migration.file,
        checksum: migration.checksum,
        applied_at: migration.applied_at,
      })),
      pending: comparison.pending.map((migration) => ({
        id: migration.id,
        filename: migration.filename,
        file: migration.file,
        checksum: migration.checksum,
        bytes: migration.bytes,
      })),
      remote_only: comparison.remote_only,
    };

    result.totals.already_applied = comparison.applied.length;
    result.totals.pending = comparison.pending.length;
    result.totals.remote_only = comparison.remote_only.length;

    if (comparison.remote_only.length) {
      const message = `${comparison.remote_only.length} remote D1 migration(s) are missing locally.`;

      if (plan.fail_on_missing_local) {
        result.status = "missing-local";
        result.errors.push(message);
        return result;
      }

      result.warnings.push(message);
    }

    if (!plan.apply_migrations) {
      result.status = comparison.pending.length ? "pending" : "current";
      result.success = true;
      return result;
    }

    if (!comparison.pending.length && listResult.status !== "skipped") {
      result.status = "current";
      result.success = true;
      return result;
    }

    const applyResult = applyD1Migrations(plan, args, repoRoot, wranglerPrefix);
    result.apply_result = applyResult;
    result.totals.applied_command_ran =
      applyResult.status === "applied" || applyResult.status === "planned"
        ? 1
        : 0;

    if (!applyResult.success) {
      result.status = "failed";
      result.totals.failed = 1;
      result.errors.push(applyResult.error);
      return result;
    }

    result.status = args.dry_run ? "planned" : "migrated";
    result.success = true;
    return result;
  } catch (err) {
    result.status = "failed";
    result.totals.failed = 1;
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

async function executePlans(plans, args, repoRoot) {
  const credentials = validateCredentials(args);
  const wrangler = createWranglerPrefix(args, repoRoot);
  const results = [];
  let stoppedEarly = false;

  if (!credentials.ok) {
    return {
      credentials,
      wrangler,
      results,
      stopped_early: false,
      blocked: true,
      block_reason: credentials.errors.join("; "),
    };
  }

  for (const plan of plans.databases) {
    logger.info(
      `${args.dry_run ? "Planning" : "Running"} D1 migrations for ${
        plan.binding ||
        plan.database_name ||
        plan.database_id ||
        plan.database_argument
      }.`,
    );

    const result = await runDatabaseMigrations(plan, args, repoRoot, wrangler);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first failed D1 migration plan.");
      break;
    }
  }

  return {
    credentials,
    wrangler,
    results,
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
    pending: results.filter((result) => result.status === "pending").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
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
    pending_migrations: results.reduce(
      (sum, result) => sum + result.totals.pending,
      0,
    ),
    remote_only: results.reduce(
      (sum, result) => sum + result.totals.remote_only,
      0,
    ),
    apply_commands: results.reduce(
      (sum, result) => sum + result.totals.applied_command_ran,
      0,
    ),
    migration_failures: results.reduce(
      (sum, result) => sum + result.totals.failed,
      0,
    ),
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok:
      results.every((result) => result.success) &&
      results.every((result) => result.totals.failed === 0),
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
        pending: 0,
        failed: 0,
        invalid: 0,
        local_migrations: 0,
        pending_migrations: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "current") groups[group].current += 1;
    if (result.status === "migrated") groups[group].migrated += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "pending") groups[group].pending += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    groups[group].local_migrations += result.totals.local_migrations;
    groups[group].pending_migrations += result.totals.pending;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results);
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0 || totals.migration_failures > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : totals.missing_local > 0
          ? "missing-local"
          : execution.results.length === 0
            ? "empty"
            : args.dry_run
              ? "planned"
              : totals.migrated > 0
                ? "migrated"
                : totals.pending > 0
                  ? "pending"
                  : "current";

  return {
    schema_version: 1,
    type: "cloudflare-d1-migrations",
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
      remote: args.remote,
      local: args.local,
      preview: args.preview,
      list_remote: args.list_remote,
      apply_migrations: args.apply_migrations,
      require_credentials: args.require_credentials,
      require_account_id: args.require_account_id,
      fail_on_missing_local: args.fail_on_missing_local,
      allow_empty: args.allow_empty,
      max_databases: args.max_databases,
      max_migrations: args.max_migrations,
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
      discovered_databases: plans.discovered_databases,
      selected_databases: plans.databases.length,
    },
    selected_databases: plans.databases.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      target_name: plan.target_name,
      target_config: plan.config_file,
      environment: plan.environment,
      wrangler_environment: plan.wrangler_environment,
      database_name: plan.database_name,
      database_id: plan.database_id,
      binding: plan.binding,
      database_argument: plan.database_argument,
      migrations: plan.migrations,
      migrations_discovered: plan.migrations_discovered.length,
      remote: plan.remote,
      local: plan.local,
      preview: plan.preview,
      apply_migrations: plan.apply_migrations,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_target: groupResults(execution.results, "target_name"),
      by_mode: groupResults(execution.results, "mode"),
    },
    results: execution.results,
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
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
    `# 🗃️ ${PROJECT_NAME} Cloudflare D1 Migrations`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Environment: \`${report.config.environment}\``,
    `- Mode: \`${report.config.remote ? "remote" : report.config.local ? "local" : "default"}\``,
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
    `- Selected databases: \`${report.discovery.selected_databases}\``,
    `- Current: \`${report.totals.current}\``,
    `- Migrated: \`${report.totals.migrated}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Pending databases: \`${report.totals.pending}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Local migrations: \`${report.totals.local_migrations}\``,
    `- Remote applied: \`${report.totals.remote_applied}\``,
    `- Already applied: \`${report.totals.already_applied}\``,
    `- Pending migrations: \`${report.totals.pending_migrations}\``,
    `- Remote-only migrations: \`${report.totals.remote_only}\``,
    `- Apply commands: \`${report.totals.apply_commands}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Databases");
  lines.push("");

  if (!report.selected_databases.length) {
    lines.push("No D1 database migration plans were selected.");
  } else {
    lines.push(
      "| Database | Binding | Target | Config | Migrations | Mode | Apply |",
    );
    lines.push("|---|---|---|---|---:|---|---:|");

    for (const database of report.selected_databases) {
      lines.push(
        `| \`${database.database_name || database.database_id || database.database_argument || "unknown"}\` | \`${database.binding || "none"}\` | \`${database.target_name || "none"}\` | \`${database.target_config || "none"}\` | \`${database.migrations_discovered}\` | \`${database.remote ? "remote" : database.local ? "local" : "default"}\` | \`${database.apply_migrations ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Database Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No D1 migration results were produced.");
  } else {
    lines.push(
      "| Status | Database | Binding | Local | Remote Applied | Pending | Remote Only | Duration |",
    );
    lines.push("|---|---|---|---:|---:|---:|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.database_name || result.database_id || result.database_argument || "unknown"}\` | \`${result.binding || "none"}\` | \`${result.totals.local_migrations}\` | \`${result.totals.remote_applied}\` | \`${result.totals.pending}\` | \`${result.totals.remote_only}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  const pending = report.results.flatMap((result) =>
    result.comparison.pending.map((migration) => ({
      database:
        result.database_name || result.binding || result.database_argument,
      ...migration,
    })),
  );

  if (pending.length) {
    lines.push("");
    lines.push("## ⏳ Pending Local Migrations");
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

  const remoteOnly = report.results.flatMap((result) =>
    result.comparison.remote_only.map((migration) => ({
      database:
        result.database_name || result.binding || result.database_argument,
      ...migration,
    })),
  );

  if (remoteOnly.length) {
    lines.push("");
    lines.push("## ⚠️ Remote-Only Migrations");
    lines.push("");
    lines.push("| Database | Migration | Applied At |");
    lines.push("|---|---|---|");

    for (const migration of remoteOnly.slice(0, 100)) {
      lines.push(
        `| \`${migration.database}\` | \`${migration.id}\` | \`${migration.applied_at || "unknown"}\` |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Database | Binding | Status | Errors |");
    lines.push("|---|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.database_name || failure.database_argument || "unknown"}\` | \`${failure.binding || "none"}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = [
    ...report.credentials.warnings,
    ...report.results.flatMap((result) =>
      result.warnings.map((warning) => ({
        database:
          result.database_name ||
          result.binding ||
          result.database_argument ||
          "unknown",
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
        lines.push(`- \`${warning.database}\`: ${warning.warning}`);
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
  lines.push(
    `- List remote: \`${report.config.list_remote ? "true" : "false"}\``,
  );
  lines.push(
    `- Apply migrations: \`${report.config.apply_migrations ? "true" : "false"}\``,
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
  setGitHubOutput("cloudflare_d1_migrations_file", report.config.output_file);
  setGitHubOutput(
    "cloudflare_d1_migrations_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_d1_migrations_status", report.status);
  setGitHubOutput(
    "cloudflare_d1_migrations_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_environment",
    report.config.environment,
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_mode",
    report.config.remote ? "remote" : report.config.local ? "local" : "default",
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_databases",
    String(report.totals.databases),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_current",
    String(report.totals.current),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_migrated",
    String(report.totals.migrated),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_planned",
    String(report.totals.planned),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_failed",
    String(report.totals.failed),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_local",
    String(report.totals.local_migrations),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_pending",
    String(report.totals.pending_migrations),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_remote_only",
    String(report.totals.remote_only),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_database_names",
    report.selected_databases
      .map(
        (database) =>
          database.database_name ||
          database.binding ||
          database.database_id ||
          database.database_argument,
      )
      .join(","),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_database_names_json",
    JSON.stringify(
      report.selected_databases.map(
        (database) =>
          database.database_name ||
          database.binding ||
          database.database_id ||
          database.database_argument,
      ),
    ),
  );
  setGitHubOutput(
    "cloudflare_d1_migrations_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Cloudflare D1 migrations.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.databases.length === 0) {
    logger.error("No Cloudflare D1 migration database plans were selected.");
    process.exitCode = 1;
  }

  if (
    !args.allow_empty &&
    plans.databases.every((plan) => plan.migrations_discovered.length === 0)
  ) {
    logger.error("No Cloudflare D1 migration files were discovered.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          credentials: validateCredentials(args),
          wrangler: createWranglerPrefix(args, repoRoot),
          results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
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

  if (args.fail_on_error && report.blocked) {
    logger.error(`Cloudflare D1 migrations blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Cloudflare D1 migrations completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}, migration_failures=${report.totals.migration_failures}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
