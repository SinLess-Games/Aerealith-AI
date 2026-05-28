import type { Context } from 'hono';

import {
  FLAGS_DEFAULT_ENVIRONMENT,
  FLAGS_HEADER_KEYS,
  FLAGS_OPENFEATURE_DOMAINS,
} from '../constants';

import {
  buildContextFromRequest,
  buildFlagEvaluationContext,
  mergeFlagEvaluationContexts,
} from '../context';

import type {
  FlagEnvironment,
  FlagEvaluationContext,
  HonoFlagContextFactoryInput,
  HonoFlagVariables,
  ServerFlagEvaluator,
} from '../types';

import type { FlagshipServerProviderEnv } from '../server';

export const HONO_FLAGS_VARIABLE_KEY = 'flags' as const;

export const HONO_FLAG_CONTEXT_VARIABLE_KEY = 'flagContext' as const;

export const HONO_FLAG_PROVIDER_DOMAIN = FLAGS_OPENFEATURE_DOMAINS.hono;

export type HonoFlagBindings = FlagshipServerProviderEnv & Record<string, unknown>;

export type HonoFlagEnv<TBindings extends HonoFlagBindings = HonoFlagBindings> = {
  Bindings: TBindings;
  Variables: HonoFlagVariables;
};

export type HonoFlagContext<TBindings extends HonoFlagBindings = HonoFlagBindings> =
  Context<HonoFlagEnv<TBindings>>;

export type HonoFlagContextBuilder<TBindings extends HonoFlagBindings = HonoFlagBindings> = (
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
  readonly request: Request;
  readonly env?: unknown;
  readonly executionContext?: unknown;
  readonly context?: FlagEvaluationContext;
  readonly environment?: FlagEnvironment;
  readonly includeAnonymousContext?: boolean;
};

export function setHonoFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  flags: ServerFlagEvaluator,
): void {
  context.set(HONO_FLAGS_VARIABLE_KEY, flags);
}

export function getHonoFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): ServerFlagEvaluator {
  const flags = context.get(HONO_FLAGS_VARIABLE_KEY);

  if (!flags) {
    throw new Error(
      'Feature flag evaluator is missing from Hono context. Make sure honoFlagMiddleware() is registered before this route.',
    );
  }

  return flags;
}

export function hasHonoFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): boolean {
  return Boolean(context.get(HONO_FLAGS_VARIABLE_KEY));
}

export function setHonoFlagContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  flagContext: FlagEvaluationContext,
): void {
  context.set(HONO_FLAG_CONTEXT_VARIABLE_KEY, flagContext);
}

export function getHonoFlagContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): FlagEvaluationContext {
  const flagContext = context.get(HONO_FLAG_CONTEXT_VARIABLE_KEY);

  if (!flagContext) {
    throw new Error(
      'Feature flag evaluation context is missing from Hono context. Make sure honoFlagMiddleware() is registered before this route.',
    );
  }

  return flagContext;
}

export function hasHonoFlagContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): boolean {
  return Boolean(context.get(HONO_FLAG_CONTEXT_VARIABLE_KEY));
}

export async function buildHonoFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: BuildHonoFlagContextOptions<TBindings> = {},
): Promise<FlagEvaluationContext> {
  const requestContext = buildHonoFlagContextFromRequest({
    request: context.req.raw,
    env: context.env,
    executionContext: getExecutionContext(context),
    context: options.context,
    environment: options.environment,
    includeAnonymousContext: options.includeAnonymousContext,
  });

  const customContext = options.getContext
    ? await options.getContext(context)
    : undefined;

  return buildFlagEvaluationContext(
    mergeFlagEvaluationContexts(requestContext, customContext),
    {
      environment: options.environment ?? requestContext.environment,
      includeAnonymousContext: options.includeAnonymousContext,
    },
  );
}

export function buildHonoFlagContextFromRequest(
  input: HonoFlagRequestContextInput,
): FlagEvaluationContext {
  const environment =
    input.environment ??
    readEnvironmentFromEnv(input.env) ??
    readEnvironmentFromRequest(input.request) ??
    FLAGS_DEFAULT_ENVIRONMENT;

  return buildContextFromRequest(
    input.request,
    {
      ...input.context,
      environment,
    },
    {
      environment,
      includeAnonymousContext: input.includeAnonymousContext,
    },
  );
}

export function createHonoFlagContextFactoryInput<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
): HonoFlagContextFactoryInput {
  return {
    request: context.req.raw,
    env: context.env,
    executionContext: getExecutionContext(context),
  };
}

export async function resolveHonoFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: BuildHonoFlagContextOptions<TBindings> = {},
): Promise<FlagEvaluationContext> {
  const existingContext = context.get(HONO_FLAG_CONTEXT_VARIABLE_KEY);

  if (existingContext) {
    return existingContext;
  }

  const flagContext = await buildHonoFlagContext(context, options);

  setHonoFlagContext(context, flagContext);

  return flagContext;
}

export function getHonoFlagTargetingKey<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): string | undefined {
  return getHonoFlagContext(context).targetingKey;
}

export function getHonoFlagEnvironment<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): FlagEnvironment | undefined {
  return getHonoFlagContext(context).environment;
}

export function getHonoFlagUserId<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): string | undefined {
  const userId = getHonoFlagContext(context).userId;

  return typeof userId === 'string' ? userId : undefined;
}

export function getHonoFlagOrganizationId<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): string | undefined {
  const organizationId = getHonoFlagContext(context).organizationId;

  return typeof organizationId === 'string' ? organizationId : undefined;
}

export function getHonoFlagWorkspaceId<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): string | undefined {
  const workspaceId = getHonoFlagContext(context).workspaceId;

  return typeof workspaceId === 'string' ? workspaceId : undefined;
}

export function readHonoFlagHeader<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: string,
): string | undefined {
  const value = context.req.header(key);

  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

export function readHonoFlagHeaders<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): Partial<Record<keyof typeof FLAGS_HEADER_KEYS, string>> {
  return {
    targetingKey: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.targetingKey),
    userId: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.userId),
    anonymousId: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.anonymousId),
    sessionId: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.sessionId),
    organizationId: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.organizationId),
    workspaceId: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.workspaceId),
    plan: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.plan),
    country: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.country),
    locale: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.locale),
    environment: readHonoFlagHeader(context, FLAGS_HEADER_KEYS.environment),
  };
}

export function readHonoFlagEnvString<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: string,
): string | undefined {
  return readStringFromRecord(context.env, key);
}

export function readEnvironmentFromRequest(request: Request): FlagEnvironment | undefined {
  return normalizeOptionalEnvironment(
    request.headers.get(FLAGS_HEADER_KEYS.environment),
  );
}

export function readEnvironmentFromEnv(env: unknown): FlagEnvironment | undefined {
  return (
    normalizeOptionalEnvironment(readStringFromRecord(env, 'AEREALITH_ENVIRONMENT')) ??
    normalizeOptionalEnvironment(readStringFromRecord(env, 'NODE_ENV')) ??
    normalizeOptionalEnvironment(readStringFromRecord(env, 'ENVIRONMENT'))
  );
}

export function getExecutionContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): unknown {
  const maybeContext = context as unknown as {
    readonly executionCtx?: unknown;
  };

  return maybeContext.executionCtx;
}

function readStringFromRecord(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const value = (record as Record<string, unknown>)[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalEnvironment(value: unknown): FlagEnvironment | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}