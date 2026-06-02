#!/usr/bin/env node
// .github/scripts/ai/create-issue-from-pr.js
// =============================================================================
// Aerealith AI — Create Issue from Pull Request
// -----------------------------------------------------------------------------
// Purpose:
//   Analyze a pull request and create a matching GitHub issue when one does not
//   already exist.
//
// Output:
//   - artifacts/ai/issue-from-pr.json
//   - artifacts/ai/issue-from-pr-context.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Falls back to deterministic issue drafting when OPENAI_API_KEY is missing
//     unless --require-ai is passed.
//   - Does not create an issue unless write mode is enabled or --create is used.
//   - Redacts secret-like values before sending context to AI.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_PROMPT_FILE = ".github/scripts/ai/prompts/issue-from-pr.md";
const DEFAULT_OUTPUT_FILE = "artifacts/ai/issue-from-pr.json";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/issue-from-pr-context.json";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_ASSIGNEE = "Sinless777";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const LINKED_ISSUE_PATTERN =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?|related\s+to|refs?|see|linked\s+issue)\s+#(\d+)\b/gi;

const LOOSE_ISSUE_PATTERN = /(?:^|\s)#(\d+)\b/g;

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
    pr_number: Number(
      process.env.PR_NUMBER || process.env.PULL_REQUEST_NUMBER || 0,
    ),
    output_file: process.env.ISSUE_FROM_PR_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file:
      process.env.ISSUE_FROM_PR_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    prompt_file: process.env.ISSUE_FROM_PR_PROMPT_FILE || DEFAULT_PROMPT_FILE,
    model:
      process.env.OPENAI_ISSUE_MODEL ||
      process.env.OPENAI_TRIAGE_MODEL ||
      process.env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    default_assignee: process.env.DEFAULT_ASSIGNEE || DEFAULT_ASSIGNEE,
    no_ai: normalizeBoolean(process.env.ISSUE_FROM_PR_NO_AI, false),
    require_ai: normalizeBoolean(process.env.ISSUE_FROM_PR_REQUIRE_AI, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_mode: normalizeBoolean(
      process.env.ISSUE_FROM_PR_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    create: normalizeBoolean(process.env.CREATE_ISSUE_FROM_PR, false),
    comment_on_pr: normalizeBoolean(
      process.env.ISSUE_FROM_PR_COMMENT_ON_PR,
      true,
    ),
    print: normalizeBoolean(process.env.ISSUE_FROM_PR_PRINT, true),
    write_summary: normalizeBoolean(
      process.env.ISSUE_FROM_PR_STEP_SUMMARY,
      true,
    ),
    max_files: Number(process.env.ISSUE_FROM_PR_MAX_FILES || 300),
    max_commits: Number(process.env.ISSUE_FROM_PR_MAX_COMMITS || 100),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--pr" || arg === "--pr-number") {
      args.pr_number = Number(argv[index + 1]);
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

    if (arg === "--comment-on-pr") {
      args.comment_on_pr = true;
      continue;
    }

    if (arg === "--no-comment-on-pr") {
      args.comment_on_pr = false;
      continue;
    }

    if (arg === "--max-files") {
      args.max_files = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--max-commits") {
      args.max_commits = Number(argv[index + 1]);
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
Aerealith AI Issue-from-PR Creator

Usage:
  node .github/scripts/ai/create-issue-from-pr.js [options]

Options:
      --repo <owner/repo>       Repository slug.
      --pr <number>             Pull request number.
  -o, --output <file>           Issue draft JSON output file.
      --context-output <file>   Context JSON output file.
      --prompt <file>           Prompt markdown file.
      --model <model>           OpenAI model.
      --assignee <login>        Default issue assignee.
      --no-ai                   Disable AI generation and use fallback.
      --require-ai              Fail if AI generation is unavailable.
      --dry-run                 Do not create issue or write files.
      --write                   Enable mutating GitHub writes.
      --create                  Create the issue when recommended.
      --no-create               Never create the issue.
      --comment-on-pr           Comment on the PR after creating an issue.
      --no-comment-on-pr        Do not comment on the PR.
      --max-files <number>      Maximum PR files to collect.
      --max-commits <number>    Maximum PR commits to collect.
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
    "User-Agent": "aerealith-ai-issue-from-pr",
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

function normalizePrFromEvent(eventPayload) {
  const pr = eventPayload.pull_request;

  if (!pr) return null;

  return {
    number: pr.number || eventPayload.number || null,
    title: pr.title || "",
    body: pr.body || "",
    state: pr.state || "",
    merged: Boolean(pr.merged),
    draft: Boolean(pr.draft),
    author: pr.user?.login || "",
    base_branch: pr.base?.ref || "",
    head_branch: pr.head?.ref || "",
    base_sha: pr.base?.sha || "",
    head_sha: pr.head?.sha || "",
    html_url: pr.html_url || "",
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((label) => label.name).filter(Boolean)
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((assignee) => assignee.login).filter(Boolean)
      : [],
    requested_reviewers: Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((reviewer) => reviewer.login).filter(Boolean)
      : [],
    milestone: pr.milestone?.title || null,
    raw_source: "event",
  };
}

function normalizePrFromApi(pr) {
  return {
    number: pr.number || null,
    title: pr.title || "",
    body: pr.body || "",
    state: pr.state || "",
    merged: Boolean(pr.merged),
    draft: Boolean(pr.draft),
    author: pr.user?.login || "",
    base_branch: pr.base?.ref || "",
    head_branch: pr.head?.ref || "",
    base_sha: pr.base?.sha || "",
    head_sha: pr.head?.sha || "",
    html_url: pr.html_url || "",
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((label) => label.name).filter(Boolean)
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((assignee) => assignee.login).filter(Boolean)
      : [],
    requested_reviewers: Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((reviewer) => reviewer.login).filter(Boolean)
      : [],
    milestone: pr.milestone?.title || null,
    raw_source: "api",
  };
}

async function getPullRequestContext(args) {
  const repo = parseRepository(args.repository);
  const eventPayload = readGitHubEventPayload();

  let pullRequest = normalizePrFromEvent(eventPayload);

  if (!pullRequest && args.pr_number) {
    const response = await githubRequest(
      `/repos/${repo.owner}/${repo.repo}/pulls/${args.pr_number}`,
    );
    pullRequest = normalizePrFromApi(response.data);
  }

  if (!pullRequest) {
    throw new Error(
      "Pull request context was not found. Run on pull_request event or pass --pr <number>.",
    );
  }

  const prNumber = pullRequest.number;

  const [files, commits, comments] = await Promise.all([
    githubPaginatedRequest(
      `/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/files?per_page=100`,
      {
        max_pages: Math.ceil(args.max_files / 100),
      },
    ).catch((err) => {
      logger.warn(`Could not read PR files: ${logger.formatError(err)}`);
      return [];
    }),
    githubPaginatedRequest(
      `/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/commits?per_page=100`,
      {
        max_pages: Math.ceil(args.max_commits / 100),
      },
    ).catch((err) => {
      logger.warn(`Could not read PR commits: ${logger.formatError(err)}`);
      return [];
    }),
    githubPaginatedRequest(
      `/repos/${repo.owner}/${repo.repo}/issues/${prNumber}/comments?per_page=100`,
      {
        max_pages: 5,
      },
    ).catch((err) => {
      logger.warn(`Could not read PR comments: ${logger.formatError(err)}`);
      return [];
    }),
  ]);

  return {
    ...pullRequest,
    files: files.slice(0, args.max_files).map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch ? truncate(file.patch, 3000) : "",
    })),
    commits: commits.slice(0, args.max_commits).map((commit) => ({
      sha: commit.sha,
      short_sha: String(commit.sha || "").slice(0, 7),
      author: commit.author?.login || commit.commit?.author?.name || "",
      message: commit.commit?.message || "",
    })),
    comments: comments.slice(0, 50).map((comment) => ({
      author: comment.user?.login || "",
      body: truncate(comment.body || "", 2000),
      created_at: comment.created_at || "",
    })),
  };
}

function truncate(value, maxLength) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength)}\n...[truncated]`;
}

function extractLinkedIssuesFromText(text, options = {}) {
  const numbers = new Set();
  const source = String(text || "");

  let match;

  while ((match = LINKED_ISSUE_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  if (options.loose) {
    while ((match = LOOSE_ISSUE_PATTERN.exec(source)) !== null) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].sort((a, b) => a - b);
}

function extractLinkedIssues(context) {
  const sources = [
    context.pull_request.title,
    context.pull_request.body,
    ...context.pull_request.commits.map((commit) => commit.message),
    ...context.pull_request.comments.map((comment) => comment.body),
  ];

  return [
    ...new Set(
      sources.flatMap((source) => extractLinkedIssuesFromText(source)),
    ),
  ].sort((a, b) => a - b);
}

function isDependencyAutomation(pr) {
  const labels = normalizeStringList(pr.labels).map((label) =>
    label.toLowerCase(),
  );
  const author = normalizeString(pr.author);
  const branch = normalizeString(pr.head_branch).toLowerCase();

  if (DEPENDENCY_AUTHORS.has(author)) return true;
  if (/^(dependabot|renovate|mend)\//.test(branch)) return true;

  return labels.some((label) => DEPENDENCY_LABELS.has(label));
}

function hasSecuritySignal(pr) {
  const text = [
    pr.title,
    pr.body,
    ...normalizeStringList(pr.labels),
    ...pr.commits.map((commit) => commit.message),
    ...pr.files.map((file) => file.filename),
  ]
    .join("\n")
    .toLowerCase();

  return /\b(security|vulnerab|cve-|ghsa-|secret|codeql|sonar|dependency review|audit|osv|trivy|semgrep|snyk)\b/.test(
    text,
  );
}

function inferTypeLabels(pr) {
  const labels = normalizeStringList(pr.labels);
  const lowerLabels = labels.map((label) => label.toLowerCase());
  const title = normalizeString(pr.title).toLowerCase();
  const files = pr.files.map((file) => file.filename);

  const existingType = lowerLabels.find((label) => TYPE_LABELS.has(label));
  if (existingType) return [existingType];

  if (hasSecuritySignal(pr)) return ["type:security"];
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
  if (files.every((file) => /^docs\/|^Docs\/|README\.md$|\.md$/.test(file)))
    return ["type:docs"];
  if (/\bbug|fix|crash|broken|regression|error\b/.test(title))
    return ["type:bug"];
  if (/\bfeature|add|implement|support|create\b/.test(title))
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

function inferReleaseLabels(pr) {
  const labels = normalizeStringList(pr.labels).map((label) =>
    label.toLowerCase(),
  );
  const releaseLabels = labels.filter((label) => RELEASE_LABELS.has(label));

  if (labels.includes("no-release")) return ["no-release"];
  if (isDependencyAutomation(pr)) return ["no-release"];

  return releaseLabels;
}

function buildLabels(pr) {
  const existing = normalizeStringList(pr.labels).map((label) =>
    label.toLowerCase(),
  );
  const labels = [];

  labels.push(...inferTypeLabels(pr));
  labels.push(...inferAreaLabels(pr.files.map((file) => file.filename)));
  labels.push(...inferReleaseLabels(pr));

  for (const label of existing) {
    if (label.startsWith("priority:")) labels.push(label);
    if (label === "dependencies") labels.push(label);
    if (label.startsWith("security:")) labels.push(label);
  }

  if (existing.includes("status:ready")) {
    labels.push("status:ready");
  } else {
    labels.push("status:todo");
  }

  labels.push("needs-triage");

  return normalizeIssueLabels(labels);
}

function normalizeIssueLabels(labels) {
  const normalized = normalizeStringList(labels)
    .map((label) => label.trim())
    .filter(Boolean);

  const withoutDuplicateStatus = normalized.filter((label, index) => {
    if (!STATUS_LABELS.has(label)) return true;

    const firstStatusIndex = normalized.findIndex((item) =>
      STATUS_LABELS.has(item),
    );
    return index === firstStatusIndex;
  });

  return [...new Set(withoutDuplicateStatus)];
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

function createIssueTitle(pr, labels) {
  const prefix = titlePrefixFromLabels(labels);
  const title = cleanTitle(pr.title);

  return `${prefix}: ${title || `Track pull request #${pr.number}`}`;
}

function createIssueBody(pr, context, labels) {
  const affectedFiles = pr.files.map((file) => file.filename);
  const linkedPr = pr.number ? `#${pr.number}` : "not provided";
  const relatedIssues = context.linked_issues.length
    ? context.linked_issues.map((issue) => `#${issue}`).join(", ")
    : "none provided";

  const validation = inferValidationSteps(pr, labels);

  return [
    "## 📌 Summary",
    "",
    `This issue tracks the work represented by pull request ${linkedPr}: **${pr.title}**.`,
    "",
    "## 🎯 Goal",
    "",
    "Capture the implementation intent, review scope, and validation requirements for the pull request so the work can be tracked after review and merge.",
    "",
    "## 🧠 Context",
    "",
    pr.body
      ? truncate(pr.body, 3000)
      : "No detailed pull request body was provided.",
    "",
    "## 🛠️ Scope",
    "",
    affectedFiles.length
      ? affectedFiles
          .slice(0, 50)
          .map((file) => `- \`${file}\``)
          .join("\n")
      : "- No changed files were provided.",
    affectedFiles.length > 50
      ? `\n- ...and ${affectedFiles.length - 50} more file(s).`
      : "",
    "",
    "## ✅ Acceptance Criteria",
    "",
    "- [ ] Confirm the issue accurately reflects the pull request scope.",
    "- [ ] Confirm the pull request has the correct labels and release intent.",
    "- [ ] Confirm all required review and validation checks pass.",
    "- [ ] Confirm any linked issue, milestone, or project board metadata is updated.",
    "",
    "## 🧪 Validation",
    "",
    validation.length
      ? validation.map((item) => `- [ ] ${item}`).join("\n")
      : "- [ ] Run the relevant repository validation for the changed files.",
    "",
    "## 🔗 Linked Work",
    "",
    `- Pull request: ${linkedPr}`,
    `- Related issues: ${relatedIssues}`,
    "",
    "## 📝 Notes",
    "",
    releaseIntentNote(labels),
    dependencyNote(pr),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferValidationSteps(pr, labels) {
  const files = pr.files.map((file) => file.filename);
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

  return [...new Set(steps)];
}

function releaseIntentNote(labels) {
  const normalized = normalizeStringList(labels);
  const releaseLabels = normalized.filter((label) => RELEASE_LABELS.has(label));

  if (normalized.includes("no-release")) {
    return "This work is marked `no-release` and should not create a release by default.";
  }

  if (releaseLabels.length === 1) {
    return `Release intent is marked as \`${releaseLabels[0]}\`.`;
  }

  if (releaseLabels.length > 1) {
    return "Release intent needs maintainer review because multiple release labels are present.";
  }

  return "No release intent was provided.";
}

function dependencyNote(pr) {
  if (!isDependencyAutomation(pr)) return "";

  return "Dependency automation is detected. This issue should remain `no-release` unless a maintainer explicitly overrides release policy.";
}

function fallbackIssueDraft(context, args) {
  const pr = context.pull_request;
  const linkedIssues = context.linked_issues;

  if (linkedIssues.length) {
    return {
      should_create_issue: false,
      reason: "Pull request already references an existing issue.",
      linked_pull_request: pr.number,
      linked_issues: linkedIssues,
      confidence: "high",
    };
  }

  if (isDependencyAutomation(pr) && !hasSecuritySignal(pr)) {
    return {
      should_create_issue: false,
      reason:
        "Dependency automation PR does not need a separate tracking issue.",
      linked_pull_request: pr.number,
      linked_issues: [],
      confidence: "high",
    };
  }

  const labels = buildLabels(pr);

  return {
    should_create_issue: true,
    reason: "Pull request represents standalone work that should be tracked.",
    title: createIssueTitle(pr, labels),
    labels,
    assignees: [args.default_assignee].filter(Boolean),
    milestone: pr.milestone || null,
    linked_pull_request: pr.number,
    linked_issues: [],
    body: createIssueBody(pr, context, labels),
    confidence: "medium",
  };
}

function validateIssueDraft(draft, context, args) {
  if (!draft || typeof draft !== "object") {
    throw new Error("Issue draft must be an object.");
  }

  if (draft.should_create_issue === false) {
    return {
      should_create_issue: false,
      reason: normalizeString(
        draft.reason,
        "Issue creation was not recommended.",
      ),
      linked_pull_request:
        draft.linked_pull_request || context.pull_request.number || null,
      linked_issues: Array.isArray(draft.linked_issues)
        ? draft.linked_issues
        : context.linked_issues,
      confidence: normalizeConfidence(draft.confidence),
    };
  }

  const labels = normalizeIssueLabels(
    draft.labels || buildLabels(context.pull_request),
  );

  return {
    should_create_issue: true,
    reason: normalizeString(draft.reason, "Issue creation was recommended."),
    title: normalizeString(
      draft.title,
      createIssueTitle(context.pull_request, labels),
    ),
    labels,
    assignees: normalizeStringList(draft.assignees).length
      ? normalizeStringList(draft.assignees)
      : [args.default_assignee].filter(Boolean),
    milestone: draft.milestone || context.pull_request.milestone || null,
    linked_pull_request:
      draft.linked_pull_request || context.pull_request.number || null,
    linked_issues: Array.isArray(draft.linked_issues)
      ? draft.linked_issues
      : context.linked_issues,
    body: normalizeString(
      draft.body,
      createIssueBody(context.pull_request, context, labels),
    ),
    confidence: normalizeConfidence(draft.confidence),
  };
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value, "medium").toLowerCase();

  if (["high", "medium", "low"].includes(normalized)) return normalized;

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

async function buildIssueDraftWithOpenAI(prompt, context, args) {
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
                "Create the final issue-from-PR JSON object from this context.",
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
      max_output_tokens: 4500,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || response.statusText;

    if (args.require_ai) {
      throw new Error(`OpenAI issue-from-PR generation failed: ${message}`);
    }

    logger.warn(
      `OpenAI issue-from-PR generation failed. Falling back locally. ${message}`,
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

async function resolveMilestoneNumber(repository, milestoneTitle) {
  if (!milestoneTitle) return null;

  if (typeof milestoneTitle === "number") return milestoneTitle;

  const repo = parseRepository(repository);
  const milestones = await githubPaginatedRequest(
    `/repos/${repo.owner}/${repo.repo}/milestones?state=all&per_page=100`,
    {
      max_pages: 5,
    },
  );

  const match = milestones.find(
    (milestone) => milestone.title === milestoneTitle,
  );

  return match?.number || null;
}

async function createGitHubIssue(draft, args) {
  const repo = parseRepository(args.repository);

  if (!draft.should_create_issue) {
    return {
      created: false,
      skipped: true,
      reason: draft.reason,
      issue: null,
    };
  }

  if (args.dry_run) {
    logger.info("[dry-run] Would create GitHub issue.");
    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      issue: null,
    };
  }

  if (!args.create && !args.write_mode) {
    logger.info(
      "Issue creation skipped. Pass --create or set WRITE_MODE=true.",
    );
    return {
      created: false,
      skipped: true,
      dry_run: false,
      reason: "Write mode is disabled.",
      issue: null,
    };
  }

  const milestone = await resolveMilestoneNumber(
    args.repository,
    draft.milestone,
  ).catch((err) => {
    logger.warn(
      `Could not resolve milestone "${draft.milestone}": ${logger.formatError(err)}`,
    );
    return null;
  });

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues`,
    {
      method: "POST",
      body: {
        title: draft.title,
        body: draft.body,
        labels: normalizeStringList(draft.labels),
        assignees: normalizeStringList(draft.assignees),
        ...(milestone ? { milestone } : {}),
      },
    },
  );

  return {
    created: true,
    skipped: false,
    dry_run: false,
    reason: "Issue created.",
    issue: {
      number: response.data.number,
      title: response.data.title,
      html_url: response.data.html_url,
      labels: Array.isArray(response.data.labels)
        ? response.data.labels.map((label) => label.name)
        : [],
    },
  };
}

async function commentOnPullRequest(issueResult, context, args) {
  if (!args.comment_on_pr) return null;
  if (!issueResult.created || !issueResult.issue) return null;
  if (args.dry_run) return null;

  const repo = parseRepository(args.repository);
  const prNumber = context.pull_request.number;

  const body = [
    "<!-- aerealith-issue-from-pr:start -->",
    "## 🧩 Tracking Issue Created",
    "",
    `Created tracking issue #${issueResult.issue.number}: ${issueResult.issue.html_url}`,
    "",
    "This issue was generated from the pull request metadata so the work can be tracked beyond the PR lifecycle.",
    "<!-- aerealith-issue-from-pr:end -->",
  ].join("\n");

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${prNumber}/comments`,
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

function createContext(args, pullRequest) {
  const repoRoot = findRepoRoot();
  const git = getGitMetadata(repoRoot);

  const context = {
    project: {
      name: PROJECT_NAME,
      repository: args.repository,
      default_branch: DEFAULT_BRANCH,
    },
    github: git,
    pull_request: pullRequest,
    linked_issues: [],
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

  context.linked_issues = extractLinkedIssues(context);

  return redactValue(context);
}

function createSummary(context, draft, result, relativeOutput) {
  return [
    "## 🧩 Issue from PR",
    "",
    `- Pull request: \`#${context.pull_request.number}\``,
    `- Should create issue: \`${draft.should_create_issue ? "true" : "false"}\``,
    `- Issue created: \`${result.created ? "true" : "false"}\``,
    `- Used AI: \`${context.automation.used_ai ? "true" : "false"}\``,
    `- Confidence: \`${draft.confidence || "unknown"}\``,
    `- Output: \`${relativeOutput}\``,
    result.issue?.html_url
      ? `- Created issue: ${result.issue.html_url}`
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
  const pullRequest = await getPullRequestContext(args);
  const context = createContext(args, pullRequest);

  logger.info(`Building issue draft from PR #${context.pull_request.number}.`);

  let rawDraft = null;

  if (!context.linked_issues.length) {
    rawDraft = await buildIssueDraftWithOpenAI(prompt, context, args).catch(
      (err) => {
        if (args.require_ai) throw err;

        logger.warn(
          `AI issue draft failed. Falling back locally. ${logger.formatError(err)}`,
        );
        return null;
      },
    );
  }

  if (rawDraft) {
    context.automation.used_ai = true;
  }

  const draft = validateIssueDraft(
    rawDraft || fallbackIssueDraft(context, args),
    context,
    args,
  );

  const issueResult = await createGitHubIssue(draft, args);
  const prComment = await commentOnPullRequest(
    issueResult,
    context,
    args,
  ).catch((err) => {
    logger.warn(`Could not comment on PR: ${logger.formatError(err)}`);
    return null;
  });

  const output = {
    schema_version: 1,
    type: "issue-from-pr-result",
    created_at: new Date().toISOString(),
    project: PROJECT_NAME,
    repository: args.repository,
    pull_request: {
      number: context.pull_request.number,
      title: context.pull_request.title,
      html_url: context.pull_request.html_url,
    },
    draft,
    result: {
      ...issueResult,
      pr_comment: prComment,
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

  setGitHubOutput("issue_from_pr_file", relativeOutput);
  setGitHubOutput("issue_from_pr_context_file", relativeContext);
  setGitHubOutput(
    "issue_from_pr_should_create",
    draft.should_create_issue ? "true" : "false",
  );
  setGitHubOutput(
    "issue_from_pr_created",
    issueResult.created ? "true" : "false",
  );
  setGitHubOutput(
    "issue_from_pr_number",
    issueResult.issue?.number ? String(issueResult.issue.number) : "",
  );
  setGitHubOutput("issue_from_pr_url", issueResult.issue?.html_url || "");
  setGitHubOutput(
    "issue_from_pr_used_ai",
    context.automation.used_ai ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(
      createSummary(context, draft, issueResult, relativeOutput),
    );
  }

  if (args.print) {
    console.log(JSON.stringify(output, null, 2));
  }

  if (
    draft.should_create_issue &&
    !issueResult.created &&
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
