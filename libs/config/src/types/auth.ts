export type AuthProvider =
  | 'credentials'
  | 'google'
  | 'github'
  | 'discord'
  | 'passkey'
  | 'magic-link'
  | 'api-key'
  | string;

export type AuthSessionStrategy =
  | 'jwt'
  | 'database'
  | 'stateless'
  | string;

export type AuthRuntime =
  | 'nextjs'
  | 'cloudflare-worker'
  | 'node'
  | 'container'
  | 'kubernetes'
  | 'local'
  | string;

export interface NextAuthConfig {
  /**
   * Whether Auth.js / NextAuth-compatible auth is enabled.
   */
  enabled: boolean;

  /**
   * Backward-compatible raw secret value.
   *
   * Prefer secretRef in committed/shared config.
   */
  secret?: string;

  /**
   * Secret reference name for AUTH_SECRET / NEXTAUTH_SECRET.
   *
   * Do not store the actual secret value here.
   */
  secretRef?: string;

  /**
   * Public auth URL.
   *
   * Example:
   * https://helixaibot.com
   */
  url?: string;

  /**
   * Whether Auth.js should trust forwarded host headers.
   *
   * Useful behind Cloudflare/proxies.
   */
  trustHost?: boolean;

  /**
   * Session strategy.
   */
  sessionStrategy?: AuthSessionStrategy;

  /**
   * Session max age in seconds.
   */
  sessionMaxAgeSeconds?: number;

  /**
   * Session update age in seconds.
   */
  sessionUpdateAgeSeconds?: number;
}

export interface OAuthProviderConfig {
  /**
   * Whether this provider is enabled.
   */
  enabled: boolean;

  /**
   * OAuth client ID.
   */
  clientId?: string;

  /**
   * Secret reference name for the OAuth client ID.
   */
  clientIdRef?: string;

  /**
   * Backward-compatible raw OAuth client secret value.
   *
   * Prefer clientSecretRef in committed/shared config.
   */
  clientSecret?: string;

  /**
   * Secret reference name for the OAuth client secret.
   *
   * Do not store the actual secret value here.
   */
  clientSecretRef?: string;

  /**
   * OAuth redirect URI.
   */
  redirectUri?: string;

  /**
   * Requested OAuth scopes.
   */
  scopes?: string[];

  /**
   * Optional issuer URL for providers that require one.
   */
  issuer?: string;
}

export interface CredentialsAuthConfig {
  /**
   * Whether username/password auth is enabled.
   */
  enabled: boolean;

  /**
   * Whether email/password login is enabled.
   */
  emailPasswordEnabled?: boolean;

  /**
   * Whether username/password login is enabled.
   */
  usernamePasswordEnabled?: boolean;

  /**
   * Whether registration through credentials auth is enabled.
   */
  registrationEnabled?: boolean;
}

export interface PasskeyAuthConfig {
  /**
   * Whether passkeys/WebAuthn are enabled.
   */
  enabled: boolean;

  /**
   * Relying party ID.
   *
   * Example:
   * helixaibot.com
   */
  rpId?: string;

  /**
   * Relying party display name.
   */
  rpName?: string;

  /**
   * Allowed origins for passkey ceremonies.
   */
  origins?: string[];
}

export interface MagicLinkAuthConfig {
  /**
   * Whether magic-link/email auth is enabled.
   */
  enabled: boolean;

  /**
   * Magic link expiration in seconds.
   */
  tokenTtlSeconds?: number;

  /**
   * Secret reference name for email/auth token signing.
   */
  tokenSecretRef?: string;
}

export interface ApiKeyAuthConfig {
  /**
   * Whether API key auth is enabled.
   */
  enabled: boolean;

  /**
   * Header name used for API keys.
   *
   * Example:
   * x-api-key
   */
  headerName?: string;

  /**
   * Optional API key prefix.
   *
   * Example:
   * hx_
   */
  keyPrefix?: string;

  /**
   * Default API key expiration in days.
   */
  defaultExpirationDays?: number;
}

export interface AuthCookieConfig {
  /**
   * Whether cookies must use the Secure attribute.
   */
  secure: boolean;

  /**
   * Whether cookies must use the HttpOnly attribute when possible.
   */
  httpOnly: boolean;

  /**
   * SameSite cookie policy.
   */
  sameSite: 'lax' | 'strict' | 'none' | string;

  /**
   * Cookie domain.
   *
   * Example:
   * helixaibot.com
   */
  domain?: string;

  /**
   * Cookie path.
   */
  path?: string;
}

export interface AuthConfig {
  /**
   * Global auth enablement.
   */
  enabled: boolean;

  /**
   * Runtime consuming this config.
   */
  runtime: AuthRuntime;

  /**
   * Enabled auth providers.
   */
  providers: AuthProvider[];

  /**
   * Auth.js / NextAuth-compatible configuration.
   */
  nextAuth: NextAuthConfig;

  /**
   * Google OAuth provider config.
   */
  google: OAuthProviderConfig;

  /**
   * GitHub OAuth provider config.
   */
  github?: OAuthProviderConfig;

  /**
   * Discord OAuth provider config.
   */
  discord?: OAuthProviderConfig;

  /**
   * Credentials auth config.
   */
  credentials?: CredentialsAuthConfig;

  /**
   * Passkey/WebAuthn config.
   */
  passkeys?: PasskeyAuthConfig;

  /**
   * Magic-link auth config.
   */
  magicLink?: MagicLinkAuthConfig;

  /**
   * API key auth config.
   */
  apiKeys?: ApiKeyAuthConfig;

  /**
   * Default cookie config for auth-owned cookies.
   */
  cookies?: AuthCookieConfig;

  /**
   * Required secret reference names.
   *
   * Store secret names only, never secret values.
   */
  requiredSecretRefs?: string[];

  /**
   * Optional metadata for dashboards, ownership, or deployment routing.
   */
  metadata?: Record<string, string | number | boolean | null>;
}