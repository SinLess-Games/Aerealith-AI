import { FLAGS_ERROR_CODES } from '../constants';

import type {
  ClientFlagEvaluator,
  FlagDefaultValues,
  FlagEvaluationContext,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  FlagValue,
  FlagValueKind,
  MockFlagProviderOptions,
  MockFlagValues,
  ServerFlagEvaluator,
} from '../types';

import {
  createMockFlagProviderOptions,
  createMockFlagValues,
  getMockFlagDefaultValue,
  getMockFlagDefinition,
  MOCK_DEFAULT_FLAG_VALUES,
  MOCK_FLAG_REGISTRY,
  MOCK_FLAG_VALUES,
} from './mock-flags';

const DEFAULT_MOCK_BOOLEAN_VALUE = Boolean(false);
const DEFAULT_MOCK_STRING_VALUE = String('');
const DEFAULT_MOCK_NUMBER_VALUE = Number(0);

export type MockFlagResolver<TValue extends FlagValue = FlagValue> = (
  input: MockFlagResolutionInput<TValue>,
) => TValue;

export type MockFlagResolutionInput<TValue extends FlagValue = FlagValue> = {
  readonly key: FlagKey;
  readonly defaultValue: TValue;
  readonly context?: FlagEvaluationContext;
  readonly values: MockFlagValues;
  readonly registry: FlagRegistry;
};

export type MockFlagProviderState = {
  readonly values: MockFlagValues;
  readonly defaultValues: FlagDefaultValues;
  readonly registry: FlagRegistry;
  readonly context?: FlagEvaluationContext;
  readonly resolvers: Partial<Record<FlagKey, MockFlagResolver>>;
};

export type CreateMockFlagProviderOptions = MockFlagProviderOptions & {
  readonly registry?: FlagRegistry;
  readonly resolvers?: Partial<Record<FlagKey, MockFlagResolver>>;
};

export type MockFlagProvider = {
  readonly name: string;

  getState: () => MockFlagProviderState;
  getValues: () => MockFlagValues;
  getContext: () => FlagEvaluationContext | undefined;
  getRegistry: () => FlagRegistry;

  setContext: (context: FlagEvaluationContext | undefined) => void;
  setValue: (key: FlagKey, value: FlagValue) => void;
  setValues: (values: MockFlagValues) => void;
  patchValues: (values: MockFlagValues) => void;
  resetValues: () => void;

  resolveBooleanValue: (
    key: FlagKey,
    defaultValue?: boolean,
    context?: FlagEvaluationContext,
  ) => boolean;

  resolveStringValue: (
    key: FlagKey,
    defaultValue?: string,
    context?: FlagEvaluationContext,
  ) => string;

  resolveNumberValue: (
    key: FlagKey,
    defaultValue?: number,
    context?: FlagEvaluationContext,
  ) => number;

  resolveObjectValue: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => TValue;

  createServerEvaluator: () => ServerFlagEvaluator;
  createClientEvaluator: () => ClientFlagEvaluator;
};

export class MockFlagProviderError extends Error {
  public override readonly name = 'MockFlagProviderError';

  public constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function createMockFlagProvider(
  options: CreateMockFlagProviderOptions = {},
): MockFlagProvider {
  const normalizedOptions = createMockFlagProviderOptions(options);

  let state: MockFlagProviderState = {
    values: createMockFlagValues(normalizedOptions.values),
    defaultValues: {
      ...MOCK_DEFAULT_FLAG_VALUES,
      ...normalizedOptions.defaultValues,
    },
    registry: options.registry ?? MOCK_FLAG_REGISTRY,
    context: normalizedOptions.context,
    resolvers: options.resolvers ?? {},
  };

  const provider: MockFlagProvider = {
    name: 'aerealith-mock-flag-provider',

    getState: () => state,

    getValues: () => state.values,

    getContext: () => state.context,

    getRegistry: () => state.registry,

    setContext: (context) => {
      state = {
        ...state,
        context,
      };
    },

    setValue: (key, value) => {
      state = {
        ...state,
        values: {
          ...state.values,
          [key]: value,
        },
      };
    },

    setValues: (values) => {
      state = {
        ...state,
        values,
      };
    },

    patchValues: (values) => {
      state = {
        ...state,
        values: {
          ...state.values,
          ...values,
        },
      };
    },

    resetValues: () => {
      state = {
        ...state,
        values: createMockFlagValues(),
      };
    },

    resolveBooleanValue: (
      key,
      defaultValue: boolean = state.defaultValues.boolean,
      context,
    ) => {
      return resolveMockBooleanFlag(provider, key, defaultValue, context);
    },

    resolveStringValue: (
      key,
      defaultValue: string = state.defaultValues.string,
      context,
    ) => {
      return resolveMockStringFlag(provider, key, defaultValue, context);
    },

    resolveNumberValue: (
      key,
      defaultValue: number = state.defaultValues.number,
      context,
    ) => {
      return resolveMockNumberFlag(provider, key, defaultValue, context);
    },

    resolveObjectValue: <TValue extends FlagJsonValue>(
      key: FlagKey,
      defaultValue: TValue,
      context?: FlagEvaluationContext,
    ): TValue => {
      return resolveMockObjectFlag(provider, key, defaultValue, context);
    },

    createServerEvaluator: () => createMockServerFlagEvaluator(provider),

    createClientEvaluator: () => createMockClientFlagEvaluator(provider),
  };

  return provider;
}

export function createMockServerFlagEvaluator(
  provider: MockFlagProvider = createMockFlagProvider(),
): ServerFlagEvaluator {
  return {
    boolean: async (
      key,
      defaultValue: boolean = provider.getState().defaultValues.boolean,
      context,
    ) => provider.resolveBooleanValue(key, defaultValue, context),

    string: async (
      key,
      defaultValue: string = provider.getState().defaultValues.string,
      context,
    ) => provider.resolveStringValue(key, defaultValue, context),

    number: async (
      key,
      defaultValue: number = provider.getState().defaultValues.number,
      context,
    ) => provider.resolveNumberValue(key, defaultValue, context),

    object: async <TValue extends FlagJsonValue>(
      key: FlagKey,
      defaultValue: TValue,
      context?: FlagEvaluationContext,
    ): Promise<TValue> => provider.resolveObjectValue(key, defaultValue, context),
  };
}

export function createMockClientFlagEvaluator(
  provider: MockFlagProvider = createMockFlagProvider(),
): ClientFlagEvaluator {
  return {
    boolean: (
      key,
      defaultValue: boolean = provider.getState().defaultValues.boolean,
      context,
    ) => provider.resolveBooleanValue(key, defaultValue, context),

    string: (
      key,
      defaultValue: string = provider.getState().defaultValues.string,
      context,
    ) => provider.resolveStringValue(key, defaultValue, context),

    number: (
      key,
      defaultValue: number = provider.getState().defaultValues.number,
      context,
    ) => provider.resolveNumberValue(key, defaultValue, context),

    object: <TValue extends FlagJsonValue>(
      key: FlagKey,
      defaultValue: TValue,
      context?: FlagEvaluationContext,
    ): TValue => provider.resolveObjectValue(key, defaultValue, context),
  };
}

export function resolveMockFlagValue<TValue extends FlagValue>(
  provider: MockFlagProvider,
  key: FlagKey,
  defaultValue: TValue,
  context?: FlagEvaluationContext,
): TValue {
  const state = provider.getState();
  const resolver = state.resolvers[key];

  if (resolver) {
    return resolver({
      key,
      defaultValue,
      context: context ?? state.context,
      values: state.values,
      registry: state.registry,
    }) as TValue;
  }

  const value = state.values[key];

  if (value !== undefined) {
    return value as TValue;
  }

  const definitionDefaultValue = getMockFlagDefaultValueOrUndefined(
    key,
    state.registry,
  );

  if (definitionDefaultValue !== undefined) {
    return definitionDefaultValue as TValue;
  }

  return defaultValue;
}

export function resolveMockBooleanFlag(
  provider: MockFlagProvider,
  key: FlagKey,
  defaultValue = DEFAULT_MOCK_BOOLEAN_VALUE,
  context?: FlagEvaluationContext,
): boolean {
  const value = resolveMockFlagValue(provider, key, defaultValue, context);

  if (typeof value !== 'boolean') {
    throw createMockFlagTypeError(key, 'boolean', value);
  }

  return value;
}

export function resolveMockStringFlag(
  provider: MockFlagProvider,
  key: FlagKey,
  defaultValue = DEFAULT_MOCK_STRING_VALUE,
  context?: FlagEvaluationContext,
): string {
  const value = resolveMockFlagValue(provider, key, defaultValue, context);

  if (typeof value !== 'string') {
    throw createMockFlagTypeError(key, 'string', value);
  }

  return value;
}

export function resolveMockNumberFlag(
  provider: MockFlagProvider,
  key: FlagKey,
  defaultValue = DEFAULT_MOCK_NUMBER_VALUE,
  context?: FlagEvaluationContext,
): number {
  const value = resolveMockFlagValue(provider, key, defaultValue, context);

  if (typeof value !== 'number') {
    throw createMockFlagTypeError(key, 'number', value);
  }

  return value;
}

export function resolveMockObjectFlag<TValue extends FlagJsonValue>(
  provider: MockFlagProvider,
  key: FlagKey,
  defaultValue: TValue,
  context?: FlagEvaluationContext,
): TValue {
  const value = resolveMockFlagValue(provider, key, defaultValue, context);

  if (!isJsonObjectLike(value)) {
    throw createMockFlagTypeError(key, 'object', value);
  }

  return value as TValue;
}

export function createContextualMockResolver<TValue extends FlagValue>(input: {
  readonly fallback: TValue;
  readonly match: (context: FlagEvaluationContext | undefined) => boolean;
  readonly value: TValue;
}): MockFlagResolver<TValue> {
  return ({ context }) => {
    return input.match(context) ? input.value : input.fallback;
  };
}

export function createPlanMockResolver<TValue extends FlagValue>(input: {
  readonly fallback: TValue;
  readonly values: Partial<Record<string, TValue>>;
}): MockFlagResolver<TValue> {
  return ({ context }) => {
    const plan = typeof context?.plan === 'string' ? context.plan : undefined;

    if (!plan) {
      return input.fallback;
    }

    return input.values[plan] ?? input.fallback;
  };
}

export function createRoleMockResolver<TValue extends FlagValue>(input: {
  readonly fallback: TValue;
  readonly values: Partial<Record<string, TValue>>;
}): MockFlagResolver<TValue> {
  return ({ context }) => {
    const role = typeof context?.role === 'string' ? context.role : undefined;

    if (!role) {
      return input.fallback;
    }

    return input.values[role] ?? input.fallback;
  };
}

export function createEnvironmentMockResolver<TValue extends FlagValue>(input: {
  readonly fallback: TValue;
  readonly values: Partial<Record<string, TValue>>;
}): MockFlagResolver<TValue> {
  return ({ context }) => {
    const environment =
      typeof context?.environment === 'string'
        ? context.environment
        : undefined;

    if (!environment) {
      return input.fallback;
    }

    return input.values[environment] ?? input.fallback;
  };
}

export function createMockProviderWithValues(
  values: MockFlagValues,
  options: Omit<CreateMockFlagProviderOptions, 'values'> = {},
): MockFlagProvider {
  return createMockFlagProvider({
    ...options,
    values,
  });
}

export function createMockProviderWithContext(
  context: FlagEvaluationContext,
  options: Omit<CreateMockFlagProviderOptions, 'context'> = {},
): MockFlagProvider {
  return createMockFlagProvider({
    ...options,
    context,
  });
}

export function createMockProviderWithResolvers(
  resolvers: Partial<Record<FlagKey, MockFlagResolver>>,
  options: Omit<CreateMockFlagProviderOptions, 'resolvers'> = {},
): MockFlagProvider {
  return createMockFlagProvider({
    ...options,
    resolvers,
  });
}

export function createMockProviderValueSnapshot(
  provider: MockFlagProvider,
): MockFlagValues {
  return {
    ...provider.getValues(),
  };
}

export function restoreMockProviderValueSnapshot(
  provider: MockFlagProvider,
  snapshot: MockFlagValues,
): void {
  provider.setValues(snapshot);
}

export function resetMockProvider(
  provider: MockFlagProvider,
  options: CreateMockFlagProviderOptions = {},
): void {
  provider.setContext(options.context);
  provider.setValues(createMockFlagValues(options.values));
}

export function getMockProviderFlagKind(
  provider: MockFlagProvider,
  key: FlagKey,
): FlagValueKind | undefined {
  return getMockFlagDefinition(key, provider.getRegistry())?.kind;
}

export function hasMockProviderFlag(
  provider: MockFlagProvider,
  key: FlagKey,
): boolean {
  return (
    key in provider.getValues() ||
    Boolean(getMockFlagDefinition(key, provider.getRegistry()))
  );
}

export function assertMockProviderFlag(
  provider: MockFlagProvider,
  key: FlagKey,
): void {
  if (!hasMockProviderFlag(provider, key)) {
    throw new MockFlagProviderError(
      FLAGS_ERROR_CODES.flagNotFound,
      `Mock feature flag was not found: ${key}`,
    );
  }
}

function getMockFlagDefaultValueOrUndefined(
  key: FlagKey,
  registry: FlagRegistry,
): FlagValue | undefined {
  try {
    return getMockFlagDefaultValue(key, registry);
  } catch {
    return undefined;
  }
}

function createMockFlagTypeError(
  key: FlagKey,
  expectedKind: FlagValueKind,
  actualValue: unknown,
): MockFlagProviderError {
  return new MockFlagProviderError(
    FLAGS_ERROR_CODES.invalidDefaultValue,
    `Mock feature flag "${key}" expected ${expectedKind} value but received ${typeof actualValue}.`,
    actualValue,
  );
}

function isJsonObjectLike(value: unknown): value is FlagJsonValue {
  if (value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return true;
  }

  return typeof value === 'object' && value !== null;
}

export const DEFAULT_MOCK_FLAG_PROVIDER = createMockFlagProvider({
  values: MOCK_FLAG_VALUES,
});