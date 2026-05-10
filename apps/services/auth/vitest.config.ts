import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.toml',
      },
    }),
  ],

  test: {
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.nx', '.wrangler', 'coverage'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/apps/services/auth',
    },
  },
});
