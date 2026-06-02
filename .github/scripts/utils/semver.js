// .github/scripts/utils/semver.js
// =============================================================================
// Aerealith AI SemVer Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared semantic versioning helpers for GitHub workflow automation scripts.
//
// Used by:
//   - release planning scripts
//   - changelog generation scripts
//   - Docker/GHCR publish scripts
//   - npm package publish scripts
//   - release validation scripts
//   - repo management scripts
//
// Notes:
//   - Aerealith release tags use uppercase V-prefixed semver:
//       V1.2.3
//   - Release labels:
//       release:major
//       release:minor
//       release:patch
//       no-release
//   - Dependency automation must not trigger releases.
//   - Stable release tags should not include prerelease suffixes.
//   - Channel names are supported for artifacts/images:
//       alpha, beta, test, release
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("./logger");

const DEFAULT_PREFIX = "V";
const DEFAULT_INITIAL_VERSION = "V0.0.0";
const DEFAULT_INITIAL_RELEASE_VERSION = "V0.1.0";
const DEFAULT_CHANNEL = "release";
const DEFAULT_DEFAULT_BRANCH = "main";

const VALID_BUMPS = ["major", "minor", "patch"];
const VALID_CHANNELS = ["alpha", "beta", "test", "release"];

const RELEASE_LABELS = ["release:major", "release:minor", "release:patch"];
const NO_RELEASE_LABEL = "no-release";

const DEPENDENCY_LABELS = [
  "dependencies",
  "kind:dependencies",
  "security:dependency",
  "renovate",
  "dependabot",
  "mend",
];

const DEPENDENCY_AUTHORS = ["dependabot[bot]", "renovate[bot]", "mend[bot]"];

const DEPENDENCY_BRANCH_PATTERNS = [
  /^dependabot\/.+$/,
  /^renovate\/.+$/,
  /^mend\/.+$/,
];

const OPENAI_BRANCH_PATTERNS = [
  /^openai\/.+$/,
  /^ai\/.+$/,
  /^automation\/openai-.+$/,
];

const SEMVER_PATTERN =
  /^(?<prefix>[vV]?)(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;

const RELEASE_TAG_PATTERN = /^V(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const CONVENTIONAL_COMMIT_BREAKING_PATTERNS = [
  /BREAKING CHANGE:/i,
  /BREAKING-CHANGE:/i,
  /^[a-zA-Z]+(?:\([^)]+\))?!:/,
];

const CONVENTIONAL_COMMIT_MINOR_PATTERNS = [/^feat(?:\([^)]+\))?:/i];

const CONVENTIONAL_COMMIT_PATCH_PATTERNS = [
  /^fix(?:\([^)]+\))?:/i,
  /^perf(?:\([^)]+\))?:/i,
  /^refactor(?:\([^)]+\))?:/i,
  /^revert(?:\([^)]+\))?:/i,
];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_REPO_ROOT_MARKERS = [
  ".git",
  ".github",
  "package.json",
  "pnpm-workspace.yaml",
  "nx.json",
];

function unique(values) {
  return [...new Set(values)];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function getDryRun(options = {}) {
  return normalizeBoolean(
    options.dryRun ??
      options.dry_run ??
      process.env.DRY_RUN ??
      process.env.PROJECT_SYNC_DRY_RUN,
    logger.DRY_RUN,
  );
}

function allowLocalFileWrites(options = {}) {
  return normalizeBoolean(
    options.allowLocalFileWrites ?? options.allow_local_file_writes,
    true,
  );
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

function normalizeChannel(channel = DEFAULT_CHANNEL) {
  const normalized = normalizeString(channel, DEFAULT_CHANNEL).toLowerCase();

  if (!VALID_CHANNELS.includes(normalized)) {
    throw new Error(
      `Invalid release channel "${channel}". Expected one of: ${VALID_CHANNELS.join(", ")}`,
    );
  }

  return normalized;
}

function normalizeBump(bump) {
  const normalized = normalizeString(bump).toLowerCase();

  if (!VALID_BUMPS.includes(normalized)) {
    throw new Error(
      `Invalid version bump "${bump}". Expected one of: ${VALID_BUMPS.join(", ")}`,
    );
  }

  return normalized;
}

function bumpFromReleaseLabel(label) {
  const normalized = normalizeString(label).toLowerCase();

  if (normalized === "release:major") return "major";
  if (normalized === "release:minor") return "minor";
  if (normalized === "release:patch") return "patch";

  return null;
}

function releaseLabelFromBump(bump) {
  return `release:${normalizeBump(bump)}`;
}

function isReleaseLabel(label) {
  return RELEASE_LABELS.includes(normalizeString(label).toLowerCase());
}

function hasNoReleaseLabel(labels = []) {
  return normalizeStringList(labels)
    .map((label) => label.toLowerCase())
    .includes(NO_RELEASE_LABEL);
}

function getReleaseLabels(labels = []) {
  return normalizeStringList(labels)
    .map((label) => label.toLowerCase())
    .filter((label) => RELEASE_LABELS.includes(label));
}

function isDependencyLabelSet(labels = []) {
  const normalized = normalizeStringList(labels).map((label) =>
    label.toLowerCase(),
  );
  return normalized.some((label) => DEPENDENCY_LABELS.includes(label));
}

function isDependencyAuthor(author) {
  return DEPENDENCY_AUTHORS.includes(normalizeString(author));
}

function isDependencyBranch(branchNameOrRef) {
  const branch = normalizeBranchName(branchNameOrRef);
  return DEPENDENCY_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
}

function isOpenAiBranch(branchNameOrRef) {
  const branch = normalizeBranchName(branchNameOrRef);
  return OPENAI_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
}

function isDependencyAutomation(input = {}) {
  return (
    isDependencyAuthor(input.author || input.actor) ||
    isDependencyBranch(input.branch || input.head_branch || input.headBranch) ||
    isDependencyLabelSet(input.labels)
  );
}

function isOpenAiAutomation(input = {}) {
  const labels = normalizeStringList(input.labels).map((label) =>
    label.toLowerCase(),
  );

  return (
    isOpenAiBranch(input.branch || input.head_branch || input.headBranch) ||
    labels.includes("automation:openai") ||
    labels.includes("ai:generated") ||
    labels.includes("openai")
  );
}

function classifyReleaseIntent(labels = [], options = {}) {
  const normalizedLabels = normalizeStringList(labels).map((label) =>
    label.toLowerCase(),
  );
  const releaseLabels = getReleaseLabels(normalizedLabels);
  const dependency =
    normalizeBoolean(options.dependency, false) ||
    isDependencyLabelSet(normalizedLabels);

  if (normalizedLabels.includes(NO_RELEASE_LABEL)) {
    return {
      should_release: false,
      bump: null,
      reason: "no-release label is present",
      release_labels: releaseLabels,
      blocking_labels: [NO_RELEASE_LABEL],
    };
  }

  if (
    dependency &&
    options.allowDependencyRelease !== true &&
    options.allow_dependency_release !== true
  ) {
    return {
      should_release: false,
      bump: null,
      reason: "dependency automation may not trigger releases",
      release_labels: releaseLabels,
      blocking_labels: normalizedLabels.filter((label) =>
        DEPENDENCY_LABELS.includes(label),
      ),
    };
  }

  if (releaseLabels.length !== 1) {
    return {
      should_release: false,
      bump: null,
      reason:
        releaseLabels.length > 1
          ? "multiple release labels are present"
          : "no release label is present",
      release_labels: releaseLabels,
      blocking_labels: releaseLabels.length > 1 ? releaseLabels : [],
    };
  }

  return {
    should_release: true,
    bump: bumpFromReleaseLabel(releaseLabels[0]),
    reason: "exactly one release label is present",
    release_labels: releaseLabels,
    blocking_labels: [],
  };
}

function parseVersion(version, options = {}) {
  const raw = normalizeString(version);

  if (!raw) {
    if (options.required === false) return null;
    throw new Error("Version cannot be empty.");
  }

  const match = SEMVER_PATTERN.exec(raw);

  if (!match) {
    if (options.required === false) return null;
    throw new Error(`Invalid semantic version: ${version}`);
  }

  const groups = match.groups || {};
  const prefix = groups.prefix || "";
  const major = Number(groups.major);
  const minor = Number(groups.minor);
  const patch = Number(groups.patch);
  const prerelease = groups.prerelease || "";
  const build = groups.build || "";

  const parsed = {
    raw,
    prefix,
    major,
    minor,
    patch,
    prerelease,
    build,
    core: `${major}.${minor}.${patch}`,
    version: formatVersion({
      major,
      minor,
      patch,
      prerelease,
      build,
      prefix: "",
    }),
    tag: formatVersion({
      major,
      minor,
      patch,
      prerelease,
      build,
      prefix: options.prefix ?? prefix ?? DEFAULT_PREFIX,
    }),
    stable: !prerelease,
  };

  return parsed;
}

function parseVersionOrNull(version) {
  return parseVersion(version, {
    required: false,
  });
}

function formatVersion(version, options = {}) {
  const parsed = typeof version === "string" ? parseVersion(version) : version;

  const prefix =
    options.prefix !== undefined
      ? options.prefix
      : parsed.prefix !== undefined
        ? parsed.prefix
        : DEFAULT_PREFIX;

  const prerelease = normalizeString(options.prerelease ?? parsed.prerelease);
  const build = normalizeString(options.build ?? parsed.build);

  let rendered = `${prefix || ""}${Number(parsed.major)}.${Number(parsed.minor)}.${Number(parsed.patch)}`;

  if (prerelease) {
    rendered += `-${prerelease}`;
  }

  if (build) {
    rendered += `+${build}`;
  }

  return rendered;
}

function normalizeVersion(version, options = {}) {
  const parsed = parseVersion(version, options);
  return formatVersion(parsed, {
    prefix: options.prefix ?? DEFAULT_PREFIX,
    prerelease: options.prerelease ?? parsed.prerelease,
    build: options.build ?? parsed.build,
  });
}

function normalizePackageVersion(version) {
  const parsed = parseVersion(version);
  return formatVersion(parsed, {
    prefix: "",
  });
}

function normalizeReleaseTag(version) {
  const parsed = parseVersion(version);
  return formatVersion(parsed, {
    prefix: DEFAULT_PREFIX,
    prerelease: "",
    build: "",
  });
}

function isValidVersion(version) {
  return Boolean(parseVersionOrNull(version));
}

function isReleaseTag(value) {
  return RELEASE_TAG_PATTERN.test(normalizeTagName(value));
}

function assertReleaseTag(value) {
  const tag = normalizeTagName(value);

  if (!isReleaseTag(tag)) {
    throw new Error(
      `Invalid release tag "${value}". Expected V-prefixed stable semver like V1.2.3.`,
    );
  }

  return true;
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }

  if (leftNumeric) return -1;
  if (rightNumeric) return 1;

  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

function comparePrerelease(left = "", right = "") {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const leftParts = left.split(".");
  const rightParts = right.split(".");
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const diff = compareIdentifiers(leftPart, rightPart);

    if (diff !== 0) return diff;
  }

  return 0;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  return comparePrerelease(a.prerelease, b.prerelease);
}

function versionEquals(left, right) {
  return compareVersions(left, right) === 0;
}

function versionGreaterThan(left, right) {
  return compareVersions(left, right) > 0;
}

function versionGreaterThanOrEqual(left, right) {
  return compareVersions(left, right) >= 0;
}

function versionLessThan(left, right) {
  return compareVersions(left, right) < 0;
}

function versionLessThanOrEqual(left, right) {
  return compareVersions(left, right) <= 0;
}

function sortVersions(versions = [], options = {}) {
  const parsed = normalizeStringList(versions)
    .map((version) => parseVersion(version, { required: false }))
    .filter(Boolean);

  const sorted = parsed.sort((left, right) =>
    compareVersions(left.tag, right.tag),
  );

  if (options.descending || options.desc) {
    sorted.reverse();
  }

  return sorted.map((version) =>
    formatVersion(version, {
      prefix: options.prefix ?? version.prefix ?? DEFAULT_PREFIX,
    }),
  );
}

function getHighestVersion(versions = [], options = {}) {
  const sorted = sortVersions(versions, {
    ...options,
    descending: true,
  });

  return sorted[0] || null;
}

function getLatestReleaseTag(tags = []) {
  const releaseTags = normalizeStringList(tags).filter((tag) =>
    isReleaseTag(tag),
  );
  return getHighestVersion(releaseTags, {
    prefix: DEFAULT_PREFIX,
  });
}

function incrementPrerelease(prerelease, channel = "alpha") {
  const normalizedChannel = normalizeChannel(channel);

  if (normalizedChannel === "release") {
    return "";
  }

  const current = normalizeString(prerelease);

  if (!current) {
    return `${normalizedChannel}.1`;
  }

  const parts = current.split(".");
  const base = parts[0];

  if (base !== normalizedChannel) {
    return `${normalizedChannel}.1`;
  }

  const last = parts[parts.length - 1];

  if (/^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1);
    return parts.join(".");
  }

  return `${current}.1`;
}

function bumpVersion(version, bump, options = {}) {
  const parsed = parseVersion(version);
  const normalizedBump = normalizeBump(bump);
  const prefix = options.prefix ?? parsed.prefix ?? DEFAULT_PREFIX;
  const channel = normalizeChannel(options.channel || DEFAULT_CHANNEL);
  const prereleaseRequested = channel !== "release" || options.prerelease;

  const next = {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: "",
    build: normalizeString(options.build || ""),
    prefix,
  };

  if (normalizedBump === "major") {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  }

  if (normalizedBump === "minor") {
    next.minor += 1;
    next.patch = 0;
  }

  if (normalizedBump === "patch") {
    next.patch += 1;
  }

  if (prereleaseRequested) {
    next.prerelease =
      normalizeString(options.prerelease) || incrementPrerelease("", channel);
  }

  return formatVersion(next, {
    prefix,
  });
}

function bumpMajor(version, options = {}) {
  return bumpVersion(version, "major", options);
}

function bumpMinor(version, options = {}) {
  return bumpVersion(version, "minor", options);
}

function bumpPatch(version, options = {}) {
  return bumpVersion(version, "patch", options);
}

function nextPrereleaseVersion(version, channel = "alpha", options = {}) {
  const parsed = parseVersion(version);
  const normalizedChannel = normalizeChannel(channel);

  if (normalizedChannel === "release") {
    return normalizeReleaseTag(version);
  }

  const next = {
    ...parsed,
    prerelease: incrementPrerelease(parsed.prerelease, normalizedChannel),
    prefix: options.prefix ?? parsed.prefix ?? DEFAULT_PREFIX,
  };

  return formatVersion(next, {
    prefix: next.prefix,
  });
}

function extractVersionsFromText(text, options = {}) {
  const source = String(text || "");
  const prefixPattern =
    options.releaseOnly || options.release_only ? "V" : "[vV]?";
  const pattern = new RegExp(
    `\\b${prefixPattern}(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?\\b`,
    "g",
  );

  return unique([...source.matchAll(pattern)].map((match) => match[0]));
}

function extractReleaseTagsFromText(text) {
  return extractVersionsFromText(text, {
    releaseOnly: true,
  }).filter((version) => isReleaseTag(version));
}

function deriveBumpFromConventionalCommits(messages = []) {
  const normalizedMessages = normalizeStringList(messages);

  if (!normalizedMessages.length) return null;

  if (
    normalizedMessages.some((message) =>
      CONVENTIONAL_COMMIT_BREAKING_PATTERNS.some((pattern) =>
        pattern.test(message),
      ),
    )
  ) {
    return "major";
  }

  if (
    normalizedMessages.some((message) =>
      CONVENTIONAL_COMMIT_MINOR_PATTERNS.some((pattern) =>
        pattern.test(message),
      ),
    )
  ) {
    return "minor";
  }

  if (
    normalizedMessages.some((message) =>
      CONVENTIONAL_COMMIT_PATCH_PATTERNS.some((pattern) =>
        pattern.test(message),
      ),
    )
  ) {
    return "patch";
  }

  return null;
}

function pickHighestBump(bumps = []) {
  const normalized = normalizeStringList(bumps).filter((bump) =>
    VALID_BUMPS.includes(bump),
  );

  if (normalized.includes("major")) return "major";
  if (normalized.includes("minor")) return "minor";
  if (normalized.includes("patch")) return "patch";

  return null;
}

function deriveBump(input = {}) {
  const labelIntent = classifyReleaseIntent(input.labels || [], {
    dependency: input.dependency,
    allowDependencyRelease:
      input.allowDependencyRelease || input.allow_dependency_release,
  });

  if (labelIntent.should_release) {
    return {
      bump: labelIntent.bump,
      source: "labels",
      intent: labelIntent,
    };
  }

  if (input.labelsRequired !== false && input.labels_required !== false) {
    return {
      bump: null,
      source: "none",
      intent: labelIntent,
    };
  }

  const commitBump = deriveBumpFromConventionalCommits(
    input.commits || input.commit_messages || [],
  );

  return {
    bump: commitBump,
    source: commitBump ? "commits" : "none",
    intent: labelIntent,
  };
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
  options = {},
) {
  const markers = normalizeStringList(
    options.markers || DEFAULT_REPO_ROOT_MARKERS,
  );
  const candidates = unique([
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../.."),
  ]);

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolvePath(filePath = ".", repoRoot = findRepoRoot()) {
  if (!filePath) return repoRoot;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);

  return path.normalize(path.join(repoRoot, filePath));
}

function toPosixPath(filePath) {
  return normalizeString(filePath).split(path.sep).join("/");
}

function toRelativePath(filePath, repoRoot = findRepoRoot()) {
  return toPosixPath(path.relative(repoRoot, resolvePath(filePath, repoRoot)));
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isDirectory(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function ensureDir(dirPath, options = {}) {
  const dryRun = getDryRun(options);

  if (isDirectory(dirPath)) return dirPath;

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(`Would create directory: ${dirPath}`);
    return dirPath;
  }

  fs.mkdirSync(dirPath, {
    recursive: true,
  });

  return dirPath;
}

function writeJson(filePath, value, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);
  const dryRun = getDryRun(options);
  const contents = `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`;

  ensureDir(path.dirname(absolutePath), options);

  if (dryRun && !allowLocalFileWrites(options)) {
    logger.dryRun(
      `Would write JSON file: ${toRelativePath(absolutePath, repoRoot)}`,
    );
    logger.dump(`planned ${path.basename(absolutePath)}`, value);

    return {
      written: false,
      path: toRelativePath(absolutePath, repoRoot),
      dry_run: true,
    };
  }

  fs.writeFileSync(absolutePath, contents);

  logger.info(`Wrote ${toRelativePath(absolutePath, repoRoot)}.`);

  return {
    written: true,
    path: toRelativePath(absolutePath, repoRoot),
    dry_run: dryRun,
  };
}

function readJson(filePath, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(
      `JSON file not found: ${toRelativePath(absolutePath, repoRoot)}`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse ${toRelativePath(absolutePath, repoRoot)}: ${logger.formatError(err)}`,
    );
  }
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

function runCommand(command, args = [], options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const dryRun = getDryRun(options);
  const cwd = resolvePath(
    options.cwd || options.workingDirectory || ".",
    repoRoot,
  );
  const rendered = `${command} ${args.join(" ")}`.trim();

  if (dryRun && options.executeInDryRun !== true) {
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

  const result = childProcess.spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: "utf8",
    shell: normalizeBoolean(options.shell, false),
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0 &&
    options.allowFailure !== true &&
    options.allow_failure !== true
  ) {
    throw new Error(
      [
        `Command failed with exit code ${result.status}: ${rendered}`,
        result.stdout ? `stdout:\n${result.stdout}` : null,
        result.stderr ? `stderr:\n${result.stderr}` : null,
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

function getGitTags(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  const result = runCommand("git", ["tag", "--list"], {
    ...options,
    repoRoot,
    executeInDryRun: true,
    allowFailure: true,
  });

  if (result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getLatestGitReleaseTag(options = {}) {
  return getLatestReleaseTag(getGitTags(options)) || DEFAULT_INITIAL_VERSION;
}

function getCommitMessagesSince(baseRef, headRef = "HEAD", options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  if (!baseRef) return [];

  const result = runCommand(
    "git",
    ["log", "--format=%s%n%b%x00", `${baseRef}..${headRef}`],
    {
      ...options,
      repoRoot,
      executeInDryRun: true,
      allowFailure: true,
    },
  );

  if (result.status !== 0 || !result.stdout.trim()) return [];

  return result.stdout
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean);
}

function getCurrentPackageVersion(
  packageJsonPath = "package.json",
  options = {},
) {
  const packageJson = readJson(packageJsonPath, options);
  return packageJson.version || "0.0.0";
}

function createReleaseArtifactVersion(version, channel = DEFAULT_CHANNEL) {
  const releaseTag = normalizeReleaseTag(version);
  const normalizedChannel = normalizeChannel(channel);

  return `${releaseTag}-${normalizedChannel}`;
}

function createDockerVersionTag(version, channel = DEFAULT_CHANNEL) {
  return createReleaseArtifactVersion(version, channel);
}

function createNpmDistTag(channel = DEFAULT_CHANNEL) {
  const normalizedChannel = normalizeChannel(channel);

  if (normalizedChannel === "release") return "latest";

  return normalizedChannel;
}

function createReleasePlan(input = {}) {
  const repoRoot = input.repoRoot || findRepoRoot();
  const labels = normalizeStringList(input.labels);
  const branch = normalizeBranchName(
    input.branch || process.env.GITHUB_REF_NAME || process.env.GITHUB_REF,
  );
  const baseBranch = normalizeBranchName(
    input.base_branch || input.baseBranch || process.env.GITHUB_BASE_REF,
  );
  const author = normalizeString(
    input.author || input.actor || process.env.GITHUB_ACTOR,
  );
  const channel = normalizeChannel(
    input.channel || process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
  );
  const dependency = isDependencyAutomation({
    labels,
    branch,
    author,
  });
  const openai = isOpenAiAutomation({
    labels,
    branch,
  });

  const currentVersion =
    input.currentVersion ||
    input.current_version ||
    input.latestTag ||
    input.latest_tag ||
    getLatestGitReleaseTag({
      ...input,
      repoRoot,
    }) ||
    DEFAULT_INITIAL_VERSION;

  const commitMessages = normalizeStringList(
    input.commits || input.commit_messages,
  );

  const bumpDecision = deriveBump({
    labels,
    commits: commitMessages,
    dependency,
    labelsRequired: input.labelsRequired ?? input.labels_required ?? true,
    allowDependencyRelease:
      input.allowDependencyRelease ?? input.allow_dependency_release ?? false,
  });

  const blockers = [];
  const warnings = [];

  if (dependency && bumpDecision.bump) {
    blockers.push("Dependency automation may not create releases.");
  }

  if (openai && input.blockOpenAiReleases) {
    blockers.push(
      "OpenAI automation may not create releases under the active release policy.",
    );
  }

  if (input.requireMain !== false && input.require_main !== false) {
    const onMain =
      branch === DEFAULT_DEFAULT_BRANCH ||
      baseBranch === DEFAULT_DEFAULT_BRANCH;

    if (!onMain) {
      blockers.push(`Releases must originate from ${DEFAULT_DEFAULT_BRANCH}.`);
    }
  }

  if (hasNoReleaseLabel(labels) && bumpDecision.bump) {
    blockers.push("no-release label conflicts with release bump labels.");
  }

  const shouldRelease = Boolean(bumpDecision.bump) && blockers.length === 0;

  const nextVersion = shouldRelease
    ? bumpVersion(currentVersion, bumpDecision.bump, {
        prefix: DEFAULT_PREFIX,
        channel: "release",
      })
    : null;

  if (!bumpDecision.bump) {
    warnings.push(bumpDecision.intent.reason);
  }

  return {
    schema_version: 1,
    type: "semver-release-plan",
    created_at: new Date().toISOString(),
    project: "Aerealith AI",
    repository: process.env.GITHUB_REPOSITORY || "SinLess-Games/Aerealith-AI",
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    branch,
    base_branch: baseBranch,
    author,
    dependency,
    openai,
    channel,
    labels,
    current_version: normalizeReleaseTag(currentVersion),
    current_package_version: normalizePackageVersion(currentVersion),
    next_version: nextVersion,
    next_package_version: nextVersion
      ? normalizePackageVersion(nextVersion)
      : null,
    artifact_version: nextVersion
      ? createReleaseArtifactVersion(nextVersion, channel)
      : null,
    docker_tag: nextVersion
      ? createDockerVersionTag(nextVersion, channel)
      : null,
    npm_dist_tag: createNpmDistTag(channel),
    should_release: shouldRelease,
    bump: bumpDecision.bump,
    bump_source: bumpDecision.source,
    release_intent: bumpDecision.intent,
    blockers,
    warnings,
    dry_run: getDryRun(input),
  };
}

function assertReleasePlanAllowed(plan) {
  if (!plan.should_release) {
    const reasons = [
      ...(plan.blockers || []),
      ...(plan.warnings || []),
      plan.release_intent?.reason,
    ]
      .filter(Boolean)
      .map((reason) => `- ${reason}`)
      .join("\n");

    throw new Error(`Release is not allowed.\n${reasons}`);
  }

  return true;
}

function createVersionSummary(plan) {
  const lines = [
    "## Version Plan",
    "",
    `- Current version: \`${plan.current_version || "unknown"}\``,
    `- Next version: \`${plan.next_version || "none"}\``,
    `- Bump: \`${plan.bump || "none"}\``,
    `- Source: \`${plan.bump_source || "none"}\``,
    `- Channel: \`${plan.channel || DEFAULT_CHANNEL}\``,
    `- Should release: \`${plan.should_release ? "true" : "false"}\``,
    `- Dependency automation: \`${plan.dependency ? "true" : "false"}\``,
  ];

  if (plan.blockers?.length) {
    lines.push("");
    lines.push("### Blockers");
    lines.push("");
    for (const blocker of plan.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (plan.warnings?.length) {
    lines.push("");
    lines.push("### Warnings");
    lines.push("");
    for (const warning of plan.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (plan.next_version) {
    lines.push("");
    lines.push("### Publish Tags");
    lines.push("");
    lines.push(`- Release tag: \`${plan.next_version}\``);
    lines.push(`- Artifact version: \`${plan.artifact_version}\``);
    lines.push(`- Docker tag: \`${plan.docker_tag}\``);
    lines.push(`- npm dist-tag: \`${plan.npm_dist_tag}\``);
  }

  return lines.join("\n");
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping SemVer summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function appendVersionSummary(plan) {
  return appendGitHubStepSummary(createVersionSummary(plan));
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) {
    logger.debug(`GITHUB_OUTPUT is not set. Skipping output ${name}.`);
    return false;
  }

  const rendered = typeof value === "string" ? value : JSON.stringify(value);

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);

  return true;
}

function setReleasePlanOutputs(plan) {
  setGitHubOutput("should_release", plan.should_release ? "true" : "false");
  setGitHubOutput("release_bump", plan.bump || "");
  setGitHubOutput("current_version", plan.current_version || "");
  setGitHubOutput("next_version", plan.next_version || "");
  setGitHubOutput("next_package_version", plan.next_package_version || "");
  setGitHubOutput("artifact_version", plan.artifact_version || "");
  setGitHubOutput("docker_tag", plan.docker_tag || "");
  setGitHubOutput("npm_dist_tag", plan.npm_dist_tag || "");
  setGitHubOutput("release_plan", plan);
}

function printReleasePlan(plan) {
  logger.info(`Current version: ${plan.current_version}.`);

  if (plan.should_release) {
    logger.info(`Next version: ${plan.next_version} (${plan.bump}).`);
  } else {
    logger.info("No release will be created.");
  }

  for (const blocker of plan.blockers || []) {
    logger.warn(blocker);
  }

  logger.dump("semver release plan", plan);
}

function runCli() {
  const command = process.argv[2] || "plan";
  const repoRoot = findRepoRoot();

  if (command === "parse") {
    const version = process.argv[3] || DEFAULT_INITIAL_VERSION;
    console.log(JSON.stringify(parseVersion(version), null, 2));
    return;
  }

  if (command === "normalize") {
    const version = process.argv[3] || DEFAULT_INITIAL_VERSION;
    console.log(normalizeVersion(version));
    return;
  }

  if (command === "package-version") {
    const version = process.argv[3] || DEFAULT_INITIAL_VERSION;
    console.log(normalizePackageVersion(version));
    return;
  }

  if (command === "release-tag") {
    const version = process.argv[3] || DEFAULT_INITIAL_VERSION;
    console.log(normalizeReleaseTag(version));
    return;
  }

  if (command === "bump") {
    const version = process.argv[3] || DEFAULT_INITIAL_VERSION;
    const bump = process.argv[4] || "patch";
    console.log(bumpVersion(version, bump));
    return;
  }

  if (command === "latest") {
    console.log(getLatestGitReleaseTag({ repoRoot }));
    return;
  }

  if (command === "compare") {
    const left = process.argv[3];
    const right = process.argv[4];

    if (!left || !right) {
      throw new Error("compare requires two versions.");
    }

    console.log(String(compareVersions(left, right)));
    return;
  }

  if (command === "intent") {
    const labels = process.argv.slice(3);
    console.log(JSON.stringify(classifyReleaseIntent(labels), null, 2));
    return;
  }

  if (command === "plan") {
    const labels = normalizeStringList(
      process.env.PR_LABELS || process.env.RELEASE_LABELS,
    );
    const latestTag = getLatestGitReleaseTag({ repoRoot });
    const commits = getCommitMessagesSince(latestTag, "HEAD", {
      repoRoot,
    });

    const plan = createReleasePlan({
      repoRoot,
      labels,
      commits,
      currentVersion: latestTag,
      branch: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF,
      base_branch: process.env.GITHUB_BASE_REF,
      author: process.env.GITHUB_ACTOR,
      channel: process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
    });

    printReleasePlan(plan);
    appendVersionSummary(plan);
    setReleasePlanOutputs(plan);

    if (process.env.SEMVER_PLAN_FILE) {
      writeJson(process.env.SEMVER_PLAN_FILE, plan, {
        repoRoot,
      });
    }

    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  throw new Error(`Unknown semver utility command: ${command}`);
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
  DEFAULT_PREFIX,
  DEFAULT_INITIAL_VERSION,
  DEFAULT_INITIAL_RELEASE_VERSION,
  DEFAULT_CHANNEL,
  DEFAULT_DEFAULT_BRANCH,

  VALID_BUMPS,
  VALID_CHANNELS,

  RELEASE_LABELS,
  NO_RELEASE_LABEL,
  DEPENDENCY_LABELS,
  DEPENDENCY_AUTHORS,
  DEPENDENCY_BRANCH_PATTERNS,
  OPENAI_BRANCH_PATTERNS,

  SEMVER_PATTERN,
  RELEASE_TAG_PATTERN,

  CONVENTIONAL_COMMIT_BREAKING_PATTERNS,
  CONVENTIONAL_COMMIT_MINOR_PATTERNS,
  CONVENTIONAL_COMMIT_PATCH_PATTERNS,

  TRUE_VALUES,
  FALSE_VALUES,
  DEFAULT_REPO_ROOT_MARKERS,

  unique,
  isPlainObject,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,

  getDryRun,
  allowLocalFileWrites,

  normalizeBranchName,
  normalizeTagName,
  normalizeChannel,
  normalizeBump,

  bumpFromReleaseLabel,
  releaseLabelFromBump,
  isReleaseLabel,
  hasNoReleaseLabel,
  getReleaseLabels,
  isDependencyLabelSet,
  isDependencyAuthor,
  isDependencyBranch,
  isOpenAiBranch,
  isDependencyAutomation,
  isOpenAiAutomation,
  classifyReleaseIntent,

  parseVersion,
  parseVersionOrNull,
  formatVersion,
  normalizeVersion,
  normalizePackageVersion,
  normalizeReleaseTag,
  isValidVersion,
  isReleaseTag,
  assertReleaseTag,

  compareIdentifiers,
  comparePrerelease,
  compareVersions,
  versionEquals,
  versionGreaterThan,
  versionGreaterThanOrEqual,
  versionLessThan,
  versionLessThanOrEqual,

  sortVersions,
  getHighestVersion,
  getLatestReleaseTag,

  incrementPrerelease,
  bumpVersion,
  bumpMajor,
  bumpMinor,
  bumpPatch,
  nextPrereleaseVersion,

  extractVersionsFromText,
  extractReleaseTagsFromText,

  deriveBumpFromConventionalCommits,
  pickHighestBump,
  deriveBump,

  findRepoRoot,
  resolvePath,
  toPosixPath,
  toRelativePath,
  isFile,
  isDirectory,
  ensureDir,
  writeJson,
  readJson,
  sortObjectDeep,

  runCommand,
  getGitTags,
  getLatestGitReleaseTag,
  getCommitMessagesSince,
  getCurrentPackageVersion,

  createReleaseArtifactVersion,
  createDockerVersionTag,
  createNpmDistTag,

  createReleasePlan,
  assertReleasePlanAllowed,
  createVersionSummary,
  appendGitHubStepSummary,
  appendVersionSummary,
  setGitHubOutput,
  setReleasePlanOutputs,
  printReleasePlan,
};
