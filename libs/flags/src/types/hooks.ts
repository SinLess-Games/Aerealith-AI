// libs/flags/src/types/hooks.ts

import type { FlagLogger } from './logger';

export type FlagHookOptions = {
  readonly logging?: boolean;
  readonly telemetry?: boolean;
};

/**
 * Kept SDK-neutral so importing shared types does not force
 * @openfeature/server-sdk into browser/client bundles.
 */
export type OpenFeatureServerHook = unknown;

export type FlagshipServerHookRegistrationOptions = FlagHookOptions & {
  readonly force?: boolean;
  readonly logger?: FlagLogger;
};

export type FlagshipServerHookRegistrationResult = {
  readonly registered: boolean;
  readonly logging: boolean;
  readonly telemetry: boolean;
  readonly hooks: readonly OpenFeatureServerHook[];
};
