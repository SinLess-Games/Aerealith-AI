// libs/content/src/en/technology/frameworks.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary frameworks technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/frameworks.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const FrameworksImage =
  `${Image_Paths.pages.technology}/frameworks.png` as const;

/**
 * Framework technology cards.
 *
 * This list intentionally includes only application and web frameworks,
 * not package managers, ORMs, testing tools, linting tools, formatters,
 * monorepo tooling, or dependency-management packages.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const frameworksCards = [
  {
    title: 'Frameworks',
    description:
      'Application and web frameworks used to build Aerealith AI frontend experiences, APIs, edge services, routing layers, and user-facing product workflows.',
    listItems: [
      {
        text: 'Next.js',
        href: 'https://nextjs.org/',
        role: 'React Framework',
        detailedDescription:
          'Next.js is a React framework for building full-stack web applications with routing, rendering, data fetching, optimization, server components, and deployment-focused workflows. It supports both server and client rendering patterns and is especially useful for product sites, dashboards, documentation, SaaS frontends, and API-adjacent application surfaces. Aerealith AI can use Next.js for the hosted web app, marketing site, documentation interfaces, dashboard experiences, and user-facing product workflows.',
      },
      {
        text: 'Hono',
        href: 'https://hono.dev/',
        role: 'Web Framework',
        detailedDescription:
          'Hono is a small, fast web framework designed for modern JavaScript and TypeScript runtimes, including edge, serverless, and traditional server environments. It is useful for APIs, middleware, lightweight services, Cloudflare Workers, routing layers, and performance-sensitive web endpoints. Aerealith AI can use Hono for edge-first APIs, Cloudflare Worker services, webhooks, lightweight automation endpoints, and integration surfaces that need speed and portability.',
      },
    ],
    image: FrameworksImage,
    link: '/technology/frameworks',
    buttonText: 'Explore frameworks',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `frameworksCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const FrameworksCards = frameworksCards;