// libs/flags/src/client/evaluate.ts

import { FLAGS_DEFAULT_VALUES, FLAGS_ERROR_CODES } from '../constants';

import type {
  AnyFlagDefinition,
  BooleanFlagDefinition,
  EvaluateClientFlagOptions,
  EvaluateClientFlagRegistryOptions,
  FlagEvaluationContext,
  FlagEvaluationResult,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  FlagshipClient,
  FlagValue,
  FlagValueKind,
  NumberFlagDefinition,
  ObjectFlagDefinition,
  OpenFeatureEvaluationDetails,
  StringFlagDefinition,
} from '../types';

import {
  assertFlagshipClientReady,
  getClientBooleanDetails,
  getClientBooleanFlag,
  getClientNumberDetails,
  getClientNumberFlag,
  getClientObjectDetails,
  getClientObjectFlag,
  getClientPrefetchFlags,
  getClientStringDetails,
  getClientStringFlag,
  getFlagshipClient,
} from './client';

import { assertPrefetchFlagAvailable } from './prefetch';

import { getInitializedFlagshipClientContext } from './provider';

export class ClientFlagEvaluationError extends Error {
  public override readonly name = 'ClientFlagEvaluationError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function evaluateClientFlag(
  definition: AnyFlagDefinition,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult {
  switch (definition.kind) {
    case 'boolean':
      return evaluateClientBooleanFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'string':
      return evaluateClientStringFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'number':
      return evaluateClientNumberFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    case 'object':
      return evaluateClientObjectFlag(
        definition.key,
        definition.defaultValue,
        options,
      );

    default:
      return assertNeverFlagKind(definition);
  }
}

export function evaluateClientBooleanDefinition(
  definition: BooleanFlagDefinition,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<boolean> {
  return evaluateClientBooleanFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export function evaluateClientStringDefinition(
  definition: StringFlagDefinition,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<string> {
  return evaluateClientStringFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export function evaluateClientNumberDefinition(
  definition: NumberFlagDefinition,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<number> {
  return evaluateClientNumberFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export function evaluateClientObjectDefinition<TValue extends FlagJsonValue>(
  definition: ObjectFlagDefinition<TValue>,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<TValue> {
  return evaluateClientObjectFlag(
    definition.key,
    definition.defaultValue,
    options,
  );
}

export function evaluateClientBooleanFlag(
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<boolean> {
  const client = resolveClientFlagClient(options);
  const context = resolveClientEvaluationContext();

  try {
    assertClientCanEvaluateFlag(key);

    if (options.details) {
      const details = getClientBooleanDetails(
        client,
        key,
        defaultValue,
      ) as OpenFeatureEvaluationDetails<boolean>;

      return createClientEvaluationResultFromDetails({
        key,
        kind: 'boolean',
        defaultValue,
        context,
        details,
      });
    }

    const value = getClientBooleanFlag(client, key, defaultValue);

    return createClientEvaluationResult({
      key,
      kind: 'boolean',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleClientEvaluationFailure({
      key,
      kind: 'boolean',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export function evaluateClientStringFlag(
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<string> {
  const client = resolveClientFlagClient(options);
  const context = resolveClientEvaluationContext();

  try {
    assertClientCanEvaluateFlag(key);

    if (options.details) {
      const details = getClientStringDetails(
        client,
        key,
        defaultValue,
      ) as OpenFeatureEvaluationDetails<string>;

      return createClientEvaluationResultFromDetails({
        key,
        kind: 'string',
        defaultValue,
        context,
        details,
      });
    }

    const value = getClientStringFlag(client, key, defaultValue);

    return createClientEvaluationResult({
      key,
      kind: 'string',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleClientEvaluationFailure({
      key,
      kind: 'string',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export function evaluateClientNumberFlag(
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<number> {
  const client = resolveClientFlagClient(options);
  const context = resolveClientEvaluationContext();

  try {
    assertClientCanEvaluateFlag(key);

    if (options.details) {
      const details = getClientNumberDetails(
        client,
        key,
        defaultValue,
      ) as OpenFeatureEvaluationDetails<number>;

      return createClientEvaluationResultFromDetails({
        key,
        kind: 'number',
        defaultValue,
        context,
        details,
      });
    }

    const value = getClientNumberFlag(client, key, defaultValue);

    return createClientEvaluationResult({
      key,
      kind: 'number',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleClientEvaluationFailure({
      key,
      kind: 'number',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export function evaluateClientObjectFlag<TValue extends FlagJsonValue>(
  key: FlagKey,
  defaultValue: TValue,
  options: EvaluateClientFlagOptions = {},
): FlagEvaluationResult<TValue> {
  const client = resolveClientFlagClient(options);
  const context = resolveClientEvaluationContext();

  try {
    assertClientCanEvaluateFlag(key);

    if (options.details) {
      const details = getClientObjectDetails(
        client,
        key,
        defaultValue,
      ) as unknown as OpenFeatureEvaluationDetails<TValue>;

      return createClientEvaluationResultFromDetails({
        key,
        kind: 'object',
        defaultValue,
        context,
        details,
      });
    }

    const value = getClientObjectFlag<TValue>(client, key, defaultValue);

    return createClientEvaluationResult<TValue>({
      key,
      kind: 'object',
      value,
      defaultValue,
      context,
    });
  } catch (error) {
    return handleClientEvaluationFailure({
      key,
      kind: 'object',
      defaultValue,
      context,
      error,
      throwOnError: options.throwOnError,
    });
  }
}

export function evaluateClientFlagValue<TValue extends FlagValue>(
  definition: AnyFlagDefinition,
  options: EvaluateClientFlagOptions = {},
): TValue {
  const result = evaluateClientFlag(definition, options);

  return result.value as TValue;
}

export function evaluateClientFlagRegistry(
  registry: FlagRegistry,
  options: EvaluateClientFlagRegistryOptions = {},
): Record<FlagKey, FlagEvaluationResult> {
  const definitions = Object.values(registry).filter((definition) => {
    if (!options.only || options.only.length === 0) {
      return true;
    }

    return options.only.includes(definition.key);
  });

  const results = definitions.map((definition) =>
    evaluateClientFlag(definition, options),
  );

  return Object.fromEntries(results.map((result) => [result.key, result]));
}

export function evaluateClientFlagRegistryValues(
  registry: FlagRegistry,
  options: EvaluateClientFlagRegistryOptions = {},
): Record<FlagKey, FlagValue> {
  const results = evaluateClientFlagRegistry(registry, options);

  return Object.fromEntries(
    Object.entries(results).map(([key, result]) => [key, result.value]),
  );
}

export function isClientFlagEnabled(
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
): boolean {
  const result = evaluateClientBooleanFlag(key, defaultValue);

  return result.value;
}

export function requireClientFlagEnabled(key: FlagKey): void {
  const enabled = isClientFlagEnabled(key, false);

  if (!enabled) {
    throw new ClientFlagEvaluationError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Required client feature flag "${key}" is disabled.`,
    );
  }
}

export function assertClientCanEvaluateFlag(key: FlagKey): void {
  assertFlagshipClientReady();
  assertPrefetchFlagAvailable(getClientPrefetchFlags(), key);
}

export function createClientEvaluationResult<TValue extends FlagValue>(input: {
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

export function createClientEvaluationResultFromDetails<
  TValue extends FlagValue,
>(input: {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly details: OpenFeatureEvaluationDetails<TValue>;
}): FlagEvaluationResult<TValue> {
  return createClientEvaluationResult({
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

export function resolveClientEvaluationContext():
  | FlagEvaluationContext
  | undefined {
  return getInitializedFlagshipClientContext();
}

export function resolveClientFlagClient(
  options: EvaluateClientFlagOptions = {},
): FlagshipClient {
  return options.client ?? getFlagshipClient(options);
}

function handleClientEvaluationFailure<TValue extends FlagValue>(input: {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly error: unknown;
  readonly throwOnError?: boolean;
}): FlagEvaluationResult<TValue> {
  const error = toClientFlagEvaluationError(input.key, input.error);

  if (input.throwOnError) {
    throw error;
  }

  return createClientEvaluationResult({
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

function toClientFlagEvaluationError(
  key: FlagKey,
  error: unknown,
): ClientFlagEvaluationError {
  if (error instanceof ClientFlagEvaluationError) {
    return error;
  }

  if (error instanceof Error) {
    return new ClientFlagEvaluationError(
      FLAGS_ERROR_CODES.evaluationFailed,
      `Failed to evaluate client feature flag "${key}": ${error.message}`,
      error,
    );
  }

  return new ClientFlagEvaluationError(
    FLAGS_ERROR_CODES.evaluationFailed,
    `Failed to evaluate client feature flag "${key}".`,
    error,
  );
}

function removeUndefinedResultFields<TValue extends FlagValue>(
  result: FlagEvaluationResult<TValue>,
): FlagEvaluationResult<TValue> {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as FlagEvaluationResult<TValue>;
}

function assertNeverFlagKind(definition: never): never {
  throw new ClientFlagEvaluationError(
    FLAGS_ERROR_CODES.unsupportedValueKind,
    `Unsupported client feature flag kind: ${JSON.stringify(definition)}.`,
  );
}
