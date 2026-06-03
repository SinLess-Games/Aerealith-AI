#!/usr/bin/env node
// .github/scripts/docker/publish-images.js
// =============================================================================
// Aerealith AI — Docker Image Publisher
// -----------------------------------------------------------------------------
// Purpose:
//   Publish Docker image references produced by Docker build discovery/build
//   artifacts, local config, or direct CLI inputs.
//
// Input:
//   - .github/docker/publish-images.json
//   - .github/docker/publish-images.jsonc
//   - .github/docker/publish-images.yaml
//   - .github/docker/publish-images.yml
//   - artifacts/docker/build-images.json
//   - artifacts/ci/dockerfiles.json
//
// Output:
//   - artifacts/docker/publish-images.json
//   - artifacts/docker/publish-images.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses Docker CLI.
//   - Push is enabled by default because this script is only for publishing.
//   - Docker login is optional.
//   - Dry-run mode reports docker tag/push commands without mutating Docker.
//   - Secrets are redacted from logs, reports, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[docker-publish] ${message}`),
    warn: (message) => console.warn(`[docker-publish] WARN: ${message}`),
    error: (message) => console.error(`[docker-publish] ERROR: ${message}`),
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
  ".github/docker/publish-images.json",
  ".github/docker/publish-images.jsonc",
  ".github/docker/publish-images.yaml",
  ".github/docker/publish-images.yml",
  ".github/docker/images.json",
  ".github/docker/images.jsonc",
  ".github/docker/images.yaml",
  ".github/docker/images.yml",
  "docker/publish-images.json",
  "docker/publish-images.jsonc",
  "docker/publish-images.yaml",
  "docker/publish-images.yml",
  "docker/images.json",
  "docker/images.jsonc",
  "docker/images.yaml",
  "docker/images.yml",
];

const DEFAULT_BUILD_REPORT_FILE = "artifacts/docker/build-images.json";
const DEFAULT_DOCKERFILES_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_OUTPUT_FILE = "artifacts/docker/publish-images.json";
const DEFAULT_SUMMARY_FILE = "artifacts/docker/publish-images.md";

const DEFAULT_REGISTRY = "ghcr.io";
const DEFAULT_IMAGE_NAMESPACE = "sinless-games";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|password\s*=\s*[^\s]+|--password\s+[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

    config_file: process.env.DOCKER_PUBLISH_IMAGES_CONFIG_FILE || "",
    build_report_file:
      process.env.DOCKER_PUBLISH_IMAGES_BUILD_REPORT_FILE ||
      DEFAULT_BUILD_REPORT_FILE,
    dockerfiles_file:
      process.env.DOCKER_PUBLISH_IMAGES_DOCKERFILES_FILE ||
      DEFAULT_DOCKERFILES_FILE,

    output_file:
      process.env.DOCKER_PUBLISH_IMAGES_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.DOCKER_PUBLISH_IMAGES_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    registry:
      process.env.DOCKER_PUBLISH_IMAGES_REGISTRY ||
      process.env.CONTAINER_REGISTRY ||
      DEFAULT_REGISTRY,
    namespace:
      process.env.DOCKER_PUBLISH_IMAGES_NAMESPACE ||
      process.env.DOCKER_IMAGE_NAMESPACE ||
      DEFAULT_IMAGE_NAMESPACE,

    source_image:
      process.env.DOCKER_PUBLISH_SOURCE_IMAGE ||
      process.env.DOCKER_SOURCE_IMAGE ||
      "",
    target_image:
      process.env.DOCKER_PUBLISH_TARGET_IMAGE ||
      process.env.DOCKER_TARGET_IMAGE ||
      "",
    image: process.env.DOCKER_PUBLISH_IMAGE || process.env.DOCKER_IMAGE || "",
    image_name:
      process.env.DOCKER_PUBLISH_IMAGE_NAME ||
      process.env.DOCKER_IMAGE_NAME ||
      "",

    source_refs: normalizeStringList(process.env.DOCKER_PUBLISH_SOURCE_REFS),
    target_refs: normalizeStringList(process.env.DOCKER_PUBLISH_TARGET_REFS),
    tags: normalizeStringList(process.env.DOCKER_PUBLISH_IMAGES_TAGS),
    target_tags: normalizeStringList(
      process.env.DOCKER_PUBLISH_IMAGES_TARGET_TAGS,
    ),

    include_images: normalizeStringList(
      process.env.DOCKER_PUBLISH_IMAGES_INCLUDE,
    ),
    exclude_images: normalizeStringList(
      process.env.DOCKER_PUBLISH_IMAGES_EXCLUDE,
    ),
    include_projects: normalizeStringList(
      process.env.DOCKER_PUBLISH_IMAGES_INCLUDE_PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.DOCKER_PUBLISH_IMAGES_EXCLUDE_PROJECTS,
    ),

    use_config: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_USE_CONFIG,
      true,
    ),
    use_build_report: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_USE_BUILD_REPORT,
      true,
    ),
    use_dockerfiles: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_USE_DOCKERFILES,
      true,
    ),

    retag: normalizeBoolean(process.env.DOCKER_PUBLISH_IMAGES_RETAG, true),
    push: normalizeBoolean(process.env.DOCKER_PUBLISH_IMAGES_PUSH, true),
    pull_before_publish: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_PULL,
      false,
    ),
    verify_after_publish: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_VERIFY,
      false,
    ),
    inspect_local: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_INSPECT_LOCAL,
      false,
    ),

    login: normalizeBoolean(process.env.DOCKER_PUBLISH_IMAGES_LOGIN, false),
    login_registry:
      process.env.DOCKER_PUBLISH_IMAGES_LOGIN_REGISTRY ||
      process.env.DOCKER_LOGIN_REGISTRY ||
      "",
    login_username:
      process.env.DOCKER_PUBLISH_IMAGES_LOGIN_USERNAME ||
      process.env.DOCKER_USERNAME ||
      process.env.GITHUB_ACTOR ||
      "",
    login_password:
      process.env.DOCKER_PUBLISH_IMAGES_LOGIN_PASSWORD ||
      process.env.DOCKER_PASSWORD ||
      process.env.GITHUB_TOKEN ||
      "",

    fail_if_empty: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_CONTINUE_ON_ERROR,
      false,
    ),

    max_images: normalizeInteger(
      process.env.DOCKER_PUBLISH_IMAGES_MAX_IMAGES,
      0,
    ),
    max_refs: normalizeInteger(process.env.DOCKER_PUBLISH_IMAGES_MAX_REFS, 0),
    timeout_minutes: normalizeInteger(
      process.env.DOCKER_PUBLISH_IMAGES_TIMEOUT_MINUTES,
      30,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.DOCKER_PUBLISH_IMAGES_MAX_BUFFER_MB,
      128,
    ),

    dry_run: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_WRITE_SUMMARY,
      true,
    ),
    print: normalizeBoolean(process.env.DOCKER_PUBLISH_IMAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.DOCKER_PUBLISH_IMAGES_STEP_SUMMARY,
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

    if (arg === "--build-report") {
      args.build_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dockerfiles") {
      args.dockerfiles_file = argv[index + 1];
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

    if (arg === "--source-image" || arg === "--source") {
      args.source_image = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target-image" || arg === "--target") {
      args.target_image = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-ref" || arg === "--source-refs") {
      args.source_refs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--target-ref" || arg === "--target-refs") {
      args.target_refs.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--tag" || arg === "--tags" || arg === "-t") {
      args.tags.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--target-tag" || arg === "--target-tags") {
      args.target_tags.push(...normalizeStringList(argv[index + 1]));
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

    if (arg === "--use-config") {
      args.use_config = true;
      continue;
    }

    if (arg === "--no-config") {
      args.use_config = false;
      continue;
    }

    if (arg === "--use-build-report") {
      args.use_build_report = true;
      continue;
    }

    if (arg === "--no-build-report") {
      args.use_build_report = false;
      continue;
    }

    if (arg === "--use-dockerfiles") {
      args.use_dockerfiles = true;
      continue;
    }

    if (arg === "--no-dockerfiles") {
      args.use_dockerfiles = false;
      continue;
    }

    if (arg === "--retag") {
      args.retag = true;
      continue;
    }

    if (arg === "--no-retag") {
      args.retag = false;
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

    if (arg === "--pull") {
      args.pull_before_publish = true;
      continue;
    }

    if (arg === "--no-pull") {
      args.pull_before_publish = false;
      continue;
    }

    if (arg === "--verify") {
      args.verify_after_publish = true;
      continue;
    }

    if (arg === "--no-verify") {
      args.verify_after_publish = false;
      continue;
    }

    if (arg === "--inspect-local") {
      args.inspect_local = true;
      continue;
    }

    if (arg === "--no-inspect-local") {
      args.inspect_local = false;
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

    if (arg === "--max-refs") {
      args.max_refs = normalizeInteger(argv[index + 1], args.max_refs);
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
  args.source_refs = [...new Set(args.source_refs)];
  args.target_refs = [...new Set(args.target_refs)];
  args.tags = [...new Set(args.tags.map(normalizeTag).filter(Boolean))];
  args.target_tags = [
    ...new Set(args.target_tags.map(normalizeTag).filter(Boolean)),
  ];
  args.include_images = [...new Set(args.include_images)];
  args.exclude_images = [...new Set(args.exclude_images)];
  args.include_projects = [...new Set(args.include_projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.max_images = Math.max(0, args.max_images);
  args.max_refs = Math.max(0, args.max_refs);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Docker Image Publisher

Usage:
  node .github/scripts/docker/publish-images.js [options]

Examples:
  node .github/scripts/docker/publish-images.js --dry-run
  node .github/scripts/docker/publish-images.js --login
  node .github/scripts/docker/publish-images.js --source-image aerealith-api:local --target-image ghcr.io/sinless-games/aerealith-api:latest
  node .github/scripts/docker/publish-images.js --build-report artifacts/docker/build-images.json --registry ghcr.io --namespace sinless-games

Options:
      --repo <owner/repo>              Repository slug.
      --config <file>                  Publish config file.
      --build-report <file>            Build report artifact. Default: artifacts/docker/build-images.json.
      --dockerfiles <file>             Dockerfiles artifact. Default: artifacts/ci/dockerfiles.json.
      --registry <registry>            Target registry. Default: ghcr.io.
      --namespace <namespace>          Target namespace/org. Default: sinless-games.
      --image <image>                  Source image shorthand.
      --image-name <name>              Image name for generated target refs.
      --source-image <ref>             Source image ref.
      --target-image <ref>             Target image ref.
      --source-ref <list>              Source image ref list.
      --target-ref <list>              Target image ref list.
  -t, --tag <list>                     Source or generated tags.
      --target-tag <list>              Target tags.
      --include <list>                 Include image names.
      --exclude <list>                 Exclude image names.
      --include-project <list>         Include project names.
      --exclude-project <list>         Exclude project names.
      --use-config                     Use publish config. Default.
      --no-config                      Ignore publish config.
      --use-build-report               Use Docker build report. Default.
      --no-build-report                Ignore Docker build report.
      --use-dockerfiles                Use Dockerfiles artifact as fallback. Default.
      --no-dockerfiles                 Ignore Dockerfiles artifact.
      --retag                          Tag source refs to target refs. Default.
      --no-retag                       Do not retag before pushing.
      --push                           Push image refs. Default.
      --no-push                        Plan/tag only; do not push.
      --pull                           Pull source images before publishing.
      --verify                         Verify target refs after push.
      --inspect-local                  Inspect source refs locally before publish.
      --login                          Run docker login before publish.
      --login-registry <registry>      Registry for docker login.
      --login-username <username>      Registry username.
      --login-password <password>      Registry password/token.
      --fail-if-empty                  Exit non-zero when no images are selected.
      --fail-on-error                  Exit non-zero on publish failure. Default.
      --no-fail-on-error               Do not fail when publish fails.
      --continue-on-error              Continue after a publish failure.
      --no-continue-on-error           Stop after first failure. Default.
      --max-images <number>            Maximum image plans to publish.
      --max-refs <number>              Maximum refs per image plan.
      --timeout-minutes <number>       Per command timeout. Default: 30.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not mutate Docker.
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

function parseSimplePublishYaml(text) {
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

      if (
        section === "images" ||
        section === "docker_images" ||
        section === "publish"
      ) {
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
      (section === "images" ||
        section === "docker_images" ||
        section === "publish") &&
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
    return parseSimplePublishYaml(text);
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
    normalizeString(value, "docker-publish")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "") || "docker-publish"
  );
}

function imageHasTag(ref) {
  const value = normalizeString(ref);
  const slashIndex = value.lastIndexOf("/");
  const colonIndex = value.lastIndexOf(":");

  return colonIndex > slashIndex;
}

function removeImageTag(ref) {
  const value = normalizeString(ref);

  if (!imageHasTag(value)) return value;

  return value.slice(0, value.lastIndexOf(":"));
}

function imageTag(ref) {
  const value = normalizeString(ref);

  if (!imageHasTag(value)) return "";

  return value.slice(value.lastIndexOf(":") + 1);
}

function imageNameFromRef(ref) {
  const repo = removeImageTag(ref);
  const parts = repo.split("/");

  return normalizeImageName(parts[parts.length - 1] || repo);
}

function createRepository(registry, namespace, name) {
  return [
    normalizeRegistry(registry),
    normalizeImagePathPart(namespace),
    normalizeImageName(name),
  ]
    .filter(Boolean)
    .join("/");
}

function refsFromImageAndTags(image, tags) {
  const value = normalizeString(image);

  if (!value) return [];

  if (imageHasTag(value)) return [value];

  const normalizedTags = normalizeStringList(tags)
    .map(normalizeTag)
    .filter(Boolean);
  const effectiveTags = normalizedTags.length ? normalizedTags : ["latest"];

  return effectiveTags.map((tag) => `${value}:${tag}`);
}

function configImageRecords(config) {
  if (!config) return [];

  const records = [
    ...(Array.isArray(config.publish) ? config.publish : []),
    ...(Array.isArray(config.images) ? config.images : []),
    ...(Array.isArray(config.docker_images) ? config.docker_images : []),
    ...(Array.isArray(config.dockerImages) ? config.dockerImages : []),
  ];

  if (config.image && typeof config.image === "object") {
    records.push(config.image);
  }

  if (
    !records.length &&
    (config.source_image ||
      config.sourceImage ||
      config.target_image ||
      config.targetImage ||
      config.image ||
      config.name ||
      config.image_name)
  ) {
    records.push(config);
  }

  return records;
}

function buildReportRecords(buildReport) {
  if (!buildReport) return [];

  const selectedImages = Array.isArray(buildReport.selected_images)
    ? buildReport.selected_images
    : [];
  const results = Array.isArray(buildReport.results) ? buildReport.results : [];

  const records = [];

  for (const image of selectedImages) {
    records.push({
      name: image.name || image.image_name,
      project: image.project,
      image_refs: image.image_refs || [],
      tags: image.tags || [],
      registry: image.registry,
      namespace: image.namespace,
      source_type: "build-report",
    });
  }

  for (const result of results) {
    if (
      !result.success &&
      result.status !== "built" &&
      result.status !== "pushed" &&
      result.status !== "planned"
    ) {
      continue;
    }

    records.push({
      name: result.name,
      project: result.project,
      image_refs: result.image_refs || [],
      tags: result.tags || [],
      registry: result.registry,
      namespace: result.namespace,
      source_type: "build-report-result",
    });
  }

  return records;
}

function dockerfilesRecords(dockerfilesArtifact) {
  if (!dockerfilesArtifact) return [];

  const records = [
    ...(Array.isArray(dockerfilesArtifact.images)
      ? dockerfilesArtifact.images
      : []),
    ...(Array.isArray(dockerfilesArtifact.dockerfiles)
      ? dockerfilesArtifact.dockerfiles
      : []),
    ...(Array.isArray(dockerfilesArtifact.targets)
      ? dockerfilesArtifact.targets
      : []),
  ];

  return records.map((record) => ({
    name: record.name || record.image_name,
    project: record.project,
    image_refs: record.image_refs || [],
    tags: record.tags || [],
    registry: record.registry,
    namespace: record.namespace,
    source_type: "dockerfiles-artifact",
  }));
}

function directRecord(args) {
  if (
    !args.image &&
    !args.source_image &&
    !args.target_image &&
    !args.image_name &&
    !args.source_refs.length &&
    !args.target_refs.length
  ) {
    return null;
  }

  return {
    name:
      args.image_name ||
      imageNameFromRef(args.source_image || args.image || args.target_image),
    project:
      args.image_name ||
      imageNameFromRef(args.source_image || args.image || args.target_image),
    source_image: args.source_image || args.image,
    target_image: args.target_image,
    source_refs: args.source_refs,
    target_refs: args.target_refs,
    tags: args.tags,
    target_tags: args.target_tags,
    registry: args.registry,
    namespace: args.namespace,
    source_type: "direct",
  };
}

function createPublishRefs(record, args) {
  const name = normalizeImageName(
    record.name ||
      record.image_name ||
      imageNameFromRef(record.source_image || record.image),
  );
  const registry = normalizeRegistry(
    record.target_registry || record.registry || args.registry,
  );
  const namespace = normalizeImagePathPart(
    record.target_namespace || record.namespace || args.namespace,
  );

  const recordTags = normalizeStringList(record.tags || record.tag || args.tags)
    .map(normalizeTag)
    .filter(Boolean);
  const sourceRefs = [
    ...normalizeStringList(record.source_refs || record.sourceRefs || []),
    ...normalizeStringList(record.image_refs || record.imageRefs || []),
    ...refsFromImageAndTags(
      record.source_image || record.sourceImage || record.image || "",
      recordTags,
    ),
  ];

  const sourceTags = sourceRefs.map(imageTag).filter(Boolean);
  const targetTags = normalizeStringList(
    record.target_tags || record.targetTags || args.target_tags,
  )
    .map(normalizeTag)
    .filter(Boolean);

  const effectiveTargetTags = targetTags.length
    ? targetTags
    : recordTags.length
      ? recordTags
      : sourceTags.length
        ? sourceTags
        : ["latest"];

  const targetRepository =
    record.target_image || record.targetImage
      ? removeImageTag(record.target_image || record.targetImage)
      : createRepository(registry, namespace, name);

  const directTargetRefs = [
    ...normalizeStringList(record.target_refs || record.targetRefs || []),
    ...refsFromImageAndTags(
      record.target_image || record.targetImage || "",
      effectiveTargetTags,
    ),
  ];

  const generatedTargetRefs = directTargetRefs.length
    ? directTargetRefs
    : effectiveTargetTags.map((tag) => `${targetRepository}:${tag}`);

  const cleanSourceRefs = [...new Set(sourceRefs.filter(Boolean))];
  const cleanTargetRefs = [...new Set(generatedTargetRefs.filter(Boolean))];

  const refs = [];

  if (!cleanSourceRefs.length && cleanTargetRefs.length) {
    for (const targetRef of cleanTargetRefs) {
      refs.push({
        source_ref: targetRef,
        target_ref: targetRef,
        tag: imageTag(targetRef),
        retag_required: false,
      });
    }
  } else if (cleanSourceRefs.length === cleanTargetRefs.length) {
    for (let index = 0; index < cleanTargetRefs.length; index += 1) {
      refs.push({
        source_ref: cleanSourceRefs[index],
        target_ref: cleanTargetRefs[index],
        tag:
          imageTag(cleanTargetRefs[index]) || imageTag(cleanSourceRefs[index]),
        retag_required: cleanSourceRefs[index] !== cleanTargetRefs[index],
      });
    }
  } else {
    const primarySourceRef = cleanSourceRefs[0];

    for (const targetRef of cleanTargetRefs) {
      const matchedByTag = cleanSourceRefs.find(
        (sourceRef) => imageTag(sourceRef) === imageTag(targetRef),
      );

      refs.push({
        source_ref: matchedByTag || primarySourceRef,
        target_ref: targetRef,
        tag: imageTag(targetRef) || imageTag(matchedByTag || primarySourceRef),
        retag_required: (matchedByTag || primarySourceRef) !== targetRef,
      });
    }
  }

  const limitedRefs = args.max_refs > 0 ? refs.slice(0, args.max_refs) : refs;

  return limitedRefs;
}

function normalizePublishPlan(record, args, sourceType = "config") {
  const name = normalizeImageName(
    record.name ||
      record.image_name ||
      imageNameFromRef(
        record.source_image || record.image || record.target_image,
      ),
  );
  const project = normalizeString(
    record.project || record.project_name || record.projectName || name,
  );

  const publishRefs = createPublishRefs(record, args);

  return {
    id: safeId(
      `${sourceType}:${name}:${publishRefs.map((item) => item.target_ref).join(",")}`,
    ),
    source_type: record.source_type || sourceType,
    name,
    project,
    registry: normalizeRegistry(
      record.target_registry || record.registry || args.registry,
    ),
    namespace: normalizeImagePathPart(
      record.target_namespace || record.namespace || args.namespace,
    ),
    enabled: normalizeBoolean(record.enabled, true),
    retag: normalizeBoolean(record.retag, args.retag),
    push: normalizeBoolean(record.push, args.push),
    pull_before_publish: normalizeBoolean(
      record.pull_before_publish ?? record.pull,
      args.pull_before_publish,
    ),
    verify_after_publish: normalizeBoolean(
      record.verify_after_publish ?? record.verify,
      args.verify_after_publish,
    ),
    inspect_local: normalizeBoolean(
      record.inspect_local ?? record.inspectLocal,
      args.inspect_local,
    ),
    publish_refs: publishRefs,
  };
}

function planMatchesFilters(plan, args) {
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

  return true;
}

function dedupePlans(plans) {
  const seen = new Map();

  for (const plan of plans) {
    const key = `${plan.name}:${plan.project}`;

    if (!seen.has(key)) {
      seen.set(key, plan);
      continue;
    }

    const existing = seen.get(key);

    seen.set(key, {
      ...existing,
      ...plan,
      publish_refs: dedupePublishRefs([
        ...(existing.publish_refs || []),
        ...(plan.publish_refs || []),
      ]),
      retag: existing.retag || plan.retag,
      push: existing.push || plan.push,
      pull_before_publish:
        existing.pull_before_publish || plan.pull_before_publish,
      verify_after_publish:
        existing.verify_after_publish || plan.verify_after_publish,
      inspect_local: existing.inspect_local || plan.inspect_local,
      source_type:
        existing.source_type === plan.source_type
          ? existing.source_type
          : `${existing.source_type}+${plan.source_type}`,
    });
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.project.localeCompare(right.project)
    );
  });
}

function dedupePublishRefs(refs) {
  const seen = new Map();

  for (const ref of refs) {
    const key = `${ref.source_ref}->${ref.target_ref}`;

    if (!seen.has(key)) {
      seen.set(key, ref);
    }
  }

  return [...seen.values()].sort((left, right) => {
    return (
      left.target_ref.localeCompare(right.target_ref) ||
      left.source_ref.localeCompare(right.source_ref)
    );
  });
}

function createPlans(args, repoRoot) {
  const configFile = findConfigFile(args, repoRoot);
  const config =
    args.use_config && configFile ? readConfigFile(configFile, repoRoot) : null;
  const buildReport = args.use_build_report
    ? readJsonFile(args.build_report_file, repoRoot, null)
    : null;
  const dockerfilesArtifact = args.use_dockerfiles
    ? readJsonFile(args.dockerfiles_file, repoRoot, null)
    : null;
  const direct = directRecord(args);

  const records = [
    ...(args.use_config ? configImageRecords(config) : []),
    ...(args.use_build_report ? buildReportRecords(buildReport) : []),
    ...(args.use_dockerfiles && !buildReport
      ? dockerfilesRecords(dockerfilesArtifact)
      : []),
    ...(direct ? [direct] : []),
  ];

  const selected = dedupePlans(
    records.map((record) =>
      normalizePublishPlan(record, args, record.source_type || "config"),
    ),
  )
    .filter((plan) => planMatchesFilters(plan, args))
    .slice(0, args.max_images > 0 ? args.max_images : undefined);

  return {
    config_file: configFile,
    config_available: Boolean(config),
    build_report_file: toRelativePath(
      resolvePath(args.build_report_file, repoRoot),
      repoRoot,
    ),
    build_report_available: Boolean(buildReport),
    dockerfiles_file: toRelativePath(
      resolvePath(args.dockerfiles_file, repoRoot),
      repoRoot,
    ),
    dockerfiles_available: Boolean(dockerfilesArtifact),
    discovered_images: records.length,
    selected_images: selected,
  };
}

function validatePlan(plan) {
  const errors = [];
  const warnings = [];

  if (!plan.name) {
    errors.push("Publish plan is missing an image name.");
  }

  if (!plan.publish_refs.length) {
    errors.push("Publish plan produced no image references.");
  }

  for (const ref of plan.publish_refs) {
    if (!ref.source_ref) {
      errors.push(
        `Missing source image ref for target ${ref.target_ref || "unknown"}.`,
      );
    }

    if (!ref.target_ref) {
      errors.push(
        `Missing target image ref for source ${ref.source_ref || "unknown"}.`,
      );
    }

    if (ref.source_ref && !imageHasTag(ref.source_ref)) {
      warnings.push(`Source image ref has no explicit tag: ${ref.source_ref}`);
    }

    if (ref.target_ref && !imageHasTag(ref.target_ref)) {
      warnings.push(`Target image ref has no explicit tag: ${ref.target_ref}`);
    }
  }

  if (!plan.push) {
    warnings.push("Push is disabled for this plan.");
  }

  if (
    !plan.retag &&
    plan.publish_refs.some((ref) => ref.source_ref !== ref.target_ref)
  ) {
    warnings.push(
      "Retag is disabled, but at least one target ref differs from its source ref.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
  };
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

function dockerCommand(repoRoot, args, dockerArgs) {
  return runCommand(
    {
      command: "docker",
      args: dockerArgs,
      cwd: repoRoot,
      display: commandDisplay("docker", dockerArgs),
      input: "",
    },
    args,
  );
}

function publishRef(ref, plan, args, repoRoot) {
  const startedAt = new Date();

  const result = {
    source_ref: ref.source_ref,
    target_ref: ref.target_ref,
    tag: ref.tag,
    retag_required: ref.retag_required,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    inspect_local_command: null,
    pull_command: null,
    tag_command: null,
    push_command: null,
    verify_command: null,
    errors: [],
    warnings: [],
  };

  try {
    if (plan.inspect_local) {
      const inspectCommand = dockerCommand(repoRoot, args, [
        "image",
        "inspect",
        ref.source_ref,
      ]);
      result.inspect_local_command = sanitizeCommand(inspectCommand);

      if (!inspectCommand.success) {
        result.status = "failed";
        result.errors.push(
          inspectCommand.error ||
            inspectCommand.stderr ||
            `Source image is not available locally: ${ref.source_ref}`,
        );
        return result;
      }
    }

    if (plan.pull_before_publish) {
      const pullCommand = dockerCommand(repoRoot, args, [
        "pull",
        ref.source_ref,
      ]);
      result.pull_command = sanitizeCommand(pullCommand);

      if (!pullCommand.success) {
        result.status = "failed";
        result.errors.push(
          pullCommand.error ||
            pullCommand.stderr ||
            `Failed to pull ${ref.source_ref}.`,
        );
        return result;
      }
    }

    if (plan.retag && ref.source_ref !== ref.target_ref) {
      const tagCommand = dockerCommand(repoRoot, args, [
        "tag",
        ref.source_ref,
        ref.target_ref,
      ]);
      result.tag_command = sanitizeCommand(tagCommand);

      if (!tagCommand.success) {
        result.status = "failed";
        result.errors.push(
          tagCommand.error ||
            tagCommand.stderr ||
            `Failed to tag ${ref.source_ref} as ${ref.target_ref}.`,
        );
        return result;
      }
    }

    if (plan.push) {
      const pushCommand = dockerCommand(repoRoot, args, [
        "push",
        ref.target_ref,
      ]);
      result.push_command = sanitizeCommand(pushCommand);

      if (!pushCommand.success) {
        result.status = "failed";
        result.errors.push(
          pushCommand.error ||
            pushCommand.stderr ||
            `Failed to push ${ref.target_ref}.`,
        );
        return result;
      }
    }

    if (plan.verify_after_publish && plan.push) {
      const verifyCommand = dockerCommand(repoRoot, args, [
        "manifest",
        "inspect",
        ref.target_ref,
      ]);
      result.verify_command = sanitizeCommand(verifyCommand);

      if (!verifyCommand.success) {
        result.status = "failed";
        result.errors.push(
          verifyCommand.error ||
            verifyCommand.stderr ||
            `Failed to verify published image ${ref.target_ref}.`,
        );
        return result;
      }
    }

    result.status = args.dry_run
      ? "planned"
      : plan.push
        ? "published"
        : ref.source_ref !== ref.target_ref && plan.retag
          ? "tagged"
          : "skipped";
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

function publishImage(plan, args, repoRoot) {
  const startedAt = new Date();
  const validation = validatePlan(plan);

  const result = {
    id: plan.id,
    source_type: plan.source_type,
    name: plan.name,
    project: plan.project,
    registry: plan.registry,
    namespace: plan.namespace,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    retag: plan.retag,
    push: plan.push,
    pull_before_publish: plan.pull_before_publish,
    verify_after_publish: plan.verify_after_publish,
    inspect_local: plan.inspect_local,
    publish_refs: plan.publish_refs,
    ref_results: [],
    validation,
    errors: [],
    warnings: validation.warnings,
    totals: {
      refs: plan.publish_refs.length,
      planned: 0,
      tagged: 0,
      published: 0,
      skipped: 0,
      failed: 0,
    },
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Publishing"} Docker image ${plan.name}.`,
    );

    for (const ref of plan.publish_refs) {
      const refResult = publishRef(ref, plan, args, repoRoot);
      result.ref_results.push(refResult);

      if (!refResult.success && !args.continue_on_error) {
        break;
      }
    }

    result.totals.planned = result.ref_results.filter(
      (item) => item.status === "planned",
    ).length;
    result.totals.tagged = result.ref_results.filter(
      (item) => item.status === "tagged",
    ).length;
    result.totals.published = result.ref_results.filter(
      (item) => item.status === "published",
    ).length;
    result.totals.skipped = result.ref_results.filter(
      (item) => item.status === "skipped",
    ).length;
    result.totals.failed = result.ref_results.filter(
      (item) => item.status === "failed",
    ).length;

    if (result.totals.failed > 0) {
      result.status = "failed";
      result.errors.push(
        `${result.totals.failed} image reference(s) failed to publish.`,
      );
      return result;
    }

    result.status = args.dry_run
      ? "planned"
      : result.totals.published > 0
        ? "published"
        : result.totals.tagged > 0
          ? "tagged"
          : "skipped";
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
    const result = publishImage(plan, args, repoRoot);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn("Stopping after first Docker image publish failure.");
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
    published: results.filter((result) => result.status === "published").length,
    tagged: results.filter((result) => result.status === "tagged").length,
    planned: results.filter((result) => result.status === "planned").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    refs: results.reduce((sum, result) => sum + result.totals.refs, 0),
    ref_published: results.reduce(
      (sum, result) => sum + result.totals.published,
      0,
    ),
    ref_tagged: results.reduce((sum, result) => sum + result.totals.tagged, 0),
    ref_planned: results.reduce(
      (sum, result) => sum + result.totals.planned,
      0,
    ),
    ref_skipped: results.reduce(
      (sum, result) => sum + result.totals.skipped,
      0,
    ),
    ref_failed: results.reduce((sum, result) => sum + result.totals.failed, 0),
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
        published: 0,
        tagged: 0,
        planned: 0,
        skipped: 0,
        failed: 0,
        invalid: 0,
        refs: 0,
      };
    }

    groups[group].count += 1;
    if (result.status === "published") groups[group].published += 1;
    if (result.status === "tagged") groups[group].tagged += 1;
    if (result.status === "planned") groups[group].planned += 1;
    if (result.status === "skipped") groups[group].skipped += 1;
    if (result.status === "failed") groups[group].failed += 1;
    if (result.status === "invalid") groups[group].invalid += 1;
    groups[group].refs += result.totals.refs;
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
    : totals.failed > 0 || totals.ref_failed > 0
      ? "failed"
      : totals.invalid > 0
        ? "invalid"
        : execution.results.length === 0
          ? "empty"
          : args.dry_run
            ? "planned"
            : totals.published > 0
              ? "published"
              : totals.tagged > 0
                ? "tagged"
                : "skipped";

  const publishedRefs = [
    ...new Set(
      execution.results.flatMap((result) =>
        result.ref_results
          .filter((refResult) => refResult.success)
          .map((refResult) => refResult.target_ref),
      ),
    ),
  ].sort();

  return {
    schema_version: 1,
    type: "docker-publish-images",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: plans.config_file || null,
      config_available: plans.config_available,
      build_report_file: plans.build_report_file,
      build_report_available: plans.build_report_available,
      dockerfiles_file: plans.dockerfiles_file,
      dockerfiles_available: plans.dockerfiles_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      registry: args.registry,
      namespace: args.namespace,
      retag: args.retag,
      push: args.push,
      pull_before_publish: args.pull_before_publish,
      verify_after_publish: args.verify_after_publish,
      inspect_local: args.inspect_local,
      max_images: args.max_images,
      max_refs: args.max_refs,
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
    },
    selected_images: plans.selected_images.map((plan) => ({
      id: plan.id,
      source_type: plan.source_type,
      name: plan.name,
      project: plan.project,
      registry: plan.registry,
      namespace: plan.namespace,
      retag: plan.retag,
      push: plan.push,
      pull_before_publish: plan.pull_before_publish,
      verify_after_publish: plan.verify_after_publish,
      inspect_local: plan.inspect_local,
      publish_refs: plan.publish_refs,
    })),
    totals,
    groups: {
      by_status: groupResults(execution.results, "status"),
      by_project: groupResults(execution.results, "project"),
      by_registry: groupResults(execution.results, "registry"),
    },
    results: execution.results,
    published_refs: publishedRefs,
    failures: execution.results.filter((result) => !result.success),
    stopped_early: execution.stopped_early,
    blocked: execution.blocked,
    block_reason: execution.block_reason,
    status,
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
    `# 🚢 ${PROJECT_NAME} Docker Image Publish`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Blocked: \`${report.blocked ? "true" : "false"}\``,
    `- Selected images: \`${report.discovery.selected_images}\``,
    `- Published: \`${report.totals.published}\``,
    `- Tagged: \`${report.totals.tagged}\``,
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
    "## ⚙️ Publish Configuration",
    "",
    `- Registry: \`${report.config.registry}\``,
    `- Namespace: \`${report.config.namespace}\``,
    `- Retag: \`${report.config.retag ? "true" : "false"}\``,
    `- Push: \`${report.config.push ? "true" : "false"}\``,
    `- Pull first: \`${report.config.pull_before_publish ? "true" : "false"}\``,
    `- Verify after publish: \`${report.config.verify_after_publish ? "true" : "false"}\``,
    `- Inspect local: \`${report.config.inspect_local ? "true" : "false"}\``,
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
    lines.push("| Image | Project | Source | Target | Refs | Push |");
    lines.push("|---|---|---|---|---:|---:|");

    for (const image of report.selected_images) {
      const firstRef = image.publish_refs[0] || {};
      lines.push(
        `| \`${image.name}\` | \`${image.project || "none"}\` | \`${firstRef.source_ref || "none"}\` | \`${firstRef.target_ref || "none"}\` | \`${image.publish_refs.length}\` | \`${image.push ? "true" : "false"}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🧩 Publish Results");
  lines.push("");

  if (!report.results.length) {
    lines.push("No Docker publish results were produced.");
  } else {
    lines.push(
      "| Status | Image | Project | Refs | Published | Failed | Duration |",
    );
    lines.push("|---|---|---|---:|---:|---:|---:|");

    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.name}\` | \`${result.project || "none"}\` | \`${result.totals.refs}\` | \`${result.totals.published}\` | \`${result.totals.failed}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.published_refs.length) {
    lines.push("");
    lines.push("## 🏷️ Published References");
    lines.push("");

    for (const ref of report.published_refs.slice(0, 100)) {
      lines.push(`- \`${ref}\``);
    }

    if (report.published_refs.length > 100) {
      lines.push(
        `- ...and \`${report.published_refs.length - 100}\` more published reference(s).`,
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
  lines.push(`- Build report file: \`${report.config.build_report_file}\``);
  lines.push(
    `- Build report available: \`${report.config.build_report_available ? "true" : "false"}\``,
  );
  lines.push(`- Dockerfiles file: \`${report.config.dockerfiles_file}\``);
  lines.push(
    `- Dockerfiles available: \`${report.config.dockerfiles_available ? "true" : "false"}\``,
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
  setGitHubOutput("docker_publish_images_file", report.config.output_file);
  setGitHubOutput(
    "docker_publish_images_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("docker_publish_images_status", report.status);
  setGitHubOutput(
    "docker_publish_images_ok",
    report.totals.ok && !report.blocked ? "true" : "false",
  );
  setGitHubOutput(
    "docker_publish_images_selected",
    String(report.discovery.selected_images),
  );
  setGitHubOutput(
    "docker_publish_images_published",
    String(report.totals.published),
  );
  setGitHubOutput("docker_publish_images_tagged", String(report.totals.tagged));
  setGitHubOutput(
    "docker_publish_images_planned",
    String(report.totals.planned),
  );
  setGitHubOutput("docker_publish_images_failed", String(report.totals.failed));
  setGitHubOutput(
    "docker_publish_images_invalid",
    String(report.totals.invalid),
  );
  setGitHubOutput("docker_publish_images_refs", String(report.totals.refs));
  setGitHubOutput(
    "docker_publish_images_ref_published",
    String(report.totals.ref_published),
  );
  setGitHubOutput(
    "docker_publish_images_ref_failed",
    String(report.totals.ref_failed),
  );
  setGitHubOutput(
    "docker_publish_images_published_refs",
    report.published_refs.join(","),
  );
  setGitHubOutput(
    "docker_publish_images_published_refs_json",
    JSON.stringify(report.published_refs),
  );
  setGitHubOutput(
    "docker_publish_images_names",
    report.selected_images.map((image) => image.name).join(","),
  );
  setGitHubOutput(
    "docker_publish_images_names_json",
    JSON.stringify(report.selected_images.map((image) => image.name)),
  );
  setGitHubOutput(
    "docker_publish_images_failures_json",
    JSON.stringify(report.failures),
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Docker image publish.");

  const plans = createPlans(args, repoRoot);

  if (args.fail_if_empty && plans.selected_images.length === 0) {
    logger.error("No Docker images were selected for publish.");
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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_if_empty && report.discovery.selected_images === 0) {
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && report.blocked) {
    logger.error(`Docker image publish blocked: ${report.block_reason}`);
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && !report.totals.ok) {
    logger.error(
      `Docker image publish completed with status "${report.status}". Failed=${report.totals.failed}, invalid=${report.totals.invalid}, ref_failed=${report.totals.ref_failed}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
