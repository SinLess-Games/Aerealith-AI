// .github/scripts/utils/github.js
// =============================================================================
// Aerealith AI GitHub Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared GitHub API helpers for workflow automation scripts.
//
// Used by:
//   - repo management scripts
//   - label/milestone/project sync scripts
//   - PR/issue relationship scripts
//   - reviewer/assignee automation
//   - release scripts
//   - discussion announcement scripts
//   - security policy/report scripts
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in `fetch`.
//   - Does not require `@octokit/rest`.
//   - Supports dry-run mode for mutating operations.
//   - Secrets/tokens are masked through logger utilities.
//   - Mutation helpers default to safe dry-run behavior when requested.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");

const logger = require("./logger");

const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_GRAPHQL_URL = "https://api.github.com/graphql";
const DEFAULT_WEB_URL = "https://github.com";
const DEFAULT_ACCEPT = "application/vnd.github+json";
const DEFAULT_API_VERSION = "2022-11-28";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ISSUE_PR_COMMENT_MARKERS = {
  repo_management: {
    start: "<!-- aerealith-repo-management:start -->",
    end: "<!-- aerealith-repo-management:end -->",
  },
  labels: {
    start: "<!-- aerealith-labels:start -->",
    end: "<!-- aerealith-labels:end -->",
  },
  milestones: {
    start: "<!-- aerealith-milestones:start -->",
    end: "<!-- aerealith-milestones:end -->",
  },
  relationships: {
    start: "<!-- aerealith-relationships:start -->",
    end: "<!-- aerealith-relationships:end -->",
  },
  release: {
    start: "<!-- aerealith-release-rules:start -->",
    end: "<!-- aerealith-release-rules:end -->",
  },
  security: {
    start: "<!-- aerealith-security-rules:start -->",
    end: "<!-- aerealith-security-rules:end -->",
  },
  cloudflare: {
    start: "<!-- aerealith-cloudflare:start -->",
    end: "<!-- aerealith-cloudflare:end -->",
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
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

function normalizeRepoSlug(
  repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
) {
  const normalized = normalizeString(repository, DEFAULT_REPOSITORY);

  if (!normalized.includes("/")) {
    throw new Error(
      `Repository must be in owner/name format. Received: ${repository}`,
    );
  }

  const [owner, repo] = normalized.split("/");

  if (!owner || !repo) {
    throw new Error(
      `Repository must be in owner/name format. Received: ${repository}`,
    );
  }

  return `${owner}/${repo}`;
}

function parseRepository(
  repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
) {
  const slug = normalizeRepoSlug(repository);
  const [owner, repo] = slug.split("/");

  return {
    owner,
    repo,
    name: repo,
    full_name: slug,
    slug,
  };
}

function encodePathPart(value) {
  return encodeURIComponent(String(value));
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

function getWriteMode(options = {}) {
  return normalizeBoolean(
    options.writeMode ??
      options.write_mode ??
      process.env.WRITE_MODE ??
      process.env.PROJECT_SYNC_WRITE_MODE,
    false,
  );
}

function getGitHubToken(options = {}) {
  const token =
    options.token ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT;

  if (token) {
    logger.mask(token);
  }

  return token || "";
}

function requireGitHubToken(options = {}) {
  const token = getGitHubToken(options);

  if (!token) {
    throw new Error(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT.",
    );
  }

  return token;
}

function getGitHubApiUrl(options = {}) {
  return normalizeString(
    options.apiUrl || options.api_url || process.env.GITHUB_API_URL,
    DEFAULT_API_URL,
  );
}

function getGitHubGraphqlUrl(options = {}) {
  return normalizeString(
    options.graphqlUrl || options.graphql_url || process.env.GITHUB_GRAPHQL_URL,
    DEFAULT_GRAPHQL_URL,
  );
}

function getGitHubWebUrl(options = {}) {
  return normalizeString(
    options.webUrl || options.web_url || process.env.GITHUB_SERVER_URL,
    DEFAULT_WEB_URL,
  );
}

function getGitHubContext(options = {}) {
  const repository = parseRepository(
    options.repository || process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
  );
  const ref = normalizeString(options.ref || process.env.GITHUB_REF);
  const refName = normalizeString(
    options.refName || options.ref_name || process.env.GITHUB_REF_NAME,
  );
  const headRef = normalizeString(
    options.headRef || options.head_ref || process.env.GITHUB_HEAD_REF,
  );
  const baseRef = normalizeString(
    options.baseRef || options.base_ref || process.env.GITHUB_BASE_REF,
  );

  return {
    api_url: getGitHubApiUrl(options),
    graphql_url: getGitHubGraphqlUrl(options),
    web_url: getGitHubWebUrl(options),

    repository: repository.full_name,
    owner: repository.owner,
    repo: repository.repo,

    actor: normalizeString(options.actor || process.env.GITHUB_ACTOR),
    triggering_actor: normalizeString(
      options.triggering_actor || process.env.GITHUB_TRIGGERING_ACTOR,
    ),
    event_name: normalizeString(
      options.eventName || options.event_name || process.env.GITHUB_EVENT_NAME,
    ),
    workflow: normalizeString(options.workflow || process.env.GITHUB_WORKFLOW),
    job: normalizeString(options.job || process.env.GITHUB_JOB),
    run_id: normalizeString(
      options.runId || options.run_id || process.env.GITHUB_RUN_ID,
    ),
    run_number: normalizeString(
      options.runNumber || options.run_number || process.env.GITHUB_RUN_NUMBER,
    ),
    run_attempt: normalizeString(
      options.runAttempt ||
        options.run_attempt ||
        process.env.GITHUB_RUN_ATTEMPT,
    ),
    workspace: normalizeString(
      options.workspace || process.env.GITHUB_WORKSPACE,
      process.cwd(),
    ),

    sha: normalizeString(options.sha || process.env.GITHUB_SHA),
    ref,
    ref_name: refName,
    ref_type: normalizeString(
      options.refType || options.ref_type || process.env.GITHUB_REF_TYPE,
    ),
    head_ref: headRef,
    base_ref: baseRef,
    branch:
      normalizeBranchName(headRef) ||
      normalizeBranchName(refName) ||
      normalizeBranchName(ref) ||
      DEFAULT_BRANCH,
    base_branch: normalizeBranchName(baseRef),
    tag: normalizeTagName(refName) || normalizeTagName(ref),
    default_branch: normalizeString(
      options.defaultBranch || options.default_branch,
      DEFAULT_BRANCH,
    ),

    dry_run: getDryRun(options),
    write_mode: getWriteMode(options),
  };
}

function readGitHubEventPayload(options = {}) {
  const eventPath = normalizeString(
    options.eventPath || options.event_path || process.env.GITHUB_EVENT_PATH,
  );

  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to read GitHub event payload: ${logger.formatError(err)}`,
    );
  }
}

function getPullRequestPayload(options = {}) {
  const payload = options.payload || readGitHubEventPayload(options);
  const pullRequest = payload.pull_request || {};

  return {
    number: pullRequest.number || payload.number || null,
    title: pullRequest.title || "",
    body: pullRequest.body || "",
    state: pullRequest.state || "",
    merged: Boolean(pullRequest.merged),
    draft: Boolean(pullRequest.draft),
    author: pullRequest.user?.login || "",
    base_branch: pullRequest.base?.ref || process.env.GITHUB_BASE_REF || "",
    head_branch: pullRequest.head?.ref || process.env.GITHUB_HEAD_REF || "",
    base_sha: pullRequest.base?.sha || "",
    head_sha: pullRequest.head?.sha || "",
    merge_commit_sha: pullRequest.merge_commit_sha || "",
    from_fork: Boolean(pullRequest.head?.repo?.fork),
    labels: Array.isArray(pullRequest.labels)
      ? pullRequest.labels.map((label) => label.name).filter(Boolean)
      : [],
    milestone: pullRequest.milestone?.title || null,
    html_url: pullRequest.html_url || "",
    raw: pullRequest,
  };
}

function getIssuePayload(options = {}) {
  const payload = options.payload || readGitHubEventPayload(options);
  const issue = payload.issue || {};

  return {
    number: issue.number || payload.number || null,
    title: issue.title || "",
    body: issue.body || "",
    state: issue.state || "",
    author: issue.user?.login || "",
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label) => label.name).filter(Boolean)
      : [],
    milestone: issue.milestone?.title || null,
    html_url: issue.html_url || "",
    raw: issue,
  };
}

function buildHeaders(options = {}) {
  const token = getGitHubToken(options);

  const headers = {
    Accept: options.accept || DEFAULT_ACCEPT,
    "X-GitHub-Api-Version":
      options.apiVersion || options.api_version || DEFAULT_API_VERSION,
    "User-Agent":
      options.userAgent ||
      options.user_agent ||
      "aerealith-github-project-scripts",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.json !== false) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function buildUrl(endpoint, options = {}) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const apiUrl = getGitHubApiUrl(options).replace(/\/$/, "");
  const normalizedEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`;

  return `${apiUrl}${normalizedEndpoint}`;
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};

  return Object.fromEntries(
    linkHeader
      .split(",")
      .map((part) => {
        const section = part.trim();
        const match = section.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);

        if (!match) return [null, null];

        return [match[2], match[1]];
      })
      .filter(([key]) => Boolean(key)),
  );
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeRequest(method, endpoint) {
  return `${method.toUpperCase()} ${endpoint}`;
}

async function githubRequest(endpoint, options = {}) {
  const method = normalizeString(options.method, "GET").toUpperCase();
  const dryRun = getDryRun(options);
  const isMutation = MUTATING_METHODS.has(method);

  if (isMutation && dryRun) {
    logger.dryRun(
      `Would call GitHub API: ${describeRequest(method, endpoint)}`,
    );
    logger.dump("github request body", options.body || null);

    return {
      dry_run: true,
      skipped: true,
      method,
      endpoint,
      status: 0,
      data: options.dryRunResponse ?? options.dry_run_response ?? null,
    };
  }

  if (options.requireToken !== false && options.require_token !== false) {
    requireGitHubToken(options);
  }

  const url = buildUrl(endpoint, options);

  const requestOptions = {
    method,
    headers: buildHeaders(options),
  };

  if (options.body !== undefined && options.body !== null) {
    requestOptions.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  logger.debug(`GitHub API request: ${describeRequest(method, endpoint)}`);

  const response = await fetch(url, requestOptions);
  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      response.statusText;

    throw new Error(
      [
        `GitHub API request failed: ${describeRequest(method, endpoint)}`,
        `Status: ${response.status}`,
        `Message: ${message}`,
      ].join("\n"),
    );
  }

  return {
    dry_run: false,
    skipped: false,
    method,
    endpoint,
    status: response.status,
    headers: response.headers,
    data,
  };
}

async function githubPaginatedRequest(endpoint, options = {}) {
  const maxPages = Number(options.maxPages || options.max_pages || 100);
  const results = [];
  let nextUrl = endpoint;
  let page = 0;

  while (nextUrl && page < maxPages) {
    page += 1;

    const response = await githubRequest(nextUrl, {
      ...options,
      method: options.method || "GET",
    });

    if (response.dry_run) return response.data || [];

    if (Array.isArray(response.data)) {
      results.push(...response.data);
    } else if (response.data?.items && Array.isArray(response.data.items)) {
      results.push(...response.data.items);
    } else if (response.data !== null && response.data !== undefined) {
      results.push(response.data);
    }

    const links = parseLinkHeader(response.headers?.get?.("link"));
    nextUrl = links.next || null;
  }

  return results;
}

async function githubGraphql(query, variables = {}, options = {}) {
  const dryRun = getDryRun(options);

  if (dryRun && options.mutation) {
    logger.dryRun("Would call GitHub GraphQL mutation.");
    logger.dump("github graphql variables", variables);

    return options.dryRunResponse ?? options.dry_run_response ?? null;
  }

  requireGitHubToken(options);

  const response = await fetch(getGitHubGraphqlUrl(options), {
    method: "POST",
    headers: buildHeaders(options),
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const data = await parseResponse(response);

  if (!response.ok || data?.errors?.length) {
    const message =
      data?.errors?.map((error) => error.message).join("; ") ||
      response.statusText;

    throw new Error(`GitHub GraphQL request failed: ${message}`);
  }

  return data.data;
}

async function getRepository(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(`/repos/${owner}/${repo}`, options);
  return response.data;
}

async function getRepositoryNodeId(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const data = await githubGraphql(
    `
      query RepositoryNodeId($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          name
          nameWithOwner
          databaseId
          defaultBranchRef {
            name
          }
        }
      }
    `,
    {
      owner,
      repo,
    },
    options,
  );

  return data.repository;
}

async function listLabels(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/labels?per_page=100`,
    options,
  );
}

async function getLabel(name, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  try {
    const response = await githubRequest(
      `/repos/${owner}/${repo}/labels/${encodePathPart(name)}`,
      {
        ...options,
        requireToken: false,
      },
    );

    return response.data;
  } catch (err) {
    if (String(err.message || "").includes("Status: 404")) return null;
    throw err;
  }
}

async function createLabel(label, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const body = {
    name: label.name,
    color: normalizeString(label.color).replace(/^#/, ""),
    description: normalizeString(label.description),
  };

  const response = await githubRequest(`/repos/${owner}/${repo}/labels`, {
    ...options,
    method: "POST",
    body,
  });

  return response.data;
}

async function updateLabel(currentName, label, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const body = {
    new_name: label.name || currentName,
    color: normalizeString(label.color).replace(/^#/, ""),
    description: normalizeString(label.description),
  };

  const response = await githubRequest(
    `/repos/${owner}/${repo}/labels/${encodePathPart(currentName)}`,
    {
      ...options,
      method: "PATCH",
      body,
    },
  );

  return response.data;
}

async function deleteLabel(name, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/labels/${encodePathPart(name)}`,
    {
      ...options,
      method: "DELETE",
    },
  );

  return response.data;
}

async function listMilestones(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const state = normalizeString(options.state, "all");

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/milestones?state=${encodePathPart(state)}&per_page=100`,
    options,
  );
}

async function getMilestoneByTitle(title, options = {}) {
  const milestones = await listMilestones({
    ...options,
    state: "all",
  });

  return milestones.find((milestone) => milestone.title === title) || null;
}

async function createMilestone(milestone, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const body = {
    title: milestone.title,
    state: milestone.state || "open",
    description: milestone.description || "",
  };

  if (milestone.due_on) {
    body.due_on = milestone.due_on;
  }

  const response = await githubRequest(`/repos/${owner}/${repo}/milestones`, {
    ...options,
    method: "POST",
    body,
  });

  return response.data;
}

async function updateMilestone(number, milestone, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const body = {
    title: milestone.title,
    state: milestone.state || "open",
    description: milestone.description || "",
  };

  if (milestone.due_on !== undefined) {
    body.due_on = milestone.due_on;
  }

  const response = await githubRequest(
    `/repos/${owner}/${repo}/milestones/${number}`,
    {
      ...options,
      method: "PATCH",
      body,
    },
  );

  return response.data;
}

async function listIssues(options = {}) {
  const { owner, repo } = parseRepository(options.repository);
  const state = normalizeString(options.state, "open");
  const labels = normalizeStringList(options.labels).join(",");
  const milestone = options.milestone
    ? `&milestone=${encodePathPart(options.milestone)}`
    : "";
  const labelQuery = labels ? `&labels=${encodePathPart(labels)}` : "";

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/issues?state=${encodePathPart(state)}${labelQuery}${milestone}&per_page=100`,
    options,
  );
}

async function getIssue(issueNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    options,
  );
  return response.data;
}

async function createIssue(issue, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const body = {
    title: issue.title,
    body: issue.body || "",
  };

  if (issue.labels) body.labels = normalizeStringList(issue.labels);
  if (issue.assignees) body.assignees = normalizeStringList(issue.assignees);
  if (issue.milestone) body.milestone = issue.milestone;

  const response = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    ...options,
    method: "POST",
    body,
  });

  return response.data;
}

async function updateIssue(issueNumber, issue, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      ...options,
      method: "PATCH",
      body: issue,
    },
  );

  return response.data;
}

async function closeIssue(issueNumber, options = {}) {
  return updateIssue(
    issueNumber,
    {
      state: "closed",
      state_reason: options.state_reason || "completed",
    },
    options,
  );
}

async function addLabelsToIssue(issueNumber, labels, options = {}) {
  const normalizedLabels = normalizeStringList(labels);

  if (!normalizedLabels.length) return null;

  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      ...options,
      method: "POST",
      body: {
        labels: normalizedLabels,
      },
    },
  );

  return response.data;
}

async function setLabelsOnIssue(issueNumber, labels, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      ...options,
      method: "PUT",
      body: {
        labels: normalizeStringList(labels),
      },
    },
  );

  return response.data;
}

async function removeLabelFromIssue(issueNumber, label, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodePathPart(label)}`,
    {
      ...options,
      method: "DELETE",
    },
  );

  return response.data;
}

async function addAssigneesToIssue(issueNumber, assignees, options = {}) {
  const normalizedAssignees = normalizeStringList(assignees);

  if (!normalizedAssignees.length) return null;

  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    {
      ...options,
      method: "POST",
      body: {
        assignees: normalizedAssignees,
      },
    },
  );

  return response.data;
}

async function removeAssigneesFromIssue(issueNumber, assignees, options = {}) {
  const normalizedAssignees = normalizeStringList(assignees);

  if (!normalizedAssignees.length) return null;

  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    {
      ...options,
      method: "DELETE",
      body: {
        assignees: normalizedAssignees,
      },
    },
  );

  return response.data;
}

async function listIssueComments(issueNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    options,
  );
}

async function createIssueComment(issueNumber, body, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      ...options,
      method: "POST",
      body: {
        body,
      },
    },
  );

  return response.data;
}

async function updateIssueComment(commentId, body, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      ...options,
      method: "PATCH",
      body: {
        body,
      },
    },
  );

  return response.data;
}

function wrapMarkedBody(body, marker = "repo_management") {
  const markers =
    typeof marker === "string" ? ISSUE_PR_COMMENT_MARKERS[marker] : marker;

  if (!markers?.start || !markers?.end) {
    return body;
  }

  return `${markers.start}\n${body.trim()}\n${markers.end}`;
}

function commentContainsMarker(comment, marker = "repo_management") {
  const markers =
    typeof marker === "string" ? ISSUE_PR_COMMENT_MARKERS[marker] : marker;

  if (!markers?.start || !markers?.end) return false;

  return String(comment.body || "").includes(markers.start);
}

async function upsertIssueComment(issueNumber, body, options = {}) {
  const marker = options.marker || "repo_management";
  const markedBody = wrapMarkedBody(body, marker);
  const comments = await listIssueComments(issueNumber, options);
  const existing = comments.find((comment) =>
    commentContainsMarker(comment, marker),
  );

  if (existing) {
    return updateIssueComment(existing.id, markedBody, options);
  }

  return createIssueComment(issueNumber, markedBody, options);
}

async function listPullRequests(options = {}) {
  const { owner, repo } = parseRepository(options.repository);
  const state = normalizeString(options.state, "open");
  const base = options.base ? `&base=${encodePathPart(options.base)}` : "";
  const head = options.head ? `&head=${encodePathPart(options.head)}` : "";

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/pulls?state=${encodePathPart(state)}${base}${head}&per_page=100`,
    options,
  );
}

async function getPullRequest(pullNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    options,
  );
  return response.data;
}

async function createPullRequest(pr, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
    ...options,
    method: "POST",
    body: {
      title: pr.title,
      head: pr.head,
      base: pr.base || DEFAULT_BRANCH,
      body: pr.body || "",
      draft: Boolean(pr.draft),
      maintainer_can_modify: pr.maintainer_can_modify !== false,
    },
  });

  return response.data;
}

async function updatePullRequest(pullNumber, pr, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      ...options,
      method: "PATCH",
      body: pr,
    },
  );

  return response.data;
}

async function listPullRequestFiles(pullNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
    options,
  );
}

async function listPullRequestCommits(pullNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/commits?per_page=100`,
    options,
  );
}

async function requestPullRequestReviewers(
  pullNumber,
  reviewers = [],
  teamReviewers = [],
  options = {},
) {
  const normalizedReviewers = normalizeStringList(reviewers);
  const normalizedTeamReviewers = normalizeStringList(teamReviewers);

  if (!normalizedReviewers.length && !normalizedTeamReviewers.length)
    return null;

  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    {
      ...options,
      method: "POST",
      body: {
        reviewers: normalizedReviewers,
        team_reviewers: normalizedTeamReviewers,
      },
    },
  );

  return response.data;
}

async function removeRequestedPullRequestReviewers(
  pullNumber,
  reviewers = [],
  teamReviewers = [],
  options = {},
) {
  const normalizedReviewers = normalizeStringList(reviewers);
  const normalizedTeamReviewers = normalizeStringList(teamReviewers);

  if (!normalizedReviewers.length && !normalizedTeamReviewers.length)
    return null;

  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    {
      ...options,
      method: "DELETE",
      body: {
        reviewers: normalizedReviewers,
        team_reviewers: normalizedTeamReviewers,
      },
    },
  );

  return response.data;
}

async function mergePullRequest(pullNumber, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    {
      ...options,
      method: "PUT",
      body: {
        commit_title: options.commit_title,
        commit_message: options.commit_message,
        merge_method: options.merge_method || "merge",
      },
    },
  );

  return response.data;
}

async function listCheckRunsForRef(ref, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/commits/${encodePathPart(ref)}/check-runs?per_page=100`,
    {
      ...options,
      headers: {
        ...(options.headers || {}),
        Accept: "application/vnd.github+json",
      },
    },
  );
}

async function listCommitStatuses(ref, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/commits/${encodePathPart(ref)}/statuses?per_page=100`,
    options,
  );
}

async function getCombinedStatus(ref, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/commits/${encodePathPart(ref)}/status`,
    options,
  );

  return response.data;
}

async function compareCommits(base, head, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/compare/${encodePathPart(base)}...${encodePathPart(head)}`,
    options,
  );

  return response.data;
}

async function listWorkflowRuns(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const branch = options.branch
    ? `&branch=${encodePathPart(options.branch)}`
    : "";
  const event = options.event ? `&event=${encodePathPart(options.event)}` : "";
  const status = options.status
    ? `&status=${encodePathPart(options.status)}`
    : "";

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/actions/runs?per_page=100${branch}${event}${status}`,
    options,
  );
}

async function listWorkflowArtifacts(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  return githubPaginatedRequest(
    `/repos/${owner}/${repo}/actions/artifacts?per_page=100`,
    options,
  );
}

async function deleteWorkflowArtifact(artifactId, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/actions/artifacts/${artifactId}`,
    {
      ...options,
      method: "DELETE",
    },
  );

  return response.data;
}

async function createGitRef(ref, sha, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    ...options,
    method: "POST",
    body: {
      ref,
      sha,
    },
  });

  return response.data;
}

async function createTagRef(tagName, sha, options = {}) {
  return createGitRef(`refs/tags/${tagName}`, sha, options);
}

async function getGitRef(ref, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  try {
    const response = await githubRequest(
      `/repos/${owner}/${repo}/git/ref/${encodePathPart(ref).replaceAll("%2F", "/")}`,
      options,
    );

    return response.data;
  } catch (err) {
    if (String(err.message || "").includes("Status: 404")) return null;
    throw err;
  }
}

async function createRelease(release, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(`/repos/${owner}/${repo}/releases`, {
    ...options,
    method: "POST",
    body: {
      tag_name: release.tag_name || release.tagName,
      target_commitish:
        release.target_commitish || release.targetCommitish || DEFAULT_BRANCH,
      name: release.name || release.title,
      body: release.body || "",
      draft: Boolean(release.draft),
      prerelease: Boolean(release.prerelease),
      generate_release_notes: Boolean(release.generate_release_notes),
    },
  });

  return response.data;
}

async function getReleaseByTag(tagName, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  try {
    const response = await githubRequest(
      `/repos/${owner}/${repo}/releases/tags/${encodePathPart(tagName)}`,
      options,
    );

    return response.data;
  } catch (err) {
    if (String(err.message || "").includes("Status: 404")) return null;
    throw err;
  }
}

async function updateRelease(releaseId, release, options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const response = await githubRequest(
    `/repos/${owner}/${repo}/releases/${releaseId}`,
    {
      ...options,
      method: "PATCH",
      body: release,
    },
  );

  return response.data;
}

async function uploadReleaseAsset(uploadUrl, filePath, options = {}) {
  const dryRun = getDryRun(options);

  if (dryRun) {
    logger.dryRun(`Would upload release asset: ${filePath}`);
    return {
      dry_run: true,
      file: filePath,
    };
  }

  requireGitHubToken(options);

  const fileName = path.basename(filePath);
  const url = uploadUrl.replace(
    "{?name,label}",
    `?name=${encodeURIComponent(fileName)}`,
  );
  const buffer = fs.readFileSync(filePath);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGitHubToken(options)}`,
      Accept: DEFAULT_ACCEPT,
      "X-GitHub-Api-Version": DEFAULT_API_VERSION,
      "Content-Type":
        options.contentType ||
        options.content_type ||
        "application/octet-stream",
      "Content-Length": String(buffer.length),
    },
    body: buffer,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      `Release asset upload failed for ${filePath}: ${data?.message || response.statusText}`,
    );
  }

  return data;
}

async function listDiscussionCategories(options = {}) {
  const { owner, repo } = parseRepository(options.repository);

  const data = await githubGraphql(
    `
      query DiscussionCategories($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
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
      owner,
      repo,
    },
    options,
  );

  return data.repository.discussionCategories.nodes;
}

async function getDiscussionCategoryId(categoryName, options = {}) {
  const categories = await listDiscussionCategories(options);
  const normalized = normalizeString(categoryName).toLowerCase();

  const category = categories.find((item) => {
    return (
      item.name.toLowerCase() === normalized ||
      item.slug.toLowerCase() === normalized
    );
  });

  return category?.id || null;
}

async function createDiscussion(discussion, options = {}) {
  const repository = await getRepositoryNodeId(options);
  const categoryId =
    discussion.category_id ||
    discussion.categoryId ||
    (await getDiscussionCategoryId(
      discussion.category || "Announcements",
      options,
    ));

  if (!categoryId) {
    throw new Error(
      `Discussion category not found: ${discussion.category || "Announcements"}`,
    );
  }

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
          }
        }
      }
    `,
    {
      repositoryId: repository.id,
      categoryId,
      title: discussion.title,
      body: discussion.body || "",
    },
    {
      ...options,
      mutation: true,
    },
  );

  return data?.createDiscussion?.discussion || null;
}

async function searchIssuesAndPullRequests(query, options = {}) {
  const data = await githubGraphql(
    `
      query SearchIssuesAndPullRequests($query: String!, $first: Int!) {
        search(query: $query, type: ISSUE, first: $first) {
          issueCount
          nodes {
            ... on Issue {
              __typename
              id
              number
              title
              url
              state
              closed
              labels(first: 50) {
                nodes {
                  name
                }
              }
            }
            ... on PullRequest {
              __typename
              id
              number
              title
              url
              state
              merged
              closed
              labels(first: 50) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    `,
    {
      query,
      first: Number(options.first || 50),
    },
    options,
  );

  return data.search.nodes;
}

function buildIssueSearchQuery(parts = {}, options = {}) {
  const repository = normalizeRepoSlug(
    options.repository || process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
  );
  const query = [`repo:${repository}`];

  if (parts.type) query.push(`type:${parts.type}`);
  if (parts.state) query.push(`state:${parts.state}`);
  if (parts.label) query.push(`label:"${parts.label}"`);
  if (parts.milestone) query.push(`milestone:"${parts.milestone}"`);
  if (parts.author) query.push(`author:${parts.author}`);
  if (parts.text) query.push(parts.text);

  return query.join(" ");
}

async function addIssueToProjectV2(projectId, contentId, options = {}) {
  const data = await githubGraphql(
    `
      mutation AddProjectV2Item($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId,
          contentId: $contentId
        }) {
          item {
            id
          }
        }
      }
    `,
    {
      projectId,
      contentId,
    },
    {
      ...options,
      mutation: true,
    },
  );

  return data?.addProjectV2ItemById?.item || null;
}

async function getOrganizationProjectV2(owner, projectNumber, options = {}) {
  const data = await githubGraphql(
    `
      query OrganizationProject($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            title
            url
          }
        }
      }
    `,
    {
      owner,
      number: Number(projectNumber),
    },
    options,
  );

  return data.organization?.projectV2 || null;
}

async function getUserProjectV2(owner, projectNumber, options = {}) {
  const data = await githubGraphql(
    `
      query UserProject($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            title
            url
          }
        }
      }
    `,
    {
      owner,
      number: Number(projectNumber),
    },
    options,
  );

  return data.user?.projectV2 || null;
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

function appendGitHubStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    logger.debug(
      "GITHUB_STEP_SUMMARY is not set. Skipping GitHub summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function createApiSummary(result) {
  return [
    "## GitHub API",
    "",
    `- Method: \`${result.method || "unknown"}\``,
    `- Endpoint: \`${result.endpoint || "unknown"}\``,
    `- Status: \`${result.status ?? "unknown"}\``,
    `- Dry-run: \`${result.dry_run ? "true" : "false"}\``,
    `- Skipped: \`${result.skipped ? "true" : "false"}\``,
  ].join("\n");
}

function createIssueRelationshipBody(input = {}) {
  const lines = ["## Linked Work", ""];

  if (input.pull_requests?.length) {
    lines.push("### Pull Requests");
    for (const pr of input.pull_requests) {
      lines.push(`- #${pr.number} — ${pr.title || pr.html_url || ""}`.trim());
    }
    lines.push("");
  }

  if (input.issues?.length) {
    lines.push("### Issues");
    for (const issue of input.issues) {
      lines.push(
        `- #${issue.number} — ${issue.title || issue.html_url || ""}`.trim(),
      );
    }
    lines.push("");
  }

  if (input.notes) {
    lines.push("### Notes");
    lines.push(input.notes);
  }

  return lines.join("\n").trim();
}

function extractIssueNumbersFromText(text) {
  const numbers = new Set();
  const source = normalizeString(text);

  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|link(?:e[sd])?|related(?:\s+to)?|refs?|see)\s+#(\d+)/gi,
    /#(\d+)/g,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].sort((a, b) => a - b);
}

function getReleaseLabels(labels = []) {
  return normalizeStringList(labels).filter((label) =>
    ["release:major", "release:minor", "release:patch"].includes(label),
  );
}

function hasNoReleaseLabel(labels = []) {
  return normalizeStringList(labels).includes("no-release");
}

function isDependencyLabelSet(labels = []) {
  const normalized = normalizeStringList(labels);

  return (
    normalized.includes("dependencies") ||
    normalized.includes("security:dependency") ||
    normalized.includes("kind:dependencies")
  );
}

function classifyReleaseIntent(labels = []) {
  const releaseLabels = getReleaseLabels(labels);

  if (hasNoReleaseLabel(labels)) {
    return {
      should_release: false,
      bump: null,
      reason: "no-release label is present",
      release_labels: releaseLabels,
    };
  }

  if (isDependencyLabelSet(labels)) {
    return {
      should_release: false,
      bump: null,
      reason: "dependency labels are present",
      release_labels: releaseLabels,
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
    };
  }

  const label = releaseLabels[0];

  return {
    should_release: true,
    bump: label.replace("release:", ""),
    reason: "exactly one release label is present",
    release_labels: releaseLabels,
  };
}

async function runCli() {
  const command = process.argv[2] || "context";
  const context = getGitHubContext();

  if (command === "context") {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  if (command === "repo") {
    const repo = await getRepository();
    console.log(JSON.stringify(repo, null, 2));
    return;
  }

  if (command === "labels") {
    const labels = await listLabels();
    console.log(JSON.stringify(labels, null, 2));
    return;
  }

  if (command === "milestones") {
    const milestones = await listMilestones({
      state: process.argv[3] || "all",
    });
    console.log(JSON.stringify(milestones, null, 2));
    return;
  }

  if (command === "pr") {
    const pullNumber = Number(
      process.argv[3] || getPullRequestPayload().number,
    );

    if (!pullNumber) {
      throw new Error("Pull request number is required.");
    }

    const pr = await getPullRequest(pullNumber);
    console.log(JSON.stringify(pr, null, 2));
    return;
  }

  throw new Error(`Unknown GitHub utility command: ${command}`);
}

if (require.main === module) {
  runCli().catch((err) => {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_API_URL,
  DEFAULT_GRAPHQL_URL,
  DEFAULT_WEB_URL,
  DEFAULT_ACCEPT,
  DEFAULT_API_VERSION,
  DEFAULT_REPOSITORY,
  DEFAULT_BRANCH,
  MUTATING_METHODS,
  ISSUE_PR_COMMENT_MARKERS,

  isPlainObject,
  unique,
  normalizeBoolean,
  normalizeString,
  normalizeStringList,
  normalizeBranchName,
  normalizeTagName,
  normalizeRepoSlug,
  parseRepository,
  encodePathPart,

  getDryRun,
  getWriteMode,
  getGitHubToken,
  requireGitHubToken,
  getGitHubApiUrl,
  getGitHubGraphqlUrl,
  getGitHubWebUrl,
  getGitHubContext,
  readGitHubEventPayload,
  getPullRequestPayload,
  getIssuePayload,

  buildHeaders,
  buildUrl,
  parseLinkHeader,
  parseResponse,
  describeRequest,
  githubRequest,
  githubPaginatedRequest,
  githubGraphql,

  getRepository,
  getRepositoryNodeId,

  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,

  listMilestones,
  getMilestoneByTitle,
  createMilestone,
  updateMilestone,

  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,

  addLabelsToIssue,
  setLabelsOnIssue,
  removeLabelFromIssue,
  addAssigneesToIssue,
  removeAssigneesFromIssue,

  listIssueComments,
  createIssueComment,
  updateIssueComment,
  wrapMarkedBody,
  commentContainsMarker,
  upsertIssueComment,

  listPullRequests,
  getPullRequest,
  createPullRequest,
  updatePullRequest,
  listPullRequestFiles,
  listPullRequestCommits,
  requestPullRequestReviewers,
  removeRequestedPullRequestReviewers,
  mergePullRequest,

  listCheckRunsForRef,
  listCommitStatuses,
  getCombinedStatus,
  compareCommits,
  listWorkflowRuns,
  listWorkflowArtifacts,
  deleteWorkflowArtifact,

  createGitRef,
  createTagRef,
  getGitRef,

  createRelease,
  getReleaseByTag,
  updateRelease,
  uploadReleaseAsset,

  listDiscussionCategories,
  getDiscussionCategoryId,
  createDiscussion,

  searchIssuesAndPullRequests,
  buildIssueSearchQuery,
  addIssueToProjectV2,
  getOrganizationProjectV2,
  getUserProjectV2,

  setGitHubOutput,
  appendGitHubStepSummary,
  createApiSummary,
  createIssueRelationshipBody,

  extractIssueNumbersFromText,
  getReleaseLabels,
  hasNoReleaseLabel,
  isDependencyLabelSet,
  classifyReleaseIntent,
};
