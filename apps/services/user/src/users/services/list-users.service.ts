import type { EntityManager } from '@mikro-orm/postgresql';

import type { PublicUserServiceDto } from '@aerealith-ai/contracts';
import { UserRepository } from '@aerealith-ai/db';

import { toPublicUserDtos, type UserMapperInput } from '../mappers';

export interface ListUsersServiceOptions {
  entityManager: EntityManager;
}

export interface ListUsersInput {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export class ListUsersService {
  private readonly users: UserRepository;

  constructor(options: ListUsersServiceOptions) {
    this.users = new UserRepository(options.entityManager);
  }

  async execute(input: ListUsersInput = {}): Promise<PublicUserServiceDto[]> {
    const users = await this.users.list({
      limit: input.limit,
      offset: input.offset,
      includeDeleted: input.includeDeleted,
    });

    return toPublicUserDtos(users as unknown as UserMapperInput[]);
  }
}