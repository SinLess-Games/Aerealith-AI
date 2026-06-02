#!/usr/bin/env node
// .github/scripts/ai/create-pr-from-issue.js
// =============================================================================
// Aerealith AI — Create Pull Request from Issue
// -----------------------------------------------------------------------------
// Purpose:
//   Analyze a GitHub issue and create a matching draft pull request when the
//   issue is actionable and no linked pull request already exists.
//
// Output:
//   - artifacts/ai/pr-from-issue.json
//   - artifacts/ai/pr-from-issue-context.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Falls back to deterministic PR drafting when OPENAI_API_KEY is missing
//     unless --require-ai is passed.
//   - Does not create a PR unless write mode is enabled or --create is used.
//   - The head branch must already exist before GitHub can create the PR.
//   - Redacts secret-like values before sending context to AI.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_PROMPT_FILE = ".github/scripts/ai/prompts/pr-from-issue.md";
const DEFAULT_OUTPUT_FILE = "artifacts/ai/pr-from-issue.json";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/pr-from-issue-context.json";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_ASSIGNEE = "Sinless777";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const LINKED_PR_PATTERN =
  /\b(?:PR|pull\s+request|implemented\s+in|tracked\s+in|linked\s+PR)\s+#(\d+)\b/gi;

const PULL_URL_PATTERN = /github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/gi;

const CLOSING_KEYWORD_PATTERN =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|webhook|cookie|session|authorization|bearer|pat|credential)/i;

const SECRET_VALUE_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|[A-Za-z0-9+/]{32,}={0,2})/g;

const DEPENDENCY_AUTHORS = new Set([
  "dependabot[bot]",
  "renovate[bot]",
  "mend[bot]",
]);

const DEPENDENCY_LABELS = new Set([
  "dependencies",
  "kind:dependencies",
  "security:dependency",
  "renovate",
  "dependabot",
  "mend",
]);

const RELEASE_LABELS = new Set([
  "release:major",
  "release:minor",
  "release:patch",
]);

const TYPE_LABELS = new Set([
  "type:feature",
  "type:bug",
  "type:chore",
  "type:security",
  "type:docs",
  "type:architecture",
  "type:release",
  "type:ci",
  "type:cloudflare",
  "type:ai",
]);

const STATUS_LABELS = new Set([
  "status:todo",
  "status:ready",
  "status:in-progress",
  "status:blocked",
  "status:done",
]);

const VALID_CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const VALID_CLOSING_KEYWORDS = new Set([
  "Closes",
  "Fixes",
  "Resolves",
  "Related to",
]);

const AREA_RULES = [
  { pattern: /^apps\/frontend\//, labels: ["area:frontend"] },
  { pattern: /^apps\/services\//, labels: ["area:backend"] },
  { pattern: /^apps\/integrations\//, labels: ["area:backend"] },
  { pattern: /^apps\/connectors\//, labels: ["area:backend"] },
  { pattern: /^apps\/e2e\//, labels: ["area:testing"] },
  { pattern: /^libs\//, labels: ["area:libs"] },
  { pattern: /^(docs|Docs)\//, labels: ["area:docs"] },
  {
    pattern: /^\.github\/workflows\//,
    labels: ["area:github-actions", "area:ci"],
  },
  { pattern: /^\.github\/actions\//, labels: ["area:github-actions"] },
  {
    pattern: /^\.github\/scripts\/ai\//,
    labels: ["area:github-actions", "area:ci", "area:ai"],
  },
  {
    pattern: /^\.github\/scripts\//,
    labels: ["area:github-actions", "area:ci"],
  },
  { pattern: /^\.github\/repo-management\//, labels: ["area:github-actions"] },
  { pattern: /^\.github\/ISSUE_TEMPLATE\//, labels: ["area:github-actions"] },
  { pattern: /^\.github\/codeql\.ya?ml$/, labels: ["area:security"] },
  {
    pattern: /^\.github\/(dependabot\.ya?ml|renovate\.json5)$/,
    labels: ["area:dependencies"],
  },
  {
    pattern: /^\.github\/(labels|labeler|milestones|assignees)\.ya?ml$/,
    labels: ["area:github-actions"],
  },
  { pattern: /(^|\/)wrangler\.(jsonc?|toml)$/, labels: ["area:cloudflare"] },
  { pattern: /(^|\/)Dockerfile(\..+)?$/, labels: ["area:docker"] },
  { pattern: /(^|\/)package\.json$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)pnpm-lock\.yaml$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)pnpm-workspace\.yaml$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)nx\.json$/, labels: ["area:ci"] },
  { pattern: /(^|\/)tsconfig.*\.json$/, labels: ["area:libs"] },
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
    issue_number: Number(process.env.ISSUE_NUMBER || 0),
    output_file: process.env.PR_FROM_ISSUE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file:
      process.env.PR_FROM_ISSUE_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    prompt_file: process.env.PR_FROM_ISSUE_PROMPT_FILE || DEFAULT_PROMPT_FILE,
    model:
      process.env.OPENAI_PR_MODEL ||
      process.env.OPENAI_TRIAGE_MODEL ||
      process.env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    default_assignee: process.env.DEFAULT_ASSIGNEE || DEFAULT_ASSIGNEE,
    base:
      process.env.PR_BASE_BRANCH ||
      process.env.GITHUB_BASE_REF ||
      DEFAULT_BRANCH,
    head: process.env.PR_HEAD_BRANCH || process.env.ISSUE_BRANCH || "",
    no_ai: normalizeBoolean(process.env.PR_FROM_ISSUE_NO_AI, false),
    require_ai: normalizeBoolean(process.env.PR_FROM_ISSUE_REQUIRE_AI, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_mode: normalizeBoolean(
      process.env.PR_FROM_ISSUE_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    create: normalizeBoolean(process.env.CREATE_PR_FROM_ISSUE, false),
    apply_labels: normalizeBoolean(
      process.env.PR_FROM_ISSUE_APPLY_LABELS,
      true,
    ),
    comment_on_issue: normalizeBoolean(
      process.env.PR_FROM_ISSUE_COMMENT_ON_ISSUE,
      true,
    ),
    print: normalizeBoolean(process.env.PR_FROM_ISSUE_PRINT, true),
    write_summary: normalizeBoolean(
      process.env.PR_FROM_ISSUE_STEP_SUMMARY,
      true,
    ),
    max_comments: Number(process.env.PR_FROM_ISSUE_MAX_COMMENTS || 100),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--issue" || arg === "--issue-number") {
      args.issue_number = Number(argv[index + 1]);
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

    if (arg === "--assignee") {
      args.default_assignee = argv[index + 1];
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

    if (arg === "--write") {
      args.write_mode = true;
      continue;
    }

    if (arg === "--create") {
      args.create = true;
      continue;
    }

    if (arg === "--no-create") {
      args.create = false;
      args.write_mode = false;
      continue;
    }

    if (arg === "--apply-labels") {
      args.apply_labels = true;
      continue;
    }

    if (arg === "--no-apply-labels") {
      args.apply_labels = false;
      continue;
    }

    if (arg === "--comment-on-issue") {
      args.comment_on_issue = true;
      continue;
    }

    if (arg === "--no-comment-on-issue") {
      args.comment_on_issue = false;
      continue;
    }

    if (arg === "--max-comments") {
      args.max_comments = Number(argv[index + 1]);
      index += 1;
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
Aerealith AI PR-from-Issue Creator

Usage:
  node .github/scripts/ai/create-pr-from-issue.js [options]

Options:
      --repo <owner/repo>       Repository slug.
      --issue <number>          Issue number.
  -o, --output <file>           PR draft JSON output file.
      --context-output <file>   Context JSON output file.
      --prompt <file>           Prompt markdown file.
      --model <model>           OpenAI model.
      --assignee <login>        Default PR assignee.
      --base <branch>           PR base branch.
      --head <branch>           PR head branch. Must already exist to create PR.
      --no-ai                   Disable AI generation and use fallback.
      --require-ai              Fail if AI generation is unavailable.
      --dry-run                 Do not create PR or write files.
      --write                   Enable mutating GitHub writes.
      --create                  Create the PR when recommended.
      --no-create               Never create the PR.
      --apply-labels            Apply labels to created PR issue.
      --no-apply-labels         Do not apply labels to created PR issue.
      --comment-on-issue        Comment on the source issue after creating a PR.
      --no-comment-on-issue     Do not comment on the source issue.
      --max-comments <number>   Maximum issue comments to collect.
      --no-print                Do not print output JSON.
      --no-summary              Do not append GitHub step summary.
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

function stripJsonFence(text) {
  const source = String(text || "").trim();

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  return source;
}

function parseAiJson(text) {
  const stripped = stripJsonFence(text);
  const direct = safeJsonParse(stripped, null);

  if (direct) return direct;

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain a JSON object.");
  }

  const sliced = stripped.slice(start, end + 1);
  const parsed = safeJsonParse(sliced, null);

  if (!parsed) {
    throw new Error("AI response JSON could not be parsed.");
  }

  return parsed;
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
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.PROJECTS_PAT ||
    ""
  );
}

function buildHeaders(options = {}) {
  const token = getGitHubToken();

  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "aerealith-ai-pr-from-issue",
    ...(options.json === false ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
}

function buildApiUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  return `${GITHUB_API_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};

  return Object.fromEntries(
    linkHeader
      .split(",")
      .map((part) => {
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
        if (!match) return [null, null];

        return [match[2], match[1]];
      })
      .filter(([key]) => Boolean(key)),
  );
}

async function githubRequest(endpoint, options = {}) {
  const method = normalizeString(options.method, "GET").toUpperCase();
  const url = buildApiUrl(endpoint);

  if (options.require_token !== false && !getGitHubToken()) {
    throw new Error(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, or PROJECTS_PAT.",
    );
  }

  const response = await fetch(url, {
    method,
    headers: buildHeaders(options),
    body:
      options.body === undefined || options.body === null
        ? undefined
        : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? safeJsonParse(text, text) : null;

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      response.statusText;

    throw new Error(
      `GitHub API request failed: ${method} ${endpoint}\nStatus: ${response.status}\nMessage: ${message}`,
    );
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

async function githubPaginatedRequest(endpoint, options = {}) {
  const maxPages = Number(options.max_pages || 20);
  const results = [];
  let nextUrl = endpoint;
  let page = 0;

  while (nextUrl && page < maxPages) {
    page += 1;

    const response = await githubRequest(nextUrl, options);

    if (Array.isArray(response.data)) {
      results.push(...response.data);
    } else if (Array.isArray(response.data?.items)) {
      results.push(...response.data.items);
    } else if (response.data !== null && response.data !== undefined) {
      results.push(response.data);
    }

    const links = parseLinkHeader(response.headers?.get?.("link"));
    nextUrl = links.next || null;
  }

  return results;
}

function readGitHubEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !isFile(eventPath)) return {};

  const parsed = safeJsonParse(fs.readFileSync(eventPath, "utf8"), null);
  return parsed || {};
}

function normalizeIssueFromEvent(eventPayload) {
  const issue = eventPayload.issue;

  if (!issue || issue.pull_request) return null;

  return {
    number: issue.number || eventPayload.number || null,
    title: issue.title || "",
    body: issue.body || "",
    state: issue.state || "",
    author: issue.user?.login || "",
    html_url: issue.html_url || "",
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label) => label.name).filter(Boolean)
      : [],
    assignees: Array.isArray(issue.assignees)
      ? issue.assignees.map((assignee) => assignee.login).filter(Boolean)
      : [],
    milestone: issue.milestone?.title || null,
    locked: Boolean(issue.locked),
    raw_source: "event",
  };
}

function normalizeIssueFromApi(issue) {
  if (issue.pull_request) {
    throw new Error(`Issue #${issue.number} is a pull request, not an issue.`);
  }

  return {
    number: issue.number || null,
    title: issue.title || "",
    body: issue.body || "",
    state: issue.state || "",
    author: issue.user?.login || "",
    html_url: issue.html_url || "",
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label) => label.name).filter(Boolean)
      : [],
    assignees: Array.isArray(issue.assignees)
      ? issue.assignees.map((assignee) => assignee.login).filter(Boolean)
      : [],
    milestone: issue.milestone?.title || null,
    locked: Boolean(issue.locked),
    raw_source: "api",
  };
}

async function getIssueContext(args) {
  const repo = parseRepository(args.repository);
  const eventPayload = readGitHubEventPayload();

  let issue = normalizeIssueFromEvent(eventPayload);

  if (!issue && args.issue_number) {
    const response = await githubRequest(
      `/repos/${repo.owner}/${repo.repo}/issues/${args.issue_number}`,
    );
    issue = normalizeIssueFromApi(response.data);
  }

  if (!issue) {
    throw new Error(
      "Issue context was not found. Run on an issues event or pass --issue <number>.",
    );
  }

  const [comments, timeline, searchMatches] = await Promise.all([
    githubPaginatedRequest(
      `/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments?per_page=100`,
      {
        max_pages: Math.ceil(args.max_comments / 100),
      },
    ).catch((err) => {
      logger.warn(`Could not read issue comments: ${logger.formatError(err)}`);
      return [];
    }),

    githubPaginatedRequest(
      `/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/timeline?per_page=100`,
      {
        max_pages: 5,
        headers: {
          Accept: "application/vnd.github+json",
        },
      },
    ).catch((err) => {
      logger.warn(`Could not read issue timeline: ${logger.formatError(err)}`);
      return [];
    }),

    searchLinkedPullRequests(args.repository, issue.number).catch((err) => {
      logger.warn(
        `Could not search linked pull requests: ${logger.formatError(err)}`,
      );
      return [];
    }),
  ]);

  return {
    ...issue,
    comments: comments.slice(0, args.max_comments).map((comment) => ({
      author: comment.user?.login || "",
      body: truncate(comment.body || "", 3000),
      created_at: comment.created_at || "",
      html_url: comment.html_url || "",
    })),
    timeline: timeline.slice(0, 100).map((event) => ({
      event: event.event || "",
      actor: event.actor?.login || "",
      created_at: event.created_at || "",
      source: event.source
        ? {
            type: event.source.type || "",
            issue_number: event.source.issue?.number || null,
            issue_title: event.source.issue?.title || "",
            issue_url: event.source.issue?.html_url || "",
          }
        : null,
      commit_id: event.commit_id || "",
      commit_url: event.commit_url || "",
    })),
    linked_pull_request_search_matches: searchMatches,
  };
}

async function searchLinkedPullRequests(repository, issueNumber) {
  const repo = parseRepository(repository);
  const query = encodeURIComponent(
    `repo:${repo.slug} type:pr "#${issueNumber}"`,
  );
  const response = await githubRequest(`/search/issues?q=${query}&per_page=20`);

  const items = Array.isArray(response.data?.items) ? response.data.items : [];

  return items
    .filter((item) => item.pull_request)
    .map((item) => ({
      number: item.number,
      title: item.title || "",
      state: item.state || "",
      html_url: item.html_url || "",
      labels: Array.isArray(item.labels)
        ? item.labels.map((label) => label.name).filter(Boolean)
        : [],
    }));
}

function truncate(value, maxLength) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength)}\n...[truncated]`;
}

function extractLinkedPullRequestsFromText(text) {
  const numbers = new Set();
  const source = String(text || "");

  let match;

  while ((match = LINKED_PR_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  while ((match = PULL_URL_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  return [...numbers].sort((a, b) => a - b);
}

function extractClosingIssueReferencesFromText(text) {
  const numbers = new Set();
  const source = String(text || "");
  let match;

  while ((match = CLOSING_KEYWORD_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  return [...numbers].sort((a, b) => a - b);
}

function extractLinkedPullRequests(context) {
  const issue = context.issue;

  const textSources = [
    issue.title,
    issue.body,
    ...issue.comments.map((comment) => comment.body),
  ];

  const textual = textSources.flatMap((source) =>
    extractLinkedPullRequestsFromText(source),
  );

  const timelineLinked = issue.timeline
    .filter((event) => {
      return (
        event.source?.type === "issue" &&
        Number.isFinite(Number(event.source.issue_number))
      );
    })
    .map((event) => Number(event.source.issue_number));

  const searchMatches = issue.linked_pull_request_search_matches.map(
    (item) => item.number,
  );

  return [...new Set([...textual, ...timelineLinked, ...searchMatches])]
    .filter((number) => Number(number) !== Number(issue.number))
    .sort((a, b) => a - b);
}

function hasClosingReferences(issue) {
  const sources = [
    issue.body,
    ...issue.comments.map((comment) => comment.body),
    ...issue.linked_pull_request_search_matches.map(
      (pr) => `${pr.title} ${pr.html_url}`,
    ),
  ];

  return sources.some((source) =>
    extractClosingIssueReferencesFromText(source).includes(issue.number),
  );
}

function isDependencyIssue(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );
  const author = normalizeString(issue.author);
  const text = [issue.title, issue.body, ...labels].join("\n").toLowerCase();

  if (DEPENDENCY_AUTHORS.has(author)) return true;
  if (labels.some((label) => DEPENDENCY_LABELS.has(label))) return true;

  return /\b(dependabot|renovate|mend|dependency|dependencies|pnpm-lock|lockfile)\b/.test(
    text,
  );
}

function hasSecuritySignal(issue) {
  const text = [
    issue.title,
    issue.body,
    ...normalizeStringList(issue.labels),
    ...issue.comments.map((comment) => comment.body),
  ]
    .join("\n")
    .toLowerCase();

  return /\b(security|vulnerab|cve-|ghsa-|secret|codeql|sonar|dependency review|audit|osv|trivy|semgrep|snyk|sbom|attestation)\b/.test(
    text,
  );
}

function isBlockedIssue(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );

  if (issue.state === "closed") return true;
  if (labels.includes("status:blocked")) return true;
  if (labels.includes("duplicate")) return true;
  if (labels.includes("invalid")) return true;

  return false;
}

function isActionableIssue(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );
  const text = `${issue.title}\n${issue.body || ""}`.toLowerCase();

  if (labels.includes("status:ready")) return true;
  if (labels.includes("status:todo")) return true;
  if (labels.includes("status:in-progress")) return true;

  return /\b(acceptance criteria|implementation|scope|fix|add|create|update|refactor|deploy|release|document|validate)\b/.test(
    text,
  );
}

function inferChangedFilesFromIssue(issue) {
  const text = [
    issue.title,
    issue.body,
    ...issue.comments.map((comment) => comment.body),
  ].join("\n");

  const fileLikePattern =
    /(?:^|\s|`)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.@()[\]-]+)+\.(?:js|ts|tsx|jsx|json|jsonc|yaml|yml|md|toml|css|scss|html|mjs|cjs|sh|Dockerfile)|(?:^|\/)Dockerfile(?:\.[A-Za-z0-9_.-]+)?)(?:`|\s|$)/g;

  const files = new Set();
  let match;

  while ((match = fileLikePattern.exec(text)) !== null) {
    const value = normalizeString(match[1]);

    if (!value) continue;
    if (value.includes("://")) continue;

    files.add(value.replace(/^`|`$/g, ""));
  }

  return [...files].sort();
}

function inferTypeLabels(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );
  const title = normalizeString(issue.title).toLowerCase();
  const files = inferChangedFilesFromIssue(issue);

  const existingType = labels.find((label) => TYPE_LABELS.has(label));
  if (existingType) return [existingType];

  if (hasSecuritySignal(issue)) return ["type:security"];
  if (files.some((file) => file.startsWith(".github/scripts/ai/")))
    return ["type:ai"];
  if (
    files.some(
      (file) => file.includes("wrangler.") || file.includes("cloudflare"),
    )
  )
    return ["type:cloudflare"];
  if (
    files.some(
      (file) =>
        file.startsWith(".github/workflows/") ||
        file.startsWith(".github/scripts/"),
    )
  )
    return ["type:ci"];
  if (/\b(architecture|adr|proposal|design decision)\b/.test(title))
    return ["type:architecture"];
  if (/\b(docs|documentation|readme|guide)\b/.test(title)) return ["type:docs"];
  if (/\b(security|vulnerability|secret|codeql|sonar|sbom)\b/.test(title))
    return ["type:security"];
  if (/\b(bug|fix|crash|broken|regression|error)\b/.test(title))
    return ["type:bug"];
  if (/\b(feature|add|implement|support|create)\b/.test(title))
    return ["type:feature"];

  return ["type:chore"];
}

function inferAreaLabels(files = []) {
  const labels = [];

  for (const file of files) {
    const normalized = toPosixPath(file);

    for (const rule of AREA_RULES) {
      if (rule.pattern.test(normalized)) {
        labels.push(...rule.labels);
      }
    }
  }

  return [...new Set(labels)];
}

function inferReleaseIntent(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );
  const releaseLabels = labels.filter((label) => RELEASE_LABELS.has(label));

  if (labels.includes("no-release")) {
    return {
      should_release: false,
      bump: null,
      reason: "Issue is marked no-release.",
    };
  }

  if (isDependencyIssue(issue)) {
    return {
      should_release: false,
      bump: null,
      reason: "Dependency maintenance does not create releases by default.",
    };
  }

  if (releaseLabels.length === 1) {
    return {
      should_release: true,
      bump: releaseLabels[0].replace("release:", ""),
      reason: `Issue is marked ${releaseLabels[0]}.`,
    };
  }

  if (releaseLabels.length > 1) {
    return {
      should_release: false,
      bump: null,
      reason:
        "Multiple release labels are present and require maintainer review.",
    };
  }

  return {
    should_release: false,
    bump: null,
    reason: "No release label was provided.",
  };
}

function buildLabels(issue) {
  const existing = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );
  const files = inferChangedFilesFromIssue(issue);
  const labels = [];

  labels.push(...inferTypeLabels(issue));
  labels.push(...inferAreaLabels(files));

  for (const label of existing) {
    if (label.startsWith("priority:")) labels.push(label);
    if (label.startsWith("security:")) labels.push(label);
    if (label === "dependencies") labels.push(label);
    if (RELEASE_LABELS.has(label)) labels.push(label);
    if (label === "no-release") labels.push(label);
  }

  if (isDependencyIssue(issue) && !labels.includes("no-release")) {
    labels.push("no-release");
  }

  if (existing.includes("needs-triage")) {
    labels.push("needs-triage");
  }

  if (existing.includes("status:ready")) {
    labels.push("status:ready");
  } else if (existing.includes("status:in-progress")) {
    labels.push("status:in-progress");
  } else {
    labels.push("status:in-progress");
  }

  return normalizePrLabels(labels);
}

function normalizePrLabels(labels) {
  const normalized = normalizeStringList(labels)
    .map((label) => label.trim())
    .filter(Boolean);

  const output = [];
  let statusAdded = false;

  for (const label of normalized) {
    if (STATUS_LABELS.has(label)) {
      if (statusAdded) continue;
      statusAdded = true;
    }

    output.push(label);
  }

  return [...new Set(output)];
}

function titlePrefixFromLabels(labels) {
  const normalized = normalizeStringList(labels);

  if (normalized.includes("type:feature")) return "[Feature]";
  if (normalized.includes("type:bug")) return "[Bug]";
  if (normalized.includes("type:security")) return "[Security]";
  if (normalized.includes("type:docs")) return "[Docs]";
  if (normalized.includes("type:ci")) return "[CI/CD]";
  if (normalized.includes("type:architecture")) return "[Architecture]";
  if (normalized.includes("type:cloudflare")) return "[Cloudflare]";
  if (normalized.includes("type:ai")) return "[AI]";

  return "[Maintenance]";
}

function typeSlugFromLabels(labels) {
  const normalized = normalizeStringList(labels);

  if (normalized.includes("type:feature")) return "feature";
  if (normalized.includes("type:bug")) return "bug";
  if (normalized.includes("type:security")) return "security";
  if (normalized.includes("type:docs")) return "docs";
  if (normalized.includes("type:ci")) return "ci";
  if (normalized.includes("type:architecture")) return "architecture";
  if (normalized.includes("type:cloudflare")) return "cloudflare";
  if (normalized.includes("type:ai")) return "ai";

  return "chore";
}

function cleanTitle(title) {
  return normalizeString(title)
    .replace(
      /^\[(Bug|Feature|Maintenance|Security|Docs|CI\/CD|Architecture|Cloudflare|AI|Task|Fix|Change)\]:\s*/i,
      "",
    )
    .replace(
      /^(feat|fix|docs|chore|ci|build|refactor|perf|test|security)(\([^)]+\))?!?:\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function createBranchName(issue, labels) {
  const type = typeSlugFromLabels(labels);
  const slug = slugify(cleanTitle(issue.title)) || "issue-work";

  if (isDependencyIssue(issue)) {
    return `chore/${issue.number}-dependency-maintenance`;
  }

  return `${type}/${issue.number}-${slug}`;
}

function createPrTitle(issue, labels) {
  const prefix = titlePrefixFromLabels(labels);
  const title = cleanTitle(issue.title);

  return `${prefix}: ${title || `Resolve issue #${issue.number}`}`;
}

function selectClosingKeyword(issue) {
  const labels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );

  if (labels.includes("status:blocked") || labels.includes("needs-triage"))
    return "Related to";
  if (labels.includes("type:bug")) return "Fixes";

  return "Closes";
}

function createPrBody(issue, context, labels) {
  const files = inferChangedFilesFromIssue(issue);
  const validation = inferValidationSteps(issue, labels, files);
  const releaseIntent = inferReleaseIntent(issue);
  const closingKeyword = selectClosingKeyword(issue);

  return [
    "## 📌 Summary",
    "",
    `This pull request addresses issue #${issue.number}: **${issue.title}**.`,
    "",
    "## 🎯 Linked Issue",
    "",
    `${closingKeyword} #${issue.number}`,
    "",
    "## 🧠 Context",
    "",
    issue.body
      ? truncate(issue.body, 3500)
      : "No detailed issue body was provided.",
    "",
    "## 🛠️ Changes",
    "",
    files.length
      ? files
          .slice(0, 50)
          .map((file) => `- Update \`${file}\`.`)
          .join("\n")
      : "- Implement the work described in the linked issue.",
    files.length > 50
      ? `\n- ...and review ${files.length - 50} additional referenced file(s).`
      : "",
    "",
    "## ✅ Acceptance Criteria",
    "",
    extractAcceptanceCriteria(issue).length
      ? extractAcceptanceCriteria(issue)
          .map((item) => `- [ ] ${item}`)
          .join("\n")
      : [
          "- [ ] The implementation satisfies the linked issue requirements.",
          "- [ ] The PR labels and release intent are correct.",
          "- [ ] Required CI, quality, and security checks pass.",
        ].join("\n"),
    "",
    "## 🧪 Validation",
    "",
    validation.length
      ? validation.map((item) => `- [ ] ${item}`).join("\n")
      : "- [ ] Run the relevant repository validation for the changed files.",
    "",
    "## 🚀 Release Notes",
    "",
    releaseIntent.should_release
      ? `This PR is expected to create a \`${releaseIntent.bump}\` release because the issue has release intent.`
      : `This PR should not create a release by default. Reason: ${releaseIntent.reason}`,
    "",
    "## 🔐 Security Notes",
    "",
    hasSecuritySignal(issue)
      ? "Security-sensitive context is present. Review carefully and do not expose secret values in logs, commits, comments, or deployment output."
      : "No security-specific issue context was provided.",
    "",
    "## ☁️ Deployment Notes",
    "",
    labels.includes("area:cloudflare") || labels.includes("type:cloudflare")
      ? "Cloudflare-related changes should be validated against the correct environment-scoped resources."
      : "No deployment-specific issue context was provided.",
    "",
    "## 📝 Reviewer Notes",
    "",
    "- Confirm the implementation scope matches the issue.",
    "- Confirm no unrelated changes are included.",
    "- Confirm validation output is attached or linked before merge.",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAcceptanceCriteria(issue) {
  const source = `${issue.body || ""}\n${issue.comments.map((comment) => comment.body).join("\n")}`;
  const lines = source.split(/\r?\n/);
  const criteria = [];

  let inAcceptanceSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,6}\s+.*acceptance criteria/i.test(trimmed)) {
      inAcceptanceSection = true;
      continue;
    }

    if (inAcceptanceSection && /^#{1,6}\s+/.test(trimmed)) {
      break;
    }

    if (!inAcceptanceSection) continue;

    const checkbox = trimmed.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
    if (checkbox) {
      criteria.push(checkbox[1].trim());
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      criteria.push(bullet[1].trim());
    }
  }

  return [...new Set(criteria)].slice(0, 20);
}

function inferValidationSteps(issue, labels, files = []) {
  const steps = [];

  if (
    files.some(
      (file) =>
        file === "package.json" ||
        file.endsWith("/package.json") ||
        file === "pnpm-lock.yaml",
    )
  ) {
    steps.push("Run `pnpm install --frozen-lockfile`.");
  }

  if (files.some((file) => /\.(ts|tsx|js|jsx|json|jsonc)$/.test(file))) {
    steps.push("Run `pnpm exec nx affected --target=lint`.");
    steps.push("Run `pnpm exec nx affected --target=typecheck`.");
  }

  if (files.some((file) => /\.(spec|test)\.(ts|tsx|js|jsx)$/.test(file))) {
    steps.push("Run `pnpm exec nx affected --target=test`.");
  }

  if (
    files.some((file) => file.startsWith("apps/") || file.startsWith("libs/"))
  ) {
    steps.push("Run `pnpm exec nx affected --target=build`.");
  }

  if (files.some((file) => file.startsWith("apps/e2e/"))) {
    steps.push("Run `pnpm exec nx affected --target=e2e`.");
  }

  if (
    files.some((file) => file.startsWith(".github/") || file.includes("codeql"))
  ) {
    steps.push("Confirm GitHub Actions and CodeQL checks pass.");
  }

  if (labels.includes("type:security") || labels.includes("area:security")) {
    steps.push("Confirm the Security Policy Gate passes.");
  }

  if (
    labels.includes("area:cloudflare") ||
    labels.includes("type:cloudflare")
  ) {
    steps.push(
      "Confirm the relevant Cloudflare preview or deployment validation passes.",
    );
  }

  if (labels.includes("area:docker")) {
    steps.push("Confirm Docker image build validation passes.");
  }

  if (isDependencyIssue(issue)) {
    steps.push("Confirm dependency review or audit checks pass.");
  }

  return [...new Set(steps)];
}

function fallbackPrDraft(context, args) {
  const issue = context.issue;
  const linkedPullRequests = context.linked_pull_requests;

  if (linkedPullRequests.length || hasClosingReferences(issue)) {
    return {
      should_create_pr: false,
      reason: "Issue already references an existing pull request.",
      linked_issue: issue.number,
      linked_pull_requests: linkedPullRequests,
      confidence: "high",
    };
  }

  if (isBlockedIssue(issue)) {
    return {
      should_create_pr: false,
      reason:
        "Issue is closed, blocked, duplicate, or otherwise not ready for a pull request.",
      linked_issue: issue.number,
      linked_pull_requests: [],
      confidence: "high",
    };
  }

  if (isDependencyIssue(issue) && !hasSecuritySignal(issue)) {
    return {
      should_create_pr: false,
      reason:
        "Dependency maintenance issue does not need an AI-generated pull request draft.",
      linked_issue: issue.number,
      linked_pull_requests: [],
      confidence: "high",
    };
  }

  if (!isActionableIssue(issue)) {
    return {
      should_create_pr: false,
      reason:
        "Issue does not contain enough actionable implementation context for a pull request draft.",
      linked_issue: issue.number,
      linked_pull_requests: [],
      confidence: "medium",
    };
  }

  const labels = buildLabels(issue);
  const releaseIntent = inferReleaseIntent(issue);
  const head = args.head || createBranchName(issue, labels);

  return {
    should_create_pr: true,
    reason: "Issue appears actionable and has no linked pull request.",
    title: createPrTitle(issue, labels),
    base: args.base || DEFAULT_BRANCH,
    head,
    draft: true,
    labels,
    assignees: normalizeStringList(issue.assignees).length
      ? normalizeStringList(issue.assignees)
      : [args.default_assignee].filter(Boolean),
    reviewers: [],
    team_reviewers: [],
    milestone: issue.milestone || null,
    linked_issue: issue.number,
    linked_pull_requests: [],
    closing_keyword: selectClosingKeyword(issue),
    release_intent: releaseIntent,
    body: createPrBody(issue, context, labels),
    confidence: "medium",
  };
}

function validatePrDraft(draft, context, args) {
  if (!draft || typeof draft !== "object") {
    throw new Error("PR draft must be an object.");
  }

  if (draft.should_create_pr === false) {
    return {
      should_create_pr: false,
      reason: normalizeString(
        draft.reason,
        "Pull request creation was not recommended.",
      ),
      linked_issue: draft.linked_issue || context.issue.number || null,
      linked_pull_requests: Array.isArray(draft.linked_pull_requests)
        ? draft.linked_pull_requests
        : context.linked_pull_requests,
      confidence: normalizeConfidence(draft.confidence),
    };
  }

  const labels = normalizePrLabels(draft.labels || buildLabels(context.issue));
  const head = normalizeString(
    draft.head || args.head,
    createBranchName(context.issue, labels),
  );
  const releaseIntent =
    draft.release_intent && typeof draft.release_intent === "object"
      ? normalizeReleaseIntent(draft.release_intent, context.issue)
      : inferReleaseIntent(context.issue);

  return {
    should_create_pr: true,
    reason: normalizeString(
      draft.reason,
      "Pull request creation was recommended.",
    ),
    title: normalizeString(draft.title, createPrTitle(context.issue, labels)),
    base: normalizeString(draft.base, args.base || DEFAULT_BRANCH),
    head,
    draft: draft.draft !== false,
    labels,
    assignees: normalizeStringList(draft.assignees).length
      ? normalizeStringList(draft.assignees)
      : normalizeStringList(context.issue.assignees).length
        ? normalizeStringList(context.issue.assignees)
        : [args.default_assignee].filter(Boolean),
    reviewers: normalizeStringList(draft.reviewers),
    team_reviewers: normalizeStringList(draft.team_reviewers),
    milestone: draft.milestone || context.issue.milestone || null,
    linked_issue: draft.linked_issue || context.issue.number || null,
    linked_pull_requests: Array.isArray(draft.linked_pull_requests)
      ? draft.linked_pull_requests
      : context.linked_pull_requests,
    closing_keyword: normalizeClosingKeyword(
      draft.closing_keyword || selectClosingKeyword(context.issue),
    ),
    release_intent: releaseIntent,
    body: normalizeString(
      draft.body,
      createPrBody(context.issue, context, labels),
    ),
    confidence: normalizeConfidence(draft.confidence),
  };
}

function normalizeReleaseIntent(value, issue) {
  const fallback = inferReleaseIntent(issue);

  return {
    should_release: Boolean(value.should_release),
    bump: value.bump || null,
    reason: normalizeString(value.reason, fallback.reason),
  };
}

function normalizeClosingKeyword(value) {
  const normalized = normalizeString(value, "Closes");

  if (VALID_CLOSING_KEYWORDS.has(normalized)) return normalized;

  return "Closes";
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value, "medium").toLowerCase();

  if (VALID_CONFIDENCE_VALUES.has(normalized)) return normalized;

  return "medium";
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

async function buildPrDraftWithOpenAI(prompt, context, args) {
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
                "Create the final PR-from-issue JSON object from this context.",
                "Use only the information provided.",
                "Return only valid JSON.",
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
      temperature: 0.2,
      max_output_tokens: 5000,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || response.statusText;

    if (args.require_ai) {
      throw new Error(`OpenAI PR-from-issue generation failed: ${message}`);
    }

    logger.warn(
      `OpenAI PR-from-issue generation failed. Falling back locally. ${message}`,
    );
    return null;
  }

  const text = extractOpenAIText(data);

  if (!text) {
    if (args.require_ai) {
      throw new Error("OpenAI response did not contain JSON text.");
    }

    logger.warn(
      "OpenAI response did not contain JSON text. Falling back locally.",
    );
    return null;
  }

  return parseAiJson(text);
}

async function createGitHubPullRequest(draft, args) {
  const repo = parseRepository(args.repository);

  if (!draft.should_create_pr) {
    return {
      created: false,
      skipped: true,
      reason: draft.reason,
      pull_request: null,
    };
  }

  if (args.dry_run) {
    logger.info("[dry-run] Would create GitHub pull request.");
    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      pull_request: null,
    };
  }

  if (!args.create && !args.write_mode) {
    logger.info("PR creation skipped. Pass --create or set WRITE_MODE=true.");
    return {
      created: false,
      skipped: true,
      dry_run: false,
      reason: "Write mode is disabled.",
      pull_request: null,
    };
  }

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/pulls`,
    {
      method: "POST",
      body: {
        title: draft.title,
        body: draft.body,
        head: draft.head,
        base: draft.base,
        draft: Boolean(draft.draft),
        maintainer_can_modify: true,
      },
    },
  );

  return {
    created: true,
    skipped: false,
    dry_run: false,
    reason: "Pull request created.",
    pull_request: {
      number: response.data.number,
      title: response.data.title,
      html_url: response.data.html_url,
      state: response.data.state,
      draft: Boolean(response.data.draft),
      head: response.data.head?.ref || draft.head,
      base: response.data.base?.ref || draft.base,
    },
  };
}

async function applyLabelsToPullRequest(prResult, draft, args) {
  if (!args.apply_labels) return null;
  if (!prResult.created || !prResult.pull_request) return null;
  if (args.dry_run) return null;

  const labels = normalizeStringList(draft.labels);

  if (!labels.length) return null;

  const repo = parseRepository(args.repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${prResult.pull_request.number}/labels`,
    {
      method: "POST",
      body: {
        labels,
      },
    },
  );

  return Array.isArray(response.data)
    ? response.data.map((label) => label.name).filter(Boolean)
    : labels;
}

async function requestReviewers(prResult, draft, args) {
  if (!prResult.created || !prResult.pull_request) return null;
  if (args.dry_run) return null;

  const reviewers = normalizeStringList(draft.reviewers);
  const teamReviewers = normalizeStringList(draft.team_reviewers);

  if (!reviewers.length && !teamReviewers.length) return null;

  const repo = parseRepository(args.repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/pulls/${prResult.pull_request.number}/requested_reviewers`,
    {
      method: "POST",
      body: {
        reviewers,
        team_reviewers: teamReviewers,
      },
    },
  );

  return {
    reviewers,
    team_reviewers: teamReviewers,
    response: response.data,
  };
}

async function commentOnIssue(prResult, context, args) {
  if (!args.comment_on_issue) return null;
  if (!prResult.created || !prResult.pull_request) return null;
  if (args.dry_run) return null;

  const repo = parseRepository(args.repository);
  const issueNumber = context.issue.number;

  const body = [
    "<!-- aerealith-pr-from-issue:start -->",
    "## 🌿 Pull Request Created",
    "",
    `Created pull request #${prResult.pull_request.number}: ${prResult.pull_request.html_url}`,
    "",
    "This PR was generated from the issue metadata so implementation work can move forward with clear review and validation notes.",
    "<!-- aerealith-pr-from-issue:end -->",
  ].join("\n");

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: {
        body,
      },
    },
  );

  return {
    id: response.data.id,
    html_url: response.data.html_url,
  };
}

function createContext(args, issue) {
  const repoRoot = findRepoRoot();
  const git = getGitMetadata(repoRoot);

  const context = {
    project: {
      name: PROJECT_NAME,
      repository: args.repository,
      default_branch: DEFAULT_BRANCH,
    },
    github: git,
    issue,
    linked_pull_requests: [],
    inferred: {
      referenced_files: inferChangedFilesFromIssue(issue),
      dependency_issue: isDependencyIssue(issue),
      security_signal: hasSecuritySignal(issue),
      actionable: isActionableIssue(issue),
      blocked: isBlockedIssue(issue),
    },
    automation: {
      prompt_file: args.prompt_file,
      output_file: args.output_file,
      context_file: args.context_file,
      model: args.model,
      used_ai: false,
      dry_run: args.dry_run,
      write_mode: args.write_mode,
      create_enabled: args.create,
      generated_at: new Date().toISOString(),
    },
  };

  context.linked_pull_requests = extractLinkedPullRequests(context);

  return redactValue(context);
}

function createSummary(context, draft, result, relativeOutput) {
  return [
    "## 🌿 PR from Issue",
    "",
    `- Issue: \`#${context.issue.number}\``,
    `- Should create PR: \`${draft.should_create_pr ? "true" : "false"}\``,
    `- PR created: \`${result.created ? "true" : "false"}\``,
    `- Used AI: \`${context.automation.used_ai ? "true" : "false"}\``,
    `- Confidence: \`${draft.confidence || "unknown"}\``,
    `- Output: \`${relativeOutput}\``,
    result.pull_request?.html_url
      ? `- Created PR: ${result.pull_request.html_url}`
      : `- Skip reason: ${result.reason || draft.reason}`,
  ].join("\n");
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

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const promptFile = resolvePath(args.prompt_file, repoRoot);
  const outputFile = resolvePath(args.output_file, repoRoot);
  const contextFile = resolvePath(args.context_file, repoRoot);

  const prompt = readTextFile(promptFile);
  const issue = await getIssueContext(args);
  const context = createContext(args, issue);

  logger.info(`Building PR draft from issue #${context.issue.number}.`);

  let rawDraft = null;

  if (
    !context.linked_pull_requests.length &&
    !hasClosingReferences(context.issue)
  ) {
    rawDraft = await buildPrDraftWithOpenAI(prompt, context, args).catch(
      (err) => {
        if (args.require_ai) throw err;

        logger.warn(
          `AI PR draft failed. Falling back locally. ${logger.formatError(err)}`,
        );
        return null;
      },
    );
  }

  if (rawDraft) {
    context.automation.used_ai = true;
  }

  const draft = validatePrDraft(
    rawDraft || fallbackPrDraft(context, args),
    context,
    args,
  );

  const prResult = await createGitHubPullRequest(draft, args);
  const appliedLabels = await applyLabelsToPullRequest(
    prResult,
    draft,
    args,
  ).catch((err) => {
    logger.warn(`Could not apply labels to PR: ${logger.formatError(err)}`);
    return null;
  });

  const requestedReviewers = await requestReviewers(
    prResult,
    draft,
    args,
  ).catch((err) => {
    logger.warn(`Could not request PR reviewers: ${logger.formatError(err)}`);
    return null;
  });

  const issueComment = await commentOnIssue(prResult, context, args).catch(
    (err) => {
      logger.warn(`Could not comment on issue: ${logger.formatError(err)}`);
      return null;
    },
  );

  const output = {
    schema_version: 1,
    type: "pr-from-issue-result",
    created_at: new Date().toISOString(),
    project: PROJECT_NAME,
    repository: args.repository,
    issue: {
      number: context.issue.number,
      title: context.issue.title,
      html_url: context.issue.html_url,
    },
    draft,
    result: {
      ...prResult,
      applied_labels: appliedLabels,
      requested_reviewers: requestedReviewers,
      issue_comment: issueComment,
    },
  };

  writeTextFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  writeTextFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeContext = toRelativePath(contextFile, repoRoot);

  setGitHubOutput("pr_from_issue_file", relativeOutput);
  setGitHubOutput("pr_from_issue_context_file", relativeContext);
  setGitHubOutput(
    "pr_from_issue_should_create",
    draft.should_create_pr ? "true" : "false",
  );
  setGitHubOutput("pr_from_issue_created", prResult.created ? "true" : "false");
  setGitHubOutput(
    "pr_from_issue_number",
    prResult.pull_request?.number ? String(prResult.pull_request.number) : "",
  );
  setGitHubOutput("pr_from_issue_url", prResult.pull_request?.html_url || "");
  setGitHubOutput("pr_from_issue_head", draft.head || "");
  setGitHubOutput("pr_from_issue_base", draft.base || "");
  setGitHubOutput(
    "pr_from_issue_used_ai",
    context.automation.used_ai ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(
      createSummary(context, draft, prResult, relativeOutput),
    );
  }

  if (args.print) {
    console.log(JSON.stringify(output, null, 2));
  }

  if (
    draft.should_create_pr &&
    !prResult.created &&
    args.create &&
    !args.dry_run &&
    args.write_mode
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
