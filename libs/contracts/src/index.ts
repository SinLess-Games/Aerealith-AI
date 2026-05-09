/**
 * Helix shared contract library.
 *
 * This public barrel exports framework-agnostic contracts only:
 * - DTOs
 * - error code constants/types
 * - response types
 * - Zod schemas
 *
 * Do not export service implementations, database entities, Hono handlers,
 * Cloudflare bindings, or frontend-only code from this package.
 */

// -----------------------------------------------------------------------------
// Explicit conflict resolutions
// -----------------------------------------------------------------------------

// DTO conflict:
// auth.dto and session.dto both export SessionApiResponseDto.
// Keep the session-domain name as the canonical flat export.
export type { SessionApiResponseDto } from './DTOs/session.dto';
export type { SessionApiResponseDto as AuthSessionApiResponseDto } from './DTOs/auth.dto';

// Response/schema conflict:
// paginated.response and common.schema both export SortDirection.
// Keep the pagination contract as the canonical flat export.
export type { SortDirection } from './response-types/paginated.response';
export type { SortDirection as CommonSortDirection } from './zod-schemas/common.schema';

// Schema conflict:
// auth.schema and user.schema both export emailSchema.
// Keep auth emailSchema as the canonical flat export.
export { emailSchema } from './zod-schemas/auth.schema';
export { emailSchema as userEmailSchema } from './zod-schemas/user.schema';

// -----------------------------------------------------------------------------
// DTOs
// -----------------------------------------------------------------------------

export * from './DTOs/auth.dto';
export * from './DTOs/session.dto';
export * from './DTOs/user.dto';

// -----------------------------------------------------------------------------
// Error code enums
// -----------------------------------------------------------------------------

export * from './error-code-enums/auth-error-codes';
export * from './error-code-enums/common-error-codes';
export * from './error-code-enums/user-error-codes';

// -----------------------------------------------------------------------------
// Response types
// -----------------------------------------------------------------------------

export * from './response-types/api.response';
export * from './response-types/error.response';
export * from './response-types/paginated.response';

// -----------------------------------------------------------------------------
// Zod schemas
// -----------------------------------------------------------------------------

export * from './zod-schemas/auth.schema';
export * from './zod-schemas/common.schema';
export * from './zod-schemas/user.schema';

// -----------------------------------------------------------------------------
// Namespaced exports
// -----------------------------------------------------------------------------
// Use these when you want to avoid future naming collisions entirely:
//
// import { AuthSchemas, UserSchemas, AuthDtos } from '@helix-ai/contracts';
//
// AuthSchemas.emailSchema
// UserSchemas.emailSchema
// AuthDtos.LoginRequestDto
// -----------------------------------------------------------------------------

export * as AuthDtos from './DTOs/auth.dto';
export * as SessionDtos from './DTOs/session.dto';
export * as UserDtos from './DTOs/user.dto';

export * as AuthErrorCodes from './error-code-enums/auth-error-codes';
export * as CommonErrorCodes from './error-code-enums/common-error-codes';
export * as UserErrorCodes from './error-code-enums/user-error-codes';

export * as ApiResponses from './response-types/api.response';
export * as ErrorResponses from './response-types/error.response';
export * as PaginatedResponses from './response-types/paginated.response';

export * as AuthSchemas from './zod-schemas/auth.schema';
export * as CommonSchemas from './zod-schemas/common.schema';
export * as UserSchemas from './zod-schemas/user.schema';
