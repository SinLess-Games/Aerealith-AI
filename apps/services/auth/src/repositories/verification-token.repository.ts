import type {
  EntityManager,
  FilterQuery,
  RequiredEntityData,
} from '@mikro-orm/core';

import type { User } from '@aerealith-ai/db';
import { UserVerificationToken } from '@aerealith-ai/db';
import { AuthVerificationSchemas } from '@aerealith-ai/contracts';

const { AUTH_VERIFICATION_TOKEN_TYPE } = AuthVerificationSchemas;

export type AuthVerificationTokenType =
  (typeof AUTH_VERIFICATION_TOKEN_TYPE)[keyof typeof AUTH_VERIFICATION_TOKEN_TYPE];

export type VerificationTokenLookup = {
  id?: string;
  tokenHash?: string;
  userId?: string;
  type?: AuthVerificationTokenType | string;
};

export type CreateVerificationTokenInput = {
  user: User;
  tokenHash: string;
  type: AuthVerificationTokenType | string;
  identifier?: string | null;
  expiresAt: Date;
};

export type ConsumeVerificationTokenInput = {
  tokenHash: string;
  type?: AuthVerificationTokenType | string;
  consumedAt?: Date;
};

export type RevokeVerificationTokenInput = {
  tokenId: string;
  revokedAt?: Date;
};

export type RevokeUserVerificationTokensInput = {
  userId: string;
  type?: AuthVerificationTokenType | string;
  revokedAt?: Date;
};

export type ListUserVerificationTokensOptions = {
  type?: AuthVerificationTokenType | string;
  includeExpired?: boolean;
  includeConsumed?: boolean;

  /**
   * UserVerificationToken does not currently expose revokedAt.
   * This is kept for service API compatibility.
   */
  includeRevoked?: boolean;
};

export type VerificationTokenRepositoryOptions = {
  em: EntityManager;
};

type UserVerificationTokenWritableData = {
  user?: User;
  identifier?: string;
  token?: string;
  tokenHash?: string;
  purpose?: string;
  type?: string;
  consumedAt?: Date | null;
  expires?: Date;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

const normalizeTokenPurpose = (
  type: AuthVerificationTokenType | string,
): string => {
  return type.trim().toLowerCase();
};

const normalizeIdentifier = (
  identifier: string | null | undefined,
  fallback: string,
): string => {
  const normalized = identifier?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return normalized;
};

const hasLookupValue = (lookup: VerificationTokenLookup): boolean => {
  return (
    lookup.id !== undefined ||
    lookup.tokenHash !== undefined ||
    lookup.userId !== undefined
  );
};

const isExpiredAt = (expires: Date, now = new Date()): boolean => {
  return expires.getTime() <= now.getTime();
};

const toVerificationTokenData = (
  data: UserVerificationTokenWritableData,
): RequiredEntityData<UserVerificationToken> => {
  return data as unknown as RequiredEntityData<UserVerificationToken>;
};

const toVerificationTokenPatch = (
  data: UserVerificationTokenWritableData,
): Partial<UserVerificationToken> => {
  return data as unknown as Partial<UserVerificationToken>;
};

const getVerificationTokenExpires = (
  verificationToken: UserVerificationToken,
): Date => {
  return verificationToken.expires;
};

export class VerificationTokenRepository {
  private readonly em: EntityManager;

  public constructor(options: VerificationTokenRepositoryOptions) {
    this.em = options.em;
  }

  public async findById(id: string): Promise<UserVerificationToken | null> {
    return this.em.findOne(UserVerificationToken, {
      id,
    } as FilterQuery<UserVerificationToken>);
  }

  public async findByTokenHash(
    tokenHash: string,
  ): Promise<UserVerificationToken | null> {
    return this.em.findOne(UserVerificationToken, {
      token: tokenHash,
    } as FilterQuery<UserVerificationToken>);
  }

  public async findActiveByTokenHash(
    tokenHash: string,
    type?: AuthVerificationTokenType | string,
  ): Promise<UserVerificationToken | null> {
    return this.em.findOne(UserVerificationToken, {
      token: tokenHash,
      ...(type === undefined ? {} : { purpose: normalizeTokenPurpose(type) }),
      consumedAt: null,
      expires: {
        $gt: new Date(),
      },
    } as FilterQuery<UserVerificationToken>);
  }

  public async findByLookup(
    lookup: VerificationTokenLookup,
  ): Promise<UserVerificationToken | null> {
    if (!hasLookupValue(lookup)) {
      return null;
    }

    if (lookup.id !== undefined) {
      return this.findById(lookup.id);
    }

    if (lookup.tokenHash !== undefined) {
      if (lookup.type !== undefined) {
        return this.findActiveByTokenHash(lookup.tokenHash, lookup.type);
      }

      return this.findByTokenHash(lookup.tokenHash);
    }

    if (lookup.userId !== undefined) {
      const tokens = await this.findByUserId(lookup.userId, {
        type: lookup.type,
        includeExpired: true,
        includeConsumed: true,
        includeRevoked: true,
      });

      return tokens[0] ?? null;
    }

    return null;
  }

  public async findByUserId(
    userId: string,
    options: ListUserVerificationTokensOptions = {},
  ): Promise<UserVerificationToken[]> {
    const filters: Record<string, unknown> = {
      user: userId,
    };

    if (options.type !== undefined) {
      filters.purpose = normalizeTokenPurpose(options.type);
    }

    if (options.includeConsumed !== true) {
      filters.consumedAt = null;
    }

    if (options.includeExpired !== true) {
      filters.expires = {
        $gt: new Date(),
      };
    }

    return this.em.find(
      UserVerificationToken,
      filters as FilterQuery<UserVerificationToken>,
      {
        orderBy: {
          createdAt: 'DESC',
        } as never,
      },
    );
  }

  public async findLatestActiveByUserIdAndType(
    userId: string,
    type: AuthVerificationTokenType | string,
  ): Promise<UserVerificationToken | null> {
    const tokens = await this.findByUserId(userId, {
      type,
      includeExpired: false,
      includeConsumed: false,
      includeRevoked: false,
    });

    return tokens[0] ?? null;
  }

  public async findLatestEmailVerificationToken(
    userId: string,
  ): Promise<UserVerificationToken | null> {
    return this.findLatestActiveByUserIdAndType(
      userId,
      AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    );
  }

  public async findLatestPasswordResetToken(
    userId: string,
  ): Promise<UserVerificationToken | null> {
    return this.findLatestActiveByUserIdAndType(
      userId,
      AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
    );
  }

  public createVerificationToken(
    input: CreateVerificationTokenInput,
  ): UserVerificationToken {
    const now = new Date();
    const purpose = normalizeTokenPurpose(input.type);

    const verificationToken = this.em.create(
      UserVerificationToken,
      toVerificationTokenData({
        user: input.user,
        identifier: normalizeIdentifier(input.identifier, input.user.email),
        token: input.tokenHash,
        purpose,
        consumedAt: null,
        expires: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      }),
    );

    this.em.persist(verificationToken);

    return verificationToken;
  }

  public async createAndFlush(
    input: CreateVerificationTokenInput,
  ): Promise<UserVerificationToken> {
    const verificationToken = this.createVerificationToken(input);

    await this.em.flush();

    return verificationToken;
  }

  public async consumeVerificationToken({
    tokenHash,
    type,
    consumedAt = new Date(),
  }: ConsumeVerificationTokenInput): Promise<UserVerificationToken | null> {
    const verificationToken = await this.findActiveByTokenHash(tokenHash, type);

    if (verificationToken === null) {
      return null;
    }

    this.em.assign(
      verificationToken,
      toVerificationTokenPatch({
        consumedAt,
        updatedAt: consumedAt,
      }),
    );

    await this.em.flush();

    return verificationToken;
  }

  public async revokeVerificationToken({
    tokenId,
    revokedAt = new Date(),
  }: RevokeVerificationTokenInput): Promise<UserVerificationToken | null> {
    const verificationToken = await this.findById(tokenId);

    if (verificationToken === null) {
      return null;
    }

    /**
     * UserVerificationToken does not have revokedAt.
     * Marking it consumed prevents future use while preserving auditability.
     */
    this.em.assign(
      verificationToken,
      toVerificationTokenPatch({
        consumedAt: verificationToken.consumedAt ?? revokedAt,
        expires: revokedAt,
        updatedAt: revokedAt,
      }),
    );

    await this.em.flush();

    return verificationToken;
  }

  public async revokeByTokenHash(
    tokenHash: string,
    revokedAt = new Date(),
  ): Promise<UserVerificationToken | null> {
    const verificationToken = await this.findByTokenHash(tokenHash);

    if (verificationToken === null) {
      return null;
    }

    return this.revokeVerificationToken({
      tokenId: verificationToken.id,
      revokedAt,
    });
  }

  public async revokeUserVerificationTokens({
    userId,
    type,
    revokedAt = new Date(),
  }: RevokeUserVerificationTokensInput): Promise<number> {
    const filters: Record<string, unknown> = {
      user: userId,
      consumedAt: null,
      expires: {
        $gt: new Date(),
      },
    };

    if (type !== undefined) {
      filters.purpose = normalizeTokenPurpose(type);
    }

    const verificationTokens = await this.em.find(
      UserVerificationToken,
      filters as FilterQuery<UserVerificationToken>,
    );

    for (const verificationToken of verificationTokens) {
      this.em.assign(
        verificationToken,
        toVerificationTokenPatch({
          consumedAt: verificationToken.consumedAt ?? revokedAt,
          expires: revokedAt,
          updatedAt: revokedAt,
        }),
      );
    }

    await this.em.flush();

    return verificationTokens.length;
  }

  public async revokeEmailVerificationTokens(userId: string): Promise<number> {
    return this.revokeUserVerificationTokens({
      userId,
      type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    });
  }

  public async revokePasswordResetTokens(userId: string): Promise<number> {
    return this.revokeUserVerificationTokens({
      userId,
      type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
    });
  }

  public async deleteVerificationToken(tokenId: string): Promise<boolean> {
    const verificationToken = await this.findById(tokenId);

    if (verificationToken === null) {
      return false;
    }

    await this.em.removeAndFlush(verificationToken);

    return true;
  }

  public isExpired(
    verificationToken: UserVerificationToken,
    now = new Date(),
  ): boolean {
    return isExpiredAt(getVerificationTokenExpires(verificationToken), now);
  }

  public isConsumed(verificationToken: UserVerificationToken): boolean {
    return (
      verificationToken.consumedAt !== null &&
      verificationToken.consumedAt !== undefined
    );
  }

  public isRevoked(verificationToken: UserVerificationToken): boolean {
    return this.isConsumed(verificationToken);
  }

  public isActive(
    verificationToken: UserVerificationToken,
    now = new Date(),
  ): boolean {
    return (
      !this.isConsumed(verificationToken) &&
      !this.isExpired(verificationToken, now)
    );
  }
}

export const createVerificationTokenRepository = (
  em: EntityManager,
): VerificationTokenRepository => {
  return new VerificationTokenRepository({ em });
};
