import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityManager } from '@mikro-orm/core';
import type { User, UserProfile, UserSettings } from '@aerealith-ai/db';
import { User as UserEntity } from '@aerealith-ai/db';
import { UserProfile as UserProfileEntity } from '@aerealith-ai/db';
import { UserSettings as UserSettingsEntity } from '@aerealith-ai/db';

import { createUserRepository } from './user.repository';

type UserRepository = ReturnType<typeof createUserRepository>;

type CreateUserWithDefaultsInput = Parameters<
  UserRepository['createUserWithDefaults']
>[0];

type CreateUserStatusInput = NonNullable<CreateUserWithDefaultsInput['status']>;

const DB_USER_STATUS_ACTIVE = 'active' as unknown as CreateUserStatusInput;
const DB_USER_STATUS_PENDING_VERIFICATION =
  'pending_verification' as unknown as CreateUserStatusInput;

const TEST_USER_ID = 'user_123';
const TEST_PROFILE_ID = 'profile_123';
const TEST_SETTINGS_ID = 'settings_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_DISPLAY_NAME = 'Sinless777';
const TEST_TIMEZONE = 'America/Boise';
const TEST_LOCALE = 'en-US';

const TEST_CREATED_AT = new Date('2026-05-09T12:00:00.000Z');
const TEST_UPDATED_AT = new Date('2026-05-09T12:30:00.000Z');
const TEST_VERIFIED_AT = new Date('2026-05-09T13:00:00.000Z');

type MockEntityManager = {
  create: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  transactional: ReturnType<typeof vi.fn>;
};

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T => {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    displayName: TEST_DISPLAY_NAME,
    emailVerified: false,
    emailVerifiedAt: null,
    status: DB_USER_STATUS_ACTIVE,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as User;
};

const createTestProfile = (
  overrides: Partial<Record<string, unknown>> = {},
): UserProfile => {
  return {
    id: TEST_PROFILE_ID,
    user: createTestUser(),
    handle: TEST_USERNAME,
    displayName: TEST_DISPLAY_NAME,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as UserProfile;
};

const createTestSettings = (
  overrides: Partial<Record<string, unknown>> = {},
): UserSettings => {
  return {
    id: TEST_SETTINGS_ID,
    user: createTestUser(),
    timezone: TEST_TIMEZONE,
    locale: TEST_LOCALE,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as UserSettings;
};

const createInput = (
  overrides: Partial<CreateUserWithDefaultsInput> = {},
): CreateUserWithDefaultsInput => {
  return {
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    displayName: TEST_DISPLAY_NAME,
    timezone: TEST_TIMEZONE,
    locale: TEST_LOCALE,
    emailVerified: false,
    status: DB_USER_STATUS_ACTIVE,
    ...overrides,
  } as CreateUserWithDefaultsInput;
};

const createMockEntityManager = (): MockEntityManager => {
  const em = {} as MockEntityManager;

  em.create = vi.fn((entity, data: Record<string, unknown>) => {
    if (entity === UserEntity) {
      return createTestUser(
        withoutUndefined({
          username: data.username,
          email: data.email,
          displayName: data.displayName,
          emailVerified: data.emailVerified,
          emailVerifiedAt: data.emailVerifiedAt,
          status: data.status,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }),
      );
    }

    if (entity === UserProfileEntity) {
      return createTestProfile(
        withoutUndefined({
          user: data.user,
          handle: data.handle,
          displayName: data.displayName,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }),
      );
    }

    if (entity === UserSettingsEntity) {
      return createTestSettings(
        withoutUndefined({
          user: data.user,
          timezone: data.timezone,
          locale: data.locale,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }),
      );
    }

    return data;
  });

  em.findOne = vi.fn(async () => createTestUser());

  em.count = vi.fn(async () => 1);

  em.assign = vi.fn((entity: object, data: Record<string, unknown>) => {
    Object.assign(entity as unknown as Record<string, unknown>, data);

    return entity;
  });

  em.persist = vi.fn(() => undefined);

  em.flush = vi.fn(async () => undefined);

  em.transactional = vi.fn(
    async (callback: (transactionalEm: EntityManager) => unknown) => {
      return callback(em as unknown as EntityManager);
    },
  );

  return em;
};

const createRepository = (em = createMockEntityManager()) => {
  return {
    repository: createUserRepository(em as unknown as EntityManager),
    em,
  };
};

describe('UserRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUserWithDefaults', () => {
    it('creates a user, profile, and settings with normalized defaults', async () => {
      const { repository, em } = createRepository();

      const result = await repository.createUserWithDefaults(createInput());

      expect(em.transactional).toHaveBeenCalledTimes(1);

      expect(em.create).toHaveBeenCalledWith(
        UserEntity,
        expect.objectContaining({
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          displayName: TEST_DISPLAY_NAME,
          emailVerified: false,
          status: DB_USER_STATUS_ACTIVE,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserProfileEntity,
        expect.objectContaining({
          user: result.user,
          handle: TEST_USERNAME,
          displayName: TEST_DISPLAY_NAME,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserSettingsEntity,
        expect.objectContaining({
          user: result.user,
          timezone: TEST_TIMEZONE,
          locale: TEST_LOCALE,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.persist).toHaveBeenCalledWith(result.user);
      expect(em.persist).toHaveBeenCalledWith(result.profile);
      expect(em.persist).toHaveBeenCalledWith(result.settings);
      expect(em.flush).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        user: {
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          displayName: TEST_DISPLAY_NAME,
          status: DB_USER_STATUS_ACTIVE,
        },
        profile: {
          handle: TEST_USERNAME,
          displayName: TEST_DISPLAY_NAME,
        },
        settings: {
          timezone: TEST_TIMEZONE,
          locale: TEST_LOCALE,
        },
      });
    });

    it('uses username as displayName when displayName is omitted', async () => {
      const { repository, em } = createRepository();

      await repository.createUserWithDefaults(
        createInput({
          displayName: undefined,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserEntity,
        expect.objectContaining({
          displayName: TEST_USERNAME,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserProfileEntity,
        expect.objectContaining({
          displayName: TEST_USERNAME,
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('uses pending verification status when provided', async () => {
      const { repository, em } = createRepository();

      await repository.createUserWithDefaults(
        createInput({
          emailVerified: false,
          status: DB_USER_STATUS_PENDING_VERIFICATION,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserEntity,
        expect.objectContaining({
          emailVerified: false,
          status: DB_USER_STATUS_PENDING_VERIFICATION,
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('uses fallback locale and timezone when omitted', async () => {
      const { repository, em } = createRepository();

      await repository.createUserWithDefaults(
        createInput({
          timezone: undefined,
          locale: undefined,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserSettingsEntity,
        expect.objectContaining({
          timezone: expect.any(String),
          locale: expect.any(String),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('finds a user by id', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findById(TEST_USER_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        id: TEST_USER_ID,
      });

      expect(result).toMatchObject({
        id: TEST_USER_ID,
        username: TEST_USERNAME,
      });
    });

    it('returns null when no user exists for the id', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(repository.findById(TEST_USER_ID)).resolves.toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('finds a user by normalized username', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByUsername('  SinLess777  ');

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        username: TEST_USERNAME,
      });

      expect(result).toMatchObject({
        username: TEST_USERNAME,
      });
    });

    it('returns null when no user exists for the username', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findByUsername(TEST_USERNAME),
      ).resolves.toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('finds a user by normalized email', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByEmail('  SinLess777@Example.COM  ');

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        email: TEST_EMAIL,
      });

      expect(result).toMatchObject({
        email: TEST_EMAIL,
      });
    });

    it('returns null when no user exists for the email', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(repository.findByEmail(TEST_EMAIL)).resolves.toBeNull();
    });
  });

  describe('findByUsernameOrEmail', () => {
    it('looks up by username when the identifier is not an email', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByUsernameOrEmail('  SinLess777  ');

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        $or: [
          {
            username: TEST_USERNAME,
          },
          {
            email: TEST_USERNAME,
          },
        ],
      });

      expect(result).toMatchObject({
        username: TEST_USERNAME,
      });
    });

    it('looks up by email when the identifier contains an email separator', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findByUsernameOrEmail(
        '  SinLess777@Example.COM  ',
      );

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        $or: [
          {
            username: TEST_EMAIL,
          },
          {
            email: TEST_EMAIL,
          },
        ],
      });

      expect(result).toMatchObject({
        email: TEST_EMAIL,
      });
    });

    it('returns null when the identifier cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findByUsernameOrEmail('missing-user'),
      ).resolves.toBeNull();
    });
  });

  describe('availability checks', () => {
    it('returns true when username is available', async () => {
      const em = createMockEntityManager();

      em.count.mockResolvedValueOnce(0);

      const { repository } = createRepository(em);

      await expect(
        repository.assertUsernameAvailable(TEST_USERNAME),
      ).resolves.toBe(true);

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        username: TEST_USERNAME,
      });
    });

    it('returns false when username is already taken', async () => {
      const { repository, em } = createRepository();

      await expect(
        repository.assertUsernameAvailable(TEST_USERNAME),
      ).resolves.toBe(false);

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        username: TEST_USERNAME,
      });
    });

    it('normalizes username before checking availability', async () => {
      const em = createMockEntityManager();

      em.count.mockResolvedValueOnce(0);

      const { repository } = createRepository(em);

      await repository.assertUsernameAvailable('  SinLess777  ');

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        username: TEST_USERNAME,
      });
    });

    it('returns true when email is available', async () => {
      const em = createMockEntityManager();

      em.count.mockResolvedValueOnce(0);

      const { repository } = createRepository(em);

      await expect(repository.assertEmailAvailable(TEST_EMAIL)).resolves.toBe(
        true,
      );

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        email: TEST_EMAIL,
      });
    });

    it('returns false when email is already taken', async () => {
      const { repository, em } = createRepository();

      await expect(repository.assertEmailAvailable(TEST_EMAIL)).resolves.toBe(
        false,
      );

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        email: TEST_EMAIL,
      });
    });

    it('normalizes email before checking availability', async () => {
      const em = createMockEntityManager();

      em.count.mockResolvedValueOnce(0);

      const { repository } = createRepository(em);

      await repository.assertEmailAvailable('  SinLess777@Example.COM  ');

      expect(em.count).toHaveBeenCalledWith(UserEntity, {
        email: TEST_EMAIL,
      });
    });
  });

  describe('touchUpdatedAt', () => {
    it('updates updatedAt and flushes when the user exists', async () => {
      const user = createTestUser();
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(user);

      const { repository } = createRepository(em);

      await repository.touchUpdatedAt(TEST_USER_ID);

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        id: TEST_USER_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('does not flush when the user cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await repository.touchUpdatedAt(TEST_USER_ID);

      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('updateEmailVerification', () => {
    it('marks a user email as verified and flushes the change', async () => {
      const user = createTestUser({
        emailVerified: false,
        emailVerifiedAt: null,
      });
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(user);

      const { repository } = createRepository(em);

      const result = await repository.updateEmailVerification({
        userId: TEST_USER_ID,
        verified: true,
        verifiedAt: TEST_VERIFIED_AT,
      });

      expect(em.findOne).toHaveBeenCalledWith(UserEntity, {
        id: TEST_USER_ID,
      });

      expect(em.assign).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          emailVerified: true,
          emailVerifiedAt: TEST_VERIFIED_AT,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(user);
      expect(result).toMatchObject({
        emailVerified: true,
        emailVerifiedAt: TEST_VERIFIED_AT,
      });
    });

    it('marks a user email as unverified and flushes the change', async () => {
      const user = createTestUser({
        emailVerified: true,
        emailVerifiedAt: TEST_VERIFIED_AT,
      });
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(user);

      const { repository } = createRepository(em);

      const result = await repository.updateEmailVerification({
        userId: TEST_USER_ID,
        verified: false,
      });

      expect(em.assign).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          emailVerified: false,
          emailVerifiedAt: null,
          updatedAt: expect.any(Date),
        }),
      );

      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(result).toBe(user);
      expect(result).toMatchObject({
        emailVerified: false,
        emailVerifiedAt: null,
      });
    });

    it('returns null when the user cannot be found', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      const result = await repository.updateEmailVerification({
        userId: TEST_USER_ID,
        verified: true,
        verifiedAt: TEST_VERIFIED_AT,
      });

      expect(result).toBeNull();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });
});
