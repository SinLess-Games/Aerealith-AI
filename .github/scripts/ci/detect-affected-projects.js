#!/usr/bin/env node
// .github/scripts/ci/detect-affected-projects.js
// =============================================================================
// Aerealith AI — CI Affected Project Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Detect changed files and affected Nx/workspace projects for CI planning,
//   selective checks, matrix generation, build/test targeting, release evidence,
//   and GitHub Actions outputs.
//
// Output:
//   - artifacts/ci/affected-projects.json
//   - artifacts/ci/affected-projects.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses Nx when available.
//   - Falls back to deterministic changed-file/project-root matching.
//   - Does not mutate GitHub.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[affected-projects] ${message}`),
    warn: (message) => console.warn(`[affected-projects] WARN: ${message}`),
    error: (message) => console.error(`[affected-projects] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/affected-projects.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/affected-projects.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_PROJECT_ROOTS = ["apps", "libs", "packages", "tools"];

const GLOBAL_CHANGE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.json",
  "tsconfig.base.json",
  ".npmrc",
  ".node-version",
  ".nvmrc",
  ".env.example",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "prettier.config.js",
  "prettier.config.mjs",
  "prettier.config.cjs",
  "prettier.config.ts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
  "jest.config.js",
  "jest.config.ts",
  "playwright.config.js",
  "playwright.config.ts",
  "turbo.json",
]);

const GLOBAL_CHANGE_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/scripts/",
  ".github/repo-management/",
];

const CATEGORY_RULES = [
  { name: "github", pattern: /^\.github\// },
  { name: "apps", pattern: /^apps\// },
  { name: "libs", pattern: /^libs\// },
  { name: "packages", pattern: /^packages\// },
  { name: "tools", pattern: /^tools\// },
  { name: "docs", pattern: /^(docs|Docs)\// },
  {
    name: "config",
    pattern:
      /(^|\/)(package\.json|project\.json|nx\.json|tsconfig.*\.json|eslint\.config\..*|prettier\.config\..*)$/,
  },
  { name: "root", pattern: /^[^/]+$/ },
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

    base:
      process.env.NX_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.NX_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",

    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    head_ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",

    output_file:
      process.env.AFFECTED_PROJECTS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.AFFECTED_PROJECTS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    project_roots: normalizeStringList(process.env.AFFECTED_PROJECT_ROOTS),
    targets: normalizeStringList(
      process.env.AFFECTED_TARGETS || process.env.NX_TARGETS,
    ),

    use_nx: normalizeBoolean(process.env.AFFECTED_USE_NX, true),
    all_on_global_change: normalizeBoolean(
      process.env.AFFECTED_ALL_ON_GLOBAL_CHANGE,
      true,
    ),
    include_untracked: normalizeBoolean(
      process.env.AFFECTED_INCLUDE_UNTRACKED,
      true,
    ),
    include_staged: normalizeBoolean(process.env.AFFECTED_INCLUDE_STAGED, true),
    include_deleted: normalizeBoolean(
      process.env.AFFECTED_INCLUDE_DELETED,
      true,
    ),
    fail_if_none: normalizeBoolean(process.env.AFFECTED_FAIL_IF_NONE, false),

    max_changed_files: normalizeInteger(
      process.env.AFFECTED_MAX_CHANGED_FILES,
      1000,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.AFFECTED_PROJECTS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.AFFECTED_PROJECTS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.AFFECTED_PROJECTS_STEP_SUMMARY,
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

    if (arg === "--base") {
      args.base = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head") {
      args.head = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--base-ref") {
      args.base_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head-ref") {
      args.head_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--targets") {
      args.targets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--project-root" || arg === "--project-roots") {
      args.project_roots.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--use-nx") {
      args.use_nx = true;
      continue;
    }

    if (arg === "--no-nx") {
      args.use_nx = false;
      continue;
    }

    if (arg === "--all-on-global-change") {
      args.all_on_global_change = true;
      continue;
    }

    if (arg === "--no-all-on-global-change") {
      args.all_on_global_change = false;
      continue;
    }

    if (arg === "--include-untracked") {
      args.include_untracked = true;
      continue;
    }

    if (arg === "--no-untracked") {
      args.include_untracked = false;
      continue;
    }

    if (arg === "--include-staged") {
      args.include_staged = true;
      continue;
    }

    if (arg === "--no-staged") {
      args.include_staged = false;
      continue;
    }

    if (arg === "--include-deleted") {
      args.include_deleted = true;
      continue;
    }

    if (arg === "--no-deleted") {
      args.include_deleted = false;
      continue;
    }

    if (arg === "--max-changed-files") {
      args.max_changed_files = normalizeInteger(
        argv[index + 1],
        args.max_changed_files,
      );
      index += 1;
      continue;
    }

    if (arg === "--fail-if-none") {
      args.fail_if_none = true;
      continue;
    }

    if (arg === "--dry-run") {
      args.dry_run = true;
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

  if (!args.project_roots.length) {
    args.project_roots = [...DEFAULT_PROJECT_ROOTS];
  }

  args.project_roots = [...new Set(args.project_roots.map(toPosixPath))];
  args.targets = [...new Set(args.targets)];
  args.max_changed_files = Math.max(0, args.max_changed_files);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Affected Project Detector

Usage:
  node .github/scripts/ci/detect-affected-projects.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --base <sha|ref>                 Base commit/ref.
      --head <sha|ref>                 Head commit/ref.
      --base-ref <branch>              Base branch name. Default: main.
      --head-ref <branch>              Head branch name.
      --target <list>                  Target names for matrix metadata.
      --project-root <path,list>       Project root folders. Default: apps,libs,packages,tools.
      --use-nx                         Use Nx affected detection. Default.
      --no-nx                          Skip Nx and use fallback matching.
      --all-on-global-change           Mark all projects affected for global files. Default.
      --no-all-on-global-change        Do not mark all projects affected for global files.
      --include-untracked              Include untracked files. Default.
      --no-untracked                   Do not include untracked files.
      --include-staged                 Include staged files. Default.
      --no-staged                      Do not include staged files.
      --include-deleted                Include deleted files. Default.
      --no-deleted                     Exclude deleted files.
      --max-changed-files <number>     Maximum changed files to report. 0 means unlimited.
      --fail-if-none                   Exit non-zero when no projects are affected.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Do not write files.
      --no-print                       Do not print JSON result.
      --no-step-summary                Do not append GitHub step summary.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function runCommand(command, commandArgs = [], options = {}) {
  try {
    return childProcess
      .execFileSync(command, commandArgs, {
        cwd: options.cwd || process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
      })
      .trim();
  } catch (err) {
    if (options.throw_on_error) throw err;
    return options.fallback ?? "";
  }
}

function runGit(args, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return runCommand("git", args, {
    cwd: repoRoot,
    fallback: options.fallback ?? "",
    throw_on_error: options.throw_on_error,
  });
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

function gitRefExists(ref, repoRoot) {
  if (!ref) return false;

  try {
    childProcess.execFileSync(
      "git",
      ["rev-parse", "--verify", "--quiet", ref],
      {
        cwd: repoRoot,
        stdio: "ignore",
      },
    );

    return true;
  } catch {
    return false;
  }
}

function resolveGitRef(candidates, repoRoot) {
  for (const candidate of candidates.map(normalizeString).filter(Boolean)) {
    if (gitRefExists(candidate, repoRoot)) return candidate;

    if (
      !candidate.startsWith("origin/") &&
      gitRefExists(`origin/${candidate}`, repoRoot)
    ) {
      return `origin/${candidate}`;
    }

    if (
      !candidate.startsWith("refs/heads/") &&
      gitRefExists(`refs/heads/${candidate}`, repoRoot)
    ) {
      return `refs/heads/${candidate}`;
    }

    if (
      !candidate.startsWith("refs/remotes/origin/") &&
      gitRefExists(`refs/remotes/origin/${candidate}`, repoRoot)
    ) {
      return `refs/remotes/origin/${candidate}`;
    }
  }

  return "";
}

function resolveRange(args, repoRoot, git) {
  const base = resolveGitRef(
    [
      args.base,
      process.env.GITHUB_BASE_SHA,
      args.base_ref ? `origin/${args.base_ref}` : "",
      args.base_ref,
      git.base_branch ? `origin/${git.base_branch}` : "",
      git.base_branch,
      `origin/${DEFAULT_BRANCH}`,
      DEFAULT_BRANCH,
    ],
    repoRoot,
  );

  const head =
    resolveGitRef(
      [args.head, process.env.GITHUB_HEAD_SHA, process.env.GITHUB_SHA, "HEAD"],
      repoRoot,
    ) || "HEAD";

  const mergeBase =
    base && head
      ? runGit(["merge-base", base, head], {
          repoRoot,
          fallback: "",
        })
      : "";

  return {
    base,
    head,
    merge_base: mergeBase,
    diff_range: mergeBase
      ? `${mergeBase}...${head}`
      : base
        ? `${base}...${head}`
        : `HEAD~1...${head}`,
  };
}

function parseGitNameStatus(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t/);
      const status = parts[0] || "";
      const file = parts.length >= 3 ? parts[2] : parts[1] || "";

      return {
        status,
        path: toPosixPath(file),
      };
    })
    .filter((item) => item.path);
}

function getChangedFilesFromDiff(range, repoRoot, args) {
  const diffFilter = args.include_deleted ? "ACDMRTUXB" : "ACMRTUXB";

  const attempts = [
    ["diff", "--name-status", `--diff-filter=${diffFilter}`, range],
    ...(range.includes("...")
      ? [
          [
            "diff",
            "--name-status",
            `--diff-filter=${diffFilter}`,
            range.replace("...", ".."),
          ],
        ]
      : []),
    ["diff", "--name-status", `--diff-filter=${diffFilter}`, "HEAD~1...HEAD"],
  ];

  for (const gitArgs of attempts) {
    const output = runGit(gitArgs, {
      repoRoot,
      fallback: "",
    });

    const parsed = parseGitNameStatus(output);

    if (parsed.length) return parsed;
  }

  return [];
}

function getWorkingTreeChanges(repoRoot, args) {
  const changes = [];

  if (args.include_staged) {
    changes.push(
      ...parseGitNameStatus(
        runGit(["diff", "--cached", "--name-status"], {
          repoRoot,
          fallback: "",
        }),
      ),
    );
  }

  changes.push(
    ...parseGitNameStatus(
      runGit(["diff", "--name-status"], {
        repoRoot,
        fallback: "",
      }),
    ),
  );

  if (args.include_untracked) {
    const untracked = runGit(["ls-files", "--others", "--exclude-standard"], {
      repoRoot,
      fallback: "",
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((filePath) => ({
        status: "??",
        path: toPosixPath(filePath),
      }));

    changes.push(...untracked);
  }

  return changes;
}

function dedupeChangedFiles(items) {
  const seen = new Map();

  for (const item of items) {
    if (!item.path) continue;

    if (!seen.has(item.path)) {
      seen.set(item.path, item);
      continue;
    }

    const existing = seen.get(item.path);

    if (existing.status === "??") continue;

    seen.set(item.path, {
      ...existing,
      status:
        existing.status === item.status
          ? item.status
          : `${existing.status},${item.status}`,
    });
  }

  return [...seen.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function getChangedFiles(range, repoRoot, args) {
  const diffChanges = getChangedFilesFromDiff(range.diff_range, repoRoot, args);
  const workingTreeChanges = getWorkingTreeChanges(repoRoot, args);

  const combined = dedupeChangedFiles([...diffChanges, ...workingTreeChanges]);

  return args.max_changed_files > 0
    ? combined.slice(0, args.max_changed_files)
    : combined;
}

function isGlobalChange(filePath) {
  const normalized = toPosixPath(filePath);

  if (GLOBAL_CHANGE_FILES.has(normalized)) return true;

  return GLOBAL_CHANGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function categorizeFile(filePath) {
  const normalized = toPosixPath(filePath);

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.name;
    }
  }

  return "other";
}

function summarizeChangedFiles(changedFiles) {
  const groups = {};

  for (const file of changedFiles) {
    const category = categorizeFile(file.path);

    if (!groups[category]) {
      groups[category] = {
        count: 0,
        files: [],
      };
    }

    groups[category].count += 1;
    groups[category].files.push(file.path);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function readJsonFile(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function discoverProjectsFromNx(repoRoot) {
  const output = runNxJson(["show", "projects", "--json"], repoRoot);

  if (!output.ok) return [];

  const parsed = safeJsonParse(output.stdout, null);

  if (Array.isArray(parsed)) {
    return parsed.map((name) => ({
      name,
      root: "",
      source_root: "",
      project_type: "unknown",
      targets: [],
      tags: [],
      discovery: "nx-show-projects",
    }));
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([name, value]) => ({
      name,
      root: normalizeString(value?.root),
      source_root: normalizeString(value?.sourceRoot),
      project_type: normalizeString(value?.projectType, "unknown"),
      targets: Object.keys(value?.targets || {}),
      tags: Array.isArray(value?.tags) ? value.tags : [],
      discovery: "nx-show-projects",
    }));
  }

  return [];
}

function discoverProjectsFromFiles(args, repoRoot) {
  const projects = [];

  for (const root of args.project_roots) {
    const absoluteRoot = resolvePath(root, repoRoot);

    if (!isDirectory(absoluteRoot)) continue;

    walkProjectFiles(absoluteRoot, repoRoot, projects);
  }

  const rootPackage = readJsonFile(resolvePath("package.json", repoRoot), null);

  if (rootPackage?.name) {
    projects.push({
      name: rootPackage.name,
      root: ".",
      source_root: "",
      project_type: "workspace",
      targets: Object.keys(rootPackage.scripts || {}),
      tags: [],
      discovery: "root-package-json",
    });
  }

  return dedupeProjects(projects);
}

function walkProjectFiles(directory, repoRoot, projects) {
  const relative = toRelativePath(directory, repoRoot);

  if (relative.includes("node_modules") || relative.includes(".nx/cache"))
    return;

  const projectJsonPath = path.join(directory, "project.json");
  const packageJsonPath = path.join(directory, "package.json");

  if (isFile(projectJsonPath)) {
    const projectJson = readJsonFile(projectJsonPath, {});
    const projectRoot = normalizeString(
      projectJson.root,
      toRelativePath(directory, repoRoot),
    );
    const name = normalizeString(projectJson.name, path.basename(directory));

    projects.push({
      name,
      root: toPosixPath(projectRoot),
      source_root: normalizeString(projectJson.sourceRoot),
      project_type: normalizeString(
        projectJson.projectType,
        inferProjectType(projectRoot, name),
      ),
      targets: Object.keys(projectJson.targets || {}),
      tags: Array.isArray(projectJson.tags) ? projectJson.tags : [],
      discovery: "project-json",
    });

    return;
  }

  if (isFile(packageJsonPath)) {
    const packageJson = readJsonFile(packageJsonPath, {});
    const projectRoot = toRelativePath(directory, repoRoot);
    const nx = packageJson.nx || {};

    projects.push({
      name: normalizeString(
        nx.name || packageJson.name,
        path.basename(directory),
      ),
      root: toPosixPath(projectRoot),
      source_root: normalizeString(nx.sourceRoot || ""),
      project_type: normalizeString(
        nx.projectType,
        inferProjectType(projectRoot, packageJson.name || ""),
      ),
      targets: [
        ...Object.keys(packageJson.scripts || {}),
        ...Object.keys(nx.targets || {}),
      ],
      tags: Array.isArray(nx.tags) ? nx.tags : [],
      discovery: "package-json",
    });

    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

    walkProjectFiles(path.join(directory, entry.name), repoRoot, projects);
  }
}

function inferProjectType(root, name = "") {
  const normalizedRoot = toPosixPath(root).toLowerCase();
  const normalizedName = String(name || "").toLowerCase();

  if (
    normalizedRoot.startsWith("apps/") &&
    (normalizedRoot.includes("e2e") || normalizedName.includes("e2e"))
  ) {
    return "e2e";
  }

  if (normalizedRoot.startsWith("apps/")) return "application";
  if (normalizedRoot.startsWith("libs/")) return "library";
  if (normalizedRoot.startsWith("packages/")) return "package";
  if (normalizedRoot.startsWith("tools/")) return "tool";

  return "unknown";
}

function dedupeProjects(projects) {
  const seen = new Map();

  for (const project of projects) {
    if (!project.name) continue;

    const existing = seen.get(project.name);

    if (!existing) {
      seen.set(project.name, project);
      continue;
    }

    seen.set(project.name, {
      ...existing,
      ...project,
      root: project.root || existing.root,
      source_root: project.source_root || existing.source_root,
      project_type:
        project.project_type !== "unknown"
          ? project.project_type
          : existing.project_type,
      targets: [
        ...new Set([...(existing.targets || []), ...(project.targets || [])]),
      ],
      tags: [...new Set([...(existing.tags || []), ...(project.tags || [])])],
      discovery: `${existing.discovery}+${project.discovery}`,
    });
  }

  return [...seen.values()].sort((left, right) => {
    const leftRoot = left.root === "." ? "" : left.root || "";
    const rightRoot = right.root === "." ? "" : right.root || "";

    return (
      leftRoot.localeCompare(rightRoot) || left.name.localeCompare(right.name)
    );
  });
}

function runNxJson(nxArgs, repoRoot) {
  const attempts = [
    {
      command: "pnpm",
      args: ["exec", "nx", ...nxArgs],
    },
    {
      command: "npx",
      args: ["nx", ...nxArgs],
    },
  ];

  for (const attempt of attempts) {
    try {
      const stdout = childProcess
        .execFileSync(attempt.command, attempt.args, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 1024 * 1024 * 20,
        })
        .trim();

      return {
        ok: true,
        command: `${attempt.command} ${attempt.args.join(" ")}`,
        stdout,
      };
    } catch (err) {
      logger.debug?.(
        `Nx command failed: ${attempt.command} ${attempt.args.join(" ")} — ${logger.formatError(err)}`,
      );
    }
  }

  return {
    ok: false,
    command: "",
    stdout: "",
  };
}

function parseNxAffectedOutput(stdout) {
  const text = normalizeString(stdout);

  if (!text) return [];

  const json = safeJsonParse(text, null);

  if (Array.isArray(json)) {
    return json.map(String).filter(Boolean);
  }

  if (json && typeof json === "object") {
    if (Array.isArray(json.projects)) {
      return json.projects.map(String).filter(Boolean);
    }

    return Object.keys(json).filter(Boolean);
  }

  return text
    .split(/[\r\n, ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith(">"));
}

function detectAffectedWithNx(range, repoRoot) {
  const commands = [
    [
      "show",
      "projects",
      "--affected",
      `--base=${range.base || range.merge_base}`,
      `--head=${range.head}`,
      "--json",
    ],
    [
      "show",
      "projects",
      "--affected",
      `--base=${range.merge_base || range.base}`,
      `--head=${range.head}`,
    ],
    [
      "print-affected",
      `--base=${range.base || range.merge_base}`,
      `--head=${range.head}`,
      "--select=projects",
    ],
    [
      "affected:apps",
      `--base=${range.base || range.merge_base}`,
      `--head=${range.head}`,
      "--plain",
    ],
    [
      "affected:libs",
      `--base=${range.base || range.merge_base}`,
      `--head=${range.head}`,
      "--plain",
    ],
  ];

  const names = new Set();
  const commandResults = [];

  for (const commandArgs of commands) {
    if (
      commandArgs.some((item) => /--base=$/.test(item) || /--head=$/.test(item))
    ) {
      continue;
    }

    const result = runNxJson(commandArgs, repoRoot);

    commandResults.push({
      command: result.command || `nx ${commandArgs.join(" ")}`,
      ok: result.ok,
    });

    if (!result.ok) continue;

    for (const name of parseNxAffectedOutput(result.stdout)) {
      names.add(name);
    }

    if (names.size > 0 && commandArgs[0] === "show") {
      break;
    }
  }

  return {
    used: commandResults.some((result) => result.ok),
    command_results: commandResults,
    project_names: [...names].sort(),
  };
}

function projectMatchesFile(project, filePath) {
  const normalizedFile = toPosixPath(filePath);
  const root = toPosixPath(project.root || "");

  if (!root || root === ".") {
    return false;
  }

  return normalizedFile === root || normalizedFile.startsWith(`${root}/`);
}

function detectAffectedFallback(projects, changedFiles, args) {
  const affected = new Set();
  const globalChanges = changedFiles.filter((file) =>
    isGlobalChange(file.path),
  );

  if (args.all_on_global_change && globalChanges.length) {
    for (const project of projects) {
      if (project.root && project.root !== ".") {
        affected.add(project.name);
      }
    }

    return {
      project_names: [...affected].sort(),
      global_changes: globalChanges.map((file) => file.path),
      reason:
        "Global change detected; all discovered projects marked affected.",
    };
  }

  for (const project of projects) {
    if (changedFiles.some((file) => projectMatchesFile(project, file.path))) {
      affected.add(project.name);
    }
  }

  return {
    project_names: [...affected].sort(),
    global_changes: globalChanges.map((file) => file.path),
    reason: "Projects matched by changed file path under project root.",
  };
}

function enrichAffectedProjects(projects, affectedNames, changedFiles, source) {
  const projectMap = new Map(
    projects.map((project) => [project.name, project]),
  );

  return affectedNames.map((name) => {
    const project = projectMap.get(name) || {
      name,
      root: "",
      source_root: "",
      project_type: "unknown",
      targets: [],
      tags: [],
      discovery: "nx-name-only",
    };

    const files = changedFiles
      .filter((file) => projectMatchesFile(project, file.path))
      .map((file) => file.path);

    return {
      name: project.name,
      root: project.root || "",
      source_root: project.source_root || "",
      project_type: project.project_type || "unknown",
      targets: project.targets || [],
      tags: project.tags || [],
      discovery: project.discovery || "",
      affected_source: source,
      changed_files: files,
      changed_file_count: files.length,
    };
  });
}

function groupAffectedProjects(affectedProjects) {
  const groups = {};

  for (const project of affectedProjects) {
    const type = project.project_type || "unknown";

    if (!groups[type]) {
      groups[type] = {
        count: 0,
        projects: [],
      };
    }

    groups[type].count += 1;
    groups[type].projects.push(project.name);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createTargetMatrix(affectedProjects, targets) {
  if (!targets.length) {
    return affectedProjects.map((project) => ({
      project: project.name,
      root: project.root,
      project_type: project.project_type,
    }));
  }

  const matrix = [];

  for (const project of affectedProjects) {
    for (const target of targets) {
      matrix.push({
        project: project.name,
        target,
        root: project.root,
        project_type: project.project_type,
        has_target: project.targets.length
          ? project.targets.includes(target)
          : null,
      });
    }
  }

  return matrix;
}

function createDetection(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const range = resolveRange(args, repoRoot, git);
  const changedFiles = getChangedFiles(range, repoRoot, args);

  const discoveredFromNx = args.use_nx ? discoverProjectsFromNx(repoRoot) : [];
  const discoveredFromFiles = discoverProjectsFromFiles(args, repoRoot);
  const projects = dedupeProjects([
    ...discoveredFromFiles,
    ...discoveredFromNx,
  ]);

  const nxAffected = args.use_nx
    ? detectAffectedWithNx(range, repoRoot)
    : {
        used: false,
        command_results: [],
        project_names: [],
      };

  const fallbackAffected = detectAffectedFallback(projects, changedFiles, args);

  const affectedNames = nxAffected.project_names.length
    ? nxAffected.project_names
    : fallbackAffected.project_names;

  const source = nxAffected.project_names.length ? "nx" : "fallback";

  const affectedProjects = enrichAffectedProjects(
    projects,
    affectedNames,
    changedFiles,
    source,
  );
  const targetMatrix = createTargetMatrix(affectedProjects, args.targets);

  return {
    schema_version: 1,
    type: "affected-projects",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: git,
    range,
    config: {
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      project_roots: args.project_roots,
      targets: args.targets,
      use_nx: args.use_nx,
      all_on_global_change: args.all_on_global_change,
      include_untracked: args.include_untracked,
      include_staged: args.include_staged,
      include_deleted: args.include_deleted,
      max_changed_files: args.max_changed_files,
    },
    detection: {
      source,
      nx_used: nxAffected.used,
      nx_project_names: nxAffected.project_names,
      nx_command_results: nxAffected.command_results,
      fallback_project_names: fallbackAffected.project_names,
      fallback_reason: fallbackAffected.reason,
      global_changes: fallbackAffected.global_changes,
    },
    totals: {
      changed_files: changedFiles.length,
      discovered_projects: projects.length,
      affected_projects: affectedProjects.length,
      target_matrix_entries: targetMatrix.length,
      global_changes: fallbackAffected.global_changes.length,
      applications: affectedProjects.filter(
        (project) => project.project_type === "application",
      ).length,
      libraries: affectedProjects.filter(
        (project) => project.project_type === "library",
      ).length,
      packages: affectedProjects.filter(
        (project) => project.project_type === "package",
      ).length,
      tools: affectedProjects.filter(
        (project) => project.project_type === "tool",
      ).length,
      e2e: affectedProjects.filter((project) => project.project_type === "e2e")
        .length,
    },
    changed_files: changedFiles,
    changed_file_groups: summarizeChangedFiles(changedFiles),
    projects,
    affected_projects: affectedProjects,
    affected_project_names: affectedProjects.map((project) => project.name),
    affected_apps: affectedProjects
      .filter((project) => project.project_type === "application")
      .map((project) => project.name),
    affected_libs: affectedProjects
      .filter((project) => project.project_type === "library")
      .map((project) => project.name),
    affected_packages: affectedProjects
      .filter((project) => project.project_type === "package")
      .map((project) => project.name),
    affected_tools: affectedProjects
      .filter((project) => project.project_type === "tool")
      .map((project) => project.name),
    affected_e2e: affectedProjects
      .filter((project) => project.project_type === "e2e")
      .map((project) => project.name),
    affected_groups: groupAffectedProjects(affectedProjects),
    target_matrix: targetMatrix,
    status: affectedProjects.length ? "affected" : "none",
  };
}

function truncate(value, maxLength = 90) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function createMarkdownSummary(result) {
  const lines = [
    `# 🎯 ${PROJECT_NAME} Affected Projects`,
    "",
    `Generated: \`${result.created_at}\``,
    "",
    "## 🧾 Context",
    "",
    `- Repository: \`${result.repository}\``,
    `- Branch: \`${result.github.branch || "unknown"}\``,
    `- Base: \`${result.range.base || "unknown"}\``,
    `- Head: \`${result.range.head || "unknown"}\``,
    `- Merge base: \`${result.range.merge_base || "unknown"}\``,
    `- Detection source: \`${result.detection.source}\``,
    `- Nx used: \`${result.detection.nx_used ? "true" : "false"}\``,
    `- Status: \`${result.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- Changed files: \`${result.totals.changed_files}\``,
    `- Discovered projects: \`${result.totals.discovered_projects}\``,
    `- Affected projects: \`${result.totals.affected_projects}\``,
    `- Target matrix entries: \`${result.totals.target_matrix_entries}\``,
    `- Global changes: \`${result.totals.global_changes}\``,
    "",
  ];

  if (Object.keys(result.affected_groups).length) {
    lines.push("## 🗂️ Affected Groups");
    lines.push("");
    lines.push("| Type | Count | Projects |");
    lines.push("|---|---:|---|");

    for (const [type, group] of Object.entries(result.affected_groups)) {
      lines.push(
        `| \`${type}\` | \`${group.count}\` | ${group.projects.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📦 Affected Projects");
  lines.push("");

  if (!result.affected_projects.length) {
    lines.push("No affected projects were detected.");
  } else {
    lines.push("| Project | Type | Root | Changed Files |");
    lines.push("|---|---|---|---:|");

    for (const project of result.affected_projects) {
      lines.push(
        `| \`${project.name}\` | \`${project.project_type}\` | \`${project.root || "unknown"}\` | \`${project.changed_file_count}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 📝 Changed Files");
  lines.push("");

  if (!result.changed_files.length) {
    lines.push("No changed files were detected.");
  } else {
    lines.push("| Status | Path | Category |");
    lines.push("|---|---|---|");

    for (const file of result.changed_files.slice(0, 200)) {
      lines.push(
        `| \`${file.status}\` | \`${truncate(file.path, 120)}\` | \`${categorizeFile(file.path)}\` |`,
      );
    }

    if (result.changed_files.length > 200) {
      lines.push(
        `| ... | ${result.changed_files.length - 200} additional changed file(s) omitted from summary. | ... |`,
      );
    }
  }

  if (result.detection.global_changes.length) {
    lines.push("");
    lines.push("## 🌐 Global Changes");
    lines.push("");

    for (const filePath of result.detection.global_changes) {
      lines.push(`- \`${filePath}\``);
    }
  }

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

function writeGitHubOutputs(result) {
  setGitHubOutput("affected_projects_file", result.config.output_file);
  setGitHubOutput(
    "affected_projects_summary_file",
    result.config.summary_file || "",
  );
  setGitHubOutput("affected_projects_status", result.status);
  setGitHubOutput(
    "affected_projects_count",
    String(result.totals.affected_projects),
  );
  setGitHubOutput("affected_projects", result.affected_project_names.join(","));
  setGitHubOutput(
    "affected_projects_json",
    JSON.stringify(result.affected_project_names),
  );
  setGitHubOutput("affected_apps", result.affected_apps.join(","));
  setGitHubOutput("affected_apps_json", JSON.stringify(result.affected_apps));
  setGitHubOutput("affected_libs", result.affected_libs.join(","));
  setGitHubOutput("affected_libs_json", JSON.stringify(result.affected_libs));
  setGitHubOutput("affected_packages", result.affected_packages.join(","));
  setGitHubOutput(
    "affected_packages_json",
    JSON.stringify(result.affected_packages),
  );
  setGitHubOutput("affected_tools", result.affected_tools.join(","));
  setGitHubOutput("affected_tools_json", JSON.stringify(result.affected_tools));
  setGitHubOutput("affected_e2e", result.affected_e2e.join(","));
  setGitHubOutput("affected_e2e_json", JSON.stringify(result.affected_e2e));
  setGitHubOutput(
    "affected_target_matrix_json",
    JSON.stringify(result.target_matrix),
  );
  setGitHubOutput("changed_files_count", String(result.totals.changed_files));
  setGitHubOutput(
    "changed_files_json",
    JSON.stringify(result.changed_files.map((file) => file.path)),
  );
  setGitHubOutput("global_changes_count", String(result.totals.global_changes));
  setGitHubOutput("nx_used", result.detection.nx_used ? "true" : "false");
  setGitHubOutput("detection_source", result.detection.source);
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Detecting affected projects.");

  const result = createDetection(args, repoRoot);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const markdown = createMarkdownSummary(result);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(result);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_none && result.totals.affected_projects === 0) {
    logger.error("No affected projects were detected.");
    process.exitCode = 1;
  }
}

main();
