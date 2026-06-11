// libs/flags/src/server/provider.ts

import {
  FlagshipServerProvider,
  type FlagshipBinding,
} from '@cloudflare/flagship/server';
import { OpenFeature, type Provider } from '@openfeature/server-sdk';

import {
  FLAGS_ENV_KEYS,
  FLAGS_ERROR_CODES,
  FLAGS_FLAGSHIP_APP_ID,
  FLAGS_OPENFEATURE_DOMAINS,
  FLAGS_PROVIDER_NAME,
  FLAGS_WORKER_BINDING_KEYS,
} from '../constants';

import type {
  CloudflareFlagshipBinding,
  CreateFlagshipServerProviderResult,
  FlagshipRemoteCredentials,
  FlagshipServerProviderCredentialsMode,
  FlagshipServerProviderDomain,
  FlagshipServerProviderEnv,
  FlagshipServerProviderOptions,
  InitializedFlagshipServerProvider,
  InitializeFlagshipServerProviderOptions,
} from '../types';

export class FlagshipServerProviderError extends Error {
  public override readonly name = 'FlagshipServerProviderError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

let initializationPromise:
  | Promise<InitializedFlagshipServerProvider>
  | undefined;

let initializedProvider: InitializedFlagshipServerProvider | undefined;

export function createFlagshipServerProvider(
  options: FlagshipServerProviderOptions,
): CreateFlagshipServerProviderResult {
  assertValidFlagshipServerProviderOptions(options);

  const providerName = normalizeProviderName(options.providerName);
  const credentialsMode = getCredentialsMode(options);
  const cacheKey = createProviderCacheKey(options, providerName);

  if (hasBindingCredentials(options)) {
    return {
      provider: new FlagshipServerProvider({
        binding: options.binding as FlagshipBinding,
      }),
      providerName,
      credentialsMode,
      cacheKey,
    };
  }

  const credentials = normalizeRemoteCredentials(options);

  return {
    provider: new FlagshipServerProvider(credentials),
    providerName,
    credentialsMode,
    cacheKey,
  };
}

export async function initializeFlagshipServerProvider(
  options: InitializeFlagshipServerProviderOptions,
): Promise<InitializedFlagshipServerProvider> {
  const providerResult = createFlagshipServerProvider(options);
  const domain = normalizeProviderDomain(options.domain);
  const cacheKey = createInitializationCacheKey(providerResult.cacheKey, domain);

  if (
    initializedProvider &&
    initializedProvider.cacheKey === cacheKey &&
    initializedProvider.domain === domain &&
    !options.force
  ) {
    return initializedProvider;
  }

  if (initializationPromise && !options.force) {
    return initializationPromise;
  }

  initializationPromise = registerFlagshipServerProvider(
    providerResult.provider,
    domain,
  )
    .then(() => {
      initializedProvider = {
        ...providerResult,
        cacheKey,
        domain,
        initialized: true,
      };

      return initializedProvider;
    })
    .catch((error: unknown) => {
      initializationPromise = undefined;
      initializedProvider = undefined;

      throw new FlagshipServerProviderError(
        FLAGS_ERROR_CODES.providerInitializationFailed,
        'Failed to initialize the Cloudflare Flagship server provider.',
        error,
      );
    });

  return initializationPromise;
}

export function getInitializedFlagshipServerProvider():
  | InitializedFlagshipServerProvider
  | undefined {
  return initializedProvider;
}

export function isFlagshipServerProviderInitialized(): boolean {
  return Boolean(initializedProvider);
}

export async function resetFlagshipServerProvider(): Promise<void> {
  initializationPromise = undefined;
  initializedProvider = undefined;

  await OpenFeature.close();
}

export function getFlagshipServerProviderOptionsFromEnv(
  env: FlagshipServerProviderEnv,
  overrides: Partial<FlagshipServerProviderOptions> = {},
): FlagshipServerProviderOptions {
  const binding = env[FLAGS_WORKER_BINDING_KEYS.flagship];

  if (binding) {
    return {
      binding,
      providerName:
        readString(env, FLAGS_ENV_KEYS.providerName) ??
        readProviderNameOverride(overrides),
      hooks: overrides.hooks,
    };
  }

  const appId = readString(env, FLAGS_ENV_KEYS.appId) ?? FLAGS_FLAGSHIP_APP_ID;

  if (!appId) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      `Missing required Flagship environment variable: ${FLAGS_ENV_KEYS.appId}.`,
    );
  }

  return {
    appId,
    accountId: requireEnvString(env, FLAGS_ENV_KEYS.accountId),
    authToken: requireEnvString(env, FLAGS_ENV_KEYS.authToken),
    providerName:
      readString(env, FLAGS_ENV_KEYS.providerName) ??
      readProviderNameOverride(overrides),
    hooks: overrides.hooks,
  };
}

export function assertValidFlagshipServerProviderOptions(
  options: FlagshipServerProviderOptions,
): asserts options is FlagshipServerProviderOptions {
  if (!isRecord(options)) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Flagship server provider options are required.',
    );
  }

  const hasBinding = hasBindingCredentials(options);
  const hasRemote = hasRemoteCredentials(options);

  if (hasBinding && hasRemote) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Provide either a Flagship binding or remote Flagship credentials, not both.',
    );
  }

  if (!hasBinding && !hasRemote) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Flagship server provider requires either binding or appId, accountId, and authToken.',
    );
  }
}

export function hasBindingCredentials(
  options: Partial<FlagshipServerProviderOptions>,
): options is FlagshipServerProviderOptions & {
  readonly binding: CloudflareFlagshipBinding;
} {
  return 'binding' in options && Boolean(options.binding);
}

export function hasRemoteCredentials(
  options: Partial<FlagshipServerProviderOptions>,
): options is FlagshipServerProviderOptions & FlagshipRemoteCredentials {
  const candidate = options as Partial<FlagshipRemoteCredentials>;

  return (
    hasNonEmptyString(candidate.appId) &&
    hasNonEmptyString(candidate.accountId) &&
    hasNonEmptyString(candidate.authToken)
  );
}

export function normalizeRemoteCredentials(
  options: Partial<FlagshipServerProviderOptions>,
): FlagshipRemoteCredentials {
  if (!hasRemoteCredentials(options)) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      'Remote Flagship credentials require appId, accountId, and authToken.',
    );
  }

  return {
    appId: options.appId.trim(),
    accountId: options.accountId.trim(),
    authToken: options.authToken.trim(),
  };
}

export function getCredentialsMode(
  options: Partial<FlagshipServerProviderOptions>,
): FlagshipServerProviderCredentialsMode {
  return hasBindingCredentials(options) ? 'binding' : 'remote';
}

export function normalizeProviderName(providerName?: string): string {
  const normalized = providerName?.trim();

  return normalized && normalized.length > 0 ? normalized : FLAGS_PROVIDER_NAME;
}

export function normalizeProviderDomain(
  domain?: FlagshipServerProviderDomain,
): FlagshipServerProviderDomain | undefined {
  const normalized = domain?.trim();

  if (!normalized || normalized === FLAGS_OPENFEATURE_DOMAINS.default) {
    return undefined;
  }

  return normalized;
}

async function registerFlagshipServerProvider(
  provider: unknown,
  domain?: FlagshipServerProviderDomain,
): Promise<void> {
  const openFeatureProvider = provider as Provider;

  if (domain) {
    await OpenFeature.setProviderAndWait(domain, openFeatureProvider);
    return;
  }

  await OpenFeature.setProviderAndWait(openFeatureProvider);
}

function createProviderCacheKey(
  options: FlagshipServerProviderOptions,
  providerName: string,
): string {
  if (hasBindingCredentials(options)) {
    return [providerName, 'binding'].join(':');
  }

  const credentials = normalizeRemoteCredentials(options);

  return [
    providerName,
    'remote',
    credentials.appId,
    credentials.accountId,
  ].join(':');
}

function createInitializationCacheKey(
  providerCacheKey: string,
  domain?: FlagshipServerProviderDomain,
): string {
  return [domain ?? FLAGS_OPENFEATURE_DOMAINS.default, providerCacheKey].join(
    ':',
  );
}

function requireEnvString(
  env: FlagshipServerProviderEnv,
  key: string,
): string {
  const value = readString(env, key);

  if (!value) {
    throw new FlagshipServerProviderError(
      FLAGS_ERROR_CODES.missingCredentials,
      `Missing required Flagship environment variable: ${key}.`,
    );
  }

  return value;
}

function readString(
  env: FlagshipServerProviderEnv,
  key: string,
): string | undefined {
  const value = env[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function readProviderNameOverride(
  overrides: Partial<FlagshipServerProviderOptions>,
): string | undefined {
  const candidate = overrides as Partial<{
    readonly providerName: string;
  }>;

  return typeof candidate.providerName === 'string'
    ? candidate.providerName
    : undefined;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
