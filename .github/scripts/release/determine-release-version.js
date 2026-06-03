#!/usr/bin/env node
// .github/scripts/release/determine-release-version.js
// =============================================================================
// Aerealith AI — Release Version Determiner
// -----------------------------------------------------------------------------
// Purpose:
//   Determine the next release version from package metadata, release-label
//   detection artifacts, workflow inputs, direct CLI/env values, and git tags.
//
// Input:
//   - package.json
//   - artifacts/release/detect-release-label.json
//   - .github/release/determine-release-version.json
//   - .github/release/determine-release-version.jsonc
//   - .github/release/determine-release-version.yaml
//   - .github/release/determine-release-version.yml
//
// Output:
//   - artifacts/release/determine-release-version.json
//   - artifacts/release/determine-release-version.md
//   - GitHub step outputs for downstream release jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate git state.
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
    info: (message) => console.log(`[release-version] ${message}`),
    warn: (message) => console.warn(`[release-version] WARN: ${message}`),
    error: (message) => console.error(`[release-version] ERROR: ${message}`),
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
  ".github/release/determine-release-version.json",
  ".github/release/determine-release-version.jsonc",
  ".github/release/determine-release-version.yaml",
  ".github/release/determine-release-version.yml",
  ".github/release/release-version.json",
  ".github/release/release-version.jsonc",
  ".github/release/release-version.yaml",
  ".github/release/release-version.yml",
  "release/determine-release-version.json",
  "release/determine-release-version.jsonc",
  "release/determine-release-version.yaml",
  "release/determine-release-version.yml",
  "release/release-version.json",
  "release/release-version.jsonc",
  "release/release-version.yaml",
  "release/release-version.yml",
];

const DEFAULT_LABEL_REPORT_FILE = "artifacts/release/detect-release-label.json";
const DEFAULT_OUTPUT_FILE = "artifacts/release/determine-release-version.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/determine-release-version.md";
const DEFAULT_PACKAGE_FILE = "package.json";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const RELEASE_TYPES = new Set(["none", "patch", "minor", "major"]);
const CHANNELS = new Set([
  "stable",
  "alpha",
  "beta",
  "rc",
  "preview",
  "next",
  "canary",
]);

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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,

    config_file: process.env.DETERMINE_RELEASE_VERSION_CONFIG_FILE || "",
    package_file:
      process.env.DETERMINE_RELEASE_VERSION_PACKAGE_FILE ||
      process.env.RELEASE_PACKAGE_FILE ||
      DEFAULT_PACKAGE_FILE,
    label_report_file:
      process.env.DETERMINE_RELEASE_VERSION_LABEL_REPORT_FILE ||
      process.env.RELEASE_LABEL_REPORT_FILE ||
      DEFAULT_LABEL_REPORT_FILE,

    output_file:
      process.env.DETERMINE_RELEASE_VERSION_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.DETERMINE_RELEASE_VERSION_SUMMARY_FILE ||
      DEFAULT_SUMMARY_FILE,

    current_version:
      process.env.DETERMINE_RELEASE_VERSION_CURRENT ||
      process.env.RELEASE_CURRENT_VERSION ||
      process.env.CURRENT_VERSION ||
      "",
    version:
      process.env.DETERMINE_RELEASE_VERSION_VERSION ||
      process.env.RELEASE_VERSION ||
      "",
    release_type:
      process.env.DETERMINE_RELEASE_VERSION_TYPE ||
      process.env.RELEASE_TYPE ||
      "",
    release_channel:
      process.env.DETERMINE_RELEASE_VERSION_CHANNEL ||
      process.env.RELEASE_CHANNEL ||
      "",
    prerelease_id:
      process.env.DETERMINE_RELEASE_VERSION_PRERELEASE_ID ||
      process.env.RELEASE_PRERELEASE_ID ||
      "",
    build_metadata:
      process.env.DETERMINE_RELEASE_VERSION_BUILD_METADATA ||
      process.env.RELEASE_BUILD_METADATA ||
      "",

    tag_prefix:
      process.env.DETERMINE_RELEASE_VERSION_TAG_PREFIX ||
      process.env.RELEASE_TAG_PREFIX ||
      "v",

    default_release_type:
      process.env.DETERMINE_RELEASE_VERSION_DEFAULT_TYPE ||
      process.env.RELEASE_DEFAULT_TYPE ||
      "none",
    default_channel:
      process.env.DETERMINE_RELEASE_VERSION_DEFAULT_CHANNEL ||
      process.env.RELEASE_DEFAULT_CHANNEL ||
      "stable",

    use_label_report: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_USE_LABEL_REPORT,
      true,
    ),
    use_package_json: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_USE_PACKAGE_JSON,
      true,
    ),
    use_git_tags: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_USE_GIT_TAGS,
      true,
    ),

    allow_no_release: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_ALLOW_NO_RELEASE,
      true,
    ),
    allow_no_bump: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_ALLOW_NO_BUMP,
      true,
    ),
    stable_from_prerelease: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_STABLE_FROM_PRERELEASE,
      true,
    ),
    increment_matching_prerelease: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_INCREMENT_MATCHING_PRERELEASE,
      true,
    ),
    include_build_metadata: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_INCLUDE_BUILD_METADATA,
      false,
    ),

    check_tag_exists: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_CHECK_TAG_EXISTS,
      true,
    ),
    fail_if_tag_exists: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_FAIL_IF_TAG_EXISTS,
      false,
    ),
    fail_if_no_release: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_FAIL_IF_NO_RELEASE,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_FAIL_ON_ERROR,
      true,
    ),

    dry_run: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_DRY_RUN ||
        process.env.RELEASE_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.DETERMINE_RELEASE_VERSION_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.DETERMINE_RELEASE_VERSION_STEP_SUMMARY,
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

    if (arg === "--package-file" || arg === "--package-json") {
      args.package_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--label-report") {
      args.label_report_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--current" || arg === "--current-version") {
      args.current_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--type" || arg === "--release-type") {
      args.release_type = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--channel" || arg === "--release-channel") {
      args.release_channel = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--prerelease-id") {
      args.prerelease_id = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--build-metadata") {
      args.build_metadata = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tag-prefix") {
      args.tag_prefix = argv[index + 1];
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

    if (arg === "--use-label-report") {
      args.use_label_report = true;
      continue;
    }

    if (arg === "--no-label-report") {
      args.use_label_report = false;
      continue;
    }

    if (arg === "--use-package-json") {
      args.use_package_json = true;
      continue;
    }

    if (arg === "--no-package-json") {
      args.use_package_json = false;
      continue;
    }

    if (arg === "--use-git-tags") {
      args.use_git_tags = true;
      continue;
    }

    if (arg === "--no-git-tags") {
      args.use_git_tags = false;
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

    if (arg === "--allow-no-bump") {
      args.allow_no_bump = true;
      continue;
    }

    if (arg === "--no-allow-no-bump") {
      args.allow_no_bump = false;
      continue;
    }

    if (arg === "--stable-from-prerelease") {
      args.stable_from_prerelease = true;
      continue;
    }

    if (arg === "--no-stable-from-prerelease") {
      args.stable_from_prerelease = false;
      continue;
    }

    if (arg === "--increment-matching-prerelease") {
      args.increment_matching_prerelease = true;
      continue;
    }

    if (arg === "--no-increment-matching-prerelease") {
      args.increment_matching_prerelease = false;
      continue;
    }

    if (arg === "--include-build-metadata") {
      args.include_build_metadata = true;
      continue;
    }

    if (arg === "--no-build-metadata") {
      args.include_build_metadata = false;
      continue;
    }

    if (arg === "--check-tag-exists") {
      args.check_tag_exists = true;
      continue;
    }

    if (arg === "--no-check-tag-exists") {
      args.check_tag_exists = false;
      continue;
    }

    if (arg === "--fail-if-tag-exists") {
      args.fail_if_tag_exists = true;
      continue;
    }

    if (arg === "--fail-if-no-release") {
      args.fail_if_no_release = true;
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
  args.release_type = normalizeReleaseType(args.release_type);
  args.release_channel = normalizeChannel(args.release_channel);
  args.default_release_type = normalizeReleaseType(args.default_release_type);
  args.default_channel = normalizeChannel(args.default_channel);
  args.tag_prefix = normalizeString(args.tag_prefix, "v");
  args.version = cleanVersion(args.version);
  args.current_version = cleanVersion(args.current_version);
  args.prerelease_id = normalizePrereleaseId(args.prerelease_id);
  args.build_metadata = normalizeBuildMetadata(args.build_metadata);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Release Version Determiner

Usage:
  node .github/scripts/release/determine-release-version.js [options]

Examples:
  node .github/scripts/release/determine-release-version.js
  node .github/scripts/release/determine-release-version.js --type minor
  node .github/scripts/release/determine-release-version.js --current 2.9.0 --type minor
  node .github/scripts/release/determine-release-version.js --current 2.10.0 --channel beta
  node .github/scripts/release/determine-release-version.js --version 2.10.0 --tag-prefix v

Options:
      --repo <owner/repo>                    Repository slug.
      --config <file>                        Release version config file.
      --package-file <file>                  package.json file. Default: package.json.
      --label-report <file>                  detect-release-label JSON report.
      --current <version>                    Current version.
      --version <version>                    Explicit final release version.
      --type <none|patch|minor|major>        Release bump type.
      --channel <stable|alpha|beta|rc|next>  Release channel.
      --prerelease-id <id>                   Prerelease identifier.
      --build-metadata <metadata>            SemVer build metadata.
      --tag-prefix <prefix>                  Tag prefix. Default: v.
      --default-type <type>                  Default release type. Default: none.
      --default-channel <channel>            Default release channel. Default: stable.
      --use-label-report                     Use release-label artifact. Default.
      --no-label-report                      Ignore release-label artifact.
      --use-package-json                     Use package.json version. Default.
      --no-package-json                      Ignore package.json.
      --use-git-tags                         Inspect git tags. Default.
      --no-git-tags                          Do not inspect git tags.
      --allow-no-release                     Allow no-release decisions. Default.
      --no-allow-no-release                  Force version calculation even with no-release.
      --allow-no-bump                        Keep current version when type is none. Default.
      --no-allow-no-bump                     Treat none as patch.
      --stable-from-prerelease               Stable channel strips prerelease. Default.
      --no-stable-from-prerelease            Stable channel bumps instead of stripping.
      --increment-matching-prerelease        Increment same prerelease series. Default.
      --no-increment-matching-prerelease     Always start prerelease at .0.
      --include-build-metadata               Append build metadata.
      --no-build-metadata                    Omit build metadata. Default.
      --check-tag-exists                     Check local git tag existence. Default.
      --no-check-tag-exists                  Skip tag existence check.
      --fail-if-tag-exists                   Exit non-zero when final tag already exists.
      --fail-if-no-release                   Exit non-zero when label report says no release.
      --fail-on-error                        Exit non-zero on failure. Default.
      --no-fail-on-error                     Do not fail workflow for detection errors.
  -o, --output <file>                        JSON output file.
      --summary <file>                       Markdown summary output file.
      --no-summary                           Do not write Markdown summary.
      --dry-run                              Plan only.
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

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const trimmed = line.trim();

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
    "package_file",
    "label_report_file",
    "current_version",
    "version",
    "release_type",
    "release_channel",
    "prerelease_id",
    "build_metadata",
    "tag_prefix",
    "default_release_type",
    "default_channel",
    "output_file",
    "summary_file",
  ];

  for (const key of stringKeys) {
    if (!merged[key] && config[key] !== undefined) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const booleanKeys = [
    "use_label_report",
    "use_package_json",
    "use_git_tags",
    "allow_no_release",
    "allow_no_bump",
    "stable_from_prerelease",
    "increment_matching_prerelease",
    "include_build_metadata",
    "check_tag_exists",
    "fail_if_tag_exists",
    "fail_if_no_release",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  merged.release_type = normalizeReleaseType(merged.release_type);
  merged.release_channel = normalizeChannel(merged.release_channel);
  merged.default_release_type = normalizeReleaseType(
    merged.default_release_type,
  );
  merged.default_channel = normalizeChannel(merged.default_channel);
  merged.version = cleanVersion(merged.version);
  merged.current_version = cleanVersion(merged.current_version);
  merged.prerelease_id = normalizePrereleaseId(merged.prerelease_id);
  merged.build_metadata = normalizeBuildMetadata(merged.build_metadata);

  return merged;
}

function normalizeReleaseType(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (RELEASE_TYPES.has(normalized)) return normalized;
  if (["skip", "no-release", "false"].includes(normalized)) return "none";

  return "";
}

function normalizeChannel(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (CHANNELS.has(normalized)) return normalized;

  return "";
}

function normalizePrereleaseId(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^0-9a-z.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBuildMetadata(value) {
  return normalizeString(value)
    .replace(/[^0-9A-Za-z.-]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function cleanVersion(value) {
  return normalizeString(value)
    .replace(/^refs\/tags\//, "")
    .replace(/^v/, "");
}

function parseSemver(value) {
  const input = cleanVersion(value);
  const match = input.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/,
  );

  if (!match) {
    return null;
  }

  return {
    raw: input,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || "",
    build: match[5] || "",
  };
}

function formatSemver(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  const prerelease = version.prerelease ? `-${version.prerelease}` : "";
  const build = version.build ? `+${version.build}` : "";

  return `${base}${prerelease}${build}`;
}

function versionBase(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareSemver(left, right) {
  const a = typeof left === "string" ? parseSemver(left) : left;
  const b = typeof right === "string" ? parseSemver(right) : right;

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  for (const key of ["major", "minor", "patch"]) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }

  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && !b.prerelease) return 0;

  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(left, right) {
  const a = String(left || "").split(".");
  const b = String(right || "").split(".");
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const av = a[index];
    const bv = b[index];

    if (av === undefined) return -1;
    if (bv === undefined) return 1;

    const an = /^\d+$/.test(av) ? Number(av) : null;
    const bn = /^\d+$/.test(bv) ? Number(bv) : null;

    if (an !== null && bn !== null) {
      if (an > bn) return 1;
      if (an < bn) return -1;
      continue;
    }

    if (an !== null) return -1;
    if (bn !== null) return 1;

    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

function bumpBase(version, releaseType, allowNoBump) {
  const next = {
    major: version.major,
    minor: version.minor,
    patch: version.patch,
    prerelease: "",
    build: "",
  };

  if (releaseType === "major") {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
    return next;
  }

  if (releaseType === "minor") {
    next.minor += 1;
    next.patch = 0;
    return next;
  }

  if (releaseType === "patch") {
    next.patch += 1;
    return next;
  }

  if (allowNoBump) {
    return next;
  }

  next.patch += 1;
  return next;
}

function parsePrerelease(prerelease) {
  const parts = String(prerelease || "")
    .split(".")
    .filter(Boolean);

  if (!parts.length) {
    return {
      id: "",
      number: -1,
      parts: [],
    };
  }

  const last = parts[parts.length - 1];
  const number = /^\d+$/.test(last) ? Number(last) : -1;
  const idParts = number >= 0 ? parts.slice(0, -1) : parts;

  return {
    id: idParts.join("."),
    number,
    parts,
  };
}

function nextPrerelease(current, targetBase, prereleaseId, options) {
  const parsedCurrent = parsePrerelease(current.prerelease);
  const sameBase = versionBase(current) === versionBase(targetBase);
  const sameId = parsedCurrent.id === prereleaseId;

  if (
    options.increment_matching_prerelease &&
    current.prerelease &&
    sameBase &&
    sameId &&
    parsedCurrent.number >= 0
  ) {
    return `${prereleaseId}.${parsedCurrent.number + 1}`;
  }

  return `${prereleaseId}.0`;
}

function determineNextVersion(current, input, args) {
  const explicit = parseSemver(input.explicit_version);

  if (explicit) {
    return {
      version: {
        ...explicit,
        build: args.include_build_metadata
          ? input.build_metadata || explicit.build
          : explicit.build,
      },
      strategy: "explicit-version",
      reason: `Using explicit version ${formatSemver(explicit)}.`,
    };
  }

  const releaseType = input.release_type || args.default_release_type || "none";
  const channel = input.release_channel || args.default_channel || "stable";
  const prereleaseId =
    input.prerelease_id || (channel === "stable" ? "" : channel);
  const shouldPrerelease = channel !== "stable" && Boolean(prereleaseId);

  if (!current) {
    return {
      version: null,
      strategy: "invalid-current-version",
      reason: "Current version could not be parsed.",
    };
  }

  if (input.skip_release && args.allow_no_release) {
    return {
      version: {
        ...current,
        build: "",
      },
      strategy: "skip-release",
      reason: "Release label detection requested skipping this release.",
    };
  }

  if (!input.should_release && args.allow_no_release) {
    return {
      version: {
        ...current,
        build: "",
      },
      strategy: "no-release",
      reason: "Release label detection did not request a release.",
    };
  }

  if (shouldPrerelease) {
    const targetBase = bumpBase(
      current,
      releaseType === "none" ? "patch" : releaseType,
      false,
    );
    const prerelease = nextPrerelease(current, targetBase, prereleaseId, args);

    return {
      version: {
        ...targetBase,
        prerelease,
        build: args.include_build_metadata ? input.build_metadata : "",
      },
      strategy: current.prerelease
        ? "prerelease-increment-or-reset"
        : "new-prerelease",
      reason: `Calculated ${channel} prerelease using ${releaseType === "none" ? "patch" : releaseType} base.`,
    };
  }

  if (
    current.prerelease &&
    args.stable_from_prerelease &&
    releaseType === "none"
  ) {
    return {
      version: {
        major: current.major,
        minor: current.minor,
        patch: current.patch,
        prerelease: "",
        build: args.include_build_metadata ? input.build_metadata : "",
      },
      strategy: "stable-from-prerelease",
      reason: "Stable release strips the existing prerelease suffix.",
    };
  }

  const next = bumpBase(current, releaseType, args.allow_no_bump);

  return {
    version: {
      ...next,
      build: args.include_build_metadata ? input.build_metadata : "",
    },
    strategy:
      releaseType === "none" && args.allow_no_bump
        ? "no-bump"
        : `${releaseType || "patch"}-bump`,
    reason:
      releaseType === "none" && args.allow_no_bump
        ? "No release type was requested, so the current stable version is preserved."
        : `Calculated ${releaseType || "patch"} release bump.`,
  };
}

function readPackageVersion(args, repoRoot) {
  if (!args.use_package_json) return "";

  const packageJson = readJsonFile(args.package_file, repoRoot, null);

  return cleanVersion(packageJson?.version || "");
}

function readLabelReport(args, repoRoot) {
  if (!args.use_label_report) return null;

  return readJsonFile(args.label_report_file, repoRoot, null);
}

function inputFromLabelReport(labelReport) {
  if (!labelReport || typeof labelReport !== "object") {
    return {
      available: false,
      should_release: true,
      skip_release: false,
      release_type: "",
      release_channel: "",
      prerelease: false,
      reason: "",
    };
  }

  return {
    available: true,
    should_release:
      labelReport.release?.should_release ??
      labelReport.detection?.should_release ??
      true,
    skip_release:
      labelReport.release?.skip_release ??
      labelReport.detection?.skip_release ??
      false,
    release_type: normalizeReleaseType(
      labelReport.release?.release_type ||
        labelReport.detection?.release_type ||
        "",
    ),
    release_channel: normalizeChannel(
      labelReport.release?.release_channel ||
        labelReport.detection?.release_channel ||
        "",
    ),
    prerelease:
      labelReport.release?.prerelease ??
      labelReport.detection?.prerelease ??
      false,
    reason: labelReport.release?.reason || labelReport.detection?.reason || "",
  };
}

function resolveVersionInput(args, repoRoot) {
  const labelReport = readLabelReport(args, repoRoot);
  const labelInput = inputFromLabelReport(labelReport);
  const packageVersion = readPackageVersion(args, repoRoot);

  const releaseType =
    args.release_type ||
    labelInput.release_type ||
    args.default_release_type ||
    "none";

  const releaseChannel =
    args.release_channel ||
    labelInput.release_channel ||
    (labelInput.prerelease ? args.default_channel || "alpha" : "") ||
    args.default_channel ||
    "stable";

  return {
    label_report_available: Boolean(labelReport),
    package_version: packageVersion,
    current_version: cleanVersion(args.current_version || packageVersion),
    explicit_version: cleanVersion(args.version),
    release_type: normalizeReleaseType(releaseType) || "none",
    release_channel: normalizeChannel(releaseChannel) || "stable",
    prerelease_id:
      args.prerelease_id || (releaseChannel === "stable" ? "" : releaseChannel),
    build_metadata: args.build_metadata,
    should_release: labelInput.should_release,
    skip_release: labelInput.skip_release,
    label_reason: labelInput.reason,
  };
}

function tagNameForVersion(version, args) {
  const rendered =
    typeof version === "string" ? cleanVersion(version) : formatSemver(version);

  return `${args.tag_prefix || ""}${rendered}`;
}

function tagExists(repoRoot, tag) {
  if (!tag) return false;

  const output = runGit(
    ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
    {
      repoRoot,
      fallback: "",
    },
  );

  return Boolean(output);
}

function latestTag(repoRoot) {
  return runGit(["describe", "--tags", "--abbrev=0"], {
    repoRoot,
    fallback: "",
  });
}

function latestVersionTag(repoRoot) {
  const output = runGit(["tag", "--list", "--sort=-v:refname"], {
    repoRoot,
    fallback: "",
  });

  const tags = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  return tags.find((tag) => parseSemver(tag)) || "";
}

function validateResult(args, versionInput, calculated, tagInfo) {
  const errors = [];
  const warnings = [];

  if (!versionInput.current_version) {
    errors.push("Current version could not be resolved.");
  } else if (!parseSemver(versionInput.current_version)) {
    errors.push(
      `Current version is not valid SemVer: ${versionInput.current_version}`,
    );
  }

  if (
    versionInput.explicit_version &&
    !parseSemver(versionInput.explicit_version)
  ) {
    errors.push(
      `Explicit version is not valid SemVer: ${versionInput.explicit_version}`,
    );
  }

  if (!calculated.version) {
    errors.push(calculated.reason || "Next version could not be calculated.");
  }

  if (versionInput.skip_release && args.fail_if_no_release) {
    errors.push("Release label detection requested skipping this release.");
  }

  if (!versionInput.should_release && args.fail_if_no_release) {
    errors.push("Release label detection did not request a release.");
  }

  if (tagInfo.exists && args.fail_if_tag_exists) {
    errors.push(`Release tag already exists: ${tagInfo.tag}`);
  } else if (tagInfo.exists) {
    warnings.push(`Release tag already exists: ${tagInfo.tag}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function repositoryUrl(repository) {
  const repo = normalizeString(repository, DEFAULT_REPOSITORY);

  if (/^https?:\/\//.test(repo)) return repo.replace(/\/+$/g, "");

  return `https://github.com/${repo}`;
}

function tagUrl(repository, tag) {
  if (!tag) return "";

  return `${repositoryUrl(repository)}/releases/tag/${encodeURIComponent(tag)}`;
}

function compareUrl(repository, fromTag, toTag) {
  if (!fromTag || !toTag) return "";

  return `${repositoryUrl(repository)}/compare/${encodeURIComponent(fromTag)}...${encodeURIComponent(toTag)}`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  configAvailable,
  versionInput,
  calculated,
  tagInfo,
  validation,
) {
  const github = getGitMetadata(repoRoot);
  const version = calculated.version ? formatSemver(calculated.version) : "";
  const tag = version ? tagNameForVersion(version, args) : "";
  const shouldRelease = Boolean(
    versionInput.should_release && !versionInput.skip_release,
  );

  const status = !validation.ok
    ? "invalid"
    : !shouldRelease && args.allow_no_release
      ? "no-release"
      : tagInfo.exists
        ? "tag-exists"
        : calculated.strategy;

  return {
    schema_version: 1,
    type: "release-determine-version",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      config_available: configAvailable,
      package_file: toRelativePath(
        resolvePath(args.package_file, repoRoot),
        repoRoot,
      ),
      label_report_file: toRelativePath(
        resolvePath(args.label_report_file, repoRoot),
        repoRoot,
      ),
      label_report_available: versionInput.label_report_available,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      tag_prefix: args.tag_prefix,
      default_release_type: args.default_release_type,
      default_channel: args.default_channel,
      use_label_report: args.use_label_report,
      use_package_json: args.use_package_json,
      use_git_tags: args.use_git_tags,
      allow_no_release: args.allow_no_release,
      allow_no_bump: args.allow_no_bump,
      stable_from_prerelease: args.stable_from_prerelease,
      increment_matching_prerelease: args.increment_matching_prerelease,
      include_build_metadata: args.include_build_metadata,
      check_tag_exists: args.check_tag_exists,
      fail_if_tag_exists: args.fail_if_tag_exists,
      fail_if_no_release: args.fail_if_no_release,
      dry_run: args.dry_run,
    },
    input: versionInput,
    current: {
      version: versionInput.current_version,
      package_version: versionInput.package_version,
      parsed: parseSemver(versionInput.current_version),
    },
    release: {
      should_release: shouldRelease,
      skip_release: Boolean(versionInput.skip_release),
      release_type: versionInput.release_type,
      release_channel: versionInput.release_channel,
      prerelease: versionInput.release_channel !== "stable",
      prerelease_id: versionInput.prerelease_id,
      version,
      version_without_prefix: version,
      tag,
      tag_prefix: args.tag_prefix,
      tag_url: tagUrl(args.repository, tag),
      compare_url: compareUrl(args.repository, tagInfo.latest_tag, tag),
      strategy: calculated.strategy,
      reason: calculated.reason,
    },
    git: tagInfo,
    validation,
    totals: {
      errors: validation.errors.length,
      warnings: validation.warnings.length,
      ok: validation.ok,
    },
    errors: validation.errors,
    warnings: validation.warnings,
    status,
    ok: validation.ok,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function createMarkdownSummary(report) {
  const icon = report.release.should_release ? "🚀" : "⏭️";

  const lines = [
    `# 🔢 ${PROJECT_NAME} Release Version`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${report.status}\``,
    `- Decision: ${icon} \`${report.release.should_release ? "release" : "do not release"}\``,
    `- Current version: \`${report.current.version || "unknown"}\``,
    `- Next version: \`${report.release.version || "unresolved"}\``,
    `- Release tag: \`${report.release.tag || "unresolved"}\``,
    `- Release type: \`${report.release.release_type}\``,
    `- Release channel: \`${report.release.release_channel}\``,
    `- Strategy: \`${report.release.strategy || "unknown"}\``,
    `- Reason: ${escapeMarkdown(report.release.reason || "No reason provided.")}`,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${report.github.workflow || "unknown"}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 🏷️ Git Tags",
    "",
    `- Latest tag: \`${report.git.latest_tag || "none"}\``,
    `- Latest version tag: \`${report.git.latest_version_tag || "none"}\``,
    `- Final tag exists: \`${report.git.exists ? "true" : "false"}\``,
    "",
    "## ⚙️ Version Configuration",
    "",
    `- Tag prefix: \`${report.config.tag_prefix}\``,
    `- Allow no release: \`${report.config.allow_no_release ? "true" : "false"}\``,
    `- Allow no bump: \`${report.config.allow_no_bump ? "true" : "false"}\``,
    `- Stable from prerelease: \`${report.config.stable_from_prerelease ? "true" : "false"}\``,
    `- Build metadata enabled: \`${report.config.include_build_metadata ? "true" : "false"}\``,
    "",
  ];

  if (report.release.tag_url) {
    lines.push(`Release tag URL: ${report.release.tag_url}`);
    lines.push("");
  }

  if (report.release.compare_url) {
    lines.push(`Compare URL: ${report.release.compare_url}`);
    lines.push("");
  }

  if (report.errors.length) {
    lines.push("## ❌ Errors");
    lines.push("");

    for (const error of report.errors) {
      lines.push(`- ${escapeMarkdown(error)}`);
    }

    lines.push("");
  }

  if (report.warnings.length) {
    lines.push("## ⚠️ Warnings");
    lines.push("");

    for (const warning of report.warnings) {
      lines.push(`- ${escapeMarkdown(warning)}`);
    }

    lines.push("");
  }

  lines.push("## 📥 Inputs");
  lines.push("");
  lines.push(`- Config file: \`${report.config.config_file || "not found"}\``);
  lines.push(
    `- Config available: \`${report.config.config_available ? "true" : "false"}\``,
  );
  lines.push(`- Package file: \`${report.config.package_file}\``);
  lines.push(
    `- Package version: \`${report.input.package_version || "none"}\``,
  );
  lines.push(`- Label report: \`${report.config.label_report_file}\``);
  lines.push(
    `- Label report available: \`${report.config.label_report_available ? "true" : "false"}\``,
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
  setGitHubOutput("release_version_file", report.config.output_file);
  setGitHubOutput(
    "release_version_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("release_version_status", report.status);
  setGitHubOutput("release_version_ok", report.ok ? "true" : "false");

  setGitHubOutput(
    "release_should_release",
    report.release.should_release ? "true" : "false",
  );
  setGitHubOutput(
    "release_skip",
    report.release.skip_release ? "true" : "false",
  );
  setGitHubOutput("release_type", report.release.release_type);
  setGitHubOutput("release_channel", report.release.release_channel);
  setGitHubOutput(
    "release_prerelease",
    report.release.prerelease ? "true" : "false",
  );
  setGitHubOutput("release_prerelease_id", report.release.prerelease_id || "");

  setGitHubOutput("release_current_version", report.current.version || "");
  setGitHubOutput("release_version", report.release.version || "");
  setGitHubOutput(
    "release_version_without_prefix",
    report.release.version_without_prefix || "",
  );
  setGitHubOutput("release_tag", report.release.tag || "");
  setGitHubOutput("release_tag_prefix", report.release.tag_prefix || "");
  setGitHubOutput("release_tag_exists", report.git.exists ? "true" : "false");
  setGitHubOutput("release_tag_url", report.release.tag_url || "");
  setGitHubOutput("release_compare_url", report.release.compare_url || "");
  setGitHubOutput("release_strategy", report.release.strategy || "");
  setGitHubOutput("release_reason", report.release.reason || "");

  setGitHubOutput("release_latest_tag", report.git.latest_tag || "");
  setGitHubOutput(
    "release_latest_version_tag",
    report.git.latest_version_tag || "",
  );
  setGitHubOutput("release_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("release_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readConfigFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  logger.info("Determining release version.");

  const versionInput = resolveVersionInput(args, repoRoot);
  const current = parseSemver(versionInput.current_version);
  const calculated = determineNextVersion(current, versionInput, args);
  const version = calculated.version ? formatSemver(calculated.version) : "";
  const tag = version ? tagNameForVersion(version, args) : "";

  const tagInfo = {
    tag,
    exists:
      args.check_tag_exists && args.use_git_tags
        ? tagExists(repoRoot, tag)
        : false,
    latest_tag: args.use_git_tags ? latestTag(repoRoot) : "",
    latest_version_tag: args.use_git_tags ? latestVersionTag(repoRoot) : "",
  };

  const validation = validateResult(args, versionInput, calculated, tagInfo);
  const report = createReport(
    args,
    repoRoot,
    configFile,
    Boolean(config),
    versionInput,
    calculated,
    tagInfo,
    validation,
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
