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
import { User } from './user.entity';

@Entity({ tableName: 'user_integration' })
@Index({ name: 'idx_user_integration_user', properties: ['user'] })
@Index({ name: 'idx_user_integration_key', properties: ['integrationKey'] })
export class UserIntegration extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text', fieldName: 'integration_key' })
  integrationKey!: string;

  @Property({ type: 'text' })
  provider!: string;

  @Property({ type: 'text', fieldName: 'display_name' })
  displayName!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null = null;

  @Property({ type: 'boolean', default: true })
  enabled = true;

  @Enum({ items: () => ProfileModuleStatus, nullable: false })
  status: ProfileModuleStatus = ProfileModuleStatus.Enabled;

  @Property({
    type: 'json',
    columnType: 'jsonb',
    fieldName: 'health_metadata',
    nullable: true,
  })
  healthMetadata: Record<string, unknown> = {};

  @Property({
    type: 'text',
    fieldName: 'secret_ref',
    nullable: true,
    hidden: true,
  })
  secretRef?: string | null = null;
}
