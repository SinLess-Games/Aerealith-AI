// .github/scripts/utils/docker.js
// =============================================================================
// Aerealith AI Docker / GHCR Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared Docker helpers for GitHub workflow scripts.
//
// Used by:
//   - .github/scripts/docker/discover-images.js
//   - .github/scripts/docker/build-images.js
//   - .github/scripts/docker/publish-images.js
//   - .github/scripts/docker/create-image-manifest.js
//   - .github/scripts/release/create-github-release.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/artifacts/create-release-evidence.js
//   - .github/scripts/security/run-policy-gate.js
//
// Notes:
//   - Every discovered Dockerfile can produce a container image.
//   - Images are intended for GHCR release publishing.
//   - Default image format:
//       ghcr.io/sinless-games/aerealith-ai/{name}:{version}-{channel}
//   - Supported release channels:
//       alpha, beta, test, release
//   - Build attestations should be created only by release/publish workflows.
//   - Safe for dry-run workflows.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const logger = require("./logger");

const DEFAULT_REGISTRY = "ghcr.io";
const DEFAULT_OWNER = "sinless-games";
const DEFAULT_NAMESPACE = "aerealith-ai";
const DEFAULT_VERSION = "V0.0.0";
const DEFAULT_CHANNEL = "release";

const DEFAULT_DOCKERFILE_NAMES = [
  "Dockerfile",
  "Dockerfile.prod",
  "Dockerfile.production",
  "Dockerfile.release",
  "Dockerfile.worker",
  "Dockerfile.service",
];

const DEFAULT_DISCOVERY_ROOTS = [
  "apps/connectors",
  "apps/engines",
  "apps/frontend",
  "apps/integrations",
  "apps/services",
  "libs",
];

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".github",
  ".nx",
  ".next",
  ".open-next",
  ".turbo",
  ".wrangler",
  "coverage",
  "dist",
  "build",
  "out",
  "node_modules",
  "tmp",
  ".cache",
]);

const DEFAULT_CONTEXT_MARKERS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  ".dockerignore",
];

const DEFAULT_PLATFORMS = ["linux/amd64"];

const DEFAULT_CACHE_TYPE = "gha";

const DEFAULT_LABELS = {
  "org.opencontainers.image.vendor": "SinLess Games LLC",
  "org.opencontainers.image.title": "Aerealith AI",
  "org.opencontainers.image.source":
    "https://github.com/SinLess-Games/Aerealith-AI",
  "org.opencontainers.image.licenses": "MIT",
};

const RELEASE_TAG_PATTERN = /^V[0-9]+\.[0-9]+\.[0-9]+$/;

const VALID_CHANNELS = ["alpha", "beta", "test", "release"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
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

function normalizeVersion(
  version = process.env.RELEASE_VERSION || DEFAULT_VERSION,
) {
  const normalized = normalizeString(version, DEFAULT_VERSION);

  if (!RELEASE_TAG_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid release version. Expected V-prefixed semver, received: ${version}`,
    );
  }

  return normalized;
}

function normalizeChannel(
  channel = process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
) {
  const normalized = normalizeString(channel, DEFAULT_CHANNEL).toLowerCase();

  if (!VALID_CHANNELS.includes(normalized)) {
    throw new Error(
      `Invalid release channel. Expected one of ${VALID_CHANNELS.join(", ")}, received: ${channel}`,
    );
  }

  return normalized;
}

function normalizeBranchName(branchNameOrRef) {
  return normalizeString(branchNameOrRef)
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  return normalizeString(refOrTag)
    .replace(/^refs\/tags\//, "")
    .trim();
}

function isReleaseTag(refOrTag) {
  return RELEASE_TAG_PATTERN.test(normalizeTagName(refOrTag));
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

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const candidates = [
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ];

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, ".git"))) return current;
      if (fs.existsSync(path.join(current, ".github"))) return current;

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath, repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return filePath;

  return path.join(repoRoot, filePath);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, filePath));
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

  if (dryRun) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  return dirPath;
}

function writeJson(filePath, value, options = {}) {
  const dryRun = getDryRun(options);
  const rendered = `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`;

  ensureDir(path.dirname(filePath), options);

  if (dryRun) {
    logger.dryRun(`Would write JSON file: ${filePath}`);
    logger.dump(`planned ${path.basename(filePath)}`, value);
    return filePath;
  }

  fs.writeFileSync(filePath, rendered);
  logger.info(`Wrote ${filePath}.`);

  return filePath;
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

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function shouldIgnoreDirectory(dirName) {
  return DEFAULT_IGNORE_DIRS.has(dirName);
}

function sanitizeImagePart(value, fallback = "image") {
  return normalizeString(value, fallback)
    .replace(/^@/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function sanitizeImageName(value, fallback = "image") {
  return sanitizeImagePart(value, fallback);
}

function sanitizeTag(value, fallback = "latest") {
  return normalizeString(value, fallback)
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRegistry(value = DEFAULT_REGISTRY) {
  return normalizeString(value, DEFAULT_REGISTRY).toLowerCase();
}

function normalizeOwner(value = DEFAULT_OWNER) {
  return sanitizeImagePart(value, DEFAULT_OWNER);
}

function normalizeNamespace(value = DEFAULT_NAMESPACE) {
  return sanitizeImagePart(value, DEFAULT_NAMESPACE);
}

function imageTagFor(version = DEFAULT_VERSION, channel = DEFAULT_CHANNEL) {
  return sanitizeTag(
    `${normalizeVersion(version)}-${normalizeChannel(channel)}`,
  );
}

function createImageRepository(input = {}) {
  const registry = normalizeRegistry(input.registry || DEFAULT_REGISTRY);
  const owner = normalizeOwner(input.owner || DEFAULT_OWNER);
  const namespace = normalizeNamespace(input.namespace || DEFAULT_NAMESPACE);
  const name = sanitizeImageName(input.name || input.image || "image");

  const format =
    input.imageRepositoryFormat ||
    input.image_repository_format ||
    "{registry}/{owner}/{namespace}/{name}";

  return format
    .replaceAll("{registry}", registry)
    .replaceAll("{owner}", owner)
    .replaceAll("{namespace}", namespace)
    .replaceAll("{name}", name);
}

function createImageReference(input = {}) {
  const repository = input.repository || createImageRepository(input);
  const tag =
    input.tag ||
    imageTagFor(
      input.version || DEFAULT_VERSION,
      input.channel || DEFAULT_CHANNEL,
    );

  if (input.referenceFormat || input.reference_format) {
    return normalizeString(input.referenceFormat || input.reference_format)
      .replaceAll("{repository}", repository)
      .replaceAll("{tag}", tag)
      .replaceAll(
        "{version}",
        normalizeVersion(input.version || DEFAULT_VERSION),
      )
      .replaceAll(
        "{channel}",
        normalizeChannel(input.channel || DEFAULT_CHANNEL),
      )
      .replaceAll(
        "{name}",
        sanitizeImageName(input.name || input.image || "image"),
      );
  }

  return `${repository}:${tag}`;
}

function createAdditionalTags(input = {}) {
  const tags = [];

  const repository = input.repository || createImageRepository(input);
  const version = normalizeVersion(input.version || DEFAULT_VERSION);
  const channel = normalizeChannel(input.channel || DEFAULT_CHANNEL);

  tags.push(`${repository}:${version}-${channel}`);

  if (channel === "release") {
    tags.push(`${repository}:${version}`);
    tags.push(`${repository}:latest`);
  } else {
    tags.push(`${repository}:${channel}`);
  }

  for (const extraTag of normalizeStringList(
    input.extraTags || input.extra_tags,
  )) {
    tags.push(
      extraTag.includes("/")
        ? extraTag
        : `${repository}:${sanitizeTag(extraTag)}`,
    );
  }

  return unique(tags);
}

function validateImageReference(reference) {
  const image = normalizeString(reference);

  if (!image) {
    throw new Error("Image reference cannot be empty.");
  }

  if (/\s/.test(image)) {
    throw new Error(`Image reference cannot contain whitespace: ${image}`);
  }

  if (!image.includes("/")) {
    throw new Error(
      `Image reference must include registry/namespace path: ${image}`,
    );
  }

  if (!image.includes(":")) {
    throw new Error(`Image reference must include a tag: ${image}`);
  }

  return true;
}

function discoverDockerfiles(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const roots = normalizeStringList(options.roots || DEFAULT_DISCOVERY_ROOTS);
  const dockerfileNames = normalizeStringList(
    options.dockerfileNames ||
      options.dockerfile_names ||
      DEFAULT_DOCKERFILE_NAMES,
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

      if (entry.isFile() && dockerfileNames.includes(entry.name)) {
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

function findNearestFile(startPath, fileNames, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const names = normalizeStringList(fileNames);
  let current = isDirectory(startPath) ? startPath : path.dirname(startPath);

  while (current.startsWith(repoRoot)) {
    for (const fileName of names) {
      const candidate = path.join(current, fileName);

      if (isFile(candidate)) {
        return toRelativePath(candidate, repoRoot);
      }
    }

    const parent = path.dirname(current);

    if (parent === current) break;

    current = parent;
  }

  return null;
}

function findNearestPackageJson(startPath, options = {}) {
  return findNearestFile(startPath, ["package.json"], options);
}

function findDockerContext(dockerfilePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteDockerfile = resolvePath(dockerfilePath, repoRoot);
  const markerNames = normalizeStringList(
    options.contextMarkers ||
      options.context_markers ||
      DEFAULT_CONTEXT_MARKERS,
  );

  const nearestMarker = findNearestFile(absoluteDockerfile, markerNames, {
    repoRoot,
  });

  if (nearestMarker) {
    const markerPath = resolvePath(nearestMarker, repoRoot);
    return toRelativePath(path.dirname(markerPath), repoRoot);
  }

  return toRelativePath(path.dirname(absoluteDockerfile), repoRoot);
}

function readPackageJson(packageJsonPath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(packageJsonPath, repoRoot);

  if (!isFile(absolutePath)) return null;

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function inferImageNameFromPath(dockerfilePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteDockerfile = resolvePath(dockerfilePath, repoRoot);
  const dockerfileDir = path.dirname(absoluteDockerfile);

  const packageJsonPath = findNearestPackageJson(absoluteDockerfile, {
    repoRoot,
  });

  if (packageJsonPath) {
    const packageJson = readPackageJson(packageJsonPath, {
      repoRoot,
    });

    if (packageJson?.name) {
      return sanitizeImageName(packageJson.name);
    }
  }

  const relativeDir = toRelativePath(dockerfileDir, repoRoot);
  const parts = relativeDir.split("/").filter(Boolean);

  if (parts.length >= 2 && ["apps", "libs"].includes(parts[0])) {
    return sanitizeImageName(parts.slice(1).join("-"));
  }

  return sanitizeImageName(path.basename(dockerfileDir));
}

function inferImageKind(dockerfilePath) {
  const normalized = toPosixPath(dockerfilePath);

  if (normalized.includes("/frontend")) return "frontend";
  if (normalized.includes("/connectors/")) return "connector";
  if (normalized.includes("/engines/")) return "engine";
  if (normalized.includes("/integrations/")) return "integration";
  if (normalized.includes("/services/")) return "service";
  if (normalized.includes("/libs/")) return "library";

  return "container";
}

function readDockerfile(dockerfilePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteDockerfile = resolvePath(dockerfilePath, repoRoot);

  if (!isFile(absoluteDockerfile)) {
    throw new Error(`Dockerfile not found: ${dockerfilePath}`);
  }

  return fs.readFileSync(absoluteDockerfile, "utf8");
}

function parseDockerfileStages(dockerfileContents) {
  const stages = [];

  for (const line of dockerfileContents.split(/\r?\n/)) {
    const match = /^\s*FROM\s+([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?/i.exec(
      line,
    );

    if (!match) continue;

    stages.push({
      base: match[1],
      name: match[2] || null,
    });
  }

  return stages;
}

function hasDockerfileInstruction(dockerfileContents, instruction) {
  const pattern = new RegExp(`^\\s*${instruction}\\s+`, "im");
  return pattern.test(dockerfileContents);
}

function createDockerImageDescriptor(dockerfilePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteDockerfile = resolvePath(dockerfilePath, repoRoot);
  const relativeDockerfile = toRelativePath(absoluteDockerfile, repoRoot);

  const context =
    options.context ||
    findDockerContext(relativeDockerfile, {
      ...options,
      repoRoot,
    });

  const name = sanitizeImageName(
    options.name ||
      inferImageNameFromPath(relativeDockerfile, {
        repoRoot,
      }),
  );

  const version = normalizeVersion(
    options.version || process.env.RELEASE_VERSION || DEFAULT_VERSION,
  );
  const channel = normalizeChannel(
    options.channel || process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
  );

  const repository = createImageRepository({
    ...options,
    name,
  });

  const tags = createAdditionalTags({
    ...options,
    name,
    repository,
    version,
    channel,
  });

  const contents = readDockerfile(relativeDockerfile, {
    repoRoot,
  });

  const packageJsonPath = findNearestPackageJson(absoluteDockerfile, {
    repoRoot,
  });

  return {
    name,
    kind: inferImageKind(relativeDockerfile),
    repository,
    primary_tag: tags[0],
    tags,
    version,
    channel,
    dockerfile: relativeDockerfile,
    context,
    package_json: packageJsonPath,
    dockerfile_sha256: sha256File(absoluteDockerfile),
    stages: parseDockerfileStages(contents),
    has_healthcheck: hasDockerfileInstruction(contents, "HEALTHCHECK"),
    has_user: hasDockerfileInstruction(contents, "USER"),
    labels: [
      "area:docker",
      "area:containers",
      inferImageKind(relativeDockerfile) === "frontend"
        ? "area:frontend"
        : `area:${inferImageKind(relativeDockerfile)}`,
    ],
  };
}

function discoverDockerImages(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return discoverDockerfiles({
    ...options,
    repoRoot,
  }).map((dockerfilePath) =>
    createDockerImageDescriptor(dockerfilePath, {
      ...options,
      repoRoot,
    }),
  );
}

function dockerImageChanged(image, changedFiles = []) {
  const files = normalizeStringList(changedFiles);

  if (!files.length) return true;

  const context = toPosixPath(image.context).replace(/\/$/, "");
  const dockerfile = toPosixPath(image.dockerfile);

  return files.some((file) => {
    const normalized = toPosixPath(file);
    return (
      normalized === dockerfile ||
      normalized === context ||
      normalized.startsWith(`${context}/`)
    );
  });
}

function filterChangedDockerImages(images, changedFiles = [], options = {}) {
  if (normalizeBoolean(options.buildAll || options.build_all, false)) {
    return images;
  }

  return images.filter((image) => dockerImageChanged(image, changedFiles));
}

function createOciLabels(image, options = {}) {
  const repository =
    process.env.GITHUB_REPOSITORY || "SinLess-Games/Aerealith-AI";
  const sha = process.env.GITHUB_SHA || "";
  const ref = process.env.GITHUB_REF || "";

  return {
    ...DEFAULT_LABELS,
    "org.opencontainers.image.title": image.name,
    "org.opencontainers.image.description": `Aerealith AI ${image.kind} image: ${image.name}`,
    "org.opencontainers.image.source": `https://github.com/${repository}`,
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.ref.name": ref,
    "org.opencontainers.image.version": image.version,
    "aerealith.image.kind": image.kind,
    "aerealith.image.channel": image.channel,
    "aerealith.image.dockerfile": image.dockerfile,
    "aerealith.image.context": image.context,
    ...(options.labels || {}),
  };
}

function normalizeKeyValueObject(value) {
  if (!value) return {};

  if (isPlainObject(value)) return value;

  if (typeof value === "string") {
    const result = {};

    for (const entry of normalizeStringList(value)) {
      const index = entry.indexOf("=");

      if (index === -1) continue;

      const key = entry.slice(0, index).trim();
      const val = entry.slice(index + 1).trim();

      if (key) result[key] = val;
    }

    return result;
  }

  return {};
}

function buildDockerBuildxArgs(image, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const push = normalizeBoolean(options.push, false);
  const load = normalizeBoolean(options.load, !push);
  const noCache = normalizeBoolean(options.noCache || options.no_cache, false);
  const pull = normalizeBoolean(options.pull, true);
  const provenance = normalizeBoolean(options.provenance, false);
  const sbom = normalizeBoolean(options.sbom, false);

  const platforms = normalizeStringList(options.platforms || DEFAULT_PLATFORMS);
  const buildArgs = normalizeKeyValueObject(
    options.buildArgs || options.build_args,
  );
  const labels = createOciLabels(image, {
    labels: normalizeKeyValueObject(options.labels),
  });

  const args = ["buildx", "build"];

  args.push("--file", image.dockerfile);

  for (const tag of image.tags || [image.primary_tag]) {
    args.push("--tag", tag);
  }

  if (platforms.length) {
    args.push("--platform", platforms.join(","));
  }

  if (pull) {
    args.push("--pull");
  }

  if (push) {
    args.push("--push");
  } else if (load) {
    args.push("--load");
  }

  if (noCache) {
    args.push("--no-cache");
  }

  for (const [key, value] of Object.entries(buildArgs)) {
    args.push("--build-arg", `${key}=${value}`);
  }

  for (const [key, value] of Object.entries(labels)) {
    args.push("--label", `${key}=${value}`);
  }

  if (options.target) {
    args.push("--target", options.target);
  }

  if (options.cache !== false) {
    const cacheType = normalizeString(
      options.cacheType || options.cache_type,
      DEFAULT_CACHE_TYPE,
    );
    const cacheScope = sanitizeImagePart(
      options.cacheScope ||
        options.cache_scope ||
        `${image.name}-${image.channel}`,
    );

    if (cacheType === "gha") {
      args.push("--cache-from", `type=gha,scope=${cacheScope}`);
      args.push("--cache-to", `type=gha,scope=${cacheScope},mode=max`);
    } else if (cacheType === "registry") {
      const cacheRef = `${image.repository}:buildcache-${image.channel}`;
      args.push("--cache-from", `type=registry,ref=${cacheRef}`);
      args.push("--cache-to", `type=registry,ref=${cacheRef},mode=max`);
    }
  }

  if (provenance) {
    args.push("--provenance=true");
  }

  if (sbom) {
    args.push("--sbom=true");
  }

  for (const extraArg of normalizeStringList(
    options.extraArgs || options.extra_args,
  )) {
    args.push(extraArg);
  }

  args.push(toRelativePath(resolvePath(image.context, repoRoot), repoRoot));

  return args;
}

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );

  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun) {
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
    shell: false,
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    const stdout = result.stdout || "";

    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        stdout.trim() ? `stdout:\n${stdout}` : null,
        stderr.trim() ? `stderr:\n${stderr}` : null,
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

function validateDockerInstalled(options = {}) {
  const result = runCommand("docker", ["--version"], {
    ...options,
    dryRun: false,
  });

  return normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0];
}

function validateBuildxInstalled(options = {}) {
  const result = runCommand("docker", ["buildx", "version"], {
    ...options,
    dryRun: false,
  });

  return normalizeString(result.stdout || result.stderr).split(/\r?\n/)[0];
}

function dockerLoginGhcr(options = {}) {
  const dryRun = getDryRun(options);
  const registry = normalizeRegistry(options.registry || DEFAULT_REGISTRY);
  const username = normalizeString(
    options.username || process.env.GITHUB_ACTOR || process.env.GHCR_USERNAME,
  );
  const token = normalizeString(
    options.token || process.env.GITHUB_TOKEN || process.env.GHCR_TOKEN,
  );

  if (!username) {
    throw new Error("GHCR login requires a username.");
  }

  if (!token) {
    throw new Error("GHCR login requires GITHUB_TOKEN or GHCR_TOKEN.");
  }

  logger.mask(token);

  if (dryRun) {
    logger.dryRun(`Would log in to ${registry} as ${username}.`);
    return {
      registry,
      username,
      dry_run: true,
      status: 0,
    };
  }

  const result = childProcess.spawnSync(
    "docker",
    ["login", registry, "--username", username, "--password-stdin"],
    {
      input: token,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Docker login failed for ${registry}: ${result.stderr || result.stdout}`,
    );
  }

  logger.info(`Logged in to ${registry} as ${username}.`);

  return {
    registry,
    username,
    dry_run: false,
    status: result.status,
  };
}

function buildDockerImage(image, options = {}) {
  for (const tag of image.tags || [image.primary_tag]) {
    validateImageReference(tag);
  }

  const startedAt = new Date();

  const args = buildDockerBuildxArgs(image, options);

  const result = runCommand("docker", args, {
    ...options,
    cwd: options.cwd || ".",
  });

  const finishedAt = new Date();

  return {
    name: image.name,
    kind: image.kind,
    repository: image.repository,
    primary_tag: image.primary_tag,
    tags: image.tags,
    version: image.version,
    channel: image.channel,
    dockerfile: image.dockerfile,
    context: image.context,
    dockerfile_sha256: image.dockerfile_sha256,
    command: `docker ${args.join(" ")}`,
    pushed: normalizeBoolean(options.push, false),
    dry_run: getDryRun(options),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function buildDockerImages(images, options = {}) {
  return images.map((image) => buildDockerImage(image, options));
}

function createDockerImagePlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();

  const version = normalizeVersion(
    input.version || process.env.RELEASE_VERSION || DEFAULT_VERSION,
  );
  const channel = normalizeChannel(
    input.channel || process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
  );

  const discoveredImages =
    input.images ||
    discoverDockerImages({
      ...input,
      repoRoot,
      version,
      channel,
    });

  const buildAll = normalizeBoolean(input.build_all || input.buildAll, true);
  const changedFiles = normalizeStringList(
    input.changed_files || input.changedFiles || input.files,
  );

  const selectedImages = filterChangedDockerImages(
    discoveredImages,
    changedFiles,
    {
      buildAll,
    },
  );

  return {
    schema_version: 1,
    type: "docker-image-plan",
    project: "Aerealith AI",
    created_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    version,
    channel,
    registry: normalizeRegistry(input.registry || DEFAULT_REGISTRY),
    owner: normalizeOwner(input.owner || DEFAULT_OWNER),
    namespace: normalizeNamespace(input.namespace || DEFAULT_NAMESPACE),
    dry_run: getDryRun(input),
    build_all: buildAll,
    changed_files: changedFiles,
    totals: {
      discovered_images: discoveredImages.length,
      selected_images: selectedImages.length,
    },
    images: selectedImages,
  };
}

function createDockerImageManifest(input = {}) {
  const plan = input.plan || createDockerImagePlan(input);
  const results = Array.isArray(input.results) ? input.results : [];

  return {
    schema_version: 1,
    type: "ghcr-image-manifest",
    project: "Aerealith AI",
    created_at: new Date().toISOString(),
    repository: plan.repository,
    ref: plan.ref,
    sha: plan.sha,
    run_id: plan.run_id,
    version: plan.version,
    channel: plan.channel,
    registry: plan.registry,
    owner: plan.owner,
    namespace: plan.namespace,
    dry_run: plan.dry_run,
    totals: {
      planned_images: plan.images.length,
      built_images: results.length,
      pushed_images: results.filter((result) => result.pushed).length,
      failed_images: results.filter((result) => result.status !== 0).length,
    },
    planned_images: plan.images,
    results,
  };
}

function writeDockerImageManifest(
  manifest,
  outputFile = "artifacts/docker/ghcr-image-manifest.json",
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absoluteOutputFile = resolvePath(outputFile, repoRoot);

  return writeJson(absoluteOutputFile, manifest, {
    ...options,
    repoRoot,
  });
}

function createDockerSummary(manifestOrPlan) {
  const source = manifestOrPlan || {};
  const images = source.planned_images || source.images || [];
  const results = source.results || [];

  const lines = [
    "## Docker / GHCR Images",
    "",
    `- Version: \`${source.version || "unknown"}\``,
    `- Channel: \`${source.channel || "unknown"}\``,
    `- Registry: \`${source.registry || DEFAULT_REGISTRY}\``,
    `- Dry-run: \`${source.dry_run ? "true" : "false"}\``,
    `- Planned images: \`${images.length}\``,
  ];

  if (results.length) {
    lines.push(`- Built images: \`${results.length}\``);
  }

  if (images.length) {
    lines.push("");
    lines.push("### Planned Images");
    lines.push("");
    lines.push("| Name | Kind | Dockerfile | Context | Primary Tag |");
    lines.push("|---|---|---|---|---|");

    for (const image of images) {
      lines.push(
        `| \`${image.name}\` | \`${image.kind}\` | \`${image.dockerfile}\` | \`${image.context}\` | \`${image.primary_tag}\` |`,
      );
    }
  }

  if (results.length) {
    lines.push("");
    lines.push("### Build Results");
    lines.push("");
    lines.push("| Image | Status | Pushed | Duration |");
    lines.push("|---|---:|---:|---:|");

    for (const result of results) {
      lines.push(
        `| \`${result.name}\` | \`${result.status}\` | \`${result.pushed ? "yes" : "no"}\` | \`${result.duration_ms}ms\` |`,
      );
    }
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping Docker summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${markdown.trim()}\n\n`);

  return true;
}

function appendDockerSummary(manifestOrPlan) {
  return appendGitHubStepSummary(createDockerSummary(manifestOrPlan));
}

function setGithubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function printDockerImagePlan(plan) {
  logger.info(`Docker image plan for ${plan.version}-${plan.channel}.`);
  logger.info(`Selected ${plan.images.length} image(s).`);

  for (const image of plan.images) {
    logger.info(`- ${image.name}: ${image.dockerfile} -> ${image.primary_tag}`);
  }

  logger.dump("docker image plan", plan);
}

function loadRulesFromFile(
  filePath = ".github/repo-management/release-rules.yaml",
  options = {},
) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {};
  }

  const yaml = require("js-yaml");
  return yaml.load(fs.readFileSync(absolutePath, "utf8")) || {};
}

function getDockerConfigFromRules(rules = {}) {
  const ghcr = rules.ghcr || rules.publishing?.ghcr || {};

  return {
    registry: ghcr.registry || DEFAULT_REGISTRY,
    owner: ghcr.owner || DEFAULT_OWNER,
    namespace: ghcr.namespace || DEFAULT_NAMESPACE,
    imageRepositoryFormat:
      ghcr.image_repository_format ||
      ghcr.imageRepositoryFormat ||
      "{registry}/{owner}/{namespace}/{name}",
    imageTagFormat:
      ghcr.image_tag_format || ghcr.imageTagFormat || "{version}-{channel}",
    platforms: ghcr.build?.platforms || ghcr.platforms || DEFAULT_PLATFORMS,
    buildEveryDockerfile:
      ghcr.dockerfile_discovery?.build_every_dockerfile ??
      ghcr.build_every_dockerfile ??
      true,
    dockerfilePatterns:
      ghcr.dockerfile_discovery?.dockerfile_patterns ||
      ghcr.dockerfile_patterns ||
      DEFAULT_DOCKERFILE_NAMES,
  };
}

function runCli() {
  const command = process.argv[2] || "plan";

  const repoRoot = findRepoRoot();
  const rules = loadRulesFromFile(
    ".github/repo-management/release-rules.yaml",
    {
      repoRoot,
    },
  );

  const dockerConfig = getDockerConfigFromRules(rules);

  if (command === "discover") {
    const images = discoverDockerImages({
      repoRoot,
      dockerfileNames: dockerConfig.dockerfilePatterns,
      ...dockerConfig,
    });

    console.log(JSON.stringify(images, null, 2));
    return;
  }

  if (command === "plan") {
    const plan = createDockerImagePlan({
      repoRoot,
      dockerfileNames: dockerConfig.dockerfilePatterns,
      ...dockerConfig,
    });

    printDockerImagePlan(plan);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "build") {
    const push = normalizeBoolean(process.env.DOCKER_PUSH, false);

    const plan = createDockerImagePlan({
      repoRoot,
      dockerfileNames: dockerConfig.dockerfilePatterns,
      ...dockerConfig,
    });

    printDockerImagePlan(plan);

    if (push) {
      dockerLoginGhcr({
        repoRoot,
        registry: dockerConfig.registry,
      });
    }

    const results = buildDockerImages(plan.images, {
      repoRoot,
      push,
      platforms: dockerConfig.platforms,
    });

    const manifest = createDockerImageManifest({
      plan,
      results,
    });

    writeDockerImageManifest(manifest, undefined, {
      repoRoot,
    });

    appendDockerSummary(manifest);
    return;
  }

  if (command === "manifest") {
    const plan = createDockerImagePlan({
      repoRoot,
      dockerfileNames: dockerConfig.dockerfilePatterns,
      ...dockerConfig,
    });

    const manifest = createDockerImageManifest({
      plan,
      results: [],
    });

    writeDockerImageManifest(manifest, undefined, {
      repoRoot,
    });

    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  throw new Error(`Unknown Docker utility command: ${command}`);
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
  DEFAULT_REGISTRY,
  DEFAULT_OWNER,
  DEFAULT_NAMESPACE,
  DEFAULT_VERSION,
  DEFAULT_CHANNEL,
  DEFAULT_DOCKERFILE_NAMES,
  DEFAULT_DISCOVERY_ROOTS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_CONTEXT_MARKERS,
  DEFAULT_PLATFORMS,
  DEFAULT_CACHE_TYPE,
  DEFAULT_LABELS,
  RELEASE_TAG_PATTERN,
  VALID_CHANNELS,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,

  pathExists,
  isFile,
  isDirectory,
  ensureDir,
  writeJson,
  sortObjectDeep,
  sha256File,

  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  normalizeVersion,
  normalizeChannel,
  normalizeBranchName,
  normalizeTagName,
  isReleaseTag,
  getDryRun,

  sanitizeImagePart,
  sanitizeImageName,
  sanitizeTag,
  normalizeRegistry,
  normalizeOwner,
  normalizeNamespace,
  imageTagFor,
  createImageRepository,
  createImageReference,
  createAdditionalTags,
  validateImageReference,

  discoverDockerfiles,
  findNearestFile,
  findNearestPackageJson,
  findDockerContext,
  readPackageJson,
  inferImageNameFromPath,
  inferImageKind,
  readDockerfile,
  parseDockerfileStages,
  hasDockerfileInstruction,
  createDockerImageDescriptor,
  discoverDockerImages,
  dockerImageChanged,
  filterChangedDockerImages,

  createOciLabels,
  normalizeKeyValueObject,
  buildDockerBuildxArgs,
  runCommand,
  validateDockerInstalled,
  validateBuildxInstalled,
  dockerLoginGhcr,

  buildDockerImage,
  buildDockerImages,

  createDockerImagePlan,
  createDockerImageManifest,
  writeDockerImageManifest,
  createDockerSummary,
  appendGitHubStepSummary,
  appendDockerSummary,
  setGithubOutput,
  printDockerImagePlan,

  loadRulesFromFile,
  getDockerConfigFromRules,
};
