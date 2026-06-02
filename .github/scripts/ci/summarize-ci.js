#!/usr/bin/env node
// .github/scripts/ci/summarize-ci.js
// =============================================================================
// Aerealith AI — CI Summary Reporter
// -----------------------------------------------------------------------------
// Purpose:
//   Summarize CI discovery, affected project detection, test framework detection,
//   Nx target execution, Docker target detection, Cloudflare target detection,
//   publishable package detection, and collected build artifacts into one
//   consolidated CI report.
//
// Input:
//   - artifacts/ci/affected-projects.json
//   - artifacts/ci/cloudflare-targets.json
//   - artifacts/ci/dockerfiles.json
//   - artifacts/ci/publishable-packages.json
//   - artifacts/ci/test-frameworks.json
//   - artifacts/ci/nx-target-results.json
//   - artifacts/ci/build-artifacts.json
//
// Output:
//   - artifacts/ci/ci-summary.json
//   - artifacts/ci/ci-summary.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not mutate GitHub.
//   - Does not run CI tasks.
//   - Designed to run after CI detector/runner scripts.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[ci-summary] ${message}`),
    warn: (message) => console.warn(`[ci-summary] WARN: ${message}`),
    error: (message) => console.error(`[ci-summary] ERROR: ${message}`),
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

const DEFAULT_OUTPUT_FILE = "artifacts/ci/ci-summary.json";
const DEFAULT_SUMMARY_FILE = "artifacts/ci/ci-summary.md";

const DEFAULT_AFFECTED_PROJECTS_FILE = "artifacts/ci/affected-projects.json";
const DEFAULT_CLOUDFLARE_TARGETS_FILE = "artifacts/ci/cloudflare-targets.json";
const DEFAULT_DOCKERFILES_FILE = "artifacts/ci/dockerfiles.json";
const DEFAULT_PUBLISHABLE_PACKAGES_FILE =
  "artifacts/ci/publishable-packages.json";
const DEFAULT_TEST_FRAMEWORKS_FILE = "artifacts/ci/test-frameworks.json";
const DEFAULT_NX_TARGET_RESULTS_FILE = "artifacts/ci/nx-target-results.json";
const DEFAULT_BUILD_ARTIFACTS_FILE = "artifacts/ci/build-artifacts.json";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

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

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);

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

    affected_projects_file:
      process.env.CI_SUMMARY_AFFECTED_PROJECTS_FILE ||
      DEFAULT_AFFECTED_PROJECTS_FILE,
    cloudflare_targets_file:
      process.env.CI_SUMMARY_CLOUDFLARE_TARGETS_FILE ||
      DEFAULT_CLOUDFLARE_TARGETS_FILE,
    dockerfiles_file:
      process.env.CI_SUMMARY_DOCKERFILES_FILE || DEFAULT_DOCKERFILES_FILE,
    publishable_packages_file:
      process.env.CI_SUMMARY_PUBLISHABLE_PACKAGES_FILE ||
      DEFAULT_PUBLISHABLE_PACKAGES_FILE,
    test_frameworks_file:
      process.env.CI_SUMMARY_TEST_FRAMEWORKS_FILE ||
      DEFAULT_TEST_FRAMEWORKS_FILE,
    nx_target_results_file:
      process.env.CI_SUMMARY_NX_TARGET_RESULTS_FILE ||
      DEFAULT_NX_TARGET_RESULTS_FILE,
    build_artifacts_file:
      process.env.CI_SUMMARY_BUILD_ARTIFACTS_FILE ||
      DEFAULT_BUILD_ARTIFACTS_FILE,

    input_files: normalizeStringList(process.env.CI_SUMMARY_INPUT_FILES),

    output_file: process.env.CI_SUMMARY_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.CI_SUMMARY_MARKDOWN_FILE || DEFAULT_SUMMARY_FILE,

    require_affected_projects: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_AFFECTED_PROJECTS,
      false,
    ),
    require_cloudflare_targets: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_CLOUDFLARE_TARGETS,
      false,
    ),
    require_dockerfiles: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_DOCKERFILES,
      false,
    ),
    require_publishable_packages: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_PUBLISHABLE_PACKAGES,
      false,
    ),
    require_test_frameworks: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_TEST_FRAMEWORKS,
      false,
    ),
    require_nx_target_results: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_NX_TARGET_RESULTS,
      false,
    ),
    require_build_artifacts: normalizeBoolean(
      process.env.CI_SUMMARY_REQUIRE_BUILD_ARTIFACTS,
      false,
    ),

    warn_large_artifacts_mb: normalizeNumber(
      process.env.CI_SUMMARY_WARN_LARGE_ARTIFACTS_MB,
      250,
    ),
    warn_changed_files: normalizeInteger(
      process.env.CI_SUMMARY_WARN_CHANGED_FILES,
      250,
    ),
    warn_matrix_entries: normalizeInteger(
      process.env.CI_SUMMARY_WARN_MATRIX_ENTRIES,
      50,
    ),

    fail_on_warning: normalizeBoolean(
      process.env.CI_SUMMARY_FAIL_ON_WARNING,
      false,
    ),
    fail_on_error: normalizeBoolean(process.env.CI_SUMMARY_FAIL_ON_ERROR, true),
    fail_if_empty: normalizeBoolean(
      process.env.CI_SUMMARY_FAIL_IF_EMPTY,
      false,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    write_summary_file: normalizeBoolean(
      process.env.CI_SUMMARY_WRITE_MARKDOWN,
      true,
    ),
    print: normalizeBoolean(process.env.CI_SUMMARY_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.CI_SUMMARY_STEP_SUMMARY,
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

    if (arg === "--affected" || arg === "--affected-projects") {
      args.affected_projects_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cloudflare" || arg === "--cloudflare-targets") {
      args.cloudflare_targets_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--docker" || arg === "--dockerfiles") {
      args.dockerfiles_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--packages" || arg === "--publishable-packages") {
      args.publishable_packages_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tests" || arg === "--test-frameworks") {
      args.test_frameworks_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--nx" || arg === "--nx-target-results") {
      args.nx_target_results_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--artifacts" || arg === "--build-artifacts") {
      args.build_artifacts_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input" || arg === "-i") {
      args.input_files.push(argv[index + 1]);
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

    if (arg === "--require-affected") {
      args.require_affected_projects = true;
      continue;
    }

    if (arg === "--require-cloudflare") {
      args.require_cloudflare_targets = true;
      continue;
    }

    if (arg === "--require-docker") {
      args.require_dockerfiles = true;
      continue;
    }

    if (arg === "--require-packages") {
      args.require_publishable_packages = true;
      continue;
    }

    if (arg === "--require-tests") {
      args.require_test_frameworks = true;
      continue;
    }

    if (arg === "--require-nx") {
      args.require_nx_target_results = true;
      continue;
    }

    if (arg === "--require-artifacts") {
      args.require_build_artifacts = true;
      continue;
    }

    if (arg === "--warn-large-artifacts-mb") {
      args.warn_large_artifacts_mb = normalizeNumber(
        argv[index + 1],
        args.warn_large_artifacts_mb,
      );
      index += 1;
      continue;
    }

    if (arg === "--warn-changed-files") {
      args.warn_changed_files = normalizeInteger(
        argv[index + 1],
        args.warn_changed_files,
      );
      index += 1;
      continue;
    }

    if (arg === "--warn-matrix-entries") {
      args.warn_matrix_entries = normalizeInteger(
        argv[index + 1],
        args.warn_matrix_entries,
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

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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

  args.input_files = [...new Set(args.input_files.filter(Boolean))];

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI CI Summary Reporter

Usage:
  node .github/scripts/ci/summarize-ci.js [options]

Options:
      --repo <owner/repo>                  Repository slug.
      --affected <file>                    affected-projects.json input file.
      --cloudflare <file>                  cloudflare-targets.json input file.
      --docker <file>                      dockerfiles.json input file.
      --packages <file>                    publishable-packages.json input file.
      --tests <file>                       test-frameworks.json input file.
      --nx <file>                          nx-target-results.json input file.
      --artifacts <file>                   build-artifacts.json input file.
  -i, --input <file>                       Extra CI artifact JSON input file.
  -o, --output <file>                      ci-summary.json output file.
      --summary <file>                     ci-summary.md output file.
      --no-summary                         Do not write Markdown summary.
      --require-affected                   Error when affected-projects input is missing.
      --require-cloudflare                 Error when cloudflare-targets input is missing.
      --require-docker                     Error when dockerfiles input is missing.
      --require-packages                   Error when publishable-packages input is missing.
      --require-tests                      Error when test-frameworks input is missing.
      --require-nx                         Error when nx-target-results input is missing.
      --require-artifacts                  Error when build-artifacts input is missing.
      --warn-large-artifacts-mb <mb>       Warn when collected artifact size exceeds this.
      --warn-changed-files <number>        Warn when changed file count exceeds this.
      --warn-matrix-entries <number>       Warn when any matrix exceeds this.
      --fail-on-warning                    Exit non-zero when warnings exist.
      --fail-on-error                      Exit non-zero when errors exist. Default.
      --fail-if-empty                      Exit non-zero when no input artifacts are available.
      --dry-run                            Do not write files.
      --no-print                           Do not print JSON result.
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonInput(filePath, repoRoot, options = {}) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (!isFile(absolutePath)) {
    return {
      file: relativePath,
      available: false,
      required: Boolean(options.required),
      key: options.key || "unknown",
      type: options.type || "unknown",
      data: null,
      error: options.required ? "Required input file is missing." : "",
    };
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const data = safeJsonParse(raw, null);

  if (!data) {
    return {
      file: relativePath,
      available: true,
      required: Boolean(options.required),
      key: options.key || "unknown",
      type: options.type || "unknown",
      data: null,
      error: "Input file is not valid JSON.",
    };
  }

  return {
    file: relativePath,
    available: true,
    required: Boolean(options.required),
    key: options.key || data.type || "unknown",
    type: data.type || options.type || "unknown",
    data,
    error: "",
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function mbToBytes(value) {
  return Number(value || 0) * 1024 * 1024;
}

function truncate(value, maxLength = 96) {
  const source = String(value || "");

  if (source.length <= maxLength) return source;

  return `${source.slice(0, maxLength - 1)}…`;
}

function unique(values) {
  return [
    ...new Set(
      values.filter(
        (value) => value !== undefined && value !== null && value !== "",
      ),
    ),
  ];
}

function createNotice(level, source, message, details = {}) {
  return {
    level,
    source,
    message,
    details,
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function summarizeAffectedProjects(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      changed_files: 0,
      affected_projects: 0,
      affected_project_names: [],
      global_changes: 0,
      detection_source: "none",
      warnings: [],
      errors: [],
    };
  }

  const changedFiles = Number(
    data.totals?.changed_files || arrayValue(data.changed_files).length || 0,
  );
  const affectedProjects = Number(
    data.totals?.affected_projects ||
      arrayValue(data.affected_project_names).length ||
      0,
  );
  const globalChanges = Number(
    data.totals?.global_changes ||
      arrayValue(data.detection?.global_changes).length ||
      0,
  );
  const warnings = [];

  if (args.warn_changed_files > 0 && changedFiles >= args.warn_changed_files) {
    warnings.push(
      createNotice(
        "warning",
        "affected-projects",
        "Changed file count exceeds configured warning threshold.",
        {
          changed_files: changedFiles,
          threshold: args.warn_changed_files,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    changed_files: changedFiles,
    affected_projects: affectedProjects,
    affected_project_names: arrayValue(data.affected_project_names),
    affected_apps: arrayValue(data.affected_apps),
    affected_libs: arrayValue(data.affected_libs),
    affected_packages: arrayValue(data.affected_packages),
    affected_tools: arrayValue(data.affected_tools),
    affected_e2e: arrayValue(data.affected_e2e),
    discovered_projects: Number(
      data.totals?.discovered_projects || arrayValue(data.projects).length || 0,
    ),
    target_matrix_entries: Number(
      data.totals?.target_matrix_entries ||
        arrayValue(data.target_matrix).length ||
        0,
    ),
    global_changes: globalChanges,
    detection_source: data.detection?.source || "unknown",
    nx_used: Boolean(data.detection?.nx_used),
    warnings,
    errors: [],
  };
}

function summarizeCloudflareTargets(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      targets: 0,
      affected_targets: 0,
      deployment_matrix_entries: 0,
      warnings: [],
      errors: [],
    };
  }

  const matrixEntries = Number(
    data.totals?.deployment_matrix_entries ||
      arrayValue(data.deployment_matrix).length ||
      0,
  );
  const invalidConfigs = Number(
    data.totals?.invalid_configs ||
      arrayValue(data.invalid_configs).length ||
      0,
  );
  const warnings = [];

  if (invalidConfigs > 0) {
    warnings.push(
      createNotice(
        "warning",
        "cloudflare-targets",
        "One or more Cloudflare Wrangler configs could not be parsed.",
        {
          invalid_configs: invalidConfigs,
        },
      ),
    );
  }

  if (
    args.warn_matrix_entries > 0 &&
    matrixEntries >= args.warn_matrix_entries
  ) {
    warnings.push(
      createNotice(
        "warning",
        "cloudflare-targets",
        "Cloudflare deployment matrix is large.",
        {
          deployment_matrix_entries: matrixEntries,
          threshold: args.warn_matrix_entries,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    targets: Number(
      data.totals?.targets || arrayValue(data.targets).length || 0,
    ),
    affected_targets: Number(
      data.totals?.affected_targets ||
        arrayValue(data.affected_targets).length ||
        0,
    ),
    deployment_matrix_entries: matrixEntries,
    target_names: arrayValue(data.target_names),
    affected_target_names: arrayValue(data.affected_target_names),
    workers: Number(data.totals?.workers || 0),
    pages: Number(data.totals?.pages || 0),
    unknown: Number(data.totals?.unknown || 0),
    invalid_configs: invalidConfigs,
    changed_files: Number(data.totals?.changed_files || 0),
    global_changes: Number(data.totals?.global_changes || 0),
    resources: {
      d1_databases: Number(data.totals?.d1_databases || 0),
      kv_namespaces: Number(data.totals?.kv_namespaces || 0),
      r2_buckets: Number(data.totals?.r2_buckets || 0),
      queue_producers: Number(data.totals?.queue_producers || 0),
      queue_consumers: Number(data.totals?.queue_consumers || 0),
      durable_objects: Number(data.totals?.durable_objects || 0),
    },
    warnings,
    errors: [],
  };
}

function summarizeDockerfiles(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      targets: 0,
      affected_targets: 0,
      build_matrix_entries: 0,
      warnings: [],
      errors: [],
    };
  }

  const matrixEntries = Number(
    data.totals?.build_matrix_entries ||
      arrayValue(data.build_matrix).length ||
      0,
  );
  const invalidComposeFiles = Number(
    data.totals?.invalid_compose_files ||
      arrayValue(data.invalid_compose_files).length ||
      0,
  );
  const warnings = [];

  if (invalidComposeFiles > 0) {
    warnings.push(
      createNotice(
        "warning",
        "dockerfiles",
        "One or more Docker Compose files could not be parsed.",
        {
          invalid_compose_files: invalidComposeFiles,
        },
      ),
    );
  }

  if (
    args.warn_matrix_entries > 0 &&
    matrixEntries >= args.warn_matrix_entries
  ) {
    warnings.push(
      createNotice("warning", "dockerfiles", "Docker build matrix is large.", {
        build_matrix_entries: matrixEntries,
        threshold: args.warn_matrix_entries,
      }),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    dockerfiles: Number(
      data.totals?.dockerfiles || arrayValue(data.dockerfiles).length || 0,
    ),
    compose_files: Number(
      data.totals?.compose_files || arrayValue(data.compose_files).length || 0,
    ),
    compose_services: Number(
      data.totals?.compose_services ||
        arrayValue(data.compose_services).length ||
        0,
    ),
    invalid_compose_files: invalidComposeFiles,
    targets: Number(
      data.totals?.targets || arrayValue(data.targets).length || 0,
    ),
    affected_targets: Number(
      data.totals?.affected_targets ||
        arrayValue(data.affected_targets).length ||
        0,
    ),
    build_matrix_entries: matrixEntries,
    target_names: arrayValue(data.target_names),
    affected_target_names: arrayValue(data.affected_target_names),
    changed_files: Number(data.totals?.changed_files || 0),
    global_changes: Number(data.totals?.global_changes || 0),
    multi_stage: Number(data.totals?.multi_stage || 0),
    with_healthcheck: Number(data.totals?.with_healthcheck || 0),
    with_compose_services: Number(data.totals?.with_compose_services || 0),
    warnings,
    errors: [],
  };
}

function summarizePublishablePackages(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      packages: 0,
      publishable_packages: 0,
      publish_matrix_entries: 0,
      warnings: [],
      errors: [],
    };
  }

  const matrixEntries = Number(
    data.totals?.publish_matrix_entries ||
      arrayValue(data.publish_matrix).length ||
      0,
  );
  const invalidOrBlockedPackages = Number(
    data.totals?.invalid_or_blocked_packages ||
      arrayValue(data.invalid_or_blocked_packages).length ||
      0,
  );
  const warnings = [];

  if (invalidOrBlockedPackages > 0) {
    warnings.push(
      createNotice(
        "warning",
        "publishable-packages",
        "One or more packages are invalid, private, or blocked from publishing.",
        {
          invalid_or_blocked_packages: invalidOrBlockedPackages,
        },
      ),
    );
  }

  if (
    args.warn_matrix_entries > 0 &&
    matrixEntries >= args.warn_matrix_entries
  ) {
    warnings.push(
      createNotice(
        "warning",
        "publishable-packages",
        "Publish matrix is large.",
        {
          publish_matrix_entries: matrixEntries,
          threshold: args.warn_matrix_entries,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    package_json_files: Number(
      data.totals?.package_json_files ||
        arrayValue(data.package_json_files).length ||
        0,
    ),
    packages: Number(
      data.totals?.packages || arrayValue(data.packages).length || 0,
    ),
    publishable_packages: Number(
      data.totals?.publishable_packages ||
        arrayValue(data.publishable_packages).length ||
        0,
    ),
    private_packages: Number(data.totals?.private_packages || 0),
    affected_packages: Number(
      data.totals?.affected_packages ||
        arrayValue(data.affected_packages).length ||
        0,
    ),
    affected_publishable_packages: Number(
      data.totals?.affected_publishable_packages ||
        arrayValue(data.affected_publishable_packages).length ||
        0,
    ),
    invalid_or_blocked_packages: invalidOrBlockedPackages,
    publish_matrix_entries: matrixEntries,
    package_names: arrayValue(data.package_names),
    publishable_package_names: arrayValue(data.publishable_package_names),
    affected_publishable_package_names: arrayValue(
      data.affected_publishable_package_names,
    ),
    changed_files: Number(data.totals?.changed_files || 0),
    global_changes: Number(data.totals?.global_changes || 0),
    scoped_packages: Number(data.totals?.scoped_packages || 0),
    prerelease_packages: Number(data.totals?.prerelease_packages || 0),
    warnings,
    errors: [],
  };
}

function summarizeTestFrameworks(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      targets_with_tests: 0,
      test_matrix_entries: 0,
      warnings: [],
      errors: [],
    };
  }

  const matrixEntries = Number(
    data.totals?.test_matrix_entries ||
      arrayValue(data.test_matrix).length ||
      0,
  );
  const warnings = [];

  if (
    args.warn_matrix_entries > 0 &&
    matrixEntries >= args.warn_matrix_entries
  ) {
    warnings.push(
      createNotice("warning", "test-frameworks", "Test matrix is large.", {
        test_matrix_entries: matrixEntries,
        threshold: args.warn_matrix_entries,
      }),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    package_json_files: Number(
      data.totals?.package_json_files ||
        arrayValue(data.package_json_files).length ||
        0,
    ),
    test_config_files: Number(
      data.totals?.test_config_files ||
        arrayValue(data.test_config_files).length ||
        0,
    ),
    targets: Number(
      data.totals?.targets || arrayValue(data.targets).length || 0,
    ),
    targets_with_tests: Number(
      data.totals?.targets_with_tests ||
        arrayValue(data.targets_with_tests).length ||
        0,
    ),
    affected_targets: Number(
      data.totals?.affected_targets ||
        arrayValue(data.affected_targets).length ||
        0,
    ),
    affected_targets_with_tests: Number(
      data.totals?.affected_targets_with_tests ||
        arrayValue(data.affected_targets_with_tests).length ||
        0,
    ),
    frameworks: Number(
      data.totals?.frameworks || arrayValue(data.framework_ids).length || 0,
    ),
    framework_ids: arrayValue(data.framework_ids),
    test_matrix_entries: matrixEntries,
    target_names_with_tests: arrayValue(data.target_names_with_tests),
    affected_target_names_with_tests: arrayValue(
      data.affected_target_names_with_tests,
    ),
    changed_files: Number(data.totals?.changed_files || 0),
    global_changes: Number(data.totals?.global_changes || 0),
    test_scripts: Number(data.totals?.test_scripts || 0),
    project_test_targets: Number(data.totals?.project_test_targets || 0),
    warnings,
    errors: [],
  };
}

function summarizeNxTargetResults(data) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      planned_commands: 0,
      failed: 0,
      warnings: [],
      errors: [],
    };
  }

  const failed = Number(
    data.totals?.failed || arrayValue(data.failures).length || 0,
  );
  const errors = [];

  if (failed > 0) {
    errors.push(
      createNotice(
        "error",
        "nx-target-results",
        "One or more Nx target commands failed.",
        {
          failed,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    ok: data.status === "passed" || data.totals?.ok === true,
    selected_projects: Number(data.totals?.selected_projects || 0),
    targets: Number(data.totals?.targets || 0),
    planned_commands: Number(
      data.totals?.planned_commands ||
        arrayValue(data.planned_commands).length ||
        0,
    ),
    total_commands: Number(
      data.totals?.total_commands || arrayValue(data.results).length || 0,
    ),
    passed: Number(data.totals?.passed || 0),
    failed,
    skipped: Number(data.totals?.skipped || 0),
    skipped_missing_targets: Number(
      data.totals?.skipped_missing_targets ||
        arrayValue(data.skipped_targets).length ||
        0,
    ),
    duration_ms: Number(data.totals?.duration_ms || 0),
    duration_human: data.totals?.duration_human || "0ms",
    stopped_early: Boolean(data.stopped_early),
    selected_project_names: arrayValue(data.config?.selected_projects),
    targets_run: arrayValue(data.config?.targets),
    failures: arrayValue(data.failures).map((failure) => ({
      id: failure.id,
      target: failure.target,
      project: failure.project,
      projects: failure.projects,
      configuration: failure.configuration,
      exit_code: failure.exit_code,
      error: failure.error,
      stderr_log: failure.stderr_log,
    })),
    warnings: [],
    errors,
  };
}

function summarizeBuildArtifacts(data, args) {
  if (!data) {
    return {
      available: false,
      status: "missing",
      collected: 0,
      warnings: [],
      errors: [],
    };
  }

  const sizeBytes = Number(data.totals?.size_bytes || 0);
  const secretSignalSkips = Number(data.totals?.skipped_secret_signals || 0);
  const warnings = [];
  const errors = [];

  if (
    args.warn_large_artifacts_mb > 0 &&
    sizeBytes >= mbToBytes(args.warn_large_artifacts_mb)
  ) {
    warnings.push(
      createNotice(
        "warning",
        "build-artifacts",
        "Collected build artifact size exceeds configured warning threshold.",
        {
          size_bytes: sizeBytes,
          size_human: data.totals?.size_human || formatBytes(sizeBytes),
          threshold_mb: args.warn_large_artifacts_mb,
        },
      ),
    );
  }

  if (secretSignalSkips > 0) {
    errors.push(
      createNotice(
        "error",
        "build-artifacts",
        "One or more build artifacts were skipped because secret-like content was detected.",
        {
          skipped_secret_signals: secretSignalSkips,
        },
      ),
    );
  }

  return {
    available: true,
    created_at: data.created_at || null,
    status: data.status || "unknown",
    discovered: Number(data.totals?.discovered || 0),
    collected: Number(
      data.totals?.collected || arrayValue(data.artifacts).length || 0,
    ),
    skipped: Number(
      data.totals?.skipped || arrayValue(data.skipped).length || 0,
    ),
    skipped_secret_signals: secretSignalSkips,
    size_bytes: sizeBytes,
    size_human: data.totals?.size_human || formatBytes(sizeBytes),
    categories: data.totals?.categories || {},
    copy_dir: data.config?.copy_dir || null,
    warnings,
    errors,
  };
}

function summarizeExtraInputs(inputs) {
  return inputs.map((input) => {
    const data = input.data || {};

    return {
      file: input.file,
      available: input.available,
      type: input.type || data.type || "unknown",
      created_at: data.created_at || null,
      status: data.status || null,
      totals: data.totals || null,
      error: input.error || "",
    };
  });
}

function collectInputErrors(inputs) {
  const errors = [];

  for (const input of inputs) {
    if (input.error && input.required) {
      errors.push(
        createNotice("error", input.key, input.error, {
          file: input.file,
        }),
      );
    } else if (input.error && input.available) {
      errors.push(
        createNotice("error", input.key, input.error, {
          file: input.file,
        }),
      );
    }
  }

  return errors;
}

function buildRecommendations(summary) {
  const recommendations = [];

  if (
    summary.affected_projects.available &&
    summary.affected_projects.affected_projects === 0
  ) {
    recommendations.push(
      "No affected projects were detected; review base/head resolution if CI should have selected work.",
    );
  }

  if (
    summary.test_frameworks.available &&
    summary.test_frameworks.targets_with_tests === 0
  ) {
    recommendations.push(
      "No test frameworks were detected; confirm package scripts and test config paths are discoverable.",
    );
  }

  if (
    summary.nx_target_results.available &&
    summary.nx_target_results.failed > 0
  ) {
    recommendations.push(
      "Review Nx failure logs and fix failing target commands before merge or release.",
    );
  }

  if (
    summary.build_artifacts.available &&
    summary.build_artifacts.skipped_secret_signals > 0
  ) {
    recommendations.push(
      "Inspect skipped artifacts and ensure generated outputs never contain secret-like values.",
    );
  }

  if (
    summary.cloudflare_targets.available &&
    summary.cloudflare_targets.invalid_configs > 0
  ) {
    recommendations.push(
      "Fix invalid Wrangler configuration files before deployment workflows depend on them.",
    );
  }

  if (
    summary.dockerfiles.available &&
    summary.dockerfiles.invalid_compose_files > 0
  ) {
    recommendations.push(
      "Fix invalid Docker Compose files so container build metadata stays reliable.",
    );
  }

  if (
    summary.publishable_packages.available &&
    summary.publishable_packages.invalid_or_blocked_packages > 0
  ) {
    recommendations.push(
      "Review blocked packages and decide whether each should be private, unpublished, or fixed for release.",
    );
  }

  if (
    summary.totals.errors === 0 &&
    summary.totals.warnings === 0 &&
    !recommendations.length
  ) {
    recommendations.push(
      "CI summary is clean; no immediate maintenance action is required.",
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "Review warnings and errors above before relying on this CI run as release evidence.",
    );
  }

  return recommendations;
}

function buildStatus(errors, warnings) {
  if (errors.length) return "failed";
  if (warnings.length) return "warning";
  return "passed";
}

function createSummary(args, repoRoot) {
  const git = getGitMetadata(repoRoot);

  const baseInputs = [
    readJsonInput(args.affected_projects_file, repoRoot, {
      key: "affected-projects",
      type: "affected-projects",
      required: args.require_affected_projects,
    }),
    readJsonInput(args.cloudflare_targets_file, repoRoot, {
      key: "cloudflare-targets",
      type: "cloudflare-targets",
      required: args.require_cloudflare_targets,
    }),
    readJsonInput(args.dockerfiles_file, repoRoot, {
      key: "dockerfiles",
      type: "dockerfiles",
      required: args.require_dockerfiles,
    }),
    readJsonInput(args.publishable_packages_file, repoRoot, {
      key: "publishable-packages",
      type: "publishable-packages",
      required: args.require_publishable_packages,
    }),
    readJsonInput(args.test_frameworks_file, repoRoot, {
      key: "test-frameworks",
      type: "test-frameworks",
      required: args.require_test_frameworks,
    }),
    readJsonInput(args.nx_target_results_file, repoRoot, {
      key: "nx-target-results",
      type: "nx-target-results",
      required: args.require_nx_target_results,
    }),
    readJsonInput(args.build_artifacts_file, repoRoot, {
      key: "build-artifacts",
      type: "ci-build-artifacts",
      required: args.require_build_artifacts,
    }),
  ];

  const extraInputs = args.input_files.map((filePath) =>
    readJsonInput(filePath, repoRoot, {
      key: "extra",
      type: "extra",
      required: false,
    }),
  );

  const affectedProjects = summarizeAffectedProjects(baseInputs[0].data, args);
  const cloudflareTargets = summarizeCloudflareTargets(
    baseInputs[1].data,
    args,
  );
  const dockerfiles = summarizeDockerfiles(baseInputs[2].data, args);
  const publishablePackages = summarizePublishablePackages(
    baseInputs[3].data,
    args,
  );
  const testFrameworks = summarizeTestFrameworks(baseInputs[4].data, args);
  const nxTargetResults = summarizeNxTargetResults(baseInputs[5].data, args);
  const buildArtifacts = summarizeBuildArtifacts(baseInputs[6].data, args);

  const inputErrors = collectInputErrors([...baseInputs, ...extraInputs]);

  const warnings = [
    ...affectedProjects.warnings,
    ...cloudflareTargets.warnings,
    ...dockerfiles.warnings,
    ...publishablePackages.warnings,
    ...testFrameworks.warnings,
    ...nxTargetResults.warnings,
    ...buildArtifacts.warnings,
  ];

  const errors = [
    ...inputErrors,
    ...affectedProjects.errors,
    ...cloudflareTargets.errors,
    ...dockerfiles.errors,
    ...publishablePackages.errors,
    ...testFrameworks.errors,
    ...nxTargetResults.errors,
    ...buildArtifacts.errors,
  ];

  const availableInputs = [...baseInputs, ...extraInputs].filter(
    (input) => input.available,
  ).length;

  if (args.fail_if_empty && availableInputs === 0) {
    errors.push(
      createNotice(
        "error",
        "ci-summary",
        "No CI summary input artifacts were available.",
        {
          expected_files: [
            args.affected_projects_file,
            args.cloudflare_targets_file,
            args.dockerfiles_file,
            args.publishable_packages_file,
            args.test_frameworks_file,
            args.nx_target_results_file,
            args.build_artifacts_file,
            ...args.input_files,
          ],
        },
      ),
    );
  }

  const summary = {
    schema_version: 1,
    type: "ci-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: git,
    config: {
      affected_projects_file: toRelativePath(
        resolvePath(args.affected_projects_file, repoRoot),
        repoRoot,
      ),
      cloudflare_targets_file: toRelativePath(
        resolvePath(args.cloudflare_targets_file, repoRoot),
        repoRoot,
      ),
      dockerfiles_file: toRelativePath(
        resolvePath(args.dockerfiles_file, repoRoot),
        repoRoot,
      ),
      publishable_packages_file: toRelativePath(
        resolvePath(args.publishable_packages_file, repoRoot),
        repoRoot,
      ),
      test_frameworks_file: toRelativePath(
        resolvePath(args.test_frameworks_file, repoRoot),
        repoRoot,
      ),
      nx_target_results_file: toRelativePath(
        resolvePath(args.nx_target_results_file, repoRoot),
        repoRoot,
      ),
      build_artifacts_file: toRelativePath(
        resolvePath(args.build_artifacts_file, repoRoot),
        repoRoot,
      ),
      input_files: args.input_files.map((filePath) =>
        toRelativePath(resolvePath(filePath, repoRoot), repoRoot),
      ),
      warn_large_artifacts_mb: args.warn_large_artifacts_mb,
      warn_changed_files: args.warn_changed_files,
      warn_matrix_entries: args.warn_matrix_entries,
      fail_on_warning: args.fail_on_warning,
      fail_on_error: args.fail_on_error,
      fail_if_empty: args.fail_if_empty,
    },
    outputs: {
      output_file: toRelativePath(
        resolvePath(args.output_file, repoRoot),
        repoRoot,
      ),
      summary_file: args.write_summary_file
        ? toRelativePath(resolvePath(args.summary_file, repoRoot), repoRoot)
        : null,
    },
    inputs: {
      available: availableInputs,
      total: baseInputs.length + extraInputs.length,
      base: baseInputs.map((input) => ({
        key: input.key,
        file: input.file,
        type: input.type,
        available: input.available,
        required: input.required,
        error: input.error,
      })),
      extra: summarizeExtraInputs(extraInputs),
    },
    affected_projects: affectedProjects,
    cloudflare_targets: cloudflareTargets,
    dockerfiles,
    publishable_packages: publishablePackages,
    test_frameworks: testFrameworks,
    nx_target_results: nxTargetResults,
    build_artifacts: buildArtifacts,
    notices: {
      errors,
      warnings,
    },
    recommendations: [],
    totals: {
      errors: errors.length,
      warnings: warnings.length,
      available_inputs: availableInputs,
      changed_files: Math.max(
        affectedProjects.changed_files || 0,
        cloudflareTargets.changed_files || 0,
        dockerfiles.changed_files || 0,
        publishablePackages.changed_files || 0,
        testFrameworks.changed_files || 0,
      ),
      affected_projects: affectedProjects.affected_projects || 0,
      affected_cloudflare_targets: cloudflareTargets.affected_targets || 0,
      affected_docker_targets: dockerfiles.affected_targets || 0,
      affected_publishable_packages:
        publishablePackages.affected_publishable_packages || 0,
      affected_test_targets: testFrameworks.affected_targets_with_tests || 0,
      cloudflare_deployment_matrix_entries:
        cloudflareTargets.deployment_matrix_entries || 0,
      docker_build_matrix_entries: dockerfiles.build_matrix_entries || 0,
      publish_matrix_entries: publishablePackages.publish_matrix_entries || 0,
      test_matrix_entries: testFrameworks.test_matrix_entries || 0,
      nx_planned_commands: nxTargetResults.planned_commands || 0,
      nx_passed_commands: nxTargetResults.passed || 0,
      nx_failed_commands: nxTargetResults.failed || 0,
      build_artifacts_collected: buildArtifacts.collected || 0,
      build_artifacts_size_bytes: buildArtifacts.size_bytes || 0,
      build_artifacts_size_human: buildArtifacts.size_human || "0 B",
    },
    status: "unknown",
  };

  summary.recommendations = buildRecommendations(summary);
  summary.status = buildStatus(errors, warnings);

  return summary;
}

function createMarkdownSummary(summary) {
  const lines = [
    `# ✅ ${PROJECT_NAME} CI Summary`,
    "",
    `Generated: \`${summary.created_at}\``,
    "",
    "## 🚦 Status",
    "",
    `- Status: \`${summary.status}\``,
    `- Errors: \`${summary.totals.errors}\``,
    `- Warnings: \`${summary.totals.warnings}\``,
    `- Available input artifacts: \`${summary.inputs.available}/${summary.inputs.total}\``,
    "",
    "## 🧾 Repository",
    "",
    `- Repository: \`${summary.repository}\``,
    `- Branch: \`${summary.github.branch || "unknown"}\``,
    `- Commit: \`${summary.github.short_sha || summary.github.sha || "unknown"}\``,
    `- Workflow: \`${summary.github.workflow || "unknown"}\``,
    `- Run: \`${summary.github.run_id || "unknown"}\``,
    "",
    "## 📊 CI Totals",
    "",
    `- Changed files: \`${summary.totals.changed_files}\``,
    `- Affected projects: \`${summary.totals.affected_projects}\``,
    `- Affected Cloudflare targets: \`${summary.totals.affected_cloudflare_targets}\``,
    `- Affected Docker targets: \`${summary.totals.affected_docker_targets}\``,
    `- Affected publishable packages: \`${summary.totals.affected_publishable_packages}\``,
    `- Affected test targets: \`${summary.totals.affected_test_targets}\``,
    `- Nx planned commands: \`${summary.totals.nx_planned_commands}\``,
    `- Nx failed commands: \`${summary.totals.nx_failed_commands}\``,
    `- Build artifacts collected: \`${summary.totals.build_artifacts_collected}\``,
    `- Build artifact size: \`${summary.totals.build_artifacts_size_human}\``,
    "",
    "## 🎯 Affected Projects",
    "",
  ];

  if (!summary.affected_projects.available) {
    lines.push("Affected project data was not available.");
  } else {
    lines.push(`- Status: \`${summary.affected_projects.status}\``);
    lines.push(
      `- Detection source: \`${summary.affected_projects.detection_source}\``,
    );
    lines.push(
      `- Nx used: \`${summary.affected_projects.nx_used ? "true" : "false"}\``,
    );
    lines.push(
      `- Discovered projects: \`${summary.affected_projects.discovered_projects}\``,
    );
    lines.push(
      `- Affected projects: \`${summary.affected_projects.affected_projects}\``,
    );
    lines.push(
      `- Target matrix entries: \`${summary.affected_projects.target_matrix_entries}\``,
    );

    if (summary.affected_projects.affected_project_names.length) {
      lines.push("");
      lines.push(
        summary.affected_projects.affected_project_names
          .map((name) => `- \`${name}\``)
          .join("\n"),
      );
    }
  }

  lines.push("");
  lines.push("## 🧪 Test Frameworks");
  lines.push("");

  if (!summary.test_frameworks.available) {
    lines.push("Test framework data was not available.");
  } else {
    lines.push(`- Status: \`${summary.test_frameworks.status}\``);
    lines.push(
      `- Test config files: \`${summary.test_frameworks.test_config_files}\``,
    );
    lines.push(
      `- Targets with tests: \`${summary.test_frameworks.targets_with_tests}\``,
    );
    lines.push(
      `- Affected targets with tests: \`${summary.test_frameworks.affected_targets_with_tests}\``,
    );
    lines.push(`- Frameworks: \`${summary.test_frameworks.frameworks}\``);
    lines.push(
      `- Test matrix entries: \`${summary.test_frameworks.test_matrix_entries}\``,
    );

    if (summary.test_frameworks.framework_ids.length) {
      lines.push(
        `- Framework IDs: ${summary.test_frameworks.framework_ids.map((item) => `\`${item}\``).join(", ")}`,
      );
    }
  }

  lines.push("");
  lines.push("## ⚙️ Nx Target Results");
  lines.push("");

  if (!summary.nx_target_results.available) {
    lines.push("Nx target result data was not available.");
  } else {
    lines.push(`- Status: \`${summary.nx_target_results.status}\``);
    lines.push(
      `- Selected projects: \`${summary.nx_target_results.selected_projects}\``,
    );
    lines.push(
      `- Planned commands: \`${summary.nx_target_results.planned_commands}\``,
    );
    lines.push(`- Passed: \`${summary.nx_target_results.passed}\``);
    lines.push(`- Failed: \`${summary.nx_target_results.failed}\``);
    lines.push(`- Skipped: \`${summary.nx_target_results.skipped}\``);
    lines.push(`- Duration: \`${summary.nx_target_results.duration_human}\``);
  }

  lines.push("");
  lines.push("## ☁️ Cloudflare Targets");
  lines.push("");

  if (!summary.cloudflare_targets.available) {
    lines.push("Cloudflare target data was not available.");
  } else {
    lines.push(`- Status: \`${summary.cloudflare_targets.status}\``);
    lines.push(`- Targets: \`${summary.cloudflare_targets.targets}\``);
    lines.push(
      `- Affected targets: \`${summary.cloudflare_targets.affected_targets}\``,
    );
    lines.push(
      `- Deployment matrix entries: \`${summary.cloudflare_targets.deployment_matrix_entries}\``,
    );
    lines.push(`- Workers: \`${summary.cloudflare_targets.workers}\``);
    lines.push(`- Pages: \`${summary.cloudflare_targets.pages}\``);
    lines.push(
      `- Invalid configs: \`${summary.cloudflare_targets.invalid_configs}\``,
    );
    lines.push(
      `- D1/KV/R2/Queues/DO: \`${summary.cloudflare_targets.resources.d1_databases}/${summary.cloudflare_targets.resources.kv_namespaces}/${summary.cloudflare_targets.resources.r2_buckets}/${summary.cloudflare_targets.resources.queue_producers + summary.cloudflare_targets.resources.queue_consumers}/${summary.cloudflare_targets.resources.durable_objects}\``,
    );
  }

  lines.push("");
  lines.push("## 🐳 Docker Targets");
  lines.push("");

  if (!summary.dockerfiles.available) {
    lines.push("Dockerfile data was not available.");
  } else {
    lines.push(`- Status: \`${summary.dockerfiles.status}\``);
    lines.push(`- Dockerfiles: \`${summary.dockerfiles.dockerfiles}\``);
    lines.push(`- Compose files: \`${summary.dockerfiles.compose_files}\``);
    lines.push(`- Targets: \`${summary.dockerfiles.targets}\``);
    lines.push(
      `- Affected targets: \`${summary.dockerfiles.affected_targets}\``,
    );
    lines.push(
      `- Build matrix entries: \`${summary.dockerfiles.build_matrix_entries}\``,
    );
    lines.push(
      `- Invalid Compose files: \`${summary.dockerfiles.invalid_compose_files}\``,
    );
    lines.push(
      `- Multi-stage Dockerfiles: \`${summary.dockerfiles.multi_stage}\``,
    );
  }

  lines.push("");
  lines.push("## 📦 Publishable Packages");
  lines.push("");

  if (!summary.publishable_packages.available) {
    lines.push("Publishable package data was not available.");
  } else {
    lines.push(`- Status: \`${summary.publishable_packages.status}\``);
    lines.push(`- Packages: \`${summary.publishable_packages.packages}\``);
    lines.push(
      `- Publishable packages: \`${summary.publishable_packages.publishable_packages}\``,
    );
    lines.push(
      `- Private packages: \`${summary.publishable_packages.private_packages}\``,
    );
    lines.push(
      `- Affected publishable packages: \`${summary.publishable_packages.affected_publishable_packages}\``,
    );
    lines.push(
      `- Publish matrix entries: \`${summary.publishable_packages.publish_matrix_entries}\``,
    );
    lines.push(
      `- Invalid or blocked packages: \`${summary.publishable_packages.invalid_or_blocked_packages}\``,
    );
  }

  lines.push("");
  lines.push("## 📁 Build Artifacts");
  lines.push("");

  if (!summary.build_artifacts.available) {
    lines.push("Build artifact data was not available.");
  } else {
    lines.push(`- Status: \`${summary.build_artifacts.status}\``);
    lines.push(`- Discovered: \`${summary.build_artifacts.discovered}\``);
    lines.push(`- Collected: \`${summary.build_artifacts.collected}\``);
    lines.push(`- Skipped: \`${summary.build_artifacts.skipped}\``);
    lines.push(
      `- Secret-signal skips: \`${summary.build_artifacts.skipped_secret_signals}\``,
    );
    lines.push(`- Size: \`${summary.build_artifacts.size_human}\``);
    lines.push(
      `- Copy directory: \`${summary.build_artifacts.copy_dir || "copy disabled"}\``,
    );

    if (Object.keys(summary.build_artifacts.categories || {}).length) {
      lines.push("");
      lines.push("| Category | Count | Size |");
      lines.push("|---|---:|---:|");

      for (const [category, group] of Object.entries(
        summary.build_artifacts.categories,
      )) {
        lines.push(
          `| \`${category}\` | \`${group.count || 0}\` | \`${group.size_human || "0 B"}\` |`,
        );
      }
    }
  }

  if (summary.notices.errors.length) {
    lines.push("");
    lines.push("## ❌ Errors");
    lines.push("");
    lines.push("| Source | Message | Details |");
    lines.push("|---|---|---|");

    for (const error of summary.notices.errors) {
      lines.push(
        `| \`${error.source}\` | ${error.message} | \`${truncate(JSON.stringify(error.details || {}), 140)}\` |`,
      );
    }
  }

  if (summary.notices.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");
    lines.push("| Source | Message | Details |");
    lines.push("|---|---|---|");

    for (const warning of summary.notices.warnings.slice(0, 100)) {
      lines.push(
        `| \`${warning.source}\` | ${warning.message} | \`${truncate(JSON.stringify(warning.details || {}), 140)}\` |`,
      );
    }

    if (summary.notices.warnings.length > 100) {
      lines.push(
        `| ... | ${summary.notices.warnings.length - 100} additional warning(s) omitted. | ... |`,
      );
    }
  }

  lines.push("");
  lines.push("## 🛠️ Recommendations");
  lines.push("");

  for (const recommendation of summary.recommendations) {
    lines.push(`- ${recommendation}`);
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

function writeGitHubOutputs(summary) {
  setGitHubOutput("ci_summary_file", summary.outputs.output_file);
  setGitHubOutput(
    "ci_summary_markdown_file",
    summary.outputs.summary_file || "",
  );
  setGitHubOutput("ci_summary_status", summary.status);
  setGitHubOutput("ci_summary_errors", String(summary.totals.errors));
  setGitHubOutput("ci_summary_warnings", String(summary.totals.warnings));
  setGitHubOutput(
    "ci_summary_available_inputs",
    String(summary.totals.available_inputs),
  );

  setGitHubOutput("ci_changed_files", String(summary.totals.changed_files));
  setGitHubOutput(
    "ci_affected_projects",
    String(summary.totals.affected_projects),
  );
  setGitHubOutput(
    "ci_affected_project_names",
    summary.affected_projects.affected_project_names.join(","),
  );
  setGitHubOutput(
    "ci_affected_project_names_json",
    JSON.stringify(summary.affected_projects.affected_project_names),
  );

  setGitHubOutput(
    "ci_test_framework_ids",
    summary.test_frameworks.framework_ids.join(","),
  );
  setGitHubOutput(
    "ci_test_framework_ids_json",
    JSON.stringify(summary.test_frameworks.framework_ids),
  );
  setGitHubOutput(
    "ci_test_matrix_entries",
    String(summary.totals.test_matrix_entries),
  );

  setGitHubOutput(
    "ci_nx_planned_commands",
    String(summary.totals.nx_planned_commands),
  );
  setGitHubOutput(
    "ci_nx_passed_commands",
    String(summary.totals.nx_passed_commands),
  );
  setGitHubOutput(
    "ci_nx_failed_commands",
    String(summary.totals.nx_failed_commands),
  );

  setGitHubOutput(
    "ci_cloudflare_targets",
    String(summary.cloudflare_targets.targets || 0),
  );
  setGitHubOutput(
    "ci_cloudflare_affected_targets",
    String(summary.totals.affected_cloudflare_targets),
  );
  setGitHubOutput(
    "ci_cloudflare_deployment_matrix_entries",
    String(summary.totals.cloudflare_deployment_matrix_entries),
  );

  setGitHubOutput(
    "ci_docker_targets",
    String(summary.dockerfiles.targets || 0),
  );
  setGitHubOutput(
    "ci_docker_affected_targets",
    String(summary.totals.affected_docker_targets),
  );
  setGitHubOutput(
    "ci_docker_build_matrix_entries",
    String(summary.totals.docker_build_matrix_entries),
  );

  setGitHubOutput(
    "ci_publishable_packages",
    String(summary.publishable_packages.publishable_packages || 0),
  );
  setGitHubOutput(
    "ci_affected_publishable_packages",
    String(summary.totals.affected_publishable_packages),
  );
  setGitHubOutput(
    "ci_publish_matrix_entries",
    String(summary.totals.publish_matrix_entries),
  );

  setGitHubOutput(
    "ci_build_artifacts_collected",
    String(summary.totals.build_artifacts_collected),
  );
  setGitHubOutput(
    "ci_build_artifacts_size_bytes",
    String(summary.totals.build_artifacts_size_bytes),
  );
  setGitHubOutput(
    "ci_build_artifacts_size_human",
    summary.totals.build_artifacts_size_human,
  );
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Summarizing CI artifacts.");

  const summary = createSummary(args, repoRoot);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  const markdown = createMarkdownSummary(summary);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, markdown, {
      dry_run: args.dry_run,
    });
  }

  writeGitHubOutputs(summary);

  if (args.write_step_summary) {
    appendGitHubStepSummary(markdown);
  }

  if (args.print) {
    console.log(json.trim());
  }

  if (args.fail_if_empty && summary.inputs.available === 0) {
    logger.error("No CI summary input artifacts were available.");
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_error && summary.notices.errors.length) {
    logger.error(
      `CI summary completed with ${summary.notices.errors.length} error(s).`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.fail_on_warning && summary.notices.warnings.length) {
    logger.error(
      `CI summary completed with ${summary.notices.warnings.length} warning(s).`,
    );
    process.exitCode = 1;
  }
}

main();
