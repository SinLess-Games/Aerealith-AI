#!/usr/bin/env node
// .github/scripts/npm/pack-packages.js
// =============================================================================
// Aerealith AI — NPM Package Packer
// -----------------------------------------------------------------------------
// Packs selected publishable packages. Uses the package directory as cwd and an
// absolute pack destination so pnpm/npm do not misresolve workspace paths.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);
const SECRET_OUTPUT_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm|cf)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|_authToken=[^\s]+|NODE_AUTH_TOKEN=[^\s]+|NPM_TOKEN=[^\s]+)/gi;

const logger = {
  info: (message) => console.log(`[npm-pack] ${message}`),
  warn: (message) => console.warn(`[npm-pack] WARN: ${message}`),
  error: (message) => console.error(`[npm-pack] ERROR: ${message}`),
  formatError: (error) => {
    if (!error) return "unknown error";
    if (typeof error === "string") return error;
    return error.stack || error.message || String(error);
  },
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
  if (Array.isArray(value))
    return [
      ...new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    ];
  return [
    ...new Set(
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^\/+|\/+$/g, "");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    packages_file:
      process.env.NPM_PACK_PACKAGES_PACKAGES_FILE ||
      "artifacts/ci/npm-packages.json",
    validation_file:
      process.env.NPM_PACK_PACKAGES_VALIDATION_FILE ||
      "artifacts/npm/validate-packages.json",
    output_dir:
      process.env.NPM_PACK_PACKAGES_OUTPUT_DIR || "artifacts/npm-artifacts",
    output_file:
      process.env.NPM_PACK_PACKAGES_OUTPUT_FILE ||
      "artifacts/npm/pack-packages.json",
    summary_file:
      process.env.NPM_PACK_PACKAGES_SUMMARY_FILE ||
      "artifacts/npm/pack-packages.md",
    package_manager:
      process.env.NPM_PACK_PACKAGES_PACKAGE_MANAGER ||
      process.env.PACKAGE_MANAGER ||
      "auto",
    include_packages: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_INCLUDE,
    ).map(normalizePackageName),
    exclude_packages: normalizeStringList(
      process.env.NPM_PACK_PACKAGES_EXCLUDE,
    ).map(normalizePackageName),
    publishable_only: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_PUBLISHABLE_ONLY,
      true,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    ignore_scripts: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_IGNORE_SCRIPTS,
      false,
    ),
    clean_output_dir: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_CLEAN_OUTPUT_DIR,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    continue_on_error: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_CONTINUE_ON_ERROR,
      false,
    ),
    max_packages: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_MAX_PACKAGES,
      0,
    ),
    timeout_minutes: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_TIMEOUT_MINUTES,
      20,
    ),
    max_buffer_mb: normalizeInteger(
      process.env.NPM_PACK_PACKAGES_MAX_BUFFER_MB,
      128,
    ),
    dry_run: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.NPM_PACK_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_PACK_PACKAGES_STEP_SUMMARY,
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
    if (arg === "--packages" || arg === "--packages-file") {
      args.packages_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--validation" || arg === "--validation-file") {
      args.validation_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      args.output_dir = argv[index + 1];
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
      index += 1;
      continue;
    }
    if (arg === "--package-manager") {
      args.package_manager = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--include" || arg === "--include-package") {
      args.include_packages.push(
        ...normalizeStringList(argv[index + 1]).map(normalizePackageName),
      );
      index += 1;
      continue;
    }
    if (arg === "--exclude" || arg === "--exclude-package") {
      args.exclude_packages.push(
        ...normalizeStringList(argv[index + 1]).map(normalizePackageName),
      );
      index += 1;
      continue;
    }
    if (arg === "--publishable-only") {
      args.publishable_only = true;
      continue;
    }
    if (arg === "--no-publishable-only") {
      args.publishable_only = false;
      continue;
    }
    if (arg === "--include-private") {
      args.include_private = true;
      continue;
    }
    if (arg === "--no-include-private") {
      args.include_private = false;
      continue;
    }
    if (arg === "--ignore-scripts") {
      args.ignore_scripts = true;
      continue;
    }
    if (arg === "--clean") {
      args.clean_output_dir = true;
      continue;
    }
    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
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
    if (arg === "--max-packages") {
      args.max_packages = normalizeInteger(argv[index + 1], args.max_packages);
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

  args.package_manager = normalizeString(
    args.package_manager,
    "auto",
  ).toLowerCase();
  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.max_packages = Math.max(0, args.max_packages);
  args.timeout_minutes = Math.max(0, args.timeout_minutes);
  args.max_buffer_mb = Math.max(1, args.max_buffer_mb);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Packer

Usage:
  node .github/scripts/npm/pack-packages.js [options]

Options:
      --packages <file>           Package discovery artifact.
      --validation <file>         Validation report.
      --output-dir <dir>          Tarball output directory.
  -o, --output <file>             JSON output report.
      --summary <file>            Markdown summary.
      --package-manager <manager> auto|pnpm|npm. Default: auto.
      --publishable-only          Pack publishable packages only. Default.
      --fail-if-empty             Exit non-zero when no packages are selected.
      --continue-on-error         Continue after a package pack failure.
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
    if (markers.some((marker) => fs.existsSync(path.join(current, marker))))
      return current;
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

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, fallback = null) {
  try {
    return safeJsonParse(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function redactOutput(value) {
  return String(value || "").replace(SECRET_OUTPUT_PATTERN, "[REDACTED]");
}

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;
  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath, dryRun = false) {
  if (!fs.existsSync(dirPath)) return;
  if (dryRun) {
    logger.info(`[dry-run] Would clean directory: ${dirPath}`);
    return;
  }
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

function writeTextFile(filePath, content, dryRun = false) {
  ensureDir(path.dirname(filePath), dryRun);
  if (dryRun) {
    logger.info(`[dry-run] Would write ${filePath}.`);
    return;
  }
  fs.writeFileSync(filePath, content);
  logger.info(`Wrote ${filePath}.`);
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function sha512Integrity(filePath) {
  return `sha512-${crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64")}`;
}

function shasumFile(filePath) {
  return crypto
    .createHash("sha1")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function runGit(args, repoRoot, fallback = "") {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return fallback;
  }
}

function getGitMetadata(repoRoot) {
  return {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    server_url: process.env.GITHUB_SERVER_URL || "https://github.com",
    ref:
      process.env.GITHUB_REF ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    ref_name: process.env.GITHUB_REF_NAME || "",
    sha: process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"], repoRoot),
    short_sha:
      (process.env.GITHUB_SHA || "").slice(0, 12) ||
      runGit(["rev-parse", "--short=12", "HEAD"], repoRoot),
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function packageManagerFromRepo(repoRoot) {
  if (
    fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml")) ||
    fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml"))
  )
    return "pnpm";
  if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) return "npm";
  return "npm";
}

function resolvePackageManager(args, repoRoot) {
  if (args.package_manager === "auto") return packageManagerFromRepo(repoRoot);
  return args.package_manager;
}

function extractPackageRecords(...artifacts) {
  const records = [];
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") continue;
    if (Array.isArray(artifact.packages)) records.push(...artifact.packages);
    if (Array.isArray(artifact.publishable_packages))
      records.push(...artifact.publishable_packages);
    if (Array.isArray(artifact.selected_packages))
      records.push(...artifact.selected_packages);
    if (Array.isArray(artifact.matrix?.include))
      records.push(...artifact.matrix.include);
  }

  const seen = new Map();
  for (const record of records) {
    const name = normalizePackageName(record.name || "");
    const packageJson = record.package_json || record.package_json_file || "";
    const key = packageJson || record.package_dir || record.path || name;
    if (!key || seen.has(key)) continue;
    seen.set(key, { ...record, name });
  }
  return [...seen.values()];
}

function normalizePackagePlan(record, repoRoot) {
  const packageDir = toPosixPath(
    record.package_dir || record.path || record.root || ".",
  );
  const packageJson = toPosixPath(
    record.package_json ||
      record.package_json_file ||
      path.join(packageDir, "package.json"),
  );
  const packageJsonAbs = resolvePath(packageJson, repoRoot);
  const packageJsonData = readJsonFile(packageJsonAbs, {});
  const name = normalizePackageName(record.name || packageJsonData.name || "");
  const version = normalizeString(
    record.version || packageJsonData.version || "",
  );
  const privatePackage = normalizeBoolean(
    record.private ?? packageJsonData.private,
    false,
  );
  const publishable = normalizeBoolean(
    record.publishable,
    !privatePackage && Boolean(name && version),
  );

  return {
    id:
      record.id ||
      crypto
        .createHash("sha256")
        .update(packageJson || name)
        .digest("hex")
        .slice(0, 16),
    name,
    version,
    project: normalizeString(record.project || name),
    package_json: packageJson,
    package_dir: packageDir,
    path: packageDir,
    private: privatePackage,
    publishable,
    valid: Boolean(
      record.valid ?? (name && version && fs.existsSync(packageJsonAbs)),
    ),
    registry: normalizeString(
      record.registry || packageJsonData.publishConfig?.registry || "",
    ),
    access: normalizeString(
      record.access || packageJsonData.publishConfig?.access || "",
    ),
    tag: normalizeString(
      record.tag ||
        record.default_tag ||
        packageJsonData.publishConfig?.tag ||
        "latest",
    ),
    expected_tarball: packageTarballName(name, version),
  };
}

function packageTarballName(name, version) {
  const normalized = normalizeString(name)
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${normalized}-${version || "0.0.0"}.tgz`;
}

function filterPlans(plans, args) {
  return plans
    .filter((plan) => args.include_private || !plan.private)
    .filter((plan) => !args.publishable_only || plan.publishable)
    .filter((plan) => plan.valid)
    .filter(
      (plan) =>
        !args.include_packages.length ||
        args.include_packages.includes(plan.name),
    )
    .filter((plan) => !args.exclude_packages.includes(plan.name))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);
}

function listTarballs(outputDir) {
  if (!fs.existsSync(outputDir)) return new Set();
  return new Set(
    fs
      .readdirSync(outputDir)
      .filter((file) => file.endsWith(".tgz"))
      .map((file) => path.join(outputDir, file)),
  );
}

function commandDisplay(command, args) {
  return redactOutput(
    [command, ...args]
      .map((part) =>
        /^[A-Za-z0-9_./:=@,+,-]+$/.test(String(part))
          ? String(part)
          : JSON.stringify(String(part)),
      )
      .join(" "),
  );
}

function createPackCommand(plan, args, repoRoot, outputDirAbs) {
  const packageManager = resolvePackageManager(args, repoRoot);
  const commandArgs = ["pack", "--pack-destination", outputDirAbs, "--json"];
  if (args.ignore_scripts) commandArgs.push("--ignore-scripts");

  return {
    package_manager: packageManager,
    command: packageManager === "pnpm" ? "pnpm" : "npm",
    args: commandArgs,
    cwd: resolvePath(plan.package_dir, repoRoot),
  };
}

function runCommand(commandRecord, args) {
  const startedAt = new Date();

  if (args.dry_run) {
    return {
      ...commandRecord,
      display: commandDisplay(commandRecord.command, commandRecord.args),
      status: "planned",
      success: true,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: "",
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  const result = childProcess.spawnSync(
    commandRecord.command,
    commandRecord.args,
    {
      cwd: commandRecord.cwd,
      env: { ...process.env, CI: process.env.CI || "true" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: args.max_buffer_mb * 1024 * 1024,
      timeout:
        args.timeout_minutes > 0 ? args.timeout_minutes * 60 * 1000 : undefined,
    },
  );

  const endedAt = new Date();
  const timedOut = result.error?.code === "ETIMEDOUT";
  const success = result.status === 0 && !timedOut;

  return {
    ...commandRecord,
    display: commandDisplay(commandRecord.command, commandRecord.args),
    status: success ? "passed" : "failed",
    success,
    exit_code: result.status,
    signal: result.signal || null,
    stdout: redactOutput(result.stdout || ""),
    stderr: redactOutput(result.stderr || ""),
    error: timedOut
      ? `Command timed out after ${args.timeout_minutes} minute(s).`
      : result.error
        ? String(result.error.message || result.error)
        : "",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
  };
}

function parseTarballsFromStdout(stdout, outputDirAbs) {
  const tarballs = [];
  const text = String(stdout || "").trim();

  if (!text) return tarballs;

  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const filename = item.filename || item.name || item.path || "";
      if (filename && filename.endsWith(".tgz")) {
        tarballs.push(
          path.isAbsolute(filename)
            ? filename
            : path.join(outputDirAbs, path.basename(filename)),
        );
      }
    }
  } catch {
    for (const match of text.matchAll(/([^\s"']+\.tgz)/g)) {
      tarballs.push(
        path.isAbsolute(match[1])
          ? match[1]
          : path.join(outputDirAbs, path.basename(match[1])),
      );
    }
  }

  return tarballs;
}

function tarballMetadata(filePath, repoRoot, plan) {
  const stat = fs.statSync(filePath);
  return {
    package: plan.name,
    name: plan.name,
    version: plan.version,
    file: toRelativePath(filePath, repoRoot),
    absolute_file: path.resolve(filePath),
    filename: path.basename(filePath),
    size_bytes: stat.size,
    sha256: sha256File(filePath),
    shasum: shasumFile(filePath),
    integrity: sha512Integrity(filePath),
    exists: true,
  };
}

function packPackage(plan, args, repoRoot, outputDirAbs) {
  const startedAt = new Date();
  const packageDirAbs = resolvePath(plan.package_dir, repoRoot);
  const validation = {
    ok: true,
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(packageDirAbs)) {
    validation.ok = false;
    validation.errors.push(
      `Package directory does not exist: ${plan.package_dir}`,
    );
  }

  if (!fs.existsSync(resolvePath(plan.package_json, repoRoot))) {
    validation.ok = false;
    validation.errors.push(`package.json does not exist: ${plan.package_json}`);
  }

  const result = {
    id: plan.id,
    name: plan.name,
    version: plan.version,
    project: plan.project,
    package_json: plan.package_json,
    package_dir: plan.package_dir,
    path: plan.package_dir,
    status: "pending",
    success: false,
    dry_run: args.dry_run,
    started_at: startedAt.toISOString(),
    ended_at: "",
    duration_ms: 0,
    publishable: plan.publishable,
    private: plan.private,
    registry: plan.registry,
    access: plan.access,
    tag: plan.tag,
    validation,
    command: null,
    tarballs: [],
    errors: [],
    warnings: [],
  };

  try {
    if (!validation.ok) {
      result.status = "invalid";
      result.errors.push(...validation.errors);
      return result;
    }

    logger.info(
      `${args.dry_run ? "Planning" : "Packing"} ${plan.name}@${plan.version}.`,
    );

    const before = listTarballs(outputDirAbs);
    const commandRecord = createPackCommand(plan, args, repoRoot, outputDirAbs);
    const commandResult = runCommand(commandRecord, args);
    result.command = {
      display: commandResult.display,
      package_manager: commandRecord.package_manager,
      status: commandResult.status,
      success: commandResult.success,
      exit_code: commandResult.exit_code,
      signal: commandResult.signal,
      duration_ms: commandResult.duration_ms,
      stdout_preview: commandResult.stdout.slice(0, 6000),
      stderr_preview: commandResult.stderr.slice(0, 6000),
      error: commandResult.error,
    };

    if (!commandResult.success) {
      result.status = "failed";
      result.errors.push(
        commandResult.error ||
          commandResult.stderr ||
          `Failed to pack ${plan.name}.`,
      );
      return result;
    }

    if (args.dry_run) {
      result.status = "planned";
      result.success = true;
      return result;
    }

    const after = listTarballs(outputDirAbs);
    const newTarballs = [...after].filter((file) => !before.has(file));
    const parsedTarballs = parseTarballsFromStdout(
      commandResult.stdout,
      outputDirAbs,
    ).filter((file) => fs.existsSync(file));
    const expected = path.join(outputDirAbs, plan.expected_tarball);
    const allTarballs = [
      ...new Set([
        ...newTarballs,
        ...parsedTarballs,
        ...(fs.existsSync(expected) ? [expected] : []),
      ]),
    ];

    result.tarballs = allTarballs.map((file) =>
      tarballMetadata(file, repoRoot, plan),
    );

    if (!result.tarballs.length) {
      result.status = "failed";
      result.errors.push(
        `Pack command succeeded but no tarball was produced for ${plan.name}.`,
      );
      return result;
    }

    result.status = "packed";
    result.success = true;
    return result;
  } catch (error) {
    result.status = "failed";
    result.errors.push(logger.formatError(error));
    return result;
  } finally {
    const endedAt = new Date();
    result.ended_at = endedAt.toISOString();
    result.duration_ms = endedAt.getTime() - startedAt.getTime();
  }
}

function createMarkdownSummary(report) {
  const lines = [
    `# ${PROJECT_NAME} NPM Package Pack`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Packages: \`${report.totals.packages}\``,
    `- Packed: \`${report.totals.packed}\``,
    `- Planned: \`${report.totals.planned}\``,
    `- Failed: \`${report.totals.failed}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Tarballs: \`${report.totals.tarballs}\``,
    "",
    "## Results",
    "",
  ];

  if (!report.results.length) {
    lines.push("No packages were packed.");
  } else {
    lines.push(
      "| Status | Package | Version | Directory | Tarballs | Duration |",
    );
    lines.push("|---|---|---:|---|---:|---:|");
    for (const result of report.results) {
      lines.push(
        `| \`${result.status}\` | \`${result.name}\` | \`${result.version}\` | \`${result.package_dir}\` | \`${result.tarballs.length}\` | \`${formatDuration(result.duration_ms)}\` |`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of report.errors.slice(0, 100)) lines.push(`- ${error}`);
  }

  if (report.tarballs.length) {
    lines.push("", "## Tarballs", "");
    for (const tarball of report.tarballs) {
      lines.push(`- \`${tarball.file}\` — \`${tarball.sha256}\``);
    }
  }

  lines.push("", "## Outputs", "");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(`- Markdown summary: \`${report.config.summary_file}\``);
  lines.push(`- Tarball directory: \`${report.config.output_dir}\``);

  return `${lines.join("\n").trim()}\n`;
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function appendStepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trim()}\n\n`);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${redactOutput(rendered)}\nEOF\n`,
  );
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();
  const outputDirAbs = resolvePath(args.output_dir, repoRoot);

  logger.info("Packing npm packages.");

  ensureDir(outputDirAbs, args.dry_run);
  if (args.clean_output_dir) cleanDir(outputDirAbs, args.dry_run);

  const packageArtifact = readJsonFile(
    resolvePath(args.packages_file, repoRoot),
    null,
  );
  const validationReport = readJsonFile(
    resolvePath(args.validation_file, repoRoot),
    null,
  );
  const records = extractPackageRecords(packageArtifact, validationReport);
  const plans = filterPlans(
    records.map((record) => normalizePackagePlan(record, repoRoot)),
    args,
  );

  const results = [];
  if (args.fail_if_empty && plans.length === 0) {
    logger.error("No npm packages were selected for packing.");
  } else {
    for (const plan of plans) {
      const result = packPackage(plan, args, repoRoot, outputDirAbs);
      results.push(result);
      if (!result.success && !args.continue_on_error) break;
    }
  }

  const failed = results.filter((result) => result.status === "failed");
  const invalid = results.filter((result) => result.status === "invalid");
  const packed = results.filter((result) => result.status === "packed");
  const planned = results.filter((result) => result.status === "planned");
  const tarballs = results.flatMap((result) => result.tarballs || []);
  const errors = [
    ...(args.fail_if_empty && plans.length === 0
      ? ["No npm packages were selected for packing."]
      : []),
    ...results.flatMap((result) =>
      result.errors.map((error) => `${result.name}: ${error}`),
    ),
  ];
  const ok = errors.length === 0 && failed.length === 0 && invalid.length === 0;
  const status = ok
    ? args.dry_run
      ? "planned"
      : packed.length
        ? "packed"
        : "empty"
    : "failed";

  const report = {
    schema_version: 1,
    type: "npm-package-pack",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: getGitMetadata(repoRoot),
    config: {
      packages_file: toRelativePath(args.packages_file, repoRoot),
      validation_file: toRelativePath(args.validation_file, repoRoot),
      output_dir: toRelativePath(args.output_dir, repoRoot),
      output_file: toRelativePath(args.output_file, repoRoot),
      summary_file: toRelativePath(args.summary_file, repoRoot),
      package_manager: resolvePackageManager(args, repoRoot),
      publishable_only: args.publishable_only,
      dry_run: args.dry_run,
    },
    discovery: {
      records: records.length,
      selected_packages: plans.length,
    },
    totals: {
      packages: results.length,
      packed: packed.length,
      planned: planned.length,
      failed: failed.length,
      invalid: invalid.length,
      tarballs: tarballs.length,
      errors: errors.length,
      duration_ms: results.reduce(
        (sum, result) => sum + Number(result.duration_ms || 0),
        0,
      ),
    },
    selected_packages: plans,
    results,
    tarballs,
    errors,
    warnings: results.flatMap((result) =>
      result.warnings.map((warning) => `${result.name}: ${warning}`),
    ),
    ok,
    status,
  };

  report.totals.duration_human = formatDuration(report.totals.duration_ms);

  const markdown = createMarkdownSummary(report);
  writeTextFile(
    resolvePath(args.output_file, repoRoot),
    `${JSON.stringify(report, null, 2)}\n`,
    args.dry_run,
  );
  writeTextFile(
    resolvePath(args.summary_file, repoRoot),
    markdown,
    args.dry_run,
  );

  setOutput("npm_pack_packages_file", report.config.output_file);
  setOutput("npm_pack_packages_summary_file", report.config.summary_file);
  setOutput("npm_pack_packages_status", report.status);
  setOutput("npm_pack_packages_ok", report.ok ? "true" : "false");
  setOutput(
    "npm_pack_packages_tarballs",
    tarballs.map((tarball) => tarball.file).join(","),
  );
  setOutput(
    "npm_pack_packages_tarballs_json",
    JSON.stringify(tarballs.map((tarball) => tarball.file)),
  );

  if (args.write_step_summary) appendStepSummary(markdown);
  if (args.print) console.log(JSON.stringify(report, null, 2));

  if (!ok && args.fail_on_error) process.exitCode = 1;
}

main().catch((error) => {
  logger.error(logger.formatError(error));
  process.exitCode = 1;
});
