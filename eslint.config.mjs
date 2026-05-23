import nextPlugin from '@next/eslint-plugin-next';
import nx from '@nx/eslint-plugin';
const sourceFiles = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.cts',
  '**/*.mts',
  '**/*.js',
  '**/*.jsx',
  '**/*.cjs',
  '**/*.mjs',
];
const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'];
const javascriptFiles = ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'];
const testFiles = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/*.test.js',
  '**/*.test.jsx',
];
const e2eFiles = [
  'apps/e2e/**/*.ts',
  'apps/e2e/**/*.tsx',
  'apps/e2e/**/*.js',
  'apps/e2e/**/*.jsx',
  '**/*.cy.ts',
  '**/*.cy.tsx',
  '**/*.cy.js',
  '**/*.cy.jsx',
];
const appScriptFiles = [
  'scripts/**/*.ts',
  'scripts/**/*.tsx',
  'scripts/**/*.js',
  'scripts/**/*.jsx',
  'scripts/**/*.mjs',
  'scripts/**/*.cjs',
  'apps/*/scripts/**/*.ts',
  'apps/*/scripts/**/*.tsx',
  'apps/*/scripts/**/*.js',
  'apps/*/scripts/**/*.jsx',
  'apps/*/scripts/**/*.mjs',
  'apps/*/scripts/**/*.cjs',
  'apps/*/*/scripts/**/*.ts',
  'apps/*/*/scripts/**/*.tsx',
  'apps/*/*/scripts/**/*.js',
  'apps/*/*/scripts/**/*.jsx',
  'apps/*/*/scripts/**/*.mjs',
  'apps/*/*/scripts/**/*.cjs',
];
const configFiles = [
  '**/*.config.ts',
  '**/*.config.mts',
  '**/*.config.cts',
  '**/*.config.js',
  '**/*.config.mjs',
  '**/*.config.cjs',
  '**/eslint.config.*',
  '**/vite.config.*',
  '**/vitest.config.*',
];
const frontendFiles = [
  'apps/frontend/**/*.ts',
  'apps/frontend/**/*.tsx',
  'apps/frontend/**/*.js',
  'apps/frontend/**/*.jsx',
  'apps/frontend/**/*.mjs',
  'apps/frontend/**/*.cjs',
];
const generatedFiles = [
  '**/next-env.d.ts',
  '**/cloudflare-env.d.ts',
  '**/open-next-env.d.ts',
  '**/*.generated.*',
];

export default [
  {
    name: 'helix/global-ignores',
    ignores: [
      '**/.git/**',
      '**/.github/**',
      '**/.nx/**',
      '**/.turbo/**',
      '**/.vercel/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/wrangler.toml',
      '**/node_modules/**',
      '**/tmp/**',
      '**/temp/**',
      '**/.cache/**',
      '**/generated/**',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      ...generatedFiles,
    ],
  },
  {
    name: 'helix/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
      reportUnusedInlineConfigs: 'warn',
    },
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    name: 'helix/source-rules',
    files: sourceFiles,
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: false,
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': [
        'warn',
        {
          ignoreRestArgs: true,
          fixToUnknown: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    name: 'helix/next',
    files: frontendFiles,
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    name: 'helix/typescript',
    files: typescriptFiles,
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
    },
  },
  {
    name: 'helix/tests',
    files: testFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    name: 'helix/e2e',
    files: e2eFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    name: 'helix/app-scripts',
    files: appScriptFiles,
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    name: 'helix/config-files',
    files: configFiles,
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    name: 'helix/javascript',
    files: javascriptFiles,
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    name: 'helix/generated-files',
    files: generatedFiles,
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: ['**/vitest.config.*.timestamp*'],
  },
];
