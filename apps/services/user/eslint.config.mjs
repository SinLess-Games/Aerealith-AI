import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.wrangler/**',
      '.mf/**',
      'node_modules/**',
      'src/**/*.d.ts',
    ],
  },
  {
    files: ['apps/services/user/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['apps/services/user/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];