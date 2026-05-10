import { defineConfig } from 'vitest/config';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/services/auth',

  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

  test: {
    name: 'auth',
    watch: false,
    globals: true,
    environment: 'node',

    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    exclude: [
      'node_modules',
      'dist',
      '../../../dist',
      '../../../coverage',
      'src/**/*.d.ts',
    ],

    reporters: ['default'],

    clearMocks: true,
    restoreMocks: true,

    coverage: {
      provider: 'v8' as const,
      reportsDirectory: '../../../coverage/apps/services/auth',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/main.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
    },
  },
}));
