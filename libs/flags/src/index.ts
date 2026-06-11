// libs/flags/src/index.ts

export * from './constants';
export * from './openfeature-context';
export * from './types';

export * from './client';
export * from './context';
export * from './hono';
export * from './testing';

export {
  assertFlagshipServerClientReady,
  createFlagshipServerEvaluator,
  createInitializedFlagshipServerEvaluator, FlagshipServerClientError, getFlagshipServerClient,
  getServerBooleanFlag,
  getServerNumberFlag,
  getServerObjectFlag,
  getServerStringFlag,
  initializeFlagshipServerClient,
  normalizeServerClientDomain
} from './server/client';

export type { FlagshipServerClient } from './server/client';

export {
  createServerEvaluationResult,
  createServerEvaluationResultFromDetails,
  evaluateServerBooleanDefinition,
  evaluateServerBooleanFlag,
  evaluateServerFlag,
  evaluateServerFlagRegistry,
  evaluateServerFlagRegistryValues,
  evaluateServerFlagValue,
  evaluateServerNumberDefinition,
  evaluateServerNumberFlag,
  evaluateServerObjectDefinition,
  evaluateServerObjectFlag,
  evaluateServerStringDefinition,
  evaluateServerStringFlag,
  isServerFlagEnabled,
  requireServerFlagEnabled,
  resolveServerEvaluationContext,
  resolveServerFlagClient, ServerFlagEvaluationError
} from './server/evaluate';

export {
  areFlagshipServerHooksRegistered,
  createFlagshipServerHooks,
  getHookName,
  getRegisteredFlagshipServerHooks,
  hasRegisteredHook,
  registerFlagshipServerHooks,
  registerFlagshipServerHooksFromOptions,
  resetFlagshipServerHooksState
} from './server/hooks';

export {
  assertValidFlagshipServerProviderOptions,
  createFlagshipServerProvider, FlagshipServerProviderError, getCredentialsMode,
  getFlagshipServerProviderOptionsFromEnv,
  getInitializedFlagshipServerProvider,
  hasBindingCredentials,
  hasRemoteCredentials,
  initializeFlagshipServerProvider,
  isFlagshipServerProviderInitialized,
  normalizeProviderDomain,
  normalizeProviderName,
  normalizeRemoteCredentials,
  resetFlagshipServerProvider
} from './server/provider';
