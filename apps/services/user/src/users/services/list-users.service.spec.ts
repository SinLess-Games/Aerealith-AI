import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListUsersService } from './list-users.service';

const mocks = vi.hoisted(() => ({
  userRepository: {
    list: vi.fn(),
  },
  toPublicUserDtos: vi.fn(),
}));

vi.mock('@helix-ai/db', () => ({
  UserRepository: vi.fn(function UserRepository() {
    return mocks.userRepository;
  }),
}));

vi.mock('../mappers', () => ({
  toPublicUserDtos: mocks.toPublicUserDtos,
}));

describe('ListUsersService', () => {
  const entityManager = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userRepository.list.mockResolvedValue([
      {
        id: 'user_123',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        updatedAt: new Date('2026-05-10T00:00:00.000Z'),
      },
      {
        id: 'user_456',
        displayName: 'Helix User',
        status: 'pending',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        updatedAt: new Date('2026-05-10T00:00:00.000Z'),
      },
    ]);

    mocks.toPublicUserDtos.mockReturnValue([
      {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'user_456',
        username: 'helixuser',
        displayName: 'Helix User',
        status: 'pending',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ]);
  });

  it('lists users with default options', async () => {
    const service = new ListUsersService({ entityManager });

    const result = await service.execute();

    expect(mocks.userRepository.list).toHaveBeenCalledWith({
      limit: undefined,
      offset: undefined,
      includeDeleted: undefined,
    });

    expect(mocks.toPublicUserDtos).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'user_123',
        displayName: 'Sinless777',
        status: 'active',
      }),
      expect.objectContaining({
        id: 'user_456',
        displayName: 'Helix User',
        status: 'pending',
      }),
    ]);

    expect(result).toEqual([
      {
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'user_456',
        username: 'helixuser',
        displayName: 'Helix User',
        status: 'pending',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ]);
  });

  it('passes pagination options to the repository', async () => {
    const service = new ListUsersService({ entityManager });

    await service.execute({
      limit: 25,
      offset: 50,
    });

    expect(mocks.userRepository.list).toHaveBeenCalledWith({
      limit: 25,
      offset: 50,
      includeDeleted: undefined,
    });
  });

  it('passes includeDeleted to the repository', async () => {
    const service = new ListUsersService({ entityManager });

    await service.execute({
      includeDeleted: true,
    });

    expect(mocks.userRepository.list).toHaveBeenCalledWith({
      limit: undefined,
      offset: undefined,
      includeDeleted: true,
    });
  });

  it('returns an empty array when no users exist', async () => {
    mocks.userRepository.list.mockResolvedValue([]);
    mocks.toPublicUserDtos.mockReturnValue([]);

    const service = new ListUsersService({ entityManager });

    const result = await service.execute();

    expect(mocks.toPublicUserDtos).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });
});