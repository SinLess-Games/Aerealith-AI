// libs/shared/site-content/src/lib/technology/metrics-exporters.ts

import type { CardProps } from '../types/card';

/**
 * ### MetricsExportersCards
 *
 * Prometheus-compatible exporters and telemetry agents that surface runtime metrics
 * from systems, services, and environments powering Helix AI.
 *
 * @example
 * ```ts
 * import { MetricsExportersCards } from "@/lib/constants/frontend/technology/metrics-exporters"
 * ```
 */
export const MetricsExportersCards = [
  {
    title: 'Metrics Exporters',
    description:
      'Prometheus exporters and telemetry agents that scrape and expose metrics from infrastructure, services, and runtimes.',
    listItems: [
      {
        text: 'Azure Metrics Exporter',
        href: 'https://github.com/RobustPerception/azure_metrics_exporter',
        role: 'Azure Cloud Metrics',
        detailedDescription:
          'Exports Azure Monitor metrics from virtual machines, storage accounts, databases, and other services to Prometheus.',
      },
      {
        text: 'Blackbox Exporter',
        href: 'https://github.com/prometheus/blackbox_exporter',
        role: 'Endpoint Probing',
        detailedDescription:
          'Performs ICMP, HTTP, TCP, and DNS probes to track uptime, latency, and SSL expiry from Prometheus scrape targets.',
      },
      {
        text: 'cAdvisor',
        href: 'https://github.com/google/cadvisor',
        role: 'Container Metrics',
        detailedDescription:
          'Auto-discovers containers and exports real-time CPU, memory, and filesystem metrics for individual containers. Often embedded in kubelet.',
      },
      {
        text: 'Ceph Exporter',
        href: 'https://github.com/digitalocean/ceph_exporter',
        role: 'Ceph Storage Metrics',
        detailedDescription:
          'Exposes Ceph cluster status, OSD metrics, and pool stats to Prometheus for monitoring distributed object and block storage.',
      },
      {
        text: 'Cilium Exporter',
        href: 'https://github.com/cilium/cilium',
        role: 'Cilium Network Metrics',
        detailedDescription:
          'Surfaces Cilium metrics from eBPF-based Kubernetes networking, including packet drops, L7 proxy stats, and policy verdicts.',
      },
      {
        text: 'ClickHouse Exporter',
        href: 'https://github.com/ClickHouse/clickhouse_exporter',
        role: 'OLAP DB Metrics',
        detailedDescription:
          'Exports ClickHouse query durations, connection stats, disk usage, and replica lag for data warehouse observability.',
      },
      {
        text: 'Cloudwatch Exporter',
        href: 'https://github.com/prometheus/cloudwatch_exporter',
        role: 'AWS Cloud Metrics',
        detailedDescription:
          'Fetches CloudWatch metrics from AWS services including EC2, S3, Lambda, and RDS for ingestion by Prometheus.',
      },
      {
        text: 'CockroachDB Exporter',
        href: 'https://github.com/cockroachdb/cockroach',
        role: 'Distributed SQL Metrics',
        detailedDescription:
          'Exposes CockroachDB SQL stats, raft consensus metrics, KV throughput, and node liveness for high-availability SQL clusters.',
      },
      {
        text: 'Consul Exporter',
        href: 'https://github.com/prometheus/consul_exporter',
        role: 'Service Discovery Metrics',
        detailedDescription:
          'Exports Consul catalog, health checks, and service registrations to Prometheus, enabling monitoring of service mesh topologies.',
      },
      {
        text: 'CoreDNS Exporter',
        href: 'https://github.com/coredns/coredns',
        role: 'DNS Server Metrics',
        detailedDescription:
          'CoreDNS natively exposes Prometheus metrics for DNS request rate, response time, cache hits, and error codes.',
      },
      {
        text: 'Couchbase Exporter',
        href: 'https://github.com/blakelead/couchbase_exporter',
        role: 'Couchbase DB Metrics',
        detailedDescription:
          'Provides metrics for Couchbase cluster health, bucket stats, operations/sec, and memory usage.',
      },
      {
        text: 'Elasticsearch Exporter',
        href: 'https://github.com/prometheus-community/elasticsearch_exporter',
        role: 'Search & Index Metrics',
        detailedDescription:
          'Exposes Elasticsearch cluster health, node stats, and query latencies—vital for monitoring ingest latency and shard balance.',
      },
      {
        text: 'Envoy Exporter',
        href: 'https://www.envoyproxy.io/docs/envoy/latest/operations/telemetry/metrics',
        role: 'Service Proxy Metrics',
        detailedDescription:
          'Exports detailed HTTP/gRPC stats, connection counters, and upstream health for Envoy sidecar proxies.',
      },
      {
        text: 'etcd Exporter',
        href: 'https://github.com/etcd-io/etcd',
        role: 'Key-Value Store Metrics',
        detailedDescription:
          'Exposes metrics from etcd including leader status, request latency, and WAL sync duration.',
      },
      {
        text: 'GitLab Exporter',
        href: 'https://gitlab.com/gitlab-org/gitlab-exporter',
        role: 'CI/CD Pipeline Metrics',
        detailedDescription:
          'Surfaces GitLab job durations, runner queues, and Redis/PostgreSQL backend usage.',
      },
      {
        text: 'Grafana Agent',
        href: 'https://grafana.com/docs/agent/latest/',
        role: 'Lightweight Telemetry Collector',
        detailedDescription:
          'Collects metrics, logs, and traces from infrastructure and forwards to Grafana Cloud or Prometheus-compatible backends.',
      },
      {
        text: 'HAProxy Exporter',
        href: 'https://github.com/prometheus/haproxy_exporter',
        role: 'Load Balancer Metrics',
        detailedDescription:
          'Monitors frontend/backend response time, active connections, queue lengths, and error rates for HAProxy instances.',
      },
      {
        text: 'InfluxDB Exporter',
        href: 'https://github.com/prometheus/influxdb_exporter',
        role: 'InfluxDB Metrics',
        detailedDescription:
          'Exports internal metrics for InfluxDB server performance, write/read throughput, and series cardinality.',
      },
      {
        text: 'Kafka Exporter',
        href: 'https://github.com/danielqsj/kafka_exporter',
        role: 'Kafka Broker Metrics',
        detailedDescription:
          'Provides metrics on topic offsets, partition lag, and consumer groups. Enables SLOs for streaming pipelines.',
      },
      {
        text: 'Kube-State-Metrics',
        href: 'https://github.com/kubernetes/kube-state-metrics',
        role: 'Kubernetes Object Metrics',
        detailedDescription:
          'Exposes Kubernetes resource states such as pod status, deployments, and node conditions for alerting and dashboards.',
      },
      {
        text: 'MinIO Exporter',
        href: 'https://github.com/minio/minio',
        role: 'Object Store Metrics',
        detailedDescription:
          'MinIO exports Prometheus metrics covering bucket usage, latency, replication status, and erasure coding behavior.',
      },
      {
        text: 'Netdata',
        href: 'https://github.com/netdata/netdata',
        role: 'Real-Time System Monitoring',
        detailedDescription:
          'High-resolution dashboarding agent for hundreds of system metrics including disks, CPU, containers, and apps. Supports streaming to Prometheus.',
      },
      {
        text: 'nginx Prometheus Exporter',
        href: 'https://github.com/nginxinc/nginx-prometheus-exporter',
        role: 'Nginx Web Server Metrics',
        detailedDescription:
          'Parses Nginx stub status and logs to surface HTTP codes, active connections, and response durations to Prometheus.',
      },
      {
        text: 'Node Exporter',
        href: 'https://github.com/prometheus/node_exporter',
        role: 'Linux System Metrics',
        detailedDescription:
          'Exports CPU, memory, disk, and network stats from Linux hosts in Prometheus format.',
      },
      {
        text: 'OpenTelemetry Collector',
        href: 'https://opentelemetry.io/docs/collector/',
        role: 'Unified Telemetry Pipeline',
        detailedDescription:
          'Receives, processes, and exports metrics, logs, and traces from OpenTelemetry SDKs. Integrates with Prometheus, Loki, Tempo, and more.',
      },
      {
        text: 'PowerDNS Exporter',
        href: 'https://github.com/powerdns/prometheus-pdns',
        role: 'DNS Resolver Metrics',
        detailedDescription:
          'Exports PowerDNS authoritative and recursor stats such as query counts, cache hits, and backend failures.',
      },
      {
        text: 'Pushgateway',
        href: 'https://github.com/prometheus/pushgateway',
        role: 'Ephemeral Job Metrics',
        detailedDescription:
          'Accepts metrics from short-lived jobs via HTTP POST and exposes them to Prometheus. Useful for CI pipelines and batch processes.',
      },
      {
        text: 'RabbitMQ Exporter',
        href: 'https://github.com/kbudde/rabbitmq_exporter',
        role: 'Message Queue Metrics',
        detailedDescription:
          'Exports RabbitMQ stats including queues, consumers, channels, and node-level stats.',
      },
      {
        text: 'Redis Exporter',
        href: 'https://github.com/oliver006/redis_exporter',
        role: 'Redis Metrics',
        detailedDescription:
          'Exports Redis performance counters, memory stats, and slowlog data. Supports Sentinel and TLS.',
      },
      {
        text: 'Telegraf',
        href: 'https://github.com/influxdata/telegraf',
        role: 'Metrics Aggregator',
        detailedDescription:
          'Plugin-driven agent that collects and outputs metrics from a wide range of sources to Prometheus and InfluxDB.',
      },
      {
        text: 'Vault Exporter',
        href: 'https://github.com/pavolloffay/vault-exporter',
        role: 'Secrets Engine Metrics',
        detailedDescription:
          'Exports Vault metrics for seal status, token creation, lease counts, and request latencies.',
      },
    ],
    image: '/images/technology/metrics-exporters.png',
    link: '/technology/metrics-exporters',
    buttonText: 'Explore exporters',
  },
] as const satisfies CardProps[];
