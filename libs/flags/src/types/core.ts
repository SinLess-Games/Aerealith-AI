// libs/flags/src/types/core.ts

/**
 * Runtime-neutral shared feature flag types.
 *
 * Keep this file SDK-neutral:
 * - Do not import @openfeature/server-sdk here.
 * - Do not import @openfeature/web-sdk here.
 * - Do not import Hono here.
 */

export type FlagPrimitive = string | number | boolean | null;

/**
 * JSON-compatible feature flag value.
 *
 * This intentionally uses mutable arrays/objects instead of readonly
 * arrays/objects because OpenFeature SDK JSON types expect mutable
 * JsonArray/JsonObject-compatible structures.
 */
export type FlagJsonValue =
  | FlagPrimitive
  | FlagJsonValue[]
  | { [key: string]: FlagJsonValue };

export type FlagValue = boolean | string | number | FlagJsonValue;

export type FlagValueKind = 'boolean' | 'string' | 'number' | 'object';

export type FlagKey = string;

export type FlagProviderRuntime =
  | 'server'
  | 'client'
  | 'worker'
  | 'node'
  | 'browser'
  | 'hono'
  | 'testing';

export type FlagEnvironment =
  | 'local'
  | 'development'
  | 'preview'
  | 'staging'
  | 'production'
  | string;

export type FlagTargetingKey = string;

/**
 * OpenFeature-compatible evaluation context.
 *
 * `targetingKey` is the primary subject identifier used for targeting.
 * Additional attributes may be used by Flagship targeting rules.
 *
 * This package keeps the shared context type SDK-neutral. Runtime adapters
 * should sanitize this shape before passing it into an OpenFeature SDK.
 */
export type FlagEvaluationContext = {
  targetingKey?: FlagTargetingKey;

  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  organizationId?: string;
  workspaceId?: string;
  accountId?: string;

  email?: string;
  username?: string;
  role?: string;
  plan?: string;
  country?: string;
  locale?: string;
  environment?: FlagEnvironment;

  authenticated?: boolean;
  internal?: boolean;
  admin?: boolean;

  [attribute: string]: FlagJsonValue | undefined;
};

export type RequiredFlagEvaluationContext = FlagEvaluationContext & {
  targetingKey: FlagTargetingKey;
};

export type FlagContextInput = Partial<FlagEvaluationContext> & {
  targetingKey?: FlagTargetingKey;
};

export type BuildFlagContextOptions = {
  readonly fallbackTargetingKey?: FlagTargetingKey;
  readonly environment?: FlagEnvironment;
  readonly includeAnonymousContext?: boolean;
};

export type FlagDefaultValues = {
  readonly boolean: boolean;
  readonly string: string;
  readonly number: number;
  readonly object: FlagJsonValue;
};

export type FlagDefinition<TValue extends FlagValue = FlagValue> = {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly defaultValue: TValue;
  readonly description?: string;
  readonly owner?: string;
  readonly expiresAt?: string;
  readonly tags?: readonly string[];
};

export type BooleanFlagDefinition = FlagDefinition<boolean> & {
  readonly kind: 'boolean';
};

export type StringFlagDefinition = FlagDefinition<string> & {
  readonly kind: 'string';
};

export type NumberFlagDefinition = FlagDefinition<number> & {
  readonly kind: 'number';
};

export type ObjectFlagDefinition<TValue extends FlagJsonValue = FlagJsonValue> =
  FlagDefinition<TValue> & {
    readonly kind: 'object';
  };

export type AnyFlagDefinition =
  | BooleanFlagDefinition
  | StringFlagDefinition
  | NumberFlagDefinition
  | ObjectFlagDefinition;

export type FlagRegistry = Record<FlagKey, AnyFlagDefinition>;

export type FlagEvaluationOptions = {
  readonly context?: FlagEvaluationContext;
  readonly reason?: string;
  readonly details?: boolean;
};

export type FlagEvaluationResult<TValue extends FlagValue = FlagValue> = {
  readonly key: FlagKey;
  readonly value: TValue;
  readonly defaultValue: TValue;
  readonly kind: FlagValueKind;
  readonly context?: FlagEvaluationContext;
  readonly variant?: string;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

export type FlagEvaluationError = {
  readonly key: FlagKey;
  readonly message: string;
  readonly code?: string;
  readonly cause?: unknown;
};

export type OpenFeatureEvaluationDetails<TValue> = {
  readonly value: TValue;
  readonly flagKey?: string;
  readonly variant?: string;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

export type MutableFlagEvaluationContext = {
  [key: string]: FlagJsonValue | undefined;
};
