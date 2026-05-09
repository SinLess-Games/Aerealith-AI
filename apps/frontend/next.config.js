// apps/frontend/next.config.js
// Next 15/16-compatible, no @nx/next runtime plugin

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

const dbDistEntry = resolve(repoRoot, 'dist/libs/db/libs/db/src/index.js');
const dbSourceEntry = resolve(repoRoot, 'libs/db/src/index.ts');

const resolvedDbEntry = existsSync(dbDistEntry) ? dbDistEntry : dbSourceEntry;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Nx’s dist path locally; let deployment adapters use their expected output.
  distDir: '.next',

  compiler: {
    emotion: true,
  },

  // Transpile browser/UI-safe workspace libraries.
  //
  // Do NOT include @helix-ai/db here.
  // The DB package contains MikroORM decorators and should be consumed from
  // its compiled output during the frontend build.
  transpilePackages: [
    '@helix-ai/ui',
    '@helix-ai/config',
    '@helix-ai/flags',
  ],

  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
  },

  // Keep server-only database/runtime packages out of Next's server bundle.
  // Route handlers are bundled by default, and this option opts packages out
  // when they need native/server-specific resolution.
  serverExternalPackages: [
    '@mikro-orm/core',
    '@mikro-orm/postgresql',
    '@mikro-orm/reflection',
    '@mikro-orm/migrations',
    'pg',
    'pg-cloudflare',
  ],

  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),

      // Source aliases for frontend-safe workspace libraries.
      '@helix-ai/ui': resolve(repoRoot, 'libs/ui/src/index.ts'),
      '@helix-ai/config': resolve(repoRoot, 'libs/config/src/index.ts'),
      '@helix-ai/flags': resolve(repoRoot, 'libs/flags/src/index.ts'),

      // IMPORTANT:
      // Use the compiled DB package when available so Next does not parse
      // raw MikroORM TypeScript decorators from libs/db/src.
      '@helix-ai/db': resolvedDbEntry,

      // Knex/MikroORM optional dialect packages.
      // The app only uses PostgreSQL.
      'better-sqlite3': false,
      'mariadb/callback': false,
      mysql: false,
      mysql2: false,
      oracledb: false,
      sqlite3: false,
      tedious: false,
    };

    // Your workspace libraries use ESM-style `.js` imports in TypeScript source.
    // This lets Webpack resolve `./file.js` to `./file.ts` during Next builds.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    return config;
  },
};

// Safety: strip any accidental legacy `eslint` key.
if ('eslint' in nextConfig) {
  delete nextConfig.eslint;
}

export default nextConfig;
