import { Migration } from '@mikro-orm/migrations';

export class Migration20260515204737_UpdateProfileIdentityEnums extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user_profile" drop constraint if exists "user_profile_sex_check";`);
    this.addSql(`alter table "user_profile" drop constraint if exists "user_profile_time_format_check";`);

    this.addSql(`alter table "user_profile" alter column "field_visibility" type jsonb using ("field_visibility"::jsonb);`);
    this.addSql(`alter table "user_profile" alter column "field_visibility" set default '{"displayName":"public","givenName":"private","middleName":"private","familyName":"private","pronouns":"public","avatarUrl":"public","bannerUrl":"public","bio":"public","locationLabel":"public","country":"public","gender":"private","sex":"private","sexuality":"private","primaryLanguage":"public","languages":"public","locale":"private","timezone":"private","timezoneUtc":"private","timezoneGreenwich":"private","weekStartDay":"private","dateFormat":"private","timeFormat":"private","nameDisplayOrder":"private","measurementSystem":"private","contentMaturity":"private","websiteUrl":"public","links":"public","createdAt":"public","updatedAt":"private"}';`);
    this.addSql(`alter table "user_profile" alter column "sex" type text using (case "sex" when 0 then 'male' when 1 then 'female' when 2 then 'hermaphrodite' else null end);`);
    this.addSql(`update "user_profile" set "time_format" = case when "time_format" in ('h:mm a', 'hh:mm a', 'h:mm:ss a', 'hh:mm:ss a', 'h:mm aaa', 'hh:mm aaa', 'h a', 'hh a', 'h:mm a z', 'h:mm a zzzz', 'h:mma', 'hh:mma') then 'twelve-hour' when "time_format" in ('H:mm', 'HH:mm', 'H:mm:ss', 'HH:mm:ss', 'HH:mm:ss.SSS', 'HH:mm:ssXXX', 'HH:mm:ss.SSSXXX', 'H', 'HH', 'HH:mm z', 'HH:mm zzzz', 'Hmm', 'HHmm') then 'twenty-four-hour' when "time_format" in ('unspecified', 'twelve-hour', 'twenty-four-hour') then "time_format" else 'unspecified' end where "time_format" is not null;`);
    this.addSql(`alter table "user_profile" add constraint "user_profile_sex_check" check("sex" in ('male', 'female', 'hermaphrodite'));`);
    this.addSql(`alter table "user_profile" add constraint "user_profile_time_format_check" check("time_format" in ('unspecified', 'twelve-hour', 'twenty-four-hour'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user_profile" drop constraint if exists "user_profile_sex_check";`);
    this.addSql(`alter table "user_profile" drop constraint if exists "user_profile_time_format_check";`);

    this.addSql(`alter table "user_profile" alter column "field_visibility" type jsonb using ("field_visibility"::jsonb);`);
    this.addSql(`alter table "user_profile" alter column "field_visibility" set default '{"displayName":"public","firstName":"private","middleName":"private","lastName":"private","pronouns":"public","avatarUrl":"public","bannerUrl":"public","bio":"public","locationLabel":"public","country":"public","gender":"private","sex":"private","sexuality":"private","primaryLanguage":"public","languages":"public","locale":"private","timezone":"private","timezoneUtc":"private","timezoneGreenwich":"private","weekStartDay":"private","dateFormat":"private","timeFormat":"private","nameDisplayOrder":"private","measurementSystem":"private","contentMaturity":"private","websiteUrl":"public","links":"public","createdAt":"public","updatedAt":"private"}';`);
    this.addSql(`alter table "user_profile" alter column "sex" type smallint using (case "sex" when 'male' then 0 when 'female' then 1 when 'hermaphrodite' then 2 else null end);`);
    this.addSql(`alter table "user_profile" add constraint "user_profile_time_format_check" check("time_format" in ('unspecified', 'default', 'locale_default', 'auto', 'custom', 'h:mm a', 'hh:mm a', 'h:mm:ss a', 'hh:mm:ss a', 'h:mm aaa', 'hh:mm aaa', 'H:mm', 'HH:mm', 'H:mm:ss', 'HH:mm:ss', 'HH:mm:ss', 'HH:mm', 'HH:mm:ss.SSS', 'HH:mm:ssXXX', 'HH:mm:ss.SSSXXX', 'h a', 'hh a', 'H', 'HH', 'mm:ss', 'mm:ss.SSS', 'h:mm a z', 'h:mm a zzzz', 'HH:mm z', 'HH:mm zzzz', 'h:mma', 'hh:mma', 'Hmm', 'HHmm'));`);
  }

}
