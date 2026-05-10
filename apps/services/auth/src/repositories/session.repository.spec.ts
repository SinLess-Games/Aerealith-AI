import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityManager } from '@mikro-orm/core';
import type { User, UserSession } from '@helix-ai/db';
import { UserSession as UserSessionEntity } from '@helix-ai/db';

import { createSessionRepository } from './session.repository';

type SessionRepository = ReturnType<typeof createSessionRepository>;

type CreateSessionInput = Parameters<SessionRepository['createAndFlush']>[0];

type UpdateSessionInput = Parameters<SessionRepository['updateSession']>[1];

type RevokeSessionInput = Parameters<SessionRepository['revokeSession']>[0];

type RevokeUserSessionsInput = Parameters<
  SessionRepository['revokeUserSessions']
>[0];

type FindByUserIdOptions = NonNullable<
  Parameters<SessionRepository['findByUserId']>[1]
>;

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_SESSION_ID = 'session_123';
const TEST_REFRESH_TOKEN_HASH = 'hashed-refresh-token-value';
const TEST_NEXT_REFRESH_TOKEN_HASH = 'next-hashed-refresh-token-value';

const TEST_CREATED_AT = new Date('2026-05-09T12:00:00.000Z');
const TEST_UPDATED_AT = new Date('2026-05-09T12:30:00.000Z');
const TEST_LAST_SEEN_AT = new Date('2026-05-09T12:45:00.000Z');
const TEST_EXPIRES_AT = new Date('2026-06-08T12:00:00.000Z');
const TEST_NEXT_EXPIRES_AT = new Date('2026-07-08T12:00:00.000Z');
const TEST_REVOKED_AT = new Date('2026-05-09T13:00:00.000Z');
const TEST_EXPIRED_AT = new Date('2020-01-01T00:00:00.000Z');

type MockEntityManager = {
  create: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  removeAndFlush: ReturnType<typeof vi.fn>;
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: 'sinless777@example.com',
    displayName: 'Sinless777',
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as User;
};

const createTestSession = (
  overrides: Partial<Record<string, unknown>> = {},
): UserSession => {
  return {
    id: TEST_SESSION_ID,
    user: createTestUser(),
    sessionToken: TEST_REFRESH_TOKEN_HASH,
    deviceName: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    lastSeenAt: TEST_LAST_SEEN_AT,
    expires: TEST_EXPIRES_AT,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as UserSession;
};

const createInput = (
  overrides: Partial<CreateSessionInput> = {},
): CreateSessionInput => {
  return {
    user: createTestUser(),
    refreshTokenHash: TEST_REFRESH_TOKEN_HASH,
    expiresAt: TEST_EXPIRES_AT,
    deviceName: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    lastSeenAt: TEST_LAST_SEEN_AT,
    ...overrides,
  } as CreateSessionInput;
};

const createMockEntityManager = (): MockEntityManager => {
  return {
    create: vi.fn((_entity, data: Record<string, unknown>) => {
      return createTestSession({
        user: data.user,
        sessionToken: data.sessionToken,
        deviceName: data.deviceName,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        lastSeenAt: data.lastSeenAt,
        expires: data.expires,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }),

    findOne: vi.fn(async () => createTestSession()),

    find: vi.fn(async () => [createTestSession()]),

    assign: vi.fn((entity: UserSession, data: Record<string, unknown>) => {
      Object.assign(entity as unknown as Record<string, unknown>, data);

      return entity;
    }),

    persist: vi.fn(() => undefined),

    flush: vi.fn(async () => undefined),

    removeAndFlush: vi.fn(async () => undefined),
  };
};

const createRepository = (em = createMockEntityManager()) => {
  return {
    repository: createSessionRepository(em as unknown as EntityManager),
    em,
  };
};

describe('SessionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAndFlush', () => {
    it('creates and persists a user session using entity field names', async () => {
      const { repository, em } = createRepository();
      const input = createInput();

      const result = await repository.createAndFlush(input);

      expect(em.create).toHaveBeenCalledWith(
        UserSessionEntity,
        expect.objectContaining({
          user: input.user,
          sessionToken: TEST_REFRESH_TOKEN_HASH,
          deviceName: 'Firefox on Linux',
          userAgent: 'Mozilla/5.0',
          ipAddress: '127.0.0.1',
          lastSeenAt: TEST_LAST_SEEN_AT,
          expires: TEST_EXPIRES_AT,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.persist).toHaveBeenCalledWith(result);
      expect(em.flush).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        sessionToken: TEST_REFRESH_TOKEN_HASH,
        deviceName: 'Firefox on Linux',
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
        lastSeenAt: TEST_LAST_SEEN_AT,
        expires: TEST_EXPIRES_AT,
      });
    });

    it('allows optional metadata fields to be omitted', async () => {
      const { repository, em } = createRepository();

      const result = await repository.createAndFlush(
        createInput({
          deviceName: undefined,
          userAgent: undefined,
          ipAddress: undefined,
          lastSeenAt: undefined,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserSessionEntity,
        expect.objectContaining({
          user: expect.any(Object),
          sessionToken: TEST_REFRESH_TOKEN_HASH,
          expires: TEST_EXPIRES_AT,
        }),
      );

      expect(em.persist).toHaveBeenCalledWith(result);
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('finds a session by id', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findById(TEST_SESSION_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(result).toMatchObject({
        id: TEST_SESSION_ID,
        sessionToken: TEST_REFRESH_TOKEN_HASH,
      });
    });

    it('returns null when no session exists for the id', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(repository.findById(TEST_SESSION_ID)).resolves.toBeNull();
    });
  });

  describe('findActiveById', () => {
    it('finds an active session by id', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findActiveById(TEST_SESSION_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
        expires: expect.objectContaining({
          $gt: expect.any(Date),
        }),
      });

      expect(result).toMatchObject({
        id: TEST_SESSION_ID,
      });
    });

    it('returns null when no active session exists for the id', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findActiveById(TEST_SESSION_ID),
      ).resolves.toBeNull();
    });
  });

  describe('findActiveByRefreshTokenHash', () => {
    it('finds an active session by refresh token hash', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findActiveByRefreshTokenHash(
        TEST_REFRESH_TOKEN_HASH,
      );

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        sessionToken: TEST_REFRESH_TOKEN_HASH,
        expires: expect.objectContaining({
          $gt: expect.any(Date),
        }),
      });

      expect(result).toMatchObject({
        sessionToken: TEST_REFRESH_TOKEN_HASH,
      });
    });

    it('returns null when no active refresh token hash exists', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findActiveByRefreshTokenHash(TEST_REFRESH_TOKEN_HASH),
      ).resolves.toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('finds active sessions for a user by default', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByUserId(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserSessionEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
        expect.any(Object),
      );

      expect(result).toHaveLength(1);
    });

    it('honors includeExpired and includeRevoked by omitting the active expires filter', async () => {
      const { repository, em } = createRepository();

      const options: FindByUserIdOptions = {
        includeExpired: true,
        includeRevoked: true,
      };

      await repository.findByUserId(TEST_USER_ID, options);

      const where = em.find.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(where.user).toBe(TEST_USER_ID);
      expect(where.expires).toBeUndefined();
    });

    it('keeps active-only filtering when includeExpired is false', async () => {
      const { repository, em } = createRepository();

      await repository.findByUserId(TEST_USER_ID, {
        includeExpired: false,
        includeRevoked: false,
      });

      expect(em.find).toHaveBeenCalledWith(
        UserSessionEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('updateSession', () => {
    it('updates mutable session fields and flushes the change', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const input: UpdateSessionInput = {
        refreshTokenHash: TEST_NEXT_REFRESH_TOKEN_HASH,
        expiresAt: TEST_NEXT_EXPIRES_AT,
        deviceName: 'Chromium on Linux',
        userAgent: 'Vitest Agent',
        ipAddress: '192.0.2.10',
        lastSeenAt: TEST_LAST_SEEN_AT,
      } as UpdateSessionInput;

      const result = await repository.updateSession(TEST_SESSION_ID, input);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          sessionToken: TEST_NEXT_REFRESH_TOKEN_HASH,
          expires: TEST_NEXT_EXPIRES_AT,
          deviceName: 'Chromium on Linux',
          userAgent: 'Vitest Agent',
          ipAddress: '192.0.2.10',
          lastSeenAt: TEST_LAST_SEEN_AT,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(session);
      expect(result).toMatchObject({
        sessionToken: TEST_NEXT_REFRESH_TOKEN_HASH,
        expires: TEST_NEXT_EXPIRES_AT,
      });
    });

    it('does not overwrite fields that are not provided', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      await repository.updateSession(TEST_SESSION_ID, {
        lastSeenAt: TEST_LAST_SEEN_AT,
      } as UpdateSessionInput);

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.not.objectContaining({
          sessionToken: expect.any(String),
          expires: expect.any(Date),
          deviceName: expect.any(String),
          userAgent: expect.any(String),
          ipAddress: expect.any(String),
        }),
      );

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          lastSeenAt: TEST_LAST_SEEN_AT,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('returns null when the session cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.updateSession(TEST_SESSION_ID, {
        lastSeenAt: TEST_LAST_SEEN_AT,
      } as UpdateSessionInput);

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('rotateRefreshToken', () => {
    it('updates the refresh token hash and expiration timestamp', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const result = await repository.rotateRefreshToken(
        TEST_SESSION_ID,
        TEST_NEXT_REFRESH_TOKEN_HASH,
        TEST_NEXT_EXPIRES_AT,
      );

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          sessionToken: TEST_NEXT_REFRESH_TOKEN_HASH,
          expires: TEST_NEXT_EXPIRES_AT,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(session);
      expect(result).toMatchObject({
        sessionToken: TEST_NEXT_REFRESH_TOKEN_HASH,
        expires: TEST_NEXT_EXPIRES_AT,
      });
    });

    it('returns null when the session cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.rotateRefreshToken(
        TEST_SESSION_ID,
        TEST_NEXT_REFRESH_TOKEN_HASH,
        TEST_NEXT_EXPIRES_AT,
      );

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('touchSession', () => {
    it('updates lastSeenAt and updatedAt for an existing session', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const result = await repository.touchSession(TEST_SESSION_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          lastSeenAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(session);
    });

    it('returns null when the session cannot be touched', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.touchSession(TEST_SESSION_ID);

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('revokes a session by setting expires to revokedAt', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const input: RevokeSessionInput = {
        sessionId: TEST_SESSION_ID,
        revokedAt: TEST_REVOKED_AT,
      } as RevokeSessionInput;

      const result = await repository.revokeSession(input);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          expires: TEST_REVOKED_AT,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(session);
      expect(result).toMatchObject({
        expires: TEST_REVOKED_AT,
      });
    });

    it('uses the current time when revokedAt is omitted', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      await repository.revokeSession({
        sessionId: TEST_SESSION_ID,
      } as RevokeSessionInput);

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          expires: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('returns null when the session cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.revokeSession({
        sessionId: TEST_SESSION_ID,
        revokedAt: TEST_REVOKED_AT,
      } as RevokeSessionInput);

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('revokeByRefreshTokenHash', () => {
    it('revokes an active session by refresh token hash', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session).mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const result = await repository.revokeByRefreshTokenHash(
        TEST_REFRESH_TOKEN_HASH,
        TEST_REVOKED_AT,
      );

      expect(em.findOne).toHaveBeenNthCalledWith(1, UserSessionEntity, {
        sessionToken: TEST_REFRESH_TOKEN_HASH,
      });

      expect(em.findOne).toHaveBeenNthCalledWith(2, UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        session,
        expect.objectContaining({
          expires: TEST_REVOKED_AT,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(session);
    });

    it('returns null when no active session has the refresh token hash', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.revokeByRefreshTokenHash(
        TEST_REFRESH_TOKEN_HASH,
      );

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('revokeUserSessions', () => {
    it('revokes all active user sessions', async () => {
      const first = createTestSession({
        id: 'session_1',
      });
      const second = createTestSession({
        id: 'session_2',
      });
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([first, second]);

      const { repository } = createRepository(em);

      const input: RevokeUserSessionsInput = {
        userId: TEST_USER_ID,
        revokedAt: TEST_REVOKED_AT,
      } as RevokeUserSessionsInput;

      const result = await repository.revokeUserSessions(input);

      expect(em.find).toHaveBeenCalledWith(UserSessionEntity, {
        user: TEST_USER_ID,
        expires: expect.objectContaining({
          $gt: expect.any(Date),
        }),
      });

      expect(em.assign).toHaveBeenCalledTimes(2);
      expect(em.assign).toHaveBeenNthCalledWith(
        1,
        first,
        expect.objectContaining({
          expires: TEST_REVOKED_AT,
          updatedAt: TEST_REVOKED_AT,
        }),
      );
      expect(em.assign).toHaveBeenNthCalledWith(
        2,
        second,
        expect.objectContaining({
          expires: TEST_REVOKED_AT,
          updatedAt: TEST_REVOKED_AT,
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(2);
    });

    it('excludes the provided session id when exceptSessionId is set', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([createTestSession()]);

      const { repository } = createRepository(em);

      await repository.revokeUserSessions({
        userId: TEST_USER_ID,
        exceptSessionId: TEST_SESSION_ID,
        revokedAt: TEST_REVOKED_AT,
      } as RevokeUserSessionsInput);

      expect(em.find).toHaveBeenCalledWith(UserSessionEntity, {
        user: TEST_USER_ID,
        id: expect.objectContaining({
          $ne: TEST_SESSION_ID,
        }),
        expires: expect.objectContaining({
          $gt: expect.any(Date),
        }),
      });
    });

    it('returns zero and still flushes when no sessions are found', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([]);

      const { repository } = createRepository(em);

      const result = await repository.revokeUserSessions({
        userId: TEST_USER_ID,
        revokedAt: TEST_REVOKED_AT,
      } as RevokeUserSessionsInput);

      expect(result).toBe(0);
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteSession', () => {
    it('deletes a session by id', async () => {
      const session = createTestSession();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(session);

      const { repository } = createRepository(em);

      const result = await repository.deleteSession(TEST_SESSION_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserSessionEntity, {
        id: TEST_SESSION_ID,
      });

      expect(em.removeAndFlush).toHaveBeenCalledWith(session);
      expect(result).toBe(true);
    });

    it('returns false when the session cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.deleteSession(TEST_SESSION_ID);

      expect(result).toBe(false);
      expect(em.removeAndFlush).not.toHaveBeenCalled();
    });
  });

  describe('isRevoked', () => {
    it('returns false when session expires in the future', () => {
      const { repository } = createRepository();

      expect(
        repository.isRevoked(
          createTestSession({
            expires: TEST_EXPIRES_AT,
          }),
        ),
      ).toBe(false);
    });

    it('returns true when session expires in the past', () => {
      const { repository } = createRepository();

      expect(
        repository.isRevoked(
          createTestSession({
            expires: TEST_EXPIRED_AT,
          }),
        ),
      ).toBe(true);
    });
  });
});
