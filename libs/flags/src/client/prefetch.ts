import { FLAGS_SECURITY_LIMITS } from '../constants';

import type {
  AnyFlagDefinition,
  FlagKey,
  FlagPrefetchConfig,
  FlagRegistry,
} from '../types';

export type FlagPrefetchInput =
  | readonly FlagKey[]
  | FlagPrefetchConfig
  | FlagRegistry
  | undefined
  | null;

export type CreateFlagPrefetchConfigOptions = {
  readonly required?: boolean;
  readonly maxFlags?: number;
  readonly sort?: boolean;
};

export type FlagPrefetchValidationResult = {
  readonly valid: boolean;
  readonly flags: readonly FlagKey[];
  readonly errors: readonly string[];
};

export class FlagPrefetchError extends Error {
  public override readonly name = 'FlagPrefetchError';

  public constructor(
    message: string,
    public readonly errors: readonly string[] = [],
  ) {
    super(message);
  }
}

export function createFlagPrefetchConfig(
  input: FlagPrefetchInput,
  options: CreateFlagPrefetchConfigOptions = {},
): FlagPrefetchConfig {
  const validation = validatePrefetchFlags(input, options);

  if (!validation.valid) {
    throw new FlagPrefetchError(
      'Invalid feature flag prefetch configuration.',
      validation.errors,
    );
  }

  return {
    flags: validation.flags,
  };
}

export function validatePrefetchFlags(
  input: FlagPrefetchInput,
  options: CreateFlagPrefetchConfigOptions = {},
): FlagPrefetchValidationResult {
  const maxFlags = options.maxFlags ?? FLAGS_SECURITY_LIMITS.maxPrefetchFlags;
  const flags = normalizePrefetchFlags(input, {
    sort: options.sort,
  });

  const errors: string[] = [];

  if (options.required && flags.length === 0) {
    errors.push('At least one prefetch flag is required.');
  }

  if (flags.length > maxFlags) {
    errors.push(`Prefetch flag count exceeds maximum allowed count of ${maxFlags}.`);
  }

  for (const flag of flags) {
    if (!isValidPrefetchFlagKey(flag)) {
      errors.push(`Invalid prefetch flag key: ${flag}`);
    }
  }

  return {
    valid: errors.length === 0,
    flags,
    errors,
  };
}

export function normalizePrefetchFlags(
  input: FlagPrefetchInput,
  options: Pick<CreateFlagPrefetchConfigOptions, 'sort'> = {},
): readonly FlagKey[] {
  const flags = extractPrefetchFlags(input)
    .map((flag) => normalizePrefetchFlagKey(flag))
    .filter((flag): flag is FlagKey => Boolean(flag));

  const deduped = dedupePrefetchFlags(flags);

  return options.sort === false ? deduped : [...deduped].sort();
}

export function mergePrefetchFlags(
  ...inputs: readonly FlagPrefetchInput[]
): readonly FlagKey[] {
  return normalizePrefetchFlags(
    inputs.flatMap((input) => extractPrefetchFlags(input)),
  );
}

export function createPrefetchFlagsFromRegistry(
  registry: FlagRegistry,
  options: CreateFlagPrefetchConfigOptions = {},
): readonly FlagKey[] {
  return createFlagPrefetchConfig(registry, options).flags;
}

export function createPrefetchFlagsFromDefinitions(
  definitions: readonly AnyFlagDefinition[],
  options: CreateFlagPrefetchConfigOptions = {},
): readonly FlagKey[] {
  return createFlagPrefetchConfig(
    definitions.map((definition) => definition.key),
    options,
  ).flags;
}

export function createPrefetchFlagsFromEnv(
  value: string | undefined | null,
  options: CreateFlagPrefetchConfigOptions = {},
): readonly FlagKey[] {
  return createFlagPrefetchConfig(parsePrefetchFlagsFromString(value), options).flags;
}

export function parsePrefetchFlagsFromString(
  value: string | undefined | null,
): readonly FlagKey[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((flag) => flag.trim())
    .filter((flag) => flag.length > 0);
}

export function stringifyPrefetchFlags(flags: readonly FlagKey[]): string {
  return normalizePrefetchFlags(flags).join(',');
}

export function hasPrefetchFlag(
  input: FlagPrefetchInput,
  flag: FlagKey,
): boolean {
  const normalizedFlag = normalizePrefetchFlagKey(flag);

  if (!normalizedFlag) {
    return false;
  }

  return normalizePrefetchFlags(input).includes(normalizedFlag);
}

export function assertPrefetchFlagAvailable(
  input: FlagPrefetchInput,
  flag: FlagKey,
): void {
  if (!hasPrefetchFlag(input, flag)) {
    throw new FlagPrefetchError(`Feature flag "${flag}" is not included in prefetchFlags.`, [
      `Add "${flag}" to the client provider prefetchFlags list before evaluating it in the browser.`,
    ]);
  }
}

export function assertPrefetchFlagsAvailable(
  input: FlagPrefetchInput,
  flags: readonly FlagKey[],
): void {
  const availableFlags = normalizePrefetchFlags(input);
  const missingFlags = flags.filter((flag) => !availableFlags.includes(flag));

  if (missingFlags.length > 0) {
    throw new FlagPrefetchError(
      'One or more feature flags are missing from prefetchFlags.',
      missingFlags.map(
        (flag) =>
          `Add "${flag}" to the client provider prefetchFlags list before evaluating it in the browser.`,
      ),
    );
  }
}

export function isValidPrefetchFlagKey(flag: unknown): flag is FlagKey {
  if (typeof flag !== 'string') {
    return false;
  }

  const normalized = flag.trim();

  if (!normalized) {
    return false;
  }

  return normalized.length <= FLAGS_SECURITY_LIMITS.maxFlagKeyLength;
}

export function normalizePrefetchFlagKey(flag: unknown): FlagKey | undefined {
  if (!isValidPrefetchFlagKey(flag)) {
    return undefined;
  }

  return flag.trim();
}

export function dedupePrefetchFlags(flags: readonly FlagKey[]): readonly FlagKey[] {
  return [...new Set(flags)];
}

export function isFlagPrefetchConfig(value: unknown): value is FlagPrefetchConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeConfig = value as Partial<FlagPrefetchConfig>;

  return Array.isArray(maybeConfig.flags);
}

export function isFlagRegistry(value: unknown): value is FlagRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isFlagDefinitionLike);
}

function extractPrefetchFlags(input: FlagPrefetchInput): readonly FlagKey[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (isFlagPrefetchConfig(input)) {
    return input.flags;
  }

  if (isFlagRegistry(input)) {
    return Object.values(input).map((definition) => definition.key);
  }

  return [];
}

function isFlagDefinitionLike(value: unknown): value is AnyFlagDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const definition = value as Partial<AnyFlagDefinition>;

  return typeof definition.key === 'string' && typeof definition.kind === 'string';
}