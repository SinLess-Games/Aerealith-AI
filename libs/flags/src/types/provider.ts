// libs/flags/src/types/provider.ts

import type { FlagEvaluationContext, FlagKey } from './core';
import type { FlagHookOptions } from './hooks';

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

export type FlagshipServerProviderCredentialsMode = 'binding' | 'remote';

export type FlagshipServerProviderDomain = string;

export type FlagshipServerProviderInstance = unknown;

export type CreateFlagshipServerProviderResult = {
  readonly provider: FlagshipServerProviderInstance;
  readonly providerName: string;
  readonly credentialsMode: FlagshipServerProviderCredentialsMode;
  readonly cacheKey: string;
};

export type InitializeFlagshipServerProviderOptions =
  FlagshipServerProviderOptions & {
    readonly domain?: FlagshipServerProviderDomain;
    readonly force?: boolean;
  };

export type InitializedFlagshipServerProvider =
  CreateFlagshipServerProviderResult & {
    readonly domain?: FlagshipServerProviderDomain;
    readonly initialized: true;
  };

export type FlagshipServerProviderEnv = Record<string, unknown> & {
  readonly FLAGS?: CloudflareFlagshipBinding;
};

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
