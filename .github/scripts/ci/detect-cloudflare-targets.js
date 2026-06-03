#!/usr/bin/env node
// .github/scripts/ci/detect-cloudflare-targets.js
// =============================================================================
// Aerealith AI — CI Cloudflare Target Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Discover Cloudflare deployment targets from Wrangler configuration files,
//   package scripts, changed files, and workspace project roots so CI can build
//   deployment matrices for Workers, Pages, D1, KV, R2, Queues, Durable Objects,
//   and related bindings without relying on single global project-name secrets.
//
// Output:
//   - artifacts/ci/cloudflare-targets.json
//   - artifacts/ci/cloudflare-targets.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate Cloudflare or GitHub.
//   - Does not require Cloudflare credentials.
//   - Supports wrangler.toml, wrangler.json, and wrangler.jsonc.
//   - Uses changed-file detection to mark affected targets and optionally limit
//     the emitted deployment matrix to affected targets only.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cloudflare-targets] ${message}`),
    warn: (message) => console.warn(`[cloudflare-targets] WARN: ${message}`),
    error: (message) => console.error(`[cloudflare-targets] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/cloudflare-targets.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_SEARCH_ROOTS = [
  "apps",
  "libs",
  "packages",
  "services",
  "workers",
  ".",
];
const DEFAULT_ENVIRONMENTS = ["preview", "production"];

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

const CONFIG_FILENAMES = new Set([
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
]);

const GLOBAL_CHANGE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.base.json",
  ".github/repo-management/cloudflare-rules.yaml",
  ".github/scripts/utils/cloudflare.js",
  ".github/scripts/ci/detect-cloudflare-targets.js",
]);

const GLOBAL_CHANGE_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/scripts/cloudflare/",
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
      process.env.CLOUDFLARE_TARGETS_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.NX_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.CLOUDFLARE_TARGETS_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.NX_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",
    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    head_ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",

    search_roots: normalizeStringList(
      process.env.CLOUDFLARE_TARGETS_SEARCH_ROOTS,
    ),
    include: normalizeStringList(process.env.CLOUDFLARE_TARGETS_INCLUDE),
    exclude: normalizeStringList(process.env.CLOUDFLARE_TARGETS_EXCLUDE),
    environments: normalizeStringList(
      process.env.CLOUDFLARE_TARGETS_ENVIRONMENTS,
    ),

    output_file:
      process.env.CLOUDFLARE_TARGETS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.CLOUDFLARE_TARGETS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    changed_only: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_CHANGED_ONLY,
      false,
    ),
    all_on_global_change: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_ALL_ON_GLOBAL_CHANGE,
      true,
    ),
    include_untracked: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_UNTRACKED,
      true,
    ),
    include_staged: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_STAGED,
      true,
    ),
    include_deleted: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_DELETED,
      true,
    ),
    include_pages: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_PAGES,
      true,
    ),
    include_workers: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_WORKERS,
      true,
    ),
    include_unknown: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_INCLUDE_UNKNOWN,
      true,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_ALLOW_SECRET_PATHS,
      false,
    ),
    fail_if_none: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_FAIL_IF_NONE,
      false,
    ),
    fail_if_no_matrix: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_FAIL_IF_NO_MATRIX,
      false,
    ),

    max_changed_files: normalizeInteger(
      process.env.CLOUDFLARE_TARGETS_MAX_CHANGED_FILES,
      1000,
    ),
    max_targets: normalizeInteger(
      process.env.CLOUDFLARE_TARGETS_MAX_TARGETS,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.CLOUDFLARE_TARGETS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CLOUDFLARE_TARGETS_STEP_SUMMARY,
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

    if (arg === "--include-pages") {
      args.include_pages = true;
      continue;
    }

    if (arg === "--no-pages") {
      args.include_pages = false;
      continue;
    }

    if (arg === "--include-workers") {
      args.include_workers = true;
      continue;
    }

    if (arg === "--no-workers") {
      args.include_workers = false;
      continue;
    }

    if (arg === "--include-unknown") {
      args.include_unknown = true;
      continue;
    }

    if (arg === "--no-unknown") {
      args.include_unknown = false;
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
Aerealith AI Cloudflare Target Detector

Usage:
  node .github/scripts/ci/detect-cloudflare-targets.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --base <sha|ref>                 Base commit/ref.
      --head <sha|ref>                 Head commit/ref.
      --base-ref <branch>              Base branch name. Default: main.
      --head-ref <branch>              Head branch name.
      --root <path,list>               Search roots. Default: apps,libs,packages,services,workers,.
  -i, --include <path|glob>            Additional config path/glob to include.
  -x, --exclude <pattern>              Exclude path pattern.
      --environment <list>             Matrix environments. Default: preview,production.
      --changed-only                   Emit matrix only for changed targets.
      --all-targets                    Emit matrix for all detected targets. Default.
      --all-on-global-change           Treat global CI/config changes as all targets affected. Default.
      --no-all-on-global-change        Do not expand global changes to all targets.
      --include-pages / --no-pages     Include or exclude Pages targets.
      --include-workers / --no-workers Include or exclude Worker targets.
      --include-unknown / --no-unknown Include or exclude unknown Cloudflare targets.
      --allow-secret-paths             Allow config paths that look secret-like.
      --max-changed-files <number>     Maximum changed files to report. 0 means unlimited.
      --max-targets <number>           Maximum targets to emit. 0 means unlimited.
      --fail-if-none                   Exit non-zero when no Cloudflare targets are found.
      --fail-if-no-matrix              Exit non-zero when deployment matrix is empty.
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

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
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

function collectConfigFilesForSpec(spec, repoRoot, allFiles, args) {
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
    return walkFiles(absolutePath, repoRoot, args).filter((filePath) =>
      CONFIG_FILENAMES.has(path.basename(filePath)),
    );
  }

  return [];
}

function collectWranglerConfigFiles(args, repoRoot) {
  const allFiles = collectRepositoryFiles(repoRoot, args);
  const configs = allFiles.filter((filePath) =>
    CONFIG_FILENAMES.has(path.basename(filePath)),
  );

  for (const spec of args.include) {
    configs.push(...collectConfigFilesForSpec(spec, repoRoot, allFiles, args));
  }

  return [...new Set(configs)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;

    if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index).trim();
    }
  }

  return line.trim();
}

function parseTomlValue(value) {
  const source = String(value || "").trim();

  if (source === "true") return true;
  if (source === "false") return false;

  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }

  if (source.startsWith("[") && source.endsWith("]")) {
    const inner = source.slice(1, -1).trim();

    if (!inner) return [];

    return splitTomlArray(inner).map(parseTomlValue);
  }

  if (/^-?\d+(\.\d+)?$/.test(source)) {
    return Number(source);
  }

  return source;
}

function splitTomlArray(value) {
  const items = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let bracketDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;
    if (char === "[" && !inSingle && !inDouble) bracketDepth += 1;
    if (char === "]" && !inSingle && !inDouble) bracketDepth -= 1;

    if (char === "," && !inSingle && !inDouble && bracketDepth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());

  return items;
}

function ensureObjectAtPath(root, parts) {
  let cursor = root;

  for (const part of parts) {
    if (
      !cursor[part] ||
      typeof cursor[part] !== "object" ||
      Array.isArray(cursor[part])
    ) {
      cursor[part] = {};
    }

    cursor = cursor[part];
  }

  return cursor;
}

function ensureArrayTable(root, parts) {
  const parent = ensureObjectAtPath(root, parts.slice(0, -1));
  const key = parts[parts.length - 1];

  if (!Array.isArray(parent[key])) {
    parent[key] = [];
  }

  const item = {};
  parent[key].push(item);

  return item;
}

function parseToml(text) {
  const root = {};
  let current = root;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = stripTomlComment(rawLine);

    if (!line) continue;

    const arrayTable = line.match(/^\s*\[\[\s*([^\]]+?)\s*\]\]\s*$/);

    if (arrayTable) {
      current = ensureArrayTable(
        root,
        arrayTable[1]
          .split(".")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      continue;
    }

    const table = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*$/);

    if (table) {
      current = ensureObjectAtPath(
        root,
        table[1]
          .split(".")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    if (!key) continue;

    current[key] = parseTomlValue(value);
  }

  return root;
}

function readConfigFile(filePath, repoRoot) {
  const relativePath = toRelativePath(filePath, repoRoot);
  const extension = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");

  try {
    if (extension === ".json" || extension === ".jsonc") {
      return {
        ok: true,
        file: relativePath,
        format: extension.slice(1),
        config: safeJsonParse(stripJsonc(raw), {}),
        error: "",
      };
    }

    if (extension === ".toml") {
      return {
        ok: true,
        file: relativePath,
        format: "toml",
        config: parseToml(raw),
        error: "",
      };
    }
  } catch (err) {
    return {
      ok: false,
      file: relativePath,
      format: extension.replace(/^\./, "") || "unknown",
      config: {},
      error: logger.formatError(err),
    };
  }

  return {
    ok: false,
    file: relativePath,
    format: "unknown",
    config: {},
    error: `Unsupported config extension: ${extension}`,
  };
}

function readJsonFile(filePath, fallback = null) {
  if (!isFile(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function nearestPackageJson(rootPath, repoRoot) {
  let current = resolvePath(rootPath, repoRoot);

  while (
    current &&
    current.startsWith(repoRoot) &&
    current !== path.dirname(current)
  ) {
    const candidate = path.join(current, "package.json");

    if (isFile(candidate)) {
      return candidate;
    }

    if (current === repoRoot) break;

    current = path.dirname(current);
  }

  return null;
}

function safeId(value) {
  return (
    normalizeString(value, "cloudflare-target")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "cloudflare-target"
  );
}

function arrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function objectKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value);
}

function envConfigs(config) {
  if (
    !config.env ||
    typeof config.env !== "object" ||
    Array.isArray(config.env)
  )
    return {};
  return config.env;
}

function collectBindingArray(config, key) {
  const values = [];

  values.push(...arrayValue(config[key]));

  for (const envConfig of Object.values(envConfigs(config))) {
    values.push(...arrayValue(envConfig?.[key]));
  }

  return values.filter(Boolean);
}

function collectNestedQueueBindings(config) {
  const producers = [];
  const consumers = [];

  const configs = [
    config,
    ...Object.values(envConfigs(config)).filter(Boolean),
  ];

  for (const item of configs) {
    producers.push(...arrayValue(item?.queues?.producers));
    consumers.push(...arrayValue(item?.queues?.consumers));
    producers.push(...arrayValue(item?.queue_producers));
    consumers.push(...arrayValue(item?.queue_consumers));
  }

  return {
    producers,
    consumers,
  };
}

function collectDurableObjectBindings(config) {
  const bindings = [];
  const configs = [
    config,
    ...Object.values(envConfigs(config)).filter(Boolean),
  ];

  for (const item of configs) {
    bindings.push(...arrayValue(item?.durable_objects?.bindings));
    bindings.push(...arrayValue(item?.durable_object_namespaces));
  }

  return bindings;
}

function bindingName(
  binding,
  keys = [
    "binding",
    "name",
    "namespace_name",
    "bucket_name",
    "database_name",
    "queue",
  ],
) {
  if (!binding) return "";
  if (typeof binding === "string") return binding;

  for (const key of keys) {
    if (binding[key]) return String(binding[key]);
  }

  return "";
}

function summarizeBindings(config) {
  const d1 = collectBindingArray(config, "d1_databases");
  const kv = collectBindingArray(config, "kv_namespaces");
  const r2 = collectBindingArray(config, "r2_buckets");
  const services = collectBindingArray(config, "services");
  const vectorize = collectBindingArray(config, "vectorize");
  const analyticsEngine = collectBindingArray(
    config,
    "analytics_engine_datasets",
  );
  const hyperdrive = collectBindingArray(config, "hyperdrive");
  const queues = collectNestedQueueBindings(config);
  const durableObjects = collectDurableObjectBindings(config);

  return {
    d1_databases: d1.map((item) => ({
      binding: bindingName(item, [
        "binding",
        "database_name",
        "database_id",
        "name",
      ]),
      database_name:
        typeof item === "object"
          ? normalizeString(item.database_name || item.name)
          : "",
      has_database_id: Boolean(typeof item === "object" && item.database_id),
    })),
    kv_namespaces: kv.map((item) => ({
      binding: bindingName(item, ["binding", "id", "preview_id", "name"]),
      has_id: Boolean(typeof item === "object" && item.id),
      has_preview_id: Boolean(typeof item === "object" && item.preview_id),
    })),
    r2_buckets: r2.map((item) => ({
      binding: bindingName(item, ["binding", "bucket_name", "name"]),
      bucket_name:
        typeof item === "object"
          ? normalizeString(item.bucket_name || item.name)
          : "",
    })),
    queues: {
      producers: queues.producers.map((item) => ({
        binding: bindingName(item, ["binding", "queue", "name"]),
        queue:
          typeof item === "object"
            ? normalizeString(item.queue || item.name)
            : "",
      })),
      consumers: queues.consumers.map((item) => ({
        queue: bindingName(item, ["queue", "binding", "name"]),
      })),
    },
    durable_objects: durableObjects.map((item) => ({
      binding: bindingName(item, ["name", "binding", "class_name"]),
      class_name:
        typeof item === "object" ? normalizeString(item.class_name) : "",
    })),
    services: services.map((item) => ({
      binding: bindingName(item, ["binding", "service", "name"]),
      service:
        typeof item === "object"
          ? normalizeString(item.service || item.name)
          : "",
    })),
    vectorize: vectorize.map((item) => ({
      binding: bindingName(item, ["binding", "index_name", "name"]),
      index_name:
        typeof item === "object"
          ? normalizeString(item.index_name || item.name)
          : "",
    })),
    analytics_engine_datasets: analyticsEngine.map((item) => ({
      binding: bindingName(item, ["binding", "dataset", "name"]),
      dataset:
        typeof item === "object"
          ? normalizeString(item.dataset || item.name)
          : "",
    })),
    hyperdrive: hyperdrive.map((item) => ({
      binding: bindingName(item, ["binding", "id", "name"]),
      has_id: Boolean(typeof item === "object" && item.id),
    })),
  };
}

function hasPagesSignal(config, packageJson) {
  const scriptsText = JSON.stringify(packageJson?.scripts || {}).toLowerCase();

  return Boolean(
    config.pages_build_output_dir ||
    config.site?.bucket ||
    config.assets?.directory ||
    config.pages_project_name ||
    scriptsText.includes("wrangler pages") ||
    scriptsText.includes("pages deploy"),
  );
}

function hasWorkerSignal(config, packageJson) {
  const scriptsText = JSON.stringify(packageJson?.scripts || {}).toLowerCase();

  return Boolean(
    config.main ||
    config.name ||
    config.route ||
    config.routes ||
    config.triggers ||
    scriptsText.includes("wrangler deploy") ||
    scriptsText.includes("wrangler dev"),
  );
}

function inferTargetTypes(config, packageJson) {
  const types = [];

  if (hasPagesSignal(config, packageJson)) types.push("pages");
  if (hasWorkerSignal(config, packageJson)) types.push("worker");

  return [...new Set(types)];
}

function inferPrimaryType(types) {
  if (types.includes("worker")) return "worker";
  if (types.includes("pages")) return "pages";
  return "unknown";
}

function targetAllowed(target, args) {
  if (target.primary_type === "pages" && !args.include_pages) return false;
  if (target.primary_type === "worker" && !args.include_workers) return false;
  if (target.primary_type === "unknown" && !args.include_unknown) return false;
  return true;
}

function collectRoutes(config) {
  const routes = [];

  routes.push(...arrayValue(config.route));
  routes.push(...arrayValue(config.routes));

  for (const envConfig of Object.values(envConfigs(config))) {
    routes.push(...arrayValue(envConfig?.route));
    routes.push(...arrayValue(envConfig?.routes));
  }

  return routes
    .map((route) => {
      if (typeof route === "string") return route;
      if (route?.pattern) return route.pattern;
      return JSON.stringify(route);
    })
    .filter(Boolean);
}

function collectCompatibilityFlags(config) {
  const flags = [];

  flags.push(...arrayValue(config.compatibility_flags));

  for (const envConfig of Object.values(envConfigs(config))) {
    flags.push(...arrayValue(envConfig?.compatibility_flags));
  }

  return [...new Set(flags.map(String).filter(Boolean))];
}

function packageManagerCommand(packageJsonPath, repoRoot) {
  if (!packageJsonPath) return "";

  const relative = toRelativePath(packageJsonPath, repoRoot);
  const directory = toPosixPath(path.dirname(relative));

  if (directory === ".") return "pnpm";

  return `pnpm --dir ${directory}`;
}

function createTarget(configFile, repoRoot) {
  const read = readConfigFile(configFile, repoRoot);
  const root = toPosixPath(path.dirname(read.file));
  const packageJsonPath = nearestPackageJson(
    path.dirname(configFile),
    repoRoot,
  );
  const packageJson = packageJsonPath ? readJsonFile(packageJsonPath, {}) : {};
  const config = read.config || {};
  const packageName = normalizeString(packageJson?.name);
  const targetName = normalizeString(
    config.name ||
      config.pages_project_name ||
      packageName ||
      path.basename(root),
  );
  const targetTypes = inferTargetTypes(config, packageJson);
  const primaryType = inferPrimaryType(targetTypes);
  const environments = [
    ...new Set(["default", ...objectKeys(envConfigs(config))]),
  ];
  const bindings = summarizeBindings(config);

  return {
    id: safeId(`${primaryType}-${targetName}-${root}`),
    name: targetName,
    primary_type: primaryType,
    target_types: targetTypes.length ? targetTypes : ["unknown"],
    root,
    config_file: read.file,
    config_format: read.format,
    config_valid: read.ok,
    config_error: read.error,
    package_json: packageJsonPath
      ? toRelativePath(packageJsonPath, repoRoot)
      : null,
    package_name: packageName || null,
    package_manager_command: packageManagerCommand(packageJsonPath, repoRoot),
    wrangler_name: normalizeString(config.name),
    pages_project_name_present: Boolean(config.pages_project_name),
    main: normalizeString(config.main),
    pages_build_output_dir: normalizeString(
      config.pages_build_output_dir ||
        config.site?.bucket ||
        config.assets?.directory,
    ),
    assets_directory: normalizeString(
      config.assets?.directory || config.site?.bucket,
    ),
    compatibility_date: normalizeString(config.compatibility_date),
    compatibility_flags: collectCompatibilityFlags(config),
    account_id_present: Boolean(config.account_id),
    workers_dev:
      config.workers_dev === undefined ? null : Boolean(config.workers_dev),
    routes: collectRoutes(config),
    environments,
    bindings,
    resource_counts: {
      d1_databases: bindings.d1_databases.length,
      kv_namespaces: bindings.kv_namespaces.length,
      r2_buckets: bindings.r2_buckets.length,
      queue_producers: bindings.queues.producers.length,
      queue_consumers: bindings.queues.consumers.length,
      durable_objects: bindings.durable_objects.length,
      services: bindings.services.length,
      vectorize: bindings.vectorize.length,
      analytics_engine_datasets: bindings.analytics_engine_datasets.length,
      hyperdrive: bindings.hyperdrive.length,
    },
    scripts: Object.fromEntries(
      Object.entries(packageJson?.scripts || {}).filter(([name, value]) => {
        const text = `${name} ${value}`.toLowerCase();
        return (
          text.includes("wrangler") ||
          text.includes("cloudflare") ||
          text.includes("cf:")
        );
      }),
    ),
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

  if (normalized === target.config_file || normalized === target.package_json)
    return true;
  if (!root) return false;

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
        ? "Global CI or Cloudflare configuration changed."
        : changedForTarget.length
          ? "Changed files are under the target root or target config."
          : "No changed files matched this target.",
      changed_files: changedForTarget,
      changed_file_count: changedForTarget.length,
      global_changes: allAffectedByGlobal ? globalChanges : [],
    };
  });
}

function dedupeTargets(targets) {
  const seen = new Map();

  for (const target of targets) {
    const key = `${target.config_file}:${target.primary_type}:${target.name}`;

    if (!seen.has(key)) {
      seen.set(key, target);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...target,
      target_types: [
        ...new Set([
          ...(existing.target_types || []),
          ...(target.target_types || []),
        ]),
      ],
      environments: [
        ...new Set([
          ...(existing.environments || []),
          ...(target.environments || []),
        ]),
      ],
    });
  }

  return [...seen.values()].sort(
    (left, right) =>
      left.root.localeCompare(right.root) ||
      left.name.localeCompare(right.name),
  );
}

function matrixEnvironmentsForTarget(target, args) {
  const configEnvs = new Set(target.environments || []);
  const requested = args.environments.length
    ? args.environments
    : DEFAULT_ENVIRONMENTS;

  return requested.map((environment) => {
    const normalized = environment.toLowerCase();

    return {
      environment: normalized,
      wrangler_environment: configEnvs.has(normalized)
        ? normalized
        : normalized === "production"
          ? ""
          : normalized,
      has_config_environment: configEnvs.has(normalized),
    };
  });
}

function createDeploymentMatrix(targets, args) {
  const selectedTargets = (
    args.changed_only ? targets.filter((target) => target.affected) : targets
  )
    .filter((target) => targetAllowed(target, args))
    .slice(0, args.max_targets > 0 ? args.max_targets : undefined);

  const matrix = [];

  for (const target of selectedTargets) {
    for (const environment of matrixEnvironmentsForTarget(target, args)) {
      matrix.push({
        id: target.id,
        name: target.name,
        type: target.primary_type,
        target_types: target.target_types,
        root: target.root,
        config_file: target.config_file,
        package_json: target.package_json,
        package_name: target.package_name,
        package_manager_command: target.package_manager_command,
        environment: environment.environment,
        wrangler_environment: environment.wrangler_environment,
        has_config_environment: environment.has_config_environment,
        affected: target.affected,
        main: target.main,
        pages_build_output_dir: target.pages_build_output_dir,
        compatibility_date: target.compatibility_date,
        d1_databases: target.resource_counts.d1_databases,
        kv_namespaces: target.resource_counts.kv_namespaces,
        r2_buckets: target.resource_counts.r2_buckets,
        queue_producers: target.resource_counts.queue_producers,
        queue_consumers: target.resource_counts.queue_consumers,
        durable_objects: target.resource_counts.durable_objects,
      });
    }
  }

  return matrix;
}

function groupTargets(targets) {
  const groups = {};

  for (const target of targets) {
    const group = target.primary_type || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        affected: 0,
        targets: [],
      };
    }

    groups[group].count += 1;
    if (target.affected) groups[group].affected += 1;
    groups[group].targets.push(target.name);
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

  if (normalized.startsWith(".github/")) return "github";
  if (normalized.includes("wrangler.")) return "wrangler";
  if (normalized.startsWith("apps/")) return "apps";
  if (normalized.startsWith("libs/")) return "libs";
  if (normalized.startsWith("packages/")) return "packages";
  if (normalized.startsWith("services/")) return "services";
  if (normalized.startsWith("workers/")) return "workers";
  if (
    normalized === "package.json" ||
    normalized === "pnpm-lock.yaml" ||
    normalized === "pnpm-workspace.yaml"
  )
    return "workspace";

  return "other";
}

function createDetection(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const range = resolveRange(args, repoRoot, git);
  const changedFiles = getChangedFiles(range, repoRoot, args);
  const configFiles = collectWranglerConfigFiles(args, repoRoot);

  const rawTargets = configFiles.map((configFile) =>
    createTarget(configFile, repoRoot),
  );
  const detectedTargets = dedupeTargets(rawTargets).filter((target) =>
    targetAllowed(target, args),
  );
  const targets = applyChangeDetection(detectedTargets, changedFiles, args);
  const deploymentMatrix = createDeploymentMatrix(targets, args);

  const affectedTargets = targets.filter((target) => target.affected);
  const invalidConfigs = targets.filter((target) => !target.config_valid);

  return {
    schema_version: 1,
    type: "cloudflare-targets",
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
      include_pages: args.include_pages,
      include_workers: args.include_workers,
      include_unknown: args.include_unknown,
      allow_secret_paths: args.allow_secret_paths,
      max_changed_files: args.max_changed_files,
      max_targets: args.max_targets,
    },
    totals: {
      config_files: configFiles.length,
      targets: targets.length,
      affected_targets: affectedTargets.length,
      changed_files: changedFiles.length,
      global_changes: changedFiles.filter((file) => isGlobalChange(file.path))
        .length,
      invalid_configs: invalidConfigs.length,
      deployment_matrix_entries: deploymentMatrix.length,
      pages: targets.filter((target) => target.primary_type === "pages").length,
      workers: targets.filter((target) => target.primary_type === "worker")
        .length,
      unknown: targets.filter((target) => target.primary_type === "unknown")
        .length,
      d1_databases: targets.reduce(
        (sum, target) => sum + target.resource_counts.d1_databases,
        0,
      ),
      kv_namespaces: targets.reduce(
        (sum, target) => sum + target.resource_counts.kv_namespaces,
        0,
      ),
      r2_buckets: targets.reduce(
        (sum, target) => sum + target.resource_counts.r2_buckets,
        0,
      ),
      queue_producers: targets.reduce(
        (sum, target) => sum + target.resource_counts.queue_producers,
        0,
      ),
      queue_consumers: targets.reduce(
        (sum, target) => sum + target.resource_counts.queue_consumers,
        0,
      ),
      durable_objects: targets.reduce(
        (sum, target) => sum + target.resource_counts.durable_objects,
        0,
      ),
    },
    changed_files: changedFiles,
    changed_file_groups: summarizeChangedFiles(changedFiles),
    config_files: configFiles.map((configFile) =>
      toRelativePath(configFile, repoRoot),
    ),
    invalid_configs: invalidConfigs.map((target) => ({
      target: target.name,
      config_file: target.config_file,
      error: target.config_error,
    })),
    targets,
    target_names: targets.map((target) => target.name),
    affected_targets: affectedTargets,
    affected_target_names: affectedTargets.map((target) => target.name),
    target_groups: groupTargets(targets),
    deployment_matrix: deploymentMatrix,
    deployment_matrix_json: JSON.stringify(deploymentMatrix),
    preview_matrix: deploymentMatrix.filter(
      (item) => item.environment === "preview",
    ),
    production_matrix: deploymentMatrix.filter(
      (item) => item.environment === "production",
    ),
    status: targets.length ? "detected" : "none",
  };
}

function truncate(value, maxLength = 90) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function createMarkdownSummary(result) {
  const lines = [
    `# ☁️ ${PROJECT_NAME} Cloudflare Targets`,
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
    `- Wrangler configs: \`${result.totals.config_files}\``,
    `- Targets: \`${result.totals.targets}\``,
    `- Affected targets: \`${result.totals.affected_targets}\``,
    `- Deployment matrix entries: \`${result.totals.deployment_matrix_entries}\``,
    `- Changed files: \`${result.totals.changed_files}\``,
    `- Global changes: \`${result.totals.global_changes}\``,
    `- Invalid configs: \`${result.totals.invalid_configs}\``,
    `- Workers: \`${result.totals.workers}\``,
    `- Pages: \`${result.totals.pages}\``,
    `- Unknown: \`${result.totals.unknown}\``,
    "",
    "## 🔌 Bindings",
    "",
    `- D1 databases: \`${result.totals.d1_databases}\``,
    `- KV namespaces: \`${result.totals.kv_namespaces}\``,
    `- R2 buckets: \`${result.totals.r2_buckets}\``,
    `- Queue producers: \`${result.totals.queue_producers}\``,
    `- Queue consumers: \`${result.totals.queue_consumers}\``,
    `- Durable Objects: \`${result.totals.durable_objects}\``,
    "",
  ];

  if (Object.keys(result.target_groups).length) {
    lines.push("## 🗂️ Target Groups");
    lines.push("");
    lines.push("| Type | Count | Affected | Targets |");
    lines.push("|---|---:|---:|---|");

    for (const [type, group] of Object.entries(result.target_groups)) {
      lines.push(
        `| \`${type}\` | \`${group.count}\` | \`${group.affected}\` | ${group.targets.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🎯 Targets");
  lines.push("");

  if (!result.targets.length) {
    lines.push("No Cloudflare targets were detected.");
  } else {
    lines.push("| Target | Type | Root | Config | Affected | Resources |");
    lines.push("|---|---|---|---|---:|---|");

    for (const target of result.targets) {
      const resources =
        [
          target.resource_counts.d1_databases
            ? `D1:${target.resource_counts.d1_databases}`
            : "",
          target.resource_counts.kv_namespaces
            ? `KV:${target.resource_counts.kv_namespaces}`
            : "",
          target.resource_counts.r2_buckets
            ? `R2:${target.resource_counts.r2_buckets}`
            : "",
          target.resource_counts.queue_producers
            ? `QP:${target.resource_counts.queue_producers}`
            : "",
          target.resource_counts.queue_consumers
            ? `QC:${target.resource_counts.queue_consumers}`
            : "",
          target.resource_counts.durable_objects
            ? `DO:${target.resource_counts.durable_objects}`
            : "",
        ]
          .filter(Boolean)
          .join(", ") || "none";

      lines.push(
        `| \`${target.name}\` | \`${target.primary_type}\` | \`${target.root}\` | \`${target.config_file}\` | \`${target.affected ? "true" : "false"}\` | ${resources} |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🚀 Deployment Matrix");
  lines.push("");

  if (!result.deployment_matrix.length) {
    lines.push("No deployment matrix entries were generated.");
  } else {
    lines.push("| Target | Type | Environment | Root | Config Env |");
    lines.push("|---|---|---|---|---|");

    for (const item of result.deployment_matrix.slice(0, 200)) {
      lines.push(
        `| \`${item.name}\` | \`${item.type}\` | \`${item.environment}\` | \`${item.root}\` | \`${item.wrangler_environment || "default"}\` |`,
      );
    }

    if (result.deployment_matrix.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ${result.deployment_matrix.length - 200} additional matrix entrie(s) omitted. |`,
      );
    }
  }

  if (result.invalid_configs.length) {
    lines.push("");
    lines.push("## ⚠️ Invalid Configs");
    lines.push("");
    lines.push("| Target | Config | Error |");
    lines.push("|---|---|---|");

    for (const item of result.invalid_configs) {
      lines.push(
        `| \`${item.target}\` | \`${item.config_file}\` | ${item.error} |`,
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
  setGitHubOutput("cloudflare_targets_file", result.config.output_file);
  setGitHubOutput(
    "cloudflare_targets_summary_file",
    result.config.summary_file || "",
  );
  setGitHubOutput("cloudflare_targets_status", result.status);
  setGitHubOutput("cloudflare_targets_count", String(result.totals.targets));
  setGitHubOutput(
    "cloudflare_affected_targets_count",
    String(result.totals.affected_targets),
  );
  setGitHubOutput(
    "cloudflare_deployment_matrix_count",
    String(result.totals.deployment_matrix_entries),
  );
  setGitHubOutput("cloudflare_target_names", result.target_names.join(","));
  setGitHubOutput(
    "cloudflare_target_names_json",
    JSON.stringify(result.target_names),
  );
  setGitHubOutput(
    "cloudflare_affected_target_names",
    result.affected_target_names.join(","),
  );
  setGitHubOutput(
    "cloudflare_affected_target_names_json",
    JSON.stringify(result.affected_target_names),
  );
  setGitHubOutput(
    "cloudflare_deployment_matrix_json",
    JSON.stringify(result.deployment_matrix),
  );
  setGitHubOutput(
    "cloudflare_preview_matrix_json",
    JSON.stringify(result.preview_matrix),
  );
  setGitHubOutput(
    "cloudflare_production_matrix_json",
    JSON.stringify(result.production_matrix),
  );
  setGitHubOutput("cloudflare_workers_count", String(result.totals.workers));
  setGitHubOutput("cloudflare_pages_count", String(result.totals.pages));
  setGitHubOutput("cloudflare_d1_count", String(result.totals.d1_databases));
  setGitHubOutput("cloudflare_kv_count", String(result.totals.kv_namespaces));
  setGitHubOutput("cloudflare_r2_count", String(result.totals.r2_buckets));
  setGitHubOutput(
    "cloudflare_queues_count",
    String(result.totals.queue_producers + result.totals.queue_consumers),
  );
  setGitHubOutput(
    "cloudflare_durable_objects_count",
    String(result.totals.durable_objects),
  );
  setGitHubOutput(
    "cloudflare_changed_files_count",
    String(result.totals.changed_files),
  );
  setGitHubOutput(
    "cloudflare_global_changes_count",
    String(result.totals.global_changes),
  );
  setGitHubOutput(
    "cloudflare_invalid_configs_count",
    String(result.totals.invalid_configs),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Detecting Cloudflare targets.");

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

  if (args.fail_if_none && result.totals.targets === 0) {
    logger.error("No Cloudflare targets were detected.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_no_matrix && result.totals.deployment_matrix_entries === 0) {
    logger.error("No Cloudflare deployment matrix entries were generated.");
    process.exitCode = 1;
  }
}

main();
