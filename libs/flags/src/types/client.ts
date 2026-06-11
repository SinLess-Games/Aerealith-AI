// libs/flags/src/types/client.ts

import type { OpenFeature } from '@openfeature/web-sdk';

import type { FlagEvaluationContext, FlagKey } from './core';
import type { ClientFlagEvaluator } from './evaluator';
import type { CreateFlagPrefetchConfigOptions } from './prefetch';
import type { FlagshipClientProviderOptions } from './provider';

export type FlagshipClientProviderInstance = unknown;

export type CreateFlagshipClientProviderOptions =
  FlagshipClientProviderOptions & {
    readonly prefetch?: CreateFlagPrefetchConfigOptions;
  };

export type InitializeFlagshipClientProviderOptions =
  CreateFlagshipClientProviderOptions & {
    readonly force?: boolean;
  };

export type CreateFlagshipClientProviderResult = {
  readonly provider: FlagshipClientProviderInstance;
  readonly providerName: string;
  readonly prefetchFlags: readonly FlagKey[];
  readonly cacheKey: string;
};

export type InitializedFlagshipClientProvider =
  CreateFlagshipClientProviderResult & {
    readonly initialized: true;
    readonly context?: FlagEvaluationContext;
  };

export type FlagshipClientProviderEnv = Record<string, unknown>;

export type FlagshipClientDomain = string;

export type FlagshipClient = ReturnType<typeof OpenFeature.getClient>;

export type GetFlagshipClientOptions = {
  readonly domain?: FlagshipClientDomain;
  readonly version?: string;
};

export type CreateFlagshipClientEvaluatorOptions = GetFlagshipClientOptions;

export type InitializeFlagshipClientOptions =
  InitializeFlagshipClientProviderOptions &
    GetFlagshipClientOptions & {
      readonly context?: FlagEvaluationContext;
    };

export type EvaluateClientFlagOptions = GetFlagshipClientOptions & {
  readonly client?: FlagshipClient;
  readonly details?: boolean;
  readonly throwOnError?: boolean;
};

export type EvaluateClientFlagRegistryOptions = EvaluateClientFlagOptions & {
  readonly only?: readonly FlagKey[];
};

export type CreateFlagshipClientEvaluatorResult = ClientFlagEvaluator;
