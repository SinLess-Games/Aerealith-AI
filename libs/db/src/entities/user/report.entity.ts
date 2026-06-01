import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
  type Rel,
} from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base';
import { ProfileModuleStatus } from '../../enums/profile-module-status.enum';
import { ProfileResourceVisibility } from '../../enums/profile-resource-visibility.enum';
import { UserReportType } from '../../enums/user-report-type.enum';
import { User } from './user.entity';

@Entity({ tableName: 'user_report' })
@Index({ name: 'idx_user_report_user', properties: ['user'] })
@Index({ name: 'idx_user_report_visibility', properties: ['visibility'] })
export class UserReport extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text' })
  title!: string;

  @Enum({ items: () => UserReportType, nullable: false })
  type: UserReportType = UserReportType.Usage;

  @Enum({ items: () => ProfileModuleStatus, nullable: false })
  status: ProfileModuleStatus = ProfileModuleStatus.Active;

  @Enum({ items: () => ProfileResourceVisibility, nullable: false })
  visibility: ProfileResourceVisibility = ProfileResourceVisibility.Private;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'generated_at',
    nullable: true,
  })
  generatedAt?: Date | null = null;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  metadata: Record<string, unknown> = {};

  @Property({
    type: 'text',
    fieldName: 'artifact_ref',
    nullable: true,
    hidden: true,
  })
  artifactRef?: string | null = null;
}
