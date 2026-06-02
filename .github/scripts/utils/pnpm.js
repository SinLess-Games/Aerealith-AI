// .github/scripts/utils/pnpm.js
// =============================================================================
// Aerealith AI pnpm Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared pnpm workspace, dependency, package discovery, cache, audit, pack,
//   and publish helpers for GitHub workflow automation scripts.
//
// Used by:
//   - CI workflow helper scripts
//   - dependency automation scripts
//   - npm package publish scripts
//   - release validation scripts
//   - artifact/evidence scripts
//   - security policy/report scripts
//
// Notes:
//   - CommonJS only.
//   - Uses pnpm 10.23.0 by default.
//   - Uses Node.js 24.15.0 by default.
//   - Only packages with `"private": false` are publishable.
//   - Dependency automation must not trigger releases.
//   - Publish helpers are safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const yaml = require("js-yaml");

const logger = require("./logger");

const DEFAULT_NODE_VERSION = "24.15.0";
const DEFAULT_PNPM_VERSION = "10.23.0";
const DEFAULT_DEFAULT_BRANCH = "main";

const DEFAULT_PNPM_COMMAND = "pnpm";
const DEFAULT_REGISTRY = "https://registry.npmjs.org";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package.json",
  "nx.json",
];

const DEFAULT_PACKAGE_DISCOVERY_ROOTS = [
  ".",
  "apps/connectors",
  "apps/engines",
  "apps/frontend",
  "apps/integrations",
  "apps/services",
  "libs",
  "tools",
  "scripts",
  ".github/scripts",
];

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".github/.cache",
  ".nx",
  ".next",
  ".open-next",
  ".turbo",
  ".wrangler",
  ".cache",
  "coverage",
  "dist",
  "build",
  "out",
  "tmp",
  "temp",
  "node_modules",
]);

const DEFAULT_CACHE_INPUT_FILES = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package.json",
  "nx.json",
  "tsconfig.base.json",
  "tsconfig.json",
];

const DEFAULT_SECURITY_AUDIT_LEVEL = "high";

const DEFAULT_PACKAGE_ARTIFACT_DIR = "artifacts/npm";
const DEFAULT_PUBLISH_MANIFEST_FILE = "artifacts/npm/npm-publish-manifest.json";
const DEFAULT_PACKAGE_PLAN_FILE = "artifacts/npm/npm-package-plan.json";

const DEPENDENCY_FIELD_NAMES = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
];

const RELEASE_TAG_PATTERN = /^V[0-9]+\.[0-9]+\.[0-9]+$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [String(value).trim()].filter(Boolean);
  }

  return unique(value.map((item) => String(item).trim()).filter(Boolean));
}

function normalizeBranchName(branchNameOrRef) {
  return normalizeString(branchNameOrRef)
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  return normalizeString(refOrTag)
    .replace(/^refs\/tags\//, "")
    .trim();
}

function isReleaseTag(refOrTag) {
  return RELEASE_TAG_PATTERN.test(normalizeTagName(refOrTag));
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectDeep(value[key])]),
  );
}

function stableStringify(value, space = 2) {
  return JSON.stringify(sortObjectDeep(value), null, space);
}

function getDryRun(options = {}) {
  return normalizeBoolean(
    options.dryRun ??
      options.dry_run ??
      process.env.DRY_RUN ??
      process.env.PROJECT_SYNC_DRY_RUN,
    logger.DRY_RUN,
  );
}

function allowLocalFileWrites(options = {}) {
  return normalizeBoolean(
    options.allowLocalFileWrites ?? options.allow_local_file_writes,
    true,
  );
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
  options = {},
) {
  const markers = normalizeStringList(
    options.markers || DEFAULT_REPO_ROOT_MARKERS,
  );
  const candidates = unique([
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ]);

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath = ".", repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);

  return path.normalize(path.join(repoRoot, filePath));
}

function toPosixPath(filePath) {
  return normalizeString(filePath).split(path.sep).join("/");
}

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot)));
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function isFile(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isDirectory();
}

function ensureDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (isDirectory(dirPath)) return dirPath;

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  logger.debug(`Ensured directory exists: ${dirPath}`);

  return dirPath;
}

function ensureParentDir(filePath, options = {}) {
  return ensureDir(path.dirname(filePath), options);
}

function writeFile(filePath, contents, options = {}) {
  const dryRun = getDryRun(options);

  ensureParentDir(filePath, options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would write file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, contents);

    return {
      written: false,
      path: filePath,
      dry_run: true,
    };
  }

  fs.writeFileSync(filePath, contents);

  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    path: filePath,
    dry_run: dryRun,
  };
}

function writeJson(filePath, value, options = {}) {
  return writeFile(filePath, `${stableStringify(value)}\n`, options);
}

function readJson(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `JSON file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
}

function readYaml(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `YAML file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    return (
      yaml.load(fs.readFileSync(absolutePath, "utf8")) ??
      options.fallback ??
      null
    );
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
}

function fileHash(filePath, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function hashFiles(files, algorithm = "sha256", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const hash = crypto.createHash(algorithm);

  for (const file of normalizeStringList(files).sort()) {
    const absolutePath = resolvePath(file, repoRoot);

    if (!isFile(absolutePath)) continue;

    hash.update(toRelativePath(absolutePath, repoRoot));
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

function shouldIgnoreDirectory(dirName) {
  return DEFAULT_IGNORE_DIRS.has(dirName);
}

function readRootPackageJson(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return readJson("package.json", {
    ...options,
    repoRoot,
  });
}

function readPackageJson(packageJsonPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return readJson(packageJsonPath, {
    ...options,
    repoRoot,
  });
}

function readPnpmWorkspace(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return (
    readYaml("pnpm-workspace.yaml", {
      ...options,
      repoRoot,
      required: false,
      fallback: {
        packages: [],
      },
    }) || {
      packages: [],
    }
  );
}

function readPnpmLockfile(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return readYaml("pnpm-lock.yaml", {
    ...options,
    repoRoot,
    required: false,
    fallback: null,
  });
}

function packageNameToSafeName(packageName) {
  return normalizeString(packageName, "package")
    .replace(/^@/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function packageNameToScope(packageName) {
  const normalized = normalizeString(packageName);

  if (!normalized.startsWith("@")) return null;

  return normalized.split("/")[0].replace(/^@/, "") || null;
}

function packageNameToUnscopedName(packageName) {
  const normalized = normalizeString(packageName);

  if (!normalized.startsWith("@")) return normalized;

  return normalized.split("/").slice(1).join("/") || normalized;
}

function getPackageManager(packageJson = {}) {
  return normalizeString(packageJson.packageManager || "");
}

function isPnpmPackageManager(packageJson = {}) {
  const packageManager = getPackageManager(packageJson);

  if (!packageManager) return true;

  return packageManager.startsWith("pnpm@");
}

function getExpectedPnpmVersion(
  packageJson = {},
  fallback = DEFAULT_PNPM_VERSION,
) {
  const packageManager = getPackageManager(packageJson);

  if (packageManager.startsWith("pnpm@")) {
    return packageManager.replace(/^pnpm@/, "");
  }

  return fallback;
}

function getWorkspacePackagePatterns(options = {}) {
  const workspace = readPnpmWorkspace(options);
  const packages = normalizeStringList(workspace.packages);

  return packages.length ? packages : DEFAULT_PACKAGE_DISCOVERY_ROOTS;
}

function globToRegExp(pattern) {
  const normalized = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*") {
      if (next === "*") {
        const afterNext = normalized[index + 2];

        if (afterNext === "/") {
          output += "(?:.*\\/)?";
          index += 2;
        } else {
          output += ".*";
          index += 1;
        }
      } else {
        output += "[^/]*";
      }

      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      output += `\\${char}`;
      continue;
    }

    output += char;
  }

  output += "$";

  return new RegExp(output);
}

function matchesGlob(filePath, pattern) {
  const normalizedPath = toPosixPath(filePath);
  const normalizedPattern = toPosixPath(pattern);

  if (normalizedPath === normalizedPattern) return true;

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function matchesAnyGlob(filePath, patterns = []) {
  return normalizeStringList(patterns).some((pattern) =>
    matchesGlob(filePath, pattern),
  );
}

function discoverPackageJsonFiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const roots = normalizeStringList(
    options.roots || DEFAULT_PACKAGE_DISCOVERY_ROOTS,
  );
  const includeRoot =
    options.includeRoot !== false && options.include_root !== false;

  const discovered = [];

  if (includeRoot && isFile(path.join(repoRoot, "package.json"))) {
    discovered.push(path.join(repoRoot, "package.json"));
  }

  function visit(dirPath) {
    if (!isDirectory(dirPath)) return;

    const entries = fs.readdirSync(dirPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name)) continue;
        visit(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === "package.json") {
        discovered.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    const absoluteRoot = resolvePath(root, repoRoot);

    if (!isDirectory(absoluteRoot)) continue;

    visit(absoluteRoot);
  }

  const workspacePatterns = getWorkspacePackagePatterns({
    ...options,
    repoRoot,
  });

  return unique(discovered)
    .map((filePath) => toRelativePath(filePath, repoRoot))
    .filter((filePath) => {
      if (filePath === "package.json") return includeRoot;

      const packageRoot = toPosixPath(path.dirname(filePath));

      if (!workspacePatterns.length) return true;

      return workspacePatterns.some((pattern) => {
        const normalizedPattern = toPosixPath(pattern).replace(
          /\/package\.json$/,
          "",
        );
        return matchesGlob(packageRoot, normalizedPattern);
      });
    })
    .sort();
}

function normalizePackageDescriptor(packageJsonPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePackageJson = resolvePath(packageJsonPath, repoRoot);
  const packageJson = readPackageJson(packageJsonPath, {
    ...options,
    repoRoot,
  });

  const root =
    toRelativePath(path.dirname(absolutePackageJson), repoRoot) || ".";
  const name = normalizeString(
    packageJson.name,
    root === "." ? "root" : path.basename(root),
  );
  const safeName = packageNameToSafeName(name);

  const privateValue = packageJson.private;
  const explicitlyPublic = privateValue === false;

  const dependencyCounts = Object.fromEntries(
    DEPENDENCY_FIELD_NAMES.map((field) => [
      field,
      isPlainObject(packageJson[field])
        ? Object.keys(packageJson[field]).length
        : 0,
    ]),
  );

  return {
    name,
    safe_name: safeName,
    scope: packageNameToScope(name),
    unscoped_name: packageNameToUnscopedName(name),
    version: normalizeString(packageJson.version, "0.0.0"),
    description: normalizeString(packageJson.description),
    private: privateValue === undefined ? null : Boolean(privateValue),
    explicitly_public: explicitlyPublic,
    publishable: explicitlyPublic,
    package_json_path: toRelativePath(absolutePackageJson, repoRoot),
    root,
    main: packageJson.main || null,
    module: packageJson.module || null,
    types: packageJson.types || packageJson.typings || null,
    exports: packageJson.exports || null,
    files: Array.isArray(packageJson.files) ? packageJson.files : [],
    scripts: isPlainObject(packageJson.scripts) ? packageJson.scripts : {},
    dependency_counts: dependencyCounts,
    package_json_sha256: fileHash(absolutePackageJson, "sha256"),
    package_json: packageJson,
  };
}

function discoverWorkspacePackages(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return discoverPackageJsonFiles({
    ...options,
    repoRoot,
  }).map((packageJsonPath) =>
    normalizePackageDescriptor(packageJsonPath, {
      ...options,
      repoRoot,
    }),
  );
}

function discoverPublishablePackages(options = {}) {
  return discoverWorkspacePackages(options).filter(
    (workspacePackage) => workspacePackage.publishable,
  );
}

function getDependencyEntries(packageJson = {}) {
  const entries = [];

  for (const field of DEPENDENCY_FIELD_NAMES) {
    const dependencies = packageJson[field];

    if (!isPlainObject(dependencies)) continue;

    for (const [name, range] of Object.entries(dependencies)) {
      entries.push({
        name,
        range,
        type: field,
      });
    }
  }

  return entries.sort((a, b) =>
    `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`),
  );
}

function createDependencySummary(packages = []) {
  const dependencies = new Map();

  for (const workspacePackage of packages) {
    for (const dependency of getDependencyEntries(
      workspacePackage.package_json,
    )) {
      const key = `${dependency.type}:${dependency.name}:${dependency.range}`;

      if (!dependencies.has(key)) {
        dependencies.set(key, {
          name: dependency.name,
          range: dependency.range,
          type: dependency.type,
          used_by: [],
        });
      }

      dependencies.get(key).used_by.push(workspacePackage.name);
    }
  }

  const entries = [...dependencies.values()].sort((a, b) =>
    `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`),
  );

  return {
    totals: {
      packages: packages.length,
      dependencies: entries.length,
      production: entries.filter((entry) => entry.type === "dependencies")
        .length,
      development: entries.filter((entry) => entry.type === "devDependencies")
        .length,
      peer: entries.filter((entry) => entry.type === "peerDependencies").length,
      optional: entries.filter((entry) => entry.type === "optionalDependencies")
        .length,
    },
    dependencies: entries,
  };
}

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );

  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun && options.executeInDryRun !== true) {
    logger.dryRun(
      `Would run command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
    );

    return {
      command,
      args,
      cwd,
      dry_run: true,
      status: 0,
      stdout: "",
      stderr: "",
    };
  }

  logger.info(
    `Running command in ${toRelativePath(cwd, repoRoot)}: ${rendered}`,
  );

  const result = childProcess.spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: "utf8",
    shell: normalizeBoolean(options.shell, false),
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    options.allowFailure !== true &&
    options.allow_failure !== true
  ) {
    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        result.stdout ? `stdout:\n${result.stdout}` : null,
        result.stderr ? `stderr:\n${result.stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    command,
    args,
    cwd,
    dry_run: false,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runPnpm(args = [], options = {}) {
  return runCommand(
    options.pnpmCommand || options.pnpm_command || DEFAULT_PNPM_COMMAND,
    args,
    options,
  );
}

function getNodeVersion() {
  return process.version.replace(/^v/, "");
}

function getPnpmVersion(options = {}) {
  const result = runPnpm(["--version"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  return (
    normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0] || null
  );
}

function validatePnpmVersion(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const rootPackageJson = readRootPackageJson({
    ...options,
    repoRoot,
  });

  const expected = normalizeString(
    options.expectedVersion ||
      options.expected_version ||
      process.env.PNPM_VERSION ||
      getExpectedPnpmVersion(rootPackageJson),
    DEFAULT_PNPM_VERSION,
  );

  const actual = getPnpmVersion({
    ...options,
    repoRoot,
  });

  const valid = actual === expected;

  return {
    valid,
    expected,
    actual,
    package_manager: getPackageManager(rootPackageJson),
  };
}

function assertPnpmVersion(options = {}) {
  const validation = validatePnpmVersion(options);

  if (!validation.valid) {
    throw new Error(
      `pnpm version mismatch. Expected ${validation.expected}, received ${validation.actual || "unknown"}.`,
    );
  }

  return true;
}

function getPnpmStorePath(options = {}) {
  const result = runPnpm(["store", "path", "--silent"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  const storePath = normalizeString(result.stdout || result.stderr).split(
    /\r?\n/,
  )[0];

  return storePath || "~/.local/share/pnpm/store";
}

function createPnpmInstallArgs(options = {}) {
  const args = ["install"];

  if (options.frozenLockfile !== false && options.frozen_lockfile !== false) {
    args.push("--frozen-lockfile");
  }

  if (options.preferOffline || options.prefer_offline) {
    args.push("--prefer-offline");
  }

  if (options.ignoreScripts || options.ignore_scripts) {
    args.push("--ignore-scripts");
  }

  if (options.strictPeerDependencies || options.strict_peer_dependencies) {
    args.push("--strict-peer-dependencies");
  }

  if (options.offline) {
    args.push("--offline");
  }

  if (options.reporter) {
    args.push("--reporter", options.reporter);
  }

  return args;
}

function pnpmInstall(options = {}) {
  return runPnpm(createPnpmInstallArgs(options), options);
}

function createPnpmAuditArgs(options = {}) {
  const auditLevel = normalizeString(
    options.auditLevel || options.audit_level || DEFAULT_SECURITY_AUDIT_LEVEL,
    DEFAULT_SECURITY_AUDIT_LEVEL,
  );

  const args = ["audit", "--audit-level", auditLevel];

  if (options.json !== false) {
    args.push("--json");
  }

  if (options.production || options.prod) {
    args.push("--prod");
  }

  if (options.dev) {
    args.push("--dev");
  }

  return args;
}

function pnpmAudit(options = {}) {
  return runPnpm(createPnpmAuditArgs(options), {
    ...options,
    allowFailure: options.allowFailure ?? options.allow_failure ?? true,
  });
}

function parsePnpmAuditResult(result) {
  const raw = normalizeString(result.stdout);

  if (!raw) {
    return {
      valid_json: false,
      vulnerabilities: [],
      metadata: {},
      raw,
    };
  }

  try {
    const parsed = JSON.parse(raw);

    const vulnerabilities = Array.isArray(parsed.vulnerabilities)
      ? parsed.vulnerabilities
      : isPlainObject(parsed.advisories)
        ? Object.values(parsed.advisories)
        : [];

    return {
      valid_json: true,
      vulnerabilities,
      metadata: parsed.metadata || {},
      raw: parsed,
    };
  } catch {
    return {
      valid_json: false,
      vulnerabilities: [],
      metadata: {},
      raw,
    };
  }
}

function createPnpmOutdatedArgs(options = {}) {
  const args = ["outdated"];

  if (options.recursive !== false) {
    args.push("--recursive");
  }

  if (options.formatJson !== false && options.format_json !== false) {
    args.push("--format", "json");
  }

  return args;
}

function pnpmOutdated(options = {}) {
  return runPnpm(createPnpmOutdatedArgs(options), {
    ...options,
    allowFailure: true,
  });
}

function createPnpmPackArgs(workspacePackage, options = {}) {
  const outputDir = normalizeString(
    options.outputDir || options.output_dir || DEFAULT_PACKAGE_ARTIFACT_DIR,
  );
  const args = ["pack", "--pack-destination", outputDir];

  if (options.json !== false) {
    args.push("--json");
  }

  if (options.ignoreScripts || options.ignore_scripts) {
    args.push("--ignore-scripts");
  }

  return args;
}

function packPackage(workspacePackage, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const outputDir = resolvePath(
    options.outputDir || options.output_dir || DEFAULT_PACKAGE_ARTIFACT_DIR,
    repoRoot,
  );

  ensureDir(outputDir, {
    ...options,
    repoRoot,
  });

  const result = runPnpm(createPnpmPackArgs(workspacePackage, options), {
    ...options,
    repoRoot,
    cwd: workspacePackage.root,
  });

  return {
    package: workspacePackage.name,
    version: workspacePackage.version,
    root: workspacePackage.root,
    output_dir: toRelativePath(outputDir, repoRoot),
    command: `${DEFAULT_PNPM_COMMAND} ${createPnpmPackArgs(workspacePackage, options).join(" ")}`,
    dry_run: result.dry_run,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function createPublishArgs(workspacePackage, options = {}) {
  const args = ["publish"];

  const registry = normalizeString(
    options.registry || process.env.NPM_CONFIG_REGISTRY,
    DEFAULT_REGISTRY,
  );

  args.push("--registry", registry);

  if (options.access || workspacePackage.scope) {
    args.push("--access", options.access || "public");
  }

  const tag = normalizeString(
    options.tag || options.npmTag || options.npm_tag,
    "latest",
  );

  if (tag) {
    args.push("--tag", tag);
  }

  if (options.noGitChecks !== false && options.no_git_checks !== false) {
    args.push("--no-git-checks");
  }

  if (options.provenance) {
    args.push("--provenance");
  }

  if (getDryRun(options)) {
    args.push("--dry-run");
  }

  return args;
}

function validatePackagePublishable(workspacePackage) {
  if (!workspacePackage) {
    throw new Error("Package descriptor is required.");
  }

  if (!workspacePackage.publishable) {
    throw new Error(
      `Package ${workspacePackage.name} is not publishable. Only packages with "private": false may be published.`,
    );
  }

  if (!workspacePackage.name) {
    throw new Error(
      `Publishable package at ${workspacePackage.root} is missing package.json name.`,
    );
  }

  if (!workspacePackage.version) {
    throw new Error(
      `Publishable package ${workspacePackage.name} is missing package.json version.`,
    );
  }

  return true;
}

function publishPackage(workspacePackage, options = {}) {
  validatePackagePublishable(workspacePackage);

  const token =
    options.token ||
    process.env.NPM_ACCESS_TOKEN ||
    process.env.NODE_AUTH_TOKEN;

  if (!token && !getDryRun(options)) {
    throw new Error("Publishing requires NPM_ACCESS_TOKEN or NODE_AUTH_TOKEN.");
  }

  if (token) {
    logger.mask(token);
  }

  const env = {
    ...process.env,
    ...(options.env || {}),
  };

  if (token) {
    env.NODE_AUTH_TOKEN = token;
    env.NPM_CONFIG_TOKEN = token;
  }

  const startedAt = new Date();

  const args = createPublishArgs(workspacePackage, options);

  const result = runPnpm(args, {
    ...options,
    cwd: workspacePackage.root,
    env,
  });

  const finishedAt = new Date();

  return {
    package: workspacePackage.name,
    version: workspacePackage.version,
    root: workspacePackage.root,
    registry: normalizeString(
      options.registry || process.env.NPM_CONFIG_REGISTRY,
      DEFAULT_REGISTRY,
    ),
    npm_tag: normalizeString(
      options.tag || options.npmTag || options.npm_tag,
      "latest",
    ),
    command: `${DEFAULT_PNPM_COMMAND} ${args.join(" ")}`,
    dry_run: result.dry_run,
    status: result.status,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function publishPackages(packages = [], options = {}) {
  return packages.map((workspacePackage) =>
    publishPackage(workspacePackage, options),
  );
}

function createPackagePlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();

  const allPackages =
    input.packages ||
    discoverWorkspacePackages({
      ...input,
      repoRoot,
    });

  const publishablePackages = allPackages.filter(
    (workspacePackage) => workspacePackage.publishable,
  );

  const selectedPackageNames = normalizeStringList(
    input.packageNames || input.package_names,
  );
  const selectedPackages = selectedPackageNames.length
    ? publishablePackages.filter((workspacePackage) =>
        selectedPackageNames.includes(workspacePackage.name),
      )
    : publishablePackages;

  const rootPackageJson = readRootPackageJson({
    ...input,
    repoRoot,
  });

  return {
    schema_version: 1,
    type: "pnpm-package-plan",
    project: "Aerealith AI",
    created_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    repo_root: repoRoot,
    tooling: {
      node_version: getNodeVersion(),
      expected_node_version: normalizeString(
        input.nodeVersion || input.node_version,
        DEFAULT_NODE_VERSION,
      ),
      pnpm_version: getPnpmVersion({
        ...input,
        repoRoot,
      }),
      expected_pnpm_version: normalizeString(
        input.pnpmVersion ||
          input.pnpm_version ||
          getExpectedPnpmVersion(rootPackageJson),
        DEFAULT_PNPM_VERSION,
      ),
      package_manager: getPackageManager(rootPackageJson),
    },
    dry_run: getDryRun(input),
    registry: normalizeString(
      input.registry || process.env.NPM_CONFIG_REGISTRY,
      DEFAULT_REGISTRY,
    ),
    npm_tag: normalizeString(
      input.tag || input.npmTag || input.npm_tag,
      "latest",
    ),
    totals: {
      all_packages: allPackages.length,
      publishable_packages: publishablePackages.length,
      selected_packages: selectedPackages.length,
      private_or_unpublished_packages:
        allPackages.length - publishablePackages.length,
    },
    packages: selectedPackages.map((workspacePackage) => ({
      name: workspacePackage.name,
      version: workspacePackage.version,
      root: workspacePackage.root,
      package_json_path: workspacePackage.package_json_path,
      private: workspacePackage.private,
      publishable: workspacePackage.publishable,
      scope: workspacePackage.scope,
      package_json_sha256: workspacePackage.package_json_sha256,
    })),
    skipped_packages: allPackages
      .filter((workspacePackage) => !workspacePackage.publishable)
      .map((workspacePackage) => ({
        name: workspacePackage.name,
        version: workspacePackage.version,
        root: workspacePackage.root,
        package_json_path: workspacePackage.package_json_path,
        private: workspacePackage.private,
        reason:
          workspacePackage.private === true
            ? "private package"
            : "package.json does not explicitly set private to false",
      })),
    dependency_summary: createDependencySummary(allPackages).totals,
  };
}

function createPublishManifest(input = {}) {
  const plan = input.plan || createPackagePlan(input);
  const results = Array.isArray(input.results) ? input.results : [];

  return {
    schema_version: 1,
    type: "npm-publish-manifest",
    project: "Aerealith AI",
    created_at: new Date().toISOString(),
    repository: plan.repository,
    ref: plan.ref,
    sha: plan.sha,
    run_id: plan.run_id,
    registry: plan.registry,
    npm_tag: plan.npm_tag,
    dry_run: plan.dry_run,
    totals: {
      planned_packages: plan.packages.length,
      published_packages: results.filter((result) => result.status === 0)
        .length,
      failed_packages: results.filter((result) => result.status !== 0).length,
      skipped_packages: plan.skipped_packages.length,
    },
    planned_packages: plan.packages,
    skipped_packages: plan.skipped_packages,
    results,
  };
}

function writePackagePlan(
  plan,
  outputFile = DEFAULT_PACKAGE_PLAN_FILE,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  writeJson(absoluteOutputFile, plan, {
    ...options,
    repoRoot,
  });

  return toRelativePath(absoluteOutputFile, repoRoot);
}

function writePublishManifest(
  manifest,
  outputFile = DEFAULT_PUBLISH_MANIFEST_FILE,
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  writeJson(absoluteOutputFile, manifest, {
    ...options,
    repoRoot,
  });

  return toRelativePath(absoluteOutputFile, repoRoot);
}

function createPnpmCacheKey(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const osName = normalizeString(
    input.os || process.platform,
    process.platform,
  );
  const nodeVersion = normalizeString(
    input.nodeVersion || input.node_version,
    DEFAULT_NODE_VERSION,
  );
  const pnpmVersion = normalizeString(
    input.pnpmVersion || input.pnpm_version,
    DEFAULT_PNPM_VERSION,
  );
  const scope = normalizeString(input.scope, "pnpm-store");
  const branch = normalizeString(
    input.branch ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_DEFAULT_BRANCH,
    DEFAULT_DEFAULT_BRANCH,
  ).replace(/[^\w.-]+/g, "-");

  const lockHash = hashFiles(
    normalizeStringList(
      input.inputFiles || input.input_files || DEFAULT_CACHE_INPUT_FILES,
    ),
    "sha256",
    {
      repoRoot,
    },
  ).slice(0, 16);

  return [
    "aerealith",
    scope,
    `os-${osName}`,
    `node-${nodeVersion}`,
    `pnpm-${pnpmVersion}`,
    `branch-${branch}`,
    `lock-${lockHash}`,
  ].join("-");
}

function createPnpmCachePlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const rootPackageJson = readRootPackageJson({
    ...input,
    repoRoot,
  });

  const expectedPnpmVersion = normalizeString(
    input.pnpmVersion ||
      input.pnpm_version ||
      getExpectedPnpmVersion(rootPackageJson),
    DEFAULT_PNPM_VERSION,
  );

  const pnpmStorePath = normalizeString(
    input.storePath || input.store_path,
    getPnpmStorePath({
      ...input,
      repoRoot,
    }),
  );

  return {
    schema_version: 1,
    type: "pnpm-cache-plan",
    created_at: new Date().toISOString(),
    human_readable: true,
    package_manager: getPackageManager(rootPackageJson),
    expected_pnpm_version: expectedPnpmVersion,
    actual_pnpm_version: getPnpmVersion({
      ...input,
      repoRoot,
    }),
    keys: {
      pnpm_store: createPnpmCacheKey({
        ...input,
        repoRoot,
        scope: "pnpm-store",
        pnpmVersion: expectedPnpmVersion,
      }),
      pnpm_metadata: createPnpmCacheKey({
        ...input,
        repoRoot,
        scope: "pnpm-metadata",
        pnpmVersion: expectedPnpmVersion,
      }),
    },
    restore_keys: [
      [
        "aerealith",
        "pnpm-store",
        `os-${process.platform}`,
        `node-${normalizeString(input.nodeVersion || input.node_version, DEFAULT_NODE_VERSION)}`,
        `pnpm-${expectedPnpmVersion}`,
      ].join("-"),
      [
        "aerealith",
        "pnpm-store",
        `os-${process.platform}`,
        `node-${normalizeString(input.nodeVersion || input.node_version, DEFAULT_NODE_VERSION)}`,
      ].join("-"),
    ],
    paths: {
      pnpm_store: pnpmStorePath,
      pnpm_metadata: "~/.cache/pnpm",
    },
    input_files: normalizeStringList(
      input.inputFiles || input.input_files || DEFAULT_CACHE_INPUT_FILES,
    )
      .map((filePath) => resolvePath(filePath, repoRoot))
      .filter((filePath) => isFile(filePath))
      .map((filePath) => toRelativePath(filePath, repoRoot)),
  };
}

function createPnpmSummary(planOrManifest) {
  const source = planOrManifest || {};
  const packages = source.planned_packages || source.packages || [];
  const skipped = source.skipped_packages || [];
  const results = source.results || [];

  const lines = [
    "## pnpm / npm Packages",
    "",
    `- Registry: \`${source.registry || DEFAULT_REGISTRY}\``,
    `- npm tag: \`${source.npm_tag || "latest"}\``,
    `- Dry-run: \`${source.dry_run ? "true" : "false"}\``,
    `- Planned packages: \`${packages.length}\``,
    `- Skipped packages: \`${skipped.length}\``,
  ];

  if (results.length) {
    lines.push(`- Publish results: \`${results.length}\``);
  }

  if (source.tooling) {
    lines.push("");
    lines.push("### Tooling");
    lines.push("");
    lines.push(`- Node.js: \`${source.tooling.node_version || "unknown"}\``);
    lines.push(`- pnpm: \`${source.tooling.pnpm_version || "unknown"}\``);
    lines.push(
      `- Expected pnpm: \`${source.tooling.expected_pnpm_version || DEFAULT_PNPM_VERSION}\``,
    );
  }

  if (packages.length) {
    lines.push("");
    lines.push("### Publishable Packages");
    lines.push("");
    lines.push("| Package | Version | Root |");
    lines.push("|---|---|---|");

    for (const workspacePackage of packages) {
      lines.push(
        `| \`${workspacePackage.name}\` | \`${workspacePackage.version}\` | \`${workspacePackage.root}\` |`,
      );
    }
  }

  if (skipped.length) {
    lines.push("");
    lines.push("### Skipped Packages");
    lines.push("");
    lines.push("| Package | Root | Reason |");
    lines.push("|---|---|---|");

    for (const workspacePackage of skipped) {
      lines.push(
        `| \`${workspacePackage.name}\` | \`${workspacePackage.root}\` | ${workspacePackage.reason || "not publishable"} |`,
      );
    }
  }

  if (results.length) {
    lines.push("");
    lines.push("### Publish Results");
    lines.push("");
    lines.push("| Package | Status | Dry-run | Duration |");
    lines.push("|---|---:|---:|---:|");

    for (const result of results) {
      lines.push(
        `| \`${result.package}\` | \`${result.status}\` | \`${result.dry_run ? "true" : "false"}\` | \`${result.duration_ms || 0}ms\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping pnpm summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function appendPnpmSummary(planOrManifest) {
  return appendGitHubStepSummary(createPnpmSummary(planOrManifest));
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function printPackagePlan(plan) {
  logger.info(
    `pnpm package plan created with ${plan.packages.length} publishable package(s).`,
  );

  for (const workspacePackage of plan.packages) {
    logger.info(
      `- ${workspacePackage.name}@${workspacePackage.version}: ${workspacePackage.root}`,
    );
  }

  if (plan.skipped_packages.length) {
    logger.info(
      `Skipped ${plan.skipped_packages.length} non-publishable package(s).`,
    );
  }

  logger.dump("pnpm package plan", plan);
}

function validateReleasePublishingAllowed(input = {}) {
  const ref = normalizeString(input.ref || process.env.GITHUB_REF);
  const eventName = normalizeString(
    input.eventName || input.event_name || process.env.GITHUB_EVENT_NAME,
  );
  const branch = normalizeBranchName(
    input.branch || process.env.GITHUB_REF_NAME || process.env.GITHUB_REF,
  );
  const labels = normalizeStringList(input.labels);
  const isDependency =
    normalizeBoolean(input.dependency || input.is_dependency, false) ||
    labels.includes("dependencies") ||
    labels.includes("security:dependency");

  const blockers = [];

  if (isDependency) {
    blockers.push("Dependency automation may not publish npm packages.");
  }

  if (
    input.requireReleaseTag !== false &&
    input.require_release_tag !== false &&
    !isReleaseTag(ref)
  ) {
    blockers.push("npm publishing requires a V-prefixed semantic release tag.");
  }

  if (
    input.requireMain !== false &&
    input.require_main !== false &&
    branch &&
    branch !== DEFAULT_DEFAULT_BRANCH &&
    !isReleaseTag(ref)
  ) {
    blockers.push(
      `npm publishing must originate from ${DEFAULT_DEFAULT_BRANCH} or a release tag.`,
    );
  }

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    blockers.push("Pull request events may not publish npm packages.");
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    ref,
    branch,
    event_name: eventName,
    dependency: isDependency,
  };
}

function assertReleasePublishingAllowed(input = {}) {
  const validation = validateReleasePublishingAllowed(input);

  if (!validation.allowed) {
    throw new Error(
      `npm publishing blocked.\n${validation.blockers.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  return true;
}

function runCli() {
  const command = process.argv[2] || "plan";
  const repoRoot = findRepoRoot();

  if (command === "version") {
    console.log(
      getPnpmVersion({
        repoRoot,
      }),
    );
    return;
  }

  if (command === "validate-version") {
    const validation = validatePnpmVersion({
      repoRoot,
    });

    console.log(JSON.stringify(validation, null, 2));

    if (!validation.valid) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "store-path") {
    console.log(
      getPnpmStorePath({
        repoRoot,
      }),
    );
    return;
  }

  if (command === "cache-plan") {
    const plan = createPnpmCachePlan({
      repoRoot,
    });

    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "discover") {
    const packages = discoverWorkspacePackages({
      repoRoot,
    });

    console.log(JSON.stringify(packages, null, 2));
    return;
  }

  if (command === "publishable") {
    const packages = discoverPublishablePackages({
      repoRoot,
    });

    console.log(JSON.stringify(packages, null, 2));
    return;
  }

  if (command === "plan") {
    const plan = createPackagePlan({
      repoRoot,
    });

    printPackagePlan(plan);
    writePackagePlan(plan, DEFAULT_PACKAGE_PLAN_FILE, {
      repoRoot,
    });
    appendPnpmSummary(plan);

    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "install") {
    const result = pnpmInstall({
      repoRoot,
      inherit: true,
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "audit") {
    const result = pnpmAudit({
      repoRoot,
    });

    const parsed = parsePnpmAuditResult(result);

    console.log(JSON.stringify(parsed, null, 2));

    if (result.status !== 0) {
      process.exitCode = result.status;
    }

    return;
  }

  if (command === "pack") {
    const plan = createPackagePlan({
      repoRoot,
    });

    const results = plan.packages.map((workspacePackage) =>
      packPackage(workspacePackage, {
        repoRoot,
      }),
    );

    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (command === "publish") {
    assertReleasePublishingAllowed();

    const plan = createPackagePlan({
      repoRoot,
    });

    printPackagePlan(plan);

    const results = publishPackages(
      plan.packages.map((plannedPackage) =>
        normalizePackageDescriptor(plannedPackage.package_json_path, {
          repoRoot,
        }),
      ),
      {
        repoRoot,
        provenance: true,
      },
    );

    const manifest = createPublishManifest({
      plan,
      results,
    });

    writePublishManifest(manifest, DEFAULT_PUBLISH_MANIFEST_FILE, {
      repoRoot,
    });

    appendPnpmSummary(manifest);

    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  throw new Error(`Unknown pnpm utility command: ${command}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_NODE_VERSION,
  DEFAULT_PNPM_VERSION,
  DEFAULT_DEFAULT_BRANCH,
  DEFAULT_PNPM_COMMAND,
  DEFAULT_REGISTRY,
  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_REPO_ROOT_MARKERS,
  DEFAULT_PACKAGE_DISCOVERY_ROOTS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_CACHE_INPUT_FILES,
  DEFAULT_SECURITY_AUDIT_LEVEL,
  DEFAULT_PACKAGE_ARTIFACT_DIR,
  DEFAULT_PUBLISH_MANIFEST_FILE,
  DEFAULT_PACKAGE_PLAN_FILE,
  DEPENDENCY_FIELD_NAMES,
  RELEASE_TAG_PATTERN,

  isPlainObject,
  unique,

  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  normalizeBranchName,
  normalizeTagName,
  isReleaseTag,

  sortObjectDeep,
  stableStringify,

  getDryRun,
  allowLocalFileWrites,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,
  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  ensureParentDir,
  writeFile,
  writeJson,
  readJson,
  readYaml,

  fileHash,
  hashFiles,

  shouldIgnoreDirectory,

  readRootPackageJson,
  readPackageJson,
  readPnpmWorkspace,
  readPnpmLockfile,

  packageNameToSafeName,
  packageNameToScope,
  packageNameToUnscopedName,

  getPackageManager,
  isPnpmPackageManager,
  getExpectedPnpmVersion,

  getWorkspacePackagePatterns,
  globToRegExp,
  matchesGlob,
  matchesAnyGlob,

  discoverPackageJsonFiles,
  normalizePackageDescriptor,
  discoverWorkspacePackages,
  discoverPublishablePackages,

  getDependencyEntries,
  createDependencySummary,

  runCommand,
  runPnpm,

  getNodeVersion,
  getPnpmVersion,
  validatePnpmVersion,
  assertPnpmVersion,
  getPnpmStorePath,

  createPnpmInstallArgs,
  pnpmInstall,

  createPnpmAuditArgs,
  pnpmAudit,
  parsePnpmAuditResult,

  createPnpmOutdatedArgs,
  pnpmOutdated,

  createPnpmPackArgs,
  packPackage,

  createPublishArgs,
  validatePackagePublishable,
  publishPackage,
  publishPackages,

  createPackagePlan,
  createPublishManifest,
  writePackagePlan,
  writePublishManifest,

  createPnpmCacheKey,
  createPnpmCachePlan,

  createPnpmSummary,
  appendGitHubStepSummary,
  appendPnpmSummary,
  setGitHubOutput,
  printPackagePlan,

  validateReleasePublishingAllowed,
  assertReleasePublishingAllowed,
};
