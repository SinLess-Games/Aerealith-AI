import { describe, expect, it } from 'vitest';

import {
  toPrivateProfileDashboardDto,
  toPublicProfileDto,
} from './profile-dashboard.mapper';

const profile = {
  id: 'profile_123',
  userId: 'user_123',
  username: 'sinless777',
  handle: 'sinless777',
  displayName: 'Sinless777',
  avatarUrl: null,
  bannerUrl: null,
  bio: 'Building AI systems.',
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T01:00:00.000Z',
};

describe('profile-dashboard.mapper', () => {
  it('keeps public profile output free of private modules', () => {
    const result = toPublicProfileDto({
      profile,
      achievements: [
        {
          id: 'achievement_1',
          key: 'first_model',
          title: 'First Model',
          description: 'Trained a first model.',
          iconKey: 'model',
          points: 100,
          progressCurrent: 1,
          progressTarget: 1,
          unlocked: true,
          visibility: 'public',
        },
      ],
      files: [],
      reports: [],
    });

    expect(result.profile).toMatchObject({
      username: 'sinless777',
      displayName: 'Sinless777',
    });
    expect(result).not.toHaveProperty('appConnections');
    expect(result).not.toHaveProperty('integrations');
    expect(result.achievements).toHaveLength(1);
  });

  it('maps private dashboard modules separately', () => {
    const result = toPrivateProfileDashboardDto({
      profile,
      achievements: [],
      appConnections: [
        {
          id: 'connection_1',
          provider: 'github',
          displayName: 'GitHub',
          connectedAccountIdentifier: 'sinless777',
          status: 'connected',
        },
      ],
      integrations: [
        {
          id: 'integration_1',
          integrationKey: 'openai',
          provider: 'openai',
          displayName: 'OpenAI',
          enabled: true,
          status: 'enabled',
        },
      ],
      files: [
        { id: 'file_1', name: 'model-report.pdf', visibility: 'private' },
      ],
      reports: [{ id: 'report_1', title: 'Usage Report', type: 'usage' }],
      activity: [
        { id: 'activity_1', type: 'report', title: 'Generated report' },
      ],
    });

    expect(result.appConnections[0]?.provider).toBe('github');
    expect(result.integrations[0]?.integrationKey).toBe('openai');
    expect(result.files[0]?.visibility).toBe('private');
    expect(result.reports[0]?.type).toBe('usage');
    expect(result.activity[0]?.title).toBe('Generated report');
  });
});
