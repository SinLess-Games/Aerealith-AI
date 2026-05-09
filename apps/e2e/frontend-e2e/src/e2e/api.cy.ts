type ApiEndpoint = {
  path: string;
};

type ApiMetadataResponse = {
  status: string;
  api: {
    version: string;
    basePath: string;
    endpoints: ApiEndpoint[];
  };
};

type HealthCheck = {
  name: string;
  status?: string;
};

type HealthResponse = {
  status: string;
  api: {
    checksMode: 'basic' | 'deep';
  };
  checks: HealthCheck[];
};

type ApiErrorResponse = {
  success?: false;
  error: {
    code: string;
    message?: string;
    requestId?: string;
  };
};

const allowedLocalOrigin = 'http://localhost:3000';
const waitlistPath = '/api/V1/waitlist';

const getHeaderValue = (
  headers: Record<string, string | string[]>,
  headerName: string,
): string => {
  const value = headers[headerName.toLowerCase()] ?? headers[headerName];

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return value ?? '';
};

const expectHeaderIncludes = (
  headers: Record<string, string | string[]>,
  headerName: string,
  expectedValue: string,
): void => {
  const value = getHeaderValue(headers, headerName);

  expect(value, headerName).to.not.eq('');
  expect(value).to.include(expectedValue);
};

const expectHeaderIncludesCaseInsensitive = (
  headers: Record<string, string | string[]>,
  headerName: string,
  expectedValue: string,
): void => {
  const value = getHeaderValue(headers, headerName);

  expect(value, headerName).to.not.eq('');
  expect(value.toLowerCase()).to.include(expectedValue.toLowerCase());
};

const checkNames = (checks: HealthCheck[]): string[] =>
  checks.map((check) => check.name);

describe('API V1 routes', () => {
  it('returns public API metadata', () => {
    cy.request<ApiMetadataResponse>('/api/V1').then(
      ({ body, headers, status }) => {
        expect(status).to.eq(200);

        expectHeaderIncludesCaseInsensitive(headers, 'cache-control', 'no-store');

        expect(body.status).to.eq('ok');
        expect(body.api.version).to.eq('v1');
        expect(body.api.basePath).to.eq('/api/V1');

        expect(body.api.endpoints.map((endpoint) => endpoint.path)).to.include(
          '/api/V1/health',
        );
      },
    );
  });

  it('reports basic and deep health check modes', () => {
    cy.request<HealthResponse>('/api/V1/health').then(({ body, status }) => {
      expect(status).to.eq(200);
      expect(body.status).to.eq('ok');
      expect(body.api.checksMode).to.eq('basic');
      expect(checkNames(body.checks)).to.include('runtime:nodejs');
    });

    cy.request<HealthResponse>('/api/V1/health?checks=deep').then(
      ({ body, status }) => {
        expect(status).to.eq(200);
        expect(body.status).to.eq('ok');
        expect(body.api.checksMode).to.eq('deep');

        expect(checkNames(body.checks)).to.include.members([
          'database',
          'cache',
          'storage',
        ]);
      },
    );
  });

  it('returns CORS headers for waitlist preflight from allowed origins', () => {
    cy.request({
      method: 'OPTIONS',
      url: waitlistPath,
      headers: {
        origin: allowedLocalOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }).then(({ headers, status }) => {
      expect(status).to.eq(204);

      expectHeaderIncludes(
        headers,
        'access-control-allow-origin',
        allowedLocalOrigin,
      );

      expectHeaderIncludes(
        headers,
        'access-control-allow-methods',
        'POST, OPTIONS',
      );

      expectHeaderIncludesCaseInsensitive(
        headers,
        'access-control-allow-headers',
        'content-type',
      );

      expectHeaderIncludesCaseInsensitive(headers, 'vary', 'origin');
    });
  });

  it('rejects waitlist requests from disallowed origins', () => {
    cy.request<ApiErrorResponse>({
      method: 'POST',
      url: waitlistPath,
      failOnStatusCode: false,
      headers: {
        origin: 'https://bad.example',
        'content-type': 'application/json',
      },
      body: {
        email: 'person@example.com',
        turnstileToken: 'token',
      },
    }).then(({ body, status }) => {
      expect(status).to.eq(403);
      expect(body.error.code).to.eq('INVALID_ORIGIN');
    });
  });

  it('rejects waitlist requests with invalid content type', () => {
    cy.request<ApiErrorResponse>({
      method: 'POST',
      url: waitlistPath,
      failOnStatusCode: false,
      headers: {
        origin: allowedLocalOrigin,
        'content-type': 'text/plain',
      },
      body: 'person@example.com',
    }).then(({ body, status }) => {
      expect(status).to.eq(415);
      expect(body.error.code).to.eq('INVALID_CONTENT_TYPE');
    });
  });

  it('rejects invalid email addresses before bot verification', () => {
    cy.request<ApiErrorResponse>({
      method: 'POST',
      url: waitlistPath,
      failOnStatusCode: false,
      headers: {
        origin: allowedLocalOrigin,
        'content-type': 'application/json',
      },
      body: {
        email: 'not-an-email',
        turnstileToken: 'token',
      },
    }).then(({ body, status }) => {
      expect(status).to.eq(400);
      expect(body.error.code).to.eq('VALIDATION_ERROR');
    });
  });

  it('rejects requests that do not pass the internal bot check', () => {
    cy.request<ApiErrorResponse>({
      method: 'POST',
      url: waitlistPath,
      failOnStatusCode: false,
      headers: {
        origin: allowedLocalOrigin,
        'content-type': 'application/json',
      },
      body: {
        email: 'person@example.com',
        turnstileToken: '',
      },
    }).then(({ body, status }) => {
      expect(status).to.eq(403);
      expect(body.error.code).to.eq('BOT_CHECK_FAILED');
    });
  });
});