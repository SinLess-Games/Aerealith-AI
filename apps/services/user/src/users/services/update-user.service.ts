import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type PublicUserServiceDto,
  type UpdateUserServiceDto,
} from '@aerealith-ai/contracts';
import { UserRepository } from '@aerealith-ai/db';

import { toPublicUserDto, type UserMapperInput } from '../mappers';

export interface UpdateUserServiceOptions {
  entityManager: EntityManager;
}

export class UpdateUserServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_UPDATE_FAILED,
    message: string,
  ) {
    super(message);
    this.name = 'UpdateUserServiceError';
  }
}

export class UpdateUserService {
  private readonly users: UserRepository;

  constructor(options: UpdateUserServiceOptions) {
    this.users = new UserRepository(options.entityManager);
  }

  async execute(
    username: string,
    input: UpdateUserServiceDto,
  ): Promise<PublicUserServiceDto> {
    const existingUser = await this.users.findByUsername(username);

    if (!existingUser) {
      throw new UpdateUserServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const updatedUser = await this.users.update(String(existingUser.id), {
      displayName: input.displayName,
      status: input.status,
    });

    if (!updatedUser) {
      throw new UpdateUserServiceError(
        UserErrorCode.USER_UPDATE_FAILED,
        'Failed to update user.',
      );
    }

    return toPublicUserDto({
      ...(updatedUser as UserMapperInput),
      id: String(updatedUser.id),
      username,
    });
  }
}