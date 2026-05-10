import type { CardProps } from '@helix-ai/ui';

const escapeSelectorValue = (value: string): string =>
  value.replace(/["\\]/g, '\\$&');

/**
 * Keep E2E expectations local to the E2E project.
 *
 * Do not import app internals from apps/frontend here. Nx module boundaries
 * correctly reject relative imports from one project into another.
 */
export const navPages = [
  {
    name: 'Home',
    href: '/',
  },
  {
    name: 'About',
    href: '/About',
  },
  {
    name: 'Technology',
    href: '/Technology',
  },
  {
    name: 'Contact',
    href: '/Contact',
  },
];

export const aboutSections: Array<{
  title: string;
  description?: string;
  content?: string;
}> = [];

export const contactOptions: Array<{
  title: string;
  description?: string;
  href?: string;
}> = [];

export const technologyCards: CardProps[] = [];

export const technologyCardsSortedByTitle = [...technologyCards].sort((a, b) =>
  a.title.localeCompare(b.title),
);

export const heroSection = {
  skipLink: () => cy.contains('a', 'Skip to content'),

  mainContent: () => cy.get('#main-content'),

  heading: () =>
    cy.contains('h1', 'Helix AI — Your Digital Life, Intelligently Connected'),

  subtitle: () =>
    cy.contains(
      'Helix AI is a secure virtual assistant that brings together your apps, data, and workflows',
    ),
};

export const waitlist = {
  section: () => cy.get('[data-testid="waitlist-section"]'),

  form: () => cy.get('[data-testid="waitlist-form"]'),

  emailInput: () => cy.get('[data-testid="waitlist-email-input"]'),

  submitButton: () => cy.get('[data-testid="waitlist-submit"]'),

  turnstile: () => cy.get('[data-testid="waitlist-turnstile"]'),

  successAlert: () => cy.get('[data-testid="waitlist-success"]'),

  errorAlert: () => cy.get('[data-testid="waitlist-error"]'),
};

export const headerNav = {
  desktopButton: (label: string) => cy.contains('header button', label),

  mobileToggle: () => cy.get('button[aria-label="Open menu"]'),

  mobileItem: (label: string) => cy.contains('div[role="button"]', label),
};

export const helixCards = {
  all: () => cy.get('[data-testid="helix-card"]'),

  byTitle: (title: string) =>
    cy.get(`[data-card-title="${escapeSelectorValue(title)}"]`),
};