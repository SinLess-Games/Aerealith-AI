#!/usr/bin/env node
// .github/scripts/ai/link-pr-to-issue.js
// =============================================================================
// Aerealith AI — Link Pull Request to Issue
// -----------------------------------------------------------------------------
// Purpose:
//   Discover or accept an issue number for a pull request, then safely link the
//   PR and issue together through PR body references and optional comments.
//
// Output:
//   - artifacts/ai/link-pr-to-issue.json
//   - artifacts/ai/link-pr-to-issue-context.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Does not mutate GitHub unless --write or WRITE_MODE=true is enabled.
//   - Does not update the PR body unless --update-body is enabled.
//   - Does not add comments unless --comment is enabled.
//   - Closing keywords are supported, but default to "Related to" unless the
//     caller explicitly requests a closing keyword.
//   - Redacts secret-like values from generated artifacts.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const DEFAULT_OUTPUT_FILE = "artifacts/ai/link-pr-to-issue.json";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/link-pr-to-issue-context.json";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const VALID_CLOSING_KEYWORDS = new Set([
  "Closes",
  "Fixes",
  "Resolves",
  "Related to",
]);

const CLOSING_KEYWORD_PATTERN =
  /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;

const RELATED_ISSUE_PATTERN =
  /\b(?:related\s+to|refs?|references|see|linked\s+issue|issue)\s+#(\d+)\b/gi;

const LOOSE_ISSUE_PATTERN = /(?:^|\s)#(\d+)\b/g;

const PR_URL_PATTERN = /github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/gi;
const ISSUE_URL_PATTERN = /github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)/gi;

const MARKER_START = "<!-- aerealith-link-pr-to-issue:start -->";
const MARKER_END = "<!-- aerealith-link-pr-to-issue:end -->";

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

const STATUS_LABELS = new Set([
  "status:todo",
  "status:ready",
  "status:in-progress",
  "status:blocked",
  "status:done",
]);

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

function normalizeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    pr_number: normalizeInteger(
      process.env.PR_NUMBER || process.env.PULL_REQUEST_NUMBER,
      0,
    ),
    issue_number: normalizeInteger(
      process.env.ISSUE_NUMBER || process.env.LINKED_ISSUE_NUMBER,
      0,
    ),
    output_file:
      process.env.LINK_PR_TO_ISSUE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file:
      process.env.LINK_PR_TO_ISSUE_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    base: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    closing_keyword: process.env.LINK_PR_TO_ISSUE_KEYWORD || "Related to",
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_mode: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    update_body: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_UPDATE_BODY,
      false,
    ),
    comment: normalizeBoolean(process.env.LINK_PR_TO_ISSUE_COMMENT, false),
    comment_on_pr: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_COMMENT_ON_PR,
      false,
    ),
    comment_on_issue: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_COMMENT_ON_ISSUE,
      false,
    ),
    apply_labels: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_APPLY_LABELS,
      false,
    ),
    search: normalizeBoolean(process.env.LINK_PR_TO_ISSUE_SEARCH, true),
    require_issue: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_REQUIRE_ISSUE,
      false,
    ),
    max_files: normalizeInteger(process.env.LINK_PR_TO_ISSUE_MAX_FILES, 300),
    max_commits: normalizeInteger(
      process.env.LINK_PR_TO_ISSUE_MAX_COMMITS,
      100,
    ),
    max_comments: normalizeInteger(
      process.env.LINK_PR_TO_ISSUE_MAX_COMMENTS,
      50,
    ),
    print: normalizeBoolean(process.env.LINK_PR_TO_ISSUE_PRINT, true),
    write_summary: normalizeBoolean(
      process.env.LINK_PR_TO_ISSUE_STEP_SUMMARY,
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

    if (arg === "--pr" || arg === "--pr-number") {
      args.pr_number = normalizeInteger(argv[index + 1], 0);
      index += 1;
      continue;
    }

    if (arg === "--issue" || arg === "--issue-number") {
      args.issue_number = normalizeInteger(argv[index + 1], 0);
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

    if (arg === "--base") {
      args.base = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--keyword" || arg === "--closing-keyword") {
      args.closing_keyword = argv[index + 1];
      index += 1;
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

    if (arg === "--no-write") {
      args.write_mode = false;
      continue;
    }

    if (arg === "--update-body") {
      args.update_body = true;
      continue;
    }

    if (arg === "--no-update-body") {
      args.update_body = false;
      continue;
    }

    if (arg === "--comment") {
      args.comment = true;
      args.comment_on_pr = true;
      args.comment_on_issue = true;
      continue;
    }

    if (arg === "--no-comment") {
      args.comment = false;
      args.comment_on_pr = false;
      args.comment_on_issue = false;
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

    if (arg === "--comment-on-issue") {
      args.comment_on_issue = true;
      continue;
    }

    if (arg === "--no-comment-on-issue") {
      args.comment_on_issue = false;
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

    if (arg === "--search") {
      args.search = true;
      continue;
    }

    if (arg === "--no-search") {
      args.search = false;
      continue;
    }

    if (arg === "--require-issue") {
      args.require_issue = true;
      continue;
    }

    if (arg === "--max-files") {
      args.max_files = normalizeInteger(argv[index + 1], args.max_files);
      index += 1;
      continue;
    }

    if (arg === "--max-commits") {
      args.max_commits = normalizeInteger(argv[index + 1], args.max_commits);
      index += 1;
      continue;
    }

    if (arg === "--max-comments") {
      args.max_comments = normalizeInteger(argv[index + 1], args.max_comments);
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

  args.closing_keyword = normalizeClosingKeyword(args.closing_keyword);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Link PR to Issue

Usage:
  node .github/scripts/ai/link-pr-to-issue.js [options]

Options:
      --repo <owner/repo>          Repository slug.
      --pr <number>                Pull request number.
      --issue <number>             Issue number to link.
  -o, --output <file>              Result JSON output file.
      --context-output <file>      Context JSON output file.
      --base <branch>              Default base branch.
      --keyword <keyword>          Closes, Fixes, Resolves, or Related to.
      --dry-run                    Do not mutate GitHub or write files.
      --write                      Enable mutating GitHub writes.
      --no-write                   Disable mutating GitHub writes.
      --update-body                Add or update PR body issue reference.
      --no-update-body             Do not update PR body.
      --comment                    Comment on both PR and issue.
      --no-comment                 Do not comment.
      --comment-on-pr              Comment on PR only.
      --comment-on-issue           Comment on issue only.
      --apply-labels               Apply inferred labels to PR and issue.
      --search                     Search for a matching issue when none is provided.
      --no-search                  Do not search for matching issues.
      --require-issue              Exit non-zero when no issue can be linked.
      --max-files <number>         Maximum PR files to collect.
      --max-commits <number>       Maximum PR commits to collect.
      --max-comments <number>      Maximum PR comments to collect.
      --no-print                   Do not print output JSON.
      --no-summary                 Do not append GitHub step summary.
`);
}

function normalizeClosingKeyword(value) {
  const normalized = normalizeString(value, "Related to");

  const exact = [...VALID_CLOSING_KEYWORDS].find((keyword) => {
    return keyword.toLowerCase() === normalized.toLowerCase();
  });

  return exact || "Related to";
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
    process.env.GITHUB_PAT ||
    ""
  );
}

function buildHeaders(options = {}) {
  const token = getGitHubToken();

  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "aerealith-ai-link-pr-to-issue",
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
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, PROJECTS_PAT, or GITHUB_PAT.",
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

function normalizeIssueFromApi(issue) {
  if (issue.pull_request) {
    return {
      number: issue.number || null,
      is_pull_request: true,
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
    };
  }

  return {
    number: issue.number || null,
    is_pull_request: false,
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
        max_pages: Math.ceil(args.max_comments / 100),
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
      patch: file.patch ? truncate(file.patch, 2500) : "",
    })),
    commits: commits.slice(0, args.max_commits).map((commit) => ({
      sha: commit.sha,
      short_sha: String(commit.sha || "").slice(0, 7),
      author: commit.author?.login || commit.commit?.author?.name || "",
      message: commit.commit?.message || "",
    })),
    comments: comments.slice(0, args.max_comments).map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "",
      body: truncate(comment.body || "", 2000),
      created_at: comment.created_at || "",
      html_url: comment.html_url || "",
    })),
  };
}

async function getIssue(repository, issueNumber) {
  if (!issueNumber) return null;

  const repo = parseRepository(repository);
  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}`,
  );

  return normalizeIssueFromApi(response.data);
}

function truncate(value, maxLength) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength)}\n...[truncated]`;
}

function extractIssueReferencesFromText(text, options = {}) {
  const source = String(text || "");
  const numbers = new Set();

  let match;

  while ((match = CLOSING_KEYWORD_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  while ((match = RELATED_ISSUE_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  while ((match = ISSUE_URL_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  if (options.loose) {
    while ((match = LOOSE_ISSUE_PATTERN.exec(source)) !== null) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].sort((a, b) => a - b);
}

function extractPullRequestReferencesFromText(text) {
  const source = String(text || "");
  const numbers = new Set();
  let match;

  while ((match = PR_URL_PATTERN.exec(source)) !== null) {
    numbers.add(Number(match[1]));
  }

  return [...numbers].sort((a, b) => a - b);
}

function extractReferencedIssueNumbers(pr) {
  const sources = [
    pr.title,
    pr.body,
    ...pr.commits.map((commit) => commit.message),
    ...pr.comments.map((comment) => comment.body),
  ];

  return [
    ...new Set(
      sources.flatMap((source) => extractIssueReferencesFromText(source)),
    ),
  ].sort((a, b) => a - b);
}

function extractLooseIssueNumbers(pr) {
  const sources = [
    pr.title,
    pr.body,
    ...pr.commits.map((commit) => commit.message),
    ...pr.comments.map((comment) => comment.body),
  ];

  return [
    ...new Set(
      sources.flatMap((source) =>
        extractIssueReferencesFromText(source, { loose: true }),
      ),
    ),
  ].sort((a, b) => a - b);
}

function hasIssueReferenceInBody(body, issueNumber) {
  const references = extractIssueReferencesFromText(body, {
    loose: true,
  });

  return references.includes(Number(issueNumber));
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

function getReleaseLabels(labels = []) {
  return normalizeStringList(labels)
    .map((label) => label.toLowerCase())
    .filter((label) => RELEASE_LABELS.has(label));
}

function hasNoReleaseLabel(labels = []) {
  return normalizeStringList(labels)
    .map((label) => label.toLowerCase())
    .includes("no-release");
}

function inferClosingKeyword(pr, issue, args) {
  if (args.closing_keyword && args.closing_keyword !== "Related to") {
    return normalizeClosingKeyword(args.closing_keyword);
  }

  if (isDependencyAutomation(pr)) {
    return "Related to";
  }

  const labels = normalizeStringList([
    ...normalizeStringList(pr.labels),
    ...normalizeStringList(issue?.labels),
  ]).map((label) => label.toLowerCase());

  if (labels.includes("needs-triage") || labels.includes("status:blocked")) {
    return "Related to";
  }

  if (labels.includes("type:bug")) {
    return "Fixes";
  }

  if (hasNoReleaseLabel(labels)) {
    return "Related to";
  }

  return "Related to";
}

function scoreIssueCandidate(pr, issue) {
  if (!issue || issue.is_pull_request) {
    return 0;
  }

  const titleScore = scoreTextSimilarity(pr.title, issue.title);
  const branchScore = scoreBranchAgainstIssue(pr.head_branch, issue);
  const labelScore = scoreSharedLabels(pr.labels, issue.labels);
  const milestoneScore =
    pr.milestone && issue.milestone && pr.milestone === issue.milestone
      ? 10
      : 0;
  const stateScore = issue.state === "open" ? 5 : -10;

  return Math.round(
    titleScore + branchScore + labelScore + milestoneScore + stateScore,
  );
}

function scoreTextSimilarity(left, right) {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);

  if (!leftTokens.length || !rightTokens.length) return 0;

  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;

  return Math.min(
    50,
    Math.round(
      (overlap / Math.max(leftTokens.length, rightTokens.length)) * 50,
    ),
  );
}

function scoreBranchAgainstIssue(branch, issue) {
  const normalizedBranch = normalizeString(branch).toLowerCase();

  if (!normalizedBranch) return 0;

  if (normalizedBranch.includes(String(issue.number))) return 40;

  const issueTokens = meaningfulTokens(issue.title);
  const overlap = issueTokens.filter((token) =>
    normalizedBranch.includes(token),
  ).length;

  return Math.min(20, overlap * 4);
}

function scoreSharedLabels(leftLabels = [], rightLabels = []) {
  const left = new Set(
    normalizeStringList(leftLabels).map((label) => label.toLowerCase()),
  );
  const right = new Set(
    normalizeStringList(rightLabels).map((label) => label.toLowerCase()),
  );

  let score = 0;

  for (const label of left) {
    if (right.has(label)) score += 3;
  }

  return Math.min(score, 18);
}

function meaningfulTokens(value) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "add",
    "adds",
    "added",
    "update",
    "updated",
    "fix",
    "fixed",
    "create",
    "created",
    "task",
    "issue",
    "pr",
    "pull",
    "request",
  ]);

  return normalizeString(value)
    .toLowerCase()
    .replace(/^\[[^\]]+\]:\s*/, "")
    .replace(
      /^(feat|fix|docs|chore|ci|build|refactor|perf|test|security)(\([^)]+\))?!?:\s*/i,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

async function searchIssueCandidates(repository, pr, args) {
  if (!args.search) return [];

  const repo = parseRepository(repository);

  const titleTokens = meaningfulTokens(pr.title).slice(0, 8);
  const branchIssueNumber = extractIssueNumberFromBranch(pr.head_branch);

  const queries = [];

  if (branchIssueNumber) {
    queries.push(`repo:${repo.slug} type:issue ${branchIssueNumber}`);
  }

  if (titleTokens.length) {
    queries.push(
      `repo:${repo.slug} type:issue is:open ${titleTokens.join(" ")}`,
    );
    queries.push(
      `repo:${repo.slug} type:issue ${titleTokens.slice(0, 4).join(" ")}`,
    );
  }

  const matches = [];

  for (const query of [...new Set(queries)]) {
    const endpoint = `/search/issues?q=${encodeURIComponent(query)}&per_page=20`;

    const response = await githubRequest(endpoint).catch((err) => {
      logger.warn(
        `Issue search failed for query "${query}": ${logger.formatError(err)}`,
      );
      return null;
    });

    if (!response) continue;

    const items = Array.isArray(response.data?.items)
      ? response.data.items
      : [];

    for (const item of items) {
      if (item.pull_request) continue;

      matches.push(normalizeIssueFromApi(item));
    }
  }

  const deduped = dedupeBy(matches, (issue) => issue.number)
    .map((issue) => ({
      issue,
      score: scoreIssueCandidate(pr, issue),
    }))
    .filter((candidate) => candidate.score >= 25)
    .sort((left, right) => right.score - left.score);

  return deduped;
}

function extractIssueNumberFromBranch(branch) {
  const match = normalizeString(branch).match(/(?:^|[-/])(\d+)(?:[-/]|$)/);

  return match ? Number(match[1]) : 0;
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

async function resolveIssueToLink(context, args) {
  if (args.issue_number) {
    const issue = await getIssue(args.repository, args.issue_number);

    return {
      issue,
      source: "explicit",
      confidence: "high",
      candidates: issue ? [{ issue, score: 100, source: "explicit" }] : [],
    };
  }

  const directReferences = extractReferencedIssueNumbers(context.pull_request);

  for (const number of directReferences) {
    const issue = await getIssue(args.repository, number).catch((err) => {
      logger.warn(
        `Could not read referenced issue #${number}: ${logger.formatError(err)}`,
      );
      return null;
    });

    if (issue && !issue.is_pull_request) {
      return {
        issue,
        source: "existing-reference",
        confidence: "high",
        candidates: [{ issue, score: 95, source: "existing-reference" }],
      };
    }
  }

  const looseReferences = extractLooseIssueNumbers(context.pull_request);

  for (const number of looseReferences) {
    const issue = await getIssue(args.repository, number).catch((err) => {
      logger.warn(
        `Could not read loosely referenced issue #${number}: ${logger.formatError(err)}`,
      );
      return null;
    });

    if (issue && !issue.is_pull_request) {
      return {
        issue,
        source: "loose-reference",
        confidence: "medium",
        candidates: [{ issue, score: 75, source: "loose-reference" }],
      };
    }
  }

  const candidates = await searchIssueCandidates(
    args.repository,
    context.pull_request,
    args,
  );

  if (candidates.length) {
    const best = candidates[0];

    return {
      issue: best.issue,
      source: "search",
      confidence: best.score >= 45 ? "medium" : "low",
      candidates: candidates.map((candidate) => ({
        issue: candidate.issue,
        score: candidate.score,
        source: "search",
      })),
    };
  }

  return {
    issue: null,
    source: "none",
    confidence: "low",
    candidates: [],
  };
}

function createBodyLinkBlock(pr, issue, keyword) {
  return [
    MARKER_START,
    "",
    "## 🔗 Linked Issue",
    "",
    `${keyword} #${issue.number}`,
    "",
    MARKER_END,
  ].join("\n");
}

function updatePrBodyWithIssueLink(pr, issue, keyword) {
  const body = normalizeString(pr.body);
  const block = createBodyLinkBlock(pr, issue, keyword);

  if (hasIssueReferenceInBody(body, issue.number)) {
    return {
      changed: false,
      body,
      reason: "PR body already references the issue.",
    };
  }

  if (body.includes(MARKER_START) && body.includes(MARKER_END)) {
    const pattern = new RegExp(
      `${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`,
      "m",
    );

    return {
      changed: true,
      body: body.replace(pattern, block),
      reason: "Updated existing Aerealith linked issue block.",
    };
  }

  const separator = body.trim() ? "\n\n" : "";

  return {
    changed: true,
    body: `${body.trim()}${separator}${block}\n`,
    reason: "Added linked issue block to PR body.",
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPrComment(pr, issue, keyword, result) {
  return [
    MARKER_START,
    "## 🔗 Issue Link",
    "",
    `This pull request is linked to issue #${issue.number}: ${issue.html_url}`,
    "",
    `Reference mode: \`${keyword}\``,
    "",
    result.body_updated
      ? "The PR body was updated with the issue reference."
      : "The PR body already had a reference, or body updates were disabled.",
    "",
    MARKER_END,
  ].join("\n");
}

function createIssueComment(pr, issue, keyword, result) {
  return [
    MARKER_START,
    "## 🔗 Pull Request Linked",
    "",
    `Linked pull request #${pr.number}: ${pr.html_url}`,
    "",
    `Reference mode: \`${keyword}\``,
    "",
    result.body_updated
      ? "The PR body now contains the issue reference."
      : "The PR body already had a reference, or body updates were disabled.",
    "",
    MARKER_END,
  ].join("\n");
}

function inferLabelsToApply(pr, issue) {
  const labels = [];

  const prLabels = normalizeStringList(pr.labels).map((label) =>
    label.toLowerCase(),
  );
  const issueLabels = normalizeStringList(issue.labels).map((label) =>
    label.toLowerCase(),
  );

  for (const label of prLabels) {
    if (label.startsWith("type:")) labels.push(label);
    if (label.startsWith("area:")) labels.push(label);
    if (label.startsWith("priority:")) labels.push(label);
    if (label.startsWith("security:")) labels.push(label);
    if (label === "dependencies") labels.push(label);
    if (label === "no-release") labels.push(label);
    if (RELEASE_LABELS.has(label)) labels.push(label);
  }

  for (const label of issueLabels) {
    if (label.startsWith("type:")) labels.push(label);
    if (label.startsWith("area:")) labels.push(label);
    if (label.startsWith("priority:")) labels.push(label);
    if (label.startsWith("security:")) labels.push(label);
    if (label === "dependencies") labels.push(label);
    if (label === "no-release") labels.push(label);
    if (RELEASE_LABELS.has(label)) labels.push(label);
  }

  if (
    prLabels.includes("status:ready") ||
    issueLabels.includes("status:ready")
  ) {
    labels.push("status:ready");
  } else if (
    prLabels.includes("status:in-progress") ||
    issueLabels.includes("status:in-progress")
  ) {
    labels.push("status:in-progress");
  }

  return normalizeLabels(labels);
}

function normalizeLabels(labels) {
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

async function updatePrBody(repository, pr, body, args) {
  if (!args.update_body) {
    return {
      changed: false,
      skipped: true,
      reason: "PR body update is disabled.",
    };
  }

  if (args.dry_run) {
    return {
      changed: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
    };
  }

  if (!args.write_mode) {
    return {
      changed: false,
      skipped: true,
      reason: "Write mode is disabled.",
    };
  }

  const repo = parseRepository(repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/pulls/${pr.number}`,
    {
      method: "PATCH",
      body: {
        body,
      },
    },
  );

  return {
    changed: true,
    skipped: false,
    pr: {
      number: response.data.number,
      html_url: response.data.html_url,
    },
  };
}

async function createIssueComment(repository, issueNumber, body, args) {
  if (!args.comment_on_issue && !args.comment) {
    return {
      created: false,
      skipped: true,
      reason: "Issue comments are disabled.",
    };
  }

  if (args.dry_run) {
    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
    };
  }

  if (!args.write_mode) {
    return {
      created: false,
      skipped: true,
      reason: "Write mode is disabled.",
    };
  }

  const repo = parseRepository(repository);

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
    created: true,
    skipped: false,
    comment: {
      id: response.data.id,
      html_url: response.data.html_url,
    },
  };
}

async function createPullRequestComment(repository, prNumber, body, args) {
  if (!args.comment_on_pr && !args.comment) {
    return {
      created: false,
      skipped: true,
      reason: "PR comments are disabled.",
    };
  }

  if (args.dry_run) {
    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
    };
  }

  if (!args.write_mode) {
    return {
      created: false,
      skipped: true,
      reason: "Write mode is disabled.",
    };
  }

  const repo = parseRepository(repository);

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
    created: true,
    skipped: false,
    comment: {
      id: response.data.id,
      html_url: response.data.html_url,
    },
  };
}

async function applyLabels(repository, issueNumber, labels, args) {
  if (!args.apply_labels) {
    return {
      applied: false,
      skipped: true,
      reason: "Label application is disabled.",
      labels: [],
    };
  }

  if (!labels.length) {
    return {
      applied: false,
      skipped: true,
      reason: "No labels to apply.",
      labels: [],
    };
  }

  if (args.dry_run) {
    return {
      applied: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      labels,
    };
  }

  if (!args.write_mode) {
    return {
      applied: false,
      skipped: true,
      reason: "Write mode is disabled.",
      labels,
    };
  }

  const repo = parseRepository(repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}/labels`,
    {
      method: "POST",
      body: {
        labels,
      },
    },
  );

  return {
    applied: true,
    skipped: false,
    labels: Array.isArray(response.data)
      ? response.data.map((label) => label.name).filter(Boolean)
      : labels,
  };
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
    discovery: {
      explicit_issue_number: args.issue_number || null,
      referenced_issues: extractReferencedIssueNumbers(pullRequest),
      loose_issue_references: extractLooseIssueNumbers(pullRequest),
      pr_references_in_text: extractPullRequestReferencesFromText(
        [
          pullRequest.title,
          pullRequest.body,
          ...pullRequest.comments.map((comment) => comment.body),
        ].join("\n"),
      ),
      dependency_automation: isDependencyAutomation(pullRequest),
      release_labels: getReleaseLabels(pullRequest.labels),
      no_release: hasNoReleaseLabel(pullRequest.labels),
    },
    automation: {
      output_file: args.output_file,
      context_file: args.context_file,
      write_mode: args.write_mode,
      dry_run: args.dry_run,
      update_body: args.update_body,
      comment_on_pr: args.comment_on_pr || args.comment,
      comment_on_issue: args.comment_on_issue || args.comment,
      apply_labels: args.apply_labels,
      search: args.search,
      closing_keyword: args.closing_keyword,
      generated_at: new Date().toISOString(),
    },
  };

  return redactValue(context);
}

async function linkPrToIssue(context, issueResolution, args) {
  const pr = context.pull_request;
  const issue = issueResolution.issue;

  if (!issue) {
    return {
      linked: false,
      reason: "No issue was resolved for this pull request.",
      issue: null,
      source: issueResolution.source,
      confidence: issueResolution.confidence,
      body_updated: false,
      comments: {},
      labels: {},
    };
  }

  if (issue.is_pull_request) {
    return {
      linked: false,
      reason: `Resolved item #${issue.number} is a pull request, not an issue.`,
      issue,
      source: issueResolution.source,
      confidence: issueResolution.confidence,
      body_updated: false,
      comments: {},
      labels: {},
    };
  }

  const keyword = inferClosingKeyword(pr, issue, args);
  const bodyUpdate = updatePrBodyWithIssueLink(pr, issue, keyword);

  const bodyResult = bodyUpdate.changed
    ? await updatePrBody(args.repository, pr, bodyUpdate.body, args).catch(
        (err) => ({
          changed: false,
          skipped: true,
          error: logger.formatError(err),
        }),
      )
    : {
        changed: false,
        skipped: true,
        reason: bodyUpdate.reason,
      };

  const resultStub = {
    body_updated: Boolean(bodyResult.changed),
  };

  const prCommentBody = createPrComment(pr, issue, keyword, resultStub);
  const issueCommentBody = createIssueComment(pr, issue, keyword, resultStub);

  const [prComment, issueComment] = await Promise.all([
    createPullRequestComment(
      args.repository,
      pr.number,
      prCommentBody,
      args,
    ).catch((err) => ({
      created: false,
      skipped: true,
      error: logger.formatError(err),
    })),
    createIssueComment(
      args.repository,
      issue.number,
      issueCommentBody,
      args,
    ).catch((err) => ({
      created: false,
      skipped: true,
      error: logger.formatError(err),
    })),
  ]);

  const labelsToApply = inferLabelsToApply(pr, issue);

  const [prLabels, issueLabels] = await Promise.all([
    applyLabels(args.repository, pr.number, labelsToApply, args).catch(
      (err) => ({
        applied: false,
        skipped: true,
        error: logger.formatError(err),
        labels: labelsToApply,
      }),
    ),
    applyLabels(args.repository, issue.number, labelsToApply, args).catch(
      (err) => ({
        applied: false,
        skipped: true,
        error: logger.formatError(err),
        labels: labelsToApply,
      }),
    ),
  ]);

  return {
    linked: true,
    reason: `Pull request #${pr.number} linked to issue #${issue.number}.`,
    source: issueResolution.source,
    confidence: issueResolution.confidence,
    keyword,
    issue: {
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
    },
    pull_request: {
      number: pr.number,
      title: pr.title,
      html_url: pr.html_url,
      state: pr.state,
    },
    body_updated: Boolean(bodyResult.changed),
    body_update: bodyResult,
    comments: {
      pull_request: prComment,
      issue: issueComment,
    },
    labels: {
      planned: labelsToApply,
      pull_request: prLabels,
      issue: issueLabels,
    },
  };
}

function createSummary(context, output, relativeOutput) {
  const result = output.result;

  return [
    "## 🔗 Link PR to Issue",
    "",
    `- Pull request: \`#${context.pull_request.number}\``,
    `- Linked: \`${result.linked ? "true" : "false"}\``,
    `- Issue: \`${result.issue?.number ? `#${result.issue.number}` : "none"}\``,
    `- Source: \`${result.source || "none"}\``,
    `- Confidence: \`${result.confidence || "unknown"}\``,
    `- Body updated: \`${result.body_updated ? "true" : "false"}\``,
    `- Output: \`${relativeOutput}\``,
    `- Reason: ${result.reason}`,
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

  const outputFile = resolvePath(args.output_file, repoRoot);
  const contextFile = resolvePath(args.context_file, repoRoot);

  const pullRequest = await getPullRequestContext(args);
  const context = createContext(args, pullRequest);

  logger.info(`Resolving linked issue for PR #${context.pull_request.number}.`);

  const issueResolution = await resolveIssueToLink(context, args);
  const result = await linkPrToIssue(context, issueResolution, args);

  const output = redactValue({
    schema_version: 1,
    type: "link-pr-to-issue-result",
    created_at: new Date().toISOString(),
    project: PROJECT_NAME,
    repository: args.repository,
    result,
    candidates: issueResolution.candidates.map((candidate) => ({
      score: candidate.score,
      source: candidate.source,
      issue: candidate.issue
        ? {
            number: candidate.issue.number,
            title: candidate.issue.title,
            html_url: candidate.issue.html_url,
            state: candidate.issue.state,
          }
        : null,
    })),
  });

  writeTextFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  writeTextFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeContext = toRelativePath(contextFile, repoRoot);

  setGitHubOutput("link_pr_to_issue_file", relativeOutput);
  setGitHubOutput("link_pr_to_issue_context_file", relativeContext);
  setGitHubOutput("link_pr_to_issue_linked", result.linked ? "true" : "false");
  setGitHubOutput(
    "link_pr_to_issue_pr_number",
    String(context.pull_request.number || ""),
  );
  setGitHubOutput(
    "link_pr_to_issue_issue_number",
    result.issue?.number ? String(result.issue.number) : "",
  );
  setGitHubOutput("link_pr_to_issue_issue_url", result.issue?.html_url || "");
  setGitHubOutput("link_pr_to_issue_source", result.source || "");
  setGitHubOutput("link_pr_to_issue_confidence", result.confidence || "");
  setGitHubOutput(
    "link_pr_to_issue_body_updated",
    result.body_updated ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(createSummary(context, output, relativeOutput));
  }

  if (args.print) {
    console.log(JSON.stringify(output, null, 2));
  }

  if (args.require_issue && !result.linked) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
