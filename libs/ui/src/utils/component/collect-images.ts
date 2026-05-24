// libs/ui/src/utils/component/collect-images.ts

/**
 * Public image path accepted by image collection helpers.
 *
 * This intentionally only accepts paths that start with `/images` because
 * Next.js serves files from `apps/frontend/public/images` at `/images`.
 *
 * @public
 * @type
 * @decorator type
 */
export type CollectImagePath = `/images${string}`;

/**
 * Supported image file extensions.
 *
 * @public
 * @constant
 * @readonly
 * @decorator config
 */
export const COLLECT_IMAGE_EXTENSIONS = [
  '.apng',
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
] as const;

/**
 * Options for collecting public image paths.
 *
 * @public
 * @interface
 * @decorator options
 */
export interface CollectImagesOptions {
  /**
   * Optional public directory root.
   *
   * Server-side implementations can use this when the frontend public
   * directory cannot be resolved automatically.
   *
   * @default undefined
   */
  publicDir?: string;

  /**
   * Whether child folders should be searched recursively.
   *
   * @default false
   */
  recursive?: boolean;

  /**
   * Allowed image extensions.
   *
   * @default COLLECT_IMAGE_EXTENSIONS
   */
  extensions?: readonly string[];
}

/**
 * Browser-safe guard for image collection.
 *
 * The actual filesystem-backed implementation must live in a server-only file,
 * such as:
 *
 * libs/ui/src/utils/component/collect-images.server.ts
 *
 * Do not import Node filesystem APIs from this file. This file may be pulled
 * into client bundles through `@aerealith-ai/ui`, so it must remain browser-safe.
 *
 * @example
 * // Server-only usage:
 * import { collectImages } from '@aerealith-ai/ui/utils/component/collect-images.server';
 *
 * const images = await collectImages('/images/pages/home/principles');
 *
 * @public
 * @async
 * @function
 * @decorator guard
 */
export async function collectImages(
  imagePath: CollectImagePath,
  _options: CollectImagesOptions = {},
): Promise<string[]> {
  throw new Error(
    [
      `collectImages("${imagePath}") cannot run in a browser/client bundle.`,
      'Use the server-only implementation instead:',
      '@aerealith-ai/ui/utils/component/collect-images.server',
    ].join('\n'),
  );
}

/**
 * Default browser-safe export.
 *
 * @public
 * @decorator default
 */
export default collectImages;