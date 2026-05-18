import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  toUserProfileDto,
  toUserProfileDtos,
} from './user-profile.mapper';

describe('user-profile.mapper', () => {
  const now = new Date('2026-05-10T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toUserProfileDto', () => {
    it('maps a profile to a user profile dto', () => {
      const result = toUserProfileDto({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Game developer and full-stack developer.',
        locationLabel: 'Idaho',
        websiteUrl: 'https://sinlessgamesllc.com',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        updatedAt: new Date('2026-05-10T01:00:00.000Z'),
      });

      expect(result).toMatchObject({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
        handle: 'sinless777',
        displayName: 'Sinless777',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Game developer and full-stack developer.',
        locationLabel: 'Idaho',
        websiteUrl: 'https://sinlessgamesllc.com',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses mapper options over profile values', () => {
      const result = toUserProfileDto(
        {
          id: 'profile_123',
          userId: 'profile_user_id',
          username: 'profile_username',
          displayName: 'Profile Display Name',
          avatarUrl: null,
          bio: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          userId: 'option_user_id',
          username: 'option_username',
          displayName: 'Option Display Name',
        },
      );

      expect(result).toMatchObject({
        id: 'profile_123',
        userId: 'option_user_id',
        username: 'option_username',
        handle: 'option_username',
        displayName: 'Option Display Name',
        avatarUrl: null,
        bio: null,
        locationLabel: null,
        websiteUrl: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses related user values when profile values are missing', () => {
      const result = toUserProfileDto({
        id: 'profile_123',
        avatarUrl: null,
        bio: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
        user: {
          id: 'user_123',
          username: 'sinless777',
          displayName: 'Sinless777',
        },
      });

      expect(result).toMatchObject({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
        handle: 'sinless777',
        displayName: 'Sinless777',
        avatarUrl: null,
        bio: null,
        locationLabel: null,
        websiteUrl: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses username as displayName when displayName is missing', () => {
      const result = toUserProfileDto({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
        displayName: null,
        avatarUrl: null,
        bio: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.displayName).toBe('sinless777');
    });

    it('defaults nullable profile fields to null', () => {
      const result = toUserProfileDto({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.avatarUrl).toBeNull();
      expect(result.bio).toBeNull();
      expect(result.locationLabel).toBeNull();
      expect(result.websiteUrl).toBeNull();
    });

    it('uses current time when createdAt and updatedAt are missing', () => {
      const result = toUserProfileDto({
        id: 'profile_123',
        userId: 'user_123',
        username: 'sinless777',
      });

      expect(result.createdAt).toBe('2026-05-10T12:00:00.000Z');
      expect(result.updatedAt).toBe('2026-05-10T12:00:00.000Z');
    });

    it('throws when userId is missing', () => {
      expect(() =>
        toUserProfileDto({
          id: 'profile_123',
          username: 'sinless777',
        }),
      ).toThrow('USER_PROFILE_MAPPER_MISSING_USER_ID');
    });

    it('throws when username is missing', () => {
      expect(() =>
        toUserProfileDto({
          id: 'profile_123',
          userId: 'user_123',
        }),
      ).toThrow('USER_PROFILE_MAPPER_MISSING_USERNAME');
    });
  });

  describe('toUserProfileDtos', () => {
    it('maps multiple profiles to user profile dtos', () => {
      const result = toUserProfileDtos([
        {
          id: 'profile_123',
          userId: 'user_123',
          username: 'sinless777',
          displayName: 'Sinless777',
          avatarUrl: null,
          bio: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          id: 'profile_456',
          userId: 'user_456',
          username: 'helixuser',
          displayName: 'Helix User',
          avatarUrl: null,
          bio: 'Second profile.',
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);

      expect(result).toMatchObject([
        {
          id: 'profile_123',
          userId: 'user_123',
          username: 'sinless777',
          handle: 'sinless777',
          displayName: 'Sinless777',
          avatarUrl: null,
          bio: null,
          locationLabel: null,
          websiteUrl: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          id: 'profile_456',
          userId: 'user_456',
          username: 'helixuser',
          handle: 'helixuser',
          displayName: 'Helix User',
          avatarUrl: null,
          bio: 'Second profile.',
          locationLabel: null,
          websiteUrl: null,
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array when no profiles are provided', () => {
      expect(toUserProfileDtos([])).toEqual([]);
    });
  });
});
