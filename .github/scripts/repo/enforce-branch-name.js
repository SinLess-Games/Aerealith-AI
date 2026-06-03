#!/usr/bin/env node
// .github/scripts/repo/enforce-branch-name.js
// =============================================================================
// Aerealith AI — Branch Name Enforcement
// -----------------------------------------------------------------------------
// Purpose:
//   Validate GitHub branch names for pull requests, pushes, workflow dispatches,
//   and repository automation events.
//
// Input:
//   - GitHub event payload
//   - Direct CLI/env branch input
//   - .github/repo/enforce-branch-name.json
//   - .github/repo/enforce-branch-name.jsonc
//   - .github/repo/enforce-branch-name.yaml
//   - .github/repo/enforce-branch-name.yml
//
// Output:
//   - artifacts/repo/enforce-branch-name.json
//   - artifacts/repo/enforce-branch-name.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate git, GitHub, or repository state.
//   - Safe for pull requests.
//   - Secrets are redacted from logs, reports, summaries, and GitHub outputs.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[branch-name] ${message}`),
    warn: (message) => console.warn(`[branch-name] WARN: ${message}`),
    error: (message) => console.error(`[branch-name] ERROR: ${message}`),
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
  ".github/repo/enforce-branch-name.json",
  ".github/repo/enforce-branch-name.jsonc",
  ".github/repo/enforce-branch-name.yaml",
  ".github/repo/enforce-branch-name.yml",
  ".github/repo/branch-name.json",
  ".github/repo/branch-name.jsonc",
  ".github/repo/branch-name.yaml",
  ".github/repo/branch-name.yml",
  ".github/branch-name.json",
  ".github/branch-name.jsonc",
  ".github/branch-name.yaml",
  ".github/branch-name.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/enforce-branch-name.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/enforce-branch-name.md";

const DEFAULT_EXACT_BRANCHES = [
  "main",
  "master",
  "dev",
  "develop",
  "development",
  "staging",
  "stage",
  "prod",
  "production",
  "next",
];

const DEFAULT_PREFIXES = [
  "feature",
  "feat",
  "fix",
  "bugfix",
  "hotfix",
  "chore",
  "docs",
  "doc",
  "refactor",
  "test",
  "tests",
  "ci",
  "build",
  "release",
  "security",
  "deps",
  "dependency",
  "renovate",
  "dependabot",
];

const DEFAULT_IGNORED_PATTERNS = ["dependabot/**", "renovate/**"];

const DEFAULT_BLOCKED_PATTERNS = [
  "wip/**",
  "tmp/**",
  "temp/**",
  "scratch/**",
  "backup/**",
  "old/**",
  "bad/**",
  "**/wip",
  "**/tmp",
  "**/temp",
];

const DEFAULT_ALLOWED_CHAR_PATTERN = "^[a-z0-9._/-]+$";
const DEFAULT_ISSUE_REFERENCE_PATTERN =
  "(^|[/_-])(#?[0-9]+|[a-z]+-[0-9]+)([/_-]|$)";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|GITHUB_TOKEN=[^\s]+|GH_TOKEN=[^\s]+|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

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

function normalizeBranch(value) {
  const branch = normalizeString(value);

  if (!branch) return "";

  if (branch.startsWith("refs/heads/"))
    return branch.slice("refs/heads/".length);
  if (branch.startsWith("refs/tags/")) return branch.slice("refs/tags/".length);
  if (branch.startsWith("origin/")) return branch.slice("origin/".length);

  return branch;
}

function normalizeRef(value) {
  return normalizeString(value);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.ENFORCE_BRANCH_NAME_CONFIG_FILE || "",

    event_path:
      process.env.ENFORCE_BRANCH_NAME_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    output_file:
      process.env.ENFORCE_BRANCH_NAME_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ENFORCE_BRANCH_NAME_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    branch:
      process.env.ENFORCE_BRANCH_NAME_BRANCH ||
      process.env.BRANCH_NAME ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      "",
    ref: process.env.ENFORCE_BRANCH_NAME_REF || process.env.GITHUB_REF || "",
    base_branch:
      process.env.ENFORCE_BRANCH_NAME_BASE_BRANCH ||
      process.env.GITHUB_BASE_REF ||
      "",
    head_branch:
      process.env.ENFORCE_BRANCH_NAME_HEAD_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      "",

    event_name:
      process.env.ENFORCE_BRANCH_NAME_EVENT_NAME ||
      process.env.GITHUB_EVENT_NAME ||
      "",

    allowed_exact_branches: normalizeStringList(
      process.env.ENFORCE_BRANCH_NAME_ALLOWED_EXACT ||
        process.env.ALLOWED_EXACT_BRANCHES ||
        "",
    ),
    allowed_prefixes: normalizeStringList(
      process.env.ENFORCE_BRANCH_NAME_ALLOWED_PREFIXES ||
        process.env.ALLOWED_BRANCH_PREFIXES ||
        "",
    ),
    allowed_patterns: normalizeStringList(
      process.env.ENFORCE_BRANCH_NAME_ALLOWED_PATTERNS ||
        process.env.ALLOWED_BRANCH_PATTERNS ||
        "",
    ),
    blocked_patterns: normalizeStringList(
      process.env.ENFORCE_BRANCH_NAME_BLOCKED_PATTERNS ||
        process.env.BLOCKED_BRANCH_PATTERNS ||
        "",
    ),
    ignored_patterns: normalizeStringList(
      process.env.ENFORCE_BRANCH_NAME_IGNORED_PATTERNS ||
        process.env.IGNORED_BRANCH_PATTERNS ||
        "",
    ),

    allowed_char_pattern:
      process.env.ENFORCE_BRANCH_NAME_ALLOWED_CHARS ||
      DEFAULT_ALLOWED_CHAR_PATTERN,

    issue_reference_pattern:
      process.env.ENFORCE_BRANCH_NAME_ISSUE_REFERENCE_PATTERN ||
      DEFAULT_ISSUE_REFERENCE_PATTERN,

    require_branch: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_BRANCH,
      true,
    ),
    require_lowercase: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_LOWERCASE,
      true,
    ),
    require_allowed_pattern: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_ALLOWED_PATTERN,
      true,
    ),
    require_prefix: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_PREFIX,
      true,
    ),
    require_separator: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_SEPARATOR,
      true,
    ),
    require_slug: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_SLUG,
      true,
    ),
    require_issue_reference: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_REQUIRE_ISSUE_REFERENCE,
      false,
    ),

    allow_exact_branches: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_ALLOW_EXACT,
      true,
    ),
    exact_branches_exempt: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_EXACT_EXEMPT,
      true,
    ),
    skip_tags: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_SKIP_TAGS,
      true,
    ),
    skip_delete_events: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_SKIP_DELETE_EVENTS,
      true,
    ),
    skip_ignored: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_SKIP_IGNORED,
      true,
    ),

    min_length: normalizeInteger(process.env.ENFORCE_BRANCH_NAME_MIN_LENGTH, 1),
    max_length: normalizeInteger(
      process.env.ENFORCE_BRANCH_NAME_MAX_LENGTH,
      100,
    ),
    min_slug_length: normalizeInteger(
      process.env.ENFORCE_BRANCH_NAME_MIN_SLUG_LENGTH,
      2,
    ),

    fail_on_warning: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_FAIL_ON_WARNING,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_FAIL_ON_ERROR,
      true,
    ),

    dry_run: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ENFORCE_BRANCH_NAME_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ENFORCE_BRANCH_NAME_STEP_SUMMARY,
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

    if (arg === "--branch" || arg === "--branch-name") {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--ref") {
      args.ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--base-branch") {
      args.base_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head-branch") {
      args.head_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--event-name") {
      args.event_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--allowed-exact" || arg === "--allowed-exact-branch") {
      args.allowed_exact_branches.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-prefix" || arg === "--allowed-prefixes") {
      args.allowed_prefixes.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-pattern" || arg === "--allowed-patterns") {
      args.allowed_patterns.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--blocked-pattern" || arg === "--blocked-patterns") {
      args.blocked_patterns.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--ignored-pattern" || arg === "--ignored-patterns") {
      args.ignored_patterns.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-char-pattern") {
      args.allowed_char_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--issue-reference-pattern") {
      args.issue_reference_pattern = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--require-branch") {
      args.require_branch = true;
      continue;
    }

    if (arg === "--no-require-branch") {
      args.require_branch = false;
      continue;
    }

    if (arg === "--require-lowercase") {
      args.require_lowercase = true;
      continue;
    }

    if (arg === "--no-require-lowercase") {
      args.require_lowercase = false;
      continue;
    }

    if (arg === "--require-allowed-pattern") {
      args.require_allowed_pattern = true;
      continue;
    }

    if (arg === "--no-require-allowed-pattern") {
      args.require_allowed_pattern = false;
      continue;
    }

    if (arg === "--require-prefix") {
      args.require_prefix = true;
      continue;
    }

    if (arg === "--no-require-prefix") {
      args.require_prefix = false;
      continue;
    }

    if (arg === "--require-separator") {
      args.require_separator = true;
      continue;
    }

    if (arg === "--no-require-separator") {
      args.require_separator = false;
      continue;
    }

    if (arg === "--require-slug") {
      args.require_slug = true;
      continue;
    }

    if (arg === "--no-require-slug") {
      args.require_slug = false;
      continue;
    }

    if (arg === "--require-issue-reference") {
      args.require_issue_reference = true;
      continue;
    }

    if (arg === "--no-require-issue-reference") {
      args.require_issue_reference = false;
      continue;
    }

    if (arg === "--allow-exact") {
      args.allow_exact_branches = true;
      continue;
    }

    if (arg === "--no-allow-exact") {
      args.allow_exact_branches = false;
      continue;
    }

    if (arg === "--exact-exempt") {
      args.exact_branches_exempt = true;
      continue;
    }

    if (arg === "--no-exact-exempt") {
      args.exact_branches_exempt = false;
      continue;
    }

    if (arg === "--skip-tags") {
      args.skip_tags = true;
      continue;
    }

    if (arg === "--no-skip-tags") {
      args.skip_tags = false;
      continue;
    }

    if (arg === "--skip-delete-events") {
      args.skip_delete_events = true;
      continue;
    }

    if (arg === "--no-skip-delete-events") {
      args.skip_delete_events = false;
      continue;
    }

    if (arg === "--skip-ignored") {
      args.skip_ignored = true;
      continue;
    }

    if (arg === "--no-skip-ignored") {
      args.skip_ignored = false;
      continue;
    }

    if (arg === "--min-length") {
      args.min_length = normalizeInteger(argv[index + 1], args.min_length);
      index += 1;
      continue;
    }

    if (arg === "--max-length") {
      args.max_length = normalizeInteger(argv[index + 1], args.max_length);
      index += 1;
      continue;
    }

    if (arg === "--min-slug-length") {
      args.min_slug_length = normalizeInteger(
        argv[index + 1],
        args.min_slug_length,
      );
      index += 1;
      continue;
    }

    if (arg === "--fail-on-warning") {
      args.fail_on_warning = true;
      continue;
    }

    if (arg === "--no-fail-on-warning") {
      args.fail_on_warning = false;
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
  args.branch = normalizeBranch(args.branch);
  args.ref = normalizeRef(args.ref);
  args.base_branch = normalizeBranch(args.base_branch);
  args.head_branch = normalizeBranch(args.head_branch);
  args.event_name = normalizeString(args.event_name);

  args.allowed_exact_branches = [
    ...new Set(
      (args.allowed_exact_branches.length
        ? args.allowed_exact_branches
        : DEFAULT_EXACT_BRANCHES
      )
        .map(normalizeBranch)
        .filter(Boolean),
    ),
  ];

  args.allowed_prefixes = [
    ...new Set(
      (args.allowed_prefixes.length ? args.allowed_prefixes : DEFAULT_PREFIXES)
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];

  args.allowed_patterns = [
    ...new Set(args.allowed_patterns.map(normalizeString).filter(Boolean)),
  ];

  args.blocked_patterns = [
    ...new Set(
      (args.blocked_patterns.length
        ? args.blocked_patterns
        : DEFAULT_BLOCKED_PATTERNS
      )
        .map(normalizeString)
        .filter(Boolean),
    ),
  ];

  args.ignored_patterns = [
    ...new Set(
      (args.ignored_patterns.length
        ? args.ignored_patterns
        : DEFAULT_IGNORED_PATTERNS
      )
        .map(normalizeString)
        .filter(Boolean),
    ),
  ];

  args.min_length = Math.max(1, args.min_length);
  args.max_length = Math.max(args.min_length, args.max_length);
  args.min_slug_length = Math.max(1, args.min_slug_length);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Branch Name Enforcement

Usage:
  node .github/scripts/repo/enforce-branch-name.js [options]

Examples:
  node .github/scripts/repo/enforce-branch-name.js --branch feature/authentication
  node .github/scripts/repo/enforce-branch-name.js --branch fix/123-login-error
  node .github/scripts/repo/enforce-branch-name.js --allowed-prefix "feature,fix,docs,ci"
  node .github/scripts/repo/enforce-branch-name.js --require-issue-reference
  node .github/scripts/repo/enforce-branch-name.js --allowed-pattern "feature/**"

Recommended branch format:
  <type>/<short-slug>

Examples:
  feature/authentication
  fix/123-login-error
  docs/update-readme
  ci/release-workflow
  release/v2.10.0

Config example:
  {
    "allowed_exact_branches": ["main", "dev", "staging", "prod"],
    "allowed_prefixes": ["feature", "fix", "docs", "ci", "release"],
    "allowed_patterns": ["feature/**", "fix/**", "docs/**", "ci/**", "release/**"],
    "blocked_patterns": ["wip/**", "tmp/**"],
    "ignored_patterns": ["dependabot/**", "renovate/**"],
    "require_lowercase": true,
    "require_issue_reference": false,
    "max_length": 100
  }

Options:
      --repo <owner/repo>                  Repository slug.
      --config <file>                      Branch enforcement config file.
      --event-path <file>                  GitHub event payload path.
      --branch <branch>                    Branch name to validate.
      --ref <ref>                          Git ref to validate.
      --base-branch <branch>               Base branch hint.
      --head-branch <branch>               Head branch hint.
      --event-name <name>                  GitHub event name.
      --allowed-exact <list>               Exact branch names allowed.
      --allowed-prefix <list>              Allowed branch prefixes.
      --allowed-pattern <list>             Allowed glob or regex patterns.
      --blocked-pattern <list>             Blocked glob or regex patterns.
      --ignored-pattern <list>             Ignored glob or regex patterns.
      --allowed-char-pattern <regex>       Allowed character regex.
      --issue-reference-pattern <regex>    Issue reference regex.
      --require-branch                     Require branch resolution. Default.
      --no-require-branch                  Do not fail when branch is missing.
      --require-lowercase                  Require lowercase branch names. Default.
      --no-require-lowercase               Allow uppercase branch names.
      --require-allowed-pattern            Require branch to match allowed policy. Default.
      --no-require-allowed-pattern         Skip allowed pattern enforcement.
      --require-prefix                     Require allowed prefix. Default.
      --no-require-prefix                  Skip prefix requirement.
      --require-separator                  Require prefix separator. Default.
      --no-require-separator               Skip separator requirement.
      --require-slug                       Require a branch slug after prefix. Default.
      --no-require-slug                    Skip slug requirement.
      --require-issue-reference            Require issue number/key in branch.
      --no-require-issue-reference         Do not require issue reference. Default.
      --allow-exact                        Allow exact branches like main/dev. Default.
      --no-allow-exact                     Validate exact branches as normal names.
      --exact-exempt                       Exempt exact branches from format checks. Default.
      --no-exact-exempt                    Do not exempt exact branches.
      --skip-tags                          Skip tag refs. Default.
      --no-skip-tags                       Validate tag refs.
      --skip-delete-events                 Skip delete events. Default.
      --no-skip-delete-events              Validate delete events.
      --skip-ignored                       Skip ignored branches. Default.
      --no-skip-ignored                    Treat ignored branches as warnings/errors.
      --min-length <number>                Minimum branch length. Default: 1.
      --max-length <number>                Maximum branch length. Default: 100.
      --min-slug-length <number>           Minimum slug length. Default: 2.
      --fail-on-warning                    Exit non-zero on warnings.
      --no-fail-on-warning                 Do not fail on warnings. Default.
      --fail-on-error                      Exit non-zero on validation errors. Default.
      --no-fail-on-error                   Do not fail workflow.
  -o, --output <file>                      JSON output file.
      --summary <file>                     Markdown summary output file.
      --no-summary                         Do not write Markdown summary.
      --dry-run                            Plan but do not write files.
      --no-print                           Do not print JSON report.
      --no-step-summary                    Do not append GitHub step summary.
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
    event_name: process.env.GITHUB_EVENT_NAME || "",
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

  const listKeys = [
    "allowed_exact_branches",
    "allowed_prefixes",
    "allowed_patterns",
    "blocked_patterns",
    "ignored_patterns",
  ];

  for (const key of listKeys) {
    if (Array.isArray(config[key])) {
      merged[key] = config[key].map(String).filter(Boolean);
    }
  }

  const stringKeys = [
    "branch",
    "ref",
    "base_branch",
    "head_branch",
    "allowed_char_pattern",
    "issue_reference_pattern",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (
      config[key] !== undefined &&
      (!merged[key] || key.endsWith("_pattern"))
    ) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "require_branch",
    "require_lowercase",
    "require_allowed_pattern",
    "require_prefix",
    "require_separator",
    "require_slug",
    "require_issue_reference",
    "allow_exact_branches",
    "exact_branches_exempt",
    "skip_tags",
    "skip_delete_events",
    "skip_ignored",
    "fail_on_warning",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  const integerKeys = ["min_length", "max_length", "min_slug_length"];

  for (const key of integerKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeInteger(config[key], merged[key]);
    }
  }

  merged.branch = normalizeBranch(merged.branch);
  merged.ref = normalizeRef(merged.ref);
  merged.base_branch = normalizeBranch(merged.base_branch);
  merged.head_branch = normalizeBranch(merged.head_branch);
  merged.allowed_exact_branches = [
    ...new Set(
      (merged.allowed_exact_branches.length
        ? merged.allowed_exact_branches
        : DEFAULT_EXACT_BRANCHES
      )
        .map(normalizeBranch)
        .filter(Boolean),
    ),
  ];
  merged.allowed_prefixes = [
    ...new Set(
      (merged.allowed_prefixes.length
        ? merged.allowed_prefixes
        : DEFAULT_PREFIXES
      )
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean),
    ),
  ];
  merged.blocked_patterns = [
    ...new Set(
      (merged.blocked_patterns.length
        ? merged.blocked_patterns
        : DEFAULT_BLOCKED_PATTERNS
      )
        .map(normalizeString)
        .filter(Boolean),
    ),
  ];
  merged.ignored_patterns = [
    ...new Set(
      (merged.ignored_patterns.length
        ? merged.ignored_patterns
        : DEFAULT_IGNORED_PATTERNS
      )
        .map(normalizeString)
        .filter(Boolean),
    ),
  ];
  merged.allowed_patterns = [
    ...new Set(merged.allowed_patterns.map(normalizeString).filter(Boolean)),
  ];

  return merged;
}

function resolveBranchFromRef(ref) {
  const value = normalizeString(ref);

  if (!value) return "";

  if (value.startsWith("refs/heads/")) {
    return value.slice("refs/heads/".length);
  }

  if (value.startsWith("refs/tags/")) {
    return value.slice("refs/tags/".length);
  }

  return normalizeBranch(value);
}

function collectEventInput(args, repoRoot, github) {
  const event = args.event_path
    ? readJsonFile(args.event_path, repoRoot, null)
    : null;
  const eventName = normalizeString(
    args.event_name || process.env.GITHUB_EVENT_NAME || github.event_name,
  );
  const action = normalizeString(event?.action);
  const ref = normalizeString(args.ref || event?.ref || github.ref);
  const refType = normalizeString(event?.ref_type);
  const isTagRef = ref.startsWith("refs/tags/") || refType === "tag";

  let branch =
    args.branch ||
    args.head_branch ||
    event?.pull_request?.head?.ref ||
    event?.workflow_run?.head_branch ||
    event?.client_payload?.branch ||
    event?.inputs?.branch ||
    event?.ref_name ||
    "";

  if (!branch && ref) {
    branch = resolveBranchFromRef(ref);
  }

  if (!branch) {
    branch = github.branch || "";
  }

  if (isTagRef && ref.startsWith("refs/tags/")) {
    branch = ref.slice("refs/tags/".length);
  }

  return {
    event_available: Boolean(event),
    event_name: eventName,
    event_action: action,
    ref,
    ref_type: refType,
    is_tag_ref: isTagRef,
    is_delete_event: eventName === "delete" || action === "deleted",
    branch: normalizeBranch(branch),
    base_branch:
      args.base_branch ||
      event?.pull_request?.base?.ref ||
      event?.workflow_run?.head_repository?.default_branch ||
      github.base_branch ||
      "",
    head_branch:
      args.head_branch ||
      event?.pull_request?.head?.ref ||
      event?.workflow_run?.head_branch ||
      "",
    pull_request_number: event?.pull_request?.number || event?.number || "",
    actor: github.actor || event?.sender?.login || "",
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasGlob(value) {
  return /[*?]/.test(String(value || ""));
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern);
  let output = "^";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "*" && next === "*") {
      const afterDoubleStar = source[index + 2];

      if (afterDoubleStar === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }

      continue;
    }

    if (char === "*") {
      output += "[^/]*";
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += escapeRegExp(char);
  }

  output += "$";

  return new RegExp(output);
}

function regexFromPattern(pattern, flags = "") {
  const source = normalizeString(pattern);

  if (!source) return null;

  if (hasGlob(source)) {
    return globToRegExp(source);
  }

  const safeFlags = String(flags || "")
    .replace(/[^dgimsuvy]/g, "")
    .split("")
    .filter((flag, index, array) => array.indexOf(flag) === index)
    .join("");

  return new RegExp(escapeRegExp(source), safeFlags);
}

function safeTest(pattern, value, flags = "") {
  try {
    const regex = regexFromPattern(pattern, flags);
    return regex ? regex.test(value) : false;
  } catch {
    return false;
  }
}

function matchesAny(value, patterns, flags = "") {
  return patterns.some((pattern) => safeTest(pattern, value, flags));
}

function buildDefaultAllowedPattern(prefixes) {
  const escaped = prefixes.map(escapeRegExp).join("|");

  return `^(${escaped})(/[a-z0-9][a-z0-9._-]*)+$`;
}

function getBranchParts(branch) {
  const parts = normalizeString(branch).split("/").filter(Boolean);
  const prefix = parts[0] || "";
  const slug = parts.slice(1).join("/");

  return {
    parts,
    prefix,
    slug,
    has_separator: branch.includes("/"),
  };
}

function makeCheck(id, title, ok, severity, message, details = {}) {
  return {
    id,
    title,
    ok: Boolean(ok),
    severity: ok ? "pass" : severity,
    status: ok ? "pass" : severity,
    message,
    details,
  };
}

function validateBranch(args, input) {
  const checks = [];
  const branch = input.branch;
  const parts = getBranchParts(branch);
  const exactAllowed = args.allowed_exact_branches.includes(branch);
  const exactExempt =
    args.allow_exact_branches && args.exact_branches_exempt && exactAllowed;
  const ignored = matchesAny(branch, args.ignored_patterns);
  const blockedPattern = args.blocked_patterns.find((pattern) =>
    safeTest(pattern, branch),
  );
  const allowedPatterns = args.allowed_patterns.length
    ? args.allowed_patterns
    : [buildDefaultAllowedPattern(args.allowed_prefixes)];
  const allowedByPattern = matchesAny(branch, allowedPatterns);
  const allowedByExact = args.allow_exact_branches && exactAllowed;
  const allowedByPrefix = args.allowed_prefixes.includes(parts.prefix);
  const allowedByPolicy = allowedByExact || allowedByPattern || allowedByPrefix;

  checks.push(
    makeCheck(
      "branch-present",
      "Branch resolved",
      !args.require_branch || Boolean(branch),
      "error",
      branch
        ? `Branch resolved: ${branch}`
        : "Branch name could not be resolved.",
      {
        branch,
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-ref-policy",
      "Tag ref policy",
      !input.is_tag_ref || args.skip_tags,
      "error",
      input.is_tag_ref
        ? args.skip_tags
          ? "Current ref is a tag and tag refs are skipped."
          : "Current ref is a tag and tag refs are not allowed."
        : "Current ref is not a tag.",
      {
        ref: input.ref,
        is_tag_ref: input.is_tag_ref,
        skip_tags: args.skip_tags,
      },
    ),
  );

  checks.push(
    makeCheck(
      "delete-event-policy",
      "Delete event policy",
      !input.is_delete_event || args.skip_delete_events,
      "warning",
      input.is_delete_event
        ? args.skip_delete_events
          ? "Current event is a delete event and delete events are skipped."
          : "Current event is a delete event."
        : "Current event is not a delete event.",
      {
        event_name: input.event_name,
        event_action: input.event_action,
        is_delete_event: input.is_delete_event,
      },
    ),
  );

  checks.push(
    makeCheck(
      "ignored-branch-policy",
      "Ignored branch policy",
      !ignored || args.skip_ignored,
      "warning",
      ignored
        ? args.skip_ignored
          ? "Branch matches an ignored pattern and will be skipped."
          : "Branch matches an ignored pattern but skipped enforcement is disabled."
        : "Branch does not match an ignored pattern.",
      {
        branch,
        ignored,
        ignored_patterns: args.ignored_patterns,
      },
    ),
  );

  if (!branch) {
    return {
      checks,
      branch,
      branch_parts: parts,
      exact_allowed: false,
      exact_exempt: false,
      ignored,
      blocked_pattern: "",
      allowed_patterns: allowedPatterns,
      skipped: false,
    };
  }

  checks.push(
    makeCheck(
      "length",
      "Branch length",
      branch.length >= args.min_length && branch.length <= args.max_length,
      "error",
      `Branch length is ${branch.length}; allowed range is ${args.min_length}-${args.max_length}.`,
      {
        length: branch.length,
        min_length: args.min_length,
        max_length: args.max_length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "not-blocked",
      "Blocked branch patterns",
      !blockedPattern,
      "error",
      blockedPattern
        ? `Branch matches blocked pattern: ${blockedPattern}`
        : "Branch does not match a blocked pattern.",
      {
        blocked_pattern: blockedPattern || "",
        blocked_patterns: args.blocked_patterns,
      },
    ),
  );

  checks.push(
    makeCheck(
      "no-whitespace",
      "No whitespace",
      exactExempt || !/\s/.test(branch),
      "error",
      /\s/.test(branch)
        ? "Branch name contains whitespace."
        : "Branch name does not contain whitespace.",
      {
        branch,
      },
    ),
  );

  checks.push(
    makeCheck(
      "allowed-characters",
      "Allowed characters",
      exactExempt || safeTest(args.allowed_char_pattern, branch),
      "error",
      safeTest(args.allowed_char_pattern, branch)
        ? "Branch name only uses allowed characters."
        : `Branch name contains characters outside allowed pattern: ${args.allowed_char_pattern}`,
      {
        allowed_char_pattern: args.allowed_char_pattern,
      },
    ),
  );

  checks.push(
    makeCheck(
      "lowercase",
      "Lowercase branch name",
      exactExempt || !args.require_lowercase || branch === branch.toLowerCase(),
      "error",
      branch === branch.toLowerCase()
        ? "Branch name is lowercase."
        : "Branch name must be lowercase.",
      {
        require_lowercase: args.require_lowercase,
      },
    ),
  );

  checks.push(
    makeCheck(
      "slash-structure",
      "Slash structure",
      exactExempt ||
        (!branch.startsWith("/") &&
          !branch.endsWith("/") &&
          !branch.includes("//")),
      "error",
      branch.startsWith("/") || branch.endsWith("/") || branch.includes("//")
        ? "Branch name has invalid slash structure."
        : "Branch slash structure is valid.",
      {
        starts_with_slash: branch.startsWith("/"),
        ends_with_slash: branch.endsWith("/"),
        has_double_slash: branch.includes("//"),
      },
    ),
  );

  checks.push(
    makeCheck(
      "dot-structure",
      "Dot structure",
      exactExempt ||
        (!branch.startsWith(".") &&
          !branch.endsWith(".") &&
          !branch.includes("..") &&
          !branch.includes("@{")),
      "error",
      branch.startsWith(".") ||
        branch.endsWith(".") ||
        branch.includes("..") ||
        branch.includes("@{")
        ? "Branch name has invalid dot/ref structure."
        : "Branch dot/ref structure is valid.",
      {
        starts_with_dot: branch.startsWith("."),
        ends_with_dot: branch.endsWith("."),
        has_double_dot: branch.includes(".."),
        has_at_brace: branch.includes("@{"),
      },
    ),
  );

  checks.push(
    makeCheck(
      "lock-suffix",
      "No .lock suffix",
      exactExempt || !branch.endsWith(".lock"),
      "error",
      branch.endsWith(".lock")
        ? "Branch name must not end with .lock."
        : "Branch name does not end with .lock.",
      {
        branch,
      },
    ),
  );

  checks.push(
    makeCheck(
      "separator",
      "Prefix separator",
      exactExempt || !args.require_separator || parts.has_separator,
      "error",
      parts.has_separator
        ? "Branch contains the required prefix separator."
        : "Branch must use / between prefix and slug.",
      {
        require_separator: args.require_separator,
        has_separator: parts.has_separator,
      },
    ),
  );

  checks.push(
    makeCheck(
      "prefix",
      "Allowed prefix",
      exactExempt || !args.require_prefix || allowedByPrefix,
      "error",
      allowedByPrefix
        ? `Branch prefix is allowed: ${parts.prefix}`
        : `Branch prefix is not allowed: ${parts.prefix || "missing"}`,
      {
        prefix: parts.prefix,
        allowed_prefixes: args.allowed_prefixes,
      },
    ),
  );

  checks.push(
    makeCheck(
      "slug",
      "Branch slug",
      exactExempt ||
        !args.require_slug ||
        (Boolean(parts.slug) && parts.slug.length >= args.min_slug_length),
      "error",
      parts.slug && parts.slug.length >= args.min_slug_length
        ? `Branch slug is valid: ${parts.slug}`
        : `Branch slug must be at least ${args.min_slug_length} character(s).`,
      {
        slug: parts.slug,
        min_slug_length: args.min_slug_length,
      },
    ),
  );

  checks.push(
    makeCheck(
      "allowed-policy",
      "Allowed branch policy",
      !args.require_allowed_pattern || allowedByPolicy,
      "error",
      allowedByPolicy
        ? "Branch matches the allowed branch policy."
        : "Branch does not match exact branches, allowed prefixes, or allowed patterns.",
      {
        allowed_by_exact: allowedByExact,
        allowed_by_prefix: allowedByPrefix,
        allowed_by_pattern: allowedByPattern,
        allowed_exact_branches: args.allowed_exact_branches,
        allowed_prefixes: args.allowed_prefixes,
        allowed_patterns: allowedPatterns,
      },
    ),
  );

  checks.push(
    makeCheck(
      "issue-reference",
      "Issue reference",
      !args.require_issue_reference ||
        safeTest(args.issue_reference_pattern, branch, "i"),
      "error",
      safeTest(args.issue_reference_pattern, branch, "i")
        ? "Branch contains an issue reference."
        : "Branch must contain an issue reference.",
      {
        require_issue_reference: args.require_issue_reference,
        issue_reference_pattern: args.issue_reference_pattern,
      },
    ),
  );

  return {
    checks,
    branch,
    branch_parts: parts,
    exact_allowed: exactAllowed,
    exact_exempt: exactExempt,
    ignored,
    blocked_pattern: blockedPattern || "",
    allowed_patterns: allowedPatterns,
    skipped:
      (input.is_tag_ref && args.skip_tags) ||
      (input.is_delete_event && args.skip_delete_events) ||
      (ignored && args.skip_ignored),
  };
}

function summarizeChecks(checks, args) {
  const errors = checks.filter(
    (check) => !check.ok && check.severity === "error",
  );
  const warnings = checks.filter(
    (check) => !check.ok && check.severity === "warning",
  );
  const passed = checks.filter((check) => check.ok);

  return {
    checks: checks.length,
    passed: passed.length,
    failed: errors.length,
    warnings: warnings.length,
    ok: errors.length === 0 && (!args.fail_on_warning || warnings.length === 0),
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  input,
  validation,
) {
  const github = getGitMetadata(repoRoot);
  const totals = summarizeChecks(validation.checks, args);
  const errors = validation.checks
    .filter((check) => !check.ok && check.severity === "error")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const warnings = validation.checks
    .filter((check) => !check.ok && check.severity === "warning")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const status = validation.skipped
    ? "skipped"
    : totals.failed > 0
      ? "invalid"
      : totals.warnings > 0
        ? "warning"
        : "valid";

  const ok = validation.skipped || totals.ok;

  return {
    schema_version: 1,
    type: "repo-enforce-branch-name",
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
      allowed_exact_branches: args.allowed_exact_branches,
      allowed_prefixes: args.allowed_prefixes,
      allowed_patterns: validation.allowed_patterns,
      blocked_patterns: args.blocked_patterns,
      ignored_patterns: args.ignored_patterns,
      allowed_char_pattern: args.allowed_char_pattern,
      issue_reference_pattern: args.issue_reference_pattern,
      require_branch: args.require_branch,
      require_lowercase: args.require_lowercase,
      require_allowed_pattern: args.require_allowed_pattern,
      require_prefix: args.require_prefix,
      require_separator: args.require_separator,
      require_slug: args.require_slug,
      require_issue_reference: args.require_issue_reference,
      allow_exact_branches: args.allow_exact_branches,
      exact_branches_exempt: args.exact_branches_exempt,
      skip_tags: args.skip_tags,
      skip_delete_events: args.skip_delete_events,
      skip_ignored: args.skip_ignored,
      min_length: args.min_length,
      max_length: args.max_length,
      min_slug_length: args.min_slug_length,
      fail_on_warning: args.fail_on_warning,
      dry_run: args.dry_run,
    },
    input,
    branch: {
      name: validation.branch,
      prefix: validation.branch_parts.prefix,
      slug: validation.branch_parts.slug,
      parts: validation.branch_parts.parts,
      has_separator: validation.branch_parts.has_separator,
      exact_allowed: validation.exact_allowed,
      exact_exempt: validation.exact_exempt,
      ignored: validation.ignored,
      blocked_pattern: validation.blocked_pattern,
    },
    checks: validation.checks,
    totals,
    errors,
    warnings,
    status,
    ok,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const icon = report.ok
    ? report.status === "skipped"
      ? "⏭️"
      : "✅"
    : report.status === "warning"
      ? "⚠️"
      : "❌";

  const lines = [
    `# 🌿 ${PROJECT_NAME} Branch Name Enforcement`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Branch: \`${escapeMarkdown(report.branch.name || "unresolved")}\``,
    `- Prefix: \`${escapeMarkdown(report.branch.prefix || "none")}\``,
    `- Slug: \`${escapeMarkdown(report.branch.slug || "none")}\``,
    `- Exact branch: \`${report.branch.exact_allowed ? "true" : "false"}\``,
    `- Exact exempt: \`${report.branch.exact_exempt ? "true" : "false"}\``,
    `- Ignored: \`${report.branch.ignored ? "true" : "false"}\``,
    `- Checks: \`${report.totals.passed}/${report.totals.checks}\` passed`,
    `- Errors: \`${report.totals.failed}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Ref: \`${escapeMarkdown(report.input.ref || report.github.ref || "unknown")}\``,
    `- Event: \`${report.input.event_name || "unknown"}\``,
    `- Action: \`${report.input.event_action || "none"}\``,
    `- Base branch: \`${escapeMarkdown(report.input.base_branch || "none")}\``,
    `- Head branch: \`${escapeMarkdown(report.input.head_branch || "none")}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📏 Branch Policy",
    "",
    `- Exact branches: \`${escapeMarkdown(report.config.allowed_exact_branches.join(", ") || "none")}\``,
    `- Allowed prefixes: \`${escapeMarkdown(report.config.allowed_prefixes.join(", ") || "none")}\``,
    `- Require lowercase: \`${report.config.require_lowercase ? "true" : "false"}\``,
    `- Require prefix: \`${report.config.require_prefix ? "true" : "false"}\``,
    `- Require separator: \`${report.config.require_separator ? "true" : "false"}\``,
    `- Require issue reference: \`${report.config.require_issue_reference ? "true" : "false"}\``,
    `- Length range: \`${report.config.min_length}-${report.config.max_length}\``,
    "",
    "## 🧪 Validation Checks",
    "",
    "| Status | Check | Severity | Message |",
    "|---|---|---|---|",
  ];

  for (const check of report.checks) {
    const statusIcon = check.ok
      ? "✅"
      : check.severity === "warning"
        ? "⚠️"
        : "❌";

    lines.push(
      `| ${statusIcon} \`${check.status}\` | ${escapeMarkdown(check.title)} | \`${check.severity}\` | ${escapeMarkdown(check.message)} |`,
    );
  }

  if (report.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(
        `- \`${escapeMarkdown(error.check)}\`: ${escapeMarkdown(error.message)}`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(
        `- \`${escapeMarkdown(warning.check)}\`: ${escapeMarkdown(warning.message)}`,
      );
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
    `- Pull request number: \`${report.input.pull_request_number || "none"}\``,
  );
  lines.push(`- Tag ref: \`${report.input.is_tag_ref ? "true" : "false"}\``);
  lines.push(
    `- Delete event: \`${report.input.is_delete_event ? "true" : "false"}\``,
  );

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
  setGitHubOutput("branch_name_file", report.config.output_file);
  setGitHubOutput("branch_name_summary_file", report.config.summary_file || "");
  setGitHubOutput("branch_name_status", report.status);
  setGitHubOutput("branch_name_ok", report.ok ? "true" : "false");
  setGitHubOutput("branch_name", report.branch.name || "");
  setGitHubOutput("branch_name_prefix", report.branch.prefix || "");
  setGitHubOutput("branch_name_slug", report.branch.slug || "");
  setGitHubOutput(
    "branch_name_exact_allowed",
    report.branch.exact_allowed ? "true" : "false",
  );
  setGitHubOutput(
    "branch_name_exact_exempt",
    report.branch.exact_exempt ? "true" : "false",
  );
  setGitHubOutput(
    "branch_name_ignored",
    report.branch.ignored ? "true" : "false",
  );
  setGitHubOutput(
    "branch_name_blocked_pattern",
    report.branch.blocked_pattern || "",
  );
  setGitHubOutput("branch_name_errors", String(report.totals.failed));
  setGitHubOutput("branch_name_warnings", String(report.totals.warnings));
  setGitHubOutput("branch_name_checks_json", JSON.stringify(report.checks));
  setGitHubOutput("branch_name_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("branch_name_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Enforcing branch name policy.");

  const github = getGitMetadata(repoRoot);
  const input = collectEventInput(args, repoRoot, github);
  const validation = validateBranch(args, input);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    input,
    validation,
  );
  const markdown = createMarkdownSummary(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

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
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && !report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
