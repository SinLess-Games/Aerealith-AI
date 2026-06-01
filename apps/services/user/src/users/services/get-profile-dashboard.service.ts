import type { EntityManager } from '@mikro-orm/postgresql';

import {
  UserErrorCode,
  type PrivateUserProfileDashboardDto,
  type PublicUserProfileDto,
} from '@aerealith-ai/contracts';
import {
  ProfileDashboardRepository,
  ProfileRepository,
  ProfileVisibility,
  UserRepository,
} from '@aerealith-ai/db';

import {
  toPrivateProfileDashboardDto,
  toPublicProfileDto,
  toUserProfileDto,
  type UserProfileMapperInput,
} from '../mappers';

export interface GetProfileDashboardServiceOptions {
  entityManager: EntityManager;
}

export class GetProfileDashboardServiceError extends Error {
  constructor(
    public readonly code:
      | typeof UserErrorCode.USER_NOT_FOUND
      | typeof UserErrorCode.USER_PROFILE_NOT_FOUND
      | 'PROFILE_PRIVATE',
    message: string,
  ) {
    super(message);
    this.name = 'GetProfileDashboardServiceError';
  }
}

export class GetProfileDashboardService {
  private readonly users: UserRepository;
  private readonly profiles: ProfileRepository;
  private readonly dashboard: ProfileDashboardRepository;

  constructor(options: GetProfileDashboardServiceOptions) {
    this.users = new UserRepository(options.entityManager);
    this.profiles = new ProfileRepository(options.entityManager);
    this.dashboard = new ProfileDashboardRepository(options.entityManager);
  }

  async getPublic(username: string): Promise<PublicUserProfileDto> {
    const base = await this.getBaseProfile(username);

    if (base.profile.visibility !== ProfileVisibility.Public) {
      throw new GetProfileDashboardServiceError(
        'PROFILE_PRIVATE',
        'Profile is not public.',
      );
    }

    return toPublicProfileDto({
      profile: base.profile,
      achievements: [],
      files: [],
      reports: [],
    });
  }

  async getPrivate(username: string): Promise<PrivateUserProfileDashboardDto> {
    const base = await this.getBaseProfile(username);
    const achievements = await this.safeListModule(() =>
      this.dashboard.listAchievements(base.userId),
    );
    const appConnections = await this.safeListModule(() =>
      this.dashboard.listAppConnections(base.userId),
    );
    const integrations = await this.safeListModule(() =>
      this.dashboard.listIntegrations(base.userId),
    );
    const files = await this.safeListModule(() =>
      this.dashboard.listFiles(base.userId),
    );
    const reports = await this.safeListModule(() =>
      this.dashboard.listReports(base.userId),
    );
    const activity = await this.safeListModule(() =>
      this.dashboard.listActivity(base.userId),
    );

    return toPrivateProfileDashboardDto({
      profile: base.profile,
      achievements,
      appConnections,
      integrations,
      files,
      reports,
      activity,
    });
  }

  private async getBaseProfile(
    username: string,
  ): Promise<{ userId: string; profile: ReturnType<typeof toUserProfileDto> }> {
    const user = await this.users.findByUsername(username);

    if (!user) {
      throw new GetProfileDashboardServiceError(
        UserErrorCode.USER_NOT_FOUND,
        'User not found.',
      );
    }

    const userId = String(user.id);
    const profile = await this.profiles.findByUserId(userId);

    if (!profile) {
      throw new GetProfileDashboardServiceError(
        UserErrorCode.USER_PROFILE_NOT_FOUND,
        'User profile not found.',
      );
    }

    return {
      userId,
      profile: toUserProfileDto(profile as UserProfileMapperInput, {
        userId,
        username,
      }),
    };
  }

  private async safeListModule<T>(list: () => Promise<T[]>): Promise<T[]> {
    try {
      return await list();
    } catch {
      return [];
    }
  }
}
