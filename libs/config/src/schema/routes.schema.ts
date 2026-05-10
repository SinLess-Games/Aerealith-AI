import { z } from 'zod';

import {
  ROUTE_AUTH_MODES,
  ROUTE_CACHE_MODES,
  ROUTE_EXPOSURES,
  ROUTE_HTTP_METHODS,
  type RoutesConfig,
} from '../types/routes';

export const routeHttpMethodSchema = z.enum(ROUTE_HTTP_METHODS);

export const routeExposureSchema = z.enum(ROUTE_EXPOSURES);

export const routeAuthModeSchema = z.enum(ROUTE_AUTH_MODES);

export const routeCacheModeSchema = z.enum(ROUTE_CACHE_MODES);

export const routePathSchema = z
  .string()
  .trim()
  .min(1, { message: 'Route path is required.' })
  .startsWith('/', { message: 'Route path must start with "/".' });

export const apiRoutePathSchema = routePathSchema.refine(
  (value) => value.startsWith('/api/'),
  {
    message: 'API route path must start with "/api/".',
  },
);

export const routeRateLimitKeyBySchema = z.enum([
  'ip',
  'user',
  'tenant',
  'service',
  'custom',
]);

export const routeRateLimitConfigSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
    keyBy: routeRateLimitKeyBySchema,
  })
  .strict();

export const routeCacheConfigSchema = z
  .object({
    mode: routeCacheModeSchema,
    maxAgeSeconds: z.number().int().nonnegative().optional(),
    staleWhileRevalidateSeconds: z.number().int().nonnegative().optional(),
  })
  .strict();

export const routeCorsConfigSchema = z
  .object({
    enabled: z.boolean(),
    allowedOrigins: z.array(z.string().trim().min(1)),
    allowedMethods: z.array(routeHttpMethodSchema),
    allowedHeaders: z.array(z.string().trim().min(1)),
    exposedHeaders: z.array(z.string().trim().min(1)),
    credentials: z.boolean(),
    maxAgeSeconds: z.number().int().nonnegative().optional(),
  })
  .strict();

export const routeConfigSchema = z
  .object({
    enabled: z.boolean(),
    name: z.string().trim().min(1),
    method: routeHttpMethodSchema,
    path: routePathSchema,
    fullPath: apiRoutePathSchema.optional(),
    description: z.string().trim().min(1).optional(),
    exposure: routeExposureSchema,
    auth: routeAuthModeSchema,
    tags: z.array(z.string().trim().min(1)),
    rateLimit: routeRateLimitConfigSchema.optional(),
    cache: routeCacheConfigSchema.optional(),
    cors: routeCorsConfigSchema.optional(),
  })
  .strict();

export const routeGroupConfigSchema = z
  .object({
    enabled: z.boolean(),
    name: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    basePath: apiRoutePathSchema,
    healthPath: apiRoutePathSchema.optional(),
    description: z.string().trim().min(1).optional(),
    routes: z.record(z.string().trim().min(1), routeConfigSchema),
    tags: z.array(z.string().trim().min(1)),
  })
  .strict();

export const routesSchema = z
  .object({
    enabled: z.boolean(),
    apiVersion: z.string().trim().min(1),
    apiBasePath: apiRoutePathSchema,
    healthPath: apiRoutePathSchema,
    registry: z.record(z.string().trim().min(1), routeGroupConfigSchema),
  })
  .strict();

export type RouteHttpMethodSchema = z.infer<typeof routeHttpMethodSchema>;

export type RouteExposureSchema = z.infer<typeof routeExposureSchema>;

export type RouteAuthModeSchema = z.infer<typeof routeAuthModeSchema>;

export type RouteCacheModeSchema = z.infer<typeof routeCacheModeSchema>;

export type RoutePathSchema = z.infer<typeof routePathSchema>;

export type ApiRoutePathSchema = z.infer<typeof apiRoutePathSchema>;

export type RouteRateLimitKeyBySchema = z.infer<
  typeof routeRateLimitKeyBySchema
>;

export type RouteRateLimitConfigSchema = z.infer<
  typeof routeRateLimitConfigSchema
>;

export type RouteCacheConfigSchema = z.infer<typeof routeCacheConfigSchema>;

export type RouteCorsConfigSchema = z.infer<typeof routeCorsConfigSchema>;

export type RouteConfigSchema = z.infer<typeof routeConfigSchema>;

export type RouteGroupConfigSchema = z.infer<typeof routeGroupConfigSchema>;

export type RoutesConfigSchema = z.infer<typeof routesSchema>;

export type RoutesConfigInput = z.input<typeof routesSchema>;

export type RoutesConfigOutput = z.output<typeof routesSchema>;

export function parseRoutesConfig(input: RoutesConfigInput): RoutesConfig {
  return routesSchema.parse(input) as RoutesConfig;
}

export function safeParseRoutesConfig(input: unknown) {
  return routesSchema.safeParse(input);
}