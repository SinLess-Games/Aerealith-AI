// libs/flags/src/server/client.ts

import { OpenFeature, type EvaluationContext } from '@openfeature/server-sdk';

import { FLAGS_DEFAULT_VALUES, FLAGS_ERROR_CODES } from '../constants';

import {
  buildFlagEvaluationContext,
  mergeFlagEvaluationContexts,
} from '../context';

import { toOpenFeatureEvaluationContext } from '../openfeature-context';

import type {
  CreateFlagshipServerEvaluatorOptions,
  FlagEvaluationContext,
  FlagJsonValue,
  FlagKey,
  FlagshipServerClientDomain,
  GetFlagshipServerClientOptions,
  InitializeFlagshipServerClientOptions,
  ServerFlagEvaluator,
} from '../types';

import {
  initializeFlagshipServerProvider,
  isFlagshipServerProviderInitialized,
  normalizeProviderDomain,
} from './provider';

export type FlagshipServerClient = ReturnType<typeof OpenFeature.getClient>;

export class FlagshipServerClientError extends Error {
  public override readonly name = 'FlagshipServerClientError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function getFlagshipServerClient(
  options: GetFlagshipServerClientOptions = {},
): FlagshipServerClient {
  const domain = normalizeServerClientDomain(options.domain);

  if (domain) {
    return options.version
      ? OpenFeature.getClient(domain, options.version)
      : OpenFeature.getClient(domain);
  }

  if (options.name) {
    return options.version
      ? OpenFeature.getClient(options.name, options.version)
      : OpenFeature.getClient(options.name);
  }

  return OpenFeature.getClient();
}

export async function initializeFlagshipServerClient(
  options: InitializeFlagshipServerClientOptions,
): Promise<FlagshipServerClient> {
  await initializeFlagshipServerProvider({
    ...options,
    domain: normalizeServerClientDomain(options.domain),
  });

  return getFlagshipServerClient(options);
}

export function createFlagshipServerEvaluator(
  options: CreateFlagshipServerEvaluatorOptions = {},
): ServerFlagEvaluator {
  const client = getFlagshipServerClient(options);
  const baseContext = buildFlagEvaluationContext(options.context);

  return {
    boolean: async (
      key: FlagKey,
      defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
      context?: FlagEvaluationContext,
    ): Promise<boolean> => {
      return getServerBooleanFlag(
        client,
        key,
        defaultValue,
        mergeEvaluationContext(baseContext, context),
      );
    },

    string: async (
      key: FlagKey,
      defaultValue: string = FLAGS_DEFAULT_VALUES.string,
      context?: FlagEvaluationContext,
    ): Promise<string> => {
      return getServerStringFlag(
        client,
        key,
        defaultValue,
        mergeEvaluationContext(baseContext, context),
      );
    },

    number: async (
      key: FlagKey,
      defaultValue: number = FLAGS_DEFAULT_VALUES.number,
      context?: FlagEvaluationContext,
    ): Promise<number> => {
      return getServerNumberFlag(
        client,
        key,
        defaultValue,
        mergeEvaluationContext(baseContext, context),
      );
    },

    object: async <TValue extends FlagJsonValue>(
      key: FlagKey,
      defaultValue: TValue,
      context?: FlagEvaluationContext,
    ): Promise<TValue> => {
      return getServerObjectFlag(
        client,
        key,
        defaultValue,
        mergeEvaluationContext(baseContext, context),
      );
    },
  };
}

export async function createInitializedFlagshipServerEvaluator(
  options: InitializeFlagshipServerClientOptions,
): Promise<ServerFlagEvaluator> {
  await initializeFlagshipServerProvider({
    ...options,
    domain: normalizeServerClientDomain(options.domain),
  });

  return createFlagshipServerEvaluator(options);
}

export async function getServerBooleanFlag(
  client: FlagshipServerClient,
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
  context?: FlagEvaluationContext,
): Promise<boolean> {
  assertFlagshipServerClientReady();

  try {
    return await client.getBooleanValue(
      key,
      defaultValue,
      toSdkEvaluationContext(context),
    );
  } catch (error) {
    throw createEvaluationError(key, error);
  }
}

export async function getServerStringFlag(
  client: FlagshipServerClient,
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
  context?: FlagEvaluationContext,
): Promise<string> {
  assertFlagshipServerClientReady();

  try {
    return await client.getStringValue(
      key,
      defaultValue,
      toSdkEvaluationContext(context),
    );
  } catch (error) {
    throw createEvaluationError(key, error);
  }
}

export async function getServerNumberFlag(
  client: FlagshipServerClient,
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
  context?: FlagEvaluationContext,
): Promise<number> {
  assertFlagshipServerClientReady();

  try {
    return await client.getNumberValue(
      key,
      defaultValue,
      toSdkEvaluationContext(context),
    );
  } catch (error) {
    throw createEvaluationError(key, error);
  }
}

export async function getServerObjectFlag<TValue extends FlagJsonValue>(
  client: FlagshipServerClient,
  key: FlagKey,
  defaultValue: TValue,
  context?: FlagEvaluationContext,
): Promise<TValue> {
  assertFlagshipServerClientReady();

  try {
    return (await client.getObjectValue(
      key,
      defaultValue,
      toSdkEvaluationContext(context),
    )) as TValue;
  } catch (error) {
    throw createEvaluationError(key, error);
  }
}

export function assertFlagshipServerClientReady(): void {
  if (!isFlagshipServerProviderInitialized()) {
    throw new FlagshipServerClientError(
      FLAGS_ERROR_CODES.missingProvider,
      'Cloudflare Flagship server provider has not been initialized. Call initializeFlagshipServerProvider() or initializeFlagshipServerClient() before evaluating flags.',
    );
  }
}

export function normalizeServerClientDomain(
  domain?: FlagshipServerClientDomain,
): FlagshipServerClientDomain | undefined {
  return normalizeProviderDomain(domain);
}

function mergeEvaluationContext(
  baseContext: FlagEvaluationContext,
  context?: FlagEvaluationContext,
): FlagEvaluationContext {
  return buildFlagEvaluationContext(
    mergeFlagEvaluationContexts(baseContext, context),
  );
}

function toSdkEvaluationContext(
  context?: FlagEvaluationContext,
): EvaluationContext | undefined {
  if (!context) {
    return undefined;
  }

  return toOpenFeatureEvaluationContext(context) as EvaluationContext;
}

function createEvaluationError(
  key: FlagKey,
  error: unknown,
): FlagshipServerClientError {
  if (error instanceof FlagshipServerClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new FlagshipServerClientError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Failed to evaluate feature flag "${key}": ${error.message}`,
      error,
    );
  }

  return new FlagshipServerClientError(
    FLAGS_ERROR_CODES.evaluationFailed,
    `Failed to evaluate feature flag "${key}".`,
    error,
  );
}
