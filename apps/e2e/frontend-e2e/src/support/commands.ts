/// <reference types="cypress" />

import type { Interception } from 'cypress/types/net-stubbing';

import { waitlist } from './app.po';

type WaitlistRequestBody = {
  email?: string;
  turnstileToken?: string;
};

type WaitlistResponseBody = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  data?: {
    message?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      login(email: string, password: string): Chainable<Subject>;

      stubWaitlist(
        statusCode?: number,
        body?: WaitlistResponseBody,
        aliasName?: string,
      ): Chainable<void>;

      submitWaitlist(
        email: string,
        aliasName?: string,
      ): Chainable<Interception<WaitlistRequestBody, WaitlistResponseBody>>;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

Cypress.Commands.add('login', (email: string, password: string): void => {
  Cypress.log({
    name: 'login',
    message: `Login command called for ${email}`,
    consoleProps: () => ({
      email,
      passwordLength: password.length,
    }),
  });
});

Cypress.Commands.add(
  'stubWaitlist',
  (
    statusCode = 201,
    body: WaitlistResponseBody = {
      success: true,
      data: {
        message: 'You have been added to the waitlist.',
      },
    },
    aliasName = 'waitlist',
  ): void => {
    cy.intercept(
      {
        method: 'POST',
        url: '**/api/V1/waitlist',
      },
      {
        statusCode,
        headers: {
          'content-type': 'application/json',
        },
        body,
      },
    ).as(aliasName);
  },
);

Cypress.Commands.add(
  'submitWaitlist',
  (
    email: string,
    aliasName = 'waitlist',
  ): Cypress.Chainable<
    Interception<WaitlistRequestBody, WaitlistResponseBody>
  > => {
    waitlist.emailInput().should('be.visible').clear().type(email);

    waitlist.submitButton().should('be.visible').and('not.be.disabled').click();

    return cy.wait<WaitlistRequestBody, WaitlistResponseBody>(
      `@${aliasName}`,
    );
  },
);