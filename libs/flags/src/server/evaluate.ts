import { type EvaluationContext } from '@openfeature/server-sdk';

import { FLAGS_DEFAULT_VALUES, FLAGS_ERROR_CODES } from '../constants';

import {
  buildFlagEvaluationContext,
  mergeFlagEvaluationContexts,
} from '../context';

import { toOpenFeatureEvaluationContext } from '../openfeature-context';

import type {
  AnyFlagDefinition,
  BooleanFlagDefinition,
  FlagEvaluationContext,
  FlagEvaluationResult,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  FlagValue,
  FlagValueKind,
  NumberFlagDefinition,
  ObjectFlagDefinition,
  StringFlagDefinition,
} from '../types';

import {
  assertFlagshipServerClientReady,
  getFlagshipServerClient,
  type FlagshipServerClient,
  type GetFlagshipServerClientOptions,
} from './client';

type OpenFeatureEvaluationDetails<TValue> = {
  readonly value: TValue;
  readonly flagKey?: string;
  readonly variant?: string;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

export type EvaluateServerFlagOptions = GetFlagshipServerClientOptions & {
  readonly client?: FlagshipServerClient;
  readonly context?: FlagEvaluationContext;
  readonly details?: boolean;
  readonly throwOnError?: boolean;
};

export type EvaluateServerFlagRegistryOptions = EvaluateServerFlagOptions & {
  readonly only?: readonly FlagKey[];
};

export class ServerFlagEvaluationError extends Error {
  public override readonly name = 'ServerFlagEvaluationError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export async function evaluateServerFlag(
  definition: AnyFlagDefinition,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult> {
  switch (definition.kind) {
    case 'boolean':
      return evaluateServerBooleanFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'string':
      return evaluateServerStringFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'number':
      return evaluateServerNumberFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'object':
      return evaluateServerObjectFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    default:
      return assertNeverFlagKind(definition);
  }
}

export async function evaluateServerBooleanDefinition(
  definition: BooleanFlagDefinition,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<boolean>> {
  return evaluateServerBooleanFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export async function evaluateServerStringDefinition(
  definition: StringFlagDefinition,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<string>> {
  return evaluateServerStringFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export async function evaluateServerNumberDefinition(
  definition: NumberFlagDefinition,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<number>> {
  return evaluateServerNumberFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export async function evaluateServerObjectDefinition<
  TValue extends FlagJsonValue,
>(
  definition: ObjectFlagDefinition<TValue>,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<TValue>> {
  return evaluateServerObjectFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export async function evaluateServerBooleanFlag(
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<boolean>> {
  const client = resolveServerFlagClient(options);
  const context = resolveServerEvaluationContext(options.context);
  const sdkContext = toSdkEvaluationContext(context);

  try {
    assertFlagshipServerClientReady();

    if (options.details) {
      const details = (await client.getBooleanDetails(
        key,
        defaultValue,
        sdkContext,
      )) as OpenFeatureEvaluationDetails<boolean>;

      return createServerEvaluationResultFromDetails({
        key,
        kind: 'boolean',
        defaultValue,
        context,
        details,
      });
    }

    const value = await client.getBooleanValue(key, defaultValue, sdkContext);

    return createServerEvaluationResult({
      key,
      kind: 'boolean',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleServerEvaluationFailure({
      key,
      kind: 'boolean',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export async function evaluateServerStringFlag(
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<string>> {
  const client = resolveServerFlagClient(options);
  const context = resolveServerEvaluationContext(options.context);
  const sdkContext = toSdkEvaluationContext(context);

  try {
    assertFlagshipServerClientReady();

    if (options.details) {
      const details = (await client.getStringDetails(
        key,
        defaultValue,
        sdkContext,
      )) as OpenFeatureEvaluationDetails<string>;

      return createServerEvaluationResultFromDetails({
        key,
        kind: 'string',
        defaultValue,
        context,
        details,
      });
    }

    const value = await client.getStringValue(key, defaultValue, sdkContext);

    return createServerEvaluationResult({
      key,
      kind: 'string',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleServerEvaluationFailure({
      key,
      kind: 'string',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export async function evaluateServerNumberFlag(
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<number>> {
  const client = resolveServerFlagClient(options);
  const context = resolveServerEvaluationContext(options.context);
  const sdkContext = toSdkEvaluationContext(context);

  try {
    assertFlagshipServerClientReady();

    if (options.details) {
      const details = (await client.getNumberDetails(
        key,
        defaultValue,
        sdkContext,
      )) as OpenFeatureEvaluationDetails<number>;

      return createServerEvaluationResultFromDetails({
        key,
        kind: 'number',
        defaultValue,
        context,
        details,
      });
    }

    const value = await client.getNumberValue(key, defaultValue, sdkContext);

    return createServerEvaluationResult({
      key,
      kind: 'number',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleServerEvaluationFailure({
      key,
      kind: 'number',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export async function evaluateServerObjectFlag<TValue extends FlagJsonValue>(
  key: FlagKey,
  defaultValue: TValue,
  options: EvaluateServerFlagOptions = {},
): Promise<FlagEvaluationResult<TValue>> {
  const client = resolveServerFlagClient(options);
  const context = resolveServerEvaluationContext(options.context);
  const sdkContext = toSdkEvaluationContext(context);

  try {
    assertFlagshipServerClientReady();

    if (options.details) {
      const details = (await client.getObjectDetails(
        key,
        toSdkObjectDefaultValue(defaultValue),
        sdkContext,
      )) as unknown as OpenFeatureEvaluationDetails<TValue>;

      return createServerEvaluationResultFromDetails({
        key,
        kind: 'object',
        defaultValue,
        context,
        details,
      });
    }

    const value = (await client.getObjectValue(
      key,
      toSdkObjectDefaultValue(defaultValue),
      sdkContext,
    )) as TValue;

    return createServerEvaluationResult<TValue>({
      key,
      kind: 'object',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleServerEvaluationFailure({
      key,
      kind: 'object',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export async function evaluateServerFlagValue<TValue extends FlagValue>(
  definition: AnyFlagDefinition,
  options: EvaluateServerFlagOptions = {},
): Promise<TValue> {
  const result = await evaluateServerFlag(definition, options);

  return result.value as TValue;
}

export async function evaluateServerFlagRegistry(
  registry: FlagRegistry,
  options: EvaluateServerFlagRegistryOptions = {},
): Promise<Record<FlagKey, FlagEvaluationResult>> {
  const definitions = Object.values(registry).filter((definition) => {
    if (!options.only || options.only.length === 0) {
      return true;
    }

    return options.only.includes(definition.key);
  });

  const results = await Promise.all(
    definitions.map(async (definition) => evaluateServerFlag(definition, options)),
  );

  return Object.fromEntries(results.map((result) => [result.key, result]));
}

export async function evaluateServerFlagRegistryValues(
  registry: FlagRegistry,
  options: EvaluateServerFlagRegistryOptions = {},
): Promise<Record<FlagKey, FlagValue>> {
  const results = await evaluateServerFlagRegistry(registry, options);

  return Object.fromEntries(
    Object.entries(results).map(([key, result]) => [key, result.value]),
  );
}

export async function isServerFlagEnabled(
  key: FlagKey,
  context?: FlagEvaluationContext,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
): Promise<boolean> {
  const result = await evaluateServerBooleanFlag(key, defaultValue, {
    context,
  });

  return result.value;
}

export async function requireServerFlagEnabled(
  key: FlagKey,
  context?: FlagEvaluationContext,
): Promise<void> {
  const enabled = await isServerFlagEnabled(key, context, false);

  if (!enabled) {
    throw new ServerFlagEvaluationError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Required feature flag "${key}" is disabled.`,
    );
  }
}

export function createServerEvaluationResult<TValue extends FlagValue>(input: {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly value: TValue;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly variant?: string;
  readonly reason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}): FlagEvaluationResult<TValue> {
  return removeUndefinedResultFields({
    key: input.key,
    kind: input.kind,
    value: input.value,
    defaultValue: input.defaultValue,
    context: input.context,
    variant: input.variant,
    reason: input.reason,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  });
}

export function createServerEvaluationResultFromDetails<
  TValue extends FlagValue,
>(input: {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly details: OpenFeatureEvaluationDetails<TValue>;
}): FlagEvaluationResult<TValue> {
  return createServerEvaluationResult({
    key: input.details.flagKey ?? input.key,
    kind: input.kind,
    value: input.details.value,
    defaultValue: input.defaultValue,
    context: input.context,
    variant: input.details.variant,
    reason: input.details.reason,
    errorCode: input.details.errorCode,
    errorMessage: input.details.errorMessage,
  });
}

export function resolveServerEvaluationContext(
  context?: FlagEvaluationContext,
): FlagEvaluationContext {
  return buildFlagEvaluationContext(mergeFlagEvaluationContexts(context));
}

export function resolveServerFlagClient(
  options: EvaluateServerFlagOptions = {},
): FlagshipServerClient {
  return options.client ?? getFlagshipServerClient(options);
}

function handleServerEvaluationFailure<TValue extends FlagValue>(input: {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly error: unknown;
  readonly throwOnError?: boolean;
}): FlagEvaluationResult<TValue> {
  const error = toServerFlagEvaluationError(input.key, input.error);

  if (input.throwOnError) {
    throw error;
  }

  return createServerEvaluationResult({
    key: input.key,
    kind: input.kind,
    value: input.defaultValue,
    defaultValue: input.defaultValue,
    context: input.context,
    reason: 'ERROR',
    errorCode: error.code,
    errorMessage: error.message,
  });
}

function toServerFlagEvaluationError(
  key: FlagKey,
  error: unknown,
): ServerFlagEvaluationError {
  if (error instanceof ServerFlagEvaluationError) {
    return error;
  }

  if (error instanceof Error) {
    return new ServerFlagEvaluationError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Failed to evaluate server feature flag "${key}": ${error.message}`,
      error,
    );
  }

  return new ServerFlagEvaluationError(
    FLAGS_ERROR_CODES.evaluationFailed,
    `Failed to evaluate server feature flag "${key}".`,
    error,
  );
}

function toSdkEvaluationContext(
  context?: FlagEvaluationContext,
): EvaluationContext | undefined {
  return toOpenFeatureEvaluationContext(context) as EvaluationContext | undefined;
}

function toSdkObjectDefaultValue<TValue extends FlagJsonValue>(
  value: TValue,
): never {
  return value as never;
}

function removeUndefinedResultFields<TValue extends FlagValue>(
  result: FlagEvaluationResult<TValue>,
): FlagEvaluationResult<TValue> {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as FlagEvaluationResult<TValue>;
}

function assertNeverFlagKind(definition: never): never {
  throw new ServerFlagEvaluationError(
    FLAGS_ERROR_CODES.unsupportedValueKind,
    `Unsupported feature flag kind: ${JSON.stringify(definition)}.`,
  );
}