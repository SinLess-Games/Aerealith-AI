import { randomUUID } from 'node:crypto';

const ALLOWED_ORIGINS = new Set([
  'https://helixaibot.com',
  'https://www.helixaibot.com',
  'http://localhost:3000',
]);

type WaitlistPayload = {
  name?: string;
  email?: string;
  turnstileToken?: string;
};

type ApiErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_ORIGIN'
  | 'INVALID_CONTENT_TYPE'
  | 'VALIDATION_ERROR'
  | 'BOT_CHECK_FAILED'
  | 'DUPLICATE_EMAIL'
  | 'INTERNAL_ERROR';

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    if (!isAllowedOrigin(request)) {
      logEvent('warn', 'waitlist.invalid_origin', {
        requestId,
        origin: request.headers.get('origin'),
      });

      return errorResponse(
        'INVALID_ORIGIN',
        'This origin is not allowed.',
        403,
        requestId,
        request,
      );
    }

    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return errorResponse(
        'INVALID_CONTENT_TYPE',
        'Content-Type must be application/json.',
        415,
        requestId,
        request,
      );
    }

    const body = (await request.json()) as WaitlistPayload;

    const email = body.email?.trim().toLowerCase() ?? '';
    const turnstileToken = body.turnstileToken ?? '';

    if (!email || !isValidEmail(email)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'A valid email address is required.',
        400,
        requestId,
        request,
      );
    }

    const ip = request.headers.get('cf-connecting-ip') ?? undefined;

    const botCheckPassed = await verifyTurnstile(turnstileToken, ip);

    if (!botCheckPassed) {
      logEvent('warn', 'waitlist.bot_check_failed', {
        requestId,
        ipCountry: request.headers.get('cf-ipcountry'),
      });

      return errorResponse(
        'BOT_CHECK_FAILED',
        'Bot verification failed.',
        403,
        requestId,
        request,
      );
    }

    const emailHash = await sha256(email);

    /*
      Insert into your database here.

      Recommended DB behavior:
      - Put a UNIQUE constraint on lower(email)
      - Catch duplicate key errors
      - Return DUPLICATE_EMAIL instead of leaking DB errors
    */

    logEvent('info', 'waitlist.created', {
      requestId,
      emailHash,
      durationMs: Date.now() - startedAt,
      ipCountry: request.headers.get('cf-ipcountry'),
    });

    return successResponse(
      {
        message: 'You have been added to the waitlist.',
      },
      requestId,
      201,
      request,
    );
  } catch (error) {
    logEvent('error', 'waitlist.internal_error', {
      requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return errorResponse(
      'INTERNAL_ERROR',
      'Something went wrong.',
      500,
      requestId,
      request,
    );
  }
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {
      Vary: 'Origin',
    };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return true;
  }

  return ALLOWED_ORIGINS.has(origin);
}

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  request: Request,
) {
  return Response.json(
    {
      success: false,
      error: {
        code,
        message,
        requestId,
      },
    },
    {
      status,
      headers: getCorsHeaders(request),
    },
  );
}

function successResponse<T>(
  data: T,
  requestId: string,
  status: number,
  request: Request,
) {
  return Response.json(
    {
      success: true,
      data,
      requestId,
    },
    {
      status,
      headers: getCorsHeaders(request),
    },
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret || !token) {
    return false;
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: ip,
      }),
    },
  );

  const result = (await response.json()) as {
    success?: boolean;
  };

  return result.success === true;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', data);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  data: Record<string, unknown>,
) {
  console[level](
    JSON.stringify({
      level,
      event,
      service: 'aerealith-ai-frontend',
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
}
