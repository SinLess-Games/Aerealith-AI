// libs/flags/src/types/prefetch.ts

import type {
  FlagEvaluationContext,
  FlagKey,
  FlagRegistry,
  FlagValue,
} from './core';

export type FlagPrefetchConfig = {
  readonly flags: readonly FlagKey[];
};

export type FlagBootstrapPayload = {
  readonly context?: FlagEvaluationContext;
  readonly prefetchFlags?: readonly FlagKey[];
  readonly values?: Partial<Record<FlagKey, FlagValue>>;
};

export type FlagPrefetchInput =
  | readonly FlagKey[]
  | FlagPrefetchConfig
  | FlagRegistry
  | undefined
  | null;

export type CreateFlagPrefetchConfigOptions = {
  readonly required?: boolean;
  readonly maxFlags?: number;
  readonly sort?: boolean;
};

export type FlagPrefetchValidationResult = {
  readonly valid: boolean;
  readonly flags: readonly FlagKey[];
  readonly errors: readonly string[];
};
