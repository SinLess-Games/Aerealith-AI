import type { EntityManager, Loaded } from '@mikro-orm/postgresql';

import { UserAchievement } from '../../entities/user/achievement.entity';
import { UserActivityEvent } from '../../entities/user/activity-event.entity';
import { UserAppConnection } from '../../entities/user/app-connection.entity';
import { UserFileReference } from '../../entities/user/file-reference.entity';
import { UserIntegration } from '../../entities/user/integration.entity';
import { UserReport } from '../../entities/user/report.entity';
import { ProfileResourceVisibility } from '../../enums/profile-resource-visibility.enum';

export class ProfileDashboardRepository {
  constructor(private readonly entityManager: EntityManager) {}

  listAchievements(
    userId: string,
    publicOnly = false,
  ): Promise<Loaded<UserAchievement>[]> {
    return this.entityManager.find(
      UserAchievement,
      {
        user: userId,
        ...(publicOnly ? { visibility: ProfileResourceVisibility.Public } : {}),
      },
      { orderBy: { unlockedAt: 'desc', createdAt: 'desc' }, limit: 50 },
    );
  }

  listAppConnections(userId: string): Promise<Loaded<UserAppConnection>[]> {
    return this.entityManager.find(
      UserAppConnection,
      { user: userId },
      { orderBy: { connectedAt: 'desc', createdAt: 'desc' }, limit: 50 },
    );
  }

  listIntegrations(userId: string): Promise<Loaded<UserIntegration>[]> {
    return this.entityManager.find(
      UserIntegration,
      { user: userId },
      { orderBy: { updatedAt: 'desc' }, limit: 50 },
    );
  }

  listFiles(
    userId: string,
    publicOnly = false,
  ): Promise<Loaded<UserFileReference>[]> {
    return this.entityManager.find(
      UserFileReference,
      {
        user: userId,
        ...(publicOnly ? { visibility: ProfileResourceVisibility.Public } : {}),
      },
      { orderBy: { lastModifiedAt: 'desc', updatedAt: 'desc' }, limit: 50 },
    );
  }

  listReports(
    userId: string,
    publicOnly = false,
  ): Promise<Loaded<UserReport>[]> {
    return this.entityManager.find(
      UserReport,
      {
        user: userId,
        ...(publicOnly ? { visibility: ProfileResourceVisibility.Public } : {}),
      },
      { orderBy: { generatedAt: 'desc', createdAt: 'desc' }, limit: 50 },
    );
  }

  listActivity(userId: string): Promise<Loaded<UserActivityEvent>[]> {
    return this.entityManager.find(
      UserActivityEvent,
      { user: userId },
      { orderBy: { createdAt: 'desc' }, limit: 25 },
    );
  }
}
