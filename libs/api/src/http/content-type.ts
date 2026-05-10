import { HeaderName } from '../headers/headers';

/**
 * Content-Type constants and helpers for Helix API services.
 *
 * This file stays framework-neutral:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 */

export const ContentType = {
  JSON: 'application/json',
  JSON_UTF8: 'application/json; charset=utf-8',
  TEXT: 'text/plain',
  TEXT_UTF8: 'text/plain; charset=utf-8',
  HTML: 'text/html',
  HTML_UTF8: 'text/html; charset=utf-8',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  MULTIPART_FORM_DATA: 'multipart/form-data',
  OCTET_STREAM: 'application/octet-stream',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const CONTENT_TYPES = Object.values(ContentType);

export const JsonContentTypes = [
  ContentType.JSON,
  ContentType.JSON_UTF8,
] as const;

export type JsonContentType = (typeof JsonContentTypes)[number];

export const FormContentTypes = [
  ContentType.FORM_URLENCODED,
  ContentType.MULTIPART_FORM_DATA,
] as const;

export type FormContentType = (typeof FormContentTypes)[number];

export const normalizeContentType = (
  contentType: string | null | undefined,
): string | undefined => {
  if (!contentType) {
    return undefined;
  }

  return contentType.trim().toLowerCase();
};

export const getMediaType = (
  contentType: string | null | undefined,
): string | undefined => {
  const normalized = normalizeContentType(contentType);

  if (!normalized) {
    return undefined;
  }

  return normalized.split(';').at(0)?.trim() || undefined;
};

export const getCharset = (
  contentType: string | null | undefined,
): string | undefined => {
  const normalized = normalizeContentType(contentType);

  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(';').slice(1);

  for (const part of parts) {
    const [key, value] = part.split('=').map((item) => item.trim());

    if (key === 'charset' && value) {
      return value.replace(/^"|"$/g, '');
    }
  }

  return undefined;
};

export const isContentType = (value: unknown): value is ContentType =>
  typeof value === 'string' && CONTENT_TYPES.includes(value as ContentType);

export const isJsonContentType = (
  contentType: string | null | undefined,
): boolean => {
  const mediaType = getMediaType(contentType);

  return (
    mediaType === ContentType.JSON || mediaType?.endsWith('+json') === true
  );
};

export const isTextContentType = (
  contentType: string | null | undefined,
): boolean => {
  const mediaType = getMediaType(contentType);

  return (
    mediaType === ContentType.TEXT || mediaType?.startsWith('text/') === true
  );
};

export const isFormContentType = (
  contentType: string | null | undefined,
): boolean => {
  const mediaType = getMediaType(contentType);

  return (
    mediaType === ContentType.FORM_URLENCODED ||
    mediaType === ContentType.MULTIPART_FORM_DATA
  );
};

export const isMultipartFormDataContentType = (
  contentType: string | null | undefined,
): boolean => getMediaType(contentType) === ContentType.MULTIPART_FORM_DATA;

export const isUrlEncodedFormContentType = (
  contentType: string | null | undefined,
): boolean => getMediaType(contentType) === ContentType.FORM_URLENCODED;

export const getRequestContentType = (request: Request): string | undefined =>
  request.headers.get(HeaderName.CONTENT_TYPE) ?? undefined;

export const requestHasJsonContentType = (request: Request): boolean =>
  isJsonContentType(getRequestContentType(request));

export const requestHasFormContentType = (request: Request): boolean =>
  isFormContentType(getRequestContentType(request));

export const requireJsonContentType = (request: Request): boolean => {
  const method = request.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  return requestHasJsonContentType(request);
};

export const createContentTypeHeader = (
  contentType: ContentType | string,
): Record<typeof HeaderName.CONTENT_TYPE, string> => ({
  [HeaderName.CONTENT_TYPE]: contentType,
});
