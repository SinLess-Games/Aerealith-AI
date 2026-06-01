import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base';
import { ProfileResourceVisibility } from '../../enums/profile-resource-visibility.enum';
import { User } from './user.entity';

@Entity({ tableName: 'user_achievement' })
@Index({ name: 'idx_user_achievement_user', properties: ['user'] })
@Index({ name: 'idx_user_achievement_visibility', properties: ['visibility'] })
@Index({ name: 'idx_user_achievement_unlocked', properties: ['unlockedAt'] })
export class UserAchievement extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text' })
  key!: string;

  @Property({ type: 'text' })
  title!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'text', fieldName: 'icon_key' })
  iconKey!: string;

  @Property({ type: 'integer', default: 0 })
  points = 0;

  @Property({ type: 'text', default: 'general' })
  category = 'general';

  @Property({ type: 'integer', fieldName: 'progress_current', default: 0 })
  progressCurrent = 0;

  @Property({ type: 'integer', fieldName: 'progress_target', default: 1 })
  progressTarget = 1;

  @Property({ type: 'boolean', default: false })
  unlocked = false;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'unlocked_at',
    nullable: true,
  })
  unlockedAt?: Date | null = null;

  @Enum({ items: () => ProfileResourceVisibility, nullable: false })
  visibility: ProfileResourceVisibility = ProfileResourceVisibility.Private;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  metadata: Record<string, unknown> = {};

  protected override getDeterministicIdSeed(): string | undefined {
    const userId = this.user?.id;
    return userId && this.key
      ? `user-achievement:${userId}:${this.key}`
      : undefined;
  }
}
