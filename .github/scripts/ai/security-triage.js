#!/usr/bin/env node
// .github/scripts/ai/security-triage.js
// =============================================================================
// Aerealith AI — AI Security Triage
// -----------------------------------------------------------------------------
// Purpose:
//   Analyze security findings, security-gate output, dependency alerts, scan
//   reports, PR metadata, issue metadata, release context, and deployment context,
//   then produce a safe, structured security triage decision.
//
// Output:
//   - artifacts/ai/security-triage.json
//   - artifacts/ai/security-triage-context.json
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Uses .github/scripts/ai/openai-client.js when available.
//   - Falls back to deterministic triage when OPENAI_API_KEY is unavailable
//     unless --require-ai is passed.
//   - Does not mutate GitHub unless --write or WRITE_MODE=true is enabled.
//   - Does not create issues/comments/labels unless explicitly enabled.
//   - Redacts secret-like values from context, outputs, comments, and issues.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const logger = require("../utils/logger");

let openaiClient = null;

try {
  openaiClient = require("./openai-client");
} catch {
  openaiClient = null;
}

const PROJECT_NAME = "Aerealith AI";

const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";
const DEFAULT_ASSIGNEE = "Sinless777";

const DEFAULT_PROMPT_FILE = ".github/scripts/ai/prompts/security-triage.md";
const DEFAULT_OUTPUT_FILE = "artifacts/ai/security-triage.json";
const DEFAULT_CONTEXT_FILE = "artifacts/ai/security-triage-context.json";

const DEFAULT_MODEL = "gpt-4.1";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const VALID_SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "unknown",
]);
const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const VALID_CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);

const SEVERITY_RANK = {
  unknown: 0,
  low: 1,
  medium: 2,
  moderate: 2,
  high: 3,
  critical: 4,
};

const SEVERITY_ALIASES = {
  note: "low",
  info: "low",
  informational: "low",
  warning: "medium",
  moderate: "medium",
  medium: "medium",
  error: "high",
  blocker: "critical",
  critical: "critical",
  high: "high",
  low: "low",
  unknown: "unknown",
};

const DEFAULT_INPUT_FILES = [
  "artifacts/security/security-report.json",
  "artifacts/security/security-gate.json",
  "artifacts/security/security-summary.md",
  "artifacts/security/codeql.sarif",
  "artifacts/security/pnpm-audit.json",
  "artifacts/security/dependency-review.json",
  "artifacts/security/osv-scanner.json",
  "artifacts/security/trivy.json",
  "artifacts/security/semgrep.json",
  "artifacts/security/snyk.json",
  "artifacts/security/sonarqube.json",
  "artifacts/security/license-review.json",
  "artifacts/release/release-plan.json",
  "artifacts/release/semver-release-plan.json",
  "artifacts/release/release-evidence.json",
  "artifacts/release/artifact-manifest.json",
  "artifacts/cloudflare/cloudflare-deployment.json",
  "artifacts/cloudflare/cloudflare-preview.json",
  "artifacts/cloudflare/cloudflare-staging.json",
  "artifacts/cloudflare/cloudflare-production.json",
  "artifacts/docker/docker-image-manifest.json",
  "artifacts/npm/npm-package-plan.json",
  "artifacts/npm/npm-publish-manifest.json",
];

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|webhook|cookie|session|authorization|bearer|pat|credential|npm[_-]?token|cloudflare[_-]?api|openai[_-]?api)/i;

const SECRET_VALUE_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|[A-Za-z0-9+/]{32,}={0,2})/g;

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
    pattern: /^\.github\/scripts\/security\//,
    labels: ["area:security", "area:github-actions"],
  },
  {
    pattern: /^\.github\/scripts\/ai\//,
    labels: ["area:ai", "area:github-actions"],
  },
  {
    pattern: /^\.github\/scripts\//,
    labels: ["area:github-actions", "area:ci"],
  },
  {
    pattern: /^\.github\/repo-management\/security-rules\.ya?ml$/,
    labels: ["area:security"],
  },
  { pattern: /^\.github\/repo-management\//, labels: ["area:github-actions"] },
  { pattern: /^\.github\/codeql\.ya?ml$/, labels: ["area:security"] },
  {
    pattern: /^\.github\/(dependabot\.ya?ml|renovate\.json5)$/,
    labels: ["area:dependencies"],
  },
  { pattern: /(^|\/)wrangler\.(jsonc?|toml)$/, labels: ["area:cloudflare"] },
  { pattern: /(^|\/)Dockerfile(\..+)?$/, labels: ["area:docker"] },
  { pattern: /(^|\/)package\.json$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)pnpm-lock\.yaml$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)pnpm-workspace\.yaml$/, labels: ["area:dependencies"] },
  { pattern: /(^|\/)nx\.json$/, labels: ["area:ci"] },
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

function normalizeSeverity(value) {
  const normalized = normalizeString(value, "unknown").toLowerCase();
  return (
    SEVERITY_ALIASES[normalized] ||
    (VALID_SEVERITIES.has(normalized) ? normalized : "unknown")
  );
}

function severityRank(value) {
  return SEVERITY_RANK[normalizeSeverity(value)] ?? 0;
}

function maxSeverity(values = []) {
  const severities = normalizeStringList(values).map(normalizeSeverity);

  if (!severities.length) return "unknown";

  return (
    severities.sort(
      (left, right) => severityRank(right) - severityRank(left),
    )[0] || "unknown"
  );
}

function priorityFromSeverity(severity) {
  const normalized = normalizeSeverity(severity);

  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";

  return "medium";
}

function normalizePriority(value, severity = "unknown") {
  const normalized = normalizeString(value).toLowerCase();

  if (VALID_PRIORITIES.has(normalized)) return normalized;

  return priorityFromSeverity(severity);
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value, "medium").toLowerCase();

  if (VALID_CONFIDENCE_VALUES.has(normalized)) return normalized;

  return "medium";
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    pr_number: normalizeInteger(
      process.env.PR_NUMBER || process.env.PULL_REQUEST_NUMBER,
      0,
    ),
    issue_number: normalizeInteger(process.env.ISSUE_NUMBER, 0),
    prompt_file: process.env.SECURITY_TRIAGE_PROMPT_FILE || DEFAULT_PROMPT_FILE,
    output_file: process.env.SECURITY_TRIAGE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    context_file:
      process.env.SECURITY_TRIAGE_CONTEXT_FILE || DEFAULT_CONTEXT_FILE,
    input_files: normalizeStringList(process.env.SECURITY_TRIAGE_INPUT_FILES),
    model:
      process.env.OPENAI_SECURITY_MODEL ||
      process.env.OPENAI_TRIAGE_MODEL ||
      process.env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    default_assignee: process.env.DEFAULT_ASSIGNEE || DEFAULT_ASSIGNEE,
    deployment_environment:
      process.env.DEPLOYMENT_ENVIRONMENT ||
      process.env.CLOUDFLARE_ENVIRONMENT ||
      process.env.ENVIRONMENT ||
      "",
    no_ai: normalizeBoolean(process.env.SECURITY_TRIAGE_NO_AI, false),
    require_ai: normalizeBoolean(process.env.SECURITY_TRIAGE_REQUIRE_AI, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_mode: normalizeBoolean(
      process.env.SECURITY_TRIAGE_WRITE_MODE ||
        process.env.WRITE_MODE ||
        process.env.PROJECT_SYNC_WRITE_MODE,
      false,
    ),
    create_issue: normalizeBoolean(
      process.env.SECURITY_TRIAGE_CREATE_ISSUE,
      false,
    ),
    comment_on_pr: normalizeBoolean(
      process.env.SECURITY_TRIAGE_COMMENT_ON_PR,
      false,
    ),
    apply_labels: normalizeBoolean(
      process.env.SECURITY_TRIAGE_APPLY_LABELS,
      false,
    ),
    fail_on_blocking: normalizeBoolean(
      process.env.SECURITY_TRIAGE_FAIL_ON_BLOCKING,
      true,
    ),
    print: normalizeBoolean(process.env.SECURITY_TRIAGE_PRINT, true),
    write_summary: normalizeBoolean(
      process.env.SECURITY_TRIAGE_STEP_SUMMARY,
      true,
    ),
    max_files: normalizeInteger(process.env.SECURITY_TRIAGE_MAX_FILES, 300),
    max_commits: normalizeInteger(process.env.SECURITY_TRIAGE_MAX_COMMITS, 100),
    max_comments: normalizeInteger(
      process.env.SECURITY_TRIAGE_MAX_COMMENTS,
      50,
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

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--prompt") {
      args.prompt_file = argv[index + 1];
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

    if (arg === "--environment" || arg === "--deployment-environment") {
      args.deployment_environment = argv[index + 1];
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

    if (arg === "--no-write") {
      args.write_mode = false;
      continue;
    }

    if (arg === "--create-issue") {
      args.create_issue = true;
      continue;
    }

    if (arg === "--no-create-issue") {
      args.create_issue = false;
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

    if (arg === "--apply-labels") {
      args.apply_labels = true;
      continue;
    }

    if (arg === "--no-apply-labels") {
      args.apply_labels = false;
      continue;
    }

    if (arg === "--fail-on-blocking") {
      args.fail_on_blocking = true;
      continue;
    }

    if (arg === "--no-fail-on-blocking") {
      args.fail_on_blocking = false;
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

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Security Triage

Usage:
  node .github/scripts/ai/security-triage.js [options]

Options:
      --repo <owner/repo>             Repository slug.
      --pr <number>                   Pull request number.
      --issue <number>                Issue number.
  -i, --input <file>                  Add security report or metadata input.
      --prompt <file>                 Security triage prompt file.
  -o, --output <file>                 Triage JSON output file.
      --context-output <file>         Triage context JSON output file.
      --model <model>                 OpenAI model.
      --assignee <login>              Default security issue assignee.
      --environment <name>            Deployment environment.
      --no-ai                         Disable AI and use fallback triage.
      --require-ai                    Fail if AI is unavailable.
      --dry-run                       Do not mutate GitHub or write files.
      --write                         Enable mutating GitHub writes.
      --create-issue                  Create security issue when recommended.
      --comment-on-pr                 Comment triage result on PR.
      --apply-labels                  Apply triage labels to PR/issue.
      --fail-on-blocking              Exit non-zero if triage blocks merge/release/deploy.
      --no-fail-on-blocking           Do not fail process on blocking triage.
      --max-files <number>            Maximum PR files to collect.
      --max-commits <number>          Maximum PR commits to collect.
      --max-comments <number>         Maximum comments to collect.
      --no-print                      Do not print output JSON.
      --no-summary                    Do not append GitHub step summary.
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

  if (
    extension === ".json" ||
    extension === ".jsonc" ||
    extension === ".sarif"
  ) {
    return {
      file: relativePath,
      type: extension === ".sarif" ? "sarif" : "json",
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
    "User-Agent": "aerealith-ai-security-triage",
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
    milestone: pr.milestone?.title || null,
    raw_source: "api",
  };
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
    raw_source: "event",
  };
}

function normalizeIssueFromApi(issue) {
  if (issue.pull_request) {
    return null;
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

  if (!pullRequest) return null;

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
      patch: file.patch ? truncate(file.patch, 2000) : "",
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

  if (!issue) return null;

  const comments = await githubPaginatedRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments?per_page=100`,
    {
      max_pages: Math.ceil(args.max_comments / 100),
    },
  ).catch((err) => {
    logger.warn(`Could not read issue comments: ${logger.formatError(err)}`);
    return [];
  });

  return {
    ...issue,
    comments: comments.slice(0, args.max_comments).map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "",
      body: truncate(comment.body || "", 2000),
      created_at: comment.created_at || "",
      html_url: comment.html_url || "",
    })),
  };
}

function truncate(value, maxLength) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength)}\n...[truncated]`;
}

function redactText(value) {
  return String(value || "").replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function redactValue(value) {
  if (value === undefined || value === null) return value;

  if (typeof value === "string") {
    return redactText(value);
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

function containsSecretSignal(value) {
  const rendered =
    typeof value === "string" ? value : JSON.stringify(value || {});
  return (
    SECRET_KEY_PATTERN.test(rendered) || SECRET_VALUE_PATTERN.test(rendered)
  );
}

function createFinding(input = {}) {
  const severity = normalizeSeverity(
    input.severity || input.level || input.impact || "unknown",
  );
  const tool = normalizeString(
    input.tool || input.source_tool || input.source || "unknown",
    "unknown",
  );

  return redactValue({
    id:
      input.id ||
      input.rule_id ||
      input.ruleId ||
      input.cve ||
      input.ghsa ||
      input.advisory ||
      input.title ||
      `${tool}:${severity}`,
    title: normalizeString(
      input.title || input.message || input.summary || input.name,
      "Security finding",
    ),
    message: normalizeString(
      input.message ||
        input.description ||
        input.summary ||
        input.details ||
        "",
    ),
    severity,
    tool,
    type: normalizeString(
      input.type || input.finding_type || inferFindingType(input),
      "unknown",
    ),
    package: normalizeString(
      input.package ||
        input.package_name ||
        input.name ||
        input.module_name ||
        "",
    ),
    current_version: normalizeString(
      input.current_version || input.version || input.installed_version || "",
    ),
    fixed_version: normalizeString(
      input.fixed_version ||
        input.fixedVersion ||
        input.patched_versions ||
        input.fixed_in ||
        "",
    ),
    ecosystem: normalizeString(
      input.ecosystem || input.package_ecosystem || "npm",
    ),
    advisory: normalizeString(
      input.advisory ||
        input.ghsa ||
        input.ghsa_id ||
        input.github_advisory_id ||
        "",
    ),
    cve: normalizeString(input.cve || input.cve_id || ""),
    rule_id: normalizeString(
      input.rule_id || input.ruleId || input.rule || input.id || "",
    ),
    path: normalizeString(
      input.path || input.file || input.filename || input.uri || "",
    ),
    line: input.line || input.start_line || input.startLine || null,
    url: normalizeString(
      input.url ||
        input.html_url ||
        input.primary_url ||
        input.PrimaryURL ||
        "",
    ),
    raw: input.raw ? redactValue(input.raw) : null,
  });
}

function inferFindingType(input = {}) {
  const text = [
    input.type,
    input.title,
    input.message,
    input.description,
    input.package,
    input.path,
    input.tool,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (/\b(secret|credential|token|password|private key)\b/.test(text))
    return "secret";
  if (/\b(dependency|package|npm|pnpm|ghsa|cve)\b/.test(text))
    return "dependency";
  if (/\b(container|docker|image|trivy|grype)\b/.test(text)) return "container";
  if (/\b(license)\b/.test(text)) return "license";
  if (/\b(sbom|attestation|provenance)\b/.test(text)) return "release-evidence";
  if (/\b(cloudflare|worker|pages|r2|d1|kv|queue|wrangler)\b/.test(text))
    return "cloudflare";
  if (/\b(codeql|sonar|semgrep|static analysis|sast)\b/.test(text))
    return "code-scanning";

  return "unknown";
}

function parseSecurityGate(value, file) {
  if (!value || typeof value !== "object") return [];

  const findings = [];

  for (const blocker of value.blockers || value.gate?.blockers || []) {
    findings.push(
      createFinding({
        id: blocker.id || blocker.check || blocker.type,
        title: blocker.title || blocker.reason || "Security gate blocker",
        message: blocker.reason || blocker.message || "",
        severity: blocker.severity || "high",
        tool: "security-gate",
        type: blocker.type || "policy-gate",
        raw: blocker,
        path: file,
      }),
    );
  }

  for (const warning of value.warnings || value.gate?.warnings || []) {
    findings.push(
      createFinding({
        id: warning.id || warning.check || warning.type,
        title: warning.title || warning.reason || "Security gate warning",
        message: warning.reason || warning.message || "",
        severity: warning.severity || "medium",
        tool: "security-gate",
        type: warning.type || "policy-gate",
        raw: warning,
        path: file,
      }),
    );
  }

  const gate = value.gate || value;

  if (gate.allowed === false && !findings.length) {
    findings.push(
      createFinding({
        id: "security-gate-failed",
        title: "Security policy gate failed",
        message: "The security policy gate reported a blocked or unsafe state.",
        severity: gate.max_severity || "high",
        tool: "security-gate",
        type: "policy-gate",
        path: file,
        raw: gate,
      }),
    );
  }

  return findings;
}

function parseSarif(value) {
  const findings = [];

  if (!value || typeof value !== "object" || !Array.isArray(value.runs))
    return findings;

  for (const run of value.runs) {
    const tool = normalizeString(
      run.tool?.driver?.name,
      "codeql",
    ).toLowerCase();
    const rules = new Map();

    for (const rule of run.tool?.driver?.rules || []) {
      rules.set(rule.id, rule);
    }

    for (const result of run.results || []) {
      const rule = rules.get(result.ruleId) || {};
      const location = result.locations?.[0]?.physicalLocation || {};
      const artifact = location.artifactLocation || {};
      const region = location.region || {};
      const severity = sarifSeverity(result, rule);

      findings.push(
        createFinding({
          id: result.ruleId,
          title:
            rule.shortDescription?.text ||
            result.ruleId ||
            "Code scanning finding",
          message: result.message?.text || rule.fullDescription?.text || "",
          severity,
          tool,
          type: "code-scanning",
          rule_id: result.ruleId,
          path: artifact.uri || "",
          line: region.startLine || null,
          url: rule.helpUri || "",
          raw: result,
        }),
      );
    }
  }

  return findings;
}

function sarifSeverity(result, rule) {
  const securitySeverity = Number(
    result.properties?.["security-severity"] ??
      rule.properties?.["security-severity"] ??
      result.properties?.securitySeverity ??
      rule.properties?.securitySeverity,
  );

  if (Number.isFinite(securitySeverity)) {
    if (securitySeverity >= 9) return "critical";
    if (securitySeverity >= 7) return "high";
    if (securitySeverity >= 4) return "medium";
    if (securitySeverity > 0) return "low";
  }

  return normalizeSeverity(
    result.level || rule.defaultConfiguration?.level || "unknown",
  );
}

function parsePnpmAudit(value) {
  const findings = [];

  if (!value || typeof value !== "object") return findings;

  const advisories =
    value.advisories && typeof value.advisories === "object"
      ? Object.values(value.advisories)
      : [];

  for (const advisory of advisories) {
    findings.push(
      createFinding({
        id: advisory.github_advisory_id || advisory.id || advisory.module_name,
        title: advisory.title || advisory.module_name || "Dependency advisory",
        message: advisory.overview || advisory.recommendation || "",
        severity: advisory.severity,
        tool: "pnpm-audit",
        type: "dependency",
        package: advisory.module_name,
        current_version: advisory.vulnerable_versions,
        fixed_version: advisory.patched_versions,
        advisory: advisory.github_advisory_id,
        cve: Array.isArray(advisory.cves)
          ? advisory.cves.join(", ")
          : advisory.cves,
        url: advisory.url,
        raw: advisory,
      }),
    );
  }

  for (const vulnerability of value.vulnerabilities || []) {
    findings.push(
      createFinding({
        id: vulnerability.id || vulnerability.name,
        title:
          vulnerability.title ||
          vulnerability.name ||
          "Dependency vulnerability",
        message: vulnerability.description || vulnerability.details || "",
        severity: vulnerability.severity,
        tool: "pnpm-audit",
        type: "dependency",
        package: vulnerability.name || vulnerability.package,
        current_version: vulnerability.version || vulnerability.range,
        fixed_version:
          vulnerability.fixAvailable?.version || vulnerability.fixed_version,
        advisory: vulnerability.ghsa || vulnerability.github_advisory_id,
        cve: Array.isArray(vulnerability.cves)
          ? vulnerability.cves.join(", ")
          : vulnerability.cve,
        url: vulnerability.url,
        raw: vulnerability,
      }),
    );
  }

  return findings;
}

function parseTrivy(value) {
  const findings = [];

  if (!value || typeof value !== "object") return findings;

  for (const result of value.Results || value.results || []) {
    const target = result.Target || result.target || "";

    for (const vulnerability of result.Vulnerabilities ||
      result.vulnerabilities ||
      []) {
      findings.push(
        createFinding({
          id: vulnerability.VulnerabilityID || vulnerability.id,
          title:
            vulnerability.Title ||
            vulnerability.title ||
            vulnerability.VulnerabilityID,
          message: vulnerability.Description || vulnerability.description || "",
          severity: vulnerability.Severity || vulnerability.severity,
          tool: "trivy",
          type: "container",
          package: vulnerability.PkgName || vulnerability.package,
          current_version:
            vulnerability.InstalledVersion || vulnerability.version,
          fixed_version:
            vulnerability.FixedVersion || vulnerability.fixed_version,
          cve: vulnerability.VulnerabilityID || vulnerability.cve,
          path: target,
          url: vulnerability.PrimaryURL || vulnerability.url,
          raw: vulnerability,
        }),
      );
    }

    for (const secret of result.Secrets || result.secrets || []) {
      findings.push(
        createFinding({
          id: secret.RuleID || secret.ruleID || "secret-detected",
          title: secret.Title || secret.RuleID || "Secret detected",
          message:
            "A secret-like value appears to be exposed and must be treated as compromised until verified otherwise.",
          severity: secret.Severity || "critical",
          tool: "trivy",
          type: "secret",
          rule_id: secret.RuleID || secret.ruleID,
          path: target,
          line: secret.StartLine || secret.startLine,
          raw: secret,
        }),
      );
    }

    for (const misconfiguration of result.Misconfigurations ||
      result.misconfigurations ||
      []) {
      findings.push(
        createFinding({
          id: misconfiguration.ID || misconfiguration.id,
          title:
            misconfiguration.Title || misconfiguration.id || "Misconfiguration",
          message:
            misconfiguration.Message || misconfiguration.description || "",
          severity: misconfiguration.Severity || misconfiguration.severity,
          tool: "trivy",
          type: "misconfiguration",
          rule_id: misconfiguration.ID || misconfiguration.id,
          path: target,
          url: misconfiguration.PrimaryURL || misconfiguration.url,
          raw: misconfiguration,
        }),
      );
    }
  }

  return findings;
}

function parseGenericFindings(value, file) {
  if (!value || typeof value !== "object") return [];

  const candidates = [
    ...(Array.isArray(value.findings) ? value.findings : []),
    ...(Array.isArray(value.issues) ? value.issues : []),
    ...(Array.isArray(value.results) ? value.results : []),
    ...(Array.isArray(value.alerts) ? value.alerts : []),
    ...(Array.isArray(value.vulnerabilities) ? value.vulnerabilities : []),
  ];

  return candidates.map((item) =>
    createFinding({
      ...item,
      tool: item.tool || item.source_tool || inferToolFromFile(file),
      path: item.path || item.file || item.filename || file,
      raw: item,
    }),
  );
}

function inferToolFromFile(file) {
  const normalized = String(file || "").toLowerCase();

  if (normalized.includes("codeql")) return "codeql";
  if (normalized.includes("sonar")) return "sonarqube";
  if (normalized.includes("dependency-review")) return "dependency-review";
  if (normalized.includes("pnpm") || normalized.includes("audit"))
    return "pnpm-audit";
  if (normalized.includes("osv")) return "osv-scanner";
  if (normalized.includes("trivy")) return "trivy";
  if (normalized.includes("semgrep")) return "semgrep";
  if (normalized.includes("snyk")) return "snyk";
  if (normalized.includes("license")) return "license-review";
  if (normalized.includes("security-gate")) return "security-gate";

  return "unknown";
}

function parseFindingsFromInput(input) {
  const file = input.file;
  const value = input.value;

  if (input.type === "sarif" || file.endsWith(".sarif")) {
    return parseSarif(value);
  }

  if (file.includes("security-gate")) {
    return parseSecurityGate(value, file);
  }

  if (file.includes("pnpm") || file.includes("audit")) {
    return parsePnpmAudit(value);
  }

  if (file.includes("trivy")) {
    return parseTrivy(value);
  }

  if (value && typeof value === "object") {
    return [
      ...parseSecurityGate(value, file),
      ...parseSarif(value),
      ...parsePnpmAudit(value),
      ...parseTrivy(value),
      ...parseGenericFindings(value, file),
    ];
  }

  if (typeof value === "string" && containsSecretSignal(value)) {
    return [
      createFinding({
        id: `secret-signal:${file}`,
        title: "Secret-like content detected in security input",
        message:
          "A secret-like value appears in provided security data and should be treated as compromised until verified.",
        severity: "critical",
        tool: inferToolFromFile(file),
        type: "secret",
        path: file,
      }),
    ];
  }

  return [];
}

function dedupeFindings(findings = []) {
  const seen = new Map();

  for (const finding of findings.map(createFinding)) {
    const key = [
      finding.tool,
      finding.id,
      finding.rule_id,
      finding.package,
      finding.current_version,
      finding.path,
      finding.line || "",
    ].join("|");

    if (!seen.has(key)) {
      seen.set(key, finding);
      continue;
    }

    const existing = seen.get(key);

    if (severityRank(finding.severity) > severityRank(existing.severity)) {
      seen.set(key, {
        ...existing,
        ...finding,
      });
    }
  }

  return [...seen.values()].sort((left, right) => {
    const diff = severityRank(right.severity) - severityRank(left.severity);

    if (diff !== 0) return diff;

    return String(left.title).localeCompare(String(right.title));
  });
}

function inferAreaLabelsFromFiles(files = []) {
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

function inferAffectedFiles(context, findings) {
  const files = [
    ...(context.pull_request?.files || []).map((file) => file.filename),
    ...findings.map((finding) => finding.path).filter(Boolean),
  ];

  return [...new Set(files)].slice(0, 100);
}

function inferAffectedPackages(findings) {
  return dedupeBy(
    findings
      .filter((finding) => finding.package)
      .map((finding) => ({
        name: finding.package,
        current_version: finding.current_version || null,
        fixed_version: finding.fixed_version || null,
        ecosystem: finding.ecosystem || "npm",
        advisory: finding.advisory || null,
        cve: finding.cve || null,
      })),
    (item) =>
      `${item.name}:${item.current_version}:${item.advisory}:${item.cve}`,
  );
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

function inferPrimaryTool(findings) {
  if (!findings.length) return "unknown";

  const counts = new Map();

  for (const finding of findings) {
    counts.set(finding.tool, (counts.get(finding.tool) || 0) + 1);
  }

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0] ||
    "unknown"
  );
}

function inferPrimaryType(findings) {
  if (!findings.length) return "none";

  const counts = new Map();

  for (const finding of findings) {
    counts.set(finding.type, (counts.get(finding.type) || 0) + 1);
  }

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0] ||
    "unknown"
  );
}

function hasSecretFinding(findings) {
  return findings.some((finding) => {
    return (
      finding.type === "secret" ||
      /\b(secret|credential|token|password|private key)\b/i.test(
        `${finding.title}\n${finding.message}\n${finding.rule_id}`,
      )
    );
  });
}

function hasCloudflareProductionRisk(context, findings) {
  const environment = normalizeString(
    context.deployment.environment,
  ).toLowerCase();
  const files = [
    ...(context.pull_request?.files || []).map((file) => file.filename),
    ...findings.map((finding) => finding.path).filter(Boolean),
  ];

  const text = [
    environment,
    ...files,
    ...findings.map(
      (finding) => `${finding.title} ${finding.message} ${finding.type}`,
    ),
  ]
    .join("\n")
    .toLowerCase();

  return (
    environment === "production" ||
    text.includes("production") ||
    (text.includes("cloudflare") &&
      /\b(secret|token|preview|wrangler|worker|pages|r2|d1|kv|queue)\b/.test(
        text,
      ))
  );
}

function inferLabels(context, triageBase) {
  const labels = new Set();

  labels.add("type:security");

  if (triageBase.triage_required) {
    labels.add("needs-triage");
  }

  if (triageBase.should_create_issue) {
    labels.add("status:todo");
  }

  labels.add(`priority:${triageBase.priority}`);

  if (
    triageBase.merge_blocking ||
    triageBase.release_blocking ||
    triageBase.deployment_blocking
  ) {
    labels.add("security:blocking");
  }

  if (triageBase.release_blocking) {
    labels.add("release:blocked");
  }

  if (triageBase.confidence !== "high" || triageBase.severity === "unknown") {
    labels.add("security:review-required");
  }

  const findingType = triageBase.finding_type;

  if (findingType === "dependency") labels.add("security:dependency");
  if (findingType === "secret") labels.add("security:secrets");
  if (findingType === "container") labels.add("security:container");
  if (findingType === "license") labels.add("security:license");
  if (findingType === "release-evidence") labels.add("security:sbom");
  if (findingType === "cloudflare") labels.add("area:cloudflare");

  const tool = triageBase.source_tool;

  if (tool === "codeql") labels.add("security:codeql");
  if (tool === "sonarqube") labels.add("security:sonarqube");
  if (tool === "dependency-review") labels.add("security:dependency-review");
  if (tool === "pnpm-audit") labels.add("security:pnpm-audit");
  if (tool === "trivy") labels.add("security:trivy");
  if (tool === "osv-scanner") labels.add("security:osv");

  for (const label of inferAreaLabelsFromFiles(
    triageBase.affected_files || [],
  )) {
    labels.add(label);
  }

  if (context.release.invalid_release_intent || context.release.no_release) {
    labels.add("no-release");
  }

  return [...labels];
}

function fallbackNoIssue(
  reason = "No actionable security issue was identified from the provided input.",
) {
  return {
    triage_required: false,
    should_create_issue: false,
    should_comment_on_pr: false,
    should_apply_labels: false,
    severity: "low",
    priority: "low",
    confidence: "high",
    merge_blocking: false,
    release_blocking: false,
    deployment_blocking: false,
    finding_type: "none",
    source_tool: "unknown",
    title: null,
    summary: "No actionable security issue was found.",
    risk: "No security risk requiring action was identified from the provided input.",
    affected_components: [],
    affected_files: [],
    affected_packages: [],
    labels: [],
    assignees: [],
    reviewers: [],
    issue: null,
    pr_comment: "",
    remediation: [],
    validation: [],
    release_notes: {
      include: false,
      text: "",
    },
    safe_public_summary:
      "No actionable security issue was identified from the provided input.",
    missing_information: [],
    reason,
  };
}

function fallbackSecurityTriage(context) {
  const findings = dedupeFindings(context.security.findings || []);
  const gate = context.security.gate;
  const hasFindings = findings.length > 0;
  const gateBlocked = gate && gate.allowed === false;
  const secretFinding = hasSecretFinding(findings);
  const severity = secretFinding
    ? "critical"
    : maxSeverity([
        ...findings.map((finding) => finding.severity),
        gateBlocked ? gate?.max_severity || "high" : "",
      ]);

  if (!hasFindings && !gateBlocked) {
    return fallbackNoIssue();
  }

  const priority = normalizePriority(null, severity);
  const sourceTool = inferPrimaryTool(findings);
  const findingType = secretFinding ? "secret" : inferPrimaryType(findings);
  const affectedFiles = inferAffectedFiles(context, findings);
  const affectedPackages = inferAffectedPackages(findings);
  const highRisk = severity === "critical" || severity === "high";
  const cloudflareProductionRisk = hasCloudflareProductionRisk(
    context,
    findings,
  );

  const mergeBlocking = highRisk || gateBlocked || secretFinding;
  const releaseBlocking =
    highRisk ||
    gateBlocked ||
    secretFinding ||
    context.release.invalid_release_intent ||
    context.release.dependency_release_attempt;
  const deploymentBlocking = highRisk && cloudflareProductionRisk;

  const title = createSecurityTitle(severity, findingType, sourceTool);
  const summary = createSecuritySummary(findings, gateBlocked, secretFinding);
  const risk = createRiskSummary(
    severity,
    findingType,
    cloudflareProductionRisk,
  );
  const remediation = createRemediation(
    findings,
    findingType,
    secretFinding,
    gateBlocked,
  );
  const validation = createValidation(
    findings,
    findingType,
    releaseBlocking,
    deploymentBlocking,
  );

  const triageBase = {
    triage_required: true,
    should_create_issue: highRisk || gateBlocked || secretFinding,
    should_comment_on_pr:
      Boolean(context.pull_request) &&
      (highRisk || gateBlocked || secretFinding),
    should_apply_labels: true,
    severity,
    priority,
    confidence: findings.some((finding) => finding.severity === "unknown")
      ? "medium"
      : "high",
    merge_blocking: mergeBlocking,
    release_blocking: releaseBlocking,
    deployment_blocking: deploymentBlocking,
    finding_type: findingType,
    source_tool: sourceTool,
    title,
    summary,
    risk,
    affected_components: inferAffectedComponents(affectedFiles),
    affected_files: affectedFiles,
    affected_packages: affectedPackages,
    labels: [],
    assignees: [context.defaults.assignee].filter(Boolean),
    reviewers: [],
    issue: null,
    pr_comment: "",
    remediation,
    validation,
    release_notes: {
      include:
        !secretFinding &&
        (findingType === "dependency" || findingType === "container") &&
        highRisk,
      text: !secretFinding && highRisk ? summary : "",
    },
    safe_public_summary: summary,
    missing_information: [],
    reason: gateBlocked
      ? "Security policy gate reported a blocking condition."
      : highRisk
        ? "High-risk security finding requires maintainer action."
        : "Security finding requires triage.",
  };

  triageBase.labels = inferLabels(context, triageBase);
  triageBase.issue = triageBase.should_create_issue
    ? {
        title,
        body: createIssueBody(triageBase, findings, context),
      }
    : null;
  triageBase.pr_comment = triageBase.should_comment_on_pr
    ? createPrComment(triageBase)
    : "";

  return triageBase;
}

function createSecurityTitle(severity, type, tool) {
  const prettySeverity = normalizeSeverity(severity).toUpperCase();

  if (type === "secret")
    return `[Security]: ${prettySeverity} secret exposure requires review`;
  if (type === "dependency")
    return `[Security]: ${prettySeverity} dependency vulnerability detected`;
  if (type === "container")
    return `[Security]: ${prettySeverity} container security finding detected`;
  if (type === "cloudflare")
    return `[Security]: ${prettySeverity} Cloudflare security configuration requires review`;
  if (type === "release-evidence")
    return `[Security]: ${prettySeverity} release evidence requirement failed`;

  return `[Security]: ${prettySeverity} finding detected by ${tool}`;
}

function createSecuritySummary(findings, gateBlocked, secretFinding) {
  if (secretFinding) {
    return "A secret-like value appears to be exposed and must be treated as compromised until verified otherwise.";
  }

  if (gateBlocked) {
    return "The security policy gate reported a blocking condition that requires maintainer review before merge, release, or deployment.";
  }

  const top = findings[0];

  if (!top)
    return "Security review found an issue that requires maintainer triage.";

  return `${top.tool} reported a ${top.severity} ${top.type} finding: ${top.title}.`;
}

function createRiskSummary(severity, type, productionRisk) {
  if (type === "secret") {
    return "Exposed secret-like values can allow unauthorized access and should be rotated, revoked, and audited immediately.";
  }

  if (productionRisk) {
    return "The finding may affect production or Cloudflare deployment safety, so deployment should remain blocked until reviewed.";
  }

  if (severity === "critical" || severity === "high") {
    return "The finding may materially affect system security and should block unsafe merge, release, or deployment until resolved.";
  }

  if (severity === "medium") {
    return "The finding may represent a meaningful security weakness and should be reviewed before release.";
  }

  return "The finding appears lower-risk but should still be reviewed for defense-in-depth.";
}

function createRemediation(findings, type, secretFinding, gateBlocked) {
  const remediation = [];

  if (secretFinding) {
    remediation.push(
      "Treat the exposed value as compromised until verified otherwise.",
    );
    remediation.push("Revoke and rotate the affected secret or credential.");
    remediation.push(
      "Move the value into an environment-scoped GitHub secret or external secret store.",
    );
    remediation.push("Audit recent usage logs for suspicious access.");
    remediation.push(
      "Remove the secret from committed content and generated artifacts.",
    );
    return remediation;
  }

  if (type === "dependency") {
    const packages = inferAffectedPackages(findings);

    if (packages.length) {
      for (const pkg of packages.slice(0, 5)) {
        remediation.push(
          pkg.fixed_version
            ? `Update \`${pkg.name}\` to \`${pkg.fixed_version}\` or later.`
            : `Review and remediate vulnerable package \`${pkg.name}\`.`,
        );
      }
    } else {
      remediation.push(
        "Update or replace the vulnerable dependency identified by the scanner.",
      );
    }

    remediation.push("Regenerate the lockfile if dependency versions change.");
  }

  if (type === "container") {
    remediation.push(
      "Update the affected base image or vulnerable package layer.",
    );
    remediation.push("Rebuild the container image.");
    remediation.push(
      "Regenerate the image SBOM if release artifacts are required.",
    );
  }

  if (type === "cloudflare") {
    remediation.push(
      "Verify Cloudflare configuration uses environment-scoped tokens and secrets.",
    );
    remediation.push(
      "Confirm preview deployments cannot access production secrets.",
    );
    remediation.push(
      "Review Wrangler configuration for unsafe public exposure.",
    );
  }

  if (gateBlocked) {
    remediation.push("Resolve each security policy gate blocker.");
    remediation.push("Re-run the security workflow after remediation.");
  }

  if (!remediation.length) {
    remediation.push(
      "Review the scanner output and apply the appropriate security fix.",
    );
  }

  return [...new Set(remediation)];
}

function createValidation(findings, type, releaseBlocking, deploymentBlocking) {
  const validation = [];

  if (type === "dependency") {
    validation.push("Run `pnpm install --frozen-lockfile`.");
    validation.push("Run `pnpm audit --audit-level high`.");
    validation.push("Confirm Dependency Review passes.");
  }

  if (type === "container") {
    validation.push("Rebuild the affected Docker image.");
    validation.push("Re-run container scanning.");
  }

  if (type === "secret") {
    validation.push("Confirm the exposed secret has been revoked and rotated.");
    validation.push(
      "Confirm no secret values remain in commits, logs, artifacts, or generated reports.",
    );
  }

  validation.push("Confirm the Security Policy Gate passes.");

  if (releaseBlocking) {
    validation.push("Confirm release validation passes after remediation.");
  }

  if (deploymentBlocking) {
    validation.push(
      "Confirm Cloudflare deployment gates pass for the affected environment.",
    );
  }

  return [...new Set(validation)];
}

function inferAffectedComponents(files = []) {
  const components = new Set();

  for (const file of files) {
    const parts = toPosixPath(file).split("/");

    if (parts[0] === "apps" && parts[1]) components.add(`apps/${parts[1]}`);
    if (parts[0] === "libs" && parts[1]) components.add(`libs/${parts[1]}`);
    if (parts[0] === ".github") components.add(".github");
    if (parts[0] === "docs" || parts[0] === "Docs") components.add("docs");
  }

  return [...components];
}

function createIssueBody(triage, findings, context) {
  const evidence = findings.slice(0, 10);

  return [
    "## 🔐 Summary",
    "",
    triage.safe_public_summary,
    "",
    "## 🚦 Severity",
    "",
    `- Severity: \`${triage.severity}\``,
    `- Priority: \`${triage.priority}\``,
    `- Merge blocking: \`${triage.merge_blocking ? "true" : "false"}\``,
    `- Release blocking: \`${triage.release_blocking ? "true" : "false"}\``,
    `- Deployment blocking: \`${triage.deployment_blocking ? "true" : "false"}\``,
    "",
    "## 🎯 Impact",
    "",
    triage.risk,
    "",
    "## 🧩 Affected Scope",
    "",
    triage.affected_components.length
      ? triage.affected_components
          .map((component) => `- Component: \`${component}\``)
          .join("\n")
      : "- Component: not provided",
    triage.affected_files.length
      ? triage.affected_files
          .slice(0, 25)
          .map((file) => `- File: \`${file}\``)
          .join("\n")
      : "- Files: not provided",
    triage.affected_packages.length
      ? triage.affected_packages
          .slice(0, 15)
          .map(
            (pkg) =>
              `- Package: \`${pkg.name}\`${pkg.fixed_version ? ` → fixed in \`${pkg.fixed_version}\`` : ""}`,
          )
          .join("\n")
      : "- Packages: not provided",
    context.deployment.environment
      ? `- Environment: \`${context.deployment.environment}\``
      : "- Environment: not provided",
    "",
    "## 🛠️ Recommended Remediation",
    "",
    triage.remediation.map((item) => `- [ ] ${item}`).join("\n"),
    "",
    "## 🧪 Validation",
    "",
    triage.validation.map((item) => `- [ ] ${item}`).join("\n"),
    "",
    "## 📎 Evidence",
    "",
    `- Tool: \`${triage.source_tool}\``,
    evidence.length
      ? evidence
          .map((finding) => {
            const details = [
              `- Finding: \`${finding.id}\``,
              finding.advisory ? `  - Advisory: \`${finding.advisory}\`` : null,
              finding.cve ? `  - CVE: \`${finding.cve}\`` : null,
              finding.rule_id ? `  - Rule: \`${finding.rule_id}\`` : null,
              finding.path
                ? `  - Path: \`${finding.path}${finding.line ? `:${finding.line}` : ""}\``
                : null,
            ].filter(Boolean);

            return details.join("\n");
          })
          .join("\n")
      : "- No detailed finding evidence was provided.",
    "",
    "## 📝 Notes",
    "",
    "- No secret values or exploit payloads are included in this issue.",
    context.pull_request
      ? `- Pull request: #${context.pull_request.number}`
      : "- Pull request: not provided",
  ]
    .filter((line) => line !== null && line !== undefined && line !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createPrComment(triage) {
  return [
    "## 🔐 Security Triage",
    "",
    triage.merge_blocking ||
    triage.release_blocking ||
    triage.deployment_blocking
      ? "Security review found an issue that needs attention before this work can proceed."
      : "Security review found an issue that should be reviewed.",
    "",
    `- Severity: \`${triage.severity}\``,
    `- Priority: \`${triage.priority}\``,
    `- Merge blocking: \`${triage.merge_blocking ? "true" : "false"}\``,
    `- Release blocking: \`${triage.release_blocking ? "true" : "false"}\``,
    `- Deployment blocking: \`${triage.deployment_blocking ? "true" : "false"}\``,
    "",
    "### Why this matters",
    "",
    triage.risk,
    "",
    "### Required action",
    "",
    ...triage.remediation.slice(0, 6).map((item) => `- [ ] ${item}`),
    "",
    "### Validation",
    "",
    ...triage.validation.slice(0, 6).map((item) => `- [ ] ${item}`),
    "",
    "No secret values or exploit payloads are included in this comment.",
  ].join("\n");
}

function validateTriage(raw, context) {
  if (!raw || typeof raw !== "object") {
    return fallbackSecurityTriage(context);
  }

  if (raw.triage_required === false && raw.should_create_issue === false) {
    return {
      ...fallbackNoIssue(
        raw.reason || "AI triage reported no actionable security issue.",
      ),
      ...raw,
      severity: normalizeSeverity(raw.severity || "low"),
      priority: normalizePriority(raw.priority, raw.severity || "low"),
      confidence: normalizeConfidence(raw.confidence),
      labels: normalizeStringList(raw.labels),
    };
  }

  const severity = normalizeSeverity(raw.severity);
  const priority = normalizePriority(raw.priority, severity);
  const triage = {
    triage_required: raw.triage_required !== false,
    should_create_issue: Boolean(raw.should_create_issue),
    should_comment_on_pr: Boolean(raw.should_comment_on_pr),
    should_apply_labels: raw.should_apply_labels !== false,
    severity,
    priority,
    confidence: normalizeConfidence(raw.confidence),
    merge_blocking: Boolean(raw.merge_blocking),
    release_blocking: Boolean(raw.release_blocking),
    deployment_blocking: Boolean(raw.deployment_blocking),
    finding_type: normalizeString(raw.finding_type, "unknown"),
    source_tool: normalizeString(raw.source_tool, "unknown"),
    title:
      raw.title ||
      createSecurityTitle(
        severity,
        normalizeString(raw.finding_type, "unknown"),
        normalizeString(raw.source_tool, "unknown"),
      ),
    summary: normalizeString(
      raw.summary,
      "Security review found an issue that requires maintainer triage.",
    ),
    risk: normalizeString(
      raw.risk,
      "Security impact requires maintainer review.",
    ),
    affected_components: normalizeStringList(raw.affected_components),
    affected_files: normalizeStringList(raw.affected_files),
    affected_packages: Array.isArray(raw.affected_packages)
      ? raw.affected_packages.map(redactValue)
      : [],
    labels: normalizeStringList(raw.labels),
    assignees: normalizeStringList(raw.assignees).length
      ? normalizeStringList(raw.assignees)
      : [context.defaults.assignee].filter(Boolean),
    reviewers: normalizeStringList(raw.reviewers),
    issue:
      raw.issue && typeof raw.issue === "object"
        ? {
            title: normalizeString(
              raw.issue.title,
              raw.title || "Security finding requires review",
            ),
            body: normalizeString(raw.issue.body, ""),
          }
        : null,
    pr_comment: normalizeString(raw.pr_comment, ""),
    remediation: normalizeStringList(raw.remediation),
    validation: normalizeStringList(raw.validation),
    release_notes:
      raw.release_notes && typeof raw.release_notes === "object"
        ? {
            include: Boolean(raw.release_notes.include),
            text: normalizeString(raw.release_notes.text),
          }
        : {
            include: false,
            text: "",
          },
    safe_public_summary: normalizeString(
      raw.safe_public_summary,
      raw.summary || "Security finding requires review.",
    ),
    missing_information: normalizeStringList(raw.missing_information),
    reason: normalizeString(
      raw.reason,
      "Security triage requires maintainer action.",
    ),
  };

  if (!triage.labels.length) {
    triage.labels = inferLabels(context, triage);
  }

  if (triage.should_create_issue && !triage.issue) {
    triage.issue = {
      title: triage.title,
      body: createIssueBody(triage, context.security.findings || [], context),
    };
  }

  if (triage.should_comment_on_pr && !triage.pr_comment) {
    triage.pr_comment = createPrComment(triage);
  }

  return redactValue(triage);
}

async function buildTriageWithOpenAI(prompt, context, args) {
  if (args.no_ai) return null;

  if (!openaiClient) {
    if (args.require_ai) {
      throw new Error(
        "OpenAI client is unavailable and --require-ai was passed.",
      );
    }

    return null;
  }

  const result = await openaiClient.safeGenerateJson({
    instructions: prompt,
    input: [
      "Create the final security triage JSON object from this context.",
      "Use only the information provided.",
      "Return only valid JSON.",
      "",
      "Context:",
      "```json",
      JSON.stringify(context, null, 2),
      "```",
    ].join("\n"),
    model: args.model,
    max_output_tokens: 6000,
    temperature: 0.2,
    require_ai: args.require_ai,
    throwOnError: args.require_ai,
  });

  if (!result.ok || !result.json) {
    if (args.require_ai) {
      throw new Error(result.reason || "OpenAI security triage failed.");
    }

    return null;
  }

  context.generation.used_ai = true;

  return result.json;
}

async function createGitHubIssue(triage, args) {
  if (!triage.should_create_issue || !triage.issue) {
    return {
      created: false,
      skipped: true,
      reason: "Issue creation was not recommended.",
      issue: null,
    };
  }

  if (!args.create_issue) {
    return {
      created: false,
      skipped: true,
      reason: "Issue creation is disabled.",
      issue: null,
    };
  }

  if (args.dry_run) {
    return {
      created: false,
      skipped: true,
      dry_run: true,
      reason: "Dry-run mode is enabled.",
      issue: null,
    };
  }

  if (!args.write_mode) {
    return {
      created: false,
      skipped: true,
      reason: "Write mode is disabled.",
      issue: null,
    };
  }

  const repo = parseRepository(args.repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues`,
    {
      method: "POST",
      body: {
        title: triage.issue.title,
        body: triage.issue.body,
        labels: normalizeStringList(triage.labels),
        assignees: normalizeStringList(triage.assignees),
      },
    },
  );

  return {
    created: true,
    skipped: false,
    dry_run: false,
    reason: "Security issue created.",
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

async function commentOnPullRequest(triage, context, args) {
  if (
    !context.pull_request ||
    !triage.should_comment_on_pr ||
    !triage.pr_comment
  ) {
    return {
      created: false,
      skipped: true,
      reason: "PR comment was not recommended or no PR context exists.",
    };
  }

  if (!args.comment_on_pr) {
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

  const repo = parseRepository(args.repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${context.pull_request.number}/comments`,
    {
      method: "POST",
      body: {
        body: triage.pr_comment,
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

async function applyLabelsToTarget(number, labels, args) {
  if (!number || !labels.length) {
    return {
      applied: false,
      skipped: true,
      reason: "No target or labels were provided.",
      labels: [],
    };
  }

  if (!args.apply_labels) {
    return {
      applied: false,
      skipped: true,
      reason: "Label application is disabled.",
      labels,
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

  const repo = parseRepository(args.repository);

  const response = await githubRequest(
    `/repos/${repo.owner}/${repo.repo}/issues/${number}/labels`,
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

function inferReleaseContext(inputs, pullRequest) {
  const labels = [
    ...(pullRequest?.labels || []),
    ...normalizeStringList(process.env.PR_LABELS),
    ...normalizeStringList(process.env.RELEASE_LABELS),
  ].map((label) => label.toLowerCase());

  const releaseLabels = labels.filter((label) =>
    ["release:major", "release:minor", "release:patch"].includes(label),
  );

  return {
    labels,
    release_labels: releaseLabels,
    no_release: labels.includes("no-release"),
    invalid_release_intent: releaseLabels.length > 1,
    dependency_release_attempt:
      releaseLabels.length > 0 &&
      labels.some((label) =>
        ["dependencies", "renovate", "dependabot", "mend"].includes(label),
      ),
  };
}

function createContext(args, pullRequest, issue, inputs, findings) {
  const repoRoot = findRepoRoot();
  const git = getGitMetadata(repoRoot);
  const securityGateInput = inputs.find((input) =>
    input.file.includes("security-gate"),
  );
  const securityReportInput = inputs.find((input) =>
    input.file.includes("security-report"),
  );

  const context = {
    project: {
      name: PROJECT_NAME,
      repository: args.repository,
      default_branch: DEFAULT_BRANCH,
    },
    defaults: {
      assignee: args.default_assignee,
    },
    github: git,
    pull_request: pullRequest,
    issue,
    deployment: {
      environment: args.deployment_environment,
    },
    release: inferReleaseContext(inputs, pullRequest),
    security: {
      gate:
        securityGateInput?.value?.gate ||
        securityGateInput?.value ||
        securityReportInput?.value?.gate ||
        null,
      report: securityReportInput?.value || null,
      findings,
      totals: {
        findings: findings.length,
        critical: findings.filter((finding) => finding.severity === "critical")
          .length,
        high: findings.filter((finding) => finding.severity === "high").length,
        medium: findings.filter((finding) => finding.severity === "medium")
          .length,
        low: findings.filter((finding) => finding.severity === "low").length,
        unknown: findings.filter((finding) => finding.severity === "unknown")
          .length,
      },
    },
    inputs,
    generation: {
      prompt_file: args.prompt_file,
      output_file: args.output_file,
      context_file: args.context_file,
      model: args.model,
      used_ai: false,
      dry_run: args.dry_run,
      write_mode: args.write_mode,
      create_issue: args.create_issue,
      comment_on_pr: args.comment_on_pr,
      apply_labels: args.apply_labels,
      generated_at: new Date().toISOString(),
    },
  };

  return redactValue(context);
}

function createSummary(context, output, relativeOutput) {
  const triage = output.triage;

  return [
    "## 🔐 Security Triage",
    "",
    `- Severity: \`${triage.severity}\``,
    `- Priority: \`${triage.priority}\``,
    `- Confidence: \`${triage.confidence}\``,
    `- Merge blocking: \`${triage.merge_blocking ? "true" : "false"}\``,
    `- Release blocking: \`${triage.release_blocking ? "true" : "false"}\``,
    `- Deployment blocking: \`${triage.deployment_blocking ? "true" : "false"}\``,
    `- Should create issue: \`${triage.should_create_issue ? "true" : "false"}\``,
    `- Issue created: \`${output.result.issue.created ? "true" : "false"}\``,
    `- PR comment created: \`${output.result.pr_comment.created ? "true" : "false"}\``,
    `- Used AI: \`${context.generation.used_ai ? "true" : "false"}\``,
    `- Output: \`${relativeOutput}\``,
    "",
    `Reason: ${triage.reason}`,
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

  const prompt = readTextFile(promptFile);

  const inputFiles = [
    ...new Set([...args.input_files, ...DEFAULT_INPUT_FILES]),
  ];
  const inputs = inputFiles
    .map((filePath) => readInputFile(filePath, repoRoot))
    .filter(Boolean);

  const findings = dedupeFindings(inputs.flatMap(parseFindingsFromInput));

  const [pullRequest, issue] = await Promise.all([
    getPullRequestContext(args),
    getIssueContext(args),
  ]);

  const context = createContext(args, pullRequest, issue, inputs, findings);

  logger.info(`Running security triage with ${findings.length} finding(s).`);

  const aiTriage = await buildTriageWithOpenAI(prompt, context, args).catch(
    (err) => {
      if (args.require_ai) throw err;

      logger.warn(
        `AI security triage failed. Falling back locally. ${logger.formatError(err)}`,
      );
      return null;
    },
  );

  const triage = validateTriage(
    aiTriage || fallbackSecurityTriage(context),
    context,
  );

  const [issueResult, prCommentResult] = await Promise.all([
    createGitHubIssue(triage, args).catch((err) => ({
      created: false,
      skipped: true,
      error: logger.formatError(err),
      issue: null,
    })),
    commentOnPullRequest(triage, context, args).catch((err) => ({
      created: false,
      skipped: true,
      error: logger.formatError(err),
    })),
  ]);

  const labelTargets = [];

  if (context.pull_request?.number && triage.should_apply_labels) {
    labelTargets.push({
      type: "pull_request",
      number: context.pull_request.number,
    });
  }

  if (context.issue?.number && triage.should_apply_labels) {
    labelTargets.push({
      type: "issue",
      number: context.issue.number,
    });
  }

  if (issueResult.issue?.number && triage.should_apply_labels) {
    labelTargets.push({
      type: "created_issue",
      number: issueResult.issue.number,
    });
  }

  const labelResults = [];

  for (const target of labelTargets) {
    const result = await applyLabelsToTarget(
      target.number,
      triage.labels,
      args,
    ).catch((err) => ({
      applied: false,
      skipped: true,
      error: logger.formatError(err),
      labels: triage.labels,
    }));

    labelResults.push({
      ...target,
      result,
    });
  }

  const output = redactValue({
    schema_version: 1,
    type: "security-triage-result",
    created_at: new Date().toISOString(),
    project: PROJECT_NAME,
    repository: args.repository,
    pull_request: context.pull_request
      ? {
          number: context.pull_request.number,
          title: context.pull_request.title,
          html_url: context.pull_request.html_url,
        }
      : null,
    issue: context.issue
      ? {
          number: context.issue.number,
          title: context.issue.title,
          html_url: context.issue.html_url,
        }
      : null,
    triage,
    result: {
      issue: issueResult,
      pr_comment: prCommentResult,
      labels: labelResults,
    },
  });

  writeTextFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  writeTextFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, {
    dry_run: args.dry_run,
  });

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeContext = toRelativePath(contextFile, repoRoot);

  setGitHubOutput("security_triage_file", relativeOutput);
  setGitHubOutput("security_triage_context_file", relativeContext);
  setGitHubOutput(
    "security_triage_required",
    triage.triage_required ? "true" : "false",
  );
  setGitHubOutput("security_triage_severity", triage.severity);
  setGitHubOutput("security_triage_priority", triage.priority);
  setGitHubOutput("security_triage_confidence", triage.confidence);
  setGitHubOutput(
    "security_triage_merge_blocking",
    triage.merge_blocking ? "true" : "false",
  );
  setGitHubOutput(
    "security_triage_release_blocking",
    triage.release_blocking ? "true" : "false",
  );
  setGitHubOutput(
    "security_triage_deployment_blocking",
    triage.deployment_blocking ? "true" : "false",
  );
  setGitHubOutput(
    "security_triage_should_create_issue",
    triage.should_create_issue ? "true" : "false",
  );
  setGitHubOutput(
    "security_triage_issue_created",
    issueResult.created ? "true" : "false",
  );
  setGitHubOutput(
    "security_triage_issue_number",
    issueResult.issue?.number ? String(issueResult.issue.number) : "",
  );
  setGitHubOutput(
    "security_triage_issue_url",
    issueResult.issue?.html_url || "",
  );
  setGitHubOutput(
    "security_triage_used_ai",
    context.generation.used_ai ? "true" : "false",
  );

  if (args.write_summary) {
    appendGitHubStepSummary(createSummary(context, output, relativeOutput));
  }

  if (args.print) {
    console.log(JSON.stringify(output, null, 2));
  }

  if (
    args.fail_on_blocking &&
    (triage.merge_blocking ||
      triage.release_blocking ||
      triage.deployment_blocking)
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
