#!/usr/bin/env node
// .github/scripts/ci/detect-dockerfiles.js
// =============================================================================
// Aerealith AI — CI Dockerfile Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Discover Dockerfiles, Docker Compose build services, Docker build contexts,
//   image names, build metadata, affected container targets, and CI build matrix
//   entries for Docker / OCI image workflows.
//
// Output:
//   - artifacts/ci/dockerfiles.json
//   - artifacts/ci/dockerfiles.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not build images.
//   - Does not push images.
//   - Does not mutate GitHub or registries.
//   - Supports Dockerfile, Dockerfile.*, docker-compose.yml, compose.yml,
//     docker-compose.yaml, compose.yaml, and JSON compose-style files.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[dockerfiles] ${message}`),
    warn: (message) => console.warn(`[dockerfiles] WARN: ${message}`),
    error: (message) => console.error(`[dockerfiles] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/dockerfiles.md";

const DEFAULT_SEARCH_ROOTS = [
  "apps",
  "libs",
  "packages",
  "services",
  "workers",
  "docker",
  ".",
];

const DEFAULT_ENVIRONMENTS = ["ci"];
const DEFAULT_PLATFORMS = ["linux/amd64"];

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
  ".dockerignore",
  ".github/repo-management/dependency-rules.yaml",
  ".github/scripts/utils/docker.js",
  ".github/scripts/ci/detect-dockerfiles.js",
]);

const GLOBAL_CHANGE_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/scripts/docker/",
];

const COMPOSE_FILENAMES = new Set([
  "compose.yml",
  "compose.yaml",
  "compose.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker-compose.json",
]);

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
  const defaultImageNamespace = createDefaultImageNamespace(
    process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    process.env.DOCKER_REGISTRY || "ghcr.io",
  );

  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    base:
      process.env.DOCKERFILES_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.NX_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.DOCKERFILES_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.NX_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",
    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    head_ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",

    search_roots: normalizeStringList(process.env.DOCKERFILES_SEARCH_ROOTS),
    include: normalizeStringList(process.env.DOCKERFILES_INCLUDE),
    exclude: normalizeStringList(process.env.DOCKERFILES_EXCLUDE),
    environments: normalizeStringList(process.env.DOCKERFILES_ENVIRONMENTS),
    platforms: normalizeStringList(
      process.env.DOCKERFILES_PLATFORMS || process.env.DOCKER_PLATFORMS,
    ),

    registry: process.env.DOCKER_REGISTRY || "ghcr.io",
    image_namespace:
      process.env.DOCKER_IMAGE_NAMESPACE || defaultImageNamespace,

    output_file: process.env.DOCKERFILES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.DOCKERFILES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    changed_only: normalizeBoolean(process.env.DOCKERFILES_CHANGED_ONLY, false),
    all_on_global_change: normalizeBoolean(
      process.env.DOCKERFILES_ALL_ON_GLOBAL_CHANGE,
      true,
    ),
    include_untracked: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_UNTRACKED,
      true,
    ),
    include_staged: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_STAGED,
      true,
    ),
    include_deleted: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_DELETED,
      true,
    ),

    include_dockerfiles: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_DOCKERFILES,
      true,
    ),
    include_compose: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_COMPOSE,
      true,
    ),
    include_root_dockerfile: normalizeBoolean(
      process.env.DOCKERFILES_INCLUDE_ROOT_DOCKERFILE,
      true,
    ),

    allow_secret_paths: normalizeBoolean(
      process.env.DOCKERFILES_ALLOW_SECRET_PATHS,
      false,
    ),
    fail_if_none: normalizeBoolean(process.env.DOCKERFILES_FAIL_IF_NONE, false),
    fail_if_no_matrix: normalizeBoolean(
      process.env.DOCKERFILES_FAIL_IF_NO_MATRIX,
      false,
    ),
    fail_on_invalid_compose: normalizeBoolean(
      process.env.DOCKERFILES_FAIL_ON_INVALID_COMPOSE,
      false,
    ),

    max_changed_files: normalizeInteger(
      process.env.DOCKERFILES_MAX_CHANGED_FILES,
      1000,
    ),
    max_targets: normalizeInteger(process.env.DOCKERFILES_MAX_TARGETS, 0),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.DOCKERFILES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.DOCKERFILES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.DOCKERFILES_STEP_SUMMARY,
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

    if (arg === "--platform" || arg === "--platforms") {
      args.platforms.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--registry") {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--image-namespace") {
      args.image_namespace = argv[index + 1];
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

    if (arg === "--include-dockerfiles") {
      args.include_dockerfiles = true;
      continue;
    }

    if (arg === "--no-dockerfiles") {
      args.include_dockerfiles = false;
      continue;
    }

    if (arg === "--include-compose") {
      args.include_compose = true;
      continue;
    }

    if (arg === "--no-compose") {
      args.include_compose = false;
      continue;
    }

    if (arg === "--include-root-dockerfile") {
      args.include_root_dockerfile = true;
      continue;
    }

    if (arg === "--no-root-dockerfile") {
      args.include_root_dockerfile = false;
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

    if (arg === "--fail-on-invalid-compose") {
      args.fail_on_invalid_compose = true;
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

  if (!args.platforms.length) {
    args.platforms = [...DEFAULT_PLATFORMS];
  }

  args.search_roots = [...new Set(args.search_roots.map(toPosixPath))];
  args.environments = [
    ...new Set(args.environments.map((item) => item.toLowerCase())),
  ];
  args.platforms = [
    ...new Set(args.platforms.map((item) => item.toLowerCase())),
  ];
  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.max_changed_files = Math.max(0, args.max_changed_files);
  args.max_targets = Math.max(0, args.max_targets);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Dockerfile Detector

Usage:
  node .github/scripts/ci/detect-dockerfiles.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --base <sha|ref>                 Base commit/ref.
      --head <sha|ref>                 Head commit/ref.
      --base-ref <branch>              Base branch name. Default: main.
      --head-ref <branch>              Head branch name.
      --root <path,list>               Search roots. Default: apps,libs,packages,services,workers,docker,.
  -i, --include <path|glob>            Additional Dockerfile/Compose path/glob to include.
  -x, --exclude <pattern>              Exclude path pattern.
      --environment <list>             Matrix environments. Default: ci.
      --platform <list>                Docker platforms. Default: linux/amd64.
      --registry <registry>            Registry hostname. Default: ghcr.io.
      --image-namespace <namespace>    Image namespace. Default: ghcr.io/<owner>/<repo>.
      --changed-only                   Emit build matrix only for affected targets.
      --all-targets                    Emit build matrix for all targets. Default.
      --all-on-global-change           Treat global CI/Docker changes as all targets affected. Default.
      --no-all-on-global-change        Do not expand global changes to all targets.
      --include-dockerfiles            Include Dockerfile targets. Default.
      --no-dockerfiles                 Skip Dockerfile targets.
      --include-compose                Include Docker Compose metadata. Default.
      --no-compose                     Skip Docker Compose metadata.
      --allow-secret-paths             Allow paths that look secret-like.
      --max-changed-files <number>     Maximum changed files to report. 0 means unlimited.
      --max-targets <number>           Maximum targets to emit. 0 means unlimited.
      --fail-if-none                   Exit non-zero when no Dockerfiles are found.
      --fail-if-no-matrix              Exit non-zero when build matrix is empty.
      --fail-on-invalid-compose        Exit non-zero when Compose files cannot be parsed.
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

function isDockerfileName(fileName) {
  return fileName === "Dockerfile" || /^Dockerfile[._-].+/i.test(fileName);
}

function isComposeFileName(fileName) {
  if (COMPOSE_FILENAMES.has(fileName)) return true;

  return (
    /^docker-compose\.[^.]+\.(ya?ml|json)$/i.test(fileName) ||
    /^compose\.[^.]+\.(ya?ml|json)$/i.test(fileName)
  );
}

function collectFilesForSpec(spec, repoRoot, allFiles, args, predicate) {
  const normalizedSpec = toPosixPath(spec);

  if (!normalizedSpec) return [];

  if (hasGlob(normalizedSpec)) {
    const regex = globToRegExp(normalizedSpec);

    return allFiles.filter((filePath) => {
      const relativePath = toRelativePath(filePath, repoRoot);
      return (
        regex.test(relativePath) &&
        !shouldExcludePath(relativePath, args) &&
        predicate(filePath)
      );
    });
  }

  const absolutePath = resolvePath(normalizedSpec, repoRoot);

  if (isFile(absolutePath)) {
    const relativePath = toRelativePath(absolutePath, repoRoot);
    return shouldExcludePath(relativePath, args) || !predicate(absolutePath)
      ? []
      : [absolutePath];
  }

  if (isDirectory(absolutePath)) {
    return walkFiles(absolutePath, repoRoot, args).filter(predicate);
  }

  return [];
}

function collectDockerfiles(args, repoRoot) {
  if (!args.include_dockerfiles) return [];

  const allFiles = collectRepositoryFiles(repoRoot, args);
  const files = allFiles.filter((filePath) => {
    const relativePath = toRelativePath(filePath, repoRoot);

    if (!args.include_root_dockerfile && relativePath === "Dockerfile")
      return false;

    return isDockerfileName(path.basename(filePath));
  });

  for (const spec of args.include) {
    files.push(
      ...collectFilesForSpec(spec, repoRoot, allFiles, args, (filePath) =>
        isDockerfileName(path.basename(filePath)),
      ),
    );
  }

  return [...new Set(files)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function collectComposeFiles(args, repoRoot) {
  if (!args.include_compose) return [];

  const allFiles = collectRepositoryFiles(repoRoot, args);
  const files = allFiles.filter((filePath) =>
    isComposeFileName(path.basename(filePath)),
  );

  for (const spec of args.include) {
    files.push(
      ...collectFilesForSpec(spec, repoRoot, allFiles, args, (filePath) =>
        isComposeFileName(path.basename(filePath)),
      ),
    );
  }

  return [...new Set(files)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
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

function nearestPackageJson(startPath, repoRoot) {
  let current = resolvePath(startPath, repoRoot);

  while (
    current &&
    current.startsWith(repoRoot) &&
    current !== path.dirname(current)
  ) {
    const candidate = path.join(current, "package.json");

    if (isFile(candidate)) return candidate;

    if (current === repoRoot) break;

    current = path.dirname(current);
  }

  return null;
}

function nearestDockerignore(startPath, repoRoot) {
  let current = resolvePath(startPath, repoRoot);

  while (
    current &&
    current.startsWith(repoRoot) &&
    current !== path.dirname(current)
  ) {
    const candidate = path.join(current, ".dockerignore");

    if (isFile(candidate)) return candidate;

    if (current === repoRoot) break;

    current = path.dirname(current);
  }

  return null;
}

function logicalDockerfileLines(text) {
  const lines = [];
  let current = "";

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.endsWith("\\")) {
      current += `${line.slice(0, -1)} `;
      continue;
    }

    current += line;
    lines.push(current);
    current = "";
  }

  if (current.trim()) lines.push(current);

  return lines;
}

function parseFromInstruction(value) {
  const source = normalizeString(value);
  const parts = source.split(/\s+/);
  const filtered = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.startsWith("--")) {
      if (!part.includes("=")) index += 1;
      continue;
    }

    filtered.push(part);
  }

  const asIndex = filtered.findIndex((part) => part.toLowerCase() === "as");
  const image =
    asIndex === -1 ? filtered[0] : filtered.slice(0, asIndex).join(" ");
  const stage = asIndex === -1 ? "" : filtered[asIndex + 1] || "";

  return {
    image: image || "",
    stage,
  };
}

function parseKeyValue(value) {
  const source = normalizeString(value);
  const equalsIndex = source.indexOf("=");

  if (equalsIndex === -1) {
    return {
      name: source,
      value: "",
    };
  }

  return {
    name: source.slice(0, equalsIndex).trim(),
    value: source.slice(equalsIndex + 1).trim(),
  };
}

function detectPackageManagers(text) {
  const source = String(text || "").toLowerCase();
  const managers = [];

  if (/\bpnpm\b/.test(source)) managers.push("pnpm");
  if (/\bnpm\b/.test(source)) managers.push("npm");
  if (/\byarn\b/.test(source)) managers.push("yarn");
  if (/\bbun\b/.test(source)) managers.push("bun");
  if (/\bpip\b|requirements\.txt|pyproject\.toml|poetry\b/.test(source))
    managers.push("python");
  if (/\bgo\s+(mod|build|test|install)\b|go\.mod/.test(source))
    managers.push("go");
  if (/\bcargo\b|Cargo\.toml/.test(source)) managers.push("rust");
  if (/\bdotnet\b|\.csproj\b/.test(source)) managers.push("dotnet");
  if (/\bmvn\b|pom\.xml/.test(source)) managers.push("maven");
  if (/\bgradle\b|build\.gradle/.test(source)) managers.push("gradle");

  return [...new Set(managers)];
}

function inferRuntime(baseImages, packageManagers) {
  const joined = [...baseImages, ...packageManagers].join(" ").toLowerCase();

  if (/node|pnpm|npm|yarn|bun/.test(joined)) return "node";
  if (/python|pip|poetry/.test(joined)) return "python";
  if (/golang|\bgo\b/.test(joined)) return "go";
  if (/rust|cargo/.test(joined)) return "rust";
  if (/dotnet|aspnet|mcr\.microsoft\.com/.test(joined)) return "dotnet";
  if (/nginx/.test(joined)) return "nginx";
  if (/httpd|apache/.test(joined)) return "apache";
  if (/java|openjdk|eclipse-temurin|maven|gradle/.test(joined)) return "java";
  if (/alpine/.test(joined)) return "alpine";
  if (/ubuntu|debian/.test(joined)) return "linux";

  return "unknown";
}

function parseDockerfile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = logicalDockerfileLines(raw);
  const baseImages = [];
  const stages = [];
  const args = [];
  const env = [];
  const exposes = [];

  let syntax = "";
  let workdir = "";
  let user = "";
  let entrypoint = "";
  let cmd = "";
  let healthcheck = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith("#")) {
      const syntaxMatch = trimmed.match(/^#\s*syntax\s*=\s*(.+)$/i);
      if (syntaxMatch) syntax = syntaxMatch[1].trim();
      continue;
    }

    const match = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);

    if (!match) continue;

    const instruction = match[1].toUpperCase();
    const value = match[2].trim();

    if (instruction === "FROM") {
      const parsed = parseFromInstruction(value);

      if (parsed.image) baseImages.push(parsed.image);

      stages.push({
        index: stages.length,
        image: parsed.image,
        stage: parsed.stage,
      });
      continue;
    }

    if (instruction === "ARG") {
      args.push(parseKeyValue(value));
      continue;
    }

    if (instruction === "ENV") {
      env.push(value);
      continue;
    }

    if (instruction === "EXPOSE") {
      exposes.push(...value.split(/\s+/).filter(Boolean));
      continue;
    }

    if (instruction === "WORKDIR") {
      workdir = value;
      continue;
    }

    if (instruction === "USER") {
      user = value;
      continue;
    }

    if (instruction === "ENTRYPOINT") {
      entrypoint = value;
      continue;
    }

    if (instruction === "CMD") {
      cmd = value;
      continue;
    }

    if (instruction === "HEALTHCHECK") {
      healthcheck = true;
    }
  }

  const packageManagers = detectPackageManagers(raw);

  return {
    syntax,
    stages,
    base_images: [...new Set(baseImages)],
    final_base_image: baseImages[baseImages.length - 1] || "",
    build_args: args,
    env,
    exposed_ports: [...new Set(exposes)],
    workdir,
    user,
    entrypoint,
    cmd,
    healthcheck,
    package_managers: packageManagers,
    runtime: inferRuntime(baseImages, packageManagers),
    multi_stage: stages.length > 1,
  };
}

function dockerfileVariantName(fileName) {
  if (fileName === "Dockerfile") return "";

  return fileName
    .replace(/^Dockerfile[._-]?/i, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeId(value) {
  return (
    normalizeString(value, "docker-target")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "docker-target"
  );
}

function safeImageSegment(value) {
  return (
    normalizeString(value, "image")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "image"
  );
}

function createDefaultImageNamespace(repository, registry) {
  const [owner, repo] = normalizeString(repository, DEFAULT_REPOSITORY).split(
    "/",
  );

  if (!owner || !repo) {
    return `${normalizeString(registry, "ghcr.io")}/aerealith-ai`;
  }

  return `${normalizeString(registry, "ghcr.io")}/${safeImageSegment(owner)}/${safeImageSegment(repo)}`;
}

function inferTargetName(dockerfilePath, repoRoot) {
  const relativePath = toRelativePath(dockerfilePath, repoRoot);
  const directory = toPosixPath(path.dirname(relativePath));
  const fileName = path.basename(dockerfilePath);
  const variant = dockerfileVariantName(fileName);
  const packageJsonPath = nearestPackageJson(
    path.dirname(dockerfilePath),
    repoRoot,
  );
  const packageJson = packageJsonPath ? readJsonFile(packageJsonPath, {}) : {};
  const packageName = normalizeString(packageJson?.name);
  const directoryName =
    directory === "." ? path.basename(repoRoot) : path.basename(directory);
  const baseName = packageName || directoryName || "image";

  return variant ? `${baseName}-${variant}` : baseName;
}

function imageRepositoryFor(target, args) {
  const namespace = normalizeString(
    args.image_namespace,
    createDefaultImageNamespace(args.repository, args.registry),
  ).replace(/\/$/, "");

  return `${namespace}/${safeImageSegment(target.name)}`;
}

function createDockerfileTarget(filePath, repoRoot, args) {
  const relativePath = toRelativePath(filePath, repoRoot);
  const contextRoot = toPosixPath(path.dirname(relativePath));
  const packageJsonPath = nearestPackageJson(path.dirname(filePath), repoRoot);
  const packageJson = packageJsonPath ? readJsonFile(packageJsonPath, {}) : {};
  const dockerignorePath = nearestDockerignore(
    path.dirname(filePath),
    repoRoot,
  );
  const parsed = parseDockerfile(filePath);
  const name = inferTargetName(filePath, repoRoot);

  const target = {
    id: safeId(`dockerfile-${name}-${relativePath}`),
    name,
    type: "dockerfile",
    root: contextRoot,
    context: contextRoot,
    dockerfile: relativePath,
    dockerfile_name: path.basename(filePath),
    dockerignore: dockerignorePath
      ? toRelativePath(dockerignorePath, repoRoot)
      : null,
    package_json: packageJsonPath
      ? toRelativePath(packageJsonPath, repoRoot)
      : null,
    package_name: normalizeString(packageJson?.name) || null,
    image_repository: "",
    runtime: parsed.runtime,
    syntax: parsed.syntax,
    base_images: parsed.base_images,
    final_base_image: parsed.final_base_image,
    stages: parsed.stages,
    multi_stage: parsed.multi_stage,
    build_args: parsed.build_args,
    env: parsed.env,
    exposed_ports: parsed.exposed_ports,
    workdir: parsed.workdir,
    user: parsed.user,
    entrypoint: parsed.entrypoint,
    cmd: parsed.cmd,
    healthcheck: parsed.healthcheck,
    package_managers: parsed.package_managers,
    scripts: Object.fromEntries(
      Object.entries(packageJson?.scripts || {}).filter(
        ([scriptName, scriptValue]) => {
          const text = `${scriptName} ${scriptValue}`.toLowerCase();
          return (
            text.includes("docker") ||
            text.includes("container") ||
            text.includes("oci")
          );
        },
      ),
    ),
    compose_services: [],
    affected: false,
    affected_reason: "",
    changed_files: [],
    changed_file_count: 0,
    global_changes: [],
  };

  target.image_repository = imageRepositoryFor(target, args);

  return target;
}

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
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

function indentOf(line) {
  const match = String(line || "").match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function parseYamlScalar(value) {
  const source = normalizeString(value);

  if (!source) return "";
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;

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

  if (/^-?\d+(\.\d+)?$/.test(source)) {
    return Number(source);
  }

  return source;
}

function parseComposeYaml(text) {
  const services = [];
  const lines = String(text || "").split(/\r?\n/);

  let inServices = false;
  let servicesIndent = 0;
  let current = null;
  let currentBuild = false;
  let buildIndent = 0;
  let listTarget = null;

  for (const rawLine of lines) {
    const cleanLine = stripYamlComment(rawLine);

    if (!cleanLine.trim()) continue;

    const indent = indentOf(cleanLine);
    const trimmed = cleanLine.trim();

    if (/^services:\s*$/.test(trimmed)) {
      inServices = true;
      servicesIndent = indent;
      current = null;
      continue;
    }

    if (!inServices) continue;

    if (indent <= servicesIndent && !/^services:\s*$/.test(trimmed)) {
      inServices = false;
      current = null;
      continue;
    }

    const serviceMatch = trimmed.match(/^([A-Za-z0-9_.-]+):\s*$/);

    if (serviceMatch && indent > servicesIndent) {
      current = {
        name: serviceMatch[1],
        image: "",
        build: null,
        context: "",
        dockerfile: "",
        target: "",
        platforms: [],
        args: [],
        raw: {},
        indent,
      };

      services.push(current);
      currentBuild = false;
      listTarget = null;
      continue;
    }

    if (!current) continue;

    if (indent <= current.indent) {
      currentBuild = false;
      listTarget = null;
      continue;
    }

    const listMatch = trimmed.match(/^-\s*(.+)$/);

    if (listMatch && listTarget) {
      listTarget.push(parseYamlScalar(listMatch[1]));
      continue;
    }

    const keyValue = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);

    if (!keyValue) continue;

    const key = keyValue[1];
    const value = keyValue[2] || "";

    if (currentBuild && indent <= buildIndent) {
      currentBuild = false;
    }

    if (key === "image") {
      current.image = String(parseYamlScalar(value) || "");
      listTarget = null;
      continue;
    }

    if (key === "build") {
      currentBuild = true;
      buildIndent = indent;
      listTarget = null;

      if (value) {
        const scalar = parseYamlScalar(value);

        if (typeof scalar === "string") {
          current.build = {
            context: scalar,
          };
          current.context = scalar;
        }
      } else {
        current.build = {};
      }

      continue;
    }

    if (key === "platform") {
      current.platforms = [String(parseYamlScalar(value) || "")].filter(
        Boolean,
      );
      listTarget = null;
      continue;
    }

    if (key === "platforms") {
      const parsed = parseYamlScalar(value);

      current.platforms = Array.isArray(parsed) ? parsed.map(String) : [];
      listTarget = value ? null : current.platforms;
      continue;
    }

    if (currentBuild && current.build) {
      if (key === "context") {
        current.context = String(parseYamlScalar(value) || "");
        current.build.context = current.context;
        continue;
      }

      if (key === "dockerfile") {
        current.dockerfile = String(parseYamlScalar(value) || "");
        current.build.dockerfile = current.dockerfile;
        continue;
      }

      if (key === "target") {
        current.target = String(parseYamlScalar(value) || "");
        current.build.target = current.target;
        continue;
      }

      if (key === "args") {
        current.args = [];
        listTarget = value ? null : current.args;
        continue;
      }
    }
  }

  return services.map(({ indent, ...service }) => service);
}

function normalizeComposeJsonServices(parsed) {
  const services =
    parsed?.services && typeof parsed.services === "object"
      ? parsed.services
      : {};

  return Object.entries(services).map(([name, service]) => {
    const build = service?.build || null;

    if (typeof build === "string") {
      return {
        name,
        image: normalizeString(service.image),
        build: {
          context: build,
        },
        context: build,
        dockerfile: "",
        target: "",
        platforms: Array.isArray(service.platforms)
          ? service.platforms
          : service.platform
            ? [service.platform]
            : [],
        args: [],
        raw: service,
      };
    }

    return {
      name,
      image: normalizeString(service?.image),
      build,
      context: normalizeString(build?.context),
      dockerfile: normalizeString(build?.dockerfile),
      target: normalizeString(build?.target),
      platforms: Array.isArray(build?.platforms)
        ? build.platforms
        : Array.isArray(service?.platforms)
          ? service.platforms
          : service?.platform
            ? [service.platform]
            : [],
      args: Array.isArray(build?.args) ? build.args : [],
      raw: service,
    };
  });
}

function readComposeFile(filePath, repoRoot) {
  const relativePath = toRelativePath(filePath, repoRoot);
  const raw = fs.readFileSync(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();

  try {
    const services =
      extension === ".json"
        ? normalizeComposeJsonServices(safeJsonParse(stripJsonc(raw), {}))
        : parseComposeYaml(raw);

    return {
      file: relativePath,
      valid: true,
      error: "",
      services,
    };
  } catch (err) {
    return {
      file: relativePath,
      valid: false,
      error: logger.formatError(err),
      services: [],
    };
  }
}

function resolveComposeDockerfile(service, composeFile, repoRoot) {
  const composeDir = path.dirname(resolvePath(composeFile, repoRoot));
  const context = normalizeString(
    service.context || service.build?.context || ".",
  );
  const dockerfile = normalizeString(
    service.dockerfile || service.build?.dockerfile || "Dockerfile",
  );

  const contextPath = path.isAbsolute(context)
    ? context
    : path.resolve(composeDir, context);

  const dockerfilePath = path.isAbsolute(dockerfile)
    ? dockerfile
    : path.resolve(contextPath, dockerfile);

  return {
    context: toRelativePath(contextPath, repoRoot),
    dockerfile: toRelativePath(dockerfilePath, repoRoot),
  };
}

function collectComposeServices(composeFiles, repoRoot) {
  const composeResults = composeFiles.map((filePath) =>
    readComposeFile(filePath, repoRoot),
  );
  const services = [];

  for (const compose of composeResults) {
    for (const service of compose.services) {
      const resolved = service.build
        ? resolveComposeDockerfile(service, compose.file, repoRoot)
        : null;

      services.push({
        id: safeId(`compose-${service.name}-${compose.file}`),
        name: service.name,
        compose_file: compose.file,
        compose_valid: compose.valid,
        compose_error: compose.error,
        image: service.image || "",
        has_build: Boolean(service.build),
        context: resolved?.context || "",
        dockerfile: resolved?.dockerfile || "",
        build_target: service.target || "",
        platforms: service.platforms || [],
        args: service.args || [],
      });
    }
  }

  return {
    compose_files: composeResults,
    services,
  };
}

function linkComposeServices(targets, composeServices) {
  const targetByDockerfile = new Map(
    targets.map((target) => [target.dockerfile, target]),
  );

  for (const service of composeServices) {
    if (!service.dockerfile) continue;

    const target = targetByDockerfile.get(service.dockerfile);

    if (!target) continue;

    target.compose_services.push({
      id: service.id,
      name: service.name,
      compose_file: service.compose_file,
      image: service.image,
      build_target: service.build_target,
      platforms: service.platforms,
    });

    if (service.image && !target.compose_image) {
      target.compose_image = service.image;
    }
  }

  return targets;
}

function isGlobalChange(filePath) {
  const normalized = toPosixPath(filePath);

  if (GLOBAL_CHANGE_FILES.has(normalized)) return true;

  return GLOBAL_CHANGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function fileAffectsTarget(filePath, target) {
  const normalized = toPosixPath(filePath);
  const root = target.context === "." ? "" : toPosixPath(target.context);

  if (normalized === target.dockerfile) return true;
  if (normalized === target.package_json) return true;
  if (normalized === target.dockerignore) return true;
  if (
    target.compose_services.some(
      (service) => normalized === service.compose_file,
    )
  )
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
        ? "Global CI, Docker, or workflow configuration changed."
        : changedForTarget.length
          ? "Changed files matched this Docker build context, Dockerfile, package, .dockerignore, or Compose file."
          : "No changed files matched this Docker target.",
      changed_files: changedForTarget,
      changed_file_count: changedForTarget.length,
      global_changes: allAffectedByGlobal ? globalChanges : [],
    };
  });
}

function dedupeTargets(targets) {
  const seen = new Map();

  for (const target of targets) {
    const key = target.dockerfile;

    if (!seen.has(key)) {
      seen.set(key, target);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...target,
      compose_services: [
        ...existing.compose_services,
        ...target.compose_services,
      ],
      base_images: [
        ...new Set([
          ...(existing.base_images || []),
          ...(target.base_images || []),
        ]),
      ],
      package_managers: [
        ...new Set([
          ...(existing.package_managers || []),
          ...(target.package_managers || []),
        ]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) =>
    left.dockerfile.localeCompare(right.dockerfile),
  );
}

function createTag(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createImageTags(target, environment, git) {
  const tags = [];
  const branch = createTag(git.branch || git.ref_name || DEFAULT_BRANCH);
  const shortSha = createTag(git.short_sha || "");

  if (environment === "production" || environment === "release") {
    tags.push("latest");
  }

  if (environment && environment !== "ci") {
    tags.push(environment);
  }

  if (branch) {
    tags.push(branch);
  }

  if (shortSha) {
    tags.push(shortSha);
    tags.push(`${branch || "sha"}-${shortSha}`);
  }

  tags.push(`${createTag(target.name)}-${shortSha || "local"}`);

  return [...new Set(tags.filter(Boolean))];
}

function createBuildMatrix(targets, args, git) {
  const selectedTargets = (
    args.changed_only ? targets.filter((target) => target.affected) : targets
  ).slice(0, args.max_targets > 0 ? args.max_targets : undefined);

  const matrix = [];

  for (const target of selectedTargets) {
    for (const environment of args.environments) {
      matrix.push({
        id: target.id,
        name: target.name,
        type: target.type,
        runtime: target.runtime,
        context: target.context,
        dockerfile: target.dockerfile,
        dockerignore: target.dockerignore,
        image_repository: target.image_repository,
        tags: createImageTags(target, environment, git),
        tags_csv: createImageTags(target, environment, git).join(","),
        environment,
        platforms: args.platforms,
        platforms_csv: args.platforms.join(","),
        build_args: target.build_args.map((item) => item.name).filter(Boolean),
        package_name: target.package_name,
        multi_stage: target.multi_stage,
        affected: target.affected,
        compose_services: target.compose_services.map(
          (service) => service.name,
        ),
      });
    }
  }

  return matrix;
}

function groupTargets(targets) {
  const groups = {};

  for (const target of targets) {
    const group = target.runtime || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        affected: 0,
        dockerfiles: [],
      };
    }

    groups[group].count += 1;
    if (target.affected) groups[group].affected += 1;
    groups[group].dockerfiles.push(target.dockerfile);
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
  if (isDockerfileName(basename)) return "dockerfile";
  if (isComposeFileName(basename)) return "compose";
  if (basename === ".dockerignore") return "dockerignore";
  if (normalized.startsWith("apps/")) return "apps";
  if (normalized.startsWith("libs/")) return "libs";
  if (normalized.startsWith("packages/")) return "packages";
  if (normalized.startsWith("services/")) return "services";
  if (normalized.startsWith("workers/")) return "workers";
  if (normalized.startsWith("docker/")) return "docker";
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
  const dockerfileFiles = collectDockerfiles(args, repoRoot);
  const composeFiles = collectComposeFiles(args, repoRoot);

  const dockerfileTargets = dockerfileFiles.map((filePath) =>
    createDockerfileTarget(filePath, repoRoot, args),
  );
  const compose = collectComposeServices(composeFiles, repoRoot);

  const linkedTargets = linkComposeServices(
    dedupeTargets(dockerfileTargets),
    compose.services,
  );
  const targets = applyChangeDetection(linkedTargets, changedFiles, args);
  const affectedTargets = targets.filter((target) => target.affected);
  const buildMatrix = createBuildMatrix(targets, args, git);

  const invalidComposeFiles = compose.compose_files.filter(
    (item) => !item.valid,
  );

  return {
    schema_version: 1,
    type: "dockerfiles",
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
      platforms: args.platforms,
      registry: args.registry,
      image_namespace: args.image_namespace,
      changed_only: args.changed_only,
      all_on_global_change: args.all_on_global_change,
      include_dockerfiles: args.include_dockerfiles,
      include_compose: args.include_compose,
      allow_secret_paths: args.allow_secret_paths,
      max_changed_files: args.max_changed_files,
      max_targets: args.max_targets,
    },
    totals: {
      dockerfiles: dockerfileFiles.length,
      compose_files: composeFiles.length,
      compose_services: compose.services.length,
      invalid_compose_files: invalidComposeFiles.length,
      targets: targets.length,
      affected_targets: affectedTargets.length,
      changed_files: changedFiles.length,
      global_changes: changedFiles.filter((file) => isGlobalChange(file.path))
        .length,
      build_matrix_entries: buildMatrix.length,
      multi_stage: targets.filter((target) => target.multi_stage).length,
      with_healthcheck: targets.filter((target) => target.healthcheck).length,
      with_compose_services: targets.filter(
        (target) => target.compose_services.length > 0,
      ).length,
    },
    changed_files: changedFiles,
    changed_file_groups: summarizeChangedFiles(changedFiles),
    dockerfiles: dockerfileFiles.map((filePath) =>
      toRelativePath(filePath, repoRoot),
    ),
    compose_files: compose.compose_files,
    invalid_compose_files: invalidComposeFiles.map((item) => ({
      file: item.file,
      error: item.error,
    })),
    compose_services: compose.services,
    targets,
    target_names: targets.map((target) => target.name),
    affected_targets: affectedTargets,
    affected_target_names: affectedTargets.map((target) => target.name),
    target_groups: groupTargets(targets),
    build_matrix: buildMatrix,
    build_matrix_json: JSON.stringify(buildMatrix),
    affected_build_matrix: buildMatrix.filter((item) => item.affected),
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
    `# 🐳 ${PROJECT_NAME} Dockerfiles`,
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
    `- Image namespace: \`${result.config.image_namespace}\``,
    `- Platforms: \`${result.config.platforms.join(", ")}\``,
    `- Status: \`${result.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- Dockerfiles: \`${result.totals.dockerfiles}\``,
    `- Compose files: \`${result.totals.compose_files}\``,
    `- Compose services: \`${result.totals.compose_services}\``,
    `- Invalid Compose files: \`${result.totals.invalid_compose_files}\``,
    `- Targets: \`${result.totals.targets}\``,
    `- Affected targets: \`${result.totals.affected_targets}\``,
    `- Build matrix entries: \`${result.totals.build_matrix_entries}\``,
    `- Changed files: \`${result.totals.changed_files}\``,
    `- Global changes: \`${result.totals.global_changes}\``,
    `- Multi-stage Dockerfiles: \`${result.totals.multi_stage}\``,
    `- Healthchecks: \`${result.totals.with_healthcheck}\``,
    "",
  ];

  if (Object.keys(result.target_groups).length) {
    lines.push("## 🗂️ Target Groups");
    lines.push("");
    lines.push("| Runtime | Count | Affected | Dockerfiles |");
    lines.push("|---|---:|---:|---|");

    for (const [runtime, group] of Object.entries(result.target_groups)) {
      lines.push(
        `| \`${runtime}\` | \`${group.count}\` | \`${group.affected}\` | ${group.dockerfiles.map((item) => `\`${item}\``).join(", ")} |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🎯 Docker Targets");
  lines.push("");

  if (!result.targets.length) {
    lines.push("No Dockerfile targets were detected.");
  } else {
    lines.push(
      "| Target | Runtime | Context | Dockerfile | Affected | Image |",
    );
    lines.push("|---|---|---|---|---:|---|");

    for (const target of result.targets) {
      lines.push(
        `| \`${target.name}\` | \`${target.runtime}\` | \`${target.context}\` | \`${target.dockerfile}\` | \`${target.affected ? "true" : "false"}\` | \`${target.image_repository}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🚀 Build Matrix");
  lines.push("");

  if (!result.build_matrix.length) {
    lines.push("No Docker build matrix entries were generated.");
  } else {
    lines.push("| Target | Environment | Dockerfile | Platforms | Tags |");
    lines.push("|---|---|---|---|---|");

    for (const item of result.build_matrix.slice(0, 200)) {
      lines.push(
        `| \`${item.name}\` | \`${item.environment}\` | \`${item.dockerfile}\` | \`${item.platforms_csv}\` | \`${truncate(item.tags_csv, 80)}\` |`,
      );
    }

    if (result.build_matrix.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ${result.build_matrix.length - 200} additional matrix entrie(s) omitted. |`,
      );
    }
  }

  if (result.compose_services.length) {
    lines.push("");
    lines.push("## 🧩 Compose Services");
    lines.push("");
    lines.push("| Service | Compose File | Build | Dockerfile | Image |");
    lines.push("|---|---|---:|---|---|");

    for (const service of result.compose_services.slice(0, 100)) {
      lines.push(
        `| \`${service.name}\` | \`${service.compose_file}\` | \`${service.has_build ? "true" : "false"}\` | \`${service.dockerfile || "none"}\` | \`${service.image || "none"}\` |`,
      );
    }
  }

  if (result.invalid_compose_files.length) {
    lines.push("");
    lines.push("## ⚠️ Invalid Compose Files");
    lines.push("");
    lines.push("| File | Error |");
    lines.push("|---|---|");

    for (const item of result.invalid_compose_files) {
      lines.push(`| \`${item.file}\` | ${item.error} |`);
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
  setGitHubOutput("dockerfiles_file", result.config.output_file);
  setGitHubOutput("dockerfiles_summary_file", result.config.summary_file || "");
  setGitHubOutput("dockerfiles_status", result.status);
  setGitHubOutput("dockerfiles_count", String(result.totals.dockerfiles));
  setGitHubOutput("docker_targets_count", String(result.totals.targets));
  setGitHubOutput(
    "docker_affected_targets_count",
    String(result.totals.affected_targets),
  );
  setGitHubOutput(
    "docker_build_matrix_count",
    String(result.totals.build_matrix_entries),
  );
  setGitHubOutput("docker_target_names", result.target_names.join(","));
  setGitHubOutput(
    "docker_target_names_json",
    JSON.stringify(result.target_names),
  );
  setGitHubOutput(
    "docker_affected_target_names",
    result.affected_target_names.join(","),
  );
  setGitHubOutput(
    "docker_affected_target_names_json",
    JSON.stringify(result.affected_target_names),
  );
  setGitHubOutput(
    "docker_build_matrix_json",
    JSON.stringify(result.build_matrix),
  );
  setGitHubOutput(
    "docker_affected_build_matrix_json",
    JSON.stringify(result.affected_build_matrix),
  );
  setGitHubOutput(
    "docker_compose_files_count",
    String(result.totals.compose_files),
  );
  setGitHubOutput(
    "docker_compose_services_count",
    String(result.totals.compose_services),
  );
  setGitHubOutput(
    "docker_invalid_compose_files_count",
    String(result.totals.invalid_compose_files),
  );
  setGitHubOutput(
    "docker_changed_files_count",
    String(result.totals.changed_files),
  );
  setGitHubOutput(
    "docker_global_changes_count",
    String(result.totals.global_changes),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Detecting Dockerfiles.");

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

  if (args.fail_if_none && result.totals.targets === 0) {
    logger.error("No Dockerfile targets were detected.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_no_matrix && result.totals.build_matrix_entries === 0) {
    logger.error("No Docker build matrix entries were generated.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_invalid_compose && result.totals.invalid_compose_files > 0) {
    logger.error(
      `Detected ${result.totals.invalid_compose_files} invalid Compose file(s).`,
    );
    process.exitCode = 1;
  }
}

main();
