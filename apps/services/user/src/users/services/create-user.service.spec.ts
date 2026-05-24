import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserErrorCode } from '@aerealith-ai/contracts';

import { CreateUserService, CreateUserServiceError } from './create-user.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    existsByUsername: vi.fn(),
    existsByEmail: vi.fn(),
    create: vi.fn(),
  },
  toPublicUserDto: vi.fn((user: unknown) => ({
    id: 'user_123',
    username: 'sinless777',
    displayName: 'Sinless777',
    status: 'pending',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    source: user,
  })),
}));

vi.mock('@aerealith-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toPublicUserDto: mocks.toPublicUserDto,
}));

describe('CreateUserService', () => {
  const entityManager = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userRepository.existsByUsername.mockResolvedValue(false);
    mocks.userRepository.existsByEmail.mockResolvedValue(false);
    mocks.userRepository.create.mockResolvedValue({
      id: 'user_123',
      username: 'sinless777',
      email: 'andy@example.com',
      displayName: 'Sinless777',
      status: 'pending',
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
      updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    });
  });

  it('creates a user when username and email are available', async () => {
    const service = new CreateUserService({ entityManager });

    const result = await service.execute({
      username: 'sinless777' as never,
      email: 'andy@example.com',
      displayName: 'Sinless777',
    });

    expect(mocks.userRepository.existsByUsername).toHaveBeenCalledWith(
      'sinless777',
    );
    expect(mocks.userRepository.existsByEmail).toHaveBeenCalledWith(
      'andy@example.com',
    );
    expect(mocks.userRepository.create).toHaveBeenCalledWith({
      username: 'sinless777',
      email: 'andy@example.com',
      displayName: 'Sinless777',
      status: 'pending',
    });

    expect(result).toEqual({
      id: 'user_123',
      username: 'sinless777',
      displayName: 'Sinless777',
      status: 'pending',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
      source: expect.objectContaining({
        id: 'user_123',
        username: 'sinless777',
      }),
    });
  });

  it('uses username as displayName when displayName is not provided', async () => {
    const service = new CreateUserService({ entityManager });

    await service.execute({
      username: 'sinless777' as never,
      email: 'andy@example.com',
    });

    expect(mocks.userRepository.create).toHaveBeenCalledWith({
      username: 'sinless777',
      email: 'andy@example.com',
      displayName: 'sinless777',
      status: 'pending',
    });
  });

  it('throws USER_ALREADY_EXISTS when username already exists', async () => {
    mocks.userRepository.existsByUsername.mockResolvedValue(true);

    const service = new CreateUserService({ entityManager });

    await expect(
      service.execute({
        username: 'sinless777' as never,
        email: 'andy@example.com',
      }),
    ).rejects.toMatchObject({
      name: 'CreateUserServiceError',
      code: UserErrorCode.USER_ALREADY_EXISTS,
      message: 'A user with that username already exists.',
    });

    expect(mocks.userRepository.existsByEmail).not.toHaveBeenCalled();
    expect(mocks.userRepository.create).not.toHaveBeenCalled();
  });

  it('throws USER_ALREADY_EXISTS when email already exists', async () => {
    mocks.userRepository.existsByEmail.mockResolvedValue(true);

    const service = new CreateUserService({ entityManager });

    await expect(
      service.execute({
        username: 'sinless777' as never,
        email: 'andy@example.com',
      }),
    ).rejects.toMatchObject({
      name: 'CreateUserServiceError',
      code: UserErrorCode.USER_ALREADY_EXISTS,
      message: 'A user with that email address already exists.',
    });

    expect(mocks.userRepository.create).not.toHaveBeenCalled();
  });

  it('creates typed service errors', () => {
    const error = new CreateUserServiceError(
      UserErrorCode.USER_ALREADY_EXISTS,
      'A user already exists.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CreateUserServiceError');
    expect(error.code).toBe(UserErrorCode.USER_ALREADY_EXISTS);
    expect(error.message).toBe('A user already exists.');
  });
});