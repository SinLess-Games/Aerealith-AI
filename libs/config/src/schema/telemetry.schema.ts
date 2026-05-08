import { z } from 'zod';

import type { TelemetryConfig } from '../types/telemetry';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

export const openTelemetryTracesExporterSchema = nonEmptyStringSchema.optional();

export const openTelemetryMetricsExporterSchema = nonEmptyStringSchema.optional();

export const openTelemetryLogsExporterSchema = nonEmptyStringSchema.optional();

export const openTelemetryProtocolSchema = nonEmptyStringSchema.optional();

export const openTelemetryLogLevelSchema = nonEmptyStringSchema.optional();

export const openTelemetrySchema = z
  .object({
    serviceName: optionalNonEmptyStringSchema,

    tracesExporter: openTelemetryTracesExporterSchema,

    metricsExporter: openTelemetryMetricsExporterSchema,

    logsExporter: openTelemetryLogsExporterSchema,

    endpoint: optionalUrlSchema,

    tracesEndpoint: optionalUrlSchema,

    metricsEndpoint: optionalUrlSchema,

    logsEndpoint: optionalUrlSchema,

    protocol: openTelemetryProtocolSchema,

    tracesProtocol: openTelemetryProtocolSchema,

    metricsProtocol: openTelemetryProtocolSchema,

    logsProtocol: openTelemetryProtocolSchema,

    headers: optionalNonEmptyStringSchema,

    tracesHeaders: optionalNonEmptyStringSchema,

    metricsHeaders: optionalNonEmptyStringSchema,

    logsHeaders: optionalNonEmptyStringSchema,

    resourceAttributes: optionalNonEmptyStringSchema,

    nodeResourceDetectors: optionalNonEmptyStringSchema,

    logLevel: openTelemetryLogLevelSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const tracesExporter = value.tracesExporter;
    const metricsExporter = value.metricsExporter;
    const logsExporter = value.logsExporter;

    const hasOtlpExporter =
      tracesExporter === 'otlp' ||
      metricsExporter === 'otlp' ||
      logsExporter === 'otlp';

    const hasAnySignalEndpoint = Boolean(
      value.tracesEndpoint || value.metricsEndpoint || value.logsEndpoint,
    );

    if (hasOtlpExporter && !value.endpoint && !hasAnySignalEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpoint'],
        message:
          'endpoint or signal-specific OTLP endpoints should be configured when an OTLP exporter is enabled.',
      });
    }
  });

export const faroSchema = z
  .object({
    enabled: z.boolean().default(false),

    publicUrl: optionalUrlSchema,

    appName: optionalNonEmptyStringSchema,

    appNamespace: optionalNonEmptyStringSchema,

    appVersion: optionalNonEmptyStringSchema,

    release: optionalNonEmptyStringSchema,

    environment: optionalNonEmptyStringSchema,

    samplingRate: z.number().min(0).max(1).optional(),

    tracingEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.publicUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicUrl'],
        message: 'publicUrl is required when Faro telemetry is enabled.',
      });
    }

    if (!value.appName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appName'],
        message: 'appName is required when Faro telemetry is enabled.',
      });
    }
  });

export const telemetrySchema = z
  .object({
    enabled: z.boolean().default(false),

    profileEncryptionKey: optionalNonEmptyStringSchema,

    otel: openTelemetrySchema.default({}),

    faro: faroSchema.default({
      enabled: false,
    }),
  })
  .strict();

export type TelemetryConfigInput = z.input<typeof telemetrySchema>;

export type TelemetryConfigOutput = z.output<typeof telemetrySchema>;

export function parseTelemetryConfig(
  input: TelemetryConfigInput,
): TelemetryConfig {
  return telemetrySchema.parse(input) as TelemetryConfig;
}

export function safeParseTelemetryConfig(input: unknown) {
  return telemetrySchema.safeParse(input);
}