import { Entity, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base';
import { User } from './user.entity';

@Entity({ tableName: 'user_activity_event' })
@Index({ name: 'idx_user_activity_event_user', properties: ['user'] })
@Index({ name: 'idx_user_activity_event_created', properties: ['createdAt'] })
export class UserActivityEvent extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text' })
  type!: string;

  @Property({ type: 'text' })
  title!: string;

  @Property({ type: 'text', nullable: true })
  description?: string | null = null;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  metadata: Record<string, unknown> = {};
}
