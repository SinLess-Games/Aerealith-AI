#!/usr/bin/env node
// .github/scripts/ci/run-nx-targets.js
// =============================================================================
// Aerealith AI — CI Nx Target Runner
// -----------------------------------------------------------------------------
// Purpose:
//   Run selected Nx targets against affected, explicit, or all workspace
//   projects and produce structured CI evidence for GitHub Actions.
//
// Input:
//   - artifacts/ci/affected-projects.json
//
// Output:
//   - artifacts/ci/nx-target-results.json
//   - artifacts/ci/nx-target-results.md
//   - artifacts/ci/nx-target-results/logs/*.stdout.log
//   - artifacts/ci/nx-target-results/logs/*.stderr.log
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Uses pnpm exec nx by default when pnpm-lock.yaml exists.
//   - Supports batch run-many mode and per-project run mode.
//   - Does not mutate repository files except output artifacts.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[nx-targets] ${message}`),
    warn: (message) => console.warn(`[nx-targets] WARN: ${message}`),
    error: (message) => console.error(`[nx-targets] ERROR: ${message}`),
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

const DEFAULT_INPUT_FILE = "artifacts/ci/affected-projects.json";
const DEFAULT_OUTPUT_FILE = "artifacts/ci/nx-target-results.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/nx-target-results.md";
const DEFAULT_LOG_DIR = "artifacts/ci/nx-target-results/logs";

const DEFAULT_TARGETS = ["lint", "test", "build"];

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const VALID_MODES = new Set(["affected", "affected-direct", "all", "projects"]);
const VALID_STRATEGIES = new Set(["batch", "per-project"]);

const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----)/g;

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

    input_file: process.env.NX_TARGETS_INPUT_FILE || DEFAULT_INPUT_FILE,
    output_file: process.env.NX_TARGETS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.NX_TARGETS_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    log_dir: process.env.NX_TARGETS_LOG_DIR || DEFAULT_LOG_DIR,

    mode: normalizeString(process.env.NX_TARGETS_MODE, "affected"),
    strategy: normalizeString(process.env.NX_TARGETS_STRATEGY, "batch"),

    projects: normalizeStringList(
      process.env.NX_TARGETS_PROJECTS ||
        process.env.AFFECTED_PROJECTS ||
        process.env.PROJECTS,
    ),
    exclude_projects: normalizeStringList(
      process.env.NX_TARGETS_EXCLUDE_PROJECTS || process.env.EXCLUDE_PROJECTS,
    ),
    targets: normalizeStringList(
      process.env.NX_TARGETS || process.env.AFFECTED_TARGETS,
    ),
    configurations: normalizeStringList(
      process.env.NX_TARGETS_CONFIGURATIONS ||
        process.env.NX_CONFIGURATIONS ||
        process.env.CONFIGURATIONS,
    ),
    passthrough_args: normalizeStringList(
      process.env.NX_TARGETS_ARGS || process.env.NX_PASSTHROUGH_ARGS,
    ),

    base:
      process.env.NX_BASE ||
      process.env.AFFECTED_BASE ||
      process.env.GITHUB_BASE_SHA ||
      "",
    head:
      process.env.NX_HEAD ||
      process.env.AFFECTED_HEAD ||
      process.env.GITHUB_HEAD_SHA ||
      process.env.GITHUB_SHA ||
      "",
    base_ref: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,

    package_manager: normalizeString(process.env.NX_PACKAGE_MANAGER, "auto"),
    nx_command: normalizeString(process.env.NX_COMMAND),

    parallel: normalizeInteger(
      process.env.NX_TARGETS_PARALLEL || process.env.NX_PARALLEL,
      3,
    ),
    max_buffer_mb: normalizeInteger(process.env.NX_TARGETS_MAX_BUFFER_MB, 64),
    timeout_minutes: normalizeInteger(
      process.env.NX_TARGETS_TIMEOUT_MINUTES,
      0,
    ),

    skip_nx_cache: normalizeBoolean(
      process.env.NX_TARGETS_SKIP_NX_CACHE,
      false,
    ),
    skip_missing_targets: normalizeBoolean(
      process.env.NX_TARGETS_SKIP_MISSING_TARGETS,
      true,
    ),
    include_dependencies: normalizeBoolean(
      process.env.NX_TARGETS_INCLUDE_DEPENDENCIES,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.NX_TARGETS_CONTINUE_ON_ERROR,
      true,
    ),
    fail_on_error: normalizeBoolean(process.env.NX_TARGETS_FAIL_ON_ERROR, true),
    fail_if_empty: normalizeBoolean(
      process.env.NX_TARGETS_FAIL_IF_EMPTY,
      false,
    ),
    fail_if_no_projects: normalizeBoolean(
      process.env.NX_TARGETS_FAIL_IF_NO_PROJECTS,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.NX_TARGETS_WRITE_SUMMARY,
      true,
    ),
    write_logs: normalizeBoolean(process.env.NX_TARGETS_WRITE_LOGS, true),
    print: normalizeBoolean(process.env.NX_TARGETS_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NX_TARGETS_STEP_SUMMARY,
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

    if (arg === "--input" || arg === "--affected-file") {
      args.input_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--strategy") {
      args.strategy = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project" || arg === "--projects") {
      args.projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--exclude-project" || arg === "--exclude-projects") {
      args.exclude_projects.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--target" || arg === "--targets") {
      args.targets.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--configuration" || arg === "--configurations") {
      args.configurations.push(...normalizeStringList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg === "--base") {
      args.base = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--head") {
      args.head = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--base-ref") {
      args.base_ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--nx-command") {
      args.nx_command = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--parallel") {
      args.parallel = normalizeInteger(argv[index + 1], args.parallel);
      index += 1;
      continue;
    }

    if (arg === "--timeout-minutes") {
      args.timeout_minutes = normalizeInteger(
        argv[index + 1],
        args.timeout_minutes,
      );
      index += 1;
      continue;
    }

    if (arg === "--max-buffer-mb") {
      args.max_buffer_mb = normalizeInteger(
        argv[index + 1],
        args.max_buffer_mb,
      );
      index += 1;
      continue;
    }

    if (arg === "--arg" || arg === "--passthrough") {
      args.passthrough_args.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--skip-nx-cache") {
      args.skip_nx_cache = true;
      continue;
    }

    if (arg === "--no-skip-nx-cache") {
      args.skip_nx_cache = false;
      continue;
    }

    if (arg === "--skip-missing-targets") {
      args.skip_missing_targets = true;
      continue;
    }

    if (arg === "--no-skip-missing-targets") {
      args.skip_missing_targets = false;
      continue;
    }

    if (arg === "--include-dependencies") {
      args.include_dependencies = true;
      continue;
    }

    if (arg === "--exclude-dependencies") {
      args.include_dependencies = false;
      continue;
    }

    if (arg === "--continue-on-error") {
      args.continue_on_error = true;
      continue;
    }

    if (arg === "--no-continue-on-error") {
      args.continue_on_error = false;
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

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--fail-if-no-projects") {
      args.fail_if_no_projects = true;
      continue;
    }

    if (arg === "--logs") {
      args.write_logs = true;
      continue;
    }

    if (arg === "--no-logs") {
      args.write_logs = false;
      continue;
    }

    if (arg === "--log-dir") {
      args.log_dir = argv[index + 1];
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

  args.mode = args.mode.toLowerCase();
  args.strategy = args.strategy.toLowerCase();
  args.package_manager = args.package_manager.toLowerCase();

  if (!VALID_MODES.has(args.mode)) {
    args.mode = "affected";
  }

  if (!VALID_STRATEGIES.has(args.strategy)) {
    args.strategy = "batch";
  }

  args.projects = [...new Set(args.projects)];
  args.exclude_projects = [...new Set(args.exclude_projects)];
  args.targets = [
    ...new Set(args.targets.length ? args.targets : DEFAULT_TARGETS),
  ];
  args.configurations = [...new Set(args.configurations)];
  args.passthrough_args = [...new Set(args.passthrough_args)];
  args.parallel = Math.max(1, args.parallel);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Nx Target Runner

Usage:
  node .github/scripts/ci/run-nx-targets.js [options]

Examples:
  node .github/scripts/ci/run-nx-targets.js --targets lint,test,build
  node .github/scripts/ci/run-nx-targets.js --project web --target build
  node .github/scripts/ci/run-nx-targets.js --mode all --target test --strategy batch
  node .github/scripts/ci/run-nx-targets.js --mode affected-direct --target test --base origin/main --head HEAD

Options:
      --repo <owner/repo>              Repository slug.
      --input <file>                   affected-projects.json input file.
      --mode <mode>                    affected, affected-direct, all, or projects.
      --strategy <strategy>            batch or per-project. Default: batch.
      --project <list>                 Explicit project name(s).
      --exclude-project <list>         Project names to exclude.
      --target <list>                  Nx target(s). Default: lint,test,build.
      --configuration <list>           Nx configuration(s).
      --base <sha|ref>                 Base ref for affected-direct mode.
      --head <sha|ref>                 Head ref for affected-direct mode.
      --package-manager <name>         auto, pnpm, npm, yarn, bun, or npx.
      --nx-command <command>           Custom Nx command prefix.
      --parallel <number>              Nx parallelism. Default: 3.
      --timeout-minutes <number>       Per-command timeout. 0 means no timeout.
      --arg <value>                    Extra argument passed to Nx. Repeatable.
      --skip-nx-cache                  Pass --skip-nx-cache.
      --skip-missing-targets           Skip projects without the requested target. Default.
      --no-skip-missing-targets        Let Nx handle missing targets.
      --continue-on-error              Continue after failed commands. Default.
      --no-continue-on-error           Stop after first failed command.
      --fail-on-error                  Exit non-zero when any command fails. Default.
      --no-fail-on-error               Always exit zero unless script itself fails.
      --fail-if-empty                  Exit non-zero when no run commands are planned.
      --fail-if-no-projects            Exit non-zero when no projects are resolved.
      --logs / --no-logs               Write stdout/stderr log artifacts.
      --log-dir <dir>                  Log output directory.
  -o, --output <file>                  JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --dry-run                        Plan but do not execute Nx.
      --no-print                       Do not print JSON result.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, repoRoot, fallback = null) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) return fallback;

  return safeJsonParse(fs.readFileSync(absolutePath, "utf8"), fallback);
}

function runCommand(command, commandArgs = [], options = {}) {
  try {
    const output = childProcess
      .execFileSync(command, commandArgs, {
        cwd: options.cwd || process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
      })
      .trim();

    return {
      ok: true,
      stdout: output,
      stderr: "",
      error: "",
    };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout ? String(err.stdout).trim() : "",
      stderr: err.stderr ? String(err.stderr).trim() : "",
      error: logger.formatError(err),
    };
  }
}

function runGit(args, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  return (
    runCommand("git", args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 8,
    }).stdout ||
    options.fallback ||
    ""
  );
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

function inferPackageManager(repoRoot, requested) {
  if (requested && requested !== "auto") return requested;
  if (isFile(resolvePath("pnpm-lock.yaml", repoRoot))) return "pnpm";
  if (isFile(resolvePath("yarn.lock", repoRoot))) return "yarn";
  if (isFile(resolvePath("bun.lockb", repoRoot))) return "bun";
  if (isFile(resolvePath("package-lock.json", repoRoot))) return "npm";
  return "pnpm";
}

function splitCommandLine(value) {
  const input = normalizeString(value);
  if (!input) return [];

  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = "";
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current) parts.push(current);

  return parts;
}

function createNxPrefix(args, repoRoot) {
  if (args.nx_command) {
    const parsed = splitCommandLine(args.nx_command);

    if (!parsed.length) {
      return {
        command: "pnpm",
        args: ["exec", "nx"],
        package_manager: "pnpm",
      };
    }

    return {
      command: parsed[0],
      args: parsed.slice(1),
      package_manager: "custom",
    };
  }

  const packageManager = inferPackageManager(repoRoot, args.package_manager);

  if (packageManager === "pnpm") {
    return {
      command: "pnpm",
      args: ["exec", "nx"],
      package_manager: "pnpm",
    };
  }

  if (packageManager === "yarn") {
    return {
      command: "yarn",
      args: ["nx"],
      package_manager: "yarn",
    };
  }

  if (packageManager === "bun") {
    return {
      command: "bunx",
      args: ["nx"],
      package_manager: "bun",
    };
  }

  if (packageManager === "npm") {
    return {
      command: "npx",
      args: ["nx"],
      package_manager: "npm",
    };
  }

  return {
    command: "npx",
    args: ["nx"],
    package_manager: "npx",
  };
}

function loadAffectedInput(args, repoRoot) {
  const data = readJsonFile(args.input_file, repoRoot, null);

  if (!data) {
    return {
      available: false,
      file: toRelativePath(resolvePath(args.input_file, repoRoot), repoRoot),
      data: null,
    };
  }

  return {
    available: true,
    file: toRelativePath(resolvePath(args.input_file, repoRoot), repoRoot),
    data,
  };
}

function runNxJson(nxArgs, repoRoot, args) {
  const prefix = createNxPrefix(args, repoRoot);
  const result = runCommand(prefix.command, [...prefix.args, ...nxArgs], {
    cwd: repoRoot,
    maxBuffer: args.max_buffer_mb * 1024 * 1024,
  });

  return {
    ...result,
    command: [prefix.command, ...prefix.args, ...nxArgs].join(" "),
  };
}

function normalizeProjectRecord(project) {
  if (!project) return null;

  if (typeof project === "string") {
    return {
      name: project,
      root: "",
      project_type: "unknown",
      targets: [],
      source: "name-only",
    };
  }

  return {
    name: normalizeString(project.name),
    root: normalizeString(project.root),
    project_type: normalizeString(
      project.project_type || project.projectType,
      "unknown",
    ),
    targets: Array.isArray(project.targets) ? project.targets.map(String) : [],
    source: normalizeString(
      project.discovery || project.affected_source || project.source,
      "input",
    ),
  };
}

function projectMetadataFromAffectedInput(input) {
  if (!input?.data) return [];

  const sources = [
    ...(Array.isArray(input.data.affected_projects)
      ? input.data.affected_projects
      : []),
    ...(Array.isArray(input.data.projects) ? input.data.projects : []),
  ];

  return sources
    .map(normalizeProjectRecord)
    .filter((project) => project && project.name);
}

function projectNamesFromAffectedInput(input) {
  if (!input?.data) return [];

  const names = [
    ...(Array.isArray(input.data.affected_project_names)
      ? input.data.affected_project_names
      : []),
    ...(Array.isArray(input.data.affected_projects)
      ? input.data.affected_projects.map((project) => project.name)
      : []),
  ];

  return [...new Set(names.map(String).filter(Boolean))].sort();
}

function targetsFromAffectedInput(input) {
  if (!input?.data) return [];

  const targets = new Set();

  if (Array.isArray(input.data.config?.targets)) {
    input.data.config.targets.forEach((target) => targets.add(String(target)));
  }

  if (Array.isArray(input.data.target_matrix)) {
    input.data.target_matrix.forEach((item) => {
      if (item.target) targets.add(String(item.target));
    });
  }

  return [...targets].filter(Boolean);
}

function discoverAllNxProjects(repoRoot, args) {
  const result = runNxJson(["show", "projects", "--json"], repoRoot, args);

  if (!result.ok) {
    logger.warn(
      `Unable to discover Nx projects: ${result.error || result.stderr}`,
    );
    return [];
  }

  const parsed = safeJsonParse(result.stdout, null);

  if (Array.isArray(parsed)) {
    return parsed.map((name) => ({
      name: String(name),
      root: "",
      project_type: "unknown",
      targets: [],
      source: "nx-show-projects",
    }));
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([name, value]) => ({
      name,
      root: normalizeString(value?.root),
      project_type: normalizeString(value?.projectType, "unknown"),
      targets: Object.keys(value?.targets || {}),
      source: "nx-show-projects",
    }));
  }

  return [];
}

function resolveTargets(args, affectedInput) {
  if (args.targets.length) return args.targets;

  const inputTargets = targetsFromAffectedInput(affectedInput);

  if (inputTargets.length) return inputTargets;

  return [...DEFAULT_TARGETS];
}

function resolveProjectSelection(args, affectedInput, allProjects) {
  const excluded = new Set(args.exclude_projects);

  let names = [];

  if (args.projects.length) {
    names = args.projects;
  } else if (args.mode === "all") {
    names = allProjects.map((project) => project.name);
  } else if (args.mode === "affected" || args.mode === "projects") {
    names = projectNamesFromAffectedInput(affectedInput);
  }

  return [...new Set(names)]
    .filter(Boolean)
    .filter((name) => !excluded.has(name))
    .sort();
}

function mergeProjectMetadata(...sets) {
  const byName = new Map();

  for (const set of sets) {
    for (const project of set || []) {
      if (!project?.name) continue;

      const existing = byName.get(project.name);

      if (!existing) {
        byName.set(project.name, project);
        continue;
      }

      byName.set(project.name, {
        ...existing,
        ...project,
        root: project.root || existing.root,
        project_type:
          project.project_type !== "unknown"
            ? project.project_type
            : existing.project_type,
        targets: [
          ...new Set([...(existing.targets || []), ...(project.targets || [])]),
        ],
        source: `${existing.source}+${project.source}`,
      });
    }
  }

  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function projectHasTarget(project, target) {
  if (!project) return true;
  if (!Array.isArray(project.targets) || project.targets.length === 0)
    return true;
  return project.targets.includes(target);
}

function safeId(value) {
  return (
    normalizeString(value, "nx-target")
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "nx-target"
  );
}

function commandDisplay(command, commandArgs) {
  return [command, ...commandArgs]
    .map((part) => {
      const value = String(part);

      if (/^[A-Za-z0-9_./:=@,-]+$/.test(value)) return value;

      return JSON.stringify(value);
    })
    .join(" ");
}

function addCommonNxArgs(commandArgs, args) {
  const next = [...commandArgs];

  if (args.skip_nx_cache) {
    next.push("--skip-nx-cache");
  }

  if (!args.include_dependencies) {
    next.push("--excludeTaskDependencies");
  }

  next.push(...args.passthrough_args);

  return next;
}

function createBatchPlan(
  args,
  prefix,
  selectedProjectNames,
  projectMap,
  targets,
) {
  const commands = [];
  const skipped = [];

  for (const target of targets) {
    const eligibleProjects = selectedProjectNames.filter((projectName) => {
      return (
        !args.skip_missing_targets ||
        projectHasTarget(projectMap.get(projectName), target)
      );
    });

    const missingProjects = selectedProjectNames.filter(
      (projectName) => !eligibleProjects.includes(projectName),
    );

    for (const projectName of missingProjects) {
      skipped.push({
        id: safeId(`${projectName}-${target}`),
        project: projectName,
        target,
        configuration: "",
        reason: `Project does not declare target "${target}".`,
      });
    }

    if (!eligibleProjects.length) continue;

    const configurations = args.configurations.length
      ? args.configurations
      : [""];

    for (const configuration of configurations) {
      const nxArgs = [
        "run-many",
        `--target=${target}`,
        `--projects=${eligibleProjects.join(",")}`,
        `--parallel=${args.parallel}`,
      ];

      if (configuration) {
        nxArgs.push(`--configuration=${configuration}`);
      }

      const finalArgs = addCommonNxArgs([...prefix.args, ...nxArgs], args);

      commands.push({
        id: safeId(`batch-${target}-${configuration || "default"}`),
        mode: "batch",
        project: null,
        projects: eligibleProjects,
        target,
        configuration,
        command: prefix.command,
        args: finalArgs,
        display: commandDisplay(prefix.command, finalArgs),
      });
    }
  }

  return {
    commands,
    skipped,
  };
}

function createPerProjectPlan(
  args,
  prefix,
  selectedProjectNames,
  projectMap,
  targets,
) {
  const commands = [];
  const skipped = [];

  for (const projectName of selectedProjectNames) {
    for (const target of targets) {
      const project = projectMap.get(projectName);

      if (args.skip_missing_targets && !projectHasTarget(project, target)) {
        skipped.push({
          id: safeId(`${projectName}-${target}`),
          project: projectName,
          target,
          configuration: "",
          reason: `Project does not declare target "${target}".`,
        });

        continue;
      }

      const configurations = args.configurations.length
        ? args.configurations
        : [""];

      for (const configuration of configurations) {
        const runTarget = configuration
          ? `${projectName}:${target}:${configuration}`
          : `${projectName}:${target}`;

        const nxArgs = ["run", runTarget];
        const finalArgs = addCommonNxArgs([...prefix.args, ...nxArgs], args);

        commands.push({
          id: safeId(`${projectName}-${target}-${configuration || "default"}`),
          mode: "per-project",
          project: projectName,
          projects: [projectName],
          target,
          configuration,
          command: prefix.command,
          args: finalArgs,
          display: commandDisplay(prefix.command, finalArgs),
        });
      }
    }
  }

  return {
    commands,
    skipped,
  };
}

function createAffectedDirectPlan(args, prefix, targets) {
  const commands = [];
  const skipped = [];

  for (const target of targets) {
    const configurations = args.configurations.length
      ? args.configurations
      : [""];

    for (const configuration of configurations) {
      const nxArgs = [
        "affected",
        `--target=${target}`,
        `--parallel=${args.parallel}`,
      ];

      if (args.base) nxArgs.push(`--base=${args.base}`);
      if (args.head) nxArgs.push(`--head=${args.head}`);
      if (configuration) nxArgs.push(`--configuration=${configuration}`);

      const finalArgs = addCommonNxArgs([...prefix.args, ...nxArgs], args);

      commands.push({
        id: safeId(`affected-${target}-${configuration || "default"}`),
        mode: "affected-direct",
        project: null,
        projects: [],
        target,
        configuration,
        command: prefix.command,
        args: finalArgs,
        display: commandDisplay(prefix.command, finalArgs),
      });
    }
  }

  return {
    commands,
    skipped,
  };
}

function createRunPlan(args, repoRoot, affectedInput) {
  const prefix = createNxPrefix(args, repoRoot);
  const allNxProjects =
    args.mode === "all" ? discoverAllNxProjects(repoRoot, args) : [];
  const inputProjects = projectMetadataFromAffectedInput(affectedInput);
  const allProjects = mergeProjectMetadata(inputProjects, allNxProjects);
  const projectMap = new Map(
    allProjects.map((project) => [project.name, project]),
  );
  const targets = resolveTargets(args, affectedInput);
  const selectedProjectNames = resolveProjectSelection(
    args,
    affectedInput,
    allProjects,
  );

  if (args.mode === "affected-direct") {
    const plan = createAffectedDirectPlan(args, prefix, targets);

    return {
      package_manager: prefix.package_manager,
      selected_projects: [],
      project_metadata: allProjects,
      targets,
      ...plan,
    };
  }

  const plan =
    args.strategy === "per-project"
      ? createPerProjectPlan(
          args,
          prefix,
          selectedProjectNames,
          projectMap,
          targets,
        )
      : createBatchPlan(
          args,
          prefix,
          selectedProjectNames,
          projectMap,
          targets,
        );

  return {
    package_manager: prefix.package_manager,
    selected_projects: selectedProjectNames,
    project_metadata: allProjects.filter((project) =>
      selectedProjectNames.includes(project.name),
    ),
    targets,
    ...plan,
  };
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function writeLogFile(logDir, name, content, repoRoot, args) {
  if (!args.write_logs) return null;

  const logPath = resolvePath(path.join(logDir, name), repoRoot);
  writeTextFile(logPath, redactOutput(content), {
    dry_run: args.dry_run,
  });

  return toRelativePath(logPath, repoRoot);
}

function executeCommand(commandRecord, args, repoRoot) {
  const startedAt = new Date();
  const timeout =
    args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined;

  if (args.dry_run) {
    return {
      ...commandRecord,
      status: "skipped",
      success: true,
      skipped: true,
      dry_run: true,
      exit_code: null,
      signal: null,
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
      stdout_log: null,
      stderr_log: null,
      stdout_preview: "",
      stderr_preview: "",
    };
  }

  logger.info(`Running ${commandRecord.display}`);

  const result = childProcess.spawnSync(
    commandRecord.command,
    commandRecord.args,
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: process.env.CI || "true",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout,
    },
  );

  const endedAt = new Date();
  const stdout = redactOutput(result.stdout || "");
  const stderr = redactOutput(result.stderr || "");
  const exitCode = result.status;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = exitCode === 0 && !timedOut;

  const logBase = `${commandRecord.id}`;
  const stdoutLog = writeLogFile(
    args.log_dir,
    `${logBase}.stdout.log`,
    stdout,
    repoRoot,
    args,
  );
  const stderrLog = writeLogFile(
    args.log_dir,
    `${logBase}.stderr.log`,
    stderr,
    repoRoot,
    args,
  );

  return {
    ...commandRecord,
    status: success ? "passed" : "failed",
    success,
    skipped: false,
    dry_run: false,
    exit_code: exitCode,
    signal: result.signal || null,
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? logger.formatError(result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    stdout_log: stdoutLog,
    stderr_log: stderrLog,
    stdout_preview: stdout.slice(0, 4000),
    stderr_preview: stderr.slice(0, 4000),
  };
}

function executePlan(plan, args, repoRoot) {
  const results = [];
  let stoppedEarly = false;

  for (const commandRecord of plan.commands) {
    const result = executeCommand(commandRecord, args, repoRoot);
    results.push(result);

    if (!result.success && !args.continue_on_error) {
      stoppedEarly = true;
      logger.warn(
        "Stopping after first failed Nx command because continue-on-error is disabled.",
      );
      break;
    }
  }

  const skippedAfterStop = stoppedEarly
    ? plan.commands.slice(results.length).map((commandRecord) => ({
        ...commandRecord,
        status: "skipped",
        success: true,
        skipped: true,
        dry_run: args.dry_run,
        exit_code: null,
        signal: null,
        error: "Skipped because a previous command failed.",
        started_at: null,
        ended_at: null,
        duration_ms: 0,
        stdout_log: null,
        stderr_log: null,
        stdout_preview: "",
        stderr_preview: "",
      }))
    : [];

  return {
    results: [...results, ...skippedAfterStop],
    stopped_early: stoppedEarly,
  };
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

function summarizeResults(results, skippedTargets) {
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped =
    results.filter((result) => result.status === "skipped").length +
    skippedTargets.length;
  const durationMs = results.reduce(
    (sum, result) => sum + Number(result.duration_ms || 0),
    0,
  );

  return {
    total_commands: results.length,
    passed,
    failed,
    skipped,
    skipped_missing_targets: skippedTargets.length,
    duration_ms: durationMs,
    duration_human: formatDuration(durationMs),
    ok: failed === 0,
  };
}

function groupResultsByTarget(results) {
  const groups = {};

  for (const result of results) {
    const target = result.target || "unknown";

    if (!groups[target]) {
      groups[target] = {
        target,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
      };
    }

    groups[target].total += 1;
    groups[target].duration_ms += Number(result.duration_ms || 0);

    if (result.status === "passed") groups[target].passed += 1;
    if (result.status === "failed") groups[target].failed += 1;
    if (result.status === "skipped") groups[target].skipped += 1;
  }

  for (const group of Object.values(groups)) {
    group.duration_human = formatDuration(group.duration_ms);
  }

  return Object.fromEntries(
    Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createReport(args, repoRoot, affectedInput, plan, execution) {
  const git = getGitMetadata(repoRoot);
  const totals = summarizeResults(execution.results, plan.skipped);
  const status =
    totals.failed > 0
      ? "failed"
      : totals.total_commands > 0
        ? "passed"
        : "empty";

  return {
    schema_version: 1,
    type: "nx-target-results",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: git,
    input: {
      file: affectedInput.file,
      available: affectedInput.available,
      type: affectedInput.data?.type || null,
      created_at: affectedInput.data?.created_at || null,
    },
    config: {
      input_file: toRelativePath(
        resolvePath(args.input_file, repoRoot),
        repoRoot,
      ),
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
      log_dir: args.write_logs
        ? toRelativePath(resolvePath(args.log_dir, repoRoot), repoRoot)
        : null,
      mode: args.mode,
      strategy: args.strategy,
      package_manager: plan.package_manager,
      targets: plan.targets,
      configurations: args.configurations,
      projects: args.projects,
      exclude_projects: args.exclude_projects,
      selected_projects: plan.selected_projects,
      base: args.base || null,
      head: args.head || null,
      parallel: args.parallel,
      skip_nx_cache: args.skip_nx_cache,
      skip_missing_targets: args.skip_missing_targets,
      include_dependencies: args.include_dependencies,
      continue_on_error: args.continue_on_error,
      fail_on_error: args.fail_on_error,
      dry_run: args.dry_run,
    },
    totals: {
      selected_projects: plan.selected_projects.length,
      project_metadata: plan.project_metadata.length,
      targets: plan.targets.length,
      planned_commands: plan.commands.length,
      skipped_missing_targets: plan.skipped.length,
      ...totals,
    },
    project_metadata: plan.project_metadata,
    planned_commands: plan.commands.map((command) => ({
      id: command.id,
      mode: command.mode,
      project: command.project,
      projects: command.projects,
      target: command.target,
      configuration: command.configuration,
      display: command.display,
    })),
    skipped_targets: plan.skipped,
    results: execution.results,
    result_groups: groupResultsByTarget(execution.results),
    failures: execution.results.filter((result) => result.status === "failed"),
    stopped_early: execution.stopped_early,
    status,
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
  const lines = [
    `# ⚙️ ${PROJECT_NAME} Nx Target Results`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## 🧾 Context",
    "",
    `- Repository: \`${report.repository}\``,
    `- Branch: \`${report.github.branch || "unknown"}\``,
    `- Commit: \`${report.github.short_sha || report.github.sha || "unknown"}\``,
    `- Mode: \`${report.config.mode}\``,
    `- Strategy: \`${report.config.strategy}\``,
    `- Package manager: \`${report.config.package_manager}\``,
    `- Dry run: \`${report.config.dry_run ? "true" : "false"}\``,
    `- Status: \`${report.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- Selected projects: \`${report.totals.selected_projects}\``,
    `- Targets: \`${report.totals.targets}\``,
    `- Planned commands: \`${report.totals.planned_commands}\``,
    `- Passed: \`${report.totals.passed}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Skipped: \`${report.totals.skipped}\``,
    `- Missing-target skips: \`${report.totals.skipped_missing_targets}\``,
    `- Duration: \`${report.totals.duration_human}\``,
    "",
  ];

  if (Object.keys(report.result_groups).length) {
    lines.push("## 🎯 Results by Target");
    lines.push("");
    lines.push("| Target | Total | Passed | Failed | Skipped | Duration |");
    lines.push("|---|---:|---:|---:|---:|---:|");

    for (const group of Object.values(report.result_groups)) {
      lines.push(
        `| \`${group.target}\` | \`${group.total}\` | \`${group.passed}\` | \`${group.failed}\` | \`${group.skipped}\` | \`${group.duration_human}\` |`,
      );
    }

    lines.push("");
  }

  lines.push("## 🚀 Commands");
  lines.push("");

  if (!report.results.length) {
    lines.push("No Nx commands were executed.");
  } else {
    lines.push(
      "| Status | Target | Project(s) | Configuration | Duration | Command |",
    );
    lines.push("|---|---|---|---|---:|---|");

    for (const result of report.results.slice(0, 200)) {
      const projects =
        result.project || (result.projects || []).join(", ") || "affected";
      lines.push(
        `| \`${result.status}\` | \`${result.target || ""}\` | \`${escapeMarkdown(projects)}\` | \`${result.configuration || "default"}\` | \`${formatDuration(result.duration_ms)}\` | \`${escapeMarkdown(result.display)}\` |`,
      );
    }

    if (report.results.length > 200) {
      lines.push(
        `| ... | ... | ... | ... | ... | ${report.results.length - 200} additional command(s) omitted. |`,
      );
    }
  }

  if (report.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Target | Project(s) | Exit | Error | Stderr Log |");
    lines.push("|---|---|---:|---|---|");

    for (const failure of report.failures.slice(0, 50)) {
      const projects =
        failure.project || (failure.projects || []).join(", ") || "affected";
      const error =
        failure.error ||
        failure.stderr_preview.split(/\r?\n/).slice(0, 2).join(" ");
      lines.push(
        `| \`${failure.target || ""}\` | \`${escapeMarkdown(projects)}\` | \`${failure.exit_code ?? "unknown"}\` | ${escapeMarkdown(error || "Nx command failed.")} | \`${failure.stderr_log || "not written"}\` |`,
      );
    }
  }

  if (report.skipped_targets.length) {
    lines.push("");
    lines.push("## ⚠️ Skipped Missing Targets");
    lines.push("");
    lines.push("| Project | Target | Reason |");
    lines.push("|---|---|---|");

    for (const skipped of report.skipped_targets.slice(0, 100)) {
      lines.push(
        `| \`${skipped.project}\` | \`${skipped.target}\` | ${skipped.reason} |`,
      );
    }

    if (report.skipped_targets.length > 100) {
      lines.push(
        `| ... | ... | ${report.skipped_targets.length - 100} additional skip(s) omitted. |`,
      );
    }
  }

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

  fs.appendFileSync(outputFile, `${name}<<EOF\n${rendered}\nEOF\n`);
  return true;
}

function writeGitHubOutputs(report) {
  setGitHubOutput("nx_target_results_file", report.config.output_file);
  setGitHubOutput(
    "nx_target_results_summary_file",
    report.config.summary_file || "",
  );
  setGitHubOutput("nx_target_results_log_dir", report.config.log_dir || "");
  setGitHubOutput("nx_target_results_status", report.status);
  setGitHubOutput(
    "nx_target_results_ok",
    report.status === "passed" ? "true" : "false",
  );
  setGitHubOutput(
    "nx_target_results_selected_projects",
    String(report.totals.selected_projects),
  );
  setGitHubOutput("nx_target_results_targets", String(report.totals.targets));
  setGitHubOutput(
    "nx_target_results_planned_commands",
    String(report.totals.planned_commands),
  );
  setGitHubOutput("nx_target_results_passed", String(report.totals.passed));
  setGitHubOutput("nx_target_results_failed", String(report.totals.failed));
  setGitHubOutput("nx_target_results_skipped", String(report.totals.skipped));
  setGitHubOutput(
    "nx_target_results_duration_ms",
    String(report.totals.duration_ms),
  );
  setGitHubOutput(
    "nx_target_results_project_names",
    report.config.selected_projects.join(","),
  );
  setGitHubOutput(
    "nx_target_results_project_names_json",
    JSON.stringify(report.config.selected_projects),
  );
  setGitHubOutput(
    "nx_target_results_targets_json",
    JSON.stringify(report.config.targets),
  );
  setGitHubOutput(
    "nx_target_results_failures_json",
    JSON.stringify(report.failures),
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Preparing Nx target run plan.");

  const affectedInput = loadAffectedInput(args, repoRoot);
  const plan = createRunPlan(args, repoRoot, affectedInput);

  if (
    args.fail_if_no_projects &&
    args.mode !== "affected-direct" &&
    plan.selected_projects.length === 0
  ) {
    logger.error("No projects were resolved for Nx target execution.");
    process.exitCode = 1;
  }

  if (args.fail_if_empty && plan.commands.length === 0) {
    logger.error("No Nx commands were planned.");
    process.exitCode = 1;
  }

  const execution =
    process.exitCode === 1
      ? {
          results: [],
          stopped_early: false,
        }
      : executePlan(plan, args, repoRoot);

  const report = createReport(args, repoRoot, affectedInput, plan, execution);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = createMarkdownSummary(report);

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

  if (args.fail_on_error && report.totals.failed > 0) {
    logger.error(
      `Nx target execution failed with ${report.totals.failed} failed command(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_if_empty && report.totals.planned_commands === 0) {
    process.exitCode = 1;
    return;
  }

  if (
    args.fail_if_no_projects &&
    args.mode !== "affected-direct" &&
    report.totals.selected_projects === 0
  ) {
    process.exitCode = 1;
  }
}

main();
