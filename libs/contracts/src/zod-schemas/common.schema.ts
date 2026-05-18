import { z } from 'zod';

export const COMMON_LIMITS = {
  REQUEST_ID_MAX_LENGTH: 128,
  SERVICE_NAME_MAX_LENGTH: 128,
  API_VERSION_MAX_LENGTH: 32,
  PAGINATION_CURSOR_MAX_LENGTH: 512,
  PAGINATION_LIMIT_MAX: 100,
  SORT_BY_MAX_LENGTH: 128,
  HEALTH_CHECK_NAME_MAX_LENGTH: 128,
  HEALTH_CHECK_MESSAGE_MAX_LENGTH: 512,
  FIELD_VALIDATION_FIELD_MAX_LENGTH: 256,
  FIELD_VALIDATION_CODE_MAX_LENGTH: 128,
  FIELD_VALIDATION_MESSAGE_MAX_LENGTH: 512,
  ERROR_RESPONSE_PATH_MAX_LENGTH: 2048,
  ERROR_RESPONSE_METHOD_MAX_LENGTH: 16,
} as const;

export const COMMON_REGEX = {
  SERVICE_NAME: /^[a-zA-Z0-9._:-]+$/,
  API_VERSION: /^v\d+$/i,
} as const;

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .describe('An ISO-8601 datetime string with timezone offset.');

export const uuidSchema = z.string().uuid();

export const requestIdSchema = z
  .string()
  .trim()
  .min(1, 'Request id cannot be empty.')
  .max(
    COMMON_LIMITS.REQUEST_ID_MAX_LENGTH,
    `Request id must be at most ${COMMON_LIMITS.REQUEST_ID_MAX_LENGTH} characters.`,
  );

export const serviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Service name cannot be empty.')
  .max(
    COMMON_LIMITS.SERVICE_NAME_MAX_LENGTH,
    `Service name must be at most ${COMMON_LIMITS.SERVICE_NAME_MAX_LENGTH} characters.`,
  )
  .regex(
    COMMON_REGEX.SERVICE_NAME,
    'Service name may only contain letters, numbers, dots, underscores, colons, and hyphens.',
  );

export const apiVersionSchema = z
  .string()
  .trim()
  .min(1, 'API version cannot be empty.')
  .max(
    COMMON_LIMITS.API_VERSION_MAX_LENGTH,
    `API version must be at most ${COMMON_LIMITS.API_VERSION_MAX_LENGTH} characters.`,
  )
  .regex(COMMON_REGEX.API_VERSION, 'API version must use a format like v1.');

export const environmentSchema = z.enum([
  'local',
  'development',
  'test',
  'staging',
  'production',
]);

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const paginationCursorSchema = z
  .string()
  .trim()
  .min(1, 'Pagination cursor cannot be empty.')
  .max(
    COMMON_LIMITS.PAGINATION_CURSOR_MAX_LENGTH,
    `Pagination cursor must be at most ${COMMON_LIMITS.PAGINATION_CURSOR_MAX_LENGTH} characters.`,
  );

export const paginationLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(COMMON_LIMITS.PAGINATION_LIMIT_MAX);

export const sortBySchema = z
  .string()
  .trim()
  .min(1, 'Sort field cannot be empty.')
  .max(
    COMMON_LIMITS.SORT_BY_MAX_LENGTH,
    `Sort field must be at most ${COMMON_LIMITS.SORT_BY_MAX_LENGTH} characters.`,
  );

export const paginationRequestSchema = z.object({
  limit: paginationLimitSchema.optional(),
  cursor: paginationCursorSchema.optional(),
  sortBy: sortBySchema.optional(),
  sortDirection: sortDirectionSchema.optional(),
});

export const offsetPaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: paginationLimitSchema.optional(),
  sortBy: sortBySchema.optional(),
  sortDirection: sortDirectionSchema.optional(),
});

export const apiResponseMetaSchema = z
  .object({
    timestamp: isoDateTimeSchema.optional(),
    service: serviceNameSchema.optional(),
    version: apiVersionSchema.optional(),
    environment: environmentSchema.optional(),
    requestId: requestIdSchema.optional(),
  })
  .passthrough();

export const healthStatusSchema = z.enum(['ok', 'degraded', 'error']);

export const healthCheckSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Health check name cannot be empty.')
      .max(
        COMMON_LIMITS.HEALTH_CHECK_NAME_MAX_LENGTH,
        `Health check name must be at most ${COMMON_LIMITS.HEALTH_CHECK_NAME_MAX_LENGTH} characters.`,
      ),
    status: healthStatusSchema,
    message: z
      .string()
      .trim()
      .min(1, 'Health check message cannot be empty.')
      .max(
        COMMON_LIMITS.HEALTH_CHECK_MESSAGE_MAX_LENGTH,
        `Health check message must be at most ${COMMON_LIMITS.HEALTH_CHECK_MESSAGE_MAX_LENGTH} characters.`,
      )
      .optional(),
    durationMs: z.number().min(0).optional(),
    checkedAt: isoDateTimeSchema.optional(),
  })
  .passthrough();

export const fieldValidationPathSegmentSchema = z.union([
  z.string(),
  z.number(),
]);

export const fieldValidationErrorSchema = z
  .object({
    field: z
      .string()
      .trim()
      .min(1, 'Validation field cannot be empty.')
      .max(
        COMMON_LIMITS.FIELD_VALIDATION_FIELD_MAX_LENGTH,
        `Validation field must be at most ${COMMON_LIMITS.FIELD_VALIDATION_FIELD_MAX_LENGTH} characters.`,
      ),
    code: z
      .string()
      .trim()
      .min(1, 'Validation code cannot be empty.')
      .max(
        COMMON_LIMITS.FIELD_VALIDATION_CODE_MAX_LENGTH,
        `Validation code must be at most ${COMMON_LIMITS.FIELD_VALIDATION_CODE_MAX_LENGTH} characters.`,
      ),
    message: z
      .string()
      .trim()
      .min(1, 'Validation message cannot be empty.')
      .max(
        COMMON_LIMITS.FIELD_VALIDATION_MESSAGE_MAX_LENGTH,
        `Validation message must be at most ${COMMON_LIMITS.FIELD_VALIDATION_MESSAGE_MAX_LENGTH} characters.`,
      ),
    path: z.array(fieldValidationPathSegmentSchema).optional(),
    received: z.unknown().optional(),
  })
  .passthrough();

export const validationErrorDetailsSchema = z
  .object({
    issues: z.array(fieldValidationErrorSchema),
  })
  .passthrough();

export const errorResponseMetaSchema = apiResponseMetaSchema.extend({
  path: z
    .string()
    .trim()
    .min(1, 'Error response path cannot be empty.')
    .max(
      COMMON_LIMITS.ERROR_RESPONSE_PATH_MAX_LENGTH,
      `Error response path must be at most ${COMMON_LIMITS.ERROR_RESPONSE_PATH_MAX_LENGTH} characters.`,
    )
    .optional(),
  method: z
    .string()
    .trim()
    .min(1, 'Error response method cannot be empty.')
    .max(
      COMMON_LIMITS.ERROR_RESPONSE_METHOD_MAX_LENGTH,
      `Error response method must be at most ${COMMON_LIMITS.ERROR_RESPONSE_METHOD_MAX_LENGTH} characters.`,
    )
    .optional(),
});

export const emptyObjectSchema = z.record(z.string(), z.never());

export const apiSuccessResponseSchema = <TData extends z.ZodTypeAny>(
  dataSchema: TData,
) =>
  z
    .object({
      success: z.literal(true),
      data: dataSchema,
      meta: apiResponseMetaSchema.optional(),
    })
    .passthrough();

export const apiErrorCodeSchema = z
  .string()
  .trim()
  .min(1, 'Error code cannot be empty.')
  .max(128, 'Error code must be at most 128 characters.');

export const apiErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().trim().min(1).max(1024),
        details: z.unknown().optional(),
      })
      .passthrough(),
    meta: errorResponseMetaSchema.optional(),
  })
  .passthrough();

export type CommonLimits = typeof COMMON_LIMITS;
export type CommonRegex = typeof COMMON_REGEX;

export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type Uuid = z.infer<typeof uuidSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type ServiceName = z.infer<typeof serviceNameSchema>;
export type ApiVersion = z.infer<typeof apiVersionSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export type PaginationCursor = z.infer<typeof paginationCursorSchema>;
export type PaginationLimit = z.infer<typeof paginationLimitSchema>;
export type SortBy = z.infer<typeof sortBySchema>;

export type PaginationRequestInput = z.infer<typeof paginationRequestSchema>;
export type OffsetPaginationRequestInput = z.infer<
  typeof offsetPaginationRequestSchema
>;

export type ApiResponseMetaInput = z.infer<typeof apiResponseMetaSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthCheckInput = z.infer<typeof healthCheckSchema>;

export type FieldValidationPathSegment = z.infer<
  typeof fieldValidationPathSegmentSchema
>;
export type FieldValidationErrorInput = z.infer<
  typeof fieldValidationErrorSchema
>;
export type ValidationErrorDetailsInput = z.infer<
  typeof validationErrorDetailsSchema
>;

export type ErrorResponseMetaInput = z.infer<typeof errorResponseMetaSchema>;
export type EmptyObjectInput = z.infer<typeof emptyObjectSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponseInput = z.infer<typeof apiErrorResponseSchema>;

export type ApiSuccessResponseInput<TData> = {
  success: true;
  data: TData;
  meta?: ApiResponseMetaInput;
};

export const parseIsoDateTime = (input: unknown): IsoDateTime => {
  return isoDateTimeSchema.parse(input);
};

export const safeParseIsoDateTime = (input: unknown) => {
  return isoDateTimeSchema.safeParse(input);
};

export const parseUuid = (input: unknown): Uuid => {
  return uuidSchema.parse(input);
};

export const safeParseUuid = (input: unknown) => {
  return uuidSchema.safeParse(input);
};

export const parseRequestId = (input: unknown): RequestId => {
  return requestIdSchema.parse(input);
};

export const safeParseRequestId = (input: unknown) => {
  return requestIdSchema.safeParse(input);
};

export const parseServiceName = (input: unknown): ServiceName => {
  return serviceNameSchema.parse(input);
};

export const safeParseServiceName = (input: unknown) => {
  return serviceNameSchema.safeParse(input);
};

export const parseApiVersion = (input: unknown): ApiVersion => {
  return apiVersionSchema.parse(input);
};

export const safeParseApiVersion = (input: unknown) => {
  return apiVersionSchema.safeParse(input);
};

export const parseEnvironment = (input: unknown): Environment => {
  return environmentSchema.parse(input);
};

export const safeParseEnvironment = (input: unknown) => {
  return environmentSchema.safeParse(input);
};

export const parsePaginationRequest = (
  input: unknown,
): PaginationRequestInput => {
  return paginationRequestSchema.parse(input);
};

export const safeParsePaginationRequest = (input: unknown) => {
  return paginationRequestSchema.safeParse(input);
};

export const parseOffsetPaginationRequest = (
  input: unknown,
): OffsetPaginationRequestInput => {
  return offsetPaginationRequestSchema.parse(input);
};

export const safeParseOffsetPaginationRequest = (input: unknown) => {
  return offsetPaginationRequestSchema.safeParse(input);
};

export const parseApiResponseMeta = (input: unknown): ApiResponseMetaInput => {
  return apiResponseMetaSchema.parse(input);
};

export const safeParseApiResponseMeta = (input: unknown) => {
  return apiResponseMetaSchema.safeParse(input);
};

export const parseHealthCheck = (input: unknown): HealthCheckInput => {
  return healthCheckSchema.parse(input);
};

export const safeParseHealthCheck = (input: unknown) => {
  return healthCheckSchema.safeParse(input);
};

export const parseValidationErrorDetails = (
  input: unknown,
): ValidationErrorDetailsInput => {
  return validationErrorDetailsSchema.parse(input);
};

export const safeParseValidationErrorDetails = (input: unknown) => {
  return validationErrorDetailsSchema.safeParse(input);
};

export const parseErrorResponseMeta = (
  input: unknown,
): ErrorResponseMetaInput => {
  return errorResponseMetaSchema.parse(input);
};

export const safeParseErrorResponseMeta = (input: unknown) => {
  return errorResponseMetaSchema.safeParse(input);
};

export const parseApiErrorResponse = (
  input: unknown,
): ApiErrorResponseInput => {
  return apiErrorResponseSchema.parse(input);
};

export const safeParseApiErrorResponse = (input: unknown) => {
  return apiErrorResponseSchema.safeParse(input);
};