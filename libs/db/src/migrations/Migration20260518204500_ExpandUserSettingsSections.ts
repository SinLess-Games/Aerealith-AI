import { Migration } from '@mikro-orm/migrations';

export class Migration20260518204500_ExpandUserSettingsSections extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "user_settings" add column "metadata" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "account" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "ai" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "appearance" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "communication" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "content" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "developer" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "integrations" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "localization" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "memory" jsonb null;`);
    this.addSql(`alter table "user_settings" add column "security" jsonb null;`);
    this.addSql(`alter table "user_settings" drop column if exists "product";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user_settings" add column "product" jsonb null;`);
    this.addSql(`alter table "user_settings" drop column if exists "metadata";`);
    this.addSql(`alter table "user_settings" drop column if exists "account";`);
    this.addSql(`alter table "user_settings" drop column if exists "ai";`);
    this.addSql(`alter table "user_settings" drop column if exists "appearance";`);
    this.addSql(`alter table "user_settings" drop column if exists "communication";`);
    this.addSql(`alter table "user_settings" drop column if exists "content";`);
    this.addSql(`alter table "user_settings" drop column if exists "developer";`);
    this.addSql(`alter table "user_settings" drop column if exists "integrations";`);
    this.addSql(`alter table "user_settings" drop column if exists "localization";`);
    this.addSql(`alter table "user_settings" drop column if exists "memory";`);
    this.addSql(`alter table "user_settings" drop column if exists "security";`);
  }
}
