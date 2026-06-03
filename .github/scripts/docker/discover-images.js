#!/usr/bin/env node
// .github/scripts/docker/discover-images.js
// =============================================================================
// Aerealith AI — Docker Image Discovery
// -----------------------------------------------------------------------------
// Purpose:
//   Discover Dockerfiles and Docker image build targets for downstream CI jobs.
//
// Input:
//   - .github/docker/images.json
//   - .github/docker/images.jsonc
//   - .github/docker/images.yaml
//   - .github/docker/images.yml
//   - docker/images.json
//   - package.json / project.json / nx.json metadata
//   - repository Dockerfiles
//
// Output:
//   - artifacts/ci/dockerfiles.json
//   - artifacts/docker/discover-images.json
//   - artifacts/docker/discover-images.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not call Docker.
//   - Produces an artifact compatible with .github/scripts/docker/build-images.js.
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
    info: (message) => console.log(`[docker-discovery] ${message}`),
    warn: (message) => console.warn(`[docker-discovery] WARN: ${message}`),
    error: (message) => console.error(`[docker-discovery] ERROR: ${message}`),
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
  ".github/docker/images.json",
  ".github/docker/images.jsonc",
  ".github/docker/images.yaml",
  ".github/docker/images.yml",
  ".github/docker/discover-images.json",
  ".github/docker/discover-images.jsonc",
  ".github/docker/discover-images.yaml",
  ".github/docker/discover-images.yml",
  "docker/images.json",
  "docker/images.jsonc",
  "docker/images.yaml",
  "docker/images.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_REPORT_FILE = "artifacts/docker/discover-images.json";
const DEFAULT_SUMMARY_FILE = "artifacts/docker/discover-images.md";

const DEFAULT_REGISTRY = "ghcr.io";
const DEFAULT_IMAGE_NAMESPACE = "sinless-games";
const DEFAULT_CONTEXT_STRATEGY = "auto";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    config_file: process.env.DOCKER_DISCOVER_IMAGES_CONFIG_FILE || "",
    output_file:
      process.env.DOCKER_DISCOVER_IMAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    report_file:
      process.env.DOCKER_DISCOVER_IMAGES_REPORT_FILE || DEFAULT_REPORT_FILE,
    summary_file:
      process.env.DOCKER_DISCOVER_IMAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    registry:
      process.env.DOCKER_DISCOVER_IMAGES_REGISTRY ||
      process.env.CONTAINER_REGISTRY ||
      DEFAULT_REGISTRY,
    namespace:
      process.env.DOCKER_DISCOVER_IMAGES_NAMESPACE ||
      process.env.DOCKER_IMAGE_NAMESPACE ||
      DEFAULT_IMAGE_NAMESPACE,

    scan_roots: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_SCAN_ROOTS,
    ),
    include: normalizeStringList(process.env.DOCKER_DISCOVER_IMAGES_INCLUDE),
    exclude_images: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_EXCLUDE_PROJECTS,
    ),
    include_paths: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_INCLUDE_PATHS,
    ),
    exclude_paths: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_EXCLUDE_PATHS,
    ),

    tags: normalizeStringList(process.env.DOCKER_DISCOVER_IMAGES_TAGS),
    platforms: normalizeStringList(
      process.env.DOCKER_DISCOVER_IMAGES_PLATFORMS,
    ),

    context_strategy:
      process.env.DOCKER_DISCOVER_IMAGES_CONTEXT_STRATEGY ||
      DEFAULT_CONTEXT_STRATEGY,

    config_only: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_CONFIG_ONLY,
      false,
    ),
    scan_repository: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_SCAN_REPOSITORY,
      true,
    ),
    include_disabled: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_INCLUDE_DISABLED,
      false,
    ),
    include_invalid: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_INCLUDE_INVALID,
      true,
    ),

    fail_if_empty: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_FAIL_ON_ERROR,
      true,
    ),

    max_images: normalizeInteger(
      process.env.DOCKER_DISCOVER_IMAGES_MAX_IMAGES,
      0,
    ),

    dry_run: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_report_file: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_WRITE_REPORT,
      true,
    ),
    write_summary_file: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.DOCKER_DISCOVER_IMAGES_STEP_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.DOCKER_DISCOVER_IMAGES_PRINT, true),
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

    if (arg === "--namespace") {
      args.namespace = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--scan-root" || arg === "--scan-roots") {
      args.scan_roots.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-image") {
      args.include.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "--exclude-image") {
      args.exclude_images.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--tag" || arg === "--tags" || arg === "-t") {
      args.tags.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--platform" || arg === "--platforms") {
      args.platforms.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--context-strategy") {
      args.context_strategy = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config-only") {
      args.config_only = true;
      args.scan_repository = false;
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

    if (arg === "--include-disabled") {
      args.include_disabled = true;
      continue;
    }

    if (arg === "--no-include-disabled") {
      args.include_disabled = false;
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

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

    if (arg === "--max-images") {
      args.max_images = normalizeInteger(argv[index + 1], args.max_images);
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
  args.namespace = normalizeImagePathPart(args.namespace);
  args.scan_roots = [
    ...new Set(args.scan_roots.length ? args.scan_roots : ["."]),
  ];
  args.include = [...new Set(args.include)];
  args.exclude_images = [...new Set(args.exclude_images)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.include_paths = [...new Set(args.include_paths)];
  args.exclude_paths = [
    ...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude_paths]),
  ];
  args.tags = [...new Set(args.tags)];
  args.platforms = [...new Set(args.platforms)];
  args.context_strategy = normalizeString(
    args.context_strategy,
    DEFAULT_CONTEXT_STRATEGY,
  ).toLowerCase();
  args.max_images = Math.max(0, args.max_images);

  if (!["auto", "repo", "dockerfile-dir"].includes(args.context_strategy)) {
    throw new Error(
      `Invalid context strategy: ${args.context_strategy}. Use auto, repo, or dockerfile-dir.`,
    );
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Docker Image Discovery

Usage:
  node .github/scripts/docker/discover-images.js [options]

Examples:
  node .github/scripts/docker/discover-images.js
  node .github/scripts/docker/discover-images.js --scan-root apps --scan-root services
  node .github/scripts/docker/discover-images.js --context-strategy repo
  node .github/scripts/docker/discover-images.js --config .github/docker/images.json

Options:
      --repo <owner/repo>              Repository slug.
      --config <file>                  Docker image discovery config.
  -o, --output <file>                  Dockerfiles artifact. Default: artifacts/ci/dockerfiles.json.
      --report <file>                  Full JSON report. Default: artifacts/docker/discover-images.json.
      --summary <file>                 Markdown summary. Default: artifacts/docker/discover-images.md.
      --registry <registry>            Default registry. Default: ghcr.io.
      --namespace <namespace>          Default namespace. Default: sinless-games.
      --scan-root <path,list>          Root path(s) to scan.
      --include <list>                 Include image names.
      --exclude <list>                 Exclude image names.
      --include-project <list>         Include project names.
      --exclude-project <list>         Exclude project names.
      --include-path <list>            Include Dockerfile path patterns.
      --exclude-path <pattern>         Exclude path pattern.
  -t, --tag <tag,list>                 Default tag(s) for discovered images.
      --platform <list>                Default platform(s).
      --context-strategy <mode>        auto, repo, or dockerfile-dir. Default: auto.
      --config-only                    Use only configured images.
      --scan-repository                Scan repository for Dockerfiles. Default.
      --no-scan-repository             Do not scan repository.
      --include-disabled               Include disabled config entries.
      --include-invalid                Include invalid entries in artifact. Default.
      --no-include-invalid             Exclude invalid entries from artifact.
      --fail-if-empty                  Exit non-zero if no images are discovered.
      --fail-on-error                  Exit non-zero on discovery errors. Default.
      --no-fail-on-error               Do not fail on discovery errors.
      --max-images <number>            Maximum images to include.
      --no-report                      Do not write full JSON report.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not write files.
      --no-print                       Do not print JSON report.
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

function parseSimpleImagesYaml(text) {
  const config = {};
  const images = [];
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

      if (section === "images" || section === "docker_images") {
        config.images = images;
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
      (section === "images" || section === "docker_images") &&
      /^-\s*/.test(trimmed)
    ) {
      current = {};
      images.push(current);

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
    return parseSimpleImagesYaml(text);
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
  if (!shouldIncludePath(relativePath, args.include_paths)) {
    if (fs.statSync(absolutePath).isFile()) return files;
  }

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

function normalizeRegistry(value) {
  return normalizeString(value, DEFAULT_REGISTRY)
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function normalizeImagePathPart(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeImageName(value) {
  return normalizeImagePathPart(value)
    .replace(/\/dockerfile$/i, "")
    .replace(/^dockerfile[.-]?/i, "")
    .replace(/\/+$/g, "");
}

function normalizeTag(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/tags\//, "")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

function safeId(value) {
  return (
    normalizeString(value, "docker-image")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "docker-image"
  );
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

function packageNameToImageName(packageName) {
  const value = normalizeString(packageName);

  if (!value) return "";

  const unscoped = value.startsWith("@")
    ? value.split("/").slice(1).join("/")
    : value;

  return normalizeImageName(unscoped);
}

function projectNameFromDockerfile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const dockerfileDir = path.dirname(absolutePath);

  const projectJsonPath = findNearestFile(
    dockerfileDir,
    repoRoot,
    "project.json",
  );

  if (projectJsonPath) {
    const projectJson = readJsonFile(projectJsonPath, repoRoot, null);

    if (projectJson?.name) return normalizeString(projectJson.name);
  }

  const packageJsonPath = findNearestFile(
    dockerfileDir,
    repoRoot,
    "package.json",
  );

  if (packageJsonPath) {
    const packageJson = readPackageJson(packageJsonPath);

    if (packageJson?.name) return normalizeString(packageJson.name);
  }

  const relativeDir = toRelativePath(dockerfileDir, repoRoot);

  if (!relativeDir || relativeDir === ".") {
    return normalizeString(path.basename(repoRoot), "root");
  }

  return normalizeString(path.basename(relativeDir), "app");
}

function imageNameFromDockerfile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const dockerfileDir = path.dirname(absolutePath);

  const packageJsonPath = findNearestFile(
    dockerfileDir,
    repoRoot,
    "package.json",
  );

  if (packageJsonPath) {
    const packageJson = readPackageJson(packageJsonPath);
    const packageImageName = packageNameToImageName(packageJson?.name);

    if (packageImageName) return packageImageName;
  }

  const relativePath = toRelativePath(absolutePath, repoRoot);
  const relativeDir = path.posix.dirname(toPosixPath(relativePath));
  const basename = path.posix.basename(relativeDir);

  if (!relativeDir || relativeDir === ".") {
    return normalizeImageName(path.basename(repoRoot));
  }

  if (basename && !["docker", "containers", ".github"].includes(basename)) {
    return normalizeImageName(basename);
  }

  const dockerfileName = path.basename(absolutePath);

  if (/^Dockerfile[.-]/.test(dockerfileName)) {
    return normalizeImageName(dockerfileName.replace(/^Dockerfile[.-]/, ""));
  }

  return normalizeImageName(basename || "app");
}

function inferContext(dockerfile, repoRoot, args, explicitContext = "") {
  if (explicitContext) return toPosixPath(explicitContext);

  const absolutePath = resolvePath(dockerfile, repoRoot);
  const dockerfileDir = path.dirname(absolutePath);
  const dockerfileDirRelative = toRelativePath(dockerfileDir, repoRoot);

  if (args.context_strategy === "repo") return ".";
  if (args.context_strategy === "dockerfile-dir") return dockerfileDirRelative;

  const rootHasMonorepoMarkers =
    isFile(resolvePath("nx.json", repoRoot)) ||
    isFile(resolvePath("pnpm-workspace.yaml", repoRoot)) ||
    isFile(resolvePath("turbo.json", repoRoot));

  const content = isFile(absolutePath)
    ? fs.readFileSync(absolutePath, "utf8")
    : "";

  const looksLikeRootContext =
    /\bpnpm-lock\.yaml\b/.test(content) ||
    /\bpnpm-workspace\.yaml\b/.test(content) ||
    /\bnx\.json\b/.test(content) ||
    /COPY\s+\.[\s/]/i.test(content) ||
    /COPY\s+package\.json/i.test(content) ||
    /RUN\s+(pnpm|npm|yarn|bun)\s+/i.test(content);

  if (rootHasMonorepoMarkers && looksLikeRootContext) {
    return ".";
  }

  return dockerfileDirRelative;
}

function parseDockerfileMetadata(dockerfilePath, repoRoot) {
  const absolutePath = resolvePath(dockerfilePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {
      base_images: [],
      stages: [],
      exposed_ports: [],
      workdirs: [],
      package_manager: "",
      uses_buildkit_secret: false,
    };
  }

  const text = fs.readFileSync(absolutePath, "utf8");
  const baseImages = [];
  const stages = [];
  const exposedPorts = [];
  const workdirs = [];

  for (const match of text.matchAll(
    /^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+([^\s]+))?/gim,
  )) {
    baseImages.push(match[1]);
    if (match[2]) stages.push(match[2]);
  }

  for (const match of text.matchAll(/^\s*EXPOSE\s+(.+)$/gim)) {
    exposedPorts.push(
      ...match[1]
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  for (const match of text.matchAll(/^\s*WORKDIR\s+(.+)$/gim)) {
    workdirs.push(match[1].trim());
  }

  let packageManager = "";

  if (/\bpnpm\b/i.test(text)) packageManager = "pnpm";
  else if (/\byarn\b/i.test(text)) packageManager = "yarn";
  else if (/\bbun\b/i.test(text)) packageManager = "bun";
  else if (/\bnpm\b/i.test(text)) packageManager = "npm";

  return {
    base_images: [...new Set(baseImages)],
    stages: [...new Set(stages)],
    exposed_ports: [...new Set(exposedPorts)],
    workdirs: [...new Set(workdirs)],
    package_manager: packageManager,
    uses_buildkit_secret: /--mount=type=secret/i.test(text),
  };
}

function defaultTags(repoRoot, providedTags = []) {
  if (providedTags.length) {
    return [...new Set(providedTags.map(normalizeTag).filter(Boolean))];
  }

  const github = getGitMetadata(repoRoot);
  const tags = [];

  if (github.short_sha) tags.push(github.short_sha);

  const branch = normalizeTag(github.branch || github.ref_name);

  if (branch && branch !== "head") tags.push(branch);

  if (
    (github.branch || github.ref_name || "").replace(/^refs\/heads\//, "") ===
    DEFAULT_BRANCH
  ) {
    tags.push("latest");
  }

  if (!tags.length) tags.push("local");

  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function createImageRefs(plan) {
  const repository = plan.image
    ? removeImageTag(plan.image)
    : [plan.registry, plan.namespace, plan.image_name]
        .filter(Boolean)
        .join("/");

  return plan.tags.map(
    (tag) => `${repository}:${normalizeTag(tag) || "latest"}`,
  );
}

function removeImageTag(image) {
  const value = normalizeString(image);

  if (!value) return "";

  const slashIndex = value.lastIndexOf("/");
  const colonIndex = value.lastIndexOf(":");

  if (colonIndex > slashIndex) {
    return value.slice(0, colonIndex);
  }

  return value;
}

function parseKeyValueList(values) {
  const result = {};

  for (const value of normalizeStringList(values)) {
    const index = value.indexOf("=");

    if (index === -1) {
      result[value] = "";
      continue;
    }

    const key = value.slice(0, index).trim();
    const itemValue = value.slice(index + 1);

    if (key) result[key] = itemValue;
  }

  return result;
}

function mergeKeyValueLists(...lists) {
  return Object.entries(Object.assign({}, ...lists.map(parseKeyValueList))).map(
    ([key, value]) => {
      return value === "" ? key : `${key}=${value}`;
    },
  );
}

function configImageRecords(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.images) ? config.images : []),
    ...(Array.isArray(config.docker_images) ? config.docker_images : []),
    ...(Array.isArray(config.dockerImages) ? config.dockerImages : []),
  ];

  if (config.image && typeof config.image === "object") {
    records.push(config.image);
  }

  if (
    !records.length &&
    (config.dockerfile ||
      config.context ||
      config.name ||
      config.image_name ||
      config.image)
  ) {
    records.push(config);
  }

  return records;
}

function normalizeImagePlan(item, args, repoRoot, sourceType) {
  const dockerfile = toPosixPath(
    normalizeString(item.dockerfile || item.file || item.path || "Dockerfile"),
  );
  const context = inferContext(
    dockerfile,
    repoRoot,
    args,
    normalizeString(item.context || item.root),
  );
  const project = normalizeString(
    item.project ||
      item.project_name ||
      item.projectName ||
      projectNameFromDockerfile(dockerfile, repoRoot),
  );
  const imageName = normalizeImageName(
    item.image_name ||
      item.imageName ||
      item.name ||
      packageNameToImageName(project) ||
      imageNameFromDockerfile(dockerfile, repoRoot),
  );
  const registry = normalizeRegistry(item.registry || args.registry);
  const namespace = normalizeImagePathPart(item.namespace || args.namespace);
  const image = normalizeString(item.image || "");

  const metadata = parseDockerfileMetadata(dockerfile, repoRoot);

  const plan = {
    id: safeId(
      `${sourceType}:${imageName}:${dockerfile}:${context}:${normalizeString(item.target || "")}`,
    ),
    source_type: sourceType,
    enabled: normalizeBoolean(item.enabled, true),

    name: imageName,
    image_name: imageName,
    project,
    registry,
    namespace,
    image,

    dockerfile,
    context,
    root: context,
    target: normalizeString(item.target),

    tags: defaultTags(
      repoRoot,
      normalizeStringList(item.tags || item.tag || args.tags),
    ),
    platforms: normalizeStringList(
      item.platforms || item.platform || args.platforms,
    ),

    build_args: mergeKeyValueLists(item.build_args || item.buildArgs || []),
    labels: mergeKeyValueLists(item.labels || []),
    secrets: normalizeStringList(item.secrets || []),
    cache_from: normalizeStringList(item.cache_from || item.cacheFrom || []),
    cache_to: normalizeStringList(item.cache_to || item.cacheTo || []),

    dockerfile_exists: isFile(resolvePath(dockerfile, repoRoot)),
    context_exists: isDirectory(resolvePath(context, repoRoot)),

    dockerfile_hash: "",
    metadata,
    warnings: [],
    errors: [],
  };

  plan.image_refs = createImageRefs(plan);

  if (plan.dockerfile_exists) {
    plan.dockerfile_hash = fileSha256(resolvePath(plan.dockerfile, repoRoot));
  }

  if (!plan.enabled) {
    plan.warnings.push("Image plan is disabled.");
  }

  if (!plan.name) {
    plan.errors.push("Image name could not be determined.");
  }

  if (!plan.dockerfile_exists) {
    plan.errors.push(`Dockerfile does not exist: ${plan.dockerfile}`);
  }

  if (!plan.context_exists) {
    plan.errors.push(`Docker build context does not exist: ${plan.context}`);
  }

  if (!plan.image_refs.length) {
    plan.errors.push("Image references could not be generated.");
  }

  plan.valid = plan.errors.length === 0;
  plan.context_hash = sha256(
    JSON.stringify({
      context: plan.context,
      dockerfile: plan.dockerfile,
      dockerfile_hash: plan.dockerfile_hash,
      tags: plan.tags,
      platforms: plan.platforms,
    }),
  );

  return plan;
}

function discoverDockerfiles(args, repoRoot) {
  if (!args.scan_repository || args.config_only) return [];

  const files = [];

  for (const scanRoot of args.scan_roots) {
    files.push(...walkFiles(scanRoot, repoRoot, args));
  }

  return [...new Set(files)]
    .map((filePath) => toRelativePath(filePath, repoRoot))
    .filter((relativePath) => {
      const base = path.basename(relativePath);
      return base === "Dockerfile" || /^Dockerfile[.-]/.test(base);
    })
    .filter((relativePath) =>
      shouldIncludePath(relativePath, args.include_paths),
    )
    .filter(
      (relativePath) => !shouldExcludePath(relativePath, args.exclude_paths),
    )
    .map((dockerfile) =>
      normalizeImagePlan(
        {
          dockerfile,
        },
        args,
        repoRoot,
        "repository-scan",
      ),
    );
}

function planMatchesFilters(plan, args) {
  if (!args.include_disabled && !plan.enabled) return false;

  if (!args.include_invalid && !plan.valid) return false;

  if (
    args.include.length &&
    !args.include.includes(plan.name) &&
    !args.include.includes(plan.image_name)
  ) {
    return false;
  }

  if (
    args.exclude_images.includes(plan.name) ||
    args.exclude_images.includes(plan.image_name)
  ) {
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

  if (!shouldIncludePath(plan.dockerfile, args.include_paths)) {
    return false;
  }

  if (shouldExcludePath(plan.dockerfile, args.exclude_paths)) {
    return false;
  }

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = `${plan.name}:${plan.dockerfile}:${plan.context}:${plan.target}`;

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
      platforms: [
        ...new Set([...(existing.platforms || []), ...(plan.platforms || [])]),
      ],
      build_args: mergeKeyValueLists(
        existing.build_args || [],
        plan.build_args || [],
      ),
      labels: mergeKeyValueLists(existing.labels || [], plan.labels || []),
      secrets: [
        ...new Set([...(existing.secrets || []), ...(plan.secrets || [])]),
      ],
      cache_from: [
        ...new Set([
          ...(existing.cache_from || []),
          ...(plan.cache_from || []),
        ]),
      ],
      cache_to: [
        ...new Set([...(existing.cache_to || []), ...(plan.cache_to || [])]),
      ],
      warnings: [
        ...new Set([...(existing.warnings || []), ...(plan.warnings || [])]),
      ],
      errors: [
        ...new Set([...(existing.errors || []), ...(plan.errors || [])]),
      ],
      valid: existing.valid && plan.valid,
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.project.localeCompare(right.project) ||
      left.dockerfile.localeCompare(right.dockerfile)
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  const configPlans = configImageRecords(config).map((item) =>
    normalizeImagePlan(item, args, repoRoot, "config"),
  );
  const scannedPlans = discoverDockerfiles(args, repoRoot);

  const allPlans = dedupePlans([...configPlans, ...scannedPlans]);

  const selected = allPlans
    .filter((plan) => planMatchesFilters(plan, args))
    .slice(0, args.max_images > 0 ? args.max_images : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    configured_images: configPlans.length,
    scanned_images: scannedPlans.length,
    all_images: allPlans,
    selected_images: selected,
  };
}

function createArtifactRecord(plan) {
  return {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    image_name: plan.image_name,
    project: plan.project,
    registry: plan.registry,
    namespace: plan.namespace,
    image: plan.image,

    dockerfile: plan.dockerfile,
    context: plan.context,
    root: plan.root,
    target: plan.target,

    tags: plan.tags,
    platforms: plan.platforms,
    build_args: plan.build_args,
    labels: plan.labels,
    secrets: plan.secrets,
    cache_from: plan.cache_from,
    cache_to: plan.cache_to,

    image_refs: plan.image_refs,

    dockerfile_exists: plan.dockerfile_exists,
    context_exists: plan.context_exists,
    dockerfile_hash: plan.dockerfile_hash,
    context_hash: plan.context_hash,

    valid: plan.valid,
    enabled: plan.enabled,
    warnings: plan.warnings,
    errors: plan.errors,

    metadata: plan.metadata,
  };
}

function summarizePlans(plans) {
  return {
    images: plans.length,
    valid: plans.filter((plan) => plan.valid).length,
    invalid: plans.filter((plan) => !plan.valid).length,
    enabled: plans.filter((plan) => plan.enabled).length,
    disabled: plans.filter((plan) => !plan.enabled).length,
    dockerfiles_present: plans.filter((plan) => plan.dockerfile_exists).length,
    contexts_present: plans.filter((plan) => plan.context_exists).length,
    image_refs: [...new Set(plans.flatMap((plan) => plan.image_refs))].length,
    platforms: [...new Set(plans.flatMap((plan) => plan.platforms))].length,
    projects: [...new Set(plans.map((plan) => plan.project).filter(Boolean))]
      .length,
    registries: [...new Set(plans.map((plan) => plan.registry).filter(Boolean))]
      .length,
  };
}

function groupPlans(plans, key) {
  const groups = {};

  for (const plan of plans) {
    const group = plan[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        valid: 0,
        invalid: 0,
        enabled: 0,
        disabled: 0,
      };
    }

    groups[group].count += 1;
    if (plan.valid) groups[group].valid += 1;
    if (!plan.valid) groups[group].invalid += 1;
    if (plan.enabled) groups[group].enabled += 1;
    if (!plan.enabled) groups[group].disabled += 1;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans) {
  const github = getGitMetadata(repoRoot);
  const selected = plans.selected_images.map(createArtifactRecord);
  const all = plans.all_images.map(createArtifactRecord);
  const totals = summarizePlans(plans.selected_images);
  const invalid = plans.selected_images.filter((plan) => !plan.valid);
  const disabled = plans.selected_images.filter((plan) => !plan.enabled);

  const status =
    totals.images === 0
      ? "empty"
      : invalid.length > 0
        ? "invalid"
        : disabled.length > 0
          ? "has-disabled"
          : "discovered";

  return {
    schema_version: 1,
    type: "docker-image-discovery",
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
      namespace: args.namespace,
      scan_roots: args.scan_roots,
      context_strategy: args.context_strategy,
      config_only: args.config_only,
      scan_repository: args.scan_repository,
      include_disabled: args.include_disabled,
      include_invalid: args.include_invalid,
      max_images: args.max_images,
      dry_run: args.dry_run,
    },
    discovery: {
      configured_images: plans.configured_images,
      scanned_images: plans.scanned_images,
      discovered_images: plans.all_images.length,
      selected_images: plans.selected_images.length,
    },
    totals,
    groups: {
      by_source_type: groupPlans(plans.selected_images, "source_type"),
      by_project: groupPlans(plans.selected_images, "project"),
      by_registry: groupPlans(plans.selected_images, "registry"),
    },
    dockerfiles: selected,
    images: selected,
    targets: selected,
    all_images: all,
    image_refs: [
      ...new Set(selected.flatMap((plan) => plan.image_refs)),
    ].sort(),
    invalid_images: selected.filter((plan) => !plan.valid),
    disabled_images: selected.filter((plan) => !plan.enabled),
    status,
  };
}

function createOutputArtifact(report) {
  return {
    schema_version: report.schema_version,
    type: "dockerfiles",
    project: report.project,
    repository: report.repository,
    created_at: report.created_at,
    github: report.github,
    discovery: report.discovery,
    totals: report.totals,
    dockerfiles: report.dockerfiles,
    images: report.images,
    targets: report.targets,
    image_refs: report.image_refs,
    status: report.status,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🐳 ${PROJECT_NAME} Docker Image Discovery`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Selected images: \`${report.discovery.selected_images}\``,
    `- Valid: \`${report.totals.valid}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Enabled: \`${report.totals.enabled}\``,
    `- Disabled: \`${report.totals.disabled}\``,
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
    `- Namespace: \`${report.config.namespace}\``,
    `- Context strategy: \`${report.config.context_strategy}\``,
    `- Config only: \`${report.config.config_only ? "true" : "false"}\``,
    `- Scan repository: \`${report.config.scan_repository ? "true" : "false"}\``,
    `- Scan roots: ${report.config.scan_roots.map((item) => `\`${item}\``).join(", ")}`,
    "",
    "## 📊 Totals",
    "",
    `- Configured images: \`${report.discovery.configured_images}\``,
    `- Scanned images: \`${report.discovery.scanned_images}\``,
    `- Discovered images: \`${report.discovery.discovered_images}\``,
    `- Dockerfiles present: \`${report.totals.dockerfiles_present}\``,
    `- Contexts present: \`${report.totals.contexts_present}\``,
    `- Image refs: \`${report.totals.image_refs}\``,
    `- Projects: \`${report.totals.projects}\``,
    "",
    "## 🎯 Selected Images",
    "",
  ];

  if (!report.images.length) {
    lines.push("No Docker images were discovered.");
  } else {
    lines.push(
      "| Image | Project | Dockerfile | Context | Source | Tags | Valid |",
    );
    lines.push("|---|---|---|---|---|---|---:|");

    for (const image of report.images) {
      lines.push(
        `| \`${escapeMarkdown(image.image_name)}\` | \`${escapeMarkdown(image.project || "none")}\` | \`${escapeMarkdown(image.dockerfile)}\` | \`${escapeMarkdown(image.context)}\` | \`${escapeMarkdown(image.source_type)}\` | ${image.tags.map((tag) => `\`${tag}\``).join(", ")} | \`${image.valid ? "true" : "false"}\` |`,
      );
    }
  }

  if (report.image_refs.length) {
    lines.push("");
    lines.push("## 🏷️ Image References");
    lines.push("");

    for (const imageRef of report.image_refs.slice(0, 100)) {
      lines.push(`- \`${imageRef}\``);
    }

    if (report.image_refs.length > 100) {
      lines.push(
        `- ...and \`${report.image_refs.length - 100}\` more image reference(s).`,
      );
    }
  }

  if (report.invalid_images.length) {
    lines.push("");
    lines.push("## ❌ Invalid Images");
    lines.push("");
    lines.push("| Image | Dockerfile | Errors |");
    lines.push("|---|---|---|");

    for (const image of report.invalid_images) {
      lines.push(
        `| \`${escapeMarkdown(image.image_name || image.name || "unknown")}\` | \`${escapeMarkdown(image.dockerfile || "unknown")}\` | ${image.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = report.images.flatMap((image) =>
    image.warnings.map((warning) => ({
      image: image.image_name || image.name || "unknown",
      warning,
    })),
  );

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings) {
      lines.push(
        `- \`${escapeMarkdown(warning.image)}\`: ${escapeMarkdown(warning.warning)}`,
      );
    }
  }

  lines.push("");
  lines.push("## 📥 Outputs");
  lines.push("");
  lines.push(`- Dockerfiles artifact: \`${report.config.output_file}\``);
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
  setGitHubOutput("dockerfiles_file", report.config.output_file);
  setGitHubOutput("docker_discover_images_file", report.config.output_file);
  setGitHubOutput(
    "docker_discover_images_report_file",
    report.config.report_file || "",
  );
  setGitHubOutput(
    "docker_discover_images_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("docker_discover_images_status", report.status);
  setGitHubOutput(
    "docker_discover_images_selected",
    String(report.discovery.selected_images),
  );
  setGitHubOutput("docker_discover_images_valid", String(report.totals.valid));
  setGitHubOutput(
    "docker_discover_images_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput(
    "docker_discover_images_refs_count",
    String(report.totals.image_refs),
  );
  setGitHubOutput("docker_discover_images_refs", report.image_refs.join(","));
  setGitHubOutput(
    "docker_discover_images_refs_json",
    JSON.stringify(report.image_refs),
  );
  setGitHubOutput(
    "docker_discover_images_names",
    report.images.map((image) => image.image_name || image.name).join(","),
  );
  setGitHubOutput(
    "docker_discover_images_names_json",
    JSON.stringify(
      report.images.map((image) => image.image_name || image.name),
    ),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const reportFile = resolvePath(args.report_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Discovering Docker images.");

  const plans = createPlans(args, repoRoot);
  const report = createReport(args, repoRoot, plans);
  const outputArtifact = createOutputArtifact(report);
  const outputJson = `${JSON.stringify(outputArtifact, null, 2)}\n`;
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  if (args.fail_if_empty && report.discovery.selected_images === 0) {
    logger.error("No Docker images were discovered.");
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

  if (args.fail_on_error && report.status === "invalid") {
    logger.error(
      `Docker image discovery found ${report.totals.invalid} invalid image(s).`,
    );
    process.exitCode = 1;
  }

  if (args.fail_if_empty && report.discovery.selected_images === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
