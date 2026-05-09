// apps/e2e/frontend-e2e/src/support/e2e.ts

// ***********************************************************
// This support file is processed and loaded automatically
// before Cypress test files.
// ***********************************************************

import './commands';

const githubLatestReleaseUrl =
  /^https:\/\/api\.github\.com\/repos\/(?:Sinless777|SinLess-Games)\/Helix\/releases\/latest(?:\?.*)?$/;

const turnstileScriptUrl =
  /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js(?:\?.*)?$/;

beforeEach(() => {
  cy.intercept(
    {
      method: 'GET',
      url: githubLatestReleaseUrl,
    },
    {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
      },
      body: {
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        draft: false,
        prerelease: false,
        published_at: '2026-05-08T00:00:00.000Z',
      },
    },
  ).as('githubRelease');

  cy.intercept(
    {
      method: 'GET',
      url: turnstileScriptUrl,
    },
    {
      statusCode: 200,
      headers: {
        'content-type': 'application/javascript',
      },
      body: `
        window.turnstile = {
          render: function (_container, options) {
            var widgetId = 'cypress-turnstile-widget';

            window.setTimeout(function () {
              if (options && typeof options.callback === 'function') {
                options.callback('cypress-turnstile-token');
              }
            }, 0);

            return widgetId;
          },
          reset: function () {},
          remove: function () {}
        };
      `,
    },
  ).as('turnstileScript');
});