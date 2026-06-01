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

@Entity({ tableName: 'user_app_connection' })
@Index({ name: 'idx_user_app_connection_user', properties: ['user'] })
@Index({ name: 'idx_user_app_connection_provider', properties: ['provider'] })
export class UserAppConnection extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text' })
  provider!: string;

  @Property({ type: 'text', fieldName: 'display_name' })
  displayName!: string;

  @Property({
    type: 'text',
    fieldName: 'connected_account_identifier',
    nullable: true,
  })
  connectedAccountIdentifier?: string | null = null;

  @Enum({ items: () => ProfileModuleStatus, nullable: false })
  status: ProfileModuleStatus = ProfileModuleStatus.Connected;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'connected_at',
    nullable: true,
  })
  connectedAt?: Date | null = null;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'last_sync_at',
    nullable: true,
  })
  lastSyncAt?: Date | null = null;

  @Property({
    type: 'json',
    columnType: 'jsonb',
    fieldName: 'scopes_summary',
    nullable: true,
  })
  scopesSummary: string[] = [];

  @Property({
    type: 'text',
    fieldName: 'secret_ref',
    nullable: true,
    hidden: true,
  })
  secretRef?: string | null = null;
}
