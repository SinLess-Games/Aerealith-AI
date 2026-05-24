// libs/content/src/en/home/different.ts

/**
 * Number of differentiator cards shown per carousel page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const DIFFERENTIATOR_PAGE_SIZE = 4;

/**
 * Differentiator carousel transition duration in milliseconds.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const DIFFERENTIATOR_TRANSITION_MS = 260;

/**
 * Aerealith AI differentiator card item.
 *
 * @public
 * @type
 * @decorator content
 */
export type AerealithDifferentiatorItem = {
  id?: string;
  title: string;
  description: string;
  icon?: string;
  badge?: string;
};

/**
 * Backward-compatible type alias.
 *
 * Prefer `AerealithDifferentiatorItem` for new imports.
 *
 * @public
 * @type
 * @decorator alias
 */
export type HelixDifferentiatorItem = AerealithDifferentiatorItem;

/**
 * Home page "different" section content configuration.
 *
 * @public
 * @type
 * @decorator section
 */
export type DifferentSectionContent = {
  component: 'marketing-section';
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

  mediaPosition?: 'left' | 'right' | 'top' | 'bottom';
  mediaBreakpoint?: 'sm' | 'md' | 'lg' | 'xl';
  mediaFirstOnMobile?: boolean;
  gridColumns?: readonly [string, string];

  featureLayout?: 'none' | 'grid' | 'carousel';
  features?: readonly AerealithDifferentiatorItem[];

  featureGridProps?: {
    columns?:
      | number
      | {
          xs?: number;
          sm?: number;
          md?: number;
          lg?: number;
          xl?: number;
        };
    gap?:
      | number
      | string
      | {
          xs?: number | string;
          sm?: number | string;
          md?: number | string;
          lg?: number | string;
          xl?: number | string;
        };
    maxWidth?: number | string;
    centered?: boolean;
    cardFullHeight?: boolean;
    compactCards?: boolean;
  };

  carouselProps?: {
    autoScroll?: boolean;
    autoScrollInterval?: number;
    pauseOnHover?: boolean;
    pauseOnFocus?: boolean;
    pauseOnVideoPlay?: boolean;
    loop?: boolean;
    showArrows?: boolean;
    showPagination?: boolean;
    showProgress?: boolean;
    showCaptions?: boolean;
    showFullscreenButton?: boolean;
    fullscreen?: boolean;
    aspectRatio?: string | number;
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    objectPosition?: string;
    rounded?: boolean;
    bordered?: boolean;
    elevated?: boolean;
    imageSizes?: string;
  };

  copyProps?: {
    titleComponent?: string;
    titleVariant?: string;
  };
};

/**
 * Main body copy for the "Built Different" section.
 *
 * @public
 * @constant
 * @readonly
 * @decorator content
 */
export const aerealithDifferenceBody =
  'Aerealith AI is being designed as more than a chatbot. It is a secure, extensible assistant platform built around user-owned data, contextual memory, automations, integrations, analytics, and transparent control. The goal is to make your digital systems easier to understand, easier to operate, and easier to trust.';

/**
 * Core Aerealith AI platform differentiators.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const aerealithDifferentiators = [
  {
    id: 'user-owned-data',
    title: 'User-Owned Data',
    description:
      'Aerealith AI is built around the principle that users own their data. The platform should support export, deletion, transparency, and clear boundaries around how data is used.',
    icon: '🛡️',
  },
  {
    id: 'contextual-memory',
    title: 'Contextual Memory',
    description:
      'Memory is designed to be layered across users, assistant identities, organizations, workspaces, projects, automations, and analytics preferences.',
    icon: '🧠',
  },
  {
    id: 'automation-with-boundaries',
    title: 'Automation With Boundaries',
    description:
      'Aerealith AI can help automate workflows, monitor systems, and assist with actions while preserving approval flows, permissions, and user control.',
    icon: '⚙️',
  },
  {
    id: 'connected-integrations',
    title: 'Connected Integrations',
    description:
      'The platform is designed to connect apps, services, developer tools, infrastructure, smart devices, and external workflows into one assistant experience.',
    icon: '🔗',
  },
  {
    id: 'dashboards-and-analytics',
    title: 'Dashboards and Analytics',
    description:
      'Aerealith AI is planned with user-fed dashboards, annotations, sharing, and operational insights so users can understand their systems at a glance.',
    icon: '📊',
  },
  {
    id: 'developer-ready-platform',
    title: 'Developer-Ready Platform',
    description:
      'Aerealith AI is being structured with SDKs, APIs, plugin manifests, marketplace support, automation hooks, and extensibility from the beginning.',
    icon: '🧑‍💻',
  },
  {
    id: 'cloud-local-and-air-gapped',
    title: 'Cloud, Local, and Air-Gapped',
    description:
      'The architecture is intended to support hosted SaaS, self-hosted deployments, and air-gapped environments where organizations need more control.',
    icon: '🏗️',
  },
  {
    id: 'transparent-ai-behavior',
    title: 'Transparent AI Behavior',
    description:
      'Aerealith AI should explain what it knows, where information came from, when it used a tool, and when a decision requires user approval.',
    icon: '🔍',
  },
] as const satisfies readonly AerealithDifferentiatorItem[];

/**
 * Highlighted differentiators used by compact layouts.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const aerealithDifferentiatorHighlights = [
  aerealithDifferentiators[0],
  aerealithDifferentiators[1],
  aerealithDifferentiators[2],
  aerealithDifferentiators[3],
] as const satisfies readonly AerealithDifferentiatorItem[];

/**
 * Home page "Built Different" marketing section.
 *
 * @public
 * @constant
 * @readonly
 * @decorator section
 */
export const differentSection = {
  component: 'marketing-section',
  id: 'why-aerealith-ai-is-different',
  eyebrow: 'Why Aerealith AI',
  title: 'Built Different From the Start',
  description:
    'Aerealith AI combines assistant intelligence, user control, integrations, analytics, memory, and automation into one long-term platform vision.',
  body: aerealithDifferenceBody,

  variant: 'glass',
  spacingY: 'normal',
  align: 'left',
  tone: 'secondary',
  copyVariant: 'section',

  maxWidth: 1900,
  copyMaxWidth: 760,
  mediaMaxWidth: 900,
  centerContent: true,

  mediaPosition: 'right',
  mediaBreakpoint: 'lg',
  mediaFirstOnMobile: false,
  gridColumns: ['minmax(0, 0.92fr)', 'minmax(420px, 1.08fr)'],

  featureLayout: 'carousel',
  features: aerealithDifferentiators,

  featureGridProps: {
    columns: {
      xs: 1,
      sm: 2,
      md: 2,
      lg: 2,
      xl: 2,
    },
    gap: {
      xs: 2,
      md: 2.5,
    },
    maxWidth: 900,
    centered: true,
    cardFullHeight: true,
    compactCards: false,
  },

  carouselProps: {
    autoScroll: false,
    autoScrollInterval: 5200,
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnVideoPlay: true,
    loop: true,
    showArrows: true,
    showPagination: true,
    showProgress: false,
    showCaptions: false,
    showFullscreenButton: false,
    fullscreen: false,
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    objectPosition: 'center',
    rounded: true,
    bordered: true,
    elevated: true,
    imageSizes: '100vw',
  },

  copyProps: {
    titleComponent: 'h2',
    titleVariant: 'h2',
  },
} as const satisfies DifferentSectionContent;

/**
 * Backward-compatible camelCase exports.
 *
 * Prefer Aerealith-named exports for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const helixDifferenceBody = aerealithDifferenceBody;
export const helixDifferentiators = aerealithDifferentiators;
export const helixDifferentiatorHighlights = aerealithDifferentiatorHighlights;

/**
 * Backwards-compatible uppercase exports.
 *
 * Prefer camelCase Aerealith exports for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const AEREALITH_DIFFERENCE_BODY = aerealithDifferenceBody;
export const AEREALITH_DIFFERENTIATORS = aerealithDifferentiators;
export const AEREALITH_DIFFERENTIATOR_HIGHLIGHTS =
  aerealithDifferentiatorHighlights;

export const HELIX_DIFFERENCE_BODY = aerealithDifferenceBody;
export const HELIX_DIFFERENTIATORS = aerealithDifferentiators;
export const HELIX_DIFFERENTIATOR_HIGHLIGHTS =
  aerealithDifferentiatorHighlights;

export const DIFFERENT_SECTION = differentSection;