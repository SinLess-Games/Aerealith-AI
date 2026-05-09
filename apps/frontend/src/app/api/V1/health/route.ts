// apps/frontend/src/app/api/V1/health/route.ts

/**
 * Health endpoints must always be runtime evaluated.
 * They should never be statically rendered, cached, or ISR-generated.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const SERVICE_NAME = process.env.SERVICE_NAME || 'helix-web-api';
const SERVICE_DISPLAY_NAME = process.env.SERVICE_DISPLAY_NAME || 'Helix AI Web API';
const SERVICE_DESCRIPTION =
  process.env.SERVICE_DESCRIPTION ||
  'Health endpoint for the Helix AI web API service.';

const startedAt = Date.now();

type HealthStatus = 'ok' | 'degraded' | 'error';
type CheckStatus = 'ok' | 'fail' | 'skip';
type ChecksMode = 'basic' | 'deep';

type CheckResult = {
  name: string;
  status: CheckStatus;
  required: boolean;
  latencyMs?: number;
  message?: string;
  error?: string;
};

type HealthResponse = {
  status: HealthStatus;
  message: {
    text: string;
  };
  timestamp: string;
  service: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    environment: string;
  };
  api: {
    version: 'v1';
    endpoint: '/api/V1/health';
    checksMode: ChecksMode;
  };
  git: {
    commit: string;
    branch: string;
  };
  region: string;
  request: {
    id: string;
    path: string;
    method: string;
    userAgent: string;
  };
  metrics: {
    uptimeSeconds: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers?: number;
    } | null;
  };
  checks: CheckResult[];
  counts: Record<CheckStatus, number>;
};

function nowMs(): number {
  return Date.now();
}

function elapsedMs(start: number): number {
  return Math.max(0, nowMs() - start);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

async function timedCheck(
  name: string,
  required: boolean,
  check: () => Promise<Omit<CheckResult, 'name' | 'required' | 'latencyMs'>>,
): Promise<CheckResult> {
  const start = nowMs();

  try {
    const result = await check();

    return {
      name,
      required,
      latencyMs: elapsedMs(start),
      ...result,
    };
  } catch (error) {
    return {
      name,
      required,
      status: 'fail',
      latencyMs: elapsedMs(start),
      error: toErrorMessage(error),
    };
  }
}

async function basicChecks(): Promise<CheckResult[]> {
  return Promise.all([
    timedCheck('runtime:nodejs', true, async () => ({
      status: typeof process !== 'undefined' ? 'ok' : 'fail',
      message:
        typeof process !== 'undefined'
          ? 'Node.js runtime is available'
          : 'Node.js runtime is unavailable',
    })),

    timedCheck('env:NODE_ENV', true, async () => ({
      status: process.env.NODE_ENV ? 'ok' : 'fail',
      message: process.env.NODE_ENV || 'NODE_ENV is not set',
    })),

    timedCheck('env:VERSION', false, async () => ({
      status: process.env.VERSION ? 'ok' : 'skip',
      message: process.env.VERSION ? process.env.VERSION : 'VERSION is not set',
    })),
  ]);
}

async function deepChecks(): Promise<CheckResult[]> {
  return Promise.all([
    timedCheck('database', false, async () => ({
      status: 'skip',
      message: 'No database health check is configured yet',
    })),

    timedCheck('cache', false, async () => ({
      status: 'skip',
      message: 'No cache health check is configured yet',
    })),

    timedCheck('storage', false, async () => ({
      status: 'skip',
      message: 'No storage health check is configured yet',
    })),
  ]);
}

function getBuildMeta() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.GIT_SHA ||
    'unknown';

  const branch =
    process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || 'unknown';

  const region =
    process.env.VERCEL_REGION ||
    process.env.FLY_REGION ||
    process.env.AWS_REGION ||
    process.env.GOOGLE_CLOUD_REGION ||
    'unknown';

  return {
    commit,
    branch,
    region,
  };
}

function getServiceVersion(): string {
  return process.env.VERSION || process.env.npm_package_version || 'unknown';
}

function getRequestId(request: Request): string {
  return (
    request.headers.get('x-request-id') ||
    request.headers.get('x-correlation-id') ||
    uuid()
  );
}

function getRequestInfo(request: Request): HealthResponse['request'] {
  const url = new URL(request.url);

  return {
    id: getRequestId(request),
    path: `${url.pathname}${url.search}`,
    method: request.method,
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}

function getProcessMetrics(): HealthResponse['metrics'] {
  const uptimeSeconds =
    typeof process.uptime === 'function'
      ? Math.floor(process.uptime())
      : Math.floor((Date.now() - startedAt) / 1000);

  const memory =
    typeof process.memoryUsage === 'function' ? process.memoryUsage() : null;

  return {
    uptimeSeconds,
    memory: memory
      ? {
          rss: memory.rss,
          heapTotal: memory.heapTotal,
          heapUsed: memory.heapUsed,
          external: memory.external,
          arrayBuffers: memory.arrayBuffers,
        }
      : null,
  };
}

function responseHeaders(request?: Request): Headers {
  const headers = new Headers();

  headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  );
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('Surrogate-Control', 'no-store');
  headers.set('CDN-Cache-Control', 'no-store');

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Request-Id, X-Correlation-Id',
  );
  headers.set('Access-Control-Max-Age', '300');

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');

  if (request) {
    headers.set('X-Request-Id', getRequestId(request));
  }

  return headers;
}

function json(data: unknown, status: number, request?: Request): Response {
  return Response.json(data, {
    status,
    headers: responseHeaders(request),
  });
}

function summarize(checks: CheckResult[]): Record<CheckStatus, number> {
  return checks.reduce<Record<CheckStatus, number>>(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    {
      ok: 0,
      fail: 0,
      skip: 0,
    },
  );
}

function getHealthStatus(checks: CheckResult[]): HealthStatus {
  const requiredFailure = checks.some(
    (check) => check.required && check.status === 'fail',
  );

  if (requiredFailure) {
    return 'error';
  }

  const optionalFailure = checks.some(
    (check) => !check.required && check.status === 'fail',
  );

  if (optionalFailure) {
    return 'degraded';
  }

  return 'ok';
}

function getStatusCode(status: HealthStatus): number {
  return status === 'error' ? 503 : 200;
}

function getStatusMessage(status: HealthStatus): string {
  switch (status) {
    case 'ok':
      return 'API is healthy';
    case 'degraded':
      return 'API is degraded';
    case 'error':
      return 'API is unhealthy';
  }
}

function parseChecksMode(request: Request): ChecksMode {
  const url = new URL(request.url);
  const checks = url.searchParams.get('checks')?.toLowerCase();

  return checks === 'deep' ? 'deep' : 'basic';
}

function uuid(): string {
  const cryptoRef = (
    globalThis as unknown as {
      crypto?: {
        randomUUID?: () => string;
      };
    }
  ).crypto;

  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function buildHealthResponse(
  request: Request,
): Promise<{ body: HealthResponse; statusCode: number }> {
  const checksMode = parseChecksMode(request);

  const [basic, deep] = await Promise.all([
    basicChecks(),
    checksMode === 'deep' ? deepChecks() : Promise.resolve<CheckResult[]>([]),
  ]);

  const checks = [...basic, ...deep];
  const counts = summarize(checks);
  const status = getHealthStatus(checks);
  const statusCode = getStatusCode(status);
  const meta = getBuildMeta();

  return {
    statusCode,
    body: {
      status,
      message: {
        text: getStatusMessage(status),
      },
      timestamp: new Date().toISOString(),
      service: {
        name: SERVICE_NAME,
        displayName: SERVICE_DISPLAY_NAME,
        description: SERVICE_DESCRIPTION,
        version: getServiceVersion(),
        environment: process.env.NODE_ENV || 'development',
      },
      api: {
        version: 'v1',
        endpoint: '/api/V1/health',
        checksMode,
      },
      git: {
        commit: meta.commit,
        branch: meta.branch,
      },
      region: meta.region,
      request: getRequestInfo(request),
      metrics: getProcessMetrics(),
      checks,
      counts,
    },
  };
}

/**
 * GET /api/V1/health
 * GET /api/V1/health?checks=basic
 * GET /api/V1/health?checks=deep
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { body, statusCode } = await buildHealthResponse(request);

    return json(body, statusCode, request);
  } catch (error) {
    return json(
      {
        status: 'error',
        message: {
          text: 'Health check failed unexpectedly',
        },
        timestamp: new Date().toISOString(),
        service: {
          name: SERVICE_NAME,
          displayName: SERVICE_DISPLAY_NAME,
          description: SERVICE_DESCRIPTION,
          version: getServiceVersion(),
          environment: process.env.NODE_ENV || 'development',
        },
        api: {
          version: 'v1',
          endpoint: '/api/V1/health',
        },
        request: getRequestInfo(request),
        error: toErrorMessage(error),
      },
      503,
      request,
    );
  }
}

/**
 * HEAD /api/V1/health
 *
 * Fast probe endpoint for load balancers and uptime checks.
 */
export async function HEAD(request: Request): Promise<Response> {
  try {
    const { statusCode } = await buildHealthResponse(request);

    return new Response(null, {
      status: statusCode,
      headers: responseHeaders(request),
    });
  } catch {
    return new Response(null, {
      status: 503,
      headers: responseHeaders(request),
    });
  }
}

/**
 * OPTIONS /api/V1/health
 *
 * CORS preflight.
 */
export function OPTIONS(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: responseHeaders(request),
  });
}