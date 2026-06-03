#!/usr/bin/env node
// .github/scripts/artifacts/verify-artifacts.js
// =============================================================================
// Aerealith AI — Artifact Verification
// -----------------------------------------------------------------------------
// Purpose:
//   Verify release artifacts, artifact manifests, checksum files, hash reports,
//   SBOM output, release evidence, security evidence, npm manifests, Docker
//   manifests, Cloudflare reports, and AI automation outputs.
//
// Output:
//   - artifacts/release/artifact-verification.json
//   - artifacts/release/artifact-verification.md
//
// Notes:
//   - CommonJS only.
//   - No external dependencies.
//   - Does not upload artifacts.
//   - Does not include file contents.
//   - Verifies local files by path, size, and hashes.
//   - Supports artifact-manifest.json, checksums.json, SHA256SUMS, SHA512SUMS,
//     artifact-hashes.json, and sbom.spdx.json.
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
    info: (message) => console.log(`[artifact-verify] ${message}`),
    warn: (message) => console.warn(`[artifact-verify] WARN: ${message}`),
    error: (message) => console.error(`[artifact-verify] ERROR: ${message}`),
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

const DEFAULT_MANIFEST_FILE = "artifacts/release/artifact-manifest.json";
const DEFAULT_CHECKSUMS_JSON_FILE = "artifacts/release/checksums.json";
const DEFAULT_HASH_REPORT_FILE = "artifacts/release/artifact-hashes.json";
const DEFAULT_SHA256_FILE = "artifacts/release/SHA256SUMS";
const DEFAULT_SHA512_FILE = "artifacts/release/SHA512SUMS";
const DEFAULT_SBOM_FILE = "artifacts/security/sbom.spdx.json";

const DEFAULT_OUTPUT_FILE = "artifacts/release/artifact-verification.json";
const DEFAULT_SUMMARY_FILE = "artifacts/release/artifact-verification.md";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const SUPPORTED_ALGORITHMS = new Set([
  "md5",
  "sha1",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
]);

const SECRET_PATH_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|credential|webhook|cookie|session|\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/i;

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

function normalizeAlgorithms(value) {
  const requested = normalizeStringList(value);

  if (!requested.length) return ["sha256", "sha512"];

  const algorithms = requested
    .map((algorithm) => algorithm.toLowerCase())
    .filter((algorithm) => SUPPORTED_ALGORITHMS.has(algorithm));

  return [...new Set(algorithms)].length
    ? [...new Set(algorithms)]
    : ["sha256", "sha512"];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    version: process.env.RELEASE_VERSION || "",
    previous_version: process.env.PREVIOUS_VERSION || "",
    channel: process.env.RELEASE_CHANNEL || "release",

    manifest_file:
      process.env.ARTIFACT_VERIFY_MANIFEST_FILE || DEFAULT_MANIFEST_FILE,
    checksums_json_file:
      process.env.ARTIFACT_VERIFY_CHECKSUMS_JSON_FILE ||
      DEFAULT_CHECKSUMS_JSON_FILE,
    hash_report_file:
      process.env.ARTIFACT_VERIFY_HASH_REPORT_FILE || DEFAULT_HASH_REPORT_FILE,
    sha256_file: process.env.ARTIFACT_VERIFY_SHA256_FILE || DEFAULT_SHA256_FILE,
    sha512_file: process.env.ARTIFACT_VERIFY_SHA512_FILE || DEFAULT_SHA512_FILE,
    sbom_file: process.env.ARTIFACT_VERIFY_SBOM_FILE || DEFAULT_SBOM_FILE,

    output_file: process.env.ARTIFACT_VERIFY_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    summary_file:
      process.env.ARTIFACT_VERIFY_SUMMARY_FILE || DEFAULT_SUMMARY_FILE,

    required_artifacts: normalizeStringList(
      process.env.ARTIFACT_VERIFY_REQUIRED_ARTIFACTS,
    ),
    algorithms: normalizeAlgorithms(process.env.ARTIFACT_VERIFY_ALGORITHMS),

    verify_manifest: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_MANIFEST,
      true,
    ),
    verify_checksums_json: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_CHECKSUMS_JSON,
      true,
    ),
    verify_hash_report: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_HASH_REPORT,
      true,
    ),
    verify_sums: normalizeBoolean(process.env.ARTIFACT_VERIFY_SUMS, true),
    verify_sbom: normalizeBoolean(process.env.ARTIFACT_VERIFY_SBOM, true),
    verify_required: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRED,
      true,
    ),

    require_manifest: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_MANIFEST,
      false,
    ),
    require_checksums_json: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_CHECKSUMS_JSON,
      false,
    ),
    require_hash_report: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_HASH_REPORT,
      false,
    ),
    require_sums: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_SUMS,
      false,
    ),
    require_sbom: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_SBOM,
      false,
    ),
    require_sbom_packages: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_REQUIRE_SBOM_PACKAGES,
      true,
    ),

    allow_secret_paths: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_ALLOW_SECRET_PATHS,
      false,
    ),
    fail_if_no_sources: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_FAIL_IF_NO_SOURCES,
      false,
    ),
    fail_on_error: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_FAIL_ON_ERROR,
      true,
    ),

    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: normalizeBoolean(process.env.ARTIFACT_VERIFY_PRINT, true),
    write_summary_file: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_WRITE_SUMMARY,
      true,
    ),
    write_step_summary: normalizeBoolean(
      process.env.ARTIFACT_VERIFY_STEP_SUMMARY,
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

    if (arg === "--manifest") {
      args.manifest_file = argv[index + 1];
      args.verify_manifest = true;
      index += 1;
      continue;
    }

    if (arg === "--checksums-json") {
      args.checksums_json_file = argv[index + 1];
      args.verify_checksums_json = true;
      index += 1;
      continue;
    }

    if (arg === "--hash-report") {
      args.hash_report_file = argv[index + 1];
      args.verify_hash_report = true;
      index += 1;
      continue;
    }

    if (arg === "--sha256") {
      args.sha256_file = argv[index + 1];
      args.verify_sums = true;
      if (!args.algorithms.includes("sha256")) args.algorithms.push("sha256");
      index += 1;
      continue;
    }

    if (arg === "--sha512") {
      args.sha512_file = argv[index + 1];
      args.verify_sums = true;
      if (!args.algorithms.includes("sha512")) args.algorithms.push("sha512");
      index += 1;
      continue;
    }

    if (arg === "--sbom") {
      args.sbom_file = argv[index + 1];
      args.verify_sbom = true;
      index += 1;
      continue;
    }

    if (arg === "--required" || arg === "--required-artifact") {
      args.required_artifacts.push(argv[index + 1]);
      args.verify_required = true;
      index += 1;
      continue;
    }

    if (arg === "--algorithm" || arg === "--algorithms") {
      args.algorithms = normalizeAlgorithms(argv[index + 1]);
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

    if (arg === "--no-manifest") {
      args.verify_manifest = false;
      continue;
    }

    if (arg === "--no-checksums-json") {
      args.verify_checksums_json = false;
      continue;
    }

    if (arg === "--no-hash-report") {
      args.verify_hash_report = false;
      continue;
    }

    if (arg === "--no-sums") {
      args.verify_sums = false;
      continue;
    }

    if (arg === "--no-sbom") {
      args.verify_sbom = false;
      continue;
    }

    if (arg === "--require-manifest") {
      args.require_manifest = true;
      continue;
    }

    if (arg === "--require-checksums-json") {
      args.require_checksums_json = true;
      continue;
    }

    if (arg === "--require-hash-report") {
      args.require_hash_report = true;
      continue;
    }

    if (arg === "--require-sums") {
      args.require_sums = true;
      continue;
    }

    if (arg === "--require-sbom") {
      args.require_sbom = true;
      continue;
    }

    if (arg === "--no-require-sbom-packages") {
      args.require_sbom_packages = false;
      continue;
    }

    if (arg === "--allow-secret-paths") {
      args.allow_secret_paths = true;
      continue;
    }

    if (arg === "--fail-if-no-sources") {
      args.fail_if_no_sources = true;
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

  args.algorithms = normalizeAlgorithms(args.algorithms);

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI Artifact Verification

Usage:
  node .github/scripts/artifacts/verify-artifacts.js [options]

Options:
      --repo <owner/repo>               Repository slug.
      --version <version>               Release version.
      --previous-version <version>      Previous release version.
      --channel <channel>               Release channel.
      --manifest <file>                 artifact-manifest.json path.
      --checksums-json <file>           checksums.json path.
      --hash-report <file>              artifact-hashes.json path.
      --sha256 <file>                   SHA256SUMS path.
      --sha512 <file>                   SHA512SUMS path.
      --sbom <file>                     SPDX SBOM JSON path.
      --required <file>                 Required artifact path. Repeatable.
      --algorithm <list>                Comma-separated algorithms to verify.
  -o, --output <file>                   Verification JSON output file.
      --summary <file>                  Verification Markdown summary file.
      --no-summary                      Do not write Markdown summary.
      --no-manifest                     Skip artifact-manifest verification.
      --no-checksums-json               Skip checksums.json verification.
      --no-hash-report                  Skip artifact-hashes.json verification.
      --no-sums                         Skip SHA*SUMS verification.
      --no-sbom                         Skip SBOM verification.
      --require-manifest                Fail when manifest is missing.
      --require-checksums-json          Fail when checksums.json is missing.
      --require-hash-report             Fail when artifact-hashes.json is missing.
      --require-sums                    Fail when SHA*SUMS files are missing.
      --require-sbom                    Fail when SBOM is missing.
      --no-require-sbom-packages        Do not fail if SBOM has no packages.
      --allow-secret-paths              Allow paths that look secret-like.
      --fail-if-no-sources              Fail when no verification sources exist.
      --fail-on-error                   Exit non-zero if verification fails.
      --no-fail-on-error                Do not fail process on verification errors.
      --dry-run                         Do not write files.
      --no-print                        Do not print JSON result.
      --no-step-summary                 Do not append GitHub step summary.
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

function readJsonFile(filePath, repoRoot, options = {}) {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    if (options.required === false) return options.fallback ?? null;
    throw new Error(`JSON file not found: ${filePath}`);
  }

  const text = fs.readFileSync(absolutePath, "utf8");
  const parsed = safeJsonParse(text, null);

  if (parsed === null) {
    throw new Error(`Invalid JSON file: ${filePath}`);
  }

  return parsed;
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
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot }),
    base_branch: process.env.GITHUB_BASE_REF || DEFAULT_BRANCH,
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_number: process.env.GITHUB_RUN_NUMBER || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
  };
}

function hashFile(filePath, algorithm) {
  const hash = crypto.createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
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

function createCheck(input) {
  return {
    id:
      input.id ||
      `${input.source || "artifact"}:${input.path || input.file || "unknown"}`,
    source: input.source || "artifact",
    type: input.type || "unknown",
    path: input.path || "",
    expected: input.expected ?? null,
    actual: input.actual ?? null,
    status: input.status || "unknown",
    severity: input.severity || (input.status === "failed" ? "error" : "info"),
    message: input.message || "",
    details: input.details || {},
  };
}

function pass(input) {
  return createCheck({
    ...input,
    status: "passed",
    severity: "info",
  });
}

function warn(input) {
  return createCheck({
    ...input,
    status: "warning",
    severity: "warning",
  });
}

function fail(input) {
  return createCheck({
    ...input,
    status: "failed",
    severity: "error",
  });
}

function skip(input) {
  return createCheck({
    ...input,
    status: "skipped",
    severity: "info",
  });
}

function isSecretPath(relativePath) {
  return SECRET_PATH_PATTERN.test(toPosixPath(relativePath));
}

function verifySafePath(relativePath, args, source) {
  if (args.allow_secret_paths) {
    return null;
  }

  if (!isSecretPath(relativePath)) {
    return null;
  }

  return fail({
    source,
    type: "path-policy",
    path: relativePath,
    message:
      "Artifact path looks secret-like and verification is blocked by policy.",
  });
}

function verifyFileExists(relativePath, repoRoot, source) {
  const absolutePath = resolvePath(relativePath, repoRoot);

  if (!isFile(absolutePath)) {
    return fail({
      source,
      type: "exists",
      path: relativePath,
      expected: "file exists",
      actual: "missing",
      message: "Referenced artifact does not exist.",
    });
  }

  return pass({
    source,
    type: "exists",
    path: relativePath,
    expected: "file exists",
    actual: "file exists",
    message: "Referenced artifact exists.",
  });
}

function verifySize(relativePath, expectedSize, repoRoot, source) {
  if (
    expectedSize === undefined ||
    expectedSize === null ||
    expectedSize === ""
  ) {
    return skip({
      source,
      type: "size",
      path: relativePath,
      message: "No expected size was provided.",
    });
  }

  const absolutePath = resolvePath(relativePath, repoRoot);

  if (!isFile(absolutePath)) {
    return fail({
      source,
      type: "size",
      path: relativePath,
      expected: expectedSize,
      actual: null,
      message: "Cannot verify size because file is missing.",
    });
  }

  const actual = fileSize(absolutePath);

  if (Number(actual) === Number(expectedSize)) {
    return pass({
      source,
      type: "size",
      path: relativePath,
      expected: Number(expectedSize),
      actual,
      message: "File size matches expected value.",
    });
  }

  return fail({
    source,
    type: "size",
    path: relativePath,
    expected: Number(expectedSize),
    actual,
    message: "File size does not match expected value.",
  });
}

function verifyHash(relativePath, algorithm, expectedHash, repoRoot, source) {
  const normalizedAlgorithm = normalizeString(algorithm).toLowerCase();

  if (!SUPPORTED_ALGORITHMS.has(normalizedAlgorithm)) {
    return skip({
      source,
      type: "hash",
      path: relativePath,
      expected: expectedHash,
      actual: null,
      message: `Unsupported hash algorithm: ${algorithm}`,
      details: {
        algorithm,
      },
    });
  }

  if (!expectedHash) {
    return skip({
      source,
      type: "hash",
      path: relativePath,
      message: `No expected ${normalizedAlgorithm} hash was provided.`,
      details: {
        algorithm: normalizedAlgorithm,
      },
    });
  }

  const absolutePath = resolvePath(relativePath, repoRoot);

  if (!isFile(absolutePath)) {
    return fail({
      source,
      type: "hash",
      path: relativePath,
      expected: expectedHash,
      actual: null,
      message: `Cannot verify ${normalizedAlgorithm} hash because file is missing.`,
      details: {
        algorithm: normalizedAlgorithm,
      },
    });
  }

  const actual = hashFile(absolutePath, normalizedAlgorithm);

  if (actual.toLowerCase() === String(expectedHash).toLowerCase()) {
    return pass({
      source,
      type: "hash",
      path: relativePath,
      expected: String(expectedHash).toLowerCase(),
      actual,
      message: `${normalizedAlgorithm} hash matches expected value.`,
      details: {
        algorithm: normalizedAlgorithm,
      },
    });
  }

  return fail({
    source,
    type: "hash",
    path: relativePath,
    expected: String(expectedHash).toLowerCase(),
    actual,
    message: `${normalizedAlgorithm} hash does not match expected value.`,
    details: {
      algorithm: normalizedAlgorithm,
    },
  });
}

function verifyArtifactRecord(record, repoRoot, args, source) {
  const relativePath = normalizeString(record.path);

  if (!relativePath) {
    return [
      fail({
        source,
        type: "record",
        path: "",
        message: "Artifact record is missing a path.",
      }),
    ];
  }

  const checks = [];

  const pathPolicy = verifySafePath(relativePath, args, source);

  if (pathPolicy) {
    checks.push(pathPolicy);
    return checks;
  }

  checks.push(verifyFileExists(relativePath, repoRoot, source));

  if (isFile(resolvePath(relativePath, repoRoot))) {
    checks.push(verifySize(relativePath, record.size_bytes, repoRoot, source));

    for (const algorithm of args.algorithms) {
      const expected =
        record.hashes?.[algorithm] ||
        record[algorithm] ||
        record.checksums?.[algorithm];

      if (expected) {
        checks.push(
          verifyHash(relativePath, algorithm, expected, repoRoot, source),
        );
      }
    }
  }

  return checks;
}

function verifyManifest(args, repoRoot) {
  const manifestPath = resolvePath(args.manifest_file, repoRoot);
  const source = "artifact-manifest";

  if (!isFile(manifestPath)) {
    return {
      source,
      file: toRelativePath(manifestPath, repoRoot),
      available: false,
      checks: [
        args.require_manifest
          ? fail({
              source,
              type: "source",
              path: toRelativePath(manifestPath, repoRoot),
              message: "Artifact manifest is required but missing.",
            })
          : skip({
              source,
              type: "source",
              path: toRelativePath(manifestPath, repoRoot),
              message: "Artifact manifest was not found.",
            }),
      ],
    };
  }

  const checks = [
    pass({
      source,
      type: "source",
      path: toRelativePath(manifestPath, repoRoot),
      message: "Artifact manifest was found.",
    }),
  ];

  let manifest = null;

  try {
    manifest = readJsonFile(args.manifest_file, repoRoot);
  } catch (err) {
    checks.push(
      fail({
        source,
        type: "json",
        path: toRelativePath(manifestPath, repoRoot),
        message: `Artifact manifest could not be parsed: ${logger.formatError(err)}`,
      }),
    );

    return {
      source,
      file: toRelativePath(manifestPath, repoRoot),
      available: true,
      checks,
    };
  }

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];

  if (!artifacts.length) {
    checks.push(
      warn({
        source,
        type: "records",
        path: toRelativePath(manifestPath, repoRoot),
        message: "Artifact manifest contains no artifact records.",
      }),
    );
  }

  for (const artifact of artifacts) {
    checks.push(...verifyArtifactRecord(artifact, repoRoot, args, source));
  }

  return {
    source,
    file: toRelativePath(manifestPath, repoRoot),
    available: true,
    manifest_type: manifest.type || null,
    artifact_count: artifacts.length,
    checks,
  };
}

function verifyChecksumsJson(args, repoRoot) {
  const checksumsPath = resolvePath(args.checksums_json_file, repoRoot);
  const source = "checksums-json";

  if (!isFile(checksumsPath)) {
    return {
      source,
      file: toRelativePath(checksumsPath, repoRoot),
      available: false,
      checks: [
        args.require_checksums_json
          ? fail({
              source,
              type: "source",
              path: toRelativePath(checksumsPath, repoRoot),
              message: "checksums.json is required but missing.",
            })
          : skip({
              source,
              type: "source",
              path: toRelativePath(checksumsPath, repoRoot),
              message: "checksums.json was not found.",
            }),
      ],
    };
  }

  const checks = [
    pass({
      source,
      type: "source",
      path: toRelativePath(checksumsPath, repoRoot),
      message: "checksums.json was found.",
    }),
  ];

  let checksums = null;

  try {
    checksums = readJsonFile(args.checksums_json_file, repoRoot);
  } catch (err) {
    checks.push(
      fail({
        source,
        type: "json",
        path: toRelativePath(checksumsPath, repoRoot),
        message: `checksums.json could not be parsed: ${logger.formatError(err)}`,
      }),
    );

    return {
      source,
      file: toRelativePath(checksumsPath, repoRoot),
      available: true,
      checks,
    };
  }

  const files = Array.isArray(checksums.files) ? checksums.files : [];

  if (!files.length) {
    checks.push(
      warn({
        source,
        type: "records",
        path: toRelativePath(checksumsPath, repoRoot),
        message: "checksums.json contains no file records.",
      }),
    );
  }

  for (const record of files) {
    checks.push(...verifyArtifactRecord(record, repoRoot, args, source));
  }

  return {
    source,
    file: toRelativePath(checksumsPath, repoRoot),
    available: true,
    checksum_count: files.length,
    checks,
  };
}

function verifyHashReport(args, repoRoot) {
  const reportPath = resolvePath(args.hash_report_file, repoRoot);
  const source = "artifact-hashes";

  if (!isFile(reportPath)) {
    return {
      source,
      file: toRelativePath(reportPath, repoRoot),
      available: false,
      checks: [
        args.require_hash_report
          ? fail({
              source,
              type: "source",
              path: toRelativePath(reportPath, repoRoot),
              message: "Artifact hash report is required but missing.",
            })
          : skip({
              source,
              type: "source",
              path: toRelativePath(reportPath, repoRoot),
              message: "Artifact hash report was not found.",
            }),
      ],
    };
  }

  const checks = [
    pass({
      source,
      type: "source",
      path: toRelativePath(reportPath, repoRoot),
      message: "Artifact hash report was found.",
    }),
  ];

  let report = null;

  try {
    report = readJsonFile(args.hash_report_file, repoRoot);
  } catch (err) {
    checks.push(
      fail({
        source,
        type: "json",
        path: toRelativePath(reportPath, repoRoot),
        message: `Artifact hash report could not be parsed: ${logger.formatError(err)}`,
      }),
    );

    return {
      source,
      file: toRelativePath(reportPath, repoRoot),
      available: true,
      checks,
    };
  }

  const files = Array.isArray(report.files) ? report.files : [];

  if (!files.length) {
    checks.push(
      warn({
        source,
        type: "records",
        path: toRelativePath(reportPath, repoRoot),
        message: "Artifact hash report contains no file records.",
      }),
    );
  }

  for (const record of files) {
    checks.push(...verifyArtifactRecord(record, repoRoot, args, source));
  }

  return {
    source,
    file: toRelativePath(reportPath, repoRoot),
    available: true,
    hash_record_count: files.length,
    checks,
  };
}

function inferAlgorithmFromSumsFile(filePath) {
  const basename = path.basename(filePath).toUpperCase();

  if (basename.includes("SHA512")) return "sha512";
  if (basename.includes("SHA384")) return "sha384";
  if (basename.includes("SHA256")) return "sha256";
  if (basename.includes("SHA224")) return "sha224";
  if (basename.includes("SHA1")) return "sha1";

  return "";
}

function parseSumsFile(filePath, repoRoot, algorithm = "") {
  const absolutePath = resolvePath(filePath, repoRoot);

  if (!isFile(absolutePath)) {
    return null;
  }

  const resolvedAlgorithm =
    algorithm || inferAlgorithmFromSumsFile(absolutePath);

  if (!resolvedAlgorithm) {
    throw new Error(
      `Unable to infer checksum algorithm from file name: ${filePath}`,
    );
  }

  return fs
    .readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([a-fA-F0-9]+)\s+\*?(.+)$/);

      if (!match) {
        return {
          valid: false,
          algorithm: resolvedAlgorithm,
          expected: "",
          path: "",
          raw: line,
          error: "Invalid checksum line format.",
        };
      }

      return {
        valid: true,
        algorithm: resolvedAlgorithm,
        expected: match[1].toLowerCase(),
        path: match[2].trim(),
        raw: line,
      };
    });
}

function verifySumsFile(filePath, algorithm, args, repoRoot) {
  const absolutePath = resolvePath(filePath, repoRoot);
  const source = `${algorithm}-sums`;
  const checks = [];

  if (!isFile(absolutePath)) {
    checks.push(
      args.require_sums
        ? fail({
            source,
            type: "source",
            path: toRelativePath(absolutePath, repoRoot),
            message: `${algorithm.toUpperCase()}SUMS file is required but missing.`,
          })
        : skip({
            source,
            type: "source",
            path: toRelativePath(absolutePath, repoRoot),
            message: `${algorithm.toUpperCase()}SUMS file was not found.`,
          }),
    );

    return {
      source,
      file: toRelativePath(absolutePath, repoRoot),
      available: false,
      entries: 0,
      checks,
    };
  }

  checks.push(
    pass({
      source,
      type: "source",
      path: toRelativePath(absolutePath, repoRoot),
      message: `${algorithm.toUpperCase()}SUMS file was found.`,
    }),
  );

  let entries = [];

  try {
    entries = parseSumsFile(filePath, repoRoot, algorithm) || [];
  } catch (err) {
    checks.push(
      fail({
        source,
        type: "parse",
        path: toRelativePath(absolutePath, repoRoot),
        message: `${algorithm.toUpperCase()}SUMS could not be parsed: ${logger.formatError(err)}`,
      }),
    );

    return {
      source,
      file: toRelativePath(absolutePath, repoRoot),
      available: true,
      entries: 0,
      checks,
    };
  }

  if (!entries.length) {
    checks.push(
      warn({
        source,
        type: "records",
        path: toRelativePath(absolutePath, repoRoot),
        message: `${algorithm.toUpperCase()}SUMS contains no entries.`,
      }),
    );
  }

  for (const entry of entries) {
    if (!entry.valid) {
      checks.push(
        fail({
          source,
          type: "format",
          path: toRelativePath(absolutePath, repoRoot),
          message: entry.error,
          details: {
            raw: entry.raw,
          },
        }),
      );
      continue;
    }

    const pathPolicy = verifySafePath(entry.path, args, source);

    if (pathPolicy) {
      checks.push(pathPolicy);
      continue;
    }

    checks.push(verifyFileExists(entry.path, repoRoot, source));
    checks.push(
      verifyHash(entry.path, algorithm, entry.expected, repoRoot, source),
    );
  }

  return {
    source,
    file: toRelativePath(absolutePath, repoRoot),
    available: true,
    entries: entries.length,
    checks,
  };
}

function verifySums(args, repoRoot) {
  const results = [];

  if (args.algorithms.includes("sha256")) {
    results.push(verifySumsFile(args.sha256_file, "sha256", args, repoRoot));
  }

  if (args.algorithms.includes("sha512")) {
    results.push(verifySumsFile(args.sha512_file, "sha512", args, repoRoot));
  }

  return results;
}

function verifySbom(args, repoRoot) {
  const sbomPath = resolvePath(args.sbom_file, repoRoot);
  const source = "sbom";
  const checks = [];

  if (!isFile(sbomPath)) {
    return {
      source,
      file: toRelativePath(sbomPath, repoRoot),
      available: false,
      checks: [
        args.require_sbom
          ? fail({
              source,
              type: "source",
              path: toRelativePath(sbomPath, repoRoot),
              message: "SBOM is required but missing.",
            })
          : skip({
              source,
              type: "source",
              path: toRelativePath(sbomPath, repoRoot),
              message: "SBOM was not found.",
            }),
      ],
    };
  }

  checks.push(
    pass({
      source,
      type: "source",
      path: toRelativePath(sbomPath, repoRoot),
      message: "SBOM was found.",
    }),
  );

  let sbom = null;

  try {
    sbom = readJsonFile(args.sbom_file, repoRoot);
  } catch (err) {
    checks.push(
      fail({
        source,
        type: "json",
        path: toRelativePath(sbomPath, repoRoot),
        message: `SBOM could not be parsed: ${logger.formatError(err)}`,
      }),
    );

    return {
      source,
      file: toRelativePath(sbomPath, repoRoot),
      available: true,
      checks,
    };
  }

  const packages = Array.isArray(sbom.packages) ? sbom.packages : [];
  const relationships = Array.isArray(sbom.relationships)
    ? sbom.relationships
    : [];

  if (sbom.spdxVersion) {
    checks.push(
      pass({
        source,
        type: "spdx-version",
        path: toRelativePath(sbomPath, repoRoot),
        expected: "SPDX version present",
        actual: sbom.spdxVersion,
        message: "SBOM declares an SPDX version.",
      }),
    );
  } else {
    checks.push(
      fail({
        source,
        type: "spdx-version",
        path: toRelativePath(sbomPath, repoRoot),
        expected: "SPDX version present",
        actual: null,
        message: "SBOM is missing spdxVersion.",
      }),
    );
  }

  if (sbom.SPDXID) {
    checks.push(
      pass({
        source,
        type: "spdx-id",
        path: toRelativePath(sbomPath, repoRoot),
        expected: "SPDXID present",
        actual: sbom.SPDXID,
        message: "SBOM declares an SPDXID.",
      }),
    );
  } else {
    checks.push(
      fail({
        source,
        type: "spdx-id",
        path: toRelativePath(sbomPath, repoRoot),
        expected: "SPDXID present",
        actual: null,
        message: "SBOM is missing SPDXID.",
      }),
    );
  }

  if (packages.length > 0) {
    checks.push(
      pass({
        source,
        type: "packages",
        path: toRelativePath(sbomPath, repoRoot),
        expected: "one or more packages",
        actual: packages.length,
        message: "SBOM contains packages.",
      }),
    );
  } else {
    checks.push(
      args.require_sbom_packages
        ? fail({
            source,
            type: "packages",
            path: toRelativePath(sbomPath, repoRoot),
            expected: "one or more packages",
            actual: 0,
            message: "SBOM contains no packages.",
          })
        : warn({
            source,
            type: "packages",
            path: toRelativePath(sbomPath, repoRoot),
            expected: "one or more packages",
            actual: 0,
            message: "SBOM contains no packages.",
          }),
    );
  }

  checks.push(
    pass({
      source,
      type: "hash",
      path: toRelativePath(sbomPath, repoRoot),
      actual: hashFile(sbomPath, "sha256"),
      message: "SBOM SHA256 was calculated.",
      details: {
        algorithm: "sha256",
      },
    }),
  );

  return {
    source,
    file: toRelativePath(sbomPath, repoRoot),
    available: true,
    spdx_version: sbom.spdxVersion || null,
    name: sbom.name || null,
    packages: packages.length,
    relationships: relationships.length,
    checks,
  };
}

function verifyRequiredArtifacts(args, repoRoot) {
  const source = "required-artifacts";
  const checks = [];

  if (!args.required_artifacts.length) {
    checks.push(
      skip({
        source,
        type: "required",
        path: "",
        message: "No required artifacts were configured.",
      }),
    );

    return {
      source,
      available: true,
      required_count: 0,
      checks,
    };
  }

  for (const requiredArtifact of args.required_artifacts) {
    const relativePath = toPosixPath(requiredArtifact);

    const pathPolicy = verifySafePath(relativePath, args, source);

    if (pathPolicy) {
      checks.push(pathPolicy);
      continue;
    }

    checks.push(verifyFileExists(relativePath, repoRoot, source));
  }

  return {
    source,
    available: true,
    required_count: args.required_artifacts.length,
    checks,
  };
}

function flattenChecks(results) {
  const checks = [];

  for (const result of results) {
    if (!result) continue;

    if (Array.isArray(result)) {
      checks.push(...flattenChecks(result));
      continue;
    }

    if (Array.isArray(result.checks)) {
      checks.push(...result.checks);
    }
  }

  return checks;
}

function summarizeChecks(checks) {
  const failed = checks.filter((check) => check.status === "failed");
  const warnings = checks.filter((check) => check.status === "warning");
  const passed = checks.filter((check) => check.status === "passed");
  const skipped = checks.filter((check) => check.status === "skipped");

  return {
    total: checks.length,
    passed: passed.length,
    failed: failed.length,
    warnings: warnings.length,
    skipped: skipped.length,
    ok: failed.length === 0,
  };
}

function createVerification(args, repoRoot) {
  const sources = [];

  if (args.verify_manifest) {
    sources.push(verifyManifest(args, repoRoot));
  }

  if (args.verify_checksums_json) {
    sources.push(verifyChecksumsJson(args, repoRoot));
  }

  if (args.verify_hash_report) {
    sources.push(verifyHashReport(args, repoRoot));
  }

  if (args.verify_sums) {
    sources.push(...verifySums(args, repoRoot));
  }

  if (args.verify_sbom) {
    sources.push(verifySbom(args, repoRoot));
  }

  if (args.verify_required) {
    sources.push(verifyRequiredArtifacts(args, repoRoot));
  }

  const availableSources = sources.filter((source) => source.available);
  const checks = flattenChecks(sources);

  if (!availableSources.length && args.fail_if_no_sources) {
    checks.push(
      fail({
        source: "verification",
        type: "sources",
        path: "",
        message: "No verification sources were available.",
      }),
    );
  }

  const totals = summarizeChecks(checks);

  return {
    schema_version: 1,
    type: "artifact-verification",
    project: PROJECT_NAME,
    repository: args.repository,
    created_at: new Date().toISOString(),
    release: {
      version: args.version || null,
      previous_version: args.previous_version || null,
      channel: args.channel || "release",
    },
    github: getGitMetadata(repoRoot),
    config: {
      manifest_file: toRelativePath(
        resolvePath(args.manifest_file, repoRoot),
        repoRoot,
      ),
      checksums_json_file: toRelativePath(
        resolvePath(args.checksums_json_file, repoRoot),
        repoRoot,
      ),
      hash_report_file: toRelativePath(
        resolvePath(args.hash_report_file, repoRoot),
        repoRoot,
      ),
      sha256_file: toRelativePath(
        resolvePath(args.sha256_file, repoRoot),
        repoRoot,
      ),
      sha512_file: toRelativePath(
        resolvePath(args.sha512_file, repoRoot),
        repoRoot,
      ),
      sbom_file: toRelativePath(
        resolvePath(args.sbom_file, repoRoot),
        repoRoot,
      ),
      required_artifacts: args.required_artifacts.map(toPosixPath),
      algorithms: args.algorithms,
      allow_secret_paths: args.allow_secret_paths,
      fail_if_no_sources: args.fail_if_no_sources,
      fail_on_error: args.fail_on_error,
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
    totals: {
      sources: sources.length,
      available_sources: availableSources.length,
      ...totals,
    },
    status: totals.ok ? "passed" : "failed",
    sources,
    checks,
    failures: checks.filter((check) => check.status === "failed"),
    warnings: checks.filter((check) => check.status === "warning"),
  };
}

function createMarkdownSummary(verification) {
  const lines = [
    `# ✅ ${PROJECT_NAME} Artifact Verification`,
    "",
    `Generated: \`${verification.created_at}\``,
    "",
    "## 🧾 Release",
    "",
    `- Version: \`${verification.release.version || "not provided"}\``,
    `- Previous version: \`${verification.release.previous_version || "not provided"}\``,
    `- Channel: \`${verification.release.channel}\``,
    `- Repository: \`${verification.repository}\``,
    `- Commit: \`${verification.github.short_sha || verification.github.sha || "unknown"}\``,
    `- Status: \`${verification.status}\``,
    "",
    "## 📊 Totals",
    "",
    `- Sources checked: \`${verification.totals.sources}\``,
    `- Available sources: \`${verification.totals.available_sources}\``,
    `- Checks: \`${verification.totals.total}\``,
    `- Passed: \`${verification.totals.passed}\``,
    `- Failed: \`${verification.totals.failed}\``,
    `- Warnings: \`${verification.totals.warnings}\``,
    `- Skipped: \`${verification.totals.skipped}\``,
    "",
    "## 🗂️ Sources",
    "",
    "| Source | File | Available | Checks | Failed | Warnings |",
    "|---|---|---:|---:|---:|---:|",
  ];

  for (const source of verification.sources) {
    const checks = Array.isArray(source.checks) ? source.checks : [];
    const summary = summarizeChecks(checks);

    lines.push(
      `| \`${source.source}\` | \`${source.file || ""}\` | \`${source.available ? "true" : "false"}\` | \`${summary.total}\` | \`${summary.failed}\` | \`${summary.warnings}\` |`,
    );
  }

  if (verification.failures.length) {
    lines.push("");
    lines.push("## ❌ Failures");
    lines.push("");
    lines.push("| Source | Type | Path | Message |");
    lines.push("|---|---|---|---|");

    for (const failure of verification.failures.slice(0, 100)) {
      lines.push(
        `| \`${failure.source}\` | \`${failure.type}\` | \`${failure.path || ""}\` | ${failure.message} |`,
      );
    }

    if (verification.failures.length > 100) {
      lines.push(
        `| ... | ... | ... | ${verification.failures.length - 100} additional failure(s) omitted from summary. |`,
      );
    }
  }

  if (verification.warnings.length) {
    lines.push("");
    lines.push("## ⚠️ Warnings");
    lines.push("");
    lines.push("| Source | Type | Path | Message |");
    lines.push("|---|---|---|---|");

    for (const warning of verification.warnings.slice(0, 100)) {
      lines.push(
        `| \`${warning.source}\` | \`${warning.type}\` | \`${warning.path || ""}\` | ${warning.message} |`,
      );
    }

    if (verification.warnings.length > 100) {
      lines.push(
        `| ... | ... | ... | ${verification.warnings.length - 100} additional warning(s) omitted from summary. |`,
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

function createStepSummary(verification) {
  const lines = [
    "## ✅ Artifact Verification",
    "",
    `- Status: \`${verification.status}\``,
    `- Sources checked: \`${verification.totals.sources}\``,
    `- Available sources: \`${verification.totals.available_sources}\``,
    `- Checks: \`${verification.totals.total}\``,
    `- Passed: \`${verification.totals.passed}\``,
    `- Failed: \`${verification.totals.failed}\``,
    `- Warnings: \`${verification.totals.warnings}\``,
    `- Skipped: \`${verification.totals.skipped}\``,
    `- Output: \`${verification.outputs.output_file}\``,
  ];

  if (verification.outputs.summary_file) {
    lines.push(`- Summary: \`${verification.outputs.summary_file}\``);
  }

  if (verification.failures.length) {
    lines.push("");
    lines.push("### Failures");
    lines.push("");

    for (const failure of verification.failures.slice(0, 10)) {
      lines.push(
        `- \`${failure.source}\` ${failure.path ? `\`${failure.path}\`` : ""}: ${failure.message}`,
      );
    }

    if (verification.failures.length > 10) {
      lines.push(
        `- ...and ${verification.failures.length - 10} more failure(s).`,
      );
    }
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  const outputFile = resolvePath(args.output_file, repoRoot);
  const summaryFile = resolvePath(args.summary_file, repoRoot);

  logger.info("Verifying artifacts.");

  const verification = createVerification(args, repoRoot);
  const json = `${JSON.stringify(verification, null, 2)}\n`;
  const summaryMarkdown = createMarkdownSummary(verification);

  writeTextFile(outputFile, json, {
    dry_run: args.dry_run,
  });

  if (args.write_summary_file) {
    writeTextFile(summaryFile, summaryMarkdown, {
      dry_run: args.dry_run,
    });
  }

  setGitHubOutput(
    "artifact_verification_file",
    verification.outputs.output_file,
  );
  setGitHubOutput(
    "artifact_verification_summary_file",
    verification.outputs.summary_file || "",
  );
  setGitHubOutput("artifact_verification_status", verification.status);
  setGitHubOutput(
    "artifact_verification_ok",
    verification.status === "passed" ? "true" : "false",
  );
  setGitHubOutput(
    "artifact_verification_sources",
    String(verification.totals.sources),
  );
  setGitHubOutput(
    "artifact_verification_available_sources",
    String(verification.totals.available_sources),
  );
  setGitHubOutput(
    "artifact_verification_checks",
    String(verification.totals.total),
  );
  setGitHubOutput(
    "artifact_verification_passed",
    String(verification.totals.passed),
  );
  setGitHubOutput(
    "artifact_verification_failed",
    String(verification.totals.failed),
  );
  setGitHubOutput(
    "artifact_verification_warnings",
    String(verification.totals.warnings),
  );
  setGitHubOutput(
    "artifact_verification_skipped",
    String(verification.totals.skipped),
  );

  if (args.write_step_summary) {
    appendGitHubStepSummary(createStepSummary(verification));
  }

  if (args.print) {
    console.log(logger.redact(json).trim());
  }

  if (args.fail_on_error && verification.status !== "passed") {
    logger.error(
      `Artifact verification failed with ${verification.totals.failed} failure(s).`,
    );
    process.exitCode = 1;
  }
}

main();
