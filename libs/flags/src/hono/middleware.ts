import { createMiddleware } from 'hono/factory';

import {
  FLAGS_DEFAULT_VALUES,
  FLAGS_ERROR_CODES,
  FLAGS_LOG_MESSAGES,
  FLAGS_OPENFEATURE_DOMAINS,
} from '../constants';

import type {
  FlagEvaluationContext,
  FlagLogger,
  FlagshipServerProviderOptions,
  HonoFlagContextFactoryInput,
  ServerFlagEvaluator,
} from '../types';

import {
  createFlagshipServerEvaluator,
  getFlagshipServerProviderOptionsFromEnv,
  initializeFlagshipServerProvider,
  registerFlagshipServerHooksFromOptions,
  type FlagshipServerClientDomain,
  type FlagshipServerProviderEnv,
  type InitializeFlagshipServerProviderOptions,
} from '../server';

import {
  buildHonoFlagContext,
  createHonoFlagContextFactoryInput,
  HONO_FLAG_PROVIDER_DOMAIN,
  setHonoFlagContext,
  setHonoFlags,
  type BuildHonoFlagContextOptions,
  type HonoFlagBindings,
  type HonoFlagContext,
  type HonoFlagEnv,
} from './context';

export type HonoFlagProviderFactory<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = (
  context: HonoFlagContext<TBindings>,
) => FlagshipServerProviderOptions | Promise<FlagshipServerProviderOptions>;

export type HonoFlagContextInputFactory<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = (
  input: HonoFlagContextFactoryInput,
  context: HonoFlagContext<TBindings>,
) => FlagEvaluationContext | Promise<FlagEvaluationContext>;

export type HonoFlagMiddlewareOptions<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = {
  readonly enabled?: boolean;

  /**
   * Optional explicit provider config.
   *
   * If omitted, the middleware reads from context.env:
   * - FLAGS binding when available
   * - otherwise CLOUDFLARE_FLAGSHIP_APP_ID
   * - CLOUDFLARE_ACCOUNT_ID
   * - CLOUDFLARE_FLAGSHIP_AUTH_TOKEN
   */
  readonly provider?:
    | FlagshipServerProviderOptions
    | HonoFlagProviderFactory<TBindings>;

  /**
   * OpenFeature domain used for this Hono integration.
   */
  readonly domain?: FlagshipServerClientDomain;

  /**
   * Static context merged into every request context.
   */
  readonly context?: FlagEvaluationContext;

  /**
   * Request-aware context factory.
   */
  readonly getContext?: HonoFlagContextInputFactory<TBindings>;

  readonly includeAnonymousContext?: boolean;

  /**
   * When true, provider/context failures do not fail the request.
   * A fallback evaluator returning defaults is installed instead.
   */
  readonly failOpen?: boolean;

  readonly logger?: FlagLogger;
};

export type HonoFlagMiddlewareState = {
  readonly initialized: boolean;
  readonly domain: FlagshipServerClientDomain;
};

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
>(
  options: HonoFlagMiddlewareOptions<TBindings> = {},
) {
  const domain = options.domain ?? HONO_FLAG_PROVIDER_DOMAIN;

  return createMiddleware<HonoFlagEnv<TBindings>>(async (context, next) => {
    if (options.enabled === false) {
      await next();
      return;
    }

    try {
      const provider = await resolveHonoFlagProviderOptions(context, options);

      registerFlagshipServerHooksFromOptions(provider.hooks, options.logger);

      await initializeFlagshipServerProvider({
        ...provider,
        domain,
      } satisfies InitializeFlagshipServerProviderOptions);

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
        const fallbackContext = await safeResolveFallbackContext(context, options);
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
>(
  options: HonoFlagMiddlewareOptions<TBindings> = {},
) {
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
    context.env as FlagshipServerProviderEnv,
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

  return buildHonoFlagContext(context, {
    context: {
      ...(options.context ?? {}),
      ...(customContext ?? {}),
    },
    includeAnonymousContext: options.includeAnonymousContext,
  } satisfies BuildHonoFlagContextOptions<TBindings>);
}

export function createFallbackHonoFlagEvaluator(): ServerFlagEvaluator {
  return {
    boolean: async (
      _key,
      defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
    ): Promise<boolean> => {
      return defaultValue;
    },

    string: async (
      _key,
      defaultValue: string = FLAGS_DEFAULT_VALUES.string,
    ): Promise<string> => {
      return defaultValue;
    },

    number: async (
      _key,
      defaultValue: number = FLAGS_DEFAULT_VALUES.number,
    ): Promise<number> => {
      return defaultValue;
    },

    object: async <TValue>(
      _key: string,
      defaultValue: TValue,
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