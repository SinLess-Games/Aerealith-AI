import { z } from 'zod';

import type { SecurityConfig } from '../types/security';

const DEFAULT_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const uuidSchema = z.string().trim().uuid();

const metadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z.record(z.string(), metadataValueSchema);

const sensitivityLevelSchema = nonEmptyStringSchema;

export const securityEnvironmentSchema = nonEmptyStringSchema;

export const secretProviderSchema = nonEmptyStringSchema;

export const sameSitePolicySchema = nonEmptyStringSchema;

export const referrerPolicySchema = nonEmptyStringSchema;

export const hstsPreloadModeSchema = nonEmptyStringSchema;

const httpMethodSchema = nonEmptyStringSchema;

function normalizeSecurityConfigInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;

  const uuidNamespace =
    record.uuidNamespace ?? record.uuid_namespace ?? DEFAULT_UUID_NAMESPACE;

  const uuid_namespace =
    record.uuid_namespace ?? record.uuidNamespace ?? DEFAULT_UUID_NAMESPACE;

  return {
    ...record,
    uuidNamespace,
    uuid_namespace,
  };
}

export const secretRefSchema = z
  .object({
    name: nonEmptyStringSchema,

    provider: secretProviderSchema.default('environment'),

    ref: nonEmptyStringSchema,

    required: z.boolean().default(true),

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

    allowedMethods: z.array(httpMethodSchema).default(['GET', 'POST', 'OPTIONS']),

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
      .record(z.string(), z.array(nonEmptyStringSchema))
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

    frameOptions: nonEmptyStringSchema.optional(),

    contentTypeOptions: nonEmptyStringSchema.optional(),

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

export const securitySchema = z.preprocess(
  normalizeSecurityConfigInput,
  z
    .object({
      enabled: z.boolean().default(true),

      environment: securityEnvironmentSchema.default('development'),

      uuidNamespace: uuidSchema.default(DEFAULT_UUID_NAMESPACE),

      uuid_namespace: uuidSchema.default(DEFAULT_UUID_NAMESPACE),

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

      metadata: metadataSchema.optional(),
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
    }),
);

export type SecurityConfigInput = z.input<typeof securitySchema>;

export type SecurityConfigOutput = z.output<typeof securitySchema>;

export function parseSecurityConfig(input: SecurityConfigInput): SecurityConfig {
  return securitySchema.parse(input) as SecurityConfig;
}

export function safeParseSecurityConfig(input: unknown) {
  return securitySchema.safeParse(input);
}