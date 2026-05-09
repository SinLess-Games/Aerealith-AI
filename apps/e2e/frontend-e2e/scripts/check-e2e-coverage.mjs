import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..', '..', '..');

const requirementsPath = join(projectRoot, 'coverage-plan', 'requirements.json');

const summaryPath = join(
  workspaceRoot,
  'dist',
  'cypress',
  'apps',
  'e2e',
  'frontend-e2e',
  'e2e-summary.json',
);

const defaultThreshold = 80;

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read or parse JSON file at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function normalizeSpecPath(spec) {
  if (typeof spec !== 'string') {
    return '';
  }

  const trimmedSpec = spec.trim();

  if (trimmedSpec.length === 0) {
    return '';
  }

  return trimmedSpec;
}

function resolveProjectPath(path) {
  return isAbsolute(path) ? path : join(projectRoot, path);
}

function fileExists(path) {
  if (!existsSync(path)) {
    return false;
  }

  return statSync(path).isFile();
}

function directoryExists(path) {
  if (!existsSync(path)) {
    return false;
  }

  return statSync(path).isDirectory();
}

function toWorkspaceRelativePath(path) {
  return relative(workspaceRoot, path);
}

function getRequirements(config) {
  if (!Array.isArray(config.requirements)) {
    return [];
  }

  return config.requirements.map((requirement, index) => {
    const id =
      typeof requirement.id === 'string' && requirement.id.trim().length > 0
        ? requirement.id.trim()
        : `requirement-${index + 1}`;

    const description =
      typeof requirement.description === 'string'
        ? requirement.description.trim()
        : '';

    const specs = Array.isArray(requirement.specs)
      ? requirement.specs.map(normalizeSpecPath).filter(Boolean)
      : [];

    return {
      id,
      description,
      specs,
    };
  });
}

function getThreshold(config) {
  const rawThreshold = process.env.E2E_COVERAGE_THRESHOLD ?? config.threshold;
  const threshold = Number(rawThreshold ?? defaultThreshold);

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error(
      `Invalid E2E coverage threshold: ${String(
        rawThreshold,
      )}. Expected a number from 0 to 100.`,
    );
  }

  return threshold;
}

if (!fileExists(requirementsPath)) {
  throw new Error(
    `Missing E2E coverage requirements file: ${toWorkspaceRelativePath(
      requirementsPath,
    )}`,
  );
}

const config = readJsonFile(requirementsPath);
const threshold = getThreshold(config);
const requirements = getRequirements(config);

if (requirements.length === 0) {
  throw new Error(
    `No E2E coverage requirements were found in ${toWorkspaceRelativePath(
      requirementsPath,
    )}.`,
  );
}

const results = requirements.map((requirement) => {
  const missingSpecs = requirement.specs.filter((spec) => {
    const specPath = resolveProjectPath(spec);

    return !fileExists(specPath);
  });

  const covered = requirement.specs.length > 0 && missingSpecs.length === 0;

  return {
    id: requirement.id,
    description: requirement.description,
    specs: requirement.specs,
    covered,
    missingSpecs,
  };
});

const covered = results.filter((result) => result.covered).length;
const total = results.length;
const percentage = Number(((covered / total) * 100).toFixed(2));
const passed = percentage >= threshold;

const summary = {
  projectRoot: toWorkspaceRelativePath(projectRoot),
  requirementsPath: toWorkspaceRelativePath(requirementsPath),
  threshold,
  total,
  covered,
  percentage,
  passed,
  results,
};

mkdirSync(dirname(summaryPath), { recursive: true });
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(`frontend-e2e coverage: ${percentage}% (${covered}/${total})`);
console.log(`required threshold: ${threshold}%`);
console.log(`summary written to: ${toWorkspaceRelativePath(summaryPath)}`);

if (!directoryExists(dirname(summaryPath))) {
  throw new Error(
    `Failed to create E2E coverage output directory: ${toWorkspaceRelativePath(
      dirname(summaryPath),
    )}`,
  );
}

if (!passed) {
  const missing = results
    .filter((result) => !result.covered)
    .map((result) => {
      const missingSpecs =
        result.missingSpecs.length > 0
          ? result.missingSpecs.join(', ')
          : 'spec mapping';

      return `- ${result.id}: missing ${missingSpecs}`;
    })
    .join('\n');

  console.error(`E2E coverage is below threshold.\n${missing}`);
  process.exit(1);
}