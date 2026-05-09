import { waitlist } from '../support/app.po';

const validEmail = 'user@example.com';

describe('Waitlist form', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('validates the email field before submitting', () => {
    waitlist.section().should('be.visible');
    waitlist.submitButton().should('be.disabled');

    waitlist.emailInput().type('invalid-email');
    waitlist.submitButton().should('be.disabled');

    waitlist
      .form()
      .contains('Please enter a valid email')
      .should('be.visible');

    waitlist.emailInput().clear().type(validEmail);

    waitlist.submitButton().should('be.enabled');
  });

  it('submits a trimmed email and shows the success message', () => {
    cy.stubWaitlist(
      201,
      {
        success: true,
        data: {
          message: 'You have been added to the waitlist.',
        },
      },
      'waitlistSuccess',
    );

    cy.submitWaitlist('  Success@Example.COM  ', 'waitlistSuccess').then(
      (interception) => {
        expect(interception.request.body).to.include({
          email: 'Success@Example.COM',
        });

        if ('turnstileToken' in interception.request.body) {
          expect(interception.request.body.turnstileToken).to.be.a('string');
        }
      },
    );

    waitlist
      .successAlert()
      .should('be.visible')
      .and('contain.text', 'You have been added to the waitlist.');

    waitlist.emailInput().should('have.value', '');
  });

  it('shows an already-on-waitlist response without clearing the email', () => {
    cy.stubWaitlist(
      409,
      {
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'This email is already on the waitlist.',
        },
      },
      'waitlistDuplicate',
    );

    cy.submitWaitlist('existing@example.com', 'waitlistDuplicate');

    waitlist
      .errorAlert()
      .should('be.visible')
      .and('contain.text', 'This email is already on the waitlist.');

    waitlist.emailInput().should('have.value', 'existing@example.com');
    waitlist.submitButton().should('be.enabled');
  });

  it('shows server error messages from the API', () => {
    cy.stubWaitlist(
      500,
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Server unavailable',
        },
      },
      'waitlistError',
    );

    cy.submitWaitlist('failure@example.com', 'waitlistError');

    waitlist
      .errorAlert()
      .should('be.visible')
      .and('contain.text', 'Server unavailable');

    waitlist.submitButton().should('be.enabled');
  });
});