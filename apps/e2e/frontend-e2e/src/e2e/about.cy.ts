import { aboutSections } from '../support/app.po';

const stripLeadingDecorations = (value: string): string =>
  value.replace(/^[^A-Z0-9]*/i, '').trim();

const visibleTextPreview = (value: string, length = 40): string =>
  value.trim().slice(0, length);

describe('About page', () => {
  beforeEach(() => {
    cy.visit('/About');
  });

  it('renders every configured about section', () => {
    aboutSections.forEach((section) => {
      const normalizedTitle = stripLeadingDecorations(section.title);
      const firstParagraph = section.paragraphs.at(0);
      const lastParagraph = section.paragraphs.at(-1);

      cy.contains(normalizedTitle).should('be.visible');

      if (firstParagraph) {
        cy.contains(visibleTextPreview(firstParagraph)).should('be.visible');
      }

      if (lastParagraph && lastParagraph !== firstParagraph) {
        cy.contains(visibleTextPreview(lastParagraph)).should('be.visible');
      }
    });
  });
});