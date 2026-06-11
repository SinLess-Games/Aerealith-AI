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
  distDir: '.next',

  compiler: {
    emotion: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  transpilePackages: [
    '@aerealith-ai/ui',
    '@aerealith-ai/config',
    '@aerealith-ai/flags',
    '@aerealith-ai/content',
    '@aerealith-ai/observability',
  ],

  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
  },

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

      '@aerealith-ai/ui': resolve(repoRoot, 'libs/ui/src/index.ts'),
      '@aerealith-ai/config': resolve(repoRoot, 'libs/config/src/index.ts'),
      '@aerealith-ai/flags': resolve(repoRoot, 'libs/flags/src/index.ts'),

      // Content root import:
      //   @aerealith-ai/content
      '@aerealith-ai/content$': resolve(
        repoRoot,
        'libs/content/src/index.ts',
      ),

      // Content subpath imports:
      //   @aerealith-ai/content/en/header
      //   @aerealith-ai/content/en/footer
      '@aerealith-ai/content': resolve(repoRoot, 'libs/content/src'),

      '@aerealith-ai/observability': resolve(
        repoRoot,
        'libs/observability/src/index.ts',
      ),
      '@aerealith-ai/observability/browser': resolve(
        repoRoot,
        'libs/observability/src/browser.ts',
      ),
      '@aerealith-ai/observability/profiler': resolve(
        repoRoot,
        'libs/observability/src/profiler/index.ts',
      ),

      '@aerealith-ai/db': resolvedDbEntry,

      'better-sqlite3': false,
      'mariadb/callback': false,
      mysql: false,
      mysql2: false,
      oracledb: false,
      sqlite3: false,
      tedious: false,
    };

    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      (warning) =>
        warning.message.includes(
          'require function is used in a way in which dependencies cannot be statically extracted',
        ) && (warning.module?.resource ?? '').includes('require-in-the-middle'),
    ];

    return config;
  },
};

export default nextConfig;
