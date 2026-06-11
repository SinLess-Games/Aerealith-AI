// libs/flags/src/hono/middleware.ts

import { createMiddleware } from 'hono/factory';

import {
  FLAGS_DEFAULT_VALUES,
  FLAGS_ERROR_CODES,
  FLAGS_LOG_MESSAGES,
  FLAGS_OPENFEATURE_DOMAINS,
} from '../constants';

import type {
  BuildHonoFlagContextOptions,
  FlagEvaluationContext,
  FlagJsonValue,
  FlagKey,
  FlagshipServerClientDomain,
  FlagshipServerProviderEnv,
  FlagshipServerProviderOptions,
  HonoFlagBindings,
  HonoFlagContext,
  HonoFlagEnv,
  HonoFlagMiddlewareOptions,
  HonoFlagMiddlewareState,
  InitializeFlagshipServerProviderOptions,
  ServerFlagEvaluator,
} from '../types';

import {
  createFlagshipServerEvaluator,
  getFlagshipServerProviderOptionsFromEnv,
  initializeFlagshipServerProvider,
  registerFlagshipServerHooksFromOptions,
} from '../server';

import {
  buildHonoFlagContext,
  createHonoFlagContextFactoryInput,
  HONO_FLAG_PROVIDER_DOMAIN,
  setHonoFlagContext,
  setHonoFlags,
} from './context';

export class HonoFlagMiddlewareError extends Error {
  public override readonly name = 'HonoFlagMiddlewareError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function honoFlagMiddleware<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(options: HonoFlagMiddlewareOptions<TBindings> = {}) {
  const domain = options.domain ?? HONO_FLAG_PROVIDER_DOMAIN;

  return createMiddleware<HonoFlagEnv<TBindings>>(async (context, next) => {
    if (options.enabled === false) {
      await next();
      return;
    }

    try {
      const provider = await resolveHonoFlagProviderOptions(context, options);

      registerFlagshipServerHooksFromOptions(provider.hooks, options.logger);

      const providerOptions: InitializeFlagshipServerProviderOptions = {
        ...provider,
        domain,
      };

      await initializeFlagshipServerProvider(providerOptions);

      const flagContext = await resolveMiddlewareFlagContext(context, options);

      const flags = createFlagshipServerEvaluator({
        domain,
        context: flagContext,
      });

      setHonoFlagContext(context, flagContext);
      setHonoFlags(context, flags);

      options.logger?.debug?.(FLAGS_LOG_MESSAGES.contextBuilt, {
        component: 'flags.hono.middleware',
        domain,
        targetingKey: flagContext.targetingKey,
        environment: flagContext.environment,
      });

      await next();
    } catch (error) {
      if (options.failOpen ?? false) {
        const fallbackContext = await safeResolveFallbackContext(
          context,
          options,
        );
        const fallbackFlags = createFallbackHonoFlagEvaluator();

        setHonoFlagContext(context, fallbackContext);
        setHonoFlags(context, fallbackFlags);

        options.logger?.warn?.('Feature flag middleware failed open.', {
          component: 'flags.hono.middleware',
          domain,
          error,
        });

        await next();
        return;
      }

      throw new HonoFlagMiddlewareError(
        FLAGS_ERROR_CODES.providerInitializationFailed,
        'Failed to initialize Hono feature flag middleware.',
        error,
      );
    }
  });
}

export function createHonoFlagMiddleware<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(options: HonoFlagMiddlewareOptions<TBindings> = {}) {
  return honoFlagMiddleware(options);
}

export async function resolveHonoFlagProviderOptions<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: HonoFlagMiddlewareOptions<TBindings> = {},
): Promise<FlagshipServerProviderOptions> {
  if (typeof options.provider === 'function') {
    return options.provider(context);
  }

  if (options.provider) {
    return options.provider;
  }

  return getFlagshipServerProviderOptionsFromEnv(
    readHonoEnv(context) as FlagshipServerProviderEnv,
  );
}

export async function resolveMiddlewareFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: HonoFlagMiddlewareOptions<TBindings> = {},
): Promise<FlagEvaluationContext> {
  const requestInput = createHonoFlagContextFactoryInput(context);

  const customContext = options.getContext
    ? await options.getContext(requestInput, context)
    : undefined;

  const contextOptions: BuildHonoFlagContextOptions<TBindings> = {
    context: {
      ...(options.context ?? {}),
      ...(customContext ?? {}),
    },
    includeAnonymousContext: options.includeAnonymousContext,
  };

  return buildHonoFlagContext(context, contextOptions);
}

export function createFallbackHonoFlagEvaluator(): ServerFlagEvaluator {
  return {
    boolean: async (
      _key: FlagKey,
      defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
      _context?: FlagEvaluationContext,
    ): Promise<boolean> => {
      return defaultValue;
    },

    string: async (
      _key: FlagKey,
      defaultValue: string = FLAGS_DEFAULT_VALUES.string,
      _context?: FlagEvaluationContext,
    ): Promise<string> => {
      return defaultValue;
    },

    number: async (
      _key: FlagKey,
      defaultValue: number = FLAGS_DEFAULT_VALUES.number,
      _context?: FlagEvaluationContext,
    ): Promise<number> => {
      return defaultValue;
    },

    object: async <TValue extends FlagJsonValue>(
      _key: FlagKey,
      defaultValue: TValue,
      _context?: FlagEvaluationContext,
    ): Promise<TValue> => {
      return defaultValue;
    },
  };
}

export function createHonoFlagMiddlewareState(
  domain: FlagshipServerClientDomain = FLAGS_OPENFEATURE_DOMAINS.hono,
): HonoFlagMiddlewareState {
  return {
    initialized: true,
    domain,
  };
}

async function safeResolveFallbackContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: HonoFlagMiddlewareOptions<TBindings>,
): Promise<FlagEvaluationContext> {
  try {
    return await resolveMiddlewareFlagContext(context, options);
  } catch {
    return options.context ?? {};
  }
}

function readHonoEnv<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): TBindings {
  return context.env;
}
