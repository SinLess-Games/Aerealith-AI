import type { HomeSectionContent } from './home';

export interface DifferentiatorItem {
  title: string;
  description: string;

  /**
   * Keep this content-safe.
   *
   * Use an emoji, icon key, or simple string here.
   * Do not use ReactNode inside @aerealith-ai/content.
   */
  icon?: string;
}

export interface DifferentiatorCarouselConfig {
  autoScroll?: boolean;
  autoScrollInterval?: number;
  pageSize?: number;
}

export interface DifferentiatorSectionContent extends HomeSectionContent {
  items: readonly DifferentiatorItem[];
  differentiatorCarousel?: DifferentiatorCarouselConfig;
}