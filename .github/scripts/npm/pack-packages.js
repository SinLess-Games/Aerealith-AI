#!/usr/bin/env node
// .github/scripts/npm/pack-packages.js
// =============================================================================
// Aerealith AI — NPM Package Packer
// -----------------------------------------------------------------------------
// Purpose:
//   Pack selected npm workspace packages into .tgz artifacts for CI, release,
//   provenance, and publish workflows.
//
// Input:
//   - .github/npm/pack-packages.json
//   - .github/npm/pack-packages.jsonc
//   - .github/npm/pack-packages.yaml
//   - .github/npm/pack-packages.yml
//   - .github/npm/packages.json
//   - artifacts/ci/npm-packages.json
//
// Output:
//   - artifacts/npm/packages/*.tgz
//   - artifacts/npm/pack-packages.json
//   - artifacts/npm/pack-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses npm, pnpm, yarn, or bun based on lockfiles or inputs.
//   - Dry-run mode reports commands without writing package tarballs.
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
    info: (message) => console.log(`[npm-pack] ${message}`),
    warn: (message) => console.warn(`[npm-pack] WARN: ${message}`),
    error: (message) => console.error(`[npm-pack] ERROR: ${message}`),
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
  ".github/npm/pack-packages.json",
  ".github/npm/pack-packages.jsonc",
  ".github/npm/pack-packages.yaml",
  ".github/npm/pack-packages.yml",
  ".github/npm/packages.json",
  ".github/npm/packages.jsonc",
  ".github/npm/packages.yaml",
  ".github/npm/packages.yml",
  "npm/pack-packages.json",
  "npm/pack-packages.jsonc",
  "npm/pack-packages.yaml",
  "npm/pack-packages.yml",
  "npm/packages.json",
  "npm/packages.jsonc",
  "npm/packages.yaml",
  "npm/packages.yml",
];

const DEFAULT_PACKAGES_FILE = "artifacts/ci/npm-packages.json";
const DEFAULT_OUTPUT_DIR = "artifacts/npm/packages";
const DEFAULT_OUTPUT_FILE = "artifacts/npm/pack-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/npm/pack-packages.md";

const DEFAULT_PACKAGE_MANAGER = "auto";
const DEFAULT_PACK_COMMAND = "pack";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|\/\/registry\.npmjs\.org\/:_authToken=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    config_file: process.env.NPM_PACK_PACKAGES_CONFIG_FILE || "",
    packages_file:
      process.env.NPM_PACK_PACKAGES_PACKAGES_FILE || DEFAULT_PACKAGES_FILE,

    output_dir: process.env.NPM_PACK_PACKAGES_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    output_file:
      process.env.NPM_PACK_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.NPM_PACK_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    package_name:
      process.env.NPM_PACK_PACKAGE_NAME || process.env.NPM_PACKAGE_NAME || "",
    package_path:
      process.env.NPM_PACK_PACKAGE_PATH || process.env.NPM_PACKAGE_PATH || "",
    package_json:
      process.env.NPM_PACK_PACKAGE_JSON || process.env.NPM_PACKAGE_JSON || "",

    package_manager:
      process.env.NPM_PACK_PACKAGES_PACKAGE_MANAGER ||
      process.env.PACKAGE_MANAGER ||
      DEFAULT_PACKAGE_MANAGER,
    pack_command:
      process.env.NPM_PACK_PACKAGES_COMMAND ||
      process.env.NPM_PACK_COMMAND ||
      DEFAULT_PACK_COMMAND,

    include_packages: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_EXCLUDE_PROJECTS,
    ),
    include_paths: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_EXCLUDE_PATHS,
    ),

    pack_publishable_only: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_PUBLISHABLE_ONLY,
      true,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    include_invalid: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_INCLUDE_INVALID,
      false,
    ),

    ignore_scripts: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_IGNORE_SCRIPTS,
      false,
    ),
    json_output: normalizeBoolean(process.env.NPM_PACK_PACKAGES_JSON, true),
    verify_tarballs: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_VERIFY,
      true,
    ),
    clean_output_dir: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_CLEAN_OUTPUT_DIR,
      false,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_CONTINUE_ON_ERROR,
      false,
    ),

    max_packages: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_MAX_PACKAGES,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_MAX_BUFFER_MB,
      128,
    ),

    dry_run: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.NPM_PACK_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_STEP_SUMMARY,
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

    if (arg === "--output-dir") {
      args.output_dir = argv[index + 1];
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

    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--command" || arg === "--pack-command") {
      args.pack_command = argv[index + 1];
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
      args.pack_publishable_only = true;
      continue;
    }

    if (arg === "--no-publishable-only") {
      args.pack_publishable_only = false;
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

    if (arg === "--ignore-scripts") {
      args.ignore_scripts = true;
      continue;
    }

    if (arg === "--no-ignore-scripts") {
      args.ignore_scripts = false;
      continue;
    }

    if (arg === "--json") {
      args.json_output = true;
      continue;
    }

    if (arg === "--no-json") {
      args.json_output = false;
      continue;
    }

    if (arg === "--verify") {
      args.verify_tarballs = true;
      continue;
    }

    if (arg === "--no-verify") {
      args.verify_tarballs = false;
      continue;
    }

    if (arg === "--clean") {
      args.clean_output_dir = true;
      continue;
    }

    if (arg === "--no-clean") {
      args.clean_output_dir = false;
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

  args.package_manager = normalizeString(
    args.package_manager,
    DEFAULT_PACKAGE_MANAGER,
  ).toLowerCase();
  args.pack_command = normalizeString(args.pack_command, DEFAULT_PACK_COMMAND);
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
Aerealith AI NPM Package Packer

Usage:
  node .github/scripts/npm/pack-packages.js [options]

Examples:
  node .github/scripts/npm/pack-packages.js --dry-run
  node .github/scripts/npm/pack-packages.js --packages artifacts/ci/npm-packages.json
  node .github/scripts/npm/pack-packages.js --package @aerealith-ai/core --path libs/core
  node .github/scripts/npm/pack-packages.js --package-manager pnpm --output-dir artifacts/npm/packages

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Pack config file.
      --packages <file>                    npm package discovery artifact.
      --output-dir <dir>                   Tarball output directory.
      --package <name>                     Direct package name.
      --path <dir>                         Direct package path.
      --package-json <file>                Direct package.json path.
      --package-manager <auto|npm|pnpm|yarn|bun>
      --command <command>                  Pack command. Default: pack.
      --include <list>                     Include package names.
      --exclude <list>                     Exclude package names.
      --include-project <list>             Include project names.
      --exclude-project <list>             Exclude project names.
      --include-path <list>                Include package path patterns.
      --exclude-path <pattern>             Exclude package path pattern.
      --publishable-only                   Pack only publishable packages. Default.
      --no-publishable-only                Allow non-publishable selected packages.
      --include-private                    Include private packages.
      --no-include-private                 Exclude private packages. Default.
      --include-invalid                    Include invalid package records.
      --no-include-invalid                 Exclude invalid records. Default.
      --ignore-scripts                     Pass ignore-scripts where supported.
      --json                               Request JSON pack output. Default.
      --no-json                            Do not request JSON pack output.
      --verify                             Verify tarballs and checksums. Default.
      --no-verify                          Skip tarball verification.
      --clean                              Clean output directory before packing.
      --fail-if-empty                      Exit non-zero if no packages are selected.
      --fail-on-error                      Exit non-zero on pack failure. Default.
      --no-fail-on-error                   Do not fail when pack fails.
      --continue-on-error                  Continue after a package fails.
      --no-continue-on-error               Stop after first failure. Default.
      --max-packages <number>              Maximum packages to pack.
      --timeout-minutes <number>           Per command timeout. Default: 20.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not write tarballs.
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

function cleanDir(dirPath, dryRun = false) {
  if (!fs.existsSync(dirPath)) return;

  if (dryRun) {
    logger.info(`[dry-run] Would clean directory: ${dirPath}`);
    return;
  }

  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), {
      recursive: true,
      force: true,
    });
  }
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

function sha512FileBase64(filePath) {
  return crypto
    .createHash("sha512")
    .update(fs.readFileSync(filePath))
    .digest("base64");
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

function parseSimplePackYaml(text) {
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

      if (section === "packages" || section === "npm_packages") {
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
      (section === "packages" || section === "npm_packages") &&
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
    return parseSimplePackYaml(text);
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
    normalizeString(value, "npm-pack")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/@-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "npm-pack"
  );
}

function packageTarballName(name, version) {
  const normalizedName = normalizeString(name)
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-");

  return `${normalizedName}-${version || "0.0.0"}.tgz`;
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
    ...(Array.isArray(config.packages) ? config.packages : []),
    ...(Array.isArray(config.npm_packages) ? config.npm_packages : []),
    ...(Array.isArray(config.npmPackages) ? config.npmPackages : []),
  ];

  if (config.package && typeof config.package === "object") {
    records.push(config.package);
  }

  if (
    !records.length &&
    (config.name || config.path || config.package_json || config.packageJson)
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
    ...(Array.isArray(artifact.matrix?.include) ? artifact.matrix.include : []),
    ...(Array.isArray(artifact.publish_matrix?.include)
      ? artifact.publish_matrix.include
      : []),
  ];
}

function directRecord(args) {
  if (!args.package_name && !args.package_path && !args.package_json)
    return null;

  return {
    name: args.package_name,
    path:
      args.package_path ||
      (args.package_json ? path.dirname(args.package_json) : "."),
    package_json:
      args.package_json || path.join(args.package_path || ".", "package.json"),
    publishable: true,
    private: false,
    valid: true,
    source_type: "direct",
  };
}

function readPackageJson(packageJsonPath, repoRoot) {
  const absolutePath = resolvePath(packageJsonPath, repoRoot);

  if (!isFile(absolutePath)) return null;

  return safeJsonParse(fs.readFileSync(absolutePath, "utf8"), null);
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
        path.join(packagePath, "package.json"),
    ),
  );

  const packageJson = readPackageJson(packageJsonPath, repoRoot) || {};
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
    Boolean(name && version && isFile(resolvePath(packageJsonPath, repoRoot))),
  );

  const errors = [];
  const warnings = [];

  if (!name) errors.push("Package name is missing.");
  if (!version) errors.push("Package version is missing.");
  if (!isFile(resolvePath(packageJsonPath, repoRoot))) {
    errors.push(`package.json does not exist: ${packageJsonPath}`);
  }
  if (!isDirectory(resolvePath(packagePath, repoRoot))) {
    errors.push(`Package path does not exist: ${packagePath}`);
  }
  if (privatePackage && !args.include_private) {
    warnings.push(
      "Package is private and is excluded unless include_private is enabled.",
    );
  }
  if (!publishable && args.pack_publishable_only) {
    warnings.push(
      "Package is not publishable and publishable-only mode is enabled.",
    );
  }

  return {
    id: safeId(`${sourceType}:${name || packageJsonPath}`),
    source_type: record.source_type || sourceType,
    name,
    version,
    project: normalizeString(
      record.project || record.project_name || record.projectName || name,
    ),
    package_json: packageJsonPath,
    path: packagePath,
    root: packagePath,
    package_manager: normalizeString(
      record.package_manager || record.packageManager || "",
      "",
    ),
    registry: normalizeString(record.registry || ""),
    access: normalizeString(record.access || ""),
    tag: normalizeString(
      record.tag || record.default_tag || record.defaultTag || "",
    ),
    private: privatePackage,
    publishable,
    valid: valid && errors.length === 0,
    enabled: normalizeBoolean(record.enabled, true),
    expected_tarball: packageTarballName(name, version),
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

  if (args.pack_publishable_only && !plan.publishable) {
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
    !shouldIncludePath(plan.path, args.include_paths)
  ) {
    return false;
  }

  if (
    shouldExcludePath(plan.package_json, args.exclude_paths) ||
    shouldExcludePath(plan.path, args.exclude_paths)
  ) {
    return false;
  }

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = plan.name || plan.package_json || plan.path;

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
      errors: [
        ...new Set([...(existing.errors || []), ...(plan.errors || [])]),
      ],
      warnings: [
        ...new Set([...(existing.warnings || []), ...(plan.warnings || [])]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.package_json.localeCompare(right.package_json)
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const packageArtifact = readJsonFile(args.packages_file, repoRoot, null);
  const direct = directRecord(args);

  const records = [
    ...packageRecordsFromConfig(config).map((record) => ({
      ...record,
      source_type: "config",
    })),
    ...packageRecordsFromArtifact(packageArtifact).map((record) => ({
      ...record,
      source_type: record.source_type || "package-artifact",
    })),
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
    discovered_packages: allPlans.length,
    selected_packages: selected,
  };
}

function validatePlan(plan) {
  const errors = [...plan.errors];
  const warnings = [...plan.warnings];

  if (!plan.name) errors.push("Package name is missing.");
  if (!plan.version) errors.push("Package version is missing.");
  if (!plan.path) errors.push("Package path is missing.");
  if (!plan.package_json) errors.push("package.json path is missing.");

  if (!plan.publishable) {
    warnings.push("Package is not marked publishable.");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
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

function createPackCommand(plan, args, repoRoot, outputDir) {
  const packageManager = resolvePackageManager(
    plan.package_manager || args.package_manager,
    repoRoot,
  );
  const customCommand = splitCommandLine(args.pack_command);

  if (customCommand.length > 1 || !["pack"].includes(args.pack_command)) {
    return {
      package_manager: packageManager,
      command: customCommand[0],
      args: customCommand.slice(1),
      cwd: resolvePath(plan.path, repoRoot),
    };
  }

  if (packageManager === "pnpm") {
    const commandArgs = ["pack", "--pack-destination", outputDir];

    if (args.json_output) commandArgs.push("--json");
    if (args.ignore_scripts) commandArgs.push("--ignore-scripts");

    return {
      package_manager: "pnpm",
      command: "pnpm",
      args: commandArgs,
      cwd: resolvePath(plan.path, repoRoot),
    };
  }

  if (packageManager === "yarn") {
    const targetFile = path.join(outputDir, plan.expected_tarball);
    const commandArgs = ["pack", "--filename", targetFile];

    if (args.ignore_scripts) commandArgs.push("--ignore-scripts");

    return {
      package_manager: "yarn",
      command: "yarn",
      args: commandArgs,
      cwd: resolvePath(plan.path, repoRoot),
    };
  }

  if (packageManager === "bun") {
    return {
      package_manager: "bun",
      command: "bun",
      args: ["pm", "pack", "--destination", outputDir],
      cwd: resolvePath(plan.path, repoRoot),
    };
  }

  const commandArgs = ["pack", "--pack-destination", outputDir];

  if (args.json_output) commandArgs.push("--json");
  if (args.ignore_scripts) commandArgs.push("--ignore-scripts");

  return {
    package_manager: "npm",
    command: "npm",
    args: commandArgs,
    cwd: resolvePath(plan.path, repoRoot),
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

function parsePackJsonOutput(stdout) {
  const text = String(stdout || "").trim();

  if (!text) return [];

  const parsed = safeJsonParse(text, null);

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];

  const records = [];

  for (const line of text.split(/\r?\n/)) {
    const lineParsed = safeJsonParse(line.trim(), null);

    if (Array.isArray(lineParsed)) records.push(...lineParsed);
    else if (lineParsed && typeof lineParsed === "object")
      records.push(lineParsed);
  }

  return records;
}

function findTarballForPackage(plan, outputDir) {
  if (!fs.existsSync(outputDir)) return "";

  const expected = path.join(outputDir, plan.expected_tarball);

  if (isFile(expected)) return expected;

  const files = fs
    .readdirSync(outputDir)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(outputDir, file))
    .filter(isFile)
    .sort((left, right) => {
      return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
    });

  const packagePrefix = plan.name.replace(/^@/, "").replace(/\//g, "-");

  return (
    files.find((file) => path.basename(file).startsWith(packagePrefix)) ||
    files[0] ||
    ""
  );
}

function normalizeTarballRecord(record, plan, outputDir, repoRoot) {
  const filename = normalizeString(
    record.filename || record.name || record.file || "",
  );
  const tarballPath = normalizeString(record.path || record.filename || "");

  const absolutePath = tarballPath
    ? path.isAbsolute(tarballPath)
      ? tarballPath
      : resolvePath(path.join(outputDir, path.basename(tarballPath)), repoRoot)
    : findTarballForPackage(plan, outputDir);

  const exists = isFile(absolutePath);
  const stat = exists ? fs.statSync(absolutePath) : null;

  return {
    name: normalizeString(record.name || plan.name),
    version: normalizeString(record.version || plan.version),
    filename: filename || path.basename(absolutePath || plan.expected_tarball),
    file: absolutePath ? toRelativePath(absolutePath, repoRoot) : "",
    absolute_file: absolutePath || "",
    size_bytes: stat ? stat.size : Number(record.size || 0),
    integrity: normalizeString(record.integrity || ""),
    shasum: normalizeString(record.shasum || ""),
    sha256: exists ? sha256File(absolutePath) : "",
    sha512: exists ? sha512FileBase64(absolutePath) : "",
    exists,
  };
}

function packPackage(plan, args, repoRoot, outputDir) {
  const startedAt = new Date();
  const validation = validatePlan(plan);

  const result = {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    version: plan.version,
    project: plan.project,
    package_json: plan.package_json,
    path: plan.path,
    private: plan.private,
    publishable: plan.publishable,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    validation,
    command: null,
    tarballs: [],
    errors: [],
    warnings: validation.warnings,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Packing"} npm package ${plan.name}@${plan.version}.`,
    );

    const packCommand = createPackCommand(plan, args, repoRoot, outputDir);
    packCommand.display = commandDisplay(packCommand.command, packCommand.args);

    const command = runCommand(packCommand, args);
    result.command = sanitizeCommand(command);

    if (!command.success) {
      result.status = "failed";
      result.errors.push(
        command.error || command.stderr || `Failed to pack ${plan.name}.`,
      );
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.tarballs.push({
        name: plan.name,
        version: plan.version,
        filename: plan.expected_tarball,
        file: toRelativePath(
          path.join(outputDir, plan.expected_tarball),
          repoRoot,
        ),
        absolute_file: path.join(outputDir, plan.expected_tarball),
        size_bytes: 0,
        integrity: "",
        shasum: "",
        sha256: "",
        sha512: "",
        exists: false,
      });
      return result;
    }

    const parsedRecords = parsePackJsonOutput(command.stdout);
    const tarballRecords = parsedRecords.length
      ? parsedRecords.map((record) =>
          normalizeTarballRecord(record, plan, outputDir, repoRoot),
        )
      : [normalizeTarballRecord({}, plan, outputDir, repoRoot)];

    result.tarballs = tarballRecords;

    if (args.verify_tarballs) {
      const missing = tarballRecords.filter((tarball) => !tarball.exists);

      if (missing.length) {
        result.status = "failed";
        result.errors.push(
          `Pack command completed, but ${missing.length} expected tarball(s) could not be found.`,
        );
        return result;
      }
    }

    result.status = "packed";
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

async function executePlans(plans, args, repoRoot, outputDir) {
  const results = [];
  let stoppedEarly = false;

  ensureDir(outputDir, args.dry_run);

  if (args.clean_output_dir) {
    cleanDir(outputDir, args.dry_run);
  }

  for (const plan of plans.selected_packages) {
    const result = packPackage(plan, args, repoRoot, outputDir);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first npm package pack failure.");
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
  const tarballs = results.flatMap((result) => result.tarballs || []);

  return {
    packages: results.length,
    packed: results.filter((result) => result.status === "packed").length,
    planned: results.filter((result) => result.status === "planned").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    tarballs: tarballs.length,
    tarballs_existing: tarballs.filter((tarball) => tarball.exists).length,
    total_bytes: tarballs.reduce(
      (sum, tarball) => sum + Number(tarball.size_bytes || 0),
      0,
    ),
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
        packed: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        tarballs: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "packed") groups[group].packed += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    groups[group].tarballs += result.tarballs.length;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution, outputDir) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results);
  const tarballs = execution.results.flatMap((result) =>
    result.tarballs.map((tarball) => ({
      package: result.name,
      version: result.version,
      project: result.project,
      ...tarball,
      absolute_file: undefined,
    })),
  );

  const status =
    totals.failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : execution.results.length === 0
          ? "empty"
          : args.dry_run
            ? "planned"
            : totals.packed > 0
              ? "packed"
              : "current";

  return {
    schema_version: 1,
    type: "npm-pack-packages",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      packages_file: plans.packages_file,
      packages_available: plans.packages_available,
      output_dir: toRelativePath(outputDir, repoRoot),
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      package_manager: args.package_manager,
      pack_command: args.pack_command,
      publishable_only: args.pack_publishable_only,
      include_private: args.include_private,
      include_invalid: args.include_invalid,
      ignore_scripts: args.ignore_scripts,
      verify_tarballs: args.verify_tarballs,
      clean_output_dir: args.clean_output_dir,
      max_packages: args.max_packages,
      dry_run: args.dry_run,
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
      private: plan.private,
      publishable: plan.publishable,
      valid: plan.valid,
      expected_tarball: plan.expected_tarball,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_project: groupResults(execution.results, "project"),
    },
    results: execution.results.map((result) => ({
      ...result,
      tarballs: result.tarballs.map((tarball) => ({
        ...tarball,
        absolute_file: undefined,
      })),
    })),
    tarballs,
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function createMarkdownSummary(report) {
  const lines = [
    `# 📦 ${PROJECT_NAME} NPM Package Pack`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Selected packages: \`${report.discovery.selected_packages}\``,
    `- Packed: \`${report.totals.packed}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Tarballs: \`${report.totals.tarballs}\``,
    `- Total size: \`${formatBytes(report.totals.total_bytes)}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Pack Configuration",
    "",
    `- Package manager: \`${report.config.package_manager}\``,
    `- Output directory: \`${report.config.output_dir}\``,
    `- Publishable only: \`${report.config.publishable_only ? "true" : "false"}\``,
    `- Include private: \`${report.config.include_private ? "true" : "false"}\``,
    `- Ignore scripts: \`${report.config.ignore_scripts ? "true" : "false"}\``,
    `- Verify tarballs: \`${report.config.verify_tarballs ? "true" : "false"}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🎯 Selected Packages",
    "",
  ];

  if (!report.selected_packages.length) {
    lines.push("No npm packages were selected.");
  } else {
    lines.push(
      "| Package | Version | Project | Path | Publishable | Expected Tarball |",
    );
    lines.push("|---|---|---|---|---:|---|");

    for (const pkg of report.selected_packages) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.version || "none")}\` | \`${escapeMarkdown(pkg.project || "none")}\` | \`${escapeMarkdown(pkg.path)}\` | \`${pkg.publishable ? "true" : "false"}\` | \`${escapeMarkdown(pkg.expected_tarball)}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Pack Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No package pack results were produced.");
  } else {
    lines.push("| Status | Package | Version | Tarballs | Duration |");
    lines.push("|---|---|---|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${escapeMarkdown(result.name || "unknown")}\` | \`${escapeMarkdown(result.version || "none")}\` | \`${result.tarballs.length}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.tarballs.length) {
    lines.push("");
    lines.push("## 📦 Tarballs");
    lines.push("");
    lines.push("| Package | File | Size | SHA256 |");
    lines.push("|---|---|---:|---|");

    for (const tarball of report.tarballs) {
      lines.push(
        `| \`${escapeMarkdown(tarball.package || tarball.name || "unknown")}\` | \`${escapeMarkdown(tarball.file || tarball.filename)}\` | \`${formatBytes(tarball.size_bytes)}\` | \`${String(tarball.sha256 || "").slice(0, 16)}\` |`,
      );
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
  setGitHubOutput("npm_pack_packages_file", report.config.output_file);
  setGitHubOutput(
    "npm_pack_packages_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("npm_pack_packages_status", report.status);
  setGitHubOutput("npm_pack_packages_ok", report.totals.ok ? "true" : "false");
  setGitHubOutput(
    "npm_pack_packages_selected",
    String(report.discovery.selected_packages),
  );
  setGitHubOutput("npm_pack_packages_packed", String(report.totals.packed));
  setGitHubOutput("npm_pack_packages_planned", String(report.totals.planned));
  setGitHubOutput("npm_pack_packages_failed", String(report.totals.failed));
  setGitHubOutput("npm_pack_packages_invalid", String(report.totals.invalid));
  setGitHubOutput("npm_pack_packages_tarballs", String(report.totals.tarballs));
  setGitHubOutput(
    "npm_pack_packages_total_bytes",
    String(report.totals.total_bytes),
  );
  setGitHubOutput(
    "npm_pack_packages_names",
    report.selected_packages.map((pkg) => pkg.name).join(","),
  );
  setGitHubOutput(
    "npm_pack_packages_names_json",
    JSON.stringify(report.selected_packages.map((pkg) => pkg.name)),
  );
  setGitHubOutput(
    "npm_pack_packages_tarball_files",
    report.tarballs.map((tarball) => tarball.file).join(","),
  );
  setGitHubOutput(
    "npm_pack_packages_tarball_files_json",
    JSON.stringify(report.tarballs.map((tarball) => tarball.file)),
  );
  setGitHubOutput(
    "npm_pack_packages_tarballs_json",
    JSON.stringify(report.tarballs),
  );
  setGitHubOutput(
    "npm_pack_packages_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputDir = resolvePath(args.output_dir, repoRoot);
  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing npm package packing.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.selected_packages.length === 0) {
    logger.error("No npm packages were selected for packing.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          results: [],
          stopped_early: false,
        }
      : await executePlans(plans, args, repoRoot, outputDir);

  const report = createReport(args, repoRoot, plans, execution, outputDir);
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

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `npm package packing completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
