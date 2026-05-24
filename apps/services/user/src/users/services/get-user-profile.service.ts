import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type UserServiceProfileDto,
} from '@aerealith-ai/contracts';
import { ProfileRepository, UserRepository } from '@aerealith-ai/db';

import { toUserProfileDto, type UserProfileMapperInput } from '../mappers';

export interface GetUserProfileServiceOptions {
  entityManager: EntityManager;
}

export class GetUserProfileServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_PROFILE_NOT_FOUND,
    message: string,
  ) {
    super(message);
    this.name = 'GetUserProfileServiceError';
  }
}

export class GetUserProfileService {
  private readonly users: UserRepository;
  private readonly profiles: ProfileRepository;

  constructor(options: GetUserProfileServiceOptions) {
    this.users = new UserRepository(options.entityManager);
    this.profiles = new ProfileRepository(options.entityManager);
  }

  async execute(username: string): Promise<UserServiceProfileDto> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new GetUserProfileServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const profile = await this.profiles.findByUserId(String(user.id));

    if (!profile) {
      throw new GetUserProfileServiceError(
        UserErrorCode.USER_PROFILE_NOT_FOUND,
        'User profile not found.',
      );
    }

    return toUserProfileDto(profile as UserProfileMapperInput, {
      userId: String(user.id),
      username,
    });
  }
}