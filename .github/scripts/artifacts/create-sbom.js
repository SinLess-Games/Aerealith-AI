#!/usr/bin/env node
// .github/scripts/artifacts/create-sbom.js
// =============================================================================
// Aerealith AI — SBOM Generator
// -----------------------------------------------------------------------------
// Purpose:
//   Generate a release-safe Software Bill of Materials for repository packages,
//   workspace dependencies, release artifacts, Docker metadata, npm package
//   metadata, and security evidence.
//
// Output:
//   - artifacts/security/sbom.spdx.json
//   - artifacts/security/sbom.md
//
// Notes:
//   - CommonJS only.
//   - Uses no required external dependencies.
//   - Uses Syft when available and requested by --mode syft or --mode auto.
//   - Falls back to a deterministic SPDX 2.3 JSON generator from package.json
//     files and pnpm-lock.yaml.
//   - Does not include secret values.
//   - Does not upload artifacts.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[sbom] ${message}`),
    warn: (message) => console.warn(`[sbom] WARN: ${message}`),
    error: (message) => console.error(`[sbom] ERROR: ${message}`),
    debug: () => {},
    dump: () => {},
    formatError: (err) => {
      if (!err) return "unknown error";
      if (typeof err === "string") return err;
      return err.message || String(err);
    },
  };
}

let yaml = null;

try {
  yaml = require("js-yaml");
} catch {
  yaml = null;
}

const PROJECT_NAME = "Aerealith AI";
const DEFAULT_REPOSITORY = "SinLess-Games/Aerealith-AI";
const DEFAULT_BRANCH = "main";

const DEFAULT_OUTPUT_FILE = "artifacts/security/sbom.spdx.json";
const DEFAULT_SUMMARY_FILE = "artifacts/security/sbom.md";

const DEFAULT_SOURCE = ".";
const DEFAULT_MODE = "auto";
const DEFAULT_FORMAT = "spdx-json";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const DEFAULT_INCLUDE_DIRS = ["."];

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/",
  ".github/scripts/node_modules/",
  "node_modules/",
  ".nx/",
  ".turbo/",
  ".cache/",
  ".pnpm-store/",
  ".wrangler/",
  ".next/cache/",
  "dist/",
  "coverage/",
  "tmp/",
  "temp/",
  "artifacts/",
];

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

const RELATIONSHIP_TYPES = {
  DESCRIBES: "DESCRIBES",
  DEPENDS_ON: "DEPENDS_ON",
  CONTAINS: "CONTAINS",
  GENERATED_FROM: "GENERATED_FROM",
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
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "release",
    source: process.env.SBOM_SOURCE || DEFAULT_SOURCE,
    mode: process.env.SBOM_MODE || DEFAULT_MODE,
    format: process.env.SBOM_FORMAT || DEFAULT_FORMAT,
    output_file: process.env.SBOM_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file: process.env.SBOM_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,
    include: normalizeStringList(process.env.SBOM_INCLUDE),
    exclude: normalizeStringList(process.env.SBOM_EXCLUDE),
    include_private: normalizeBoolean(process.env.SBOM_INCLUDE_PRIVATE, true),
    include_dev_dependencies: normalizeBoolean(
      process.env.SBOM_INCLUDE_DEV_DEPENDENCIES,
      true,
    ),
    include_optional_dependencies: normalizeBoolean(
      process.env.SBOM_INCLUDE_OPTIONAL_DEPENDENCIES,
      true,
    ),
    include_peer_dependencies: normalizeBoolean(
      process.env.SBOM_INCLUDE_PEER_DEPENDENCIES,
      true,
    ),
    write_summary_file: normalizeBoolean(process.env.SBOM_WRITE_SUMMARY, true),
    fail_if_empty: normalizeBoolean(process.env.SBOM_FAIL_IF_EMPTY, true),
    fail_on_syft_error: normalizeBoolean(
      process.env.SBOM_FAIL_ON_SYFT_ERROR,
      false,
    ),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.SBOM_PRINT, true),
    write_step_summary: normalizeBoolean(process.env.SBOM_STEP_SUMMARY, true),
    max_package_json_files: normalizeInteger(
      process.env.SBOM_MAX_PACKAGE_JSON_FILES,
      1000,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo" || arg === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--previous-version") {
      args.previous_version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--channel") {
      args.channel = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source") {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--format") {
      args.format = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--include" || arg === "-i") {
      args.include.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--exclude" || arg === "-x") {
      args.exclude.push(argv[index + 1]);
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

    if (arg === "--include-private") {
      args.include_private = true;
      continue;
    }

    if (arg === "--no-private") {
      args.include_private = false;
      continue;
    }

    if (arg === "--include-dev") {
      args.include_dev_dependencies = true;
      continue;
    }

    if (arg === "--no-dev") {
      args.include_dev_dependencies = false;
      continue;
    }

    if (arg === "--include-optional") {
      args.include_optional_dependencies = true;
      continue;
    }

    if (arg === "--no-optional") {
      args.include_optional_dependencies = false;
      continue;
    }

    if (arg === "--include-peer") {
      args.include_peer_dependencies = true;
      continue;
    }

    if (arg === "--no-peer") {
      args.include_peer_dependencies = false;
      continue;
    }

    if (arg === "--fail-if-empty") {
      args.fail_if_empty = true;
      continue;
    }

    if (arg === "--no-fail-if-empty") {
      args.fail_if_empty = false;
      continue;
    }

    if (arg === "--fail-on-syft-error") {
      args.fail_on_syft_error = true;
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

  if (!args.include.length) {
    args.include = [...DEFAULT_INCLUDE_DIRS];
  }

  args.exclude = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...args.exclude])];

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI SBOM Generator

Usage:
  node .github/scripts/artifacts/create-sbom.js [options]

Options:
      --repo <owner/repo>              Repository slug.
      --version <version>              Release version.
      --previous-version <version>     Previous release version.
      --channel <channel>              Release channel.
      --source <path>                  Source path for SBOM generation.
      --mode <auto|syft|manual>        SBOM generation mode.
      --format <spdx-json>             SBOM format.
  -i, --include <path>                 Include path when using manual mode.
  -x, --exclude <pattern>              Exclude path pattern.
  -o, --output <file>                  SPDX JSON output file.
      --summary <file>                 Markdown summary output file.
      --no-summary                     Do not write Markdown summary.
      --include-private                Include private workspace packages.
      --no-private                     Exclude private workspace packages.
      --include-dev                    Include devDependencies.
      --no-dev                         Exclude devDependencies.
      --include-optional               Include optionalDependencies.
      --no-optional                    Exclude optionalDependencies.
      --include-peer                   Include peerDependencies.
      --no-peer                        Exclude peerDependencies.
      --fail-if-empty                  Exit non-zero when no packages are found.
      --no-fail-if-empty               Do not fail when empty.
      --fail-on-syft-error             Fail if Syft fails in syft/auto mode.
      --dry-run                        Do not write files.
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

function isDirectory(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
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

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function commandExists(command) {
  try {
    childProcess.execFileSync(command, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return true;
  } catch {
    return false;
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
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function globToRegExp(pattern) {
  const source = toPosixPath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".__DOUBLE_STAR__.")
    .replace(/\*/g, "[^/]*")
    .replace(/.__DOUBLE_STAR__./g, ".*");

  return new RegExp(`^${source}$`);
}

function matchesPattern(relativePath, pattern) {
  const normalizedPath = toPosixPath(relativePath);
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith("/")) {
    return normalizedPath.startsWith(normalizedPattern);
  }

  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.includes(normalizedPattern)
  );
}

function shouldExcludePath(relativePath, args) {
  const normalized = toPosixPath(relativePath);

  if (SECRET_PATH_PATTERN.test(normalized)) return true;

  return args.exclude.some((pattern) => matchesPattern(normalized, pattern));
}

function walkPackageJsonFiles(targetPath, repoRoot, args, output = []) {
  const absolutePath = resolvePath(targetPath, repoRoot);

  if (!fs.existsSync(absolutePath)) return output;

  const relativePath = toRelativePath(absolutePath, repoRoot);

  if (shouldExcludePath(relativePath, args)) return output;

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    if (path.basename(absolutePath) === "package.json") {
      output.push(absolutePath);
    }

    return output;
  }

  if (!stat.isDirectory()) return output;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    walkPackageJsonFiles(
      path.join(absolutePath, entry.name),
      repoRoot,
      args,
      output,
    );

    if (output.length >= args.max_package_json_files) {
      break;
    }
  }

  return output;
}

function collectPackageJsonFiles(args, repoRoot) {
  const files = [];

  for (const includePath of args.include) {
    walkPackageJsonFiles(includePath, repoRoot, args, files);
  }

  return [...new Set(files)]
    .filter(isFile)
    .sort((left, right) =>
      toRelativePath(left, repoRoot).localeCompare(
        toRelativePath(right, repoRoot),
      ),
    );
}

function hashFile(filePath, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function hashText(text, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  hash.update(String(text || ""));
  return hash.digest("hex");
}

function safeSpdxId(value, prefix = "SPDXRef-Package") {
  const safe = normalizeString(value, "unknown")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${prefix}-${safe || "unknown"}`;
}

function packageKey(name, version = "") {
  return `${name}@${version || "NOASSERTION"}`;
}

function normalizeLicenseExpression(value) {
  if (!value) return "NOASSERTION";
  if (typeof value === "string") return value.trim() || "NOASSERTION";
  if (Array.isArray(value))
    return value.map(normalizeLicenseExpression).join(" OR ");
  if (typeof value === "object" && value.type)
    return normalizeString(value.type, "NOASSERTION");
  return "NOASSERTION";
}

function npmPackagePurl(name, version) {
  const packageName = normalizeString(name);
  const packageVersion = normalizeString(version);

  if (!packageName) return "";

  if (packageName.startsWith("@")) {
    const [scope, scopedName] = packageName.split("/");

    if (scope && scopedName) {
      return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(scopedName)}${packageVersion ? `@${encodeURIComponent(packageVersion)}` : ""}`;
    }
  }

  return `pkg:npm/${encodeURIComponent(packageName)}${packageVersion ? `@${encodeURIComponent(packageVersion)}` : ""}`;
}

function createExternalRefs(name, version) {
  const purl = npmPackagePurl(name, version);

  if (!purl) return [];

  return [
    {
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: purl,
    },
  ];
}

function createSpdxPackage(input) {
  const name = normalizeString(input.name, "unknown-package");
  const version = normalizeString(input.version, "NOASSERTION");
  const downloadLocation = normalizeString(
    input.downloadLocation,
    "NOASSERTION",
  );
  const homepage = normalizeString(input.homepage, "");
  const supplier = normalizeString(input.supplier, "NOASSERTION");
  const originator = normalizeString(input.originator, "NOASSERTION");
  const licenseDeclared = normalizeLicenseExpression(
    input.licenseDeclared || input.license,
  );
  const packageFileName = normalizeString(input.packageFileName, "");
  const checksums = Array.isArray(input.checksums) ? input.checksums : [];
  const externalRefs = Array.isArray(input.externalRefs)
    ? input.externalRefs
    : createExternalRefs(name, version === "NOASSERTION" ? "" : version);

  const spdxPackage = {
    name,
    SPDXID: input.SPDXID || safeSpdxId(`${name}-${version}`),
    versionInfo: version,
    downloadLocation,
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared,
    copyrightText: normalizeString(input.copyrightText, "NOASSERTION"),
    supplier,
    originator,
  };

  if (homepage) {
    spdxPackage.homepage = homepage;
  }

  if (packageFileName) {
    spdxPackage.packageFileName = packageFileName;
  }

  if (checksums.length) {
    spdxPackage.checksums = checksums;
  }

  if (externalRefs.length) {
    spdxPackage.externalRefs = externalRefs;
  }

  if (input.comment) {
    spdxPackage.comment = input.comment;
  }

  return spdxPackage;
}

function getDependencyEntries(pkg, args) {
  const sections = [["dependencies", pkg.dependencies || {}]];

  if (args.include_dev_dependencies) {
    sections.push(["devDependencies", pkg.devDependencies || {}]);
  }

  if (args.include_optional_dependencies) {
    sections.push(["optionalDependencies", pkg.optionalDependencies || {}]);
  }

  if (args.include_peer_dependencies) {
    sections.push(["peerDependencies", pkg.peerDependencies || {}]);
  }

  return sections.flatMap(([section, deps]) => {
    return Object.entries(deps).map(([name, specifier]) => ({
      name,
      specifier: normalizeString(specifier, "NOASSERTION"),
      section,
    }));
  });
}

function parsePackageJsonFile(filePath, repoRoot, args) {
  const pkg = readJsonFile(filePath);
  const relativePath = toRelativePath(filePath, repoRoot);

  if (!args.include_private && pkg.private === true) {
    return null;
  }

  const directory = toPosixPath(path.dirname(relativePath));
  const name = normalizeString(
    pkg.name,
    directory === "." ? path.basename(repoRoot) : directory,
  );
  const version = normalizeString(pkg.version, "0.0.0");
  const dependencies = getDependencyEntries(pkg, args);

  return {
    path: relativePath,
    directory,
    name,
    version,
    private: Boolean(pkg.private),
    license: normalizeLicenseExpression(pkg.license),
    description: normalizeString(pkg.description),
    homepage: normalizeString(pkg.homepage),
    repository: pkg.repository,
    dependencies,
    package_json_sha256: hashFile(filePath, "sha256"),
    raw: pkg,
  };
}

function readPnpmLock(repoRoot) {
  const lockPath = resolvePath("pnpm-lock.yaml", repoRoot);

  if (!isFile(lockPath)) {
    return {
      path: null,
      parsed: null,
      packages: [],
      exact_versions: new Map(),
      parser: "none",
    };
  }

  const raw = fs.readFileSync(lockPath, "utf8");

  if (!yaml) {
    logger.warn(
      "js-yaml is not available. pnpm-lock.yaml exact version extraction skipped.",
    );

    return {
      path: "pnpm-lock.yaml",
      parsed: null,
      packages: [],
      exact_versions: new Map(),
      parser: "unavailable",
    };
  }

  const parsed = yaml.load(raw);
  const packages = [];

  for (const [key, value] of Object.entries(parsed?.packages || {})) {
    const parsedKey = parsePnpmPackageKey(key);

    if (!parsedKey.name) continue;

    packages.push({
      key,
      name: parsedKey.name,
      version: parsedKey.version,
      resolution: value?.resolution || {},
      license: value?.license || "",
      dependencies: value?.dependencies || {},
      optionalDependencies: value?.optionalDependencies || {},
      peerDependencies: value?.peerDependencies || {},
    });
  }

  const exactVersions = new Map();

  for (const item of packages) {
    if (!exactVersions.has(item.name)) {
      exactVersions.set(item.name, new Set());
    }

    if (item.version) {
      exactVersions.get(item.name).add(item.version);
    }
  }

  return {
    path: "pnpm-lock.yaml",
    parsed,
    packages,
    exact_versions: exactVersions,
    parser: "js-yaml",
  };
}

function parsePnpmPackageKey(key) {
  let value = normalizeString(key).replace(/^\//, "");

  value = value.replace(/\(.+\)$/g, "");

  if (!value) {
    return {
      name: "",
      version: "",
    };
  }

  const versionSeparator = value.lastIndexOf("@");

  if (versionSeparator <= 0) {
    return {
      name: value,
      version: "",
    };
  }

  return {
    name: value.slice(0, versionSeparator),
    version: value.slice(versionSeparator + 1),
  };
}

function resolveDependencyVersion(dep, lockInfo) {
  const specifier = normalizeString(dep.specifier, "NOASSERTION");

  const versions = lockInfo.exact_versions?.get?.(dep.name);

  if (versions && versions.size === 1) {
    return [...versions][0];
  }

  if (versions && versions.size > 1) {
    const cleanSpecifier = specifier.replace(/^[~^]/, "");

    if (versions.has(cleanSpecifier)) return cleanSpecifier;
  }

  return specifier || "NOASSERTION";
}

function createManualSbom(args, repoRoot) {
  const git = getGitMetadata(repoRoot);
  const packageFiles = collectPackageJsonFiles(args, repoRoot);
  const lockInfo = readPnpmLock(repoRoot);

  const workspacePackages = packageFiles
    .map((filePath) => {
      try {
        return parsePackageJsonFile(filePath, repoRoot, args);
      } catch (err) {
        logger.warn(
          `Failed to parse package.json at ${filePath}: ${logger.formatError(err)}`,
        );
        return null;
      }
    })
    .filter(Boolean);

  const createdAt = new Date().toISOString();
  const documentNamespace = [
    "https://github.com",
    args.repository,
    "sbom",
    args.version || git.short_sha || hashText(createdAt).slice(0, 12),
  ]
    .join("/")
    .replace(/\s+/g, "-");

  const packages = [];
  const relationships = [];
  const packageMap = new Map();

  const documentPackage = createSpdxPackage({
    name: PROJECT_NAME,
    version: args.version || git.short_sha || "NOASSERTION",
    SPDXID: "SPDXRef-Project",
    downloadLocation: `${git.server_url}/${args.repository}`,
    homepage: `${git.server_url}/${args.repository}`,
    supplier: "Organization: SinLess Games",
    originator: "Organization: SinLess Games",
    licenseDeclared: "NOASSERTION",
    copyrightText: "NOASSERTION",
    comment: "Root project package for the generated SBOM.",
  });

  packages.push(documentPackage);
  packageMap.set(
    packageKey(documentPackage.name, documentPackage.versionInfo),
    documentPackage,
  );

  for (const workspacePackage of workspacePackages) {
    const pkg = createSpdxPackage({
      name: workspacePackage.name,
      version: workspacePackage.version,
      SPDXID: safeSpdxId(
        `workspace-${workspacePackage.name}-${workspacePackage.version}`,
      ),
      downloadLocation: `${git.server_url}/${args.repository}/tree/${git.sha || DEFAULT_BRANCH}/${workspacePackage.directory}`,
      homepage: workspacePackage.homepage,
      supplier: "Organization: SinLess Games",
      originator: "Organization: SinLess Games",
      licenseDeclared: workspacePackage.license,
      packageFileName: workspacePackage.path,
      checksums: [
        {
          algorithm: "SHA256",
          checksumValue: workspacePackage.package_json_sha256,
        },
      ],
      comment: workspacePackage.private
        ? "Private workspace package."
        : "Workspace package.",
    });

    packages.push(pkg);
    packageMap.set(packageKey(pkg.name, pkg.versionInfo), pkg);

    relationships.push({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: RELATIONSHIP_TYPES.DESCRIBES,
      relatedSpdxElement: pkg.SPDXID,
    });

    relationships.push({
      spdxElementId: "SPDXRef-Project",
      relationshipType: RELATIONSHIP_TYPES.CONTAINS,
      relatedSpdxElement: pkg.SPDXID,
    });
  }

  for (const workspacePackage of workspacePackages) {
    const sourcePackage = packageMap.get(
      packageKey(workspacePackage.name, workspacePackage.version),
    );

    if (!sourcePackage) continue;

    for (const dep of workspacePackage.dependencies) {
      const resolvedVersion = resolveDependencyVersion(dep, lockInfo);
      const depKey = packageKey(dep.name, resolvedVersion);
      let depPackage = packageMap.get(depKey);

      if (!depPackage) {
        depPackage = createSpdxPackage({
          name: dep.name,
          version: resolvedVersion,
          SPDXID: safeSpdxId(`dependency-${dep.name}-${resolvedVersion}`),
          downloadLocation: "NOASSERTION",
          supplier: "NOASSERTION",
          originator: "NOASSERTION",
          licenseDeclared:
            findLockLicense(dep.name, resolvedVersion, lockInfo) ||
            "NOASSERTION",
          copyrightText: "NOASSERTION",
          comment: `Dependency from ${dep.section}.`,
        });

        packages.push(depPackage);
        packageMap.set(depKey, depPackage);
      }

      relationships.push({
        spdxElementId: sourcePackage.SPDXID,
        relationshipType: RELATIONSHIP_TYPES.DEPENDS_ON,
        relatedSpdxElement: depPackage.SPDXID,
        comment: `${dep.section}: ${dep.specifier}`,
      });
    }
  }

  if (lockInfo.path) {
    const lockPackage = createSpdxPackage({
      name: "pnpm-lock.yaml",
      version: git.short_sha || "NOASSERTION",
      SPDXID: "SPDXRef-pnpm-lock-yaml",
      downloadLocation: `${git.server_url}/${args.repository}/blob/${git.sha || DEFAULT_BRANCH}/pnpm-lock.yaml`,
      supplier: "NOASSERTION",
      originator: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      packageFileName: lockInfo.path,
      checksums: [
        {
          algorithm: "SHA256",
          checksumValue: hashFile(
            resolvePath(lockInfo.path, repoRoot),
            "sha256",
          ),
        },
      ],
      comment: `Lockfile metadata parsed with ${lockInfo.parser}.`,
    });

    packages.push(lockPackage);

    relationships.push({
      spdxElementId: "SPDXRef-Project",
      relationshipType: RELATIONSHIP_TYPES.GENERATED_FROM,
      relatedSpdxElement: lockPackage.SPDXID,
    });
  }

  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${PROJECT_NAME} SBOM${args.version ? ` ${args.version}` : ""}`,
    documentNamespace,
    creationInfo: {
      created: createdAt,
      creators: [
        "Tool: Aerealith AI create-sbom.js",
        "Organization: SinLess Games",
      ],
      licenseListVersion: "3.24",
    },
    documentDescribes: packages
      .filter((pkg) => pkg.SPDXID !== "SPDXRef-Project")
      .filter((pkg) => pkg.SPDXID.startsWith("SPDXRef-Package-workspace"))
      .map((pkg) => pkg.SPDXID),
    packages,
    relationships: dedupeRelationships(relationships),
    annotations: [
      {
        annotationDate: createdAt,
        annotationType: "OTHER",
        annotator: "Tool: Aerealith AI create-sbom.js",
        comment: JSON.stringify({
          project: PROJECT_NAME,
          repository: args.repository,
          version: args.version || null,
          previous_version: args.previous_version || null,
          channel: args.channel,
          git,
          generation_mode: "manual",
          package_json_files: workspacePackages.length,
          lockfile: lockInfo.path,
        }),
      },
    ],
  };
}

function findLockLicense(name, version, lockInfo) {
  const match = lockInfo.packages.find(
    (item) => item.name === name && item.version === version,
  );

  return match?.license || "";
}

function dedupeRelationships(relationships) {
  const seen = new Set();
  const output = [];

  for (const relationship of relationships) {
    const key = [
      relationship.spdxElementId,
      relationship.relationshipType,
      relationship.relatedSpdxElement,
      relationship.comment || "",
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(relationship);
  }

  return output;
}

function generateWithSyft(args, repoRoot) {
  if (!commandExists("syft")) {
    return null;
  }

  const sourcePath = resolvePath(args.source, repoRoot);
  const source =
    isDirectory(sourcePath) || isFile(sourcePath) ? sourcePath : args.source;

  logger.info(`Generating SBOM with Syft from ${source}.`);

  const stdout = childProcess.execFileSync(
    "syft",
    [source, "-o", "spdx-json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 50,
    },
  );

  const parsed = JSON.parse(stdout);

  parsed.name =
    parsed.name ||
    `${PROJECT_NAME} SBOM${args.version ? ` ${args.version}` : ""}`;

  if (!parsed.annotations) {
    parsed.annotations = [];
  }

  parsed.annotations.push({
    annotationDate: new Date().toISOString(),
    annotationType: "OTHER",
    annotator: "Tool: Aerealith AI create-sbom.js",
    comment: JSON.stringify({
      project: PROJECT_NAME,
      repository: args.repository,
      version: args.version || null,
      previous_version: args.previous_version || null,
      channel: args.channel,
      generation_mode: "syft",
    }),
  });

  return parsed;
}

function createSbom(args, repoRoot) {
  const mode = normalizeString(args.mode, DEFAULT_MODE).toLowerCase();

  if (args.format !== "spdx-json") {
    throw new Error(
      `Unsupported SBOM format: ${args.format}. Supported format: spdx-json`,
    );
  }

  if (mode === "syft" || mode === "auto") {
    try {
      const syftSbom = generateWithSyft(args, repoRoot);

      if (syftSbom) {
        return {
          mode: "syft",
          sbom: syftSbom,
        };
      }

      if (mode === "syft") {
        throw new Error("Syft is not installed or unavailable.");
      }

      logger.warn("Syft not found. Falling back to manual SPDX generation.");
    } catch (err) {
      if (args.fail_on_syft_error || mode === "syft") {
        throw err;
      }

      logger.warn(
        `Syft SBOM generation failed. Falling back to manual mode. ${logger.formatError(err)}`,
      );
    }
  }

  return {
    mode: "manual",
    sbom: createManualSbom(args, repoRoot),
  };
}

function getSbomPackages(sbom) {
  return Array.isArray(sbom.packages) ? sbom.packages : [];
}

function getSbomRelationships(sbom) {
  return Array.isArray(sbom.relationships) ? sbom.relationships : [];
}

function summarizeSbom(sbom, mode, args) {
  const packages = getSbomPackages(sbom);
  const relationships = getSbomRelationships(sbom);

  const workspacePackages = packages.filter((pkg) => {
    return (
      String(pkg.SPDXID || "").includes("workspace") ||
      String(pkg.comment || "").includes("Workspace package") ||
      String(pkg.comment || "").includes("Private workspace package")
    );
  });

  const dependencyPackages = packages.filter((pkg) => {
    return (
      String(pkg.SPDXID || "").includes("dependency") ||
      Array.isArray(pkg.externalRefs)
    );
  });

  return {
    schema_version: 1,
    type: "sbom-summary",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    release: {
      version: args.version || null,
      previous_version: args.previous_version || null,
      channel: args.channel,
    },
    sbom: {
      mode,
      format: args.format,
      spdx_version: sbom.spdxVersion || null,
      name: sbom.name || null,
      document_namespace: sbom.documentNamespace || null,
    },
    totals: {
      packages: packages.length,
      workspace_packages: workspacePackages.length,
      dependency_packages: dependencyPackages.length,
      relationships: relationships.length,
    },
    packages: packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.versionInfo || null,
      spdx_id: pkg.SPDXID,
      license_declared: pkg.licenseDeclared || null,
      supplier: pkg.supplier || null,
      external_refs: Array.isArray(pkg.externalRefs)
        ? pkg.externalRefs.length
        : 0,
    })),
  };
}

function createMarkdownSummary(summary, outputFile, repoRoot) {
  const lines = [
    `# 🧾 ${PROJECT_NAME} SBOM`,
    "",
    `Generated: \`${summary.created_at}\``,
    "",
    "## 📦 Release",
    "",
    `- Version: \`${summary.release.version || "not provided"}\``,
    `- Previous version: \`${summary.release.previous_version || "not provided"}\``,
    `- Channel: \`${summary.release.channel}\``,
    `- Repository: \`${summary.repository}\``,
    `- SBOM file: \`${toRelativePath(outputFile, repoRoot)}\``,
    `- Format: \`${summary.sbom.format}\``,
    `- Generation mode: \`${summary.sbom.mode}\``,
    "",
    "## 📊 Totals",
    "",
    `- Packages: \`${summary.totals.packages}\``,
    `- Workspace packages: \`${summary.totals.workspace_packages}\``,
    `- Dependency packages: \`${summary.totals.dependency_packages}\``,
    `- Relationships: \`${summary.totals.relationships}\``,
    "",
    "## 📁 Packages",
    "",
  ];

  if (!summary.packages.length) {
    lines.push("No packages were found.");
  } else {
    lines.push("| Package | Version | License | SPDX ID |");
    lines.push("|---|---:|---|---|");

    for (const pkg of summary.packages.slice(0, 200)) {
      lines.push(
        `| \`${pkg.name || "unknown"}\` | \`${pkg.version || "NOASSERTION"}\` | \`${pkg.license_declared || "NOASSERTION"}\` | \`${pkg.spdx_id}\` |`,
      );
    }

    if (summary.packages.length > 200) {
      lines.push(
        `| ... | ... | ... | ${summary.packages.length - 200} additional package(s) omitted from summary |`,
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

function createStepSummary(summary, outputPath, summaryPath) {
  return [
    "## 🧾 SBOM",
    "",
    `- SBOM file: \`${outputPath}\``,
    `- Summary file: \`${summaryPath || "not written"}\``,
    `- Mode: \`${summary.sbom.mode}\``,
    `- Format: \`${summary.sbom.format}\``,
    `- Packages: \`${summary.totals.packages}\``,
    `- Workspace packages: \`${summary.totals.workspace_packages}\``,
    `- Dependency packages: \`${summary.totals.dependency_packages}\``,
    `- Relationships: \`${summary.totals.relationships}\``,
  ].join("\n");
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Creating SBOM.");

  const { mode, sbom } = createSbom(args, repoRoot);
  const summary = summarizeSbom(sbom, mode, args);
  const sbomJson = `${JSON.stringify(sbom, null, 2)}\n`;
  const summaryMarkdown = createMarkdownSummary(summary, outputFile, repoRoot);

  writeTextFile(outputFile, sbomJson, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summaryMarkdown, {
      dry_run: args.dry_run,
    });
  }

  const relativeOutput = toRelativePath(outputFile, repoRoot);
  const relativeSummary = args.write_summary_file
    ? toRelativePath(summaryFile, repoRoot)
    : "";

  setGitHubOutput("sbom_file", relativeOutput);
  setGitHubOutput("sbom_summary_file", relativeSummary);
  setGitHubOutput("sbom_mode", mode);
  setGitHubOutput("sbom_format", args.format);
  setGitHubOutput("sbom_package_count", String(summary.totals.packages));
  setGitHubOutput(
    "sbom_workspace_package_count",
    String(summary.totals.workspace_packages),
  );
  setGitHubOutput(
    "sbom_dependency_package_count",
    String(summary.totals.dependency_packages),
  );
  setGitHubOutput(
    "sbom_relationship_count",
    String(summary.totals.relationships),
  );
  setGitHubOutput("sbom_sha256", hashText(sbomJson, "sha256"));

  if (args.write_step_summary) {
    appendGitHubStepSummary(
      createStepSummary(summary, relativeOutput, relativeSummary),
    );
  }

  if (args.print) {
    console.log(sbomJson.trim());
  }

  if (args.fail_if_empty && summary.totals.packages === 0) {
    logger.error("No packages were found for SBOM generation.");
    process.exitCode = 1;
  }
}

main();
