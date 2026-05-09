// apps/frontend/src/app/api/V1/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * API metadata endpoint.
 *
 * This route describes the public V1 API surface for Helix AI.
 * It should stay lightweight, uncached, and safe to expose publicly.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const API_VERSION = 'v1';
const SERVICE_NAME = process.env.SERVICE_NAME || 'helix-web-api';
const SERVICE_DISPLAY_NAME = process.env.SERVICE_DISPLAY_NAME || 'Helix AI Web API';
const SERVICE_DESCRIPTION =
  process.env.SERVICE_DESCRIPTION ||
  'Public API gateway for Helix AI web application services.';

type ApiEndpoint = {
  path: string;
  methods: string[];
  description: string;
};

type ApiMetadataResponse = {
  status: 'ok';
  service: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    environment: string;
    region: string;
  };
  api: {
    version: string;
    basePath: string;
    documentation?: string;
    endpoints: ApiEndpoint[];
  };
  build: {
    commit: string;
    branch: string;
    buildId: string;
    deployedAt: string;
  };
  request: {
    id: string;
    method: string;
    path: string;
    origin: string;
    userAgent: string;
  };
  timestamp: string;
};

function getBuildMeta() {
  return {
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      process.env.GIT_SHA ||
      'unknown',

    branch:
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.GIT_BRANCH ||
      'unknown',

    buildId:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.BUILD_ID ||
      process.env.NEXT_BUILD_ID ||
      'unknown',

    deployedAt:
      process.env.DEPLOYED_AT ||
      process.env.BUILD_TIME ||
      'unknown',

    region:
      process.env.VERCEL_REGION ||
      process.env.FLY_REGION ||
      process.env.AWS_REGION ||
      process.env.GOOGLE_CLOUD_REGION ||
      'unknown',
  };
}

function getRequestId(request: NextRequest): string {
  return (
    request.headers.get('x-request-id') ||
    request.headers.get('x-correlation-id') ||
    uuid()
  );
}

function getRequestInfo(request: NextRequest) {
  const url = new URL(request.url);

  return {
    id: getRequestId(request),
    method: request.method,
    path: `${url.pathname}${url.search}`,
    origin: url.origin,
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}

function getApiEndpoints(): ApiEndpoint[] {
  return [
    {
      path: '/api/V1',
      methods: ['GET', 'HEAD', 'OPTIONS'],
      description: 'Returns API version, service metadata, build metadata, and available endpoints.',
    },
    {
      path: '/api/V1/health',
      methods: ['GET', 'HEAD', 'OPTIONS'],
      description: 'Returns service health, runtime information, process metrics, and dependency check results.',
    },
    {
      path: '/api/V1/health?checks=deep',
      methods: ['GET'],
      description: 'Runs deeper health checks for configured dependencies.',
    },
  ];
}

function withNoCache(headers = new Headers()): Headers {
  headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0'
  );
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('Surrogate-Control', 'no-store');
  headers.set('CDN-Cache-Control', 'no-store');

  return headers;
}

function withCors(headers = new Headers()): Headers {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Request-Id, X-Correlation-Id'
  );
  headers.set('Access-Control-Max-Age', '300');

  return headers;
}

function withSecurityHeaders(headers = new Headers()): Headers {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');

  return headers;
}

function responseHeaders(request?: NextRequest): Headers {
  const headers = withSecurityHeaders(withCors(withNoCache(new Headers())));

  if (request) {
    headers.set('X-Request-Id', getRequestId(request));
  }

  return headers;
}

function json(data: unknown, status: number, request?: NextRequest) {
  return NextResponse.json(data, {
    status,
    headers: responseHeaders(request),
  });
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

function buildApiMetadataResponse(request: NextRequest): ApiMetadataResponse {
  const build = getBuildMeta();

  return {
    status: 'ok',
    service: {
      name: SERVICE_NAME,
      displayName: SERVICE_DISPLAY_NAME,
      description: SERVICE_DESCRIPTION,
      version: process.env.VERSION || process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      region: build.region,
    },
    api: {
      version: API_VERSION,
      basePath: `/api/${API_VERSION.toUpperCase()}`,
      documentation:
        process.env.NEXT_PUBLIC_API_DOCS_URL ||
        process.env.API_DOCS_URL ||
        undefined,
      endpoints: getApiEndpoints(),
    },
    build: {
      commit: build.commit,
      branch: build.branch,
      buildId: build.buildId,
      deployedAt: build.deployedAt,
    },
    request: getRequestInfo(request),
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /api/V1
 *
 * Returns public API metadata.
 */
export async function GET(request: NextRequest) {
  try {
    return json(buildApiMetadataResponse(request), 200, request);
  } catch (error) {
    console.error('API V1 GET error:', error);

    return json(
      {
        status: 'error',
        message: {
          text: 'Failed to read API metadata.',
        },
        service: {
          name: SERVICE_NAME,
          displayName: SERVICE_DISPLAY_NAME,
          version: process.env.VERSION || process.env.npm_package_version || 'unknown',
        },
        api: {
          version: API_VERSION,
          basePath: `/api/${API_VERSION.toUpperCase()}`,
        },
        timestamp: new Date().toISOString(),
      },
      500,
      request
    );
  }
}

/**
 * HEAD /api/V1
 *
 * Fast metadata availability check.
 */
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: responseHeaders(request),
  });
}

/**
 * OPTIONS /api/V1
 *
 * CORS preflight.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders(request),
  });
}