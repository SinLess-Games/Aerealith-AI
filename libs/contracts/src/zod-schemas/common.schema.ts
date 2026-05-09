import { z } from 'zod';

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .describe('An ISO-8601 datetime string with timezone offset.');

export const uuidSchema = z.string().uuid();

export const requestIdSchema = z.string().trim().min(1).max(128);

export const serviceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const apiVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^v\d+$/i);

export const environmentSchema = z.enum([
  'local',
  'development',
  'test',
  'staging',
  'production',
]);

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const paginationCursorSchema = z.string().trim().min(1).max(512);

export const paginationLimitSchema = z.coerce.number().int().min(1).max(100);

export const paginationRequestSchema = z.object({
  limit: paginationLimitSchema.optional(),
  cursor: paginationCursorSchema.optional(),
  sortBy: z.string().trim().min(1).max(128).optional(),
  sortDirection: sortDirectionSchema.optional(),
});

export const offsetPaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().trim().min(1).max(128).optional(),
  sortDirection: sortDirectionSchema.optional(),
});

export const apiResponseMetaSchema = z.object({
  timestamp: isoDateTimeSchema.optional(),
  service: serviceNameSchema.optional(),
  version: apiVersionSchema.optional(),
  environment: environmentSchema.optional(),
});

export const healthStatusSchema = z.enum(['ok', 'degraded', 'error']);

export const healthCheckSchema = z.object({
  name: z.string().trim().min(1).max(128),
  status: healthStatusSchema,
  message: z.string().trim().min(1).max(512).optional(),
  durationMs: z.number().min(0).optional(),
  checkedAt: isoDateTimeSchema.optional(),
});

export const fieldValidationErrorSchema = z.object({
  field: z.string().trim().min(1).max(256),
  code: z.string().trim().min(1).max(128),
  message: z.string().trim().min(1).max(512),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  received: z.unknown().optional(),
});

export const validationErrorDetailsSchema = z.object({
  issues: z.array(fieldValidationErrorSchema),
});

export const errorResponseMetaSchema = apiResponseMetaSchema.extend({
  path: z.string().trim().min(1).max(2048).optional(),
  method: z.string().trim().min(1).max(16).optional(),
});

export const emptyObjectSchema = z.record(z.string(), z.never());

export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type ServiceName = z.infer<typeof serviceNameSchema>;
export type ApiVersion = z.infer<typeof apiVersionSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type PaginationRequestInput = z.infer<typeof paginationRequestSchema>;
export type OffsetPaginationRequestInput = z.infer<
  typeof offsetPaginationRequestSchema
>;
export type ApiResponseMetaInput = z.infer<typeof apiResponseMetaSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthCheckInput = z.infer<typeof healthCheckSchema>;
export type FieldValidationErrorInput = z.infer<
  typeof fieldValidationErrorSchema
>;
export type ValidationErrorDetailsInput = z.infer<
  typeof validationErrorDetailsSchema
>;
export type ErrorResponseMetaInput = z.infer<typeof errorResponseMetaSchema>;
