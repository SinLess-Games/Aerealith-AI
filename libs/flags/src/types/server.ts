// libs/flags/src/types/server.ts

import type {
  FlagEvaluationContext,
  FlagKey,
  FlagRegistry,
} from './core';
import type { ServerFlagEvaluator } from './evaluator';
import type {
  FlagshipServerProviderDomain,
  InitializeFlagshipServerProviderOptions,
} from './provider';

export type FlagshipServerClientDomain = FlagshipServerProviderDomain;

export type FlagshipServerClient = unknown;

export type GetFlagshipServerClientOptions = {
  readonly domain?: FlagshipServerClientDomain;
  readonly name?: string;
  readonly version?: string;
};

export type CreateFlagshipServerEvaluatorOptions =
  GetFlagshipServerClientOptions & {
    readonly context?: FlagEvaluationContext;
  };

export type InitializeFlagshipServerClientOptions =
  InitializeFlagshipServerProviderOptions &
    GetFlagshipServerClientOptions & {
      readonly context?: FlagEvaluationContext;
    };

export type EvaluateServerFlagOptions = GetFlagshipServerClientOptions & {
  readonly client?: FlagshipServerClient;
  readonly context?: FlagEvaluationContext;
  readonly details?: boolean;
  readonly throwOnError?: boolean;
};

export type EvaluateServerFlagRegistryOptions = EvaluateServerFlagOptions & {
  readonly only?: readonly FlagKey[];
};

export type CreateFlagshipServerEvaluatorResult = ServerFlagEvaluator;

export type ServerFlagRegistryEvaluationResult = Partial<
  Record<FlagKey, unknown>
>;

export type ServerFlagRegistryInput =
  | readonly FlagKey[]
  | FlagRegistry
  | undefined
  | null;
