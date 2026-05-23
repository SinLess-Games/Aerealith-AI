export const DIFFERENTIATOR_PAGE_SIZE = 4;
export const DIFFERENTIATOR_TRANSITION_MS = 260;

export type HelixDifferentiatorItem = {
  id?: string;
  title: string;
  description: string;
  icon?: string;
  badge?: string;
};

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
  features?: readonly HelixDifferentiatorItem[];

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

export const helixDifferenceBody =
  'Helix AI is being designed as more than a chatbot. It is a secure, extensible assistant platform built around user-owned data, contextual memory, automations, integrations, analytics, and transparent control. The goal is to make your digital systems easier to understand, easier to operate, and easier to trust.';

export const helixDifferentiators = [
  {
    id: 'user-owned-data',
    title: 'User-Owned Data',
    description:
      'Helix AI is built around the principle that users own their data. The platform should support export, deletion, transparency, and clear boundaries around how data is used.',
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
      'Helix can help automate workflows, monitor systems, and assist with actions while preserving approval flows, permissions, and user control.',
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
      'Helix AI is planned with user-fed dashboards, annotations, sharing, and operational insights so users can understand their systems at a glance.',
    icon: '📊',
  },
  {
    id: 'developer-ready-platform',
    title: 'Developer-Ready Platform',
    description:
      'Helix is being structured with SDKs, APIs, plugin manifests, marketplace support, automation hooks, and extensibility from the beginning.',
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
      'Helix should explain what it knows, where information came from, when it used a tool, and when a decision requires user approval.',
    icon: '🔍',
  },
] as const satisfies readonly HelixDifferentiatorItem[];

export const helixDifferentiatorHighlights = [
  helixDifferentiators[0],
  helixDifferentiators[1],
  helixDifferentiators[2],
  helixDifferentiators[3],
] as const satisfies readonly HelixDifferentiatorItem[];

export const differentSection = {
  component: 'marketing-section',
  id: 'why-helix-is-different',
  eyebrow: 'Why Helix AI',
  title: 'Built Different From the Start',
  description:
    'Helix AI combines assistant intelligence, user control, integrations, analytics, memory, and automation into one long-term platform vision.',
  body: helixDifferenceBody,

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
  features: helixDifferentiators,

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
 * Backwards-compatible uppercase exports.
 *
 * Prefer camelCase exports for new imports.
 */
export const HELIX_DIFFERENCE_BODY = helixDifferenceBody;
export const HELIX_DIFFERENTIATORS = helixDifferentiators;
export const HELIX_DIFFERENTIATOR_HIGHLIGHTS = helixDifferentiatorHighlights;
export const DIFFERENT_SECTION = differentSection;