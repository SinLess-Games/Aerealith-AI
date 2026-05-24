/**
 * @file images.ts
 * @description
 * Centralized public image folder path constants for Aerealith AI.
 *
 * These paths are designed for assets stored under:
 *
 * apps/frontend/public/images
 *
 * Since Next.js serves everything inside `public/` from the site root,
 * every path should begin with `/images`.
 *
 * @example
 * import { Image_Paths } from '@aerealith-ai/content';
 *
 * const heroImage = `${Image_Paths.marketing.hero}/hero-1.png`;
 */

/**
 * Public image path type.
 *
 * @public
 * @decorator type
 */
export type Public_Image_Path = `/images${string}`;

/**
 * Public folder path type for image directories.
 *
 * @public
 * @decorator type
 */
export type Public_Image_Folder_Path = Public_Image_Path;

/* =============================================================================
 * Root Image Directory
 * ============================================================================= */

/**
 * Root folder for all public image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_ROOT_PATH = '/images' as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Background Image Folders
 * ============================================================================= */

/**
 * Folder for global background images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_BACKGROUNDS_PATH =
  `${IMAGE_ROOT_PATH}/backgrounds` as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Brand Image Folders
 * ============================================================================= */

/**
 * Root folder for all brand-related image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_BRAND_PATH =
  `${IMAGE_ROOT_PATH}/brand` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for installable app icons and platform icons.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_BRAND_APP_ICONS_PATH =
  `${IMAGE_BRAND_PATH}/app-icons` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for full logo assets, headers, and poster-style brand graphics.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_BRAND_LOGOS_PATH =
  `${IMAGE_BRAND_PATH}/logos` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for standalone brand marks and source marks.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_BRAND_MARKS_PATH =
  `${IMAGE_BRAND_PATH}/marks` as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Content Image Folders
 * ============================================================================= */

/**
 * Root folder for content-specific images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_CONTENT_PATH =
  `${IMAGE_ROOT_PATH}/content` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for development blog images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_CONTENT_DEVBLOG_PATH =
  `${IMAGE_CONTENT_PATH}/devblog` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for documentation images and supporting visual assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_CONTENT_DOCS_PATH =
  `${IMAGE_CONTENT_PATH}/docs` as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Marketing Image Folders
 * ============================================================================= */

/**
 * Root folder for marketing images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_PATH =
  `${IMAGE_ROOT_PATH}/marketing` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for marketing feature cards and feature illustrations.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_FEATURES_PATH =
  `${IMAGE_MARKETING_PATH}/features` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for homepage and campaign hero images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_HERO_PATH =
  `${IMAGE_MARKETING_PATH}/hero` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for infographic-style marketing images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_INFOGRAPHICS_PATH =
  `${IMAGE_MARKETING_PATH}/infographics` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for product screenshots and UI previews.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_SCREENSHOTS_PATH =
  `${IMAGE_MARKETING_PATH}/screenshots` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for marketing thumbnails, cards, and preview images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_MARKETING_THUMBNAILS_PATH =
  `${IMAGE_MARKETING_PATH}/thumbnails` as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Page Image Folders
 * ============================================================================= */

/**
 * Root folder for page-specific images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_PATH =
  `${IMAGE_ROOT_PATH}/pages` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for About page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_ABOUT_PATH =
  `${IMAGE_PAGES_PATH}/about` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Auth page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_AUTH_PATH =
  `${IMAGE_PAGES_PATH}/auth` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Contact page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_CONTACT_PATH =
  `${IMAGE_PAGES_PATH}/contact` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Home page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_HOME_PATH =
  `${IMAGE_PAGES_PATH}/home` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Home page principle images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_HOME_PRINCIPLES_PATH =
  `${IMAGE_PAGES_HOME_PATH}/principles` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Home page product preview images.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_HOME_PRODUCT_PREVIEW_PATH =
  `${IMAGE_PAGES_HOME_PATH}/product-preview` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Pricing page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_PRICING_PATH =
  `${IMAGE_PAGES_PATH}/pricing` as const satisfies Public_Image_Folder_Path;

/**
 * Folder for Technology page image assets.
 *
 * @public
 * @constant
 * @readonly
 * @decorator path
 */
export const IMAGE_PAGES_TECHNOLOGY_PATH =
  `${IMAGE_PAGES_PATH}/technology` as const satisfies Public_Image_Folder_Path;

/* =============================================================================
 * Easy Access Image Path Object
 * ============================================================================= */

/**
 * Centralized image folder path registry.
 *
 * This object mirrors the folder structure inside:
 *
 * apps/frontend/public/images
 *
 * @public
 * @constant
 * @readonly
 * @decorator registry
 *
 * @example
 * import { Image_Paths } from '@aerealith-ai/content';
 *
 * const logo = `${Image_Paths.brand.logos}/header-logo.png`;
 * const hero = `${Image_Paths.marketing.hero}/hero-1.png`;
 * const principle = `${Image_Paths.pages.home.principles}/privacy-ensured.png`;
 */
export const Image_Paths = {
  /**
   * Root `/images` folder.
   *
   * @decorator root
   */
  root: IMAGE_ROOT_PATH,

  /**libs/content/src/en/constants/images.ts
   * Global background image folders.
   *
   * @decorator group
   */
  backgrounds: IMAGE_BACKGROUNDS_PATH,

  /**
   * Brand-related image folders.
   *
   * @decorator group
   */
  brand: {
    root: IMAGE_BRAND_PATH,
    appIcons: IMAGE_BRAND_APP_ICONS_PATH,
    logos: IMAGE_BRAND_LOGOS_PATH,
    marks: IMAGE_BRAND_MARKS_PATH,
  },

  /**
   * Content-related image folders.
   *
   * @decorator group
   */
  content: {
    root: IMAGE_CONTENT_PATH,
    devblog: IMAGE_CONTENT_DEVBLOG_PATH,
    docs: IMAGE_CONTENT_DOCS_PATH,
  },

  /**
   * Marketing image folders.
   *
   * @decorator group
   */
  marketing: {
    root: IMAGE_MARKETING_PATH,
    features: IMAGE_MARKETING_FEATURES_PATH,
    hero: IMAGE_MARKETING_HERO_PATH,
    infographics: IMAGE_MARKETING_INFOGRAPHICS_PATH,
    screenshots: IMAGE_MARKETING_SCREENSHOTS_PATH,
    thumbnails: IMAGE_MARKETING_THUMBNAILS_PATH,
  },

  /**
   * Page-specific image folders.
   *
   * @decorator group
   */
  pages: {
    root: IMAGE_PAGES_PATH,

    about: IMAGE_PAGES_ABOUT_PATH,
    auth: IMAGE_PAGES_AUTH_PATH,
    contact: IMAGE_PAGES_CONTACT_PATH,

    home: {
      root: IMAGE_PAGES_HOME_PATH,
      principles: IMAGE_PAGES_HOME_PRINCIPLES_PATH,
      productPreview: IMAGE_PAGES_HOME_PRODUCT_PREVIEW_PATH,
    },

    pricing: IMAGE_PAGES_PRICING_PATH,
    technology: IMAGE_PAGES_TECHNOLOGY_PATH,
  },
} as const;

/**
 * Type-safe representation of the full `Image_Paths` registry.
 *
 * @public
 * @decorator type
 */
export type Image_Paths_Type = typeof Image_Paths;