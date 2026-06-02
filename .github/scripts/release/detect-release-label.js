#!/usr/bin/env node
// .github/scripts/release/detect-release-label.js
// =============================================================================
// Aerealith AI — Release Label Detector
// -----------------------------------------------------------------------------
// Purpose:
//   Detect release intent from GitHub labels on pull requests, issues, workflow
//   dispatch inputs, or direct CLI/env inputs.
//
// Input:
//   - GitHub event payload
//   - Pull request / issue labels
//   - Workflow dispatch inputs
//   - Direct --label values
//   - .github/release/detect-release-label.json
//   - .github/release/detect-release-label.jsonc
//   - .github/release/detect-release-label.yaml
//   - .github/release/detect-release-label.yml
//
// Output:
//   - artifacts/release/detect-release-label.json
//   - artifacts/release/detect-release-label.md
//   - GitHub step outputs for downstream release jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Safe for pull requests.
//   - Does not mutate GitHub.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[release-label] ${message}`),
    warn: (message) => console.warn(`[release-label] WARN: ${message}`),
    error: (message) => console.error(`[release-label] ERROR: ${message}`),
    debug: () => {},
    dump: () => {},
    formatError: (err) => {
      if (!err) return "unknown error";
      if (typeof err === "string") return err;
      return err.message || String(err);
    },
  };
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const DEFAULT_CONFIG_CANDIDATES = [
  ".github/release/detect-release-label.json",
  ".github/release/detect-release-label.jsonc",
  ".github/release/detect-release-label.yaml",
  ".github/release/detect-release-label.yml",
  ".github/release/release-labels.json",
  ".github/release/release-labels.jsonc",
  ".github/release/release-labels.yaml",
  ".github/release/release-labels.yml",
  "release/detect-release-label.json",
  "release/detect-release-label.jsonc",
  "release/detect-release-label.yaml",
  "release/detect-release-label.yml",
  "release/release-labels.json",
  "release/release-labels.jsonc",
  "release/release-labels.yaml",
  "release/release-labels.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/release/detect-release-label.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/detect-release-label.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

const DEFAULT_LABEL_RULES = {
  skip: [
    "no-release",
    "skip-release",
    "release:none",
    "release: none",
    "release:skip",
    "release: skip",
    "semver:none",
    "semver: none",
    "semver:skip",
    "semver: skip",
    "version:none",
    "version: none",
    "changelog:skip",
    "changelog: skip",
    "skip changelog",
  ],
  major: [
    "release:major",
    "release: major",
    "semver:major",
    "semver: major",
    "version:major",
    "version: major",
    "breaking-change",
    "breaking change",
    "breaking",
    "major",
  ],
  minor: [
    "release:minor",
    "release: minor",
    "semver:minor",
    "semver: minor",
    "version:minor",
    "version: minor",
    "feature",
    "feature-release",
    "minor",
  ],
  patch: [
    "release:patch",
    "release: patch",
    "semver:patch",
    "semver: patch",
    "version:patch",
    "version: patch",
    "bug",
    "bugfix",
    "fix",
    "hotfix",
    "patch",
  ],
  prerelease: [
    "release:prerelease",
    "release: prerelease",
    "semver:prerelease",
    "semver: prerelease",
    "version:prerelease",
    "version: prerelease",
    "pre-release",
    "prerelease",
  ],
  alpha: [
    "release:alpha",
    "release: alpha",
    "semver:alpha",
    "semver: alpha",
    "alpha",
  ],
  beta: [
    "release:beta",
    "release: beta",
    "semver:beta",
    "semver: beta",
    "beta",
  ],
  rc: [
    "release:rc",
    "release: rc",
    "release:candidate",
    "release: candidate",
    "semver:rc",
    "semver: rc",
    "release-candidate",
    "rc",
  ],
  stable: ["release:stable", "release: stable", "stable", "latest"],
};

const RELEASE_PRIORITY = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.DETECT_RELEASE_LABEL_TOKEN ||
      process.env.RELEASE_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.DETECT_RELEASE_LABEL_CONFIG_FILE || "",
    event_path:
      process.env.DETECT_RELEASE_LABEL_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.DETECT_RELEASE_LABEL_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.DETECT_RELEASE_LABEL_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    labels: normalizeStringList(
      process.env.DETECT_RELEASE_LABELS ||
        process.env.RELEASE_LABELS ||
        process.env.PR_LABELS ||
        process.env.ISSUE_LABELS,
    ),

    default_release_type:
      process.env.DETECT_RELEASE_LABEL_DEFAULT_TYPE ||
      process.env.RELEASE_DEFAULT_TYPE ||
      "none",
    default_channel:
      process.env.DETECT_RELEASE_LABEL_DEFAULT_CHANNEL ||
      process.env.RELEASE_DEFAULT_CHANNEL ||
      "stable",

    pull_request_number:
      process.env.DETECT_RELEASE_LABEL_PR_NUMBER || process.env.PR_NUMBER || "",
    issue_number:
      process.env.DETECT_RELEASE_LABEL_ISSUE_NUMBER ||
      process.env.ISSUE_NUMBER ||
      "",

    fetch_labels: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_FETCH_LABELS,
      true,
    ),
    require_release_label: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_REQUIRE_RELEASE_LABEL,
      false,
    ),
    fail_if_no_release_label: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_FAIL_IF_NO_RELEASE_LABEL,
      false,
    ),
    fail_on_conflict: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_FAIL_ON_CONFLICT,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_FAIL_ON_ERROR,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.DETECT_RELEASE_LABEL_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.DETECT_RELEASE_LABEL_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.DETECT_RELEASE_LABEL_STEP_SUMMARY,
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

    if (arg === "--api-url") {
      args.api_url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--token") {
      args.token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      args.config_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--event-path") {
      args.event_path = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--label" || arg === "--labels") {
      args.labels.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--default-type") {
      args.default_release_type = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--default-channel") {
      args.default_channel = argv[index + 1];
      index += 1;
      continue;
    }

    if (
      arg === "--pr" ||
      arg === "--pull-request" ||
      arg === "--pull-request-number"
    ) {
      args.pull_request_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--issue" || arg === "--issue-number") {
      args.issue_number = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fetch-labels") {
      args.fetch_labels = true;
      continue;
    }

    if (arg === "--no-fetch-labels") {
      args.fetch_labels = false;
      continue;
    }

    if (arg === "--require-release-label") {
      args.require_release_label = true;
      continue;
    }

    if (arg === "--no-require-release-label") {
      args.require_release_label = false;
      continue;
    }

    if (arg === "--fail-if-no-release-label") {
      args.fail_if_no_release_label = true;
      continue;
    }

    if (arg === "--fail-on-conflict") {
      args.fail_on_conflict = true;
      continue;
    }

    if (arg === "--no-fail-on-conflict") {
      args.fail_on_conflict = false;
      continue;
    }

    if (arg === "--fail-on-error") {
      args.fail_on_error = true;
      continue;
    }

    if (arg === "--no-fail-on-error") {
      args.fail_on_error = false;
      continue;
    }

    if (arg === "--timeout-seconds") {
      args.timeout_seconds = normalizeInteger(
        argv[index + 1],
        args.timeout_seconds,
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      args.summary_file = argv[index + 1];
      args.write_summary_file = true;
      index += 1;
      continue;
    }

    if (arg === "--no-summary") {
      args.write_summary_file = false;
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

    if (arg === "--no-step-summary") {
      args.write_step_summary = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  args.repository = normalizeString(args.repository, DEFAULT_REPOSITORY);
  args.api_url = normalizeString(
    args.api_url,
    "https://api.github.com",
  ).replace(/\/+$/g, "");
  args.labels = [...new Set(args.labels)];
  args.default_release_type = normalizeReleaseType(args.default_release_type);
  args.default_channel = normalizeChannel(args.default_channel);
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Label Detector

Usage:
  node .github/scripts/release/detect-release-label.js [options]

Examples:
  node .github/scripts/release/detect-release-label.js
  node .github/scripts/release/detect-release-label.js --label release:minor
  node .github/scripts/release/detect-release-label.js --labels "release:patch,release:beta"
  node .github/scripts/release/detect-release-label.js --pr 123 --fetch-labels
  node .github/scripts/release/detect-release-label.js --require-release-label --fail-if-no-release-label

Options:
      --repo <owner/repo>               Repository slug.
      --api-url <url>                   GitHub API URL.
      --token <token>                   GitHub token.
      --config <file>                   Release label config file.
      --event-path <file>               GitHub event payload path.
      --label <label,list>              Direct label(s) to evaluate.
      --default-type <none|patch|minor|major>
      --default-channel <stable|alpha|beta|rc>
      --pr <number>                     Pull request number for API label fetch.
      --issue <number>                  Issue number for API label fetch.
      --fetch-labels                    Fetch labels from GitHub API when possible. Default.
      --no-fetch-labels                 Do not fetch labels from GitHub API.
      --require-release-label           Require explicit release label to release.
      --no-require-release-label        Allow default release type. Default.
      --fail-if-no-release-label        Exit non-zero if no release label is found.
      --fail-on-conflict                Exit non-zero for conflicting release labels.
      --no-fail-on-conflict             Report conflicts without failing. Default.
      --fail-on-error                   Exit non-zero on detection failure. Default.
      --no-fail-on-error                Do not fail workflow for detection errors.
      --timeout-seconds <number>        API request timeout. Default: 60.
  -o, --output <file>                   JSON output file.
      --summary <file>                  Markdown summary output file.
      --no-summary                      Do not write Markdown summary.
      --dry-run                         Plan only; no API fetch.
      --no-print                        Do not print JSON report.
      --no-step-summary                 Do not append GitHub step summary.
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

  fs.mkdirSync(dirPath, {
    recursive: true,
  });
}

function writeTextFile(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath), options.dry_run);

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return {
      written: false,
      dry_run: true,
      path: filePath,
    };
  }

  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);

  return {
    written: true,
    dry_run: false,
    path: filePath,
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
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }) ||
      DEFAULT_BRANCH,
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
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

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(
    stripJsonc(fs.readFileSync(absolutePath, "utf8")),
    fallback,
  );
}

function parseYamlScalar(value) {
  const source = normalizeString(value);

  if (!source) return "";
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+$/.test(source)) return Number(source);

  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }

  if (source.startsWith("[") && source.endsWith("]")) {
    return source
      .slice(1, -1)
      .split(",")
      .map((item) => parseYamlScalar(item.trim()))
      .filter((item) => item !== "");
  }

  return source;
}

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;

    if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index).trimEnd();
    }
  }

  return line.trimEnd();
}

function parseSimpleYaml(text) {
  const config = {};
  const lines = String(text || "").split(/\r?\n/);
  let section = "";

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      continue;
    }

    if (section && /^-\s*/.test(trimmed)) {
      config[section].push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (/^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
    }
  }

  return config;
}

function readConfigFile(filePath, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return null;

  const extension = path.extname(absolutePath).toLowerCase();
  const text = fs.readFileSync(absolutePath, "utf8");

  if (extension === ".json" || extension === ".jsonc") {
    return safeJsonParse(stripJsonc(text), null);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleYaml(text);
  }

  return safeJsonParse(stripJsonc(text), null);
}

function findConfigFile(args, repoRoot) {
  if (args.config_file) {
    const absolutePath = resolvePath(args.config_file, repoRoot);

    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.config_file;
  }

  for (const candidate of DEFAULT_CONFIG_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  if (config.default_release_type !== undefined) {
    merged.default_release_type = normalizeReleaseType(
      config.default_release_type,
    );
  }

  if (config.default_channel !== undefined) {
    merged.default_channel = normalizeChannel(config.default_channel);
  }

  const booleanKeys = [
    "fetch_labels",
    "require_release_label",
    "fail_if_no_release_label",
    "fail_on_conflict",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (Array.isArray(config.labels)) {
    merged.labels.push(...config.labels.map(String));
  }

  if (config.output_file)
    merged.output_file = normalizeString(
      config.output_file,
      merged.output_file,
    );
  if (config.summary_file)
    merged.summary_file = normalizeString(
      config.summary_file,
      merged.summary_file,
    );

  merged.labels = [...new Set(merged.labels)];

  return merged;
}

function mergeLabelRules(config) {
  const rules = JSON.parse(JSON.stringify(DEFAULT_LABEL_RULES));

  if (!config || typeof config !== "object") return rules;

  const aliases = config.label_rules || config.rules || {};

  for (const [key, values] of Object.entries(aliases)) {
    const normalizedKey = normalizeLabelKey(key);

    if (!rules[normalizedKey]) {
      rules[normalizedKey] = [];
    }

    rules[normalizedKey].push(...normalizeStringList(values));
  }

  for (const key of Object.keys(rules)) {
    rules[key] = [
      ...new Set(rules[key].map(normalizeLabelName).filter(Boolean)),
    ];
  }

  return rules;
}

function normalizeReleaseType(value) {
  const normalized = normalizeString(value, "none").toLowerCase();

  if (["major", "minor", "patch", "none"].includes(normalized)) {
    return normalized;
  }

  if (["skip", "no-release", "false"].includes(normalized)) {
    return "none";
  }

  return "none";
}

function normalizeChannel(value) {
  const normalized = normalizeString(value, "stable").toLowerCase();

  if (
    ["stable", "alpha", "beta", "rc", "preview", "next", "canary"].includes(
      normalized,
    )
  ) {
    return normalized;
  }

  return "stable";
}

function normalizeLabelKey(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (["skip", "none", "no-release", "no_release"].includes(normalized))
    return "skip";
  if (
    [
      "major",
      "minor",
      "patch",
      "prerelease",
      "alpha",
      "beta",
      "rc",
      "stable",
    ].includes(normalized)
  ) {
    return normalized;
  }

  return normalized.replace(/[^a-z0-9_-]+/g, "-");
}

function normalizeLabelName(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function labelsFromItems(items) {
  const labels = [];

  for (const item of items || []) {
    if (!item) continue;

    if (typeof item === "string") {
      labels.push(item);
      continue;
    }

    if (typeof item === "object" && item.name) {
      labels.push(item.name);
    }
  }

  return labels;
}

function collectLabelsFromEvent(event) {
  const labels = [];

  labels.push(...labelsFromItems(event?.labels));
  labels.push(...labelsFromItems(event?.pull_request?.labels));
  labels.push(...labelsFromItems(event?.issue?.labels));

  if (event?.label?.name) {
    labels.push(event.label.name);
  }

  if (event?.inputs) {
    labels.push(...normalizeStringList(event.inputs.release_label));
    labels.push(...normalizeStringList(event.inputs.release_labels));
    labels.push(...normalizeStringList(event.inputs.labels));
  }

  if (event?.client_payload) {
    labels.push(...normalizeStringList(event.client_payload.release_label));
    labels.push(...normalizeStringList(event.client_payload.release_labels));
    labels.push(...normalizeStringList(event.client_payload.labels));
  }

  return [...new Set(labels.map(String).filter(Boolean))];
}

function eventNumbers(event) {
  const prNumber =
    event?.pull_request?.number || (event?.number && event?.pull_request)
      ? event.number
      : "";

  const issueNumber =
    event?.issue?.number || (event?.number && event?.issue) ? event.number : "";

  return {
    pull_request_number: prNumber ? String(prNumber) : "",
    issue_number: issueNumber ? String(issueNumber) : "",
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-release-label-script`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const requestOptions = {
    method: options.method || "GET",
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    timeout: (options.timeout_seconds || 60) * 1000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const parsedBody = safeJsonParse(responseText, responseText);
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 300;

        const response = {
          ok,
          status_code: statusCode,
          headers: res.headers,
          body: parsedBody,
          raw_body: responseText,
        };

        if (!ok && !options.allow_error) {
          const message =
            typeof parsedBody === "object" && parsedBody?.message
              ? parsedBody.message
              : responseText || `HTTP ${statusCode}`;

          const error = new Error(`GitHub API request failed: ${message}`);
          error.response = response;
          reject(error);
          return;
        }

        resolve(response);
      });
    });

    req.on("timeout", () => {
      req.destroy(
        new Error(
          `Request timed out after ${options.timeout_seconds || 60} second(s).`,
        ),
      );
    });

    req.on("error", reject);
    req.end();
  });
}

async function fetchIssueLabels(args, number) {
  if (!number || !args.token || args.dry_run) return [];

  const url = `${args.api_url}/repos/${args.repository}/issues/${encodeURIComponent(number)}/labels?per_page=100`;

  const response = await requestJson(url, {
    method: "GET",
    token: args.token,
    timeout_seconds: args.timeout_seconds,
    allow_error: true,
  });

  if (!response.ok) {
    const message =
      typeof response.body === "object" && response.body?.message
        ? response.body.message
        : response.raw_body || `HTTP ${response.status_code}`;

    throw new Error(`Failed to fetch labels for #${number}: ${message}`);
  }

  return labelsFromItems(response.body);
}

function matchLabel(labels, rules, key) {
  const normalizedLabels = labels.map(normalizeLabelName);
  const aliases = rules[key] || [];

  return normalizedLabels.filter((label) => aliases.includes(label));
}

function detectRelease(labels, rules, args) {
  const normalizedLabels = [
    ...new Set(labels.map(normalizeLabelName).filter(Boolean)),
  ];

  const matches = {
    skip: matchLabel(normalizedLabels, rules, "skip"),
    major: matchLabel(normalizedLabels, rules, "major"),
    minor: matchLabel(normalizedLabels, rules, "minor"),
    patch: matchLabel(normalizedLabels, rules, "patch"),
    prerelease: matchLabel(normalizedLabels, rules, "prerelease"),
    alpha: matchLabel(normalizedLabels, rules, "alpha"),
    beta: matchLabel(normalizedLabels, rules, "beta"),
    rc: matchLabel(normalizedLabels, rules, "rc"),
    stable: matchLabel(normalizedLabels, rules, "stable"),
  };

  const releaseTypeMatches = ["major", "minor", "patch"].filter(
    (type) => matches[type].length > 0,
  );
  const channelMatches = ["alpha", "beta", "rc", "stable"].filter(
    (channel) => matches[channel].length > 0,
  );
  const hasExplicitReleaseLabel =
    releaseTypeMatches.length > 0 ||
    matches.prerelease.length > 0 ||
    channelMatches.length > 0;
  const skip = matches.skip.length > 0;

  let releaseType = args.default_release_type;

  for (const type of releaseTypeMatches) {
    if (RELEASE_PRIORITY[type] > RELEASE_PRIORITY[releaseType]) {
      releaseType = type;
    }
  }

  let channel = args.default_channel;

  if (matches.alpha.length) channel = "alpha";
  if (matches.beta.length) channel = "beta";
  if (matches.rc.length) channel = "rc";
  if (matches.stable.length) channel = "stable";

  const prerelease =
    matches.prerelease.length > 0 ||
    ["alpha", "beta", "rc", "preview", "next", "canary"].includes(channel);

  if (releaseType === "none" && prerelease && !args.require_release_label) {
    releaseType = "patch";
  }

  const conflicts = [];

  if (releaseTypeMatches.length > 1) {
    conflicts.push(
      `Multiple release type labels found: ${releaseTypeMatches.join(", ")}`,
    );
  }

  if (channelMatches.length > 1) {
    conflicts.push(
      `Multiple release channel labels found: ${channelMatches.join(", ")}`,
    );
  }

  if (skip && hasExplicitReleaseLabel) {
    conflicts.push("Skip-release label is present with release labels.");
  }

  const shouldRelease =
    !skip &&
    releaseType !== "none" &&
    (!args.require_release_label || hasExplicitReleaseLabel);

  const reason = skip
    ? "A skip-release label was found."
    : !hasExplicitReleaseLabel && args.require_release_label
      ? "No explicit release label was found and one is required."
      : releaseType === "none"
        ? "No release type was detected."
        : `Detected ${releaseType}${prerelease ? ` ${channel}` : ""} release intent.`;

  return {
    labels: normalizedLabels,
    matches,
    release_type: skip ? "none" : releaseType,
    release_channel: skip ? "none" : channel,
    prerelease: !skip && prerelease,
    stable: !skip && !prerelease && channel === "stable",
    skip_release: skip,
    should_release: shouldRelease,
    has_explicit_release_label: hasExplicitReleaseLabel,
    conflicts,
    reason,
    status: skip
      ? "skipped"
      : conflicts.length
        ? "conflict"
        : shouldRelease
          ? "release"
          : "no-release",
  };
}

async function collectInput(args, repoRoot) {
  const event = args.event_path
    ? readJsonFile(args.event_path, repoRoot, null)
    : null;
  const eventLabels = collectLabelsFromEvent(event);
  const numbers = eventNumbers(event);

  const pullRequestNumber = normalizeString(
    args.pull_request_number || numbers.pull_request_number,
  );
  const issueNumber = normalizeString(
    args.issue_number || numbers.issue_number,
  );
  const fetchNumber = pullRequestNumber || issueNumber;

  let fetchedLabels = [];
  let fetchError = "";

  if (args.fetch_labels && fetchNumber) {
    try {
      fetchedLabels = await fetchIssueLabels(args, fetchNumber);
    } catch (err) {
      fetchError = logger.formatError(err);
      logger.warn(fetchError);
    }
  }

  return {
    event_available: Boolean(event),
    event_name: normalizeString(process.env.GITHUB_EVENT_NAME || event?.action),
    pull_request_number: pullRequestNumber,
    issue_number: issueNumber,
    direct_labels: args.labels,
    event_labels: eventLabels,
    fetched_labels: fetchedLabels,
    fetch_error: fetchError,
    labels: [
      ...new Set(
        [...args.labels, ...eventLabels, ...fetchedLabels]
          .map(String)
          .filter(Boolean),
      ),
    ],
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  input,
  detection,
  rules,
) {
  const github = getGitMetadata(repoRoot);

  const errors = [];

  if (input.fetch_error && args.fail_on_error) {
    errors.push(input.fetch_error);
  }

  if (args.fail_if_no_release_label && !detection.has_explicit_release_label) {
    errors.push("No explicit release label was found.");
  }

  if (args.fail_on_conflict && detection.conflicts.length) {
    errors.push(...detection.conflicts);
  }

  const status = errors.length ? "failed" : detection.status;

  return {
    schema_version: 1,
    type: "release-label-detection",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      event_path: args.event_path
        ? toRelativePath(resolvePath(args.event_path, repoRoot), repoRoot)
        : null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      api_url: args.api_url,
      default_release_type: args.default_release_type,
      default_channel: args.default_channel,
      fetch_labels: args.fetch_labels,
      require_release_label: args.require_release_label,
      fail_if_no_release_label: args.fail_if_no_release_label,
      fail_on_conflict: args.fail_on_conflict,
      dry_run: args.dry_run,
    },
    input,
    rules,
    detection,
    release: {
      should_release: detection.should_release,
      release_type: detection.release_type,
      release_channel: detection.release_channel,
      prerelease: detection.prerelease,
      stable: detection.stable,
      skip_release: detection.skip_release,
      reason: detection.reason,
    },
    totals: {
      labels: detection.labels.length,
      direct_labels: input.direct_labels.length,
      event_labels: input.event_labels.length,
      fetched_labels: input.fetched_labels.length,
      conflicts: detection.conflicts.length,
      errors: errors.length,
      ok: errors.length === 0,
    },
    errors,
    status,
    ok: errors.length === 0,
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function createMarkdownSummary(report) {
  const releaseEmoji = report.release.should_release
    ? report.release.prerelease
      ? "🧪"
      : "🚀"
    : report.release.skip_release
      ? "⏭️"
      : "🛑";

  const lines = [
    `# 🏷️ ${PROJECT_NAME} Release Label Detection`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Decision: ${releaseEmoji} \`${report.release.should_release ? "release" : "do not release"}\``,
    `- Release type: \`${report.release.release_type}\``,
    `- Release channel: \`${report.release.release_channel}\``,
    `- Prerelease: \`${report.release.prerelease ? "true" : "false"}\``,
    `- Skip release: \`${report.release.skip_release ? "true" : "false"}\``,
    `- Reason: ${escapeMarkdown(report.release.reason)}`,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 🏷️ Labels",
    "",
  ];

  if (!report.detection.labels.length) {
    lines.push("No labels were found.");
  } else {
    for (const label of report.detection.labels) {
      lines.push(`- \`${escapeMarkdown(label)}\``);
    }
  }

  lines.push("");
  lines.push("## 🎯 Matches");
  lines.push("");
  lines.push("| Type | Matched Labels |");
  lines.push("|---|---|");

  for (const [key, values] of Object.entries(report.detection.matches)) {
    lines.push(
      `| \`${escapeMarkdown(key)}\` | ${
        values.length
          ? values.map((value) => `\`${escapeMarkdown(value)}\``).join(", ")
          : "none"
      } |`,
    );
  }

  if (report.detection.conflicts.length) {
    lines.push("");
    lines.push("## ⚠️ Conflicts");
    lines.push("");

    for (const conflict of report.detection.conflicts) {
      lines.push(`- ${escapeMarkdown(conflict)}`);
    }
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }
  }

  lines.push("");
  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Event path: \`${report.config.event_path || "none"}\``);
  lines.push(
    `- Event available: \`${report.input.event_available ? "true" : "false"}\``,
  );
  lines.push(
    `- Pull request number: \`${report.input.pull_request_number || "none"}\``,
  );
  lines.push(`- Issue number: \`${report.input.issue_number || "none"}\``);
  lines.push(`- API fetched labels: \`${report.input.fetched_labels.length}\``);

  lines.push("");
  lines.push("## 📤 Outputs");
  lines.push("");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
  );

  return `${lines.join("\n").trim()}\n`;
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

  fs.appendFileSync(
    outputFile,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("release_label_file", report.config.output_file);
  setGitHubOutput(
    "release_label_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("release_label_status", report.status);
  setGitHubOutput("release_label_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "release_should_release",
    report.release.should_release ? "true" : "false",
  );
  setGitHubOutput(
    "release_skip",
    report.release.skip_release ? "true" : "false",
  );
  setGitHubOutput(
    "release_prerelease",
    report.release.prerelease ? "true" : "false",
  );
  setGitHubOutput("release_stable", report.release.stable ? "true" : "false");
  setGitHubOutput("release_type", report.release.release_type);
  setGitHubOutput("release_channel", report.release.release_channel);
  setGitHubOutput("release_reason", report.release.reason);

  setGitHubOutput(
    "release_label_detected",
    report.detection.has_explicit_release_label ? "true" : "false",
  );
  setGitHubOutput("release_labels", report.detection.labels.join(","));
  setGitHubOutput(
    "release_labels_json",
    JSON.stringify(report.detection.labels),
  );
  setGitHubOutput("release_label_conflicts", String(report.totals.conflicts));
  setGitHubOutput(
    "release_label_conflicts_json",
    JSON.stringify(report.detection.conflicts),
  );
  setGitHubOutput("release_label_errors_json", JSON.stringify(report.errors));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const rules = mergeLabelRules(config);
  const input = await collectInput(args, repoRoot);
  const detection = detectRelease(input.labels, rules, args);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    detection,
    rules,
  );
  const markdown = createMarkdownSummary(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(report);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
