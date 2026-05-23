import type { HomePageMetadata } from '../../types';
import { crowdfundingSection } from './crowdfunding';
import { pricingPreviewSection } from './pricing';

export const INFOGRAPHICS_PUBLIC_PATH = '/images/Branding/infographics';
export const PRODUCT_PREVIEW_PATH = '/images/product-preview';

export const DEFAULT_MEDIA_MAX_SCAN_COUNT = 100;
export const DEFAULT_MEDIA_START_INDEX = 1;
export const DEFAULT_MEDIA_STOP_AFTER_MISSES = 1;

export type HomeSectionComponent =
  | 'marketing-section'
  | 'crowdfunding-section'
  | 'pricing-preview-section';

export type HomeCarouselConfig = {
  autoDiscoverImages?: boolean;
  imageBasePath?: string;
  imageFilePrefix?: string;
  imageExtension?: string;
  startIndex?: number;
  maxImages?: number;
  stopAfterMisses?: number;
  imageAltPrefix?: string;
  imageTitlePrefix?: string;

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

export type HomeMarketingSectionConfig = {
  component: 'marketing-section';
  id: string;

  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  body?: string;
  footnote?: string;

  variant?: 'default' | 'plain' | 'surface' | 'glass' | 'gradient' | 'dark';
  spacingY?: 'none' | 'compact' | 'normal' | 'spacious';
  align?: 'left' | 'center' | 'right';
  tone?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  copyVariant?: 'default' | 'hero' | 'section' | 'compact' | 'callout';

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  mediaMaxWidth?: number | string;

  fullHeight?: boolean;
  centerContent?: boolean;

  mediaPosition?: 'left' | 'right' | 'top' | 'bottom';
  mediaFirstOnMobile?: boolean;
  mediaBreakpoint?: 'sm' | 'md' | 'lg' | 'xl';
  gridColumns?: readonly [string, string];

  featureLayout?: 'none' | 'grid' | 'carousel';
  carouselProps?: HomeCarouselConfig;

  copyProps?: {
    titleComponent?: string;
    titleVariant?: string;
    subtitleVariant?: string;
    descriptionVariant?: string;
  };
};

export type HomeCrowdfundingSectionConfig = {
  component: 'crowdfunding-section';
  id: string;
  content: typeof crowdfundingSection;

  variant?: 'default' | 'plain' | 'surface' | 'glass' | 'gradient' | 'dark';
  spacingY?: 'none' | 'compact' | 'normal' | 'spacious';
  align?: 'left' | 'center' | 'right';
  tone?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  copyVariant?: 'default' | 'hero' | 'section' | 'compact' | 'callout';

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  mediaPosition?: 'left' | 'right' | 'top' | 'bottom';
};

export type HomePricingPreviewSectionConfig = {
  component: 'pricing-preview-section';
  id: string;
  content: typeof pricingPreviewSection;

  variant?: 'default' | 'plain' | 'surface' | 'glass' | 'gradient' | 'dark';
  spacingY?: 'none' | 'compact' | 'normal' | 'spacious';
  align?: 'left' | 'center' | 'right';
  tone?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  copyVariant?: 'default' | 'hero' | 'section' | 'compact' | 'callout';

  maxWidth?: number | string;
  copyMaxWidth?: number | string;
  mediaPosition?: 'left' | 'right' | 'top' | 'bottom';
};

export type HomeSectionConfig =
  | HomeMarketingSectionConfig
  | HomeCrowdfundingSectionConfig
  | HomePricingPreviewSectionConfig;

export type HomePageContentConfig = {
  pageTitle: string;
  metadata: HomePageMetadata;
  sections: readonly HomeSectionConfig[];
};

export const homePageMetadata = {
  title: 'Helix AI | Your Digital Life, Intelligently Connected',
  description:
    'Helix AI is an adaptive digital companion for memory, automation, analytics, integrations, dashboards, and connected workflows.',
  keywords: [
    'Helix AI',
    'AI assistant',
    'AI automation',
    'AI memory',
    'AI dashboards',
    'developer AI platform',
    'personal AI',
    'SinLess Games LLC',
  ],
  canonical: '/',
  openGraph: {
    title: 'Helix AI',
    description:
      'Your adaptive digital companion for memory, automation, analytics, integrations, and connected workflows.',
    image: '/images/og/helix-ai-home.png',
    url: 'https://helixaibot.com',
  },
} as const satisfies HomePageMetadata;

export const infographicCarouselProps = {
  autoDiscoverImages: true,
  imageBasePath: INFOGRAPHICS_PUBLIC_PATH,
  imageFilePrefix: 'info_',
  imageExtension: 'png',
  startIndex: DEFAULT_MEDIA_START_INDEX,
  maxImages: DEFAULT_MEDIA_MAX_SCAN_COUNT,
  stopAfterMisses: DEFAULT_MEDIA_STOP_AFTER_MISSES,
  imageAltPrefix: 'Helix AI infographic',
  imageTitlePrefix: 'Infographic',

  autoScroll: true,
  autoScrollInterval: 6500,
  pauseOnHover: true,
  pauseOnFocus: true,
  pauseOnVideoPlay: true,
  loop: true,
  showArrows: true,
  showPagination: true,
  showProgress: true,
  showCaptions: true,
  showFullscreenButton: true,
  fullscreen: true,
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  objectPosition: 'center',
  rounded: true,
  bordered: true,
  elevated: true,
  imageSizes: '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px',
} as const satisfies HomeCarouselConfig;

export const productPreviewCarouselProps = {
  autoDiscoverImages: true,
  imageBasePath: PRODUCT_PREVIEW_PATH,
  imageFilePrefix: 'preview_',
  imageExtension: 'png',
  startIndex: DEFAULT_MEDIA_START_INDEX,
  maxImages: DEFAULT_MEDIA_MAX_SCAN_COUNT,
  stopAfterMisses: DEFAULT_MEDIA_STOP_AFTER_MISSES,
  imageAltPrefix: 'Helix AI product preview',
  imageTitlePrefix: 'Product Preview',

  autoScroll: false,
  autoScrollInterval: 6500,
  pauseOnHover: true,
  pauseOnFocus: true,
  pauseOnVideoPlay: true,
  loop: true,
  showArrows: true,
  showPagination: true,
  showProgress: false,
  showCaptions: false,
  showFullscreenButton: true,
  fullscreen: true,
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  objectPosition: 'center',
  rounded: true,
  bordered: true,
  elevated: true,
  imageSizes: '(max-width: 768px) 100vw, (max-width: 1200px) 48vw, 860px',
} as const satisfies HomeCarouselConfig;

export const homeHeroSection = {
  component: 'marketing-section',
  id: 'hero',
  eyebrow: 'Helix AI',
  title: 'Your digital life, intelligently connected.',
  description:
    'Unify memory, automations, analytics, integrations, dashboards, and assistant workflows in one secure AI companion.',
  variant: 'glass',
  spacingY: 'spacious',
  align: 'center',
  tone: 'secondary',
  copyVariant: 'hero',
  maxWidth: 1180,
  copyMaxWidth: 920,
  centerContent: true,
  featureLayout: 'none',
  copyProps: {
    titleComponent: 'h1',
    titleVariant: 'h1',
  },
} as const satisfies HomeMarketingSectionConfig;

export const homeInfographicsSection = {
  component: 'marketing-section',
  id: 'infographics',
  eyebrow: 'Platform Overview',
  title: 'See How Helix AI Fits Together',
  description:
    'Explore visual breakdowns of the platform, integrations, memory, automation, analytics, and user-control model.',
  variant: 'glass',
  spacingY: 'normal',
  align: 'center',
  tone: 'secondary',
  copyVariant: 'section',
  maxWidth: '100%',
  copyMaxWidth: 920,
  centerContent: true,
  mediaPosition: 'bottom',
  featureLayout: 'carousel',
  carouselProps: infographicCarouselProps,
  copyProps: {
    titleComponent: 'h2',
    titleVariant: 'h2',
  },
} as const satisfies HomeMarketingSectionConfig;

export const productPreviewSection = {
  component: 'marketing-section',
  id: 'product-preview',
  eyebrow: 'Product Preview',
  title: 'A Command Center for Your Digital World',
  description:
    'Preview the direction of Helix AI across dashboards, assistant workflows, integrations, analytics, and connected systems.',
  variant: 'glass',
  spacingY: 'normal',
  align: 'center',
  tone: 'secondary',
  copyVariant: 'section',
  maxWidth: '100%',
  copyMaxWidth: 760,
  centerContent: true,
  mediaPosition: 'right',
  mediaBreakpoint: 'lg',
  mediaFirstOnMobile: false,
  gridColumns: ['minmax(0, 0.92fr)', 'minmax(360px, 1.08fr)'],
  featureLayout: 'carousel',
  carouselProps: productPreviewCarouselProps,
  copyProps: {
    titleComponent: 'h2',
    titleVariant: 'h2',
  },
} as const satisfies HomeMarketingSectionConfig;

export const homeCrowdfundingSection = {
  component: 'crowdfunding-section',
  id: crowdfundingSection.id ?? 'crowdfunding',
  content: crowdfundingSection,
  variant: 'glass',
  spacingY: 'normal',
  align: 'center',
  tone: 'secondary',
  copyVariant: 'section',
  maxWidth: '100%',
  copyMaxWidth: 1180,
  mediaPosition: 'bottom',
} as const satisfies HomeCrowdfundingSectionConfig;

export const homePricingPreviewSection = {
  component: 'pricing-preview-section',
  id: pricingPreviewSection.id ?? 'pricing-preview',
  content: pricingPreviewSection,
  variant: 'glass',
  spacingY: 'normal',
  align: 'center',
  tone: 'secondary',
  copyVariant: 'section',
  maxWidth: '100%',
  copyMaxWidth: '100%',
  mediaPosition: 'bottom',
} as const satisfies HomePricingPreviewSectionConfig;

export const homeSections = [
  homeHeroSection,
  homeInfographicsSection,
  productPreviewSection,
  homeCrowdfundingSection,
  homePricingPreviewSection,
] as const satisfies readonly HomeSectionConfig[];

export const homePageContent = {
  pageTitle: 'Helix AI',
  metadata: homePageMetadata,
  sections: homeSections,
} as const satisfies HomePageContentConfig;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `homePageContent` for new imports.
 */
export const HOME_PAGE_CONTENT = homePageContent;

/**
 * Backwards-compatible uppercase export.
 *
 * Prefer `productPreviewCarouselProps` for new imports.
 */
export const PRODUCT_PREVIEW_CAROUSEL_CONFIG = productPreviewCarouselProps;

/**
 * Backwards-compatible uppercase export.
 *
 * Prefer `infographicCarouselProps` for new imports.
 */
export const INFOGRAPHIC_CAROUSEL_CONFIG = infographicCarouselProps;