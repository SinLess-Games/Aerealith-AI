import { z } from 'zod';

export type ValidationPathSegment = string | number | symbol;

export type ValidationIssue = {
  path: string;
  pathSegments: string[];
  message: string;
  code?: string;
};

export type ValidationSuccess<T> = {
  success: true;
  data: T;
  issues: [];
  error: undefined;
  message: undefined;
};

export type ValidationFailure = {
  success: false;
  data: undefined;
  issues: ValidationIssue[];
  error: z.ZodError;
  message: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type ValidationOptions = {
  /**
   * Human-readable config name used in error messages.
   *
   * Examples:
   * - "app config"
   * - "cloudflare config"
   * - "database config"
   */
  name?: string;

  /**
   * Throw when validation fails.
   *
   * validateConfig() always throws on failure.
   * safeValidateConfig() does not throw.
   */
  throwOnError?: boolean;
};

export class ConfigValidationError extends Error {
  public override readonly name = 'ConfigValidationError';

  public readonly configName: string;

  public readonly issues: ValidationIssue[];

  public readonly zodError: z.ZodError;

  public constructor(configName: string, zodError: z.ZodError) {
    const issues = normalizeZodIssues(zodError.issues);
    const message = createValidationMessage(configName, issues);

    super(message);

    this.configName = configName;
    this.issues = issues;
    this.zodError = zodError;
  }
}

export function formatValidationPath(
  path: readonly ValidationPathSegment[],
): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path
    .map((segment) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }

      if (typeof segment === 'symbol') {
        return `[${String(segment)}]`;
      }

      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
        return segment;
      }

      return `[${JSON.stringify(segment)}]`;
    })
    .reduce((previous, current) => {
      if (current.startsWith('[')) {
        return `${previous}${current}`;
      }

      if (!previous) {
        return current;
      }

      return `${previous}.${current}`;
    }, '');
}

export function normalizeZodIssue(issue: z.ZodIssue): ValidationIssue {
  const pathSegments = issue.path.map((segment) => String(segment));

  return {
    path: formatValidationPath(issue.path),
    pathSegments,
    message: issue.message,
    code: issue.code,
  };
}

export function normalizeZodIssues(
  issues: readonly z.ZodIssue[],
): ValidationIssue[] {
  return issues.map((issue) => normalizeZodIssue(issue));
}

export function createValidationMessage(
  configName: string | undefined,
  issues: readonly ValidationIssue[],
): string {
  const resolvedName = configName?.trim() || 'config';

  if (issues.length === 0) {
    return `${resolvedName} validation failed.`;
  }

  const issueLines = issues.map((issue) => {
    return `- ${issue.path}: ${issue.message}`;
  });

  return [`${resolvedName} validation failed:`, ...issueLines].join('\n');
}

export function isZodError(value: unknown): value is z.ZodError {
  return value instanceof z.ZodError;
}

export function isValidationFailure<T>(
  result: ValidationResult<T>,
): result is ValidationFailure {
  return result.success === false;
}

export function isValidationSuccess<T>(
  result: ValidationResult<T>,
): result is ValidationSuccess<T> {
  return result.success === true;
}

export function safeValidateConfig<TConfig>(
  schema: z.ZodType<TConfig>,
  input: unknown,
  options: ValidationOptions = {},
): ValidationResult<TConfig> {
  const result = schema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      issues: [],
      error: undefined,
      message: undefined,
    };
  }

  const issues = normalizeZodIssues(result.error.issues);
  const message = createValidationMessage(options.name, issues);

  return {
    success: false,
    data: undefined,
    issues,
    error: result.error,
    message,
  };
}

export function validateConfig<TConfig>(
  schema: z.ZodType<TConfig>,
  input: unknown,
  options: ValidationOptions = {},
): TConfig {
  const result = safeValidateConfig(schema, input, options);

  if (result.success) {
    return result.data;
  }

  throw new ConfigValidationError(options.name ?? 'config', result.error);
}

export function validateConfigOrDefault<TConfig>(
  schema: z.ZodType<TConfig>,
  input: unknown,
  fallback: TConfig,
  options: ValidationOptions = {},
): TConfig {
  const result = safeValidateConfig(schema, input, options);

  if (result.success) {
    return result.data;
  }

  return fallback;
}

export function assertValidConfig<TConfig>(
  schema: z.ZodType<TConfig>,
  input: unknown,
  options: ValidationOptions = {},
): asserts input is TConfig {
  validateConfig(schema, input, options);
}

export function getValidationIssues(error: unknown): ValidationIssue[] {
  if (isZodError(error)) {
    return normalizeZodIssues(error.issues);
  }

  if (error instanceof ConfigValidationError) {
    return error.issues;
  }

  return [
    {
      path: '<unknown>',
      pathSegments: [],
      message: error instanceof Error ? error.message : String(error),
      code: undefined,
    },
  ];
}

export function getValidationMessage(
  error: unknown,
  configName = 'config',
): string {
  if (error instanceof ConfigValidationError) {
    return error.message;
  }

  if (isZodError(error)) {
    return createValidationMessage(configName, normalizeZodIssues(error.issues));
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function throwIfInvalid<TConfig>(
  result: ValidationResult<TConfig>,
  configName = 'config',
): TConfig {
  if (result.success) {
    return result.data;
  }

  throw new ConfigValidationError(configName, result.error);
}