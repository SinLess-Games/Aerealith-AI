import { technologyCardsSortedByTitle } from '../support/app.po';

import { AIToolsCards } from '../../../../frontend/src/content/technology/AI';
import { CloudPlatformCards } from '../../../../frontend/src/content/technology/cloud-platforms';

const visibleTextPreview = (value: string, length = 60): string =>
  value.trim().slice(0, length);

describe('Technology page', () => {
  beforeEach(() => {
    cy.visit('/technology');
  });

  it('renders every configured technology card title', () => {
    const sortedTitles = technologyCardsSortedByTitle.map((card) => card.title);

    sortedTitles.forEach((title) => {
      cy.get('#main-content').contains(title).should('be.visible');
    });
  });

  it('lists every AI & ML tool', () => {
    cy.get('#main-content').contains(AIToolsCards.title).should('be.visible');

    if (AIToolsCards.description) {
      cy.get('#main-content')
        .contains(visibleTextPreview(AIToolsCards.description))
        .should('be.visible');
    }

    AIToolsCards.listItems.forEach((item) => {
      cy.get('#main-content').contains(item.text).should('be.visible');

      if (item.href) {
        cy.get(`#main-content a[href="${item.href}"]`).should('exist');
      }
    });
  });

  it('renders CTA buttons for cards configured with internal links', () => {
    const [cloudCard] = CloudPlatformCards;
    const buttonText = cloudCard.buttonText ?? 'Explore';

    cy.get('#main-content').contains(cloudCard.title).should('be.visible');

    if (cloudCard.description) {
      cy.get('#main-content')
        .contains(visibleTextPreview(cloudCard.description))
        .should('be.visible');
    }

    cy.get('#main-content')
      .contains('a', buttonText)
      .should('be.visible')
      .and('have.attr', 'href', cloudCard.link);
  });
});