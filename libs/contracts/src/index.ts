/**
 * Helix shared contract library.
 *
 * This public barrel exports framework-agnostic contracts only:
 * - DTOs
 * - error code constants/types
 * - response types
 * - route constants/builders
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
export type {
  SessionApiResponseDto as AuthSessionApiResponseDto,
} from './DTOs/auth.dto';

// Response/schema conflict:
// paginated.response and common.schema both export SortDirection.
// Keep the pagination contract as the canonical flat export.
export type { SortDirection } from './response-types/paginated.response';
export type {
  SortDirection as CommonSortDirection,
} from './zod-schemas/common.schema';

// Schema conflict:
// auth.schema and user.schema both export emailSchema.
// Keep auth emailSchema as the canonical flat export.
export { emailSchema } from './zod-schemas/auth.schema';
export { emailSchema as userEmailSchema } from './zod-schemas/user.schema';

// Auth type conflicts:
// DTO files already export AuthEmail, AuthSessionId, AuthUserId, and
// AuthUserStatus. Keep DTO names canonical at the flat root and expose the
// newer auth-user.type.ts versions through aliases and the AuthTypes namespace.
export {
  AUTH_ACCOUNT_PROVIDER,
  AUTH_USER_STATUS,
  canAccessUsername,
  isAuthAccountProvider,
  isAuthUserStatus,
  toPublicAuthUser,
} from './types/auth-user.type';

export type {
  AuthAccountId,
  AuthAccountIdentity,
  AuthAccountProvider,
  AuthenticatedUser,
  AuthEmail as AuthContractEmail,
  AuthSessionId as AuthContractSessionId,
  AuthUserAccessCheck,
  AuthUserId as AuthContractUserId,
  AuthUserIdentity,
  AuthUserLookup,
  AuthUsername,
  AuthUserStatus as AuthContractUserStatus,
  PublicAuthUser,
} from './types/auth-user.type';

// Auth schema conflicts:
// auth.schema already exports authSessionIdSchema. Keep that canonical at the
// flat root and expose the newer auth-session.schema.ts version through an alias.
export {
  authSessionIdSchema as authServiceSessionIdSchema,
} from './zod-schemas/auth-session.schema';

// User service type conflicts:
// Existing user DTO/schema files may already export user-related names.
// Keep the new user-service primitives available through clear aliases and the
// UserServiceTypes namespace.
export {
  USER_STATUSES as USER_SERVICE_STATUSES,
  type UserStatus as UserServiceStatus,
} from './types/user';

export type {
  UserId as UserServiceUserId,
  Username as UserServiceUsername,
} from './types/user';

// User service schema exports:
// Keep service-specific schemas aliased at the flat root to avoid collisions
// with the older zod-schemas/user.schema contract.
export {
  USERNAME_MAX_LENGTH as USER_SERVICE_USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH as USER_SERVICE_USERNAME_MIN_LENGTH,
  USERNAME_PATTERN as USER_SERVICE_USERNAME_PATTERN,
  createUserSchema as createUserServiceSchema,
  updateUserSchema as updateUserServiceSchema,
  usernameSchema as userServiceUsernameSchema,
  userRouteParamsSchema as userServiceRouteParamsSchema,
  type CreateUserSchema as CreateUserServiceSchema,
  type UpdateUserSchema as UpdateUserServiceSchema,
  type UsernameSchema as UserServiceUsernameSchema,
  type UserRouteParamsSchema as UserServiceRouteParamsSchema,
} from './zod-schemas/user';

// User service DTO exports:
// Keep service DTOs aliased at the flat root to avoid collisions with the older
// DTOs/user.dto contract.
export type {
  CreateUserDto as CreateUserServiceDto,
  PublicUserDto as PublicUserServiceDto,
  UpdateUserDto as UpdateUserServiceDto,
  UserHealthDto as UserServiceHealthDto,
  UserProfileDto as UserServiceProfileDto,
  UserSettingsDto as UserServiceSettingsDto,
} from './DTOs/user';

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
// Routes
// -----------------------------------------------------------------------------

export * from './routes';

// -----------------------------------------------------------------------------
// Existing Zod schemas
// -----------------------------------------------------------------------------

export * from './zod-schemas/auth.schema';
export * from './zod-schemas/common.schema';
export * from './zod-schemas/user.schema';

// -----------------------------------------------------------------------------
// Namespaced exports
// -----------------------------------------------------------------------------
// Use these when you want to avoid future naming collisions entirely:
//
// import {
//   AuthDtos,
//   AuthSchemas,
//   AuthRegisterSchemas,
//   AuthTypes,
//   UserServiceDtos,
//   UserServiceSchemas,
//   UserServiceTypes,
//   UserServiceRoutes,
// } from '@aerealith-ai/contracts';
//
// AuthSchemas.emailSchema
// UserServiceSchemas.usernameSchema
// UserServiceTypes.USER_STATUSES
// UserServiceRoutes.USER_ROUTES
// -----------------------------------------------------------------------------

export * as AuthDtos from './DTOs/auth.dto';
export * as SessionDtos from './DTOs/session.dto';
export * as UserDtos from './DTOs/user.dto';
export * as UserServiceDtos from './DTOs/user';

export * as AuthErrorCodes from './error-code-enums/auth-error-codes';
export * as CommonErrorCodes from './error-code-enums/common-error-codes';
export * as UserErrorCodes from './error-code-enums/user-error-codes';

export * as ApiResponses from './response-types/api.response';
export * as ErrorResponses from './response-types/error.response';
export * as PaginatedResponses from './response-types/paginated.response';

export * as AuthTypes from './types/auth-user.type';
export * as UserServiceTypes from './types/user';

export * as AuthSchemas from './zod-schemas/auth.schema';
export * as AuthLoginSchemas from './zod-schemas/auth-login.schema';
export * as AuthPasswordSchemas from './zod-schemas/auth-password.schema';
export * as AuthRegisterSchemas from './zod-schemas/auth-register.schema';
export * as AuthSessionSchemas from './zod-schemas/auth-session.schema';
export * as AuthVerificationSchemas from './zod-schemas/auth-verification.schema';
export * as CommonSchemas from './zod-schemas/common.schema';
export * as UserSchemas from './zod-schemas/user.schema';
export * as UserServiceSchemas from './zod-schemas/user';

export * as UserServiceRoutes from './routes';