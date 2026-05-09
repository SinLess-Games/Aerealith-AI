import type { ApiResponse } from '../response-types/api.response';
import type { PaginatedResponse } from '../response-types/paginated.response';
import type {
  AuthClaimsInput,
  AuthJwt,
  AuthSessionId,
  AuthSessionInput,
  AuthSessionStatus,
  AuthTokenPairInput,
  AuthUserId,
  SessionRequestInput,
  SessionResponseInput,
} from '../zod-schemas/auth.schema';

/**
 * Session DTOs shared across Helix services and clients.
 *
 * This file is type-only and framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export type {
  AuthClaimsInput,
  AuthJwt,
  AuthSessionId,
  AuthSessionStatus,
  AuthUserId,
};

export type SessionDto = AuthSessionInput;

export type SessionClaimsDto = AuthClaimsInput;

export type SessionTokenPairDto = AuthTokenPairInput;

export type GetSessionRequestDto = SessionRequestInput;

export type GetSessionResponseDto = SessionResponseInput;

export type SessionSummaryDto = {
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

export type ActiveSessionDto = SessionSummaryDto & {
  status: 'active';
};

export type ExpiredSessionDto = SessionSummaryDto & {
  status: 'expired';
};

export type RevokedSessionDto = SessionSummaryDto & {
  status: 'revoked';
};

export type SessionStateDto =
  | ActiveSessionDto
  | ExpiredSessionDto
  | RevokedSessionDto;

export type CreateSessionRequestDto = {
  userId: AuthUserId;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
};

export type CreateSessionResponseDto = {
  session: SessionDto;
  tokens: SessionTokenPairDto;
};

export type RefreshSessionRequestDto = {
  refreshToken: string;
};

export type RefreshSessionResponseDto = {
  session: SessionDto;
  tokens: SessionTokenPairDto;
};

export type RevokeSessionRequestDto = {
  sessionId: AuthSessionId;
};

export type RevokeSessionResponseDto = {
  revoked: boolean;
  sessionId: AuthSessionId;
};

export type RevokeAllSessionsRequestDto = {
  userId: AuthUserId;
  excludeSessionId?: AuthSessionId;
};

export type RevokeAllSessionsResponseDto = {
  revokedSessions: number;
};

export type SessionApiResponseDto = ApiResponse<GetSessionResponseDto>;

export type CreateSessionApiResponseDto = ApiResponse<CreateSessionResponseDto>;

export type RefreshSessionApiResponseDto =
  ApiResponse<RefreshSessionResponseDto>;

export type RevokeSessionApiResponseDto = ApiResponse<RevokeSessionResponseDto>;

export type RevokeAllSessionsApiResponseDto =
  ApiResponse<RevokeAllSessionsResponseDto>;

export type PaginatedSessionsResponseDto = PaginatedResponse<SessionDto>;

export type PaginatedSessionSummariesResponseDto =
  PaginatedResponse<SessionSummaryDto>;
