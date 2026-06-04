#!/usr/bin/env node
// .github/scripts/npm/validate-packages.js
// =============================================================================
// Aerealith AI — NPM Package Validator
// -----------------------------------------------------------------------------
// Validates package discovery artifacts and publish readiness without calling npm.
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
  info: (message) => console.log(`[npm-validate] ${message}`),
  warn: (message) => console.warn(`[npm-validate] WARN: ${message}`),
  error: (message) => console.error(`[npm-validate] ERROR: ${message}`),
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    packages_file:
      process.env.NPM_VALIDATE_PACKAGES_PACKAGES_FILE ||
      "artifacts/ci/npm-packages.json",
    discovery_report_file:
      process.env.NPM_VALIDATE_PACKAGES_DISCOVERY_REPORT_FILE ||
      "artifacts/npm/discover-packages.json",
    pack_report_file:
      process.env.NPM_VALIDATE_PACKAGES_PACK_REPORT_FILE ||
      "artifacts/npm/pack-packages.json",
    output_file:
      process.env.NPM_VALIDATE_PACKAGES_OUTPUT_FILE ||
      "artifacts/npm/validate-packages.json",
    summary_file:
      process.env.NPM_VALIDATE_PACKAGES_SUMMARY_FILE ||
      "artifacts/npm/validate-packages.md",
    include_packages: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE,
    ).map(normalizePackageName),
    exclude_packages: normalizeStringList(
      process.env.NPM_VALIDATE_PACKAGES_EXCLUDE,
    ).map(normalizePackageName),
    publishable_only: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_PUBLISHABLE_ONLY,
      true,
    ),
    include_private: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_INCLUDE_PRIVATE,
      false,
    ),
    strict_entrypoints: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_ENTRYPOINTS,
      false,
    ),
    strict_publishable: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_PUBLISHABLE,
      false,
    ),
    strict_dependency_protocols: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STRICT_DEPENDENCY_PROTOCOLS,
      false,
    ),
    require_license: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_REQUIRE_LICENSE,
      false,
    ),
    require_readme: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_REQUIRE_README,
      false,
    ),
    fail_if_empty: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_IF_EMPTY,
      false,
    ),
    fail_on_invalid: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_INVALID,
      true,
    ),
    fail_on_warnings: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_WARNINGS,
      false,
    ),
    fail_on_duplicate_names: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_DUPLICATE_NAMES,
      true,
    ),
    fail_on_error: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_FAIL_ON_ERROR,
      true,
    ),
    max_packages: normalizeInteger(
      process.env.NPM_VALIDATE_PACKAGES_MAX_PACKAGES,
      0,
    ),
    dry_run: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_DRY_RUN ||
        process.env.DRY_RUN ||
        process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.NPM_VALIDATE_PACKAGES_PRINT, true),
    write_step_summary: normalizeBoolean(
      process.env.NPM_VALIDATE_PACKAGES_STEP_SUMMARY,
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
    if (arg === "--discovery-report" || arg === "--discover-report") {
      args.discovery_report_file = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--pack-report") {
      args.pack_report_file = argv[index + 1];
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
    if (arg === "--strict-entrypoints") {
      args.strict_entrypoints = true;
      continue;
    }
    if (arg === "--strict-publishable") {
      args.strict_publishable = true;
      continue;
    }
    if (arg === "--strict-dependency-protocols") {
      args.strict_dependency_protocols = true;
      continue;
    }
    if (arg === "--require-license") {
      args.require_license = true;
      continue;
    }
    if (arg === "--require-readme") {
      args.require_readme = true;
      continue;
    }
    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }
    if (arg === "--fail-on-invalid") {
      args.fail_on_invalid = true;
      continue;
    }
    if (arg === "--no-fail-on-invalid") {
      args.fail_on_invalid = false;
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
    if (arg === "--fail-on-duplicate-names") {
      args.fail_on_duplicate_names = true;
      continue;
    }
    if (arg === "--no-fail-on-duplicate-names") {
      args.fail_on_duplicate_names = false;
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

  args.include_packages = [...new Set(args.include_packages)];
  args.exclude_packages = [...new Set(args.exclude_packages)];
  args.max_packages = Math.max(0, args.max_packages);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI NPM Package Validator

Usage:
  node .github/scripts/npm/validate-packages.js [options]

Options:
      --packages <file>             Package discovery matrix artifact.
      --discovery-report <file>     Discovery report.
  -o, --output <file>               JSON output report.
      --summary <file>              Markdown summary.
      --publishable-only            Validate publishable packages only. Default.
      --strict-entrypoints          Missing declared entrypoint files are errors.
      --strict-dependency-protocols workspace:/file:/link: deps are errors.
      --no-fail-on-warnings         Do not fail on warnings. Default.
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

function normalizePackageName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@/_.,-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^\/+|\/+$/g, "");
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

function readJsonFile(filePath, fallback = null) {
  try {
    return safeJsonParse(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
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

function ensureDir(dirPath, dryRun = false) {
  if (fs.existsSync(dirPath)) return;
  if (dryRun) {
    logger.info(`[dry-run] Would create directory: ${dirPath}`);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
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
    const key =
      record.package_json || record.path || record.package_dir || record.name;
    if (!key || seen.has(key)) continue;
    seen.set(key, record);
  }

  return [...seen.values()];
}

function entryPointCandidates(packageJson) {
  const entries = [];

  for (const key of ["main", "module", "browser", "types", "typings"]) {
    if (typeof packageJson[key] === "string")
      entries.push({ type: key, file: packageJson[key] });
  }

  function collectExports(value, label = "exports") {
    if (typeof value === "string") {
      entries.push({ type: label, file: value });
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value))
      collectExports(nested, `${label}:${key}`);
  }

  collectExports(packageJson.exports);

  return entries
    .map((entry) => ({
      ...entry,
      file: String(entry.file).replace(/^\.\//, ""),
    }))
    .filter((entry) => entry.file && !entry.file.includes("*"));
}

function dependencyProtocolWarnings(packageJson, strict) {
  const warnings = [];
  const errors = [];
  const dependencyBlocks = [
    ["dependencies", packageJson.dependencies || {}],
    ["peerDependencies", packageJson.peerDependencies || {}],
    ["optionalDependencies", packageJson.optionalDependencies || {}],
  ];

  for (const [blockName, block] of dependencyBlocks) {
    for (const [name, version] of Object.entries(block)) {
      if (/^(workspace:|file:|link:)/.test(String(version))) {
        const message = `${blockName}.${name} uses local protocol ${version}.`;
        if (strict) errors.push(message);
        else warnings.push(message);
      }
    }
  }

  return { warnings, errors };
}

function hasReadme(packageDirAbs) {
  return ["README.md", "README.mdx", "Readme.md", "readme.md"].some((name) =>
    fs.existsSync(path.join(packageDirAbs, name)),
  );
}

function validatePackage(record, repoRoot, args) {
  const packageDir = toPosixPath(
    record.package_dir || record.path || record.root || ".",
  );
  const packageJsonPath = toPosixPath(
    record.package_json ||
      record.package_json_file ||
      path.join(packageDir, "package.json"),
  );
  const packageJsonAbs = resolvePath(packageJsonPath, repoRoot);
  const packageDirAbs = resolvePath(packageDir, repoRoot);
  const packageJson = readJsonFile(packageJsonAbs, null);
  const name = normalizePackageName(record.name || packageJson?.name || "");
  const version = normalizeString(record.version || packageJson?.version || "");
  const privatePackage = normalizeBoolean(
    record.private ?? packageJson?.private,
    false,
  );
  const publishable = normalizeBoolean(
    record.publishable,
    !privatePackage && Boolean(name && version),
  );
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(packageJsonAbs))
    errors.push(`package.json does not exist: ${packageJsonPath}`);
  if (!packageJson || typeof packageJson !== "object")
    errors.push(`package.json is invalid: ${packageJsonPath}`);
  if (
    !fs.existsSync(packageDirAbs) ||
    !fs.statSync(packageDirAbs).isDirectory()
  ) {
    errors.push(`Package directory does not exist: ${packageDir}`);
  }
  if (!name) errors.push("Package name is missing.");
  if (!version) errors.push("Package version is missing.");
  if (
    name &&
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)
  ) {
    errors.push(`Invalid npm package name: ${name}`);
  }
  if (version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push(`Invalid semantic version: ${version}`);
  }
  if (privatePackage && !args.include_private)
    warnings.push("Package is private and will not be published.");
  if (args.publishable_only && !publishable)
    warnings.push("Package is not marked publishable.");
  if (args.require_license && !packageJson?.license)
    errors.push("Package license is required.");
  if (
    args.require_readme &&
    fs.existsSync(packageDirAbs) &&
    !hasReadme(packageDirAbs)
  ) {
    errors.push("README is required for this package.");
  }
  if (publishable && !packageJson?.main && !packageJson?.exports) {
    warnings.push("Package has no main or exports field.");
  }

  if (
    packageJson &&
    typeof packageJson === "object" &&
    fs.existsSync(packageDirAbs)
  ) {
    for (const entry of entryPointCandidates(packageJson)) {
      const candidate = path.join(packageDirAbs, entry.file);
      if (!fs.existsSync(candidate)) {
        const message = `Declared ${entry.type} entry does not exist: ${entry.file}`;
        if (args.strict_entrypoints) errors.push(message);
        else warnings.push(message);
      }
    }

    const protocolResults = dependencyProtocolWarnings(
      packageJson,
      args.strict_dependency_protocols,
    );
    warnings.push(...protocolResults.warnings);
    errors.push(...protocolResults.errors);
  }

  for (const sourceError of Array.isArray(record.errors) ? record.errors : [])
    errors.push(sourceError);
  for (const sourceWarning of Array.isArray(record.warnings)
    ? record.warnings
    : [])
    warnings.push(sourceWarning);

  if (args.strict_publishable && publishable && warnings.length) {
    errors.push(
      ...warnings.map((warning) => `Strict publishable warning: ${warning}`),
    );
  }

  return {
    id:
      record.id ||
      crypto
        .createHash("sha256")
        .update(packageJsonPath || name)
        .digest("hex")
        .slice(0, 16),
    name,
    version,
    project: normalizeString(record.project || name),
    package_json: packageJsonPath,
    package_dir: packageDir,
    path: packageDir,
    private: privatePackage,
    publishable,
    registry: normalizeString(
      record.registry || packageJson?.publishConfig?.registry || "",
    ),
    access: normalizeString(
      record.access || packageJson?.publishConfig?.access || "",
    ),
    tag: normalizeString(
      record.tag ||
        record.default_tag ||
        packageJson?.publishConfig?.tag ||
        "latest",
    ),
    package_hash: fs.existsSync(packageJsonAbs)
      ? sha256File(packageJsonAbs)
      : "",
    status: errors.length ? "invalid" : "valid",
    valid: errors.length === 0,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function filterPackages(packages, args) {
  return packages
    .filter((pkg) => !args.publishable_only || pkg.publishable)
    .filter((pkg) => args.include_private || !pkg.private)
    .filter(
      (pkg) =>
        !args.include_packages.length ||
        args.include_packages.includes(pkg.name),
    )
    .filter((pkg) => !args.exclude_packages.includes(pkg.name))
    .slice(0, args.max_packages > 0 ? args.max_packages : undefined);
}

function duplicateNames(packages) {
  const map = new Map();
  for (const pkg of packages) {
    if (!pkg.name) continue;
    const list = map.get(pkg.name) || [];
    list.push(pkg.package_json);
    map.set(pkg.name, list);
  }
  return [...map.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({ name, files }));
}

function createMarkdownSummary(report) {
  const lines = [
    `# ${PROJECT_NAME} NPM Package Validation`,
    "",
    `Generated: \`${report.created_at}\``,
    "",
    "## Status",
    "",
    `- Status: \`${report.status}\``,
    `- OK: \`${report.ok ? "true" : "false"}\``,
    `- Packages: \`${report.totals.packages}\``,
    `- Valid: \`${report.totals.valid}\``,
    `- Invalid: \`${report.totals.invalid}\``,
    `- Errors: \`${report.totals.errors}\``,
    `- Warnings: \`${report.totals.warnings}\``,
    "",
    "## Packages",
    "",
  ];

  if (!report.packages.length) {
    lines.push("No packages were validated.");
  } else {
    lines.push(
      "| Status | Package | Version | Directory | Errors | Warnings |",
    );
    lines.push("|---|---|---:|---|---:|---:|");
    for (const pkg of report.packages) {
      lines.push(
        `| \`${pkg.status}\` | \`${pkg.name}\` | \`${pkg.version}\` | \`${pkg.package_dir}\` | \`${pkg.errors.length}\` | \`${pkg.warnings.length}\` |`,
      );
    }
  }

  if (report.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of report.errors.slice(0, 150)) lines.push(`- ${error}`);
  }

  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings.slice(0, 150))
      lines.push(`- ${warning}`);
  }

  lines.push("", "## Outputs", "");
  lines.push(`- JSON report: \`${report.config.output_file}\``);
  lines.push(`- Markdown summary: \`${report.config.summary_file}\``);

  return `${lines.join("\n").trim()}\n`;
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

  logger.info("Validating npm packages.");

  const packageArtifact = readJsonFile(
    resolvePath(args.packages_file, repoRoot),
    null,
  );
  const discoveryReport = readJsonFile(
    resolvePath(args.discovery_report_file, repoRoot),
    null,
  );
  const records = extractPackageRecords(packageArtifact, discoveryReport);
  const packages = filterPackages(
    records.map((record) => validatePackage(record, repoRoot, args)),
    args,
  );
  const duplicates = duplicateNames(packages);

  const errors = packages.flatMap((pkg) =>
    pkg.errors.map((error) => `${pkg.name || pkg.package_json}: ${error}`),
  );
  if (args.fail_if_empty && packages.length === 0)
    errors.push("No packages were selected for validation.");
  if (args.fail_on_duplicate_names) {
    for (const duplicate of duplicates) {
      errors.push(
        `Duplicate package name ${duplicate.name}: ${duplicate.files.join(", ")}`,
      );
    }
  }

  const warnings = packages.flatMap((pkg) =>
    pkg.warnings.map(
      (warning) => `${pkg.name || pkg.package_json}: ${warning}`,
    ),
  );

  const invalid = packages.filter((pkg) => !pkg.valid).length;
  const shouldFail =
    (args.fail_on_invalid && invalid > 0) ||
    (args.fail_on_warnings && warnings.length > 0) ||
    errors.length > 0;

  const ok = !shouldFail;
  const status = ok ? "valid" : "invalid";

  const report = {
    schema_version: 1,
    type: "npm-package-validation",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    github: getGitMetadata(repoRoot),
    config: {
      packages_file: toRelativePath(args.packages_file, repoRoot),
      discovery_report_file: toRelativePath(
        args.discovery_report_file,
        repoRoot,
      ),
      output_file: toRelativePath(args.output_file, repoRoot),
      summary_file: toRelativePath(args.summary_file, repoRoot),
      publishable_only: args.publishable_only,
      strict_entrypoints: args.strict_entrypoints,
      strict_publishable: args.strict_publishable,
      strict_dependency_protocols: args.strict_dependency_protocols,
      dry_run: args.dry_run,
    },
    totals: {
      records: records.length,
      packages: packages.length,
      valid: packages.filter((pkg) => pkg.valid).length,
      invalid,
      duplicates: duplicates.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    packages,
    duplicates,
    errors,
    warnings,
    ok,
    status,
  };

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

  setOutput("npm_validate_packages_file", report.config.output_file);
  setOutput("npm_validate_packages_summary_file", report.config.summary_file);
  setOutput("npm_validate_packages_status", report.status);
  setOutput("npm_validate_packages_ok", report.ok ? "true" : "false");
  setOutput("npm_validate_packages_count", String(packages.length));
  setOutput("npm_validate_packages_invalid", String(invalid));

  if (args.write_step_summary) appendStepSummary(markdown);
  if (args.print) console.log(JSON.stringify(report, null, 2));

  if (!ok && args.fail_on_error) process.exitCode = 1;
}

main().catch((error) => {
  logger.error(logger.formatError(error));
  process.exitCode = 1;
});
