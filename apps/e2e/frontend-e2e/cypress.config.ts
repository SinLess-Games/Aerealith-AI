import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';
import { defineConfig } from 'cypress';

const baseUrl = 'http://127.0.0.1:3000';

export default defineConfig({
  chromeWebSecurity: false,
  defaultCommandTimeout: 10_000,
  requestTimeout: 10_000,
  responseTimeout: 30_000,
  pageLoadTimeout: 60_000,

  retries: {
    runMode: 1,
    openMode: 0,
  },

  screenshotsFolder: 'dist/cypress/apps/e2e/frontend-e2e/screenshots',
  videosFolder: 'dist/cypress/apps/e2e/frontend-e2e/videos',
  video: false,
  trashAssetsBeforeRuns: true,

  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: 'src',
      webServerCommands: {
        default:
          'pnpm exec nx run frontend:dev --hostname=127.0.0.1 --port=3000',
      },
      ciWebServerCommand:
        'pnpm exec nx run frontend:start --hostname=127.0.0.1 --port=3000',
      ciBaseUrl: baseUrl,
    }),

    baseUrl,
    specPattern: 'src/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'src/support/e2e.ts'
  }
});