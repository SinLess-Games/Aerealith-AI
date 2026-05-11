import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@helix-ai/contracts';

import {
  GetUserSettingsService,
  GetUserSettingsServiceError,
} from './get-user-settings.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    findByUsername: vi.fn(),
  },
  settingsRepository: {
    findByUserId: vi.fn(),
  },
  toUserSettingsDto: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
  SettingsRepository: vi.fn(function SettingsRepository() {
    return mocks.settingsRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toUserSettingsDto: mocks.toUserSettingsDto,
}));

describe('GetUserSettingsService', () => {
  const entityManager = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userRepository.findByUsername.mockResolvedValue({
      id: 'user_123',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.settingsRepository.findByUserId.mockResolvedValue({
      id: 'settings_123',
      userId: 'user_123',
      locale: 'en-US',
      timezone: 'America/Boise',
      theme: 'dark',
      emailNotificationsEnabled: true,
      marketingEmailsEnabled: false,
      analyticsEnabled: true,
      memoryEnabled: true,
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.toUserSettingsDto.mockReturnValue({
      userId: 'user_123',
      username: 'sinless777',
      locale: 'en-US',
      timezone: 'America/Boise',
      theme: 'dark',
      emailNotificationsEnabled: true,
      marketingEmailsEnabled: false,
      analyticsEnabled: true,
      memoryEnabled: true,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns user settings when the user and settings exist', async () => {
    const service = new GetUserSettingsService({ entityManager });

    const result = await service.execute('sinless777');

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.settingsRepository.findByUserId).toHaveBeenCalledWith(
      'user_123',
    );
    expect(mocks.toUserSettingsDto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'settings_123',
        userId: 'user_123',
      }),
      {
        userId: 'user_123',
        username: 'sinless777',
      },
    );

    expect(result).toEqual({
      userId: 'user_123',
      username: 'sinless777',
      locale: 'en-US',
      timezone: 'America/Boise',
      theme: 'dark',
      emailNotificationsEnabled: true,
      marketingEmailsEnabled: false,
      analyticsEnabled: true,
      memoryEnabled: true,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    mocks.userRepository.findByUsername.mockResolvedValue(null);

    const service = new GetUserSettingsService({ entityManager });

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      name: 'GetUserSettingsServiceError',
      code: UserErrorCode.USER_NOT_FOUND,
      message: 'User not found.',
    });

    expect(mocks.settingsRepository.findByUserId).not.toHaveBeenCalled();
    expect(mocks.toUserSettingsDto).not.toHaveBeenCalled();
  });

  it('throws USER_SETTINGS_NOT_FOUND when settings do not exist', async () => {
    mocks.settingsRepository.findByUserId.mockResolvedValue(null);

    const service = new GetUserSettingsService({ entityManager });

    await expect(service.execute('sinless777')).rejects.toMatchObject({
      name: 'GetUserSettingsServiceError',
      code: UserErrorCode.USER_SETTINGS_NOT_FOUND,
      message: 'User settings not found.',
    });

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.settingsRepository.findByUserId).toHaveBeenCalledWith(
      'user_123',
    );
    expect(mocks.toUserSettingsDto).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new GetUserSettingsServiceError(
      UserErrorCode.USER_SETTINGS_NOT_FOUND,
      'User settings not found.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GetUserSettingsServiceError');
    expect(error.code).toBe(UserErrorCode.USER_SETTINGS_NOT_FOUND);
    expect(error.message).toBe('User settings not found.');
  });
});