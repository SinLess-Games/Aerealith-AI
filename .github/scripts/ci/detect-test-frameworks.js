#!/usr/bin/env node
// .github/scripts/ci/detect-test-frameworks.js
// =============================================================================
// Aerealith AI — CI Test Framework Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Discover test frameworks, test configs, package test scripts, affected test
//   targets, and CI test matrix entries for selective unit, integration, e2e,
//   component, browser, and workspace test workflows.
//
// Output:
//   - artifacts/ci/test-frameworks.json
//   - artifacts/ci/test-frameworks.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not run tests.
//   - Does not mutate GitHub.
//   - Detects Vitest, Jest, Playwright, Cypress, Storybook test runner, Mocha,
//     AVA, Karma, Cucumber, Node test runner, Testing Library, and Nx test
//     orchestration signals.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[test-frameworks] ${message}`),
    warn: (message) => console.warn(`[test-frameworks] WARN: ${message}`),
    error: (message) => console.error(`[test-frameworks] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/test-frameworks.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/test-frameworks.md";

const DEFAULT_SEARCH_ROOTS = ["apps", "libs", "packages", "tools", "."];

const DEFAULT_ENVIRONMENTS = ["ci"];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  ".github/scripts/node_modules/",
  "node_modules/",
  ".nx/cache/",
  ".nx/workspace-data/",
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

const GLOBAL_CHANGE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
  "jest.config.js",
  "jest.config.mjs",
  "jest.config.cjs",
  "jest.config.ts",
  "playwright.config.js",
  "playwright.config.ts",
  "cypress.config.js",
  "cypress.config.ts",
  ".github/repo-management/dependency-rules.yaml",
  ".github/scripts/ci/detect-test-frameworks.js",
]);

const GLOBAL_CHANGE_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/scripts/ci/",
];

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

const TEST_CONFIG_PATTERNS = [
  /^vitest\.config\.(js|mjs|cjs|ts|mts|cts)$/i,
  /^jest\.config\.(js|mjs|cjs|ts|json)$/i,
  /^playwright\.config\.(js|mjs|cjs|ts)$/i,
  /^cypress\.config\.(js|mjs|cjs|ts)$/i,
  /^karma\.conf\.(js|cjs|mjs|ts)$/i,
  /^protractor\.conf\.(js|cjs|mjs|ts)$/i,
  /^ava\.config\.(js|cjs|mjs|json)$/i,
  /^\.mocharc(\.(js|cjs|mjs|json|yaml|yml))?$/i,
  /^cucumber\.(js|cjs|mjs|json)$/i,
  /^wdio\.conf\.(js|cjs|mjs|ts)$/i,
  /^main\.(js|cjs|mjs|ts)$/i,
];

const FRAMEWORK_ORDER = [
  "nx",
  "vitest",
  "jest",
  "playwright",
  "cypress",
  "storybook",
  "mocha",
  "ava",
  "karma",
  "cucumber",
  "node-test",
  "testing-library",
];

const FRAMEWORK_META = {
  nx: {
    title: "Nx",
    type: "orchestrator",
    category: "workspace",
    runnable: true,
  },
  vitest: {
    title: "Vitest",
    type: "framework",
    category: "unit",
    runnable: true,
  },
  jest: {
    title: "Jest",
    type: "framework",
    category: "unit",
    runnable: true,
  },
  playwright: {
    title: "Playwright",
    type: "framework",
    category: "e2e",
    runnable: true,
  },
  cypress: {
    title: "Cypress",
    type: "framework",
    category: "e2e",
    runnable: true,
  },
  storybook: {
    title: "Storybook Test Runner",
    type: "framework",
    category: "component",
    runnable: true,
  },
  mocha: {
    title: "Mocha",
    type: "framework",
    category: "unit",
    runnable: true,
  },
  ava: {
    title: "AVA",
    type: "framework",
    category: "unit",
    runnable: true,
  },
  karma: {
    title: "Karma",
    type: "framework",
    category: "browser",
    runnable: true,
  },
  cucumber: {
    title: "Cucumber",
    type: "framework",
    category: "bdd",
    runnable: true,
  },
  "node-test": {
    title: "Node Test Runner",
    type: "framework",
    category: "unit",
    runnable: true,
  },
  "testing-library": {
    title: "Testing Library",
    type: "support-library",
    category: "unit",
    runnable: false,
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

    base:
      process.env.TEST_FRAMEWORKS_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.NX_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.TEST_FRAMEWORKS_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.NX_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",
    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    head_ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",

    search_roots: normalizeStringList(process.env.TEST_FRAMEWORKS_SEARCH_ROOTS),
    include: normalizeStringList(process.env.TEST_FRAMEWORKS_INCLUDE),
    exclude: normalizeStringList(process.env.TEST_FRAMEWORKS_EXCLUDE),
    environments: normalizeStringList(process.env.TEST_FRAMEWORKS_ENVIRONMENTS),

    output_file: process.env.TEST_FRAMEWORKS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.TEST_FRAMEWORKS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    changed_only: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_CHANGED_ONLY,
      false,
    ),
    all_on_global_change: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_ALL_ON_GLOBAL_CHANGE,
      true,
    ),
    include_untracked: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_UNTRACKED,
      true,
    ),
    include_staged: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_STAGED,
      true,
    ),
    include_deleted: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_DELETED,
      true,
    ),

    include_root_package: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_ROOT_PACKAGE,
      true,
    ),
    include_empty_packages: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_EMPTY_PACKAGES,
      false,
    ),
    include_support_libraries_in_matrix: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_INCLUDE_SUPPORT_IN_MATRIX,
      false,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_ALLOW_SECRET_PATHS,
      false,
    ),

    fail_if_none: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_FAIL_IF_NONE,
      false,
    ),
    fail_if_no_matrix: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_FAIL_IF_NO_MATRIX,
      false,
    ),

    max_changed_files: normalizeInteger(
      process.env.TEST_FRAMEWORKS_MAX_CHANGED_FILES,
      1000,
    ),
    max_targets: normalizeInteger(process.env.TEST_FRAMEWORKS_MAX_TARGETS, 0),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.TEST_FRAMEWORKS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.TEST_FRAMEWORKS_STEP_SUMMARY,
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

    if (
      arg === "--root" ||
      arg === "--search-root" ||
      arg === "--search-roots"
    ) {
      args.search_roots.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "-i") {
      args.include.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "-x") {
      args.exclude.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--environment" || arg === "--environments") {
      args.environments.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--changed-only") {
      args.changed_only = true;
      continue;
    }

    if (arg === "--all-targets") {
      args.changed_only = false;
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

    if (arg === "--include-root-package") {
      args.include_root_package = true;
      continue;
    }

    if (arg === "--no-root-package") {
      args.include_root_package = false;
      continue;
    }

    if (arg === "--include-empty-packages") {
      args.include_empty_packages = true;
      continue;
    }

    if (arg === "--no-empty-packages") {
      args.include_empty_packages = false;
      continue;
    }

    if (arg === "--include-support-in-matrix") {
      args.include_support_libraries_in_matrix = true;
      continue;
    }

    if (arg === "--no-support-in-matrix") {
      args.include_support_libraries_in_matrix = false;
      continue;
    }

    if (arg === "--allow-secret-paths") {
      args.allow_secret_paths = true;
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

    if (arg === "--max-targets") {
      args.max_targets = normalizeInteger(argv[index + 1], args.max_targets);
      index += 1;
      continue;
    }

    if (arg === "--fail-if-none") {
      args.fail_if_none = true;
      continue;
    }

    if (arg === "--fail-if-no-matrix") {
      args.fail_if_no_matrix = true;
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

  if (!args.search_roots.length) {
    args.search_roots = [...DEFAULT_SEARCH_ROOTS];
  }

  if (!args.environments.length) {
    args.environments = [...DEFAULT_ENVIRONMENTS];
  }

  args.search_roots = [...new Set(args.search_roots.map(toPosixPath))];
  args.environments = [
    ...new Set(args.environments.map((item) => item.toLowerCase())),
  ];
  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.max_changed_files = Math.max(0, args.max_changed_files);
  args.max_targets = Math.max(0, args.max_targets);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Test Framework Detector

Usage:
  node .github/scripts/ci/detect-test-frameworks.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --base <sha|ref>                 Base commit/ref.
      --head <sha|ref>                 Head commit/ref.
      --base-ref <branch>              Base branch name. Default: main.
      --head-ref <branch>              Head branch name.
      --root <path,list>               Search roots. Default: apps,libs,packages,tools,.
  -i, --include <path|glob>            Additional package/config path or glob.
  -x, --exclude <pattern>              Exclude path pattern.
      --environment <list>             Matrix environments. Default: ci.
      --changed-only                   Emit matrix only for affected test targets.
      --all-targets                    Emit matrix for all test targets. Default.
      --all-on-global-change           Treat global changes as all targets affected. Default.
      --no-all-on-global-change        Do not expand global changes to all targets.
      --include-root-package           Include root package.json. Default.
      --no-root-package                Exclude root package.json.
      --include-empty-packages         Include packages without detected test frameworks.
      --include-support-in-matrix      Include support libraries like Testing Library in matrix.
      --allow-secret-paths             Allow paths that look secret-like.
      --max-changed-files <number>     Maximum changed files to report. 0 means unlimited.
      --max-targets <number>           Maximum test targets to emit. 0 means unlimited.
      --fail-if-none                   Exit non-zero when no test frameworks are found.
      --fail-if-no-matrix              Exit non-zero when test matrix is empty.
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

function readJsonFile(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function shouldExcludePath(relativePath, args) {
  const normalized = toPosixPath(relativePath);

  if (!args.allow_secret_paths && SECRET_PATH_PATTERN.test(normalized))
    return true;

  return args.exclude.some((pattern) => matchesPattern(normalized, pattern));
}

function walkFiles(targetPath, repoRoot, args, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(path.join(absolutePath, entry.name), repoRoot, args, files);
  }

  return files;
}

function collectRepositoryFiles(repoRoot, args) {
  const files = [];

  for (const root of args.search_roots) {
    walkFiles(root, repoRoot, args, files);
  }

  return [...new Set(files)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function collectFilesForSpec(spec, repoRoot, allFiles, args) {
  const normalizedSpec = toPosixPath(spec);

  if (!normalizedSpec) return [];

  if (hasGlob(normalizedSpec)) {
    const regex = globToRegExp(normalizedSpec);

    return allFiles.filter((filePath) => {
      const relativePath = toRelativePath(filePath, repoRoot);
      return regex.test(relativePath) && !shouldExcludePath(relativePath, args);
    });
  }

  const absolutePath = resolvePath(normalizedSpec, repoRoot);

  if (isFile(absolutePath)) {
    const relativePath = toRelativePath(absolutePath, repoRoot);
    return shouldExcludePath(relativePath, args) ? [] : [absolutePath];
  }

  if (isDirectory(absolutePath)) {
    return walkFiles(absolutePath, repoRoot, args);
  }

  return [];
}

function isTestConfigPath(filePath, repoRoot) {
  const relativePath = repoRoot
    ? toRelativePath(filePath, repoRoot)
    : toPosixPath(filePath);
  const basename = path.basename(relativePath);
  const dirname = toPosixPath(path.dirname(relativePath));

  if (
    dirname.endsWith(".storybook") &&
    /^main\.(js|cjs|mjs|ts)$/i.test(basename)
  ) {
    return true;
  }

  return TEST_CONFIG_PATTERNS.some((pattern) => pattern.test(basename));
}

function collectPackageJsonFiles(args, repoRoot, allFiles) {
  const packageFiles = allFiles.filter((filePath) => {
    const relativePath = toRelativePath(filePath, repoRoot);

    if (path.basename(filePath) !== "package.json") return false;
    if (!args.include_root_package && relativePath === "package.json")
      return false;

    return true;
  });

  for (const spec of args.include) {
    packageFiles.push(
      ...collectFilesForSpec(spec, repoRoot, allFiles, args).filter(
        (filePath) => path.basename(filePath) === "package.json",
      ),
    );
  }

  return [...new Set(packageFiles)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function collectTestConfigFiles(args, repoRoot, allFiles) {
  const configFiles = allFiles.filter((filePath) =>
    isTestConfigPath(filePath, repoRoot),
  );

  for (const spec of args.include) {
    configFiles.push(
      ...collectFilesForSpec(spec, repoRoot, allFiles, args).filter(
        (filePath) => isTestConfigPath(filePath, repoRoot),
      ),
    );
  }

  return [...new Set(configFiles)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function nearestProjectJson(packageDir, repoRoot) {
  const candidate = path.join(
    resolvePath(packageDir, repoRoot),
    "project.json",
  );

  return isFile(candidate) ? candidate : null;
}

function readProjectJson(packageDir, repoRoot) {
  const projectJsonPath = nearestProjectJson(packageDir, repoRoot);

  if (!projectJsonPath) {
    return {
      path: null,
      project: null,
    };
  }

  return {
    path: toRelativePath(projectJsonPath, repoRoot),
    project: readJsonFile(projectJsonPath, null),
  };
}

function inferPackageManager(repoRoot) {
  if (isFile(resolvePath("pnpm-lock.yaml", repoRoot))) return "pnpm";
  if (isFile(resolvePath("yarn.lock", repoRoot))) return "yarn";
  if (isFile(resolvePath("package-lock.json", repoRoot))) return "npm";
  if (isFile(resolvePath("bun.lockb", repoRoot))) return "bun";

  return "npm";
}

function packageManagerRun(packageManager, root, command) {
  const directory = toPosixPath(root || ".");

  if (packageManager === "pnpm") {
    return directory === "."
      ? `pnpm ${command}`
      : `pnpm --dir ${directory} ${command}`;
  }

  if (packageManager === "yarn") {
    return directory === "."
      ? `yarn ${command}`
      : `yarn --cwd ${directory} ${command}`;
  }

  if (packageManager === "bun") {
    return directory === "."
      ? `bun ${command}`
      : `cd ${directory} && bun ${command}`;
  }

  return directory === "."
    ? `npm ${command}`
    : `npm --prefix ${directory} ${command}`;
}

function packageManagerExec(packageManager, root, command) {
  const directory = toPosixPath(root || ".");

  if (packageManager === "pnpm") {
    return directory === "."
      ? `pnpm exec ${command}`
      : `pnpm --dir ${directory} exec ${command}`;
  }

  if (packageManager === "yarn") {
    return directory === "."
      ? `yarn ${command}`
      : `yarn --cwd ${directory} ${command}`;
  }

  if (packageManager === "bun") {
    return directory === "."
      ? `bunx ${command}`
      : `cd ${directory} && bunx ${command}`;
  }

  return directory === "."
    ? `npx ${command}`
    : `cd ${directory} && npx ${command}`;
}

function packageType(root, packageJson, projectJson) {
  const normalizedRoot = toPosixPath(root).toLowerCase();

  if (normalizedRoot === ".") return "workspace";
  if (normalizedRoot.startsWith("apps/") && normalizedRoot.includes("e2e"))
    return "e2e";
  if (normalizedRoot.startsWith("apps/")) return "application";
  if (normalizedRoot.startsWith("libs/")) return "library";
  if (normalizedRoot.startsWith("packages/")) return "package";
  if (normalizedRoot.startsWith("tools/")) return "tool";

  return normalizeString(
    projectJson?.projectType || packageJson?.nx?.projectType,
    "package",
  );
}

function allDependencies(packageJson) {
  return {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
    ...(packageJson?.peerDependencies || {}),
    ...(packageJson?.optionalDependencies || {}),
  };
}

function dependencyNames(packageJson) {
  return Object.keys(allDependencies(packageJson || {}));
}

function hasDependency(packageJson, names) {
  const deps = allDependencies(packageJson || {});
  const requested = Array.isArray(names) ? names : [names];

  return requested.some((name) => deps[name] !== undefined);
}

function hasDependencyPrefix(packageJson, prefix) {
  return dependencyNames(packageJson || {}).some((name) =>
    name.startsWith(prefix),
  );
}

function scriptsText(packageJson) {
  return Object.entries(packageJson?.scripts || {})
    .map(([name, value]) => `${name} ${value}`)
    .join("\n")
    .toLowerCase();
}

function scriptEntries(packageJson) {
  return Object.entries(packageJson?.scripts || {}).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

function hasScriptText(packageJson, pattern) {
  return pattern.test(scriptsText(packageJson || {}));
}

function filterTestScripts(packageJson) {
  return Object.fromEntries(
    Object.entries(packageJson?.scripts || {}).filter(
      ([scriptName, scriptValue]) => {
        const text = `${scriptName} ${scriptValue}`.toLowerCase();

        return (
          text.includes("test") ||
          text.includes("vitest") ||
          text.includes("jest") ||
          text.includes("playwright") ||
          text.includes("cypress") ||
          text.includes("storybook") ||
          text.includes("mocha") ||
          text.includes("ava") ||
          text.includes("karma") ||
          text.includes("cucumber")
        );
      },
    ),
  );
}

function hasConfig(configs, pattern) {
  return configs.some(
    (filePath) =>
      pattern.test(path.basename(filePath)) || pattern.test(filePath),
  );
}

function hasDirectory(root, repoRoot, relativePath) {
  return isDirectory(resolvePath(path.join(root, relativePath), repoRoot));
}

function detectFrameworks(packageJson, projectJson, root, configs, repoRoot) {
  const frameworks = new Map();
  const add = (id, reason) => {
    if (!frameworks.has(id)) {
      frameworks.set(id, {
        id,
        ...FRAMEWORK_META[id],
        reasons: [],
      });
    }

    frameworks.get(id).reasons.push(reason);
  };

  if (
    isFile(resolvePath("nx.json", repoRoot)) &&
    (hasDependency(packageJson, "nx") ||
      projectJson?.targets?.test ||
      hasScriptText(packageJson, /\bnx\s+/))
  ) {
    add("nx", "Nx workspace or project test target detected.");
  }

  if (
    hasDependency(packageJson, "vitest") ||
    hasConfig(configs, /vitest\.config/i) ||
    hasScriptText(packageJson, /\bvitest\b/)
  ) {
    add("vitest", "Vitest dependency, config, or script detected.");
  }

  if (
    hasDependency(packageJson, [
      "jest",
      "@jest/globals",
      "ts-jest",
      "babel-jest",
    ]) ||
    hasConfig(configs, /jest\.config/i) ||
    Boolean(packageJson?.jest) ||
    hasScriptText(packageJson, /\bjest\b/)
  ) {
    add(
      "jest",
      "Jest dependency, config, package metadata, or script detected.",
    );
  }

  if (
    hasDependency(packageJson, ["@playwright/test", "playwright"]) ||
    hasConfig(configs, /playwright\.config/i) ||
    hasScriptText(packageJson, /\bplaywright\b/)
  ) {
    add("playwright", "Playwright dependency, config, or script detected.");
  }

  if (
    hasDependency(packageJson, "cypress") ||
    hasConfig(configs, /cypress\.config/i) ||
    hasDirectory(root, repoRoot, "cypress") ||
    hasScriptText(packageJson, /\bcypress\b/)
  ) {
    add(
      "cypress",
      "Cypress dependency, config, directory, or script detected.",
    );
  }

  if (
    hasDependencyPrefix(packageJson, "@storybook/") ||
    hasDependency(packageJson, [
      "storybook",
      "@storybook/test-runner",
      "@storybook/test",
    ]) ||
    configs.some((filePath) => filePath.includes(".storybook/")) ||
    hasScriptText(packageJson, /\bstorybook\b|test-storybook/)
  ) {
    add(
      "storybook",
      "Storybook dependency, config, or test runner script detected.",
    );
  }

  if (
    hasDependency(packageJson, "mocha") ||
    hasConfig(configs, /\.mocharc/i) ||
    hasScriptText(packageJson, /\bmocha\b/)
  ) {
    add("mocha", "Mocha dependency, config, or script detected.");
  }

  if (
    hasDependency(packageJson, "ava") ||
    hasConfig(configs, /ava\.config/i) ||
    hasScriptText(packageJson, /\bava\b/)
  ) {
    add("ava", "AVA dependency, config, or script detected.");
  }

  if (
    hasDependency(packageJson, "karma") ||
    hasConfig(configs, /karma\.conf/i) ||
    hasScriptText(packageJson, /\bkarma\b/)
  ) {
    add("karma", "Karma dependency, config, or script detected.");
  }

  if (
    hasDependency(packageJson, [
      "@cucumber/cucumber",
      "cucumber",
      "cucumber-js",
    ]) ||
    hasConfig(configs, /cucumber\./i) ||
    hasScriptText(packageJson, /\bcucumber\b/)
  ) {
    add("cucumber", "Cucumber dependency, config, or script detected.");
  }

  if (hasScriptText(packageJson, /\bnode\s+--test\b|\bnode:test\b/)) {
    add("node-test", "Node test runner script detected.");
  }

  if (hasDependencyPrefix(packageJson, "@testing-library/")) {
    add("testing-library", "Testing Library dependency detected.");
  }

  return FRAMEWORK_ORDER.filter((id) => frameworks.has(id)).map((id) => {
    const framework = frameworks.get(id);

    return {
      ...framework,
      reasons: [...new Set(framework.reasons)],
    };
  });
}

function findScriptByNames(packageJson, names) {
  const scripts = packageJson?.scripts || {};

  for (const name of names) {
    if (scripts[name]) {
      return {
        name,
        value: String(scripts[name]),
      };
    }
  }

  return null;
}

function findScriptByValue(packageJson, pattern) {
  for (const script of scriptEntries(packageJson || {})) {
    if (pattern.test(`${script.name} ${script.value}`.toLowerCase())) {
      return script;
    }
  }

  return null;
}

function commandForFramework(frameworkId, packageJson, root, packageManager) {
  const scriptPriority = {
    nx: ["test", "test:ci", "affected:test", "ci:test"],
    vitest: ["test:unit", "unit", "test:vitest", "vitest", "test"],
    jest: ["test:unit", "unit", "test:jest", "jest", "test"],
    playwright: ["test:e2e", "e2e", "test:playwright", "playwright", "test"],
    cypress: [
      "test:e2e",
      "e2e",
      "cypress:run",
      "test:cypress",
      "cypress",
      "test",
    ],
    storybook: [
      "test:storybook",
      "storybook:test",
      "test-storybook",
      "test:components",
      "test",
    ],
    mocha: ["test:unit", "test:mocha", "mocha", "test"],
    ava: ["test:unit", "test:ava", "ava", "test"],
    karma: ["test:browser", "test:karma", "karma", "test"],
    cucumber: ["test:bdd", "test:cucumber", "cucumber", "test"],
    "node-test": ["test:unit", "test:node", "node:test", "test"],
  };

  const script = findScriptByNames(
    packageJson,
    scriptPriority[frameworkId] || ["test"],
  );

  if (script) {
    return {
      command: packageManagerRun(packageManager, root, `run ${script.name}`),
      script_name: script.name,
      script_value: script.value,
      source: "package-script",
    };
  }

  const valuePatterns = {
    nx: /\bnx\s+.*test|\bnx\s+affected.*test/,
    vitest: /\bvitest\b/,
    jest: /\bjest\b/,
    playwright: /\bplaywright\b/,
    cypress: /\bcypress\b/,
    storybook: /\btest-storybook\b|\bstorybook\b/,
    mocha: /\bmocha\b/,
    ava: /\bava\b/,
    karma: /\bkarma\b/,
    cucumber: /\bcucumber\b/,
    "node-test": /\bnode\s+--test\b/,
  };

  const valueScript = findScriptByValue(
    packageJson,
    valuePatterns[frameworkId],
  );

  if (valueScript) {
    return {
      command: packageManagerRun(
        packageManager,
        root,
        `run ${valueScript.name}`,
      ),
      script_name: valueScript.name,
      script_value: valueScript.value,
      source: "package-script-value",
    };
  }

  const fallbackCommands = {
    nx: "nx test",
    vitest: "vitest run",
    jest: "jest",
    playwright: "playwright test",
    cypress: "cypress run",
    storybook: "test-storybook",
    mocha: "mocha",
    ava: "ava",
    karma: "karma start --single-run",
    cucumber: "cucumber-js",
    "node-test": "node --test",
  };

  if (!fallbackCommands[frameworkId]) {
    return {
      command: "",
      script_name: "",
      script_value: "",
      source: "none",
    };
  }

  return {
    command: packageManagerExec(
      packageManager,
      root,
      fallbackCommands[frameworkId],
    ),
    script_name: "",
    script_value: "",
    source: "fallback-exec",
  };
}

function configsForRoot(root, configFiles) {
  const normalizedRoot = toPosixPath(root || ".");
  const rootPrefix = normalizedRoot === "." ? "" : `${normalizedRoot}/`;

  return configFiles.map(toPosixPath).filter((configFile) => {
    if (normalizedRoot === ".") {
      const dirname = toPosixPath(path.dirname(configFile));

      return dirname === "." || dirname === ".storybook";
    }

    return configFile === normalizedRoot || configFile.startsWith(rootPrefix);
  });
}

function safeId(value) {
  return (
    normalizeString(value, "test-target")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "test-target"
  );
}

function packageRecord(
  packageJsonPath,
  repoRoot,
  args,
  configFiles,
  packageManager,
) {
  const packageJson = readJsonFile(packageJsonPath, {});
  const packageJsonRelative = toRelativePath(packageJsonPath, repoRoot);
  const root = toPosixPath(path.dirname(packageJsonRelative));
  const project = readProjectJson(path.dirname(packageJsonPath), repoRoot);
  const projectJson = project.project || {};
  const configs = configsForRoot(
    root,
    configFiles.map((filePath) => toRelativePath(filePath, repoRoot)),
  );
  const frameworks = detectFrameworks(
    packageJson,
    projectJson,
    root,
    configs,
    repoRoot,
  );
  const testScripts = filterTestScripts(packageJson);
  const testTargets = Object.keys(projectJson.targets || {}).filter(
    (target) => {
      return /test|e2e|component|storybook|playwright|cypress|jest|vitest/i.test(
        target,
      );
    },
  );

  const commands = Object.fromEntries(
    frameworks.map((framework) => [
      framework.id,
      commandForFramework(framework.id, packageJson, root, packageManager),
    ]),
  );

  const name = normalizeString(
    packageJson.name || projectJson.name || packageJson?.nx?.name,
    root === "." ? path.basename(repoRoot) : path.basename(root),
  );

  return {
    id: safeId(`${name}-${root}`),
    name,
    root,
    package_json: packageJsonRelative,
    project_json: project.path,
    project_name: normalizeString(
      projectJson.name || packageJson?.nx?.name || name,
    ),
    project_type: packageType(root, packageJson, projectJson),
    package_manager: packageManager,
    private: Boolean(packageJson.private),
    frameworks,
    framework_ids: frameworks.map((framework) => framework.id),
    runnable_framework_ids: frameworks
      .filter((framework) => framework.runnable)
      .map((framework) => framework.id),
    support_framework_ids: frameworks
      .filter((framework) => !framework.runnable)
      .map((framework) => framework.id),
    configs,
    config_count: configs.length,
    test_scripts: testScripts,
    test_script_count: Object.keys(testScripts).length,
    project_test_targets: testTargets,
    project_test_target_count: testTargets.length,
    commands,
    dependencies: dependencyNames(packageJson).filter((name) => {
      return /vitest|jest|playwright|cypress|storybook|mocha|ava|karma|cucumber|testing-library|nyc|c8|istanbul|coverage/i.test(
        name,
      );
    }),
    has_tests_signal:
      frameworks.length > 0 ||
      Object.keys(testScripts).length > 0 ||
      testTargets.length > 0 ||
      configs.length > 0,
    affected: false,
    affected_reason: "",
    changed_files: [],
    changed_file_count: 0,
    global_changes: [],
  };
}

function isGlobalChange(filePath) {
  const normalized = toPosixPath(filePath);

  if (GLOBAL_CHANGE_FILES.has(normalized)) return true;

  return GLOBAL_CHANGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function fileAffectsTarget(filePath, target) {
  const normalized = toPosixPath(filePath);
  const root = target.root === "." ? "" : toPosixPath(target.root);

  if (normalized === target.package_json) return true;
  if (normalized === target.project_json) return true;
  if (target.configs.some((config) => normalized === config)) return true;

  if (!root) {
    return !normalized.includes("/");
  }

  return normalized === root || normalized.startsWith(`${root}/`);
}

function applyChangeDetection(targets, changedFiles, args) {
  const globalChanges = changedFiles
    .filter((file) => isGlobalChange(file.path))
    .map((file) => file.path);
  const allAffectedByGlobal =
    args.all_on_global_change && globalChanges.length > 0;

  return targets.map((target) => {
    const changedForTarget = changedFiles
      .filter((file) => fileAffectsTarget(file.path, target))
      .map((file) => file.path);

    const affected = allAffectedByGlobal || changedForTarget.length > 0;

    return {
      ...target,
      affected,
      affected_reason: allAffectedByGlobal
        ? "Global workspace, CI, or test configuration changed."
        : changedForTarget.length
          ? "Changed files matched this package root, package metadata, project metadata, or test config."
          : "No changed files matched this test target.",
      changed_files: changedForTarget,
      changed_file_count: changedForTarget.length,
      global_changes: allAffectedByGlobal ? globalChanges : [],
    };
  });
}

function dedupeTargets(targets) {
  const seen = new Map();

  for (const target of targets) {
    const key = target.root || target.package_json;

    if (!seen.has(key)) {
      seen.set(key, target);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...target,
      frameworks: dedupeFrameworks([
        ...(existing.frameworks || []),
        ...(target.frameworks || []),
      ]),
      framework_ids: [
        ...new Set([
          ...(existing.framework_ids || []),
          ...(target.framework_ids || []),
        ]),
      ],
      runnable_framework_ids: [
        ...new Set([
          ...(existing.runnable_framework_ids || []),
          ...(target.runnable_framework_ids || []),
        ]),
      ],
      support_framework_ids: [
        ...new Set([
          ...(existing.support_framework_ids || []),
          ...(target.support_framework_ids || []),
        ]),
      ],
      configs: [
        ...new Set([...(existing.configs || []), ...(target.configs || [])]),
      ],
      dependencies: [
        ...new Set([
          ...(existing.dependencies || []),
          ...(target.dependencies || []),
        ]),
      ],
      project_test_targets: [
        ...new Set([
          ...(existing.project_test_targets || []),
          ...(target.project_test_targets || []),
        ]),
      ],
      test_scripts: {
        ...(existing.test_scripts || {}),
        ...(target.test_scripts || {}),
      },
      commands: {
        ...(existing.commands || {}),
        ...(target.commands || {}),
      },
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.root.localeCompare(right.root) || left.name.localeCompare(right.name)
    );
  });
}

function dedupeFrameworks(frameworks) {
  const seen = new Map();

  for (const framework of frameworks) {
    if (!seen.has(framework.id)) {
      seen.set(framework.id, framework);
      continue;
    }

    const existing = seen.get(framework.id);

    seen.set(framework.id, {
      ...existing,
      ...framework,
      reasons: [
        ...new Set([...(existing.reasons || []), ...(framework.reasons || [])]),
      ],
    });
  }

  return FRAMEWORK_ORDER.filter((id) => seen.has(id)).map((id) => seen.get(id));
}

function createTestMatrix(targets, args) {
  const selectedTargets = (
    args.changed_only ? targets.filter((target) => target.affected) : targets
  )
    .filter((target) => target.has_tests_signal)
    .slice(0, args.max_targets > 0 ? args.max_targets : undefined);

  const matrix = [];

  for (const target of selectedTargets) {
    const frameworks = target.frameworks.filter((framework) => {
      return framework.runnable || args.include_support_libraries_in_matrix;
    });

    for (const framework of frameworks) {
      const command = target.commands[framework.id] || {
        command: "",
        script_name: "",
        script_value: "",
        source: "none",
      };

      if (!command.command && !args.include_support_libraries_in_matrix) {
        continue;
      }

      for (const environment of args.environments) {
        matrix.push({
          id: `${target.id}-${framework.id}-${environment}`,
          target_id: target.id,
          target_name: target.name,
          root: target.root,
          package_json: target.package_json,
          project_json: target.project_json,
          project_name: target.project_name,
          project_type: target.project_type,
          framework: framework.id,
          framework_title: framework.title,
          framework_type: framework.type,
          category: framework.category,
          runnable: framework.runnable,
          environment,
          command: command.command,
          command_source: command.source,
          script_name: command.script_name,
          package_manager: target.package_manager,
          affected: target.affected,
          changed_file_count: target.changed_file_count,
          config_count: target.config_count,
        });
      }
    }
  }

  return matrix;
}

function groupTargets(targets) {
  const groups = {};

  for (const target of targets) {
    const group = target.project_type || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        affected: 0,
        with_tests: 0,
        targets: [],
      };
    }

    groups[group].count += 1;
    if (target.affected) groups[group].affected += 1;
    if (target.has_tests_signal) groups[group].with_tests += 1;
    groups[group].targets.push(target.name);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function groupFrameworks(targets) {
  const groups = {};

  for (const target of targets) {
    for (const framework of target.frameworks) {
      if (!groups[framework.id]) {
        groups[framework.id] = {
          id: framework.id,
          title: framework.title,
          type: framework.type,
          category: framework.category,
          runnable: framework.runnable,
          targets: 0,
          affected_targets: 0,
          target_names: [],
        };
      }

      groups[framework.id].targets += 1;
      if (target.affected) groups[framework.id].affected_targets += 1;
      groups[framework.id].target_names.push(target.name);
    }
  }

  return Object.fromEntries(
    FRAMEWORK_ORDER.filter((id) => groups[id]).map((id) => [id, groups[id]]),
  );
}

function summarizeChangedFiles(changedFiles) {
  const groups = {};

  for (const file of changedFiles) {
    const category = categorizeChangedFile(file.path);

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

function categorizeChangedFile(filePath) {
  const normalized = toPosixPath(filePath);
  const basename = path.basename(normalized);

  if (normalized.startsWith(".github/")) return "github";
  if (basename === "package.json") return "package-json";
  if (basename === "project.json") return "project-json";
  if (basename.includes("vitest")) return "vitest";
  if (basename.includes("jest")) return "jest";
  if (basename.includes("playwright")) return "playwright";
  if (basename.includes("cypress")) return "cypress";
  if (basename.includes("karma")) return "karma";
  if (basename.includes("mocha")) return "mocha";
  if (normalized.includes(".storybook/")) return "storybook";
  if (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("__tests__")
  )
    return "tests";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(basename)) return "test-file";
  if (normalized.startsWith("apps/")) return "apps";
  if (normalized.startsWith("libs/")) return "libs";
  if (normalized.startsWith("packages/")) return "packages";
  if (normalized.startsWith("tools/")) return "tools";
  if (
    normalized === "pnpm-lock.yaml" ||
    normalized === "package-lock.json" ||
    normalized === "yarn.lock"
  )
    return "lockfile";

  return "other";
}

function createDetection(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const range = resolveRange(args, repoRoot, git);
  const changedFiles = getChangedFiles(range, repoRoot, args);
  const packageManager = inferPackageManager(repoRoot);
  const allFiles = collectRepositoryFiles(repoRoot, args);
  const packageJsonFiles = collectPackageJsonFiles(args, repoRoot, allFiles);
  const configFiles = collectTestConfigFiles(args, repoRoot, allFiles);

  const discoveredTargets = dedupeTargets(
    packageJsonFiles
      .map((packageJsonPath) =>
        packageRecord(
          packageJsonPath,
          repoRoot,
          args,
          configFiles,
          packageManager,
        ),
      )
      .filter(
        (target) => args.include_empty_packages || target.has_tests_signal,
      ),
  );

  const targets = applyChangeDetection(discoveredTargets, changedFiles, args);
  const targetsWithTests = targets.filter((target) => target.has_tests_signal);
  const affectedTargets = targets.filter((target) => target.affected);
  const affectedTargetsWithTests = targets.filter(
    (target) => target.affected && target.has_tests_signal,
  );
  const frameworkGroups = groupFrameworks(targets);
  const testMatrix = createTestMatrix(targets, args);

  return {
    schema_version: 1,
    type: "test-frameworks",
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
      search_roots: args.search_roots,
      include: args.include.map(toPosixPath),
      exclude: args.exclude.map(toPosixPath),
      environments: args.environments,
      changed_only: args.changed_only,
      all_on_global_change: args.all_on_global_change,
      include_root_package: args.include_root_package,
      include_empty_packages: args.include_empty_packages,
      include_support_libraries_in_matrix:
        args.include_support_libraries_in_matrix,
      allow_secret_paths: args.allow_secret_paths,
      max_changed_files: args.max_changed_files,
      max_targets: args.max_targets,
    },
    totals: {
      package_json_files: packageJsonFiles.length,
      test_config_files: configFiles.length,
      targets: targets.length,
      targets_with_tests: targetsWithTests.length,
      affected_targets: affectedTargets.length,
      affected_targets_with_tests: affectedTargetsWithTests.length,
      changed_files: changedFiles.length,
      global_changes: changedFiles.filter((file) => isGlobalChange(file.path))
        .length,
      frameworks: Object.keys(frameworkGroups).length,
      runnable_framework_targets: targets.reduce(
        (sum, target) => sum + target.runnable_framework_ids.length,
        0,
      ),
      support_framework_targets: targets.reduce(
        (sum, target) => sum + target.support_framework_ids.length,
        0,
      ),
      test_matrix_entries: testMatrix.length,
      test_scripts: targets.reduce(
        (sum, target) => sum + target.test_script_count,
        0,
      ),
      project_test_targets: targets.reduce(
        (sum, target) => sum + target.project_test_target_count,
        0,
      ),
    },
    changed_files: changedFiles,
    changed_file_groups: summarizeChangedFiles(changedFiles),
    package_json_files: packageJsonFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    test_config_files: configFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    targets,
    target_names: targets.map((target) => target.name),
    targets_with_tests: targetsWithTests,
    target_names_with_tests: targetsWithTests.map((target) => target.name),
    affected_targets: affectedTargets,
    affected_target_names: affectedTargets.map((target) => target.name),
    affected_targets_with_tests: affectedTargetsWithTests,
    affected_target_names_with_tests: affectedTargetsWithTests.map(
      (target) => target.name,
    ),
    target_groups: groupTargets(targets),
    framework_groups: frameworkGroups,
    framework_ids: Object.keys(frameworkGroups),
    test_matrix: testMatrix,
    test_matrix_json: JSON.stringify(testMatrix),
    affected_test_matrix: testMatrix.filter((item) => item.affected),
    status: targetsWithTests.length ? "detected" : "none",
  };
}

function truncate(value, maxLength = 90) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function createMarkdownSummary(result) {
  const lines = [
    `# 🧪 ${PROJECT_NAME} Test Frameworks`,
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
    `- Changed-only matrix: \`${result.config.changed_only ? "true" : "false"}\``,
    `- Status: \`${result.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- package.json files: \`${result.totals.package_json_files}\``,
    `- Test config files: \`${result.totals.test_config_files}\``,
    `- Targets: \`${result.totals.targets}\``,
    `- Targets with tests: \`${result.totals.targets_with_tests}\``,
    `- Affected targets: \`${result.totals.affected_targets}\``,
    `- Affected targets with tests: \`${result.totals.affected_targets_with_tests}\``,
    `- Frameworks: \`${result.totals.frameworks}\``,
    `- Runnable framework targets: \`${result.totals.runnable_framework_targets}\``,
    `- Test matrix entries: \`${result.totals.test_matrix_entries}\``,
    `- Changed files: \`${result.totals.changed_files}\``,
    `- Global changes: \`${result.totals.global_changes}\``,
    "",
  ];

  if (Object.keys(result.framework_groups).length) {
    lines.push("## 🧰 Frameworks");
    lines.push("");
    lines.push("| Framework | Category | Runnable | Targets | Affected |");
    lines.push("|---|---|---:|---:|---:|");

    for (const framework of Object.values(result.framework_groups)) {
      lines.push(
        `| \`${framework.title}\` | \`${framework.category}\` | \`${framework.runnable ? "true" : "false"}\` | \`${framework.targets}\` | \`${framework.affected_targets}\` |`,
      );
    }

    lines.push("");
  }

  if (Object.keys(result.target_groups).length) {
    lines.push("## 🗂️ Target Groups");
    lines.push("");
    lines.push("| Type | Count | With Tests | Affected | Targets |");
    lines.push("|---|---:|---:|---:|---|");

    for (const [type, group] of Object.entries(result.target_groups)) {
      lines.push(
        `| \`${type}\` | \`${group.count}\` | \`${group.with_tests}\` | \`${group.affected}\` | ${group.targets.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🎯 Test Targets");
  lines.push("");

  if (!result.targets.length) {
    lines.push("No test targets were detected.");
  } else {
    lines.push(
      "| Target | Type | Root | Frameworks | Affected | Command Signals |",
    );
    lines.push("|---|---|---|---|---:|---:|");

    for (const target of result.targets) {
      lines.push(
        `| \`${target.name}\` | \`${target.project_type}\` | \`${target.root}\` | ${target.framework_ids.map((item) => `\`${item}\``).join(", ") || "`none`"} | \`${target.affected ? "true" : "false"}\` | \`${target.test_script_count + target.project_test_target_count}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🚀 Test Matrix");
  lines.push("");

  if (!result.test_matrix.length) {
    lines.push("No test matrix entries were generated.");
  } else {
    lines.push("| Target | Framework | Environment | Command | Affected |");
    lines.push("|---|---|---|---|---:|");

    for (const item of result.test_matrix.slice(0, 200)) {
      lines.push(
        `| \`${item.target_name}\` | \`${item.framework}\` | \`${item.environment}\` | \`${truncate(item.command, 100)}\` | \`${item.affected ? "true" : "false"}\` |`,
      );
    }

    if (result.test_matrix.length > 200) {
      lines.push(
        `| ... | ... | ... | ${result.test_matrix.length - 200} additional matrix entrie(s) omitted. | ... |`,
      );
    }
  }

  lines.push("");
  lines.push("## ⚙️ Test Config Files");
  lines.push("");

  if (!result.test_config_files.length) {
    lines.push("No standalone test config files were detected.");
  } else {
    for (const filePath of result.test_config_files.slice(0, 100)) {
      lines.push(`- \`${filePath}\``);
    }

    if (result.test_config_files.length > 100) {
      lines.push(
        `- ...and \`${result.test_config_files.length - 100}\` more config file(s).`,
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
        `| \`${file.status}\` | \`${truncate(file.path, 120)}\` | \`${categorizeChangedFile(file.path)}\` |`,
      );
    }

    if (result.changed_files.length > 200) {
      lines.push(
        `| ... | ${result.changed_files.length - 200} additional changed file(s) omitted. | ... |`,
      );
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
  setGitHubOutput("test_frameworks_file", result.config.output_file);
  setGitHubOutput(
    "test_frameworks_summary_file",
    result.config.summary_file || "",
  );
  setGitHubOutput("test_frameworks_status", result.status);
  setGitHubOutput("test_targets_count", String(result.totals.targets));
  setGitHubOutput(
    "test_targets_with_tests_count",
    String(result.totals.targets_with_tests),
  );
  setGitHubOutput(
    "test_affected_targets_count",
    String(result.totals.affected_targets),
  );
  setGitHubOutput(
    "test_affected_targets_with_tests_count",
    String(result.totals.affected_targets_with_tests),
  );
  setGitHubOutput("test_frameworks_count", String(result.totals.frameworks));
  setGitHubOutput(
    "test_matrix_count",
    String(result.totals.test_matrix_entries),
  );
  setGitHubOutput("test_framework_ids", result.framework_ids.join(","));
  setGitHubOutput(
    "test_framework_ids_json",
    JSON.stringify(result.framework_ids),
  );
  setGitHubOutput("test_target_names", result.target_names.join(","));
  setGitHubOutput(
    "test_target_names_json",
    JSON.stringify(result.target_names),
  );
  setGitHubOutput(
    "test_target_names_with_tests",
    result.target_names_with_tests.join(","),
  );
  setGitHubOutput(
    "test_target_names_with_tests_json",
    JSON.stringify(result.target_names_with_tests),
  );
  setGitHubOutput(
    "test_affected_target_names",
    result.affected_target_names.join(","),
  );
  setGitHubOutput(
    "test_affected_target_names_json",
    JSON.stringify(result.affected_target_names),
  );
  setGitHubOutput(
    "test_affected_target_names_with_tests",
    result.affected_target_names_with_tests.join(","),
  );
  setGitHubOutput(
    "test_affected_target_names_with_tests_json",
    JSON.stringify(result.affected_target_names_with_tests),
  );
  setGitHubOutput("test_matrix_json", JSON.stringify(result.test_matrix));
  setGitHubOutput(
    "affected_test_matrix_json",
    JSON.stringify(result.affected_test_matrix),
  );
  setGitHubOutput(
    "test_changed_files_count",
    String(result.totals.changed_files),
  );
  setGitHubOutput(
    "test_global_changes_count",
    String(result.totals.global_changes),
  );
  setGitHubOutput(
    "test_config_files_count",
    String(result.totals.test_config_files),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Detecting test frameworks.");

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

  if (args.fail_if_none && result.totals.targets_with_tests === 0) {
    logger.error("No test frameworks were detected.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_no_matrix && result.totals.test_matrix_entries === 0) {
    logger.error("No test matrix entries were generated.");
    process.exitCode = 1;
  }
}

main();
