import { BeforeCreate, BeforeUpdate, Entity, Property } from '@mikro-orm/core';

import { BaseEntity } from '../../entity.base.js';

@Entity({ tableName: 'waitlist' })
export class Waitlist extends BaseEntity {
  @Property({ type: 'text', unique: true })
  email!: string;

  constructor(email: string) {
    super();
    this.email = email;
  }

  @BeforeCreate()
  @BeforeUpdate()
  normalizeEmail(): void {
    this.email = this.email.trim().toLowerCase();
  }
}