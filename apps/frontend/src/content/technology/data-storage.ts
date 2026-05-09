// libs/shared/site-content/src/lib/technology/data-storage.ts

import type { CardProps } from '../types/card';

export const DataStorageCards = [
  {
    title: 'Data & Messaging',
    description:
      'Databases, object storage, stream brokers, and low-latency caches that power modern distributed systems.',
    listItems: [
      {
        text: 'CockroachDB',
        href: 'https://www.cockroachlabs.com/',
        role: 'Distributed SQL Database',
        detailedDescription:
          'CockroachDB is a cloud-native, strongly-consistent distributed SQL database built on the Raft consensus protocol. Version 24.1 (May 2025) introduced schema-change staging with two-phase commits, Pebble LSM optimizations that cut write amplification by 35%, and Foreign Data Wrappers for federated queries. Its PostgreSQL-compatible wire protocol, automatic shard rebalancing, and multi-region survivability deliver global ACID transactions with zero-downtime upgrades.',
      },
      {
        text: 'Redis',
        href: 'https://redis.io/',
        role: 'In-Memory Cache & Store',
        detailedDescription:
          'Sub-millisecond key-value datastore supporting rich data types, streams, and search. Redis 7.2 (Aug 2023) added ACL v2, stronger TLS, and optimized I/O threads—cementing its role in caching, queues, and AI feature stores.',
      },
      {
        text: 'Kafka',
        href: 'https://kafka.apache.org/',
        role: 'Distributed Message Broker',
        detailedDescription:
          'Horizontally-scalable commit-log for high-throughput event streams. Kafka 3.7 (2025) brings KRaft (ZooKeeper-less) mode GA, tiered storage, and faster fetch APIs, enabling petabyte retention without operational overhead.',
      },
      {
        text: 'RabbitMQ',
        href: 'https://www.rabbitmq.com/',
        role: 'Message Queue System',
        detailedDescription:
          'AMQP-based broker excelling at reliable task queues. The 3.13 branch (Feb 2024) stabilizes quorum and stream queues, ships built-in Prometheus metrics, and simplifies TLS cert rotation for production fleets.',
      },
      {
        text: 'NATS',
        href: 'https://nats.io/',
        role: 'High-Performance Message Broker',
        detailedDescription:
          'NATS is a lightweight, open-source pub/sub messaging system for cloud-native microservices and IoT. The 2.11 release (Apr 2025) enhances JetStream persistence, introduces Key-Value v2 with bucket-wide replication, and adds multi-tenant leafnodes for edge-aware routing—delivering sub-millisecond latencies with at-least-once or exactly-once semantics.',
      },
      {
        text: 'Amazon S3',
        href: 'https://aws.amazon.com/s3/',
        role: 'Cloud Object Storage',
        detailedDescription:
          'Industry-standard object store offering 11 nines durability and 99.99% availability across multiple AZs, with tiered classes, lifecycle rules, and native event notifications for serverless data pipelines.',
      },
      {
        text: 'Cloudflare R2',
        href: 'https://developers.cloudflare.com/r2/',
        role: 'S3-Compatible Object Storage',
        detailedDescription:
          'Edge-optimized object store that eliminates egress fees while matching S3 APIs. R2 integrates seamlessly with Workers and Durable Objects to enable full-stack, zero-cold-data-tax architectures.',
      },
      {
        text: 'Cassandra',
        href: 'https://cassandra.apache.org/',
        role: 'Wide-Column NoSQL DB',
        detailedDescription:
          'Apache Cassandra 5.0 (Sept 2024) introduces Storage-Attached Indexes, trie-based memtables, and vector search—slashing query latency and unlocking AI/ML embedding workflows at multi-petabyte scale.',
      },
      {
        text: 'MinIO',
        href: 'https://min.io/',
        role: 'S3-Compatible Object Storage',
        detailedDescription:
          'High-performance, Kubernetes-native object store written in Go. MinIO’s 2024 AIStor release leverages erasure coding, SIMD acceleration, and WORM mode to deliver multi-TiB/s throughput for AI training pipelines.',
      },
      {
        text: 'ClickHouse',
        href: 'https://clickhouse.com/',
        role: 'Columnar OLAP DB',
        detailedDescription:
          'Blazing-fast open-source analytics engine for petabyte-scale workloads. ClickHouse 24.6 (June 2025) adds optimal table sorting, S3Queue refactor, and native Azure Queue ingestion—pushing real-time dashboards under 100 ms.',
      },
    ],
    image: '/images/technology/data-storage.png',
    link: '/technology/data-storage',
    buttonText: 'Learn more',
  },
] as const satisfies CardProps[];
