#!/usr/bin/env node
// .github/scripts/release/validate-release-source.js
// =============================================================================
// Aerealith AI — Release Source Validator
// -----------------------------------------------------------------------------
// Purpose:
//   Validate that the current workflow source, git ref, branch, tag, package
//   version, and release artifacts are safe and consistent before release jobs
//   create tags, GitHub releases, npm publishes, or announcements.
//
// Input:
//   - package.json
//   - GitHub event payload
//   - artifacts/release/detect-release-label.json
//   - artifacts/release/determine-release-version.json
//   - artifacts/release/summarize-release.json
//   - optional .github/release/validate-release-source.{json,jsonc,yaml,yml}
//
// Output:
//   - artifacts/release/validate-release-source.json
//   - artifacts/release/validate-release-source.md
//   - GitHub step outputs for downstream release jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate git, GitHub, npm, or release assets.
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
    info: (message) => console.log(`[release-source] ${message}`),
    warn: (message) => console.warn(`[release-source] WARN: ${message}`),
    error: (message) => console.error(`[release-source] ERROR: ${message}`),
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
  ".github/release/validate-release-source.json",
  ".github/release/validate-release-source.jsonc",
  ".github/release/validate-release-source.yaml",
  ".github/release/validate-release-source.yml",
  ".github/release/release-source.json",
  ".github/release/release-source.jsonc",
  ".github/release/release-source.yaml",
  ".github/release/release-source.yml",
  "release/validate-release-source.json",
  "release/validate-release-source.jsonc",
  "release/validate-release-source.yaml",
  "release/validate-release-source.yml",
  "release/release-source.json",
  "release/release-source.jsonc",
  "release/release-source.yaml",
  "release/release-source.yml",
];

const DEFAULT_LABEL_REPORT_FILE = "artifacts/release/detect-release-label.json";
const DEFAULT_VERSION_REPORT_FILE =
  "artifacts/release/determine-release-version.json";
const DEFAULT_RELEASE_SUMMARY_FILE = "artifacts/release/summarize-release.json";
const DEFAULT_PACKAGE_FILE = "package.json";
const DEFAULT_OUTPUT_FILE = "artifacts/release/validate-release-source.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/validate-release-source.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_ALLOWED_BRANCHES = ["main"];
const DEFAULT_ALLOWED_EVENTS = [
  "workflow_dispatch",
  "push",
  "release",
  "repository_dispatch",
];

const DEFAULT_BLOCKED_BRANCH_PATTERNS = [
  "dependabot/**",
  "renovate/**",
  "changeset-release/**",
];

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.VALIDATE_RELEASE_SOURCE_CONFIG_FILE || "",

    event_path:
      process.env.VALIDATE_RELEASE_SOURCE_EVENT_PATH ||
      process.env.GITHUB_EVENT_PATH ||
      "",

    label_report_file:
      process.env.VALIDATE_RELEASE_SOURCE_LABEL_REPORT_FILE ||
      process.env.RELEASE_LABEL_REPORT_FILE ||
      DEFAULT_LABEL_REPORT_FILE,

    version_report_file:
      process.env.VALIDATE_RELEASE_SOURCE_VERSION_REPORT_FILE ||
      process.env.RELEASE_VERSION_REPORT_FILE ||
      DEFAULT_VERSION_REPORT_FILE,

    release_summary_file:
      process.env.VALIDATE_RELEASE_SOURCE_RELEASE_SUMMARY_FILE ||
      process.env.RELEASE_SUMMARY_FILE ||
      DEFAULT_RELEASE_SUMMARY_FILE,

    package_file:
      process.env.VALIDATE_RELEASE_SOURCE_PACKAGE_FILE ||
      process.env.RELEASE_PACKAGE_FILE ||
      DEFAULT_PACKAGE_FILE,

    output_file:
      process.env.VALIDATE_RELEASE_SOURCE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,

    summary_file:
      process.env.VALIDATE_RELEASE_SOURCE_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    release_tag:
      process.env.VALIDATE_RELEASE_SOURCE_TAG || process.env.RELEASE_TAG || "",

    release_version:
      process.env.VALIDATE_RELEASE_SOURCE_VERSION ||
      process.env.RELEASE_VERSION ||
      "",

    source_ref:
      process.env.VALIDATE_RELEASE_SOURCE_REF || process.env.GITHUB_REF || "",

    source_branch:
      process.env.VALIDATE_RELEASE_SOURCE_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      "",

    target_sha:
      process.env.VALIDATE_RELEASE_SOURCE_SHA ||
      process.env.RELEASE_TARGET_SHA ||
      process.env.GITHUB_SHA ||
      "",

    tag_prefix:
      process.env.VALIDATE_RELEASE_SOURCE_TAG_PREFIX ||
      process.env.RELEASE_TAG_PREFIX ||
      "v",

    allowed_branches: normalizeStringList(
      process.env.VALIDATE_RELEASE_SOURCE_ALLOWED_BRANCHES ||
        process.env.RELEASE_ALLOWED_BRANCHES,
    ),

    allowed_events: normalizeStringList(
      process.env.VALIDATE_RELEASE_SOURCE_ALLOWED_EVENTS ||
        process.env.RELEASE_ALLOWED_EVENTS,
    ),

    blocked_branch_patterns: normalizeStringList(
      process.env.VALIDATE_RELEASE_SOURCE_BLOCKED_BRANCH_PATTERNS ||
        process.env.RELEASE_BLOCKED_BRANCH_PATTERNS,
    ),

    require_allowed_branch: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_ALLOWED_BRANCH,
      true,
    ),
    require_allowed_event: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_ALLOWED_EVENT,
      true,
    ),
    require_clean_worktree: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_CLEAN_WORKTREE,
      true,
    ),
    require_version_report: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_VERSION_REPORT,
      true,
    ),
    require_release_summary: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_RELEASE_SUMMARY,
      false,
    ),
    require_release_requested: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_RELEASE_REQUESTED,
      true,
    ),
    require_tag: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_TAG,
      true,
    ),
    require_version: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_VERSION,
      true,
    ),
    require_semver: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_SEMVER,
      true,
    ),
    require_tag_prefix: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_TAG_PREFIX,
      true,
    ),
    require_tag_absent: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_TAG_ABSENT,
      true,
    ),
    require_package_version_match: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_PACKAGE_VERSION_MATCH,
      false,
    ),
    require_target_sha_match: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REQUIRE_TARGET_SHA_MATCH,
      false,
    ),
    reject_pull_request_events: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REJECT_PULL_REQUEST_EVENTS,
      true,
    ),
    reject_fork_pull_requests: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_REJECT_FORK_PULL_REQUESTS,
      true,
    ),
    allow_prerelease: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_ALLOW_PRERELEASE,
      true,
    ),
    allow_no_release: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_ALLOW_NO_RELEASE,
      false,
    ),
    check_remote_tag: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_CHECK_REMOTE_TAG,
      false,
    ),

    remote:
      process.env.VALIDATE_RELEASE_SOURCE_REMOTE ||
      process.env.RELEASE_REMOTE ||
      "origin",

    fail_on_warnings: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_FAIL_ON_WARNINGS,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_FAIL_ON_ERROR,
      true,
    ),

    max_dirty_files: normalizeInteger(
      process.env.VALIDATE_RELEASE_SOURCE_MAX_DIRTY_FILES,
      200,
    ),

    dry_run: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.VALIDATE_RELEASE_SOURCE_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.VALIDATE_RELEASE_SOURCE_STEP_SUMMARY,
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

    if (arg === "--label-report") {
      args.label_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version-report") {
      args.version_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--release-summary") {
      args.release_summary_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-file" || arg === "--package-json") {
      args.package_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.release_tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.release_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--ref") {
      args.source_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      args.source_branch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--sha" || arg === "--target-sha") {
      args.target_sha = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag-prefix") {
      args.tag_prefix = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--allowed-branch" || arg === "--allowed-branches") {
      args.allowed_branches.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--allowed-event" || arg === "--allowed-events") {
      args.allowed_events.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--blocked-branch-pattern") {
      args.blocked_branch_patterns.push(
        ...normalizeStringList(argv[index + 1]),
      );
      index += 1;
      continue;
    }

    if (arg === "--require-allowed-branch") {
      args.require_allowed_branch = true;
      continue;
    }

    if (arg === "--no-require-allowed-branch") {
      args.require_allowed_branch = false;
      continue;
    }

    if (arg === "--require-allowed-event") {
      args.require_allowed_event = true;
      continue;
    }

    if (arg === "--no-require-allowed-event") {
      args.require_allowed_event = false;
      continue;
    }

    if (arg === "--require-clean-worktree") {
      args.require_clean_worktree = true;
      continue;
    }

    if (arg === "--no-require-clean-worktree") {
      args.require_clean_worktree = false;
      continue;
    }

    if (arg === "--require-version-report") {
      args.require_version_report = true;
      continue;
    }

    if (arg === "--no-require-version-report") {
      args.require_version_report = false;
      continue;
    }

    if (arg === "--require-release-summary") {
      args.require_release_summary = true;
      continue;
    }

    if (arg === "--no-require-release-summary") {
      args.require_release_summary = false;
      continue;
    }

    if (arg === "--require-release-requested") {
      args.require_release_requested = true;
      continue;
    }

    if (arg === "--no-require-release-requested") {
      args.require_release_requested = false;
      continue;
    }

    if (arg === "--require-tag") {
      args.require_tag = true;
      continue;
    }

    if (arg === "--no-require-tag") {
      args.require_tag = false;
      continue;
    }

    if (arg === "--require-version") {
      args.require_version = true;
      continue;
    }

    if (arg === "--no-require-version") {
      args.require_version = false;
      continue;
    }

    if (arg === "--require-semver") {
      args.require_semver = true;
      continue;
    }

    if (arg === "--no-require-semver") {
      args.require_semver = false;
      continue;
    }

    if (arg === "--require-tag-prefix") {
      args.require_tag_prefix = true;
      continue;
    }

    if (arg === "--no-require-tag-prefix") {
      args.require_tag_prefix = false;
      continue;
    }

    if (arg === "--require-tag-absent") {
      args.require_tag_absent = true;
      continue;
    }

    if (arg === "--no-require-tag-absent") {
      args.require_tag_absent = false;
      continue;
    }

    if (arg === "--require-package-version-match") {
      args.require_package_version_match = true;
      continue;
    }

    if (arg === "--no-require-package-version-match") {
      args.require_package_version_match = false;
      continue;
    }

    if (arg === "--require-target-sha-match") {
      args.require_target_sha_match = true;
      continue;
    }

    if (arg === "--no-require-target-sha-match") {
      args.require_target_sha_match = false;
      continue;
    }

    if (arg === "--reject-pull-request-events") {
      args.reject_pull_request_events = true;
      continue;
    }

    if (arg === "--allow-pull-request-events") {
      args.reject_pull_request_events = false;
      continue;
    }

    if (arg === "--reject-fork-pull-requests") {
      args.reject_fork_pull_requests = true;
      continue;
    }

    if (arg === "--allow-fork-pull-requests") {
      args.reject_fork_pull_requests = false;
      continue;
    }

    if (arg === "--allow-prerelease") {
      args.allow_prerelease = true;
      continue;
    }

    if (arg === "--no-prerelease") {
      args.allow_prerelease = false;
      continue;
    }

    if (arg === "--allow-no-release") {
      args.allow_no_release = true;
      continue;
    }

    if (arg === "--no-allow-no-release") {
      args.allow_no_release = false;
      continue;
    }

    if (arg === "--check-remote-tag") {
      args.check_remote_tag = true;
      continue;
    }

    if (arg === "--no-check-remote-tag") {
      args.check_remote_tag = false;
      continue;
    }

    if (arg === "--remote") {
      args.remote = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--fail-on-warnings") {
      args.fail_on_warnings = true;
      continue;
    }

    if (arg === "--no-fail-on-warnings") {
      args.fail_on_warnings = false;
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

    if (arg === "--max-dirty-files") {
      args.max_dirty_files = normalizeInteger(
        argv[index + 1],
        args.max_dirty_files,
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
  args.release_tag = normalizeTag(args.release_tag);
  args.release_version = normalizeVersion(args.release_version);
  args.source_ref = normalizeString(args.source_ref);
  args.source_branch = normalizeBranch(args.source_branch);
  args.target_sha = normalizeString(args.target_sha);
  args.tag_prefix = normalizeString(args.tag_prefix, "v");
  args.allowed_branches = [
    ...new Set(
      args.allowed_branches.length
        ? args.allowed_branches
        : DEFAULT_ALLOWED_BRANCHES,
    ),
  ];
  args.allowed_events = [
    ...new Set(
      args.allowed_events.length ? args.allowed_events : DEFAULT_ALLOWED_EVENTS,
    ),
  ];
  args.blocked_branch_patterns = [
    ...new Set(
      args.blocked_branch_patterns.length
        ? args.blocked_branch_patterns
        : DEFAULT_BLOCKED_BRANCH_PATTERNS,
    ),
  ];
  args.remote = normalizeString(args.remote, "origin");
  args.max_dirty_files = Math.max(0, args.max_dirty_files);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Source Validator

Usage:
  node .github/scripts/release/validate-release-source.js [options]

Examples:
  node .github/scripts/release/validate-release-source.js
  node .github/scripts/release/validate-release-source.js --allowed-branch main
  node .github/scripts/release/validate-release-source.js --tag v2.10.0 --version 2.10.0
  node .github/scripts/release/validate-release-source.js --require-package-version-match
  node .github/scripts/release/validate-release-source.js --check-remote-tag --require-tag-absent

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Release source config file.
      --event-path <file>                    GitHub event payload file.
      --label-report <file>                  Release label detection report.
      --version-report <file>                Determine release version report.
      --release-summary <file>               Final release summary report.
      --package-file <file>                  package.json file.
      --tag <tag>                            Release tag.
      --version <version>                    Release version.
      --ref <ref>                            Source ref.
      --branch <branch>                      Source branch.
      --sha <sha>                            Expected target SHA.
      --tag-prefix <prefix>                  Required tag prefix. Default: v.
      --allowed-branch <list>                Branches allowed to release. Default: main.
      --allowed-event <list>                 GitHub events allowed to release.
      --blocked-branch-pattern <glob>        Branch pattern blocked from release.
      --require-allowed-branch               Require source branch to be allowed. Default.
      --no-require-allowed-branch            Do not enforce branch allowlist.
      --require-allowed-event                Require event to be allowed. Default.
      --no-require-allowed-event             Do not enforce event allowlist.
      --require-clean-worktree               Require no uncommitted changes. Default.
      --no-require-clean-worktree            Allow dirty worktree.
      --require-version-report               Require version report. Default.
      --no-require-version-report            Do not require version report.
      --require-release-summary              Require release summary report.
      --no-require-release-summary           Do not require release summary. Default.
      --require-release-requested            Require release decision to be true. Default.
      --no-require-release-requested         Do not require release decision.
      --require-tag                          Require release tag. Default.
      --no-require-tag                       Do not require release tag.
      --require-version                      Require release version. Default.
      --no-require-version                   Do not require release version.
      --require-semver                       Require SemVer-compatible version. Default.
      --no-require-semver                    Skip SemVer validation.
      --require-tag-prefix                   Require tag prefix. Default.
      --no-require-tag-prefix                Skip tag prefix validation.
      --require-tag-absent                   Require tag to not already exist. Default.
      --no-require-tag-absent                Allow existing tag.
      --require-package-version-match        Require package.json version to match release.
      --no-require-package-version-match     Do not require package version match. Default.
      --require-target-sha-match             Require version-report SHA to match current SHA.
      --no-require-target-sha-match          Do not require SHA match. Default.
      --reject-pull-request-events           Block PR release events. Default.
      --allow-pull-request-events            Allow PR release events.
      --reject-fork-pull-requests            Block fork PR releases. Default.
      --allow-fork-pull-requests             Allow fork PR releases.
      --allow-prerelease                     Allow prerelease releases. Default.
      --no-prerelease                        Block prereleases.
      --allow-no-release                     Treat no-release as valid.
      --no-allow-no-release                  Treat no-release as invalid. Default.
      --check-remote-tag                     Check remote tag existence.
      --no-check-remote-tag                  Skip remote tag check. Default.
      --remote <name>                        Git remote. Default: origin.
      --fail-on-warnings                     Exit non-zero on warnings.
      --no-fail-on-warnings                  Do not fail on warnings. Default.
      --fail-on-error                        Exit non-zero on validation failure. Default.
      --no-fail-on-error                     Do not fail workflow.
      --max-dirty-files <number>             Dirty file preview limit. Default: 200.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan but do not write files.
      --no-print                             Do not print JSON report.
      --no-step-summary                      Do not append GitHub step summary.
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
        maxBuffer: 32 * 1024 * 1024,
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

  const stringKeys = [
    "event_path",
    "label_report_file",
    "version_report_file",
    "release_summary_file",
    "package_file",
    "output_file",
    "summary_file",
    "release_tag",
    "release_version",
    "source_ref",
    "source_branch",
    "target_sha",
    "tag_prefix",
    "remote",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = [
    "allowed_branches",
    "allowed_events",
    "blocked_branch_patterns",
  ];

  for (const key of listKeys) {
    if (Array.isArray(config[key]) && !merged[key].length) {
      merged[key] = config[key].map(String);
    }
  }

  const booleanKeys = [
    "require_allowed_branch",
    "require_allowed_event",
    "require_clean_worktree",
    "require_version_report",
    "require_release_summary",
    "require_release_requested",
    "require_tag",
    "require_version",
    "require_semver",
    "require_tag_prefix",
    "require_tag_absent",
    "require_package_version_match",
    "require_target_sha_match",
    "reject_pull_request_events",
    "reject_fork_pull_requests",
    "allow_prerelease",
    "allow_no_release",
    "check_remote_tag",
    "fail_on_warnings",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_dirty_files !== undefined) {
    merged.max_dirty_files = normalizeInteger(
      config.max_dirty_files,
      merged.max_dirty_files,
    );
  }

  merged.release_tag = normalizeTag(merged.release_tag);
  merged.release_version = normalizeVersion(merged.release_version);
  merged.source_branch = normalizeBranch(merged.source_branch);
  merged.allowed_branches = [
    ...new Set(
      merged.allowed_branches.length
        ? merged.allowed_branches
        : DEFAULT_ALLOWED_BRANCHES,
    ),
  ];
  merged.allowed_events = [
    ...new Set(
      merged.allowed_events.length
        ? merged.allowed_events
        : DEFAULT_ALLOWED_EVENTS,
    ),
  ];
  merged.blocked_branch_patterns = [
    ...new Set(
      merged.blocked_branch_patterns.length
        ? merged.blocked_branch_patterns
        : DEFAULT_BLOCKED_BRANCH_PATTERNS,
    ),
  ];

  return merged;
}

function normalizeTag(value) {
  const tag = normalizeString(value);

  if (!tag) return "";

  return tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
}

function normalizeVersion(value) {
  const version = normalizeString(value);

  if (!version) return "";

  return version.startsWith("v") ? version : `v${version}`;
}

function stripVersionPrefix(value) {
  return normalizeString(value)
    .replace(/^refs\/tags\//, "")
    .replace(/^v/, "");
}

function normalizeBranch(value) {
  const branch = normalizeString(value);

  if (!branch) return "";

  if (branch.startsWith("refs/heads/"))
    return branch.slice("refs/heads/".length);
  if (branch.startsWith("origin/")) return branch.slice("origin/".length);

  return branch;
}

function isSemver(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    stripVersionPrefix(value),
  );
}

function parseEventPayload(args, repoRoot) {
  if (!args.event_path) return null;

  return readJsonFile(args.event_path, repoRoot, null);
}

function eventPullRequestInfo(event) {
  const pullRequest = event?.pull_request;

  if (!pullRequest) {
    return {
      is_pull_request: false,
      number: "",
      head_repo: "",
      base_repo: "",
      head_ref: "",
      base_ref: "",
      from_fork: false,
    };
  }

  const headRepo = pullRequest.head?.repo?.full_name || "";
  const baseRepo = pullRequest.base?.repo?.full_name || "";

  return {
    is_pull_request: true,
    number: pullRequest.number ? String(pullRequest.number) : "",
    head_repo: headRepo,
    base_repo: baseRepo,
    head_ref: pullRequest.head?.ref || "",
    base_ref: pullRequest.base?.ref || "",
    from_fork: Boolean(headRepo && baseRepo && headRepo !== baseRepo),
  };
}

function resolveEventName(event, github) {
  return normalizeString(
    process.env.GITHUB_EVENT_NAME || github.event_name || event?.action,
  );
}

function resolveSourceBranch(args, github, event, prInfo) {
  if (args.source_branch) return args.source_branch;

  if (prInfo.is_pull_request) {
    return normalizeBranch(
      prInfo.base_ref || github.base_branch || github.branch,
    );
  }

  if (github.branch) return normalizeBranch(github.branch);

  if (event?.ref) {
    if (String(event.ref).startsWith("refs/heads/")) {
      return normalizeBranch(event.ref);
    }

    if (String(event.ref).startsWith("refs/tags/")) {
      return "";
    }
  }

  return normalizeBranch(
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], { fallback: "" }),
  );
}

function resolveReleaseFromReports(args, repoRoot) {
  const labelReport = readJsonFile(args.label_report_file, repoRoot, null);
  const versionReport = readJsonFile(args.version_report_file, repoRoot, null);
  const releaseSummary = readJsonFile(
    args.release_summary_file,
    repoRoot,
    null,
  );
  const packageJson = readJsonFile(args.package_file, repoRoot, null);

  const tag =
    normalizeTag(args.release_tag) ||
    normalizeTag(releaseSummary?.release?.tag) ||
    normalizeTag(versionReport?.release?.tag);

  const version =
    normalizeVersion(args.release_version) ||
    normalizeVersion(releaseSummary?.release?.version) ||
    normalizeVersion(versionReport?.release?.version);

  const shouldRelease =
    releaseSummary?.release?.should_release ??
    versionReport?.release?.should_release ??
    labelReport?.release?.should_release ??
    labelReport?.detection?.should_release ??
    Boolean(tag || version);

  const skipRelease =
    releaseSummary?.release?.skip_release ??
    versionReport?.release?.skip_release ??
    labelReport?.release?.skip_release ??
    labelReport?.detection?.skip_release ??
    false;

  const prerelease =
    releaseSummary?.release?.prerelease ??
    versionReport?.release?.prerelease ??
    labelReport?.release?.prerelease ??
    labelReport?.detection?.prerelease ??
    false;

  const releaseChannel =
    releaseSummary?.release?.release_channel ||
    versionReport?.release?.release_channel ||
    labelReport?.release?.release_channel ||
    labelReport?.detection?.release_channel ||
    "stable";

  const releaseType =
    releaseSummary?.release?.release_type ||
    versionReport?.release?.release_type ||
    labelReport?.release?.release_type ||
    labelReport?.detection?.release_type ||
    "none";

  const targetSha =
    normalizeString(args.target_sha) ||
    normalizeString(versionReport?.github?.sha) ||
    normalizeString(releaseSummary?.github?.sha) ||
    normalizeString(process.env.GITHUB_SHA) ||
    "";

  return {
    label_report_available: Boolean(labelReport),
    version_report_available: Boolean(versionReport),
    release_summary_available: Boolean(releaseSummary),
    package_file_available: Boolean(packageJson),
    package_version: normalizeVersion(packageJson?.version || ""),
    tag,
    version,
    should_release: Boolean(shouldRelease && !skipRelease),
    skip_release: Boolean(skipRelease),
    prerelease: Boolean(prerelease),
    release_channel: releaseChannel,
    release_type: releaseType,
    target_sha: targetSha,
    label_report: labelReport,
    version_report: versionReport,
    release_summary: releaseSummary,
  };
}

function getGitState(args, repoRoot, release) {
  const currentSha = runGit(["rev-parse", "HEAD"], { repoRoot, fallback: "" });
  const shortSha = runGit(["rev-parse", "--short=12", "HEAD"], {
    repoRoot,
    fallback: "",
  });
  const currentBranch = normalizeBranch(
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot, fallback: "" }),
  );
  const statusOutput = runGit(["status", "--porcelain"], {
    repoRoot,
    fallback: "",
  });
  const dirtyFiles = statusOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, args.max_dirty_files || undefined);

  const tag = release.tag;
  const localTagExists = tag
    ? Boolean(
        runGit(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
          repoRoot,
          fallback: "",
        }),
      )
    : false;

  const remoteTagExists =
    args.check_remote_tag && tag
      ? Boolean(
          runGit(["ls-remote", "--tags", args.remote, `refs/tags/${tag}`], {
            repoRoot,
            fallback: "",
          }),
        )
      : false;

  return {
    current_sha: currentSha,
    current_short_sha: shortSha,
    current_branch: currentBranch,
    worktree_dirty: dirtyFiles.length > 0,
    dirty_files: dirtyFiles,
    dirty_file_count: statusOutput.split(/\r?\n/).filter(Boolean).length,
    dirty_files_truncated:
      args.max_dirty_files > 0 &&
      statusOutput.split(/\r?\n/).filter(Boolean).length > args.max_dirty_files,
    local_tag_exists: localTagExists,
    remote_tag_exists: remoteTagExists,
    remote_checked: args.check_remote_tag,
    remote: args.remote,
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

function matchesPattern(value, pattern) {
  const normalizedValue = normalizeString(value);
  const normalizedPattern = normalizeString(pattern);

  if (!normalizedValue || !normalizedPattern) return false;

  if (hasGlob(normalizedPattern)) {
    return globToRegExp(normalizedPattern).test(normalizedValue);
  }

  return normalizedValue === normalizedPattern;
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

function validateSource(args, context) {
  const checks = [];
  const {
    github,
    event,
    event_name: eventName,
    pr_info: prInfo,
    source_branch: sourceBranch,
    release,
    git,
  } = context;

  checks.push(
    makeCheck(
      "event-allowed",
      "Allowed GitHub event",
      !args.require_allowed_event || args.allowed_events.includes(eventName),
      "error",
      args.allowed_events.includes(eventName)
        ? `Event is allowed: ${eventName}`
        : `Event is not allowed for releases: ${eventName || "unknown"}`,
      {
        event_name: eventName,
        allowed_events: args.allowed_events,
      },
    ),
  );

  checks.push(
    makeCheck(
      "pull-request-event",
      "Pull request event policy",
      !args.reject_pull_request_events || !prInfo.is_pull_request,
      "error",
      prInfo.is_pull_request
        ? "Pull request events are blocked from release."
        : "Current event is not a pull request event.",
      {
        is_pull_request: prInfo.is_pull_request,
        pull_request_number: prInfo.number,
      },
    ),
  );

  checks.push(
    makeCheck(
      "fork-pull-request",
      "Fork pull request policy",
      !args.reject_fork_pull_requests || !prInfo.from_fork,
      "error",
      prInfo.from_fork
        ? "Fork pull requests are blocked from release."
        : "Current event is not a fork pull request.",
      {
        from_fork: prInfo.from_fork,
        head_repo: prInfo.head_repo,
        base_repo: prInfo.base_repo,
      },
    ),
  );

  const allowedBranch =
    !sourceBranch ||
    args.allowed_branches.some((branch) =>
      matchesPattern(sourceBranch, branch),
    );

  checks.push(
    makeCheck(
      "branch-allowed",
      "Allowed release branch",
      !args.require_allowed_branch || allowedBranch,
      "error",
      allowedBranch
        ? `Source branch is allowed: ${sourceBranch || "tag/ref-only"}`
        : `Source branch is not allowed for releases: ${sourceBranch || "unknown"}`,
      {
        source_branch: sourceBranch,
        allowed_branches: args.allowed_branches,
      },
    ),
  );

  const blockedBranch = args.blocked_branch_patterns.find((pattern) =>
    matchesPattern(sourceBranch, pattern),
  );

  checks.push(
    makeCheck(
      "branch-not-blocked",
      "Blocked branch policy",
      !blockedBranch,
      "error",
      blockedBranch
        ? `Source branch matches blocked release pattern: ${blockedBranch}`
        : "Source branch does not match a blocked release pattern.",
      {
        source_branch: sourceBranch,
        blocked_branch_patterns: args.blocked_branch_patterns,
        matched_pattern: blockedBranch || "",
      },
    ),
  );

  checks.push(
    makeCheck(
      "version-report-present",
      "Version report presence",
      !args.require_version_report || release.version_report_available,
      "error",
      release.version_report_available
        ? "Release version report is available."
        : `Release version report is missing: ${args.version_report_file}`,
      {
        file: args.version_report_file,
        available: release.version_report_available,
      },
    ),
  );

  checks.push(
    makeCheck(
      "release-summary-present",
      "Release summary presence",
      !args.require_release_summary || release.release_summary_available,
      "error",
      release.release_summary_available
        ? "Release summary report is available."
        : `Release summary report is missing: ${args.release_summary_file}`,
      {
        file: args.release_summary_file,
        available: release.release_summary_available,
      },
    ),
  );

  const releaseRequested = release.should_release || args.allow_no_release;

  checks.push(
    makeCheck(
      "release-requested",
      "Release requested",
      !args.require_release_requested || releaseRequested,
      args.allow_no_release ? "warning" : "error",
      release.should_release
        ? "Release artifacts indicate that a release should be created."
        : release.skip_release
          ? "Release artifacts indicate that this release should be skipped."
          : "Release artifacts do not indicate that a release should be created.",
      {
        should_release: release.should_release,
        skip_release: release.skip_release,
        allow_no_release: args.allow_no_release,
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-present",
      "Release tag present",
      !args.require_tag || Boolean(release.tag),
      "error",
      release.tag
        ? `Release tag resolved: ${release.tag}`
        : "Release tag could not be resolved.",
      {
        tag: release.tag,
      },
    ),
  );

  checks.push(
    makeCheck(
      "version-present",
      "Release version present",
      !args.require_version || Boolean(release.version),
      "error",
      release.version
        ? `Release version resolved: ${release.version}`
        : "Release version could not be resolved.",
      {
        version: release.version,
      },
    ),
  );

  checks.push(
    makeCheck(
      "version-semver",
      "Release version SemVer",
      !args.require_semver || !release.version || isSemver(release.version),
      "error",
      release.version && isSemver(release.version)
        ? `Release version is SemVer-compatible: ${stripVersionPrefix(release.version)}`
        : `Release version is not SemVer-compatible: ${release.version || "missing"}`,
      {
        version: release.version,
        normalized_version: stripVersionPrefix(release.version),
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-prefix",
      "Release tag prefix",
      !args.require_tag_prefix ||
        !release.tag ||
        !args.tag_prefix ||
        release.tag.startsWith(args.tag_prefix),
      "error",
      release.tag && args.tag_prefix && release.tag.startsWith(args.tag_prefix)
        ? `Release tag uses required prefix: ${args.tag_prefix}`
        : `Release tag does not use required prefix: ${args.tag_prefix}`,
      {
        tag: release.tag,
        tag_prefix: args.tag_prefix,
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-version-match",
      "Tag/version consistency",
      !release.tag ||
        !release.version ||
        stripVersionPrefix(release.tag) === stripVersionPrefix(release.version),
      "error",
      stripVersionPrefix(release.tag) === stripVersionPrefix(release.version)
        ? "Release tag and version match."
        : `Release tag and version do not match: ${release.tag} vs ${release.version}`,
      {
        tag: release.tag,
        version: release.version,
        tag_without_prefix: stripVersionPrefix(release.tag),
        version_without_prefix: stripVersionPrefix(release.version),
      },
    ),
  );

  checks.push(
    makeCheck(
      "prerelease-allowed",
      "Prerelease policy",
      args.allow_prerelease || !release.prerelease,
      "error",
      release.prerelease
        ? "Release is a prerelease."
        : "Release is not a prerelease.",
      {
        prerelease: release.prerelease,
        allow_prerelease: args.allow_prerelease,
        release_channel: release.release_channel,
      },
    ),
  );

  checks.push(
    makeCheck(
      "package-version-match",
      "Package version consistency",
      !args.require_package_version_match ||
        !release.package_version ||
        !release.version ||
        stripVersionPrefix(release.package_version) ===
          stripVersionPrefix(release.version),
      "error",
      stripVersionPrefix(release.package_version) ===
        stripVersionPrefix(release.version)
        ? "package.json version matches the release version."
        : `package.json version does not match release version: ${release.package_version || "missing"} vs ${release.version || "missing"}`,
      {
        package_version: release.package_version,
        release_version: release.version,
        package_file_available: release.package_file_available,
      },
    ),
  );

  checks.push(
    makeCheck(
      "worktree-clean",
      "Clean worktree",
      !args.require_clean_worktree || !git.worktree_dirty,
      "error",
      git.worktree_dirty
        ? `Worktree has ${git.dirty_file_count} dirty file(s).`
        : "Worktree is clean.",
      {
        dirty_file_count: git.dirty_file_count,
        dirty_files: git.dirty_files,
        dirty_files_truncated: git.dirty_files_truncated,
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-absent-local",
      "Local tag absence",
      !args.require_tag_absent || !git.local_tag_exists,
      "error",
      git.local_tag_exists
        ? `Local release tag already exists: ${release.tag}`
        : "Local release tag does not already exist.",
      {
        tag: release.tag,
        local_tag_exists: git.local_tag_exists,
      },
    ),
  );

  checks.push(
    makeCheck(
      "tag-absent-remote",
      "Remote tag absence",
      !args.require_tag_absent ||
        !args.check_remote_tag ||
        !git.remote_tag_exists,
      "error",
      git.remote_tag_exists
        ? `Remote release tag already exists: ${args.remote}/${release.tag}`
        : args.check_remote_tag
          ? "Remote release tag does not already exist."
          : "Remote tag check was not enabled.",
      {
        tag: release.tag,
        remote: args.remote,
        remote_checked: args.check_remote_tag,
        remote_tag_exists: git.remote_tag_exists,
      },
    ),
  );

  checks.push(
    makeCheck(
      "target-sha-match",
      "Target SHA consistency",
      !args.require_target_sha_match ||
        !release.target_sha ||
        !git.current_sha ||
        release.target_sha === git.current_sha,
      "error",
      release.target_sha &&
        git.current_sha &&
        release.target_sha === git.current_sha
        ? "Release target SHA matches current HEAD."
        : `Release target SHA does not match current HEAD: ${release.target_sha || "missing"} vs ${git.current_sha || "missing"}`,
      {
        release_target_sha: release.target_sha,
        current_sha: git.current_sha,
        github_sha: github.sha,
      },
    ),
  );

  checks.push(
    makeCheck(
      "event-payload-readable",
      "Event payload readable",
      !args.event_path || Boolean(event),
      "warning",
      event
        ? "GitHub event payload was read successfully."
        : args.event_path
          ? `GitHub event payload could not be read: ${args.event_path}`
          : "No GitHub event payload path was provided.",
      {
        event_path: args.event_path,
        available: Boolean(event),
      },
    ),
  );

  return checks;
}

function summarizeChecks(checks, args) {
  const errors = checks.filter(
    (check) => !check.ok && check.severity === "error",
  );
  const warnings = checks.filter(
    (check) => !check.ok && check.severity === "warning",
  );
  const passed = checks.filter((check) => check.ok);

  const ok =
    errors.length === 0 && (!args.fail_on_warnings || warnings.length === 0);

  return {
    checks: checks.length,
    passed: passed.length,
    failed: errors.length,
    warnings: warnings.length,
    ok,
  };
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  context,
  checks,
) {
  const totals = summarizeChecks(checks, args);
  const errors = checks
    .filter((check) => !check.ok && check.severity === "error")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const warnings = checks
    .filter((check) => !check.ok && check.severity === "warning")
    .map((check) => ({
      check: check.id,
      title: check.title,
      message: check.message,
    }));

  const status =
    !context.release.should_release && args.allow_no_release
      ? "no-release"
      : totals.failed > 0
        ? "invalid"
        : totals.warnings > 0
          ? "warning"
          : "valid";

  return {
    schema_version: 1,
    type: "release-source-validation",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: context.github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      event_path: args.event_path
        ? toRelativePath(resolvePath(args.event_path, repoRoot), repoRoot)
        : null,
      label_report_file: toRelativePath(
        resolvePath(args.label_report_file, repoRoot),
        repoRoot,
      ),
      version_report_file: toRelativePath(
        resolvePath(args.version_report_file, repoRoot),
        repoRoot,
      ),
      release_summary_file: toRelativePath(
        resolvePath(args.release_summary_file, repoRoot),
        repoRoot,
      ),
      package_file: toRelativePath(
        resolvePath(args.package_file, repoRoot),
        repoRoot,
      ),
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      tag_prefix: args.tag_prefix,
      allowed_branches: args.allowed_branches,
      allowed_events: args.allowed_events,
      blocked_branch_patterns: args.blocked_branch_patterns,
      require_allowed_branch: args.require_allowed_branch,
      require_allowed_event: args.require_allowed_event,
      require_clean_worktree: args.require_clean_worktree,
      require_version_report: args.require_version_report,
      require_release_summary: args.require_release_summary,
      require_release_requested: args.require_release_requested,
      require_tag: args.require_tag,
      require_version: args.require_version,
      require_semver: args.require_semver,
      require_tag_prefix: args.require_tag_prefix,
      require_tag_absent: args.require_tag_absent,
      require_package_version_match: args.require_package_version_match,
      require_target_sha_match: args.require_target_sha_match,
      reject_pull_request_events: args.reject_pull_request_events,
      reject_fork_pull_requests: args.reject_fork_pull_requests,
      allow_prerelease: args.allow_prerelease,
      allow_no_release: args.allow_no_release,
      check_remote_tag: args.check_remote_tag,
      remote: args.remote,
      fail_on_warnings: args.fail_on_warnings,
      dry_run: args.dry_run,
    },
    source: {
      event_name: context.event_name,
      ref: context.source_ref,
      branch: context.source_branch,
      current_branch: context.git.current_branch,
      current_sha: context.git.current_sha,
      current_short_sha: context.git.current_short_sha,
      target_sha: context.release.target_sha,
      actor: context.github.actor,
      workflow: context.github.workflow,
      run_id: context.github.run_id,
    },
    pull_request: context.pr_info,
    release: {
      should_release: context.release.should_release,
      skip_release: context.release.skip_release,
      tag: context.release.tag,
      version: context.release.version,
      version_without_prefix: stripVersionPrefix(context.release.version),
      package_version: context.release.package_version,
      release_type: context.release.release_type,
      release_channel: context.release.release_channel,
      prerelease: context.release.prerelease,
      label_report_available: context.release.label_report_available,
      version_report_available: context.release.version_report_available,
      release_summary_available: context.release.release_summary_available,
      package_file_available: context.release.package_file_available,
    },
    git: context.git,
    checks,
    totals,
    errors,
    warnings,
    status,
    ok: totals.ok,
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
  const icon = report.ok ? "✅" : report.status === "warning" ? "⚠️" : "❌";

  const lines = [
    `# 🛡️ ${PROJECT_NAME} Release Source Validation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Checks: \`${report.totals.passed}/${report.totals.checks}\` passed`,
    `- Errors: \`${report.totals.failed}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Release requested: \`${report.release.should_release ? "true" : "false"}\``,
    `- Tag: \`${report.release.tag || "unresolved"}\``,
    `- Version: \`${report.release.version || "unresolved"}\``,
    `- Branch: \`${report.source.branch || "unknown"}\``,
    `- Event: \`${report.source.event_name || "unknown"}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Ref: \`${report.source.ref || "unknown"}\``,
    `- Current branch: \`${report.source.current_branch || "unknown"}\``,
    `- Current SHA: \`${report.source.current_short_sha || report.source.current_sha || "unknown"}\``,
    `- Target SHA: \`${report.source.target_sha || "unknown"}\``,
    `- Actor: \`${report.source.actor || "unknown"}\``,
    `- Workflow: \`${report.source.workflow || "unknown"}\``,
    `- Run: \`${report.source.run_id || "unknown"}\``,
    "",
    "## 🎯 Release Input",
    "",
    `- Release type: \`${report.release.release_type || "none"}\``,
    `- Release channel: \`${report.release.release_channel || "stable"}\``,
    `- Prerelease: \`${report.release.prerelease ? "true" : "false"}\``,
    `- package.json version: \`${report.release.package_version || "none"}\``,
    `- Label report available: \`${report.release.label_report_available ? "true" : "false"}\``,
    `- Version report available: \`${report.release.version_report_available ? "true" : "false"}\``,
    `- Release summary available: \`${report.release.release_summary_available ? "true" : "false"}\``,
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

  if (report.git.worktree_dirty) {
    lines.push("");
    lines.push("## 🧹 Dirty Worktree Preview");
    lines.push("");

    for (const file of report.git.dirty_files) {
      lines.push(`- \`${escapeMarkdown(file)}\``);
    }

    if (report.git.dirty_files_truncated) {
      lines.push("- _Dirty file list was truncated._");
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
  lines.push(`- Label report: \`${report.config.label_report_file}\``);
  lines.push(`- Version report: \`${report.config.version_report_file}\``);
  lines.push(`- Release summary: \`${report.config.release_summary_file}\``);
  lines.push(`- Package file: \`${report.config.package_file}\``);

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
  setGitHubOutput("release_source_file", report.config.output_file);
  setGitHubOutput(
    "release_source_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("release_source_status", report.status);
  setGitHubOutput("release_source_ok", report.ok ? "true" : "false");

  setGitHubOutput("release_source_event", report.source.event_name || "");
  setGitHubOutput("release_source_ref", report.source.ref || "");
  setGitHubOutput("release_source_branch", report.source.branch || "");
  setGitHubOutput("release_source_sha", report.source.current_sha || "");
  setGitHubOutput("release_source_target_sha", report.source.target_sha || "");

  setGitHubOutput(
    "release_should_release",
    report.release.should_release ? "true" : "false",
  );
  setGitHubOutput(
    "release_skip",
    report.release.skip_release ? "true" : "false",
  );
  setGitHubOutput("release_type", report.release.release_type || "");
  setGitHubOutput("release_channel", report.release.release_channel || "");
  setGitHubOutput(
    "release_prerelease",
    report.release.prerelease ? "true" : "false",
  );
  setGitHubOutput("release_tag", report.release.tag || "");
  setGitHubOutput("release_version", report.release.version || "");
  setGitHubOutput(
    "release_version_without_prefix",
    report.release.version_without_prefix || "",
  );
  setGitHubOutput(
    "release_package_version",
    report.release.package_version || "",
  );

  setGitHubOutput("release_source_checks", String(report.totals.checks));
  setGitHubOutput("release_source_passed", String(report.totals.passed));
  setGitHubOutput("release_source_errors", String(report.totals.failed));
  setGitHubOutput("release_source_warnings", String(report.totals.warnings));
  setGitHubOutput(
    "release_source_worktree_dirty",
    report.git.worktree_dirty ? "true" : "false",
  );
  setGitHubOutput(
    "release_source_local_tag_exists",
    report.git.local_tag_exists ? "true" : "false",
  );
  setGitHubOutput(
    "release_source_remote_tag_exists",
    report.git.remote_tag_exists ? "true" : "false",
  );

  setGitHubOutput("release_source_checks_json", JSON.stringify(report.checks));
  setGitHubOutput("release_source_errors_json", JSON.stringify(report.errors));
  setGitHubOutput(
    "release_source_warnings_json",
    JSON.stringify(report.warnings),
  );
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Validating release source.");

  const github = getGitMetadata(repoRoot);
  const event = parseEventPayload(args, repoRoot);
  const prInfo = eventPullRequestInfo(event);
  const eventName = resolveEventName(event, github);
  const sourceBranch = resolveSourceBranch(args, github, event, prInfo);
  const sourceRef = args.source_ref || github.ref || event?.ref || "";
  const release = resolveReleaseFromReports(args, repoRoot);
  const git = getGitState(args, repoRoot, release);

  const context = {
    github,
    event,
    event_name: eventName,
    pr_info: prInfo,
    source_branch: sourceBranch,
    source_ref: sourceRef,
    release,
    git,
  };

  const checks = validateSource(args, context);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    context,
    checks,
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
