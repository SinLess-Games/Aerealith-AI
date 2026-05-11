import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@helix-ai/contracts';

import {
  GetUserProfileService,
  GetUserProfileServiceError,
} from './get-user-profile.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    findByUsername: vi.fn(),
  },
  profileRepository: {
    findByUserId: vi.fn(),
  },
  toUserProfileDto: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
  ProfileRepository: vi.fn(function ProfileRepository() {
    return mocks.profileRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toUserProfileDto: mocks.toUserProfileDto,
}));

describe('GetUserProfileService', () => {
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

    mocks.profileRepository.findByUserId.mockResolvedValue({
      id: 'profile_123',
      userId: 'user_123',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Game developer and full-stack developer.',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.toUserProfileDto.mockReturnValue({
      userId: 'user_123',
      username: 'sinless777',
      displayName: 'sinless777',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Game developer and full-stack developer.',
      location: null,
      websiteUrl: null,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns a user profile when the user and profile exist', async () => {
    const service = new GetUserProfileService({ entityManager });

    const result = await service.execute('sinless777');

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.profileRepository.findByUserId).toHaveBeenCalledWith(
      'user_123',
    );
    expect(mocks.toUserProfileDto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'profile_123',
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
      displayName: 'sinless777',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Game developer and full-stack developer.',
      location: null,
      websiteUrl: null,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    mocks.userRepository.findByUsername.mockResolvedValue(null);

    const service = new GetUserProfileService({ entityManager });

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      name: 'GetUserProfileServiceError',
      code: UserErrorCode.USER_NOT_FOUND,
      message: 'User not found.',
    });

    expect(mocks.profileRepository.findByUserId).not.toHaveBeenCalled();
    expect(mocks.toUserProfileDto).not.toHaveBeenCalled();
  });

  it('throws USER_PROFILE_NOT_FOUND when the profile does not exist', async () => {
    mocks.profileRepository.findByUserId.mockResolvedValue(null);

    const service = new GetUserProfileService({ entityManager });

    await expect(service.execute('sinless777')).rejects.toMatchObject({
      name: 'GetUserProfileServiceError',
      code: UserErrorCode.USER_PROFILE_NOT_FOUND,
      message: 'User profile not found.',
    });

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.profileRepository.findByUserId).toHaveBeenCalledWith(
      'user_123',
    );
    expect(mocks.toUserProfileDto).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new GetUserProfileServiceError(
      UserErrorCode.USER_PROFILE_NOT_FOUND,
      'User profile not found.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GetUserProfileServiceError');
    expect(error.code).toBe(UserErrorCode.USER_PROFILE_NOT_FOUND);
    expect(error.message).toBe('User profile not found.');
  });
});