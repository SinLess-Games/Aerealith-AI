import type { SecurityConfig } from '../types/security';

export const defaultSecurityUuidNamespace =
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const thirtyDaysInSeconds = 60 * 60 * 24 * 30;

export const defaultSecurityConfig = {
  enabled: true,

  environment: 'development',

  /**
   * Keep both fields in sync until libs/db no longer needs the legacy alias.
   */
  uuidNamespace: defaultSecurityUuidNamespace,
  uuid_namespace: defaultSecurityUuidNamespace,

  defaultSensitivity: 'internal',

  /**
   * Store secret references only.
   *
   * Do not store secret values in committed config.
   */
  secrets: {},

  cookies: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    domain: undefined,
    path: '/',
    maxAgeSeconds: thirtyDaysInSeconds,
  },

  cors: {
    enabled: false,
    allowedOrigins: [],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-requested-with',
      'x-helix-tenant-id',
      'x-helix-session-id',
    ],
    exposedHeaders: [],
    allowCredentials: false,
    maxAgeSeconds: 600,
  },

  headers: {
    contentSecurityPolicy: {
      enabled: true,
      reportOnly: false,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'form-action': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'connect-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
      },
    },

    hstsMaxAgeSeconds: 31_536_000,
    hstsPreload: 'candidate',
    hstsIncludeSubDomains: true,

    frameOptions: 'DENY',

    contentTypeOptions: 'nosniff',

    referrerPolicy: 'strict-origin-when-cross-origin',

    permissionsPolicy: {
      accelerometer: [],
      autoplay: [],
      camera: [],
      'clipboard-read': [],
      'clipboard-write': ['self'],
      'display-capture': [],
      'encrypted-media': [],
      fullscreen: ['self'],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      midi: [],
      payment: [],
      'picture-in-picture': [],
      usb: [],
      'xr-spatial-tracking': [],
    },

    customHeaders: {},
  },

  rateLimit: {
    enabled: false,
    limit: undefined,
    windowSeconds: undefined,
    keyBy: undefined,
  },

  audit: {
    enabled: true,
    signingEnabled: false,
    signingKeyRef: undefined,
    retentionDays: 365,
  },

  encryption: {
    enabled: false,
    primaryKeyRef: undefined,
    previousKeyRefs: [],
    rotationDays: 90,
  },
} satisfies SecurityConfig;

export const defaultProductionSecurityConfig = {
  enabled: true,

  environment: 'production',

  uuidNamespace: defaultSecurityUuidNamespace,
  uuid_namespace: defaultSecurityUuidNamespace,

  defaultSensitivity: 'internal',

  secrets: {
    AUTH_SECRET: {
      name: 'AUTH_SECRET',
      provider: 'cloudflare-secrets',
      ref: 'AUTH_SECRET',
      required: true,
      description: 'Auth.js / session signing and encryption secret.',
      sensitivity: 'secret-reference',
      rotationDays: 90,
    },

    DATABASE_URL: {
      name: 'DATABASE_URL',
      provider: 'cloudflare-secrets',
      ref: 'DATABASE_URL',
      required: true,
      description: 'Primary database connection string.',
      sensitivity: 'secret-reference',
      rotationDays: 90,
    },

    DISCORD_BOT_TOKEN: {
      name: 'DISCORD_BOT_TOKEN',
      provider: 'cloudflare-secrets',
      ref: 'DISCORD_BOT_TOKEN',
      required: false,
      description: 'Discord bot token used by the Discord integration.',
      sensitivity: 'secret-reference',
      rotationDays: 90,
    },

    GITHUB_CLIENT_SECRET: {
      name: 'GITHUB_CLIENT_SECRET',
      provider: 'cloudflare-secrets',
      ref: 'GITHUB_CLIENT_SECRET',
      required: false,
      description: 'GitHub OAuth client secret.',
      sensitivity: 'secret-reference',
      rotationDays: 90,
    },

    GOOGLE_CLIENT_SECRET: {
      name: 'GOOGLE_CLIENT_SECRET',
      provider: 'cloudflare-secrets',
      ref: 'GOOGLE_CLIENT_SECRET',
      required: false,
      description: 'Google OAuth client secret.',
      sensitivity: 'secret-reference',
      rotationDays: 90,
    },
  },

  cookies: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    domain: 'helixaibot.com',
    path: '/',
    maxAgeSeconds: thirtyDaysInSeconds,
  },

  cors: {
    enabled: true,
    allowedOrigins: ['https://helixaibot.com'],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-requested-with',
      'x-helix-tenant-id',
      'x-helix-session-id',
      'x-helix-trace-id',
    ],
    exposedHeaders: ['x-helix-trace-id'],
    allowCredentials: true,
    maxAgeSeconds: 600,
  },

  headers: {
    contentSecurityPolicy: {
      enabled: true,
      reportOnly: false,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'form-action': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'connect-src': [
          "'self'",
          'https://helixaibot.com',
          'https://*.grafana.net',
          'https://*.grafana.com',
        ],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': [],
      },
    },

    hstsMaxAgeSeconds: 31_536_000,
    hstsPreload: 'candidate',
    hstsIncludeSubDomains: true,

    frameOptions: 'DENY',

    contentTypeOptions: 'nosniff',

    referrerPolicy: 'strict-origin-when-cross-origin',

    permissionsPolicy: {
      accelerometer: [],
      autoplay: [],
      camera: [],
      'clipboard-read': [],
      'clipboard-write': ['self'],
      'display-capture': [],
      'encrypted-media': [],
      fullscreen: ['self'],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      midi: [],
      payment: [],
      'picture-in-picture': [],
      usb: [],
      'xr-spatial-tracking': [],
    },

    customHeaders: {
      'X-DNS-Prefetch-Control': 'off',
    },
  },

  rateLimit: {
    enabled: true,
    limit: 300,
    windowSeconds: 60,
    keyBy: 'ip',
  },

  audit: {
    enabled: true,
    signingEnabled: false,
    signingKeyRef: undefined,
    retentionDays: 365,
  },

  encryption: {
    enabled: false,
    primaryKeyRef: undefined,
    previousKeyRefs: [],
    rotationDays: 90,
  },
} satisfies SecurityConfig;

export const defaultLocalSecurityConfig = {
  enabled: true,

  environment: 'development',

  uuidNamespace: defaultSecurityUuidNamespace,
  uuid_namespace: defaultSecurityUuidNamespace,

  defaultSensitivity: 'internal',

  secrets: {
    AUTH_SECRET: {
      name: 'AUTH_SECRET',
      provider: 'local-dev-vars',
      ref: 'AUTH_SECRET',
      required: false,
      description: 'Local Auth.js / session signing secret.',
      sensitivity: 'secret-reference',
      rotationDays: undefined,
    },
  },

  cookies: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    domain: undefined,
    path: '/',
    maxAgeSeconds: thirtyDaysInSeconds,
  },

  cors: {
    enabled: true,
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:8787',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8787',
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-requested-with',
      'x-helix-tenant-id',
      'x-helix-session-id',
    ],
    exposedHeaders: ['x-helix-trace-id'],
    allowCredentials: true,
    maxAgeSeconds: 600,
  },

  headers: {
    contentSecurityPolicy: {
      enabled: true,
      reportOnly: true,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'form-action': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        'font-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'connect-src': [
          "'self'",
          'http://localhost:*',
          'http://127.0.0.1:*',
          'ws://localhost:*',
          'ws://127.0.0.1:*',
        ],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
      },
    },

    hstsMaxAgeSeconds: undefined,
    hstsPreload: 'disabled',
    hstsIncludeSubDomains: false,

    frameOptions: 'DENY',

    contentTypeOptions: 'nosniff',

    referrerPolicy: 'strict-origin-when-cross-origin',

    permissionsPolicy: {
      accelerometer: [],
      autoplay: [],
      camera: [],
      'clipboard-read': [],
      'clipboard-write': ['self'],
      'display-capture': [],
      'encrypted-media': [],
      fullscreen: ['self'],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      midi: [],
      payment: [],
      'picture-in-picture': [],
      usb: [],
      'xr-spatial-tracking': [],
    },

    customHeaders: {},
  },

  rateLimit: {
    enabled: false,
    limit: undefined,
    windowSeconds: undefined,
    keyBy: undefined,
  },

  audit: {
    enabled: true,
    signingEnabled: false,
    signingKeyRef: undefined,
    retentionDays: 30,
  },

  encryption: {
    enabled: false,
    primaryKeyRef: undefined,
    previousKeyRefs: [],
    rotationDays: 90,
  },
} satisfies SecurityConfig;

export default defaultSecurityConfig;