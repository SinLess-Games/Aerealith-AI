import type {
  EntityManager,
  FilterQuery,
  RequiredEntityData,
} from '@mikro-orm/core';

import type { User } from '@helix-ai/db';
import { UserAccount } from '@helix-ai/db';
import {
  AUTH_ACCOUNT_PROVIDER,
  type AuthAccountProvider,
} from '@helix-ai/contracts';

export const AUTH_ACCOUNT_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  REVOKED: 'revoked',
} as const;

export type AuthAccountStatus =
  (typeof AUTH_ACCOUNT_STATUS)[keyof typeof AUTH_ACCOUNT_STATUS];

export type AccountLookup = {
  id?: string;
  provider?: string;
  accountId?: string;
  userId?: string;
};

export type CreateAuthAccountInput = {
  user: User;
  provider: AuthAccountProvider | string;
  accountId: string;
  displayName: string;
  managementUrl?: string | null;
  status?: AuthAccountStatus | string;
  connectedAt?: Date;
};

export type CreateCredentialsAccountInput = {
  user: User;
  username: string;
  displayName?: string;
};

export type UpdateAuthAccountInput = {
  displayName?: string;
  managementUrl?: string | null;
  status?: AuthAccountStatus | string;
};

export type AccountRepositoryOptions = {
  em: EntityManager;
};

const normalizeProvider = (provider: string): string => {
  return provider.trim().toLowerCase();
};

const normalizeAccountId = (accountId: string): string => {
  return accountId.trim().toLowerCase();
};

const normalizeDisplayName = (displayName: string): string => {
  return displayName.trim();
};

const normalizeNullableString = (
  value: string | null | undefined,
): string | undefined => {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
};

const hasLookupValue = (lookup: AccountLookup): boolean => {
  return (
    lookup.id !== undefined ||
    lookup.userId !== undefined ||
    (lookup.provider !== undefined && lookup.accountId !== undefined)
  );
};

export class AccountRepository {
  private readonly em: EntityManager;

  public constructor(options: AccountRepositoryOptions) {
    this.em = options.em;
  }

  public async findById(id: string): Promise<UserAccount | null> {
    return this.em.findOne(UserAccount, {
      id,
    } as FilterQuery<UserAccount>);
  }

  public async findByProviderAccountId(
    provider: string,
    accountId: string,
  ): Promise<UserAccount | null> {
    return this.em.findOne(UserAccount, {
      provider: normalizeProvider(provider),
      accountId: normalizeAccountId(accountId),
    } as FilterQuery<UserAccount>);
  }

  public async findCredentialsAccount(
    accountId: string,
  ): Promise<UserAccount | null> {
    return this.findByProviderAccountId(
      AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      accountId,
    );
  }

  public async findByUserId(userId: string): Promise<UserAccount[]> {
    return this.em.find(UserAccount, {
      user: userId,
    } as FilterQuery<UserAccount>);
  }

  public async findActiveByUserId(userId: string): Promise<UserAccount[]> {
    return this.em.find(UserAccount, {
      user: userId,
      status: AUTH_ACCOUNT_STATUS.ACTIVE,
    } as FilterQuery<UserAccount>);
  }

  public async findByUserIdAndProvider(
    userId: string,
    provider: string,
  ): Promise<UserAccount[]> {
    return this.em.find(UserAccount, {
      user: userId,
      provider: normalizeProvider(provider),
    } as FilterQuery<UserAccount>);
  }

  public async findOneByUserIdAndProvider(
    userId: string,
    provider: string,
  ): Promise<UserAccount | null> {
    return this.em.findOne(UserAccount, {
      user: userId,
      provider: normalizeProvider(provider),
    } as FilterQuery<UserAccount>);
  }

  public async findByLookup(
    lookup: AccountLookup,
  ): Promise<UserAccount | null> {
    if (!hasLookupValue(lookup)) {
      return null;
    }

    if (lookup.id !== undefined) {
      return this.findById(lookup.id);
    }

    if (lookup.provider !== undefined && lookup.accountId !== undefined) {
      return this.findByProviderAccountId(lookup.provider, lookup.accountId);
    }

    if (lookup.userId !== undefined) {
      return this.findOneByUserIdAndProvider(
        lookup.userId,
        AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      );
    }

    return null;
  }

  public async existsByProviderAccountId(
    provider: string,
    accountId: string,
  ): Promise<boolean> {
    const count = await this.em.count(UserAccount, {
      provider: normalizeProvider(provider),
      accountId: normalizeAccountId(accountId),
    } as FilterQuery<UserAccount>);

    return count > 0;
  }

  public async existsCredentialsAccount(accountId: string): Promise<boolean> {
    return this.existsByProviderAccountId(
      AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      accountId,
    );
  }

  public createAccount(input: CreateAuthAccountInput): UserAccount {
    const account = this.em.create(UserAccount, {
      user: input.user,
      provider: normalizeProvider(input.provider),
      accountId: normalizeAccountId(input.accountId),
      displayName: normalizeDisplayName(input.displayName),
      managementUrl: normalizeNullableString(input.managementUrl),
      status: input.status ?? AUTH_ACCOUNT_STATUS.ACTIVE,
      connectedAt: input.connectedAt ?? new Date(),
    } as RequiredEntityData<UserAccount>);

    this.em.persist(account);

    return account;
  }

  public createCredentialsAccount(
    input: CreateCredentialsAccountInput,
  ): UserAccount {
    return this.createAccount({
      user: input.user,
      provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      accountId: input.username,
      displayName: input.displayName ?? input.username,
      status: AUTH_ACCOUNT_STATUS.ACTIVE,
    });
  }

  public async createAndFlush(
    input: CreateAuthAccountInput,
  ): Promise<UserAccount> {
    const account = this.createAccount(input);

    await this.em.flush();

    return account;
  }

  public async createCredentialsAndFlush(
    input: CreateCredentialsAccountInput,
  ): Promise<UserAccount> {
    const account = this.createCredentialsAccount(input);

    await this.em.flush();

    return account;
  }

  public async updateAccount(
    accountId: string,
    input: UpdateAuthAccountInput,
  ): Promise<UserAccount | null> {
    const account = await this.findById(accountId);

    if (account === null) {
      return null;
    }

    this.em.assign(account, {
      ...(input.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(input.displayName) }),
      ...(input.managementUrl === undefined
        ? {}
        : { managementUrl: normalizeNullableString(input.managementUrl) }),
      ...(input.status === undefined ? {} : { status: input.status }),
    } as Partial<UserAccount>);

    await this.em.flush();

    return account;
  }

  public async updateStatus(
    accountId: string,
    status: AuthAccountStatus | string,
  ): Promise<UserAccount | null> {
    return this.updateAccount(accountId, { status });
  }

  public async disableAccount(accountId: string): Promise<UserAccount | null> {
    return this.updateStatus(accountId, AUTH_ACCOUNT_STATUS.DISABLED);
  }

  public async revokeAccount(accountId: string): Promise<UserAccount | null> {
    return this.updateStatus(accountId, AUTH_ACCOUNT_STATUS.REVOKED);
  }

  public async activateAccount(accountId: string): Promise<UserAccount | null> {
    return this.updateStatus(accountId, AUTH_ACCOUNT_STATUS.ACTIVE);
  }

  public async deleteAccount(accountId: string): Promise<boolean> {
    const account = await this.findById(accountId);

    if (account === null) {
      return false;
    }

    await this.em.removeAndFlush(account);

    return true;
  }
}

export const createAccountRepository = (
  em: EntityManager,
): AccountRepository => {
  return new AccountRepository({ em });
};
