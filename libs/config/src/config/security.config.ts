import type { SecurityConfig } from '../types/security';

import {
  defaultLocalSecurityConfig,
  defaultProductionSecurityConfig,
  defaultSecurityConfig,
} from '../defaults/security.defaults';
import { securitySchema } from '../schema/security.schema';
import { deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type SecurityConfigProfile = 'default' | 'local' | 'production' | 'auto';

export type ResolvedSecurityConfigProfile = Exclude<
  SecurityConfigProfile,
  'auto'
>;

export type SecurityConfigOptions = {
  name?: string;
  profile?: SecurityConfigProfile;
  defaults?: SecurityConfig;
};

export const fallbackSecurityUuidNamespace =
  '4a85e34a-92b8-4c21-9e90-9e4d9630a1bb';

export function createSecurityConfig(
  env: EnvRecord = {},
  options: SecurityConfigOptions = {},
): SecurityConfig {
  const configName = options.name ?? 'security config';
  const profile = resolveSecurityConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveSecurityConfigDefaults(profile);
  const overrides = buildSecurityConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(securitySchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildSecurityConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyCoreSecurityOverrides(env, overrides);
  applyCookieOverrides(env, overrides);
  applyCorsOverrides(env, overrides);
  applyHeaderOverrides(env, overrides);
  applyRateLimitOverrides(env, overrides);
  applyAuditOverrides(env, overrides);
  applyEncryptionOverrides(env, overrides);
  applySecretOverrides(env, overrides);
  applyDerivedSecurityOverrides(env, overrides);

  return overrides;
}

export function resolveSecurityConfigProfile(
  env: EnvRecord,
  profile: SecurityConfigProfile = 'auto',
): ResolvedSecurityConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'production') {
    return 'production';
  }

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveSecurityConfigDefaults(
  profile: ResolvedSecurityConfigProfile,
): SecurityConfig {
  if (profile === 'production') {
    return defaultProductionSecurityConfig;
  }

  if (profile === 'local') {
    return defaultLocalSecurityConfig;
  }

  return defaultSecurityConfig;
}

/**
 * Backward-compatible default export.
 *
 * Prefer createSecurityConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const securityConfig = createSecurityConfig();

export default securityConfig;

function applyCoreSecurityOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'SECURITY_ENABLED', 'enabled');

  const environment = getEnv(env, 'SECURITY_ENVIRONMENT') ?? getEnv(env, 'APP_ENV');

  if (environment !== undefined) {
    setDeepValue(overrides, 'environment', environment);
  }

  const uuidNamespace =
    getEnv(env, 'UUID_NAMESPACE') ??
    getEnv(env, 'HELIX_UUID_NAMESPACE') ??
    getEnv(env, 'SECURITY_UUID_NAMESPACE');

  if (uuidNamespace !== undefined) {
    setDeepValue(overrides, 'uuidNamespace', uuidNamespace);
    setDeepValue(overrides, 'uuid_namespace', uuidNamespace);
  }

  applyOptionalString(
    env,
    overrides,
    'SECURITY_DEFAULT_SENSITIVITY',
    'defaultSensitivity',
  );
}

function applyCookieOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'COOKIE_SECURE', 'cookies.secure');
  applyOptionalBoolean(env, overrides, 'COOKIE_HTTP_ONLY', 'cookies.httpOnly');
  applyOptionalString(env, overrides, 'COOKIE_SAME_SITE', 'cookies.sameSite');
  applyOptionalString(env, overrides, 'COOKIE_DOMAIN', 'cookies.domain');
  applyOptionalString(env, overrides, 'COOKIE_PATH', 'cookies.path');
  applyOptionalInteger(
    env,
    overrides,
    'COOKIE_MAX_AGE_SECONDS',
    'cookies.maxAgeSeconds',
  );
}

function applyCorsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'CORS_ENABLED', 'cors.enabled');
  applyOptionalList(env, overrides, 'CORS_ALLOWED_ORIGINS', 'cors.allowedOrigins');
  applyOptionalList(env, overrides, 'CORS_ALLOWED_METHODS', 'cors.allowedMethods');
  applyOptionalList(env, overrides, 'CORS_ALLOWED_HEADERS', 'cors.allowedHeaders');
  applyOptionalList(env, overrides, 'CORS_EXPOSED_HEADERS', 'cors.exposedHeaders');
  applyOptionalBoolean(
    env,
    overrides,
    'CORS_ALLOW_CREDENTIALS',
    'cors.allowCredentials',
  );
  applyOptionalInteger(env, overrides, 'CORS_MAX_AGE_SECONDS', 'cors.maxAgeSeconds');
}

function applyHeaderOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'CSP_ENABLED',
    'headers.contentSecurityPolicy.enabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'CSP_REPORT_ONLY',
    'headers.contentSecurityPolicy.reportOnly',
  );

  applyOptionalList(
    env,
    overrides,
    'CSP_DEFAULT_SRC',
    'headers.contentSecurityPolicy.directives.default-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_SCRIPT_SRC',
    'headers.contentSecurityPolicy.directives.script-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_STYLE_SRC',
    'headers.contentSecurityPolicy.directives.style-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_IMG_SRC',
    'headers.contentSecurityPolicy.directives.img-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_CONNECT_SRC',
    'headers.contentSecurityPolicy.directives.connect-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_FONT_SRC',
    'headers.contentSecurityPolicy.directives.font-src',
  );
  applyOptionalList(
    env,
    overrides,
    'CSP_FRAME_ANCESTORS',
    'headers.contentSecurityPolicy.directives.frame-ancestors',
  );

  applyOptionalInteger(
    env,
    overrides,
    'HSTS_MAX_AGE_SECONDS',
    'headers.hstsMaxAgeSeconds',
  );
  applyOptionalString(env, overrides, 'HSTS_PRELOAD', 'headers.hstsPreload');
  applyOptionalBoolean(
    env,
    overrides,
    'HSTS_INCLUDE_SUBDOMAINS',
    'headers.hstsIncludeSubDomains',
  );

  applyOptionalString(env, overrides, 'FRAME_OPTIONS', 'headers.frameOptions');
  applyOptionalString(
    env,
    overrides,
    'CONTENT_TYPE_OPTIONS',
    'headers.contentTypeOptions',
  );
  applyOptionalString(
    env,
    overrides,
    'REFERRER_POLICY',
    'headers.referrerPolicy',
  );
}

function applyRateLimitOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'RATE_LIMIT_ENABLED', 'rateLimit.enabled');
  applyOptionalInteger(env, overrides, 'RATE_LIMIT_LIMIT', 'rateLimit.limit');
  applyOptionalInteger(
    env,
    overrides,
    'RATE_LIMIT_WINDOW_SECONDS',
    'rateLimit.windowSeconds',
  );
  applyOptionalString(env, overrides, 'RATE_LIMIT_KEY_BY', 'rateLimit.keyBy');
}

function applyAuditOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'AUDIT_ENABLED', 'audit.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'AUDIT_SIGNING_ENABLED',
    'audit.signingEnabled',
  );
  applyOptionalString(
    env,
    overrides,
    'AUDIT_SIGNING_KEY_REF',
    'audit.signingKeyRef',
  );
  applyOptionalInteger(
    env,
    overrides,
    'AUDIT_RETENTION_DAYS',
    'audit.retentionDays',
  );
}

function applyEncryptionOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'ENCRYPTION_ENABLED', 'encryption.enabled');
  applyOptionalString(
    env,
    overrides,
    'ENCRYPTION_PRIMARY_KEY_REF',
    'encryption.primaryKeyRef',
  );
  applyOptionalList(
    env,
    overrides,
    'ENCRYPTION_PREVIOUS_KEY_REFS',
    'encryption.previousKeyRefs',
  );
  applyOptionalInteger(
    env,
    overrides,
    'ENCRYPTION_ROTATION_DAYS',
    'encryption.rotationDays',
  );
}

function applySecretOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const requiredSecretRefs = getEnvList(env, 'SECURITY_REQUIRED_SECRET_REFS');

  for (const secretRef of requiredSecretRefs) {
    setDeepValue(overrides, `secrets.${secretRef}`, {
      name: secretRef,
      provider: getEnv(env, 'SECRET_PROVIDER') ?? 'cloudflare-secrets',
      ref: secretRef,
      required: true,
      description: undefined,
      sensitivity: 'secret-reference',
      rotationDays: getEnvInteger(env, 'SECRET_ROTATION_DAYS') ?? 90,
    });
  }
}

function applyDerivedSecurityOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const environment = resolveAppEnvironment(env);
  const appUrl = getEnv(env, 'APP_URL') ?? getEnv(env, 'NEXT_PUBLIC_APP_URL');
  const appDomain =
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME');

  if (environment === 'production') {
    setDeepValue(overrides, 'environment', 'production');
    setDeepValue(overrides, 'cookies.secure', true);

    if (appDomain !== undefined && getEnv(env, 'COOKIE_DOMAIN') === undefined) {
      setDeepValue(overrides, 'cookies.domain', appDomain);
    }

    if (appUrl !== undefined && getEnv(env, 'CORS_ALLOWED_ORIGINS') === undefined) {
      setDeepValue(overrides, 'cors.enabled', true);
      setDeepValue(overrides, 'cors.allowedOrigins', [appUrl]);
    }
  }

  const uuidNamespace =
    getEnv(env, 'UUID_NAMESPACE') ??
    getEnv(env, 'HELIX_UUID_NAMESPACE') ??
    getEnv(env, 'SECURITY_UUID_NAMESPACE') ??
    fallbackSecurityUuidNamespace;

  if (!getEnv(env, 'UUID_NAMESPACE') && !getEnv(env, 'HELIX_UUID_NAMESPACE')) {
    setDeepValue(overrides, 'uuidNamespace', uuidNamespace);
    setDeepValue(overrides, 'uuid_namespace', uuidNamespace);
  }
}

function applyOptionalString(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvBoolean(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvInteger(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalList(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvList(env, envKey);

  if (value.length > 0) {
    setDeepValue(target, path, value);
  }
}