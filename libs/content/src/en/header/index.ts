import type { HeaderProps, Page } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Public GitHub repository URL for Aerealith AI.
 *
 * @public
 * @constant
 * @readonly
 * @decorator repository
 */
export const AEREALITH_AI_REPOSITORY_URL =
  'https://github.com/SinLess-Games/Aerealith-AI' as const;

/**
 * Current application version fetched from the repository package metadata.
 *
 * Source:
 * https://github.com/SinLess-Games/Aerealith-AI/blob/main/package.json
 *
 * @public
 * @constant
 * @readonly
 * @decorator version
 */
export const AEREALITH_AI_CURRENT_VERSION = '0.2.0' as const;

/**
 * Primary navigation pages shown in the site header.
 *
 * @public
 * @constant
 * @readonly
 * @decorator navigation
 */
export const headerPages = [
  {
    name: 'Home',
    url: '/',
  },
  {
    name: 'About',
    url: '/About',
  },
  // {
  //   name: 'Pricing',
  //   url: '/Pricing',
  // },
  {
    name: 'Tech Stack',
    url: '/Technology',
  },
  {
    name: 'Contact',
    url: '/Contact',
  },
] as const satisfies readonly Page[];

/**
 * Returns the current Aerealith AI application version.
 *
 * This is intentionally synchronous because `headerProps` is exported as a
 * static content object. Runtime network fetching should not happen inside this
 * content constant because it can break static rendering, client bundles, and
 * deterministic builds.
 *
 * To update this value later, update `AEREALITH_AI_CURRENT_VERSION` from the
 * root repository `package.json`.
 *
 * @public
 * @function
 * @returns Current application version string.
 * @decorator version
 */
export function fetchCurrentVersion(): string {
  return AEREALITH_AI_CURRENT_VERSION;
}

/**
 * Header content configuration.
 *
 * @public
 * @constant
 * @readonly
 * @decorator header
 */
export const headerProps = {
  logo: `${Image_Paths.brand.logos}/header-logo.png`,
  title: 'Aerealith AI',
  version: fetchCurrentVersion(),
  pages: headerPages,
} as const satisfies HeaderProps;

export default headerProps;