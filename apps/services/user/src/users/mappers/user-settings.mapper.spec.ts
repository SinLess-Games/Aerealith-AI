import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  toUserSettingsDto,
  toUserSettingsDtos,
} from './user-settings.mapper';

describe('user-settings.mapper', () => {
  const now = new Date('2026-05-10T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toUserSettingsDto', () => {
    it('maps settings to a user settings dto', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        userId: 'user_123',
        username: 'sinless777',
        locale: 'en-US',
        timezone: 'America/Boise',
        theme: 'dark',
        emailNotificationsEnabled: true,
        marketingEmailsEnabled: false,
        analyticsEnabled: true,
        memoryEnabled: true,
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        updatedAt: new Date('2026-05-10T01:00:00.000Z'),
      });

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
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses mapper options over settings values', () => {
      const result = toUserSettingsDto(
        {
          id: 'settings_123',
          userId: 'settings_user_id',
          username: 'settings_username',
          locale: 'en-US',
          timezone: 'UTC',
          theme: 'light',
          emailNotificationsEnabled: true,
          marketingEmailsEnabled: false,
          analyticsEnabled: true,
          memoryEnabled: true,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          userId: 'option_user_id',
          username: 'option_username',
          defaultLocale: 'en-GB',
          defaultTimezone: 'America/Boise',
          defaultTheme: 'dark',
        },
      );

      expect(result).toEqual({
        userId: 'option_user_id',
        username: 'option_username',
        locale: 'en-US',
        timezone: 'UTC',
        theme: 'light',
        emailNotificationsEnabled: true,
        marketingEmailsEnabled: false,
        analyticsEnabled: true,
        memoryEnabled: true,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses related user values when settings values are missing', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        locale: 'en-US',
        timezone: 'America/Boise',
        theme: 'dark',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
        user: {
          id: 'user_123',
          username: 'sinless777',
        },
      });

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
        updatedAt: '2026-05-10T01:00:00.000Z',
      });
    });

    it('uses default locale timezone and theme when settings values are missing', () => {
      const result = toUserSettingsDto(
        {
          id: 'settings_123',
          userId: 'user_123',
          username: 'sinless777',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          defaultLocale: 'en-GB',
          defaultTimezone: 'America/Boise',
          defaultTheme: 'dark',
        },
      );

      expect(result.locale).toBe('en-GB');
      expect(result.timezone).toBe('America/Boise');
      expect(result.theme).toBe('dark');
    });

    it('uses built-in defaults when no default options are provided', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        userId: 'user_123',
        username: 'sinless777',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.locale).toBe('en-US');
      expect(result.timezone).toBe('UTC');
      expect(result.theme).toBe('system');
      expect(result.emailNotificationsEnabled).toBe(true);
      expect(result.marketingEmailsEnabled).toBe(false);
      expect(result.analyticsEnabled).toBe(true);
      expect(result.memoryEnabled).toBe(true);
    });

    it('preserves explicit false boolean settings', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        userId: 'user_123',
        username: 'sinless777',
        emailNotificationsEnabled: false,
        marketingEmailsEnabled: false,
        analyticsEnabled: false,
        memoryEnabled: false,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.emailNotificationsEnabled).toBe(false);
      expect(result.marketingEmailsEnabled).toBe(false);
      expect(result.analyticsEnabled).toBe(false);
      expect(result.memoryEnabled).toBe(false);
    });

    it('normalizes invalid theme values to fallback theme', () => {
      const result = toUserSettingsDto(
        {
          id: 'settings_123',
          userId: 'user_123',
          username: 'sinless777',
          theme: 'invalid-theme',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          defaultTheme: 'dark',
        },
      );

      expect(result.theme).toBe('dark');
    });

    it('normalizes invalid theme values to system when no fallback is provided', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        userId: 'user_123',
        username: 'sinless777',
        theme: 'invalid-theme',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T01:00:00.000Z',
      });

      expect(result.theme).toBe('system');
    });

    it('accepts system light and dark themes', () => {
      expect(
        toUserSettingsDto({
          id: 'settings_system',
          userId: 'user_123',
          username: 'sinless777',
          theme: 'system',
        }).theme,
      ).toBe('system');

      expect(
        toUserSettingsDto({
          id: 'settings_light',
          userId: 'user_123',
          username: 'sinless777',
          theme: 'light',
        }).theme,
      ).toBe('light');

      expect(
        toUserSettingsDto({
          id: 'settings_dark',
          userId: 'user_123',
          username: 'sinless777',
          theme: 'dark',
        }).theme,
      ).toBe('dark');
    });

    it('uses current time when createdAt and updatedAt are missing', () => {
      const result = toUserSettingsDto({
        id: 'settings_123',
        userId: 'user_123',
        username: 'sinless777',
      });

      expect(result.createdAt).toBe('2026-05-10T12:00:00.000Z');
      expect(result.updatedAt).toBe('2026-05-10T12:00:00.000Z');
    });

    it('throws when userId is missing', () => {
      expect(() =>
        toUserSettingsDto({
          id: 'settings_123',
          username: 'sinless777',
        }),
      ).toThrow('USER_SETTINGS_MAPPER_MISSING_USER_ID');
    });

    it('throws when username is missing', () => {
      expect(() =>
        toUserSettingsDto({
          id: 'settings_123',
          userId: 'user_123',
        }),
      ).toThrow('USER_SETTINGS_MAPPER_MISSING_USERNAME');
    });
  });

  describe('toUserSettingsDtos', () => {
    it('maps multiple settings records to user settings dtos', () => {
      const result = toUserSettingsDtos([
        {
          id: 'settings_123',
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
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          id: 'settings_456',
          userId: 'user_456',
          username: 'helixuser',
          locale: 'en-GB',
          timezone: 'UTC',
          theme: 'light',
          emailNotificationsEnabled: false,
          marketingEmailsEnabled: true,
          analyticsEnabled: false,
          memoryEnabled: false,
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);

      expect(result).toEqual([
        {
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
          updatedAt: '2026-05-10T01:00:00.000Z',
        },
        {
          userId: 'user_456',
          username: 'helixuser',
          locale: 'en-GB',
          timezone: 'UTC',
          theme: 'light',
          emailNotificationsEnabled: false,
          marketingEmailsEnabled: true,
          analyticsEnabled: false,
          memoryEnabled: false,
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T01:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array when no settings records are provided', () => {
      expect(toUserSettingsDtos([])).toEqual([]);
    });
  });
});