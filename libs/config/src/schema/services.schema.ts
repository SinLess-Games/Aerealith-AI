import { z } from 'zod';

import type { ServicesConfig } from '../types/services';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const serviceProtocolSchema = z.union([
  z.literal('http'),
  z.literal('https'),
  z.literal('grpc'),
  z.literal('websocket'),
  z.literal('cloudflare-service-binding'),
  z.literal('cloudflare-rpc'),
  z.literal('queue'),
  z.literal('event'),
  z.literal('internal'),
  nonEmptyStringSchema,
]);

export const serviceRuntimeSchema = z.union([
  z.literal('cloudflare-worker'),
  z.literal('cloudflare-durable-object'),
  z.literal('cloudflare-workflow'),
  z.literal('node'),
  z.literal('container'),
  z.literal('kubernetes'),
  z.literal('browser'),
  z.literal('external-saas'),
  z.literal('unknown'),
  nonEmptyStringSchema,
]);

export const serviceExposureSchema = z.union([
  z.literal('public'),
  z.literal('private'),
  z.literal('internal'),
  z.literal('edge'),
  z.literal('admin'),
  z.literal('webhook'),
  nonEmptyStringSchema,
]);

export const serviceHealthStatusSchema = z.union([
  z.literal('healthy'),
  z.literal('degraded'),
  z.literal('unhealthy'),
  z.literal('unknown'),
  nonEmptyStringSchema,
]);

export const serviceEndpointSchema = z
  .object({
    name: nonEmptyStringSchema,

    protocol: serviceProtocolSchema,

    url: optionalUrlSchema,

    basePath: optionalNonEmptyStringSchema,

    healthPath: optionalNonEmptyStringSchema,

    timeoutMs: z.number().int().positive().optional(),

    exposure: serviceExposureSchema,

    headers: z.record(z.string(), z.string()).optional(),

    requiredSecretRefs: stringArraySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const urlRequiredProtocols = ['http', 'https', 'grpc', 'websocket'];

    if (urlRequiredProtocols.includes(value.protocol) && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `url is required when endpoint protocol is "${value.protocol}".`,
      });
    }

    if (value.basePath && !value.basePath.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['basePath'],
        message: 'basePath must start with "/".',
      });
    }

    if (value.healthPath && !value.healthPath.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['healthPath'],
        message: 'healthPath must start with "/".',
      });
    }
  });

export const cloudflareServiceBindingSchema = z
  .object({
    binding: nonEmptyStringSchema,

    service: nonEmptyStringSchema,

    entrypoint: optionalNonEmptyStringSchema,

    rpcEnabled: z.boolean().optional(),
  })
  .strict();

export const serviceQueueSchema = z
  .object({
    name: nonEmptyStringSchema,

    binding: optionalNonEmptyStringSchema,

    queue: optionalNonEmptyStringSchema,

    eventTypes: stringArraySchema.optional(),

    consumes: z.boolean().optional(),

    publishes: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.binding && !value.queue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['binding'],
        message: 'Either binding or queue should be set for a service queue.',
      });
    }

    if (value.consumes !== true && value.publishes !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consumes'],
        message: 'A service queue should consume, publish, or both.',
      });
    }
  });

export const serviceDependencySchema = z
  .object({
    service: nonEmptyStringSchema,

    required: z.boolean(),

    protocol: serviceProtocolSchema.optional(),

    endpoint: optionalNonEmptyStringSchema,

    binding: optionalNonEmptyStringSchema,

    purpose: optionalNonEmptyStringSchema,
  })
  .strict();

export const serviceRetrySchema = z
  .object({
    enabled: z.boolean(),

    attempts: z.number().int().nonnegative().optional(),

    initialDelayMs: z.number().int().nonnegative().optional(),

    maxDelayMs: z.number().int().nonnegative().optional(),

    backoffMultiplier: z.number().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.attempts === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attempts'],
        message: 'attempts is required when retry is enabled.',
      });
    }

    if (
      value.initialDelayMs !== undefined &&
      value.maxDelayMs !== undefined &&
      value.initialDelayMs > value.maxDelayMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialDelayMs'],
        message: 'initialDelayMs must be less than or equal to maxDelayMs.',
      });
    }
  });

export const serviceRateLimitSchema = z
  .object({
    enabled: z.boolean(),

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

export const serviceSchema = z
  .object({
    name: nonEmptyStringSchema,

    displayName: optionalNonEmptyStringSchema,

    enabled: z.boolean(),

    runtime: serviceRuntimeSchema,

    version: optionalNonEmptyStringSchema,

    environment: optionalNonEmptyStringSchema,

    owner: optionalNonEmptyStringSchema,

    description: optionalNonEmptyStringSchema,

    exposure: serviceExposureSchema,

    endpoints: z.record(z.string(), serviceEndpointSchema).optional(),

    cloudflareBinding: cloudflareServiceBindingSchema.optional(),

    queues: z.record(z.string(), serviceQueueSchema).optional(),

    dependencies: z.array(serviceDependencySchema).optional(),

    retry: serviceRetrySchema.optional(),

    rateLimit: serviceRateLimitSchema.optional(),

    requiredConfigKeys: stringArraySchema.optional(),

    requiredSecretRefs: stringArraySchema.optional(),

    tags: stringArraySchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.runtime === 'cloudflare-worker' &&
      value.exposure === 'internal' &&
      !value.cloudflareBinding &&
      (!value.endpoints || Object.keys(value.endpoints).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cloudflareBinding'],
        message:
          'Internal Cloudflare Worker services should define a cloudflareBinding or an internal endpoint.',
      });
    }

    if (
      value.cloudflareBinding?.rpcEnabled &&
      value.cloudflareBinding.entrypoint === ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cloudflareBinding', 'entrypoint'],
        message: 'entrypoint must not be empty when RPC is enabled.',
      });
    }

    if (value.endpoints) {
      for (const [endpointKey, endpoint] of Object.entries(value.endpoints)) {
        if (endpoint.name !== endpointKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endpoints', endpointKey, 'name'],
            message:
              'Endpoint name should match its registry key for predictable lookups.',
          });
        }
      }
    }

    if (value.queues) {
      for (const [queueKey, queue] of Object.entries(value.queues)) {
        if (queue.name !== queueKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['queues', queueKey, 'name'],
            message:
              'Queue name should match its registry key for predictable lookups.',
          });
        }
      }
    }
  });

export const servicesSchema = z
  .object({
    enabled: z.boolean().default(false),

    defaultTimeoutMs: z.number().int().positive().optional(),

    defaultRetry: serviceRetrySchema.optional(),

    registry: z.record(z.string(), serviceSchema).default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (Object.keys(value.registry).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registry'],
        message: 'At least one service is required when services are enabled.',
      });
    }

    for (const [serviceKey, service] of Object.entries(value.registry)) {
      if (service.name !== serviceKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['registry', serviceKey, 'name'],
          message:
            'Service name should match its registry key for predictable lookups.',
        });
      }

      if (service.dependencies) {
        for (const [dependencyIndex, dependency] of service.dependencies.entries()) {
          if (dependency.service === serviceKey) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'registry',
                serviceKey,
                'dependencies',
                dependencyIndex,
                'service',
              ],
              message: 'A service should not depend on itself.',
            });
          }

          if (!(dependency.service in value.registry) && dependency.required) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'registry',
                serviceKey,
                'dependencies',
                dependencyIndex,
                'service',
              ],
              message:
                'Required service dependencies should reference another service in the registry.',
            });
          }
        }
      }
    }
  }) satisfies z.ZodType<ServicesConfig>;

export type ServicesConfigInput = z.input<typeof servicesSchema>;

export type ServicesConfigOutput = z.output<typeof servicesSchema>;

export function parseServicesConfig(input: ServicesConfigInput): ServicesConfig {
  return servicesSchema.parse(input);
}

export function safeParseServicesConfig(input: unknown) {
  return servicesSchema.safeParse(input);
}