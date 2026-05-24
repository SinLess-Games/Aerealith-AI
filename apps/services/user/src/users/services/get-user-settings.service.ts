import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type UserServiceSettingsDto,
} from '@aerealith-ai/contracts';
import { SettingsRepository, UserRepository } from '@aerealith-ai/db';

import { toUserSettingsDto, type UserSettingsMapperInput } from '../mappers';

export interface GetUserSettingsServiceOptions {
  entityManager: EntityManager;
}

export class GetUserSettingsServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_SETTINGS_NOT_FOUND,
    message: string,
  ) {
    super(message);
    this.name = 'GetUserSettingsServiceError';
  }
}

export class GetUserSettingsService {
  private readonly users: UserRepository;
  private readonly settings: SettingsRepository;

  constructor(options: GetUserSettingsServiceOptions) {
    this.users = new UserRepository(options.entityManager);
    this.settings = new SettingsRepository(options.entityManager);
  }

  async execute(username: string): Promise<UserServiceSettingsDto> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new GetUserSettingsServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const settings = await this.settings.findByUserId(String(user.id));

    if (!settings) {
      throw new GetUserSettingsServiceError(
        UserErrorCode.USER_SETTINGS_NOT_FOUND,
        'User settings not found.',
      );
    }

    return toUserSettingsDto(settings as UserSettingsMapperInput, {
      userId: String(user.id),
      username,
    });
  }
}