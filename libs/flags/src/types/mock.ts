// libs/flags/src/types/mock.ts

import type {
  FlagDefaultValues,
  FlagEvaluationContext,
  FlagJsonValue,
  FlagKey,
  FlagRegistry,
  FlagValue,
} from './core';
import type {
  ClientFlagEvaluator,
  ServerFlagEvaluator,
} from './evaluator';

export type MockFlagValues = Partial<Record<FlagKey, FlagValue>>;

export type MockFlagProviderOptions = {
  readonly values?: MockFlagValues;
  readonly defaultValues?: Partial<FlagDefaultValues>;
  readonly context?: FlagEvaluationContext;
};

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
