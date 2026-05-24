// libs/content/src/en/home/index.ts

/**
 * Home content barrel exports.
 *
 * This file provides a single import surface for Home page content while
 * avoiding duplicate export-name conflicts between `content.ts` and
 * `sections.ts`.
 *
 * @example
 * import {
 *   HOME_RENDERED_PAGE_CONTENT,
 *   HOME_SECTION_PAGE_CONTENT,
 *   crowdfundingSection,
 *   faqSection,
 * } from '@aerealith-ai/content';
 *
 * @public
 * @module
 * @decorator barrel
 */

export * from './crowdfunding';
export * from './different';
export * from './faq';
export * from './pricing';

/**
 * Home section configuration exports.
 *
 * These are content/config objects used for structured Home page composition.
 *
 * @public
 * @decorator exports
 */
export {
  DEFAULT_MEDIA_MAX_SCAN_COUNT as HOME_SECTIONS_DEFAULT_MEDIA_MAX_SCAN_COUNT,
  DEFAULT_MEDIA_START_INDEX as HOME_SECTIONS_DEFAULT_MEDIA_START_INDEX,
  DEFAULT_MEDIA_STOP_AFTER_MISSES as HOME_SECTIONS_DEFAULT_MEDIA_STOP_AFTER_MISSES,
  HOME_PAGE_CONTENT as HOME_SECTION_PAGE_CONTENT,
  INFOGRAPHIC_CAROUSEL_CONFIG,
  INFOGRAPHICS_PUBLIC_PATH as HOME_SECTIONS_INFOGRAPHICS_PUBLIC_PATH,
  PRODUCT_PREVIEW_CAROUSEL_CONFIG,
  PRODUCT_PREVIEW_PATH as HOME_SECTIONS_PRODUCT_PREVIEW_PATH,
  homeCrowdfundingSection,
  homeHeroSection,
  homeInfographicsSection,
  homePageContent as homeSectionPageContent,
  homePricingPreviewSection,
  homeSections,
  infographicCarouselProps,
  productPreviewCarouselProps,
  productPreviewSection,
} from './sections';

export type {
  HomeCarouselConfig,
  HomeCrowdfundingSectionConfig,
  HomeMarketingSectionConfig,
  HomePageContentConfig,
  HomePricingPreviewSectionConfig,
  HomeSectionComponent,
  HomeSectionConfig,
} from './sections';

/**
 * Rendered Home page content exports.
 *
 * These are React-element based exports used when the Home page imports
 * already-rendered sections.
 *
 * @public
 * @decorator exports
 */
export {
  DEFAULT_MEDIA_MAX_SCAN_COUNT as HOME_CONTENT_DEFAULT_MEDIA_MAX_SCAN_COUNT,
  DEFAULT_MEDIA_START_INDEX as HOME_CONTENT_DEFAULT_MEDIA_START_INDEX,
  DEFAULT_MEDIA_STOP_AFTER_MISSES as HOME_CONTENT_DEFAULT_MEDIA_STOP_AFTER_MISSES,
  HERO_DATA,
  HOME_PAGE_CONTENT as HOME_RENDERED_PAGE_CONTENT,
  HOME_PAGE_IMAGE_PATH,
  HOME_SECTIONS,
  INFOGRAPHICS_PUBLIC_PATH as HOME_CONTENT_INFOGRAPHICS_PUBLIC_PATH,
  INVESTOR_VIDEO,
  PRINCIPLES_PATH,
  PRODUCT_PREVIEW_PATH as HOME_CONTENT_PRODUCT_PREVIEW_PATH,
  SECTIONS_DATA,
} from './content';

export type { SectionsProps } from './content';