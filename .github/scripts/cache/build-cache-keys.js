#!/usr/bin/env node
// .github/scripts/cache/build-cache-keys.js
// =============================================================================
// Aerealith AI — Cache Key Builder
// -----------------------------------------------------------------------------
// Purpose:
//   Build stable GitHub Actions cache keys for pnpm, Nx, Node builds, GitHub
//   automation, Docker, Cloudflare, security tooling, AI scripts, artifact
//   scripts, and cache scripts.
//
// Output:
//   - artifacts/cache/cache-keys.json
//   - artifacts/cache/cache-keys.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not restore or save caches by itself.
//   - Produces GitHub Actions outputs for direct workflow use.
//   - Hashes file paths + file contents so cache keys change when relevant
//     configuration changes.
//   - Excludes secrets, env files, node_modules, git internals, caches, and
//     generated build output.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const os = require("node:os");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[cache-keys] ${message}`),
    warn: (message) => console.warn(`[cache-keys] WARN: ${message}`),
    error: (message) => console.error(`[cache-keys] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/cache/cache-keys.json";
const DEFAULT_SUMMARY_FILE = "artifacts/cache/cache-keys.md";

const DEFAULT_CACHE_PREFIX = "aerealith-ai";
const DEFAULT_CACHE_VERSION = "v1";
const DEFAULT_HASH_ALGORITHM = "sha256";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SUPPORTED_HASH_ALGORITHMS = new Set([
  "sha1",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
]);

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
  "*.log",
  "*.tmp",
  "*.temp",
  "*.bak",
  "*.swp",
  "*.swo",
];

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

const DEFAULT_TARGETS = [
  {
    id: "pnpm-store",
    title: "pnpm Store",
    description: "Dependency store cache for pnpm installs.",
    segment: "pnpm-store",
    paths: [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".npmrc",
      ".node-version",
      ".nvmrc",
    ],
    extra: ["node_major", "pnpm_major"],
  },
  {
    id: "node-build",
    title: "Node Build",
    description:
      "General TypeScript, Next.js, package, and workspace build cache.",
    segment: "node-build",
    paths: [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "nx.json",
      "tsconfig.json",
      "tsconfig.base.json",
      "apps/**/package.json",
      "apps/**/project.json",
      "apps/**/tsconfig*.json",
      "libs/**/package.json",
      "libs/**/project.json",
      "libs/**/tsconfig*.json",
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "postcss.config.js",
      "tailwind.config.js",
      "tailwind.config.ts",
    ],
    extra: ["node_major", "pnpm_major"],
  },
  {
    id: "nx",
    title: "Nx",
    description: "Nx project graph and affected command cache key.",
    segment: "nx",
    paths: [
      "nx.json",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      "project.json",
      "apps/**/project.json",
      "libs/**/project.json",
      "apps/**/package.json",
      "libs/**/package.json",
      "tools/**/project.json",
      ".nxignore",
    ],
    extra: ["node_major", "pnpm_major"],
  },
  {
    id: "github-actions",
    title: "GitHub Actions",
    description:
      "Workflow, action, repository management, and automation script cache key.",
    segment: "github-actions",
    paths: [
      ".github/workflows/**/*",
      ".github/actions/**/*",
      ".github/scripts/**/*.js",
      ".github/repo-management/**/*",
      ".github/ISSUE_TEMPLATE/**/*",
      ".github/labels.yaml",
      ".github/labeler.yaml",
      ".github/milestones.yaml",
      ".github/assignees.yaml",
      ".github/projects.yaml",
    ],
    extra: ["node_major"],
  },
  {
    id: "ai-scripts",
    title: "AI Scripts",
    description: "AI automation script and prompt cache key.",
    segment: "ai-scripts",
    paths: [
      ".github/scripts/ai/**/*.js",
      ".github/scripts/ai/prompts/**/*.md",
      ".github/scripts/utils/**/*.js",
      ".github/scripts/package.json",
      ".github/scripts/pnpm-lock.yaml",
      ".github/scripts/package-lock.json",
    ],
    extra: ["node_major"],
  },
  {
    id: "artifact-scripts",
    title: "Artifact Scripts",
    description: "Artifact, checksum, SBOM, and verification script cache key.",
    segment: "artifact-scripts",
    paths: [
      ".github/scripts/artifacts/**/*.js",
      ".github/scripts/utils/**/*.js",
      ".github/scripts/package.json",
      ".github/scripts/pnpm-lock.yaml",
      ".github/scripts/package-lock.json",
    ],
    extra: ["node_major"],
  },
  {
    id: "cache-scripts",
    title: "Cache Scripts",
    description: "Cache automation script cache key.",
    segment: "cache-scripts",
    paths: [
      ".github/scripts/cache/**/*.js",
      ".github/scripts/utils/**/*.js",
      ".github/scripts/package.json",
      ".github/scripts/pnpm-lock.yaml",
      ".github/scripts/package-lock.json",
    ],
    extra: ["node_major"],
  },
  {
    id: "docker",
    title: "Docker",
    description: "Dockerfile and container build configuration cache key.",
    segment: "docker",
    paths: [
      "Dockerfile",
      "Dockerfile.*",
      "**/Dockerfile",
      "**/Dockerfile.*",
      ".dockerignore",
      "docker-compose.yml",
      "docker-compose.yaml",
      "docker-compose.*.yml",
      "docker-compose.*.yaml",
      ".github/scripts/utils/docker.js",
    ],
    extra: ["os", "arch"],
  },
  {
    id: "cloudflare",
    title: "Cloudflare",
    description:
      "Cloudflare Worker, Pages, Wrangler, and deployment config cache key.",
    segment: "cloudflare",
    paths: [
      "wrangler.toml",
      "wrangler.json",
      "wrangler.jsonc",
      "**/wrangler.toml",
      "**/wrangler.json",
      "**/wrangler.jsonc",
      ".github/repo-management/cloudflare-rules.yaml",
      ".github/scripts/utils/cloudflare.js",
      ".github/scripts/utils/env.js",
    ],
    extra: ["node_major"],
  },
  {
    id: "security",
    title: "Security",
    description:
      "Security tooling, CodeQL, dependency policy, and triage cache key.",
    segment: "security",
    paths: [
      ".github/codeql.yml",
      ".github/codeql.yaml",
      ".github/dependabot.yml",
      ".github/dependabot.yaml",
      ".github/renovate.json",
      ".github/renovate.json5",
      ".github/repo-management/security-rules.yaml",
      ".github/scripts/ai/security-triage.js",
      ".github/scripts/ai/prompts/security-triage.md",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ],
    extra: ["node_major", "pnpm_major"],
  },
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

function normalizeHashAlgorithm(value) {
  const algorithm = normalizeString(
    value,
    DEFAULT_HASH_ALGORITHM,
  ).toLowerCase();

  if (SUPPORTED_HASH_ALGORITHMS.has(algorithm)) {
    return algorithm;
  }

  return DEFAULT_HASH_ALGORITHM;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      process.env.GITHUB_BASE_REF ||
      DEFAULT_BRANCH,
    cache_prefix: process.env.CACHE_KEYS_PREFIX || DEFAULT_CACHE_PREFIX,
    cache_version: process.env.CACHE_KEYS_VERSION || DEFAULT_CACHE_VERSION,
    output_file: process.env.CACHE_KEYS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.CACHE_KEYS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    targets: normalizeStringList(process.env.CACHE_KEYS_TARGETS),
    include: normalizeStringList(process.env.CACHE_KEYS_INCLUDE),
    exclude: normalizeStringList(process.env.CACHE_KEYS_EXCLUDE),
    hash_algorithm: normalizeHashAlgorithm(
      process.env.CACHE_KEYS_HASH_ALGORITHM,
    ),
    key_hash_length: normalizeInteger(process.env.CACHE_KEYS_HASH_LENGTH, 16),
    include_branch_in_key: normalizeBoolean(
      process.env.CACHE_KEYS_INCLUDE_BRANCH,
      false,
    ),
    include_ref_in_restore_keys: normalizeBoolean(
      process.env.CACHE_KEYS_INCLUDE_REF_RESTORE,
      true,
    ),
    allow_secret_paths: normalizeBoolean(
      process.env.CACHE_KEYS_ALLOW_SECRET_PATHS,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CACHE_KEYS_WRITE_SUMMARY,
      true,
    ),
    write_env: normalizeBoolean(process.env.CACHE_KEYS_WRITE_ENV, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.CACHE_KEYS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CACHE_KEYS_STEP_SUMMARY,
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

    if (arg === "--branch") {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--prefix") {
      args.cache_prefix = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cache-version") {
      args.cache_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--targets") {
      args.targets.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--algorithm") {
      args.hash_algorithm = normalizeHashAlgorithm(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--hash-length") {
      args.key_hash_length = normalizeInteger(
        argv[index + 1],
        args.key_hash_length,
      );
      index += 1;
      continue;
    }

    if (arg === "--include-branch") {
      args.include_branch_in_key = true;
      continue;
    }

    if (arg === "--no-include-branch") {
      args.include_branch_in_key = false;
      continue;
    }

    if (arg === "--include-ref-restore") {
      args.include_ref_in_restore_keys = true;
      continue;
    }

    if (arg === "--no-include-ref-restore") {
      args.include_ref_in_restore_keys = false;
      continue;
    }

    if (arg === "--allow-secret-paths") {
      args.allow_secret_paths = true;
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

    if (arg === "--write-env") {
      args.write_env = true;
      continue;
    }

    if (arg === "--no-write-env") {
      args.write_env = false;
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

  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.key_hash_length = Math.max(8, Math.min(args.key_hash_length, 64));

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Cache Key Builder

Usage:
  node .github/scripts/cache/build-cache-keys.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --branch <branch>                Branch/ref segment.
      --prefix <prefix>                Cache key prefix.
      --cache-version <version>        Cache namespace version.
      --target <list>                  Target ids to build. Comma-separated.
  -i, --include <path|glob>            Add extra hashed input path/glob.
  -x, --exclude <pattern>              Exclude path pattern.
      --algorithm <name>               Hash algorithm. Default: sha256.
      --hash-length <number>           Cache key hash length. Default: 16.
      --include-branch                 Include branch in primary key.
      --no-include-branch              Do not include branch in primary key.
      --include-ref-restore            Include branch restore keys.
      --no-include-ref-restore         Do not include branch restore keys.
      --allow-secret-paths             Allow paths that look secret-like.
  -o, --output <file>                  Cache keys JSON output file.
      --summary <file>                 Cache keys Markdown summary file.
      --no-summary                     Do not write Markdown summary.
      --write-env                      Write cache key values to GITHUB_ENV.
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

function runCommand(command, args = [], options = {}) {
  try {
    return childProcess
      .execFileSync(command, args, {
        cwd: options.cwd || process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return options.fallback ?? "";
  }
}

function runGit(args, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return runCommand("git", args, {
    cwd: repoRoot,
    fallback: options.fallback ?? "",
  });
}

function getGitMetadata(repoRoot, args) {
  return {
    repository:
      process.env.GITHUB_REPOSITORY || args.repository || DEFAULT_REPOSITORY,
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
      args.branch ||
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function hasGlob(pattern) {
  return /[*?]/.test(String(pattern || ""));
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
  return [...new Set(walkFiles(".", repoRoot, args))]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function collectFilesForPathSpec(spec, repoRoot, allFiles, args) {
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

function collectTargetFiles(target, repoRoot, allFiles, args) {
  const targetPaths = [...target.paths, ...args.include];
  const files = [];

  for (const spec of targetPaths) {
    files.push(...collectFilesForPathSpec(spec, repoRoot, allFiles, args));
  }

  return [...new Set(files)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function hashText(text, algorithm) {
  return crypto
    .createHash(algorithm)
    .update(String(text || ""))
    .digest("hex");
}

function hashFile(filePath, algorithm) {
  return crypto
    .createHash(algorithm)
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function hashTargetFiles(files, repoRoot, args, salt = "") {
  const hash = crypto.createHash(args.hash_algorithm);

  hash.update(`cache-version:${args.cache_version}\n`);
  hash.update(`salt:${salt}\n`);

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath, repoRoot);
    const fileHash = hashFile(filePath, args.hash_algorithm);

    hash.update(`${relativePath}\0${fileHash}\n`);
  }

  if (!files.length) {
    hash.update("no-files\n");
  }

  return hash.digest("hex");
}

function sanitizeKeySegment(value) {
  const normalized = normalizeString(value, "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "unknown";
}

function sanitizeOutputName(value) {
  return sanitizeKeySegment(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function getNodeVersion() {
  return (
    normalizeString(process.env.NODE_VERSION) ||
    process.version.replace(/^v/, "")
  );
}

function getNodeMajor(nodeVersion) {
  const match = normalizeString(nodeVersion).match(/^(\d+)/);
  return match ? match[1] : "unknown";
}

function getPnpmVersion(repoRoot) {
  return (
    normalizeString(process.env.PNPM_VERSION) ||
    runCommand("pnpm", ["--version"], {
      cwd: repoRoot,
      fallback: "",
    }) ||
    "unknown"
  );
}

function getPnpmMajor(pnpmVersion) {
  const match = normalizeString(pnpmVersion).match(/^(\d+)/);
  return match ? match[1] : "unknown";
}

function getRuntimeEnvironment(repoRoot) {
  const nodeVersion = getNodeVersion();
  const pnpmVersion = getPnpmVersion(repoRoot);

  return {
    runner_os: process.env.RUNNER_OS || os.platform(),
    runner_arch: process.env.RUNNER_ARCH || os.arch(),
    platform: process.platform,
    arch: process.arch,
    node_version: nodeVersion,
    node_major: getNodeMajor(nodeVersion),
    pnpm_version: pnpmVersion,
    pnpm_major: getPnpmMajor(pnpmVersion),
  };
}

function extraSegmentsForTarget(target, environment) {
  const extras = [];

  for (const item of target.extra || []) {
    if (item === "os")
      extras.push(`os-${sanitizeKeySegment(environment.runner_os)}`);
    if (item === "arch")
      extras.push(`arch-${sanitizeKeySegment(environment.runner_arch)}`);
    if (item === "node_major")
      extras.push(`node-${sanitizeKeySegment(environment.node_major)}`);
    if (item === "pnpm_major")
      extras.push(`pnpm-${sanitizeKeySegment(environment.pnpm_major)}`);
  }

  return extras;
}

function createCacheKey(target, digest, args, environment, git) {
  const segments = [
    sanitizeKeySegment(args.cache_prefix),
    sanitizeKeySegment(args.cache_version),
    sanitizeKeySegment(target.segment || target.id),
    sanitizeKeySegment(environment.runner_os),
    sanitizeKeySegment(environment.runner_arch),
    ...extraSegmentsForTarget(target, environment),
  ];

  if (args.include_branch_in_key) {
    segments.push(`ref-${sanitizeKeySegment(git.branch)}`);
  }

  segments.push(digest.slice(0, args.key_hash_length));

  return segments.filter(Boolean).join("-");
}

function createRestoreKeys(target, args, environment, git) {
  const base = [
    sanitizeKeySegment(args.cache_prefix),
    sanitizeKeySegment(args.cache_version),
    sanitizeKeySegment(target.segment || target.id),
    sanitizeKeySegment(environment.runner_os),
    sanitizeKeySegment(environment.runner_arch),
    ...extraSegmentsForTarget(target, environment),
  ].filter(Boolean);

  const restoreKeys = [];

  if (args.include_ref_in_restore_keys) {
    restoreKeys.push(
      [...base, `ref-${sanitizeKeySegment(git.branch)}`].join("-") + "-",
    );
  }

  restoreKeys.push(base.join("-") + "-");

  const withoutRuntime = [
    sanitizeKeySegment(args.cache_prefix),
    sanitizeKeySegment(args.cache_version),
    sanitizeKeySegment(target.segment || target.id),
    sanitizeKeySegment(environment.runner_os),
    sanitizeKeySegment(environment.runner_arch),
  ].filter(Boolean);

  restoreKeys.push(withoutRuntime.join("-") + "-");

  const osOnly = [
    sanitizeKeySegment(args.cache_prefix),
    sanitizeKeySegment(args.cache_version),
    sanitizeKeySegment(target.segment || target.id),
    sanitizeKeySegment(environment.runner_os),
  ].filter(Boolean);

  restoreKeys.push(osOnly.join("-") + "-");

  return [...new Set(restoreKeys)];
}

function selectTargets(args) {
  if (!args.targets.length) return DEFAULT_TARGETS;

  const requested = new Set(
    args.targets.map((target) => sanitizeKeySegment(target)),
  );

  return DEFAULT_TARGETS.filter((target) => {
    return (
      requested.has(sanitizeKeySegment(target.id)) ||
      requested.has(sanitizeKeySegment(target.segment))
    );
  });
}

function createInputRecords(files, repoRoot, args) {
  return files.map((filePath) => {
    const relativePath = toRelativePath(filePath, repoRoot);
    const stat = fs.statSync(filePath);

    return {
      path: relativePath,
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      hash: hashFile(filePath, args.hash_algorithm),
    };
  });
}

function buildTargetCache(target, repoRoot, allFiles, args, environment, git) {
  const files = collectTargetFiles(target, repoRoot, allFiles, args);
  const salt = [
    target.id,
    args.repository,
    environment.runner_os,
    environment.runner_arch,
    environment.node_major,
    environment.pnpm_major,
  ].join("|");

  const digest = hashTargetFiles(files, repoRoot, args, salt);
  const key = createCacheKey(target, digest, args, environment, git);
  const restoreKeys = createRestoreKeys(target, args, environment, git);

  return {
    id: target.id,
    title: target.title,
    description: target.description,
    key,
    restore_keys: restoreKeys,
    hash: digest,
    hash_short: digest.slice(0, args.key_hash_length),
    files_matched: files.length,
    paths: target.paths,
    inputs: createInputRecords(files, repoRoot, args),
  };
}

function buildCacheKeys(args, repoRoot) {
  const git = getGitMetadata(repoRoot, args);
  const environment = getRuntimeEnvironment(repoRoot);
  const allFiles = collectRepositoryFiles(repoRoot, args);
  const targets = selectTargets(args);

  const caches = targets.map((target) => {
    return buildTargetCache(target, repoRoot, allFiles, args, environment, git);
  });

  const byId = Object.fromEntries(caches.map((cache) => [cache.id, cache]));

  return {
    schema_version: 1,
    type: "cache-keys",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: git,
    environment,
    config: {
      cache_prefix: args.cache_prefix,
      cache_version: args.cache_version,
      hash_algorithm: args.hash_algorithm,
      key_hash_length: args.key_hash_length,
      include_branch_in_key: args.include_branch_in_key,
      include_ref_in_restore_keys: args.include_ref_in_restore_keys,
      targets: targets.map((target) => target.id),
      extra_include: args.include.map(toPosixPath),
      exclude: args.exclude.map(toPosixPath),
      allow_secret_paths: args.allow_secret_paths,
    },
    totals: {
      repository_files_scanned: allFiles.length,
      caches: caches.length,
      input_files: caches.reduce((sum, cache) => sum + cache.files_matched, 0),
    },
    caches,
    keys: byId,
  };
}

function createMarkdownSummary(result) {
  const lines = [
    `# 🧩 ${PROJECT_NAME} Cache Keys`,
    "",
    `Generated: \`${result.created_at}\``,
    "",
    "## 🧾 Context",
    "",
    `- Repository: \`${result.repository}\``,
    `- Branch: \`${result.github.branch || "unknown"}\``,
    `- Commit: \`${result.github.short_sha || result.github.sha || "unknown"}\``,
    `- Runner OS: \`${result.environment.runner_os}\``,
    `- Runner arch: \`${result.environment.runner_arch}\``,
    `- Node: \`${result.environment.node_version}\``,
    `- pnpm: \`${result.environment.pnpm_version}\``,
    `- Cache namespace: \`${result.config.cache_prefix}-${result.config.cache_version}\``,
    "",
    "## 📊 Totals",
    "",
    `- Repository files scanned: \`${result.totals.repository_files_scanned}\``,
    `- Cache targets: \`${result.totals.caches}\``,
    `- Hashed input files: \`${result.totals.input_files}\``,
    "",
    "## 🔑 Keys",
    "",
    "| Target | Files | Key |",
    "|---|---:|---|",
  ];

  for (const cache of result.caches) {
    lines.push(
      `| \`${cache.id}\` | \`${cache.files_matched}\` | \`${cache.key}\` |`,
    );
  }

  lines.push("");
  lines.push("## ♻️ Restore Keys");
  lines.push("");

  for (const cache of result.caches) {
    lines.push(`### ${cache.title}`);
    lines.push("");
    lines.push(`Primary key: \`${cache.key}\``);
    lines.push("");

    if (cache.restore_keys.length) {
      for (const restoreKey of cache.restore_keys) {
        lines.push(`- \`${restoreKey}\``);
      }
    } else {
      lines.push("- No restore keys generated.");
    }

    lines.push("");
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

function setGitHubEnv(name, value) {
  const envFile = process.env.GITHUB_ENV;

  if (!envFile) return false;

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(envFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function writeGitHubOutputs(result, args, repoRoot) {
  const outputFile = toRelativePath(
    resolvePath(args.output_file, repoRoot),
    repoRoot,
  );
  const summaryFile = args.write_summary_file
    ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
    : "";

  setGitHubOutput("cache_keys_file", outputFile);
  setGitHubOutput("cache_keys_summary_file", summaryFile);
  setGitHubOutput("cache_keys_count", String(result.totals.caches));
  setGitHubOutput("cache_keys_input_files", String(result.totals.input_files));

  for (const cache of result.caches) {
    const name = sanitizeOutputName(cache.id);

    setGitHubOutput(`cache_key_${name}`, cache.key);
    setGitHubOutput(
      `cache_restore_keys_${name}`,
      cache.restore_keys.join("\n"),
    );
    setGitHubOutput(`cache_hash_${name}`, cache.hash_short);
    setGitHubOutput(`cache_files_${name}`, String(cache.files_matched));

    if (args.write_env) {
      setGitHubEnv(`CACHE_KEY_${name.toUpperCase()}`, cache.key);
      setGitHubEnv(
        `CACHE_RESTORE_KEYS_${name.toUpperCase()}`,
        cache.restore_keys.join("\n"),
      );
      setGitHubEnv(`CACHE_HASH_${name.toUpperCase()}`, cache.hash_short);
    }
  }
}

function createStepSummary(result) {
  const lines = [
    "## 🧩 Cache Keys",
    "",
    `- Cache targets: \`${result.totals.caches}\``,
    `- Hashed input files: \`${result.totals.input_files}\``,
    `- Namespace: \`${result.config.cache_prefix}-${result.config.cache_version}\``,
    `- Hash algorithm: \`${result.config.hash_algorithm}\``,
    "",
    "| Target | Files | Key |",
    "|---|---:|---|",
  ];

  for (const cache of result.caches) {
    lines.push(
      `| \`${cache.id}\` | \`${cache.files_matched}\` | \`${cache.key}\` |`,
    );
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Building cache keys.");

  const result = buildCacheKeys(args, repoRoot);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const summary = createMarkdownSummary(result);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summary, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(result, args, repoRoot);

  if (args.write_step_summary) {
    appendGitHubStepSummary(createStepSummary(result));
  }

  if (args.print) {
    console.log(json.trim());
  }
}

main();
