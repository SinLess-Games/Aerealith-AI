import { z } from 'zod';

import type { GrafanaCloudConfig } from '../types/grafana-cloud';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const grafanaCloudRegionSchema = z.union([
  z.literal('us'),
  z.literal('eu'),
  z.literal('au'),
  z.literal('prod-us-central-0'),
  z.literal('prod-eu-west-0'),
  nonEmptyStringSchema,
]);

export const grafanaCloudSignalSchema = z.union([
  z.literal('logs'),
  z.literal('metrics'),
  z.literal('traces'),
  z.literal('profiles'),
  z.literal('frontend-observability'),
  nonEmptyStringSchema,
]);

export const grafanaCloudApiSchema = z
  .object({
    enabled: z.boolean().default(false),

    stackName: optionalNonEmptyStringSchema,

    region: grafanaCloudRegionSchema.optional(),

    stackUrl: optionalUrlSchema,

    apiTokenRef: optionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.stackName && !value.stackUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stackName'],
        message:
          'stackName or stackUrl is required when Grafana Cloud API integration is enabled.',
      });
    }

    if (!value.apiTokenRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiTokenRef'],
        message:
          'apiTokenRef is required when Grafana Cloud API integration is enabled.',
      });
    }
  });

export const faroSessionTrackingSchema = z
  .object({
    enabled: z.boolean().default(false),

    persistent: z.boolean().optional(),

    maxSessionPersistenceTimeMs: z.number().int().positive().optional(),
  })
  .strict();

export const faroTracingSchema = z
  .object({
    enabled: z.boolean().default(false),

    traceUrls: z
      .array(z.union([z.string().trim().min(1), z.instanceof(RegExp)]))
      .optional(),

    propagateTraceHeaderCorsUrls: z
      .array(z.union([z.string().trim().min(1), z.instanceof(RegExp)]))
      .optional(),
  })
  .strict();

export const faroSchema = z
  .object({
    enabled: z.boolean().default(false),

    url: z.string().trim().url().nullable().optional(),

    publicUrl: z.string().trim().url().nullable().optional(),

    appName: optionalNonEmptyStringSchema,

    appNamespace: optionalNonEmptyStringSchema,

    appVersion: optionalNonEmptyStringSchema,

    release: optionalNonEmptyStringSchema,

    environment: optionalNonEmptyStringSchema,

    samplingRate: z.number().min(0).max(1).optional(),

    captureErrors: z.boolean().optional(),

    captureConsole: z.boolean().optional(),

    capturePerformance: z.boolean().optional(),

    sessionTracking: faroSessionTrackingSchema.optional(),

    tracing: faroTracingSchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.url && !value.publicUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'url or publicUrl is required when Faro is enabled.',
      });
    }

    if (!value.appName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appName'],
        message: 'appName is required when Faro is enabled.',
      });
    }

    if (value.url && value.publicUrl && value.url !== value.publicUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicUrl'],
        message: 'publicUrl must match url when both are provided.',
      });
    }
  });

export const grafanaCloudAddonSchema = z
  .object({
    faro: faroSchema.optional(),

    enabledSignals: z.array(grafanaCloudSignalSchema).optional(),
  })
  .strict();

export const grafanaCloudSchema = z
  .object({
    enabled: z.boolean().default(false),

    api: grafanaCloudApiSchema.optional(),

    addons: grafanaCloudAddonSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    const apiEnabled = value.api?.enabled === true;
    const faroEnabled = value.addons?.faro?.enabled === true;
    const signalCount = value.addons?.enabledSignals?.length ?? 0;

    if (!apiEnabled && !faroEnabled && signalCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['addons'],
        message:
          'At least one Grafana Cloud API integration, Faro addon, or enabled signal is required when Grafana Cloud is enabled.',
      });
    }
  }) satisfies z.ZodType<GrafanaCloudConfig>;

export type GrafanaCloudConfigInput = z.input<typeof grafanaCloudSchema>;

export type GrafanaCloudConfigOutput = z.output<typeof grafanaCloudSchema>;

export function parseGrafanaCloudConfig(
  input: GrafanaCloudConfigInput,
): GrafanaCloudConfig {
  return grafanaCloudSchema.parse(input);
}

export function safeParseGrafanaCloudConfig(input: unknown) {
  return grafanaCloudSchema.safeParse(input);
}