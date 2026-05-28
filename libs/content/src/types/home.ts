import type { ContentCarouselConfig, ContentMediaItem } from './media';

export type HomeSectionVariant =
  | 'default'
  | 'plain'
  | 'glass'
  | 'gradient'
  | 'surface';

export type HomeSectionAlign = 'left' | 'center';

export type HomeSectionSpacing = 'none' | 'compact' | 'normal' | 'spacious';

export type HomeSectionMediaPosition = 'top' | 'bottom' | 'left' | 'right';

export type HomeSectionMediaBreakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface HomePageMetadata {
  title: string;
  description: string;
  keywords?: readonly string[];
  canonical?: string;
  openGraph?: {
    title: string;
    description: string;
    image?: string;
    url?: string;
  };
}

export interface HomeSectionLayout {
  mediaPosition?: HomeSectionMediaPosition;
  mediaBreakpoint?: HomeSectionMediaBreakpoint;
  mediaGridColumns?: readonly [string, string];
  maxContentWidth?: string | number;
  maxTextWidth?: string | number;
  maxTextOnlyWidth?: string | number;
  centerContent?: boolean;
  mediaFirstOnMobile?: boolean;
}

export interface HomeSectionContent {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  body?: string;
  variant?: HomeSectionVariant;
  spacingY?: HomeSectionSpacing;
  align?: HomeSectionAlign;
  titleComponent?: string;
  titleVariant?: string;
  layout?: HomeSectionLayout;
  media?: readonly ContentMediaItem[];
  carousel?: ContentCarouselConfig;
}

export interface HomePageContent {
  pageTitle: string;
  metadata: HomePageMetadata;
  sections: readonly HomeSectionContent[];
}
