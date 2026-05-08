import { parseDocument } from 'yaml';

import type { AppConfig } from '../types/app';

import {
  defaultAppConfig,
  defaultCloudflareAppConfig,
  defaultLocalAppConfig,
} from '../defaults/app.defaults';
import { appSchema } from '../schema/app.schema';
import { deepClone, deepMerge } from '../utils/deep-merge';
import {
  ConfigValidationError,
  safeValidateConfig,
  type ValidationIssue,
} from '../utils/validation';

export type YamlConfigProfile = 'default' | 'local' | 'cloudflare';

export type LoadConfigFromYamlOptions = {
  /**
   * Selects the default baseline before YAML overrides are applied.
   */
  profile?: YamlConfigProfile;

  /**
   * Human-readable name used in error messages.
   */
  name?: string;

  /**
   * Keep YAML warnings as non-fatal by default.
   */
  failOnWarnings?: boolean;

  /**
   * Array merge behavior used when applying YAML overrides.
   */
  arrayStrategy?: 'replace' | 'concat' | 'merge-by-index';
};

export type LoadConfigFromYamlResult = {
  config: AppConfig;
  warnings: YamlLoaderWarning[];
};

export type YamlLoaderWarning = {
  message: string;
  linePos?: unknown;
};

export class YamlConfigParseError extends Error {
  public override readonly name = 'YamlConfigParseError';

  public readonly configName: string;

  public readonly issues: ValidationIssue[];

  public constructor(configName: string, issues: ValidationIssue[]) {
    super(createYamlErrorMessage(configName, issues));

    this.configName = configName;
    this.issues = issues;
  }
}

export class YamlConfigWarningError extends Error {
  public override readonly name = 'YamlConfigWarningError';

  public readonly configName: string;

  public readonly warnings: YamlLoaderWarning[];

  public constructor(configName: string, warnings: YamlLoaderWarning[]) {
    super(createYamlWarningMessage(configName, warnings));

    this.configName = configName;
    this.warnings = warnings;
  }
}

export function loadConfigFromYaml(
  yamlSource: string,
  options: LoadConfigFromYamlOptions = {},
): AppConfig {
  return loadConfigFromYamlDetailed(yamlSource, options).config;
}

export function loadConfigFromYamlDetailed(
  yamlSource: string,
  options: LoadConfigFromYamlOptions = {},
): LoadConfigFromYamlResult {
  const configName = options.name ?? 'yaml config';
  const document = parseDocument(yamlSource, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    throw new YamlConfigParseError(
      configName,
      document.errors.map((error) => ({
        path: '<yaml>',
        pathSegments: [],
        message: error.message,
        code: error.name,
      })),
    );
  }

  const warnings = document.warnings.map((warning) => ({
    message: warning.message,
    linePos: warning.linePos,
  }));

  if (options.failOnWarnings === true && warnings.length > 0) {
    throw new YamlConfigWarningError(configName, warnings);
  }

  const yamlValue = document.toJSON();

  if (yamlValue !== null && !isPlainObject(yamlValue)) {
    throw new YamlConfigParseError(configName, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'YAML config root must be a mapping/object.',
        code: 'invalid_root',
      },
    ]);
  }

  const defaults = resolveYamlConfigDefaults(options.profile);
  const mergedConfig = deepMerge(defaults, yamlValue ?? {}, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return {
    config: validation.data as AppConfig,
    warnings,
  };
}

export function parseYamlToObject(
  yamlSource: string,
  name = 'yaml object',
): Record<string, unknown> {
  const document = parseDocument(yamlSource, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    throw new YamlConfigParseError(
      name,
      document.errors.map((error) => ({
        path: '<yaml>',
        pathSegments: [],
        message: error.message,
        code: error.name,
      })),
    );
  }

  const value = document.toJSON();

  if (value === null) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new YamlConfigParseError(name, [
      {
        path: '<root>',
        pathSegments: [],
        message: 'YAML root must be a mapping/object.',
        code: 'invalid_root',
      },
    ]);
  }

  return value;
}

export function mergeYamlConfig(
  baseConfig: AppConfig,
  yamlSource: string,
  options: Omit<LoadConfigFromYamlOptions, 'profile'> = {},
): AppConfig {
  const configName = options.name ?? 'yaml config';
  const overrides = parseYamlToObject(yamlSource, configName);

  const mergedConfig = deepMerge(baseConfig, overrides, {
    arrayStrategy: options.arrayStrategy ?? 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(appSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data as AppConfig;
}

export function resolveYamlConfigDefaults(
  profile: YamlConfigProfile = 'default',
): AppConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareAppConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalAppConfig);
  }

  return deepClone(defaultAppConfig);
}

function createYamlErrorMessage(
  configName: string,
  issues: readonly ValidationIssue[],
): string {
  if (issues.length === 0) {
    return `${configName} YAML parsing failed.`;
  }

  return [
    `${configName} YAML parsing failed:`,
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
  ].join('\n');
}

function createYamlWarningMessage(
  configName: string,
  warnings: readonly YamlLoaderWarning[],
): string {
  if (warnings.length === 0) {
    return `${configName} YAML warnings were emitted.`;
  }

  return [
    `${configName} YAML warnings were emitted:`,
    ...warnings.map((warning) => `- ${warning.message}`),
  ].join('\n');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}