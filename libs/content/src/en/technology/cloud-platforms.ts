// libs/content/src/en/technology/cloud-platforms.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary cloud platforms technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/cloud-platforms.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const CloudPlatformsImage =
  `${Image_Paths.pages.technology}/cloud-platforms.png` as const;

/**
 * Cloud platform and managed service technology cards.
 *
 * This list intentionally includes only the cloud and managed platforms
 * currently used by Aerealith AI:
 *
 * - Cloudflare
 * - Cloudinary
 * - CockroachDB Cloud
 * - Grafana Cloud
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const cloudPlatformCards = [
  {
    title: 'Cloud Platforms & Managed Services',
    description:
      'Edge infrastructure, managed media delivery, cloud-hosted database services, and observability platforms used to host, scale, secure, monitor, and operate Aerealith AI workloads.',
    listItems: [
      {
        text: 'Cloudflare',
        href: 'https://www.cloudflare.com/developer-platform/',
        role: 'Edge & Developer Platform',
        detailedDescription:
          'Cloudflare provides the edge and developer platform layer for Aerealith AI, including application delivery, DNS, caching, security controls, serverless compute, object storage, queues, and edge-native services. It is useful for globally distributed frontend delivery, low-latency APIs, webhook handling, automation triggers, public asset delivery, access control, and resilient edge-first application architecture.',
      },
      {
        text: 'Cloudinary',
        href: 'https://cloudinary.com/',
        role: 'Media Asset Platform',
        detailedDescription:
          'Cloudinary provides managed media storage, optimization, transformation, and delivery for images, videos, and visual assets. Aerealith AI can use Cloudinary for brand assets, marketing media, generated visuals, documentation images, social preview graphics, optimized responsive delivery, and media-heavy product experiences without needing to manually manage every image transformation or delivery format.',
      },
      {
        text: 'CockroachDB Cloud',
        href: 'https://www.cockroachlabs.com/product/cockroachdb-cloud/',
        role: 'Managed Distributed SQL Database',
        detailedDescription:
          'CockroachDB Cloud provides a managed distributed SQL database service built around PostgreSQL-compatible workflows, horizontal scalability, resilience, and cloud-native operations. Aerealith AI can use CockroachDB Cloud for production relational data, account records, application state, tenant-aware platform data, metadata, audit-adjacent records, and workloads that benefit from managed database operations with strong consistency and scalable infrastructure.',
      },
      {
        text: 'Grafana Cloud',
        href: 'https://grafana.com/products/cloud/',
        role: 'Managed Observability Platform',
        detailedDescription:
          'Grafana Cloud provides managed observability services for metrics, logs, traces, profiles, dashboards, alerts, synthetic monitoring, and operational visibility. Aerealith AI can use Grafana Cloud to monitor application health, frontend behavior, backend services, infrastructure signals, user-facing performance, error rates, latency, uptime, release impact, and production incidents without needing to fully self-host the entire observability stack.',
      },
    ],
    image: CloudPlatformsImage,
    link: '/technology/cloud-platforms',
    buttonText: 'Explore platforms',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `cloudPlatformCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const CloudPlatformCards = cloudPlatformCards;