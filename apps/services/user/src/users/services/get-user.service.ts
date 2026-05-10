import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type PublicUserServiceDto,
} from '@helix-ai/contracts';
import { UserRepository } from '@helix-ai/db';

import { toPublicUserDto, type UserMapperInput } from '../mappers';

export interface GetUserServiceOptions {
  entityManager: EntityManager;
}

export class GetUserServiceError extends Error {
  constructor(
    public readonly code: typeof UserErrorCode.USER_NOT_FOUND,
    message: string,
  ) {
    super(message);
    this.name = 'GetUserServiceError';
  }
}

export class GetUserService {
  private readonly users: UserRepository;

  constructor(options: GetUserServiceOptions) {
    this.users = new UserRepository(options.entityManager);
  }

  async execute(username: string): Promise<PublicUserServiceDto> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new GetUserServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    return toPublicUserDto({
      ...(user as UserMapperInput),
      id: String(user.id),
      username,
    });
  }
}