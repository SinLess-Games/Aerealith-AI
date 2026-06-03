#!/usr/bin/env node
// .github/scripts/repo/sync-labels.js
// =============================================================================
// Aerealith AI — GitHub Label Sync
// -----------------------------------------------------------------------------
// Purpose:
//   Sync repository labels from .github/labels.yaml, .github/labels.yml,
//   .github/labels.json, or an explicitly provided labels file.
//
// Supported label shape:
//   - name: "type: feature"
//     color: "0E8A16"
//     description: "New feature work."
//
// Output:
//   - artifacts/repo/sync-labels.json
//   - artifacts/repo/sync-labels.md
//   - GitHub step outputs for downstream jobs
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses the GitHub REST API directly.
//   - Safe dry-run mode.
//   - Can create, update, rename through aliases, and optionally delete labels.
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
    info: (message) => console.log(`[sync-labels] ${message}`),
    warn: (message) => console.warn(`[sync-labels] WARN: ${message}`),
    error: (message) => console.error(`[sync-labels] ERROR: ${message}`),
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
  ".github/repo/sync-labels.json",
  ".github/repo/sync-labels.jsonc",
  ".github/repo/sync-labels.yaml",
  ".github/repo/sync-labels.yml",
  ".github/sync-labels.json",
  ".github/sync-labels.jsonc",
  ".github/sync-labels.yaml",
  ".github/sync-labels.yml",
];

const DEFAULT_LABEL_FILE_CANDIDATES = [
  ".github/labels.yaml",
  ".github/labels.yml",
  ".github/labels.json",
  ".github/labels.jsonc",
  ".github/repo/labels.yaml",
  ".github/repo/labels.yml",
  ".github/repo/labels.json",
  ".github/repo/labels.jsonc",
];

const DEFAULT_OUTPUT_FILE = "artifacts/repo/sync-labels.json";
const DEFAULT_SUMMARY_FILE = "artifacts/repo/sync-labels.md";

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

function normalizeLabelName(value) {
  return normalizeString(value);
}

function normalizeLabelKey(value) {
  return normalizeLabelName(value).toLowerCase();
}

function normalizeColor(value, fallback = "ededed") {
  const color = normalizeString(value, fallback)
    .replace(/^#/, "")
    .trim()
    .toLowerCase();

  if (/^[0-9a-f]{6}$/.test(color)) return color;

  return fallback;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    api_url: process.env.GITHUB_API_URL || "https://api.github.com",
    token:
      process.env.SYNC_LABELS_TOKEN ||
      process.env.REPO_AUTOMATION_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      "",

    config_file: process.env.SYNC_LABELS_CONFIG_FILE || "",
    labels_file: process.env.SYNC_LABELS_FILE || process.env.LABELS_FILE || "",

    output_file: process.env.SYNC_LABELS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.SYNC_LABELS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    include_labels: normalizeStringList(process.env.SYNC_LABELS_INCLUDE || ""),
    exclude_labels: normalizeStringList(process.env.SYNC_LABELS_EXCLUDE || ""),
    preserve_labels: normalizeStringList(
      process.env.SYNC_LABELS_PRESERVE ||
        "dependencies,github-actions,renovate,dependabot",
    ),

    delete_missing: normalizeBoolean(
      process.env.SYNC_LABELS_DELETE_MISSING,
      false,
    ),
    create_missing: normalizeBoolean(
      process.env.SYNC_LABELS_CREATE_MISSING,
      true,
    ),
    update_existing: normalizeBoolean(
      process.env.SYNC_LABELS_UPDATE_EXISTING,
      true,
    ),
    rename_from_aliases: normalizeBoolean(
      process.env.SYNC_LABELS_RENAME_FROM_ALIASES,
      true,
    ),

    fail_if_no_labels: normalizeBoolean(
      process.env.SYNC_LABELS_FAIL_IF_NO_LABELS,
      true,
    ),
    fail_on_invalid_label: normalizeBoolean(
      process.env.SYNC_LABELS_FAIL_ON_INVALID_LABEL,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.SYNC_LABELS_FAIL_ON_ERROR,
      true,
    ),

    timeout_seconds: normalizeInteger(
      process.env.SYNC_LABELS_TIMEOUT_SECONDS,
      60,
    ),

    dry_run: normalizeBoolean(
      process.env.SYNC_LABELS_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.SYNC_LABELS_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.SYNC_LABELS_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.SYNC_LABELS_STEP_SUMMARY,
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

    if (arg === "--labels-file" || arg === "--file" || arg === "--source") {
      args.labels_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include-label" || arg === "--include-labels") {
      args.include_labels.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-label" || arg === "--exclude-labels") {
      args.exclude_labels.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--preserve-label" || arg === "--preserve-labels") {
      args.preserve_labels.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--delete-missing") {
      args.delete_missing = true;
      continue;
    }

    if (arg === "--no-delete-missing") {
      args.delete_missing = false;
      continue;
    }

    if (arg === "--create-missing") {
      args.create_missing = true;
      continue;
    }

    if (arg === "--no-create-missing") {
      args.create_missing = false;
      continue;
    }

    if (arg === "--update-existing") {
      args.update_existing = true;
      continue;
    }

    if (arg === "--no-update-existing") {
      args.update_existing = false;
      continue;
    }

    if (arg === "--rename-from-aliases") {
      args.rename_from_aliases = true;
      continue;
    }

    if (arg === "--no-rename-from-aliases") {
      args.rename_from_aliases = false;
      continue;
    }

    if (arg === "--fail-if-no-labels") {
      args.fail_if_no_labels = true;
      continue;
    }

    if (arg === "--no-fail-if-no-labels") {
      args.fail_if_no_labels = false;
      continue;
    }

    if (arg === "--fail-on-invalid-label") {
      args.fail_on_invalid_label = true;
      continue;
    }

    if (arg === "--no-fail-on-invalid-label") {
      args.fail_on_invalid_label = false;
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
  args.labels_file = normalizeString(args.labels_file);
  args.include_labels = [
    ...new Set(args.include_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  args.exclude_labels = [
    ...new Set(args.exclude_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  args.preserve_labels = [
    ...new Set(args.preserve_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  args.timeout_seconds = Math.max(1, args.timeout_seconds);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI GitHub Label Sync

Usage:
  node .github/scripts/repo/sync-labels.js [options]

Examples:
  node .github/scripts/repo/sync-labels.js
  node .github/scripts/repo/sync-labels.js --labels-file .github/labels.yaml
  node .github/scripts/repo/sync-labels.js --dry-run
  node .github/scripts/repo/sync-labels.js --delete-missing
  node .github/scripts/repo/sync-labels.js --include-label "type: feature"

Labels YAML:
  - name: "type: feature"
    color: "0E8A16"
    description: "New feature work."
  - name: "area: ci"
    color: "5319E7"
    description: "Continuous integration and automation."

Options:
      --repo <owner/repo>              Repository slug.
      --api-url <url>                  GitHub API URL.
      --token <token>                  GitHub token.
      --config <file>                  Sync config file.
      --labels-file <file>             Label source file.
      --include-label <label,list>     Only sync matching label names.
      --exclude-label <label,list>     Exclude matching label names.
      --preserve-label <label,list>    Never delete matching remote labels.
      --delete-missing                 Delete remote labels missing from source.
      --no-delete-missing              Do not delete missing labels. Default.
      --create-missing                 Create missing labels. Default.
      --no-create-missing              Do not create missing labels.
      --update-existing                Update changed labels. Default.
      --no-update-existing             Do not update changed labels.
      --rename-from-aliases            Rename labels from aliases/old_names. Default.
      --no-rename-from-aliases         Do not rename labels from aliases.
      --fail-if-no-labels              Fail when no desired labels are loaded. Default.
      --no-fail-if-no-labels           Allow empty label source.
      --fail-on-invalid-label          Fail on invalid label entries. Default.
      --no-fail-on-invalid-label       Warn on invalid label entries.
      --fail-on-error                  Exit non-zero on errors. Default.
      --no-fail-on-error               Do not fail workflow.
      --timeout-seconds <number>       GitHub API timeout. Default: 60.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not mutate GitHub.
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

  fs.mkdirSync(dirPath, { recursive: true });
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
  const rootItems = [];
  const lines = String(text || "").split(/\r?\n/);

  let section = "";
  let currentItem = null;
  let currentList = rootItems;

  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);

    if (!line.trim()) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmed = line.trim();

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*$/.test(trimmed)) {
      section = trimmed.replace(/:\s*$/, "");
      config[section] = config[section] || [];
      currentList = Array.isArray(config[section])
        ? config[section]
        : rootItems;
      currentItem = null;
      continue;
    }

    if (/^-\s*/.test(trimmed)) {
      const rest = trimmed.replace(/^-\s*/, "");

      if (rest && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(rest)) {
        const [, key, value] = rest.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        currentItem = {
          [key]: parseYamlScalar(value),
        };
        currentList.push(currentItem);
        continue;
      }

      const scalar = parseYamlScalar(rest);

      if (typeof scalar === "string" && scalar) {
        currentList.push(scalar);
      } else {
        currentItem = {};
        currentList.push(currentItem);
      }

      continue;
    }

    if (currentItem && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      currentItem[key] = parseYamlScalar(value);
      continue;
    }

    if (indent === 0 && /^([A-Za-z0-9_.-]+):\s*(.*)$/.test(trimmed)) {
      const [, key, value] = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      config[key] = parseYamlScalar(value);
    }
  }

  if (rootItems.length) {
    config.labels = rootItems;
  }

  return config;
}

function readDataFile(filePath, repoRoot) {
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

function findLabelsFile(args, repoRoot, config) {
  if (args.labels_file) {
    const absolutePath = resolvePath(args.labels_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : args.labels_file;
  }

  if (config?.labels_file) {
    const absolutePath = resolvePath(config.labels_file, repoRoot);
    return isFile(absolutePath)
      ? toRelativePath(absolutePath, repoRoot)
      : config.labels_file;
  }

  if (Array.isArray(config?.labels)) {
    return "";
  }

  for (const candidate of DEFAULT_LABEL_FILE_CANDIDATES) {
    if (isFile(resolvePath(candidate, repoRoot))) {
      return candidate;
    }
  }

  return "";
}

function applyConfig(args, config) {
  if (!config || typeof config !== "object") return args;

  const merged = { ...args };

  const stringKeys = ["labels_file", "output_file", "summary_file"];

  for (const key of stringKeys) {
    if (config[key] !== undefined && !merged[key]) {
      merged[key] = normalizeString(config[key], merged[key]);
    }
  }

  const listKeys = ["include_labels", "exclude_labels", "preserve_labels"];

  for (const key of listKeys) {
    if (config[key] !== undefined) {
      merged[key] = [
        ...new Set([...merged[key], ...normalizeStringList(config[key])]),
      ];
    }
  }

  const booleanKeys = [
    "delete_missing",
    "create_missing",
    "update_existing",
    "rename_from_aliases",
    "fail_if_no_labels",
    "fail_on_invalid_label",
  ];

  for (const key of booleanKeys) {
    if (config[key] !== undefined) {
      merged[key] = normalizeBoolean(config[key], merged[key]);
    }
  }

  if (config.timeout_seconds !== undefined) {
    merged.timeout_seconds = normalizeInteger(
      config.timeout_seconds,
      merged.timeout_seconds,
    );
  }

  merged.include_labels = [
    ...new Set(merged.include_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  merged.exclude_labels = [
    ...new Set(merged.exclude_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  merged.preserve_labels = [
    ...new Set(merged.preserve_labels.map(normalizeLabelName).filter(Boolean)),
  ];
  merged.timeout_seconds = Math.max(1, merged.timeout_seconds);

  return merged;
}

function normalizeLabelEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return {
      valid: false,
      error: `Label entry ${index + 1} is not an object.`,
      label: null,
    };
  }

  const name = normalizeLabelName(entry.name || entry.label || entry.title);
  const color = normalizeColor(
    entry.color || entry.colour || entry.hex || "ededed",
  );
  const description = normalizeString(entry.description || entry.desc || "");
  const aliases = [
    ...new Set(
      normalizeStringList(
        entry.aliases ||
          entry.old_names ||
          entry.oldNames ||
          entry.previous_names ||
          [],
      )
        .map(normalizeLabelName)
        .filter(Boolean),
    ),
  ];

  if (!name) {
    return {
      valid: false,
      error: `Label entry ${index + 1} is missing a name.`,
      label: null,
    };
  }

  if (!/^[0-9a-f]{6}$/.test(color)) {
    return {
      valid: false,
      error: `Label "${name}" has invalid color "${entry.color}".`,
      label: null,
    };
  }

  return {
    valid: true,
    error: "",
    label: {
      name,
      color,
      description,
      aliases,
      enabled: normalizeBoolean(entry.enabled, true),
      preserve: normalizeBoolean(entry.preserve, false),
      source_index: index,
    },
  };
}

function loadDesiredLabels(args, labelsData) {
  const sourceLabels = Array.isArray(labelsData)
    ? labelsData
    : Array.isArray(labelsData?.labels)
      ? labelsData.labels
      : [];

  const includeKeys = new Set(args.include_labels.map(normalizeLabelKey));
  const excludeKeys = new Set(args.exclude_labels.map(normalizeLabelKey));

  const labels = [];
  const invalid = [];
  const duplicateNames = new Set();
  const seen = new Set();

  sourceLabels.forEach((entry, index) => {
    const normalized = normalizeLabelEntry(entry, index);

    if (!normalized.valid) {
      invalid.push(normalized.error);
      return;
    }

    const label = normalized.label;
    const key = normalizeLabelKey(label.name);

    if (!label.enabled) return;
    if (includeKeys.size && !includeKeys.has(key)) return;
    if (excludeKeys.has(key)) return;

    if (seen.has(key)) {
      duplicateNames.add(label.name);
      return;
    }

    seen.add(key);
    labels.push(label);
  });

  return {
    labels,
    invalid,
    duplicate_names: [...duplicateNames],
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body === undefined ? null : options.body;
  const bodyBuffer = body
    ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    : null;

  const headers = {
    "User-Agent": `${PROJECT_NAME.replace(/\s+/g, "-")}-sync-labels-script`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (bodyBuffer && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (bodyBuffer) {
    headers["Content-Length"] = String(bodyBuffer.length);
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

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }

    req.end();
  });
}

function apiUrl(args, endpoint) {
  return `${args.api_url}${endpoint}`;
}

function repoEndpoint(args, suffix) {
  return `/repos/${args.repository}${suffix}`;
}

async function fetchExistingLabels(args) {
  const labels = [];
  let page = 1;

  while (page <= 20) {
    const response = await requestJson(
      apiUrl(args, repoEndpoint(args, `/labels?per_page=100&page=${page}`)),
      {
        method: "GET",
        token: args.token,
        timeout_seconds: args.timeout_seconds,
      },
    );

    const body = Array.isArray(response.body) ? response.body : [];

    labels.push(
      ...body.map((label) => ({
        id: label.id,
        node_id: label.node_id,
        name: normalizeLabelName(label.name),
        color: normalizeColor(label.color),
        description: normalizeString(label.description),
        url: normalizeString(label.url),
      })),
    );

    if (body.length < 100) break;

    page += 1;
  }

  return labels;
}

async function createLabel(args, label) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, "/labels")),
    {
      method: "POST",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        name: label.name,
        color: label.color,
        description: label.description,
      },
    },
  );

  return response.body;
}

async function updateLabel(args, currentName, label) {
  const response = await requestJson(
    apiUrl(
      args,
      repoEndpoint(args, `/labels/${encodeURIComponent(currentName)}`),
    ),
    {
      method: "PATCH",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      body: {
        new_name: label.name,
        color: label.color,
        description: label.description,
      },
    },
  );

  return response.body;
}

async function deleteLabel(args, name) {
  const response = await requestJson(
    apiUrl(args, repoEndpoint(args, `/labels/${encodeURIComponent(name)}`)),
    {
      method: "DELETE",
      token: args.token,
      timeout_seconds: args.timeout_seconds,
      allow_error: true,
    },
  );

  if (response.status_code === 204 || response.status_code === 404) {
    return true;
  }

  const message =
    typeof response.body === "object" && response.body?.message
      ? response.body.message
      : response.raw_body || `HTTP ${response.status_code}`;

  throw new Error(`Unable to delete label "${name}": ${message}`);
}

function labelChanged(existing, desired) {
  if (!existing) return true;

  return (
    normalizeLabelName(existing.name) !== normalizeLabelName(desired.name) ||
    normalizeColor(existing.color) !== normalizeColor(desired.color) ||
    normalizeString(existing.description) !==
      normalizeString(desired.description)
  );
}

function buildSyncPlan(args, desiredLabels, existingLabels) {
  const existingByKey = new Map(
    existingLabels.map((label) => [normalizeLabelKey(label.name), label]),
  );
  const desiredByKey = new Map(
    desiredLabels.map((label) => [normalizeLabelKey(label.name), label]),
  );
  const preserveKeys = new Set([
    ...args.preserve_labels.map(normalizeLabelKey),
    ...desiredLabels
      .filter((label) => label.preserve)
      .map((label) => normalizeLabelKey(label.name)),
  ]);

  const creates = [];
  const updates = [];
  const unchanged = [];
  const deletes = [];
  const skipped = [];

  for (const desired of desiredLabels) {
    const desiredKey = normalizeLabelKey(desired.name);
    const existing = existingByKey.get(desiredKey);

    if (existing) {
      if (labelChanged(existing, desired)) {
        updates.push({
          action: "update",
          from_name: existing.name,
          label: desired,
          existing,
          rename:
            normalizeLabelName(existing.name) !==
            normalizeLabelName(desired.name),
        });
      } else {
        unchanged.push({
          action: "unchanged",
          label: desired,
          existing,
        });
      }

      continue;
    }

    const aliasMatch = args.rename_from_aliases
      ? desired.aliases
          .map((alias) => existingByKey.get(normalizeLabelKey(alias)))
          .find(Boolean)
      : null;

    if (aliasMatch) {
      updates.push({
        action: "rename",
        from_name: aliasMatch.name,
        label: desired,
        existing: aliasMatch,
        rename: true,
      });
      continue;
    }

    if (args.create_missing) {
      creates.push({
        action: "create",
        label: desired,
      });
    } else {
      skipped.push({
        action: "skip-create-disabled",
        label: desired,
      });
    }
  }

  const desiredAndAliasKeys = new Set();

  for (const desired of desiredLabels) {
    desiredAndAliasKeys.add(normalizeLabelKey(desired.name));

    for (const alias of desired.aliases) {
      desiredAndAliasKeys.add(normalizeLabelKey(alias));
    }
  }

  for (const existing of existingLabels) {
    const key = normalizeLabelKey(existing.name);

    if (desiredAndAliasKeys.has(key)) continue;

    if (args.delete_missing && !preserveKeys.has(key)) {
      deletes.push({
        action: "delete",
        existing,
      });
    } else {
      skipped.push({
        action: args.delete_missing ? "preserved" : "delete-disabled",
        existing,
      });
    }
  }

  return {
    creates,
    updates,
    unchanged,
    deletes,
    skipped,
  };
}

async function executeSync(args, plan, remoteAvailable) {
  const startedAt = new Date();

  const result = {
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    remote_available: remoteAvailable,
    created: [],
    updated: [],
    renamed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.label.name),
    skipped: plan.skipped.map(
      (item) => item.label?.name || item.existing?.name || "unknown",
    ),
    errors: [],
    warnings: [],
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
  };

  try {
    if (!remoteAvailable) {
      result.status = args.dry_run ? "planned-without-remote" : "failed";
      result.success = Boolean(args.dry_run);
      result.warnings.push(
        "Remote labels were not fetched, so create/update/delete accuracy could not be verified.",
      );

      if (args.dry_run) {
        result.created = plan.creates.map((item) => item.label.name);
        result.updated = plan.updates
          .filter((item) => !item.rename)
          .map((item) => item.label.name);
        result.renamed = plan.updates
          .filter((item) => item.rename)
          .map((item) => `${item.from_name} -> ${item.label.name}`);
        result.deleted = plan.deletes.map((item) => item.existing.name);
      }

      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      result.created = plan.creates.map((item) => item.label.name);
      result.updated = plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.label.name);
      result.renamed = plan.updates
        .filter((item) => item.rename)
        .map((item) => `${item.from_name} -> ${item.label.name}`);
      result.deleted = plan.deletes.map((item) => item.existing.name);
      return result;
    }

    if (!args.token) {
      result.status = "failed";
      result.errors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_LABELS_TOKEN, or --token.",
      );
      return result;
    }

    for (const item of plan.creates) {
      logger.info(`Creating label "${item.label.name}".`);
      await createLabel(args, item.label);
      result.created.push(item.label.name);
    }

    if (args.update_existing) {
      for (const item of plan.updates) {
        logger.info(
          `${item.rename ? "Renaming/updating" : "Updating"} label "${item.from_name}" -> "${item.label.name}".`,
        );
        await updateLabel(args, item.from_name, item.label);

        if (item.rename) {
          result.renamed.push(`${item.from_name} -> ${item.label.name}`);
        } else {
          result.updated.push(item.label.name);
        }
      }
    } else if (plan.updates.length) {
      result.skipped.push(...plan.updates.map((item) => item.label.name));
      result.warnings.push("Existing label updates are disabled.");
    }

    for (const item of plan.deletes) {
      logger.info(`Deleting label "${item.existing.name}".`);
      await deleteLabel(args, item.existing.name);
      result.deleted.push(item.existing.name);
    }

    result.status = "synced";
    result.success = true;

    return result;
  } catch (err) {
    result.status = "failed";
    result.success = false;
    result.errors.push(logger.formatError(err));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (value < 1000) return `${value}ms`;

  const seconds = value / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

function createReport(
  args,
  repoRoot,
  configFile,
  labelsFile,
  labelsLoad,
  existingLabels,
  plan,
  execution,
) {
  const github = getGitMetadata(repoRoot);
  const invalidErrors = args.fail_on_invalid_label ? labelsLoad.invalid : [];
  const invalidWarnings = args.fail_on_invalid_label ? [] : labelsLoad.invalid;
  const noLabelsError =
    args.fail_if_no_labels && labelsLoad.labels.length === 0
      ? ["No desired labels were loaded."]
      : [];

  const errors = [...invalidErrors, ...noLabelsError, ...execution.errors];
  const warnings = [
    ...invalidWarnings,
    ...labelsLoad.duplicate_names.map(
      (name) => `Duplicate label ignored: ${name}`,
    ),
    ...execution.warnings,
  ];

  const ok = execution.success && errors.length === 0;
  const status = ok ? execution.status : "failed";

  return {
    schema_version: 1,
    type: "repo-sync-labels",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github,
    config: {
      config_file: configFile || null,
      labels_file: labelsFile || null,
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      create_missing: args.create_missing,
      update_existing: args.update_existing,
      delete_missing: args.delete_missing,
      rename_from_aliases: args.rename_from_aliases,
      include_labels: args.include_labels,
      exclude_labels: args.exclude_labels,
      preserve_labels: args.preserve_labels,
      dry_run: args.dry_run,
    },
    labels: {
      desired: labelsLoad.labels,
      existing: existingLabels,
      invalid: labelsLoad.invalid,
      duplicate_names: labelsLoad.duplicate_names,
    },
    plan: {
      create: plan.creates.map((item) => item.label.name),
      update: plan.updates
        .filter((item) => !item.rename)
        .map((item) => item.label.name),
      rename: plan.updates
        .filter((item) => item.rename)
        .map((item) => ({
          from: item.from_name,
          to: item.label.name,
        })),
      delete: plan.deletes.map((item) => item.existing.name),
      unchanged: plan.unchanged.map((item) => item.label.name),
      skipped: plan.skipped.map((item) => ({
        action: item.action,
        name: item.label?.name || item.existing?.name || "unknown",
      })),
    },
    execution,
    totals: {
      desired_labels: labelsLoad.labels.length,
      existing_labels: existingLabels.length,
      invalid_labels: labelsLoad.invalid.length,
      duplicate_labels: labelsLoad.duplicate_names.length,
      planned_create: plan.creates.length,
      planned_update: plan.updates.filter((item) => !item.rename).length,
      planned_rename: plan.updates.filter((item) => item.rename).length,
      planned_delete: plan.deletes.length,
      unchanged: plan.unchanged.length,
      skipped: plan.skipped.length,
      created: execution.created.length,
      updated: execution.updated.length,
      renamed: execution.renamed.length,
      deleted: execution.deleted.length,
      errors: errors.length,
      warnings: warnings.length,
      duration_ms: execution.duration_ms,
      duration_human: formatDuration(execution.duration_ms),
      ok,
    },
    errors,
    warnings,
    status,
    ok,
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
  const icon = report.ok ? (report.config.dry_run ? "🧪" : "✅") : "❌";

  const lines = [
    `# 🏷️ ${PROJECT_NAME} Label Sync`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: ${icon} \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Desired labels: \`${report.totals.desired_labels}\``,
    `- Existing labels: \`${report.totals.existing_labels}\``,
    `- Planned create: \`${report.totals.planned_create}\``,
    `- Planned update: \`${report.totals.planned_update}\``,
    `- Planned rename: \`${report.totals.planned_rename}\``,
    `- Planned delete: \`${report.totals.planned_delete}\``,
    `- Unchanged: \`${report.totals.unchanged}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${escapeMarkdown(report.github.branch || "unknown")}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Workflow: \`${escapeMarkdown(report.github.workflow || "unknown")}\``,
    `- Run: \`${report.github.run_id || "unknown"}\``,
    "",
    "## 📋 Label Plan",
    "",
    "| Action | Labels |",
    "|---|---|",
    `| Create | \`${escapeMarkdown(report.plan.create.join(", ") || "none")}\` |`,
    `| Update | \`${escapeMarkdown(report.plan.update.join(", ") || "none")}\` |`,
    `| Rename | \`${escapeMarkdown(report.plan.rename.map((item) => `${item.from} -> ${item.to}`).join(", ") || "none")}\` |`,
    `| Delete | \`${escapeMarkdown(report.plan.delete.join(", ") || "none")}\` |`,
    `| Unchanged | \`${escapeMarkdown(report.plan.unchanged.join(", ") || "none")}\` |`,
    "",
  ];

  if (report.plan.skipped.length) {
    lines.push("## ⏭️ Skipped");
    lines.push("");
    lines.push("| Label | Reason |");
    lines.push("|---|---|");

    for (const item of report.plan.skipped) {
      lines.push(
        `| \`${escapeMarkdown(item.name)}\` | \`${escapeMarkdown(item.action)}\` |`,
      );
    }

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
    `- Labels file: \`${report.config.labels_file || "inline config labels"}\``,
  );
  lines.push(
    `- Create missing: \`${report.config.create_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Update existing: \`${report.config.update_existing ? "true" : "false"}\``,
  );
  lines.push(
    `- Delete missing: \`${report.config.delete_missing ? "true" : "false"}\``,
  );
  lines.push(
    `- Rename from aliases: \`${report.config.rename_from_aliases ? "true" : "false"}\``,
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
  setGitHubOutput("sync_labels_file", report.config.output_file);
  setGitHubOutput("sync_labels_summary_file", report.config.summary_file || "");
  setGitHubOutput("sync_labels_status", report.status);
  setGitHubOutput("sync_labels_ok", report.ok ? "true" : "false");

  setGitHubOutput("sync_labels_desired", String(report.totals.desired_labels));
  setGitHubOutput(
    "sync_labels_existing",
    String(report.totals.existing_labels),
  );
  setGitHubOutput(
    "sync_labels_planned_create",
    String(report.totals.planned_create),
  );
  setGitHubOutput(
    "sync_labels_planned_update",
    String(report.totals.planned_update),
  );
  setGitHubOutput(
    "sync_labels_planned_rename",
    String(report.totals.planned_rename),
  );
  setGitHubOutput(
    "sync_labels_planned_delete",
    String(report.totals.planned_delete),
  );
  setGitHubOutput("sync_labels_created", String(report.totals.created));
  setGitHubOutput("sync_labels_updated", String(report.totals.updated));
  setGitHubOutput("sync_labels_renamed", String(report.totals.renamed));
  setGitHubOutput("sync_labels_deleted", String(report.totals.deleted));

  setGitHubOutput(
    "sync_labels_create_json",
    JSON.stringify(report.plan.create),
  );
  setGitHubOutput(
    "sync_labels_update_json",
    JSON.stringify(report.plan.update),
  );
  setGitHubOutput(
    "sync_labels_rename_json",
    JSON.stringify(report.plan.rename),
  );
  setGitHubOutput(
    "sync_labels_delete_json",
    JSON.stringify(report.plan.delete),
  );
  setGitHubOutput("sync_labels_errors_json", JSON.stringify(report.errors));
  setGitHubOutput("sync_labels_warnings_json", JSON.stringify(report.warnings));
}

async function main() {
  let args = parseArgs();
  const repoRoot = findRepoRoot();

  const configFile = findConfigFile(args, repoRoot);
  const config = configFile ? readDataFile(configFile, repoRoot) : null;

  args = applyConfig(args, config);

  const labelsFile = findLabelsFile(args, repoRoot, config);
  const labelsData = labelsFile ? readDataFile(labelsFile, repoRoot) : config;

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing GitHub label sync.");

  const labelsLoad = loadDesiredLabels(args, labelsData);
  const preflightErrors = [];

  if (args.fail_if_no_labels && labelsLoad.labels.length === 0) {
    preflightErrors.push("No desired labels were loaded.");
  }

  if (args.fail_on_invalid_label && labelsLoad.invalid.length > 0) {
    preflightErrors.push(...labelsLoad.invalid);
  }

  let existingLabels = [];
  let remoteAvailable = false;

  try {
    if (args.token) {
      existingLabels = await fetchExistingLabels(args);
      remoteAvailable = true;
    } else if (!args.dry_run) {
      preflightErrors.push(
        "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, SYNC_LABELS_TOKEN, or --token.",
      );
    }
  } catch (err) {
    preflightErrors.push(
      `Unable to fetch existing labels: ${logger.formatError(err)}`,
    );
  }

  const plan = buildSyncPlan(args, labelsLoad.labels, existingLabels);

  let execution = {
    status: "failed",
    success: false,
    dry_run: args.dry_run,
    remote_available: remoteAvailable,
    created: [],
    updated: [],
    renamed: [],
    deleted: [],
    unchanged: plan.unchanged.map((item) => item.label.name),
    skipped: plan.skipped.map(
      (item) => item.label?.name || item.existing?.name || "unknown",
    ),
    errors: preflightErrors,
    warnings: [],
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 0,
  };

  if (!preflightErrors.length) {
    execution = await executeSync(args, plan, remoteAvailable);
  }

  const report = createReport(
    args,
    repoRoot,
    configFile,
    labelsFile,
    labelsLoad,
    existingLabels,
    plan,
    execution,
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
