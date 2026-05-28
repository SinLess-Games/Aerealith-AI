/**
 * Shared feature flag types for @aerealith-ai/flags.
 *
 * Keep this file runtime-neutral:
 * - Do not import @openfeature/server-sdk here.
 * - Do not import @openfeature/web-sdk here.
 * - Do not import Hono here.
 *
 * Runtime-specific files can adapt these shared types to the matching SDK.
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

/**
 * Cloudflare Worker Flagship binding.
 *
 * Kept as unknown on purpose so this package does not require Worker-only
 * generated Env types in shared files.
 */
export type CloudflareFlagshipBinding = unknown;

export type FlagshipRemoteCredentials = {
  readonly appId: string;
  readonly accountId: string;
  readonly authToken: string;
};

export type FlagshipBindingCredentials = {
  readonly binding: CloudflareFlagshipBinding;
};

export type FlagshipServerCredentials =
  | FlagshipRemoteCredentials
  | FlagshipBindingCredentials;

export type FlagshipServerProviderOptions = FlagshipServerCredentials & {
  readonly providerName?: string;
  readonly hooks?: FlagHookOptions;
};

export type FlagshipClientProviderOptions = FlagshipRemoteCredentials & {
  readonly providerName?: string;
  readonly prefetchFlags: readonly FlagKey[];
  readonly context?: FlagEvaluationContext;
  readonly hooks?: FlagHookOptions;
};

export type FlagshipProviderOptions =
  | FlagshipServerProviderOptions
  | FlagshipClientProviderOptions;

export type FlagHookOptions = {
  readonly logging?: boolean;
  readonly telemetry?: boolean;
};

export type FlagClientMode = 'async' | 'sync';

export type FlagClientBase = {
  readonly runtime: FlagProviderRuntime;
  readonly mode: FlagClientMode;
};

export type AsyncFlagClient = FlagClientBase & {
  readonly mode: 'async';

  readonly getBooleanValue: (
    key: FlagKey,
    defaultValue: boolean,
    context?: FlagEvaluationContext,
  ) => Promise<boolean>;

  readonly getStringValue: (
    key: FlagKey,
    defaultValue: string,
    context?: FlagEvaluationContext,
  ) => Promise<string>;

  readonly getNumberValue: (
    key: FlagKey,
    defaultValue: number,
    context?: FlagEvaluationContext,
  ) => Promise<number>;

  readonly getObjectValue: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => Promise<TValue>;
};

export type SyncFlagClient = FlagClientBase & {
  readonly mode: 'sync';

  readonly getBooleanValue: (
    key: FlagKey,
    defaultValue: boolean,
    context?: FlagEvaluationContext,
  ) => boolean;

  readonly getStringValue: (
    key: FlagKey,
    defaultValue: string,
    context?: FlagEvaluationContext,
  ) => string;

  readonly getNumberValue: (
    key: FlagKey,
    defaultValue: number,
    context?: FlagEvaluationContext,
  ) => number;

  readonly getObjectValue: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => TValue;
};

export type AnyFlagClient = AsyncFlagClient | SyncFlagClient;

export type ServerFlagEvaluator = {
  readonly boolean: (
    key: FlagKey,
    defaultValue?: boolean,
    context?: FlagEvaluationContext,
  ) => Promise<boolean>;

  readonly string: (
    key: FlagKey,
    defaultValue?: string,
    context?: FlagEvaluationContext,
  ) => Promise<string>;

  readonly number: (
    key: FlagKey,
    defaultValue?: number,
    context?: FlagEvaluationContext,
  ) => Promise<number>;

  readonly object: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => Promise<TValue>;
};

export type ClientFlagEvaluator = {
  readonly boolean: (
    key: FlagKey,
    defaultValue?: boolean,
    context?: FlagEvaluationContext,
  ) => boolean;

  readonly string: (
    key: FlagKey,
    defaultValue?: string,
    context?: FlagEvaluationContext,
  ) => string;

  readonly number: (
    key: FlagKey,
    defaultValue?: number,
    context?: FlagEvaluationContext,
  ) => number;

  readonly object: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => TValue;
};

export type HonoFlagVariables = {
  readonly flags: ServerFlagEvaluator;
  readonly flagContext: FlagEvaluationContext;
};

export type HonoFlagMiddlewareOptions = {
  readonly provider?: FlagshipServerProviderOptions;
  readonly context?: FlagEvaluationContext;
  readonly getContext?: (input: HonoFlagContextFactoryInput) => FlagEvaluationContext;
};

export type HonoFlagContextFactoryInput = {
  readonly request: Request;
  readonly env?: unknown;
  readonly executionContext?: unknown;
};

export type FlagPrefetchConfig = {
  readonly flags: readonly FlagKey[];
};

export type FlagBootstrapPayload = {
  readonly context?: FlagEvaluationContext;
  readonly prefetchFlags?: readonly FlagKey[];
  readonly values?: Partial<Record<FlagKey, FlagValue>>;
};

export type FlagLogger = {
  readonly debug?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly info?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error?: (message: string, metadata?: Record<string, unknown>) => void;
};

export type FlagTelemetryEvent = {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly runtime: FlagProviderRuntime;
  readonly durationMs?: number;
  readonly context?: FlagEvaluationContext;
  readonly success: boolean;
  readonly error?: FlagEvaluationError;
};

export type FlagTelemetryReporter = {
  readonly report: (event: FlagTelemetryEvent) => void | Promise<void>;
};

export type MockFlagValues = Partial<Record<FlagKey, FlagValue>>;

export type MockFlagProviderOptions = {
  readonly values?: MockFlagValues;
  readonly defaultValues?: Partial<FlagDefaultValues>;
  readonly context?: FlagEvaluationContext;
};