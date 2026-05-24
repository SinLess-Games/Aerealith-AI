import { CommonErrorCode } from '@aerealith-ai/contracts';

import {
  HeaderName,
  HeaderValue,
  getBearerToken,
  getBearerTokenFromAuthorizationHeader,
  getHeader,
  type HeaderSource,
} from '../headers/headers';
import { HttpStatusCode } from '../http/status-codes';
import { ApiError } from '../errors/api-error';

/**
 * Bearer token helpers for Helix API services.
 *
 * This file is framework-neutral:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 */

export const BEARER_AUTH_SCHEME = HeaderValue.BEARER;

export const BEARER_TOKEN_MIN_LENGTH = 1;

export const BEARER_TOKEN_MAX_LENGTH = 4096;

export const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;

export type BearerTokenParseResult =
  | {
      ok: true;
      token: string;
      scheme: typeof BEARER_AUTH_SCHEME;
    }
  | {
      ok: false;
      reason:
        | 'missing_authorization_header'
        | 'invalid_authorization_header'
        | 'unsupported_authorization_scheme'
        | 'missing_bearer_token'
        | 'invalid_bearer_token';
      scheme?: string;
    };

export const normalizeBearerToken = (
  token: string | null | undefined,
): string | undefined => {
  if (!token) {
    return undefined;
  }

  const normalized = token.trim();

  if (
    normalized.length < BEARER_TOKEN_MIN_LENGTH ||
    normalized.length > BEARER_TOKEN_MAX_LENGTH ||
    !BEARER_TOKEN_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
};

export const isBearerToken = (value: unknown): value is string =>
  typeof value === 'string' && normalizeBearerToken(value) !== undefined;

export const parseAuthorizationHeader = (
  authorizationHeader: string | null | undefined,
): BearerTokenParseResult => {
  if (!authorizationHeader) {
    return {
      ok: false,
      reason: 'missing_authorization_header',
    };
  }

  const trimmed = authorizationHeader.trim();

  if (!trimmed) {
    return {
      ok: false,
      reason: 'invalid_authorization_header',
    };
  }

  const [scheme, rawToken, ...extraParts] = trimmed.split(/\s+/);

  if (!scheme) {
    return {
      ok: false,
      reason: 'invalid_authorization_header',
    };
  }

  if (scheme.toLowerCase() !== BEARER_AUTH_SCHEME.toLowerCase()) {
    return {
      ok: false,
      reason: 'unsupported_authorization_scheme',
      scheme,
    };
  }

  if (!rawToken || extraParts.length > 0) {
    return {
      ok: false,
      reason: rawToken
        ? 'invalid_authorization_header'
        : 'missing_bearer_token',
      scheme,
    };
  }

  const token = normalizeBearerToken(rawToken);

  if (!token) {
    return {
      ok: false,
      reason: 'invalid_bearer_token',
      scheme,
    };
  }

  return {
    ok: true,
    token,
    scheme: BEARER_AUTH_SCHEME,
  };
};

export const parseBearerTokenFromHeaders = (
  headers: HeaderSource,
): BearerTokenParseResult =>
  parseAuthorizationHeader(getHeader(headers, HeaderName.AUTHORIZATION));

export const parseBearerTokenFromRequest = (
  request: Request,
): BearerTokenParseResult => parseBearerTokenFromHeaders(request.headers);

export const getBearerTokenFromHeaders = (
  headers: HeaderSource,
): string | undefined => normalizeBearerToken(getBearerToken(headers));

export const getBearerTokenFromRequest = (
  request: Request,
): string | undefined => getBearerTokenFromHeaders(request.headers);

export const createBearerAuthorizationHeader = (token: string): string => {
  const normalizedToken = normalizeBearerToken(token);

  if (!normalizedToken) {
    throw new ApiError('Invalid bearer token.', {
      code: CommonErrorCode.UNAUTHORIZED,
      status: HttpStatusCode.UNAUTHORIZED,
      expose: true,
    });
  }

  return `${BEARER_AUTH_SCHEME} ${normalizedToken}`;
};

export const createBearerHeaders = (token: string): Headers => {
  const headers = new Headers();

  headers.set(HeaderName.AUTHORIZATION, createBearerAuthorizationHeader(token));

  return headers;
};

export const requireBearerToken = (
  headers: HeaderSource,
  message = 'Missing or invalid bearer token.',
): string => {
  const result = parseBearerTokenFromHeaders(headers);

  if (result.ok) {
    return result.token;
  }

  throw new ApiError(message, {
    code: CommonErrorCode.UNAUTHORIZED,
    status: HttpStatusCode.UNAUTHORIZED,
    details: {
      reason: result.reason,
      ...(result.scheme ? { scheme: result.scheme } : {}),
    },
    expose: true,
  });
};

export const requireBearerTokenFromRequest = (
  request: Request,
  message?: string,
): string => requireBearerToken(request.headers, message);

export const stripBearerPrefix = (
  value: string | null | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = parseAuthorizationHeader(value);

  if (parsed.ok) {
    return parsed.token;
  }

  return normalizeBearerToken(value);
};

export const maskBearerToken = (
  token: string | null | undefined,
  visiblePrefixLength = 6,
  visibleSuffixLength = 4,
): string | undefined => {
  const normalizedToken =
    normalizeBearerToken(token) ??
    normalizeBearerToken(getBearerTokenFromAuthorizationHeader(token));

  if (!normalizedToken) {
    return undefined;
  }

  if (normalizedToken.length <= visiblePrefixLength + visibleSuffixLength) {
    return '*'.repeat(normalizedToken.length);
  }

  return `${normalizedToken.slice(0, visiblePrefixLength)}...${normalizedToken.slice(
    -visibleSuffixLength,
  )}`;
};

export const redactAuthorizationHeader = (
  authorizationHeader: string | null | undefined,
): string | undefined => {
  const parsed = parseAuthorizationHeader(authorizationHeader);

  if (!parsed.ok) {
    return authorizationHeader ? '[redacted-invalid-authorization]' : undefined;
  }

  return `${BEARER_AUTH_SCHEME} ${maskBearerToken(parsed.token) ?? '[redacted]'}`;
};
