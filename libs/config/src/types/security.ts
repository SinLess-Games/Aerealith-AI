export type SecurityEnvironment =
  | 'development'
  | 'preview'
  | 'staging'
  | 'production'
  | 'test'
  | string;

export type SecretProvider =
  | 'cloudflare-secrets'
  | 'cloudflare-secrets-store'
  | 'github-actions'
  | 'vault'
  | 'doppler'
  | 'onepassword'
  | 'environment'
  | 'local-dev-vars'
  | string;

export type SensitivityLevel =
  | 'public'
  | 'internal'
  | 'personal'
  | 'private'
  | 'sensitive'
  | 'business'
  | 'technical'
  | 'restricted'
  | 'regulated'
  | 'secret-reference'
  | string;

export type SameSitePolicy = 'lax' | 'strict' | 'none' | string;

export type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'
  | string;

export type HstsPreloadMode = 'disabled' | 'enabled' | 'candidate' | string;

export interface SecretRefConfig {
  /**
   * Logical secret reference name used by Helix config.
   *
   * Example:
   * DATABASE_URL
   */
  name: string;

  /**
   * Secret backend/provider.
   */
  provider: SecretProvider;

  /**
   * Provider-specific secret key/name/path.
   *
   * Do not store secret values here.
   */
  ref: string;

  /**
   * Whether the application requires this secret to start safely.
   */
  required: boolean;

  /**
   * Optional description of how the secret is used.
   */
  description?: string;

  /**
   * Optional sensitivity label for this secret reference.
   */
  sensitivity?: SensitivityLevel;

  /**
   * Optional rotation interval in days.
   */
  rotationDays?: number;
}

export interface CookieSecurityConfig {
  /**
   * Whether cookies must use the Secure attribute.
   */
  secure: boolean;

  /**
   * Whether cookies must use the HttpOnly attribute when possible.
   */
  httpOnly: boolean;

  /**
   * SameSite policy for application cookies.
   */
  sameSite: SameSitePolicy;

  /**
   * Default cookie domain.
   */
  domain?: string;

  /**
   * Default cookie path.
   */
  path?: string;

  /**
   * Default max age in seconds.
   */
  maxAgeSeconds?: number;
}

export interface CorsSecurityConfig {
  /**
   * Whether CORS is enabled.
   */
  enabled: boolean;

  /**
   * Allowed request origins.
   *
   * Use explicit origins in production.
   */
  allowedOrigins: string[];

  /**
   * Allowed HTTP methods.
   */
  allowedMethods: string[];

  /**
   * Allowed request headers.
   */
  allowedHeaders: string[];

  /**
   * Response headers exposed to the browser.
   */
  exposedHeaders?: string[];

  /**
   * Whether credentials are allowed.
   */
  allowCredentials: boolean;

  /**
   * Preflight cache max age in seconds.
   */
  maxAgeSeconds?: number;
}

export interface ContentSecurityPolicyConfig {
  /**
   * Whether CSP is enabled.
   */
  enabled: boolean;

  /**
   * Whether CSP should be emitted as report-only.
   */
  reportOnly: boolean;

  /**
   * CSP directives.
   *
   * Example:
   * {
   *   "default-src": ["'self'"],
   *   "script-src": ["'self'"]
   * }
   */
  directives: Record<string, string[]>;
}

export interface SecurityHeadersConfig {
  /**
   * Content-Security-Policy configuration.
   */
  contentSecurityPolicy: ContentSecurityPolicyConfig;

  /**
   * Strict-Transport-Security max age in seconds.
   */
  hstsMaxAgeSeconds?: number;

  /**
   * HSTS preload posture.
   */
  hstsPreload?: HstsPreloadMode;

  /**
   * Whether subdomains are included in HSTS.
   */
  hstsIncludeSubDomains?: boolean;

  /**
   * X-Frame-Options value.
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;

  /**
   * X-Content-Type-Options value.
   */
  contentTypeOptions?: 'nosniff' | string;

  /**
   * Referrer-Policy value.
   */
  referrerPolicy?: ReferrerPolicy;

  /**
   * Permissions-Policy directives.
   */
  permissionsPolicy?: Record<string, string[]>;

  /**
   * Additional custom security headers.
   */
  customHeaders?: Record<string, string>;
}

export interface RateLimitSecurityConfig {
  /**
   * Whether rate limiting is enabled.
   */
  enabled: boolean;

  /**
   * Maximum requests in the window.
   */
  limit?: number;

  /**
   * Window size in seconds.
   */
  windowSeconds?: number;

  /**
   * Optional keying strategy.
   *
   * Examples:
   * ip, user, tenant, organization, api-key
   */
  keyBy?: string;
}

export interface AuditSecurityConfig {
  /**
   * Whether audit logging is enabled.
   */
  enabled: boolean;

  /**
   * Whether audit log entries should be signed.
   */
  signingEnabled: boolean;

  /**
   * Secret reference name for the audit signing key.
   *
   * Do not store the actual key here.
   */
  signingKeyRef?: string;

  /**
   * Default audit event retention in days.
   */
  retentionDays?: number;
}

export interface EncryptionSecurityConfig {
  /**
   * Whether application-level encryption is enabled.
   */
  enabled: boolean;

  /**
   * Secret reference name for the primary encryption key.
   *
   * Do not store the actual key here.
   */
  primaryKeyRef?: string;

  /**
   * Optional key reference names accepted for decryption during rotation.
   */
  previousKeyRefs?: string[];

  /**
   * Optional key rotation interval in days.
   */
  rotationDays?: number;
}

export interface SecurityConfig {
  /**
   * Global security posture enablement.
   */
  enabled: boolean;

  /**
   * Current environment/security context.
   */
  environment: SecurityEnvironment;

  /**
   * CamelCase used by libs/db.
   */
  uuidNamespace: string;

  /**
   * Alias kept for backward compatibility.
   *
   * Prefer uuidNamespace in new code.
   */
  uuid_namespace: string;

  /**
   * Default sensitivity label for app-managed data.
   */
  defaultSensitivity: SensitivityLevel;

  /**
   * Secret references required by this deployment.
   *
   * Store secret names/references only, never secret values.
   */
  secrets: Record<string, SecretRefConfig>;

  /**
   * Cookie security defaults.
   */
  cookies: CookieSecurityConfig;

  /**
   * CORS policy.
   */
  cors: CorsSecurityConfig;

  /**
   * Security headers policy.
   */
  headers: SecurityHeadersConfig;

  /**
   * Rate limiting policy.
   */
  rateLimit: RateLimitSecurityConfig;

  /**
   * Audit log policy.
   */
  audit: AuditSecurityConfig;

  /**
   * Application-level encryption policy.
   */
  encryption: EncryptionSecurityConfig;
}