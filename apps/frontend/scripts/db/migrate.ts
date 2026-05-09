import type { MigrateOptions } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';

import ormConfig, {
  databaseConnectionConfigured,
} from '../../../../libs/db/src/mikroorm-config.js';

type MigrationCommand =
  | 'check'
  | 'create'
  | 'down'
  | 'list'
  | 'pending'
  | 'tables'
  | 'up';

const commands = new Set<MigrationCommand>([
  'check',
  'create',
  'down',
  'list',
  'pending',
  'tables',
  'up',
]);

function printUsage(): never {
  console.error(
    [
      'Usage: pnpm db:migrate [-- --to <version>]',
      '       pnpm db:migration:create [-- --name <name> --blank --initial]',
      '       pnpm db:migration:down [-- --to <version> | --only <migration>]',
      '       pnpm db:migration:list',
      '       pnpm db:migration:pending',
      '       pnpm db:migration:check',
      '       pnpm db:tables',
    ].join('\n'),
  );

  process.exit(1);
}

function readFlag(args: string[], name: string): string | undefined {
  const prefixed = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));

  if (inline) {
    return inline.slice(prefixed.length);
  }

  const index = args.indexOf(`--${name}`);

  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function readMigrateOptions(args: string[]): MigrateOptions {
  const only = readFlag(args, 'only');
  const from = readFlag(args, 'from');
  const to = readFlag(args, 'to');

  if (!from && !to && only) {
    return {
      migrations: only.split(/[, ]+/).filter(Boolean),
    };
  }

  return {
    ...(from ? { from: from === '0' ? 0 : from } : {}),
    ...(to ? { to: to === '0' ? 0 : to } : {}),
  };
}

function formatDate(value: Date | string | undefined): string {
  if (!value) {
    return '';
  }

  return value instanceof Date ? value.toISOString() : value;
}

async function main(): Promise<void> {
  if (!databaseConnectionConfigured) {
    throw new Error(
      [
        'MikroORM database connection is missing.',
        'Set DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL.',
        'Alternatively set DATABASE_HOST, DATABASE_NAME, DATABASE_USER, and DATABASE_PASSWORD.',
      ].join(' '),
    );
  }

  const [rawCommand = 'up', ...args] = process.argv.slice(2);

  if (!commands.has(rawCommand as MigrationCommand)) {
    printUsage();
  }

  const command = rawCommand as MigrationCommand;
  const orm = await MikroORM.init({
    ...ormConfig,
    allowGlobalContext: true,
    connect: false,
    pool: {
      ...ormConfig.pool,
      min: 1,
      max: 2,
    },
    preferTs: true,
  });

  try {
    const migrator = orm.getMigrator();

    if (command === 'create') {
      const result = await migrator.createMigration(
        readFlag(args, 'path'),
        hasFlag(args, 'blank'),
        hasFlag(args, 'initial'),
        readFlag(args, 'name'),
      );

      if (result.diff.up.length === 0) {
        console.log('No changes required, schema is up-to-date');
      } else {
        console.log(`${result.fileName} successfully created`);
      }

      return;
    }

    if (command === 'check') {
      const needed = await migrator.checkMigrationNeeded();

      if (!needed) {
        console.log('No changes required, schema is up-to-date');
        return;
      }

      console.error('Changes detected. Please create a migration to update schema.');
      process.exitCode = 1;
      return;
    }

    if (command === 'list') {
      const executed = await migrator.getExecutedMigrations();

      if (executed.length === 0) {
        console.log('No migrations executed yet');
        return;
      }

      for (const migration of executed) {
        console.log(
          `${migration.name.replace(/\.[jt]s$/, '')}\t${formatDate(
            migration.executed_at,
          )}`,
        );
      }

      return;
    }

    if (command === 'pending') {
      const pending = await migrator.getPendingMigrations();

      if (pending.length === 0) {
        console.log('No pending migrations');
        return;
      }

      for (const migration of pending) {
        console.log(migration.name);
      }

      return;
    }

    if (command === 'tables') {
      const rows = await orm.em.getConnection().execute<
        {
          table_schema: string;
          table_name: string;
          table_type: string;
        }[]
      >(
        [
          'select table_schema, table_name, table_type',
          'from information_schema.tables',
          "where table_schema not like 'pg_%'",
          "and table_schema not like 'crdb_%'",
          "and table_schema not in ('information_schema')",
          'order by table_schema, table_name',
        ].join(' '),
      );

      console.log(`Found ${rows.length} tables`);

      for (const row of rows) {
        console.log(`${row.table_schema}.${row.table_name} (${row.table_type})`);
      }

      return;
    }

    await migrator[command](readMigrateOptions(args));
    console.log(
      command === 'up'
        ? 'Successfully migrated up to the latest version'
        : 'Successfully migrated down',
    );
  } finally {
    await orm.close(true);
  }
}

await main();
