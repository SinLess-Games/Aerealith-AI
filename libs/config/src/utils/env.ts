export type EnvPrimitive = string | number | boolean | null | undefined;

export type EnvRecord = Record<string, unknown>;

export type EnvStringOptions = {
  trim?: boolean;
  emptyAsUndefined?: boolean;
};

export type EnvNumberOptions = EnvStringOptions & {
  min?: number;
  max?: number;
};

export type EnvBooleanOptions = EnvStringOptions & {
  trueValues?: readonly string[];
  falseValues?: readonly string[];
};

export type EnvListOptions = EnvStringOptions & {
  separator?: string | RegExp;
  unique?: boolean;
};

export type EnvJsonOptions = EnvStringOptions;

export type EnvPathMapping = {
  env: string | readonly string[];
  path: string;
  transform?: (value: string) => unknown;
};

export class MissingEnvVarError extends Error {
  public override readonly name = "MissingEnvVarError";

  public readonly key: string;

  public constructor(key: string) {
    super(`Required environment variable "${key}" is missing.`);
    this.key = key;
  }
}

export class InvalidEnvVarError extends Error {
  public override readonly name = "InvalidEnvVarError";

  public readonly key: string;

  public readonly value: string;

  public constructor(key: string, value: string, reason: string) {
    super(`Environment variable "${key}" is invalid: ${reason}`);
    this.key = key;
    this.value = value;
  }
}

export const DEFAULT_TRUE_VALUES: readonly string[] = [
  "1",
  "true",
  "t",
  "yes",
  "y",
  "on",
  "enabled",
];

export const DEFAULT_FALSE_VALUES: readonly string[] = [
  "0",
  "false",
  "f",
  "no",
  "n",
  "off",
  "disabled",
];

export function normalizeEnvValue(
  value: unknown,
  options: EnvStringOptions = {},
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }

  const trim = options.trim ?? true;
  const emptyAsUndefined = options.emptyAsUndefined ?? true;

  const normalized = trim ? String(value).trim() : String(value);

  if (emptyAsUndefined && normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

export function hasEnv(env: EnvRecord, key: string): boolean {
  return normalizeEnvValue(env[key]) !== undefined;
}

export function getEnv(
  env: EnvRecord,
  key: string,
  options: EnvStringOptions = {},
): string | undefined {
  return normalizeEnvValue(env[key], options);
}

export function getRequiredEnv(
  env: EnvRecord,
  key: string,
  options: EnvStringOptions = {},
): string {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function getFirstEnv(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): string | undefined {
  for (const key of keys) {
    const value = getEnv(env, key, options);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function getRequiredFirstEnv(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): string {
  const value = getFirstEnv(env, keys, options);

  if (value !== undefined) {
    return value;
  }

  throw new MissingEnvVarError(keys.join(" | "));
}

export function getEnvBoolean(
  env: EnvRecord,
  key: string,
  options: EnvBooleanOptions = {},
): boolean | undefined {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  const trueValues = options.trueValues ?? DEFAULT_TRUE_VALUES;
  const falseValues = options.falseValues ?? DEFAULT_FALSE_VALUES;

  if (trueValues.includes(normalized)) {
    return true;
  }

  if (falseValues.includes(normalized)) {
    return false;
  }

  throw new InvalidEnvVarError(
    key,
    value,
    `expected boolean-like value: ${[...trueValues, ...falseValues].join(
      ", ",
    )}`,
  );
}

export function getRequiredEnvBoolean(
  env: EnvRecord,
  key: string,
  options: EnvBooleanOptions = {},
): boolean {
  const value = getEnvBoolean(env, key, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function getEnvNumber(
  env: EnvRecord,
  key: string,
  options: EnvNumberOptions = {},
): number | undefined {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new InvalidEnvVarError(key, value, "expected a finite number");
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new InvalidEnvVarError(
      key,
      value,
      `expected a number greater than or equal to ${options.min}`,
    );
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new InvalidEnvVarError(
      key,
      value,
      `expected a number less than or equal to ${options.max}`,
    );
  }

  return parsed;
}

export function getRequiredEnvNumber(
  env: EnvRecord,
  key: string,
  options: EnvNumberOptions = {},
): number {
  const value = getEnvNumber(env, key, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function getEnvInteger(
  env: EnvRecord,
  key: string,
  options: EnvNumberOptions = {},
): number | undefined {
  const value = getEnvNumber(env, key, options);

  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new InvalidEnvVarError(key, String(value), "expected an integer");
  }

  return value;
}

export function getRequiredEnvInteger(
  env: EnvRecord,
  key: string,
  options: EnvNumberOptions = {},
): number {
  const value = getEnvInteger(env, key, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function getEnvList(
  env: EnvRecord,
  key: string,
  options: EnvListOptions = {},
): string[] {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    return [];
  }

  const separator = options.separator ?? ",";
  const unique = options.unique ?? true;

  const values = value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (!unique) {
    return values;
  }

  return [...new Set(values)];
}

export function getEnvJson<T>(
  env: EnvRecord,
  key: string,
  options: EnvJsonOptions = {},
): T | undefined {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new InvalidEnvVarError(key, value, "expected valid JSON");
  }
}

export function getRequiredEnvJson<T>(
  env: EnvRecord,
  key: string,
  options: EnvJsonOptions = {},
): T {
  const value = getEnvJson<T>(env, key, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function getEnvOneOf<TValue extends string>(
  env: EnvRecord,
  key: string,
  allowedValues: readonly TValue[],
  options: EnvStringOptions = {},
): TValue | undefined {
  const value = getEnv(env, key, options);

  if (value === undefined) {
    return undefined;
  }

  if (!allowedValues.includes(value as TValue)) {
    throw new InvalidEnvVarError(
      key,
      value,
      `expected one of: ${allowedValues.join(", ")}`,
    );
  }

  return value as TValue;
}

export function getRequiredEnvOneOf<TValue extends string>(
  env: EnvRecord,
  key: string,
  allowedValues: readonly TValue[],
  options: EnvStringOptions = {},
): TValue {
  const value = getEnvOneOf(env, key, allowedValues, options);

  if (value === undefined) {
    throw new MissingEnvVarError(key);
  }

  return value;
}

export function pickEnv(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = getEnv(env, key, options);

      if (value === undefined) {
        return [];
      }

      return [[key, value]];
    }),
  );
}

export function requireEnvKeys(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => [key, getRequiredEnv(env, key, options)]),
  );
}

export function getMissingEnvKeys(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): string[] {
  return keys.filter((key) => getEnv(env, key, options) === undefined);
}

export function assertEnvKeys(
  env: EnvRecord,
  keys: readonly string[],
  options: EnvStringOptions = {},
): void {
  const missingKeys = getMissingEnvKeys(env, keys, options);

  if (missingKeys.length > 0) {
    throw new MissingEnvVarError(missingKeys.join(", "));
  }
}

export function mergeEnvRecords(
  ...envRecords: readonly EnvRecord[]
): Record<string, unknown> {
  return Object.assign({}, ...envRecords);
}

export function filterEnvByPrefix(
  env: EnvRecord,
  prefix: string,
  options: EnvStringOptions = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) => {
      if (!key.startsWith(prefix)) {
        return [];
      }

      const normalized = normalizeEnvValue(value, options);

      if (normalized === undefined) {
        return [];
      }

      return [[key, normalized]];
    }),
  );
}

export function stripEnvPrefix(
  env: Record<string, string>,
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      if (!key.startsWith(prefix)) {
        return [key, value];
      }

      return [key.slice(prefix.length), value];
    }),
  );
}

export function getPublicEnv(
  env: EnvRecord,
  options: EnvStringOptions = {},
): Record<string, string> {
  return {
    ...filterEnvByPrefix(env, "NEXT_PUBLIC_", options),
    ...filterEnvByPrefix(env, "PUBLIC_", options),
  };
}

export function isPublicEnvKey(key: string): boolean {
  return key.startsWith("NEXT_PUBLIC_") || key.startsWith("PUBLIC_");
}

export function isCloudflareEnv(env: EnvRecord): boolean {
  return (
    hasEnv(env, "CF_PAGES") ||
    hasEnv(env, "CF_PAGES_BRANCH") ||
    hasEnv(env, "CF_PAGES_COMMIT_SHA") ||
    hasEnv(env, "CLOUDFLARE_ACCOUNT_ID") ||
    hasEnv(env, "CLOUDFLARE_API_TOKEN")
  );
}

export function isProductionEnv(env: EnvRecord): boolean {
  const value =
    getFirstEnv(env, ["APP_ENV", "NODE_ENV", "ENVIRONMENT"]) ?? "development";

  return value === "production";
}

export function isPreviewEnv(env: EnvRecord): boolean {
  const value =
    getFirstEnv(env, ["APP_ENV", "VERCEL_ENV", "CF_PAGES_BRANCH"]) ??
    "development";

  return value === "preview";
}

export function resolveAppEnvironment(
  env: EnvRecord,
): "development" | "preview" | "staging" | "production" | "test" {
  const value =
    getFirstEnv(env, ["APP_ENV", "NODE_ENV", "ENVIRONMENT"]) ?? "development";

  if (value === "production") {
    return "production";
  }

  if (value === "preview") {
    return "preview";
  }

  if (value === "staging") {
    return "staging";
  }

  if (value === "test") {
    return "test";
  }

  return "development";
}

export function envToPlainRecord(
  env: EnvRecord,
  options: EnvStringOptions = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) => {
      const normalized = normalizeEnvValue(value, options);

      if (normalized === undefined) {
        return [];
      }

      return [[key, normalized]];
    }),
  );
}

export function mapEnvToObject(
  env: EnvRecord,
  mappings: readonly EnvPathMapping[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const keys = Array.isArray(mapping.env) ? mapping.env : [mapping.env];
    const value = getFirstEnv(env, keys);

    if (value === undefined) {
      continue;
    }

    setObjectPath(output, mapping.path, mapping.transform?.(value) ?? value);
  }

  return output;
}

export function setObjectPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return;
  }

  let cursor: Record<string, unknown> = target;

  for (const segment of segments.slice(0, -1)) {
    if (isUnsafePathSegment(segment)) {
      return;
    }

    const existing = cursor[segment];

    if (!isPlainObject(existing)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leafSegment = segments[segments.length - 1];

  if (leafSegment === undefined || isUnsafePathSegment(leafSegment)) {
    return;
  }

  cursor[leafSegment] = value;
}

export function parseEnvBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (DEFAULT_TRUE_VALUES.includes(normalized)) {
    return true;
  }

  if (DEFAULT_FALSE_VALUES.includes(normalized)) {
    return false;
  }

  throw new InvalidEnvVarError(
    "<inline>",
    value,
    `expected boolean-like value: ${[
      ...DEFAULT_TRUE_VALUES,
      ...DEFAULT_FALSE_VALUES,
    ].join(", ")}`,
  );
}

export function parseEnvNumber(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new InvalidEnvVarError("<inline>", value, "expected a finite number");
  }

  return parsed;
}

export function parseEnvInteger(value: string): number {
  const parsed = parseEnvNumber(value);

  if (!Number.isInteger(parsed)) {
    throw new InvalidEnvVarError("<inline>", value, "expected an integer");
  }

  return parsed;
}

export function parseEnvList(
  value: string,
  options: Omit<EnvListOptions, "trim" | "emptyAsUndefined"> = {},
): string[] {
  const separator = options.separator ?? ",";
  const unique = options.unique ?? true;

  const values = value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (!unique) {
    return values;
  }

  return [...new Set(values)];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnsafePathSegment(segment: string): boolean {
  return (
    segment === "__proto__" ||
    segment === "prototype" ||
    segment === "constructor"
  );
}
