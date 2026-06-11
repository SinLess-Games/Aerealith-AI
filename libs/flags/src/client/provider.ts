// libs/flags/src/client/provider.ts

import { FlagshipClientProvider } from '@cloudflare/flagship/web';
import {
  OpenFeature,
  type EvaluationContext,
  type Provider,
} from '@openfeature/web-sdk';

import {
  FLAGS_ENV_KEYS,
  FLAGS_ERROR_CODES,
  FLAGS_PROVIDER_NAME,
} from '../constants';

import {
  buildFlagEvaluationContext,
  mergeFlagEvaluationContexts,
} from '../context';

import { toOpenFeatureEvaluationContext } from '../openfeature-context';

import type {
  CreateFlagshipClientProviderOptions,
  CreateFlagshipClientProviderResult,
  FlagEvaluationContext,
  FlagKey,
  FlagPrefetchInput,
  FlagshipClientProviderEnv,
  FlagshipClientProviderOptions,
  FlagshipRemoteCredentials,
  InitializedFlagshipClientProvider,
  InitializeFlagshipClientProviderOptions,
} from '../types';

import {
  createFlagPrefetchConfig,
  normalizePrefetchFlags,
} from './prefetch';

export class FlagshipClientProviderError extends Error {
  public override readonly name = 'FlagshipClientProviderError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

let initializationPromise:
  | Promise<InitializedFlagshipClientProvider>
  | undefined;

let initializedProvider: InitializedFlagshipClientProvider | undefined;

export function createFlagshipClientProvider(
  options: CreateFlagshipClientProviderOptions,
): CreateFlagshipClientProviderResult {
  assertValidFlagshipClientProviderOptions(options);

  const providerName = normalizeClientProviderName(options.providerName);
  const credentials = normalizeClientRemoteCredentials(options);
  const prefetchFlags = createFlagPrefetchConfig(options.prefetchFlags, {
    required: true,
    ...options.prefetch,
  }).flags;

  const provider = new FlagshipClientProvider({
    ...credentials,
    prefetchFlags: [...prefetchFlags],
  });

  return {
    provider,
    providerName,
    prefetchFlags,
    cacheKey: createClientProviderCacheKey({
      providerName,
      credentials,
      prefetchFlags,
    }),
  };
}

export async function initializeFlagshipClientProvider(
  options: InitializeFlagshipClientProviderOptions,
): Promise<InitializedFlagshipClientProvider> {
  const providerResult = createFlagshipClientProvider(options);

  if (
    initializedProvider &&
    initializedProvider.cacheKey === providerResult.cacheKey &&
    !options.force
  ) {
    if (options.context) {
      await setFlagshipClientContext(options.context);
    }

    return initializedProvider;
  }

  if (initializationPromise && !options.force) {
    return initializationPromise;
  }

  initializationPromise = OpenFeature.setProviderAndWait(
    providerResult.provider as unknown as Provider,
  )
    .then(async () => {
      const context = options.context
        ? buildFlagEvaluationContext(options.context)
        : undefined;

      if (context) {
        await setFlagshipClientContext(context);
      }

      initializedProvider = {
        ...providerResult,
        context,
        initialized: true,
      };

      return initializedProvider;
    })
    .catch((error: unknown) => {
      initializationPromise = undefined;
      initializedProvider = undefined;

      throw new FlagshipClientProviderError(
        FLAGS_ERROR_CODES.providerInitializationFailed,
        'Failed to initialize the Cloudflare Flagship client provider.',
        error,
      );
    });

  return initializationPromise;
}

export async function setFlagshipClientContext(
  context: FlagEvaluationContext,
): Promise<FlagEvaluationContext> {
  const nextContext = buildFlagEvaluationContext(context);

  await OpenFeature.setContext(toSdkEvaluationContext(nextContext));

  if (initializedProvider) {
    initializedProvider = {
      ...initializedProvider,
      context: nextContext,
    };
  }

  return nextContext;
}

export async function mergeFlagshipClientContext(
  context: FlagEvaluationContext,
): Promise<FlagEvaluationContext> {
  const currentContext = getInitializedFlagshipClientContext();

  return setFlagshipClientContext(
    mergeFlagEvaluationContexts(currentContext, context),
  );
}

export function getInitializedFlagshipClientProvider():
  | InitializedFlagshipClientProvider
  | undefined {
  return initializedProvider;
}

export function getInitializedFlagshipClientContext():
  | FlagEvaluationContext
  | undefined {
  return initializedProvider?.context;
}

export function isFlagshipClientProviderInitialized(): boolean {
  return Boolean(initializedProvider);
}

export function getInitializedPrefetchFlags(): readonly FlagKey[] {
  return initializedProvider?.prefetchFlags ?? [];
}

export function assertFlagshipClientProviderInitialized(): void {
  if (!initializedProvider) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.missingProvider,
      'Cloudflare Flagship client provider has not been initialized. Call initializeFlagshipClientProvider() before evaluating browser flags.',
    );
  }
}

export function resetFlagshipClientProviderState(): void {
  initializationPromise = undefined;
  initializedProvider = undefined;
}

export function getFlagshipClientProviderOptionsFromEnv(
  env: FlagshipClientProviderEnv,
  prefetchFlags: FlagPrefetchInput,
  overrides: Partial<FlagshipClientProviderOptions> = {},
): FlagshipClientProviderOptions {
  const credentials = {
    appId: requireClientEnvString(env, FLAGS_ENV_KEYS.appId),
    accountId: requireClientEnvString(env, FLAGS_ENV_KEYS.accountId),
    authToken: requireClientEnvString(env, FLAGS_ENV_KEYS.authToken),
  };

  return {
    ...credentials,
    providerName:
      overrides.providerName ??
      readClientEnvString(env, FLAGS_ENV_KEYS.providerName),
    prefetchFlags: normalizePrefetchFlags(
      overrides.prefetchFlags ?? prefetchFlags,
    ),
    context: overrides.context,
    hooks: overrides.hooks,
  };
}

export function assertValidFlagshipClientProviderOptions(
  options: Partial<FlagshipClientProviderOptions>,
): asserts options is FlagshipClientProviderOptions {
  if (!isRecord(options)) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Flagship client provider options are required.',
    );
  }

  if (!hasClientRemoteCredentials(options)) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Flagship client provider requires appId, accountId, and authToken.',
    );
  }

  const prefetchFlags = normalizePrefetchFlags(options.prefetchFlags);

  if (prefetchFlags.length === 0) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.flagNotFound,
      'Flagship client provider requires at least one prefetch flag.',
    );
  }
}

export function hasClientRemoteCredentials(
  options: Partial<FlagshipClientProviderOptions>,
): options is FlagshipClientProviderOptions & FlagshipRemoteCredentials {
  return (
    hasNonEmptyString(options.appId) &&
    hasNonEmptyString(options.accountId) &&
    hasNonEmptyString(options.authToken)
  );
}

export function normalizeClientRemoteCredentials(
  options: Partial<FlagshipClientProviderOptions>,
): FlagshipRemoteCredentials {
  if (!hasClientRemoteCredentials(options)) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Client Flagship credentials require appId, accountId, and authToken.',
    );
  }

  return {
    appId: options.appId.trim(),
    accountId: options.accountId.trim(),
    authToken: options.authToken.trim(),
  };
}

export function normalizeClientProviderName(providerName?: string): string {
  const normalized = providerName?.trim();

  return normalized && normalized.length > 0 ? normalized : FLAGS_PROVIDER_NAME;
}

function toSdkEvaluationContext(
  context: FlagEvaluationContext,
): EvaluationContext {
  return toOpenFeatureEvaluationContext(context) as EvaluationContext;
}

function createClientProviderCacheKey(input: {
  readonly providerName: string;
  readonly credentials: FlagshipRemoteCredentials;
  readonly prefetchFlags: readonly FlagKey[];
}): string {
  return [
    input.providerName,
    'client',
    input.credentials.appId,
    input.credentials.accountId,
    input.prefetchFlags.join(','),
  ].join(':');
}

function requireClientEnvString(
  env: FlagshipClientProviderEnv,
  key: string,
): string {
  const value = readClientEnvString(env, key);

  if (!value) {
    throw new FlagshipClientProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      `Missing required Flagship client environment variable: ${key}.`,
    );
  }

  return value;
}

function readClientEnvString(
  env: FlagshipClientProviderEnv,
  key: string,
): string | undefined {
  const value = env[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
