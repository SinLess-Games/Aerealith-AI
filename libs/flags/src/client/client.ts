// libs/flags/src/client/client.ts

import { OpenFeature } from '@openfeature/web-sdk';

import { FLAGS_DEFAULT_VALUES, FLAGS_ERROR_CODES } from '../constants';

import type {
  ClientFlagEvaluator,
  CreateFlagshipClientEvaluatorOptions,
  FlagJsonValue,
  FlagKey,
  FlagshipClient,
  GetFlagshipClientOptions,
  InitializeFlagshipClientOptions,
} from '../types';

import {
  assertPrefetchFlagAvailable,
  assertPrefetchFlagsAvailable,
} from './prefetch';

import {
  assertFlagshipClientProviderInitialized,
  getInitializedPrefetchFlags,
  initializeFlagshipClientProvider,
  setFlagshipClientContext,
} from './provider';

export class FlagshipClientError extends Error {
  public override readonly name = 'FlagshipClientError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function getFlagshipClient(
  options: GetFlagshipClientOptions = {},
): FlagshipClient {
  if (options.domain) {
    return options.version
      ? OpenFeature.getClient(options.domain, options.version)
      : OpenFeature.getClient(options.domain);
  }

  return OpenFeature.getClient();
}

export async function initializeFlagshipClient(
  options: InitializeFlagshipClientOptions,
): Promise<FlagshipClient> {
  await initializeFlagshipClientProvider(options);

  if (options.context) {
    await setFlagshipClientContext(options.context);
  }

  return getFlagshipClient(options);
}

export function createFlagshipClientEvaluator(
  options: CreateFlagshipClientEvaluatorOptions = {},
): ClientFlagEvaluator {
  const client = getFlagshipClient(options);

  return {
    boolean: (
      key: FlagKey,
      defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
    ): boolean => {
      return getClientBooleanFlag(client, key, defaultValue);
    },

    string: (
      key: FlagKey,
      defaultValue: string = FLAGS_DEFAULT_VALUES.string,
    ): string => {
      return getClientStringFlag(client, key, defaultValue);
    },

    number: (
      key: FlagKey,
      defaultValue: number = FLAGS_DEFAULT_VALUES.number,
    ): number => {
      return getClientNumberFlag(client, key, defaultValue);
    },

    object: <TValue extends FlagJsonValue>(
      key: FlagKey,
      defaultValue: TValue,
    ): TValue => {
      return getClientObjectFlag(client, key, defaultValue);
    },
  };
}

export async function createInitializedFlagshipClientEvaluator(
  options: InitializeFlagshipClientOptions,
): Promise<ClientFlagEvaluator> {
  await initializeFlagshipClient(options);

  return createFlagshipClientEvaluator(options);
}

export function getClientBooleanFlag(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
): boolean {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getBooleanValue(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientStringFlag(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
): string {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getStringValue(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientNumberFlag(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
): number {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getNumberValue(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientObjectFlag<TValue extends FlagJsonValue>(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: TValue,
): TValue {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getObjectValue(key, defaultValue) as TValue;
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientBooleanDetails(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
): ReturnType<FlagshipClient['getBooleanDetails']> {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getBooleanDetails(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientStringDetails(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
): ReturnType<FlagshipClient['getStringDetails']> {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getStringDetails(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientNumberDetails(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
): ReturnType<FlagshipClient['getNumberDetails']> {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getNumberDetails(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function getClientObjectDetails<TValue extends FlagJsonValue>(
  client: FlagshipClient,
  key: FlagKey,
  defaultValue: TValue,
): ReturnType<FlagshipClient['getObjectDetails']> {
  assertFlagshipClientReadyForFlag(key);

  try {
    return client.getObjectDetails(key, defaultValue);
  } catch (error) {
    throw createClientEvaluationError(key, error);
  }
}

export function assertFlagshipClientReady(): void {
  assertFlagshipClientProviderInitialized();
}

export function assertFlagshipClientReadyForFlag(key: FlagKey): void {
  assertFlagshipClientReady();
  assertPrefetchFlagAvailable(getInitializedPrefetchFlags(), key);
}

export function assertFlagshipClientReadyForFlags(
  keys: readonly FlagKey[],
): void {
  assertFlagshipClientReady();
  assertPrefetchFlagsAvailable(getInitializedPrefetchFlags(), keys);
}

export function isClientFlagPrefetched(key: FlagKey): boolean {
  return getInitializedPrefetchFlags().includes(key);
}

export function getClientPrefetchFlags(): readonly FlagKey[] {
  return getInitializedPrefetchFlags();
}

function createClientEvaluationError(
  key: FlagKey,
  error: unknown,
): FlagshipClientError {
  if (error instanceof FlagshipClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new FlagshipClientError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Failed to evaluate client feature flag "${key}": ${error.message}`,
      error,
    );
  }

  return new FlagshipClientError(
    FLAGS_ERROR_CODES.evaluationFailed,
    `Failed to evaluate client feature flag "${key}".`,
    error,
  );
}
