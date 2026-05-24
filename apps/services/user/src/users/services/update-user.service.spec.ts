import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

import {
  UpdateUserService,
  UpdateUserServiceError,
} from './update-user.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    findByUsername: vi.fn(),
    update: vi.fn(),
  },
  toPublicUserDto: vi.fn(),
}));

vi.mock('@aerealith-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toPublicUserDto: mocks.toPublicUserDto,
}));

describe('UpdateUserService', () => {
  const entityManager = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userRepository.findByUsername.mockResolvedValue({
      id: 'user_123',
      displayName: 'Old Display Name',
      status: 'active',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.userRepository.update.mockResolvedValue({
      id: 'user_123',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:01.000Z'),
    });

    mocks.toPublicUserDto.mockReturnValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:01.000Z',
    });
  });

  it('updates an existing user', async () => {
    const service = new UpdateUserService({ entityManager });

    const result = await service.execute('sinless777', {
      displayName: 'Sinless777',
      status: 'active' as never,
    });

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );

    expect(mocks.userRepository.update).toHaveBeenCalledWith('user_123', {
      displayName: 'Sinless777',
      status: 'active',
    });

    expect(mocks.toPublicUserDto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
      }),
    );

    expect(result).toEqual({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:01.000Z',
    });
  });

  it('passes undefined fields through to the repository update payload', async () => {
    const service = new UpdateUserService({ entityManager });

    await service.execute('sinless777', {
      displayName: 'Sinless777',
    });

    expect(mocks.userRepository.update).toHaveBeenCalledWith('user_123', {
      displayName: 'Sinless777',
      status: undefined,
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    mocks.userRepository.findByUsername.mockResolvedValue(null);

    const service = new UpdateUserService({ entityManager });

    await expect(
      service.execute('missing-user', {
        displayName: 'Missing User',
      }),
    ).rejects.toMatchObject({
      name: 'UpdateUserServiceError',
      code: UserErrorCode.USER_NOT_FOUND,
      message: 'User not found.',
    });

    expect(mocks.userRepository.update).not.toHaveBeenCalled();
    expect(mocks.toPublicUserDto).not.toHaveBeenCalled();
  });

  it('throws USER_UPDATE_FAILED when update operation returns null', async () => {
    mocks.userRepository.update.mockResolvedValue(null);

    const service = new UpdateUserService({ entityManager });

    await expect(
      service.execute('sinless777', {
        displayName: 'Sinless777',
      }),
    ).rejects.toMatchObject({
      name: 'UpdateUserServiceError',
      code: UserErrorCode.USER_UPDATE_FAILED,
      message: 'Failed to update user.',
    });

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.userRepository.update).toHaveBeenCalledWith('user_123', {
      displayName: 'Sinless777',
      status: undefined,
    });
    expect(mocks.toPublicUserDto).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new UpdateUserServiceError(
      UserErrorCode.USER_UPDATE_FAILED,
      'Failed to update user.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UpdateUserServiceError');
    expect(error.code).toBe(UserErrorCode.USER_UPDATE_FAILED);
    expect(error.message).toBe('Failed to update user.');
  });
});