import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@helix-ai/contracts';

import { GetUserService, GetUserServiceError } from './get-user.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    findByUsername: vi.fn(),
  },
  toPublicUserDto: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toPublicUserDto: mocks.toPublicUserDto,
}));

describe('GetUserService', () => {
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

    mocks.toPublicUserDto.mockReturnValue({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('returns a user when the user exists', async () => {
    const service = new GetUserService({ entityManager });

    const result = await service.execute('sinless777');

    expect(mocks.userRepository.findByUsername).toHaveBeenCalledWith(
      'sinless777',
    );

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
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    mocks.userRepository.findByUsername.mockResolvedValue(null);

    const service = new GetUserService({ entityManager });

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      name: 'GetUserServiceError',
      code: UserErrorCode.USER_NOT_FOUND,
      message: 'User not found.',
    });

    expect(mocks.toPublicUserDto).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new GetUserServiceError(
      UserErrorCode.USER_NOT_FOUND,
      'User not found.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GetUserServiceError');
    expect(error.code).toBe(UserErrorCode.USER_NOT_FOUND);
    expect(error.message).toBe('User not found.');
  });
});