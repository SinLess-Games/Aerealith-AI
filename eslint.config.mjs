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

const configFiles = [
  '**/*.config.ts',
  '**/*.config.mts',
  '**/*.config.cts',
  '**/*.config.js',
  '**/*.config.mjs',
  '**/*.config.cjs',
  '**/vite.config.*',
  '**/vitest.config.*',
  '**/wrangler.*',
];

export default [
  {
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
      '**/node_modules/**',
      '**/tmp/**',
      '**/temp/**',
      '**/.cache/**',
      '**/generated/**',
      '**/*.generated.*',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
      reportUnusedInlineConfigs: 'warn',
    },
  },

  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],

  {
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
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
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
    files: testFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },

  {
    files: configFiles,
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },

  {
    files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];