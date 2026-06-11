// libs/flags/src/hono/helpers.ts

import { FLAGS_DEFAULT_VALUES } from '../constants';

import type {
  AnyFlagDefinition,
  EvaluateServerFlagOptions,
  FlagEvaluationContext,
  FlagEvaluationResult,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  FlagValue,
  HonoFlagBindings,
  HonoFlagContext,
  HonoFlagGuardOptions,
  HonoFlagHelperOptions,
  HonoFlagJsonOptions,
  ServerFlagEvaluator,
} from '../types';

import {
  evaluateServerBooleanFlag,
  evaluateServerFlag,
  evaluateServerFlagRegistry,
  evaluateServerFlagRegistryValues,
  evaluateServerFlagValue,
  evaluateServerNumberFlag,
  evaluateServerObjectFlag,
  evaluateServerStringFlag,
} from '../server';

import { getHonoFlagContext, getHonoFlags } from './context';

type HonoServerEvaluationOptions = HonoFlagHelperOptions &
  Pick<EvaluateServerFlagOptions, 'details' | 'throwOnError'>;

type HonoJsonContext = {
  readonly json: (body: unknown) => unknown;
};

type HonoJsonResult = unknown;

export async function flagBoolean<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
  options: HonoFlagHelperOptions = {},
): Promise<boolean> {
  return getHonoFlags(context).boolean(
    key,
    defaultValue,
    resolveHonoHelperContext(context, options),
  );
}

export async function flagString<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
  options: HonoFlagHelperOptions = {},
): Promise<string> {
  return getHonoFlags(context).string(
    key,
    defaultValue,
    resolveHonoHelperContext(context, options),
  );
}

export async function flagNumber<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
  options: HonoFlagHelperOptions = {},
): Promise<number> {
  return getHonoFlags(context).number(
    key,
    defaultValue,
    resolveHonoHelperContext(context, options),
  );
}

export async function flagObject<
  TValue extends FlagJsonValue,
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: TValue,
  options: HonoFlagHelperOptions = {},
): Promise<TValue> {
  return getHonoFlags(context).object(
    key,
    defaultValue,
    resolveHonoHelperContext(context, options),
  );
}

export async function flagEnabled<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  options: HonoFlagHelperOptions = {},
): Promise<boolean> {
  return flagBoolean(context, key, false, options);
}

export async function flagDisabled<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  options: HonoFlagHelperOptions = {},
): Promise<boolean> {
  return !(await flagEnabled(context, key, options));
}

export async function requireFlag<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  options: HonoFlagGuardOptions = {},
): Promise<void> {
  const enabled = await flagBoolean(
    context,
    key,
    options.defaultValue ?? false,
    options,
  );

  if (!enabled) {
    throw new HonoFlagGuardError(
      key,
      options.status ?? 404,
      options.message ?? `Feature flag "${key}" is disabled.`,
    );
  }
}

export async function requireFlags<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  keys: readonly FlagKey[],
  options: HonoFlagGuardOptions = {},
): Promise<void> {
  const results = await Promise.all(
    keys.map(async (key) => {
      return [
        key,
        await flagBoolean(
          context,
          key,
          options.defaultValue ?? false,
          options,
        ),
      ] as const;
    }),
  );

  const disabled = results
    .filter(([, enabled]) => !enabled)
    .map(([key]) => key);

  if (disabled.length > 0) {
    throw new HonoFlagGuardError(
      disabled.join(','),
      options.status ?? 404,
      options.message ??
        `Required feature flags are disabled: ${disabled.join(', ')}.`,
    );
  }
}

export async function anyFlagEnabled<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  keys: readonly FlagKey[],
  options: HonoFlagHelperOptions = {},
): Promise<boolean> {
  const values = await Promise.all(
    keys.map(async (key) => flagBoolean(context, key, false, options)),
  );

  return values.some(Boolean);
}

export async function allFlagsEnabled<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  keys: readonly FlagKey[],
  options: HonoFlagHelperOptions = {},
): Promise<boolean> {
  const values = await Promise.all(
    keys.map(async (key) => flagBoolean(context, key, false, options)),
  );

  return values.every(Boolean);
}

export async function getHonoFlagValues<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  registry: FlagRegistry,
  options: HonoFlagHelperOptions = {},
): Promise<Record<FlagKey, FlagValue>> {
  return evaluateServerFlagRegistryValues(registry, {
    context: resolveHonoHelperContext(context, options),
  });
}

export async function getHonoFlagResults<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  registry: FlagRegistry,
  options: HonoServerEvaluationOptions = {},
): Promise<Record<FlagKey, FlagEvaluationResult>> {
  return evaluateServerFlagRegistry(registry, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export async function getHonoFlagValueFromDefinition<
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  definition: AnyFlagDefinition,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagValue> {
  return evaluateServerFlagValue(definition, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export async function getHonoFlagResultFromDefinition<
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  definition: AnyFlagDefinition,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagEvaluationResult> {
  return evaluateServerFlag(definition, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export function getHonoFlagEvaluator<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
): ServerFlagEvaluator {
  return getHonoFlags(context);
}

export function resolveHonoHelperContext<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  options: HonoFlagHelperOptions = {},
): FlagEvaluationContext {
  if (options.context) {
    return options.defaultContext === false
      ? options.context
      : {
          ...getHonoFlagContext(context),
          ...options.context,
        };
  }

  return getHonoFlagContext(context);
}

export async function jsonFlagState<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  registry: FlagRegistry,
  options: HonoFlagJsonOptions = {},
): Promise<HonoJsonResult> {
  const flagContext = resolveHonoHelperContext(context, options);
  const values = await evaluateServerFlagRegistryValues(registry, {
    context: flagContext,
  });

  return toHonoJsonContext(context).json({
    flags: values,
    ...(options.includeContext ? { context: flagContext } : {}),
  });
}

export async function jsonFlagResultState<TBindings extends HonoFlagBindings>(
  context: HonoFlagContext<TBindings>,
  registry: FlagRegistry,
  options: HonoFlagJsonOptions &
    Pick<EvaluateServerFlagOptions, 'details' | 'throwOnError'> = {},
): Promise<HonoJsonResult> {
  const flagContext = resolveHonoHelperContext(context, options);
  const results = await evaluateServerFlagRegistry(registry, {
    context: flagContext,
    details: options.details,
    throwOnError: options.throwOnError,
  });

  return toHonoJsonContext(context).json({
    flags: results,
    ...(options.includeContext ? { context: flagContext } : {}),
  });
}

export async function evaluateHonoBooleanFlag<
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: boolean = FLAGS_DEFAULT_VALUES.boolean,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagEvaluationResult<boolean>> {
  return evaluateServerBooleanFlag(key, defaultValue, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export async function evaluateHonoStringFlag<
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: string = FLAGS_DEFAULT_VALUES.string,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagEvaluationResult<string>> {
  return evaluateServerStringFlag(key, defaultValue, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export async function evaluateHonoNumberFlag<
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: number = FLAGS_DEFAULT_VALUES.number,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagEvaluationResult<number>> {
  return evaluateServerNumberFlag(key, defaultValue, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export async function evaluateHonoObjectFlag<
  TValue extends FlagJsonValue,
  TBindings extends HonoFlagBindings,
>(
  context: HonoFlagContext<TBindings>,
  key: FlagKey,
  defaultValue: TValue,
  options: HonoServerEvaluationOptions = {},
): Promise<FlagEvaluationResult<TValue>> {
  return evaluateServerObjectFlag(key, defaultValue, {
    context: resolveHonoHelperContext(context, options),
    details: options.details,
    throwOnError: options.throwOnError,
  });
}

export class HonoFlagGuardError extends Error {
  public override readonly name = 'HonoFlagGuardError';

  public constructor(
    public readonly flagKey: FlagKey,
    public readonly status = 404,
    message = `Feature flag "${flagKey}" is disabled.`,
  ) {
    super(message);
  }
}

function toHonoJsonContext(context: unknown): HonoJsonContext {
  return context as HonoJsonContext;
}
