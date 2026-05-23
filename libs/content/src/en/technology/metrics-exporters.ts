// libs/content/src/en/technology/metrics-exporters.ts

import type { ReadonlyCardArray } from '../../types';

/**
 * Prometheus-compatible exporters and telemetry agents that surface runtime
 * metrics from systems, services, and environments powering Helix AI.
 */
export const metricsExportersCards = [
  {
    title: 'Metrics Exporters',
    description:
      'Prometheus exporters, telemetry collectors, and monitoring agents that expose metrics from infrastructure, services, runtimes, applications, and cloud platforms.',
    listItems: [
      {
        text: 'Azure Metrics Exporter',
        href: 'https://github.com/RobustPerception/azure_metrics_exporter',
        role: 'Azure Cloud Metrics',
        detailedDescription:
          'Azure Metrics Exporter bridges Azure Monitor metrics into Prometheus-compatible workflows. It can be useful for monitoring Azure-hosted virtual machines, storage, databases, and managed services alongside Kubernetes and application telemetry. Helix AI can use this pattern when Azure infrastructure needs to appear in the same dashboards and alerting pipelines as the rest of the platform.',
      },
      {
        text: 'Blackbox Exporter',
        href: 'https://github.com/prometheus/blackbox_exporter',
        role: 'Endpoint Probing',
        detailedDescription:
          'Blackbox Exporter probes endpoints over protocols such as HTTP, HTTPS, DNS, TCP, ICMP, and gRPC, then exposes the results as Prometheus metrics. It is useful for uptime checks, external health checks, certificate monitoring, DNS validation, latency tracking, and dependency availability. Helix AI can use Blackbox Exporter for public endpoint monitoring, synthetic checks, gateway health, and service availability alerts.',
      },
      {
        text: 'cAdvisor',
        href: 'https://github.com/google/cadvisor',
        role: 'Container Metrics',
        detailedDescription:
          'cAdvisor analyzes resource usage and performance characteristics of running containers. It provides container-level visibility into CPU, memory, filesystem, and network behavior and is commonly associated with Kubernetes node monitoring through kubelet integration. Helix AI can use cAdvisor-derived metrics for container performance dashboards, resource planning, workload troubleshooting, and saturation alerts.',
      },
      {
        text: 'Cilium Metrics',
        href: 'https://docs.cilium.io/en/stable/observability/metrics/',
        role: 'Cilium Network Metrics',
        detailedDescription:
          'Cilium exposes Prometheus metrics for eBPF-powered networking, policy, service connectivity, and observability components. These metrics help track packet handling, policy enforcement, drops, proxy behavior, Hubble visibility, and cluster-network health. Helix AI can use Cilium metrics for Kubernetes networking dashboards, policy troubleshooting, service connectivity alerts, and zero-trust observability.',
      },
      {
        text: 'ClickHouse Exporter',
        href: 'https://github.com/ClickHouse/clickhouse_exporter',
        role: 'OLAP Database Metrics',
        detailedDescription:
          'ClickHouse Exporter exposes operational metrics from ClickHouse for Prometheus-based monitoring. It can help observe query behavior, table activity, replica health, storage usage, and database performance signals. Helix AI can use ClickHouse metrics for analytics-platform health, dashboard performance, ingestion visibility, and high-volume reporting workloads.',
      },
      {
        text: 'CloudWatch Exporter',
        href: 'https://github.com/prometheus/cloudwatch_exporter',
        role: 'AWS Cloud Metrics',
        detailedDescription:
          'CloudWatch Exporter collects metrics from AWS CloudWatch and exposes them to Prometheus. It is useful when AWS services need to be monitored through the same alerting and dashboarding stack as Kubernetes, applications, and self-hosted infrastructure. Helix AI can use CloudWatch Exporter for AWS compute, storage, database, serverless, billing-adjacent, and managed-service visibility.',
      },
      {
        text: 'CockroachDB Metrics',
        href: 'https://www.cockroachlabs.com/docs/stable/monitor-cockroachdb-with-prometheus',
        role: 'Distributed SQL Metrics',
        detailedDescription:
          'CockroachDB exposes Prometheus-compatible metrics for observing distributed SQL clusters. These metrics can help track node health, SQL behavior, KV operations, replication, ranges, storage, and cluster-level performance. Helix AI can use CockroachDB metrics for database availability, multi-node health, query troubleshooting, capacity planning, and platform data-layer alerting.',
      },
      {
        text: 'CoreDNS Metrics',
        href: 'https://coredns.io/plugins/metrics/',
        role: 'DNS Server Metrics',
        detailedDescription:
          'CoreDNS includes a Prometheus metrics plugin for exposing DNS server metrics such as request volume, response codes, request duration, and plugin behavior. These metrics are important for understanding Kubernetes DNS health and service-discovery reliability. Helix AI can use CoreDNS metrics for cluster DNS dashboards, DNS latency alerts, service-discovery troubleshooting, and application availability investigations.',
      },
      {
        text: 'Envoy Metrics',
        href: 'https://www.envoyproxy.io/docs/envoy/latest/operations/telemetry/metrics',
        role: 'Service Proxy Metrics',
        detailedDescription:
          'Envoy exposes detailed metrics for listeners, clusters, upstreams, HTTP routing, gRPC traffic, connection pools, retries, and service-proxy behavior. These metrics are valuable in ingress, service mesh, and API gateway architectures. Helix AI can use Envoy metrics through Istio, gateways, or proxy deployments for traffic health, latency, error rates, and service dependency visibility.',
      },
      {
        text: 'etcd Metrics',
        href: 'https://etcd.io/docs/',
        role: 'Key-Value Store Metrics',
        detailedDescription:
          'etcd exposes operational metrics for the distributed key-value store that backs many Kubernetes control planes. These metrics help observe leader status, consensus behavior, request latency, database size, disk sync behavior, and cluster health. Helix AI can use etcd metrics for Kubernetes control-plane dashboards, upgrade safety checks, and critical cluster-health alerting.',
      },
      {
        text: 'Grafana Alloy',
        href: 'https://grafana.com/docs/alloy/latest/',
        role: 'Telemetry Collector',
        detailedDescription:
          'Grafana Alloy is Grafana Labs’ distribution of the OpenTelemetry Collector and is designed for collecting, processing, and forwarding telemetry data. It can handle metrics, logs, traces, and profiles across infrastructure and application observability pipelines. Helix AI can use Grafana Alloy as a unified collector for Kubernetes telemetry, application signals, logs, traces, profiles, and Grafana Cloud or self-hosted observability backends.',
      },
      {
        text: 'HAProxy Exporter',
        href: 'https://github.com/prometheus/haproxy_exporter',
        role: 'Load Balancer Metrics',
        detailedDescription:
          'HAProxy Exporter exposes HAProxy statistics as Prometheus metrics. It can help monitor frontends, backends, active sessions, request rates, queue depth, response behavior, and load-balancer health. Helix AI can use HAProxy metrics in environments that rely on HAProxy for ingress, load balancing, service exposure, or legacy traffic routing.',
      },
      {
        text: 'Kube-State-Metrics',
        href: 'https://github.com/kubernetes/kube-state-metrics',
        role: 'Kubernetes Object Metrics',
        detailedDescription:
          'Kube-State-Metrics listens to the Kubernetes API server and generates metrics about the state of Kubernetes objects such as Pods, Deployments, ReplicaSets, Nodes, and other resources. It focuses on object state rather than direct resource usage. Helix AI can use Kube-State-Metrics for dashboards and alerts around desired versus actual state, unavailable workloads, pod conditions, deployment health, and cluster inventory.',
      },
      {
        text: 'NGINX Prometheus Exporter',
        href: 'https://github.com/nginx/nginx-prometheus-exporter',
        role: 'NGINX Web Server Metrics',
        detailedDescription:
          'NGINX Prometheus Exporter exposes NGINX and NGINX Plus metrics for Prometheus-based monitoring. It can help observe active connections, requests, connection states, and web-server behavior depending on the configured NGINX status source. Helix AI can use NGINX metrics for ingress visibility, web frontend health, reverse-proxy performance, and traffic troubleshooting.',
      },
      {
        text: 'Node Exporter',
        href: 'https://github.com/prometheus/node_exporter',
        role: 'Linux System Metrics',
        detailedDescription:
          'Node Exporter exposes hardware and operating-system metrics from Linux hosts, including CPU, memory, disk, filesystem, network, load, and kernel-level signals. It is one of the standard building blocks for Prometheus-based infrastructure monitoring. Helix AI can use Node Exporter for server health dashboards, capacity planning, bare-metal monitoring, VM observability, and node-level alerts.',
      },
      {
        text: 'OpenTelemetry Collector',
        href: 'https://opentelemetry.io/docs/collector/',
        role: 'Unified Telemetry Pipeline',
        detailedDescription:
          'The OpenTelemetry Collector provides a vendor-agnostic way to receive, process, and export telemetry data such as metrics, logs, and traces. It reduces the need to run separate agents for every backend or telemetry format. Helix AI can use the OpenTelemetry Collector for unified telemetry pipelines, application instrumentation, distributed tracing, vendor-neutral observability, and routing data to Prometheus, Loki, Tempo, Grafana, or other backends.',
      },
      {
        text: 'Pushgateway',
        href: 'https://github.com/prometheus/pushgateway',
        role: 'Ephemeral Job Metrics',
        detailedDescription:
          'Pushgateway allows short-lived and batch jobs to push metrics that Prometheus can later scrape. It is useful when a job finishes before Prometheus would normally discover and scrape it, though it should be used carefully to avoid stale or misleading metrics. Helix AI can use Pushgateway for CI jobs, scheduled maintenance, batch tasks, backup summaries, and one-shot automation metrics.',
      },
      {
        text: 'Redis Exporter',
        href: 'https://github.com/oliver006/redis_exporter',
        role: 'Redis Metrics',
        detailedDescription:
          'Redis Exporter exposes Redis metrics for Prometheus-based monitoring, including memory use, connected clients, command statistics, keyspace information, replication state, and latency-related signals. Helix AI can use Redis metrics for cache health, session state, queues, rate limits, short-term memory, and hot-path platform reliability.',
      },
      {
        text: 'Telegraf',
        href: 'https://github.com/influxdata/telegraf',
        role: 'Metrics Collection Agent',
        detailedDescription:
          'Telegraf is a plugin-driven agent for collecting, processing, aggregating, and writing metrics from many systems and services. It can be used with InfluxDB and other monitoring backends depending on configuration. Helix AI can use Telegraf for broad infrastructure collection, legacy integrations, custom metrics pipelines, and environments where plugin-based metric ingestion is useful.',
      },
      {
        text: 'Vault Exporter',
        href: 'https://github.com/pavolloffay/vault-exporter',
        role: 'Secrets Platform Metrics',
        detailedDescription:
          'Vault Exporter exposes Vault status and operational metrics for Prometheus-based monitoring. It can help track seal state, health, token and lease behavior, request latency, and secrets-platform availability. Helix AI can use Vault metrics for secret-management health, connector credential safety, KMS workflows, certificate automation, and security-critical alerting.',
      },
    ],
    image: '/images/technology/metrics-exporters.png',
    link: '/technology/metrics-exporters',
    buttonText: 'Explore exporters',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `metricsExportersCards` for new imports.
 */
export const MetricsExportersCards = metricsExportersCards;