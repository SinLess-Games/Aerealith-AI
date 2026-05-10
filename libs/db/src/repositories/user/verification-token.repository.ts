import type {
  EntityData,
  EntityManager,
  EntityRepository,
  FilterQuery,
  Loaded,
  RequiredEntityData,
} from '@mikro-orm/postgresql';

import { UserVerificationToken as VerificationToken } from '../../entities/user/verification-token.entity';

export type CreateVerificationTokenInput =
  RequiredEntityData<VerificationToken>;

export type UpdateVerificationTokenInput = EntityData<VerificationToken>;

export interface VerificationTokenListOptions {
  limit?: number;
  offset?: number;
}

export interface VerificationTokenIdentity {
  identifier: string;
  token: string;
}

export class VerificationTokenRepository {
  private readonly repository: EntityRepository<VerificationToken>;

  constructor(private readonly entityManager: EntityManager) {
    this.repository = this.entityManager.getRepository(VerificationToken);
  }

  async findById(id: string): Promise<Loaded<VerificationToken> | null> {
    return this.repository.findOne({ id } as FilterQuery<VerificationToken>);
  }

  async findByIdentifier(
    identifier: string,
  ): Promise<Loaded<VerificationToken> | null> {
    return this.repository.findOne({
      identifier: this.normalizeIdentifier(identifier),
    } as FilterQuery<VerificationToken>);
  }

  async findManyByIdentifier(
    identifier: string,
  ): Promise<Loaded<VerificationToken>[]> {
    return this.repository.find(
      {
        identifier: this.normalizeIdentifier(identifier),
      } as FilterQuery<VerificationToken>,
      {
        orderBy: {
          expiresAt: 'desc',
        } as never,
      },
    );
  }

  async findByToken(token: string): Promise<Loaded<VerificationToken> | null> {
    return this.repository.findOne({
      token,
    } as FilterQuery<VerificationToken>);
  }

  async findByIdentity(
    identity: VerificationTokenIdentity,
  ): Promise<Loaded<VerificationToken> | null> {
    return this.repository.findOne({
      identifier: this.normalizeIdentifier(identity.identifier),
      token: identity.token,
    } as FilterQuery<VerificationToken>);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.repository.count({
      id,
    } as FilterQuery<VerificationToken>);

    return count > 0;
  }

  async existsByIdentifier(identifier: string): Promise<boolean> {
    const count = await this.repository.count({
      identifier: this.normalizeIdentifier(identifier),
    } as FilterQuery<VerificationToken>);

    return count > 0;
  }

  async existsByToken(token: string): Promise<boolean> {
    const count = await this.repository.count({
      token,
    } as FilterQuery<VerificationToken>);

    return count > 0;
  }

  async existsByIdentity(identity: VerificationTokenIdentity): Promise<boolean> {
    const count = await this.repository.count({
      identifier: this.normalizeIdentifier(identity.identifier),
      token: identity.token,
    } as FilterQuery<VerificationToken>);

    return count > 0;
  }

  async list(
    options: VerificationTokenListOptions = {},
  ): Promise<Loaded<VerificationToken>[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.repository.find(
      {},
      {
        limit,
        offset,
        orderBy: {
          expiresAt: 'desc',
        } as never,
      },
    );
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async create(
    input: CreateVerificationTokenInput,
  ): Promise<VerificationToken> {
    const verificationToken = this.repository.create(input);

    await this.entityManager.persistAndFlush(verificationToken);

    return verificationToken;
  }

  async update(
    id: string,
    input: UpdateVerificationTokenInput,
  ): Promise<Loaded<VerificationToken> | null> {
    const verificationToken = await this.findById(id);

    if (!verificationToken) {
      return null;
    }

    this.entityManager.assign(verificationToken, {
      ...input,
      updatedAt: new Date(),
    } as EntityData<VerificationToken>);

    await this.entityManager.flush();

    return verificationToken;
  }

  async updateByIdentity(
    identity: VerificationTokenIdentity,
    input: UpdateVerificationTokenInput,
  ): Promise<Loaded<VerificationToken> | null> {
    const verificationToken = await this.findByIdentity(identity);

    if (!verificationToken) {
      return null;
    }

    return this.update(String(verificationToken.id), input);
  }

  async deleteById(id: string): Promise<boolean> {
    const verificationToken = await this.findById(id);

    if (!verificationToken) {
      return false;
    }

    await this.entityManager.removeAndFlush(verificationToken);

    return true;
  }

  async deleteByToken(token: string): Promise<boolean> {
    const verificationToken = await this.findByToken(token);

    if (!verificationToken) {
      return false;
    }

    await this.entityManager.removeAndFlush(verificationToken);

    return true;
  }

  async deleteByIdentity(identity: VerificationTokenIdentity): Promise<boolean> {
    const verificationToken = await this.findByIdentity(identity);

    if (!verificationToken) {
      return false;
    }

    await this.entityManager.removeAndFlush(verificationToken);

    return true;
  }

  async deleteByIdentifier(identifier: string): Promise<number> {
    const verificationTokens = await this.findManyByIdentifier(identifier);

    if (verificationTokens.length === 0) {
      return 0;
    }

    verificationTokens.forEach((verificationToken) => {
      this.entityManager.remove(verificationToken);
    });

    await this.entityManager.flush();

    return verificationTokens.length;
  }

  async deleteExpired(before: Date = new Date()): Promise<number> {
    return this.repository.nativeDelete({
      expiresAt: {
        $lte: before,
      },
    } as FilterQuery<VerificationToken>);
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
  }
}