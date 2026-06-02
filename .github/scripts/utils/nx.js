// .github/scripts/utils/nx.js
// =============================================================================
// Aerealith AI Nx Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared Nx monorepo helpers for GitHub workflow automation scripts.
//
// Used by:
//   - CI workflow helper scripts
//   - test discovery scripts
//   - build planning scripts
//   - release validation scripts
//   - Cloudflare deployment scripts
//   - Docker/GHCR discovery scripts
//   - artifact/evidence scripts
//
// Notes:
//   - CommonJS only.
//   - Uses pnpm + Nx.
//   - Defaults:
//       pnpm 10.23.0
//       Node.js 24.15.0
//       default branch main
//   - All test/build actions are expected to be Nx targets.
//   - Detects Jest, Vitest, Cypress, Playwright, e2e projects, Dockerfiles,
//     build targets, lint targets, format targets, and typecheck targets.
//   - Safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("./logger");

const DEFAULT_NODE_VERSION = "24.15.0";
const DEFAULT_PNPM_VERSION = "10.23.0";
const DEFAULT_DEFAULT_BRANCH = "main";

const DEFAULT_NX_COMMAND = "nx";
const DEFAULT_PNPM_COMMAND = "pnpm";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "nx.json",
  "pnpm-workspace.yaml",
  "package.json",
];

const DEFAULT_DISCOVERY_ROOTS = [
  "apps",
  "apps/connectors",
  "apps/e2e",
  "apps/engines",
  "apps/frontend",
  "apps/integrations",
  "apps/services",
  "libs",
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

const DEFAULT_PROJECT_CONFIG_NAMES = ["project.json"];

const DEFAULT_TEST_FRAMEWORKS = {
  jest: {
    target_names: ["test", "jest"],
    executor_patterns: ["@nx/jest:jest", "@nrwl/jest:jest", "jest"],
    config_files: [
      "jest.config.js",
      "jest.config.ts",
      "jest.config.mjs",
      "jest.config.cjs",
    ],
  },
  vitest: {
    target_names: ["test", "vitest"],
    executor_patterns: ["@nx/vite:test", "@nrwl/vite:test", "vitest"],
    config_files: [
      "vitest.config.js",
      "vitest.config.ts",
      "vitest.config.mjs",
      "vitest.config.cjs",
    ],
  },
  cypress: {
    target_names: ["e2e", "cypress", "component-test", "component"],
    executor_patterns: [
      "@nx/cypress:cypress",
      "@nrwl/cypress:cypress",
      "cypress",
    ],
    config_files: ["cypress.config.js", "cypress.config.ts", "cypress.json"],
  },
  playwright: {
    target_names: ["e2e", "playwright"],
    executor_patterns: [
      "@nx/playwright:playwright",
      "@nrwl/playwright:playwright",
      "playwright",
    ],
    config_files: [
      "playwright.config.js",
      "playwright.config.ts",
      "playwright.config.mjs",
      "playwright.config.cjs",
    ],
  },
};

const DEFAULT_TARGET_ORDER = [
  "format",
  "lint",
  "typecheck",
  "test",
  "build",
  "e2e",
];

const DEFAULT_TARGET_ALIASES = {
  format: ["format", "format:check", "format-check"],
  lint: ["lint", "eslint"],
  typecheck: ["typecheck", "type-check", "tsc"],
  test: ["test", "unit-test", "unit", "jest", "vitest"],
  build: ["build", "compile", "bundle"],
  e2e: ["e2e", "e2e-ci", "cypress", "playwright"],
};

const DEFAULT_CACHE_INPUT_FILES = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package.json",
  "nx.json",
  "tsconfig.base.json",
  "tsconfig.json",
];

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

function writeJson(filePath, value, options = {}) {
  const dryRun = getDryRun(options);
  const contents = `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`;

  ensureDir(path.dirname(filePath), options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would write JSON file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, value);

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

function stripJsonComments(input) {
  const source = String(input ?? "");
  let output = "";

  let inString = false;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        output += current;
      }

      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }

      continue;
    }

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function stripTrailingCommas(input) {
  const source = String(input ?? "");
  let output = "";

  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }

    if (current === ",") {
      let cursor = index + 1;

      while (cursor < source.length && /\s/.test(source[cursor])) {
        cursor += 1;
      }

      if (source[cursor] === "}" || source[cursor] === "]") {
        continue;
      }
    }

    output += current;
  }

  return output;
}

function readJsonFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `JSON file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    const raw = fs.readFileSync(absolutePath, "utf8");
    const normalized = stripTrailingCommas(stripJsonComments(raw));
    return JSON.parse(normalized);
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
}

function readNxJson(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return (
    readJsonFile("nx.json", {
      ...options,
      repoRoot,
      required: false,
      fallback: {},
    }) || {}
  );
}

function readPackageJson(packageJsonPath = "package.json", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return readJsonFile(packageJsonPath, {
    ...options,
    repoRoot,
    required: false,
    fallback: null,
  });
}

function readPnpmWorkspace(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const workspacePath = resolvePath("pnpm-workspace.yaml", repoRoot);

  if (!isFile(workspacePath)) return null;

  try {
    const yaml = require("js-yaml");
    return yaml.load(fs.readFileSync(workspacePath, "utf8")) || {};
  } catch (err) {
    throw new Error(
      `Failed to parse pnpm-workspace.yaml: ${logger.formatError(err)}`,
    );
  }
}

function shouldIgnoreDirectory(dirName) {
  return DEFAULT_IGNORE_DIRS.has(dirName);
}

function discoverProjectConfigFiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const roots = normalizeStringList(options.roots || DEFAULT_DISCOVERY_ROOTS);
  const configNames = normalizeStringList(
    options.configNames || DEFAULT_PROJECT_CONFIG_NAMES,
  );

  const discovered = [];

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

      if (entry.isFile() && configNames.includes(entry.name)) {
        discovered.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    visit(resolvePath(root, repoRoot));
  }

  return unique(discovered)
    .sort()
    .map((filePath) => toRelativePath(filePath, repoRoot));
}

function inferProjectType(root, project = {}) {
  const normalizedRoot = toPosixPath(root);

  if (project.projectType) return project.projectType;

  if (
    normalizedRoot.startsWith("apps/e2e/") ||
    normalizedRoot.includes("-e2e")
  ) {
    return "e2e";
  }

  if (normalizedRoot.startsWith("apps/")) return "application";
  if (normalizedRoot.startsWith("libs/")) return "library";

  return "unknown";
}

function inferProjectArea(root) {
  const normalizedRoot = toPosixPath(root);

  if (
    normalizedRoot === "apps/frontend" ||
    normalizedRoot.startsWith("apps/frontend/")
  ) {
    return "frontend";
  }

  if (normalizedRoot.startsWith("apps/connectors/")) return "connectors";
  if (normalizedRoot.startsWith("apps/e2e/")) return "e2e";
  if (normalizedRoot.startsWith("apps/engines/")) return "engines";
  if (normalizedRoot.startsWith("apps/integrations/")) return "integrations";
  if (normalizedRoot.startsWith("apps/services/")) return "services";
  if (normalizedRoot.startsWith("libs/")) return "libs";

  return "workspace";
}

function normalizeTarget(target = {}) {
  if (!target) return {};

  return {
    ...target,
    executor: target.executor || target.builder || null,
    command: target.options?.command || target.command || null,
  };
}

function normalizeProjectConfig(projectConfigPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const config = readJsonFile(projectConfigPath, {
    ...options,
    repoRoot,
  });

  const root = toPosixPath(path.dirname(projectConfigPath));
  const name = config.name || root.split("/").filter(Boolean).join("-");

  const targets = Object.fromEntries(
    Object.entries(config.targets || config.architect || {}).map(
      ([targetName, targetConfig]) => [
        targetName,
        normalizeTarget(targetConfig),
      ],
    ),
  );

  return {
    ...config,
    name,
    root,
    sourceRoot: config.sourceRoot || config.source_root || null,
    projectType: inferProjectType(root, config),
    area: inferProjectArea(root),
    targets,
    project_json: projectConfigPath,
  };
}

function discoverNxProjects(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const projects = discoverProjectConfigFiles({
    ...options,
    repoRoot,
  }).map((projectConfigPath) =>
    normalizeProjectConfig(projectConfigPath, {
      ...options,
      repoRoot,
    }),
  );

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

function getProjectByName(projectName, projects = [], options = {}) {
  const normalizedName = normalizeString(projectName);

  if (!normalizedName) return null;

  const availableProjects = projects.length
    ? projects
    : discoverNxProjects(options);

  return (
    availableProjects.find((project) => project.name === normalizedName) ||
    availableProjects.find((project) => project.root === normalizedName) ||
    null
  );
}

function getTarget(project, targetName) {
  if (!project || !project.targets) return null;

  return project.targets[targetName] || null;
}

function projectHasTarget(project, targetName) {
  return Boolean(getTarget(project, targetName));
}

function findTargetName(project, aliases = []) {
  const targetNames = Object.keys(project.targets || {});
  const candidates = normalizeStringList(aliases);

  return (
    candidates.find((candidate) => targetNames.includes(candidate)) || null
  );
}

function findProjectsWithTarget(projects = [], targetNameOrAliases = []) {
  const aliases = normalizeStringList(targetNameOrAliases);

  return projects
    .map((project) => {
      const target = findTargetName(project, aliases);
      return target
        ? {
            ...project,
            selected_target: target,
          }
        : null;
    })
    .filter(Boolean);
}

function targetMatchesExecutor(target, executorPatterns = []) {
  const executor = normalizeString(
    target?.executor || target?.builder || target?.command,
  );

  if (!executor) return false;

  return normalizeStringList(executorPatterns).some((pattern) => {
    return executor === pattern || executor.includes(pattern);
  });
}

function projectHasConfigFile(project, fileNames = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const names = normalizeStringList(fileNames);

  return names.some((fileName) => {
    return isFile(resolvePath(path.join(project.root, fileName), repoRoot));
  });
}

function detectTestFrameworksForProject(project, options = {}) {
  const detected = [];

  for (const [frameworkName, framework] of Object.entries(
    DEFAULT_TEST_FRAMEWORKS,
  )) {
    const targetName = findTargetName(project, framework.target_names);
    const target = targetName ? project.targets[targetName] : null;

    const executorDetected = targetMatchesExecutor(
      target,
      framework.executor_patterns,
    );
    const configDetected = projectHasConfigFile(
      project,
      framework.config_files,
      options,
    );

    if (
      targetName &&
      (executorDetected ||
        configDetected ||
        frameworkName === "jest" ||
        frameworkName === "vitest")
    ) {
      detected.push({
        framework: frameworkName,
        target: targetName,
        reason: executorDetected
          ? "executor"
          : configDetected
            ? "config"
            : "target",
      });
      continue;
    }

    if (configDetected) {
      detected.push({
        framework: frameworkName,
        target: targetName,
        reason: "config",
      });
    }
  }

  if (
    project.projectType === "e2e" &&
    !detected.some(
      (item) => item.framework === "cypress" || item.framework === "playwright",
    )
  ) {
    const e2eTarget = findTargetName(project, DEFAULT_TARGET_ALIASES.e2e);

    if (e2eTarget) {
      detected.push({
        framework: "e2e",
        target: e2eTarget,
        reason: "project-type",
      });
    }
  }

  return detected;
}

function detectDockerfilesForProject(project, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const projectRoot = resolvePath(project.root, repoRoot);

  if (!isDirectory(projectRoot)) return [];

  const dockerfiles = [];

  function visit(dirPath) {
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

      if (entry.isFile() && /^Dockerfile(\..+)?$/.test(entry.name)) {
        dockerfiles.push(toRelativePath(entryPath, repoRoot));
      }
    }
  }

  visit(projectRoot);

  return dockerfiles.sort();
}

function createProjectDiscoverySummary(projects = [], options = {}) {
  const summarizedProjects = projects.map((project) => {
    const testFrameworks = detectTestFrameworksForProject(project, options);
    const dockerfiles = detectDockerfilesForProject(project, options);

    return {
      name: project.name,
      root: project.root,
      area: project.area,
      project_type: project.projectType,
      targets: Object.keys(project.targets || {}).sort(),
      target_flags: {
        format: Boolean(findTargetName(project, DEFAULT_TARGET_ALIASES.format)),
        lint: Boolean(findTargetName(project, DEFAULT_TARGET_ALIASES.lint)),
        typecheck: Boolean(
          findTargetName(project, DEFAULT_TARGET_ALIASES.typecheck),
        ),
        test: Boolean(findTargetName(project, DEFAULT_TARGET_ALIASES.test)),
        build: Boolean(findTargetName(project, DEFAULT_TARGET_ALIASES.build)),
        e2e: Boolean(findTargetName(project, DEFAULT_TARGET_ALIASES.e2e)),
      },
      test_frameworks: testFrameworks,
      dockerfiles,
    };
  });

  return {
    schema_version: 1,
    type: "nx-project-discovery",
    created_at: new Date().toISOString(),
    totals: {
      projects: summarizedProjects.length,
      applications: summarizedProjects.filter(
        (project) => project.project_type === "application",
      ).length,
      libraries: summarizedProjects.filter(
        (project) => project.project_type === "library",
      ).length,
      e2e: summarizedProjects.filter(
        (project) => project.project_type === "e2e",
      ).length,
      with_tests: summarizedProjects.filter(
        (project) => project.test_frameworks.length > 0,
      ).length,
      with_dockerfiles: summarizedProjects.filter(
        (project) => project.dockerfiles.length > 0,
      ).length,
    },
    projects: summarizedProjects,
  };
}

function normalizeBaseHead(options = {}) {
  const base =
    options.base ||
    process.env.NX_BASE ||
    process.env.GITHUB_BASE_REF ||
    process.env.DEFAULT_BRANCH ||
    DEFAULT_DEFAULT_BRANCH;

  const head =
    options.head ||
    process.env.NX_HEAD ||
    process.env.GITHUB_SHA ||
    process.env.GITHUB_HEAD_REF ||
    "HEAD";

  return {
    base: normalizeString(base, DEFAULT_DEFAULT_BRANCH),
    head: normalizeString(head, "HEAD"),
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

function buildNxCommandArgs(nxArgs = [], options = {}) {
  const args = [
    "exec",
    options.nxCommand || options.nx_command || DEFAULT_NX_COMMAND,
  ];

  args.push(...normalizeStringList(nxArgs));

  return args;
}

function runNx(nxArgs = [], options = {}) {
  const command =
    options.pnpmCommand || options.pnpm_command || DEFAULT_PNPM_COMMAND;
  const args = buildNxCommandArgs(nxArgs, options);

  return runCommand(command, args, options);
}

function getNxVersion(options = {}) {
  const result = runNx(["--version"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  return (
    normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0] || null
  );
}

function getPnpmVersion(options = {}) {
  const result = runCommand(DEFAULT_PNPM_COMMAND, ["--version"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  return (
    normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0] ||
    DEFAULT_PNPM_VERSION
  );
}

function getNodeVersion() {
  return process.version.replace(/^v/, "");
}

function nxShowProjects(options = {}) {
  const result = runNx(["show", "projects", "--json"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout);

    if (Array.isArray(parsed)) return parsed;

    if (isPlainObject(parsed)) {
      return Object.keys(parsed);
    }

    return [];
  } catch {
    return [];
  }
}

function nxShowProject(projectName, options = {}) {
  const result = runNx(["show", "project", projectName, "--json"], {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function nxPrintAffected(options = {}) {
  const { base, head } = normalizeBaseHead(options);

  const args = [
    "print-affected",
    "--base",
    base,
    "--head",
    head,
    "--select=projects",
  ];

  const result = runNx(args, {
    ...options,
    executeInDryRun: true,
    allowFailure: true,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAffectedProjects(options = {}) {
  const fromNx = nxPrintAffected(options);

  if (fromNx.length) return unique(fromNx).sort();

  const { base, head } = normalizeBaseHead(options);

  const result = runNx(
    [
      "show",
      "projects",
      "--affected",
      "--base",
      base,
      "--head",
      head,
      "--json",
    ],
    {
      ...options,
      executeInDryRun: true,
      allowFailure: true,
    },
  );

  if (result.status === 0 && result.stdout.trim()) {
    try {
      const parsed = JSON.parse(result.stdout);

      if (Array.isArray(parsed)) return unique(parsed).sort();
      if (isPlainObject(parsed)) return Object.keys(parsed).sort();
    } catch {
      // Fall through to all projects.
    }
  }

  return discoverNxProjects(options)
    .map((project) => project.name)
    .sort();
}

function createNxTargetCommand(target, options = {}) {
  const { base, head } = normalizeBaseHead(options);
  const affected = normalizeBoolean(options.affected, true);
  const parallel = Number(options.parallel || process.env.NX_PARALLEL || 3);
  const configuration = normalizeString(
    options.configuration || options.config || "",
  );
  const exclude = normalizeStringList(options.exclude);
  const projects = normalizeStringList(options.projects);

  const args = [];

  if (affected) {
    args.push("affected", "--target", target, "--base", base, "--head", head);
  } else if (projects.length) {
    args.push("run-many", "--target", target, "--projects", projects.join(","));
  } else {
    args.push("run-many", "--target", target, "--all");
  }

  if (parallel > 0) {
    args.push("--parallel", String(parallel));
  }

  if (configuration) {
    args.push("--configuration", configuration);
  }

  if (exclude.length) {
    args.push("--exclude", exclude.join(","));
  }

  if (options.skipNxCache || options.skip_nx_cache) {
    args.push("--skip-nx-cache");
  }

  if (options.verbose) {
    args.push("--verbose");
  }

  return args;
}

function runNxTarget(target, options = {}) {
  return runNx(createNxTargetCommand(target, options), options);
}

function runNxTargets(targets = [], options = {}) {
  const orderedTargets = normalizeTargetOrder(targets, options);

  const results = [];

  for (const target of orderedTargets) {
    results.push({
      target,
      result: runNxTarget(target, options),
    });
  }

  return results;
}

function normalizeTargetOrder(targets = [], options = {}) {
  const inputTargets = normalizeStringList(targets);
  const targetOrder = normalizeStringList(
    options.targetOrder || options.target_order || DEFAULT_TARGET_ORDER,
  );

  return unique([
    ...targetOrder.filter((target) => inputTargets.includes(target)),
    ...inputTargets.filter((target) => !targetOrder.includes(target)),
  ]);
}

function createTargetPlanForProjects(projects = [], options = {}) {
  const targetAliases = {
    ...DEFAULT_TARGET_ALIASES,
    ...(options.targetAliases || options.target_aliases || {}),
  };

  const targetOrder = normalizeStringList(
    options.targetOrder || options.target_order || DEFAULT_TARGET_ORDER,
  );

  const planTargets = [];

  for (const targetGroup of targetOrder) {
    const aliases = targetAliases[targetGroup] || [targetGroup];

    const selectedProjects = projects
      .map((project) => {
        const target = findTargetName(project, aliases);

        if (!target) return null;

        return {
          name: project.name,
          root: project.root,
          area: project.area,
          project_type: project.projectType,
          target,
          test_frameworks:
            targetGroup === "test" || targetGroup === "e2e"
              ? detectTestFrameworksForProject(project, options)
              : [],
        };
      })
      .filter(Boolean);

    if (!selectedProjects.length) continue;

    planTargets.push({
      group: targetGroup,
      aliases,
      projects: selectedProjects,
      project_count: selectedProjects.length,
    });
  }

  return planTargets;
}

function createCiPlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();

  const allProjects =
    input.projects ||
    discoverNxProjects({
      ...input,
      repoRoot,
    });

  const affectedProjectNames = normalizeBoolean(input.affected, true)
    ? getAffectedProjects({
        ...input,
        repoRoot,
      })
    : allProjects.map((project) => project.name);

  const selectedProjects = allProjects.filter((project) =>
    affectedProjectNames.includes(project.name),
  );

  const targets = createTargetPlanForProjects(selectedProjects, {
    ...input,
    repoRoot,
  });

  const dockerProjects = selectedProjects
    .map((project) => ({
      name: project.name,
      root: project.root,
      area: project.area,
      dockerfiles: detectDockerfilesForProject(project, {
        ...input,
        repoRoot,
      }),
    }))
    .filter((project) => project.dockerfiles.length > 0);

  const { base, head } = normalizeBaseHead(input);

  return {
    schema_version: 1,
    type: "nx-ci-plan",
    created_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    repo_root: repoRoot,
    tooling: {
      node_version: getNodeVersion(),
      expected_node_version: DEFAULT_NODE_VERSION,
      pnpm_version: getPnpmVersion({
        ...input,
        repoRoot,
      }),
      expected_pnpm_version: DEFAULT_PNPM_VERSION,
      nx_version: getNxVersion({
        ...input,
        repoRoot,
      }),
    },
    affected: normalizeBoolean(input.affected, true),
    base,
    head,
    totals: {
      all_projects: allProjects.length,
      affected_projects: selectedProjects.length,
      target_groups: targets.length,
      docker_projects: dockerProjects.length,
    },
    affected_projects: selectedProjects.map((project) => ({
      name: project.name,
      root: project.root,
      area: project.area,
      project_type: project.projectType,
    })),
    targets,
    docker_projects: dockerProjects,
  };
}

function createNxCacheKey(input = {}) {
  const osName = process.platform;
  const nodeVersion = normalizeString(
    input.nodeVersion || input.node_version,
    DEFAULT_NODE_VERSION,
  );
  const pnpmVersion = normalizeString(
    input.pnpmVersion || input.pnpm_version,
    DEFAULT_PNPM_VERSION,
  );
  const scope = normalizeString(input.scope, "nx");
  const target = normalizeString(input.target, "all");
  const branch = normalizeString(
    input.branch ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      DEFAULT_DEFAULT_BRANCH,
    DEFAULT_DEFAULT_BRANCH,
  );

  return [
    "aerealith",
    scope,
    `os-${osName}`,
    `node-${nodeVersion}`,
    `pnpm-${pnpmVersion}`,
    `branch-${branch.replace(/[^\w.-]+/g, "-")}`,
    `target-${target}`,
  ].join("-");
}

function createCachePlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const cacheInputFiles = normalizeStringList(
    input.inputFiles || input.input_files || DEFAULT_CACHE_INPUT_FILES,
  );

  return {
    schema_version: 1,
    type: "nx-cache-plan",
    created_at: new Date().toISOString(),
    human_readable: true,
    keys: {
      pnpm_store: createNxCacheKey({
        ...input,
        scope: "pnpm-store",
        target: "install",
      }),
      nx_cache: createNxCacheKey({
        ...input,
        scope: "nx-cache",
        target: input.target || "all-targets",
      }),
      playwright_browsers: createNxCacheKey({
        ...input,
        scope: "playwright-browsers",
        target: "e2e",
      }),
      cypress_binary: createNxCacheKey({
        ...input,
        scope: "cypress-binary",
        target: "e2e",
      }),
    },
    paths: {
      pnpm_store: "~/.local/share/pnpm/store",
      nx_cache: ".nx/cache",
      playwright_browsers: "~/.cache/ms-playwright",
      cypress_binary: "~/.cache/Cypress",
    },
    input_files: cacheInputFiles
      .map((filePath) => resolvePath(filePath, repoRoot))
      .filter((filePath) => isFile(filePath))
      .map((filePath) => toRelativePath(filePath, repoRoot)),
  };
}

function createCiSummary(plan) {
  const lines = [
    "## Nx CI Plan",
    "",
    `- Affected mode: \`${plan.affected ? "true" : "false"}\``,
    `- Base: \`${plan.base}\``,
    `- Head: \`${plan.head}\``,
    `- Projects: \`${plan.totals.affected_projects}/${plan.totals.all_projects}\``,
    `- Target groups: \`${plan.totals.target_groups}\``,
    `- Docker projects: \`${plan.totals.docker_projects}\``,
    "",
    "### Tooling",
    "",
    `- Node.js: \`${plan.tooling.node_version}\``,
    `- pnpm: \`${plan.tooling.pnpm_version}\``,
    `- Nx: \`${plan.tooling.nx_version || "unknown"}\``,
  ];

  if (plan.targets.length) {
    lines.push("");
    lines.push("### Target Order");
    lines.push("");
    lines.push("| Order | Target Group | Projects |");
    lines.push("|---:|---|---:|");

    plan.targets.forEach((target, index) => {
      lines.push(
        `| ${index + 1} | \`${target.group}\` | \`${target.project_count}\` |`,
      );
    });
  }

  if (plan.affected_projects.length) {
    lines.push("");
    lines.push("### Affected Projects");
    lines.push("");
    lines.push("| Project | Area | Type | Root |");
    lines.push("|---|---|---|---|");

    for (const project of plan.affected_projects) {
      lines.push(
        `| \`${project.name}\` | \`${project.area}\` | \`${project.project_type}\` | \`${project.root}\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug("GITHUB_STEP_SUMMARY is not set. Skipping Nx summary append.");
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function appendCiSummary(plan) {
  return appendGitHubStepSummary(createCiSummary(plan));
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

function printCiPlan(plan) {
  logger.info(
    `Nx CI plan created for ${plan.totals.affected_projects} affected project(s).`,
  );

  for (const target of plan.targets) {
    logger.info(`- ${target.group}: ${target.project_count} project(s)`);
  }

  logger.dump("nx ci plan", plan);
}

function runCli() {
  const command = process.argv[2] || "plan";
  const repoRoot = findRepoRoot();

  if (command === "discover") {
    const projects = discoverNxProjects({
      repoRoot,
    });

    const summary = createProjectDiscoverySummary(projects, {
      repoRoot,
    });

    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "affected") {
    const affected = getAffectedProjects({
      repoRoot,
    });

    console.log(JSON.stringify(affected, null, 2));
    return;
  }

  if (command === "plan") {
    const plan = createCiPlan({
      repoRoot,
      affected: process.argv.includes("--all") ? false : true,
    });

    printCiPlan(plan);
    appendCiSummary(plan);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "cache-plan") {
    const plan = createCachePlan({
      repoRoot,
    });

    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "run") {
    const targets = process.argv.slice(3);

    if (!targets.length) {
      throw new Error("At least one Nx target is required.");
    }

    const results = runNxTargets(targets, {
      repoRoot,
      affected: true,
    });

    console.log(JSON.stringify(results, null, 2));
    return;
  }

  throw new Error(`Unknown Nx utility command: ${command}`);
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
  DEFAULT_NX_COMMAND,
  DEFAULT_PNPM_COMMAND,
  DEFAULT_REPO_ROOT_MARKERS,
  DEFAULT_DISCOVERY_ROOTS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_PROJECT_CONFIG_NAMES,
  DEFAULT_TEST_FRAMEWORKS,
  DEFAULT_TARGET_ORDER,
  DEFAULT_TARGET_ALIASES,
  DEFAULT_CACHE_INPUT_FILES,

  isPlainObject,
  unique,
  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  sortObjectDeep,

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
  writeJson,

  stripJsonComments,
  stripTrailingCommas,
  readJsonFile,
  readNxJson,
  readPackageJson,
  readPnpmWorkspace,

  discoverProjectConfigFiles,
  inferProjectType,
  inferProjectArea,
  normalizeTarget,
  normalizeProjectConfig,
  discoverNxProjects,
  getProjectByName,

  getTarget,
  projectHasTarget,
  findTargetName,
  findProjectsWithTarget,
  targetMatchesExecutor,
  projectHasConfigFile,

  detectTestFrameworksForProject,
  detectDockerfilesForProject,
  createProjectDiscoverySummary,

  normalizeBaseHead,

  runCommand,
  buildNxCommandArgs,
  runNx,
  getNxVersion,
  getPnpmVersion,
  getNodeVersion,
  nxShowProjects,
  nxShowProject,
  nxPrintAffected,
  getAffectedProjects,

  createNxTargetCommand,
  runNxTarget,
  runNxTargets,
  normalizeTargetOrder,

  createTargetPlanForProjects,
  createCiPlan,

  createNxCacheKey,
  createCachePlan,

  createCiSummary,
  appendGitHubStepSummary,
  appendCiSummary,
  setGitHubOutput,
  printCiPlan,
};
