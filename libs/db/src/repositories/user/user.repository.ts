import type {
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { User } from '../../entities/user/user.entity';

export interface CreateUserInput {
  username: string;
  email: string;
  displayName?: string | null;
  status?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  displayName?: string | null;
  status?: string;
}

export interface UserListOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export class UserRepository {
  private readonly repository: EntityRepository<User>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(User);
  }

  async findById(id: string): Promise<Loaded<User> | null> {
    return this.repository.findOne({ id } as FilterQuery<User>);
  }

  async findByUsername(username: string): Promise<Loaded<User> | null> {
    return this.repository.findOne({
      username: this.normalizeUsername(username),
    } as FilterQuery<User>);
  }

  async findByEmail(email: string): Promise<Loaded<User> | null> {
    return this.repository.findOne({
      email: this.normalizeEmail(email),
    } as FilterQuery<User>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({ id } as FilterQuery<User>);

    return count > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await this.repository.count({
      username: this.normalizeUsername(username),
    } as FilterQuery<User>);

    return count > 0;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repository.count({
      email: this.normalizeEmail(email),
    } as FilterQuery<User>);

    return count > 0;
  }

  async list(options: UserListOptions = {}): Promise<Loaded<User>[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const where = options.includeDeleted
      ? {}
      : ({
          deletedAt: null,
        } as FilterQuery<User>);

    return this.repository.find(where as FilterQuery<User>, {
      limit,
      offset,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async count(options: Pick<UserListOptions, 'includeDeleted'> = {}): Promise<number> {
    const where = options.includeDeleted
      ? {}
      : ({
          deletedAt: null,
        } as FilterQuery<User>);

    return this.repository.count(where as FilterQuery<User>);
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();

    const user = this.repository.create({
      username: this.normalizeUsername(input.username),
      email: this.normalizeEmail(input.email),
      displayName: input.displayName ?? input.username,
      status: input.status ?? 'pending',
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<User>);

    await this.entityManager.persistAndFlush(user);

    return user;
  }

  async update(
    id: string,
    input: UpdateUserInput,
  ): Promise<Loaded<User> | null> {
    const user = await this.findById(id);

    if (!user) {
      return null;
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.username !== undefined) {
      updates.username = this.normalizeUsername(input.username);
    }

    if (input.email !== undefined) {
      updates.email = this.normalizeEmail(input.email);
    }

    if (input.displayName !== undefined) {
      updates.displayName = input.displayName;
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    Object.assign(user, updates);

    await this.entityManager.flush();

    return user;
  }

  async updateByUsername(
    username: string,
    input: UpdateUserInput,
  ): Promise<Loaded<User> | null> {
    const user = await this.findByUsername(username);

    if (!user) {
      return null;
    }

    return this.update(String(user.id), input);
  }

  async markDeletedById(id: string): Promise<Loaded<User> | null> {
    const user = await this.findById(id);

    if (!user) {
      return null;
    }

    Object.assign(user, {
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.entityManager.flush();

    return user;
  }

  async markDeletedByUsername(username: string): Promise<Loaded<User> | null> {
    const user = await this.findByUsername(username);

    if (!user) {
      return null;
    }

    return this.markDeletedById(String(user.id));
  }

  async deleteById(id: string): Promise<boolean> {
    const user = await this.findById(id);

    if (!user) {
      return false;
    }

    await this.entityManager.removeAndFlush(user);

    return true;
  }

  async deleteByUsername(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);

    if (!user) {
      return false;
    }

    await this.entityManager.removeAndFlush(user);

    return true;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }
}