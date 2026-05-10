import type {
  EntityManager,
  FilterQuery,
  RequiredEntityData,
} from '@mikro-orm/core';

import type { User } from '@helix-ai/db';
import { UserSession } from '@helix-ai/db';

export type SessionLookup = {
  id?: string;
  userId?: string;
  refreshTokenHash?: string;
};

export type CreateAuthSessionInput = {
  user: User;
  refreshTokenHash: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
  lastSeenAt?: Date;
};

export type UpdateAuthSessionInput = {
  refreshTokenHash?: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastSeenAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date | null;
};

export type RevokeSessionInput = {
  sessionId: string;
  revokedAt?: Date;
};

export type RevokeUserSessionsInput = {
  userId: string;
  exceptSessionId?: string;
  revokedAt?: Date;
};

export type ListUserSessionsOptions = {
  includeExpired?: boolean;

  /**
   * UserSession does not currently expose revokedAt.
   * This is kept for service API compatibility.
   */
  includeRevoked?: boolean;
};

export type SessionRepositoryOptions = {
  em: EntityManager;
};

type UserSessionWritableData = {
  user?: User;
  sessionToken?: string;
  refreshTokenHash?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  lastSeenAt?: Date;
  expires?: Date;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

const hasLookupValue = (lookup: SessionLookup): boolean => {
  return (
    lookup.id !== undefined ||
    lookup.userId !== undefined ||
    lookup.refreshTokenHash !== undefined
  );
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

const isExpiredAt = (expires: Date, now = new Date()): boolean => {
  return expires.getTime() <= now.getTime();
};

const toSessionData = (
  data: UserSessionWritableData,
): RequiredEntityData<UserSession> => {
  return data as unknown as RequiredEntityData<UserSession>;
};

const toSessionPatch = (
  data: UserSessionWritableData,
): Partial<UserSession> => {
  return data as unknown as Partial<UserSession>;
};

const getSessionExpires = (session: UserSession): Date => {
  return session.expires;
};

export class SessionRepository {
  private readonly em: EntityManager;

  public constructor(options: SessionRepositoryOptions) {
    this.em = options.em;
  }

  public async findById(id: string): Promise<UserSession | null> {
    return this.em.findOne(UserSession, {
      id,
    } as FilterQuery<UserSession>);
  }

  public async findByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<UserSession | null> {
    return this.em.findOne(UserSession, {
      sessionToken: refreshTokenHash,
    } as FilterQuery<UserSession>);
  }

  public async findActiveById(id: string): Promise<UserSession | null> {
    return this.em.findOne(UserSession, {
      id,
      expires: {
        $gt: new Date(),
      },
    } as FilterQuery<UserSession>);
  }

  public async findActiveByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<UserSession | null> {
    return this.em.findOne(UserSession, {
      sessionToken: refreshTokenHash,
      expires: {
        $gt: new Date(),
      },
    } as FilterQuery<UserSession>);
  }

  public async findByLookup(
    lookup: SessionLookup,
  ): Promise<UserSession | null> {
    if (!hasLookupValue(lookup)) {
      return null;
    }

    if (lookup.id !== undefined) {
      return this.findById(lookup.id);
    }

    if (lookup.refreshTokenHash !== undefined) {
      return this.findByRefreshTokenHash(lookup.refreshTokenHash);
    }

    if (lookup.userId !== undefined) {
      const sessions = await this.findByUserId(lookup.userId, {
        includeExpired: true,
        includeRevoked: true,
      });

      return sessions[0] ?? null;
    }

    return null;
  }

  public async findByUserId(
    userId: string,
    options: ListUserSessionsOptions = {},
  ): Promise<UserSession[]> {
    const filters: Record<string, unknown> = {
      user: userId,
    };

    if (options.includeExpired !== true) {
      filters.expires = {
        $gt: new Date(),
      };
    }

    return this.em.find(UserSession, filters as FilterQuery<UserSession>, {
      orderBy: {
        expires: 'DESC',
        createdAt: 'DESC',
      } as never,
    });
  }

  public async countActiveByUserId(userId: string): Promise<number> {
    return this.em.count(UserSession, {
      user: userId,
      expires: {
        $gt: new Date(),
      },
    } as FilterQuery<UserSession>);
  }

  public createSession(input: CreateAuthSessionInput): UserSession {
    const now = new Date();

    const session = this.em.create(
      UserSession,
      toSessionData({
        user: input.user,
        sessionToken: input.refreshTokenHash,
        deviceName: normalizeNullableString(input.deviceName),
        userAgent: normalizeNullableString(input.userAgent),
        ipAddress: normalizeNullableString(input.ipAddress),
        lastSeenAt: input.lastSeenAt ?? now,
        expires: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      }),
    );

    this.em.persist(session);

    return session;
  }

  public async createAndFlush(
    input: CreateAuthSessionInput,
  ): Promise<UserSession> {
    const session = this.createSession(input);

    await this.em.flush();

    return session;
  }

  public async updateSession(
    sessionId: string,
    input: UpdateAuthSessionInput,
  ): Promise<UserSession | null> {
    const session = await this.findById(sessionId);

    if (session === null) {
      return null;
    }

    const expires = input.revokedAt ?? input.expiresAt;

    this.em.assign(
      session,
      toSessionPatch({
        ...(input.refreshTokenHash === undefined
          ? {}
          : { sessionToken: input.refreshTokenHash }),
        ...(input.deviceName === undefined
          ? {}
          : { deviceName: normalizeNullableString(input.deviceName) }),
        ...(input.userAgent === undefined
          ? {}
          : { userAgent: normalizeNullableString(input.userAgent) }),
        ...(input.ipAddress === undefined
          ? {}
          : { ipAddress: normalizeNullableString(input.ipAddress) }),
        ...(input.lastSeenAt === undefined
          ? {}
          : { lastSeenAt: input.lastSeenAt }),
        ...(expires === undefined ? {} : { expires }),
        updatedAt: new Date(),
      }),
    );

    await this.em.flush();

    return session;
  }

  public async rotateRefreshToken(
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<UserSession | null> {
    return this.updateSession(sessionId, {
      refreshTokenHash,
      expiresAt,
      lastSeenAt: new Date(),
    });
  }

  public async touchSession(sessionId: string): Promise<UserSession | null> {
    return this.updateSession(sessionId, {
      lastSeenAt: new Date(),
    });
  }

  public async revokeSession({
    sessionId,
    revokedAt = new Date(),
  }: RevokeSessionInput): Promise<UserSession | null> {
    return this.updateSession(sessionId, {
      revokedAt,
    });
  }

  public async revokeByRefreshTokenHash(
    refreshTokenHash: string,
    revokedAt = new Date(),
  ): Promise<UserSession | null> {
    const session = await this.findByRefreshTokenHash(refreshTokenHash);

    if (session === null) {
      return null;
    }

    return this.revokeSession({
      sessionId: session.id,
      revokedAt,
    });
  }

  public async revokeUserSessions({
    userId,
    exceptSessionId,
    revokedAt = new Date(),
  }: RevokeUserSessionsInput): Promise<number> {
    const filters: Record<string, unknown> = {
      user: userId,
      expires: {
        $gt: new Date(),
      },
    };

    if (exceptSessionId !== undefined) {
      filters.id = {
        $ne: exceptSessionId,
      };
    }

    const sessions = await this.em.find(
      UserSession,
      filters as FilterQuery<UserSession>,
    );

    for (const session of sessions) {
      this.em.assign(
        session,
        toSessionPatch({
          expires: revokedAt,
          updatedAt: revokedAt,
        }),
      );
    }

    await this.em.flush();

    return sessions.length;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const session = await this.findById(sessionId);

    if (session === null) {
      return false;
    }

    await this.em.removeAndFlush(session);

    return true;
  }

  public isExpired(session: UserSession, now = new Date()): boolean {
    return isExpiredAt(getSessionExpires(session), now);
  }

  public isRevoked(session: UserSession, now = new Date()): boolean {
    return this.isExpired(session, now);
  }

  public isActive(session: UserSession, now = new Date()): boolean {
    return !this.isExpired(session, now);
  }
}

export const createSessionRepository = (
  em: EntityManager,
): SessionRepository => {
  return new SessionRepository({ em });
};
