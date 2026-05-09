import type { ApiResponse } from '../response-types/api.response';
import type { PaginatedResponse } from '../response-types/paginated.response';
import type {
  AuthAuditEventInput,
  AuthBearerToken,
  AuthClaimsInput,
  AuthEmail,
  AuthIdentityId,
  AuthIdentityInput,
  AuthJwt,
  AuthProvider,
  AuthSessionId,
  AuthSessionInput,
  AuthSessionStatus,
  AuthToken,
  AuthTokenId,
  AuthTokenPairInput,
  AuthTokenType,
  AuthUserId,
  AuthUserInput,
  AuthUserStatus,
  ForgotPasswordRequestInput,
  ForgotPasswordResponseInput,
  JwkInput,
  JwksResponseInput,
  LoginRequestInput,
  LoginResponseInput,
  LogoutRequestInput,
  LogoutResponseInput,
  MfaChallengeRequestInput,
  MfaChallengeResponseInput,
  MfaMethod,
  MfaVerifyRequestInput,
  MfaVerifyResponseInput,
  RefreshTokenRequestInput,
  RefreshTokenResponseInput,
  RegisterRequestInput,
  RegisterResponseInput,
  ResendEmailVerificationRequestInput,
  ResendEmailVerificationResponseInput,
  ResetPasswordRequestInput,
  ResetPasswordResponseInput,
  SessionRequestInput,
  SessionResponseInput,
  VerifyEmailRequestInput,
  VerifyEmailResponseInput,
} from '../zod-schemas/auth.schema';

/**
 * Auth DTOs shared across Helix services and clients.
 *
 * This file is type-only and framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export type {
  AuthBearerToken,
  AuthEmail,
  AuthIdentityId,
  AuthJwt,
  AuthProvider,
  AuthSessionId,
  AuthSessionStatus,
  AuthToken,
  AuthTokenId,
  AuthTokenType,
  AuthUserId,
  AuthUserStatus,
  MfaMethod,
};

export type AuthUserDto = AuthUserInput;

export type AuthIdentityDto = AuthIdentityInput;

export type AuthSessionDto = AuthSessionInput;

export type AuthTokenPairDto = AuthTokenPairInput;

export type AuthClaimsDto = AuthClaimsInput;

export type AuthAuditEventDto = AuthAuditEventInput;

export type RegisterRequestDto = RegisterRequestInput;

export type RegisterResponseDto = RegisterResponseInput;

export type LoginRequestDto = LoginRequestInput;

export type LoginResponseDto = LoginResponseInput;

export type LogoutRequestDto = LogoutRequestInput;

export type LogoutResponseDto = LogoutResponseInput;

export type RefreshTokenRequestDto = RefreshTokenRequestInput;

export type RefreshTokenResponseDto = RefreshTokenResponseInput;

export type SessionRequestDto = SessionRequestInput;

export type SessionResponseDto = SessionResponseInput;

export type ForgotPasswordRequestDto = ForgotPasswordRequestInput;

export type ForgotPasswordResponseDto = ForgotPasswordResponseInput;

export type ResetPasswordRequestDto = ResetPasswordRequestInput;

export type ResetPasswordResponseDto = ResetPasswordResponseInput;

export type VerifyEmailRequestDto = VerifyEmailRequestInput;

export type VerifyEmailResponseDto = VerifyEmailResponseInput;

export type ResendEmailVerificationRequestDto =
  ResendEmailVerificationRequestInput;

export type ResendEmailVerificationResponseDto =
  ResendEmailVerificationResponseInput;

export type MfaChallengeRequestDto = MfaChallengeRequestInput;

export type MfaChallengeResponseDto = MfaChallengeResponseInput;

export type MfaVerifyRequestDto = MfaVerifyRequestInput;

export type MfaVerifyResponseDto = MfaVerifyResponseInput;

export type JwkDto = JwkInput;

export type JwksResponseDto = JwksResponseInput;

export type AuthUserSummaryDto = {
  id: AuthUserId;
  email: AuthEmail;
  status: AuthUserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionSummaryDto = {
  id: AuthSessionId;
  userId: AuthUserId;
  status: AuthSessionStatus;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthIdentitySummaryDto = {
  id: AuthIdentityId;
  userId: AuthUserId;
  provider: AuthProvider;
  email: AuthEmail | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthAccountDto = {
  user: AuthUserDto;
  identities: AuthIdentityDto[];
  sessions: AuthSessionSummaryDto[];
};

export type AuthenticatedSessionDto = {
  authenticated: true;
  user: AuthUserDto;
  session: AuthSessionDto;
  claims: AuthClaimsDto;
};

export type AnonymousSessionDto = {
  authenticated: false;
  user: null;
  session: null;
  claims: null;
};

export type CurrentAuthSessionDto =
  | AuthenticatedSessionDto
  | AnonymousSessionDto;

export type AuthUserApiResponseDto = ApiResponse<AuthUserDto>;

export type AuthAccountApiResponseDto = ApiResponse<AuthAccountDto>;

export type RegisterApiResponseDto = ApiResponse<RegisterResponseDto>;

export type LoginApiResponseDto = ApiResponse<LoginResponseDto>;

export type LogoutApiResponseDto = ApiResponse<LogoutResponseDto>;

export type RefreshTokenApiResponseDto = ApiResponse<RefreshTokenResponseDto>;

export type SessionApiResponseDto = ApiResponse<SessionResponseDto>;

export type CurrentAuthSessionApiResponseDto =
  ApiResponse<CurrentAuthSessionDto>;

export type ForgotPasswordApiResponseDto =
  ApiResponse<ForgotPasswordResponseDto>;

export type ResetPasswordApiResponseDto = ApiResponse<ResetPasswordResponseDto>;

export type VerifyEmailApiResponseDto = ApiResponse<VerifyEmailResponseDto>;

export type ResendEmailVerificationApiResponseDto =
  ApiResponse<ResendEmailVerificationResponseDto>;

export type MfaChallengeApiResponseDto = ApiResponse<MfaChallengeResponseDto>;

export type MfaVerifyApiResponseDto = ApiResponse<MfaVerifyResponseDto>;

export type JwksApiResponseDto = ApiResponse<JwksResponseDto>;

export type PaginatedAuthUsersResponseDto = PaginatedResponse<AuthUserDto>;

export type PaginatedAuthUserSummariesResponseDto =
  PaginatedResponse<AuthUserSummaryDto>;

export type PaginatedAuthSessionsResponseDto =
  PaginatedResponse<AuthSessionDto>;

export type PaginatedAuthSessionSummariesResponseDto =
  PaginatedResponse<AuthSessionSummaryDto>;

export type PaginatedAuthIdentitiesResponseDto =
  PaginatedResponse<AuthIdentityDto>;

export type PaginatedAuthAuditEventsResponseDto =
  PaginatedResponse<AuthAuditEventDto>;
