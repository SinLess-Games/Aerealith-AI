import { SamplingDecision, trace } from '@opentelemetry/api';
import { BatchSpanProcessor, BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { isNodeRuntime } from '../logger/runtime';
import type { TelemetryOptions, TelemetryHandle } from './types';
import {
  buildTempoAuthorizationHeader,
  resolveServerTelemetryOptions,
} from './runtime';

const SERVER_TELEMETRY_KEY = Symbol.for('aerealith.observability.serverTelemetry');

type ServerTelemetryGlobal = typeof globalThis & {
  [SERVER_TELEMETRY_KEY]?: TelemetryHandle | null;
};

const createRatioSampler = (sampleRate: number) => ({
  shouldSample: () => ({
    decision:
      Math.random() < sampleRate
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD,
  }),
  toString: () => `ratio(${sampleRate})`,
  getDescription: () => `TraceIdRatioBasedSampler(${sampleRate})`,
});

export const initServerTelemetry = (
  options: TelemetryOptions,
): TelemetryHandle | null => {
  if (!isNodeRuntime()) {
    return null;
  }

  const globalRef = globalThis as ServerTelemetryGlobal;

  if (globalRef[SERVER_TELEMETRY_KEY] !== undefined) {
    return globalRef[SERVER_TELEMETRY_KEY] ?? null;
  }

  const serverOptions = resolveServerTelemetryOptions(options.server, options.env);

  if (!serverOptions.enabled || serverOptions.sampleRate <= 0 || !serverOptions.endpoint || !serverOptions.token) {
    globalRef[SERVER_TELEMETRY_KEY] = null;

    return null;
  }

  const exporter = new OTLPTraceExporter({
    url: serverOptions.endpoint,
    headers: {
      authorization: buildTempoAuthorizationHeader(
        serverOptions.username ?? '1617054',
        serverOptions.token,
      ),
    },
  });

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: options.service,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        options.env?.['NODE_ENV'] ?? options.env?.['NEXTJS_ENV'] ?? 'development',
      [SEMRESATTRS_SERVICE_VERSION]:
        options.env?.['SERVICE_VERSION'] ?? options.env?.['NEXT_PUBLIC_APP_VERSION'],
    }),
    sampler: createRatioSampler(serverOptions.sampleRate),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  trace.setGlobalTracerProvider(provider);

  const handle: TelemetryHandle = {
    flush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown(),
  };

  globalRef[SERVER_TELEMETRY_KEY] = handle;

  return handle;
};
