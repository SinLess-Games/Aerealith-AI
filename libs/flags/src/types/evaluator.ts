// libs/flags/src/types/evaluator.ts

import type {
  FlagEvaluationContext,
  FlagJsonValue,
  FlagKey,
  FlagProviderRuntime,
} from './core';

export type FlagClientMode = 'async' | 'sync';

export type FlagClientBase = {
  readonly runtime: FlagProviderRuntime;
  readonly mode: FlagClientMode;
};

export type AsyncFlagClient = FlagClientBase & {
  readonly mode: 'async';

  readonly getBooleanValue: (
    key: FlagKey,
    defaultValue: boolean,
    context?: FlagEvaluationContext,
  ) => Promise<boolean>;

  readonly getStringValue: (
    key: FlagKey,
    defaultValue: string,
    context?: FlagEvaluationContext,
  ) => Promise<string>;

  readonly getNumberValue: (
    key: FlagKey,
    defaultValue: number,
    context?: FlagEvaluationContext,
  ) => Promise<number>;

  readonly getObjectValue: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => Promise<TValue>;
};

export type SyncFlagClient = FlagClientBase & {
  readonly mode: 'sync';

  readonly getBooleanValue: (
    key: FlagKey,
    defaultValue: boolean,
    context?: FlagEvaluationContext,
  ) => boolean;

  readonly getStringValue: (
    key: FlagKey,
    defaultValue: string,
    context?: FlagEvaluationContext,
  ) => string;

  readonly getNumberValue: (
    key: FlagKey,
    defaultValue: number,
    context?: FlagEvaluationContext,
  ) => number;

  readonly getObjectValue: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => TValue;
};

export type AnyFlagClient = AsyncFlagClient | SyncFlagClient;

export type ServerFlagEvaluator = {
  readonly boolean: (
    key: FlagKey,
    defaultValue?: boolean,
    context?: FlagEvaluationContext,
  ) => Promise<boolean>;

  readonly string: (
    key: FlagKey,
    defaultValue?: string,
    context?: FlagEvaluationContext,
  ) => Promise<string>;

  readonly number: (
    key: FlagKey,
    defaultValue?: number,
    context?: FlagEvaluationContext,
  ) => Promise<number>;

  readonly object: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => Promise<TValue>;
};

export type ClientFlagEvaluator = {
  readonly boolean: (
    key: FlagKey,
    defaultValue?: boolean,
    context?: FlagEvaluationContext,
  ) => boolean;

  readonly string: (
    key: FlagKey,
    defaultValue?: string,
    context?: FlagEvaluationContext,
  ) => string;

  readonly number: (
    key: FlagKey,
    defaultValue?: number,
    context?: FlagEvaluationContext,
  ) => number;

  readonly object: <TValue extends FlagJsonValue>(
    key: FlagKey,
    defaultValue: TValue,
    context?: FlagEvaluationContext,
  ) => TValue;
};
