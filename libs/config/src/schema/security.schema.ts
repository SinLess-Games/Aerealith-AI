import { z } from 'zod';

import type { SecurityConfig } from '../types/security';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const sensitivityLevelSchema = z.union([
  z.literal('public'),
  z.literal('internal'),
  z.literal('personal'),
  z.literal('private'),
  z.literal('sensitive'),
  z.literal('business'),
  z.literal('technical'),
  z.literal('restricted'),
  z.literal('regulated'),
  z.literal('secret-reference'),
  nonEmptyStringSchema,
]);

export const securityEnvironmentSchema = z.union([
  z.literal('development'),
  z.literal('preview'),
  z.literal('staging'),
  z.literal('production'),
  z.literal('test'),
  nonEmptyStringSchema,
]);

export const secretProviderSchema = z.union([
  z.literal('cloudflare-secrets'),
  z.literal('cloudflare-secrets-store'),
  z.literal('github-actions'),
  z.literal('vault'),
  z.literal('doppler'),
  z.literal('onepassword'),
  z.literal('environment'),
  z.literal('local-dev-vars'),
  nonEmptyStringSchema,
]);

export const sameSitePolicySchema = z.union([
  z.literal('lax'),
  z.literal('strict'),
  z.literal('none'),
  nonEmptyStringSchema,
]);

export const referrerPolicySchema = z.union([
  z.literal('no-referrer'),
  z.literal('no-referrer-when-downgrade'),
  z.literal('origin'),
  z.literal('origin-when-cross-origin'),
  z.literal('same-origin'),
  z.literal('strict-origin'),
  z.literal('strict-origin-when-cross-origin'),
  z.literal('unsafe-url'),
  nonEmptyStringSchema,
]);

export const hstsPreloadModeSchema = z.union([
  z.literal('disabled'),
  z.literal('enabled'),
  z.literal('candidate'),
  nonEmptyStringSchema,
]);

export const secretRefSchema = z
  .object({
    name: nonEmptyStringSchema,

    provider: secretProviderSchema,

    ref: nonEmptyStringSchema,

    required: z.boolean(),

    description: optionalNonEmptyStringSchema,

    sensitivity: sensitivityLevelSchema.optional(),

    rotationDays: z.number().int().positive().optional(),
  })
  .strict();

export const cookieSecuritySchema = z
  .object({
    secure: z.boolean().default(true),

    httpOnly: z.boolean().default(true),

    sameSite: sameSitePolicySchema.default('lax'),

    domain: optionalNonEmptyStringSchema,

    path: z.string().trim().min(1).default('/'),

    maxAgeSeconds: z.number().int().positive().optional(),
  })
  .strict();

export const corsSecuritySchema = z
  .object({
    enabled: z.boolean().default(false),

    allowedOrigins: stringArraySchema,

    allowedMethods: z
      .array(
        z.union([
          z.literal('GET'),
          z.literal('POST'),
          z.literal('PUT'),
          z.literal('PATCH'),
          z.literal('DELETE'),
          z.literal('OPTIONS'),
          z.literal('HEAD'),
          nonEmptyStringSchema,
        ]),
      )
      .default(['GET', 'POST', 'OPTIONS']),

    allowedHeaders: stringArraySchema,

    exposedHeaders: stringArraySchema.optional(),

    allowCredentials: z.boolean().default(false),

    maxAgeSeconds: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.allowedOrigins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedOrigins'],
        message: 'At least one allowed origin is required when CORS is enabled.',
      });
    }

    if (value.allowCredentials && value.allowedOrigins.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedOrigins'],
        message:
          'CORS credentials must not be enabled with wildcard allowedOrigins.',
      });
    }
  });

export const contentSecurityPolicySchema = z
  .object({
    enabled: z.boolean().default(true),

    reportOnly: z.boolean().default(false),

    directives: z
      .record(z.string(), z.array(z.string().trim().min(1)))
      .default({
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      }),
  })
  .strict();

export const securityHeadersSchema = z
  .object({
    contentSecurityPolicy: contentSecurityPolicySchema.default({
      enabled: true,
      reportOnly: false,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      },
    }),

    hstsMaxAgeSeconds: z.number().int().nonnegative().optional(),

    hstsPreload: hstsPreloadModeSchema.optional(),

    hstsIncludeSubDomains: z.boolean().optional(),

    frameOptions: z
      .union([z.literal('DENY'), z.literal('SAMEORIGIN'), nonEmptyStringSchema])
      .optional(),

    contentTypeOptions: z
      .union([z.literal('nosniff'), nonEmptyStringSchema])
      .optional(),

    referrerPolicy: referrerPolicySchema.optional(),

    permissionsPolicy: z.record(z.string(), z.array(z.string())).optional(),

    customHeaders: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.hstsPreload === 'enabled') {
      if (!value.hstsMaxAgeSeconds || value.hstsMaxAgeSeconds < 31536000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hstsMaxAgeSeconds'],
          message:
            'HSTS preload should use a max age of at least 31536000 seconds.',
        });
      }

      if (value.hstsIncludeSubDomains !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hstsIncludeSubDomains'],
          message: 'HSTS preload requires includeSubDomains.',
        });
      }
    }
  });

export const rateLimitSecuritySchema = z
  .object({
    enabled: z.boolean().default(false),

    limit: z.number().int().positive().optional(),

    windowSeconds: z.number().int().positive().optional(),

    keyBy: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.limit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit'],
        message: 'limit is required when rate limiting is enabled.',
      });
    }

    if (value.windowSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowSeconds'],
        message: 'windowSeconds is required when rate limiting is enabled.',
      });
    }
  });

export const auditSecuritySchema = z
  .object({
    enabled: z.boolean().default(true),

    signingEnabled: z.boolean().default(false),

    signingKeyRef: optionalNonEmptyStringSchema,

    retentionDays: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.signingEnabled && !value.signingKeyRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signingKeyRef'],
        message: 'signingKeyRef is required when audit signing is enabled.',
      });
    }
  });

export const encryptionSecuritySchema = z
  .object({
    enabled: z.boolean().default(false),

    primaryKeyRef: optionalNonEmptyStringSchema,

    previousKeyRefs: stringArraySchema.optional(),

    rotationDays: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled && !value.primaryKeyRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primaryKeyRef'],
        message: 'primaryKeyRef is required when encryption is enabled.',
      });
    }
  });

export const securitySchema = z
  .object({
    enabled: z.boolean().default(true),

    environment: securityEnvironmentSchema.default('development'),

    uuidNamespace: z.string().trim().uuid(),

    uuid_namespace: z.string().trim().uuid(),

    defaultSensitivity: sensitivityLevelSchema.default('internal'),

    secrets: z.record(z.string(), secretRefSchema).default({}),

    cookies: cookieSecuritySchema.default({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    }),

    cors: corsSecuritySchema.default({
      enabled: false,
      allowedOrigins: [],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [],
      allowCredentials: false,
    }),

    headers: securityHeadersSchema.default({
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
    }),

    rateLimit: rateLimitSecuritySchema.default({
      enabled: false,
    }),

    audit: auditSecuritySchema.default({
      enabled: true,
      signingEnabled: false,
    }),

    encryption: encryptionSecuritySchema.default({
      enabled: false,
    }),

    metadata: z.record(z.string(), metadataValueSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.uuidNamespace !== value.uuid_namespace) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uuid_namespace'],
        message: 'uuid_namespace must match uuidNamespace.',
      });
    }

    if (value.environment === 'production') {
      if (!value.cookies.secure) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cookies', 'secure'],
          message: 'Production auth/application cookies should be secure.',
        });
      }

      if (!value.headers.contentSecurityPolicy.enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['headers', 'contentSecurityPolicy', 'enabled'],
          message: 'Content Security Policy should be enabled in production.',
        });
      }
    }

    for (const [secretKey, secret] of Object.entries(value.secrets)) {
      if (secret.name !== secretKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['secrets', secretKey, 'name'],
          message:
            'Secret reference name should match its registry key for predictable lookups.',
        });
      }
    }
  }) satisfies z.ZodType<SecurityConfig>;

export type SecurityConfigInput = z.input<typeof securitySchema>;

export type SecurityConfigOutput = z.output<typeof securitySchema>;

export function parseSecurityConfig(input: SecurityConfigInput): SecurityConfig {
  return securitySchema.parse(input);
}

export function safeParseSecurityConfig(input: unknown) {
  return securitySchema.safeParse(input);
}