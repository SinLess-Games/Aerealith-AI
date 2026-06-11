// libs/flags/src/types/telemetry.ts

import type {
  FlagEvaluationContext,
  FlagEvaluationError,
  FlagKey,
  FlagProviderRuntime,
  FlagValueKind,
} from './core';

export type FlagTelemetryEvent = {
  readonly key: FlagKey;
  readonly kind: FlagValueKind;
  readonly runtime: FlagProviderRuntime;
  readonly durationMs?: number;
  readonly context?: FlagEvaluationContext;
  readonly success: boolean;
  readonly error?: FlagEvaluationError;
};

export type FlagTelemetryReporter = {
  readonly report: (event: FlagTelemetryEvent) => void | Promise<void>;
};
