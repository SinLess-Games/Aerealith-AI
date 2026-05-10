export const API_VERSION = {
  V1: 'V1',
} as const;

export type ApiVersion = (typeof API_VERSION)[keyof typeof API_VERSION];

export const DEFAULT_API_VERSION = API_VERSION.V1;

export const normalizeApiVersion = (
  version: string | undefined | null,
): ApiVersion => {
  const normalized = version?.trim().toUpperCase();

  if (normalized === API_VERSION.V1) {
    return API_VERSION.V1;
  }

  return DEFAULT_API_VERSION;
};

export const buildApiVersionPath = (
  version: ApiVersion = DEFAULT_API_VERSION,
): string => `/api/${version}`;