import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserSession } from '@helix-ai/db';

import {
  createSessionService,
  type SessionServiceConfig,
} from './session.service';
import type { SessionRepository } from '../repositories/session.repository';
import type { TokenService } from './token.service';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthRefreshTokenClaims,
  type AuthTokenPair,
  type AuthTokenString,
} from '../types/auth-token.type';

const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;
const TEST_REFRESH_TOKEN = 'test.refresh.token' as AuthTokenString;
const TEST_NEXT_ACCESS_TOKEN = 'test.next-access.token' as AuthTokenString;
const TEST_NEXT_REFRESH_TOKEN = 'test.next-refresh.token' as AuthTokenString;

const TEST_NOW = new Date('2026-05-09T12:00:00.000Z');
const TEST_SESSION_EXPIRES_AT = new Date('2026-06-08T12:00:00.000Z');
const TEST_ACCESS_EXPIRES_AT = '2026-05-09T12:15:00.000Z';
const TEST_REFRESH_EXPIRES_AT = '2026-06-08T12:00:00.000Z';

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_SESSION_ID = 'session_123';

type MockSessionRepository = {
  createAndFlush: ReturnType<typeof vi.fn>;
  rotateRefreshToken: ReturnType<typeof vi.fn>;
  updateSession: ReturnType<typeof vi.fn>;
  findActiveByRefreshTokenHash: ReturnType<typeof vi.fn>;
  findActiveById: ReturnType<typeof vi.fn>;
  revokeSession: ReturnType<typeof vi.fn>;
  revokeByRefreshTokenHash: ReturnType<typeof vi.fn>;
  revokeUserSessions: ReturnType<typeof vi.fn>;
  findByUserId: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  touchSession: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  isRevoked: ReturnType<typeof vi.fn>;
};

type MockTokenService = {
  issueTokenPair: ReturnType<typeof vi.fn>;
  issueAccessToken: ReturnType<typeof vi.fn>;
  assertAccessToken: ReturnType<typeof vi.fn>;
  assertRefreshToken: ReturnType<typeof vi.fn>;
};

const TEST_SESSION_CONFIG: SessionServiceConfig = {
  sessionTtlSeconds: 2_592_000,
  refreshTokenRotationEnabled: true,
};

const createTestUser = (): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: 'sinless777@example.com',
  } as unknown as User;
};

const createTestSession = (
  overrides: Partial<Record<string, unknown>> = {},
): UserSession => {
  return {
    id: TEST_SESSION_ID,
    user: {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
    },
    sessionToken: 'persisted-refresh-token-hash',
    deviceName: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    lastSeenAt: TEST_NOW,
    expires: TEST_SESSION_EXPIRES_AT,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  } as unknown as UserSession;
};

const createAccessClaims = (
  overrides: Partial<AuthAccessTokenClaims> = {},
): AuthAccessTokenClaims => {
  return {
    id: 'access_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.ACCESS,
    scopes: [
      AUTH_TOKEN_SCOPE.AUTH_READ,
      AUTH_TOKEN_SCOPE.USER_READ,
      AUTH_TOKEN_SCOPE.SESSION_READ,
    ],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_777_980_900,
    ...overrides,
  };
};

const createRefreshClaims = (
  overrides: Partial<AuthRefreshTokenClaims> = {},
): AuthRefreshTokenClaims => {
  return {
    id: 'refresh_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.REFRESH,
    scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE, AUTH_TOKEN_SCOPE.SESSION_WRITE],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_780_572_000,
    ...overrides,
  };
};

const createTokenPair = (
  overrides: Partial<AuthTokenPair> = {},
): AuthTokenPair => {
  return {
    accessToken: TEST_ACCESS_TOKEN,
    refreshToken: TEST_REFRESH_TOKEN,
    accessTokenExpiresAt: TEST_ACCESS_EXPIRES_AT,
    refreshTokenExpiresAt: TEST_REFRESH_EXPIRES_AT,
    tokenType: 'Bearer',
    ...overrides,
  };
};

const createMockRepository = (): MockSessionRepository => {
  return {
    createAndFlush: vi.fn(async (input) => {
      return createTestSession({
        user: input.user,
        sessionToken: input.refreshTokenHash,
        expires: input.expiresAt,
        deviceName: input.deviceName,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        lastSeenAt: input.lastSeenAt,
      });
    }),

    rotateRefreshToken: vi.fn(
      async (sessionId, refreshTokenHash, expiresAt) => {
        return createTestSession({
          id: sessionId,
          sessionToken: refreshTokenHash,
          expires: expiresAt,
          updatedAt: TEST_NOW,
        });
      },
    ),

    updateSession: vi.fn(async (sessionId, input) => {
      return createTestSession({
        id: sessionId,
        ...(input.refreshTokenHash === undefined
          ? {}
          : { sessionToken: input.refreshTokenHash }),
        ...(input.deviceName === undefined
          ? {}
          : { deviceName: input.deviceName }),
        ...(input.userAgent === undefined
          ? {}
          : { userAgent: input.userAgent }),
        ...(input.ipAddress === undefined
          ? {}
          : { ipAddress: input.ipAddress }),
        ...(input.lastSeenAt === undefined
          ? {}
          : { lastSeenAt: input.lastSeenAt }),
        ...(input.expiresAt === undefined ? {} : { expires: input.expiresAt }),
        updatedAt: TEST_NOW,
      });
    }),

    findActiveByRefreshTokenHash: vi.fn(async () => {
      return createTestSession();
    }),

    findActiveById: vi.fn(async () => {
      return createTestSession();
    }),

    revokeSession: vi.fn(async ({ sessionId, revokedAt }) => {
      return createTestSession({
        id: sessionId,
        expires: revokedAt,
        updatedAt: revokedAt,
      });
    }),

    revokeByRefreshTokenHash: vi.fn(async () => {
      return createTestSession({
        expires: TEST_NOW,
        updatedAt: TEST_NOW,
      });
    }),

    revokeUserSessions: vi.fn(async () => {
      return 2;
    }),

    findByUserId: vi.fn(async () => {
      return [createTestSession()];
    }),

    findById: vi.fn(async () => {
      return createTestSession();
    }),

    touchSession: vi.fn(async (sessionId) => {
      return createTestSession({
        id: sessionId,
        lastSeenAt: TEST_NOW,
        updatedAt: TEST_NOW,
      });
    }),

    deleteSession: vi.fn(async () => {
      return true;
    }),

    isRevoked: vi.fn((session: UserSession) => {
      return session.expires.getTime() <= Date.now();
    }),
  };
};

const createMockTokenService = (): MockTokenService => {
  const accessClaims = createAccessClaims();
  const refreshClaims = createRefreshClaims();

  return {
    issueTokenPair: vi.fn(async () => {
      return createTokenPair();
    }),

    issueAccessToken: vi.fn(async () => {
      return TEST_NEXT_ACCESS_TOKEN;
    }),

    assertAccessToken: vi.fn(async (token: AuthTokenString) => {
      if (token === TEST_NEXT_ACCESS_TOKEN) {
        return createAccessClaims({
          id: 'next_access_jti_123',
        });
      }

      return accessClaims;
    }),

    assertRefreshToken: vi.fn(async () => {
      return refreshClaims;
    }),
  };
};

const createTestSessionService = ({
  repository = createMockRepository(),
  tokenService = createMockTokenService(),
  config = {},
}: {
  repository?: MockSessionRepository;
  tokenService?: MockTokenService;
  config?: Partial<SessionServiceConfig>;
} = {}) => {
  const service = createSessionService({
    repository: repository as unknown as SessionRepository,
    tokenService: tokenService as unknown as TokenService,
    config: {
      ...TEST_SESSION_CONFIG,
      ...config,
    },
  });

  return {
    service,
    repository,
    tokenService,
  };
};

describe('SessionService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('creates a session, issues a token pair, stores the refresh token hash, and returns a response', async () => {
      const user = createTestUser();
      const { service, repository, tokenService } = createTestSessionService();

      const result = await service.createSession({
        user,
        username: TEST_USERNAME,
        deviceName: 'Firefox on Linux',
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      });

      expect(repository.createAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          deviceName: 'Firefox on Linux',
          userAgent: 'Mozilla/5.0',
          ipAddress: '127.0.0.1',
        }),
      );

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        sessionId: TEST_SESSION_ID,
        scopes: undefined,
      });

      expect(tokenService.assertRefreshToken).toHaveBeenCalledWith(
        TEST_REFRESH_TOKEN,
      );
      expect(tokenService.assertAccessToken).toHaveBeenCalledWith(
        TEST_ACCESS_TOKEN,
      );

      expect(repository.rotateRefreshToken).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.any(String),
        new Date(TEST_REFRESH_EXPIRES_AT),
      );

      const rotateCall = repository.rotateRefreshToken.mock.calls[0];

      expect(rotateCall?.[1]).not.toBe(TEST_REFRESH_TOKEN);

      expect(result).toMatchObject({
        session: {
          id: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          deviceName: 'Firefox on Linux',
          userAgent: 'Mozilla/5.0',
          ipAddress: '127.0.0.1',
          expiresAt: TEST_REFRESH_EXPIRES_AT,
        },
        tokens: {
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
          tokenType: 'Bearer',
        },
        accessClaims: {
          type: AUTH_TOKEN_TYPE.ACCESS,
          sessionId: TEST_SESSION_ID,
        },
        refreshClaims: {
          type: AUTH_TOKEN_TYPE.REFRESH,
          sessionId: TEST_SESSION_ID,
        },
      });
    });

    it('uses the provided session expiration when passed', async () => {
      const user = createTestUser();
      const { service, repository } = createTestSessionService();
      const expiresAt = new Date('2026-07-01T00:00:00.000Z');

      await service.createSession({
        user,
        username: TEST_USERNAME,
        expiresAt,
      });

      expect(repository.createAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt,
        }),
      );
    });
  });

  describe('refreshSession', () => {
    it('refreshes a session with rotation enabled', async () => {
      const repository = createMockRepository();
      const tokenService = createMockTokenService();
      const { service } = createTestSessionService({
        repository,
        tokenService,
      });

      const refreshTokenHash =
        await service.hashRefreshToken(TEST_REFRESH_TOKEN);

      repository.findActiveByRefreshTokenHash.mockResolvedValueOnce(
        createTestSession({
          sessionToken: refreshTokenHash,
        }),
      );

      tokenService.issueTokenPair.mockResolvedValueOnce(
        createTokenPair({
          accessToken: TEST_NEXT_ACCESS_TOKEN,
          refreshToken: TEST_NEXT_REFRESH_TOKEN,
          accessTokenExpiresAt: '2026-05-09T12:20:00.000Z',
          refreshTokenExpiresAt: '2026-06-09T12:00:00.000Z',
        }),
      );

      tokenService.assertAccessToken.mockResolvedValueOnce(
        createAccessClaims({
          id: 'next_access_jti_123',
        }),
      );
      tokenService.assertRefreshToken
        .mockResolvedValueOnce(createRefreshClaims())
        .mockResolvedValueOnce(
          createRefreshClaims({
            id: 'next_refresh_jti_123',
          }),
        );

      const result = await service.refreshSession({
        refreshToken: TEST_REFRESH_TOKEN,
      });

      expect(repository.findActiveByRefreshTokenHash).toHaveBeenCalledWith(
        refreshTokenHash,
      );

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        sessionId: TEST_SESSION_ID,
        scopes: undefined,
      });

      expect(repository.updateSession).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({
          refreshTokenHash: expect.any(String),
          expiresAt: new Date('2026-06-09T12:00:00.000Z'),
          lastSeenAt: expect.any(Date),
        }),
      );

      expect(result.tokens.refreshToken).toBe(TEST_NEXT_REFRESH_TOKEN);
      expect(result.refreshClaims.id).toBe('next_refresh_jti_123');
    });

    it('refreshes a session without rotation when rotate is false', async () => {
      const repository = createMockRepository();
      const tokenService = createMockTokenService();
      const { service } = createTestSessionService({
        repository,
        tokenService,
      });

      const refreshTokenHash =
        await service.hashRefreshToken(TEST_REFRESH_TOKEN);

      repository.findActiveByRefreshTokenHash.mockResolvedValueOnce(
        createTestSession({
          sessionToken: refreshTokenHash,
        }),
      );

      const result = await service.refreshSession({
        refreshToken: TEST_REFRESH_TOKEN,
        rotate: false,
      });

      expect(tokenService.issueAccessToken).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        sessionId: TEST_SESSION_ID,
        scopes: undefined,
      });

      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();

      expect(repository.updateSession).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.not.objectContaining({
          refreshTokenHash: expect.any(String),
        }),
      );

      expect(result.tokens.refreshToken).toBe(TEST_REFRESH_TOKEN);
      expect(result.tokens.accessToken).toBe(TEST_NEXT_ACCESS_TOKEN);
    });

    it('uses sessionId lookup when a session id is provided', async () => {
      const repository = createMockRepository();
      const { service } = createTestSessionService({
        repository,
      });

      const refreshTokenHash =
        await service.hashRefreshToken(TEST_REFRESH_TOKEN);

      repository.findActiveById.mockResolvedValueOnce(
        createTestSession({
          sessionToken: refreshTokenHash,
        }),
      );

      await service.refreshSession({
        refreshToken: TEST_REFRESH_TOKEN,
        sessionId: TEST_SESSION_ID,
      });

      expect(repository.findActiveById).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(repository.findActiveByRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('throws when the provided session id does not match refresh token claims', async () => {
      const tokenService = createMockTokenService();

      tokenService.assertRefreshToken.mockResolvedValueOnce(
        createRefreshClaims({
          sessionId: 'different_session',
        }),
      );

      const { service } = createTestSessionService({
        tokenService,
      });

      await expect(
        service.refreshSession({
          refreshToken: TEST_REFRESH_TOKEN,
          sessionId: TEST_SESSION_ID,
        }),
      ).rejects.toThrow();
    });

    it('throws when no active session exists', async () => {
      const repository = createMockRepository();

      repository.findActiveByRefreshTokenHash.mockResolvedValueOnce(null);

      const { service } = createTestSessionService({
        repository,
      });

      await expect(
        service.refreshSession({
          refreshToken: TEST_REFRESH_TOKEN,
        }),
      ).rejects.toThrow();
    });

    it('throws when the persisted refresh token hash does not match the provided refresh token', async () => {
      const repository = createMockRepository();

      repository.findActiveByRefreshTokenHash.mockResolvedValueOnce(
        createTestSession({
          sessionToken: 'different-refresh-token-hash',
        }),
      );

      const { service } = createTestSessionService({
        repository,
      });

      await expect(
        service.refreshSession({
          refreshToken: TEST_REFRESH_TOKEN,
        }),
      ).rejects.toThrow();
    });
  });

  describe('revokeCurrentSession', () => {
    it('revokes the current session by session id', async () => {
      const { service, repository } = createTestSessionService();
      const revokedAt = new Date('2026-05-09T13:00:00.000Z');

      const result = await service.revokeCurrentSession({
        sessionId: TEST_SESSION_ID,
        revokedAt,
      });

      expect(repository.revokeSession).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        revokedAt,
      });

      expect(result).toEqual({
        revoked: true,
        sessionId: TEST_SESSION_ID,
        revokedAt: revokedAt.toISOString(),
      });
    });

    it('revokes the current session by refresh token', async () => {
      const { service, repository } = createTestSessionService();
      const revokedAt = new Date('2026-05-09T13:00:00.000Z');

      const refreshTokenHash =
        await service.hashRefreshToken(TEST_REFRESH_TOKEN);

      const result = await service.revokeCurrentSession({
        refreshToken: TEST_REFRESH_TOKEN,
        revokedAt,
      });

      expect(repository.revokeByRefreshTokenHash).toHaveBeenCalledWith(
        refreshTokenHash,
        revokedAt,
      );

      expect(result).toMatchObject({
        revoked: true,
        sessionId: TEST_SESSION_ID,
        revokedAt: revokedAt.toISOString(),
      });
    });

    it('throws when neither session id nor refresh token is provided', async () => {
      const { service } = createTestSessionService();

      await expect(service.revokeCurrentSession({})).rejects.toThrow();
    });
  });

  describe('session lookup and mutation helpers', () => {
    it('lists user sessions', async () => {
      const { service, repository } = createTestSessionService();

      const result = await service.listUserSessions(TEST_USER_ID, {
        includeExpired: true,
        includeRevoked: true,
      });

      expect(repository.findByUserId).toHaveBeenCalledWith(TEST_USER_ID, {
        includeExpired: true,
        includeRevoked: true,
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
      });
    });

    it('gets a session by id', async () => {
      const { service, repository } = createTestSessionService();

      const result = await service.getSession(TEST_SESSION_ID);

      expect(repository.findById).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(result).toMatchObject({
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
      });
    });

    it('throws when getSession cannot find a session', async () => {
      const repository = createMockRepository();

      repository.findById.mockResolvedValueOnce(null);

      const { service } = createTestSessionService({
        repository,
      });

      await expect(service.getSession(TEST_SESSION_ID)).rejects.toThrow();
    });

    it('gets an active session by id', async () => {
      const { service, repository } = createTestSessionService();

      const result = await service.getActiveSession(TEST_SESSION_ID);

      expect(repository.findActiveById).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(result).toMatchObject({
        id: TEST_SESSION_ID,
      });
    });

    it('throws when getActiveSession cannot find an active session', async () => {
      const repository = createMockRepository();

      repository.findActiveById.mockResolvedValueOnce(null);

      const { service } = createTestSessionService({
        repository,
      });

      await expect(service.getActiveSession(TEST_SESSION_ID)).rejects.toThrow();
    });

    it('touches a session', async () => {
      const { service, repository } = createTestSessionService();

      const result = await service.touchSession(TEST_SESSION_ID);

      expect(repository.touchSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(result).toMatchObject({
        id: TEST_SESSION_ID,
      });
    });

    it('throws when touchSession cannot find a session', async () => {
      const repository = createMockRepository();

      repository.touchSession.mockResolvedValueOnce(null);

      const { service } = createTestSessionService({
        repository,
      });

      await expect(service.touchSession(TEST_SESSION_ID)).rejects.toThrow();
    });

    it('deletes a session', async () => {
      const { service, repository } = createTestSessionService();

      await expect(service.deleteSession(TEST_SESSION_ID)).resolves.toBe(true);

      expect(repository.deleteSession).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it('revokes all user sessions', async () => {
      const { service, repository } = createTestSessionService();
      const revokedAt = new Date('2026-05-09T13:00:00.000Z');

      await expect(
        service.revokeUserSessions({
          userId: TEST_USER_ID,
          exceptSessionId: TEST_SESSION_ID,
          revokedAt,
        }),
      ).resolves.toBe(2);

      expect(repository.revokeUserSessions).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        exceptSessionId: TEST_SESSION_ID,
        revokedAt,
      });
    });
  });

  describe('hashRefreshToken', () => {
    it('hashes refresh tokens deterministically', async () => {
      const { service } = createTestSessionService();

      const firstHash = await service.hashRefreshToken(TEST_REFRESH_TOKEN);
      const secondHash = await service.hashRefreshToken(TEST_REFRESH_TOKEN);

      expect(firstHash).toBe(secondHash);
      expect(firstHash).not.toBe(TEST_REFRESH_TOKEN);
      expect(firstHash.length).toBeGreaterThan(20);
    });

    it('produces different hashes for different refresh tokens', async () => {
      const { service } = createTestSessionService();

      const firstHash = await service.hashRefreshToken(TEST_REFRESH_TOKEN);
      const secondHash = await service.hashRefreshToken(
        TEST_NEXT_REFRESH_TOKEN,
      );

      expect(firstHash).not.toBe(secondHash);
    });
  });

  describe('toSessionResponse', () => {
    it('maps a UserSession entity-like object to an API response', () => {
      const { service } = createTestSessionService();

      const response = service.toSessionResponse(createTestSession());

      expect(response).toEqual({
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        deviceName: 'Firefox on Linux',
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
        createdAt: TEST_NOW.toISOString(),
        updatedAt: TEST_NOW.toISOString(),
        lastSeenAt: TEST_NOW.toISOString(),
        expiresAt: TEST_SESSION_EXPIRES_AT.toISOString(),
        revokedAt: null,
      });
    });

    it('returns null-ish optional string values as null', () => {
      const { service } = createTestSessionService();

      const response = service.toSessionResponse(
        createTestSession({
          deviceName: undefined,
          userAgent: undefined,
          ipAddress: undefined,
          lastSeenAt: null,
        }),
      );

      expect(response).toMatchObject({
        deviceName: null,
        userAgent: null,
        ipAddress: null,
        lastSeenAt: null,
      });
    });

    it('uses the expiration timestamp as revokedAt when repository marks the session revoked', () => {
      const repository = createMockRepository();

      repository.isRevoked.mockReturnValueOnce(true);

      const { service } = createTestSessionService({
        repository,
      });

      const response = service.toSessionResponse(createTestSession());

      expect(response.revokedAt).toBe(TEST_SESSION_EXPIRES_AT.toISOString());
    });
  });
});
