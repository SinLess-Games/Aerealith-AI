import {
  buildApiVersionPath,
  DEFAULT_API_VERSION,
  type ApiVersion,
} from './api-version';

export const API_ROUTE_PREFIXES = {
  auth: '/auth',
  users: '/users',
  waitlist: '/waitlist',
  health: '/health',
} as const;

export type ApiRoutePrefixKey = keyof typeof API_ROUTE_PREFIXES;
export type ApiRoutePrefix =
  (typeof API_ROUTE_PREFIXES)[ApiRoutePrefixKey];

export const buildApiRoutePrefix = (
  prefix: ApiRoutePrefix,
  version: ApiVersion = DEFAULT_API_VERSION,
): string => `${buildApiVersionPath(version)}${prefix}`;

export const API_V1_ROUTE_PREFIXES = {
  auth: buildApiRoutePrefix(API_ROUTE_PREFIXES.auth),
  users: buildApiRoutePrefix(API_ROUTE_PREFIXES.users),
  waitlist: buildApiRoutePrefix(API_ROUTE_PREFIXES.waitlist),
  health: buildApiRoutePrefix(API_ROUTE_PREFIXES.health),
} as const;

export type ApiV1RoutePrefixKey = keyof typeof API_V1_ROUTE_PREFIXES;
export type ApiV1RoutePrefix =
  (typeof API_V1_ROUTE_PREFIXES)[ApiV1RoutePrefixKey];