import type {
  AuthSessionId,
  AuthUserId,
  AuthUsername,
} from '@aerealith-ai/contracts';

export const AUTH_TOKEN_TYPE = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;

export const AUTH_TOKEN_ALGORITHM = {
  HS256: 'HS256',
  HS384: 'HS384',
  HS512: 'HS512',
} as const;

export const AUTH_TOKEN_SCOPE = {
  AUTH_READ: 'auth:read',
  AUTH_WRITE: 'auth:write',
  SESSION_READ: 'session:read',
  SESSION_WRITE: 'session:write',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
} as const;

export type AuthTokenType =
  (typeof AUTH_TOKEN_TYPE)[keyof typeof AUTH_TOKEN_TYPE];

export type AuthTokenAlgorithm =
  (typeof AUTH_TOKEN_ALGORITHM)[keyof typeof AUTH_TOKEN_ALGORITHM];

export type AuthTokenScope =
  (typeof AUTH_TOKEN_SCOPE)[keyof typeof AUTH_TOKEN_SCOPE];

export type AuthTokenString = string;

export type AuthTokenId = string;

export type AuthTokenTimestamps = {
  issuedAt: number;
  expiresAt: number;
};

export type AuthTokenSubject = {
  userId: AuthUserId;
  username: AuthUsername;
  sessionId?: AuthSessionId;
};

export type AuthTokenClaims = AuthTokenSubject &
  AuthTokenTimestamps & {
    id: AuthTokenId;
    type: AuthTokenType;
    scopes: AuthTokenScope[];
    issuer: string;
    audience: string;
  };

export type AuthAccessTokenClaims = AuthTokenClaims & {
  type: typeof AUTH_TOKEN_TYPE.ACCESS;
  sessionId: AuthSessionId;
};

export type AuthRefreshTokenClaims = AuthTokenClaims & {
  type: typeof AUTH_TOKEN_TYPE.REFRESH;
  sessionId: AuthSessionId;
};

export type AuthVerificationTokenClaims = AuthTokenClaims & {
  type:
    | typeof AUTH_TOKEN_TYPE.EMAIL_VERIFICATION
    | typeof AUTH_TOKEN_TYPE.PASSWORD_RESET;
};

export type AuthTokenPair = {
  accessToken: AuthTokenString;
  refreshToken: AuthTokenString;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  tokenType: 'Bearer';
};

export type AuthTokenIssueInput = AuthTokenSubject & {
  type: AuthTokenType;
  scopes?: AuthTokenScope[];
};

export type AuthAccessTokenIssueInput = AuthTokenSubject & {
  sessionId: AuthSessionId;
  scopes?: AuthTokenScope[];
};

export type AuthRefreshTokenIssueInput = AuthTokenSubject & {
  sessionId: AuthSessionId;
  scopes?: AuthTokenScope[];
};

export type AuthTokenVerifyResult = {
  valid: boolean;
  claims?: AuthTokenClaims;
  reason?: string;
};

export type AuthTokenPayload = {
  jti: AuthTokenId;
  sub: AuthUserId;
  username: AuthUsername;
  sid?: AuthSessionId;
  typ: AuthTokenType;
  scope: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export type AuthTokenConfig = {
  issuer: string;
  audience: string;
  algorithm: AuthTokenAlgorithm;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  emailVerificationTokenTtlSeconds: number;
  passwordResetTokenTtlSeconds: number;
};

export const isAuthTokenType = (value: unknown): value is AuthTokenType => {
  return (
    typeof value === 'string' &&
    Object.values(AUTH_TOKEN_TYPE).includes(value as AuthTokenType)
  );
};

export const isAuthTokenScope = (value: unknown): value is AuthTokenScope => {
  return (
    typeof value === 'string' &&
    Object.values(AUTH_TOKEN_SCOPE).includes(value as AuthTokenScope)
  );
};

export const isAuthTokenAlgorithm = (
  value: unknown,
): value is AuthTokenAlgorithm => {
  return (
    typeof value === 'string' &&
    Object.values(AUTH_TOKEN_ALGORITHM).includes(value as AuthTokenAlgorithm)
  );
};

export const hasAuthTokenScope = (
  claims: Pick<AuthTokenClaims, 'scopes'>,
  scope: AuthTokenScope,
): boolean => {
  return claims.scopes.includes(scope);
};

export const hasEveryAuthTokenScope = (
  claims: Pick<AuthTokenClaims, 'scopes'>,
  scopes: AuthTokenScope[],
): boolean => {
  return scopes.every((scope) => claims.scopes.includes(scope));
};

export const hasSomeAuthTokenScope = (
  claims: Pick<AuthTokenClaims, 'scopes'>,
  scopes: AuthTokenScope[],
): boolean => {
  return scopes.some((scope) => claims.scopes.includes(scope));
};

export const authTokenClaimsToPayload = (
  claims: AuthTokenClaims,
): AuthTokenPayload => {
  return {
    jti: claims.id,
    sub: claims.userId,
    username: claims.username,
    sid: claims.sessionId,
    typ: claims.type,
    scope: claims.scopes.join(' '),
    iss: claims.issuer,
    aud: claims.audience,
    iat: claims.issuedAt,
    exp: claims.expiresAt,
  };
};

export const authTokenPayloadToClaims = (
  payload: AuthTokenPayload,
): AuthTokenClaims => {
  return {
    id: payload.jti,
    userId: payload.sub,
    username: payload.username,
    sessionId: payload.sid,
    type: payload.typ,
    scopes: payload.scope
      .split(' ')
      .map((scope) => scope.trim())
      .filter(isAuthTokenScope),
    issuer: payload.iss,
    audience: payload.aud,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
};