import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type UserServiceProfileDto,
} from '@aerealith-ai/contracts';
import {
  type UpdateProfileInput,
  ProfileRepository,
  UserRepository,
} from '@aerealith-ai/db';

import { toUserProfileDto, type UserProfileMapperInput } from '../mappers';

export type UpdateUserProfileInput = UpdateProfileInput;

export interface UpdateUserProfileServiceOptions {
  entityManager: EntityManager;
}

export class UpdateUserProfileServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_PROFILE_NOT_FOUND
      | typeof UserErrorCode.USER_UPDATE_FAILED,
    message: string,
  ) {
    super(message);
    this.name = 'UpdateUserProfileServiceError';
  }
}

export class UpdateUserProfileService {
  private readonly users: UserRepository;
  private readonly profiles: ProfileRepository;

  constructor(options: UpdateUserProfileServiceOptions) {
    this.users = new UserRepository(options.entityManager);
    this.profiles = new ProfileRepository(options.entityManager);
  }

  async execute(
    username: string,
    input: UpdateUserProfileInput,
  ): Promise<UserServiceProfileDto> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new UpdateUserProfileServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const profile = await this.profiles.updateByUserId(String(user.id), input);

    if (!profile) {
      throw new UpdateUserProfileServiceError(
        UserErrorCode.USER_PROFILE_NOT_FOUND,
        'User profile not found.',
      );
    }

    return toUserProfileDto(profile as UserProfileMapperInput, {
      userId: String(user.id),
      username,
      displayName: input.displayName ?? user.displayName,
    });
  }
}
