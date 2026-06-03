#!/usr/bin/env node
// .github/scripts/ci/detect-publishable-packages.js
// =============================================================================
// Aerealith AI — CI Publishable Package Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Discover publishable npm/workspace packages, package metadata, publish
//   eligibility, affected package state, registry/access configuration, and CI
//   publish matrix entries for release workflows.
//
// Output:
//   - artifacts/ci/publishable-packages.json
//   - artifacts/ci/publishable-packages.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not publish packages.
//   - Does not mutate npm, GitHub, or registries.
//   - Treats packages as publishable when they have package.json name/version
//     and are not private, unless --include-private is used.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[publishable-packages] ${message}`),
    warn: (message) => console.warn(`[publishable-packages] WARN: ${message}`),
    error: (message) =>
      console.error(`[publishable-packages] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/publishable-packages.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/publishable-packages.md";

const DEFAULT_SEARCH_ROOTS = ["apps", "libs", "packages", "tools", "."];

const DEFAULT_ENVIRONMENTS = ["release"];
const DEFAULT_DIST_TAGS = ["latest"];
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  ".github/scripts/node_modules/",
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

const GLOBAL_CHANGE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.base.json",
  ".npmrc",
  ".github/repo-management/dependency-rules.yaml",
  ".github/scripts/utils/pnpm.js",
  ".github/scripts/utils/semver.js",
  ".github/scripts/ci/detect-publishable-packages.js",
]);

const GLOBAL_CHANGE_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/scripts/npm/",
  ".github/scripts/release/",
];

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

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
      process.env.PUBLISHABLE_PACKAGES_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.NX_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.PUBLISHABLE_PACKAGES_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.NX_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",
    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    head_ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",

    search_roots: normalizeStringList(
      process.env.PUBLISHABLE_PACKAGES_SEARCH_ROOTS,
    ),
    include: normalizeStringList(process.env.PUBLISHABLE_PACKAGES_INCLUDE),
    exclude: normalizeStringList(process.env.PUBLISHABLE_PACKAGES_EXCLUDE),
    environments: normalizeStringList(
      process.env.PUBLISHABLE_PACKAGES_ENVIRONMENTS,
    ),
    dist_tags: normalizeStringList(
      process.env.PUBLISHABLE_PACKAGES_DIST_TAGS || process.env.NPM_DIST_TAGS,
    ),

    registry:
      process.env.NPM_REGISTRY ||
      process.env.PUBLISHABLE_PACKAGES_REGISTRY ||
      DEFAULT_REGISTRY,
    default_access:
      process.env.NPM_ACCESS ||
      process.env.PUBLISHABLE_PACKAGES_ACCESS ||
      "public",

    output_file:
      process.env.PUBLISHABLE_PACKAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.PUBLISHABLE_PACKAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    changed_only: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_CHANGED_ONLY,
      false,
    ),
    all_on_global_change: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_ALL_ON_GLOBAL_CHANGE,
      true,
    ),
    include_untracked: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_INCLUDE_UNTRACKED,
      true,
    ),
    include_staged: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_INCLUDE_STAGED,
      true,
    ),
    include_deleted: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_INCLUDE_DELETED,
      true,
    ),

    include_private: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    include_root_package: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_INCLUDE_ROOT_PACKAGE,
      false,
    ),
    require_publish_script: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_REQUIRE_PUBLISH_SCRIPT,
      false,
    ),
    require_files_field: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_REQUIRE_FILES_FIELD,
      false,
    ),
    allow_prerelease: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_ALLOW_PRERELEASE,
      true,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_ALLOW_SECRET_PATHS,
      false,
    ),

    fail_if_none: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_FAIL_IF_NONE,
      false,
    ),
    fail_if_no_matrix: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_FAIL_IF_NO_MATRIX,
      false,
    ),
    fail_on_invalid_package: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_FAIL_ON_INVALID_PACKAGE,
      false,
    ),

    max_changed_files: normalizeInteger(
      process.env.PUBLISHABLE_PACKAGES_MAX_CHANGED_FILES,
      1000,
    ),
    max_packages: normalizeInteger(
      process.env.PUBLISHABLE_PACKAGES_MAX_PACKAGES,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.PUBLISHABLE_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.PUBLISHABLE_PACKAGES_STEP_SUMMARY,
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

    if (arg === "--dist-tag" || arg === "--dist-tags") {
      args.dist_tags.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--registry") {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--access") {
      args.default_access = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changed-only") {
      args.changed_only = true;
      continue;
    }

    if (arg === "--all-packages") {
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

    if (arg === "--include-private") {
      args.include_private = true;
      continue;
    }

    if (arg === "--no-private") {
      args.include_private = false;
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

    if (arg === "--require-publish-script") {
      args.require_publish_script = true;
      continue;
    }

    if (arg === "--no-require-publish-script") {
      args.require_publish_script = false;
      continue;
    }

    if (arg === "--require-files-field") {
      args.require_files_field = true;
      continue;
    }

    if (arg === "--no-require-files-field") {
      args.require_files_field = false;
      continue;
    }

    if (arg === "--allow-prerelease") {
      args.allow_prerelease = true;
      continue;
    }

    if (arg === "--no-prerelease") {
      args.allow_prerelease = false;
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

    if (arg === "--max-packages") {
      args.max_packages = normalizeInteger(argv[index + 1], args.max_packages);
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

    if (arg === "--fail-on-invalid-package") {
      args.fail_on_invalid_package = true;
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

  if (!args.dist_tags.length) {
    args.dist_tags = [...DEFAULT_DIST_TAGS];
  }

  args.search_roots = [...new Set(args.search_roots.map(toPosixPath))];
  args.environments = [
    ...new Set(args.environments.map((item) => item.toLowerCase())),
  ];
  args.dist_tags = [
    ...new Set(args.dist_tags.map((item) => item.toLowerCase())),
  ];
  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.max_changed_files = Math.max(0, args.max_changed_files);
  args.max_packages = Math.max(0, args.max_packages);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Publishable Package Detector

Usage:
  node .github/scripts/ci/detect-publishable-packages.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --base <sha|ref>                 Base commit/ref.
      --head <sha|ref>                 Head commit/ref.
      --base-ref <branch>              Base branch name. Default: main.
      --head-ref <branch>              Head branch name.
      --root <path,list>               Search roots. Default: apps,libs,packages,tools,.
  -i, --include <path|glob>            Additional package.json path/glob to include.
  -x, --exclude <pattern>              Exclude path pattern.
      --environment <list>             Matrix environments. Default: release.
      --dist-tag <list>                npm dist-tags. Default: latest.
      --registry <url>                 Default npm registry.
      --access <public|restricted>     Default npm access. Default: public.
      --changed-only                   Emit matrix only for affected packages.
      --all-packages                   Emit matrix for all publishable packages. Default.
      --all-on-global-change           Treat global changes as all packages affected. Default.
      --no-all-on-global-change        Do not expand global changes to all packages.
      --include-private                Include private packages in detection.
      --include-root-package           Include root package.json if publishable.
      --require-publish-script         Only publish packages with a publish script.
      --require-files-field            Only publish packages with package.json files field.
      --allow-prerelease               Allow prerelease versions. Default.
      --no-prerelease                  Exclude prerelease versions from publish matrix.
      --allow-secret-paths             Allow package paths that look secret-like.
      --max-changed-files <number>     Maximum changed files to report. 0 means unlimited.
      --max-packages <number>          Maximum packages to emit. 0 means unlimited.
      --fail-if-none                   Exit non-zero when no publishable packages are found.
      --fail-if-no-matrix              Exit non-zero when publish matrix is empty.
      --fail-on-invalid-package        Exit non-zero when invalid package metadata is found.
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
      return (
        regex.test(relativePath) && path.basename(filePath) === "package.json"
      );
    });
  }

  const absolutePath = resolvePath(normalizedSpec, repoRoot);

  if (isFile(absolutePath)) {
    const relativePath = toRelativePath(absolutePath, repoRoot);

    return shouldExcludePath(relativePath, args) ||
      path.basename(absolutePath) !== "package.json"
      ? []
      : [absolutePath];
  }

  if (isDirectory(absolutePath)) {
    return walkFiles(absolutePath, repoRoot, args).filter(
      (filePath) => path.basename(filePath) === "package.json",
    );
  }

  return [];
}

function collectPackageJsonFiles(args, repoRoot) {
  const allFiles = collectRepositoryFiles(repoRoot, args);
  const packageFiles = allFiles.filter((filePath) => {
    const relativePath = toRelativePath(filePath, repoRoot);

    if (path.basename(filePath) !== "package.json") return false;
    if (!args.include_root_package && relativePath === "package.json")
      return false;

    return true;
  });

  for (const spec of args.include) {
    packageFiles.push(...collectFilesForSpec(spec, repoRoot, allFiles, args));
  }

  return [...new Set(packageFiles)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function nearestProjectJson(startPath, repoRoot) {
  const candidate = path.join(resolvePath(startPath, repoRoot), "project.json");

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

function isValidPackageName(name) {
  if (!name || typeof name !== "string") return false;

  if (name.startsWith("@")) {
    return /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(name);
  }

  return /^[a-z0-9][a-z0-9._-]*$/i.test(name);
}

function parseVersion(version) {
  const match = normalizeString(version).match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/,
  );

  if (!match) {
    return {
      valid: false,
      version: normalizeString(version),
      major: null,
      minor: null,
      patch: null,
      prerelease: "",
      build: "",
    };
  }

  return {
    valid: true,
    version: normalizeString(version),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || "",
    build: match[5] || "",
  };
}

function packageScope(name) {
  const normalized = normalizeString(name);

  if (!normalized.startsWith("@")) return "";

  return normalized.split("/")[0] || "";
}

function packageSlug(name) {
  return normalizeString(name, "package")
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function inferPackageType(root, packageJson) {
  const normalizedRoot = toPosixPath(root).toLowerCase();

  if (normalizedRoot.startsWith("apps/")) return "application";
  if (normalizedRoot.startsWith("libs/")) return "library";
  if (normalizedRoot.startsWith("packages/")) return "package";
  if (normalizedRoot.startsWith("tools/")) return "tool";

  if (packageJson?.bin) return "cli";
  if (packageJson?.types || packageJson?.typings) return "library";

  return "package";
}

function inferPackageManager(repoRoot) {
  if (isFile(resolvePath("pnpm-lock.yaml", repoRoot))) return "pnpm";
  if (isFile(resolvePath("yarn.lock", repoRoot))) return "yarn";
  if (isFile(resolvePath("package-lock.json", repoRoot))) return "npm";
  if (isFile(resolvePath("bun.lockb", repoRoot))) return "bun";

  return "npm";
}

function getPublishCommand(packageDir, packageManager) {
  const dir = toPosixPath(packageDir);

  if (packageManager === "pnpm") {
    return dir === "." ? "pnpm publish" : `pnpm --dir ${dir} publish`;
  }

  if (packageManager === "yarn") {
    return dir === "." ? "yarn npm publish" : `yarn --cwd ${dir} npm publish`;
  }

  if (packageManager === "bun") {
    return dir === "." ? "bun publish" : `cd ${dir} && bun publish`;
  }

  return dir === "." ? "npm publish" : `npm publish ${dir}`;
}

function getPackCommand(packageDir, packageManager) {
  const dir = toPosixPath(packageDir);

  if (packageManager === "pnpm") {
    return dir === "." ? "pnpm pack" : `pnpm --dir ${dir} pack`;
  }

  if (packageManager === "yarn") {
    return dir === "." ? "yarn pack" : `yarn --cwd ${dir} pack`;
  }

  if (packageManager === "bun") {
    return dir === "." ? "bun pm pack" : `cd ${dir} && bun pm pack`;
  }

  return dir === "." ? "npm pack" : `npm pack ${dir}`;
}

function normalizeRegistry(registry) {
  const value = normalizeString(registry, DEFAULT_REGISTRY);

  return value.endsWith("/") ? value : `${value}/`;
}

function publishConfigRegistry(packageJson, args) {
  return normalizeRegistry(
    packageJson?.publishConfig?.registry || args.registry,
  );
}

function publishAccess(packageJson, args) {
  return normalizeString(
    packageJson?.publishConfig?.access || args.default_access,
    "public",
  );
}

function hasPublishScript(packageJson) {
  const scripts = packageJson?.scripts || {};

  return Boolean(
    scripts.publish ||
    scripts["npm:publish"] ||
    scripts["release:publish"] ||
    scripts["package:publish"],
  );
}

function getPublishScripts(packageJson) {
  return Object.fromEntries(
    Object.entries(packageJson?.scripts || {}).filter(
      ([scriptName, scriptValue]) => {
        const text = `${scriptName} ${scriptValue}`.toLowerCase();

        return (
          text.includes("publish") ||
          text.includes("npm pack") ||
          text.includes("pnpm pack")
        );
      },
    ),
  );
}

function packageFilesField(packageJson) {
  return Array.isArray(packageJson?.files) ? packageJson.files.map(String) : [];
}

function packageEntrypoints(packageJson) {
  return {
    main: normalizeString(packageJson?.main),
    module: normalizeString(packageJson?.module),
    types: normalizeString(packageJson?.types || packageJson?.typings),
    exports_present: Boolean(packageJson?.exports),
    bin_present: Boolean(packageJson?.bin),
  };
}

function packageDependencyCounts(packageJson) {
  return {
    dependencies: Object.keys(packageJson?.dependencies || {}).length,
    dev_dependencies: Object.keys(packageJson?.devDependencies || {}).length,
    peer_dependencies: Object.keys(packageJson?.peerDependencies || {}).length,
    optional_dependencies: Object.keys(packageJson?.optionalDependencies || {})
      .length,
  };
}

function packageEngines(packageJson) {
  return Object.fromEntries(
    Object.entries(packageJson?.engines || {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
}

function detectPackageWarnings(packageJson, args) {
  const warnings = [];
  const version = parseVersion(packageJson.version);

  if (!isValidPackageName(packageJson.name)) {
    warnings.push("Invalid or missing package name.");
  }

  if (!version.valid) {
    warnings.push("Invalid or missing semver version.");
  }

  if (version.prerelease && !args.allow_prerelease) {
    warnings.push(
      "Prerelease versions are not allowed by current configuration.",
    );
  }

  if (!packageJson.description) {
    warnings.push("Missing package description.");
  }

  if (!packageJson.license) {
    warnings.push("Missing package license.");
  }

  if (!packageJson.repository) {
    warnings.push("Missing package repository metadata.");
  }

  if (!packageJson.main && !packageJson.exports && !packageJson.bin) {
    warnings.push("No main, exports, or bin entrypoint was found.");
  }

  if (args.require_publish_script && !hasPublishScript(packageJson)) {
    warnings.push("Package does not define a publish script.");
  }

  if (args.require_files_field && !Array.isArray(packageJson.files)) {
    warnings.push("Package does not define a files field.");
  }

  return warnings;
}

function packageIsEligible(packageJson, args) {
  const version = parseVersion(packageJson.version);

  if (!isValidPackageName(packageJson.name)) return false;
  if (!version.valid) return false;
  if (packageJson.private === true && !args.include_private) return false;
  if (version.prerelease && !args.allow_prerelease) return false;
  if (args.require_publish_script && !hasPublishScript(packageJson))
    return false;
  if (args.require_files_field && !Array.isArray(packageJson.files))
    return false;

  return true;
}

function isGlobalChange(filePath) {
  const normalized = toPosixPath(filePath);

  if (GLOBAL_CHANGE_FILES.has(normalized)) return true;

  return GLOBAL_CHANGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function fileAffectsPackage(filePath, pkg) {
  const normalized = toPosixPath(filePath);
  const root = pkg.root === "." ? "" : toPosixPath(pkg.root);

  if (normalized === pkg.package_json) return true;
  if (normalized === pkg.project_json) return true;

  if (!root) return false;

  return normalized === root || normalized.startsWith(`${root}/`);
}

function createPackageRecord(packageJsonPath, repoRoot, args, packageManager) {
  const packageJson = readJsonFile(packageJsonPath, null);
  const packageJsonRelative = toRelativePath(packageJsonPath, repoRoot);
  const root = toPosixPath(path.dirname(packageJsonRelative));
  const project = readProjectJson(path.dirname(packageJsonPath), repoRoot);
  const version = parseVersion(packageJson?.version || "");
  const warnings = packageJson
    ? detectPackageWarnings(packageJson, args)
    : ["package.json could not be parsed."];

  const name = normalizeString(packageJson?.name, path.basename(root));
  const eligible = packageJson ? packageIsEligible(packageJson, args) : false;
  const distTags = packageJson?.publishConfig?.tag
    ? [String(packageJson.publishConfig.tag)]
    : args.dist_tags;

  return {
    id: packageSlug(name || root),
    name,
    scope: packageScope(name),
    version: normalizeString(packageJson?.version),
    version_info: version,
    private: Boolean(packageJson?.private),
    publishable: eligible,
    publishable_reason: eligible
      ? "Package metadata is valid and package is eligible for publishing."
      : "Package metadata or configuration prevents publishing.",
    root,
    package_json: packageJsonRelative,
    project_json: project.path,
    project_name: normalizeString(
      project.project?.name || packageJson?.nx?.name || name,
    ),
    project_type: normalizeString(
      project.project?.projectType ||
        packageJson?.nx?.projectType ||
        inferPackageType(root, packageJson),
    ),
    package_type: inferPackageType(root, packageJson),
    registry: publishConfigRegistry(packageJson, args),
    access: publishAccess(packageJson, args),
    dist_tags: distTags,
    package_manager: packageManager,
    publish_command: getPublishCommand(root, packageManager),
    pack_command: getPackCommand(root, packageManager),
    publish_config: packageJson?.publishConfig || {},
    scripts: getPublishScripts(packageJson || {}),
    has_publish_script: hasPublishScript(packageJson || {}),
    files: packageFilesField(packageJson || {}),
    files_field_present: Array.isArray(packageJson?.files),
    entrypoints: packageEntrypoints(packageJson || {}),
    dependency_counts: packageDependencyCounts(packageJson || {}),
    engines: packageEngines(packageJson || {}),
    license: normalizeString(packageJson?.license),
    description: normalizeString(packageJson?.description),
    repository_present: Boolean(packageJson?.repository),
    keywords: Array.isArray(packageJson?.keywords)
      ? packageJson.keywords.map(String)
      : [],
    side_effects: packageJson?.sideEffects ?? null,
    warnings,
    valid:
      warnings.filter(
        (warning) =>
          warning.startsWith("Invalid") || warning.startsWith("Prerelease"),
      ).length === 0,
    affected: false,
    affected_reason: "",
    changed_files: [],
    changed_file_count: 0,
    global_changes: [],
  };
}

function applyChangeDetection(packages, changedFiles, args) {
  const globalChanges = changedFiles
    .filter((file) => isGlobalChange(file.path))
    .map((file) => file.path);
  const allAffectedByGlobal =
    args.all_on_global_change && globalChanges.length > 0;

  return packages.map((pkg) => {
    const changedForPackage = changedFiles
      .filter((file) => fileAffectsPackage(file.path, pkg))
      .map((file) => file.path);

    const affected = allAffectedByGlobal || changedForPackage.length > 0;

    return {
      ...pkg,
      affected,
      affected_reason: allAffectedByGlobal
        ? "Global workspace, CI, npm, or release configuration changed."
        : changedForPackage.length
          ? "Changed files matched this package root or package metadata."
          : "No changed files matched this package.",
      changed_files: changedForPackage,
      changed_file_count: changedForPackage.length,
      global_changes: allAffectedByGlobal ? globalChanges : [],
    };
  });
}

function dedupePackages(packages) {
  const seen = new Map();

  for (const pkg of packages) {
    const key = pkg.name || pkg.package_json;

    if (!seen.has(key)) {
      seen.set(key, pkg);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...pkg,
      warnings: [
        ...new Set([...(existing.warnings || []), ...(pkg.warnings || [])]),
      ],
      dist_tags: [
        ...new Set([...(existing.dist_tags || []), ...(pkg.dist_tags || [])]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.root.localeCompare(right.root) || left.name.localeCompare(right.name)
    );
  });
}

function createPublishMatrix(packages, args) {
  const selectedPackages = packages
    .filter((pkg) => pkg.publishable)
    .filter((pkg) => (args.changed_only ? pkg.affected : true))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);

  const matrix = [];

  for (const pkg of selectedPackages) {
    for (const environment of args.environments) {
      for (const distTag of pkg.dist_tags.length
        ? pkg.dist_tags
        : args.dist_tags) {
        matrix.push({
          id: pkg.id,
          name: pkg.name,
          version: pkg.version,
          root: pkg.root,
          package_json: pkg.package_json,
          project_name: pkg.project_name,
          project_type: pkg.project_type,
          package_type: pkg.package_type,
          environment,
          registry: pkg.registry,
          access: pkg.access,
          dist_tag: distTag,
          scope: pkg.scope,
          package_manager: pkg.package_manager,
          publish_command: pkg.publish_command,
          pack_command: pkg.pack_command,
          private: pkg.private,
          affected: pkg.affected,
          changed_file_count: pkg.changed_file_count,
          has_publish_script: pkg.has_publish_script,
          files_field_present: pkg.files_field_present,
        });
      }
    }
  }

  return matrix;
}

function groupPackages(packages) {
  const groups = {};

  for (const pkg of packages) {
    const group = pkg.package_type || "package";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        publishable: 0,
        affected: 0,
        packages: [],
      };
    }

    groups[group].count += 1;
    if (pkg.publishable) groups[group].publishable += 1;
    if (pkg.affected) groups[group].affected += 1;
    groups[group].packages.push(pkg.name);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
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
  if (
    normalized === "pnpm-lock.yaml" ||
    normalized === "package-lock.json" ||
    normalized === "yarn.lock"
  )
    return "lockfile";
  if (normalized.startsWith("apps/")) return "apps";
  if (normalized.startsWith("libs/")) return "libs";
  if (normalized.startsWith("packages/")) return "packages";
  if (normalized.startsWith("tools/")) return "tools";
  if (normalized.startsWith("docs/") || normalized.startsWith("Docs/"))
    return "docs";

  return "other";
}

function createDetection(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const range = resolveRange(args, repoRoot, git);
  const changedFiles = getChangedFiles(range, repoRoot, args);
  const packageManager = inferPackageManager(repoRoot);
  const packageJsonFiles = collectPackageJsonFiles(args, repoRoot);

  const discoveredPackages = dedupePackages(
    packageJsonFiles.map((packageJsonPath) =>
      createPackageRecord(packageJsonPath, repoRoot, args, packageManager),
    ),
  );

  const packages = applyChangeDetection(discoveredPackages, changedFiles, args);
  const publishablePackages = packages.filter((pkg) => pkg.publishable);
  const affectedPackages = packages.filter((pkg) => pkg.affected);
  const affectedPublishablePackages = packages.filter(
    (pkg) => pkg.publishable && pkg.affected,
  );
  const invalidPackages = packages.filter(
    (pkg) => !pkg.valid || !pkg.publishable,
  );
  const publishMatrix = createPublishMatrix(packages, args);

  return {
    schema_version: 1,
    type: "publishable-packages",
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
      dist_tags: args.dist_tags,
      registry: normalizeRegistry(args.registry),
      default_access: args.default_access,
      changed_only: args.changed_only,
      all_on_global_change: args.all_on_global_change,
      include_private: args.include_private,
      include_root_package: args.include_root_package,
      require_publish_script: args.require_publish_script,
      require_files_field: args.require_files_field,
      allow_prerelease: args.allow_prerelease,
      allow_secret_paths: args.allow_secret_paths,
      max_changed_files: args.max_changed_files,
      max_packages: args.max_packages,
    },
    totals: {
      package_json_files: packageJsonFiles.length,
      packages: packages.length,
      publishable_packages: publishablePackages.length,
      private_packages: packages.filter((pkg) => pkg.private).length,
      affected_packages: affectedPackages.length,
      affected_publishable_packages: affectedPublishablePackages.length,
      invalid_or_blocked_packages: invalidPackages.length,
      changed_files: changedFiles.length,
      global_changes: changedFiles.filter((file) => isGlobalChange(file.path))
        .length,
      publish_matrix_entries: publishMatrix.length,
      scoped_packages: packages.filter((pkg) => pkg.scope).length,
      prerelease_packages: packages.filter((pkg) => pkg.version_info.prerelease)
        .length,
      packages_with_publish_script: packages.filter(
        (pkg) => pkg.has_publish_script,
      ).length,
      packages_with_files_field: packages.filter(
        (pkg) => pkg.files_field_present,
      ).length,
    },
    changed_files: changedFiles,
    changed_file_groups: summarizeChangedFiles(changedFiles),
    package_json_files: packageJsonFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    packages,
    package_names: packages.map((pkg) => pkg.name),
    publishable_packages: publishablePackages,
    publishable_package_names: publishablePackages.map((pkg) => pkg.name),
    affected_packages: affectedPackages,
    affected_package_names: affectedPackages.map((pkg) => pkg.name),
    affected_publishable_packages: affectedPublishablePackages,
    affected_publishable_package_names: affectedPublishablePackages.map(
      (pkg) => pkg.name,
    ),
    invalid_or_blocked_packages: invalidPackages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      root: pkg.root,
      package_json: pkg.package_json,
      publishable: pkg.publishable,
      private: pkg.private,
      warnings: pkg.warnings,
    })),
    package_groups: groupPackages(packages),
    publish_matrix: publishMatrix,
    publish_matrix_json: JSON.stringify(publishMatrix),
    status: publishablePackages.length ? "detected" : "none",
  };
}

function truncate(value, maxLength = 90) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function createMarkdownSummary(result) {
  const lines = [
    `# 📦 ${PROJECT_NAME} Publishable Packages`,
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
    `- Registry: \`${result.config.registry}\``,
    `- Status: \`${result.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- package.json files: \`${result.totals.package_json_files}\``,
    `- Packages: \`${result.totals.packages}\``,
    `- Publishable packages: \`${result.totals.publishable_packages}\``,
    `- Private packages: \`${result.totals.private_packages}\``,
    `- Affected packages: \`${result.totals.affected_packages}\``,
    `- Affected publishable packages: \`${result.totals.affected_publishable_packages}\``,
    `- Invalid or blocked packages: \`${result.totals.invalid_or_blocked_packages}\``,
    `- Publish matrix entries: \`${result.totals.publish_matrix_entries}\``,
    `- Changed files: \`${result.totals.changed_files}\``,
    `- Global changes: \`${result.totals.global_changes}\``,
    "",
  ];

  if (Object.keys(result.package_groups).length) {
    lines.push("## 🗂️ Package Groups");
    lines.push("");
    lines.push("| Type | Count | Publishable | Affected | Packages |");
    lines.push("|---|---:|---:|---:|---|");

    for (const [type, group] of Object.entries(result.package_groups)) {
      lines.push(
        `| \`${type}\` | \`${group.count}\` | \`${group.publishable}\` | \`${group.affected}\` | ${group.packages.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 📦 Packages");
  lines.push("");

  if (!result.packages.length) {
    lines.push("No packages were detected.");
  } else {
    lines.push(
      "| Package | Version | Root | Publishable | Affected | Registry |",
    );
    lines.push("|---|---|---|---:|---:|---|");

    for (const pkg of result.packages) {
      lines.push(
        `| \`${pkg.name}\` | \`${pkg.version || "unknown"}\` | \`${pkg.root}\` | \`${pkg.publishable ? "true" : "false"}\` | \`${pkg.affected ? "true" : "false"}\` | \`${pkg.registry}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🚀 Publish Matrix");
  lines.push("");

  if (!result.publish_matrix.length) {
    lines.push("No publish matrix entries were generated.");
  } else {
    lines.push(
      "| Package | Version | Environment | Dist Tag | Access | Command |",
    );
    lines.push("|---|---|---|---|---|---|");

    for (const item of result.publish_matrix.slice(0, 200)) {
      lines.push(
        `| \`${item.name}\` | \`${item.version}\` | \`${item.environment}\` | \`${item.dist_tag}\` | \`${item.access}\` | \`${truncate(item.publish_command, 80)}\` |`,
      );
    }

    if (result.publish_matrix.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ${result.publish_matrix.length - 200} additional matrix entrie(s) omitted. |`,
      );
    }
  }

  if (result.invalid_or_blocked_packages.length) {
    lines.push("");
    lines.push("## ⚠️ Invalid or Blocked Packages");
    lines.push("");
    lines.push("| Package | Root | Publishable | Private | Warnings |");
    lines.push("|---|---|---:|---:|---|");

    for (const pkg of result.invalid_or_blocked_packages.slice(0, 100)) {
      lines.push(
        `| \`${pkg.name || "unknown"}\` | \`${pkg.root}\` | \`${pkg.publishable ? "true" : "false"}\` | \`${pkg.private ? "true" : "false"}\` | ${pkg.warnings.map((item) => `\`${item}\``).join("<br>")} |`,
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
  setGitHubOutput("publishable_packages_file", result.config.output_file);
  setGitHubOutput(
    "publishable_packages_summary_file",
    result.config.summary_file || "",
  );
  setGitHubOutput("publishable_packages_status", result.status);
  setGitHubOutput("packages_count", String(result.totals.packages));
  setGitHubOutput(
    "publishable_packages_count",
    String(result.totals.publishable_packages),
  );
  setGitHubOutput(
    "affected_packages_count",
    String(result.totals.affected_packages),
  );
  setGitHubOutput(
    "affected_publishable_packages_count",
    String(result.totals.affected_publishable_packages),
  );
  setGitHubOutput(
    "publish_matrix_count",
    String(result.totals.publish_matrix_entries),
  );
  setGitHubOutput("package_names", result.package_names.join(","));
  setGitHubOutput("package_names_json", JSON.stringify(result.package_names));
  setGitHubOutput(
    "publishable_package_names",
    result.publishable_package_names.join(","),
  );
  setGitHubOutput(
    "publishable_package_names_json",
    JSON.stringify(result.publishable_package_names),
  );
  setGitHubOutput(
    "affected_package_names",
    result.affected_package_names.join(","),
  );
  setGitHubOutput(
    "affected_package_names_json",
    JSON.stringify(result.affected_package_names),
  );
  setGitHubOutput(
    "affected_publishable_package_names",
    result.affected_publishable_package_names.join(","),
  );
  setGitHubOutput(
    "affected_publishable_package_names_json",
    JSON.stringify(result.affected_publishable_package_names),
  );
  setGitHubOutput("publish_matrix_json", JSON.stringify(result.publish_matrix));
  setGitHubOutput("changed_files_count", String(result.totals.changed_files));
  setGitHubOutput("global_changes_count", String(result.totals.global_changes));
  setGitHubOutput(
    "invalid_or_blocked_packages_count",
    String(result.totals.invalid_or_blocked_packages),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Detecting publishable packages.");

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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_if_none && result.totals.publishable_packages === 0) {
    logger.error("No publishable packages were detected.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_no_matrix && result.totals.publish_matrix_entries === 0) {
    logger.error("No publish matrix entries were generated.");
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_on_invalid_package &&
    result.totals.invalid_or_blocked_packages > 0
  ) {
    logger.error(
      `Detected ${result.totals.invalid_or_blocked_packages} invalid or blocked package(s).`,
    );
    process.exitCode = 1;
  }
}

main();
