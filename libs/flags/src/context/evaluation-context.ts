// libs/flags/src/context/evaluation-context.ts

import {
  FLAGS_ANONYMOUS_TARGETING_PREFIX,
  FLAGS_CONTEXT_ATTRIBUTE_KEY_PATTERN,
  FLAGS_DEFAULT_ENVIRONMENT,
  FLAGS_HEADER_KEYS,
  FLAGS_SECURITY_LIMITS,
  FLAGS_TARGETING_SEPARATOR,
  FLAGS_USER_TARGETING_PREFIX,
} from '../constants';

import type {
  BuildFlagContextOptions,
  FlagContextInput,
  FlagEnvironment,
  FlagEvaluationContext,
  FlagJsonValue,
  FlagTargetingKey,
  MutableFlagEvaluationContext,
  RequiredFlagEvaluationContext,
} from '../types';

export type FlagHeadersLike = {
  readonly get: (key: string) => string | null | undefined;
};

export type FlagRequestLike = {
  readonly headers: FlagHeadersLike;
};

type CryptoLike = {
  readonly randomUUID?: () => string;
};

type RuntimeGlobal = typeof globalThis & {
  readonly crypto?: CryptoLike;
};

export function buildFlagEvaluationContext(
  input: FlagContextInput = {},
  options: BuildFlagContextOptions = {},
): FlagEvaluationContext {
  const sanitized = sanitizeFlagEvaluationContext(input);
  const environment = normalizeEnvironment(
    options.environment ?? sanitized.environment,
  );

  const targetingKey =
    normalizeTargetingKey(sanitized.targetingKey) ??
    normalizeTargetingKey(options.fallbackTargetingKey) ??
    buildTargetingKeyFromContext(sanitized) ??
    buildAnonymousTargetingKey(options.includeAnonymousContext);

  return removeUndefinedValues({
    ...sanitized,
    targetingKey,
    environment,
  });
}

export function buildRequiredFlagEvaluationContext(
  input: FlagContextInput = {},
  options: BuildFlagContextOptions = {},
): RequiredFlagEvaluationContext {
  const context = buildFlagEvaluationContext(input, options);

  if (!context.targetingKey) {
    throw new Error(
      'Feature flag evaluation context requires a targetingKey. Provide userId, anonymousId, sessionId, or fallbackTargetingKey.',
    );
  }

  return context as RequiredFlagEvaluationContext;
}

export function mergeFlagEvaluationContexts(
  ...contexts: readonly (FlagEvaluationContext | undefined | null)[]
): FlagEvaluationContext {
  const merged = contexts.reduce<MutableFlagEvaluationContext>(
    (accumulator, context) => {
      if (!context) {
        return accumulator;
      }

      return {
        ...accumulator,
        ...sanitizeFlagEvaluationContext(context),
      };
    },
    {},
  );

  return removeUndefinedValues(merged);
}

export function sanitizeFlagEvaluationContext(
  context: FlagContextInput | FlagEvaluationContext = {},
): FlagEvaluationContext {
  const sanitized: MutableFlagEvaluationContext = {};

  for (const [key, value] of Object.entries(context)) {
    const normalizedKey = normalizeContextAttributeKey(key);

    if (!normalizedKey) {
      continue;
    }

    const normalizedValue = normalizeContextValue(value);

    if (normalizedValue === undefined) {
      continue;
    }

    sanitized[normalizedKey] = normalizedValue;
  }

  return removeUndefinedValues(sanitized);
}

export function buildContextFromRequest(
  request: FlagRequestLike,
  input: FlagContextInput = {},
  options: BuildFlagContextOptions = {},
): FlagEvaluationContext {
  const headerContext = getFlagContextFromHeaders(request.headers);

  return buildFlagEvaluationContext(
    {
      ...headerContext,
      ...input,
    },
    options,
  );
}

export function getFlagContextFromHeaders(
  headers: FlagHeadersLike,
): FlagEvaluationContext {
  return sanitizeFlagEvaluationContext({
    targetingKey: getHeaderValue(headers, FLAGS_HEADER_KEYS.targetingKey),
    userId: getHeaderValue(headers, FLAGS_HEADER_KEYS.userId),
    anonymousId: getHeaderValue(headers, FLAGS_HEADER_KEYS.anonymousId),
    sessionId: getHeaderValue(headers, FLAGS_HEADER_KEYS.sessionId),
    organizationId: getHeaderValue(headers, FLAGS_HEADER_KEYS.organizationId),
    workspaceId: getHeaderValue(headers, FLAGS_HEADER_KEYS.workspaceId),
    plan: getHeaderValue(headers, FLAGS_HEADER_KEYS.plan),
    country: getHeaderValue(headers, FLAGS_HEADER_KEYS.country),
    locale: getHeaderValue(headers, FLAGS_HEADER_KEYS.locale),
    environment: getHeaderValue(headers, FLAGS_HEADER_KEYS.environment),
  });
}

export function requireFlagTargetingKey(
  context: FlagEvaluationContext,
): RequiredFlagEvaluationContext {
  if (!context.targetingKey) {
    throw new Error('Feature flag evaluation context is missing targetingKey.');
  }

  return context as RequiredFlagEvaluationContext;
}

export function hasFlagTargetingKey(
  context: FlagEvaluationContext | undefined | null,
): context is RequiredFlagEvaluationContext {
  return (
    typeof context?.targetingKey === 'string' &&
    context.targetingKey.trim().length > 0
  );
}

export function buildUserTargetingKey(userId: string): FlagTargetingKey {
  return joinTargetingKeyParts(FLAGS_USER_TARGETING_PREFIX, userId);
}

export function buildAnonymousTargetingKey(
  includeAnonymousContext = true,
): FlagTargetingKey | undefined {
  if (!includeAnonymousContext) {
    return undefined;
  }

  return joinTargetingKeyParts(
    FLAGS_ANONYMOUS_TARGETING_PREFIX,
    createStableRandomId(),
  );
}

export function joinTargetingKeyParts(
  prefix: string,
  value: string | number | boolean,
): FlagTargetingKey {
  return `${String(prefix).trim()}${FLAGS_TARGETING_SEPARATOR}${String(
    value,
  ).trim()}`;
}

export function normalizeTargetingKey(
  targetingKey: unknown,
): FlagTargetingKey | undefined {
  if (typeof targetingKey !== 'string') {
    return undefined;
  }

  const normalized = targetingKey.trim();

  if (!normalized) {
    return undefined;
  }

  return truncateString(
    normalized,
    FLAGS_SECURITY_LIMITS.maxContextStringValueLength,
  );
}

export function normalizeEnvironment(environment: unknown): FlagEnvironment {
  if (typeof environment !== 'string') {
    return FLAGS_DEFAULT_ENVIRONMENT;
  }

  const normalized = environment.trim();

  if (!normalized) {
    return FLAGS_DEFAULT_ENVIRONMENT;
  }

  return truncateString(
    normalized,
    FLAGS_SECURITY_LIMITS.maxContextStringValueLength,
  );
}

export function normalizeContextAttributeKey(key: unknown): string | undefined {
  if (typeof key !== 'string') {
    return undefined;
  }

  const normalized = key.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length > FLAGS_SECURITY_LIMITS.maxContextAttributeKeyLength) {
    return undefined;
  }

  if (!FLAGS_CONTEXT_ATTRIBUTE_KEY_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export function normalizeContextValue(
  value: unknown,
): FlagJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return truncateString(
      value.trim(),
      FLAGS_SECURITY_LIMITS.maxContextStringValueLength,
    );
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeContextValue(item))
      .filter((item): item is FlagJsonValue => item !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [
          normalizeContextAttributeKey(entryKey),
          normalizeContextValue(entryValue),
        ])
        .filter(
          (entry): entry is [string, FlagJsonValue] =>
            typeof entry[0] === 'string' && entry[1] !== undefined,
        ),
    );
  }

  return undefined;
}

export function getContextAttribute<
  TValue extends FlagJsonValue = FlagJsonValue,
>(
  context: FlagEvaluationContext,
  key: string,
): TValue | undefined {
  return context[key] as TValue | undefined;
}

export function setContextAttribute(
  context: FlagEvaluationContext,
  key: string,
  value: unknown,
): FlagEvaluationContext {
  const normalizedKey = normalizeContextAttributeKey(key);
  const normalizedValue = normalizeContextValue(value);

  if (!normalizedKey || normalizedValue === undefined) {
    return context;
  }

  return {
    ...context,
    [normalizedKey]: normalizedValue,
  };
}

export function removeContextAttribute(
  context: FlagEvaluationContext,
  key: string,
): FlagEvaluationContext {
  const normalizedKey = normalizeContextAttributeKey(key);

  if (!normalizedKey) {
    return context;
  }

  const nextContext: MutableFlagEvaluationContext = {
    ...context,
  };

  delete nextContext[normalizedKey];

  return removeUndefinedValues(nextContext);
}

export function isFlagEvaluationContext(
  value: unknown,
): value is FlagEvaluationContext {
  return isPlainObject(value);
}

function buildTargetingKeyFromContext(
  context: FlagEvaluationContext,
): FlagTargetingKey | undefined {
  if (context.targetingKey) {
    return normalizeTargetingKey(context.targetingKey);
  }

  if (context.userId) {
    return buildUserTargetingKey(String(context.userId));
  }

  if (context.anonymousId) {
    return joinTargetingKeyParts(
      FLAGS_ANONYMOUS_TARGETING_PREFIX,
      String(context.anonymousId),
    );
  }

  if (context.sessionId) {
    return joinTargetingKeyParts('session', String(context.sessionId));
  }

  return undefined;
}

function getHeaderValue(
  headers: FlagHeadersLike,
  key: string,
): string | undefined {
  const value = headers.get(key);

  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function removeUndefinedValues<TContext extends MutableFlagEvaluationContext>(
  context: TContext,
): FlagEvaluationContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  ) as FlagEvaluationContext;
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function createStableRandomId(): string {
  const runtime = globalThis as RuntimeGlobal;

  if (runtime.crypto?.randomUUID) {
    return runtime.crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
