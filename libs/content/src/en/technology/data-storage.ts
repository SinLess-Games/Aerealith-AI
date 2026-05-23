// libs/content/src/en/technology/data-storage.ts

import type { ReadonlyCardArray } from '../../types';

export const dataStorageCards = [
  {
    title: 'Data & Messaging',
    description:
      'Databases, object storage, vector databases, message queues, media asset platforms, container registries, and low-latency data systems that power modern distributed applications.',
    listItems: [
      {
        text: 'CockroachDB',
        href: 'https://www.cockroachlabs.com/',
        role: 'Distributed SQL Database',
        detailedDescription:
          'CockroachDB is a distributed SQL database designed for scalable, resilient, cloud-native applications. It uses a PostgreSQL-compatible wire protocol, supports familiar SQL workflows, and is built for multi-node and multi-region deployments. Helix AI can use CockroachDB where globally available relational data, strong consistency, horizontal scaling, and operational survivability are important.',
      },
      {
        text: 'Cloudflare D1',
        href: 'https://developers.cloudflare.com/d1/',
        role: 'Serverless SQL Database',
        detailedDescription:
          'Cloudflare D1 is a serverless SQL database built for applications running on the Cloudflare developer platform. It is useful for edge-native application data, lightweight relational workloads, configuration records, metadata, small product tables, and services that benefit from tight integration with Workers. Helix AI can use D1 for lightweight platform data, edge-adjacent metadata, waitlist records, feature state, small configuration datasets, and Cloudflare-native workflows where a full distributed database is not required.',
      },
      {
        text: 'Redis',
        href: 'https://redis.io/',
        role: 'In-Memory Cache & Data Store',
        detailedDescription:
          'Redis is a fast in-memory data platform commonly used for caching, session storage, queues, rate limiting, leaderboards, pub/sub, search, vector workflows, and real-time application state. It is useful when systems need low-latency reads and writes close to application logic. Helix AI can use Redis for short-term memory, session context, queues, rate limits, feature flags, and hot-path operational state.',
      },
      {
        text: 'Redis Vector Store',
        href: 'https://redis.io/docs/latest/develop/interact/search-and-query/advanced-concepts/vectors/',
        role: 'Vector Search & Semantic Cache',
        detailedDescription:
          'Redis Vector Store uses Redis vector search capabilities to store embeddings, perform similarity search, and support semantic retrieval workflows close to low-latency application state. It is useful for AI memory, semantic caching, recommendation systems, retrieval-augmented generation, session-aware context lookup, and fast similarity matching. Helix AI can use Redis Vector Store for short-term semantic memory, hot-path retrieval, assistant context caching, recent conversation recall, lightweight RAG workflows, and fast vector lookups where speed matters more than long-term archival storage.',
      },
      {
        text: 'Cloudflare Queues',
        href: 'https://developers.cloudflare.com/queues/',
        role: 'Serverless Message Queues',
        detailedDescription:
          'Cloudflare Queues provides serverless message queues for asynchronous background processing on the Cloudflare platform. It is useful for decoupling workloads, buffering events, processing jobs, handling webhooks, retrying failed tasks, and moving work out of user-facing request paths. Helix AI can use Cloudflare Queues for automation jobs, integration events, waitlist processing, email workflows, file-processing tasks, AI background work, and edge-first event pipelines.',
      },
      {
        text: 'NATS',
        href: 'https://nats.io/',
        role: 'Cloud-Native Messaging',
        detailedDescription:
          'NATS is a lightweight, high-performance messaging system for cloud-native applications, microservices, edge systems, and IoT-style communication. Its JetStream persistence layer supports stored and replayable messages for workflows that need more than ephemeral pub/sub. Helix AI can use NATS for fast service messaging, automation events, edge-aware communication, lightweight queues, and internal platform coordination.',
      },
      {
        text: 'Qdrant',
        href: 'https://qdrant.tech/',
        role: 'Vector Database',
        detailedDescription:
          'Qdrant is a vector database designed for similarity search, semantic retrieval, recommendation systems, and AI memory workflows. It supports high-dimensional vector search with filtering and payload metadata, making it useful for retrieval-augmented generation and context-aware applications. Helix AI can use Qdrant for long-term semantic memory, knowledge-base retrieval, document search, user context lookup, organization knowledge, and AI workflows that need fast and relevant vector search.',
      },
      {
        text: 'Amazon S3',
        href: 'https://aws.amazon.com/s3/',
        role: 'Cloud Object Storage',
        detailedDescription:
          'Amazon S3 is an object storage service designed for scalable storage, high availability, security controls, lifecycle policies, analytics workflows, backups, archives, and application assets. It is widely used as a durable storage backend for cloud-native systems, data lakes, media, logs, model artifacts, and exports. Helix AI can use S3 for file uploads, generated artifacts, backups, analytics data, audit exports, and long-term object storage.',
      },
      {
        text: 'Cloudflare R2',
        href: 'https://developers.cloudflare.com/r2/',
        role: 'S3-Compatible Object Storage',
        detailedDescription:
          'Cloudflare R2 is S3-compatible object storage designed for cloud-native applications, web assets, data lakes, batch output, machine-learning artifacts, and Workers-based application architectures. It integrates naturally with the Cloudflare developer platform and avoids traditional egress-fee-heavy storage patterns. Helix AI can use R2 for object storage, public assets, user exports, backups, logs, and edge-adjacent application data.',
      },
      {
        text: 'Cloudinary',
        href: 'https://cloudinary.com/',
        role: 'Media Asset Platform',
        detailedDescription:
          'Cloudinary is a cloud-based media management platform for storing, transforming, optimizing, and delivering images, videos, and other visual assets. It is useful for responsive images, automatic optimization, transformations, asset organization, CDN delivery, and media-heavy web experiences. Helix AI can use Cloudinary for brand assets, generated images, marketing media, user-uploaded visuals, documentation images, social preview graphics, and optimized delivery of product visuals.',
      },
      {
        text: 'GitHub Container Registry',
        href: 'https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry',
        role: 'Container Image Registry',
        detailedDescription:
          'GitHub Container Registry, commonly referred to as GHCR, is a container image registry integrated with GitHub Packages. It is useful for storing, versioning, publishing, and consuming OCI container images alongside repositories, workflows, permissions, and release automation. Helix AI can use GHCR for application images, service containers, worker images, documentation builds, development images, deployment artifacts, and GitOps-driven Kubernetes releases.',
      },
      {
        text: 'ClickHouse',
        href: 'https://clickhouse.com/',
        role: 'Columnar OLAP Database',
        detailedDescription:
          'ClickHouse is a fast column-oriented database management system for real-time analytics and SQL-based reporting. It is commonly used for observability, telemetry, dashboards, event analytics, product analytics, security analytics, and high-volume analytical queries. Helix AI can use ClickHouse for user-facing dashboards, operational analytics, event exploration, usage reporting, and high-performance analytical workloads.',
      },
    ],
    image: '/images/technology/data-storage.png',
    link: '/technology/data-storage',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `dataStorageCards` for new imports.
 */
export const DataStorageCards = dataStorageCards;