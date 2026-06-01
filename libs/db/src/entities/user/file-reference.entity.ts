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

@Entity({ tableName: 'user_file_reference' })
@Index({ name: 'idx_user_file_reference_user', properties: ['user'] })
@Index({
  name: 'idx_user_file_reference_visibility',
  properties: ['visibility'],
})
export class UserFileReference extends BaseEntity {
  @ManyToOne(() => User, {
    fieldName: 'user_id',
    nullable: false,
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', fieldName: 'mime_type', nullable: true })
  mimeType?: string | null = null;

  @Property({ type: 'bigint', fieldName: 'size_bytes', nullable: true })
  sizeBytes?: number | null = null;

  @Property({ type: 'text', fieldName: 'storage_ref' })
  storageRef!: string;

  @Enum({ items: () => ProfileResourceVisibility, nullable: false })
  visibility: ProfileResourceVisibility = ProfileResourceVisibility.Private;

  @Property({
    type: 'datetime',
    columnType: 'timestamptz',
    fieldName: 'last_modified_at',
    nullable: true,
  })
  lastModifiedAt?: Date | null = null;
}
