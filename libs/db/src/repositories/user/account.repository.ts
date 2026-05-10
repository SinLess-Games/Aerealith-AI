import type {
  EntityData,
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { UserAccount as Account } from '../../entities/user/account.entity';

export type CreateAccountInput = RequiredEntityData<Account>;
export type UpdateAccountInput = EntityData<Account>;

export interface AccountListOptions {
  limit?: number;
  offset?: number;
}

export interface AccountProviderIdentity {
  provider: string;
  providerAccountId: string;
}

export class AccountRepository {
  private readonly repository: EntityRepository<Account>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(Account);
  }

  async findById(id: string): Promise<Loaded<Account> | null> {
    return this.repository.findOne({ id } as FilterQuery<Account>);
  }

  async findByUserId(userId: string): Promise<Loaded<Account> | null> {
    return this.repository.findOne({ userId } as FilterQuery<Account>);
  }

  async findManyByUserId(userId: string): Promise<Loaded<Account>[]> {
    return this.repository.find(
      { userId } as FilterQuery<Account>,
      {
        orderBy: {
          createdAt: 'desc',
        } as never,
      },
    );
  }

  async findByProviderIdentity(
    identity: AccountProviderIdentity,
  ): Promise<Loaded<Account> | null> {
    return this.repository.findOne({
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
    } as FilterQuery<Account>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({ id } as FilterQuery<Account>);

    return count > 0;
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.repository.count({
      userId,
    } as FilterQuery<Account>);

    return count > 0;
  }

  async existsByProviderIdentity(
    identity: AccountProviderIdentity,
  ): Promise<boolean> {
    const count = await this.repository.count({
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
    } as FilterQuery<Account>);

    return count > 0;
  }

  async list(options: AccountListOptions = {}): Promise<Loaded<Account>[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.repository.find(
      {},
      {
        limit,
        offset,
        orderBy: {
          createdAt: 'desc',
        } as never,
      },
    );
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async create(input: CreateAccountInput): Promise<Account> {
    const account = this.repository.create(input);

    await this.entityManager.persistAndFlush(account);

    return account;
  }

  async update(
    id: string,
    input: UpdateAccountInput,
  ): Promise<Loaded<Account> | null> {
    const account = await this.findById(id);

    if (!account) {
      return null;
    }

    this.entityManager.assign(account, {
      ...input,
      updatedAt: new Date(),
    } as EntityData<Account>);

    await this.entityManager.flush();

    return account;
  }

  async updateByProviderIdentity(
    identity: AccountProviderIdentity,
    input: UpdateAccountInput,
  ): Promise<Loaded<Account> | null> {
    const account = await this.findByProviderIdentity(identity);

    if (!account) {
      return null;
    }

    return this.update(String(account.id), input);
  }

  async deleteById(id: string): Promise<boolean> {
    const account = await this.findById(id);

    if (!account) {
      return false;
    }

    await this.entityManager.removeAndFlush(account);

    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const accounts = await this.findManyByUserId(userId);

    if (accounts.length === 0) {
      return 0;
    }

    accounts.forEach((account) => this.entityManager.remove(account));
    await this.entityManager.flush();

    return accounts.length;
  }

  async deleteByProviderIdentity(
    identity: AccountProviderIdentity,
  ): Promise<boolean> {
    const account = await this.findByProviderIdentity(identity);

    if (!account) {
      return false;
    }

    await this.entityManager.removeAndFlush(account);

    return true;
  }
}