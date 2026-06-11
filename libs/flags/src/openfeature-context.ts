// libs/flags/src/openfeature-context.ts

import type { FlagEvaluationContext, FlagJsonValue } from './types';

export type OpenFeatureContextPrimitive = string | number | boolean | null;

export type OpenFeatureContextValue =
  | OpenFeatureContextPrimitive
  | OpenFeatureContextValue[]
  | { [key: string]: OpenFeatureContextValue };

export type OpenFeatureEvaluationContextLike = {
  [key: string]: OpenFeatureContextValue;
};

export function toOpenFeatureEvaluationContext(
  context?: FlagEvaluationContext,
): OpenFeatureEvaluationContextLike | undefined {
  if (!context) {
    return undefined;
  }

  const normalized = normalizeOpenFeatureContextObject(context);

  if (Object.keys(normalized).length === 0) {
    return undefined;
  }

  return normalized;
}

export function normalizeOpenFeatureContextObject(
  context: Record<string, unknown>,
): OpenFeatureEvaluationContextLike {
  const normalized: OpenFeatureEvaluationContextLike = {};

  for (const [key, value] of Object.entries(context)) {
    const normalizedValue = normalizeOpenFeatureContextValue(value);

    if (normalizedValue === undefined) {
      continue;
    }

    normalized[key] = normalizedValue;
  }

  return normalized;
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
    return normalizeOpenFeatureContextArray(value);
  }

  if (isPlainObject(value)) {
    return normalizeOpenFeatureContextObject(value);
  }

  return undefined;
}

export function normalizeOpenFeatureContextArray(
  values: readonly unknown[],
): OpenFeatureContextValue[] {
  const normalized: OpenFeatureContextValue[] = [];

  for (const value of values) {
    const normalizedValue = normalizeOpenFeatureContextValue(value);

    if (normalizedValue === undefined) {
      continue;
    }

    normalized.push(normalizedValue);
  }

  return normalized;
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

  return normalized ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
