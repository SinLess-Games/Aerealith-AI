import type { AppConfig } from '../types/app';

import {
  defaultAppConfig,
  defaultCloudflareAppConfig,
  defaultLocalAppConfig,
} from '../defaults/app.defaults';
import { appSchema } from '../schema/app.schema';
import {
  deepClone,
  deepMerge,
  type DeepMergeOptions,
  type DeepPartial,
} from '../utils/deep-merge';
import {
  ConfigValidationError,
  safeValidateConfig,
  type ValidationIssue,
  type ValidationResult,
} from '../utils/validation';

export type ObjectConfigProfile = 'default' | 'local' | 'cloudflare';

export type LoadConfigFromObjectOptions = {
  /**
   * Selects the default baseline before object overrides are applied.
   */
  profile?: ObjectConfigProfile;

  /**
   * Human-readable name used in validation errors.
   */
  name?: string;

  /**
   * Array merge behavior used when applying object overrides.
   */
  arrayStrategy?: DeepMergeOptions['arrayStrategy'];

  /**
   * Whether undefined values in the override object should overwrite defaults.
   */
  undefinedStrategy?: DeepMergeOptions['undefinedStrategy'];

  /**
   * If true, empty or undefined input is treated as an empty override object.
   */
  allowEmpty?: boolean;
};

export type LoadConfigFromObjectResult = {
  config: AppConfig;
  profile: ObjectConfigProfile;
  defaults: AppConfig;
  overrides: Record<string, unknown>;
};

export class ObjectConfigParseError extends Error {
  public override readonly name = 'ObjectConfigParseError';

  public readonly configName: string;

  public readonly issues: ValidationIssue[];

  public constructor(configName: string, issues: ValidationIssue[]) {
    super(createObjectConfigErrorMessage(configName, issues));

    this.configName = configName;
    this.issues = issues;
  }
}

export function loadConfigFromObject(
  input: unknown = {},
  options: LoadConfigFromObjectOptions = {},
): AppConfig {
  return loadConfigFromObjectDetailed(input, options).config;
}

export function loadConfigFromObjectDetailed(
  input: unknown = {},
  options: LoadConfigFromObjectOptions = {},
): LoadConfigFromObjectResult {
  const configName = options.name ?? 'object config';
  const profile = options.profile ?? 'default';
  const overrides = normalizeObjectConfigInput(input, {
    name: configName,
    allowEmpty: options.allowEmpty ?? true,
  });

  const defaults = resolveObjectConfigDefaults(profile);
  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: options.undefinedStrategy ?? 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return {
    config: validation.data,
    profile,
    defaults,
    overrides,
  };
}

export function safeLoadConfigFromObject(
  input: unknown = {},
  options: LoadConfigFromObjectOptions = {},
): ValidationResult<AppConfig> {
  try {
    const result = loadConfigFromObjectDetailed(input, options);

    return {
      success: true,
      data: result.config,
      issues: [],
      error: undefined,
      message: undefined,
    };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return {
        success: false,
        data: undefined,
        issues: error.issues,
        error: error.zodError,
        message: error.message,
      };
    }

    if (error instanceof ObjectConfigParseError) {
      const validation = safeValidateConfig(appSchema, {}, {
        name: options.name ?? 'object config',
      });

      if (!validation.success) {
        return {
          success: false,
          data: undefined,
          issues: error.issues,
          error: validation.error,
          message: error.message,
        };
      }
    }

    throw error;
  }
}

export function parseObjectConfig(
  input: unknown,
  name = 'object config',
): Record<string, unknown> {
  return normalizeObjectConfigInput(input, {
    name,
    allowEmpty: false,
  });
}

export function mergeObjectConfig(
  baseConfig: AppConfig,
  overridesInput: unknown,
  options: Omit<LoadConfigFromObjectOptions, 'profile'> = {},
): AppConfig {
  const configName = options.name ?? 'object config';
  const overrides = normalizeObjectConfigInput(overridesInput, {
    name: configName,
    allowEmpty: options.allowEmpty ?? true,
  });

  const mergedConfig = deepMerge(baseConfig, overrides, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: options.undefinedStrategy ?? 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function validateObjectConfig(
  input: unknown,
  options: LoadConfigFromObjectOptions = {},
): AppConfig {
  const configName = options.name ?? 'object config';
  const objectConfig = normalizeObjectConfigInput(input, {
    name: configName,
    allowEmpty: options.allowEmpty ?? false,
  });

  const validation = safeValidateConfig(appSchema, objectConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function createObjectConfigOverride(
  override: DeepPartial<AppConfig>,
): DeepPartial<AppConfig> {
  return deepClone(override);
}

export function resolveObjectConfigDefaults(
  profile: ObjectConfigProfile = 'default',
): AppConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareAppConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalAppConfig);
  }

  return deepClone(defaultAppConfig);
}

export function normalizeObjectConfigInput(
  input: unknown,
  options: {
    name?: string;
    allowEmpty?: boolean;
  } = {},
): Record<string, unknown> {
  const configName = options.name ?? 'object config';
  const allowEmpty = options.allowEmpty ?? true;

  if (input === undefined || input === null) {
    if (allowEmpty) {
      return {};
    }

    throw new ObjectConfigParseError(configName, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'Config input is required.',
        code: 'missing_input',
      },
    ]);
  }

  if (!isPlainObject(input)) {
    throw new ObjectConfigParseError(configName, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'Config input must be a plain object.',
        code: 'invalid_root',
      },
    ]);
  }

  return deepClone(input) as Record<string, unknown>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function createObjectConfigErrorMessage(
  configName: string,
  issues: readonly ValidationIssue[],
): string {
  if (issues.length === 0) {
    return `${configName} parsing failed.`;
  }

  return [
    `${configName} parsing failed:`,
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
  ].join('\n');
}