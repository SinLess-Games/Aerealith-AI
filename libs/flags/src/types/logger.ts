// libs/flags/src/types/logger.ts

export type FlagLogger = {
  readonly debug?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly info?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn?: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error?: (message: string, metadata?: Record<string, unknown>) => void;
};
