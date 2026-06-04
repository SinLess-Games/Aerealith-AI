#!/usr/bin/env node
// .github/scripts/npm/discover-packages.js
// =============================================================================
// Aerealith AI — NPM Package Discovery
// -----------------------------------------------------------------------------
// Discovers publishable workspace packages without recursing through generated
// folders, symlink loops, or application packages that should not be published.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".github",
  ".next",
  ".nx",
  ".pnpm-store",
  ".turbo",
  ".wrangler",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "out-tsc",
  "reports",
  "tmp",
  "temp",
]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|_authToken=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|NPM_TOKEN=[^\s]+)/gi;

const logger = {
  info: (message) => console.log(`[npm-discovery] ${message}`),
  warn: (message) => console.warn(`[npm-discovery] WARN: ${message}`),
  error: (message) => console.error(`[npm-discovery] ERROR: ${message}`),
  formatError: (error) => {
    if (!error) return "unknown error";
    if (typeof error === "string") return error;
    return error.stack || error.message || String(error);
  },
};

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
    output_file:
      process.env.NPM_DISCOVER_PACKAGES_OUTPUT_FILE ||
      "artifacts/ci/npm-packages.json",
    report_file:
      process.env.NPM_DISCOVER_PACKAGES_REPORT_FILE ||
      "artifacts/npm/discover-packages.json",
    summary_file:
      process.env.NPM_DISCOVER_PACKAGES_SUMMARY_FILE ||
      "artifacts/npm/discover-packages.md",
    registry:
      process.env.NPM_DISCOVER_PACKAGES_REGISTRY ||
      process.env.NPM_CONFIG_REGISTRY ||
      DEFAULT_REGISTRY,
    access:
      process.env.NPM_DISCOVER_PACKAGES_ACCESS ||
      process.env.NPM_CONFIG_ACCESS ||
      "public",
    scan_roots: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_SCAN_ROOTS,
    ),
    include_packages: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE,
    ),
    exclude_packages: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_EXCLUDE,
    ),
    include_paths: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.NPM_DISCOVER_PACKAGES_EXCLUDE_PATHS,
    ),
    include_apps: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_APPS,
      false,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    include_root_package: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_INCLUDE_ROOT,
      false,
    ),
    publishable_only: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_PUBLISHABLE_ONLY,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_FAIL_IF_EMPTY,
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
    print: normalizeBoolean(process.env.NPM_DISCOVER_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_DISCOVER_PACKAGES_STEP_SUMMARY,
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

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--report") {
      args.report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = argv[index + 1];
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

    if (arg === "--include-path") {
      args.include_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-path") {
      args.exclude_paths.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include-apps") {
      args.include_apps = true;
      continue;
    }

    if (arg === "--no-include-apps") {
      args.include_apps = false;
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

    if (arg === "--include-root") {
      args.include_root_package = true;
      continue;
    }

    if (arg === "--no-include-root") {
      args.include_root_package = false;
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

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

  args.scan_roots = [
    ...new Set(args.scan_roots.length ? args.scan_roots : ["."]),
  ];
  args.include_packages = [
    ...new Set(args.include_packages.map(normalizePackageName)),
  ];
  args.exclude_packages = [
    ...new Set(args.exclude_packages.map(normalizePackageName)),
  ];
  args.include_paths = [...new Set(args.include_paths)];
  args.exclude_paths = [...new Set(args.exclude_paths)];
  args.max_packages = Math.max(0, args.max_packages);
  args.registry = normalizeRegistry(args.registry);
  args.access = normalizeString(args.access, "public");

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Discovery

Usage:
  node .github/scripts/npm/discover-packages.js [options]

Options:
  -o, --output <file>             Matrix artifact output file.
      --report <file>             Full JSON report file.
      --summary <file>            Markdown summary file.
      --scan-root <path,list>     Root path(s) to scan.
      --include <list>            Include package names.
      --exclude <list>            Exclude package names.
      --include-apps              Allow apps/** packages to publish.
      --include-private           Include private packages.
      --include-root              Include root package.json.
      --publishable-only          Only emit publishable packages. Default.
      --fail-if-empty             Exit non-zero if no publishable packages are found.
      --no-print                  Do not print the JSON report.
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

function normalizeRegistry(value) {
  const registry = normalizeString(value, DEFAULT_REGISTRY);
  return registry.endsWith("/") ? registry : `${registry}/`;
}

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeTag(value) {
  return (
    normalizeString(value, "latest")
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 128) || "latest"
  );
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, fallback = null) {
  try {
    return safeJsonParse(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
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

function runGit(args, repoRoot, fallback = "") {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return fallback;
  }
}

function getGitMetadata(repoRoot) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], repoRoot),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"], repoRoot),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;
  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content, dryRun = false) {
  ensureDir(path.dirname(filePath), dryRun);

  if (dryRun) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return;
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
}

function parseYamlListSection(text, sectionName) {
  const values = [];
  const lines = String(text || "").split(/\r?\n/);
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "");
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (new RegExp(`^${sectionName}:\\s*$`).test(trimmed)) {
      inSection = true;
      continue;
    }

    if (
      inSection &&
      /^[A-Za-z0-9_.-]+:\s*/.test(trimmed) &&
      !trimmed.startsWith("-")
    ) {
      break;
    }

    if (inSection && trimmed.startsWith("-")) {
      const value = trimmed
        .replace(/^-\s*/, "")
        .replace(/^['"]|['"]$/g, "")
        .trim();
      if (value && !value.startsWith("!")) values.push(value);
    }
  }

  return values;
}

function workspacePatterns(repoRoot) {
  const rootPackage = readJsonFile(path.join(repoRoot, "package.json"), {});
  const patterns = [];

  if (Array.isArray(rootPackage.workspaces)) {
    patterns.push(...rootPackage.workspaces);
  } else if (Array.isArray(rootPackage.workspaces?.packages)) {
    patterns.push(...rootPackage.workspaces.packages);
  }

  const pnpmWorkspace = path.join(repoRoot, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspace)) {
    patterns.push(
      ...parseYamlListSection(
        fs.readFileSync(pnpmWorkspace, "utf8"),
        "packages",
      ),
    );
  }

  return [...new Set(patterns.map(toPosixPath).filter(Boolean))];
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const output = source
    .replace(/\\\*\\\*\//g, "(?:.*/)?")
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${output}$`);
}

function workspacePatternMatches(packageDir, patterns) {
  if (!patterns.length) return false;

  const normalizedDir = toPosixPath(packageDir).replace(/\/+$/g, "");

  return patterns.some((pattern) => {
    const normalizedPattern = toPosixPath(pattern).replace(/\/+$/g, "");
    if (/[*?]/.test(normalizedPattern))
      return globToRegExp(normalizedPattern).test(normalizedDir);
    return (
      normalizedDir === normalizedPattern ||
      normalizedDir.startsWith(`${normalizedPattern}/`)
    );
  });
}

function pathMatches(value, patterns) {
  if (!patterns.length) return true;

  const normalized = toPosixPath(value);

  return patterns.some((pattern) => {
    const normalizedPattern = toPosixPath(pattern);
    if (/[*?]/.test(normalizedPattern))
      return globToRegExp(normalizedPattern).test(normalized);
    return (
      normalized === normalizedPattern || normalized.includes(normalizedPattern)
    );
  });
}

function pathExcluded(value, patterns) {
  if (!patterns.length) return false;
  return (
    !pathMatches(
      value,
      patterns.map((pattern) => `!${pattern}`),
    ) &&
    patterns.some((pattern) => {
      const normalized = toPosixPath(value);
      const normalizedPattern = toPosixPath(pattern);
      if (/[*?]/.test(normalizedPattern))
        return globToRegExp(normalizedPattern).test(normalized);
      return (
        normalized === normalizedPattern ||
        normalized.includes(normalizedPattern)
      );
    })
  );
}

function findPackageJsonFiles(repoRoot, args) {
  const files = [];
  const stack = args.scan_roots.map((root) => resolvePath(root, repoRoot));
  const seenDirectories = new Set();

  while (stack.length) {
    const current = stack.pop();

    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) continue;

    if (stat.isFile()) {
      if (path.basename(current) === "package.json") files.push(current);
      continue;
    }

    if (!stat.isDirectory()) continue;

    let real;
    try {
      real = fs.realpathSync(current);
    } catch {
      continue;
    }

    if (seenDirectories.has(real)) continue;
    seenDirectories.add(real);

    const relative = toRelativePath(current, repoRoot);
    const base = path.basename(current);

    if (relative !== "." && DEFAULT_IGNORED_DIRECTORIES.has(base)) continue;
    if (relative !== "." && pathExcluded(relative, args.exclude_paths))
      continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries.reverse()) {
      if (entry.isDirectory() && DEFAULT_IGNORED_DIRECTORIES.has(entry.name))
        continue;
      if (entry.isSymbolicLink()) continue;
      stack.push(path.join(current, entry.name));
    }
  }

  return [...new Set(files)].sort();
}

function readNearestProjectJson(packageDirAbs, repoRoot) {
  let current = packageDirAbs;

  while (current.startsWith(repoRoot)) {
    const candidate = path.join(current, "project.json");
    if (fs.existsSync(candidate)) return readJsonFile(candidate, null);
    if (current === repoRoot) break;
    current = path.dirname(current);
  }

  return null;
}

function classifyPackage(relativeDir, packageJson, projectJson) {
  if (relativeDir === ".") return "root";
  if (
    relativeDir.startsWith("apps/") ||
    projectJson?.projectType === "application"
  )
    return "application";
  if (relativeDir.startsWith("libs/") || relativeDir.startsWith("packages/"))
    return "library";
  if (packageJson?.publishConfig) return "library";
  return "unknown";
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

function inferProjectName(relativeDir, packageJson, projectJson) {
  if (projectJson?.name) return normalizeString(projectJson.name);
  if (packageJson?.name) return normalizeString(packageJson.name);
  if (relativeDir === ".") return "root";
  return path.basename(relativeDir);
}

function normalizePackageRecord(packageFile, repoRoot, patterns, args) {
  const packageJson = readJsonFile(packageFile, null);
  const packageDirAbs = path.dirname(packageFile);
  const packageJsonRelative = toRelativePath(packageFile, repoRoot);
  const packageDirRelative = toRelativePath(packageDirAbs, repoRoot);
  const isRoot = packageDirRelative === ".";
  const projectJson = readNearestProjectJson(packageDirAbs, repoRoot);

  const name = normalizePackageName(packageJson?.name || "");
  const version = normalizeString(packageJson?.version || "");
  const privatePackage = Boolean(packageJson?.private);
  const packageType = classifyPackage(
    packageDirRelative,
    packageJson,
    projectJson,
  );
  const workspace =
    workspacePatternMatches(packageDirRelative, patterns) || isRoot;
  const explicitPublishable = Boolean(
    packageJson?.publishConfig ||
    packageJson?.aerealith?.publish === true ||
    packageJson?.aerealith?.publishable === true,
  );
  const appAllowed = args.include_apps || explicitPublishable;
  const appBlocked = packageType === "application" && !appAllowed;
  const publishable = Boolean(
    name &&
    version &&
    (!privatePackage || args.include_private) &&
    !isRoot &&
    !appBlocked &&
    (explicitPublishable || packageType === "library"),
  );

  const errors = [];
  const warnings = [];

  if (!packageJson || typeof packageJson !== "object")
    errors.push(`Invalid package.json: ${packageJsonRelative}`);
  if (!name) errors.push(`Package name is missing: ${packageJsonRelative}`);
  if (!version)
    errors.push(`Package version is missing: ${packageJsonRelative}`);
  if (privatePackage && !args.include_private)
    warnings.push("Private package skipped from publishable output.");
  if (isRoot && !args.include_root_package)
    warnings.push("Root package skipped from publishable output.");
  if (appBlocked)
    warnings.push(
      "Application package skipped. Use --include-apps or publishConfig to publish it.",
    );
  if (!workspace)
    warnings.push("Package is not matched by workspace patterns.");

  const publishConfig = packageJson?.publishConfig || {};
  const registry = normalizeRegistry(publishConfig.registry || args.registry);
  const access = normalizeString(
    publishConfig.access || args.access,
    args.access,
  );
  const defaultTag = normalizeTag(publishConfig.tag || "latest");

  return {
    id: crypto
      .createHash("sha256")
      .update(packageJsonRelative)
      .digest("hex")
      .slice(0, 16),
    source_type: "repository-scan",
    name,
    unscoped_name: packageUnscopedName(name),
    scope: packageScope(name),
    version,
    project: inferProjectName(packageDirRelative, packageJson, projectJson),
    package_json: packageJsonRelative,
    package_json_file: packageJsonRelative,
    package_dir: packageDirRelative,
    path: packageDirRelative,
    root: packageDirRelative,
    is_root: isRoot,
    workspace,
    private: privatePackage,
    publishable,
    explicit_publishable: explicitPublishable,
    package_type: packageType,
    registry,
    access,
    default_tag: defaultTag,
    tags: [defaultTag],
    publish_config: publishConfig,
    package_manager: "pnpm",
    type: normalizeString(packageJson?.type || "commonjs"),
    main: normalizeString(packageJson?.main || ""),
    module: normalizeString(packageJson?.module || ""),
    types: normalizeString(packageJson?.types || packageJson?.typings || ""),
    exports: packageJson?.exports || null,
    files: Array.isArray(packageJson?.files) ? packageJson.files : [],
    scripts: packageJson?.scripts || {},
    hash: sha256File(packageFile),
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function packageMatchesFilters(pkg, args) {
  if (!args.include_root_package && pkg.is_root) return false;
  if (!args.include_private && pkg.private) return false;
  if (args.publishable_only && !pkg.publishable) return false;
  if (args.include_packages.length && !args.include_packages.includes(pkg.name))
    return false;
  if (args.exclude_packages.includes(pkg.name)) return false;
  if (
    args.include_paths.length &&
    !pathMatches(pkg.package_json, args.include_paths) &&
    !pathMatches(pkg.path, args.include_paths)
  )
    return false;
  if (
    pathExcluded(pkg.package_json, args.exclude_paths) ||
    pathExcluded(pkg.path, args.exclude_paths)
  )
    return false;
  return true;
}

function duplicatePackageNames(packages) {
  const byName = new Map();

  for (const pkg of packages) {
    if (!pkg.name) continue;
    const list = byName.get(pkg.name) || [];
    list.push(pkg.package_json);
    byName.set(pkg.name, list);
  }

  return [...byName.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths }));
}

function createMarkdownSummary(report) {
  const lines = [
    `# ${PROJECT_NAME} NPM Package Discovery`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Package files scanned: \`${report.totals.package_json_files}\``,
    `- Packages discovered: \`${report.totals.discovered_packages}\``,
    `- Publishable packages: \`${report.totals.publishable_packages}\``,
    `- Selected packages: \`${report.totals.selected_packages}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    "",
    "## Packages",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No publishable packages were selected.");
  } else {
    lines.push("| Package | Version | Type | Directory | Registry | Access |");
    lines.push("|---|---:|---|---|---|---|");
    for (const pkg of report.packages) {
      lines.push(
        `| \`${pkg.name}\` | \`${pkg.version}\` | \`${pkg.package_type}\` | \`${pkg.package_dir}\` | \`${pkg.registry}\` | \`${pkg.access}\` |`,
      );
    }
  }

  if (report.duplicates.length) {
    lines.push("", "## Duplicate Package Names", "");
    for (const duplicate of report.duplicates) {
      lines.push(
        `- \`${duplicate.name}\`: ${duplicate.paths.map((item) => `\`${item}\``).join(", ")}`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings.slice(0, 100))
      lines.push(`- ${warning}`);
  }

  if (report.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of report.errors.slice(0, 100)) lines.push(`- ${error}`);
  }

  lines.push("", "## Outputs", "");
  lines.push(`- Matrix artifact: \`${report.config.output_file}\``);
  lines.push(`- JSON report: \`${report.config.report_file}\``);
  lines.push(`- Markdown summary: \`${report.config.summary_file}\``);

  return `${lines.join("\n").trim()}\n`;
}

function appendStepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trim()}\n\n`);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();
  const patterns = workspacePatterns(repoRoot);

  logger.info("Discovering npm packages.");

  const packageFiles = findPackageJsonFiles(repoRoot, args);
  const discovered = packageFiles.map((file) =>
    normalizePackageRecord(file, repoRoot, patterns, args),
  );
  const selected = discovered
    .filter((pkg) => packageMatchesFilters(pkg, args))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);

  const duplicates = duplicatePackageNames(selected);
  const errors = [
    ...selected.flatMap((pkg) =>
      pkg.errors.map((error) => `${pkg.name || pkg.package_json}: ${error}`),
    ),
    ...(args.fail_on_duplicate_names
      ? duplicates.map(
          (duplicate) =>
            `Duplicate package name ${duplicate.name}: ${duplicate.paths.join(", ")}`,
        )
      : []),
  ];
  const warnings = selected.flatMap((pkg) =>
    pkg.warnings.map(
      (warning) => `${pkg.name || pkg.package_json}: ${warning}`,
    ),
  );

  if (args.fail_if_empty && selected.length === 0) {
    errors.push("No publishable npm packages were selected.");
  }

  const ok = errors.length === 0;
  const status = ok ? (selected.length ? "discovered" : "empty") : "invalid";
  const matrix = {
    include: selected.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      package_dir: pkg.package_dir,
      package_json: pkg.package_json,
      registry: pkg.registry,
      access: pkg.access,
      tag: pkg.default_tag,
    })),
  };

  const report = {
    schema_version: 1,
    type: "npm-package-discovery",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: getGitMetadata(repoRoot),
    config: {
      output_file: toRelativePath(args.output_file, repoRoot),
      report_file: toRelativePath(args.report_file, repoRoot),
      summary_file: toRelativePath(args.summary_file, repoRoot),
      registry: args.registry,
      access: args.access,
      scan_roots: args.scan_roots,
      include_apps: args.include_apps,
      include_private: args.include_private,
      include_root_package: args.include_root_package,
      publishable_only: args.publishable_only,
      workspace_patterns: patterns,
      dry_run: args.dry_run,
    },
    totals: {
      package_json_files: packageFiles.length,
      discovered_packages: discovered.length,
      publishable_packages: discovered.filter((pkg) => pkg.publishable).length,
      selected_packages: selected.length,
      duplicates: duplicates.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    matrix,
    packages: selected,
    discovered_packages: discovered,
    duplicates,
    errors,
    warnings,
    ok,
    status,
  };

  const outputArtifact = {
    schema_version: 1,
    type: "npm-package-matrix",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: report.created_at,
    totals: report.totals,
    matrix,
    packages: selected,
    publishable_packages: selected,
    selected_packages: selected,
    ok,
    status,
  };

  writeTextFile(
    resolvePath(args.output_file, repoRoot),
    `${JSON.stringify(outputArtifact, null, 2)}\n`,
    args.dry_run,
  );
  writeTextFile(
    resolvePath(args.report_file, repoRoot),
    `${JSON.stringify(report, null, 2)}\n`,
    args.dry_run,
  );
  const markdown = createMarkdownSummary(report);
  writeTextFile(
    resolvePath(args.summary_file, repoRoot),
    markdown,
    args.dry_run,
  );

  setOutput("npm_packages_file", report.config.output_file);
  setOutput("npm_packages_report_file", report.config.report_file);
  setOutput("npm_packages_summary_file", report.config.summary_file);
  setOutput("npm_packages_count", String(selected.length));
  setOutput("npm_packages_has_packages", selected.length ? "true" : "false");
  setOutput("npm_packages_names", selected.map((pkg) => pkg.name).join(","));
  setOutput(
    "npm_packages_names_json",
    JSON.stringify(selected.map((pkg) => pkg.name)),
  );

  if (args.write_step_summary) appendStepSummary(markdown);
  if (args.print) console.log(JSON.stringify(report, null, 2));

  if (!ok && args.fail_on_error) process.exitCode = 1;
}

main().catch((error) => {
  logger.error(logger.formatError(error));
  process.exitCode = 1;
});
