#!/usr/bin/env node
// .github/scripts/npm/validate-packages.js
// =============================================================================
// Aerealith AI — NPM Package Validator
// -----------------------------------------------------------------------------
// Purpose:
//   Validate npm package metadata, package.json files, publish readiness,
//   workspace package records, packed tarballs, and duplicate package names.
//
// Input:
//   - .github/npm/validate-packages.json
//   - .github/npm/validate-packages.jsonc
//   - .github/npm/validate-packages.yaml
//   - .github/npm/validate-packages.yml
//   - .github/npm/packages.json
//   - artifacts/ci/npm-packages.json
//   - artifacts/npm/discover-packages.json
//   - artifacts/npm/pack-packages.json
//
// Output:
//   - artifacts/npm/validate-packages.json
//   - artifacts/npm/validate-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not call npm, pnpm, yarn, or bun.
//   - Safe for pull requests.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
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
    info: (message) => console.log(`[npm-validate] ${message}`),
    warn: (message) => console.warn(`[npm-validate] WARN: ${message}`),
    error: (message) => console.error(`[npm-validate] ERROR: ${message}`),
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
  ".github/npm/validate-packages.json",
  ".github/npm/validate-packages.jsonc",
  ".github/npm/validate-packages.yaml",
  ".github/npm/validate-packages.yml",
  ".github/npm/packages.json",
  ".github/npm/packages.jsonc",
  ".github/npm/packages.yaml",
  ".github/npm/packages.yml",
  "npm/validate-packages.json",
  "npm/validate-packages.jsonc",
  "npm/validate-packages.yaml",
  "npm/validate-packages.yml",
  "npm/packages.json",
  "npm/packages.jsonc",
  "npm/packages.yaml",
  "npm/packages.yml",
];

const DEFAULT_PACKAGES_FILE = "artifacts/ci/npm-packages.json";
const DEFAULT_DISCOVERY_REPORT_FILE = "artifacts/npm/discover-packages.json";
const DEFAULT_PACK_REPORT_FILE = "artifacts/npm/pack-packages.json";
const DEFAULT_OUTPUT_FILE = "artifacts/npm/validate-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/npm/validate-packages.md";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const DEFAULT_ACCESS = "public";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|\/\/registry\.npmjs\.org\/:_authToken=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

    config_file: process.env.NPM_VALIDATE_PACKAGES_CONFIG_FILE || "",
    packages_file:
      process.env.NPM_VALIDATE_PACKAGES_PACKAGES_FILE || DEFAULT_PACKAGES_FILE,
    discovery_report_file:
      process.env.NPM_VALIDATE_PACKAGES_DISCOVERY_REPORT_FILE ||
      DEFAULT_DISCOVERY_REPORT_FILE,
    pack_report_file:
      process.env.NPM_VALIDATE_PACKAGES_PACK_REPORT_FILE ||
      DEFAULT_PACK_REPORT_FILE,

    output_file:
      process.env.NPM_VALIDATE_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.NPM_VALIDATE_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    package_name:
      process.env.NPM_VALIDATE_PACKAGE_NAME ||
      process.env.NPM_PACKAGE_NAME ||
      "",
    package_path:
      process.env.NPM_VALIDATE_PACKAGE_PATH ||
      process.env.NPM_PACKAGE_PATH ||
      "",
    package_json:
      process.env.NPM_VALIDATE_PACKAGE_JSON ||
      process.env.NPM_PACKAGE_JSON ||
      "",
    tarball:
      process.env.NPM_VALIDATE_TARBALL || process.env.NPM_PACKAGE_TARBALL || "",

    registry:
      process.env.NPM_VALIDATE_PACKAGES_REGISTRY ||
      process.env.NPM_CONFIG_REGISTRY ||
      DEFAULT_REGISTRY,
    access:
      process.env.NPM_VALIDATE_PACKAGES_ACCESS ||
      process.env.NPM_CONFIG_ACCESS ||
      DEFAULT_ACCESS,

    scan_roots: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_SCAN_ROOTS,
    ),
    include_packages: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_EXCLUDE_PROJECTS,
    ),
    include_paths: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_EXCLUDE_PATHS,
    ),

    use_config: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_USE_CONFIG,
      true,
    ),
    use_packages_file: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_USE_PACKAGES_FILE,
      true,
    ),
    use_discovery_report: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_USE_DISCOVERY_REPORT,
      true,
    ),
    use_pack_report: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_USE_PACK_REPORT,
      true,
    ),
    scan_repository: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_SCAN_REPOSITORY,
      false,
    ),

    publishable_only: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_PUBLISHABLE_ONLY,
      false,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_PRIVATE,
      true,
    ),
    include_invalid: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_INVALID,
      true,
    ),
    include_root_package: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_ROOT,
      true,
    ),

    strict_entrypoints: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_ENTRYPOINTS,
      false,
    ),
    strict_publishable: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_PUBLISHABLE,
      false,
    ),
    strict_dependency_protocols: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_DEPENDENCY_PROTOCOLS,
      false,
    ),
    require_license: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_REQUIRE_LICENSE,
      false,
    ),
    require_readme: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_REQUIRE_README,
      false,
    ),
    require_files_for_publishable: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_REQUIRE_FILES_FOR_PUBLISHABLE,
      false,
    ),
    validate_tarballs: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_VALIDATE_TARBALLS,
      true,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_invalid: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_INVALID,
      true,
    ),
    fail_on_warnings: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_WARNINGS,
      false,
    ),
    fail_on_duplicate_names: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_DUPLICATE_NAMES,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_ERROR,
      true,
    ),

    max_packages: normalizeInteger(
      process.env.NPM_VALIDATE_PACKAGES_MAX_PACKAGES,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.NPM_VALIDATE_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STEP_SUMMARY,
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

    if (arg === "--discovery-report" || arg === "--discover-report") {
      args.discovery_report_file = argv[index + 1];
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

    if (arg === "--scan-root" || arg === "--scan-roots") {
      args.scan_roots.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--use-discovery-report") {
      args.use_discovery_report = true;
      continue;
    }

    if (arg === "--no-discovery-report") {
      args.use_discovery_report = false;
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

    if (arg === "--scan-repository") {
      args.scan_repository = true;
      continue;
    }

    if (arg === "--no-scan-repository") {
      args.scan_repository = false;
      continue;
    }

    if (arg === "--publishable-only") {
      args.publishable_only = true;
      continue;
    }

    if (arg === "--no-publishable-only") {
      args.publishable_only = false;
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

    if (arg === "--include-root") {
      args.include_root_package = true;
      continue;
    }

    if (arg === "--no-include-root") {
      args.include_root_package = false;
      continue;
    }

    if (arg === "--strict-entrypoints") {
      args.strict_entrypoints = true;
      continue;
    }

    if (arg === "--no-strict-entrypoints") {
      args.strict_entrypoints = false;
      continue;
    }

    if (arg === "--strict-publishable") {
      args.strict_publishable = true;
      continue;
    }

    if (arg === "--no-strict-publishable") {
      args.strict_publishable = false;
      continue;
    }

    if (arg === "--strict-dependency-protocols") {
      args.strict_dependency_protocols = true;
      continue;
    }

    if (arg === "--no-strict-dependency-protocols") {
      args.strict_dependency_protocols = false;
      continue;
    }

    if (arg === "--require-license") {
      args.require_license = true;
      continue;
    }

    if (arg === "--no-require-license") {
      args.require_license = false;
      continue;
    }

    if (arg === "--require-readme") {
      args.require_readme = true;
      continue;
    }

    if (arg === "--no-require-readme") {
      args.require_readme = false;
      continue;
    }

    if (arg === "--require-files-for-publishable") {
      args.require_files_for_publishable = true;
      continue;
    }

    if (arg === "--no-require-files-for-publishable") {
      args.require_files_for_publishable = false;
      continue;
    }

    if (arg === "--validate-tarballs") {
      args.validate_tarballs = true;
      continue;
    }

    if (arg === "--no-validate-tarballs") {
      args.validate_tarballs = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--fail-on-invalid") {
      args.fail_on_invalid = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid") {
      args.fail_on_invalid = false;
      continue;
    }

    if (arg === "--fail-on-warnings") {
      args.fail_on_warnings = true;
      continue;
    }

    if (arg === "--no-fail-on-warnings") {
      args.fail_on_warnings = false;
      continue;
    }

    if (arg === "--fail-on-duplicate-names") {
      args.fail_on_duplicate_names = true;
      continue;
    }

    if (arg === "--no-fail-on-duplicate-names") {
      args.fail_on_duplicate_names = false;
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

    if (arg === "--max-packages") {
      args.max_packages = normalizeInteger(argv[index + 1], args.max_packages);
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
  args.scan_roots = [
    ...new Set(args.scan_roots.length ? args.scan_roots : ["."]),
  ];
  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.include_paths = [...new Set(args.include_paths)];
  args.exclude_paths = [
    ...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude_paths]),
  ];
  args.max_packages = Math.max(0, args.max_packages);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Validator

Usage:
  node .github/scripts/npm/validate-packages.js [options]

Examples:
  node .github/scripts/npm/validate-packages.js
  node .github/scripts/npm/validate-packages.js --packages artifacts/ci/npm-packages.json
  node .github/scripts/npm/validate-packages.js --scan-repository --scan-root libs
  node .github/scripts/npm/validate-packages.js --publishable-only --strict-entrypoints
  node .github/scripts/npm/validate-packages.js --package @aerealith-ai/core --path libs/core

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Validation config file.
      --packages <file>                      npm package artifact.
      --discovery-report <file>              npm discovery report.
      --pack-report <file>                   npm pack report.
      --package <name>                       Direct package name.
      --path <dir>                           Direct package path.
      --package-json <file>                  Direct package.json file.
      --tarball <file>                       Direct tarball file.
      --registry <url>                       Default npm registry.
      --access <public|restricted>           Default access.
      --scan-root <path,list>                Root path(s) to scan.
      --include <list>                       Include package names.
      --exclude <list>                       Exclude package names.
      --include-project <list>               Include project names.
      --exclude-project <list>               Exclude project names.
      --include-path <list>                  Include package path patterns.
      --exclude-path <pattern>               Exclude package path pattern.
      --use-config                           Use config records. Default.
      --no-config                            Ignore config records.
      --use-packages-file                    Use package artifact. Default.
      --no-packages-file                     Ignore package artifact.
      --use-discovery-report                 Use discovery report. Default.
      --no-discovery-report                  Ignore discovery report.
      --use-pack-report                      Use pack report. Default.
      --no-pack-report                       Ignore pack report.
      --scan-repository                      Scan repository package.json files.
      --publishable-only                     Validate only publishable packages.
      --include-private                      Include private packages. Default.
      --no-include-private                   Exclude private packages.
      --include-invalid                      Include invalid records. Default.
      --no-include-invalid                   Exclude invalid records.
      --include-root                         Include root package.json. Default.
      --no-include-root                      Exclude root package.json.
      --strict-entrypoints                   Missing entrypoint files are errors.
      --strict-publishable                   Publish-readiness warnings become errors.
      --strict-dependency-protocols          workspace:/file:/link: deps are errors.
      --require-license                      Missing license becomes an error.
      --require-readme                       Missing README becomes an error.
      --require-files-for-publishable        Missing files[] on publishable packages is an error.
      --validate-tarballs                    Validate tarball existence/checksum. Default.
      --fail-if-empty                        Exit non-zero if no packages are selected.
      --fail-on-invalid                      Exit non-zero on invalid packages. Default.
      --fail-on-warnings                     Exit non-zero on warnings.
      --fail-on-duplicate-names              Exit non-zero on duplicate package names. Default.
      --fail-on-error                        Exit non-zero on validation failure. Default.
      --no-fail-on-error                     Do not fail workflow for validation failure.
      --max-packages <number>                Maximum packages to validate.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not write files.
      --no-print                             Do not print JSON report.
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

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
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

function parseSimpleValidationYaml(text) {
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
        section === "validate"
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
        section === "validate") &&
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
    return parseSimpleValidationYaml(text);
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

function walkFiles(targetPath, repoRoot, args, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args.exclude_paths)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    if (shouldIncludePath(relativePath, args.include_paths)) {
      files.push(absolutePath);
    }

    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(path.join(absolutePath, entry.name), repoRoot, args, files);
  }

  return files;
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

function safeId(value) {
  return (
    normalizeString(value, "npm-validate")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/@-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "npm-validate"
  );
}

function normalizeScope(packageName) {
  const name = normalizeString(packageName);

  if (!name.startsWith("@")) return "";

  return name.split("/")[0] || "";
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

function readPackageJson(packageJsonPath, repoRoot) {
  const absolutePath = resolvePath(packageJsonPath, repoRoot);

  if (!isFile(absolutePath)) return null;

  return safeJsonParse(fs.readFileSync(absolutePath, "utf8"), null);
}

function readRootPackageJson(repoRoot) {
  return readPackageJson("package.json", repoRoot);
}

function parseWorkspaceYamlPatterns(text) {
  const patterns = [];
  const lines = String(text || "").split(/\r?\n/);

  let inPackages = false;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (/^packages:\s*$/.test(trimmed)) {
      inPackages = true;
      continue;
    }

    if (
      inPackages &&
      /^[A-Za-z0-9_.-]+:\s*/.test(trimmed) &&
      !trimmed.startsWith("-")
    ) {
      break;
    }

    if (inPackages && trimmed.startsWith("-")) {
      const value = trimmed
        .replace(/^-\s*/, "")
        .replace(/^['"]|['"]$/g, "")
        .trim();

      if (value && !value.startsWith("!")) {
        patterns.push(value);
      }
    }
  }

  return patterns;
}

function getWorkspacePatterns(repoRoot) {
  const rootPackage = readRootPackageJson(repoRoot);
  const patterns = [];

  if (rootPackage?.workspaces) {
    if (Array.isArray(rootPackage.workspaces)) {
      patterns.push(...rootPackage.workspaces);
    } else if (Array.isArray(rootPackage.workspaces.packages)) {
      patterns.push(...rootPackage.workspaces.packages);
    }
  }

  const pnpmWorkspace = resolvePath("pnpm-workspace.yaml", repoRoot);

  if (isFile(pnpmWorkspace)) {
    patterns.push(
      ...parseWorkspaceYamlPatterns(fs.readFileSync(pnpmWorkspace, "utf8")),
    );
  }

  return [...new Set(patterns.map(toPosixPath).filter(Boolean))];
}

function workspacePatternMatchesPackage(packageDir, workspacePatterns) {
  if (!workspacePatterns.length) return false;

  const normalizedDir = toPosixPath(packageDir).replace(/\/+$/g, "");

  return workspacePatterns.some((pattern) => {
    const normalizedPattern = toPosixPath(pattern).replace(/\/+$/g, "");

    if (hasGlob(normalizedPattern)) {
      return globToRegExp(normalizedPattern).test(normalizedDir);
    }

    return (
      normalizedDir === normalizedPattern ||
      normalizedDir.startsWith(`${normalizedPattern}/`)
    );
  });
}

function packageRecordsFromConfig(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.validate) ? config.validate : []),
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
    ...(Array.isArray(artifact.packages) ? artifact.packages : []),
    ...(Array.isArray(artifact.npm_packages) ? artifact.npm_packages : []),
    ...(Array.isArray(artifact.publishable_packages)
      ? artifact.publishable_packages
      : []),
    ...(Array.isArray(artifact.selected_packages)
      ? artifact.selected_packages
      : []),
    ...(Array.isArray(artifact.matrix?.include) ? artifact.matrix.include : []),
    ...(Array.isArray(artifact.publish_matrix?.include)
      ? artifact.publish_matrix.include
      : []),
  ];
}

function packageRecordsFromPackReport(packReport) {
  if (!packReport) return [];

  const records = [];

  for (const result of Array.isArray(packReport.results)
    ? packReport.results
    : []) {
    records.push({
      name: result.name,
      version: result.version,
      project: result.project,
      package_json: result.package_json,
      path: result.path,
      private: result.private,
      publishable: result.publishable,
      valid: result.validation?.ok !== false && result.status !== "invalid",
      tarballs: Array.isArray(result.tarballs) ? result.tarballs : [],
      source_type: "pack-report-result",
    });
  }

  for (const tarball of Array.isArray(packReport.tarballs)
    ? packReport.tarballs
    : []) {
    records.push({
      name: tarball.package || tarball.name,
      version: tarball.version,
      project: tarball.project,
      tarball: tarball.file || tarball.filename,
      tarballs: [tarball],
      publishable: true,
      valid: Boolean(tarball.file || tarball.filename),
      source_type: "pack-report-tarball",
    });
  }

  return records;
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
    valid: true,
    source_type: "direct",
  };
}

function discoverPackageJsonRecords(args, repoRoot) {
  if (!args.scan_repository) return [];

  const files = [];

  for (const scanRoot of args.scan_roots) {
    files.push(...walkFiles(scanRoot, repoRoot, args));
  }

  return [...new Set(files)]
    .map((filePath) => toRelativePath(filePath, repoRoot))
    .filter((relativePath) => path.basename(relativePath) === "package.json")
    .filter((relativePath) => {
      if (args.include_root_package) return true;
      return relativePath !== "package.json";
    })
    .filter((relativePath) =>
      shouldIncludePath(relativePath, args.include_paths),
    )
    .filter(
      (relativePath) => !shouldExcludePath(relativePath, args.exclude_paths),
    )
    .sort()
    .map((packageJsonPath) => ({
      package_json: packageJsonPath,
      path: toPosixPath(path.dirname(packageJsonPath)),
      source_type: "repository-scan",
    }));
}

function normalizeTarballRecord(record, repoRoot) {
  if (!record) return null;

  if (typeof record === "string") {
    const absolutePath = resolvePath(record, repoRoot);

    return {
      file: toPosixPath(record),
      filename: path.basename(record),
      exists: isFile(absolutePath),
      size_bytes: isFile(absolutePath) ? fs.statSync(absolutePath).size : 0,
      sha256: isFile(absolutePath) ? sha256File(absolutePath) : "",
    };
  }

  const file = normalizeString(
    record.absolute_file || record.file || record.path || record.filename,
  );
  const absolutePath = resolvePath(file, repoRoot);
  const exists = Boolean(file && isFile(absolutePath));

  return {
    file: file ? toRelativePath(absolutePath, repoRoot) : "",
    filename: normalizeString(record.filename || path.basename(file)),
    exists,
    size_bytes: exists
      ? fs.statSync(absolutePath).size
      : Number(record.size_bytes || record.size || 0),
    sha256: exists ? sha256File(absolutePath) : normalizeString(record.sha256),
    integrity: normalizeString(record.integrity),
    shasum: normalizeString(record.shasum),
  };
}

function normalizePackagePlan(
  record,
  args,
  repoRoot,
  workspacePatterns,
  sourceType = "artifact",
) {
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
  const name = normalizePackageName(record.name || packageJson.name || "");
  const version = normalizeString(record.version || packageJson.version || "");
  const privatePackage = normalizeBoolean(
    record.private ?? packageJson.private,
    false,
  );
  const workspace =
    workspacePatternMatchesPackage(packagePath, workspacePatterns) ||
    packagePath === ".";
  const publishConfig = packageJson.publishConfig || {};

  const configuredPublishable =
    record.publishable !== undefined ||
    record.publish !== undefined ||
    record.force_publish !== undefined ||
    record.forcePublish !== undefined;

  const forcedPublishable = normalizeBoolean(
    record.force_publish ?? record.forcePublish,
    false,
  );
  const publishable = normalizeBoolean(
    record.publishable ?? record.publish,
    forcedPublishable || (!privatePackage && Boolean(name && version)),
  );

  const tarballs = [
    ...normalizeStringList(record.tarball || record.tgz || ""),
    ...normalizeStringList(record.tarball_file || record.tarballFile || ""),
    ...(Array.isArray(record.tarballs) ? record.tarballs : []),
  ]
    .map((tarball) => normalizeTarballRecord(tarball, repoRoot))
    .filter(Boolean);

  const registry = normalizeRegistry(
    record.registry || publishConfig.registry || args.registry,
  );
  const access = normalizeString(
    record.access || publishConfig.access || args.access,
    args.access,
  );

  return {
    id: safeId(
      `${sourceType}:${name || packageJsonPath || record.tarball || "package"}`,
    ),
    source_type: record.source_type || sourceType,
    name,
    version,
    project: normalizeString(
      record.project || record.project_name || record.projectName || name,
    ),
    scope: normalizeScope(name),
    package_json: packageJsonPath,
    path: packagePath,
    root: packagePath,
    is_root: packagePath === "." || packageJsonPath === "package.json",
    workspace,
    private: privatePackage,
    publishable,
    forced_publishable: forcedPublishable,
    configured_publishable: configuredPublishable,
    registry,
    access,
    package_manager: normalizeString(
      record.package_manager ||
        record.packageManager ||
        packageManagerFromRepo(repoRoot),
    ),
    type: normalizeString(packageJson.type || "commonjs"),
    package_json_present: packageJsonPath
      ? isFile(resolvePath(packageJsonPath, repoRoot))
      : false,
    package_path_present: packagePath
      ? isDirectory(resolvePath(packagePath, repoRoot))
      : false,
    package_json_valid: Boolean(
      packageJson &&
      typeof packageJson === "object" &&
      Object.keys(packageJson).length,
    ),
    package_hash:
      packageJsonPath && isFile(resolvePath(packageJsonPath, repoRoot))
        ? sha256File(resolvePath(packageJsonPath, repoRoot))
        : "",
    package_json_data: packageJson,
    tarballs,
    enabled: normalizeBoolean(record.enabled, true),
    source_errors: Array.isArray(record.errors) ? record.errors : [],
    source_warnings: Array.isArray(record.warnings) ? record.warnings : [],
  };
}

function planMatchesFilters(plan, args) {
  if (!plan.enabled) return false;

  if (!args.include_private && plan.private) {
    return false;
  }

  if (args.publishable_only && !plan.publishable) {
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
    !plan.tarballs.some((tarball) =>
      shouldIncludePath(tarball.file, args.include_paths),
    )
  ) {
    return false;
  }

  if (
    shouldExcludePath(plan.package_json, args.exclude_paths) ||
    shouldExcludePath(plan.path, args.exclude_paths) ||
    plan.tarballs.some((tarball) =>
      shouldExcludePath(tarball.file, args.exclude_paths),
    )
  ) {
    return false;
  }

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key =
      plan.package_json ||
      plan.tarballs.map((tarball) => tarball.file).join(",") ||
      plan.name ||
      plan.id;

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
      forced_publishable:
        existing.forced_publishable || plan.forced_publishable,
      workspace: existing.workspace || plan.workspace,
      tarballs: dedupeTarballs([
        ...(existing.tarballs || []),
        ...(plan.tarballs || []),
      ]),
      source_errors: [
        ...new Set([
          ...(existing.source_errors || []),
          ...(plan.source_errors || []),
        ]),
      ],
      source_warnings: [
        ...new Set([
          ...(existing.source_warnings || []),
          ...(plan.source_warnings || []),
        ]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.package_json.localeCompare(right.package_json) ||
      left.path.localeCompare(right.path)
    );
  });
}

function dedupeTarballs(tarballs) {
  const seen = new Map();

  for (const tarball of tarballs) {
    const key = tarball.file || tarball.filename;

    if (!key || seen.has(key)) continue;

    seen.set(key, tarball);
  }

  return [...seen.values()].sort((left, right) =>
    left.file.localeCompare(right.file),
  );
}

function findDuplicatePackageNames(plans) {
  const names = new Map();

  for (const plan of plans) {
    if (!plan.name) continue;

    if (!names.has(plan.name)) {
      names.set(plan.name, []);
    }

    names.get(plan.name).push(plan.package_json || plan.path || plan.id);
  }

  return [...names.entries()]
    .filter(([, files]) => [...new Set(files)].length > 1)
    .map(([name, files]) => ({
      name,
      files: [...new Set(files)].sort(),
    }));
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;
  const packagesArtifact = args.use_packages_file
    ? readJsonFile(args.packages_file, repoRoot, null)
    : null;
  const discoveryReport = args.use_discovery_report
    ? readJsonFile(args.discovery_report_file, repoRoot, null)
    : null;
  const packReport = args.use_pack_report
    ? readJsonFile(args.pack_report_file, repoRoot, null)
    : null;
  const workspacePatterns = getWorkspacePatterns(repoRoot);
  const direct = directRecord(args);

  const records = [
    ...(args.use_config
      ? packageRecordsFromConfig(config).map((record) => ({
          ...record,
          source_type: "config",
        }))
      : []),
    ...(args.use_packages_file
      ? packageRecordsFromArtifact(packagesArtifact).map((record) => ({
          ...record,
          source_type: record.source_type || "packages-artifact",
        }))
      : []),
    ...(args.use_discovery_report
      ? packageRecordsFromArtifact(discoveryReport).map((record) => ({
          ...record,
          source_type: record.source_type || "discovery-report",
        }))
      : []),
    ...(args.use_pack_report ? packageRecordsFromPackReport(packReport) : []),
    ...discoverPackageJsonRecords(args, repoRoot),
    ...(direct ? [direct] : []),
  ];

  const allPlans = dedupePlans(
    records.map((record) =>
      normalizePackagePlan(
        record,
        args,
        repoRoot,
        workspacePatterns,
        record.source_type,
      ),
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
    packages_available: Boolean(packagesArtifact),
    discovery_report_file: toRelativePath(
      resolvePath(args.discovery_report_file, repoRoot),
      repoRoot,
    ),
    discovery_report_available: Boolean(discoveryReport),
    pack_report_file: toRelativePath(
      resolvePath(args.pack_report_file, repoRoot),
      repoRoot,
    ),
    pack_report_available: Boolean(packReport),
    workspace_patterns: workspacePatterns,
    discovered_packages: allPlans.length,
    selected_packages: selected,
    duplicate_names: findDuplicatePackageNames(selected),
  };
}

function isValidNpmPackageName(name) {
  if (!name) return false;
  if (name.length > 214) return false;
  if (name.startsWith(".") || name.startsWith("_")) return false;
  if (/[A-Z]/.test(name)) return false;
  if (/[~'!()*]/.test(name)) return false;

  if (name.startsWith("@")) {
    return /^@[a-z0-9._-]+\/[a-z0-9._-]+$/.test(name);
  }

  return /^[a-z0-9._-]+$/.test(name);
}

function isValidSemver(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    normalizeString(version),
  );
}

function isValidRegistry(value) {
  const registry = normalizeString(value);

  if (!registry) return false;

  try {
    const parsed = new URL(registry);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function collectEntryPoints(packageJson) {
  const entrypoints = [];

  function add(type, value) {
    if (typeof value !== "string") return;
    if (!value || value.startsWith("#")) return;

    entrypoints.push({
      type,
      path: value,
    });
  }

  function walkExports(prefix, value) {
    if (typeof value === "string") {
      add(prefix, value);
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, item] of Object.entries(value)) {
      walkExports(`${prefix}:${key}`, item);
    }
  }

  add("main", packageJson.main);
  add("module", packageJson.module);
  add(
    "browser",
    typeof packageJson.browser === "string" ? packageJson.browser : "",
  );
  add("types", packageJson.types);
  add("typings", packageJson.typings);

  if (packageJson.exports) {
    walkExports("exports", packageJson.exports);
  }

  return entrypoints.filter((entrypoint) => {
    if (!entrypoint.path) return false;
    if (entrypoint.path === ".") return false;
    if (entrypoint.path.includes("*")) return false;
    return !entrypoint.path.startsWith("node:");
  });
}

function entrypointExists(entrypoint, packageDir, repoRoot) {
  const cleanPath = entrypoint.path.replace(/^\.\//, "");
  const candidates = [
    cleanPath,
    `${cleanPath}.js`,
    `${cleanPath}.mjs`,
    `${cleanPath}.cjs`,
    `${cleanPath}.ts`,
    `${cleanPath}.tsx`,
    path.join(cleanPath, "index.js"),
    path.join(cleanPath, "index.ts"),
  ];

  return candidates.some((candidate) =>
    isFile(resolvePath(path.join(packageDir, candidate), repoRoot)),
  );
}

function collectDependencyProtocolIssues(packageJson) {
  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "bundleDependencies",
    "bundledDependencies",
  ];

  const issues = [];

  for (const section of sections) {
    const dependencies = packageJson[section];

    if (
      !dependencies ||
      typeof dependencies !== "object" ||
      Array.isArray(dependencies)
    )
      continue;

    for (const [name, version] of Object.entries(dependencies)) {
      const value = String(version || "");

      if (/^(workspace|file|link):/i.test(value)) {
        issues.push({
          section,
          name,
          version: value,
        });
      }
    }
  }

  return issues;
}

function packageHasReadme(plan, repoRoot) {
  const packageDir = resolvePath(plan.path, repoRoot);

  if (!isDirectory(packageDir)) return false;

  return fs
    .readdirSync(packageDir)
    .some((file) => /^readme(\..+)?$/i.test(file));
}

function packageHasLicense(plan, repoRoot) {
  const packageDir = resolvePath(plan.path, repoRoot);

  if (!isDirectory(packageDir)) return false;

  return fs
    .readdirSync(packageDir)
    .some((file) => /^licen[cs]e(\..+)?$/i.test(file));
}

function validatePackagePlan(plan, args, repoRoot, duplicateNames) {
  const packageJson = plan.package_json_data || {};
  const errors = [...plan.source_errors];
  const warnings = [...plan.source_warnings];
  const checks = {};

  checks.package_json_present = plan.package_json_present;
  checks.package_path_present = plan.package_path_present;
  checks.package_json_valid = plan.package_json_valid;
  checks.name_present = Boolean(plan.name);
  checks.name_valid = plan.name ? isValidNpmPackageName(plan.name) : false;
  checks.version_present = Boolean(plan.version);
  checks.version_valid = plan.version ? isValidSemver(plan.version) : false;
  checks.registry_valid = isValidRegistry(plan.registry);
  checks.access_valid = ["public", "restricted"].includes(plan.access);
  checks.duplicate_name = duplicateNames.has(plan.name);
  checks.publishable = plan.publishable;
  checks.private = plan.private;
  checks.workspace = plan.workspace;

  if (!plan.package_json && !plan.tarballs.length) {
    errors.push("Package has neither package.json nor tarball metadata.");
  }

  if (plan.package_json && !plan.package_json_present) {
    errors.push(`package.json does not exist: ${plan.package_json}`);
  }

  if (plan.package_json_present && !plan.package_json_valid) {
    errors.push(`package.json is invalid or empty: ${plan.package_json}`);
  }

  if (plan.path && !plan.package_path_present && !plan.tarballs.length) {
    errors.push(`Package path does not exist: ${plan.path}`);
  }

  if (!plan.name && !plan.tarballs.length) {
    errors.push("Package name is missing.");
  }

  if (plan.name && !checks.name_valid) {
    errors.push(`Package name is not npm-compatible: ${plan.name}`);
  }

  if (!plan.version && !plan.tarballs.length) {
    errors.push("Package version is missing.");
  }

  if (plan.version && !checks.version_valid) {
    errors.push(`Package version is not valid semver: ${plan.version}`);
  }

  if (!checks.registry_valid) {
    errors.push(`Registry is not a valid URL: ${plan.registry || "empty"}`);
  }

  if (!checks.access_valid) {
    errors.push(
      `Access must be public or restricted: ${plan.access || "empty"}`,
    );
  }

  if (checks.duplicate_name) {
    errors.push(`Duplicate package name selected: ${plan.name}`);
  }

  if (plan.private && plan.publishable && !plan.forced_publishable) {
    const message = "Package is private but marked publishable.";

    if (args.strict_publishable) errors.push(message);
    else warnings.push(message);
  }

  if (!plan.private && !plan.publishable && !plan.tarballs.length) {
    warnings.push("Package is public but not marked publishable.");
  }

  if (plan.publishable && plan.is_root && !plan.private) {
    warnings.push(
      "Root package is public and publishable. Confirm this is intentional.",
    );
  }

  if (
    plan.publishable &&
    args.require_files_for_publishable &&
    !Array.isArray(packageJson.files)
  ) {
    errors.push("Publishable package is missing files[].");
  } else if (plan.publishable && !Array.isArray(packageJson.files)) {
    warnings.push("Publishable package has no files[] allowlist.");
  }

  if (
    args.require_license &&
    !packageJson.license &&
    !packageHasLicense(plan, repoRoot)
  ) {
    errors.push("Package is missing license metadata and LICENSE file.");
  } else if (
    plan.publishable &&
    !packageJson.license &&
    !packageHasLicense(plan, repoRoot)
  ) {
    warnings.push(
      "Publishable package is missing license metadata and LICENSE file.",
    );
  }

  if (args.require_readme && !packageHasReadme(plan, repoRoot)) {
    errors.push("Package is missing README.");
  } else if (plan.publishable && !packageHasReadme(plan, repoRoot)) {
    warnings.push("Publishable package is missing README.");
  }

  const entrypoints = collectEntryPoints(packageJson);
  const missingEntryPoints = entrypoints.filter(
    (entrypoint) => !entrypointExists(entrypoint, plan.path, repoRoot),
  );

  checks.entrypoints = entrypoints.length;
  checks.missing_entrypoints = missingEntryPoints.length;

  if (missingEntryPoints.length) {
    const message = `Missing entrypoint file(s): ${missingEntryPoints
      .map((entrypoint) => `${entrypoint.type}=${entrypoint.path}`)
      .join(", ")}`;

    if (args.strict_entrypoints) errors.push(message);
    else warnings.push(message);
  }

  const dependencyProtocolIssues = collectDependencyProtocolIssues(packageJson);
  checks.dependency_protocol_issues = dependencyProtocolIssues.length;

  if (dependencyProtocolIssues.length && plan.publishable) {
    const message = `Publishable package uses local dependency protocol(s): ${dependencyProtocolIssues
      .map((issue) => `${issue.section}.${issue.name}=${issue.version}`)
      .join(", ")}`;

    if (args.strict_dependency_protocols) errors.push(message);
    else warnings.push(message);
  }

  if (args.validate_tarballs && plan.tarballs.length) {
    const missingTarballs = plan.tarballs.filter((tarball) => !tarball.exists);

    checks.tarballs = plan.tarballs.length;
    checks.missing_tarballs = missingTarballs.length;

    if (missingTarballs.length) {
      errors.push(
        `Missing tarball file(s): ${missingTarballs
          .map((tarball) => tarball.file || tarball.filename || "unknown")
          .join(", ")}`,
      );
    }
  } else {
    checks.tarballs = plan.tarballs.length;
    checks.missing_tarballs = 0;
  }

  const valid = errors.length === 0;

  return {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    version: plan.version,
    project: plan.project,
    scope: plan.scope,
    package_json: plan.package_json,
    path: plan.path,
    is_root: plan.is_root,
    workspace: plan.workspace,
    private: plan.private,
    publishable: plan.publishable,
    forced_publishable: plan.forced_publishable,
    registry: plan.registry,
    access: plan.access,
    package_manager: plan.package_manager,
    type: plan.type,
    package_hash: plan.package_hash,
    tarballs: plan.tarballs,
    entrypoints,
    missing_entrypoints: missingEntryPoints,
    dependency_protocol_issues: dependencyProtocolIssues,
    checks,
    valid,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    status: valid ? (warnings.length ? "warning" : "valid") : "invalid",
  };
}

function validatePackages(plans, args, repoRoot) {
  const duplicateNames = new Set(
    plans.duplicate_names.map((duplicate) => duplicate.name),
  );

  const results = plans.selected_packages.map((plan) =>
    validatePackagePlan(plan, args, repoRoot, duplicateNames),
  );

  return args.include_invalid
    ? results
    : results.filter((result) => result.valid);
}

function summarizeResults(results) {
  return {
    packages: results.length,
    valid: results.filter((result) => result.valid).length,
    invalid: results.filter((result) => !result.valid).length,
    warnings: results.filter((result) => result.warnings.length > 0).length,
    publishable: results.filter((result) => result.publishable).length,
    private: results.filter((result) => result.private).length,
    workspace: results.filter((result) => result.workspace).length,
    root_packages: results.filter((result) => result.is_root).length,
    tarballs: results.reduce((sum, result) => sum + result.tarballs.length, 0),
    missing_tarballs: results.reduce(
      (sum, result) => sum + Number(result.checks.missing_tarballs || 0),
      0,
    ),
    missing_entrypoints: results.reduce(
      (sum, result) => sum + Number(result.checks.missing_entrypoints || 0),
      0,
    ),
    dependency_protocol_issues: results.reduce(
      (sum, result) =>
        sum + Number(result.checks.dependency_protocol_issues || 0),
      0,
    ),
    scopes: [...new Set(results.map((result) => result.scope).filter(Boolean))]
      .length,
    registries: [
      ...new Set(results.map((result) => result.registry).filter(Boolean)),
    ].length,
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "none";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        valid: 0,
        invalid: 0,
        warnings: 0,
        publishable: 0,
      };
    }

    groups[group].count += 1;
    if (result.valid) groups[group].valid += 1;
    if (!result.valid) groups[group].invalid += 1;
    if (result.warnings.length) groups[group].warnings += 1;
    if (result.publishable) groups[group].publishable += 1;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, results) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(results);
  const invalidPackages = results.filter((result) => !result.valid);
  const warningPackages = results.filter(
    (result) => result.warnings.length > 0,
  );
  const duplicateNames = plans.duplicate_names;

  const status =
    totals.packages === 0
      ? "empty"
      : totals.invalid > 0
        ? "invalid"
        : duplicateNames.length > 0
          ? "duplicate-names"
          : totals.warnings > 0
            ? "warning"
            : "valid";

  return {
    schema_version: 1,
    type: "npm-package-validation",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      packages_file: plans.packages_file,
      packages_available: plans.packages_available,
      discovery_report_file: plans.discovery_report_file,
      discovery_report_available: plans.discovery_report_available,
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
      scan_repository: args.scan_repository,
      scan_roots: args.scan_roots,
      workspace_patterns: plans.workspace_patterns,
      publishable_only: args.publishable_only,
      include_private: args.include_private,
      include_invalid: args.include_invalid,
      strict_entrypoints: args.strict_entrypoints,
      strict_publishable: args.strict_publishable,
      strict_dependency_protocols: args.strict_dependency_protocols,
      require_license: args.require_license,
      require_readme: args.require_readme,
      require_files_for_publishable: args.require_files_for_publishable,
      validate_tarballs: args.validate_tarballs,
      max_packages: args.max_packages,
      dry_run: args.dry_run,
    },
    discovery: {
      discovered_packages: plans.discovered_packages,
      selected_packages: plans.selected_packages.length,
      validated_packages: results.length,
      duplicate_names: duplicateNames.length,
    },
    totals: {
      ...totals,
      ok: totals.invalid === 0 && duplicateNames.length === 0,
    },
    groups: {
      by_status: groupResults(results, "status"),
      by_project: groupResults(results, "project"),
      by_scope: groupResults(results, "scope"),
      by_registry: groupResults(results, "registry"),
      by_package_manager: groupResults(results, "package_manager"),
    },
    packages: results,
    npm_packages: results,
    valid_packages: results.filter((result) => result.valid),
    invalid_packages: invalidPackages,
    warning_packages: warningPackages,
    duplicate_names: duplicateNames,
    warnings: results.flatMap((result) =>
      result.warnings.map((warning) => ({
        package: result.name || result.package_json,
        path: result.path,
        warning,
      })),
    ),
    errors: results.flatMap((result) =>
      result.errors.map((error) => ({
        package: result.name || result.package_json,
        path: result.path,
        error,
      })),
    ),
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
    `# ✅ ${PROJECT_NAME} NPM Package Validation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Validated packages: \`${report.discovery.validated_packages}\``,
    `- Valid: \`${report.totals.valid}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Duplicate names: \`${report.discovery.duplicate_names}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Validation Configuration",
    "",
    `- Publishable only: \`${report.config.publishable_only ? "true" : "false"}\``,
    `- Include private: \`${report.config.include_private ? "true" : "false"}\``,
    `- Strict entrypoints: \`${report.config.strict_entrypoints ? "true" : "false"}\``,
    `- Strict publishable: \`${report.config.strict_publishable ? "true" : "false"}\``,
    `- Strict dependency protocols: \`${report.config.strict_dependency_protocols ? "true" : "false"}\``,
    `- Validate tarballs: \`${report.config.validate_tarballs ? "true" : "false"}\``,
    "",
    "## 📊 Totals",
    "",
    `- Discovered packages: \`${report.discovery.discovered_packages}\``,
    `- Selected packages: \`${report.discovery.selected_packages}\``,
    `- Publishable: \`${report.totals.publishable}\``,
    `- Private: \`${report.totals.private}\``,
    `- Workspace: \`${report.totals.workspace}\``,
    `- Root packages: \`${report.totals.root_packages}\``,
    `- Tarballs: \`${report.totals.tarballs}\``,
    `- Missing tarballs: \`${report.totals.missing_tarballs}\``,
    `- Missing entrypoints: \`${report.totals.missing_entrypoints}\``,
    `- Local dependency protocols: \`${report.totals.dependency_protocol_issues}\``,
    "",
    "## 🎯 Package Results",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No npm packages were validated.");
  } else {
    lines.push(
      "| Status | Package | Version | Project | Path | Publishable | Warnings | Errors |",
    );
    lines.push("|---|---|---|---|---|---:|---:|---:|");

    for (const pkg of report.packages) {
      lines.push(
        `| \`${pkg.status}\` | \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.version || "none")}\` | \`${escapeMarkdown(pkg.project || "none")}\` | \`${escapeMarkdown(pkg.path || "none")}\` | \`${pkg.publishable ? "true" : "false"}\` | \`${pkg.warnings.length}\` | \`${pkg.errors.length}\` |`,
      );
    }
  }

  if (report.duplicate_names.length) {
    lines.push("");
    lines.push("## ⚠️ Duplicate Package Names");
    lines.push("");
    lines.push("| Package | Files |");
    lines.push("|---|---|");

    for (const duplicate of report.duplicate_names) {
      lines.push(
        `| \`${escapeMarkdown(duplicate.name)}\` | ${duplicate.files
          .map((file) => `\`${escapeMarkdown(file)}\``)
          .join("<br>")} |`,
      );
    }
  }

  if (report.invalid_packages.length) {
    lines.push("");
    lines.push("## ❌ Invalid Packages");
    lines.push("");
    lines.push("| Package | Path | Errors |");
    lines.push("|---|---|---|");

    for (const pkg of report.invalid_packages) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.path || "none")}\` | ${pkg.errors
          .map(escapeMarkdown)
          .join("<br>")} |`,
      );
    }
  }

  if (report.warning_packages.length) {
    lines.push("");
    lines.push("## ⚠️ Warning Packages");
    lines.push("");
    lines.push("| Package | Path | Warnings |");
    lines.push("|---|---|---|");

    for (const pkg of report.warning_packages.slice(0, 100)) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.path || "none")}\` | ${pkg.warnings
          .map(escapeMarkdown)
          .join("<br>")} |`,
      );
    }

    if (report.warning_packages.length > 100) {
      lines.push(
        `| ... | ... | ${report.warning_packages.length - 100} more package(s) with warnings. |`,
      );
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
  lines.push(`- Discovery report: \`${report.config.discovery_report_file}\``);
  lines.push(
    `- Discovery report available: \`${report.config.discovery_report_available ? "true" : "false"}\``,
  );
  lines.push(`- Pack report: \`${report.config.pack_report_file}\``);
  lines.push(
    `- Pack report available: \`${report.config.pack_report_available ? "true" : "false"}\``,
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
  setGitHubOutput("npm_validate_packages_file", report.config.output_file);
  setGitHubOutput(
    "npm_validate_packages_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("npm_validate_packages_status", report.status);
  setGitHubOutput(
    "npm_validate_packages_ok",
    report.totals.ok ? "true" : "false",
  );
  setGitHubOutput(
    "npm_validate_packages_count",
    String(report.totals.packages),
  );
  setGitHubOutput("npm_validate_packages_valid", String(report.totals.valid));
  setGitHubOutput(
    "npm_validate_packages_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "npm_validate_packages_warnings",
    String(report.totals.warnings),
  );
  setGitHubOutput(
    "npm_validate_packages_duplicate_names",
    String(report.discovery.duplicate_names),
  );
  setGitHubOutput(
    "npm_validate_packages_publishable",
    String(report.totals.publishable),
  );
  setGitHubOutput(
    "npm_validate_packages_names",
    report.packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_validate_packages_names_json",
    JSON.stringify(report.packages.map((pkg) => pkg.name).filter(Boolean)),
  );
  setGitHubOutput(
    "npm_validate_packages_invalid_names",
    report.invalid_packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_validate_packages_invalid_names_json",
    JSON.stringify(
      report.invalid_packages.map((pkg) => pkg.name).filter(Boolean),
    ),
  );
  setGitHubOutput(
    "npm_validate_packages_errors_json",
    JSON.stringify(report.errors),
  );
  setGitHubOutput(
    "npm_validate_packages_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Validating npm packages.");

  const plans = createPlans(args, repoRoot);
  const results = validatePackages(plans, args, repoRoot);
  const report = createReport(args, repoRoot, plans, results);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  if (args.fail_if_empty && report.discovery.validated_packages === 0) {
    logger.error("No npm packages were validated.");
    process.exitCode = 1;
  }

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

  if (args.fail_if_empty && report.discovery.validated_packages === 0) {
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_error &&
    args.fail_on_duplicate_names &&
    report.discovery.duplicate_names > 0
  ) {
    logger.error(
      `npm package validation found ${report.discovery.duplicate_names} duplicate package name group(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && args.fail_on_invalid && report.totals.invalid > 0) {
    logger.error(
      `npm package validation found ${report.totals.invalid} invalid package(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_error &&
    args.fail_on_warnings &&
    report.totals.warnings > 0
  ) {
    logger.error(
      `npm package validation found ${report.totals.warnings} package(s) with warnings.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
