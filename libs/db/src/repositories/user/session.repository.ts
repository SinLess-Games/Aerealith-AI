import type {
  EntityData,
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { UserSession as Session } from '../../entities/user/session.entity';

export type CreateSessionInput = RequiredEntityData<Session>;
export type UpdateSessionInput = EntityData<Session>;

export interface SessionListOptions {
  limit?: number;
  offset?: number;
}

export class SessionRepository {
  private readonly repository: EntityRepository<Session>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(Session);
  }

  async findById(id: string): Promise<Loaded<Session> | null> {
    return this.repository.findOne({ id } as FilterQuery<Session>);
  }

  async findByUserId(userId: string): Promise<Loaded<Session> | null> {
    return this.repository.findOne({ userId } as FilterQuery<Session>);
  }

  async findManyByUserId(userId: string): Promise<Loaded<Session>[]> {
    return this.repository.find(
      { userId } as FilterQuery<Session>,
      {
        orderBy: {
          createdAt: 'desc',
        } as never,
      },
    );
  }

  async findBySessionToken(
    sessionToken: string,
  ): Promise<Loaded<Session> | null> {
    return this.repository.findOne({
      sessionToken,
    } as FilterQuery<Session>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({ id } as FilterQuery<Session>);

    return count > 0;
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.repository.count({
      userId,
    } as FilterQuery<Session>);

    return count > 0;
  }

  async existsBySessionToken(sessionToken: string): Promise<boolean> {
    const count = await this.repository.count({
      sessionToken,
    } as FilterQuery<Session>);

    return count > 0;
  }

  async list(options: SessionListOptions = {}): Promise<Loaded<Session>[]> {
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

  async create(input: CreateSessionInput): Promise<Session> {
    const session = this.repository.create(input);

    await this.entityManager.persistAndFlush(session);

    return session;
  }

  async update(
    id: string,
    input: UpdateSessionInput,
  ): Promise<Loaded<Session> | null> {
    const session = await this.findById(id);

    if (!session) {
      return null;
    }

    this.entityManager.assign(session, {
      ...input,
      updatedAt: new Date(),
    } as EntityData<Session>);

    await this.entityManager.flush();

    return session;
  }

  async updateBySessionToken(
    sessionToken: string,
    input: UpdateSessionInput,
  ): Promise<Loaded<Session> | null> {
    const session = await this.findBySessionToken(sessionToken);

    if (!session) {
      return null;
    }

    return this.update(String(session.id), input);
  }

  async deleteById(id: string): Promise<boolean> {
    const session = await this.findById(id);

    if (!session) {
      return false;
    }

    await this.entityManager.removeAndFlush(session);

    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const sessions = await this.findManyByUserId(userId);

    if (sessions.length === 0) {
      return 0;
    }

    sessions.forEach((session) => this.entityManager.remove(session));
    await this.entityManager.flush();

    return sessions.length;
  }

  async deleteBySessionToken(sessionToken: string): Promise<boolean> {
    const session = await this.findBySessionToken(sessionToken);

    if (!session) {
      return false;
    }

    await this.entityManager.removeAndFlush(session);

    return true;
  }

  async deleteExpired(before: Date = new Date()): Promise<number> {
    return this.repository.nativeDelete({
      expiresAt: {
        $lte: before,
      },
    } as FilterQuery<Session>);
  }
}