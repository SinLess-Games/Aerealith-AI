import { Migration } from '@mikro-orm/migrations';

export class Migration20260513000000_AddAuthCredentialFields extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "app_user" add column "username" text null;`);
    this.addSql(
      `alter table "app_user" add column "email_verified" boolean not null default false;`,
    );
    this.addSql(
      `alter table "app_user" add column "email_verified_at" timestamptz null;`,
    );
    this.addSql(`alter table "app_user" add column "password_hash" text null;`);
    this.addSql(
      `update "app_user" set "username" = lower(split_part("email", '@', 1)) where "username" is null;`,
    );
    this.addSql(`alter table "app_user" alter column "username" set not null;`);
    this.addSql(
      `create index "idx_app_user_username" on "app_user" ("username");`,
    );
    this.addSql(
      `alter table "app_user" add constraint "uq_app_user_username" unique ("username");`,
    );

    this.addSql(
      `alter table "user_session" add column "device_name" text null;`,
    );
    this.addSql(`alter table "user_session" add column "user_agent" text null;`);
    this.addSql(`alter table "user_session" add column "ip_address" text null;`);
    this.addSql(
      `alter table "user_session" add column "last_seen_at" timestamptz null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user_session" drop column "last_seen_at";`);
    this.addSql(`alter table "user_session" drop column "ip_address";`);
    this.addSql(`alter table "user_session" drop column "user_agent";`);
    this.addSql(`alter table "user_session" drop column "device_name";`);

    this.addSql(
      `alter table "app_user" drop constraint "uq_app_user_username";`,
    );
    this.addSql(`drop index "idx_app_user_username";`);
    this.addSql(`alter table "app_user" drop column "password_hash";`);
    this.addSql(`alter table "app_user" drop column "email_verified_at";`);
    this.addSql(`alter table "app_user" drop column "email_verified";`);
    this.addSql(`alter table "app_user" drop column "username";`);
  }
}
