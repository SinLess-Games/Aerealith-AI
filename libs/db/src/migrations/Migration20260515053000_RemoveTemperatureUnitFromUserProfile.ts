import { Migration } from '@mikro-orm/migrations';

export class Migration20260515053000_RemoveTemperatureUnitFromUserProfile extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "user_profile" drop column "temperature_unit";');
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "user_profile" add column "temperature_unit" text check ("temperature_unit" in ('unspecified', 'default', 'locale_default', 'auto', 'custom', 'celsius', 'fahrenheit', 'kelvin', 'rankine')) null;`,
    );
  }
}
