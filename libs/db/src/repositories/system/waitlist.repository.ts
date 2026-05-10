import type {
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
} from '@mikro-orm/postgresql';

import { Waitlist } from '../../entities/system/waitlist';

export interface CreateWaitlistEntryInput {
  email: string;
}

export interface UpdateWaitlistEntryInput {
  email?: string;
}

export interface WaitlistListOptions {
  limit?: number;
  offset?: number;
}

export class WaitlistRepository {
  private readonly repository: EntityRepository<Waitlist>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(Waitlist);
  }

  async findById(id: string): Promise<Loaded<Waitlist> | null> {
    return this.repository.findOne({ id } as FilterQuery<Waitlist>);
  }

  async findByEmail(email: string): Promise<Loaded<Waitlist> | null> {
    return this.repository.findOne({
      email: this.normalizeEmail(email),
    } as FilterQuery<Waitlist>);
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repository.count({
      email: this.normalizeEmail(email),
    } as FilterQuery<Waitlist>);

    return count > 0;
  }

  async list(options: WaitlistListOptions = {}): Promise<Loaded<Waitlist>[]> {
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

  async create(input: CreateWaitlistEntryInput): Promise<Waitlist> {
    const now = new Date();

    const entry = this.repository.create({
      email: this.normalizeEmail(input.email),
      createdAt: now,
      updatedAt: now,
    });

    await this.entityManager.persistAndFlush(entry);

    return entry;
  }

  async update(
    id: string,
    input: UpdateWaitlistEntryInput,
  ): Promise<Loaded<Waitlist> | null> {
    const entry = await this.findById(id);

    if (!entry) {
      return null;
    }

    if (input.email !== undefined) {
      entry.email = this.normalizeEmail(input.email);
    }

    entry.updatedAt = new Date();

    await this.entityManager.flush();

    return entry;
  }

  async deleteById(id: string): Promise<boolean> {
    const entry = await this.findById(id);

    if (!entry) {
      return false;
    }

    await this.entityManager.removeAndFlush(entry);

    return true;
  }

  async deleteByEmail(email: string): Promise<boolean> {
    const entry = await this.findByEmail(email);

    if (!entry) {
      return false;
    }

    await this.entityManager.removeAndFlush(entry);

    return true;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}