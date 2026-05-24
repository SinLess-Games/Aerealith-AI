// libs/content/src/en/technology/networking.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary networking technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/networking.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const NetworkingImage =
  `${Image_Paths.pages.technology}/networking.png` as const;

/**
 * Networking and CDN technology cards.
 *
 * This list intentionally includes only the networking services
 * currently used by Aerealith AI:
 *
 * - Cloudflare
 * - Cloudflare Workers
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const networkingCards = [
  {
    title: 'Networking & CDN',
    description:
      'Edge delivery, DNS, CDN, serverless routing, application security, and globally distributed networking services used to connect Aerealith AI to users and platform systems securely.',
    listItems: [
      {
        text: 'Cloudflare',
        href: 'https://www.cloudflare.com/',
        role: 'Global Network & CDN',
        detailedDescription:
          'Cloudflare provides a global network for CDN delivery, application security, DDoS protection, DNS, traffic control, caching, and edge services. Aerealith AI can use Cloudflare for DNS, edge delivery, cache control, public application routing, WAF protections, rate limiting, domain security, and globally distributed access to frontend and API surfaces.',
      },
      {
        text: 'Cloudflare Workers',
        href: 'https://workers.cloudflare.com/',
        role: 'Edge Serverless Runtime',
        detailedDescription:
          'Cloudflare Workers is a serverless edge runtime for running application code close to users without managing traditional servers. It integrates with Cloudflare platform services such as KV, D1, R2, Queues, Workers AI, and AI Gateway. Aerealith AI can use Workers for edge APIs, webhook receivers, automation triggers, lightweight routing, middleware, request handling, and globally distributed frontend-adjacent logic.',
      },
    ],
    image: NetworkingImage,
    link: '/technology/networking',
    buttonText: 'Explore networking',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `networkingCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const NetworkingCards = networkingCards;