import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type PublicUserServiceDto,
} from '@aerealith-ai/contracts';
import { UserRepository } from '@aerealith-ai/db';

import { toPublicUserDto } from '../mappers';

export interface DeleteUserServiceOptions {
  entityManager: EntityManager;
}

export class DeleteUserServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_DELETE_FAILED,
    message: string,
  ) {
    super(message);
    this.name = 'DeleteUserServiceError';
  }
}

export class DeleteUserService {
  private readonly users: UserRepository;

  constructor(options: DeleteUserServiceOptions) {
    this.users = new UserRepository(options.entityManager);
  }

  async execute(username: string): Promise<PublicUserServiceDto> {
    const existingUser = await this.users.findByUsername(username);

    if (!existingUser) {
      throw new DeleteUserServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const deletedUser = await this.users.markDeletedByUsername(username);

    if (!deletedUser) {
      throw new DeleteUserServiceError(
        UserErrorCode.USER_DELETE_FAILED,
        'Failed to delete user.',
      );
    }

    return toPublicUserDto(deletedUser);
  }
}