export const ROUTE_HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const;

export type RouteHttpMethod = (typeof ROUTE_HTTP_METHODS)[number];

export const ROUTE_EXPOSURES = [
  'public',
  'internal',
  'private',
  'admin',
] as const;

export type RouteExposure = (typeof ROUTE_EXPOSURES)[number];

export const ROUTE_AUTH_MODES = [
  'none',
  'optional',
  'required',
  'service',
  'admin',
  'owner',
] as const;

export type RouteAuthMode = (typeof ROUTE_AUTH_MODES)[number];

export const ROUTE_CACHE_MODES = [
  'none',
  'private',
  'public',
  'no-store',
] as const;

export type RouteCacheMode = (typeof ROUTE_CACHE_MODES)[number];

export type RoutePath = `/${string}`;

export type ApiRoutePath = `/api/${string}`;

export interface RouteRateLimitConfig {
  enabled: boolean;
  limit: number;
  windowSeconds: number;
  keyBy: 'ip' | 'user' | 'tenant' | 'service' | 'custom';
}

export interface RouteCacheConfig {
  mode: RouteCacheMode;
  maxAgeSeconds?: number;
  staleWhileRevalidateSeconds?: number;
}

export interface RouteCorsConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowedMethods: RouteHttpMethod[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAgeSeconds?: number;
}

export interface RouteConfig {
  enabled: boolean;
  name: string;
  method: RouteHttpMethod;
  path: RoutePath;
  fullPath?: ApiRoutePath;
  description?: string;
  exposure: RouteExposure;
  auth: RouteAuthMode;
  tags: string[];
  rateLimit?: RouteRateLimitConfig;
  cache?: RouteCacheConfig;
  cors?: RouteCorsConfig;
}

export interface RouteGroupConfig {
  enabled: boolean;
  name: string;
  displayName: string;
  basePath: ApiRoutePath;
  healthPath?: ApiRoutePath;
  description?: string;
  routes: Record<string, RouteConfig>;
  tags: string[];
}

export interface RoutesConfig {
  enabled: boolean;
  apiVersion: string;
  apiBasePath: ApiRoutePath;
  healthPath: ApiRoutePath;
  registry: Record<string, RouteGroupConfig>;
}