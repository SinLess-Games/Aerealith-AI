import { resolveBrowserTelemetryOptions } from './runtime';
import type { TelemetryBrowserOptions } from './types';

type BrowserTelemetryInstance = unknown;

const BROWSER_TELEMETRY_KEY = Symbol.for('aerealith.observability.browserTelemetry');

type BrowserTelemetryGlobal = {
  document?: unknown;
  [BROWSER_TELEMETRY_KEY]?: BrowserTelemetryInstance | null;
};

const shouldSample = (sampleRate: number): boolean => {
  if (sampleRate <= 0) {
    return false;
  }

  if (sampleRate >= 1) {
    return true;
  }

  return Math.random() < sampleRate;
};

export const initBrowserTelemetry = async (
  options: TelemetryBrowserOptions = {},
): Promise<BrowserTelemetryInstance | null> => {
  const globalWindow = globalThis as BrowserTelemetryGlobal;

  if (typeof globalWindow.document === 'undefined') {
    return null;
  }

  if (globalWindow[BROWSER_TELEMETRY_KEY] !== undefined) {
    return globalWindow[BROWSER_TELEMETRY_KEY] ?? null;
  }

  const resolved = resolveBrowserTelemetryOptions(options, (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env);

  if (!resolved.enabled || !resolved.url || !shouldSample(resolved.sampleRate)) {
    globalWindow[BROWSER_TELEMETRY_KEY] = null;

    return null;
  }

  const [{ getWebInstrumentations, initializeFaro }, { TracingInstrumentation }] =
    await Promise.all([
      import('@grafana/faro-web-sdk'),
      import('@grafana/faro-web-tracing'),
    ]);

  const faro = initializeFaro({
    url: resolved.url,
    app: {
      name: resolved.appName ?? 'aerealith-web',
      version: resolved.appVersion ?? 'dev',
      environment: resolved.environment ?? 'development',
    },
    instrumentations: [...getWebInstrumentations(), new TracingInstrumentation()],
  });

  globalWindow[BROWSER_TELEMETRY_KEY] = faro;

  return faro;
};
