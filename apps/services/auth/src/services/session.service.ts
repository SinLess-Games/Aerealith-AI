import { AuthError } from '@helix-ai/api';
import type { User, UserSession } from '@helix-ai/db';

import {
  SessionRepository,
  type ListUserSessionsOptions,
} from '../repositories/session.repository';
import {
  tokenService as defaultTokenService,
  type TokenService,
} from './token.service';
import type {
  AuthAccessTokenClaims,
  AuthAccessTokenIssueInput,
  AuthRefreshTokenClaims,
  AuthTokenPair,
  AuthTokenScope,
  AuthTokenString,
} from '../types/auth-token.type';

export type SessionServiceConfig = {
  sessionTtlSeconds: number;
  refreshTokenRotationEnabled: boolean;
};

export type SessionServiceOptions = {
  repository: SessionRepository;
  tokenService?: TokenService;
  config?: Partial<SessionServiceConfig>;
};

export type CreateSessionInput = {
  user: User;
  username: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  scopes?: AuthTokenScope[];
  expiresAt?: Date;
};

export type RefreshSessionInput = {
  refreshToken: AuthTokenString;
  sessionId?: string;
  rotate?: boolean;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  scopes?: AuthTokenScope[];
};

export type RevokeCurrentSessionInput = {
  refreshToken?: AuthTokenString;
  sessionId?: string;
  revokedAt?: Date;
};

export type RevokeUserSessionsInput = {
  userId: string;
  exceptSessionId?: string;
  revokedAt?: Date;
};

export type RevokeSessionResult = {
  revoked: boolean;
  sessionId?: string;
  revokedAt: string;
};

export type AuthSessionResponse = {
  id: string;
  userId?: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
};

export type CreateSessionResult = {
  session: AuthSessionResponse;
  tokens: AuthTokenPair;
  accessClaims: AuthAccessTokenClaims;
  refreshClaims: AuthRefreshTokenClaims;
};

export type RefreshSessionResult = {
  session: AuthSessionResponse;
  tokens: AuthTokenPair;
  accessClaims: AuthAccessTokenClaims;
  refreshClaims: AuthRefreshTokenClaims;
};

export type ListSessionsResult = {
  sessions: AuthSessionResponse[];
};

type RuntimeGlobal = typeof globalThis & {
  crypto?: Crypto;
};

type RecordLike = Record<string, unknown>;

const DEFAULT_SESSION_CONFIG: SessionServiceConfig = {
  sessionTtlSeconds: 2_592_000,
  refreshTokenRotationEnabled: true,
};

const TEXT_ENCODER = new TextEncoder();

const getCrypto = (): Crypto => {
  const runtime = globalThis as RuntimeGlobal;

  if (runtime.crypto === undefined) {
    throw new Error('Web Crypto API is not available in this runtime.');
  }

  return runtime.crypto;
};

const getSubtleCrypto = (): SubtleCrypto => {
  const crypto = getCrypto();

  if (crypto.subtle === undefined) {
    throw new Error('SubtleCrypto API is not available in this runtime.');
  }

  return crypto.subtle;
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  const base64 = btoa(binary);

  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const createOpaqueToken = (): string => {
  const crypto = getCrypto();

  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
};

const sha256Base64Url = async (value: string): Promise<string> => {
  const digest = await getSubtleCrypto().digest(
    'SHA-256',
    TEXT_ENCODER.encode(value),
  );

  return base64UrlEncode(new Uint8Array(digest));
};

const normalizeConfig = (
  config: Partial<SessionServiceConfig> = {},
): SessionServiceConfig => {
  const mergedConfig = {
    ...DEFAULT_SESSION_CONFIG,
    ...config,
  };

  if (
    !Number.isInteger(mergedConfig.sessionTtlSeconds) ||
    mergedConfig.sessionTtlSeconds <= 0
  ) {
    throw new Error('Session TTL must be a positive integer.');
  }

  return mergedConfig;
};

const addSeconds = (date: Date, seconds: number): Date => {
  return new Date(date.getTime() + seconds * 1000);
};

const secondsToIsoString = (seconds: number): string => {
  return new Date(seconds * 1000).toISOString();
};

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

const readNullableStringProperty = (
  value: unknown,
  property: string,
): string | null | undefined => {
  const propertyValue = readRecord(value)[property];

  if (propertyValue === null) {
    return null;
  }

  if (typeof propertyValue === 'string') {
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

const getSessionId = (session: UserSession): string => {
  const sessionId = readStringProperty(session, 'id');

  if (sessionId === undefined) {
    throw AuthError.sessionNotFound();
  }

  return sessionId;
};

const getUserIdFromSession = (session: UserSession): string | undefined => {
  const user = readRecord(session).user;

  if (typeof user === 'string') {
    return user;
  }

  return readStringProperty(user, 'id');
};

const getSessionToken = (session: UserSession): string | undefined => {
  return (
    readStringProperty(session, 'sessionToken') ??
    readStringProperty(session, 'refreshTokenHash')
  );
};

const getSessionExpires = (session: UserSession): Date => {
  return session.expires;
};

const getOptionalDateIso = (
  session: UserSession,
  property: string,
): string | undefined => {
  return readDateProperty(session, property)?.toISOString();
};

const getOptionalNullableDateIso = (
  session: UserSession,
  property: string,
): string | null | undefined => {
  const value = readRecord(session)[property];

  if (value === null) {
    return null;
  }

  return readDateProperty(session, property)?.toISOString();
};

const createTokenPairFromExistingRefreshToken = async ({
  accessToken,
  refreshToken,
  refreshClaims,
  tokenService,
}: {
  accessToken: AuthTokenString;
  refreshToken: AuthTokenString;
  refreshClaims: AuthRefreshTokenClaims;
  tokenService: TokenService;
}): Promise<{
  tokens: AuthTokenPair;
  accessClaims: AuthAccessTokenClaims;
  refreshClaims: AuthRefreshTokenClaims;
}> => {
  const accessClaims = await tokenService.assertAccessToken(accessToken);

  return {
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: secondsToIsoString(accessClaims.expiresAt),
      refreshTokenExpiresAt: secondsToIsoString(refreshClaims.expiresAt),
      tokenType: 'Bearer',
    },
    accessClaims,
    refreshClaims,
  };
};

export class SessionService {
  private readonly repository: SessionRepository;

  private readonly tokenService: TokenService;

  private readonly config: SessionServiceConfig;

  public constructor(options: SessionServiceOptions) {
    this.repository = options.repository;
    this.tokenService = options.tokenService ?? defaultTokenService;
    this.config = normalizeConfig(options.config);
  }

  public async createSession(
    input: CreateSessionInput,
  ): Promise<CreateSessionResult> {
    const expiresAt =
      input.expiresAt ?? addSeconds(new Date(), this.config.sessionTtlSeconds);

    const temporaryRefreshTokenHash =
      await this.hashRefreshToken(createOpaqueToken());

    const session = await this.repository.createAndFlush({
      user: input.user,
      refreshTokenHash: temporaryRefreshTokenHash,
      deviceName: input.deviceName,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
      lastSeenAt: new Date(),
    });

    const sessionId = getSessionId(session);

    const tokens = await this.tokenService.issueTokenPair({
      userId: input.user.id,
      username: input.username,
      sessionId,
      scopes: input.scopes,
    });

    const refreshClaims = await this.tokenService.assertRefreshToken(
      tokens.refreshToken,
    );
    const accessClaims = await this.tokenService.assertAccessToken(
      tokens.accessToken,
    );

    const refreshTokenHash = await this.hashRefreshToken(tokens.refreshToken);

    const updatedSession =
      (await this.repository.rotateRefreshToken(
        sessionId,
        refreshTokenHash,
        new Date(tokens.refreshTokenExpiresAt),
      )) ?? session;

    return {
      session: this.toSessionResponse(updatedSession),
      tokens,
      accessClaims,
      refreshClaims,
    };
  }

  public async refreshSession(
    input: RefreshSessionInput,
  ): Promise<RefreshSessionResult> {
    const refreshClaims = await this.tokenService.assertRefreshToken(
      input.refreshToken,
    );

    if (
      input.sessionId !== undefined &&
      input.sessionId !== refreshClaims.sessionId
    ) {
      throw AuthError.tokenInvalid('Refresh token session does not match.');
    }

    const refreshTokenHash = await this.hashRefreshToken(input.refreshToken);

    const session =
      input.sessionId === undefined
        ? await this.repository.findActiveByRefreshTokenHash(refreshTokenHash)
        : await this.repository.findActiveById(input.sessionId);

    if (session === null) {
      throw AuthError.sessionExpired();
    }

    const sessionId = getSessionId(session);

    if (sessionId !== refreshClaims.sessionId) {
      throw AuthError.tokenInvalid('Refresh token session does not match.');
    }

    const persistedRefreshTokenHash = getSessionToken(session);

    if (
      persistedRefreshTokenHash !== undefined &&
      persistedRefreshTokenHash !== refreshTokenHash
    ) {
      throw AuthError.tokenInvalid('Refresh token has been rotated.');
    }

    const shouldRotate =
      input.rotate ?? this.config.refreshTokenRotationEnabled;

    if (shouldRotate) {
      return this.refreshSessionWithRotation({
        session,
        refreshClaims,
        input,
      });
    }

    return this.refreshSessionWithoutRotation({
      session,
      refreshClaims,
      input,
    });
  }

  public async revokeCurrentSession(
    input: RevokeCurrentSessionInput,
  ): Promise<RevokeSessionResult> {
    const revokedAt = input.revokedAt ?? new Date();

    if (input.sessionId !== undefined) {
      const session = await this.repository.revokeSession({
        sessionId: input.sessionId,
        revokedAt,
      });

      return {
        revoked: session !== null,
        sessionId: input.sessionId,
        revokedAt: revokedAt.toISOString(),
      };
    }

    if (input.refreshToken !== undefined) {
      const refreshTokenHash = await this.hashRefreshToken(input.refreshToken);
      const session = await this.repository.revokeByRefreshTokenHash(
        refreshTokenHash,
        revokedAt,
      );

      return {
        revoked: session !== null,
        sessionId: session === null ? undefined : getSessionId(session),
        revokedAt: revokedAt.toISOString(),
      };
    }

    throw AuthError.sessionNotFound();
  }

  public async revokeSession(
    sessionId: string,
    revokedAt = new Date(),
  ): Promise<RevokeSessionResult> {
    const session = await this.repository.revokeSession({
      sessionId,
      revokedAt,
    });

    return {
      revoked: session !== null,
      sessionId,
      revokedAt: revokedAt.toISOString(),
    };
  }

  public async revokeUserSessions({
    userId,
    exceptSessionId,
    revokedAt = new Date(),
  }: RevokeUserSessionsInput): Promise<number> {
    return this.repository.revokeUserSessions({
      userId,
      exceptSessionId,
      revokedAt,
    });
  }

  public async listUserSessions(
    userId: string,
    options: ListUserSessionsOptions = {},
  ): Promise<ListSessionsResult> {
    const sessions = await this.repository.findByUserId(userId, options);

    return {
      sessions: sessions.map((session) => this.toSessionResponse(session)),
    };
  }

  public async getSession(sessionId: string): Promise<AuthSessionResponse> {
    const session = await this.repository.findById(sessionId);

    if (session === null) {
      throw AuthError.sessionNotFound();
    }

    return this.toSessionResponse(session);
  }

  public async getActiveSession(
    sessionId: string,
  ): Promise<AuthSessionResponse> {
    const session = await this.repository.findActiveById(sessionId);

    if (session === null) {
      throw AuthError.sessionExpired();
    }

    return this.toSessionResponse(session);
  }

  public async touchSession(sessionId: string): Promise<AuthSessionResponse> {
    const session = await this.repository.touchSession(sessionId);

    if (session === null) {
      throw AuthError.sessionNotFound();
    }

    return this.toSessionResponse(session);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    return this.repository.deleteSession(sessionId);
  }

  public async hashRefreshToken(token: AuthTokenString): Promise<string> {
    return sha256Base64Url(token);
  }

  public toSessionResponse(session: UserSession): AuthSessionResponse {
    return {
      id: getSessionId(session),
      userId: getUserIdFromSession(session),
      deviceName: readNullableStringProperty(session, 'deviceName') ?? null,
      userAgent: readNullableStringProperty(session, 'userAgent') ?? null,
      ipAddress: readNullableStringProperty(session, 'ipAddress') ?? null,
      createdAt: getOptionalDateIso(session, 'createdAt'),
      updatedAt: getOptionalDateIso(session, 'updatedAt'),
      lastSeenAt: getOptionalNullableDateIso(session, 'lastSeenAt') ?? null,
      expiresAt: getSessionExpires(session).toISOString(),
      revokedAt: this.repository.isRevoked(session)
        ? getSessionExpires(session).toISOString()
        : null,
    };
  }

  private async refreshSessionWithRotation({
    session,
    refreshClaims,
    input,
  }: {
    session: UserSession;
    refreshClaims: AuthRefreshTokenClaims;
    input: RefreshSessionInput;
  }): Promise<RefreshSessionResult> {
    const sessionId = getSessionId(session);

    const tokens = await this.tokenService.issueTokenPair({
      userId: refreshClaims.userId,
      username: refreshClaims.username,
      sessionId,
      scopes: input.scopes,
    });

    const accessClaims = await this.tokenService.assertAccessToken(
      tokens.accessToken,
    );
    const nextRefreshClaims = await this.tokenService.assertRefreshToken(
      tokens.refreshToken,
    );

    const refreshTokenHash = await this.hashRefreshToken(tokens.refreshToken);

    const updatedSession =
      (await this.repository.updateSession(sessionId, {
        refreshTokenHash,
        deviceName: input.deviceName,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        lastSeenAt: new Date(),
        expiresAt: new Date(tokens.refreshTokenExpiresAt),
      })) ?? session;

    return {
      session: this.toSessionResponse(updatedSession),
      tokens,
      accessClaims,
      refreshClaims: nextRefreshClaims,
    };
  }

  private async refreshSessionWithoutRotation({
    session,
    refreshClaims,
    input,
  }: {
    session: UserSession;
    refreshClaims: AuthRefreshTokenClaims;
    input: RefreshSessionInput;
  }): Promise<RefreshSessionResult> {
    const sessionId = getSessionId(session);

    const accessToken = await this.tokenService.issueAccessToken({
      userId: refreshClaims.userId,
      username: refreshClaims.username,
      sessionId,
      scopes: input.scopes,
    } satisfies AuthAccessTokenIssueInput);

    const tokenPair = await createTokenPairFromExistingRefreshToken({
      accessToken,
      refreshToken: input.refreshToken,
      refreshClaims,
      tokenService: this.tokenService,
    });

    const updatedSession =
      (await this.repository.updateSession(sessionId, {
        deviceName: input.deviceName,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        lastSeenAt: new Date(),
        expiresAt: new Date(tokenPair.tokens.refreshTokenExpiresAt),
      })) ?? session;

    return {
      session: this.toSessionResponse(updatedSession),
      tokens: tokenPair.tokens,
      accessClaims: tokenPair.accessClaims,
      refreshClaims: tokenPair.refreshClaims,
    };
  }
}

export const createSessionService = (
  options: SessionServiceOptions,
): SessionService => {
  return new SessionService(options);
};
