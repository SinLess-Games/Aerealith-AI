// libs/content/src/en/technology/data-storage.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary data storage and messaging technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/data-storage.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const DataStorageImage =
  `${Image_Paths.pages.technology}/data-storage.png` as const;

/**
 * Data, storage, messaging, secrets, and media platform cards.
 *
 * This list intentionally includes only the data and storage platforms
 * currently used by Aerealith AI:
 *
 * - CockroachDB
 * - Cloudflare D1
 * - Cloudflare R2
 * - Cloudflare Queues
 * - Cloudflare KV
 * - Cloudflare Secrets
 * - Cloudinary
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const dataStorageCards = [
  {
    title: 'Data, Storage & Messaging',
    description:
      'Managed databases, edge-native storage, object storage, message queues, secret handling, and media asset services used to store, secure, process, and deliver Aerealith AI platform data.',
    listItems: [
      {
        text: 'CockroachDB',
        href: 'https://www.cockroachlabs.com/',
        role: 'Distributed SQL Database',
        detailedDescription:
          'CockroachDB is a distributed SQL database designed for scalable, resilient, cloud-native applications. It uses PostgreSQL-compatible workflows, supports familiar relational data modeling, and is built for multi-node and multi-region deployments. Aerealith AI can use CockroachDB for production relational data, account records, tenant-aware platform state, metadata, audit-adjacent records, and workloads that benefit from strong consistency and operational resilience.',
      },
      {
        text: 'Cloudflare D1',
        href: 'https://developers.cloudflare.com/d1/',
        role: 'Serverless SQL Database',
        detailedDescription:
          'Cloudflare D1 is a serverless SQL database built for applications running on the Cloudflare developer platform. It is useful for edge-native relational data, lightweight application records, configuration data, waitlist records, feature state, metadata, and Cloudflare Worker-backed workflows. Aerealith AI can use D1 for smaller platform datasets and edge-adjacent application state where a lightweight SQL database is the right fit.',
      },
      {
        text: 'Cloudflare R2',
        href: 'https://developers.cloudflare.com/r2/',
        role: 'S3-Compatible Object Storage',
        detailedDescription:
          'Cloudflare R2 is S3-compatible object storage designed for application assets, uploads, backups, exports, logs, generated files, and edge-connected workloads. It integrates naturally with Cloudflare Workers and other Cloudflare services. Aerealith AI can use R2 for public assets, user exports, generated artifacts, file storage, backups, documentation assets, and long-term object storage without needing to operate a separate storage system.',
      },
      {
        text: 'Cloudflare Queues',
        href: 'https://developers.cloudflare.com/queues/',
        role: 'Serverless Message Queues',
        detailedDescription:
          'Cloudflare Queues provides serverless message queues for asynchronous background processing on the Cloudflare platform. It is useful for decoupling workloads, buffering events, handling retries, processing webhooks, and moving long-running work out of user-facing request paths. Aerealith AI can use Cloudflare Queues for automation jobs, integration events, waitlist processing, email workflows, file processing, AI background work, and edge-first event pipelines.',
      },
      {
        text: 'Cloudflare KV',
        href: 'https://developers.cloudflare.com/kv/',
        role: 'Edge Key-Value Storage',
        detailedDescription:
          'Cloudflare KV is a globally distributed key-value storage service designed for low-latency reads from Cloudflare’s edge network. It is useful for configuration values, feature state, cached metadata, public settings, routing data, and lightweight edge-accessible records. Aerealith AI can use Cloudflare KV for fast edge reads, application configuration, cached content, simple lookup data, and Worker-adjacent state that does not require relational querying.',
      },
      {
        text: 'Cloudflare Secrets',
        href: 'https://developers.cloudflare.com/workers/configuration/secrets/',
        role: 'Secret Configuration',
        detailedDescription:
          'Cloudflare Secrets provides a secure way to bind sensitive values to Cloudflare Workers without hardcoding them into source code. It is useful for API keys, tokens, service credentials, webhook secrets, and other sensitive runtime configuration values. Aerealith AI can use Cloudflare Secrets to keep Worker-connected services safer by separating sensitive configuration from the public codebase and deployment artifacts.',
      },
      {
        text: 'Cloudinary',
        href: 'https://cloudinary.com/',
        role: 'Media Asset Platform',
        detailedDescription:
          'Cloudinary is a managed media platform for storing, transforming, optimizing, and delivering images, videos, and visual assets. It is useful for responsive images, automatic optimization, transformations, asset organization, CDN delivery, and media-heavy web experiences. Aerealith AI can use Cloudinary for brand assets, marketing media, generated visuals, documentation images, social preview graphics, and optimized delivery of product visuals.',
      },
    ],
    image: DataStorageImage,
    link: '/technology/data-storage',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `dataStorageCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const DataStorageCards = dataStorageCards;