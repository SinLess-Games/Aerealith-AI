#!/usr/bin/env node
// .github/scripts/release/build-changelog.js
// =============================================================================
// Aerealith AI — Release Changelog Builder
// -----------------------------------------------------------------------------
// Purpose:
//   Build a pretty, emoji-enhanced changelog from git history for release notes,
//   GitHub step summaries, artifacts, and optional CHANGELOG.md updates.
//
// Input:
//   - Git history
//   - package.json
//   - .github/release/changelog.json
//   - .github/release/changelog.jsonc
//   - .github/release/changelog.yaml
//   - .github/release/changelog.yml
//   - .github/release/build-changelog.json
//   - .github/release/build-changelog.jsonc
//   - .github/release/build-changelog.yaml
//   - .github/release/build-changelog.yml
//
// Output:
//   - artifacts/release/build-changelog.json
//   - artifacts/release/build-changelog.md
//   - optional CHANGELOG.md update
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Safe for CI.
//   - Does not call AI services.
//   - Uses Conventional Commit metadata when available.
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
    info: (message) => console.log(`[release-changelog] ${message}`),
    warn: (message) => console.warn(`[release-changelog] WARN: ${message}`),
    error: (message) => console.error(`[release-changelog] ERROR: ${message}`),
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
  ".github/release/build-changelog.json",
  ".github/release/build-changelog.jsonc",
  ".github/release/build-changelog.yaml",
  ".github/release/build-changelog.yml",
  ".github/release/changelog.json",
  ".github/release/changelog.jsonc",
  ".github/release/changelog.yaml",
  ".github/release/changelog.yml",
  "release/build-changelog.json",
  "release/build-changelog.jsonc",
  "release/build-changelog.yaml",
  "release/build-changelog.yml",
  "release/changelog.json",
  "release/changelog.jsonc",
  "release/changelog.yaml",
  "release/changelog.yml",
];

const DEFAULT_OUTPUT_FILE = "artifacts/release/build-changelog.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/build-changelog.md";
const DEFAULT_CHANGELOG_FILE = "CHANGELOG.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|_authToken=[^\s]+|NPM_TOKEN=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|CLOUDFLARE_API_TOKEN=[^\s]+|OPENAI_API_KEY=[^\s]+|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/gi;

const CATEGORY_DEFINITIONS = [
  {
    id: "breaking",
    title: "💥 Breaking Changes",
    emoji: "💥",
    hidden_when_empty: true,
  },
  {
    id: "security",
    title: "🔐 Security",
    emoji: "🔐",
    types: ["security", "sec"],
    keywords: [
      "security",
      "vulnerability",
      "vulnerabilities",
      "cve",
      "audit",
      "secret",
      "token",
    ],
  },
  {
    id: "features",
    title: "✨ Features",
    emoji: "✨",
    types: ["feat", "feature"],
  },
  {
    id: "fixes",
    title: "🐛 Fixes",
    emoji: "🐛",
    types: ["fix", "bugfix", "hotfix"],
  },
  {
    id: "performance",
    title: "⚡ Performance",
    emoji: "⚡",
    types: ["perf", "performance"],
  },
  {
    id: "refactors",
    title: "♻️ Refactors",
    emoji: "♻️",
    types: ["refactor"],
  },
  {
    id: "docs",
    title: "📚 Documentation",
    emoji: "📚",
    types: ["docs", "doc"],
    keywords: ["readme", "documentation", "docs"],
  },
  {
    id: "tests",
    title: "🧪 Tests",
    emoji: "🧪",
    types: ["test", "tests"],
  },
  {
    id: "ci",
    title: "👷 CI/CD",
    emoji: "👷",
    types: ["ci", "workflow", "workflows"],
    keywords: ["github action", "workflow", "ci", "pipeline"],
  },
  {
    id: "build",
    title: "🏗️ Build System",
    emoji: "🏗️",
    types: ["build"],
    keywords: ["build", "compiler", "bundle", "bundler"],
  },
  {
    id: "dependencies",
    title: "📦 Dependencies",
    emoji: "📦",
    types: ["deps", "dependency", "dependencies"],
    keywords: [
      "dependabot",
      "dependency",
      "dependencies",
      "npm",
      "pnpm",
      "yarn",
      "package",
    ],
  },
  {
    id: "docker",
    title: "🐳 Docker",
    emoji: "🐳",
    types: ["docker", "container", "containers"],
    keywords: ["docker", "container", "image", "dockerfile", "ghcr"],
  },
  {
    id: "cloudflare",
    title: "☁️ Cloudflare",
    emoji: "☁️",
    types: ["cloudflare", "cf"],
    keywords: [
      "cloudflare",
      "worker",
      "workers",
      "pages",
      "d1",
      "r2",
      "kv",
      "queue",
    ],
  },
  {
    id: "release",
    title: "🚀 Release",
    emoji: "🚀",
    types: ["release"],
    keywords: ["release", "version", "changelog"],
  },
  {
    id: "style",
    title: "🎨 Style",
    emoji: "🎨",
    types: ["style"],
  },
  {
    id: "chores",
    title: "🧹 Chores",
    emoji: "🧹",
    types: ["chore", "cleanup", "maintenance"],
  },
  {
    id: "reverts",
    title: "⏪ Reverts",
    emoji: "⏪",
    types: ["revert"],
    keywords: ["revert"],
  },
  {
    id: "merges",
    title: "🔀 Merged Pull Requests",
    emoji: "🔀",
    keywords: ["merge pull request", "merge branch"],
  },
  {
    id: "other",
    title: "🧩 Other Changes",
    emoji: "🧩",
  },
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.RELEASE_CHANGELOG_CONFIG_FILE || "",

    output_file:
      process.env.RELEASE_CHANGELOG_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.RELEASE_CHANGELOG_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    changelog_file:
      process.env.RELEASE_CHANGELOG_FILE || DEFAULT_CHANGELOG_FILE,

    from_ref:
      process.env.RELEASE_CHANGELOG_FROM_REF ||
      process.env.RELEASE_CHANGELOG_BASE_REF ||
      process.env.RELEASE_PREVIOUS_TAG ||
      "",
    to_ref:
      process.env.RELEASE_CHANGELOG_TO_REF ||
      process.env.RELEASE_CHANGELOG_HEAD_REF ||
      process.env.GITHUB_SHA ||
      "HEAD",
    previous_tag:
      process.env.RELEASE_CHANGELOG_PREVIOUS_TAG ||
      process.env.RELEASE_PREVIOUS_TAG ||
      "",
    tag:
      process.env.RELEASE_CHANGELOG_TAG ||
      process.env.RELEASE_TAG ||
      process.env.GITHUB_REF_NAME ||
      "",
    version:
      process.env.RELEASE_CHANGELOG_VERSION ||
      process.env.RELEASE_VERSION ||
      "",
    release_name:
      process.env.RELEASE_CHANGELOG_NAME || process.env.RELEASE_NAME || "",
    date: process.env.RELEASE_CHANGELOG_DATE || "",

    include_merges: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_MERGES,
      false,
    ),
    include_chores: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_CHORES,
      true,
    ),
    include_other: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_OTHER,
      true,
    ),
    include_authors: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_AUTHORS,
      true,
    ),
    include_commit_links: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_COMMIT_LINKS,
      true,
    ),
    include_compare_link: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_COMPARE_LINK,
      true,
    ),
    include_pr_links: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_PR_LINKS,
      true,
    ),
    include_issue_links: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_ISSUE_LINKS,
      true,
    ),
    include_stats: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_STATS,
      true,
    ),
    include_full_body: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_INCLUDE_BODY,
      false,
    ),

    update_changelog: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_UPDATE_FILE,
      false,
    ),
    replace_existing_section: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_REPLACE_EXISTING,
      true,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_FAIL_ON_ERROR,
      true,
    ),

    max_commits: normalizeInteger(
      process.env.RELEASE_CHANGELOG_MAX_COMMITS,
      500,
    ),

    dry_run: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.RELEASE_CHANGELOG_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.RELEASE_CHANGELOG_STEP_SUMMARY,
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

    if (arg === "--from" || arg === "--from-ref" || arg === "--base") {
      args.from_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--to" || arg === "--to-ref" || arg === "--head") {
      args.to_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--previous-tag") {
      args.previous_tag = argv[index + 1];
      args.from_ref = args.from_ref || argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag") {
      args.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--name" || arg === "--release-name") {
      args.release_name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--date") {
      args.date = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-merges") {
      args.include_merges = true;
      continue;
    }

    if (arg === "--no-merges") {
      args.include_merges = false;
      continue;
    }

    if (arg === "--include-chores") {
      args.include_chores = true;
      continue;
    }

    if (arg === "--no-chores") {
      args.include_chores = false;
      continue;
    }

    if (arg === "--include-other") {
      args.include_other = true;
      continue;
    }

    if (arg === "--no-other") {
      args.include_other = false;
      continue;
    }

    if (arg === "--include-authors") {
      args.include_authors = true;
      continue;
    }

    if (arg === "--no-authors") {
      args.include_authors = false;
      continue;
    }

    if (arg === "--include-body") {
      args.include_full_body = true;
      continue;
    }

    if (arg === "--no-body") {
      args.include_full_body = false;
      continue;
    }

    if (arg === "--include-links") {
      args.include_commit_links = true;
      args.include_pr_links = true;
      args.include_issue_links = true;
      args.include_compare_link = true;
      continue;
    }

    if (arg === "--no-links") {
      args.include_commit_links = false;
      args.include_pr_links = false;
      args.include_issue_links = false;
      args.include_compare_link = false;
      continue;
    }

    if (arg === "--update-changelog") {
      args.update_changelog = true;
      continue;
    }

    if (arg === "--no-update-changelog") {
      args.update_changelog = false;
      continue;
    }

    if (arg === "--replace-existing") {
      args.replace_existing_section = true;
      continue;
    }

    if (arg === "--no-replace-existing") {
      args.replace_existing_section = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

    if (arg === "--max-commits") {
      args.max_commits = normalizeInteger(argv[index + 1], args.max_commits);
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

    if (arg === "--changelog") {
      args.changelog_file = argv[index + 1];
      args.update_changelog = true;
      index += 1;
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
  args.output_file = normalizeString(args.output_file, DEFAULT_OUTPUT_FILE);
  args.summary_file = normalizeString(args.summary_file, DEFAULT_SUMMARY_FILE);
  args.changelog_file = normalizeString(
    args.changelog_file,
    DEFAULT_CHANGELOG_FILE,
  );
  args.to_ref = normalizeString(args.to_ref, "HEAD");
  args.tag = normalizeString(args.tag);
  args.version = normalizeString(args.version);
  args.release_name = normalizeString(args.release_name);
  args.max_commits = Math.max(0, args.max_commits);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Changelog Builder

Usage:
  node .github/scripts/release/build-changelog.js [options]

Examples:
  node .github/scripts/release/build-changelog.js
  node .github/scripts/release/build-changelog.js --from v2.9.0 --to HEAD --version v2.10.0
  node .github/scripts/release/build-changelog.js --tag v2.10.0 --update-changelog
  node .github/scripts/release/build-changelog.js --dry-run --include-merges

Options:
      --repo <owner/repo>              Repository slug.
      --config <file>                  Changelog config file.
      --from <ref>                     Base ref, previous tag, or starting ref.
      --to <ref>                       Head ref. Default: GITHUB_SHA or HEAD.
      --previous-tag <tag>             Previous release tag.
      --tag <tag>                      Current release tag.
      --version <version>              Release version.
      --name <name>                    Release display name.
      --date <YYYY-MM-DD>              Release date.
      --include-merges                 Include merge commits.
      --no-merges                      Exclude merge commits. Default.
      --include-chores                 Include chore commits. Default.
      --no-chores                      Omit chore commits.
      --include-other                  Include uncategorized commits. Default.
      --no-other                       Omit uncategorized commits.
      --include-authors                Include commit authors. Default.
      --no-authors                     Omit commit authors.
      --include-body                   Include commit body details.
      --no-body                        Omit commit bodies. Default.
      --include-links                  Include compare, commit, PR, and issue links.
      --no-links                       Omit generated links.
      --update-changelog               Prepend release notes to CHANGELOG.md.
      --no-update-changelog            Do not update CHANGELOG.md. Default.
      --replace-existing               Replace matching CHANGELOG.md section. Default.
      --no-replace-existing            Keep existing matching section.
      --fail-if-empty                  Exit non-zero if no commits are found.
      --fail-on-error                  Exit non-zero on failure. Default.
      --no-fail-on-error               Do not fail the workflow.
      --max-commits <number>           Maximum commits to read. Default: 500.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --changelog <file>               CHANGELOG file path and enable update.
      --dry-run                        Plan but do not write changelog/artifacts.
      --no-print                       Do not print JSON report.
      --no-step-summary                Do not append GitHub step summary.
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
        maxBuffer: 128 * 1024 * 1024,
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

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

    if (/^([A-Za-z0-9_.-]+):\s*(.+)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
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
    "from_ref",
    "to_ref",
    "previous_tag",
    "tag",
    "version",
    "release_name",
    "date",
    "output_file",
    "summary_file",
    "changelog_file",
  ];

  for (const key of stringKeys) {
    if (merged[key] === "" && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "include_merges",
    "include_chores",
    "include_other",
    "include_authors",
    "include_commit_links",
    "include_compare_link",
    "include_pr_links",
    "include_issue_links",
    "include_stats",
    "include_full_body",
    "update_changelog",
    "replace_existing_section",
    "fail_if_empty",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.max_commits !== undefined) {
    merged.max_commits = normalizeInteger(
      config.max_commits,
      merged.max_commits,
    );
  }

  return merged;
}

function readPackageVersion(repoRoot) {
  const packageJsonPath = resolvePath("package.json", repoRoot);

  if (!isFile(packageJsonPath)) return "";

  const packageJson = safeJsonParse(
    fs.readFileSync(packageJsonPath, "utf8"),
    null,
  );

  return normalizeString(packageJson?.version);
}

function normalizeVersion(value) {
  const version = normalizeString(value);

  if (!version) return "";

  return version.startsWith("v") ? version : `v${version}`;
}

function resolveReleaseTitle(args, repoRoot) {
  const packageVersion = readPackageVersion(repoRoot);
  const version = normalizeVersion(args.version || args.tag || packageVersion);
  const title = normalizeString(args.release_name || version || "Unreleased");

  return {
    version,
    title,
    tag: normalizeString(args.tag || version),
  };
}

function resolveDate(args) {
  if (args.date) return args.date;

  return new Date().toISOString().slice(0, 10);
}

function tagExists(tag, repoRoot) {
  if (!tag) return false;

  const result = runGit(
    ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
    {
      repoRoot,
      fallback: "",
    },
  );

  return Boolean(result);
}

function resolvePreviousTag(args, repoRoot, releaseTag) {
  if (args.previous_tag) return args.previous_tag;
  if (args.from_ref) return args.from_ref;

  const candidates = [];

  if (releaseTag && tagExists(releaseTag, repoRoot)) {
    candidates.push(`${releaseTag}^`);
  }

  if (args.to_ref) {
    candidates.push(`${args.to_ref}^`);
    candidates.push(args.to_ref);
  }

  candidates.push("HEAD^");
  candidates.push("HEAD");

  for (const candidate of candidates) {
    const tag = runGit(["describe", "--tags", "--abbrev=0", candidate], {
      repoRoot,
      fallback: "",
    });

    if (tag && tag !== releaseTag) {
      return tag;
    }
  }

  return "";
}

function resolveCommitRange(args, repoRoot, releaseTag) {
  const previousTag = resolvePreviousTag(args, repoRoot, releaseTag);
  const fromRef = normalizeString(args.from_ref || previousTag);
  const toRef = normalizeString(args.to_ref || releaseTag || "HEAD");

  if (fromRef && toRef) {
    return {
      previous_tag: previousTag,
      from_ref: fromRef,
      to_ref: toRef,
      range: `${fromRef}..${toRef}`,
      has_base: true,
    };
  }

  return {
    previous_tag: previousTag,
    from_ref: "",
    to_ref: toRef,
    range: toRef,
    has_base: false,
  };
}

function parseCommitRecord(record) {
  const fields = record.split("\x1f");

  return {
    sha: normalizeString(fields[0]),
    short_sha: normalizeString(fields[1]),
    author_name: normalizeString(fields[2]),
    author_email: normalizeString(fields[3]),
    date: normalizeString(fields[4]),
    subject: normalizeString(fields[5]),
    body: normalizeString(fields.slice(6).join("\x1f")),
  };
}

function collectCommits(args, repoRoot, range) {
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%b%x1e";
  const commandArgs = ["log", "--date=iso-strict", `--format=${format}`];

  if (args.max_commits > 0) {
    commandArgs.push(`--max-count=${args.max_commits}`);
  }

  if (!args.include_merges) {
    commandArgs.push("--no-merges");
  }

  commandArgs.push(range.range);

  const output = runGit(commandArgs, {
    repoRoot,
    fallback: "",
  });

  if (!output) return [];

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map(parseCommitRecord)
    .filter((commit) => commit.sha && commit.subject);
}

function collectDiffStats(repoRoot, range) {
  if (!range.from_ref || !range.to_ref) {
    return {
      files_changed: 0,
      insertions: 0,
      deletions: 0,
    };
  }

  const output = runGit(["diff", "--numstat", range.from_ref, range.to_ref], {
    repoRoot,
    fallback: "",
  });

  if (!output) {
    return {
      files_changed: 0,
      insertions: 0,
      deletions: 0,
    };
  }

  const stats = {
    files_changed: 0,
    insertions: 0,
    deletions: 0,
  };

  for (const line of output.split(/\r?\n/)) {
    const parts = line.split(/\s+/);

    if (parts.length < 3) continue;

    const additions = Number.parseInt(parts[0], 10);
    const deletions = Number.parseInt(parts[1], 10);

    stats.files_changed += 1;
    stats.insertions += Number.isFinite(additions) ? additions : 0;
    stats.deletions += Number.isFinite(deletions) ? deletions : 0;
  }

  return stats;
}

function parseConventionalCommit(subject) {
  const match = normalizeString(subject).match(
    /^([a-zA-Z][a-zA-Z0-9-]*)(?:\(([^)]+)\))?(!)?:\s*(.+)$/,
  );

  if (!match) {
    return {
      conventional: false,
      type: "",
      scope: "",
      breaking: false,
      description: subject,
    };
  }

  return {
    conventional: true,
    type: match[1].toLowerCase(),
    scope: normalizeString(match[2]),
    breaking: Boolean(match[3]),
    description: normalizeString(match[4]),
  };
}

function extractBreakingChanges(commit, parsed) {
  const breaking = [];

  if (parsed.breaking) {
    breaking.push(parsed.description || commit.subject);
  }

  const body = commit.body || "";
  const breakingPattern =
    /BREAKING(?:\s|-)?CHANGE:\s*([\s\S]*?)(?=\n[A-Z][A-Z\s-]+:|\n\n[A-Za-z-]+:\s|$)/gi;
  let match = breakingPattern.exec(body);

  while (match) {
    const text = normalizeString(match[1].replace(/\s+/g, " "));

    if (text) breaking.push(text);

    match = breakingPattern.exec(body);
  }

  return [...new Set(breaking)];
}

function extractPullRequests(text) {
  const prs = new Set();
  const value = String(text || "");

  for (const match of value.matchAll(/\(#(\d+)\)/g)) {
    prs.add(match[1]);
  }

  for (const match of value.matchAll(/\bPR\s*#?(\d+)\b/gi)) {
    prs.add(match[1]);
  }

  for (const match of value.matchAll(/\bpull request\s*#?(\d+)\b/gi)) {
    prs.add(match[1]);
  }

  return [...prs].sort((left, right) => Number(left) - Number(right));
}

function extractIssues(text) {
  const issues = new Set();
  const value = String(text || "");

  for (const match of value.matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi,
  )) {
    issues.add(match[1]);
  }

  return [...issues].sort((left, right) => Number(left) - Number(right));
}

function categoryForCommit(commit, parsed) {
  const subject = commit.subject.toLowerCase();
  const body = commit.body.toLowerCase();

  if (parsed.breaking || /BREAKING(?:\s|-)?CHANGE:/i.test(commit.body)) {
    return "breaking";
  }

  for (const category of CATEGORY_DEFINITIONS) {
    if (category.id === "breaking" || category.id === "other") continue;

    if (category.types?.includes(parsed.type)) {
      return category.id;
    }

    if (
      category.keywords?.some(
        (keyword) => subject.includes(keyword) || body.includes(keyword),
      )
    ) {
      return category.id;
    }
  }

  if (/^merge\b/i.test(commit.subject)) return "merges";

  return "other";
}

function normalizeCommit(commit, args) {
  const parsed = parseConventionalCommit(commit.subject);
  const combinedText = `${commit.subject}\n${commit.body}`;
  const breaking_changes = extractBreakingChanges(commit, parsed);
  const category = categoryForCommit(commit, {
    ...parsed,
    breaking: parsed.breaking || breaking_changes.length > 0,
  });

  return {
    ...commit,
    type: parsed.type,
    scope: parsed.scope,
    conventional: parsed.conventional,
    description: parsed.description || commit.subject,
    category,
    breaking: breaking_changes.length > 0,
    breaking_changes,
    pull_requests: extractPullRequests(combinedText),
    issues: extractIssues(combinedText),
    body: args.include_full_body ? commit.body : "",
  };
}

function filterCommit(commit, args) {
  if (commit.category === "chores" && !args.include_chores) return false;
  if (commit.category === "other" && !args.include_other) return false;
  if (commit.category === "merges" && !args.include_merges) return false;

  return true;
}

function groupCommits(commits) {
  const groups = {};

  for (const category of CATEGORY_DEFINITIONS) {
    groups[category.id] = [];
  }

  for (const commit of commits) {
    const category = groups[commit.category] ? commit.category : "other";
    groups[category].push(commit);
  }

  return groups;
}

function summarizeCommits(commits, diffStats) {
  const authors = [
    ...new Set(commits.map((commit) => commit.author_name).filter(Boolean)),
  ].sort();
  const categories = {};

  for (const category of CATEGORY_DEFINITIONS) {
    categories[category.id] = commits.filter(
      (commit) => commit.category === category.id,
    ).length;
  }

  return {
    commits: commits.length,
    breaking_changes: commits.filter((commit) => commit.breaking).length,
    conventional_commits: commits.filter((commit) => commit.conventional)
      .length,
    authors: authors.length,
    author_names: authors,
    pull_requests: [
      ...new Set(commits.flatMap((commit) => commit.pull_requests)),
    ].length,
    issues: [...new Set(commits.flatMap((commit) => commit.issues))].length,
    files_changed: diffStats.files_changed,
    insertions: diffStats.insertions,
    deletions: diffStats.deletions,
    categories,
  };
}

function repositoryUrl(repository) {
  const repo = normalizeString(repository, DEFAULT_REPOSITORY);

  if (/^https?:\/\//.test(repo)) return repo.replace(/\/+$/g, "");

  return `https://github.com/${repo}`;
}

function commitUrl(repository, sha) {
  return `${repositoryUrl(repository)}/commit/${sha}`;
}

function pullRequestUrl(repository, number) {
  return `${repositoryUrl(repository)}/pull/${number}`;
}

function issueUrl(repository, number) {
  return `${repositoryUrl(repository)}/issues/${number}`;
}

function compareUrl(repository, fromRef, toRef) {
  if (!fromRef || !toRef) return "";

  return `${repositoryUrl(repository)}/compare/${encodeURIComponent(fromRef)}...${encodeURIComponent(toRef)}`;
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function markdownLink(label, url) {
  if (!url) return label;

  return `[${label}](${url})`;
}

function formatCommitReference(commit, args) {
  if (!args.include_commit_links) return `\`${commit.short_sha}\``;

  return markdownLink(
    `\`${commit.short_sha}\``,
    commitUrl(args.repository, commit.sha),
  );
}

function formatReferences(commit, args) {
  const refs = [];

  refs.push(formatCommitReference(commit, args));

  if (args.include_pr_links) {
    for (const pr of commit.pull_requests) {
      refs.push(markdownLink(`#${pr}`, pullRequestUrl(args.repository, pr)));
    }
  }

  if (args.include_issue_links) {
    for (const issue of commit.issues) {
      refs.push(
        markdownLink(`closes #${issue}`, issueUrl(args.repository, issue)),
      );
    }
  }

  return refs.length ? ` (${refs.join(", ")})` : "";
}

function formatCommitLine(commit, args) {
  const scope = commit.scope ? `**${escapeMarkdown(commit.scope)}:** ` : "";
  const author =
    args.include_authors && commit.author_name
      ? ` — ${escapeMarkdown(commit.author_name)}`
      : "";
  const refs = formatReferences(commit, args);

  return `- ${scope}${escapeMarkdown(commit.description)}${refs}${author}`;
}

function createReleaseSectionMarkdown(report) {
  const lines = [];
  const compare = report.links.compare;

  lines.push(`## ${report.release.title} — ${report.release.date}`);
  lines.push("");

  if (compare && report.config.include_compare_link) {
    lines.push(
      `🔎 **Compare:** ${markdownLink(`${report.range.from_ref}...${report.range.to_ref}`, compare)}`,
    );
    lines.push("");
  }

  if (report.config.include_stats) {
    lines.push(
      `📊 **Summary:** ${report.totals.commits} commit(s), ${report.totals.authors} author(s), ${report.totals.files_changed} file(s) changed, +${report.totals.insertions}/-${report.totals.deletions}.`,
    );
    lines.push("");
  }

  if (!report.commits.length) {
    lines.push("_No commits were found for this release range._");
    lines.push("");
    return lines.join("\n");
  }

  for (const category of CATEGORY_DEFINITIONS) {
    const commits = report.groups[category.id] || [];

    if (!commits.length) continue;

    lines.push(`### ${category.title}`);
    lines.push("");

    for (const commit of commits) {
      lines.push(formatCommitLine(commit, report.config));
    }

    lines.push("");
  }

  const breakingDetails = report.commits
    .filter((commit) => commit.breaking)
    .flatMap((commit) =>
      commit.breaking_changes.map((change) => ({
        commit,
        change,
      })),
    );

  if (breakingDetails.length) {
    lines.push("### 🧨 Breaking Change Details");
    lines.push("");

    for (const detail of breakingDetails) {
      lines.push(
        `- ${escapeMarkdown(detail.change)} (${formatCommitReference(detail.commit, report.config)})`,
      );
    }

    lines.push("");
  }

  const contributors = report.totals.author_names || [];

  if (contributors.length && report.config.include_authors) {
    lines.push("### 🙌 Contributors");
    lines.push("");
    lines.push(
      contributors.map((author) => `\`${escapeMarkdown(author)}\``).join(", "),
    );
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function createMarkdownSummary(report) {
  const lines = [
    `# 📝 ${PROJECT_NAME} Changelog`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Release: \`${report.release.title}\``,
    `- Date: \`${report.release.date}\``,
    `- Previous tag: \`${report.range.previous_tag || "none"}\``,
    `- Range: \`${report.range.range}\``,
    `- Commits: \`${report.totals.commits}\``,
    `- Breaking changes: \`${report.totals.breaking_changes}\``,
    `- Authors: \`${report.totals.authors}\``,
    "",
    "## 📦 Outputs",
    "",
    `- JSON report: \`${report.config.output_file}\``,
    `- Markdown summary: \`${report.config.summary_file || "not written"}\``,
    `- CHANGELOG update: \`${report.config.update_changelog ? report.config.changelog_file : "disabled"}\``,
    "",
    "---",
    "",
    createReleaseSectionMarkdown(report).trimEnd(),
    "",
  ];

  return `${lines.join("\n").trim()}\n`;
}

function removeExistingSection(markdown, heading) {
  const lines = String(markdown || "").split(/\r?\n/);
  const output = [];

  let skipping = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === heading.trim()) {
      skipping = true;
      continue;
    }

    if (skipping && /^##\s+/.test(line)) {
      skipping = false;
    }

    if (!skipping) {
      output.push(line);
    }
  }

  return (
    output
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

function updateChangelogFile(
  changelogPath,
  sectionMarkdown,
  report,
  options = {},
) {
  const heading = sectionMarkdown.split(/\r?\n/)[0];
  const dryRun = Boolean(options.dry_run);
  const exists = isFile(changelogPath);
  const current = exists
    ? fs.readFileSync(changelogPath, "utf8")
    : "# Changelog\n";

  let next = current;

  if (report.config.replace_existing_section) {
    next = removeExistingSection(next, heading);
  } else if (current.includes(heading)) {
    logger.warn(
      `CHANGELOG already contains section "${heading}". Skipping update.`,
    );
    return {
      updated: false,
      skipped: true,
      reason: "section already exists",
    };
  }

  if (/^#\s+Changelog\b/im.test(next)) {
    next = next.replace(
      /^#\s+Changelog\b.*$/im,
      (match) => `${match.trim()}\n\n${sectionMarkdown.trim()}`,
    );
  } else {
    next = `# Changelog\n\n${sectionMarkdown.trim()}\n\n${next.trim()}`;
  }

  next = `${next.replace(/\n{3,}/g, "\n\n").trim()}\n`;

  if (dryRun) {
    logger.info(`[dry-run] Would update ${changelogPath}.`);
    return {
      updated: false,
      dry_run: true,
      skipped: false,
      reason: "",
    };
  }

  ensureDir(path.dirname(changelogPath), false);
  fs.writeFileSync(changelogPath, next);
  logger.info(`Updated ${changelogPath}.`);

  return {
    updated: true,
    dry_run: false,
    skipped: false,
    reason: "",
  };
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
  setGitHubOutput("release_changelog_file", report.config.output_file);
  setGitHubOutput(
    "release_changelog_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput(
    "release_changelog_markdown_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("release_changelog_status", report.status);
  setGitHubOutput("release_changelog_ok", report.ok ? "true" : "false");
  setGitHubOutput("release_changelog_version", report.release.version || "");
  setGitHubOutput("release_changelog_tag", report.release.tag || "");
  setGitHubOutput("release_changelog_title", report.release.title);
  setGitHubOutput("release_changelog_date", report.release.date);
  setGitHubOutput(
    "release_changelog_previous_tag",
    report.range.previous_tag || "",
  );
  setGitHubOutput("release_changelog_from_ref", report.range.from_ref || "");
  setGitHubOutput("release_changelog_to_ref", report.range.to_ref || "");
  setGitHubOutput("release_changelog_range", report.range.range || "");
  setGitHubOutput("release_changelog_commits", String(report.totals.commits));
  setGitHubOutput(
    "release_changelog_breaking_changes",
    String(report.totals.breaking_changes),
  );
  setGitHubOutput("release_changelog_authors", String(report.totals.authors));
  setGitHubOutput("release_changelog_compare_url", report.links.compare || "");
  setGitHubOutput(
    "release_changelog_markdown",
    report.markdown.release_section,
  );
}

function createReport(args, repoRoot, configFile, configAvailable) {
  const github = getGitMetadata(repoRoot);
  const release = resolveReleaseTitle(args, repoRoot);
  const date = resolveDate(args);
  const range = resolveCommitRange(args, repoRoot, release.tag);
  const rawCommits = collectCommits(args, repoRoot, range);
  const commits = rawCommits
    .map((commit) => normalizeCommit(commit, args))
    .filter((commit) => filterCommit(commit, args));
  const diffStats = collectDiffStats(repoRoot, range);
  const groups = groupCommits(commits);
  const totals = summarizeCommits(commits, diffStats);
  const compare = args.include_compare_link
    ? compareUrl(args.repository, range.from_ref, range.to_ref)
    : "";

  const status =
    commits.length === 0
      ? "empty"
      : totals.breaking_changes > 0
        ? "breaking"
        : totals.categories.features > 0
          ? "feature"
          : totals.categories.fixes > 0
            ? "fix"
            : "built";

  const baseReport = {
    schema_version: 1,
    type: "release-build-changelog",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    release: {
      ...release,
      date,
    },
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      changelog_file: toRelativePath(
        resolvePath(args.changelog_file, repoRoot),
        repoRoot,
      ),
      include_merges: args.include_merges,
      include_chores: args.include_chores,
      include_other: args.include_other,
      include_authors: args.include_authors,
      include_commit_links: args.include_commit_links,
      include_compare_link: args.include_compare_link,
      include_pr_links: args.include_pr_links,
      include_issue_links: args.include_issue_links,
      include_stats: args.include_stats,
      include_full_body: args.include_full_body,
      update_changelog: args.update_changelog,
      replace_existing_section: args.replace_existing_section,
      max_commits: args.max_commits,
      dry_run: args.dry_run,
    },
    range,
    links: {
      repository: repositoryUrl(args.repository),
      compare,
    },
    totals,
    groups,
    commits,
    raw_commit_count: rawCommits.length,
    status,
    ok: commits.length > 0 || !args.fail_if_empty,
  };

  const releaseSection = createReleaseSectionMarkdown(baseReport);
  const markdownSummary = createMarkdownSummary({
    ...baseReport,
    markdown: {
      release_section: releaseSection,
    },
  });

  return {
    ...baseReport,
    markdown: {
      release_section: releaseSection,
      summary: markdownSummary,
    },
  };
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);
  const changelogFile = resolvePath(args.changelog_file, repoRoot);

  logger.info("Building release changelog.");

  const report = createReport(args, repoRoot, configFile, Boolean(config));
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (args.fail_if_empty && report.totals.commits === 0) {
    logger.error("No commits were found for the changelog range.");
    process.exitCode = 1;
  }

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, report.markdown.summary, {
      dry_run: args.dry_run,
    });
  }

  if (args.update_changelog) {
    const updateResult = updateChangelogFile(
      changelogFile,
      report.markdown.release_section,
      report,
      {
        dry_run: args.dry_run,
      },
    );

    report.changelog_update = updateResult;
  }

  writeGitHubOutputs(report);

  if (args.write_step_summary) {
    appendGitHubStepSummary(report.markdown.summary);
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && args.fail_if_empty && report.totals.commits === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(logger.formatError(err));
  process.exitCode = 1;
});
