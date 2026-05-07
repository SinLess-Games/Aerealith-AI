import { z } from 'zod';

import type { AppConfig } from '../types/app';

import { authSchema } from './auth.schema';
import { cloudflareSchema } from './cloudflare.schema';
import { databaseSchema } from './database.schema';
import { discordSchema } from './discord.schema';
import { githubSchema } from './github.schema';
import { grafanaCloudSchema } from './grafana-cloud.schema';
import { redisSchema } from './redis.schema';
import { securitySchema } from './security.schema';
import { servicesSchema } from './services.schema';
import { storageSchema } from './storage.schema';
import { telemetrySchema } from './telemetry.schema';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

export const appEnvironmentSchema = z.union([
  z.literal('development'),
  z.literal('preview'),
  z.literal('staging'),
  z.literal('production'),
  z.literal('test'),
  nonEmptyStringSchema,
]);

export const appRuntimeSchema = z.union([
  z.literal('browser'),
  z.literal('nextjs'),
  z.literal('cloudflare-worker'),
  z.literal('node'),
  z.literal('container'),
  z.literal('kubernetes'),
  z.literal('local'),
  nonEmptyStringSchema,
]);

export const appIdentitySchema = z
  .object({
    name: nonEmptyStringSchema,

    displayName: nonEmptyStringSchema,

    version: optionalNonEmptyStringSchema,

    release: optionalNonEmptyStringSchema,

    owner: optionalNonEmptyStringSchema,

    url: optionalUrlSchema,

    domain: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.url || !value.domain) {
      return;
    }

    const hostname = value.url
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.split(':')[0];

    if (hostname !== value.domain) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['domain'],
        message: 'domain must match the hostname from url when both are provided.',
      });
    }
  });

export const publicRuntimeSchema = z
  .object({
    appName: optionalNonEmptyStringSchema,

    appUrl: optionalUrlSchema,

    environment: appEnvironmentSchema.optional(),

    release: optionalNonEmptyStringSchema,

    faroUrl: optionalUrlSchema,

    discordApplicationId: optionalNonEmptyStringSchema,

    githubClientId: optionalNonEmptyStringSchema,

    googleClientId: optionalNonEmptyStringSchema,

    turnstileSiteKey: optionalNonEmptyStringSchema,

    profileEncryptionKey: optionalNonEmptyStringSchema,
  })
  .strict();

export const publicTokensSchema = z
  .object({
    profileEncryptionKey: optionalNonEmptyStringSchema,
  })
  .strict();

export const appSchema = z
  .object({
    environment: appEnvironmentSchema.default('development'),

    runtime: appRuntimeSchema.default('node'),

    app: appIdentitySchema.default({
      name: 'helix',
      displayName: 'Helix AI',
    }),

    cloudflare: cloudflareSchema.default({
      enabled: false,
      defaultEnvironment: 'development',
      account: {},
    }),

    database: databaseSchema.default({
      enabled: false,
      defaultInstance: 'primary',
      instances: {},
    }),

    storage: storageSchema.default({
      enabled: false,
      provider: 'disabled',
      buckets: {},
    }),

    github: githubSchema.default({
      enabled: false,
      authMode: 'none',
      repoUrl: 'https://github.com/SinLess-Games/Helix',
      repository: {
        owner: 'SinLess-Games',
        name: 'Helix',
        fullName: 'SinLess-Games/Helix',
        url: 'https://github.com/SinLess-Games/Helix',
        defaultBranch: 'main',
      },
    }),

    discord: discordSchema.default({
      enabled: false,
      authMode: 'none',
      runtimeMode: 'http-interactions',
      bot: {
        enabled: false,
      },
    }),

    grafanaCloud: grafanaCloudSchema.default({
      enabled: false,
    }),

    security: securitySchema.default({
      enabled: true,
      environment: 'development',
      uuidNamespace: '00000000-0000-0000-0000-000000000000',
      uuid_namespace: '00000000-0000-0000-0000-000000000000',
      defaultSensitivity: 'internal',
      secrets: {},
      cookies: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
      cors: {
        enabled: false,
        allowedOrigins: [],
        allowedMethods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: [],
        allowCredentials: false,
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
          },
        },
      },
      rateLimit: {
        enabled: false,
      },
      audit: {
        enabled: true,
        signingEnabled: false,
      },
      encryption: {
        enabled: false,
      },
    }),

    auth: authSchema.default({
      enabled: false,
      runtime: 'nextjs',
      providers: [],
      nextAuth: {
        enabled: false,
      },
      google: {
        enabled: false,
      },
    }),

    telemetry: telemetrySchema.default({
      enabled: false,
      otel: {},
      faro: {
        enabled: false,
      },
    }),

    services: servicesSchema.default({
      enabled: false,
      registry: {},
    }),

    redis: redisSchema.default({
      enabled: false,
      instances: {},
    }),

    publicRuntime: publicRuntimeSchema.default({}),

    publicTokens: publicTokensSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.publicTokens?.profileEncryptionKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicTokens', 'profileEncryptionKey'],
        message:
          'profileEncryptionKey is public in this legacy field. Prefer a secret reference in security.encryption or telemetry.profileEncryptionKey.',
      });
    }

    if (value.publicRuntime.profileEncryptionKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicRuntime', 'profileEncryptionKey'],
        message:
          'profileEncryptionKey is public in publicRuntime. Prefer a secret reference in security.encryption or telemetry.profileEncryptionKey.',
      });
    }

    if (
      value.app.url &&
      value.publicRuntime.appUrl &&
      value.app.url !== value.publicRuntime.appUrl
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicRuntime', 'appUrl'],
        message: 'publicRuntime.appUrl must match app.url when both are provided.',
      });
    }

    if (
      value.publicRuntime.environment &&
      value.publicRuntime.environment !== value.environment
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicRuntime', 'environment'],
        message:
          'publicRuntime.environment must match the top-level environment when both are provided.',
      });
    }

    if (value.cloudflare.enabled && value.runtime !== 'cloudflare-worker') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runtime'],
        message:
          'runtime should be cloudflare-worker when cloudflare.enabled is true.',
      });
    }

    if (
      value.environment === 'production' &&
      value.security.environment !== 'production'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['security', 'environment'],
        message:
          'security.environment should be production when app environment is production.',
      });
    }

    if (
      value.environment === 'production' &&
      value.publicRuntime.appUrl &&
      !value.publicRuntime.appUrl.startsWith('https://')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicRuntime', 'appUrl'],
        message: 'publicRuntime.appUrl must use HTTPS in production.',
      });
    }

    if (
      value.environment === 'production' &&
      value.app.url &&
      !value.app.url.startsWith('https://')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['app', 'url'],
        message: 'app.url must use HTTPS in production.',
      });
    }
  }) satisfies z.ZodType<AppConfig>;

export type AppConfigInput = z.input<typeof appSchema>;

export type AppConfigOutput = z.output<typeof appSchema>;

export function parseAppConfig(input: AppConfigInput): AppConfig {
  return appSchema.parse(input);
}

export function safeParseAppConfig(input: unknown) {
  return appSchema.safeParse(input);
}