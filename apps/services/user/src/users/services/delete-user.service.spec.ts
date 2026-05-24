import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

import { DeleteUserService, DeleteUserServiceError } from './delete-user.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    findByUsername: vi.fn(),
    markDeletedByUsername: vi.fn(),
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

describe('DeleteUserService', () => {
  const entityManager = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userRepository.findByUsername.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.userRepository.markDeletedByUsername.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'deleted',
      deletedAt: new Date('2026-05-10T00:00:00.000Z'),
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    mocks.toPublicUserDto.mockReturnValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'deleted',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('marks an existing user as deleted', async () => {
    const service = new DeleteUserService({ entityManager });

    const result = await service.execute('sinless777');

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.userRepository.markDeletedByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.toPublicUserDto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_123',
        username: 'sinless777',
        status: 'deleted',
      }),
    );

    expect(result).toEqual({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'deleted',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    mocks.userRepository.findByUsername.mockResolvedValue(null);

    const service = new DeleteUserService({ entityManager });

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      name: 'DeleteUserServiceError',
      code: UserErrorCode.USER_NOT_FOUND,
      message: 'User not found.',
    });

    expect(mocks.userRepository.markDeletedByUsername).not.toHaveBeenCalled();
    expect(mocks.toPublicUserDto).not.toHaveBeenCalled();
  });

  it('throws USER_DELETE_FAILED when delete operation returns null', async () => {
    mocks.userRepository.markDeletedByUsername.mockResolvedValue(null);

    const service = new DeleteUserService({ entityManager });

    await expect(service.execute('sinless777')).rejects.toMatchObject({
      name: 'DeleteUserServiceError',
      code: UserErrorCode.USER_DELETE_FAILED,
      message: 'Failed to delete user.',
    });

    expect(mocks.toPublicUserDto).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new DeleteUserServiceError(
      UserErrorCode.USER_DELETE_FAILED,
      'Failed to delete user.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DeleteUserServiceError');
    expect(error.code).toBe(UserErrorCode.USER_DELETE_FAILED);
    expect(error.message).toBe('Failed to delete user.');
  });
});