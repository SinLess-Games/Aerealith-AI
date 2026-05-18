import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type UserServiceSettingsDto,
} from '@helix-ai/contracts';
import {
  type UpdateSettingsInput,
  SettingsRepository,
  UserRepository,
} from '@helix-ai/db';

import { toUserSettingsDto, type UserSettingsMapperInput } from '../mappers';

export type UpdateUserSettingsInput = UpdateSettingsInput;

export interface UpdateUserSettingsServiceOptions {
  entityManager: EntityManager;
}

export class UpdateUserSettingsServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_SETTINGS_NOT_FOUND
      | typeof UserErrorCode.USER_SETTINGS_UPDATE_FAILED,
    message: string,
  ) {
    super(message);
    this.name = 'UpdateUserSettingsServiceError';
  }
}

export class UpdateUserSettingsService {
  private readonly users: UserRepository;
  private readonly settings: SettingsRepository;

  constructor(options: UpdateUserSettingsServiceOptions) {
    this.users = new UserRepository(options.entityManager);
    this.settings = new SettingsRepository(options.entityManager);
  }

  async execute(
    username: string,
    input: UpdateUserSettingsInput,
  ): Promise<UserServiceSettingsDto> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new UpdateUserSettingsServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const settings = await this.settings.updateByUserId(String(user.id), input);

    if (!settings) {
      throw new UpdateUserSettingsServiceError(
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
