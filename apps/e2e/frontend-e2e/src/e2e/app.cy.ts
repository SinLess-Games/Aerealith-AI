import { heroSection, waitlist } from '../support/app.po';

describe('Home page experience', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('renders the hero content and waitlist form', () => {
    heroSection.mainContent().should('exist').and('be.visible');
    heroSection.heading().should('be.visible');

    waitlist.section().should('be.visible');
    waitlist.form().should('be.visible');
  });

  it('exposes the main content region for page navigation and accessibility', () => {
    heroSection.mainContent().should('exist').and('be.visible');
  });
});