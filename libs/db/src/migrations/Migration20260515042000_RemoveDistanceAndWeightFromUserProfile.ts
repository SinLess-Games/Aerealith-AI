import { Migration } from '@mikro-orm/migrations';

export class Migration20260515042000_RemoveDistanceAndWeightFromUserProfile extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "user_profile" drop column "distance_unit", drop column "weight_unit";',
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "user_profile" add column "distance_unit" text null, add column "weight_unit" text null;`,
    );
  }
}
