#!/usr/bin/env node
// .github/scripts/ai/discussion-announcement.js
// =============================================================================
// Aerealith AI — Release Discussion Announcement Publisher
// -----------------------------------------------------------------------------
// Purpose:
//   Build a polished release announcement from changelog/release metadata and
//   optionally publish it to GitHub Discussions under the Announcements category.
//
// Output:
//   - artifacts/ai/release-announcement.md
//   - artifacts/ai/release-announcement-context.json
//   - artifacts/ai/discussion-announcement.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Falls back to deterministic announcement generation when OPENAI_API_KEY is
//     unavailable unless --require-ai is passed.
//   - Does not publish a discussion unless --publish is passed or
//     PUBLISH_DISCUSSION_ANNOUNCEMENT=true is set.
//   - Environment-based publishing still requires WRITE_MODE=true.
//   - Redacts secret-like values before sending context to AI.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_CHANNEL = "release";
const DEFAULT_DISCUSSION_CATEGORY = "Announcements";

const DEFAULT_PROMPT_FILE =
  ".github/scripts/ai/prompts/release-announcement.md";
const DEFAULT_CHANGELOG_FILE = "artifacts/ai/changelog-draft.md";
const DEFAULT_OUTPUT_FILE = "artifacts/ai/release-announcement.md";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/release-announcement-context.json";
const DEFAULT_RESULT_FILE = "artifacts/ai/discussion-announcement.json";

const DEFAULT_MODEL = "gpt-4.1";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_INPUT_FILES = [
  "artifacts/ai/changelog-context.json",
  "artifacts/release/release-plan.json",
  "artifacts/release/semver-release-plan.json",
  "artifacts/release/release-evidence.json",
  "artifacts/release/artifact-manifest.json",
  "artifacts/release/SHA256SUMS",
  "artifacts/release/SHA512SUMS",
  "artifacts/npm/npm-package-plan.json",
  "artifacts/npm/npm-publish-manifest.json",
  "artifacts/docker/docker-image-manifest.json",
  "artifacts/cloudflare/cloudflare-deployment.json",
  "artifacts/cloudflare/cloudflare-preview.json",
  "artifacts/cloudflare/cloudflare-staging.json",
  "artifacts/cloudflare/cloudflare-production.json",
  "artifacts/security/security-report.json",
  "artifacts/security/security-gate.json",
  "artifacts/security/security-summary.md",
  "artifacts/nx/nx-ci-plan.json",
  "artifacts/nx/nx-project-discovery.json",
];

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|webhook|cookie|session|authorization|bearer|pat|credential)/i;

const SECRET_VALUE_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|[A-Za-z0-9+/]{32,}={0,2})/g;

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
  const envPublish = normalizeBoolean(
    process.env.PUBLISH_DISCUSSION_ANNOUNCEMENT,
    false,
  );

  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    prompt_file:
      process.env.RELEASE_ANNOUNCEMENT_PROMPT_FILE || DEFAULT_PROMPT_FILE,
    changelog_file:
      process.env.CHANGELOG_FILE ||
      process.env.RELEASE_CHANGELOG_FILE ||
      DEFAULT_CHANGELOG_FILE,
    output_file:
      process.env.RELEASE_ANNOUNCEMENT_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file:
      process.env.RELEASE_ANNOUNCEMENT_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    result_file:
      process.env.DISCUSSION_ANNOUNCEMENT_RESULT_FILE || DEFAULT_RESULT_FILE,
    category: process.env.DISCUSSION_CATEGORY || DEFAULT_DISCUSSION_CATEGORY,
    title: process.env.RELEASE_ANNOUNCEMENT_TITLE || "",
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
    date: process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10),
    changelog_url: process.env.CHANGELOG_URL || "",
    release_url: process.env.RELEASE_URL || "",
    mode: process.env.RELEASE_ANNOUNCEMENT_MODE || "full",
    model:
      process.env.OPENAI_ANNOUNCEMENT_MODEL ||
      process.env.OPENAI_RELEASE_MODEL ||
      process.env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    input_files: normalizeStringList(
      process.env.RELEASE_ANNOUNCEMENT_INPUT_FILES,
    ),
    no_ai: normalizeBoolean(process.env.RELEASE_ANNOUNCEMENT_NO_AI, false),
    require_ai: normalizeBoolean(
      process.env.RELEASE_ANNOUNCEMENT_REQUIRE_AI,
      false,
    ),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    publish: envPublish,
    write_mode: normalizeBoolean(
      process.env.DISCUSSION_ANNOUNCEMENT_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    print: normalizeBoolean(process.env.RELEASE_ANNOUNCEMENT_PRINT, true),
    write_summary: normalizeBoolean(
      process.env.RELEASE_ANNOUNCEMENT_STEP_SUMMARY,
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

    if (arg === "--prompt") {
      args.prompt_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changelog") {
      args.changelog_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--context-output") {
      args.context_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--result-output") {
      args.result_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--category") {
      args.category = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title") {
      args.title = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--previous-version") {
      args.previous_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--channel") {
      args.channel = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--date") {
      args.date = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--changelog-url") {
      args.changelog_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--release-url") {
      args.release_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--model") {
      args.model = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--no-ai") {
      args.no_ai = true;
      continue;
    }

    if (arg === "--require-ai") {
      args.require_ai = true;
      continue;
    }

    if (arg === "--dry-run") {
      args.dry_run = true;
      continue;
    }

    if (arg === "--publish") {
      args.publish = true;
      args.write_mode = true;
      continue;
    }

    if (arg === "--no-publish") {
      args.publish = false;
      continue;
    }

    if (arg === "--write") {
      args.write_mode = true;
      continue;
    }

    if (arg === "--no-write") {
      args.write_mode = false;
      continue;
    }

    if (arg === "--no-print") {
      args.print = false;
      continue;
    }

    if (arg === "--no-summary") {
      args.write_summary = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Discussion Announcement Publisher

Usage:
  node .github/scripts/ai/discussion-announcement.js [options]

Options:
      --repo <owner/repo>          Repository slug.
      --prompt <file>             Release announcement prompt file.
      --changelog <file>          Changelog markdown input file.
  -i, --input <file>              Add release metadata input file.
  -o, --output <file>             Announcement markdown output file.
      --context-output <file>     Context JSON output file.
      --result-output <file>      Result JSON output file.
      --category <name>           Discussion category name or slug.
      --title <title>             Discussion title.
      --version <version>         Release version.
      --previous-version <ver>    Previous release version.
      --channel <channel>         Release channel.
      --date <date>               Release date.
      --changelog-url <url>       Changelog URL.
      --release-url <url>         GitHub Release URL.
      --mode <full|short|discord> Announcement mode.
      --model <model>             OpenAI model.
      --no-ai                     Disable AI generation and use fallback.
      --require-ai                Fail if AI generation is unavailable.
      --dry-run                   Do not publish or write files.
      --publish                   Publish the discussion.
      --no-publish                Do not publish the discussion.
      --write                     Enable mutating GitHub writes.
      --no-write                  Disable mutating GitHub writes.
      --no-print                  Do not print announcement markdown.
      --no-summary                Do not append GitHub step summary.
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

  fs.mkdirSync(dirPath, { recursive: true });
}

function readTextFile(filePath, options = {}) {
  if (!isFile(filePath)) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function writeTextFile(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write: ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
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

function readInputFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const raw = readTextFile(absolutePath, {
    required: false,
    fallback: "",
  });

  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".json" || extension === ".jsonc") {
    return {
      file: relativePath,
      type: "json",
      value: safeJsonParse(stripJsonc(raw), raw),
    };
  }

  return {
    file: relativePath,
    type: "text",
    value: raw,
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
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
  };
}

function readGitHubEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !isFile(eventPath)) return {};

  const parsed = safeJsonParse(fs.readFileSync(eventPath, "utf8"), null);
  return parsed || {};
}

function getReleaseFromEvent(eventPayload) {
  const release = eventPayload.release;

  if (!release) return null;

  return {
    id: release.id || null,
    tag_name: release.tag_name || "",
    name: release.name || "",
    body: release.body || "",
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    html_url: release.html_url || "",
    published_at: release.published_at || release.created_at || "",
    author: release.author?.login || "",
  };
}

function getPullRequestFromEvent(eventPayload) {
  const pullRequest = eventPayload.pull_request;

  if (!pullRequest) return null;

  return {
    number: pullRequest.number || eventPayload.number || null,
    title: pullRequest.title || "",
    body: pullRequest.body || "",
    author: pullRequest.user?.login || "",
    merged: Boolean(pullRequest.merged),
    draft: Boolean(pullRequest.draft),
    html_url: pullRequest.html_url || "",
    labels: Array.isArray(pullRequest.labels)
      ? pullRequest.labels.map((label) => label.name).filter(Boolean)
      : [],
  };
}

function getReleasePlanFromInputs(inputs) {
  const candidates = [
    "artifacts/release/release-plan.json",
    "artifacts/release/semver-release-plan.json",
    "artifacts/ai/changelog-context.json",
  ];

  for (const candidate of candidates) {
    const input = inputs.find((item) => item.file === candidate);

    if (!input || typeof input.value !== "object" || input.value === null)
      continue;

    if (input.value.release) return input.value.release;
    if (
      input.value.type === "semver-release-plan" ||
      input.value.type === "release-plan"
    )
      return input.value;
  }

  const byType = inputs.find((item) => {
    return (
      item.value?.type === "semver-release-plan" ||
      item.value?.type === "release-plan" ||
      item.value?.release?.release_plan
    );
  });

  if (byType?.value?.release?.release_plan)
    return byType.value.release.release_plan;

  return byType?.value || null;
}

function normalizeRefTag(ref) {
  const value = normalizeString(ref);

  if (!value.startsWith("refs/tags/")) return "";

  return value.replace(/^refs\/tags\//, "");
}

function isReleaseTag(tag) {
  return /^V\d+\.\d+\.\d+$/.test(String(tag || "").trim());
}

function createDefaultReleaseUrl(repository, version) {
  if (!version || !isReleaseTag(version)) return "";

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

  return `${serverUrl.replace(/\/$/, "")}/${repository}/releases/tag/${version}`;
}

function createDefaultAnnouncementTitle(context) {
  const version = normalizeString(context.release.version, "release");
  const channel = normalizeString(context.release.channel, DEFAULT_CHANNEL);

  if (version && version !== "Unreleased") {
    return `🚀 ${PROJECT_NAME} ${version} is now available`;
  }

  return `🚀 ${PROJECT_NAME} ${channel} release announcement`;
}

function extractSection(markdown, headingPattern) {
  const source = String(markdown || "");
  const lines = source.split(/\r?\n/);

  let collecting = false;
  const collected = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (collecting) break;

      if (headingPattern.test(line)) {
        collecting = true;
        continue;
      }
    }

    if (collecting) {
      collected.push(line);
    }
  }

  return collected.join("\n").trim();
}

function extractBullets(markdown, max = 5) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function extractPackages(context) {
  const packages = [];

  for (const input of context.inputs) {
    const value = input.value;

    if (!value || typeof value !== "object") continue;

    const candidates = [
      ...(Array.isArray(value.packages) ? value.packages : []),
      ...(Array.isArray(value.planned_packages) ? value.planned_packages : []),
      ...(Array.isArray(value.published_packages)
        ? value.published_packages
        : []),
    ];

    for (const item of candidates) {
      if (!item?.name) continue;

      packages.push({
        name: item.name,
        version:
          item.version || item.package_version || context.release.version,
        tag: item.npm_tag || value.npm_tag || "latest",
      });
    }
  }

  return dedupeBy(
    packages,
    (item) => `${item.name}@${item.version}:${item.tag}`,
  );
}

function extractImages(context) {
  const images = [];

  for (const input of context.inputs) {
    const value = input.value;

    if (!value || typeof value !== "object") continue;

    const candidates = [
      ...(Array.isArray(value.images) ? value.images : []),
      ...(Array.isArray(value.container_images) ? value.container_images : []),
      ...(Array.isArray(value.published_images) ? value.published_images : []),
    ];

    for (const item of candidates) {
      const image = item.image || item.name || item.repository;

      if (!image) continue;

      images.push({
        image,
        tag: item.tag || item.version || context.release.version,
        channel: item.channel || context.release.channel,
      });
    }
  }

  return dedupeBy(images, (item) => `${item.image}:${item.tag}`);
}

function extractCloudflare(context) {
  return context.inputs
    .filter((input) => input.file.includes("cloudflare"))
    .map((input) => ({
      file: input.file,
      value: input.value,
    }));
}

function extractSecurity(context) {
  const gateInput = context.inputs.find((input) =>
    input.file.includes("security-gate"),
  );
  const reportInput = context.inputs.find((input) =>
    input.file.includes("security-report"),
  );

  return {
    gate: gateInput?.value || reportInput?.value?.gate || null,
    report: reportInput?.value || null,
    summary:
      context.inputs.find((input) => input.file.includes("security-summary"))
        ?.value || "",
    has_security_data: Boolean(gateInput?.value || reportInput?.value),
  };
}

function extractArtifacts(context) {
  return context.inputs
    .filter((input) => {
      return (
        input.file.includes("artifact") ||
        input.file.includes("evidence") ||
        input.file.toLowerCase().includes("sbom") ||
        input.file.endsWith("SHA256SUMS") ||
        input.file.endsWith("SHA512SUMS")
      );
    })
    .map((input) => input.file);
}

function dedupeBy(items, keyFn) {
  const seen = new Map();

  for (const item of items) {
    const key = keyFn(item);

    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

function redactValue(value) {
  if (value === undefined || value === null) return value;

  if (typeof value === "string") {
    return value.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => {
        if (SECRET_KEY_PATTERN.test(key)) {
          return [key, "[REDACTED]"];
        }

        return [key, redactValue(childValue)];
      }),
    );
  }

  return value;
}

function createContext(args) {
  const repoRoot = findRepoRoot();
  const git = getGitMetadata(repoRoot);
  const eventPayload = readGitHubEventPayload();
  const eventRelease = getReleaseFromEvent(eventPayload);
  const eventPullRequest = getPullRequestFromEvent(eventPayload);

  const inputFiles = [
    ...new Set([...args.input_files, ...DEFAULT_INPUT_FILES]),
  ];

  const inputs = inputFiles
    .map((filePath) => readInputFile(filePath, repoRoot))
    .filter(Boolean);

  const changelogPath = resolvePath(args.changelog_file, repoRoot);
  const changelog = readTextFile(changelogPath, {
    required: false,
    fallback: "",
  });

  const releasePlan = getReleasePlanFromInputs(inputs);

  const version =
    args.version ||
    releasePlan?.next_version ||
    releasePlan?.nextVersion ||
    releasePlan?.version ||
    eventRelease?.tag_name ||
    normalizeRefTag(process.env.GITHUB_REF) ||
    "Unreleased";

  const previousVersion =
    args.previous_version ||
    releasePlan?.current_version ||
    releasePlan?.currentVersion ||
    releasePlan?.previous_version ||
    "";

  const releaseUrl =
    args.release_url ||
    eventRelease?.html_url ||
    releasePlan?.release_url ||
    createDefaultReleaseUrl(args.repository, version);

  const changelogUrl =
    args.changelog_url || releasePlan?.changelog_url || releaseUrl || "";

  const context = {
    project: {
      name: PROJECT_NAME,
      repository: args.repository,
      default_branch: DEFAULT_BRANCH,
    },
    release: {
      version,
      previous_version: previousVersion,
      channel: args.channel || releasePlan?.channel || DEFAULT_CHANNEL,
      date:
        args.date ||
        eventRelease?.published_at?.slice(0, 10) ||
        new Date().toISOString().slice(0, 10),
      title: args.title || "",
      release_url: releaseUrl,
      changelog_url: changelogUrl,
      release_plan: releasePlan,
      event_release: eventRelease,
      source_pull_request: eventPullRequest,
    },
    announcement: {
      category: args.category,
      mode: args.mode,
      title: "",
    },
    github: git,
    changelog: {
      file: toRelativePath(changelogPath, repoRoot),
      markdown: changelog,
      highlights: extractBullets(
        extractSection(changelog, /^##\s+🌟\s+Highlights/i),
        8,
      ),
      security: extractSection(changelog, /^##\s+🔐\s+Security/i),
      breaking_changes: extractSection(
        changelog,
        /^##\s+💥\s+Breaking Changes/i,
      ),
      migration_notes: extractSection(changelog, /^##\s+🧭\s+Migration Notes/i),
      known_issues: extractSection(changelog, /^##\s+⚠️\s+Known Issues/i),
    },
    inputs,
    generation: {
      prompt_file: args.prompt_file,
      changelog_file: args.changelog_file,
      output_file: args.output_file,
      context_file: args.context_file,
      result_file: args.result_file,
      model: args.model,
      used_ai: false,
      publish_requested: args.publish,
      write_mode: args.write_mode,
      dry_run: args.dry_run,
      generated_at: new Date().toISOString(),
    },
  };

  context.announcement.title =
    args.title || createDefaultAnnouncementTitle(context);

  return redactValue(context);
}

function extractOpenAIText(responseJson) {
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text.trim();
  }

  if (Array.isArray(responseJson.output)) {
    const chunks = [];

    for (const outputItem of responseJson.output) {
      if (Array.isArray(outputItem.content)) {
        for (const contentItem of outputItem.content) {
          if (typeof contentItem.text === "string")
            chunks.push(contentItem.text);
          if (typeof contentItem.value === "string")
            chunks.push(contentItem.value);
        }
      }

      if (typeof outputItem.text === "string") chunks.push(outputItem.text);
    }

    if (chunks.length) return chunks.join("\n").trim();
  }

  if (Array.isArray(responseJson.choices)) {
    const text = responseJson.choices
      .map((choice) => choice.message?.content || choice.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

async function buildAnnouncementWithOpenAI(prompt, context, args) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (args.require_ai) {
      throw new Error(
        "OPENAI_API_KEY is required because --require-ai was passed.",
      );
    }

    return null;
  }

  if (args.no_ai) return null;

  const baseUrl = normalizeString(
    process.env.OPENAI_BASE_URL,
    "https://api.openai.com/v1",
  ).replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      instructions: prompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Create the final release announcement Markdown from this context.",
                "Use only the information provided.",
                "Return only the announcement Markdown.",
                "",
                "Context:",
                "```json",
                JSON.stringify(context, null, 2),
                "```",
              ].join("\n"),
            },
          ],
        },
      ],
      temperature: 0.35,
      max_output_tokens: 5000,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || response.statusText;

    if (args.require_ai) {
      throw new Error(
        `OpenAI release announcement generation failed: ${message}`,
      );
    }

    logger.warn(
      `OpenAI release announcement generation failed. Falling back locally. ${message}`,
    );
    return null;
  }

  const markdown = extractOpenAIText(data);

  if (!markdown) {
    if (args.require_ai) {
      throw new Error("OpenAI response did not contain announcement text.");
    }

    logger.warn(
      "OpenAI response did not contain announcement text. Falling back locally.",
    );
    return null;
  }

  context.generation.used_ai = true;

  return markdown;
}

function fallbackBlockedAnnouncement(context, security) {
  const blockers = security.gate?.blockers || [];

  const lines = [
    "# ⚠️ Aerealith AI release announcement blocked",
    "",
    "This release announcement should not be published yet.",
    "",
    "## Blockers",
    "",
  ];

  if (blockers.length) {
    for (const blocker of blockers) {
      lines.push(
        `- ${blocker.reason || blocker.title || blocker.type || "Security gate blocker"}`,
      );
    }
  } else {
    lines.push("- Security or release validation did not pass.");
  }

  lines.push("");
  lines.push("## Required Action");
  lines.push("");
  lines.push("- Resolve the blocker.");
  lines.push("- Re-run the release workflow.");
  lines.push(
    "- Generate the announcement again after release validation passes.",
  );

  return `${lines.join("\n").trim()}\n`;
}

function fallbackShortAnnouncement(context) {
  const highlights = context.changelog.highlights.length
    ? context.changelog.highlights.slice(0, 4)
    : [
        "This release includes the changes documented in the generated changelog.",
      ];

  const lines = [
    `# 🚀 ${PROJECT_NAME} ${context.release.version} is now available`,
    "",
    `${PROJECT_NAME} ${context.release.version} is now available on the \`${context.release.channel}\` channel.`,
    "",
    "## ✨ Highlights",
    "",
    ...highlights.map((item) => `- ${item}`),
  ];

  if (context.release.changelog_url) {
    lines.push("");
    lines.push(`Full changelog: ${context.release.changelog_url}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

function fallbackDiscordAnnouncement(context) {
  const highlights = context.changelog.highlights.length
    ? context.changelog.highlights.slice(0, 4)
    : ["Release notes are available in the generated changelog."];

  const lines = [
    `🚀 **${PROJECT_NAME} ${context.release.version} is now available**`,
    "",
    `This release is available on the \`${context.release.channel}\` channel.`,
    "",
    "**Highlights**",
    ...highlights.map((item) => `- ✨ ${item}`),
  ];

  if (context.release.changelog_url) {
    lines.push("");
    lines.push(`Full changelog: ${context.release.changelog_url}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

function fallbackFullAnnouncement(context) {
  const security = extractSecurity(context);

  if (security.gate && security.gate.allowed === false) {
    return fallbackBlockedAnnouncement(context, security);
  }

  const packages = extractPackages(context);
  const images = extractImages(context);
  const cloudflare = extractCloudflare(context);
  const artifacts = extractArtifacts(context);

  const highlights = context.changelog.highlights.length
    ? context.changelog.highlights
    : [
        "This release includes the changes documented in the generated changelog.",
      ];

  const lines = [
    `# 🚀 ${PROJECT_NAME} ${context.release.version} is now available`,
    "",
    `> Released ${context.release.date}`,
    `> Channel: \`${context.release.channel}\``,
  ];

  if (context.release.previous_version) {
    lines.push(`> Previous version: \`${context.release.previous_version}\``);
  }

  lines.push("");
  lines.push("## 🌟 What’s New");
  lines.push("");
  lines.push(
    `This release updates ${PROJECT_NAME} with the changes captured in the release changelog. It keeps the announcement focused on what was provided by release metadata, generated notes, and available automation evidence.`,
  );

  lines.push("");
  lines.push("## ✨ Highlights");
  lines.push("");

  for (const item of highlights.slice(0, 8)) {
    lines.push(`- ${item}`);
  }

  lines.push("");
  lines.push("## 🧠 Why It Matters");
  lines.push("");
  lines.push(
    "This release helps keep the project easier to review, validate, and publish by turning release metadata into clear notes that maintainers and users can understand.",
  );

  if (security.has_security_data) {
    lines.push("");
    lines.push("## 🔐 Security & Trust");
    lines.push("");

    if (security.gate) {
      lines.push(
        `- Security gate result: \`${security.gate.allowed ? "passed" : "failed or blocked"}\`.`,
      );

      if (security.gate.max_severity) {
        lines.push(
          `- Max reported severity: \`${security.gate.max_severity}\`.`,
        );
      }

      if (security.gate.totals) {
        lines.push(
          `- Findings: \`${security.gate.totals.findings || 0}\`; blockers: \`${security.gate.totals.blockers || 0}\`; warnings: \`${security.gate.totals.warnings || 0}\`.`,
        );
      }
    } else {
      lines.push("- Security metadata was included with this release context.");
    }

    lines.push("- No secret values are included in this announcement.");
  }

  if (packages.length || images.length || cloudflare.length) {
    lines.push("");
    lines.push("## ☁️ Deployment Notes");
    lines.push("");

    if (cloudflare.length) {
      lines.push("### Cloudflare");
      lines.push("");

      for (const item of cloudflare) {
        lines.push(
          `- Included Cloudflare deployment metadata from \`${item.file}\`.`,
        );
      }

      lines.push("");
    }

    if (packages.length) {
      lines.push("### npm Packages");
      lines.push("");
      lines.push("| Package | Version | Tag |");
      lines.push("|---|---:|---|");

      for (const item of packages) {
        lines.push(
          `| \`${item.name}\` | \`${item.version}\` | \`${item.tag}\` |`,
        );
      }

      lines.push("");
    }

    if (images.length) {
      lines.push("### Container Images");
      lines.push("");
      lines.push("| Image | Tag | Channel |");
      lines.push("|---|---|---|");

      for (const item of images) {
        lines.push(
          `| \`${item.image}\` | \`${item.tag}\` | \`${item.channel}\` |`,
        );
      }
    }
  }

  if (context.changelog.breaking_changes) {
    lines.push("");
    lines.push("## 💥 Breaking Changes");
    lines.push("");
    lines.push(context.changelog.breaking_changes);
  }

  if (context.changelog.migration_notes) {
    lines.push("");
    lines.push("## 🧭 Upgrade Notes");
    lines.push("");
    lines.push(context.changelog.migration_notes);
  }

  if (context.changelog.known_issues) {
    lines.push("");
    lines.push("## ⚠️ Known Issues");
    lines.push("");
    lines.push(context.changelog.known_issues);
  }

  if (artifacts.length) {
    lines.push("");
    lines.push("## 📎 Release Artifacts");
    lines.push("");

    for (const artifact of artifacts) {
      lines.push(`- \`${artifact}\``);
    }
  }

  const contributor =
    context.release.event_release?.author ||
    context.release.source_pull_request?.author ||
    context.github.actor;

  if (contributor) {
    lines.push("");
    lines.push("## 🙌 Contributors");
    lines.push("");
    lines.push(`Thanks to \`${contributor}\` for the work in this release.`);
  }

  if (context.release.changelog_url || context.release.release_url) {
    lines.push("");
    lines.push("## 📚 Full Changelog");
    lines.push("");

    if (context.release.changelog_url) {
      lines.push(`Full changelog: ${context.release.changelog_url}`);
    } else if (context.release.release_url) {
      lines.push(`Release page: ${context.release.release_url}`);
    }
  }

  lines.push("");
  lines.push(
    `Thank you for following the development of ${PROJECT_NAME}. Each release moves the platform closer to a safer, clearer, and more user-controlled assistant experience.`,
  );

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function fallbackAnnouncement(context) {
  const mode = normalizeString(context.announcement.mode, "full").toLowerCase();

  if (mode === "short") return fallbackShortAnnouncement(context);
  if (mode === "discord") return fallbackDiscordAnnouncement(context);

  return fallbackFullAnnouncement(context);
}

function parseRepository(repository) {
  const normalized = normalizeString(repository, DEFAULT_REPOSITORY);

  if (!normalized.includes("/")) {
    throw new Error(
      `Repository must use owner/name format. Received: ${repository}`,
    );
  }

  const [owner, repo] = normalized.split("/");

  if (!owner || !repo) {
    throw new Error(
      `Repository must use owner/name format. Received: ${repository}`,
    );
  }

  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
  };
}

function getGitHubToken() {
  return (
    process.env.DISCUSSIONS_PAT ||
    process.env.PROJECTS_PAT ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    ""
  );
}

async function githubGraphql(query, variables = {}) {
  const token = getGitHubToken();

  if (!token) {
    throw new Error(
      "Missing GitHub token. Set DISCUSSIONS_PAT, PROJECTS_PAT, GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT.",
    );
  }

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "aerealith-ai-discussion-announcement",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.errors?.length) {
    const message =
      data.errors?.map((error) => error.message).join("; ") ||
      data.message ||
      response.statusText;

    throw new Error(`GitHub GraphQL request failed: ${message}`);
  }

  return data.data;
}

function discussionCategoryMatches(category, requested) {
  const normalized = normalizeString(requested).toLowerCase();

  return (
    normalizeString(category.name).toLowerCase() === normalized ||
    normalizeString(category.slug).toLowerCase() === normalized
  );
}

async function getRepositoryDiscussionInfo(repository, categoryName) {
  const repo = parseRepository(repository);

  const data = await githubGraphql(
    `
      query RepositoryDiscussionInfo($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          nameWithOwner
          hasDiscussionsEnabled
          discussionCategories(first: 100) {
            nodes {
              id
              name
              slug
              isAnswerable
            }
          }
        }
      }
    `,
    {
      owner: repo.owner,
      repo: repo.repo,
    },
  );

  const repositoryNode = data.repository;

  if (!repositoryNode) {
    throw new Error(`Repository not found: ${repository}`);
  }

  if (!repositoryNode.hasDiscussionsEnabled) {
    throw new Error(`GitHub Discussions are not enabled for ${repository}.`);
  }

  const categories = repositoryNode.discussionCategories?.nodes || [];
  const category = categories.find((item) =>
    discussionCategoryMatches(item, categoryName),
  );

  if (!category) {
    const available = categories
      .map((item) => `${item.name} (${item.slug})`)
      .join(", ");
    throw new Error(
      `Discussion category not found: ${categoryName}. Available categories: ${available || "none"}`,
    );
  }

  return {
    repository: repositoryNode,
    category,
  };
}

async function createGitHubDiscussion(input, args) {
  if (!args.publish) {
    return {
      created: false,
      skipped: true,
      dry_run: args.dry_run,
      reason: "Publishing was not requested.",
      discussion: null,
    };
  }

  if (args.dry_run) {
    logger.info("[dry-run] Would publish GitHub Discussion announcement.");

    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      discussion: null,
    };
  }

  if (!args.write_mode) {
    return {
      created: false,
      skipped: true,
      dry_run: false,
      reason: "Write mode is disabled. Set WRITE_MODE=true or pass --publish.",
      discussion: null,
    };
  }

  const info = await getRepositoryDiscussionInfo(
    args.repository,
    args.category,
  );

  const data = await githubGraphql(
    `
      mutation CreateDiscussion(
        $repositoryId: ID!,
        $categoryId: ID!,
        $title: String!,
        $body: String!
      ) {
        createDiscussion(input: {
          repositoryId: $repositoryId,
          categoryId: $categoryId,
          title: $title,
          body: $body
        }) {
          discussion {
            id
            number
            title
            url
            createdAt
            category {
              id
              name
              slug
            }
          }
        }
      }
    `,
    {
      repositoryId: info.repository.id,
      categoryId: info.category.id,
      title: input.title,
      body: input.body,
    },
  );

  const discussion = data.createDiscussion?.discussion;

  if (!discussion) {
    throw new Error("GitHub did not return the created discussion.");
  }

  return {
    created: true,
    skipped: false,
    dry_run: false,
    reason: "Discussion created.",
    category: info.category,
    discussion,
  };
}

function createSummary(context, result, relativeOutput, relativeResult) {
  return [
    "## 📣 Release Announcement",
    "",
    `- Version: \`${context.release.version}\``,
    `- Channel: \`${context.release.channel}\``,
    `- Category: \`${context.announcement.category}\``,
    `- Output: \`${relativeOutput}\``,
    `- Result: \`${relativeResult}\``,
    `- Used AI: \`${context.generation.used_ai ? "true" : "false"}\``,
    `- Publish requested: \`${context.generation.publish_requested ? "true" : "false"}\``,
    `- Discussion created: \`${result.created ? "true" : "false"}\``,
    result.discussion?.url
      ? `- Discussion: ${result.discussion.url}`
      : `- Skip reason: ${result.reason}`,
  ].join("\n");
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

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const promptFile = resolvePath(args.prompt_file, repoRoot);
  const outputFile = resolvePath(args.output_file, repoRoot);
  const contextFile = resolvePath(args.context_file, repoRoot);
  const resultFile = resolvePath(args.result_file, repoRoot);

  const prompt = readTextFile(promptFile);
  const context = createContext(args);

  logger.info(`Building release announcement for ${context.release.version}.`);

  let announcement = await buildAnnouncementWithOpenAI(
    prompt,
    context,
    args,
  ).catch((err) => {
    if (args.require_ai) throw err;

    logger.warn(
      `AI release announcement failed. Falling back locally. ${logger.formatError(err)}`,
    );
    return null;
  });

  if (!announcement) {
    context.generation.used_ai = false;
    announcement = fallbackAnnouncement(context);
  }

  if (!announcement.endsWith("\n")) {
    announcement += "\n";
  }

  const title =
    args.title ||
    context.announcement.title ||
    createDefaultAnnouncementTitle(context);

  const discussionResult = await createGitHubDiscussion(
    {
      title,
      body: announcement,
    },
    args,
  ).catch((err) => {
    if (args.publish && args.write_mode && !args.dry_run) {
      throw err;
    }

    logger.warn(
      `Discussion publishing skipped or failed: ${logger.formatError(err)}`,
    );

    return {
      created: false,
      skipped: true,
      dry_run: args.dry_run,
      reason: logger.formatError(err),
      discussion: null,
    };
  });

  const output = {
    schema_version: 1,
    type: "discussion-announcement-result",
    created_at: new Date().toISOString(),
    project: PROJECT_NAME,
    repository: args.repository,
    release: context.release,
    announcement: {
      title,
      category: args.category,
      file: toRelativePath(outputFile, repoRoot),
      used_ai: context.generation.used_ai,
    },
    result: discussionResult,
  };

  writeTextFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  writeTextFile(outputFile, announcement, {
    dry_run: args.dry_run,
  });

  writeTextFile(resultFile, `${JSON.stringify(output, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeContext = toRelativePath(contextFile, repoRoot);
  const relativeResult = toRelativePath(resultFile, repoRoot);

  setGitHubOutput("release_announcement_file", relativeOutput);
  setGitHubOutput("release_announcement_context_file", relativeContext);
  setGitHubOutput("discussion_announcement_result_file", relativeResult);
  setGitHubOutput("discussion_announcement_title", title);
  setGitHubOutput("discussion_announcement_category", args.category);
  setGitHubOutput(
    "discussion_announcement_created",
    discussionResult.created ? "true" : "false",
  );
  setGitHubOutput(
    "discussion_announcement_number",
    discussionResult.discussion?.number
      ? String(discussionResult.discussion.number)
      : "",
  );
  setGitHubOutput(
    "discussion_announcement_url",
    discussionResult.discussion?.url || "",
  );
  setGitHubOutput(
    "release_announcement_used_ai",
    context.generation.used_ai ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(
      createSummary(context, discussionResult, relativeOutput, relativeResult),
    );
  }

  if (args.print) {
    console.log(announcement);
  }

  if (
    args.publish &&
    args.write_mode &&
    !args.dry_run &&
    !discussionResult.created
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
