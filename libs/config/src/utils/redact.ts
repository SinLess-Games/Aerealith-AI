export type RedactionReplacement =
  | string
  | ((context: RedactionContext) => string);

export type RedactionContext = {
  key?: string;
  path: string[];
  value: unknown;
  reason: 'key' | 'string-pattern' | 'url-query' | 'url-auth' | 'depth';
};

export type RedactOptions = {
  replacement?: RedactionReplacement;
  sensitiveKeys?: readonly string[];
  sensitiveKeyPatterns?: readonly RegExp[];
  sensitiveStringPatterns?: readonly RegExp[];
  maxDepth?: number;
};

export const DEFAULT_REDACTION = '[REDACTED]';

export const DEFAULT_SENSITIVE_KEYS = [
  'apiKey',
  'api_key',
  'api-token',
  'api_token',
  'auth',
  'authorization',
  'bearer',
  'clientSecret',
  'client_secret',
  'connectionString',
  'connection_string',
  'cookie',
  'databaseUrl',
  'database_url',
  'dbUrl',
  'db_url',
  'jwt',
  'key',
  'password',
  'privateKey',
  'private_key',
  'secret',
  'secretAccessKey',
  'secret_access_key',
  'session',
  'signingKey',
  'signing_key',
  'token',
  'webhookUrl',
  'webhook_url',
] as const;

export const DEFAULT_SENSITIVE_KEY_PATTERNS = [
  /(^|[_-])(api[_-]?key)($|[_-])/i,
  /(^|[_-])(auth|authorization)($|[_-])/i,
  /(^|[_-])(client[_-]?secret)($|[_-])/i,
  /(^|[_-])(cookie|session)($|[_-])/i,
  /(^|[_-])(database[_-]?url|db[_-]?url)($|[_-])/i,
  /(^|[_-])(password|passwd|pwd)($|[_-])/i,
  /(^|[_-])(private[_-]?key)($|[_-])/i,
  /(^|[_-])(secret|token|jwt)($|[_-])/i,
  /(^|[_-])(webhook[_-]?url)($|[_-])/i,
] as const;

export const DEFAULT_SENSITIVE_STRING_PATTERNS = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s"'`<>]+/gi,
  /\bmysql:\/\/[^\s"'`<>]+/gi,
  /\bredis:\/\/[^\s"'`<>]+/gi,
  /\b[a-z0-9_]*secret[a-z0-9_]*\s*=\s*[^&\s"'`<>]+/gi,
  /\b[a-z0-9_]*token[a-z0-9_]*\s*=\s*[^&\s"'`<>]+/gi,
  /\b[a-z0-9_]*password[a-z0-9_]*\s*=\s*[^&\s"'`<>]+/gi,
] as const;

const DEFAULT_MAX_DEPTH = 25;

export function redact<T>(value: T, options: RedactOptions = {}): T {
  const seen = new WeakSet<object>();

  return redactUnknown(value, {
    options,
    path: [],
    key: undefined,
    depth: 0,
    seen,
  }) as T;
}

export function redactObject<T extends Record<string, unknown>>(
  value: T,
  options: RedactOptions = {},
): T {
  return redact(value, options);
}

export function redactArray<T extends readonly unknown[]>(
  value: T,
  options: RedactOptions = {},
): T {
  return redact(value, options);
}

export function redactEnv<T extends Record<string, string | undefined>>(
  env: T,
  options: RedactOptions = {},
): T {
  const redacted = Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      if (value === undefined) {
        return [key, value];
      }

      if (isSensitiveKey(key, options)) {
        return [
          key,
          getReplacement(options, {
            key,
            path: [key],
            value,
            reason: 'key',
          }),
        ];
      }

      return [key, redactString(value, options, [key], key)];
    }),
  );

  return redacted as T;
}

export function redactString(
  value: string,
  options: RedactOptions = {},
  path: string[] = [],
  key?: string,
): string {
  let nextValue = redactUrl(value, options, path, key);

  for (const pattern of getSensitiveStringPatterns(options)) {
    nextValue = nextValue.replace(pattern, () =>
      getReplacement(options, {
        key,
        path,
        value,
        reason: 'string-pattern',
      }),
    );
  }

  return nextValue;
}

export function redactUrl(
  value: string,
  options: RedactOptions = {},
  path: string[] = [],
  key?: string,
): string {
  let nextValue = value;

  /**
   * Redact username/password credentials in URLs:
   *
   * postgres://user:password@host/db
   * https://user:password@example.com
   */
  nextValue = nextValue.replace(
    /(\b[a-z][a-z0-9+.-]*:\/\/)([^/@\s"'`<>:]+):([^/@\s"'`<>]+)@/gi,
    (_match: string, protocol: string, username: string) => {
      return `${protocol}${username}:${getReplacement(options, {
        key,
        path,
        value,
        reason: 'url-auth',
      })}@`;
    },
  );

  /**
   * Redact sensitive query string values without depending on URL globals.
   */
  nextValue = nextValue.replace(
    /([?&])([^=\s&#]+)=([^&#\s]*)/g,
    (match: string, separator: string, queryKey: string) => {
      if (!isSensitiveKey(queryKey, options)) {
        return match;
      }

      return `${separator}${queryKey}=${encodeURIComponent(
        getReplacement(options, {
          key: queryKey,
          path: [...path, queryKey],
          value,
          reason: 'url-query',
        }),
      )}`;
    },
  );

  return nextValue;
}

export function isSensitiveKey(
  key: string,
  options: RedactOptions = {},
): boolean {
  const normalizedKey = normalizeKey(key);

  for (const sensitiveKey of getSensitiveKeys(options)) {
    if (normalizeKey(sensitiveKey) === normalizedKey) {
      return true;
    }
  }

  return getSensitiveKeyPatterns(options).some((pattern) => pattern.test(key));
}

export function maskValue(
  value: string,
  visiblePrefixLength = 4,
  visibleSuffixLength = 4,
  mask = '…',
): string {
  if (value.length === 0) {
    return '';
  }

  if (value.length <= visiblePrefixLength + visibleSuffixLength) {
    return mask;
  }

  const prefix = value.slice(0, visiblePrefixLength);
  const suffix = value.slice(value.length - visibleSuffixLength);

  return `${prefix}${mask}${suffix}`;
}

export function getReplacement(
  options: RedactOptions,
  context: RedactionContext,
): string {
  const replacement = options.replacement ?? DEFAULT_REDACTION;

  if (typeof replacement === 'function') {
    return replacement(context);
  }

  return replacement;
}

function redactUnknown(
  value: unknown,
  context: {
    options: RedactOptions;
    path: string[];
    key?: string;
    depth: number;
    seen: WeakSet<object>;
  },
): unknown {
  const maxDepth = context.options.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (context.depth > maxDepth) {
    return getReplacement(context.options, {
      key: context.key,
      path: context.path,
      value,
      reason: 'depth',
    });
  }

  if (context.key && isSensitiveKey(context.key, context.options)) {
    return getReplacement(context.options, {
      key: context.key,
      path: context.path,
      value,
      reason: 'key',
    });
  }

  if (typeof value === 'string') {
    return redactString(value, context.options, context.path, context.key);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    if (context.seen.has(value)) {
      return '[Circular]';
    }

    context.seen.add(value);

    return value.map((item, index) =>
      redactUnknown(item, {
        ...context,
        path: [...context.path, String(index)],
        key: String(index),
        depth: context.depth + 1,
      }),
    );
  }

  if (isRecord(value)) {
    if (context.seen.has(value)) {
      return '[Circular]';
    }

    context.seen.add(value);

    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => {
        return [
          entryKey,
          redactUnknown(entryValue, {
            ...context,
            path: [...context.path, entryKey],
            key: entryKey,
            depth: context.depth + 1,
          }),
        ];
      }),
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function getSensitiveKeys(options: RedactOptions): readonly string[] {
  return options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS;
}

function getSensitiveKeyPatterns(options: RedactOptions): readonly RegExp[] {
  return options.sensitiveKeyPatterns ?? DEFAULT_SENSITIVE_KEY_PATTERNS;
}

function getSensitiveStringPatterns(options: RedactOptions): readonly RegExp[] {
  return options.sensitiveStringPatterns ?? DEFAULT_SENSITIVE_STRING_PATTERNS;
}