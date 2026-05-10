import type { MiddlewareHandler } from 'hono';

import { AuthError } from '@helix-ai/api';
import type { User, UserSession } from '@helix-ai/db';
import {
  AUTH_USER_STATUS,
  isAuthUserStatus,
  type AuthUserStatus,
} from '@helix-ai/contracts';

import type { SessionRepository } from '../repositories/session.repository';
import type { UserRepository } from '../repositories/user.repository';
import {
  createAuthenticatedAuthContext,
  setAnonymousAuthContext,
  setAuthenticatedAuthContext,
  type AuthContextHonoContext,
  type AuthContextSession,
  type AuthContextToken,
  type AuthHonoEnv,
} from '../types/auth-context.type';
import {
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthTokenString,
} from '../types/auth-token.type';
import {
  tokenService as defaultTokenService,
  type TokenService,
} from '../services/token.service';

export type AuthContextMiddlewareOptions = {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  tokenService?: TokenService;
  requireSession?: boolean;
};

type RecordLike = Record<string, unknown>;

type AuthContextUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  status: AuthUserStatus;
  createdAt: Date;
  updatedAt: Date;
  sessionId?: string;
};

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_SCHEME = 'Bearer';

const DB_ONLY_USER_STATUS = {
  SUSPENDED: 'suspended',
} as const;

const readRecord = (value: unknown): RecordLike => {
  if (typeof value === 'object' && value !== null) {
    return value as RecordLike;
  }

  return {};
};

const readStringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'string') {
    return propertyValue;
  }

  return undefined;
};

const readBooleanProperty = (
  value: unknown,
  property: string,
): boolean | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'boolean') {
    return propertyValue;
  }

  return undefined;
};

const readDateProperty = (
  value: unknown,
  property: string,
): Date | undefined => {
  const propertyValue = readRecord(value)[property];

  if (propertyValue instanceof Date) {
    return propertyValue;
  }

  if (typeof propertyValue === 'string') {
    const date = new Date(propertyValue);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return undefined;
};

const readNullableDateProperty = (
  value: unknown,
  property: string,
): Date | null | undefined => {
  const propertyValue = readRecord(value)[property];

  if (propertyValue === null) {
    return null;
  }

  return readDateProperty(value, property);
};

const parseBearerTokenHeader = (
  authorization: string,
): AuthTokenString | undefined => {
  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/);

  if (
    scheme === undefined ||
    scheme.toLowerCase() !== BEARER_SCHEME.toLowerCase()
  ) {
    throw AuthError.tokenInvalid(
      'Authorization header must use the Bearer scheme.',
    );
  }

  if (token === undefined || token.trim() === '' || extraParts.length > 0) {
    throw AuthError.tokenInvalid('Authorization Bearer token is malformed.');
  }

  return token;
};

const getUserId = (user: User): string => {
  const id = readStringProperty(user, 'id');

  if (id === undefined) {
    throw AuthError.userNotFound();
  }

  return id;
};

const getUserUsername = (user: User): string => {
  const username = readStringProperty(user, 'username');

  if (username === undefined) {
    throw AuthError.userNotFound();
  }

  return username;
};

const getUserEmail = (user: User): string => {
  const email = readStringProperty(user, 'email');

  if (email === undefined) {
    throw AuthError.userNotFound();
  }

  return email;
};

const getUserCreatedAt = (user: User): Date => {
  return readDateProperty(user, 'createdAt') ?? new Date();
};

const getUserUpdatedAt = (user: User): Date => {
  return readDateProperty(user, 'updatedAt') ?? new Date();
};

const getUserEmailVerified = (user: User): boolean => {
  return readBooleanProperty(user, 'emailVerified') ?? false;
};

const getRawUserStatus = (user: User): string => {
  return readStringProperty(user, 'status') ?? AUTH_USER_STATUS.ACTIVE;
};

const toContractAuthUserStatus = (status: unknown): AuthUserStatus => {
  if (typeof status !== 'string') {
    return AUTH_USER_STATUS.ACTIVE;
  }

  if (isAuthUserStatus(status)) {
    return status;
  }

  if (status === DB_ONLY_USER_STATUS.SUSPENDED) {
    return AUTH_USER_STATUS.DISABLED;
  }

  return AUTH_USER_STATUS.ACTIVE;
};

const assertUserCanAuthenticate = (user: User): void => {
  const rawStatus = getRawUserStatus(user);
  const status = toContractAuthUserStatus(rawStatus);

  if (
    status === AUTH_USER_STATUS.DISABLED ||
    rawStatus === DB_ONLY_USER_STATUS.SUSPENDED
  ) {
    throw AuthError.userDisabled();
  }

  if (status === AUTH_USER_STATUS.LOCKED) {
    throw AuthError.userLocked();
  }

  if (status === AUTH_USER_STATUS.DELETED) {
    throw AuthError.userDeleted();
  }
};

const getSessionId = (session: UserSession): string => {
  const id = readStringProperty(session, 'id');

  if (id === undefined) {
    throw AuthError.sessionNotFound();
  }

  return id;
};

const getSessionUserId = (session: UserSession): string | undefined => {
  const user = readRecord(session).user;

  if (typeof user === 'string') {
    return user;
  }

  return readStringProperty(user, 'id');
};

const getSessionExpiresAt = (session: UserSession): Date => {
  return readDateProperty(session, 'expires') ?? new Date(0);
};

const getSessionCreatedAt = (session: UserSession): Date | undefined => {
  return readDateProperty(session, 'createdAt');
};

const getSessionUpdatedAt = (session: UserSession): Date | undefined => {
  return readDateProperty(session, 'updatedAt');
};

const getSessionRevokedAt = (session: UserSession): Date | null | undefined => {
  return readNullableDateProperty(session, 'revokedAt');
};

const isSessionExpired = (session: UserSession, now = new Date()): boolean => {
  return getSessionExpiresAt(session).getTime() <= now.getTime();
};

const toAuthContextUser = (
  user: User,
  claims: AuthAccessTokenClaims,
): AuthContextUser => {
  return {
    id: getUserId(user),
    username: getUserUsername(user),
    email: getUserEmail(user),
    emailVerified: getUserEmailVerified(user),
    status: toContractAuthUserStatus(getRawUserStatus(user)),
    createdAt: getUserCreatedAt(user),
    updatedAt: getUserUpdatedAt(user),
    sessionId: claims.sessionId,
  };
};

const toAuthContextSession = (
  session: UserSession,
  claims: AuthAccessTokenClaims,
): AuthContextSession => {
  return {
    id: getSessionId(session),
    userId: getSessionUserId(session) ?? claims.userId,
    username: claims.username,
    expiresAt: getSessionExpiresAt(session),
    revokedAt: getSessionRevokedAt(session) ?? null,
    createdAt: getSessionCreatedAt(session),
    updatedAt: getSessionUpdatedAt(session),
  };
};

const toAuthContextToken = (
  token: AuthTokenString,
  claims: AuthAccessTokenClaims,
): AuthContextToken => {
  return {
    raw: token,
    type: AUTH_TOKEN_TYPE.ACCESS,
    scopes: claims.scopes,
    claims,
  };
};

const assertSessionMatchesClaims = (
  session: UserSession,
  claims: AuthAccessTokenClaims,
): void => {
  const sessionId = getSessionId(session);

  if (sessionId !== claims.sessionId) {
    throw AuthError.tokenInvalid('Access token session does not match.');
  }

  const sessionUserId = getSessionUserId(session);

  if (sessionUserId !== undefined && sessionUserId !== claims.userId) {
    throw AuthError.tokenInvalid('Access token user does not match session.');
  }

  if (isSessionExpired(session)) {
    throw AuthError.sessionExpired();
  }
};

const getRequestBearerToken = (
  c: AuthContextHonoContext,
): AuthTokenString | undefined => {
  const authorization = c.req.header(AUTHORIZATION_HEADER);

  if (authorization === undefined || authorization.trim() === '') {
    return undefined;
  }

  return parseBearerTokenHeader(authorization);
};

export const authContextMiddleware = ({
  userRepository,
  sessionRepository,
  tokenService = defaultTokenService,
  requireSession = true,
}: AuthContextMiddlewareOptions): MiddlewareHandler<AuthHonoEnv> => {
  return async (c, next) => {
    const context = c as AuthContextHonoContext;
    const token = getRequestBearerToken(context);

    if (token === undefined) {
      setAnonymousAuthContext(context);

      return next();
    }

    const claims = await tokenService.assertAccessToken(token);

    const user = await userRepository.findById(claims.userId);

    if (user === null) {
      throw AuthError.userNotFound(claims.userId);
    }

    assertUserCanAuthenticate(user);

    const session = await sessionRepository.findActiveById(claims.sessionId);

    if (session === null) {
      if (requireSession) {
        throw AuthError.sessionExpired();
      }

      setAnonymousAuthContext(context);

      return next();
    }

    assertSessionMatchesClaims(session, claims);

    const authContext = createAuthenticatedAuthContext({
      user: toAuthContextUser(user, claims),
      session: toAuthContextSession(session, claims),
      token: toAuthContextToken(token, claims),
      claims,
    });

    setAuthenticatedAuthContext(context, authContext);

    return next();
  };
};

export { authContextMiddleware as createAuthContextMiddleware };
