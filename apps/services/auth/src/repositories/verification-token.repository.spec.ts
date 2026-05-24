import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityManager } from '@mikro-orm/core';
import type { User, UserVerificationToken } from '@aerealith-ai/db';
import { UserVerificationToken as UserVerificationTokenEntity } from '@aerealith-ai/db';
import { AuthVerificationSchemas } from '@aerealith-ai/contracts';

import {
  createVerificationTokenRepository,
  type CreateVerificationTokenInput,
} from './verification-token.repository';

const { AUTH_VERIFICATION_TOKEN_TYPE } = AuthVerificationSchemas;

type VerificationTokenRepository = ReturnType<
  typeof createVerificationTokenRepository
>;

type VerificationTokenFindByUserIdOptions = NonNullable<
  Parameters<VerificationTokenRepository['findByUserId']>[1]
>;

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_TOKEN_ID = 'verification_token_123';
const TEST_TOKEN_HASH = 'hashed-verification-token-value';
const TEST_NEXT_TOKEN_HASH = 'next-hashed-verification-token-value';

const TEST_NOW = new Date('2026-05-09T12:00:00.000Z');
const TEST_EXPIRES_AT = new Date('2026-05-10T12:00:00.000Z');
const TEST_CONSUMED_AT = new Date('2026-05-09T13:00:00.000Z');

type MockEntityManager = {
  create: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  persistAndFlush: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  removeAndFlush: ReturnType<typeof vi.fn>;
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    ...overrides,
  } as unknown as User;
};

const createVerificationToken = (
  overrides: Partial<Record<string, unknown>> = {},
): UserVerificationToken => {
  return {
    id: TEST_TOKEN_ID,
    user: createTestUser(),
    identifier: TEST_EMAIL,
    token: TEST_TOKEN_HASH,
    purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    expires: TEST_EXPIRES_AT,
    consumedAt: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  } as unknown as UserVerificationToken;
};

const createInput = (
  overrides: Partial<CreateVerificationTokenInput> = {},
): CreateVerificationTokenInput => {
  return {
    user: createTestUser(),
    tokenHash: TEST_TOKEN_HASH,
    type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    identifier: TEST_EMAIL,
    expiresAt: TEST_EXPIRES_AT,
    ...overrides,
  };
};

const createMockEntityManager = (): MockEntityManager => {
  return {
    create: vi.fn((_entity, data: Record<string, unknown>) => {
      return createVerificationToken({
        user: data.user,
        identifier: data.identifier,
        token: data.token,
        purpose: data.purpose,
        expires: data.expires,
        consumedAt: data.consumedAt ?? null,
        createdAt: data.createdAt ?? TEST_NOW,
        updatedAt: data.updatedAt ?? TEST_NOW,
      });
    }),

    findOne: vi.fn(async () => createVerificationToken()),

    find: vi.fn(async () => [createVerificationToken()]),

    assign: vi.fn(
      (entity: UserVerificationToken, data: Record<string, unknown>) => {
        Object.assign(entity as unknown as Record<string, unknown>, data);

        return entity;
      },
    ),

    persist: vi.fn(() => undefined),

    persistAndFlush: vi.fn(async () => undefined),

    flush: vi.fn(async () => undefined),

    removeAndFlush: vi.fn(async () => undefined),
  };
};

const createRepository = (em = createMockEntityManager()) => {
  return {
    repository: createVerificationTokenRepository(
      em as unknown as EntityManager,
    ),
    em,
  };
};

describe('VerificationTokenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAndFlush', () => {
    it('creates and persists a verification token using entity field names', async () => {
      const { repository, em } = createRepository();
      const input = createInput();

      const result = await repository.createAndFlush(input);

      expect(em.create).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: input.user,
          identifier: TEST_EMAIL,
          token: TEST_TOKEN_HASH,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          expires: TEST_EXPIRES_AT,
          consumedAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.persist).toHaveBeenCalledWith(result);
      expect(em.flush).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        identifier: TEST_EMAIL,
        token: TEST_TOKEN_HASH,
        purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        expires: TEST_EXPIRES_AT,
        consumedAt: null,
      });
    });

    it('supports password reset token creation', async () => {
      const { repository, em } = createRepository();

      await repository.createAndFlush(
        createInput({
          tokenHash: TEST_NEXT_TOKEN_HASH,
          type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          token: TEST_NEXT_TOKEN_HASH,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        }),
      );
    });
  });

  describe('findActiveByTokenHash', () => {
    it('finds an active token by hash and type', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findActiveByTokenHash(
        TEST_TOKEN_HASH,
        AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(em.findOne).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          token: TEST_TOKEN_HASH,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      expect(result).toMatchObject({
        token: TEST_TOKEN_HASH,
        purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      });
    });

    it('returns null when no active token exists', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findActiveByTokenHash(
          TEST_TOKEN_HASH,
          AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        ),
      ).resolves.toBeNull();
    });
  });

  describe('consumeVerificationToken', () => {
    it('marks an active token as consumed and flushes the change', async () => {
      const token = createVerificationToken();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(token);

      const { repository } = createRepository(em);

      const result = await repository.consumeVerificationToken({
        tokenHash: TEST_TOKEN_HASH,
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        consumedAt: TEST_CONSUMED_AT,
      });

      expect(em.findOne).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          token: TEST_TOKEN_HASH,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      expect(em.assign).toHaveBeenCalledWith(
        token,
        expect.objectContaining({
          consumedAt: TEST_CONSUMED_AT,
          updatedAt: TEST_CONSUMED_AT,
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(token);
      expect(result).toMatchObject({
        consumedAt: TEST_CONSUMED_AT,
      });
    });

    it('returns null when the token cannot be consumed', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.consumeVerificationToken({
        tokenHash: TEST_TOKEN_HASH,
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        consumedAt: TEST_CONSUMED_AT,
      });

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('revokeByTokenHash', () => {
    it('revokes a token by token hash', async () => {
      const token = createVerificationToken();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(token).mockResolvedValueOnce(token);

      const { repository } = createRepository(em);

      const result = await repository.revokeByTokenHash(
        TEST_TOKEN_HASH,
        TEST_CONSUMED_AT,
      );

      expect(em.findOne).toHaveBeenNthCalledWith(
        1,
        UserVerificationTokenEntity,
        {
          token: TEST_TOKEN_HASH,
        },
      );

      expect(em.findOne).toHaveBeenNthCalledWith(
        2,
        UserVerificationTokenEntity,
        {
          id: TEST_TOKEN_ID,
        },
      );

      expect(em.assign).toHaveBeenCalledWith(
        token,
        expect.objectContaining({
          consumedAt: TEST_CONSUMED_AT,
          updatedAt: TEST_CONSUMED_AT,
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(token);
      expect(result).toMatchObject({
        consumedAt: TEST_CONSUMED_AT,
      });
    });

    it('returns null when no matching token exists', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.revokeByTokenHash(TEST_TOKEN_HASH);

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('revokeUserVerificationTokens', () => {
    it('revokes all active tokens for a user and token type', async () => {
      const first = createVerificationToken({
        id: 'verification_token_1',
      });
      const second = createVerificationToken({
        id: 'verification_token_2',
      });
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([first, second]);

      const { repository } = createRepository(em);

      const count = await repository.revokeUserVerificationTokens({
        userId: TEST_USER_ID,
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        revokedAt: TEST_CONSUMED_AT,
      });

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      expect(em.assign).toHaveBeenCalledTimes(2);
      expect(em.assign).toHaveBeenNthCalledWith(
        1,
        first,
        expect.objectContaining({
          consumedAt: TEST_CONSUMED_AT,
          updatedAt: TEST_CONSUMED_AT,
        }),
      );
      expect(em.assign).toHaveBeenNthCalledWith(
        2,
        second,
        expect.objectContaining({
          consumedAt: TEST_CONSUMED_AT,
          updatedAt: TEST_CONSUMED_AT,
        }),
      );
      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(count).toBe(2);
    });

    it('revokes all active verification-token types when no type is provided', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([createVerificationToken()]);

      const { repository } = createRepository(em);

      const count = await repository.revokeUserVerificationTokens({
        userId: TEST_USER_ID,
        revokedAt: TEST_CONSUMED_AT,
      });

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      const where = em.find.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(where.purpose).toBeUndefined();
      expect(count).toBe(1);
    });

    it('returns zero and still flushes when there are no tokens to revoke', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([]);

      const { repository } = createRepository(em);

      const count = await repository.revokeUserVerificationTokens({
        userId: TEST_USER_ID,
      });

      expect(count).toBe(0);
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('typed revoke helpers', () => {
    it('revokes email verification tokens for a user', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([createVerificationToken()]);

      const { repository } = createRepository(em);

      const count =
        await repository.revokeEmailVerificationTokens(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      expect(count).toBe(1);
    });

    it('revokes password reset tokens for a user', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([
        createVerificationToken({
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        }),
      ]);

      const { repository } = createRepository(em);

      const count = await repository.revokePasswordResetTokens(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
      );

      expect(count).toBe(1);
    });
  });

  describe('findByUserId', () => {
    it('finds verification tokens for a user with default active-only filters', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByUserId(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
        expect.objectContaining({
          orderBy: expect.any(Object),
        }),
      );

      expect(result).toHaveLength(1);
    });

    it('honors includeConsumed and includeExpired options', async () => {
      const { repository, em } = createRepository();

      const options: VerificationTokenFindByUserIdOptions = {
        includeConsumed: true,
        includeExpired: true,
      };

      await repository.findByUserId(TEST_USER_ID, options);

      const where = em.find.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(where.user).toBe(TEST_USER_ID);
      expect(where.consumedAt).toBeUndefined();
      expect(where.expires).toBeUndefined();
    });

    it('does not treat includeRevoked as an alias for includeConsumed', async () => {
      const { repository, em } = createRepository();

      await repository.findByUserId(TEST_USER_ID, {
        includeRevoked: true,
        includeExpired: true,
      });

      const where = em.find.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(where.user).toBe(TEST_USER_ID);
      expect(where.consumedAt).toBeNull();
      expect(where.expires).toBeUndefined();
    });

    it('filters by type when provided', async () => {
      const { repository, em } = createRepository();

      await repository.findByUserId(TEST_USER_ID, {
        type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
      });

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        }),
        expect.objectContaining({
          orderBy: expect.any(Object),
        }),
      );
    });
  });

  describe('latest-token helpers', () => {
    it('finds the latest active email verification token', async () => {
      const { repository, em } = createRepository();

      const result =
        await repository.findLatestEmailVerificationToken(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
        expect.objectContaining({
          orderBy: expect.any(Object),
        }),
      );

      expect(result).toMatchObject({
        purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      });
    });

    it('finds the latest active password reset token', async () => {
      const { repository, em } = createRepository();

      const result =
        await repository.findLatestPasswordResetToken(TEST_USER_ID);

      expect(em.find).toHaveBeenCalledWith(
        UserVerificationTokenEntity,
        expect.objectContaining({
          user: TEST_USER_ID,
          purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
          consumedAt: null,
          expires: expect.objectContaining({
            $gt: expect.any(Date),
          }),
        }),
        expect.objectContaining({
          orderBy: expect.any(Object),
        }),
      );

      expect(result).toMatchObject({
        token: TEST_TOKEN_HASH,
      });
    });

    it('returns null when the latest email verification token is missing', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([]);

      const { repository } = createRepository(em);

      await expect(
        repository.findLatestEmailVerificationToken(TEST_USER_ID),
      ).resolves.toBeNull();
    });

    it('returns null when the latest password reset token is missing', async () => {
      const em = createMockEntityManager();

      em.find.mockResolvedValueOnce([]);

      const { repository } = createRepository(em);

      await expect(
        repository.findLatestPasswordResetToken(TEST_USER_ID),
      ).resolves.toBeNull();
    });
  });

  describe('deleteVerificationToken', () => {
    it('deletes a verification token by id', async () => {
      const token = createVerificationToken();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(token);

      const { repository } = createRepository(em);

      const result = await repository.deleteVerificationToken(TEST_TOKEN_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserVerificationTokenEntity, {
        id: TEST_TOKEN_ID,
      });
      expect(em.removeAndFlush).toHaveBeenCalledWith(token);
      expect(result).toBe(true);
    });

    it('returns false when there is no token to delete', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.deleteVerificationToken(TEST_TOKEN_ID);

      expect(result).toBe(false);
      expect(em.removeAndFlush).not.toHaveBeenCalled();
    });
  });
});
