// libs/flags/src/types/hono.ts

import type { Context } from 'hono';

import type {
  FlagEnvironment,
  FlagEvaluationContext,
} from './core';
import type { FlagLogger } from './logger';
import type {
  FlagshipServerProviderEnv,
  FlagshipServerProviderOptions,
} from './provider';
import type { FlagshipServerClientDomain } from './server';

export type HonoFlagBindings = FlagshipServerProviderEnv &
  Record<string, unknown>;

export type HonoFlagVariables = {
  readonly flags?: HonoFlagMiddlewareState;
};

export type HonoFlagEnv<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = {
  Bindings: TBindings;
  Variables: HonoFlagVariables;
};

export type HonoFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = Context<HonoFlagEnv<TBindings>>;

export type HonoFlagProviderFactory<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = (
  context: HonoFlagContext<TBindings>,
) => FlagshipServerProviderOptions | Promise<FlagshipServerProviderOptions>;

export type HonoFlagContextFactoryInput = {
  readonly request?: unknown;
  readonly env?: unknown;
  readonly executionContext?: unknown;
  readonly context?: FlagEvaluationContext;
  readonly environment?: FlagEnvironment;
};

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

export type HonoFlagHelperOptions = {
  readonly context?: FlagEvaluationContext;
  readonly defaultContext?: boolean;
};

export type HonoFlagGuardOptions = HonoFlagHelperOptions & {
  readonly defaultValue?: boolean;
  readonly status?: number;
  readonly message?: string;
};

export type HonoFlagJsonOptions = HonoFlagHelperOptions & {
  readonly includeContext?: boolean;
};

export type HonoFlagContextBuilder<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = (
  context: HonoFlagContext<TBindings>,
) => FlagEvaluationContext | Promise<FlagEvaluationContext>;

export type BuildHonoFlagContextOptions<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
> = {
  readonly context?: FlagEvaluationContext;
  readonly environment?: FlagEnvironment;
  readonly getContext?: HonoFlagContextBuilder<TBindings>;
  readonly includeAnonymousContext?: boolean;
};

export type HonoFlagRequestContextInput = {
  readonly request: unknown;
  readonly env?: unknown;
  readonly executionContext?: unknown;
  readonly context?: FlagEvaluationContext;
  readonly environment?: FlagEnvironment;
  readonly includeAnonymousContext?: boolean;
};
