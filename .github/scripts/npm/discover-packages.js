#!/usr/bin/env node
// .github/scripts/npm/discover-packages.js
// =============================================================================
// Aerealith AI — NPM Package Discovery
// -----------------------------------------------------------------------------
// Purpose:
//   Discover workspace packages and publishable npm packages for downstream CI,
//   release, provenance, and publishing jobs.
//
// Input:
//   - .github/npm/packages.json
//   - .github/npm/packages.jsonc
//   - .github/npm/packages.yaml
//   - .github/npm/packages.yml
//   - .github/npm/discover-packages.json
//   - package.json
//   - pnpm-workspace.yaml
//   - nx.json / project.json metadata
//   - repository package.json files
//
// Output:
//   - artifacts/ci/npm-packages.json
//   - artifacts/npm/discover-packages.json
//   - artifacts/npm/discover-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not call npm, pnpm, yarn, or bun.
//   - Treats private packages as non-publishable unless configured otherwise.
//   - Produces a matrix-friendly artifact for later publish/build jobs.
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
    info: (message) => console.log(`[npm-discovery] ${message}`),
    warn: (message) => console.warn(`[npm-discovery] WARN: ${message}`),
    error: (message) => console.error(`[npm-discovery] ERROR: ${message}`),
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
  ".github/npm/packages.json",
  ".github/npm/packages.jsonc",
  ".github/npm/packages.yaml",
  ".github/npm/packages.yml",
  ".github/npm/discover-packages.json",
  ".github/npm/discover-packages.jsonc",
  ".github/npm/discover-packages.yaml",
  ".github/npm/discover-packages.yml",
  "npm/packages.json",
  "npm/packages.jsonc",
  "npm/packages.yaml",
  "npm/packages.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/ci/npm-packages.json";
const DEFAULT_REPORT_FILE = "artifacts/npm/discover-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/npm/discover-packages.md";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const DEFAULT_ACCESS = "public";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|\/\/registry\.npmjs\.org\/:_authToken=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    config_file: process.env.NPM_DISCOVER_PACKAGES_CONFIG_FILE || "",
    output_file:
      process.env.NPM_DISCOVER_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    report_file:
      process.env.NPM_DISCOVER_PACKAGES_REPORT_FILE || DEFAULT_REPORT_FILE,
    summary_file:
      process.env.NPM_DISCOVER_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    registry:
      process.env.NPM_DISCOVER_PACKAGES_REGISTRY ||
      process.env.NPM_CONFIG_REGISTRY ||
      DEFAULT_REGISTRY,
    access:
      process.env.NPM_DISCOVER_PACKAGES_ACCESS ||
      process.env.NPM_CONFIG_ACCESS ||
      DEFAULT_ACCESS,

    scan_roots: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_SCAN_ROOTS,
    ),
    include_packages: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_EXCLUDE_PROJECTS,
    ),
    include_paths: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_EXCLUDE_PATHS,
    ),

    tags: normalizeStringList(process.env.NPM_DISCOVER_PACKAGES_TAGS),
    default_tag:
      process.env.NPM_DISCOVER_PACKAGES_DEFAULT_TAG ||
      process.env.NPM_CONFIG_TAG ||
      "latest",

    scan_repository: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_SCAN_REPOSITORY,
      true,
    ),
    config_only: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_CONFIG_ONLY,
      false,
    ),
    workspace_only: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_WORKSPACE_ONLY,
      false,
    ),
    publishable_only: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_PUBLISHABLE_ONLY,
      false,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    include_invalid: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_INVALID,
      true,
    ),
    include_root_package: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_ROOT,
      true,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_invalid: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_FAIL_ON_INVALID,
      false,
    ),
    fail_on_duplicate_names: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_FAIL_ON_DUPLICATE_NAMES,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_FAIL_ON_ERROR,
      true,
    ),

    max_packages: normalizeInteger(
      process.env.NPM_DISCOVER_PACKAGES_MAX_PACKAGES,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_report_file: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_WRITE_REPORT,
      true,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_STEP_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.NPM_DISCOVER_PACKAGES_PRINT, true),
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

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--report") {
      args.report_file = argv[index + 1];
      args.write_report_file = true;
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = argv[index + 1];
      args.write_summary_file = true;
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

    if (arg === "--tag") {
      args.tags.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--default-tag") {
      args.default_tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--scan-repository") {
      args.scan_repository = true;
      args.config_only = false;
      continue;
    }

    if (arg === "--no-scan-repository") {
      args.scan_repository = false;
      continue;
    }

    if (arg === "--config-only") {
      args.config_only = true;
      args.scan_repository = false;
      continue;
    }

    if (arg === "--workspace-only") {
      args.workspace_only = true;
      continue;
    }

    if (arg === "--no-workspace-only") {
      args.workspace_only = false;
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

    if (arg === "--no-report") {
      args.write_report_file = false;
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
  args.tags = [...new Set(args.tags)];
  args.default_tag = normalizeString(args.default_tag, "latest");
  args.max_packages = Math.max(0, args.max_packages);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Discovery

Usage:
  node .github/scripts/npm/discover-packages.js [options]

Examples:
  node .github/scripts/npm/discover-packages.js
  node .github/scripts/npm/discover-packages.js --publishable-only
  node .github/scripts/npm/discover-packages.js --scan-root libs --scan-root apps
  node .github/scripts/npm/discover-packages.js --config .github/npm/packages.json

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Package discovery config.
  -o, --output <file>                      Matrix artifact. Default: artifacts/ci/npm-packages.json.
      --report <file>                      Full JSON report. Default: artifacts/npm/discover-packages.json.
      --summary <file>                     Markdown summary. Default: artifacts/npm/discover-packages.md.
      --registry <url>                     npm registry. Default: https://registry.npmjs.org/.
      --access <public|restricted>         Publish access. Default: public.
      --scan-root <path,list>              Root path(s) to scan.
      --include <list>                     Include package names.
      --exclude <list>                     Exclude package names.
      --include-project <list>             Include project names.
      --exclude-project <list>             Exclude project names.
      --include-path <list>                Include package path patterns.
      --exclude-path <pattern>             Exclude path pattern.
      --tag <list>                         Extra dist-tags metadata.
      --default-tag <tag>                  Default dist-tag. Default: latest.
      --scan-repository                    Scan repository package.json files. Default.
      --no-scan-repository                 Do not scan repository.
      --config-only                        Use only configured package entries.
      --workspace-only                     Only include packages matched by workspace globs.
      --publishable-only                   Only include publishable packages.
      --include-private                    Include private packages in output.
      --no-include-private                 Exclude private packages unless configured publishable. Default.
      --include-invalid                    Include invalid package records. Default.
      --no-include-invalid                 Exclude invalid package records.
      --include-root                       Include root package.json. Default.
      --no-include-root                    Exclude root package.json.
      --fail-if-empty                      Exit non-zero if no packages are discovered.
      --fail-on-invalid                    Exit non-zero if invalid packages are found.
      --fail-on-duplicate-names            Exit non-zero on duplicate package names. Default.
      --no-fail-on-duplicate-names         Allow duplicate package names.
      --fail-on-error                      Exit non-zero on discovery errors. Default.
      --no-fail-on-error                   Do not fail on discovery errors.
      --max-packages <number>              Maximum packages to include.
      --no-report                          Do not write full JSON report.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not write files.
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
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

function parseSimplePackagesYaml(text) {
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
    return parseSimplePackagesYaml(text);
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

function normalizeTag(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

function safeId(value) {
  return (
    normalizeString(value, "npm-package")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/@-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "npm-package"
  );
}

function packageScope(packageName) {
  const name = normalizeString(packageName);

  if (!name.startsWith("@")) return "";

  return name.split("/")[0] || "";
}

function packageUnscopedName(packageName) {
  const name = normalizeString(packageName);

  if (!name.startsWith("@")) return name;

  return name.split("/").slice(1).join("/") || name;
}

function readPackageJson(filePath) {
  return safeJsonParse(fs.readFileSync(filePath, "utf8"), null);
}

function findNearestFile(startDir, repoRoot, fileName) {
  let current = path.resolve(startDir);
  const root = path.resolve(repoRoot);

  while (current.startsWith(root)) {
    const candidate = path.join(current, fileName);

    if (isFile(candidate)) return candidate;

    if (current === root) break;

    current = path.dirname(current);
  }

  return "";
}

function readRootPackageJson(repoRoot) {
  const rootPackageJson = resolvePath("package.json", repoRoot);

  if (!isFile(rootPackageJson)) return null;

  return readPackageJson(rootPackageJson);
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

function projectNameFromPackage(packageDir, repoRoot, packageJson) {
  const projectJsonPath = findNearestFile(
    resolvePath(packageDir, repoRoot),
    repoRoot,
    "project.json",
  );

  if (projectJsonPath) {
    const projectJson = readJsonFile(projectJsonPath, repoRoot, null);

    if (projectJson?.name) return normalizeString(projectJson.name);
  }

  if (packageJson?.name) return normalizeString(packageJson.name);

  if (!packageDir || packageDir === ".") {
    return normalizeString(path.basename(repoRoot), "root");
  }

  return normalizeString(path.basename(packageDir), "package");
}

function inferPackageType(packageJson) {
  if (packageJson?.type === "module") return "module";
  if (packageJson?.type === "commonjs") return "commonjs";
  return "commonjs";
}

function hasPublishScript(packageJson) {
  return Boolean(
    packageJson?.scripts?.prepublishOnly ||
    packageJson?.scripts?.prepack ||
    packageJson?.scripts?.prepare ||
    packageJson?.scripts?.build,
  );
}

function hasTypes(packageJson, packageDir, repoRoot) {
  if (packageJson?.types || packageJson?.typings) return true;

  const typeCandidates = [
    "index.d.ts",
    "src/index.d.ts",
    "dist/index.d.ts",
    "types/index.d.ts",
  ];

  return typeCandidates.some((candidate) =>
    isFile(resolvePath(path.join(packageDir, candidate), repoRoot)),
  );
}

function inferEntryPoints(packageJson) {
  const entries = [];

  if (packageJson?.main) entries.push({ type: "main", path: packageJson.main });
  if (packageJson?.module)
    entries.push({ type: "module", path: packageJson.module });
  if (packageJson?.browser)
    entries.push({ type: "browser", path: packageJson.browser });
  if (packageJson?.types)
    entries.push({ type: "types", path: packageJson.types });
  if (packageJson?.typings)
    entries.push({ type: "typings", path: packageJson.typings });

  if (typeof packageJson?.exports === "string") {
    entries.push({ type: "exports", path: packageJson.exports });
  }

  if (packageJson?.exports && typeof packageJson.exports === "object") {
    for (const [key, value] of Object.entries(packageJson.exports)) {
      if (typeof value === "string") {
        entries.push({ type: `exports:${key}`, path: value });
      } else if (value && typeof value === "object") {
        for (const [condition, conditionValue] of Object.entries(value)) {
          if (typeof conditionValue === "string") {
            entries.push({
              type: `exports:${key}:${condition}`,
              path: conditionValue,
            });
          }
        }
      }
    }
  }

  return entries;
}

function normalizeFilesList(packageJson) {
  return Array.isArray(packageJson?.files)
    ? packageJson.files.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizePublishConfig(packageJson) {
  const publishConfig = packageJson?.publishConfig || {};

  return {
    registry: normalizeRegistry(publishConfig.registry || ""),
    access: normalizeString(publishConfig.access || ""),
    tag: normalizeString(publishConfig.tag || ""),
    provenance:
      publishConfig.provenance === undefined
        ? null
        : Boolean(publishConfig.provenance),
  };
}

function configPackageRecords(config) {
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

function normalizeConfigRecord(record, args, repoRoot, workspacePatterns) {
  const packageJsonPath = toPosixPath(
    normalizeString(
      record.package_json ||
        record.packageJson ||
        record.file ||
        path.join(record.path || ".", "package.json"),
    ),
  );
  const absolutePackageJsonPath = resolvePath(packageJsonPath, repoRoot);
  const packageDir = toPosixPath(path.dirname(packageJsonPath));
  const packageJson = isFile(absolutePackageJsonPath)
    ? readPackageJson(absolutePackageJsonPath)
    : null;

  return normalizePackageRecord(
    {
      package_json_file: packageJsonPath,
      package_dir: packageDir === "." ? "." : packageDir,
      package_json: packageJson || {
        name: record.name,
        version: record.version,
        private: record.private,
        publishConfig: record.publish_config || record.publishConfig,
      },
      source_type: "config",
      configured: record,
    },
    args,
    repoRoot,
    workspacePatterns,
  );
}

function normalizePackageRecord(input, args, repoRoot, workspacePatterns) {
  const packageJson = input.package_json || {};
  const packageJsonFile = toPosixPath(input.package_json_file);
  const packageDir = toPosixPath(
    input.package_dir || path.dirname(packageJsonFile),
  );
  const absolutePackageJson = resolvePath(packageJsonFile, repoRoot);
  const isRoot = packageDir === "." || packageJsonFile === "package.json";
  const name = normalizeString(packageJson.name);
  const version = normalizeString(packageJson.version);
  const project = projectNameFromPackage(packageDir, repoRoot, packageJson);
  const publishConfig = normalizePublishConfig(packageJson);
  const workspace =
    workspacePatternMatchesPackage(packageDir, workspacePatterns) || isRoot;
  const privatePackage = Boolean(packageJson.private);
  const configured = input.configured || {};
  const forcedPublishable = normalizeBoolean(
    configured.publishable ?? configured.publish ?? configured.force_publish,
    false,
  );

  const registry = normalizeRegistry(
    configured.registry || publishConfig.registry || args.registry,
  );

  const access = normalizeString(
    configured.access || publishConfig.access || args.access,
    args.access,
  );

  const defaultTag = normalizeTag(
    configured.default_tag ||
      configured.defaultTag ||
      publishConfig.tag ||
      args.default_tag,
  );

  const tags = [
    ...normalizeStringList(configured.tags || configured.tag || []),
    ...args.tags,
    defaultTag,
  ]
    .map(normalizeTag)
    .filter(Boolean);

  const errors = [];
  const warnings = [];

  if (!isFile(absolutePackageJson)) {
    errors.push(`package.json does not exist: ${packageJsonFile}`);
  }

  if (!packageJson || typeof packageJson !== "object") {
    errors.push(`package.json is invalid: ${packageJsonFile}`);
  }

  if (!name) {
    errors.push(`Package name is missing: ${packageJsonFile}`);
  }

  if (!version) {
    errors.push(`Package version is missing: ${packageJsonFile}`);
  }

  if (name && !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)) {
    warnings.push(`Package name may not be npm-compatible: ${name}`);
  }

  if (privatePackage && !forcedPublishable) {
    warnings.push("Package is private and will not be treated as publishable.");
  }

  if (!workspace && args.workspace_only) {
    warnings.push("Package is not matched by workspace patterns.");
  }

  const publishable = Boolean(
    forcedPublishable || (!privatePackage && name && version && !errors.length),
  );

  const dependencies = {
    dependencies: Object.keys(packageJson.dependencies || {}).length,
    dev_dependencies: Object.keys(packageJson.devDependencies || {}).length,
    peer_dependencies: Object.keys(packageJson.peerDependencies || {}).length,
    optional_dependencies: Object.keys(packageJson.optionalDependencies || {})
      .length,
  };

  return {
    id: safeId(`${input.source_type || "scan"}:${name || packageJsonFile}`),
    source_type: input.source_type || "repository-scan",
    name,
    unscoped_name: packageUnscopedName(name),
    scope: packageScope(name),
    version,
    project,
    package_json: packageJsonFile,
    path: packageDir,
    root: packageDir,
    is_root: isRoot,
    workspace,
    private: privatePackage,
    publishable,
    forced_publishable: forcedPublishable,
    type: inferPackageType(packageJson),
    package_manager: packageManagerFromRepo(repoRoot),
    registry,
    access,
    default_tag: defaultTag,
    tags: [...new Set(tags)],
    publish_config: publishConfig,
    scripts: Object.keys(packageJson.scripts || {}).sort(),
    has_build_script: Boolean(packageJson.scripts?.build),
    has_test_script: Boolean(packageJson.scripts?.test),
    has_publish_script: hasPublishScript(packageJson),
    has_types: hasTypes(packageJson, packageDir, repoRoot),
    entry_points: inferEntryPoints(packageJson),
    files: normalizeFilesList(packageJson),
    dependencies,
    package_hash: isFile(absolutePackageJson)
      ? fileSha256(absolutePackageJson)
      : "",
    metadata_hash: sha256(
      JSON.stringify({
        name,
        version,
        packageJsonFile,
        publishable,
        registry,
        access,
        defaultTag,
      }),
    ),
    configured: Boolean(input.configured),
    enabled: normalizeBoolean(input.configured?.enabled, true),
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

function discoverPackageJsonFiles(args, repoRoot) {
  if (!args.scan_repository || args.config_only) return [];

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
    .sort();
}

function planMatchesFilters(plan, args) {
  if (!plan.enabled) return false;

  if (!args.include_private && plan.private && !plan.forced_publishable) {
    return false;
  }

  if (!args.include_invalid && !plan.valid) {
    return false;
  }

  if (args.publishable_only && !plan.publishable) {
    return false;
  }

  if (args.workspace_only && !plan.workspace) {
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

  if (!shouldIncludePath(plan.package_json, args.include_paths)) {
    return false;
  }

  if (shouldExcludePath(plan.package_json, args.exclude_paths)) {
    return false;
  }

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = plan.name || plan.package_json;

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
      tags: [...new Set([...(existing.tags || []), ...(plan.tags || [])])],
      warnings: [
        ...new Set([...(existing.warnings || []), ...(plan.warnings || [])]),
      ],
      errors: [
        ...new Set([...(existing.errors || []), ...(plan.errors || [])]),
      ],
      valid: existing.valid && plan.valid,
      publishable: existing.publishable || plan.publishable,
      forced_publishable:
        existing.forced_publishable || plan.forced_publishable,
      configured: existing.configured || plan.configured,
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.package_json.localeCompare(right.package_json)
    );
  });
}

function findDuplicatePackageNames(plans) {
  const names = new Map();

  for (const plan of plans) {
    if (!plan.name) continue;

    if (!names.has(plan.name)) {
      names.set(plan.name, []);
    }

    names.get(plan.name).push(plan.package_json);
  }

  return [...names.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({
      name,
      files,
    }));
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const workspacePatterns = getWorkspacePatterns(repoRoot);

  const configPlans = configPackageRecords(config).map((record) =>
    normalizeConfigRecord(record, args, repoRoot, workspacePatterns),
  );

  const scannedPlans = discoverPackageJsonFiles(args, repoRoot).map(
    (packageJsonFile) => {
      const absoluteFile = resolvePath(packageJsonFile, repoRoot);
      const packageJson = readPackageJson(absoluteFile);

      return normalizePackageRecord(
        {
          package_json_file: packageJsonFile,
          package_dir: toPosixPath(path.dirname(packageJsonFile)),
          package_json: packageJson,
          source_type: "repository-scan",
        },
        args,
        repoRoot,
        workspacePatterns,
      );
    },
  );

  const allPlans = dedupePlans([...configPlans, ...scannedPlans]);
  const selected = allPlans
    .filter((plan) => planMatchesFilters(plan, args))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    workspace_patterns: workspacePatterns,
    configured_packages: configPlans.length,
    scanned_packages: scannedPlans.length,
    all_packages: allPlans,
    selected_packages: selected,
    duplicate_names: findDuplicatePackageNames(allPlans),
  };
}

function createArtifactRecord(plan) {
  return {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    unscoped_name: plan.unscoped_name,
    scope: plan.scope,
    version: plan.version,
    project: plan.project,
    package_json: plan.package_json,
    path: plan.path,
    root: plan.root,
    is_root: plan.is_root,
    workspace: plan.workspace,
    private: plan.private,
    publishable: plan.publishable,
    forced_publishable: plan.forced_publishable,
    type: plan.type,
    package_manager: plan.package_manager,
    registry: plan.registry,
    access: plan.access,
    default_tag: plan.default_tag,
    tags: plan.tags,
    publish_config: plan.publish_config,
    scripts: plan.scripts,
    has_build_script: plan.has_build_script,
    has_test_script: plan.has_test_script,
    has_publish_script: plan.has_publish_script,
    has_types: plan.has_types,
    entry_points: plan.entry_points,
    files: plan.files,
    dependencies: plan.dependencies,
    package_hash: plan.package_hash,
    metadata_hash: plan.metadata_hash,
    configured: plan.configured,
    enabled: plan.enabled,
    valid: plan.valid,
    warnings: plan.warnings,
    errors: plan.errors,
  };
}

function summarizePlans(plans) {
  return {
    packages: plans.length,
    valid: plans.filter((plan) => plan.valid).length,
    invalid: plans.filter((plan) => !plan.valid).length,
    enabled: plans.filter((plan) => plan.enabled).length,
    disabled: plans.filter((plan) => !plan.enabled).length,
    private: plans.filter((plan) => plan.private).length,
    public: plans.filter((plan) => !plan.private).length,
    workspace: plans.filter((plan) => plan.workspace).length,
    publishable: plans.filter((plan) => plan.publishable).length,
    forced_publishable: plans.filter((plan) => plan.forced_publishable).length,
    with_build_script: plans.filter((plan) => plan.has_build_script).length,
    with_test_script: plans.filter((plan) => plan.has_test_script).length,
    with_types: plans.filter((plan) => plan.has_types).length,
    root_packages: plans.filter((plan) => plan.is_root).length,
    scopes: [...new Set(plans.map((plan) => plan.scope).filter(Boolean))]
      .length,
    registries: [...new Set(plans.map((plan) => plan.registry).filter(Boolean))]
      .length,
  };
}

function groupPlans(plans, key) {
  const groups = {};

  for (const plan of plans) {
    const group = plan[key] || "none";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        valid: 0,
        invalid: 0,
        private: 0,
        publishable: 0,
        workspace: 0,
      };
    }

    groups[group].count += 1;
    if (plan.valid) groups[group].valid += 1;
    if (!plan.valid) groups[group].invalid += 1;
    if (plan.private) groups[group].private += 1;
    if (plan.publishable) groups[group].publishable += 1;
    if (plan.workspace) groups[group].workspace += 1;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans) {
  const github = getGitMetadata(repoRoot);
  const selected = plans.selected_packages.map(createArtifactRecord);
  const all = plans.all_packages.map(createArtifactRecord);
  const totals = summarizePlans(plans.selected_packages);
  const invalid = selected.filter((plan) => !plan.valid);
  const publishable = selected.filter((plan) => plan.publishable);

  const status =
    totals.packages === 0
      ? "empty"
      : plans.duplicate_names.length > 0
        ? "duplicate-names"
        : invalid.length > 0
          ? "invalid"
          : publishable.length > 0
            ? "publishable"
            : "discovered";

  return {
    schema_version: 1,
    type: "npm-package-discovery",
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
      report_file: args.write_report_file
        ? toRelativePath(resolvePath(args.report_file, repoRoot), repoRoot)
        : null,
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      registry: args.registry,
      access: args.access,
      scan_roots: args.scan_roots,
      workspace_patterns: plans.workspace_patterns,
      scan_repository: args.scan_repository,
      config_only: args.config_only,
      workspace_only: args.workspace_only,
      publishable_only: args.publishable_only,
      include_private: args.include_private,
      include_invalid: args.include_invalid,
      include_root_package: args.include_root_package,
      max_packages: args.max_packages,
      dry_run: args.dry_run,
    },
    discovery: {
      configured_packages: plans.configured_packages,
      scanned_packages: plans.scanned_packages,
      discovered_packages: plans.all_packages.length,
      selected_packages: plans.selected_packages.length,
      duplicate_names: plans.duplicate_names.length,
    },
    totals,
    groups: {
      by_source_type: groupPlans(plans.selected_packages, "source_type"),
      by_scope: groupPlans(plans.selected_packages, "scope"),
      by_registry: groupPlans(plans.selected_packages, "registry"),
      by_package_manager: groupPlans(
        plans.selected_packages,
        "package_manager",
      ),
      by_type: groupPlans(plans.selected_packages, "type"),
    },
    packages: selected,
    npm_packages: selected,
    publishable_packages: publishable,
    matrix: {
      include: selected.map((plan) => ({
        name: plan.name,
        version: plan.version,
        package_json: plan.package_json,
        path: plan.path,
        project: plan.project,
        private: plan.private,
        publishable: plan.publishable,
        registry: plan.registry,
        access: plan.access,
        tag: plan.default_tag,
        package_manager: plan.package_manager,
      })),
    },
    publish_matrix: {
      include: publishable.map((plan) => ({
        name: plan.name,
        version: plan.version,
        package_json: plan.package_json,
        path: plan.path,
        project: plan.project,
        registry: plan.registry,
        access: plan.access,
        tag: plan.default_tag,
        package_manager: plan.package_manager,
      })),
    },
    all_packages: all,
    duplicate_names: plans.duplicate_names,
    invalid_packages: invalid,
    warnings: selected.flatMap((plan) =>
      plan.warnings.map((warning) => ({
        package: plan.name || plan.package_json,
        path: plan.path,
        warning,
      })),
    ),
    status,
  };
}

function createOutputArtifact(report) {
  return {
    schema_version: report.schema_version,
    type: "npm-packages",
    project: report.project,
    repository: report.repository,
    created_at: report.created_at,
    github: report.github,
    discovery: report.discovery,
    totals: report.totals,
    packages: report.packages,
    npm_packages: report.npm_packages,
    publishable_packages: report.publishable_packages,
    matrix: report.matrix,
    publish_matrix: report.publish_matrix,
    duplicate_names: report.duplicate_names,
    invalid_packages: report.invalid_packages,
    status: report.status,
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
    `# 📦 ${PROJECT_NAME} NPM Package Discovery`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Selected packages: \`${report.discovery.selected_packages}\``,
    `- Publishable: \`${report.totals.publishable}\``,
    `- Private: \`${report.totals.private}\``,
    `- Valid: \`${report.totals.valid}\``,
    `- Invalid: \`${report.totals.invalid}\``,
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
    "## ⚙️ Discovery Configuration",
    "",
    `- Registry: \`${report.config.registry}\``,
    `- Access: \`${report.config.access}\``,
    `- Config only: \`${report.config.config_only ? "true" : "false"}\``,
    `- Scan repository: \`${report.config.scan_repository ? "true" : "false"}\``,
    `- Workspace only: \`${report.config.workspace_only ? "true" : "false"}\``,
    `- Publishable only: \`${report.config.publishable_only ? "true" : "false"}\``,
    `- Include private: \`${report.config.include_private ? "true" : "false"}\``,
    `- Scan roots: ${report.config.scan_roots.map((item) => `\`${item}\``).join(", ")}`,
    "",
    "## 📊 Totals",
    "",
    `- Configured packages: \`${report.discovery.configured_packages}\``,
    `- Scanned packages: \`${report.discovery.scanned_packages}\``,
    `- Discovered packages: \`${report.discovery.discovered_packages}\``,
    `- Workspace packages: \`${report.totals.workspace}\``,
    `- Public packages: \`${report.totals.public}\``,
    `- With build script: \`${report.totals.with_build_script}\``,
    `- With test script: \`${report.totals.with_test_script}\``,
    `- With types: \`${report.totals.with_types}\``,
    `- Scopes: \`${report.totals.scopes}\``,
    "",
    "## 🎯 Selected Packages",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No npm packages were discovered.");
  } else {
    lines.push(
      "| Package | Version | Path | Project | Private | Publishable | Registry |",
    );
    lines.push("|---|---|---|---|---:|---:|---|");

    for (const pkg of report.packages) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.version || "none")}\` | \`${escapeMarkdown(pkg.path)}\` | \`${escapeMarkdown(pkg.project || "none")}\` | \`${pkg.private ? "true" : "false"}\` | \`${pkg.publishable ? "true" : "false"}\` | \`${escapeMarkdown(pkg.registry || "none")}\` |`,
      );
    }
  }

  if (report.publishable_packages.length) {
    lines.push("");
    lines.push("## 🚀 Publishable Packages");
    lines.push("");

    for (const pkg of report.publishable_packages) {
      lines.push(`- \`${pkg.name}@${pkg.version}\` from \`${pkg.path}\``);
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
        `| \`${escapeMarkdown(duplicate.name)}\` | ${duplicate.files.map((file) => `\`${escapeMarkdown(file)}\``).join("<br>")} |`,
      );
    }
  }

  if (report.invalid_packages.length) {
    lines.push("");
    lines.push("## ❌ Invalid Packages");
    lines.push("");
    lines.push("| Package | File | Errors |");
    lines.push("|---|---|---|");

    for (const pkg of report.invalid_packages) {
      lines.push(
        `| \`${escapeMarkdown(pkg.name || "unknown")}\` | \`${escapeMarkdown(pkg.package_json)}\` | ${pkg.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings.slice(0, 100)) {
      lines.push(
        `- \`${escapeMarkdown(warning.package)}\`: ${escapeMarkdown(warning.warning)}`,
      );
    }

    if (report.warnings.length > 100) {
      lines.push(
        `- ...and \`${report.warnings.length - 100}\` more warning(s).`,
      );
    }
  }

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- Package artifact: \`${report.config.output_file}\``);
  lines.push(
    `- Full report: \`${report.config.report_file || "not written"}\``,
  );
  lines.push(`- Summary: \`${report.config.summary_file || "not written"}\``);

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
  setGitHubOutput("npm_packages_file", report.config.output_file);
  setGitHubOutput("npm_discover_packages_file", report.config.output_file);
  setGitHubOutput(
    "npm_discover_packages_report_file",
    report.config.report_file || "",
  );
  setGitHubOutput(
    "npm_discover_packages_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("npm_discover_packages_status", report.status);
  setGitHubOutput(
    "npm_discover_packages_count",
    String(report.totals.packages),
  );
  setGitHubOutput(
    "npm_discover_packages_publishable",
    String(report.totals.publishable),
  );
  setGitHubOutput(
    "npm_discover_packages_private",
    String(report.totals.private),
  );
  setGitHubOutput("npm_discover_packages_valid", String(report.totals.valid));
  setGitHubOutput(
    "npm_discover_packages_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "npm_discover_packages_duplicate_names",
    String(report.discovery.duplicate_names),
  );
  setGitHubOutput(
    "npm_discover_packages_names",
    report.packages
      .map((pkg) => pkg.name)
      .filter(Boolean)
      .join(","),
  );
  setGitHubOutput(
    "npm_discover_packages_names_json",
    JSON.stringify(report.packages.map((pkg) => pkg.name).filter(Boolean)),
  );
  setGitHubOutput(
    "npm_discover_packages_publishable_names",
    report.publishable_packages.map((pkg) => pkg.name).join(","),
  );
  setGitHubOutput(
    "npm_discover_packages_publishable_names_json",
    JSON.stringify(report.publishable_packages.map((pkg) => pkg.name)),
  );
  setGitHubOutput(
    "npm_discover_packages_matrix_json",
    JSON.stringify(report.matrix),
  );
  setGitHubOutput(
    "npm_discover_packages_publish_matrix_json",
    JSON.stringify(report.publish_matrix),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const reportFile = resolvePath(args.report_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Discovering npm packages.");

  const plans = createPlans(args, repoRoot);
  const report = createReport(args, repoRoot, plans);
  const outputArtifact = createOutputArtifact(report);
  const outputJson = `${JSON.stringify(outputArtifact, null, 2)}\n`;
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  if (args.fail_if_empty && report.discovery.selected_packages === 0) {
    logger.error("No npm packages were discovered.");
    process.exitCode = 1;
  }

  writeTextFile(outputFile, outputJson, {
    dry_run: args.dry_run,
  });

  if (args.write_report_file) {
    writeTextFile(reportFile, reportJson, {
      dry_run: args.dry_run,
    });
  }

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
    console.log(reportJson.trim());
  }

  if (
    args.fail_on_error &&
    args.fail_on_duplicate_names &&
    report.discovery.duplicate_names > 0
  ) {
    logger.error(
      `npm package discovery found ${report.discovery.duplicate_names} duplicate package name group(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && args.fail_on_invalid && report.totals.invalid > 0) {
    logger.error(
      `npm package discovery found ${report.totals.invalid} invalid package(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_empty && report.discovery.selected_packages === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
