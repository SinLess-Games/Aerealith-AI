import type { AuthConfig } from '../types/auth';

import {
  defaultAuthConfig,
  defaultCloudflareAuthConfig,
  defaultLocalAuthConfig,
  defaultProductionAuthConfig,
} from '../defaults/auth.defaults';
import { authSchema } from '../schema/auth.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  isCloudflareEnv,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type AuthConfigProfile =
  | 'default'
  | 'local'
  | 'production'
  | 'cloudflare'
  | 'auto';

export type ResolvedAuthConfigProfile = Exclude<AuthConfigProfile, 'auto'>;

export type AuthConfigOptions = {
  name?: string;
  profile?: AuthConfigProfile;
  defaults?: AuthConfig;
};

export function createAuthConfig(
  env: EnvRecord = {},
  options: AuthConfigOptions = {},
): AuthConfig {
  const configName = options.name ?? 'auth config';
  const profile = resolveAuthConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveAuthConfigDefaults(profile);
  const overrides = buildAuthConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(authSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildAuthConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootAuthOverrides(env, overrides);
  applyNextAuthOverrides(env, overrides);
  applyGoogleOverrides(env, overrides);
  applyGithubOverrides(env, overrides);
  applyDiscordOverrides(env, overrides);
  applyCredentialsOverrides(env, overrides);
  applyPasskeysOverrides(env, overrides);
  applyMagicLinkOverrides(env, overrides);
  applyApiKeysOverrides(env, overrides);
  applyCookieOverrides(env, overrides);
  applyRequiredSecretOverrides(env, overrides);
  applyDerivedAuthOverrides(env, overrides);

  return overrides;
}

export function resolveAuthConfigProfile(
  env: EnvRecord,
  profile: AuthConfigProfile = 'auto',
): ResolvedAuthConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const runtime = getEnv(env, 'APP_RUNTIME') ?? getEnv(env, 'HELIX_RUNTIME');

  if (runtime === 'cloudflare-worker' || isCloudflareEnv(env)) {
    return 'cloudflare';
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

export function resolveAuthConfigDefaults(
  profile: ResolvedAuthConfigProfile,
): AuthConfig {
  if (profile === 'cloudflare') {
    return deepClone(defaultCloudflareAuthConfig);
  }

  if (profile === 'production') {
    return deepClone(defaultProductionAuthConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalAuthConfig);
  }

  return deepClone(defaultAuthConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createAuthConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const authConfig = createAuthConfig();

export default authConfig;

function applyRootAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'AUTH_ENABLED', 'enabled');
  applyOptionalString(env, overrides, 'AUTH_RUNTIME', 'runtime');
  applyOptionalString(env, overrides, 'APP_RUNTIME', 'runtime');
  applyOptionalList(env, overrides, 'AUTH_PROVIDERS', 'providers');
}

function applyNextAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'AUTHJS_ENABLED', 'nextAuth.enabled');
  applyOptionalBoolean(env, overrides, 'NEXTAUTH_ENABLED', 'nextAuth.enabled');

  /**
   * Secret value support is kept for local/test compatibility.
   * Production should prefer secretRef.
   */
  applyOptionalString(env, overrides, 'AUTH_SECRET', 'nextAuth.secret');
  applyOptionalString(env, overrides, 'NEXTAUTH_SECRET', 'nextAuth.secret');

  applyOptionalString(env, overrides, 'AUTH_SECRET_REF', 'nextAuth.secretRef');

  const authUrl =
    getEnv(env, 'AUTH_URL') ??
    getEnv(env, 'NEXTAUTH_URL') ??
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');

  if (authUrl !== undefined) {
    setDeepValue(overrides, 'nextAuth.url', authUrl);
  }

  applyOptionalBoolean(env, overrides, 'AUTH_TRUST_HOST', 'nextAuth.trustHost');
  applyOptionalBoolean(
    env,
    overrides,
    'NEXTAUTH_TRUST_HOST',
    'nextAuth.trustHost',
  );

  applyOptionalString(
    env,
    overrides,
    'AUTH_SESSION_STRATEGY',
    'nextAuth.sessionStrategy',
  );
  applyOptionalInteger(
    env,
    overrides,
    'AUTH_SESSION_MAX_AGE_SECONDS',
    'nextAuth.sessionMaxAgeSeconds',
  );
  applyOptionalInteger(
    env,
    overrides,
    'AUTH_SESSION_UPDATE_AGE_SECONDS',
    'nextAuth.sessionUpdateAgeSeconds',
  );
}

function applyGoogleOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'GOOGLE_AUTH_ENABLED', 'google.enabled');

  const clientId =
    getEnv(env, 'AUTH_GOOGLE_ID') ??
    getEnv(env, 'GOOGLE_CLIENT_ID') ??
    getEnv(env, 'NEXT_PUBLIC_GOOGLE_CLIENT_ID');

  if (clientId !== undefined) {
    setDeepValue(overrides, 'google.clientId', clientId);
  }

  applyOptionalString(env, overrides, 'GOOGLE_CLIENT_ID_REF', 'google.clientIdRef');

  /**
   * Secret value support is kept for local/test compatibility.
   * Production should prefer clientSecretRef.
   */
  const clientSecret =
    getEnv(env, 'AUTH_GOOGLE_SECRET') ?? getEnv(env, 'GOOGLE_CLIENT_SECRET');

  if (clientSecret !== undefined) {
    setDeepValue(overrides, 'google.clientSecret', clientSecret);
  }

  const clientSecretRef =
    getEnv(env, 'GOOGLE_CLIENT_SECRET_REF') ??
    (getEnv(env, 'AUTH_GOOGLE_SECRET') !== undefined
      ? 'AUTH_GOOGLE_SECRET'
      : undefined);

  if (clientSecretRef !== undefined) {
    setDeepValue(overrides, 'google.clientSecretRef', clientSecretRef);
  }

  applyOptionalString(env, overrides, 'GOOGLE_REDIRECT_URI', 'google.redirectUri');
  applyOptionalList(env, overrides, 'GOOGLE_AUTH_SCOPES', 'google.scopes');
  applyOptionalString(env, overrides, 'GOOGLE_ISSUER', 'google.issuer');
  applyOptionalString(env, overrides, 'AUTH_GOOGLE_ISSUER', 'google.issuer');
}

function applyGithubOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'GITHUB_AUTH_ENABLED', 'github.enabled');

  const clientId =
    getEnv(env, 'AUTH_GITHUB_ID') ??
    getEnv(env, 'GITHUB_CLIENT_ID') ??
    getEnv(env, 'NEXT_PUBLIC_GITHUB_CLIENT_ID');

  if (clientId !== undefined) {
    setDeepValue(overrides, 'github.clientId', clientId);
  }

  applyOptionalString(env, overrides, 'GITHUB_CLIENT_ID_REF', 'github.clientIdRef');

  /**
   * Secret value support is kept for local/test compatibility.
   * Production should prefer clientSecretRef.
   */
  const clientSecret =
    getEnv(env, 'AUTH_GITHUB_SECRET') ?? getEnv(env, 'GITHUB_CLIENT_SECRET');

  if (clientSecret !== undefined) {
    setDeepValue(overrides, 'github.clientSecret', clientSecret);
  }

  const clientSecretRef =
    getEnv(env, 'GITHUB_CLIENT_SECRET_REF') ??
    (getEnv(env, 'AUTH_GITHUB_SECRET') !== undefined
      ? 'AUTH_GITHUB_SECRET'
      : undefined);

  if (clientSecretRef !== undefined) {
    setDeepValue(overrides, 'github.clientSecretRef', clientSecretRef);
  }

  applyOptionalString(env, overrides, 'GITHUB_REDIRECT_URI', 'github.redirectUri');
  applyOptionalList(env, overrides, 'GITHUB_AUTH_SCOPES', 'github.scopes');
  applyOptionalString(env, overrides, 'GITHUB_ISSUER', 'github.issuer');
  applyOptionalString(env, overrides, 'AUTH_GITHUB_ISSUER', 'github.issuer');
}

function applyDiscordOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_AUTH_ENABLED', 'discord.enabled');

  const clientId =
    getEnv(env, 'AUTH_DISCORD_ID') ??
    getEnv(env, 'DISCORD_CLIENT_ID') ??
    getEnv(env, 'NEXT_PUBLIC_DISCORD_APPLICATION_ID');

  if (clientId !== undefined) {
    setDeepValue(overrides, 'discord.clientId', clientId);
  }

  applyOptionalString(env, overrides, 'DISCORD_CLIENT_ID_REF', 'discord.clientIdRef');

  /**
   * Secret value support is kept for local/test compatibility.
   * Production should prefer clientSecretRef.
   */
  const clientSecret =
    getEnv(env, 'AUTH_DISCORD_SECRET') ?? getEnv(env, 'DISCORD_CLIENT_SECRET');

  if (clientSecret !== undefined) {
    setDeepValue(overrides, 'discord.clientSecret', clientSecret);
  }

  const clientSecretRef =
    getEnv(env, 'DISCORD_CLIENT_SECRET_REF') ??
    (getEnv(env, 'AUTH_DISCORD_SECRET') !== undefined
      ? 'AUTH_DISCORD_SECRET'
      : undefined);

  if (clientSecretRef !== undefined) {
    setDeepValue(overrides, 'discord.clientSecretRef', clientSecretRef);
  }

  applyOptionalString(
    env,
    overrides,
    'DISCORD_REDIRECT_URI',
    'discord.redirectUri',
  );
  applyOptionalList(env, overrides, 'DISCORD_AUTH_SCOPES', 'discord.scopes');
  applyOptionalString(env, overrides, 'DISCORD_ISSUER', 'discord.issuer');
  applyOptionalString(env, overrides, 'AUTH_DISCORD_ISSUER', 'discord.issuer');
}

function applyCredentialsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'AUTH_CREDENTIALS_ENABLED',
    'credentials.enabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'AUTH_EMAIL_PASSWORD_ENABLED',
    'credentials.emailPasswordEnabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'AUTH_USERNAME_PASSWORD_ENABLED',
    'credentials.usernamePasswordEnabled',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'AUTH_REGISTRATION_ENABLED',
    'credentials.registrationEnabled',
  );
}

function applyPasskeysOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'PASSKEYS_ENABLED', 'passkeys.enabled');
  applyOptionalString(env, overrides, 'PASSKEYS_RP_ID', 'passkeys.rpId');
  applyOptionalString(env, overrides, 'PASSKEYS_RP_NAME', 'passkeys.rpName');
  applyOptionalList(env, overrides, 'PASSKEYS_ORIGINS', 'passkeys.origins');
}

function applyMagicLinkOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'MAGIC_LINK_ENABLED', 'magicLink.enabled');
  applyOptionalInteger(
    env,
    overrides,
    'MAGIC_LINK_TOKEN_TTL_SECONDS',
    'magicLink.tokenTtlSeconds',
  );
  applyOptionalString(
    env,
    overrides,
    'MAGIC_LINK_TOKEN_SECRET_REF',
    'magicLink.tokenSecretRef',
  );
}

function applyApiKeysOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'API_KEYS_ENABLED', 'apiKeys.enabled');
  applyOptionalString(env, overrides, 'API_KEY_HEADER_NAME', 'apiKeys.headerName');
  applyOptionalString(env, overrides, 'API_KEY_PREFIX', 'apiKeys.keyPrefix');
  applyOptionalInteger(
    env,
    overrides,
    'API_KEY_DEFAULT_EXPIRATION_DAYS',
    'apiKeys.defaultExpirationDays',
  );
}

function applyCookieOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'AUTH_COOKIE_SECURE', 'cookies.secure');
  applyOptionalBoolean(env, overrides, 'AUTH_COOKIE_HTTP_ONLY', 'cookies.httpOnly');
  applyOptionalString(env, overrides, 'AUTH_COOKIE_SAME_SITE', 'cookies.sameSite');
  applyOptionalString(env, overrides, 'AUTH_COOKIE_DOMAIN', 'cookies.domain');
  applyOptionalString(env, overrides, 'AUTH_COOKIE_PATH', 'cookies.path');

  applyOptionalBoolean(env, overrides, 'COOKIE_SECURE', 'cookies.secure');
  applyOptionalBoolean(env, overrides, 'COOKIE_HTTP_ONLY', 'cookies.httpOnly');
  applyOptionalString(env, overrides, 'COOKIE_SAME_SITE', 'cookies.sameSite');
  applyOptionalString(env, overrides, 'COOKIE_DOMAIN', 'cookies.domain');
  applyOptionalString(env, overrides, 'COOKIE_PATH', 'cookies.path');
}

function applyRequiredSecretOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const requiredSecretRefs = getEnvList(env, 'AUTH_REQUIRED_SECRET_REFS');

  if (requiredSecretRefs.length > 0) {
    setDeepValue(overrides, 'requiredSecretRefs', requiredSecretRefs);
  }
}

function applyDerivedAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const environment = resolveAppEnvironment(env);
  const appUrl =
    getEnv(env, 'AUTH_URL') ??
    getEnv(env, 'NEXTAUTH_URL') ??
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');

  const domain =
    getEnv(env, 'AUTH_COOKIE_DOMAIN') ??
    getEnv(env, 'COOKIE_DOMAIN') ??
    getEnv(env, 'APP_DOMAIN') ??
    getEnv(env, 'PRIMARY_DOMAIN') ??
    getEnv(env, 'CLOUDFLARE_ZONE_NAME');

  const authSecretRef =
    getEnv(env, 'AUTH_SECRET_REF') ??
    (getEnv(env, 'AUTH_SECRET') !== undefined ? 'AUTH_SECRET' : undefined) ??
    (getEnv(env, 'NEXTAUTH_SECRET') !== undefined ? 'NEXTAUTH_SECRET' : undefined);

  if (authSecretRef !== undefined) {
    setDeepValue(overrides, 'nextAuth.secretRef', authSecretRef);
  }

  if (environment === 'production') {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(
      overrides,
      'runtime',
      isCloudflareEnv(env) ? 'cloudflare-worker' : 'nextjs',
    );
    setDeepValue(overrides, 'nextAuth.enabled', true);
    setDeepValue(overrides, 'cookies.secure', true);

    if (domain !== undefined) {
      setDeepValue(overrides, 'cookies.domain', domain);
    }
  }

  if (isCloudflareEnv(env)) {
    setDeepValue(overrides, 'runtime', 'cloudflare-worker');
    setDeepValue(overrides, 'nextAuth.trustHost', true);
  }

  if (getEnvBoolean(env, 'AUTH_TRUST_HOST') === true) {
    setDeepValue(overrides, 'nextAuth.trustHost', true);
  }

  deriveProviderState(env, overrides);

  if (appUrl !== undefined) {
    setDeepValue(overrides, 'nextAuth.url', appUrl);

    applyProviderRedirectDefaults(env, overrides, appUrl);
    applyPasskeyOriginDefaults(env, overrides, appUrl);
  }

  if (domain !== undefined && getEnv(env, 'PASSKEYS_RP_ID') === undefined) {
    setDeepValue(overrides, 'passkeys.rpId', domain);
  }

  const providers = collectEnabledProviders(env, overrides);

  if (providers.length > 0 && getEnv(env, 'AUTH_PROVIDERS') === undefined) {
    setDeepValue(overrides, 'providers', providers);
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'nextAuth.enabled', true);
  }

  const requiredSecretRefs = collectRequiredSecretRefs(env, providers, authSecretRef);

  if (
    requiredSecretRefs.length > 0 &&
    getEnv(env, 'AUTH_REQUIRED_SECRET_REFS') === undefined
  ) {
    setDeepValue(overrides, 'requiredSecretRefs', requiredSecretRefs);
  }
}

function deriveProviderState(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (hasGoogleSignal(env)) {
    setDeepValue(overrides, 'google.enabled', true);
  }

  if (hasGithubSignal(env)) {
    setDeepValue(overrides, 'github.enabled', true);
  }

  if (hasDiscordSignal(env)) {
    setDeepValue(overrides, 'discord.enabled', true);
  }
}

function applyProviderRedirectDefaults(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  appUrl: string,
): void {
  if (hasGoogleSignal(env) && getEnv(env, 'GOOGLE_REDIRECT_URI') === undefined) {
    setDeepValue(
      overrides,
      'google.redirectUri',
      `${appUrl}/api/auth/callback/google`,
    );
  }

  if (hasGithubSignal(env) && getEnv(env, 'GITHUB_REDIRECT_URI') === undefined) {
    setDeepValue(
      overrides,
      'github.redirectUri',
      `${appUrl}/api/auth/callback/github`,
    );
  }

  if (hasDiscordSignal(env) && getEnv(env, 'DISCORD_REDIRECT_URI') === undefined) {
    setDeepValue(
      overrides,
      'discord.redirectUri',
      `${appUrl}/api/auth/callback/discord`,
    );
  }
}

function applyPasskeyOriginDefaults(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  appUrl: string,
): void {
  if (getEnv(env, 'PASSKEYS_ORIGINS') !== undefined) {
    return;
  }

  if (
    getEnvBoolean(env, 'PASSKEYS_ENABLED') === true ||
    getEnv(env, 'PASSKEYS_RP_ID') !== undefined
  ) {
    setDeepValue(overrides, 'passkeys.origins', [appUrl]);
  }
}

function collectEnabledProviders(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): string[] {
  const providers = new Set<string>();

  for (const provider of getEnvList(env, 'AUTH_PROVIDERS')) {
    providers.add(provider);
  }

  if (hasGoogleSignal(env)) {
    providers.add('google');
  }

  if (hasGithubSignal(env)) {
    providers.add('github');
  }

  if (hasDiscordSignal(env)) {
    providers.add('discord');
  }

  const credentialsEnabled =
    getEnvBoolean(env, 'AUTH_CREDENTIALS_ENABLED') ??
    getEnvBoolean(env, 'AUTH_EMAIL_PASSWORD_ENABLED') ??
    getEnvBoolean(env, 'AUTH_USERNAME_PASSWORD_ENABLED');

  if (credentialsEnabled === true) {
    providers.add('credentials');
  }

  const magicLinkEnabled = getEnvBoolean(env, 'MAGIC_LINK_ENABLED');

  if (magicLinkEnabled === true) {
    providers.add('magic-link');
  }

  const passkeysEnabled = getEnvBoolean(env, 'PASSKEYS_ENABLED');

  if (passkeysEnabled === true) {
    providers.add('passkeys');
  }

  /**
   * Keep the override object referenced so future provider inference can read
   * from object-derived state if needed.
   */
  void overrides;

  return [...providers];
}

function collectRequiredSecretRefs(
  env: EnvRecord,
  providers: readonly string[],
  authSecretRef?: string,
): string[] {
  const requiredSecretRefs = new Set<string>();

  if (authSecretRef !== undefined) {
    requiredSecretRefs.add(authSecretRef);
  }

  if (providers.includes('google')) {
    requiredSecretRefs.add(
      getEnv(env, 'GOOGLE_CLIENT_SECRET_REF') ??
        (getEnv(env, 'AUTH_GOOGLE_SECRET') !== undefined
          ? 'AUTH_GOOGLE_SECRET'
          : 'GOOGLE_CLIENT_SECRET'),
    );
  }

  if (providers.includes('github')) {
    requiredSecretRefs.add(
      getEnv(env, 'GITHUB_CLIENT_SECRET_REF') ??
        (getEnv(env, 'AUTH_GITHUB_SECRET') !== undefined
          ? 'AUTH_GITHUB_SECRET'
          : 'GITHUB_CLIENT_SECRET'),
    );
  }

  if (providers.includes('discord')) {
    requiredSecretRefs.add(
      getEnv(env, 'DISCORD_CLIENT_SECRET_REF') ??
        (getEnv(env, 'AUTH_DISCORD_SECRET') !== undefined
          ? 'AUTH_DISCORD_SECRET'
          : 'DISCORD_CLIENT_SECRET'),
    );
  }

  if (providers.includes('magic-link')) {
    requiredSecretRefs.add(
      getEnv(env, 'MAGIC_LINK_TOKEN_SECRET_REF') ?? 'AUTH_MAGIC_LINK_SECRET',
    );
  }

  return [...requiredSecretRefs];
}

function hasGoogleSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'AUTH_GOOGLE_ID') ||
      getEnv(env, 'AUTH_GOOGLE_SECRET') ||
      getEnv(env, 'GOOGLE_CLIENT_ID') ||
      getEnv(env, 'GOOGLE_CLIENT_SECRET') ||
      getEnv(env, 'GOOGLE_CLIENT_SECRET_REF') ||
      getEnv(env, 'GOOGLE_REDIRECT_URI') ||
      getEnvBoolean(env, 'GOOGLE_AUTH_ENABLED') === true,
  );
}

function hasGithubSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'AUTH_GITHUB_ID') ||
      getEnv(env, 'AUTH_GITHUB_SECRET') ||
      getEnv(env, 'GITHUB_CLIENT_ID') ||
      getEnv(env, 'GITHUB_CLIENT_SECRET') ||
      getEnv(env, 'GITHUB_CLIENT_SECRET_REF') ||
      getEnv(env, 'GITHUB_REDIRECT_URI') ||
      getEnvBoolean(env, 'GITHUB_AUTH_ENABLED') === true,
  );
}

function hasDiscordSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'AUTH_DISCORD_ID') ||
      getEnv(env, 'AUTH_DISCORD_SECRET') ||
      getEnv(env, 'DISCORD_CLIENT_ID') ||
      getEnv(env, 'DISCORD_CLIENT_SECRET') ||
      getEnv(env, 'DISCORD_CLIENT_SECRET_REF') ||
      getEnv(env, 'DISCORD_REDIRECT_URI') ||
      getEnvBoolean(env, 'DISCORD_AUTH_ENABLED') === true,
  );
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