#!/usr/bin/env node
// .github/scripts/npm/publish-packages.js
// =============================================================================
// Aerealith AI — NPM Package Publisher
// -----------------------------------------------------------------------------
// Purpose:
//   Publish selected npm packages from package discovery artifacts, pack reports,
//   direct package paths, or tarball inputs.
//
// Input:
//   - .github/npm/publish-packages.json
//   - .github/npm/publish-packages.jsonc
//   - .github/npm/publish-packages.yaml
//   - .github/npm/publish-packages.yml
//   - .github/npm/packages.json
//   - artifacts/ci/npm-packages.json
//   - artifacts/npm/pack-packages.json
//
// Output:
//   - artifacts/npm/publish-packages.json
//   - artifacts/npm/publish-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses npm, pnpm, yarn, or bun based on inputs / lockfiles.
//   - Prefer publishing packed .tgz tarballs when available.
//   - Dry-run mode reports commands without publishing.
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
    info: (message) => console.log(`[npm-publish] ${message}`),
    warn: (message) => console.warn(`[npm-publish] WARN: ${message}`),
    error: (message) => console.error(`[npm-publish] ERROR: ${message}`),
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
  ".github/npm/publish-packages.json",
  ".github/npm/publish-packages.jsonc",
  ".github/npm/publish-packages.yaml",
  ".github/npm/publish-packages.yml",
  ".github/npm/packages.json",
  ".github/npm/packages.jsonc",
  ".github/npm/packages.yaml",
  ".github/npm/packages.yml",
  "npm/publish-packages.json",
  "npm/publish-packages.jsonc",
  "npm/publish-packages.yaml",
  "npm/publish-packages.yml",
  "npm/packages.json",
  "npm/packages.jsonc",
  "npm/packages.yaml",
  "npm/packages.yml",
];

const DEFAULT_PACKAGES_FILE = "artifacts/ci/npm-packages.json";
const DEFAULT_PACK_REPORT_FILE = "artifacts/npm/pack-packages.json";
const DEFAULT_OUTPUT_FILE = "artifacts/npm/publish-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/npm/publish-packages.md";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const DEFAULT_ACCESS = "public";
const DEFAULT_TAG = "latest";
const DEFAULT_PACKAGE_MANAGER = "auto";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|\/\/registry\.npmjs\.org\/:_authToken=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|--\/\/[^=]+:_authToken\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    config_file: process.env.NPM_PUBLISH_PACKAGES_CONFIG_FILE || "",
    packages_file:
      process.env.NPM_PUBLISH_PACKAGES_PACKAGES_FILE || DEFAULT_PACKAGES_FILE,
    pack_report_file:
      process.env.NPM_PUBLISH_PACKAGES_PACK_REPORT_FILE ||
      DEFAULT_PACK_REPORT_FILE,

    output_file:
      process.env.NPM_PUBLISH_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.NPM_PUBLISH_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    package_name:
      process.env.NPM_PUBLISH_PACKAGE_NAME ||
      process.env.NPM_PACKAGE_NAME ||
      "",
    package_path:
      process.env.NPM_PUBLISH_PACKAGE_PATH ||
      process.env.NPM_PACKAGE_PATH ||
      "",
    package_json:
      process.env.NPM_PUBLISH_PACKAGE_JSON ||
      process.env.NPM_PACKAGE_JSON ||
      "",
    tarball:
      process.env.NPM_PUBLISH_TARBALL || process.env.NPM_PACKAGE_TARBALL || "",

    registry:
      process.env.NPM_PUBLISH_PACKAGES_REGISTRY ||
      process.env.NPM_CONFIG_REGISTRY ||
      DEFAULT_REGISTRY,
    access:
      process.env.NPM_PUBLISH_PACKAGES_ACCESS ||
      process.env.NPM_CONFIG_ACCESS ||
      DEFAULT_ACCESS,
    tag:
      process.env.NPM_PUBLISH_PACKAGES_TAG ||
      process.env.NPM_CONFIG_TAG ||
      DEFAULT_TAG,
    otp:
      process.env.NPM_PUBLISH_PACKAGES_OTP || process.env.NPM_CONFIG_OTP || "",

    package_manager:
      process.env.NPM_PUBLISH_PACKAGES_PACKAGE_MANAGER ||
      process.env.PACKAGE_MANAGER ||
      DEFAULT_PACKAGE_MANAGER,

    npm_token:
      process.env.NPM_PUBLISH_PACKAGES_TOKEN ||
      process.env.NPM_TOKEN ||
      process.env.NODE_AUTH_TOKEN ||
      "",

    include_packages: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_EXCLUDE_PROJECTS,
    ),
    include_paths: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.NPM_PUBLISH_PACKAGES_EXCLUDE_PATHS,
    ),

    publish_publishable_only: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_PUBLISHABLE_ONLY,
      true,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    include_invalid: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_INCLUDE_INVALID,
      false,
    ),

    use_config: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_USE_CONFIG,
      true,
    ),
    use_packages_file: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_USE_PACKAGES_FILE,
      true,
    ),
    use_pack_report: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_USE_PACK_REPORT,
      true,
    ),
    prefer_tarballs: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_PREFER_TARBALLS,
      true,
    ),

    publish: normalizeBoolean(process.env.NPM_PUBLISH_PACKAGES_PUBLISH, true),
    provenance: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_PROVENANCE,
      true,
    ),
    require_token: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_REQUIRE_TOKEN,
      true,
    ),
    require_tarball: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_REQUIRE_TARBALL,
      false,
    ),
    verify_before_publish: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_VERIFY_BEFORE,
      true,
    ),
    verify_after_publish: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_VERIFY_AFTER,
      false,
    ),
    skip_existing: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_SKIP_EXISTING,
      false,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_CONTINUE_ON_ERROR,
      false,
    ),

    max_packages: normalizeInteger(
      process.env.NPM_PUBLISH_PACKAGES_MAX_PACKAGES,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.NPM_PUBLISH_PACKAGES_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.NPM_PUBLISH_PACKAGES_MAX_BUFFER_MB,
      128,
    ),

    dry_run: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.NPM_PUBLISH_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_PUBLISH_PACKAGES_STEP_SUMMARY,
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

    if (arg === "--packages" || arg === "--packages-file") {
      args.packages_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--pack-report") {
      args.pack_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package" || arg === "--package-name") {
      args.package_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--path" || arg === "--package-path") {
      args.package_path = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-json") {
      args.package_json = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tarball") {
      args.tarball = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--registry") {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--access") {
      args.access = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--otp") {
      args.otp = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--token") {
      args.npm_token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-package") {
      args.include_packages.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "--exclude-package") {
      args.exclude_packages.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-project") {
      args.include_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-project") {
      args.exclude_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-path") {
      args.include_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-path") {
      args.exclude_paths.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--publishable-only") {
      args.publish_publishable_only = true;
      continue;
    }

    if (arg === "--no-publishable-only") {
      args.publish_publishable_only = false;
      continue;
    }

    if (arg === "--include-private") {
      args.include_private = true;
      continue;
    }

    if (arg === "--no-include-private") {
      args.include_private = false;
      continue;
    }

    if (arg === "--include-invalid") {
      args.include_invalid = true;
      continue;
    }

    if (arg === "--no-include-invalid") {
      args.include_invalid = false;
      continue;
    }

    if (arg === "--use-config") {
      args.use_config = true;
      continue;
    }

    if (arg === "--no-config") {
      args.use_config = false;
      continue;
    }

    if (arg === "--use-packages-file") {
      args.use_packages_file = true;
      continue;
    }

    if (arg === "--no-packages-file") {
      args.use_packages_file = false;
      continue;
    }

    if (arg === "--use-pack-report") {
      args.use_pack_report = true;
      continue;
    }

    if (arg === "--no-pack-report") {
      args.use_pack_report = false;
      continue;
    }

    if (arg === "--prefer-tarballs") {
      args.prefer_tarballs = true;
      continue;
    }

    if (arg === "--no-prefer-tarballs") {
      args.prefer_tarballs = false;
      continue;
    }

    if (arg === "--publish") {
      args.publish = true;
      continue;
    }

    if (arg === "--no-publish") {
      args.publish = false;
      continue;
    }

    if (arg === "--provenance") {
      args.provenance = true;
      continue;
    }

    if (arg === "--no-provenance") {
      args.provenance = false;
      continue;
    }

    if (arg === "--require-token") {
      args.require_token = true;
      continue;
    }

    if (arg === "--no-require-token") {
      args.require_token = false;
      continue;
    }

    if (arg === "--require-tarball") {
      args.require_tarball = true;
      continue;
    }

    if (arg === "--no-require-tarball") {
      args.require_tarball = false;
      continue;
    }

    if (arg === "--verify-before") {
      args.verify_before_publish = true;
      continue;
    }

    if (arg === "--no-verify-before") {
      args.verify_before_publish = false;
      continue;
    }

    if (arg === "--verify-after") {
      args.verify_after_publish = true;
      continue;
    }

    if (arg === "--no-verify-after") {
      args.verify_after_publish = false;
      continue;
    }

    if (arg === "--skip-existing") {
      args.skip_existing = true;
      continue;
    }

    if (arg === "--no-skip-existing") {
      args.skip_existing = false;
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

    if (arg === "--max-packages") {
      args.max_packages = normalizeInteger(argv[index + 1], args.max_packages);
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

  args.registry = normalizeRegistry(args.registry);
  args.access = normalizeString(args.access, DEFAULT_ACCESS);
  args.tag = normalizeTag(args.tag || DEFAULT_TAG) || DEFAULT_TAG;
  args.package_manager = normalizeString(
    args.package_manager,
    DEFAULT_PACKAGE_MANAGER,
  ).toLowerCase();
  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.include_paths = [...new Set(args.include_paths)];
  args.exclude_paths = [...new Set(args.exclude_paths)];
  args.max_packages = Math.max(0, args.max_packages);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Publisher

Usage:
  node .github/scripts/npm/publish-packages.js [options]

Examples:
  node .github/scripts/npm/publish-packages.js --dry-run
  node .github/scripts/npm/publish-packages.js --packages artifacts/ci/npm-packages.json
  node .github/scripts/npm/publish-packages.js --pack-report artifacts/npm/pack-packages.json
  node .github/scripts/npm/publish-packages.js --tarball artifacts/npm/packages/aerealith-ai-core-1.0.0.tgz
  node .github/scripts/npm/publish-packages.js --package @aerealith-ai/core --path libs/core

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Publish config file.
      --packages <file>                    npm package discovery artifact.
      --pack-report <file>                 npm pack report artifact.
      --package <name>                     Direct package name.
      --path <dir>                         Direct package path.
      --package-json <file>                Direct package.json path.
      --tarball <file>                     Direct package tarball.
      --registry <url>                     npm registry. Default: https://registry.npmjs.org/.
      --access <public|restricted>         Publish access. Default: public.
      --tag <tag>                          npm dist-tag. Default: latest.
      --otp <code>                         npm one-time password.
      --token <token>                      npm auth token.
      --package-manager <auto|npm|pnpm|yarn|bun>
      --include <list>                     Include package names.
      --exclude <list>                     Exclude package names.
      --include-project <list>             Include project names.
      --exclude-project <list>             Exclude project names.
      --include-path <list>                Include package path patterns.
      --exclude-path <pattern>             Exclude package path pattern.
      --publishable-only                   Publish only publishable packages. Default.
      --no-publishable-only                Allow non-publishable selected packages.
      --include-private                    Include private packages.
      --include-invalid                    Include invalid package records.
      --use-config                         Use publish config. Default.
      --no-config                          Ignore publish config.
      --use-packages-file                  Use package discovery artifact. Default.
      --no-packages-file                   Ignore package discovery artifact.
      --use-pack-report                    Use pack report artifact. Default.
      --no-pack-report                     Ignore pack report artifact.
      --prefer-tarballs                    Prefer packed tarballs. Default.
      --no-prefer-tarballs                 Publish from package directories.
      --publish                            Run publish command. Default.
      --no-publish                         Plan only; do not publish.
      --provenance                         Request npm provenance. Default.
      --no-provenance                      Do not request provenance.
      --require-token                      Require NPM_TOKEN/NODE_AUTH_TOKEN. Default.
      --no-require-token                   Do not require token.
      --require-tarball                    Require a tarball for each package.
      --verify-before                      Run npm view before publishing. Default.
      --verify-after                       Run npm view after publishing.
      --skip-existing                      Skip package versions already on registry.
      --fail-if-empty                      Exit non-zero if no packages are selected.
      --fail-on-error                      Exit non-zero on publish failure. Default.
      --no-fail-on-error                   Do not fail when publish fails.
      --continue-on-error                  Continue after a package fails.
      --max-packages <number>              Maximum packages to publish.
      --timeout-minutes <number>           Per command timeout. Default: 20.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not publish.
      --no-print                           Do not print JSON report.
      --no-step-summary                    Do not append GitHub step summary.
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

function readPackageJson(packageJsonPath, repoRoot) {
  const absolutePath = resolvePath(packageJsonPath, repoRoot);

  if (!isFile(absolutePath)) return null;

  return safeJsonParse(fs.readFileSync(absolutePath, "utf8"), null);
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

function parseSimplePublishYaml(text) {
  const config = {};
  const packages = [];
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

      if (
        section === "packages" ||
        section === "npm_packages" ||
        section === "publish"
      ) {
        config.packages = packages;
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
      (section === "packages" ||
        section === "npm_packages" ||
        section === "publish") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      packages.push(current);

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
    return parseSimplePublishYaml(text);
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

function shouldIncludePath(relativePath, patterns) {
  if (!patterns.length) return true;

  return patterns.some((pattern) => matchesPattern(relativePath, pattern));
}

function normalizeRegistry(value) {
  const registry = normalizeString(value, DEFAULT_REGISTRY);

  if (!registry) return DEFAULT_REGISTRY;

  return registry.endsWith("/") ? registry : `${registry}/`;
}

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeTag(value) {
  return normalizeString(value, DEFAULT_TAG)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

function safeId(value) {
  return (
    normalizeString(value, "npm-publish")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/@-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "npm-publish"
  );
}

function packageManagerFromRepo(repoRoot) {
  if (
    isFile(resolvePath("pnpm-lock.yaml", repoRoot)) ||
    isFile(resolvePath("pnpm-workspace.yaml", repoRoot))
  ) {
    return "pnpm";
  }

  if (isFile(resolvePath("yarn.lock", repoRoot))) {
    return "yarn";
  }

  if (isFile(resolvePath("bun.lockb", repoRoot))) {
    return "bun";
  }

  if (isFile(resolvePath("package-lock.json", repoRoot))) {
    return "npm";
  }

  return "npm";
}

function resolvePackageManager(requested, repoRoot) {
  const value = normalizeString(
    requested,
    DEFAULT_PACKAGE_MANAGER,
  ).toLowerCase();

  if (value === "auto") return packageManagerFromRepo(repoRoot);

  return value;
}

function packageRecordsFromConfig(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.publish) ? config.publish : []),
    ...(Array.isArray(config.packages) ? config.packages : []),
    ...(Array.isArray(config.npm_packages) ? config.npm_packages : []),
    ...(Array.isArray(config.npmPackages) ? config.npmPackages : []),
  ];

  if (config.package && typeof config.package === "object") {
    records.push(config.package);
  }

  if (
    !records.length &&
    (config.name ||
      config.path ||
      config.package_json ||
      config.packageJson ||
      config.tarball)
  ) {
    records.push(config);
  }

  return records;
}

function packageRecordsFromArtifact(artifact) {
  if (!artifact) return [];

  return [
    ...(Array.isArray(artifact.publishable_packages)
      ? artifact.publishable_packages
      : []),
    ...(Array.isArray(artifact.packages) ? artifact.packages : []),
    ...(Array.isArray(artifact.npm_packages) ? artifact.npm_packages : []),
    ...(Array.isArray(artifact.publish_matrix?.include)
      ? artifact.publish_matrix.include
      : []),
    ...(Array.isArray(artifact.matrix?.include) ? artifact.matrix.include : []),
  ];
}

function packageRecordsFromPackReport(packReport) {
  if (!packReport) return [];

  const byPackage = new Map();

  for (const result of Array.isArray(packReport.results)
    ? packReport.results
    : []) {
    const key = result.name || result.package_json || result.path;

    if (!key) continue;

    byPackage.set(key, {
      name: result.name,
      version: result.version,
      project: result.project,
      package_json: result.package_json,
      path: result.path,
      private: result.private,
      publishable: result.publishable,
      valid: result.validation?.ok !== false && result.status !== "invalid",
      status: result.status,
      tarballs: Array.isArray(result.tarballs) ? result.tarballs : [],
      source_type: "pack-report-result",
    });
  }

  for (const tarball of Array.isArray(packReport.tarballs)
    ? packReport.tarballs
    : []) {
    const key =
      tarball.package || tarball.name || tarball.file || tarball.filename;

    if (!key) continue;

    if (!byPackage.has(key)) {
      byPackage.set(key, {
        name: tarball.package || tarball.name,
        version: tarball.version,
        project: tarball.project,
        path: "",
        package_json: "",
        private: false,
        publishable: true,
        valid: true,
        tarballs: [],
        source_type: "pack-report-tarball",
      });
    }

    byPackage.get(key).tarballs.push(tarball);
  }

  return [...byPackage.values()];
}

function directRecord(args) {
  if (
    !args.package_name &&
    !args.package_path &&
    !args.package_json &&
    !args.tarball
  )
    return null;

  return {
    name: args.package_name,
    path:
      args.package_path ||
      (args.package_json ? path.dirname(args.package_json) : "."),
    package_json:
      args.package_json ||
      (args.package_path ? path.join(args.package_path, "package.json") : ""),
    tarball: args.tarball,
    publishable: true,
    private: false,
    valid: true,
    source_type: "direct",
  };
}

function firstExistingTarball(tarballs, repoRoot) {
  for (const tarball of tarballs) {
    const candidate =
      tarball.absolute_file || tarball.file || tarball.path || tarball.filename;

    if (!candidate) continue;

    const absolutePath = resolvePath(candidate, repoRoot);

    if (isFile(absolutePath)) {
      return toRelativePath(absolutePath, repoRoot);
    }
  }

  return "";
}

function normalizePackagePlan(record, args, repoRoot, sourceType = "artifact") {
  const packagePath = toPosixPath(
    normalizeString(
      record.path ||
        record.root ||
        record.package_path ||
        record.packagePath ||
        ".",
    ),
  );

  const packageJsonPath = toPosixPath(
    normalizeString(
      record.package_json ||
        record.packageJson ||
        record.package_json_file ||
        record.packageJsonFile ||
        (packagePath ? path.join(packagePath, "package.json") : ""),
    ),
  );

  const packageJson = packageJsonPath
    ? readPackageJson(packageJsonPath, repoRoot) || {}
    : {};
  const tarballs = [
    ...normalizeStringList(record.tarball || record.tgz || ""),
    ...normalizeStringList(record.tarballs || []),
    ...normalizeStringList(record.tarball_file || record.tarballFile || ""),
    ...normalizeStringList(record.file || ""),
  ].map((item) => {
    if (typeof item === "string") {
      return {
        file: item,
      };
    }

    return item;
  });

  if (Array.isArray(record.tarballs)) {
    for (const tarball of record.tarballs) {
      if (typeof tarball === "object" && tarball) {
        tarballs.push(tarball);
      }
    }
  }

  const tarball = normalizeString(
    record.tarball || firstExistingTarball(tarballs, repoRoot),
  );
  const name = normalizePackageName(record.name || packageJson.name || "");
  const version = normalizeString(record.version || packageJson.version || "");
  const privatePackage = normalizeBoolean(
    record.private ?? packageJson.private,
    false,
  );
  const publishable = normalizeBoolean(
    record.publishable,
    !privatePackage && Boolean(name && version),
  );
  const valid = normalizeBoolean(
    record.valid,
    Boolean((name && version && packageJsonPath) || tarball),
  );
  const publishConfig = packageJson.publishConfig || {};

  const registry = normalizeRegistry(
    record.registry || publishConfig.registry || args.registry,
  );
  const access = normalizeString(
    record.access || publishConfig.access || args.access,
    args.access,
  );
  const tag = normalizeTag(
    record.tag ||
      record.default_tag ||
      record.defaultTag ||
      publishConfig.tag ||
      args.tag,
  );

  const errors = [];
  const warnings = [];

  if (!name && !tarball) errors.push("Package name is missing.");
  if (!version && !tarball) errors.push("Package version is missing.");

  if (packageJsonPath && !isFile(resolvePath(packageJsonPath, repoRoot))) {
    errors.push(`package.json does not exist: ${packageJsonPath}`);
  }

  if (
    packagePath &&
    !isDirectory(resolvePath(packagePath, repoRoot)) &&
    !tarball
  ) {
    errors.push(`Package path does not exist: ${packagePath}`);
  }

  if (tarball && !isFile(resolvePath(tarball, repoRoot))) {
    errors.push(`Package tarball does not exist: ${tarball}`);
  }

  if (!tarball && args.require_tarball) {
    errors.push("Package tarball is required but no tarball was found.");
  }

  if (privatePackage && !args.include_private) {
    warnings.push(
      "Package is private and is excluded unless include_private is enabled.",
    );
  }

  if (!publishable && args.publish_publishable_only) {
    warnings.push(
      "Package is not publishable and publishable-only mode is enabled.",
    );
  }

  return {
    id: safeId(`${sourceType}:${name || packageJsonPath || tarball}`),
    source_type: record.source_type || sourceType,
    name,
    version,
    project: normalizeString(
      record.project || record.project_name || record.projectName || name,
    ),
    package_json: packageJsonPath,
    path: packagePath,
    root: packagePath,
    tarball,
    publish_target:
      args.prefer_tarballs && tarball ? tarball : packagePath || tarball,
    package_manager: normalizeString(
      record.package_manager || record.packageManager || "",
      "",
    ),
    registry,
    access,
    tag,
    private: privatePackage,
    publishable,
    valid: valid && errors.length === 0,
    enabled: normalizeBoolean(record.enabled, true),
    provenance: normalizeBoolean(record.provenance, args.provenance),
    status_from_pack: normalizeString(record.status),
    errors: [
      ...new Set([
        ...(Array.isArray(record.errors) ? record.errors : []),
        ...errors,
      ]),
    ],
    warnings: [
      ...new Set([
        ...(Array.isArray(record.warnings) ? record.warnings : []),
        ...warnings,
      ]),
    ],
  };
}

function planMatchesFilters(plan, args) {
  if (!plan.enabled) return false;

  if (!args.include_private && plan.private) {
    return false;
  }

  if (!args.include_invalid && !plan.valid) {
    return false;
  }

  if (args.publish_publishable_only && !plan.publishable) {
    return false;
  }

  if (
    args.include_packages.length &&
    !args.include_packages.includes(plan.name)
  ) {
    return false;
  }

  if (args.exclude_packages.includes(plan.name)) {
    return false;
  }

  if (
    args.include_projects.length &&
    !args.include_projects.includes(plan.project)
  ) {
    return false;
  }

  if (args.exclude_projects.includes(plan.project)) {
    return false;
  }

  if (
    !shouldIncludePath(plan.package_json, args.include_paths) &&
    !shouldIncludePath(plan.path, args.include_paths) &&
    !shouldIncludePath(plan.tarball, args.include_paths)
  ) {
    return false;
  }

  if (
    shouldExcludePath(plan.package_json, args.exclude_paths) ||
    shouldExcludePath(plan.path, args.exclude_paths) ||
    shouldExcludePath(plan.tarball, args.exclude_paths)
  ) {
    return false;
  }

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = plan.name || plan.package_json || plan.tarball || plan.path;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...plan,
      source_type:
        existing.source_type === plan.source_type
          ? existing.source_type
          : `${existing.source_type}+${plan.source_type}`,
      publishable: existing.publishable || plan.publishable,
      valid: existing.valid && plan.valid,
      tarball: existing.tarball || plan.tarball,
      publish_target:
        existing.tarball ||
        plan.tarball ||
        existing.publish_target ||
        plan.publish_target,
      errors: [
        ...new Set([...(existing.errors || []), ...(plan.errors || [])]),
      ],
      warnings: [
        ...new Set([...(existing.warnings || []), ...(plan.warnings || [])]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (left.name || left.tarball).localeCompare(
      right.name || right.tarball,
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;
  const packageArtifact = args.use_packages_file
    ? readJsonFile(args.packages_file, repoRoot, null)
    : null;
  const packReport = args.use_pack_report
    ? readJsonFile(args.pack_report_file, repoRoot, null)
    : null;
  const direct = directRecord(args);

  const records = [
    ...(args.use_config
      ? packageRecordsFromConfig(config).map((record) => ({
          ...record,
          source_type: "config",
        }))
      : []),
    ...(args.use_packages_file
      ? packageRecordsFromArtifact(packageArtifact).map((record) => ({
          ...record,
          source_type: record.source_type || "package-artifact",
        }))
      : []),
    ...(args.use_pack_report ? packageRecordsFromPackReport(packReport) : []),
    ...(direct ? [direct] : []),
  ];

  const allPlans = dedupePlans(
    records.map((record) =>
      normalizePackagePlan(record, args, repoRoot, record.source_type),
    ),
  );
  const selected = allPlans
    .filter((plan) => planMatchesFilters(plan, args))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    packages_file: toRelativePath(
      resolvePath(args.packages_file, repoRoot),
      repoRoot,
    ),
    packages_available: Boolean(packageArtifact),
    pack_report_file: toRelativePath(
      resolvePath(args.pack_report_file, repoRoot),
      repoRoot,
    ),
    pack_report_available: Boolean(packReport),
    discovered_packages: allPlans.length,
    selected_packages: selected,
  };
}

function validatePlan(plan, args) {
  const errors = [...plan.errors];
  const warnings = [...plan.warnings];

  if (!plan.publish_target) errors.push("Publish target is missing.");
  if (!plan.name && !plan.tarball) errors.push("Package name is missing.");
  if (!plan.version && !plan.tarball)
    errors.push("Package version is missing.");

  if (!plan.publishable) {
    warnings.push("Package is not marked publishable.");
  }

  if (!args.publish) {
    warnings.push("Publish execution is disabled.");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
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

function createPublishCommand(plan, args, repoRoot) {
  const packageManager = resolvePackageManager(
    plan.package_manager || args.package_manager,
    repoRoot,
  );
  const publishTarget = plan.publish_target;
  const targetIsTarball = publishTarget && /\.tgz$/i.test(publishTarget);
  const resolvedTarget = publishTarget
    ? resolvePath(publishTarget, repoRoot)
    : "";
  const cwd = targetIsTarball
    ? repoRoot
    : resolvePath(plan.path || ".", repoRoot);

  const commandArgs = [];

  if (packageManager === "pnpm") {
    commandArgs.push("publish");

    if (targetIsTarball) commandArgs.push(resolvedTarget);
    commandArgs.push("--registry", plan.registry);
    commandArgs.push("--tag", plan.tag || args.tag);
    commandArgs.push("--access", plan.access || args.access);
    commandArgs.push("--no-git-checks");

    if (plan.provenance) commandArgs.push("--provenance");
    if (args.otp) commandArgs.push("--otp", args.otp);

    return {
      package_manager: "pnpm",
      command: "pnpm",
      args: commandArgs,
      cwd,
    };
  }

  if (packageManager === "yarn" && !targetIsTarball) {
    commandArgs.push("npm", "publish");
    commandArgs.push("--tag", plan.tag || args.tag);
    commandArgs.push("--access", plan.access || args.access);

    if (plan.registry) commandArgs.push("--publish-registries", plan.registry);
    if (args.otp) commandArgs.push("--otp", args.otp);

    return {
      package_manager: "yarn",
      command: "yarn",
      args: commandArgs,
      cwd,
    };
  }

  if (packageManager === "bun" && !targetIsTarball) {
    commandArgs.push("publish");
    commandArgs.push("--registry", plan.registry);
    commandArgs.push("--tag", plan.tag || args.tag);
    commandArgs.push("--access", plan.access || args.access);

    if (args.otp) commandArgs.push("--otp", args.otp);

    return {
      package_manager: "bun",
      command: "bun",
      args: commandArgs,
      cwd,
    };
  }

  commandArgs.push("publish");

  if (targetIsTarball) {
    commandArgs.push(resolvedTarget);
  }

  commandArgs.push("--registry", plan.registry);
  commandArgs.push("--tag", plan.tag || args.tag);
  commandArgs.push("--access", plan.access || args.access);

  if (plan.provenance) commandArgs.push("--provenance");
  if (args.otp) commandArgs.push("--otp", args.otp);

  return {
    package_manager: "npm",
    command: "npm",
    args: commandArgs,
    cwd,
  };
}

function createViewCommand(plan, args, repoRoot) {
  const name = plan.name;
  const version = plan.version;

  if (!name || !version) return null;

  return {
    package_manager: "npm",
    command: "npm",
    args: [
      "view",
      `${name}@${version}`,
      "version",
      "--registry",
      plan.registry,
    ],
    cwd: repoRoot,
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
        NPM_TOKEN: args.npm_token || process.env.NPM_TOKEN || "",
        NODE_AUTH_TOKEN:
          args.npm_token ||
          process.env.NODE_AUTH_TOKEN ||
          process.env.NPM_TOKEN ||
          "",
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
    package_manager: command.package_manager,
    status: command.status,
    success: command.success,
    exit_code: command.exit_code,
    duration_ms: command.duration_ms,
    error: redactOutput(command.error || ""),
    stdout_preview: redactOutput(command.stdout || "").slice(0, 4000),
    stderr_preview: redactOutput(command.stderr || "").slice(0, 4000),
  };
}

function isPackageAlreadyPublished(viewCommand) {
  if (!viewCommand) return false;
  if (!viewCommand.success) return false;

  return Boolean(String(viewCommand.stdout || "").trim());
}

function publishPackage(plan, args, repoRoot) {
  const startedAt = new Date();
  const validation = validatePlan(plan, args);

  const result = {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    version: plan.version,
    project: plan.project,
    package_json: plan.package_json,
    path: plan.path,
    tarball: plan.tarball,
    publish_target: plan.publish_target,
    registry: plan.registry,
    access: plan.access,
    tag: plan.tag,
    private: plan.private,
    publishable: plan.publishable,
    provenance: plan.provenance,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    verify_before_command: null,
    publish_command: null,
    verify_after_command: null,
    errors: [],
    warnings: validation.warnings,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    if (args.verify_before_publish || args.skip_existing) {
      const viewCommandRecord = createViewCommand(plan, args, repoRoot);

      if (viewCommandRecord) {
        viewCommandRecord.display = commandDisplay(
          viewCommandRecord.command,
          viewCommandRecord.args,
        );
        const viewCommand = runCommand(viewCommandRecord, args);
        result.verify_before_command = sanitizeCommand(viewCommand);

        if (viewCommand.success && isPackageAlreadyPublished(viewCommand)) {
          if (args.skip_existing) {
            result.status = args.dry_run ? "planned" : "skipped-existing";
            result.success = true;
            result.warnings.push(
              `${plan.name}@${plan.version} already exists on the registry.`,
            );
            return result;
          }

          result.warnings.push(
            `${plan.name}@${plan.version} appears to already exist on the registry.`,
          );
        }
      }
    }

    if (!args.publish) {
      result.status = args.dry_run ? "planned" : "skipped";
      result.success = true;
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Publishing"} npm package ${plan.name || plan.publish_target}.`,
    );

    const publishCommandRecord = createPublishCommand(plan, args, repoRoot);
    publishCommandRecord.display = commandDisplay(
      publishCommandRecord.command,
      publishCommandRecord.args,
    );

    const publishCommand = runCommand(publishCommandRecord, args);
    result.publish_command = sanitizeCommand(publishCommand);

    if (!publishCommand.success) {
      result.status = "failed";
      result.errors.push(
        publishCommand.error ||
          publishCommand.stderr ||
          `Failed to publish ${plan.name}.`,
      );
      return result;
    }

    if (args.verify_after_publish) {
      const verifyAfterRecord = createViewCommand(plan, args, repoRoot);

      if (verifyAfterRecord) {
        verifyAfterRecord.display = commandDisplay(
          verifyAfterRecord.command,
          verifyAfterRecord.args,
        );
        const verifyAfterCommand = runCommand(verifyAfterRecord, args);
        result.verify_after_command = sanitizeCommand(verifyAfterCommand);

        if (!verifyAfterCommand.success) {
          result.status = "failed";
          result.errors.push(
            verifyAfterCommand.error ||
              verifyAfterCommand.stderr ||
              `Failed to verify published package ${plan.name}@${plan.version}.`,
          );
          return result;
        }
      }
    }

    result.status = args.dry_run ? "planned" : "published";
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

async function executePlans(plans, args, repoRoot) {
  const results = [];
  let stoppedEarly = false;

  if (args.require_token && !args.dry_run && !args.npm_token) {
    return {
      results,
      stopped_early: false,
      blocked: true,
      block_reason: "Missing NPM_TOKEN or NODE_AUTH_TOKEN.",
    };
  }

  for (const plan of plans.selected_packages) {
    const result = publishPackage(plan, args, repoRoot);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first npm package publish failure.");
      break;
    }
  }

  return {
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
    packages: results.length,
    published: results.filter((result) => result.status === "published").length,
    planned: results.filter((result) => result.status === "planned").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    skipped_existing: results.filter(
      (result) => result.status === "skipped-existing",
    ).length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    tarballs: results.filter((result) => result.tarball).length,
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: results.every((result) => result.success),
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "none";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        published: 0,
        planned: 0,
        skipped: 0,
        skipped_existing: 0,
        failed: 0,
        invalid: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "published") groups[group].published += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "skipped") groups[group].skipped += 1;
    if (result.status === "skipped-existing")
      groups[group].skipped_existing += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
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
    : totals.failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : execution.results.length === 0
          ? "empty"
          : args.dry_run
            ? "planned"
            : totals.published > 0
              ? "published"
              : totals.skipped_existing > 0
                ? "skipped-existing"
                : "skipped";

  return {
    schema_version: 1,
    type: "npm-publish-packages",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      packages_file: plans.packages_file,
      packages_available: plans.packages_available,
      pack_report_file: plans.pack_report_file,
      pack_report_available: plans.pack_report_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      registry: args.registry,
      access: args.access,
      tag: args.tag,
      package_manager: args.package_manager,
      publishable_only: args.publish_publishable_only,
      include_private: args.include_private,
      include_invalid: args.include_invalid,
      prefer_tarballs: args.prefer_tarballs,
      publish: args.publish,
      provenance: args.provenance,
      require_token: args.require_token,
      require_tarball: args.require_tarball,
      verify_before_publish: args.verify_before_publish,
      verify_after_publish: args.verify_after_publish,
      skip_existing: args.skip_existing,
      max_packages: args.max_packages,
      dry_run: args.dry_run,
    },
    auth: {
      token_present: Boolean(args.npm_token),
      otp_present: Boolean(args.otp),
    },
    discovery: {
      discovered_packages: plans.discovered_packages,
      selected_packages: plans.selected_packages.length,
    },
    selected_packages: plans.selected_packages.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      name: plan.name,
      version: plan.version,
      project: plan.project,
      package_json: plan.package_json,
      path: plan.path,
      tarball: plan.tarball,
      publish_target: plan.publish_target,
      registry: plan.registry,
      access: plan.access,
      tag: plan.tag,
      private: plan.private,
      publishable: plan.publishable,
      valid: plan.valid,
      provenance: plan.provenance,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_project: groupResults(execution.results, "project"),
      by_registry: groupResults(execution.results, "registry"),
      by_tag: groupResults(execution.results, "tag"),
    },
    results: execution.results,
    published_packages: execution.results
      .filter((result) => result.status === "published")
      .map((result) => ({
        name: result.name,
        version: result.version,
        registry: result.registry,
        tag: result.tag,
        access: result.access,
      })),
    failures: execution.results.filter((result) => !result.success),
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
    `# 🚀 ${PROJECT_NAME} NPM Package Publish`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    `- Selected packages: \`${report.discovery.selected_packages}\``,
    `- Published: \`${report.totals.published}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Skipped existing: \`${report.totals.skipped_existing}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Publish Configuration",
    "",
    `- Registry: \`${report.config.registry}\``,
    `- Access: \`${report.config.access}\``,
    `- Tag: \`${report.config.tag}\``,
    `- Package manager: \`${report.config.package_manager}\``,
    `- Publish enabled: \`${report.config.publish ? "true" : "false"}\``,
    `- Provenance: \`${report.config.provenance ? "true" : "false"}\``,
    `- Prefer tarballs: \`${report.config.prefer_tarballs ? "true" : "false"}\``,
    `- Require tarball: \`${report.config.require_tarball ? "true" : "false"}\``,
    `- Skip existing: \`${report.config.skip_existing ? "true" : "false"}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Packages");
  lines.push("");

  if (!report.selected_packages.length) {
    lines.push("No npm packages were selected.");
  } else {
    lines.push("| Package | Version | Project | Target | Tag | Publishable |");
    lines.push("|---|---|---|---|---|---:|");

    for (const pkg of report.selected_packages) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.version || "none")}\` | \`${escapeMarkdown(pkg.project || "none")}\` | \`${escapeMarkdown(pkg.publish_target || "none")}\` | \`${escapeMarkdown(pkg.tag || "latest")}\` | \`${pkg.publishable ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Publish Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No package publish results were produced.");
  } else {
    lines.push("| Status | Package | Version | Registry | Tag | Duration |");
    lines.push("|---|---|---|---|---|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${escapeMarkdown(result.name || "unknown")}\` | \`${escapeMarkdown(result.version || "none")}\` | \`${escapeMarkdown(result.registry || "none")}\` | \`${escapeMarkdown(result.tag || "latest")}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.published_packages.length) {
    lines.push("");
    lines.push("## 📦 Published Packages");
    lines.push("");

    for (const pkg of report.published_packages) {
      lines.push(`- \`${pkg.name}@${pkg.version}\` using tag \`${pkg.tag}\``);
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Package | Status | Errors |");
    lines.push("|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${escapeMarkdown(failure.name || "unknown")}\` | \`${escapeMarkdown(failure.status)}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = report.results.flatMap((result) =>
    result.warnings.map((warning) => ({
      package: result.name || "unknown",
      warning,
    })),
  );

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings.slice(0, 100)) {
      lines.push(
        `- \`${escapeMarkdown(warning.package)}\`: ${escapeMarkdown(warning.warning)}`,
      );
    }

    if (warnings.length > 100) {
      lines.push(`- ...and \`${warnings.length - 100}\` more warning(s).`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Packages file: \`${report.config.packages_file}\``);
  lines.push(
    `- Packages available: \`${report.config.packages_available ? "true" : "false"}\``,
  );
  lines.push(`- Pack report: \`${report.config.pack_report_file}\``);
  lines.push(
    `- Pack report available: \`${report.config.pack_report_available ? "true" : "false"}\``,
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
  setGitHubOutput("npm_publish_packages_file", report.config.output_file);
  setGitHubOutput(
    "npm_publish_packages_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("npm_publish_packages_status", report.status);
  setGitHubOutput(
    "npm_publish_packages_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "npm_publish_packages_selected",
    String(report.discovery.selected_packages),
  );
  setGitHubOutput(
    "npm_publish_packages_published",
    String(report.totals.published),
  );
  setGitHubOutput(
    "npm_publish_packages_planned",
    String(report.totals.planned),
  );
  setGitHubOutput(
    "npm_publish_packages_skipped_existing",
    String(report.totals.skipped_existing),
  );
  setGitHubOutput("npm_publish_packages_failed", String(report.totals.failed));
  setGitHubOutput(
    "npm_publish_packages_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "npm_publish_packages_names",
    report.selected_packages.map((pkg) => pkg.name).join(","),
  );
  setGitHubOutput(
    "npm_publish_packages_names_json",
    JSON.stringify(report.selected_packages.map((pkg) => pkg.name)),
  );
  setGitHubOutput(
    "npm_publish_packages_published_names",
    report.published_packages.map((pkg) => pkg.name).join(","),
  );
  setGitHubOutput(
    "npm_publish_packages_published_names_json",
    JSON.stringify(report.published_packages.map((pkg) => pkg.name)),
  );
  setGitHubOutput(
    "npm_publish_packages_published_json",
    JSON.stringify(report.published_packages),
  );
  setGitHubOutput(
    "npm_publish_packages_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing npm package publish.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.selected_packages.length === 0) {
    logger.error("No npm packages were selected for publishing.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
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

  if (args.fail_if_empty && report.discovery.selected_packages === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`npm package publish blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `npm package publishing completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
