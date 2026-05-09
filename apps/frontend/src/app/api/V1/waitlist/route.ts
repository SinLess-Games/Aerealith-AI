// apps/frontend/src/app/api/V1/waitlist/route.ts

import type { Client as PgClient } from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WaitlistRequestBody = {
  email?: unknown;
};

type WaitlistResponseBody = {
  ok: boolean;
  message: string;
};

type PgDatabaseError = Error & {
  code?: string;
};

function readEnvString(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function json(
  body: WaitlistResponseBody,
  init?: ResponseInit,
): Response {
  return Response.json(body, init);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasUrlProtocol(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function getDatabaseUrl(): string {
  const rawUrl = readEnvString('DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL');

  if (!rawUrl) {
    throw new Error('Waitlist database URL is missing.');
  }

  if (hasUrlProtocol(rawUrl)) {
    return rawUrl;
  }

  const username = readEnvString(
    'DATABASE_USERNAME',
    'DATABASE_USER',
    'POSTGRES_USERNAME',
    'POSTGRES_USER',
  );
  const password = readEnvString('DATABASE_PASSWORD', 'POSTGRES_PASSWORD');

  if (!username || !password) {
    throw new Error(
      'POSTGRES_URL is missing a protocol and credentials. Set POSTGRES_USER and POSTGRES_PASSWORD.',
    );
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(
    password,
  )}@${rawUrl}`;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as PgDatabaseError).code === '23505'
  );
}

async function waitlistEmailExists(
  client: PgClient,
  email: string,
): Promise<boolean> {
  const result = await client.query(
    'select 1 from waitlist where email = $1 limit 1',
    [email],
  );

  return result.rowCount > 0;
}

export async function POST(request: Request): Promise<Response> {
  let body: WaitlistRequestBody;

  try {
    body = (await request.json()) as WaitlistRequestBody;
  } catch {
    return json(
      {
        ok: false,
        message: 'Invalid request body.',
      },
      { status: 400 },
    );
  }

  const email = normalizeEmail(body.email);

  if (!isValidEmail(email)) {
    return json(
      {
        ok: false,
        message: 'Please enter a valid email address.',
      },
      { status: 400 },
    );
  }

  try {
    const [{ Client }, { randomUUID }] = await Promise.all([
      import('pg'),
      import('node:crypto'),
    ]);
    const client = new Client({
      connectionString: getDatabaseUrl(),
      ssl: {
        rejectUnauthorized:
          readEnvString('DATABASE_SSL_REJECT_UNAUTHORIZED') !== 'false',
      },
    });

    await client.connect();

    try {
      if (await waitlistEmailExists(client, email)) {
        return json(
          {
            ok: true,
            message: 'You are already on the waitlist.',
          },
          { status: 200 },
        );
      }

      const result = await client.query(
        [
          'insert into waitlist (id, email)',
          'values ($1, $2)',
          'on conflict (email) do nothing',
          'returning id',
        ].join(' '),
        [randomUUID(), email],
      );

      if (result.rowCount === 0) {
        return json(
          {
            ok: true,
            message: 'You are already on the waitlist.',
          },
          { status: 200 },
        );
      }
    } finally {
      await client.end();
    }

    return json(
      {
        ok: true,
        message: 'You have been added to the waitlist.',
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return json(
        {
          ok: true,
          message: 'You are already on the waitlist.',
        },
        { status: 200 },
      );
    }

    console.error('Failed to create waitlist entry:', error);

    return json(
      {
        ok: false,
        message: 'Unable to join the waitlist right now.',
      },
      { status: 500 },
    );
  }
}

export function GET(): Response {
  return json(
    {
      ok: false,
      message: 'Method not allowed.',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    },
  );
}
