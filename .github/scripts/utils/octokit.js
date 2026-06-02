// .github/scripts/utils/octokit.js
// =============================================================================
// Aerealith AI Octokit Utilities
// -----------------------------------------------------------------------------
// Purpose:
//   Shared Octokit-style GitHub API helpers for automation scripts.
//
// Used by:
//   - repo management scripts
//   - project board sync scripts
//   - label and milestone sync scripts
//   - reviewer / assignee automation
//   - issue / PR relationship automation
//   - release and discussion automation
//
// Notes:
//   - CommonJS module.
//   - Uses `@octokit/graphql` when available.
//   - Falls back to native `fetch` for GraphQL if needed.
//   - Uses native `fetch` for REST calls.
//   - Supports dry-run mode for mutating REST and GraphQL operations.
//   - Does not expose token values in logs.
// =============================================================================

const fs = require("node:fs");

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

const REST_MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const GRAPHQL_MUTATION_PATTERN = /^\s*mutation\b/i;

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

function normalizeRepository(
  repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
) {
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
    name: repo,
    full_name: `${owner}/${repo}`,
    slug: `${owner}/${repo}`,
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

function getApiUrl(options = {}) {
  return normalizeString(
    options.apiUrl || options.api_url || process.env.GITHUB_API_URL,
    DEFAULT_API_URL,
  );
}

function getGraphqlUrl(options = {}) {
  return normalizeString(
    options.graphqlUrl || options.graphql_url || process.env.GITHUB_GRAPHQL_URL,
    DEFAULT_GRAPHQL_URL,
  );
}

function getWebUrl(options = {}) {
  return normalizeString(
    options.webUrl || options.web_url || process.env.GITHUB_SERVER_URL,
    DEFAULT_WEB_URL,
  );
}

function getGitHubContext(options = {}) {
  const repository = normalizeRepository(
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
    api_url: getApiUrl(options),
    graphql_url: getGraphqlUrl(options),
    web_url: getWebUrl(options),

    repository: repository.full_name,
    owner: repository.owner,
    repo: repository.repo,

    default_branch: normalizeString(
      options.defaultBranch || options.default_branch,
      DEFAULT_BRANCH,
    ),

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

function getPullRequestContext(options = {}) {
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

function getIssueContext(options = {}) {
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

function createHeaders(options = {}) {
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

  if (options.json !== false) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildRestUrl(endpoint, options = {}) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const apiUrl = getApiUrl(options).replace(/\/$/, "");
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
        const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
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

function isRestMutation(method) {
  return REST_MUTATING_METHODS.has(
    normalizeString(method, "GET").toUpperCase(),
  );
}

function isGraphqlMutation(query) {
  return GRAPHQL_MUTATION_PATTERN.test(String(query || ""));
}

function assertWriteAllowed(options = {}, operation = {}) {
  const dryRun = getDryRun(options);

  if (dryRun) {
    return false;
  }

  if (
    options.requireWriteMode === false ||
    options.require_write_mode === false
  ) {
    return true;
  }

  const writeMode = getWriteMode(options);

  if (!writeMode) {
    throw new Error(
      [
        "Write mode is disabled.",
        `Operation: ${operation.name || operation.operation || "unknown"}`,
        "Set WRITE_MODE=true or PROJECT_SYNC_WRITE_MODE=true for mutating automation.",
      ].join("\n"),
    );
  }

  return true;
}

async function restRequest(endpoint, options = {}) {
  const method = normalizeString(options.method, "GET").toUpperCase();
  const dryRun = getDryRun(options);
  const mutation = isRestMutation(method);

  if (mutation && dryRun) {
    logger.dryRun(`Would call GitHub REST API: ${method} ${endpoint}`);
    logger.dump("rest request body", options.body || null);

    return {
      dry_run: true,
      skipped: true,
      method,
      endpoint,
      status: 0,
      headers: null,
      data: options.dryRunResponse ?? options.dry_run_response ?? null,
    };
  }

  if (mutation) {
    assertWriteAllowed(options, {
      name: `${method} ${endpoint}`,
    });
  }

  if (options.requireToken !== false && options.require_token !== false) {
    requireGitHubToken(options);
  }

  const requestOptions = {
    method,
    headers: createHeaders(options),
  };

  if (options.body !== undefined && options.body !== null) {
    requestOptions.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  const url = buildRestUrl(endpoint, options);

  logger.debug(`GitHub REST API request: ${method} ${endpoint}`);

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
        `GitHub REST API request failed: ${method} ${endpoint}`,
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

async function restPaginatedRequest(endpoint, options = {}) {
  const results = [];
  const maxPages = normalizeInteger(options.maxPages || options.max_pages, 100);
  let nextUrl = endpoint;
  let page = 0;

  while (nextUrl && page < maxPages) {
    page += 1;

    const response = await restRequest(nextUrl, {
      ...options,
      method: options.method || "GET",
    });

    if (response.dry_run) {
      return response.data || [];
    }

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

let cachedGraphqlFactory = null;

async function loadGraphqlFactory() {
  if (cachedGraphqlFactory) return cachedGraphqlFactory;

  try {
    const imported = await import("@octokit/graphql");
    cachedGraphqlFactory =
      imported.graphql || imported.default?.graphql || imported.default;
    return cachedGraphqlFactory;
  } catch (err) {
    logger.debug(
      `@octokit/graphql unavailable, using fetch fallback: ${logger.formatError(err)}`,
    );
    cachedGraphqlFactory = null;
    return null;
  }
}

async function createGraphqlClient(options = {}) {
  const token = requireGitHubToken(options);
  const graphqlFactory = await loadGraphqlFactory();

  if (graphqlFactory?.defaults) {
    return graphqlFactory.defaults({
      baseUrl: getGraphqlUrl(options),
      headers: createHeaders({
        ...options,
        token,
      }),
    });
  }

  return async function graphqlFetchFallback(query, variables = {}) {
    const response = await fetch(getGraphqlUrl(options), {
      method: "POST",
      headers: createHeaders({
        ...options,
        token,
      }),
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    const data = await parseResponse(response);

    if (!response.ok || data?.errors?.length) {
      const message =
        data?.errors?.map((error) => error.message).join("; ") ||
        data?.message ||
        response.statusText;

      throw new Error(`GitHub GraphQL request failed: ${message}`);
    }

    return data.data;
  };
}

async function graphqlRequest(query, variables = {}, options = {}) {
  const dryRun = getDryRun(options);
  const mutation = options.mutation ?? isGraphqlMutation(query);

  if (mutation && dryRun) {
    logger.dryRun("Would call GitHub GraphQL mutation.");
    logger.dump("graphql variables", variables);

    return options.dryRunResponse ?? options.dry_run_response ?? null;
  }

  if (mutation) {
    assertWriteAllowed(options, {
      name: "GitHub GraphQL mutation",
    });
  }

  const client = await createGraphqlClient(options);

  logger.debug(`GitHub GraphQL request: ${mutation ? "mutation" : "query"}`);

  return client(query, variables);
}

async function graphqlConnectionRequest(
  query,
  variables = {},
  pathSelector,
  options = {},
) {
  const nodes = [];
  const maxPages = normalizeInteger(options.maxPages || options.max_pages, 100);
  let cursor = variables.after || null;
  let page = 0;
  let hasNextPage = true;

  while (hasNextPage && page < maxPages) {
    page += 1;

    const data = await graphqlRequest(
      query,
      {
        ...variables,
        after: cursor,
      },
      options,
    );

    const connection =
      typeof pathSelector === "function"
        ? pathSelector(data)
        : String(pathSelector)
            .split(".")
            .filter(Boolean)
            .reduce((current, part) => current?.[part], data);

    if (!connection) {
      break;
    }

    if (Array.isArray(connection.nodes)) {
      nodes.push(...connection.nodes.filter(Boolean));
    }

    if (Array.isArray(connection.edges)) {
      nodes.push(...connection.edges.map((edge) => edge.node).filter(Boolean));
    }

    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;
  }

  return nodes;
}

async function viewer(options = {}) {
  const data = await graphqlRequest(
    `
      query Viewer {
        viewer {
          id
          login
          name
          url
        }
      }
    `,
    {},
    options,
  );

  return data.viewer;
}

async function repository(options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const data = await graphqlRequest(
    `
      query Repository($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          databaseId
          name
          nameWithOwner
          url
          isPrivate
          defaultBranchRef {
            name
            target {
              oid
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

  return data.repository;
}

async function repositoryId(options = {}) {
  const repo = await repository(options);
  return repo.id;
}

async function listLabels(options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  return restPaginatedRequest(
    `/repos/${owner}/${repo}/labels?per_page=100`,
    options,
  );
}

async function getLabel(name, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  try {
    const response = await restRequest(
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
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(`/repos/${owner}/${repo}/labels`, {
    ...options,
    method: "POST",
    body: {
      name: label.name,
      color: normalizeString(label.color).replace(/^#/, ""),
      description: normalizeString(label.description),
    },
  });

  return response.data;
}

async function updateLabel(currentName, label, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/labels/${encodePathPart(currentName)}`,
    {
      ...options,
      method: "PATCH",
      body: {
        new_name: label.name || currentName,
        color: normalizeString(label.color).replace(/^#/, ""),
        description: normalizeString(label.description),
      },
    },
  );

  return response.data;
}

async function deleteLabel(name, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/labels/${encodePathPart(name)}`,
    {
      ...options,
      method: "DELETE",
    },
  );

  return response.data;
}

async function listMilestones(options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);
  const state = normalizeString(options.state, "all");

  return restPaginatedRequest(
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
  const { owner, repo } = normalizeRepository(options.repository);

  const body = {
    title: milestone.title,
    state: milestone.state || "open",
    description: milestone.description || "",
  };

  if (milestone.due_on) {
    body.due_on = milestone.due_on;
  }

  const response = await restRequest(`/repos/${owner}/${repo}/milestones`, {
    ...options,
    method: "POST",
    body,
  });

  return response.data;
}

async function updateMilestone(number, milestone, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const body = {
    title: milestone.title,
    state: milestone.state || "open",
    description: milestone.description || "",
  };

  if (milestone.due_on !== undefined) {
    body.due_on = milestone.due_on;
  }

  const response = await restRequest(
    `/repos/${owner}/${repo}/milestones/${number}`,
    {
      ...options,
      method: "PATCH",
      body,
    },
  );

  return response.data;
}

async function getIssue(issueNumber, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    options,
  );
  return response.data;
}

async function createIssue(issue, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const body = {
    title: issue.title,
    body: issue.body || "",
  };

  if (issue.labels) body.labels = normalizeStringList(issue.labels);
  if (issue.assignees) body.assignees = normalizeStringList(issue.assignees);
  if (issue.milestone) body.milestone = issue.milestone;

  const response = await restRequest(`/repos/${owner}/${repo}/issues`, {
    ...options,
    method: "POST",
    body,
  });

  return response.data;
}

async function updateIssue(issueNumber, issue, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      ...options,
      method: "PATCH",
      body: issue,
    },
  );

  return response.data;
}

async function addLabelsToIssue(issueNumber, labels, options = {}) {
  const normalizedLabels = normalizeStringList(labels);

  if (!normalizedLabels.length) return null;

  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

async function addAssigneesToIssue(issueNumber, assignees, options = {}) {
  const normalizedAssignees = normalizeStringList(assignees);

  if (!normalizedAssignees.length) return null;

  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

async function createIssueComment(issueNumber, body, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

async function listIssueComments(issueNumber, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  return restPaginatedRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    options,
  );
}

async function updateIssueComment(commentId, body, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

function createMarkedComment(body, markerName = "aerealith-automation") {
  const marker = normalizeString(markerName, "aerealith-automation");

  return [
    `<!-- ${marker}:start -->`,
    String(body || "").trim(),
    `<!-- ${marker}:end -->`,
  ].join("\n");
}

function commentHasMarker(comment, markerName = "aerealith-automation") {
  const marker = normalizeString(markerName, "aerealith-automation");
  return String(comment.body || "").includes(`<!-- ${marker}:start -->`);
}

async function upsertIssueComment(issueNumber, body, options = {}) {
  const marker = options.marker || "aerealith-automation";
  const markedBody = createMarkedComment(body, marker);
  const comments = await listIssueComments(issueNumber, options);
  const existing = comments.find((comment) =>
    commentHasMarker(comment, marker),
  );

  if (existing) {
    return updateIssueComment(existing.id, markedBody, options);
  }

  return createIssueComment(issueNumber, markedBody, options);
}

async function getPullRequest(pullNumber, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    options,
  );
  return response.data;
}

async function listPullRequestFiles(pullNumber, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  return restPaginatedRequest(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
    options,
  );
}

async function listPullRequestCommits(pullNumber, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  return restPaginatedRequest(
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

  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

async function listCheckRunsForRef(ref, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/commits/${encodePathPart(ref)}/check-runs?per_page=100`,
    {
      ...options,
      headers: {
        ...(options.headers || {}),
        Accept: "application/vnd.github+json",
      },
    },
  );

  return response.data?.check_runs || [];
}

async function getCombinedStatus(ref, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/commits/${encodePathPart(ref)}/status`,
    options,
  );

  return response.data;
}

async function compareCommits(base, head, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
    `/repos/${owner}/${repo}/compare/${encodePathPart(base)}...${encodePathPart(head)}`,
    options,
  );

  return response.data;
}

async function createGitRef(ref, sha, options = {}) {
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(`/repos/${owner}/${repo}/git/refs`, {
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
  const { owner, repo } = normalizeRepository(options.repository);

  try {
    const response = await restRequest(
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
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(`/repos/${owner}/${repo}/releases`, {
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
  const { owner, repo } = normalizeRepository(options.repository);

  try {
    const response = await restRequest(
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
  const { owner, repo } = normalizeRepository(options.repository);

  const response = await restRequest(
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

  assertWriteAllowed(options, {
    name: "upload release asset",
  });

  const token = requireGitHubToken(options);
  const fileName = require("node:path").basename(filePath);
  const url = uploadUrl.replace(
    "{?name,label}",
    `?name=${encodeURIComponent(fileName)}`,
  );
  const buffer = fs.readFileSync(filePath);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
  const { owner, repo } = normalizeRepository(options.repository);

  const data = await graphqlRequest(
    `
      query DiscussionCategories($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
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
  const repo = await repository(options);

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

  const data = await graphqlRequest(
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
      repositoryId: repo.id,
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
  const data = await graphqlRequest(
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
      first: normalizeInteger(options.first, 50),
    },
    options,
  );

  return data.search.nodes;
}

function buildSearchQuery(parts = {}, options = {}) {
  const repo = normalizeRepository(
    options.repository || process.env.GITHUB_REPOSITORY,
  );

  const query = [`repo:${repo.full_name}`];

  if (parts.type) query.push(`type:${parts.type}`);
  if (parts.state) query.push(`state:${parts.state}`);
  if (parts.label) query.push(`label:"${parts.label}"`);
  if (parts.milestone) query.push(`milestone:"${parts.milestone}"`);
  if (parts.author) query.push(`author:${parts.author}`);
  if (parts.text) query.push(parts.text);

  return query.join(" ");
}

async function getOrganizationProjectV2(owner, projectNumber, options = {}) {
  const data = await graphqlRequest(
    `
      query OrganizationProjectV2($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            title
            url
            number
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
  const data = await graphqlRequest(
    `
      query UserProjectV2($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            title
            url
            number
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

async function getProjectV2(owner, projectNumber, options = {}) {
  try {
    const organizationProject = await getOrganizationProjectV2(
      owner,
      projectNumber,
      options,
    );

    if (organizationProject) return organizationProject;
  } catch (err) {
    logger.debug(
      `Organization project lookup failed: ${logger.formatError(err)}`,
    );
  }

  return getUserProjectV2(owner, projectNumber, options);
}

async function addProjectV2Item(projectId, contentId, options = {}) {
  const data = await graphqlRequest(
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

async function listProjectV2Fields(projectId, options = {}) {
  return graphqlConnectionRequest(
    `
      query ProjectV2Fields($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 100, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                    color
                  }
                }
                ... on ProjectV2IterationField {
                  id
                  name
                  dataType
                  configuration {
                    iterations {
                      id
                      title
                      startDate
                      duration
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      projectId,
    },
    (data) => data.node.fields,
    options,
  );
}

async function updateProjectV2ItemFieldValue(input, options = {}) {
  const data = await graphqlRequest(
    `
      mutation UpdateProjectV2ItemFieldValue(
        $projectId: ID!,
        $itemId: ID!,
        $fieldId: ID!,
        $value: ProjectV2FieldValue!
      ) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      projectId: input.projectId || input.project_id,
      itemId: input.itemId || input.item_id,
      fieldId: input.fieldId || input.field_id,
      value: input.value,
    },
    {
      ...options,
      mutation: true,
    },
  );

  return data?.updateProjectV2ItemFieldValue?.projectV2Item || null;
}

async function getNode(nodeId, options = {}) {
  const data = await graphqlRequest(
    `
      query Node($id: ID!) {
        node(id: $id) {
          id
          __typename
          ... on Issue {
            number
            title
            url
          }
          ... on PullRequest {
            number
            title
            url
            merged
          }
          ... on ProjectV2 {
            title
            url
          }
        }
      }
    `,
    {
      id: nodeId,
    },
    options,
  );

  return data.node;
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
      "GITHUB_STEP_SUMMARY is not set. Skipping Octokit summary append.",
    );
    return false;
  }

  fs.appendFileSync(summaryFile, `${String(markdown).trim()}\n\n`);

  return true;
}

function createRequestSummary(result) {
  return [
    "## GitHub API Request",
    "",
    `- Method: \`${result.method || "GraphQL"}\``,
    `- Endpoint: \`${result.endpoint || "graphql"}\``,
    `- Status: \`${result.status ?? "unknown"}\``,
    `- Dry-run: \`${result.dry_run ? "true" : "false"}\``,
    `- Skipped: \`${result.skipped ? "true" : "false"}\``,
  ].join("\n");
}

function createOctokit(options = {}) {
  const context = getGitHubContext(options);

  return {
    context,

    request: (endpoint, requestOptions = {}) =>
      restRequest(endpoint, {
        ...options,
        ...requestOptions,
      }),

    paginate: (endpoint, requestOptions = {}) =>
      restPaginatedRequest(endpoint, {
        ...options,
        ...requestOptions,
      }),

    graphql: (query, variables = {}, requestOptions = {}) =>
      graphqlRequest(query, variables, {
        ...options,
        ...requestOptions,
      }),

    graphqlConnection: (query, variables = {}, selector, requestOptions = {}) =>
      graphqlConnectionRequest(query, variables, selector, {
        ...options,
        ...requestOptions,
      }),

    repo: () => repository(options),
    viewer: () => viewer(options),
  };
}

async function runCli() {
  const command = process.argv[2] || "context";

  if (command === "context") {
    console.log(JSON.stringify(getGitHubContext(), null, 2));
    return;
  }

  if (command === "viewer") {
    console.log(JSON.stringify(await viewer(), null, 2));
    return;
  }

  if (command === "repo") {
    console.log(JSON.stringify(await repository(), null, 2));
    return;
  }

  if (command === "labels") {
    console.log(JSON.stringify(await listLabels(), null, 2));
    return;
  }

  if (command === "milestones") {
    console.log(
      JSON.stringify(
        await listMilestones({ state: process.argv[3] || "all" }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "discussion-categories") {
    console.log(JSON.stringify(await listDiscussionCategories(), null, 2));
    return;
  }

  throw new Error(`Unknown Octokit utility command: ${command}`);
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

  TRUE_VALUES,
  FALSE_VALUES,
  REST_MUTATING_METHODS,
  GRAPHQL_MUTATION_PATTERN,

  unique,
  isPlainObject,

  normalizeString,
  normalizeStringList,
  normalizeBoolean,
  normalizeInteger,
  normalizeBranchName,
  normalizeTagName,
  normalizeRepository,
  encodePathPart,

  getDryRun,
  getWriteMode,
  getGitHubToken,
  requireGitHubToken,
  getApiUrl,
  getGraphqlUrl,
  getWebUrl,
  getGitHubContext,
  readGitHubEventPayload,
  getPullRequestContext,
  getIssueContext,

  createHeaders,
  buildRestUrl,
  parseLinkHeader,
  parseResponse,
  isRestMutation,
  isGraphqlMutation,
  assertWriteAllowed,

  restRequest,
  restPaginatedRequest,

  loadGraphqlFactory,
  createGraphqlClient,
  graphqlRequest,
  graphqlConnectionRequest,

  viewer,
  repository,
  repositoryId,

  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,

  listMilestones,
  getMilestoneByTitle,
  createMilestone,
  updateMilestone,

  getIssue,
  createIssue,
  updateIssue,
  addLabelsToIssue,
  setLabelsOnIssue,
  addAssigneesToIssue,
  createIssueComment,
  listIssueComments,
  updateIssueComment,
  createMarkedComment,
  commentHasMarker,
  upsertIssueComment,

  getPullRequest,
  listPullRequestFiles,
  listPullRequestCommits,
  requestPullRequestReviewers,

  listCheckRunsForRef,
  getCombinedStatus,
  compareCommits,

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
  buildSearchQuery,

  getOrganizationProjectV2,
  getUserProjectV2,
  getProjectV2,
  addProjectV2Item,
  listProjectV2Fields,
  updateProjectV2ItemFieldValue,
  getNode,

  setGitHubOutput,
  appendGitHubStepSummary,
  createRequestSummary,

  createOctokit,
};
