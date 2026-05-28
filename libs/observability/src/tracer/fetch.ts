import { propagation, SpanKind } from '@opentelemetry/api';

import { withTraceSpan } from './tracer';

const headerSetter = {
  set: (carrier: Headers, key: string, value: string): void => {
    carrier.set(key, value);
  },
};

export const tracedFetch = async (
  input: Request | URL | string,
  init: RequestInit = {},
  name = 'http.request',
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');

  return withTraceSpan(
    name,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.method': method,
        'http.url': url,
      },
    },
    async (span, activeSession) => {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));

      propagation.inject(activeSession.context, headers, headerSetter);

      const response = await fetch(input, {
        ...init,
        headers,
      });

      span.setAttribute('http.status_code', response.status);
      span.setAttribute('http.ok', response.ok);

      if (!response.ok) {
        span.setAttribute('http.error', true);
      }

      return response;
    },
  );
};
