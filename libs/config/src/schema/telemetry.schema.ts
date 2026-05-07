import { z } from 'zod';

import type { TelemetryConfig } from '../types/telemetry';

const optionalNonEmptyStringSchema = z.string().trim().min(1).optional();

const optionalUrlSchema = z.string().trim().url().optional();

export const openTelemetryTracesExporterSchema = z
  .union([
    z.literal('otlp'),
    z.literal('zipkin'),
    z.literal('console'),
    z.literal('none'),
    z.string().trim().min(1),
  ])
  .optional();

export const openTelemetryMetricsExporterSchema = z
  .union([
    z.literal('otlp'),
    z.literal('prometheus'),
    z.literal('console'),
    z.literal('none'),
    z.string().trim().min(1),
  ])
  .optional();

export const openTelemetryLogsExporterSchema = z
  .union([
    z.literal('otlp'),
    z.literal('console'),
    z.literal('none'),
    z.string().trim().min(1),
  ])
  .optional();

export const openTelemetryProtocolSchema = z
  .union([
    z.literal('grpc'),
    z.literal('http/protobuf'),
    z.literal('http/json'),
    z.string().trim().min(1),
  ])
  .optional();

export const openTelemetryLogLevelSchema = z
  .union([
    z.literal('none'),
    z.literal('error'),
    z.literal('warn'),
    z.literal('info'),
    z.literal('debug'),
    z.literal('verbose'),
    z.literal('all'),
    z.string().trim().min(1),
  ])
  .optional();

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
  .strict();

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
  .strict();

export const telemetrySchema = z
  .object({
    enabled: z.boolean().default(false),

    profileEncryptionKey: optionalNonEmptyStringSchema,

    otel: openTelemetrySchema.default({}),

    faro: faroSchema.default({
      enabled: false,
    }),
  })
  .strict() satisfies z.ZodType<TelemetryConfig>;

export type TelemetryConfigInput = z.input<typeof telemetrySchema>;

export type TelemetryConfigOutput = z.output<typeof telemetrySchema>;

export function parseTelemetryConfig(input: TelemetryConfigInput): TelemetryConfig {
  return telemetrySchema.parse(input);
}

export function safeParseTelemetryConfig(input: unknown) {
  return telemetrySchema.safeParse(input);
}