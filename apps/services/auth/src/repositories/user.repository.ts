import type {
  EntityManager,
  FilterQuery,
  RequiredEntityData,
} from '@mikro-orm/core';

import {
  ProfileVisibility,
  User,
  UserProfile,
  UserSettings,
} from '@aerealith-ai/db';
import { AUTH_USER_STATUS } from '@aerealith-ai/contracts';

export type UserLookup = {
  id?: string;
  username?: string;
  email?: string;
};

export type CreateAuthUserInput = {
  username: string;
  email: string;
  displayName?: string;
  timezone?: string;
  locale?: string;
  emailVerified?: boolean;
  status?: User['status'];
};

export type CreateAuthUserResult = {
  user: User;
  profile: UserProfile;
  settings: UserSettings;
};

export type UpdateUserEmailVerificationInput = {
  userId: string;
  verified: boolean;
  verifiedAt?: Date | null;
};

export type UserRepositoryOptions = {
  em: EntityManager;
};

const normalizeUsername = (username: string): string => {
  return username.trim().toLowerCase();
};

const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

const normalizeDisplayName = (
  displayName: string | undefined,
  fallback: string,
): string => {
  const normalized = displayName?.trim();

  if (!normalized) {
    return fallback;
  }

  return normalized;
};

const normalizeTimezone = (timezone: string | undefined): string => {
  const normalized = timezone?.trim();

  if (!normalized) {
    return 'America/Boise';
  }

  return normalized;
};

const normalizeLocale = (locale: string | undefined): string => {
  const normalized = locale?.trim();

  if (!normalized) {
    return 'en-US';
  }

  return normalized;
};

const normalizeStatus = (
  status: User['status'] | undefined,
): User['status'] => {
  return status ?? (AUTH_USER_STATUS.PENDING_VERIFICATION as User['status']);
};

const hasLookupValue = (lookup: UserLookup): boolean => {
  return (
    lookup.id !== undefined ||
    lookup.username !== undefined ||
    lookup.email !== undefined
  );
};

export class UserRepository {
  private readonly em: EntityManager;

  public constructor(options: UserRepositoryOptions) {
    this.em = options.em;
  }

  public async findById(id: string): Promise<User | null> {
    return this.em.findOne(User, {
      id,
    } as FilterQuery<User>);
  }

  public async findByUsername(username: string): Promise<User | null> {
    return this.em.findOne(User, {
      username: normalizeUsername(username),
    } as FilterQuery<User>);
  }

  public async findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, {
      email: normalizeEmail(email),
    } as FilterQuery<User>);
  }

  public async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const value = identifier.trim().toLowerCase();

    return this.em.findOne(User, {
      $or: [{ username: value }, { email: value }],
    } as FilterQuery<User>);
  }

  public async findByLookup(lookup: UserLookup): Promise<User | null> {
    if (!hasLookupValue(lookup)) {
      return null;
    }

    if (lookup.id !== undefined) {
      return this.findById(lookup.id);
    }

    if (lookup.username !== undefined) {
      return this.findByUsername(lookup.username);
    }

    if (lookup.email !== undefined) {
      return this.findByEmail(lookup.email);
    }

    return null;
  }

  public async existsByUsername(username: string): Promise<boolean> {
    const count = await this.em.count(User, {
      username: normalizeUsername(username),
    } as FilterQuery<User>);

    return count > 0;
  }

  public async existsByEmail(email: string): Promise<boolean> {
    const count = await this.em.count(User, {
      email: normalizeEmail(email),
    } as FilterQuery<User>);

    return count > 0;
  }

  public async assertUsernameAvailable(username: string): Promise<boolean> {
    return !(await this.existsByUsername(username));
  }

  public async assertEmailAvailable(email: string): Promise<boolean> {
    return !(await this.existsByEmail(email));
  }

  public createUser(input: CreateAuthUserInput): User {
    const now = new Date();
    const username = normalizeUsername(input.username);
    const displayName = normalizeDisplayName(input.displayName, input.username);

    const user = this.em.create(User, {
      username,
      email: normalizeEmail(input.email),
      displayName,
      emailVerified: input.emailVerified ?? false,
      status: normalizeStatus(input.status),
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<User>);

    this.em.persist(user);

    return user;
  }

  public createProfile(user: User, input: CreateAuthUserInput): UserProfile {
    const now = new Date();
    const username = normalizeUsername(input.username);
    const displayName = normalizeDisplayName(input.displayName, input.username);

    const profile = this.em.create(UserProfile, {
      user,
      handle: username,
      displayName,
      visibility: ProfileVisibility.Public,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<UserProfile>);

    this.em.persist(profile);

    return profile;
  }

  public createSettings(user: User, input: CreateAuthUserInput): UserSettings {
    const now = new Date();

    const settings = this.em.create(UserSettings, {
      user,
      timezone: normalizeTimezone(input.timezone),
      locale: normalizeLocale(input.locale),
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<UserSettings>);

    this.em.persist(settings);

    return settings;
  }

  public async createUserWithDefaults(
    input: CreateAuthUserInput,
  ): Promise<CreateAuthUserResult> {
    return this.em.transactional(async (em) => {
      const repository = new UserRepository({ em });

      const user = repository.createUser(input);
      const profile = repository.createProfile(user, input);
      const settings = repository.createSettings(user, input);

      await em.flush();

      return {
        user,
        profile,
        settings,
      };
    });
  }

  public async updateEmailVerification({
    userId,
    verified,
    verifiedAt,
  }: UpdateUserEmailVerificationInput): Promise<User | null> {
    const user = await this.findById(userId);

    if (user === null) {
      return null;
    }

    this.em.assign(user, {
      emailVerified: verified,
      emailVerifiedAt: verified ? (verifiedAt ?? new Date()) : null,
      updatedAt: new Date(),
    } as Partial<User>);

    await this.em.flush();

    return user;
  }

  public async updateStatus(
    userId: string,
    status: User['status'],
  ): Promise<User | null> {
    const user = await this.findById(userId);

    if (user === null) {
      return null;
    }

    this.em.assign(user, {
      status,
      updatedAt: new Date(),
    } as Partial<User>);

    await this.em.flush();

    return user;
  }

  public async touchUpdatedAt(userId: string): Promise<User | null> {
    const user = await this.findById(userId);

    if (user === null) {
      return null;
    }

    this.em.assign(user, {
      updatedAt: new Date(),
    } as Partial<User>);

    await this.em.flush();

    return user;
  }
}

export const createUserRepository = (em: EntityManager): UserRepository => {
  return new UserRepository({ em });
};
