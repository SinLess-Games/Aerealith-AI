#!/usr/bin/env node
// .github/scripts/docker/build-images.js
// =============================================================================
// Aerealith AI — Docker Image Builder
// -----------------------------------------------------------------------------
// Purpose:
//   Discover, plan, build, tag, and optionally push Docker images for CI/CD.
//
// Input:
//   - .github/docker/images.json
//   - .github/docker/images.jsonc
//   - .github/docker/images.yaml
//   - .github/docker/images.yml
//   - artifacts/ci/dockerfiles.json
//   - artifacts/ci/affected-projects.json
//
// Output:
//   - artifacts/docker/build-images.json
//   - artifacts/docker/build-images.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Supports Docker buildx or classic docker build.
//   - Push is opt-in unless DOCKER_BUILD_IMAGES_PUSH=true.
//   - Dry-run mode reports commands without mutating Docker.
//   - Secrets are redacted from logs, reports, and GitHub outputs.
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
    info: (message) => console.log(`[docker-images] ${message}`),
    warn: (message) => console.warn(`[docker-images] WARN: ${message}`),
    error: (message) => console.error(`[docker-images] ERROR: ${message}`),
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
  ".github/docker/build-images.json",
  ".github/docker/build-images.jsonc",
  ".github/docker/build-images.yaml",
  ".github/docker/build-images.yml",
  "docker/images.json",
  "docker/images.jsonc",
  "docker/images.yaml",
  "docker/images.yml",
];

const DEFAULT_DOCKERFILES_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_AFFECTED_PROJECTS_FILE = "artifacts/ci/affected-projects.json";
const DEFAULT_OUTPUT_FILE = "artifacts/docker/build-images.json";
const DEFAULT_SUMMARY_FILE = "artifacts/docker/build-images.md";

const DEFAULT_REGISTRY = "ghcr.io";
const DEFAULT_IMAGE_NAMESPACE = "sinless-games";
const DEFAULT_CONTEXT = ".";
const DEFAULT_DOCKERFILE = "Dockerfile";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

    config_file: process.env.DOCKER_BUILD_IMAGES_CONFIG_FILE || "",
    dockerfiles_file:
      process.env.DOCKER_BUILD_IMAGES_DOCKERFILES_FILE ||
      DEFAULT_DOCKERFILES_FILE,
    affected_projects_file:
      process.env.DOCKER_BUILD_IMAGES_AFFECTED_PROJECTS_FILE ||
      DEFAULT_AFFECTED_PROJECTS_FILE,

    output_file:
      process.env.DOCKER_BUILD_IMAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.DOCKER_BUILD_IMAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    registry:
      process.env.DOCKER_BUILD_IMAGES_REGISTRY ||
      process.env.CONTAINER_REGISTRY ||
      DEFAULT_REGISTRY,
    namespace:
      process.env.DOCKER_BUILD_IMAGES_NAMESPACE ||
      process.env.DOCKER_IMAGE_NAMESPACE ||
      DEFAULT_IMAGE_NAMESPACE,

    image: process.env.DOCKER_BUILD_IMAGE || process.env.DOCKER_IMAGE || "",
    image_name:
      process.env.DOCKER_BUILD_IMAGE_NAME ||
      process.env.DOCKER_IMAGE_NAME ||
      "",
    dockerfile:
      process.env.DOCKER_BUILD_DOCKERFILE || process.env.DOCKERFILE || "",
    context:
      process.env.DOCKER_BUILD_CONTEXT || process.env.DOCKER_CONTEXT || "",
    target: process.env.DOCKER_BUILD_TARGET || process.env.DOCKER_TARGET || "",

    tags: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_TAGS),
    platforms: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_PLATFORMS),
    build_args: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_BUILD_ARGS),
    labels: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_LABELS),
    secrets: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_SECRETS),

    include_images: normalizeStringList(
      process.env.DOCKER_BUILD_IMAGES_INCLUDE,
    ),
    exclude_images: normalizeStringList(
      process.env.DOCKER_BUILD_IMAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.DOCKER_BUILD_IMAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.DOCKER_BUILD_IMAGES_EXCLUDE_PROJECTS,
    ),

    exclude: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_EXCLUDE_PATHS),

    use_buildx: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_BUILDX, true),
    push: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_PUSH, false),
    load: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_LOAD, false),
    pull: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_PULL, false),
    no_cache: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_NO_CACHE, false),
    provenance: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_PROVENANCE,
      false,
    ),
    sbom: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_SBOM, false),

    cache_from: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_CACHE_FROM),
    cache_to: normalizeStringList(process.env.DOCKER_BUILD_IMAGES_CACHE_TO),

    affected_only: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_AFFECTED_ONLY,
      false,
    ),
    include_unaffected: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_INCLUDE_UNAFFECTED,
      true,
    ),

    login: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_LOGIN, false),
    login_registry:
      process.env.DOCKER_BUILD_IMAGES_LOGIN_REGISTRY ||
      process.env.DOCKER_LOGIN_REGISTRY ||
      "",
    login_username:
      process.env.DOCKER_BUILD_IMAGES_LOGIN_USERNAME ||
      process.env.DOCKER_USERNAME ||
      process.env.GITHUB_ACTOR ||
      "",
    login_password:
      process.env.DOCKER_BUILD_IMAGES_LOGIN_PASSWORD ||
      process.env.DOCKER_PASSWORD ||
      process.env.GITHUB_TOKEN ||
      "",

    fail_if_empty: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_CONTINUE_ON_ERROR,
      false,
    ),

    max_images: normalizeInteger(process.env.DOCKER_BUILD_IMAGES_MAX_IMAGES, 0),
    timeout_minutes: normalizeInteger(
      process.env.DOCKER_BUILD_IMAGES_TIMEOUT_MINUTES,
      45,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.DOCKER_BUILD_IMAGES_MAX_BUFFER_MB,
      128,
    ),

    dry_run: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.DOCKER_BUILD_IMAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.DOCKER_BUILD_IMAGES_STEP_SUMMARY,
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

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dockerfiles") {
      args.dockerfiles_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--affected-projects") {
      args.affected_projects_file = argv[index + 1];
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

    if (arg === "--image") {
      args.image = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--image-name" || arg === "--name") {
      args.image_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dockerfile" || arg === "-f") {
      args.dockerfile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--context") {
      args.context = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target") {
      args.target = argv[index + 1];
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

    if (arg === "--build-arg") {
      args.build_args.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--label") {
      args.labels.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--secret") {
      args.secrets.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "--include-image") {
      args.include_images.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--exclude-path") {
      args.exclude.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--buildx") {
      args.use_buildx = true;
      continue;
    }

    if (arg === "--no-buildx") {
      args.use_buildx = false;
      continue;
    }

    if (arg === "--push") {
      args.push = true;
      continue;
    }

    if (arg === "--no-push") {
      args.push = false;
      continue;
    }

    if (arg === "--load") {
      args.load = true;
      continue;
    }

    if (arg === "--no-load") {
      args.load = false;
      continue;
    }

    if (arg === "--pull") {
      args.pull = true;
      continue;
    }

    if (arg === "--no-pull") {
      args.pull = false;
      continue;
    }

    if (arg === "--no-cache") {
      args.no_cache = true;
      continue;
    }

    if (arg === "--cache-from") {
      args.cache_from.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--cache-to") {
      args.cache_to.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--provenance") {
      args.provenance = true;
      continue;
    }

    if (arg === "--no-provenance") {
      args.provenance = false;
      continue;
    }

    if (arg === "--sbom") {
      args.sbom = true;
      continue;
    }

    if (arg === "--no-sbom") {
      args.sbom = false;
      continue;
    }

    if (arg === "--affected-only") {
      args.affected_only = true;
      args.include_unaffected = false;
      continue;
    }

    if (arg === "--include-unaffected") {
      args.include_unaffected = true;
      args.affected_only = false;
      continue;
    }

    if (arg === "--login") {
      args.login = true;
      continue;
    }

    if (arg === "--no-login") {
      args.login = false;
      continue;
    }

    if (arg === "--login-registry") {
      args.login_registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--login-username") {
      args.login_username = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--login-password") {
      args.login_password = argv[index + 1];
      index += 1;
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

    if (arg === "--continue-on-error") {
      args.continue_on_error = true;
      continue;
    }

    if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
      continue;
    }

    if (arg === "--max-images") {
      args.max_images = normalizeInteger(argv[index + 1], args.max_images);
      index += 1;
      continue;
    }

    if (arg === "--timeout-minutes") {
      args.timeout_minutes = normalizeInteger(
        argv[index + 1],
        args.timeout_minutes,
      );
      index += 1;
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

  args.registry = normalizeRegistry(args.registry);
  args.namespace = normalizeImagePathPart(args.namespace);
  args.tags = [...new Set(args.tags)];
  args.platforms = [...new Set(args.platforms)];
  args.build_args = [...new Set(args.build_args)];
  args.labels = [...new Set(args.labels)];
  args.secrets = [...new Set(args.secrets)];
  args.include_images = [...new Set(args.include_images)];
  args.exclude_images = [...new Set(args.exclude_images)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];
  args.cache_from = [...new Set(args.cache_from)];
  args.cache_to = [...new Set(args.cache_to)];
  args.max_images = Math.max(0, args.max_images);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Docker Image Builder

Usage:
  node .github/scripts/docker/build-images.js [options]

Examples:
  node .github/scripts/docker/build-images.js --dry-run
  node .github/scripts/docker/build-images.js --push --platform linux/amd64,linux/arm64
  node .github/scripts/docker/build-images.js --image aerealith-api --dockerfile apps/api/Dockerfile --context .
  node .github/scripts/docker/build-images.js --config .github/docker/images.json

Options:
      --repo <owner/repo>                Repository slug.
      --config <file>                    Docker image build config file.
      --dockerfiles <file>               Dockerfile discovery artifact.
      --affected-projects <file>         Affected project discovery artifact.
      --registry <registry>              Container registry. Default: ghcr.io.
      --namespace <namespace>            Image namespace/org. Default: sinless-games.
      --image <image>                    Direct image reference.
      --image-name <name>                Direct image name.
  -f, --dockerfile <file>                Dockerfile path.
      --context <dir>                    Build context path.
      --target <stage>                   Dockerfile target stage.
  -t, --tag <tag,list>                   Image tag(s).
      --platform <list>                  Build platforms.
      --build-arg <KEY=VALUE>            Docker build argument.
      --label <KEY=VALUE>                Docker image label.
      --secret <spec>                    BuildKit secret spec.
      --include <list>                   Include image names.
      --exclude <list>                   Exclude image names.
      --include-project <list>           Include project names.
      --exclude-project <list>           Exclude project names.
      --exclude-path <pattern>           Exclude Dockerfile paths.
      --buildx                          Use docker buildx build. Default.
      --no-buildx                       Use docker build.
      --push                            Push built images.
      --no-push                         Do not push images. Default.
      --load                            Load buildx result into local Docker.
      --pull                            Pull newer base images.
      --no-cache                        Disable build cache.
      --cache-from <spec>               Buildx cache source.
      --cache-to <spec>                 Buildx cache destination.
      --provenance                      Enable buildx provenance.
      --sbom                            Enable buildx SBOM.
      --affected-only                   Build only affected image plans.
      --include-unaffected              Build all selected image plans. Default.
      --login                           Run docker login before builds.
      --login-registry <registry>       Registry for docker login.
      --login-username <username>       Registry username.
      --login-password <password>       Registry password/token.
      --fail-if-empty                   Exit non-zero if no images are selected.
      --fail-on-error                   Exit non-zero on build failure. Default.
      --no-fail-on-error                Do not fail when builds fail.
      --continue-on-error               Continue after a build failure.
      --no-continue-on-error            Stop after first build failure. Default.
      --max-images <number>             Maximum images to build.
      --timeout-minutes <number>        Per command timeout. Default: 45.
  -o, --output <file>                   JSON output file.
      --summary <file>                  Markdown summary output file.
      --no-summary                      Do not write Markdown summary.
      --dry-run                         Plan but do not run Docker.
      --no-print                        Do not print JSON report.
      --no-step-summary                 Do not append GitHub step summary.
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

      if (section === "images") {
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

    if (section === "images" && /^-\s*/.test(trimmed)) {
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

function walkFiles(targetPath, repoRoot, excludePatterns, files = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return files;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, excludePatterns)) return files;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    files.push(absolutePath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkFiles(
      path.join(absolutePath, entry.name),
      repoRoot,
      excludePatterns,
      files,
    );
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
    .replace(/\/+$/g, "");
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

function imageNameFromDockerfile(filePath) {
  const normalized = toPosixPath(filePath);
  const dir = path.posix.dirname(normalized);
  const base = path.posix.basename(dir);

  if (!dir || dir === "." || normalized === DEFAULT_DOCKERFILE) {
    return normalizeImageName(path.basename(process.cwd()));
  }

  if (["docker", "containers", ".github"].includes(base)) {
    return normalizeImageName(
      path.posix.basename(normalized).replace(/^Dockerfile\.?/i, "") || "app",
    );
  }

  return normalizeImageName(base || "app");
}

function discoverDockerfiles(repoRoot, args) {
  const discovery = readJsonFile(args.dockerfiles_file, repoRoot, null);

  if (discovery) {
    const records = [
      ...(Array.isArray(discovery.dockerfiles) ? discovery.dockerfiles : []),
      ...(Array.isArray(discovery.targets) ? discovery.targets : []),
      ...(Array.isArray(discovery.images) ? discovery.images : []),
    ];

    return records
      .map((record) => {
        if (typeof record === "string") {
          return {
            dockerfile: toPosixPath(record),
            context: path.posix.dirname(toPosixPath(record)) || ".",
            image_name: imageNameFromDockerfile(record),
            project: "",
            source_type: "dockerfile-artifact",
          };
        }

        return {
          dockerfile: toPosixPath(
            record.dockerfile ||
              record.file ||
              record.path ||
              DEFAULT_DOCKERFILE,
          ),
          context: toPosixPath(
            record.context ||
              record.root ||
              path.posix.dirname(record.dockerfile || "."),
          ),
          image_name: normalizeImageName(
            record.image_name ||
              record.name ||
              imageNameFromDockerfile(record.dockerfile || ""),
          ),
          project: normalizeString(
            record.project || record.project_name || record.name,
          ),
          source_type: "dockerfile-artifact",
        };
      })
      .filter((record) => record.dockerfile)
      .filter((record) => isFile(resolvePath(record.dockerfile, repoRoot)));
  }

  return walkFiles(repoRoot, repoRoot, args.exclude)
    .filter((filePath) => {
      const name = path.basename(filePath);
      return name === "Dockerfile" || /^Dockerfile\./.test(name);
    })
    .map((filePath) => {
      const dockerfile = toRelativePath(filePath, repoRoot);
      return {
        dockerfile,
        context: toPosixPath(path.posix.dirname(dockerfile)) || ".",
        image_name: imageNameFromDockerfile(dockerfile),
        project: "",
        source_type: "repository-scan",
      };
    });
}

function readAffectedProjects(repoRoot, args) {
  const data = readJsonFile(args.affected_projects_file, repoRoot, null);

  if (!data) {
    return {
      available: false,
      projects: [],
      files: [],
    };
  }

  const projects = [
    ...(Array.isArray(data.projects) ? data.projects : []),
    ...(Array.isArray(data.affected_projects) ? data.affected_projects : []),
    ...(Array.isArray(data.affectedProjects) ? data.affectedProjects : []),
  ].map(String);

  const files = [
    ...(Array.isArray(data.files) ? data.files : []),
    ...(Array.isArray(data.changed_files) ? data.changed_files : []),
    ...(Array.isArray(data.changedFiles) ? data.changedFiles : []),
  ].map(toPosixPath);

  return {
    available: true,
    projects: [...new Set(projects)],
    files: [...new Set(files)],
  };
}

function configImageRecords(config) {
  if (!config) return [];

  const images = [
    ...(Array.isArray(config.images) ? config.images : []),
    ...(Array.isArray(config.docker_images) ? config.docker_images : []),
    ...(Array.isArray(config.dockerImages) ? config.dockerImages : []),
  ];

  if (config.image && typeof config.image === "object") {
    images.push(config.image);
  }

  if (
    !images.length &&
    (config.dockerfile ||
      config.context ||
      config.name ||
      config.image_name ||
      config.image)
  ) {
    images.push(config);
  }

  return images;
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

function normalizeImagePlan(item, args, repoRoot, sourceType = "config") {
  const dockerfile = toPosixPath(
    normalizeString(
      item.dockerfile || item.file || item.path,
      args.dockerfile || DEFAULT_DOCKERFILE,
    ),
  );
  const context = toPosixPath(
    normalizeString(item.context || item.root, args.context || DEFAULT_CONTEXT),
  );
  const imageName = normalizeImageName(
    item.image_name ||
      item.imageName ||
      item.name ||
      args.image_name ||
      imageNameFromDockerfile(dockerfile),
  );

  const registry = normalizeRegistry(item.registry || args.registry);
  const namespace = normalizeImagePathPart(item.namespace || args.namespace);
  const image = normalizeString(item.image || args.image);
  const target = normalizeString(item.target || args.target);

  const plan = {
    id: safeId(
      `${sourceType}:${imageName}:${dockerfile}:${context}:${target || "default"}`,
    ),
    source_type: sourceType,
    name: imageName,
    project: normalizeString(
      item.project || item.project_name || item.projectName || imageName,
    ),
    registry,
    namespace,
    image,
    dockerfile,
    context,
    target,
    tags: normalizeStringList(item.tags || item.tag || args.tags),
    platforms: normalizeStringList(
      item.platforms || item.platform || args.platforms,
    ),
    build_args: mergeKeyValueLists(
      item.build_args || item.buildArgs || [],
      args.build_args,
    ),
    labels: mergeKeyValueLists(item.labels || [], args.labels),
    secrets: [
      ...new Set([...normalizeStringList(item.secrets || []), ...args.secrets]),
    ],
    cache_from: [
      ...new Set([
        ...normalizeStringList(item.cache_from || item.cacheFrom || []),
        ...args.cache_from,
      ]),
    ],
    cache_to: [
      ...new Set([
        ...normalizeStringList(item.cache_to || item.cacheTo || []),
        ...args.cache_to,
      ]),
    ],
    use_buildx: normalizeBoolean(
      item.use_buildx ?? item.buildx,
      args.use_buildx,
    ),
    push: normalizeBoolean(item.push, args.push),
    load: normalizeBoolean(item.load, args.load),
    pull: normalizeBoolean(item.pull, args.pull),
    no_cache: normalizeBoolean(item.no_cache ?? item.noCache, args.no_cache),
    provenance: normalizeBoolean(item.provenance, args.provenance),
    sbom: normalizeBoolean(item.sbom, args.sbom),
    enabled: normalizeBoolean(item.enabled, true),
    dockerfile_exists: isFile(resolvePath(dockerfile, repoRoot)),
    context_exists: isDirectory(resolvePath(context, repoRoot)),
  };

  if (!plan.tags.length) {
    plan.tags = defaultTags(plan, repoRoot);
  }

  plan.image_refs = createImageRefs(plan, repoRoot);

  return plan;
}

function defaultTags(plan, repoRoot) {
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

  return [...new Set(tags)];
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

function createRepositoryName(plan) {
  if (plan.image) {
    const withoutTag = plan.image.includes(":")
      ? plan.image.split(":").slice(0, -1).join(":")
      : plan.image;
    return withoutTag;
  }

  const parts = [plan.registry, plan.namespace, plan.name].filter(Boolean);

  return parts.join("/");
}

function createImageRefs(plan) {
  const repository = createRepositoryName(plan);

  return plan.tags.map((tag) => {
    const normalizedTag = normalizeTag(tag);

    return `${repository}:${normalizedTag || "latest"}`;
  });
}

function createDirectPlan(args, repoRoot) {
  if (!args.image && !args.image_name && !args.dockerfile && !args.context)
    return null;

  return normalizeImagePlan(
    {
      image: args.image,
      image_name: args.image_name,
      dockerfile: args.dockerfile || DEFAULT_DOCKERFILE,
      context: args.context || DEFAULT_CONTEXT,
      target: args.target,
      tags: args.tags,
      platforms: args.platforms,
      build_args: args.build_args,
      labels: args.labels,
      secrets: args.secrets,
    },
    args,
    repoRoot,
    "direct",
  );
}

function dockerfileRecordToPlan(record, args, repoRoot) {
  return normalizeImagePlan(
    {
      image_name: record.image_name,
      project: record.project,
      dockerfile: record.dockerfile,
      context: record.context,
      tags: args.tags,
      platforms: args.platforms,
    },
    args,
    repoRoot,
    record.source_type || "dockerfile-discovery",
  );
}

function planMatchesFilters(plan, args, affected) {
  if (!plan.enabled) return false;

  if (args.include_images.length && !args.include_images.includes(plan.name)) {
    return false;
  }

  if (args.exclude_images.includes(plan.name)) {
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

  if (shouldExcludePath(plan.dockerfile, args.exclude)) {
    return false;
  }

  if (args.affected_only) {
    const projectMatched =
      affected.projects.includes(plan.project) ||
      affected.projects.includes(plan.name);
    const fileMatched = affected.files.some((file) => {
      return (
        file === plan.dockerfile ||
        file.startsWith(`${plan.context.replace(/\/+$/g, "")}/`) ||
        plan.dockerfile.startsWith(`${file.replace(/\/+$/g, "")}/`)
      );
    });

    if (!projectMatched && !fileMatched) {
      return false;
    }
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
      image_refs: [
        ...new Set([
          ...(existing.image_refs || []),
          ...(plan.image_refs || []),
        ]),
      ],
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.dockerfile.localeCompare(right.dockerfile) ||
      left.context.localeCompare(right.context)
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;
  const affected = readAffectedProjects(repoRoot, args);
  const configPlans = configImageRecords(config).map((item) =>
    normalizeImagePlan(item, args, repoRoot, "config"),
  );
  const discoveredPlans = discoverDockerfiles(repoRoot, args).map((record) =>
    dockerfileRecordToPlan(record, args, repoRoot),
  );
  const directPlan = createDirectPlan(args, repoRoot);

  const rawPlans = [
    ...configPlans,
    ...(configPlans.length ? [] : discoveredPlans),
    ...(directPlan ? [directPlan] : []),
  ];

  const selected = dedupePlans(rawPlans)
    .filter((plan) => planMatchesFilters(plan, args, affected))
    .slice(0, args.max_images > 0 ? args.max_images : undefined)
    .map((plan) => ({
      ...plan,
      dockerfile_hash: plan.dockerfile_exists
        ? fileSha256(resolvePath(plan.dockerfile, repoRoot))
        : "",
      context_hash: sha256(
        `${plan.context}:${plan.dockerfile}:${plan.tags.join(",")}:${plan.platforms.join(",")}`,
      ),
    }));

  return {
    config_file: configFile,
    config_available: Boolean(config),
    dockerfiles_file: toRelativePath(
      resolvePath(args.dockerfiles_file, repoRoot),
      repoRoot,
    ),
    dockerfiles_available: Boolean(
      readJsonFile(args.dockerfiles_file, repoRoot, null),
    ),
    affected_projects_file: toRelativePath(
      resolvePath(args.affected_projects_file, repoRoot),
      repoRoot,
    ),
    affected_projects_available: affected.available,
    affected,
    discovered_images: rawPlans.length,
    selected_images: selected,
  };
}

function validatePlan(plan) {
  const errors = [];
  const warnings = [];

  if (!plan.name && !plan.image) {
    errors.push("Image plan is missing an image name.");
  }

  if (!plan.dockerfile) {
    errors.push("Image plan is missing a Dockerfile path.");
  } else if (!plan.dockerfile_exists) {
    errors.push(`Dockerfile does not exist: ${plan.dockerfile}`);
  }

  if (!plan.context) {
    errors.push("Image plan is missing a build context.");
  } else if (!plan.context_exists) {
    errors.push(`Build context does not exist: ${plan.context}`);
  }

  if (!plan.image_refs.length) {
    errors.push("Image plan produced no image references.");
  }

  if (plan.platforms.length > 1 && !plan.use_buildx) {
    errors.push("Multiple platforms require Docker buildx.");
  }

  if (plan.load && plan.push) {
    warnings.push(
      "Both load and push are enabled. Buildx supports this only in some configurations.",
    );
  }

  if (plan.secrets.length && !plan.use_buildx) {
    warnings.push("Build secrets usually require BuildKit/buildx support.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function dockerAvailable(args, repoRoot) {
  if (args.dry_run) {
    return {
      ok: true,
      command: null,
      error: "",
    };
  }

  const command = runCommand(
    {
      command: "docker",
      args: ["version", "--format", "{{.Server.Version}}"],
      cwd: repoRoot,
      display: "docker version --format {{.Server.Version}}",
      input: "",
    },
    args,
  );

  return {
    ok: command.success,
    command,
    error: command.success
      ? ""
      : command.error || command.stderr || "Docker is not available.",
  };
}

function loginIfNeeded(args, repoRoot) {
  if (!args.login) {
    return {
      requested: false,
      status: "skipped",
      success: true,
      command: null,
      errors: [],
    };
  }

  const registry = args.login_registry || args.registry;

  if (!args.login_username || !args.login_password) {
    return {
      requested: true,
      status: "invalid",
      success: false,
      command: null,
      errors: [
        "Docker login requested, but username or password/token is missing.",
      ],
    };
  }

  const command = runCommand(
    {
      command: "docker",
      args: [
        "login",
        registry,
        "--username",
        args.login_username,
        "--password-stdin",
      ],
      cwd: repoRoot,
      display: `docker login ${registry} --username ${args.login_username} --password-stdin`,
      input: `${args.login_password}\n`,
    },
    args,
  );

  return {
    requested: true,
    status: command.success
      ? args.dry_run
        ? "planned"
        : "logged-in"
      : "failed",
    success: command.success,
    command: sanitizeCommand(command),
    errors: command.success
      ? []
      : [command.error || command.stderr || "Docker login failed."],
  };
}

function buildCommandArgs(plan, repoRoot) {
  const args = [];

  if (plan.use_buildx) {
    args.push("buildx", "build");
  } else {
    args.push("build");
  }

  args.push("--file", resolvePath(plan.dockerfile, repoRoot));

  for (const imageRef of plan.image_refs) {
    args.push("--tag", imageRef);
  }

  if (plan.target) {
    args.push("--target", plan.target);
  }

  if (plan.platforms.length && plan.use_buildx) {
    args.push("--platform", plan.platforms.join(","));
  }

  for (const buildArg of plan.build_args) {
    args.push("--build-arg", buildArg);
  }

  for (const label of plan.labels) {
    args.push("--label", label);
  }

  for (const secret of plan.secrets) {
    args.push("--secret", secret);
  }

  for (const cacheFrom of plan.cache_from) {
    args.push("--cache-from", cacheFrom);
  }

  for (const cacheTo of plan.cache_to) {
    args.push("--cache-to", cacheTo);
  }

  if (plan.pull) args.push("--pull");
  if (plan.no_cache) args.push("--no-cache");

  if (plan.use_buildx) {
    if (plan.push) args.push("--push");
    if (plan.load) args.push("--load");
    if (plan.provenance) args.push("--provenance=true");
    if (!plan.provenance) args.push("--provenance=false");
    if (plan.sbom) args.push("--sbom=true");
  }

  args.push(resolvePath(plan.context, repoRoot));

  return args;
}

function commandDisplay(command, commandArgs) {
  return redactOutput(
    [command, ...commandArgs]
      .map((part) => {
        const value = String(part);

        if (/^[A-Za-z0-9_./:=@,+,-]+$/.test(value)) return value;

        return JSON.stringify(value);
      })
      .join(" "),
  );
}

function runCommand(commandRecord, args) {
  const startedAt = new Date();
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run) {
    return {
      ...commandRecord,
      status: "planned",
      success: true,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const result = childProcess.spawnSync(
    commandRecord.command,
    commandRecord.args,
    {
      cwd: commandRecord.cwd,
      env: {
        ...process.env,
        CI: process.env.CI || "true",
        DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT || "1",
      },
      input: commandRecord.input || undefined,
      encoding: "utf8",
      stdio: commandRecord.input
        ? ["pipe", "pipe", "pipe"]
        : ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout,
    },
  );

  const endedAt = new Date();
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;

  return {
    ...commandRecord,
    status: success ? "passed" : "failed",
    success,
    exit_code: result.status,
    signal: result.signal || null,
    stdout: redactOutput(result.stdout || ""),
    stderr: redactOutput(result.stderr || ""),
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function sanitizeCommand(command) {
  if (!command) return null;

  return {
    display: redactOutput(command.display || ""),
    status: command.status,
    success: command.success,
    exit_code: command.exit_code,
    duration_ms: command.duration_ms,
    error: redactOutput(command.error || ""),
    stdout_preview: redactOutput(command.stdout || "").slice(0, 2000),
    stderr_preview: redactOutput(command.stderr || "").slice(0, 4000),
  };
}

function buildImage(plan, args, repoRoot) {
  const startedAt = new Date();
  const validation = validatePlan(plan);

  const result = {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    project: plan.project,
    registry: plan.registry,
    namespace: plan.namespace,
    dockerfile: plan.dockerfile,
    context: plan.context,
    target: plan.target,
    image_refs: plan.image_refs,
    tags: plan.tags,
    platforms: plan.platforms,
    push: plan.push,
    load: plan.load,
    use_buildx: plan.use_buildx,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    dockerfile_hash: plan.dockerfile_hash,
    context_hash: plan.context_hash,
    validation,
    command: null,
    errors: [],
    warnings: validation.warnings,
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Building"} Docker image ${plan.name}.`,
    );

    const commandArgs = buildCommandArgs(plan, repoRoot);
    const command = runCommand(
      {
        command: "docker",
        args: commandArgs,
        cwd: repoRoot,
        display: commandDisplay("docker", commandArgs),
        input: "",
      },
      args,
    );

    result.command = sanitizeCommand(command);

    if (!command.success) {
      result.status = "failed";
      result.errors.push(
        command.error ||
          command.stderr ||
          `Docker build failed for ${plan.name}.`,
      );
      return result;
    }

    result.status = args.dry_run ? "planned" : plan.push ? "pushed" : "built";
    result.success = true;
    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

async function executePlans(plans, args, repoRoot) {
  const docker = dockerAvailable(args, repoRoot);
  const results = [];
  let stoppedEarly = false;

  if (!docker.ok) {
    return {
      docker,
      login: {
        requested: false,
        status: "skipped",
        success: false,
        command: null,
        errors: [],
      },
      results,
      stopped_early: false,
      blocked: true,
      block_reason: docker.error,
    };
  }

  const login = loginIfNeeded(args, repoRoot);

  if (!login.success) {
    return {
      docker,
      login,
      results,
      stopped_early: false,
      blocked: true,
      block_reason: login.errors.join("; "),
    };
  }

  for (const plan of plans.selected_images) {
    const result = buildImage(plan, args, repoRoot);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first Docker image build failure.");
      break;
    }
  }

  return {
    docker,
    login,
    results,
    stopped_early: stoppedEarly,
    blocked: false,
    block_reason: "",
  };
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (value < 1000) return `${value}ms`;

  const seconds = value / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

function summarizeResults(results) {
  const durationMs = results.reduce(
    (sum, result) => sum + Number(result.duration_ms || 0),
    0,
  );

  return {
    images: results.length,
    built: results.filter((result) => result.status === "built").length,
    pushed: results.filter((result) => result.status === "pushed").length,
    planned: results.filter((result) => result.status === "planned").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    image_refs: [...new Set(results.flatMap((result) => result.image_refs))]
      .length,
    platforms: [...new Set(results.flatMap((result) => result.platforms))]
      .length,
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: results.every((result) => result.success),
  };
}

function groupResults(results, key) {
  const groups = {};

  for (const result of results) {
    const group = result[key] || "unknown";

    if (!groups[group]) {
      groups[group] = {
        count: 0,
        built: 0,
        pushed: 0,
        planned: 0,
        failed: 0,
        invalid: 0,
        image_refs: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "built") groups[group].built += 1;
    if (result.status === "pushed") groups[group].pushed += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    groups[group].image_refs += result.image_refs.length;
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, plans, execution) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results);
  const status = execution.blocked
    ? "blocked"
    : totals.failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : execution.results.length === 0
          ? "empty"
          : args.dry_run
            ? "planned"
            : totals.pushed > 0
              ? "pushed"
              : "built";

  return {
    schema_version: 1,
    type: "docker-build-images",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      dockerfiles_file: plans.dockerfiles_file,
      dockerfiles_available: plans.dockerfiles_available,
      affected_projects_file: plans.affected_projects_file,
      affected_projects_available: plans.affected_projects_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      registry: args.registry,
      namespace: args.namespace,
      use_buildx: args.use_buildx,
      push: args.push,
      load: args.load,
      pull: args.pull,
      no_cache: args.no_cache,
      affected_only: args.affected_only,
      max_images: args.max_images,
      dry_run: args.dry_run,
    },
    docker: {
      available: execution.docker.ok,
      error: execution.docker.error,
      command: execution.docker.command
        ? sanitizeCommand(execution.docker.command)
        : null,
    },
    login: execution.login,
    discovery: {
      discovered_images: plans.discovered_images,
      selected_images: plans.selected_images.length,
      affected_projects: plans.affected.projects.length,
      affected_files: plans.affected.files.length,
    },
    selected_images: plans.selected_images.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      name: plan.name,
      project: plan.project,
      registry: plan.registry,
      namespace: plan.namespace,
      dockerfile: plan.dockerfile,
      context: plan.context,
      target: plan.target,
      image_refs: plan.image_refs,
      tags: plan.tags,
      platforms: plan.platforms,
      push: plan.push,
      load: plan.load,
      use_buildx: plan.use_buildx,
      dockerfile_exists: plan.dockerfile_exists,
      context_exists: plan.context_exists,
      dockerfile_hash: plan.dockerfile_hash,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_project: groupResults(execution.results, "project"),
      by_registry: groupResults(execution.results, "registry"),
    },
    results: execution.results,
    image_refs: [
      ...new Set(execution.results.flatMap((result) => result.image_refs)),
    ].sort(),
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const lines = [
    `# 🐳 ${PROJECT_NAME} Docker Images`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    `- Selected images: \`${report.discovery.selected_images}\``,
    `- Built: \`${report.totals.built}\``,
    `- Pushed: \`${report.totals.pushed}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## ⚙️ Build Configuration",
    "",
    `- Registry: \`${report.config.registry}\``,
    `- Namespace: \`${report.config.namespace}\``,
    `- Buildx: \`${report.config.use_buildx ? "true" : "false"}\``,
    `- Push: \`${report.config.push ? "true" : "false"}\``,
    `- Load: \`${report.config.load ? "true" : "false"}\``,
    `- Pull: \`${report.config.pull ? "true" : "false"}\``,
    `- No cache: \`${report.config.no_cache ? "true" : "false"}\``,
    `- Affected only: \`${report.config.affected_only ? "true" : "false"}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (report.block_reason) {
    lines.push(`Blocked reason: ${report.block_reason}`);
    lines.push("");
  }

  lines.push("## 🎯 Selected Images");
  lines.push("");

  if (!report.selected_images.length) {
    lines.push("No Docker images were selected.");
  } else {
    lines.push(
      "| Image | Project | Dockerfile | Context | Tags | Platforms | Push |",
    );
    lines.push("|---|---|---|---|---|---|---:|");

    for (const image of report.selected_images) {
      lines.push(
        `| \`${image.name}\` | \`${image.project || "none"}\` | \`${image.dockerfile}\` | \`${image.context}\` | ${image.tags.map((tag) => `\`${tag}\``).join(", ")} | ${image.platforms.length ? image.platforms.map((platform) => `\`${platform}\``).join(", ") : "`default`"} | \`${image.push ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Build Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No Docker build results were produced.");
  } else {
    lines.push("| Status | Image | Project | Refs | Duration |");
    lines.push("|---|---|---|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.name}\` | \`${result.project || "none"}\` | \`${result.image_refs.length}\` | \`${formatDuration(result.duration_ms)}\` |`,
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

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Image | Status | Errors |");
    lines.push("|---|---|---|");

    for (const failure of report.failures) {
      lines.push(
        `| \`${failure.name}\` | \`${failure.status}\` | ${failure.errors.map(escapeMarkdown).join("<br>")} |`,
      );
    }
  }

  const warnings = report.results.flatMap((result) =>
    result.warnings.map((warning) => ({
      image: result.name,
      warning,
    })),
  );

  if (warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of warnings) {
      lines.push(`- \`${warning.image}\`: ${warning.warning}`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Dockerfiles file: \`${report.config.dockerfiles_file}\``);
  lines.push(
    `- Dockerfiles available: \`${report.config.dockerfiles_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Affected projects file: \`${report.config.affected_projects_file}\``,
  );
  lines.push(
    `- Affected projects available: \`${report.config.affected_projects_available ? "true" : "false"}\``,
  );

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
  setGitHubOutput("docker_build_images_file", report.config.output_file);
  setGitHubOutput(
    "docker_build_images_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("docker_build_images_status", report.status);
  setGitHubOutput(
    "docker_build_images_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "docker_build_images_selected",
    String(report.discovery.selected_images),
  );
  setGitHubOutput("docker_build_images_built", String(report.totals.built));
  setGitHubOutput("docker_build_images_pushed", String(report.totals.pushed));
  setGitHubOutput("docker_build_images_planned", String(report.totals.planned));
  setGitHubOutput("docker_build_images_failed", String(report.totals.failed));
  setGitHubOutput("docker_build_images_invalid", String(report.totals.invalid));
  setGitHubOutput(
    "docker_build_images_refs_count",
    String(report.totals.image_refs),
  );
  setGitHubOutput("docker_build_images_refs", report.image_refs.join(","));
  setGitHubOutput(
    "docker_build_images_refs_json",
    JSON.stringify(report.image_refs),
  );
  setGitHubOutput(
    "docker_build_images_names",
    report.selected_images.map((image) => image.name).join(","),
  );
  setGitHubOutput(
    "docker_build_images_names_json",
    JSON.stringify(report.selected_images.map((image) => image.name)),
  );
  setGitHubOutput(
    "docker_build_images_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Docker image builds.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.selected_images.length === 0) {
    logger.error("No Docker images were selected.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          docker: {
            ok: true,
            command: null,
            error: "",
          },
          login: {
            requested: false,
            status: "skipped",
            success: true,
            command: null,
            errors: [],
          },
          results: [],
          stopped_early: false,
          blocked: false,
          block_reason: "",
        }
      : await executePlans(plans, args, repoRoot);

  const report = createReport(args, repoRoot, plans, execution);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

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
    console.log(json.trim());
  }

  if (args.fail_if_empty && report.discovery.selected_images === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Docker image build blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Docker image builds completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
