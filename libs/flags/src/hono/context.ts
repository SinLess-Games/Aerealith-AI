// libs/flags/src/hono/context.ts

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
  BuildHonoFlagContextOptions,
  FlagEnvironment,
  FlagEvaluationContext,
  HonoFlagBindings,
  HonoFlagContext,
  HonoFlagContextFactoryInput,
  HonoFlagRequestContextInput,
  ServerFlagEvaluator,
} from '../types';

export const HONO_FLAGS_VARIABLE_KEY = 'flags' as const;

export const HONO_FLAG_CONTEXT_VARIABLE_KEY = 'flagContext' as const;

export const HONO_FLAG_PROVIDER_DOMAIN = FLAGS_OPENFEATURE_DOMAINS.hono;

type HeadersLike = {
  readonly get: (key: string) => string | null | undefined;
};

type RequestLike = {
  readonly headers: HeadersLike;
};

type HonoVariableContext = {
  readonly req: {
    readonly raw: unknown;
    readonly header: (key: string) => string | undefined;
  };
  readonly env: unknown;
  readonly executionCtx?: unknown;

  get: <TValue = unknown>(key: string) => TValue | undefined;
  set: (key: string, value: unknown) => void;
};

export function setHonoFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  flags: ServerFlagEvaluator,
): void {
  setHonoVariable(context, HONO_FLAGS_VARIABLE_KEY, flags);
}

export function getHonoFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): ServerFlagEvaluator {
  const flags = getHonoVariable<ServerFlagEvaluator>(
    context,
    HONO_FLAGS_VARIABLE_KEY,
  );

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
  return Boolean(getHonoVariable(context, HONO_FLAGS_VARIABLE_KEY));
}

export function setHonoFlagContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  flagContext: FlagEvaluationContext,
): void {
  setHonoVariable(context, HONO_FLAG_CONTEXT_VARIABLE_KEY, flagContext);
}

export function getHonoFlagContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): FlagEvaluationContext {
  const flagContext = getHonoVariable<FlagEvaluationContext>(
    context,
    HONO_FLAG_CONTEXT_VARIABLE_KEY,
  );

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
  return Boolean(getHonoVariable(context, HONO_FLAG_CONTEXT_VARIABLE_KEY));
}

export async function buildHonoFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: BuildHonoFlagContextOptions<TBindings> = {},
): Promise<FlagEvaluationContext> {
  const honoContext = toHonoVariableContext(context);

  const requestContext = buildHonoFlagContextFromRequest({
    request: honoContext.req.raw,
    env: honoContext.env,
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
  const request = toRequestLike(input.request);

  const environment =
    input.environment ??
    readEnvironmentFromEnv(input.env) ??
    (request ? readEnvironmentFromRequest(request) : undefined) ??
    FLAGS_DEFAULT_ENVIRONMENT;

  if (!request) {
    return buildFlagEvaluationContext(
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

  return buildContextFromRequest(
    request,
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
  const honoContext = toHonoVariableContext(context);

  return {
    request: honoContext.req.raw,
    env: honoContext.env,
    executionContext: getExecutionContext(context),
  };
}

export async function resolveHonoFlagContext<
  TBindings extends HonoFlagBindings = HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  options: BuildHonoFlagContextOptions<TBindings> = {},
): Promise<FlagEvaluationContext> {
  const existingContext = getHonoVariable<FlagEvaluationContext>(
    context,
    HONO_FLAG_CONTEXT_VARIABLE_KEY,
  );

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
  const value = toHonoVariableContext(context).req.header(key);

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
    organizationId: readHonoFlagHeader(
      context,
      FLAGS_HEADER_KEYS.organizationId,
    ),
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
  return readStringFromRecord(toHonoVariableContext(context).env, key);
}

export function readEnvironmentFromRequest(
  request: RequestLike,
): FlagEnvironment | undefined {
  return normalizeOptionalEnvironment(
    request.headers.get(FLAGS_HEADER_KEYS.environment),
  );
}

export function readEnvironmentFromEnv(
  env: unknown,
): FlagEnvironment | undefined {
  return (
    normalizeOptionalEnvironment(readStringFromRecord(env, 'AEREALITH_ENVIRONMENT')) ??
    normalizeOptionalEnvironment(readStringFromRecord(env, 'NODE_ENV')) ??
    normalizeOptionalEnvironment(readStringFromRecord(env, 'ENVIRONMENT'))
  );
}

export function getExecutionContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): unknown {
  return toHonoVariableContext(context).executionCtx;
}

function getHonoVariable<TValue>(
  context: unknown,
  key: string,
): TValue | undefined {
  return toHonoVariableContext(context).get<TValue>(key);
}

function setHonoVariable(context: unknown, key: string, value: unknown): void {
  toHonoVariableContext(context).set(key, value);
}

function toHonoVariableContext(context: unknown): HonoVariableContext {
  return context as HonoVariableContext;
}

function toRequestLike(value: unknown): RequestLike | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const maybeRequest = value as Partial<RequestLike>;

  if (!maybeRequest.headers || typeof maybeRequest.headers.get !== 'function') {
    return undefined;
  }

  return maybeRequest as RequestLike;
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

function normalizeOptionalEnvironment(
  value: unknown,
): FlagEnvironment | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}
