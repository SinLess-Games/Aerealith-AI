// libs/content/src/en/home/faq.ts

/**
 * Number of FAQ cards shown per carousel page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const FAQ_CAROUSEL_PAGE_SIZE = 1;

/**
 * FAQ carousel transition duration in milliseconds.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const FAQ_CAROUSEL_TRANSITION_MS = 260;

/**
 * FAQ card content item.
 *
 * @public
 * @type
 * @decorator content
 */
export type FaqCardItem = {
  id: string;
  question: string;
  answer: string;
  tag: string;

  /**
   * Card-compatible aliases.
   */
  title: string;
  description: string;
};

/**
 * FAQ carousel configuration.
 *
 * @public
 * @type
 * @decorator carousel
 */
export type FaqCarouselContent = {
  autoScroll?: boolean;
  autoScrollInterval?: number;
  pauseOnHover?: boolean;
  pauseOnFocus?: boolean;
  loop?: boolean;
  showArrows?: boolean;
  showPagination?: boolean;
  showProgress?: boolean;
  pageSize?: number;
  transitionMs?: number;
};

/**
 * FAQ section content configuration.
 *
 * @public
 * @type
 * @decorator section
 */
export type FaqSectionContent = {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  body?: string;

  variant?: 'default' | 'plain' | 'surface' | 'glass' | 'gradient' | 'dark';
  spacingY?: 'none' | 'compact' | 'normal' | 'spacious';
  align?: 'left' | 'center' | 'right';
  tone?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  copyVariant?: 'default' | 'hero' | 'section' | 'compact' | 'callout';

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  mediaMaxWidth?: number | string;
  centerContent?: boolean;

  cards: readonly FaqCardItem[];
  carousel: FaqCarouselContent;
};

/**
 * FAQ carousel cards for the Home page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const faqCards = [
  {
    id: 'faq-early-access',
    question: 'When will Aerealith AI be available?',
    answer:
      'Aerealith AI is currently in active development. Early access will open as core MVP features are completed, tested, and stable enough for real users. Features will be released progressively as they pass internal testing and are pushed to production, so the platform will grow over time instead of launching all at once. Early users may still encounter bugs or incomplete behavior during testing, and feedback will help shape the product. If you find an issue, bug, or unexpected behavior, please report it.',
    tag: 'Anonymous',
    title: 'When will Aerealith AI be available?',
    description:
      'Aerealith AI is currently in active development. Early access will open as core MVP features are completed, tested, and stable enough for real users. Features will be released progressively as they pass internal testing and are pushed to production, so the platform will grow over time instead of launching all at once. Early users may still encounter bugs or incomplete behavior during testing, and feedback will help shape the product. If you find an issue, bug, or unexpected behavior, please report it.',
  },
  {
    id: 'faq-data-ownership',
    question: 'Will users own their data?',
    answer:
      'Yes. Aerealith AI is being designed around user-owned data, clear export options, deletion controls, permissioned memory, and transparent boundaries around how information is used. Users should be able to understand what data Aerealith AI stores, why it is used, how it improves the experience, and how to review, export, or remove it when needed. The goal is to make powerful AI assistance feel controlled, accountable, and trustworthy instead of hidden or invasive.',
    tag: 'Anonymous',
    title: 'Will users own their data?',
    description:
      'Yes. Aerealith AI is being designed around user-owned data, clear export options, deletion controls, permissioned memory, and transparent boundaries around how information is used. Users should be able to understand what data Aerealith AI stores, why it is used, how it improves the experience, and how to review, export, or remove it when needed. The goal is to make powerful AI assistance feel controlled, accountable, and trustworthy instead of hidden or invasive.',
  },
  {
    id: 'faq-integrations',
    question: 'What apps will Aerealith AI connect to?',
    answer:
      'The long-term goal is for Aerealith AI to integrate with thousands of apps, tools, services, platforms, and systems through secure, scoped connections. Aerealith AI is being designed to support developer tools, community platforms, cloud services, dashboards, automations, files, communication apps, productivity suites, infrastructure systems, and future device integrations. Instead of locking users into a small set of fixed connections, Aerealith AI will grow into a flexible integration layer where users can choose what to connect, what permissions to grant, and how those tools should work together.',
    tag: 'Anonymous',
    title: 'What apps will Aerealith AI connect to?',
    description:
      'The long-term goal is for Aerealith AI to integrate with thousands of apps, tools, services, platforms, and systems through secure, scoped connections. Aerealith AI is being designed to support developer tools, community platforms, cloud services, dashboards, automations, files, communication apps, productivity suites, infrastructure systems, and future device integrations. Instead of locking users into a small set of fixed connections, Aerealith AI will grow into a flexible integration layer where users can choose what to connect, what permissions to grant, and how those tools should work together.',
  },
  {
    id: 'faq-self-hosting',
    question: 'Will Aerealith AI support self-hosting?',
    answer:
      'Self-hosting and air-gapped deployment support are part of the long-term platform direction, especially for teams, businesses, infrastructure operators, and enterprise environments that need stronger control over data, security, compliance, and deployment boundaries.',
    tag: 'Anonymous',
    title: 'Will Aerealith AI support self-hosting?',
    description:
      'Self-hosting and air-gapped deployment support are part of the long-term platform direction, especially for teams, businesses, infrastructure operators, and enterprise environments that need stronger control over data, security, compliance, and deployment boundaries.',
  },
] as const satisfies readonly FaqCardItem[];

/**
 * FAQ section content for the Home page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator section
 */
export const faqSection = {
  id: 'faq',
  eyebrow: 'Questions before launch',
  title: 'FAQ',
  description:
    'Common early questions from users, supporters, developers, communities, and potential investors as Aerealith AI moves through active development, MVP testing, pricing refinement, integration planning, and early public launch preparation.',
  body: 'Aerealith AI is still in active development, so this section will grow as the MVP ships, pricing is refined, integrations are added, and early users begin testing the platform. As new features move from planning to production, the FAQ will be updated with clearer answers about availability, data ownership, memory controls, automation limits, supported integrations, crowdfunding, billing, security, and the long-term roadmap.',

  variant: 'glass',
  spacingY: 'normal',
  align: 'left',
  tone: 'secondary',
  copyVariant: 'section',

  maxWidth: 1900,
  copyMaxWidth: 760,
  mediaMaxWidth: 900,
  centerContent: true,

  cards: faqCards,

  carousel: {
    autoScroll: false,
    autoScrollInterval: 6500,
    pauseOnHover: true,
    pauseOnFocus: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: false,
    pageSize: FAQ_CAROUSEL_PAGE_SIZE,
    transitionMs: FAQ_CAROUSEL_TRANSITION_MS,
  },
} as const satisfies FaqSectionContent;

/**
 * Backwards-compatible uppercase exports.
 *
 * Prefer camelCase exports for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const FAQ_CARDS = faqCards;
export const FAQ_SECTION = faqSection;