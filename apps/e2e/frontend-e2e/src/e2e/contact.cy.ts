import { contactOptions } from '../support/app.po';

const visibleTextPreview = (value: string, length = 60): string =>
  value.trim().slice(0, length);

describe('Contact page', () => {
  beforeEach(() => {
    cy.visit('/Contact');
  });

  it('shows every configured contact channel with the correct CTA link', () => {
    contactOptions.forEach((option) => {
      cy.contains(option.title).should('be.visible');

      cy.contains(visibleTextPreview(option.description)).should('be.visible');

      cy.contains('a', option.buttonText)
        .should('be.visible')
        .and('have.attr', 'href', option.link)
        .and('have.attr', 'target', '_blank')
        .and('have.attr', 'rel')
        .and('include', 'noopener');
    });
  });
});