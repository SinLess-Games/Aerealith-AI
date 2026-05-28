import type { FlagEvaluationContext, FlagJsonValue } from './types';

/**
 * OpenFeature-compatible evaluation context value.
 *
 * This mirrors the shape OpenFeature SDKs expect:
 * - no `undefined`
 * - JSON-compatible primitive/object/array values
 * - mutable arrays/objects
 */
export type OpenFeatureContextValue =
  | string
  | number
  | boolean
  | null
  | OpenFeatureContextValue[]
  | { [key: string]: OpenFeatureContextValue };

export type OpenFeatureEvaluationContextLike = Record<
  string,
  OpenFeatureContextValue
>;

/**
 * Converts the shared Aerealith flag context into an OpenFeature-safe context.
 *
 * OpenFeature evaluation context is arbitrary contextual data used for
 * targeting/dynamic evaluation, but SDK context values must not contain
 * `undefined`. This adapter strips invalid values and normalizes Dates,
 * arrays, and objects before runtime-specific files pass context into the
 * server/web SDKs.
 */
export function toOpenFeatureEvaluationContext(
  context?: FlagEvaluationContext,
): OpenFeatureEvaluationContextLike | undefined {
  if (!context) {
    return undefined;
  }

  const normalized = normalizeOpenFeatureContextObject(context);

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeOpenFeatureContextObject(
  context: Record<string, unknown>,
): OpenFeatureEvaluationContextLike {
  return Object.fromEntries(
    Object.entries(context)
      .map(([key, value]) => {
        return [key, normalizeOpenFeatureContextValue(value)] as const;
      })
      .filter((entry): entry is readonly [string, OpenFeatureContextValue] => {
        return entry[1] !== undefined;
      }),
  );
}

export function normalizeOpenFeatureContextValue(
  value: unknown,
): OpenFeatureContextValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeOpenFeatureContextValue(item))
      .filter((item): item is OpenFeatureContextValue => {
        return item !== undefined;
      });
  }

  if (isPlainObject(value)) {
    return normalizeOpenFeatureContextObject(value);
  }

  return undefined;
}

export function isOpenFeatureContextValue(
  value: unknown,
): value is OpenFeatureContextValue {
  return normalizeOpenFeatureContextValue(value) !== undefined;
}

export function isOpenFeatureEvaluationContextLike(
  value: unknown,
): value is OpenFeatureEvaluationContextLike {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isOpenFeatureContextValue);
}

export function fromFlagJsonValue(
  value: FlagJsonValue,
): OpenFeatureContextValue {
  const normalized = normalizeOpenFeatureContextValue(value);

  if (normalized === undefined) {
    return null;
  }

  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}