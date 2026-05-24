import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type CreateUserServiceDto,
  type PublicUserServiceDto,
} from '@aerealith-ai/contracts';
import { UserRepository } from '@aerealith-ai/db';

import { toPublicUserDto } from '../mappers';

export interface CreateUserServiceOptions {
  entityManager: EntityManager;
}

export class CreateUserServiceError extends Error {
  constructor(
    public readonly code: typeof UserErrorCode.USER_ALREADY_EXISTS,
    message: string,
  ) {
    super(message);
    this.name = 'CreateUserServiceError';
  }
}

export class CreateUserService {
  private readonly users: UserRepository;

  constructor(options: CreateUserServiceOptions) {
    this.users = new UserRepository(options.entityManager);
  }

  async execute(input: CreateUserServiceDto): Promise<PublicUserServiceDto> {
    const usernameExists = await this.users.existsByUsername(input.username);

    if (usernameExists) {
      throw new CreateUserServiceError(
        UserErrorCode.USER_ALREADY_EXISTS,
        'A user with that username already exists.',
      );
    }

    const emailExists = await this.users.existsByEmail(input.email);

    if (emailExists) {
      throw new CreateUserServiceError(
        UserErrorCode.USER_ALREADY_EXISTS,
        'A user with that email address already exists.',
      );
    }

    const user = await this.users.create({
      username: input.username,
      email: input.email,
      displayName: input.displayName ?? input.username,
      status: 'pending',
    });

    return toPublicUserDto(user);
  }
}