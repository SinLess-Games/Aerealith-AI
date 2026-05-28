import { OpenFeature } from '@openfeature/server-sdk';
import { LoggingHook, TelemetryHook } from '@cloudflare/flagship/server';

import { FLAGS_LOG_MESSAGES } from '../constants';

import type { FlagHookOptions, FlagLogger } from '../types';

export type OpenFeatureServerHook = Parameters<typeof OpenFeature.addHooks>[0];

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

let hooksRegistered = false;
let registeredHooks: readonly OpenFeatureServerHook[] = [];

export function createFlagshipServerHooks(
  options: FlagshipServerHookRegistrationOptions = {},
): readonly OpenFeatureServerHook[] {
  const logging = options.logging ?? true;
  const telemetry = options.telemetry ?? true;

  const hooks: OpenFeatureServerHook[] = [];

  if (logging) {
    hooks.push(new LoggingHook());
  }

  if (telemetry) {
    hooks.push(
      new TelemetryHook((event) => {
        options.logger?.debug?.('Feature flag telemetry event captured.', {
          component: 'flags.server.hooks',
          event,
        });
      }),
    );
  }

  return hooks;
}

export function registerFlagshipServerHooks(
  options: FlagshipServerHookRegistrationOptions = {},
): FlagshipServerHookRegistrationResult {
  if (hooksRegistered && !options.force) {
    return {
      registered: false,
      logging: hasRegisteredHook('LoggingHook'),
      telemetry: hasRegisteredHook('TelemetryHook'),
      hooks: registeredHooks,
    };
  }

  const hooks = createFlagshipServerHooks(options);

  if (hooks.length > 0) {
    OpenFeature.addHooks(...hooks);
  }

  hooksRegistered = true;
  registeredHooks = hooks;

  options.logger?.info?.(FLAGS_LOG_MESSAGES.providerInitialized, {
    component: 'flags.server.hooks',
    logging: options.logging ?? true,
    telemetry: options.telemetry ?? true,
    hookCount: hooks.length,
  });

  return {
    registered: true,
    logging: hooks.some((hook) => getHookName(hook) === 'LoggingHook'),
    telemetry: hooks.some((hook) => getHookName(hook) === 'TelemetryHook'),
    hooks,
  };
}

export function registerFlagshipServerHooksFromOptions(
  options: FlagHookOptions | undefined,
  logger?: FlagLogger,
): FlagshipServerHookRegistrationResult {
  return registerFlagshipServerHooks({
    logging: options?.logging,
    telemetry: options?.telemetry,
    logger,
  });
}

export function areFlagshipServerHooksRegistered(): boolean {
  return hooksRegistered;
}

export function getRegisteredFlagshipServerHooks(): readonly OpenFeatureServerHook[] {
  return registeredHooks;
}

export function resetFlagshipServerHooksState(): void {
  hooksRegistered = false;
  registeredHooks = [];
}

export function hasRegisteredHook(name: string): boolean {
  return registeredHooks.some((hook) => getHookName(hook) === name);
}

export function getHookName(hook: OpenFeatureServerHook): string {
  const constructorName = hook?.constructor?.name;

  if (constructorName && constructorName.length > 0) {
    return constructorName;
  }

  return 'UnknownHook';
}