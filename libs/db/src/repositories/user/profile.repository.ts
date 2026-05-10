import type {
  EntityData,
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { UserProfile as Profile } from '../../entities/user/profile.entity';

export type CreateProfileInput = RequiredEntityData<Profile>;
export type UpdateProfileInput = EntityData<Profile>;

export interface ProfileListOptions {
  limit?: number;
  offset?: number;
}

export class ProfileRepository {
  private readonly repository: EntityRepository<Profile>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(Profile);
  }

  async findById(id: string): Promise<Loaded<Profile> | null> {
    return this.repository.findOne({ id } as FilterQuery<Profile>);
  }

  async findByUserId(userId: string): Promise<Loaded<Profile> | null> {
    return this.repository.findOne({ userId } as FilterQuery<Profile>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({ id } as FilterQuery<Profile>);

    return count > 0;
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.repository.count({
      userId,
    } as FilterQuery<Profile>);

    return count > 0;
  }

  async list(options: ProfileListOptions = {}): Promise<Loaded<Profile>[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.repository.find(
      {},
      {
        limit,
        offset,
        orderBy: {
          createdAt: 'desc',
        },
      },
    );
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    const profile = this.repository.create(input);

    await this.entityManager.persistAndFlush(profile);

    return profile;
  }

  async update(
    id: string,
    input: UpdateProfileInput,
  ): Promise<Loaded<Profile> | null> {
    const profile = await this.findById(id);

    if (!profile) {
      return null;
    }

    this.entityManager.assign(profile, {
      ...input,
      updatedAt: new Date(),
    } as EntityData<Profile>);

    await this.entityManager.flush();

    return profile;
  }

  async updateByUserId(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<Loaded<Profile> | null> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      return null;
    }

    return this.update(String(profile.id), input);
  }

  async deleteById(id: string): Promise<boolean> {
    const profile = await this.findById(id);

    if (!profile) {
      return false;
    }

    await this.entityManager.removeAndFlush(profile);

    return true;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      return false;
    }

    await this.entityManager.removeAndFlush(profile);

    return true;
  }
}