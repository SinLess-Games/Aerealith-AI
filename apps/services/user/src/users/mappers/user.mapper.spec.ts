import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toPublicUserDto, toPublicUserDtos } from './user.mapper';

describe('user.mapper', () => {
  const now = new Date('2026-05-10T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toPublicUserDto', () => {
    it('maps a user to a public user dto', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        updatedAt: new Date('2026-05-10T01:00:00.000Z'),
      });

      expect(result).toEqual({
        id: 'user_123',
        username: 'sinless777',
        displayName: 'Sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses username as displayName when displayName is missing', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        displayName: null,
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.displayName).toBe('sinless777');
    });

    it('normalizes pending_verification to pending', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        status: 'pending_verification',
      });

      expect(result.status).toBe('pending');
    });

    it.each(['disabled', 'suspended', 'locked'] as const)(
      'normalizes %s to disabled',
      (status) => {
        const result = toPublicUserDto({
          id: 'user_123',
          username: 'sinless777',
          status,
        });

        expect(result.status).toBe('disabled');
      },
    );

    it('preserves deleted status', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        status: 'deleted',
      });

      expect(result.status).toBe('deleted');
    });

    it('defaults unknown status to pending', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        status: 'unknown-status',
      });

      expect(result.status).toBe('pending');
    });

    it('defaults missing status to pending', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
      });

      expect(result.status).toBe('pending');
    });

    it('uses current time when createdAt and updatedAt are missing', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        status: 'active',
      });

      expect(result.createdAt).toBe('2026-05-10T12:00:00.000Z');
      expect(result.updatedAt).toBe('2026-05-10T12:00:00.000Z');
    });

    it('preserves string dates', () => {
      const result = toPublicUserDto({
        id: 'user_123',
        username: 'sinless777',
        status: 'active',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.createdAt).toBe('2026-05-10T00:00:00.000Z');
      expect(result.updatedAt).toBe('2026-05-10T01:00:00.000Z');
    });

    it('throws when id is missing', () => {
      expect(() =>
        toPublicUserDto({
          username: 'sinless777',
          status: 'active',
        }),
      ).toThrow('USER_MAPPER_MISSING_USER_ID');
    });

    it('throws when username is missing', () => {
      expect(() =>
        toPublicUserDto({
          id: 'user_123',
          status: 'active',
        }),
      ).toThrow('USER_MAPPER_MISSING_USERNAME');
    });

    it('throws when username is null', () => {
      expect(() =>
        toPublicUserDto({
          id: 'user_123',
          username: null,
          status: 'active',
        }),
      ).toThrow('USER_MAPPER_MISSING_USERNAME');
    });
  });

  describe('toPublicUserDtos', () => {
    it('maps multiple users to public user dtos', () => {
      const result = toPublicUserDtos([
        {
          id: 'user_123',
          username: 'sinless777',
          displayName: 'Sinless777',
          status: 'active',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          id: 'user_456',
          username: 'helixuser',
          displayName: 'Helix User',
          status: 'pending_verification',
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);

      expect(result).toEqual([
        {
          id: 'user_123',
          username: 'sinless777',
          displayName: 'Sinless777',
          status: 'active',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          id: 'user_456',
          username: 'helixuser',
          displayName: 'Helix User',
          status: 'pending',
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array when no users are provided', () => {
      expect(toPublicUserDtos([])).toEqual([]);
    });
  });
});