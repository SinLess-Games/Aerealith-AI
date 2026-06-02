#!/usr/bin/env node
// .github/scripts/ai/build-changelog-draft.js
// =============================================================================
// Aerealith AI — AI Changelog Draft Builder
// -----------------------------------------------------------------------------
// Purpose:
//   Build a polished changelog draft from release metadata, PR metadata,
//   commits, artifact manifests, package manifests, Docker manifests,
//   Cloudflare deployment results, Nx CI plans, and security reports.
//
// Output:
//   - artifacts/ai/changelog-draft.md
//   - artifacts/ai/changelog-context.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Falls back to deterministic changelog generation when OPENAI_API_KEY is
//     unavailable unless --require-ai is passed.
//   - Redacts secret-like values before sending context to AI.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPO = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_CHANNEL = "release";

const DEFAULT_PROMPT_FILE = ".github/scripts/ai/prompts/changelog.md";
const DEFAULT_OUTPUT_FILE = "artifacts/ai/changelog-draft.md";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/changelog-context.json";

const DEFAULT_MODEL = "gpt-4.1";

const DEFAULT_INPUT_FILES = [
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

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input_files: [],
    output_file: process.env.CHANGELOG_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file: process.env.CHANGELOG_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    prompt_file: process.env.CHANGELOG_PROMPT_FILE || DEFAULT_PROMPT_FILE,
    model:
      process.env.OPENAI_CHANGELOG_MODEL ||
      process.env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || DEFAULT_CHANNEL,
    date: process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10),
    base: process.env.CHANGELOG_BASE || "",
    head: process.env.CHANGELOG_HEAD || "HEAD",
    max_commits: Number(process.env.CHANGELOG_MAX_COMMITS || 100),
    no_ai: normalizeBoolean(process.env.CHANGELOG_NO_AI, false),
    require_ai: normalizeBoolean(process.env.CHANGELOG_REQUIRE_AI, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.CHANGELOG_PRINT, true),
    write_summary: normalizeBoolean(process.env.CHANGELOG_STEP_SUMMARY, true),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

    if (arg === "--prompt") {
      args.prompt_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--model") {
      args.model = argv[index + 1];
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

    if (arg === "--max-commits") {
      args.max_commits = Number(argv[index + 1] || 100);
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

  args.input_files.push(
    ...normalizeStringList(process.env.CHANGELOG_INPUT_FILES),
  );

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Changelog Draft Builder

Usage:
  node .github/scripts/ai/build-changelog-draft.js [options]

Options:
  -i, --input <file>           Add an input metadata file.
  -o, --output <file>          Changelog markdown output file.
      --context-output <file>  Context JSON output file.
      --prompt <file>          Prompt markdown file.
      --model <model>          OpenAI model.
      --version <version>      Release version.
      --previous-version <v>   Previous release version.
      --channel <channel>      Release channel.
      --date <date>            Release date.
      --base <ref>             Git base ref for commits.
      --head <ref>             Git head ref for commits.
      --max-commits <number>   Maximum commits to collect.
      --no-ai                  Disable AI generation and use fallback.
      --require-ai             Fail if AI generation is unavailable.
      --dry-run                Do not write files.
      --no-print               Do not print changelog to stdout.
      --no-summary             Do not append GitHub step summary.
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

function readJsonFile(filePath, options = {}) {
  if (!isFile(filePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(`JSON file not found: ${filePath}`);
  }

  const parsed = safeJsonParse(fs.readFileSync(filePath, "utf8"), null);

  if (parsed === null) {
    throw new Error(`Failed to parse JSON file: ${filePath}`);
  }

  return parsed;
}

function readInputFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const raw = readTextFile(absolutePath, { required: false, fallback: "" });
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".json" || extension === ".jsonc") {
    return {
      file: relativePath,
      type: "json",
      value: safeJsonParse(stripJsonc(raw), raw),
    };
  }

  if (
    extension === ".md" ||
    extension === ".txt" ||
    path.basename(absolutePath).endsWith("SUMS")
  ) {
    return {
      file: relativePath,
      type: "text",
      value: raw,
    };
  }

  return {
    file: relativePath,
    type: "text",
    value: raw,
  };
}

function stripJsonc(input) {
  return String(input || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
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
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
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

function getGitTags(repoRoot) {
  return runGit(["tag", "--list"], { repoRoot })
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isReleaseTag(tag) {
  return /^V\d+\.\d+\.\d+$/.test(String(tag || "").trim());
}

function parseVersionParts(tag) {
  const match = /^V?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag || "").trim());

  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareReleaseTags(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function getLatestReleaseTag(repoRoot) {
  return (
    getGitTags(repoRoot).filter(isReleaseTag).sort(compareReleaseTags).at(-1) ||
    ""
  );
}

function getCommitMessages(repoRoot, base, head, maxCommits) {
  const range = base ? `${base}..${head || "HEAD"}` : head || "HEAD";
  const output = runGit(
    [
      "log",
      `--max-count=${Number.isFinite(maxCommits) ? maxCommits : 100}`,
      "--pretty=format:%H%x09%h%x09%an%x09%s",
      range,
    ],
    { repoRoot, fallback: "" },
  );

  return output
    .split(/\r?\n/)
    .map((line) => {
      const [sha, short_sha, author, ...subjectParts] = line.split("\t");
      const subject = subjectParts.join("\t").trim();

      if (!sha || !subject) return null;

      return {
        sha,
        short_sha,
        author,
        subject,
      };
    })
    .filter(Boolean);
}

function getChangedFiles(repoRoot, base, head) {
  if (!base) return [];

  const output = runGit(["diff", "--name-only", `${base}..${head || "HEAD"}`], {
    repoRoot,
    fallback: "",
  });

  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function readGitHubEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !isFile(eventPath)) return {};

  return (
    readJsonFile(eventPath, {
      required: false,
      fallback: {},
    }) || {}
  );
}

function getPullRequestFromEvent(eventPayload) {
  const pr = eventPayload.pull_request;

  if (!pr) return null;

  return {
    number: pr.number || eventPayload.number || null,
    title: pr.title || "",
    body: pr.body || "",
    author: pr.user?.login || "",
    state: pr.state || "",
    merged: Boolean(pr.merged),
    draft: Boolean(pr.draft),
    base_branch: pr.base?.ref || "",
    head_branch: pr.head?.ref || "",
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((label) => label.name).filter(Boolean)
      : [],
    milestone: pr.milestone?.title || null,
    html_url: pr.html_url || "",
  };
}

function getReleasePlanFromInputs(inputs) {
  const candidates = [
    "artifacts/release/release-plan.json",
    "artifacts/release/semver-release-plan.json",
  ];

  for (const candidate of candidates) {
    const input = inputs.find((item) => item.file === candidate);

    if (input && typeof input.value === "object" && input.value !== null) {
      return input.value;
    }
  }

  const byType = inputs.find((item) => {
    return (
      item.value?.type === "semver-release-plan" ||
      item.value?.type === "release-plan"
    );
  });

  return byType?.value || null;
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
  const pullRequest = getPullRequestFromEvent(eventPayload);

  const explicitInputs = args.input_files.filter(Boolean);
  const inputFiles = [...new Set([...explicitInputs, ...DEFAULT_INPUT_FILES])];

  const inputs = inputFiles
    .map((filePath) => readInputFile(filePath, repoRoot))
    .filter(Boolean);

  const releasePlan = getReleasePlanFromInputs(inputs);

  const latestReleaseTag = getLatestReleaseTag(repoRoot);
  const base =
    args.base ||
    releasePlan?.current_version ||
    releasePlan?.currentVersion ||
    latestReleaseTag ||
    "";

  const version =
    args.version ||
    releasePlan?.next_version ||
    releasePlan?.nextVersion ||
    normalizeRefTag(process.env.GITHUB_REF) ||
    "Unreleased";

  const previousVersion =
    args.previous_version ||
    releasePlan?.current_version ||
    releasePlan?.currentVersion ||
    latestReleaseTag ||
    "";

  const channel = args.channel || releasePlan?.channel || DEFAULT_CHANNEL;

  const commits = getCommitMessages(
    repoRoot,
    base,
    args.head,
    args.max_commits,
  );
  const changedFiles = getChangedFiles(repoRoot, base, args.head);

  const labels = [
    ...normalizeStringList(process.env.PR_LABELS),
    ...normalizeStringList(process.env.RELEASE_LABELS),
    ...(pullRequest?.labels || []),
    ...(Array.isArray(releasePlan?.labels) ? releasePlan.labels : []),
  ];

  return redactValue({
    project: {
      name: PROJECT_NAME,
      repository: git.repository,
      default_branch: DEFAULT_BRANCH,
    },
    release: {
      version,
      previous_version: previousVersion,
      channel,
      date: args.date,
      latest_release_tag: latestReleaseTag,
      release_plan: releasePlan,
      labels: [...new Set(labels)],
    },
    github: git,
    pull_request: pullRequest,
    commits,
    changed_files: changedFiles,
    inputs,
    generation: {
      prompt_file: args.prompt_file,
      output_file: args.output_file,
      context_file: args.context_file,
      model: args.model,
      used_ai: false,
      generated_at: new Date().toISOString(),
    },
  });
}

function normalizeRefTag(ref) {
  const value = normalizeString(ref);

  if (!value.startsWith("refs/tags/")) return "";

  return value.replace(/^refs\/tags\//, "");
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
          if (typeof contentItem.text === "string") {
            chunks.push(contentItem.text);
          }

          if (typeof contentItem.value === "string") {
            chunks.push(contentItem.value);
          }
        }
      }

      if (typeof outputItem.text === "string") {
        chunks.push(outputItem.text);
      }
    }

    if (chunks.length) {
      return chunks.join("\n").trim();
    }
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

async function buildChangelogWithOpenAI(prompt, context, args) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (args.require_ai) {
      throw new Error(
        "OPENAI_API_KEY is required because --require-ai was passed.",
      );
    }

    return null;
  }

  if (args.no_ai) {
    return null;
  }

  logger.mask(apiKey);

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
                "Create the final changelog Markdown from this release context.",
                "Use only the information provided.",
                "Return only the changelog Markdown.",
                "",
                "Release context:",
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
      throw new Error(`OpenAI changelog generation failed: ${message}`);
    }

    logger.warn(
      `OpenAI changelog generation failed. Falling back locally. ${message}`,
    );
    return null;
  }

  const markdown = extractOpenAIText(data);

  if (!markdown) {
    if (args.require_ai) {
      throw new Error("OpenAI response did not contain changelog text.");
    }

    logger.warn(
      "OpenAI response did not contain changelog text. Falling back locally.",
    );
    return null;
  }

  context.generation.used_ai = true;

  return markdown;
}

function cleanCommitSubject(subject) {
  return normalizeString(subject)
    .replace(
      /^(feat|fix|docs|chore|ci|build|refactor|perf|test|security)(\([^)]+\))?!?:\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function commitType(subject) {
  const value = normalizeString(subject).toLowerCase();

  if (/^feat(\([^)]+\))?!?:/.test(value)) return "feature";
  if (/^fix(\([^)]+\))?!?:/.test(value)) return "fix";
  if (/^security(\([^)]+\))?!?:/.test(value)) return "security";
  if (/^docs(\([^)]+\))?!?:/.test(value)) return "docs";
  if (/^(ci|build)(\([^)]+\))?!?:/.test(value)) return "ci";
  if (/^(refactor|perf|chore|test)(\([^)]+\))?!?:/.test(value))
    return "improvement";

  return "change";
}

function findInputsByType(context, type) {
  return context.inputs.filter((input) => {
    if (input.value?.type === type) return true;
    if (input.file.toLowerCase().includes(type.toLowerCase())) return true;
    return false;
  });
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

function extractSecurity(context) {
  const gateInput = context.inputs.find((input) =>
    input.file.includes("security-gate"),
  );
  const reportInput = context.inputs.find((input) =>
    input.file.includes("security-report"),
  );

  const gate = gateInput?.value || reportInput?.value?.gate || null;
  const report = reportInput?.value || null;

  return {
    gate,
    report,
    has_security_data: Boolean(gate || report),
  };
}

function extractCloudflare(context) {
  return context.inputs
    .filter((input) => input.file.includes("cloudflare"))
    .map((input) => ({
      file: input.file,
      value: input.value,
    }));
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

function formatBulletFromCommit(commit) {
  const summary = cleanCommitSubject(commit.subject);
  return `- \`${commit.short_sha}\` — ${summary || commit.subject}${commit.author ? ` Thanks \`${commit.author}\`.` : "."}`;
}

function fallbackChangelog(context) {
  const commits = context.commits || [];
  const features = commits.filter(
    (commit) => commitType(commit.subject) === "feature",
  );
  const fixes = commits.filter(
    (commit) => commitType(commit.subject) === "fix",
  );
  const securityCommits = commits.filter(
    (commit) => commitType(commit.subject) === "security",
  );
  const improvements = commits.filter((commit) =>
    ["improvement", "ci", "docs"].includes(commitType(commit.subject)),
  );
  const otherChanges = commits.filter(
    (commit) => commitType(commit.subject) === "change",
  );

  const packages = extractPackages(context);
  const images = extractImages(context);
  const security = extractSecurity(context);
  const cloudflare = extractCloudflare(context);

  const lines = [
    `# 🚀 ${PROJECT_NAME} ${context.release.version}`,
    "",
    `> Released ${context.release.date}`,
    `> Channel: \`${context.release.channel}\``,
  ];

  if (context.release.previous_version) {
    lines.push(`> Previous version: \`${context.release.previous_version}\``);
  }

  lines.push("");
  lines.push("## 🌟 Highlights");
  lines.push("");

  if (context.pull_request?.title) {
    lines.push(`- ${context.pull_request.title}`);
  }

  if (features.length) {
    lines.push(
      `- Added ${features.length} feature-focused change${features.length === 1 ? "" : "s"}.`,
    );
  }

  if (fixes.length) {
    lines.push(
      `- Fixed ${fixes.length} reported issue${fixes.length === 1 ? "" : "s"}.`,
    );
  }

  if (improvements.length) {
    lines.push(
      `- Improved ${improvements.length} maintenance, workflow, documentation, or quality area${improvements.length === 1 ? "" : "s"}.`,
    );
  }

  if (security.has_security_data) {
    const allowed = security.gate?.allowed;

    lines.push(
      allowed === false
        ? "- Security gate data was provided and indicates release review is required."
        : "- Security evidence was included with this changelog context.",
    );
  }

  if (
    !context.pull_request?.title &&
    !commits.length &&
    !security.has_security_data
  ) {
    lines.push("- No detailed release metadata was provided.");
  }

  if (features.length) {
    lines.push("");
    lines.push("## ✨ New Features");
    lines.push("");
    features.forEach((commit) => lines.push(formatBulletFromCommit(commit)));
  }

  if (improvements.length) {
    lines.push("");
    lines.push("## 🛠️ Improvements");
    lines.push("");
    improvements.forEach((commit) =>
      lines.push(formatBulletFromCommit(commit)),
    );
  }

  if (fixes.length) {
    lines.push("");
    lines.push("## 🐛 Fixes");
    lines.push("");
    fixes.forEach((commit) => lines.push(formatBulletFromCommit(commit)));
  }

  if (security.has_security_data || securityCommits.length) {
    lines.push("");
    lines.push("## 🔐 Security");
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
    }

    securityCommits.forEach((commit) =>
      lines.push(formatBulletFromCommit(commit)),
    );
  }

  if (packages.length) {
    lines.push("");
    lines.push("## 📦 Packages");
    lines.push("");
    lines.push("| Package | Version | Tag |");
    lines.push("|---|---:|---|");

    for (const item of packages) {
      lines.push(
        `| \`${item.name}\` | \`${item.version}\` | \`${item.tag}\` |`,
      );
    }
  }

  if (images.length) {
    lines.push("");
    lines.push("## 🐳 Container Images");
    lines.push("");
    lines.push("| Image | Tag | Channel |");
    lines.push("|---|---|---|");

    for (const item of images) {
      lines.push(
        `| \`${item.image}\` | \`${item.tag}\` | \`${item.channel}\` |`,
      );
    }
  }

  if (cloudflare.length) {
    lines.push("");
    lines.push("## ☁️ Cloudflare");
    lines.push("");

    for (const item of cloudflare) {
      lines.push(
        `- Included Cloudflare deployment metadata from \`${item.file}\`.`,
      );
    }
  }

  const artifactInputs = context.inputs.filter((input) => {
    return (
      input.file.includes("artifact") ||
      input.file.endsWith("SHA256SUMS") ||
      input.file.endsWith("SHA512SUMS") ||
      input.file.includes("sbom") ||
      input.file.includes("evidence")
    );
  });

  if (artifactInputs.length) {
    lines.push("");
    lines.push("## 📎 Release Artifacts");
    lines.push("");

    for (const input of artifactInputs) {
      lines.push(`- \`${input.file}\``);
    }
  }

  if (commits.length) {
    lines.push("");
    lines.push("## 📚 Full Change List");
    lines.push("");

    for (const commit of [
      ...features,
      ...fixes,
      ...improvements,
      ...securityCommits,
      ...otherChanges,
    ]) {
      lines.push(formatBulletFromCommit(commit));
    }
  }

  if (context.pull_request?.author || context.github.actor) {
    lines.push("");
    lines.push("## 🙌 Contributors");
    lines.push("");
    lines.push(
      `Thanks to \`${context.pull_request?.author || context.github.actor}\` for the work in this release.`,
    );
  }

  return `${lines.join("\n").trim()}\n`;
}

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) return false;

  fs.appendFileSync(summaryFile, `${markdown.trim()}\n\n`);
  return true;
}

function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (!outputFile) return false;

  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);
  return true;
}

function createSummary(context, changelogFile) {
  return [
    "## 📝 Changelog Draft",
    "",
    `- Version: \`${context.release.version}\``,
    `- Channel: \`${context.release.channel}\``,
    `- Output: \`${changelogFile}\``,
    `- Used AI: \`${context.generation.used_ai ? "true" : "false"}\``,
    `- Commits included: \`${context.commits.length}\``,
    `- Metadata files included: \`${context.inputs.length}\``,
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const promptFile = resolvePath(args.prompt_file, repoRoot);
  const outputFile = resolvePath(args.output_file, repoRoot);
  const contextFile = resolvePath(args.context_file, repoRoot);

  const prompt = readTextFile(promptFile);
  const context = createContext(args);

  logger.info(`Building changelog draft for ${context.release.version}.`);

  let changelog = await buildChangelogWithOpenAI(prompt, context, args);

  if (!changelog) {
    context.generation.used_ai = false;
    changelog = fallbackChangelog(context);
  }

  if (!changelog.endsWith("\n")) {
    changelog += "\n";
  }

  writeTextFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  writeTextFile(outputFile, changelog, {
    dry_run: args.dry_run,
  });

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeContext = toRelativePath(contextFile, repoRoot);

  setGitHubOutput("changelog_file", relativeOutput);
  setGitHubOutput("changelog_context_file", relativeContext);
  setGitHubOutput("changelog_version", context.release.version);
  setGitHubOutput(
    "changelog_used_ai",
    context.generation.used_ai ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(createSummary(context, relativeOutput));
  }

  if (args.print) {
    console.log(changelog);
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
