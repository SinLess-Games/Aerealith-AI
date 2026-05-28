export type UnknownRecord = Record<string, unknown>;

export type BrowserCookieOptions = {
  path?: string;
  domain?: string;
  maxAgeSeconds?: number;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
};
