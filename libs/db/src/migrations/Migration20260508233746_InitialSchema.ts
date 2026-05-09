import { Migration } from '@mikro-orm/migrations';

export class Migration20260508233746_InitialSchema extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "app_user" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "email" text not null, "display_name" text not null, "status" text not null default 'active', "metadata" jsonb null, constraint "app_user_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_app_user_status" on "app_user" ("status");`);
    this.addSql(`create index "idx_app_user_email" on "app_user" ("email");`);
    this.addSql(`alter table "app_user" add constraint "uq_app_user_email" unique ("email");`);

    this.addSql(`create table "user_account" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "user_id" uuid not null, "provider" text not null, "account_id" text not null, "display_name" text not null, "management_url" text null, "status" text not null default 'active', "connected_at" timestamptz not null default CURRENT_TIMESTAMP, constraint "user_account_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_user_account_provider_account_id" on "user_account" ("provider", "account_id");`);
    this.addSql(`create index "idx_user_account_provider" on "user_account" ("provider");`);
    this.addSql(`create index "idx_user_account_user" on "user_account" ("user_id");`);
    this.addSql(`alter table "user_account" add constraint "uq_user_account_provider_account_id" unique ("provider", "account_id");`);

    this.addSql(`create table "user_profile" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "user_id" uuid not null, "handle" text not null, "avatar_url" text null, "bio" text null, "links" jsonb null, constraint "user_profile_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_profile" add constraint "user_profile_user_id_unique" unique ("user_id");`);
    this.addSql(`create index "idx_user_profile_handle" on "user_profile" ("handle");`);
    this.addSql(`alter table "user_profile" add constraint "uq_user_profile_handle" unique ("handle");`);
    this.addSql(`alter table "user_profile" add constraint "uq_user_profile_user" unique ("user_id");`);

    this.addSql(`create table "user_session" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "session_token" text not null, "expires" timestamptz not null, "user_id" uuid not null, constraint "user_session_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_user_session_user_expires" on "user_session" ("user_id", "expires");`);
    this.addSql(`create index "idx_user_session_expires" on "user_session" ("expires");`);
    this.addSql(`create index "idx_user_session_user" on "user_session" ("user_id");`);
    this.addSql(`alter table "user_session" add constraint "uq_user_session_token" unique ("session_token");`);

    this.addSql(`create table "user_settings" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "user_id" uuid not null, "notifications" jsonb null, "privacy" jsonb null, "accessibility" jsonb null, "product" jsonb null, constraint "user_settings_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_settings" add constraint "user_settings_user_id_unique" unique ("user_id");`);
    this.addSql(`create index "idx_user_settings_user" on "user_settings" ("user_id");`);
    this.addSql(`alter table "user_settings" add constraint "uq_user_settings_user" unique ("user_id");`);

    this.addSql(`create table "user_verification_token" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "identifier" text not null, "user_id" uuid not null, "token" text not null, "purpose" text not null default 'email_verification', "expires" timestamptz not null, "consumed_at" timestamptz null, constraint "user_verification_token_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_user_verification_token_expires" on "user_verification_token" ("expires");`);
    this.addSql(`create index "idx_user_verification_token_user_expires" on "user_verification_token" ("user_id", "expires");`);
    this.addSql(`create index "idx_user_verification_token_user" on "user_verification_token" ("user_id");`);
    this.addSql(`create index "idx_user_verification_token_token" on "user_verification_token" ("token");`);
    this.addSql(`create index "idx_user_verification_token_identifier" on "user_verification_token" ("identifier");`);
    this.addSql(`alter table "user_verification_token" add constraint "uq_user_verification_token_identifier_token" unique ("identifier", "token");`);

    this.addSql(`create table "waitlist" ("id" uuid not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "email" text not null, constraint "waitlist_pkey" primary key ("id"));`);
    this.addSql(`alter table "waitlist" add constraint "waitlist_email_unique" unique ("email");`);

    this.addSql(`alter table "user_account" add constraint "user_account_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "user_profile" add constraint "user_profile_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "user_session" add constraint "user_session_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "user_settings" add constraint "user_settings_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "user_verification_token" add constraint "user_verification_token_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user_account" drop constraint "user_account_user_id_foreign";`);

    this.addSql(`alter table "user_profile" drop constraint "user_profile_user_id_foreign";`);

    this.addSql(`alter table "user_session" drop constraint "user_session_user_id_foreign";`);

    this.addSql(`alter table "user_settings" drop constraint "user_settings_user_id_foreign";`);

    this.addSql(`alter table "user_verification_token" drop constraint "user_verification_token_user_id_foreign";`);

    this.addSql(`drop table if exists "app_user" cascade;`);

    this.addSql(`drop table if exists "user_account" cascade;`);

    this.addSql(`drop table if exists "user_profile" cascade;`);

    this.addSql(`drop table if exists "user_session" cascade;`);

    this.addSql(`drop table if exists "user_settings" cascade;`);

    this.addSql(`drop table if exists "user_verification_token" cascade;`);

    this.addSql(`drop table if exists "waitlist" cascade;`);
  }

}
