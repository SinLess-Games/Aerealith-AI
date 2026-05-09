import { headerNav, navPages } from '../support/app.po';

const ROUTABLE_PAGE_URLS = ['/', '/About', '/Contact', '/technology'] as const;

const routablePages = navPages.filter((page) =>
  ROUTABLE_PAGE_URLS.includes(page.url as (typeof ROUTABLE_PAGE_URLS)[number]),
);

const assertRouteContent = (url: string): void => {
  if (url === '/') {
    cy.contains('h1', 'Helix AI — Your Digital Life').should('be.visible');
    return;
  }

  if (url === '/About') {
    cy.contains('h1', 'About Helix AI').should('be.visible');
    return;
  }

  if (url === '/Contact') {
    cy.contains('h1', 'Contact').should('be.visible');
    return;
  }

  if (url === '/technology') {
    cy.contains('h1', 'Technology').should('be.visible');
  }
};

describe('Header navigation', () => {
  it('lists every configured navigation link on desktop viewports', () => {
    cy.viewport(1280, 800);
    cy.visit('/');

    navPages.forEach((page) => {
      headerNav.desktopButton(page.name).should('be.visible');
    });
  });

  it('navigates between each primary route on desktop', () => {
    cy.viewport(1400, 900);
    cy.visit('/');

    routablePages.forEach((page) => {
      headerNav.desktopButton(page.name).should('be.visible').click();

      cy.location('pathname').should('eq', page.url);
      assertRouteContent(page.url);
    });
  });

  it('supports navigation via the mobile drawer', () => {
    cy.viewport('iphone-6');
    cy.visit('/');

    headerNav.mobileToggle().should('be.visible').click();
    headerNav.mobileItem('Contact').should('be.visible').click();

    cy.location('pathname').should('eq', '/Contact');
    assertRouteContent('/Contact');
  });
});