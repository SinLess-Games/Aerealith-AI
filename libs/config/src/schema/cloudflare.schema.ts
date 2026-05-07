import { z } from 'zod';

import type { CloudflareConfig } from '../types/cloudflare';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const cloudflareVarValueSchema: z.ZodType<
  string | number | boolean | null | Record<string, unknown>
> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.unknown()),
]);

export const cloudflareEnvironmentSchema = z.union([
  z.literal('development'),
  z.literal('preview'),
  z.literal('staging'),
  z.literal('production'),
  z.literal('test'),
  nonEmptyStringSchema,
]);

export const cloudflareWorkerRuntimeSchema = z.union([
  z.literal('workers'),
  z.literal('pages'),
  z.literal('workers-static-assets'),
  z.literal('opennext'),
  nonEmptyStringSchema,
]);

export const cloudflareRouteModeSchema = z.union([
  z.literal('route'),
  z.literal('custom-domain'),
  z.literal('workers-dev'),
  z.literal('preview'),
  nonEmptyStringSchema,
]);

export const cloudflareBindingKindSchema = z.union([
  z.literal('vars'),
  z.literal('secrets'),
  z.literal('kv'),
  z.literal('r2'),
  z.literal('queue'),
  z.literal('durable-object'),
  z.literal('d1'),
  z.literal('hyperdrive'),
  z.literal('vectorize'),
  z.literal('service'),
  z.literal('workflow'),
  z.literal('ai'),
  z.literal('analytics-engine'),
  z.literal('browser-rendering'),
  z.literal('dispatch-namespace'),
  nonEmptyStringSchema,
]);

export const cloudflareServiceBindingModeSchema = z.union([
  z.literal('fetch'),
  z.literal('rpc'),
  nonEmptyStringSchema,
]);

export const cloudflareQueueRoleSchema = z.union([
  z.literal('producer'),
  z.literal('consumer'),
  z.literal('producer-consumer'),
  nonEmptyStringSchema,
]);

export const cloudflareDurableObjectStorageSchema = z.union([
  z.literal('sqlite'),
  z.literal('kv'),
  z.literal('none'),
  nonEmptyStringSchema,
]);

export const cloudflareRouteSchema = z
  .object({
    pattern: nonEmptyStringSchema,

    zoneName: optionalNonEmptyStringSchema,

    zoneId: optionalNonEmptyStringSchema,

    mode: cloudflareRouteModeSchema,

    enabled: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.mode === 'route' && !value.zoneName && !value.zoneId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zoneName'],
        message: 'zoneName or zoneId is required for an enabled route.',
      });
    }

    if (value.mode === 'custom-domain' && value.pattern.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pattern'],
        message:
          'Custom domain patterns should be hostnames, not wildcard route patterns.',
      });
    }
  });

export const cloudflareCustomDomainSchema = z
  .object({
    hostname: nonEmptyStringSchema,

    zoneName: optionalNonEmptyStringSchema,

    zoneId: optionalNonEmptyStringSchema,

    enabled: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.zoneName && !value.zoneId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zoneName'],
        message: 'zoneName or zoneId is required for an enabled custom domain.',
      });
    }
  });

export const cloudflareVarSchema = z
  .object({
    values: z.record(z.string(), cloudflareVarValueSchema).default({}),
  })
  .strict();

export const cloudflareSecretsSchema = z
  .object({
    required: stringArraySchema,

    optional: stringArraySchema.optional(),

    localFile: z
      .union([
        z.literal('.dev.vars'),
        z.literal('.env'),
        nonEmptyStringSchema,
      ])
      .optional(),
  })
  .strict();

export const cloudflareKvNamespaceBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    id: optionalNonEmptyStringSchema,

    previewId: optionalNonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareR2BucketBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    bucketName: nonEmptyStringSchema,

    previewBucketName: optionalNonEmptyStringSchema,

    publicUrl: z.string().trim().url().optional(),

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareQueueBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    queueName: nonEmptyStringSchema,

    role: cloudflareQueueRoleSchema,

    eventTypes: stringArraySchema.optional(),

    deadLetterQueueName: optionalNonEmptyStringSchema,

    maxBatchSize: z.number().int().positive().optional(),

    maxBatchTimeoutSeconds: z.number().int().positive().optional(),

    maxRetries: z.number().int().nonnegative().optional(),
  })
  .strict();

export const cloudflareDurableObjectBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    className: nonEmptyStringSchema,

    scriptName: optionalNonEmptyStringSchema,

    storage: cloudflareDurableObjectStorageSchema.optional(),

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareD1DatabaseBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    databaseName: nonEmptyStringSchema,

    databaseId: optionalNonEmptyStringSchema,

    previewDatabaseId: optionalNonEmptyStringSchema,

    secondaryOnly: z.boolean().optional(),
  })
  .strict();

export const cloudflareHyperdriveBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    id: optionalNonEmptyStringSchema,

    originDatabaseUrlRef: optionalNonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareVectorizeBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    indexName: nonEmptyStringSchema,

    indexId: optionalNonEmptyStringSchema,

    dimensions: z.number().int().positive().optional(),

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareServiceBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    service: nonEmptyStringSchema,

    entrypoint: optionalNonEmptyStringSchema,

    mode: cloudflareServiceBindingModeSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'rpc' && !value.entrypoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entrypoint'],
        message: 'entrypoint is recommended when service binding mode is rpc.',
      });
    }
  });

export const cloudflareWorkflowBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    name: nonEmptyStringSchema,

    className: optionalNonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareAiBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    enabled: z.boolean(),

    defaultModel: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareAnalyticsEngineBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    dataset: optionalNonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareBrowserRenderingBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    enabled: z.boolean(),
  })
  .strict();

export const cloudflareDispatchNamespaceBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    namespace: nonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareBindingsSchema = z
  .object({
    vars: cloudflareVarSchema.optional(),

    secrets: cloudflareSecretsSchema.optional(),

    kvNamespaces: z
      .record(z.string(), cloudflareKvNamespaceBindingSchema)
      .optional(),

    r2Buckets: z.record(z.string(), cloudflareR2BucketBindingSchema).optional(),

    queues: z.record(z.string(), cloudflareQueueBindingSchema).optional(),

    durableObjects: z
      .record(z.string(), cloudflareDurableObjectBindingSchema)
      .optional(),

    d1Databases: z
      .record(z.string(), cloudflareD1DatabaseBindingSchema)
      .optional(),

    hyperdrive: z
      .record(z.string(), cloudflareHyperdriveBindingSchema)
      .optional(),

    vectorize: z.record(z.string(), cloudflareVectorizeBindingSchema).optional(),

    services: z.record(z.string(), cloudflareServiceBindingSchema).optional(),

    workflows: z.record(z.string(), cloudflareWorkflowBindingSchema).optional(),

    ai: cloudflareAiBindingSchema.optional(),

    analyticsEngine: z
      .record(z.string(), cloudflareAnalyticsEngineBindingSchema)
      .optional(),

    browserRendering: cloudflareBrowserRenderingBindingSchema.optional(),

    dispatchNamespaces: z
      .record(z.string(), cloudflareDispatchNamespaceBindingSchema)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validateRegistryKeys = <T extends { binding: string }>(
      registry:
        | Record<string, T>
        | undefined,
      path: string,
    ) => {
      if (!registry) {
        return;
      }

      for (const [key, item] of Object.entries(registry)) {
        if (item.binding !== key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, key, 'binding'],
            message:
              'Binding name should match its registry key for predictable lookups.',
          });
        }
      }
    };

    validateRegistryKeys(value.kvNamespaces, 'kvNamespaces');
    validateRegistryKeys(value.r2Buckets, 'r2Buckets');
    validateRegistryKeys(value.queues, 'queues');
    validateRegistryKeys(value.durableObjects, 'durableObjects');
    validateRegistryKeys(value.d1Databases, 'd1Databases');
    validateRegistryKeys(value.hyperdrive, 'hyperdrive');
    validateRegistryKeys(value.vectorize, 'vectorize');
    validateRegistryKeys(value.services, 'services');
    validateRegistryKeys(value.workflows, 'workflows');
    validateRegistryKeys(value.analyticsEngine, 'analyticsEngine');
    validateRegistryKeys(value.dispatchNamespaces, 'dispatchNamespaces');
  });

export const cloudflarePlacementSchema = z
  .object({
    enabled: z.boolean().default(false),

    mode: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareLimitsSchema = z
  .object({
    maxRequestBodyBytes: z.number().int().positive().optional(),

    requestTimeoutMs: z.number().int().positive().optional(),

    cpuBudgetMs: z.number().int().positive().optional(),
  })
  .strict();

export const cloudflareWorkerSchema = z
  .object({
    name: nonEmptyStringSchema,

    runtime: cloudflareWorkerRuntimeSchema,

    main: optionalNonEmptyStringSchema,

    compatibilityDate: optionalNonEmptyStringSchema,

    compatibilityFlags: stringArraySchema.optional(),

    workersDev: z.boolean().optional(),

    routes: z.array(cloudflareRouteSchema).optional(),

    customDomains: z.array(cloudflareCustomDomainSchema).optional(),

    bindings: cloudflareBindingsSchema.optional(),

    placement: cloudflarePlacementSchema.optional(),

    limits: cloudflareLimitsSchema.optional(),

    tags: stringArraySchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.runtime === 'opennext' && !value.compatibilityFlags?.includes('nodejs_compat')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['compatibilityFlags'],
        message:
          'OpenNext/Next.js Workers usually require the nodejs_compat compatibility flag.',
      });
    }
  });

export const cloudflareEnvironmentConfigSchema = z
  .object({
    name: cloudflareEnvironmentSchema,

    workerName: optionalNonEmptyStringSchema,

    routes: z.array(cloudflareRouteSchema).optional(),

    customDomains: z.array(cloudflareCustomDomainSchema).optional(),

    bindings: cloudflareBindingsSchema.optional(),

    compatibilityDate: optionalNonEmptyStringSchema,

    compatibilityFlags: stringArraySchema.optional(),

    deployable: z.boolean().optional(),

    requiresApproval: z.boolean().optional(),
  })
  .strict();

export const cloudflareAccountSchema = z
  .object({
    accountId: optionalNonEmptyStringSchema,

    apiTokenRef: optionalNonEmptyStringSchema,

    zoneId: optionalNonEmptyStringSchema,

    zoneName: optionalNonEmptyStringSchema,
  })
  .strict();

export const cloudflareCiSchema = z
  .object({
    enabled: z.boolean().default(false),

    provider: optionalNonEmptyStringSchema,

    accountIdRef: optionalNonEmptyStringSchema,

    apiTokenRef: optionalNonEmptyStringSchema,

    productionApprovalRequired: z.boolean().optional(),

    gradualDeploymentsEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.accountIdRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountIdRef'],
        message:
          'accountIdRef is required when Cloudflare CI/CD integration is enabled.',
      });
    }

    if (!value.apiTokenRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiTokenRef'],
        message:
          'apiTokenRef is required when Cloudflare CI/CD integration is enabled.',
      });
    }
  });

export const cloudflareSchema = z
  .object({
    enabled: z.boolean().default(false),

    defaultEnvironment: cloudflareEnvironmentSchema.default('development'),

    account: cloudflareAccountSchema.default({}),

    worker: cloudflareWorkerSchema.optional(),

    environments: z
      .record(z.string(), cloudflareEnvironmentConfigSchema)
      .optional(),

    ci: cloudflareCiSchema.optional(),

    requiredBindingKinds: z.array(cloudflareBindingKindSchema).optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.account.accountId && !value.ci?.accountIdRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['account', 'accountId'],
        message:
          'account.accountId or ci.accountIdRef is required when Cloudflare is enabled.',
      });
    }

    if (!value.account.zoneName && !value.account.zoneId) {
      const hasRouteZone =
        value.worker?.routes?.some((route) => route.zoneName || route.zoneId) ??
        false;

      const hasCustomDomainZone =
        value.worker?.customDomains?.some(
          (domain) => domain.zoneName || domain.zoneId,
        ) ?? false;

      if (!hasRouteZone && !hasCustomDomainZone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['account', 'zoneName'],
          message:
            'account.zoneName/zoneId or route/custom-domain zone config is required when Cloudflare is enabled.',
        });
      }
    }

    if (value.environments) {
      for (const [environmentKey, environment] of Object.entries(value.environments)) {
        if (environment.name !== environmentKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['environments', environmentKey, 'name'],
            message:
              'Environment name should match its registry key for predictable lookups.',
          });
        }

        if (
          environment.requiresApproval === true &&
          environment.deployable === false
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['environments', environmentKey, 'requiresApproval'],
            message:
              'requiresApproval should only be true for deployable environments.',
          });
        }
      }

      if (
        value.defaultEnvironment &&
        !(value.defaultEnvironment in value.environments) &&
        value.defaultEnvironment !== 'development'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['defaultEnvironment'],
          message:
            'defaultEnvironment should reference an environment key when environments are defined.',
        });
      }
    }
  }) satisfies z.ZodType<CloudflareConfig>;

export type CloudflareConfigInput = z.input<typeof cloudflareSchema>;

export type CloudflareConfigOutput = z.output<typeof cloudflareSchema>;

export function parseCloudflareConfig(
  input: CloudflareConfigInput,
): CloudflareConfig {
  return cloudflareSchema.parse(input);
}

export function safeParseCloudflareConfig(input: unknown) {
  return cloudflareSchema.safeParse(input);
}