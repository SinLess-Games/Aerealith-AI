import cypress from 'eslint-plugin-cypress';

import baseConfig from '../../../eslint.config.mjs';

const cypressRecommendedRules = cypress.configs?.recommended?.rules ?? {};

export default [
  ...baseConfig,

  {
    name: 'frontend-e2e/cypress',
    files: [
      '**/*.cy.ts',
      '**/*.cy.tsx',
      '**/*.cy.js',
      '**/*.cy.jsx',
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.js',
      'src/**/*.jsx',
    ],
    plugins: {
      cypress,
    },
    languageOptions: {
      globals: {
        cy: 'readonly',
        Cypress: 'readonly',
        expect: 'readonly',
        assert: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        describe: 'readonly',
        context: 'readonly',
        it: 'readonly',
      },
    },
    rules: {
      ...cypressRecommendedRules,

      '@nx/enforce-module-boundaries': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];