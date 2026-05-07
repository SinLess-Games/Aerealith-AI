import { z } from 'zod';

import type { AuthConfig } from '../types/auth';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const authProviderSchema = z.union([
  z.literal('credentials'),
  z.literal('google'),
  z.literal('github'),
  z.literal('discord'),
  z.literal('passkey'),
  z.literal('magic-link'),
  z.literal('api-key'),
  nonEmptyStringSchema,
]);

export const authSessionStrategySchema = z.union([
  z.literal('jwt'),
  z.literal('database'),
  z.literal('stateless'),
  nonEmptyStringSchema,
]);

export const authRuntimeSchema = z.union([
  z.literal('nextjs'),
  z.literal('cloudflare-worker'),
  z.literal('node'),
  z.literal('container'),
  z.literal('kubernetes'),
  z.literal('local'),
  nonEmptyStringSchema,
]);

export const nextAuthSchema = z
  .object({
    enabled: z.boolean().default(false),

    secret: optionalNonEmptyStringSchema,

    secretRef: optionalNonEmptyStringSchema,

    url: optionalUrlSchema,

    trustHost: z.boolean().optional(),

    sessionStrategy: authSessionStrategySchema.optional(),

    sessionMaxAgeSeconds: z.number().int().positive().optional(),

    sessionUpdateAgeSeconds: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.secret && !value.secretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secretRef'],
        message:
          'secretRef or secret is required when NextAuth/Auth.js is enabled.',
      });
    }

    if (
      value.sessionMaxAgeSeconds !== undefined &&
      value.sessionUpdateAgeSeconds !== undefined &&
      value.sessionUpdateAgeSeconds > value.sessionMaxAgeSeconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionUpdateAgeSeconds'],
        message:
          'sessionUpdateAgeSeconds must be less than or equal to sessionMaxAgeSeconds.',
      });
    }
  });

export const oauthProviderSchema = z
  .object({
    enabled: z.boolean().default(false),

    clientId: optionalNonEmptyStringSchema,

    clientIdRef: optionalNonEmptyStringSchema,

    clientSecret: optionalNonEmptyStringSchema,

    clientSecretRef: optionalNonEmptyStringSchema,

    redirectUri: optionalUrlSchema,

    scopes: stringArraySchema.optional(),

    issuer: optionalUrlSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.clientId && !value.clientIdRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientId'],
        message:
          'clientId or clientIdRef is required when this OAuth provider is enabled.',
      });
    }

    if (!value.clientSecret && !value.clientSecretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientSecretRef'],
        message:
          'clientSecretRef or clientSecret is required when this OAuth provider is enabled.',
      });
    }

    if (!value.redirectUri) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['redirectUri'],
        message:
          'redirectUri is required when this OAuth provider is enabled.',
      });
    }
  });

export const credentialsAuthSchema = z
  .object({
    enabled: z.boolean().default(false),

    emailPasswordEnabled: z.boolean().optional(),

    usernamePasswordEnabled: z.boolean().optional(),

    registrationEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (
      value.emailPasswordEnabled !== true &&
      value.usernamePasswordEnabled !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emailPasswordEnabled'],
        message:
          'emailPasswordEnabled or usernamePasswordEnabled must be true when credentials auth is enabled.',
      });
    }
  });

export const passkeyAuthSchema = z
  .object({
    enabled: z.boolean().default(false),

    rpId: optionalNonEmptyStringSchema,

    rpName: optionalNonEmptyStringSchema,

    origins: z.array(z.string().trim().url()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.rpId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rpId'],
        message: 'rpId is required when passkeys are enabled.',
      });
    }

    if (!value.rpName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rpName'],
        message: 'rpName is required when passkeys are enabled.',
      });
    }

    if (!value.origins || value.origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origins'],
        message: 'At least one origin is required when passkeys are enabled.',
      });
    }
  });

export const magicLinkAuthSchema = z
  .object({
    enabled: z.boolean().default(false),

    tokenTtlSeconds: z.number().int().positive().optional(),

    tokenSecretRef: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.tokenTtlSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tokenTtlSeconds'],
        message:
          'tokenTtlSeconds is required when magic-link auth is enabled.',
      });
    }

    if (!value.tokenSecretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tokenSecretRef'],
        message:
          'tokenSecretRef is required when magic-link auth is enabled.',
      });
    }
  });

export const apiKeyAuthSchema = z
  .object({
    enabled: z.boolean().default(false),

    headerName: optionalNonEmptyStringSchema,

    keyPrefix: optionalNonEmptyStringSchema,

    defaultExpirationDays: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.headerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['headerName'],
        message: 'headerName is required when API key auth is enabled.',
      });
    }
  });

export const authCookieSchema = z
  .object({
    secure: z.boolean().default(true),

    httpOnly: z.boolean().default(true),

    sameSite: z
      .union([
        z.literal('lax'),
        z.literal('strict'),
        z.literal('none'),
        nonEmptyStringSchema,
      ])
      .default('lax'),

    domain: optionalNonEmptyStringSchema,

    path: z.string().trim().min(1).default('/'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sameSite === 'none' && value.secure !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secure'],
        message: 'Cookies with SameSite=None must also be Secure.',
      });
    }
  });

export const authSchema = z
  .object({
    enabled: z.boolean().default(false),

    runtime: authRuntimeSchema.default('nextjs'),

    providers: z.array(authProviderSchema).default([]),

    nextAuth: nextAuthSchema.default({
      enabled: false,
    }),

    google: oauthProviderSchema.default({
      enabled: false,
    }),

    github: oauthProviderSchema.optional(),

    discord: oauthProviderSchema.optional(),

    credentials: credentialsAuthSchema.optional(),

    passkeys: passkeyAuthSchema.optional(),

    magicLink: magicLinkAuthSchema.optional(),

    apiKeys: apiKeyAuthSchema.optional(),

    cookies: authCookieSchema.optional(),

    requiredSecretRefs: stringArraySchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.providers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providers'],
        message: 'At least one auth provider is required when auth is enabled.',
      });
    }

    if (value.providers.includes('google') && value.google.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['google', 'enabled'],
        message:
          'google.enabled must be true when "google" is listed in providers.',
      });
    }

    if (value.providers.includes('github') && value.github?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['github', 'enabled'],
        message:
          'github.enabled must be true when "github" is listed in providers.',
      });
    }

    if (value.providers.includes('discord') && value.discord?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discord', 'enabled'],
        message:
          'discord.enabled must be true when "discord" is listed in providers.',
      });
    }

    if (
      value.providers.includes('credentials') &&
      value.credentials?.enabled !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials', 'enabled'],
        message:
          'credentials.enabled must be true when "credentials" is listed in providers.',
      });
    }

    if (value.providers.includes('passkey') && value.passkeys?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['passkeys', 'enabled'],
        message:
          'passkeys.enabled must be true when "passkey" is listed in providers.',
      });
    }

    if (
      value.providers.includes('magic-link') &&
      value.magicLink?.enabled !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['magicLink', 'enabled'],
        message:
          'magicLink.enabled must be true when "magic-link" is listed in providers.',
      });
    }

    if (value.providers.includes('api-key') && value.apiKeys?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKeys', 'enabled'],
        message:
          'apiKeys.enabled must be true when "api-key" is listed in providers.',
      });
    }

    if (value.nextAuth.enabled && !value.providers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providers'],
        message:
          'At least one provider should be configured when NextAuth/Auth.js is enabled.',
      });
    }

    if (value.runtime === 'cloudflare-worker' && value.nextAuth.trustHost !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextAuth', 'trustHost'],
        message:
          'trustHost should be true when Auth.js runs behind Cloudflare or another proxy.',
      });
    }

    if (value.runtime === 'cloudflare-worker' && value.cookies?.secure === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cookies', 'secure'],
        message: 'Cloudflare Worker auth cookies should be secure.',
      });
    }

    if (value.requiredSecretRefs) {
      const unique = new Set(value.requiredSecretRefs);

      if (unique.size !== value.requiredSecretRefs.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredSecretRefs'],
          message: 'requiredSecretRefs must not contain duplicates.',
        });
      }
    }
  }) satisfies z.ZodType<AuthConfig>;

export type AuthConfigInput = z.input<typeof authSchema>;

export type AuthConfigOutput = z.output<typeof authSchema>;

export function parseAuthConfig(input: AuthConfigInput): AuthConfig {
  return authSchema.parse(input);
}

export function safeParseAuthConfig(input: unknown) {
  return authSchema.safeParse(input);
}