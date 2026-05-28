import Pyroscope from '@pyroscope/nodejs';
import { PyroscopeCloud } from '../constants/urls';
import { isNodeRuntime, readEnvValue } from '../logger/runtime';

const PROFILER_KEY = Symbol.for('aerealith.observability.pyroscope');

export type ProfilerHandle = {
  shutdown: () => Promise<void>;
};

export const initProfiler = (
  options: {
    appName?: string;
    env?: Record<string, string | undefined>;
    server?: {
      address?: string;
      user?: string;
      password?: string;
      flushIntervalMs?: number;
    };
  } = {},
): ProfilerHandle | null => {
  if (!isNodeRuntime()) {
    return null;
  }

  const globalRef = globalThis as Record<PropertyKey, unknown>;

  if (globalRef[PROFILER_KEY] !== undefined) {
    return (globalRef[PROFILER_KEY] as ProfilerHandle) ?? null;
  }

  const serverAddress =
    readEnvValue(options.env, 'PYROSCOPE_SERVER_ADDRESS') ?? PyroscopeCloud.url;
  const appName =
    readEnvValue(options.env, 'PYROSCOPE_APPLICATION_NAME') ??
    options.appName ??
    (options.env?.['SERVICE_NAME'] as string | undefined) ??
    'aerealith-service';

  const basicAuthUser =
    readEnvValue(options.env, 'PYROSCOPE_BASIC_AUTH_USER') ?? options.server?.user;
  const basicAuthPassword =
    readEnvValue(options.env, 'PYROSCOPE_BASIC_AUTH_PASSWORD') ?? options.server?.password;

  try {
    Pyroscope.init({
      serverAddress,
      appName,
      basicAuthUser,
      basicAuthPassword,
      flushIntervalMs: options.server?.flushIntervalMs,
    } as any);

    if (typeof (Pyroscope as any).start === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Pyroscope as any).start();
    }
  } catch (err) {
    // don't break apps if profiling is misconfigured
    console.warn('[observability][profiler] Failed to initialize Pyroscope:', err);
  }

  const handle: ProfilerHandle = {
    shutdown: async () => {
      try {
        // Some SDKs expose stop/teardown; guard the call
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (Pyroscope as any).stop === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await Promise.resolve((Pyroscope as any).stop());
        }
      } catch (error) {
        void error;
      }
    },
  };

  globalRef[PROFILER_KEY] = handle;

  return handle;
};

export default initProfiler;
