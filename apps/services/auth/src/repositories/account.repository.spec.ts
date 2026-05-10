import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityManager } from '@mikro-orm/core';
import type { User, UserAccount } from '@helix-ai/db';
import { UserAccount as UserAccountEntity } from '@helix-ai/db';
import { AUTH_ACCOUNT_PROVIDER } from '@helix-ai/contracts';

import { createAccountRepository } from './account.repository';

type AccountRepository = ReturnType<typeof createAccountRepository>;

type CreateCredentialsInput = Parameters<
  AccountRepository['createCredentialsAndFlush']
>[0];

const TEST_USER_ID = 'user_123';
const TEST_ACCOUNT_ID = 'account_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_DISPLAY_NAME = 'Sinless777';

const TEST_ACCOUNT_ID_VALUE = TEST_USERNAME;
const TEST_CREATED_AT = new Date('2026-05-09T12:00:00.000Z');
const TEST_UPDATED_AT = new Date('2026-05-09T12:30:00.000Z');
const TEST_CONNECTED_AT = new Date('2026-05-09T13:00:00.000Z');

type MockEntityManager = {
  create: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    displayName: TEST_DISPLAY_NAME,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as User;
};

const createTestAccount = (
  overrides: Partial<Record<string, unknown>> = {},
): UserAccount => {
  return {
    id: TEST_ACCOUNT_ID,
    user: createTestUser(),
    provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
    accountId: TEST_ACCOUNT_ID_VALUE,
    displayName: TEST_DISPLAY_NAME,
    status: 'active',
    connectedAt: TEST_CONNECTED_AT,
    managementUrl: undefined,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as UserAccount;
};

const createInput = (
  overrides: Partial<CreateCredentialsInput> = {},
): CreateCredentialsInput => {
  return {
    user: createTestUser(),
    username: TEST_USERNAME,
    displayName: TEST_DISPLAY_NAME,
    ...overrides,
  } as CreateCredentialsInput;
};

const createMockEntityManager = (): MockEntityManager => {
  return {
    create: vi.fn((_entity, data: Record<string, unknown>) => {
      return createTestAccount({
        user: data.user,
        provider: data.provider,
        accountId: data.accountId,
        displayName: data.displayName,
        status: data.status,
        connectedAt: data.connectedAt,
        managementUrl: data.managementUrl,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }),

    findOne: vi.fn(async () => createTestAccount()),

    count: vi.fn(async () => 1),

    persist: vi.fn(() => undefined),

    flush: vi.fn(async () => undefined),
  };
};

const createRepository = (em = createMockEntityManager()) => {
  return {
    repository: createAccountRepository(em as unknown as EntityManager),
    em,
  };
};

describe('AccountRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCredentialsAndFlush', () => {
    it('creates and persists a credentials account with normalized username', async () => {
      const { repository, em } = createRepository();
      const input = createInput({
        username: '  SinLess777  ',
      });

      const result = await repository.createCredentialsAndFlush(input);

      expect(em.create).toHaveBeenCalledWith(
        UserAccountEntity,
        expect.objectContaining({
          user: input.user,
          provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
          accountId: TEST_USERNAME,
          displayName: TEST_DISPLAY_NAME,
          status: 'active',
          connectedAt: expect.any(Date),
          managementUrl: undefined,
        }),
      );

      expect(em.persist).toHaveBeenCalledWith(result);
      expect(em.flush).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        accountId: TEST_USERNAME,
        displayName: TEST_DISPLAY_NAME,
        status: 'active',
      });
    });

    it('uses username as accountId even when displayName is omitted', async () => {
      const { repository, em } = createRepository();

      await repository.createCredentialsAndFlush(
        createInput({
          displayName: undefined,
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserAccountEntity,
        expect.objectContaining({
          provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
          accountId: TEST_USERNAME,
          displayName: TEST_USERNAME,
          status: 'active',
          connectedAt: expect.any(Date),
          managementUrl: undefined,
        }),
      );

      expect(em.persist).toHaveBeenCalledTimes(1);
      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('lowercases and trims the credentials account id', async () => {
      const { repository, em } = createRepository();

      await repository.createCredentialsAndFlush(
        createInput({
          username: '  SinLess777  ',
        }),
      );

      expect(em.create).toHaveBeenCalledWith(
        UserAccountEntity,
        expect.objectContaining({
          accountId: TEST_USERNAME,
        }),
      );

      expect(em.persist).toHaveBeenCalledTimes(1);
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOneByUserIdAndProvider', () => {
    it('finds an account by user id and provider', async () => {
      const { repository, em } = createRepository();

      const result = await repository.findOneByUserIdAndProvider(
        TEST_USER_ID,
        AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      );

      expect(em.findOne).toHaveBeenCalledWith(UserAccountEntity, {
        user: TEST_USER_ID,
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      });

      expect(result).toMatchObject({
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        accountId: TEST_ACCOUNT_ID_VALUE,
      });
    });

    it('returns null when no account exists for the user and provider', async () => {
      const em = createMockEntityManager();

      em.findOne.mockResolvedValueOnce(null);

      const { repository } = createRepository(em);

      await expect(
        repository.findOneByUserIdAndProvider(
          TEST_USER_ID,
          AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        ),
      ).resolves.toBeNull();
    });
  });

  describe('existsCredentialsAccount', () => {
    it('returns true when a credentials account exists for the username', async () => {
      const { repository, em } = createRepository();

      const result = await repository.existsCredentialsAccount(TEST_USERNAME);

      expect(em.count).toHaveBeenCalledWith(UserAccountEntity, {
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        accountId: TEST_USERNAME,
      });

      expect(result).toBe(true);
    });

    it('returns false when no credentials account exists for the username', async () => {
      const em = createMockEntityManager();

      em.count.mockResolvedValueOnce(0);

      const { repository } = createRepository(em);

      await expect(
        repository.existsCredentialsAccount(TEST_USERNAME),
      ).resolves.toBe(false);

      expect(em.count).toHaveBeenCalledWith(UserAccountEntity, {
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        accountId: TEST_USERNAME,
      });
    });

    it('normalizes username before checking for a credentials account', async () => {
      const { repository, em } = createRepository();

      await repository.existsCredentialsAccount('  SinLess777  ');

      expect(em.count).toHaveBeenCalledWith(UserAccountEntity, {
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        accountId: TEST_USERNAME,
      });
    });
  });
});
