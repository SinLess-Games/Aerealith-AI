import type {
  EntityData,
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { UserSettings as Settings } from '../../entities/user/settings.entity';

export type CreateSettingsInput = RequiredEntityData<Settings>;
export type UpdateSettingsInput = EntityData<Settings>;

export interface SettingsListOptions {
  limit?: number;
  offset?: number;
}

export class SettingsRepository {
  private readonly repository: EntityRepository<Settings>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(Settings);
  }

  async findById(id: string): Promise<Loaded<Settings> | null> {
    return this.repository.findOne({ id } as FilterQuery<Settings>);
  }

  async findByUserId(userId: string): Promise<Loaded<Settings> | null> {
    return this.repository.findOne({ userId } as FilterQuery<Settings>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({ id } as FilterQuery<Settings>);

    return count > 0;
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.repository.count({
      userId,
    } as FilterQuery<Settings>);

    return count > 0;
  }

  async list(options: SettingsListOptions = {}): Promise<Loaded<Settings>[]> {
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

  async create(input: CreateSettingsInput): Promise<Settings> {
    const settings = this.repository.create(input);

    await this.entityManager.persistAndFlush(settings);

    return settings;
  }

  async update(
    id: string,
    input: UpdateSettingsInput,
  ): Promise<Loaded<Settings> | null> {
    const settings = await this.findById(id);

    if (!settings) {
      return null;
    }

    this.entityManager.assign(settings, {
      ...input,
      updatedAt: new Date(),
    } as EntityData<Settings>);

    await this.entityManager.flush();

    return settings;
  }

  async updateByUserId(
    userId: string,
    input: UpdateSettingsInput,
  ): Promise<Loaded<Settings> | null> {
    const settings = await this.findByUserId(userId);

    if (!settings) {
      return null;
    }

    return this.update(String(settings.id), input);
  }

  async deleteById(id: string): Promise<boolean> {
    const settings = await this.findById(id);

    if (!settings) {
      return false;
    }

    await this.entityManager.removeAndFlush(settings);

    return true;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const settings = await this.findByUserId(userId);

    if (!settings) {
      return false;
    }

    await this.entityManager.removeAndFlush(settings);

    return true;
  }
}