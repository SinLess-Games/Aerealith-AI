// libs/shared/site-content/src/lib/technology/observability.ts

import type { CardProps } from '../types/card';

/**
 * ### ObservabilityCards
 *
 * Catalog of metrics, logs, traces, profiling, alerting, and on-call tooling
 * drawn from the Grafana OSS ecosystem (LGTM stack + extras).
 *
 * @example
 * ```ts
 * import { ObservabilityCards } from '@/lib/constants/frontend/technology/observability'
 * ```
 */
export const ObservabilityCards = [
  {
    title: 'Observability',
    description:
      'Metrics, logs, traces, continuous profiling, alerting, on-call management, and supplemental tooling from the complete Grafana OSS ecosystem (LGTM + extras).',
    listItems: [
      {
        text: 'Grafana 11.0',
        href: 'https://grafana.com/',
        role: 'Dashboards & Visualization',
        detailedDescription:
          'Grafana 11 (Jun 2025) debuts Scenes-powered drag-and-drop dashboards, AI-assisted panel hints, and a unified alerting UX. New WebGL Canvas & Geomap panels render large datasets with 5× higher FPS.',
      },
      {
        text: 'Prometheus 2.52.0',
        href: 'https://prometheus.io/',
        role: 'Metrics Collection',
        detailedDescription:
          'Prometheus 2.52 (May 2025) adds an adaptive PromQL executor that parallelizes queries across remote-read backends and ships a GA OTLP receiver for native OpenTelemetry metrics ingestion.',
      },
      {
        text: 'Grafana Mimir 2.16',
        href: 'https://grafana.com/oss/mimir/',
        role: 'Scalable Metrics Backend',
        detailedDescription:
          'Mimir 2.16 (Apr 2025) scales Prometheus to billions of series with horizontally-sharded ingesters and durable object-store blocks. It trims compactor memory 35 % and introduces cardinality dashboards.',
      },
      {
        text: 'Loki 3.0',
        href: 'https://grafana.com/oss/loki/',
        role: 'Log Aggregation',
        detailedDescription:
          'Loki 3.0 (Dec 2024) replaces Boltdb-shipper with a TSDB-style index, adds native Azure Blob storage, and supports query-frontier gap-filling—cutting index footprint by 30 %.',
      },
      {
        text: 'Tempo 2.4',
        href: 'https://grafana.com/oss/tempo/',
        role: 'Tracing Backend',
        detailedDescription:
          'Tempo 2.4 (Feb 2025) graduates TraceQL to GA, adds span-metrics export to Prometheus, and halves cold-trace retrieval latency via tiered object-store caching.',
      },
      {
        text: 'Pyroscope 1.7',
        href: 'https://grafana.com/oss/pyroscope/',
        role: 'Continuous Profiling',
        detailedDescription:
          'Pyroscope 1.7 (Mar 2025) merges Grafana Phlare features, adds eBPF system-wide profiling, ingest-time relabeling, and PGO-friendly `pprof` export for regression surfacing.',
      },
      {
        text: 'Grafana Alloy 1.9',
        href: 'https://grafana.com/docs/alloy/latest/',
        role: 'Telemetry Collector',
        detailedDescription:
          'Alloy 1.9 (May 2025) unifies Prometheus scraping and OTLP pipelines, supports dynamic component reloading, and ships Pyroscope/Loki exporters—replacing Grafana Agent.',
      },
      {
        text: 'Grafana Faro 1.4',
        href: 'https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/',
        role: 'Frontend Observability SDK',
        detailedDescription:
          'Faro 1.4 (Jul 2024) GA’d browser SDK for Core Web Vitals, errors, logs, and traces. Adds Performance Timeline & Fetch instrumentation, RudderStack support, and Scenes-ready dashboards.',
      },
      {
        text: 'Grafana Beyla 1.3',
        href: 'https://grafana.com/oss/beyla-ebpf/',
        role: 'eBPF Auto-Instrumentation',
        detailedDescription:
          'Beyla 1.3 (Nov 2024) captures RED metrics and spans for HTTP/gRPC services with zero code changes. Adds TLS handshake tracing and automatic Kubernetes pod labels.',
      },
      {
        text: 'k6 0.57',
        href: 'https://grafana.com/oss/k6/',
        role: 'Load & Performance Testing',
        detailedDescription:
          'k6 0.57 (May 2025) adds browser-level WebGPU simulation, introduces test-run artifacts to Tempo, and syncs results into Grafana dashboards. k6 Studio v1.0 delivers drag-and-drop script authoring.',
      },
      {
        text: 'GoAlert 0.33.0',
        href: 'https://goalert.me/',
        role: 'On-Call Management (OSS)',
        detailedDescription:
          'GoAlert 0.33.0 (Nov 2024) is an Apache-licensed on-call scheduler with rotations, escalations, and multi-channel notifications. It integrates with Prometheus Alertmanager, exposes a Prometheus exporter, and provides Grafana dashboards.',
      },
      {
        text: 'Jaeger 1.55.0',
        href: 'https://www.jaegertracing.io/',
        role: 'Distributed Tracing',
        detailedDescription:
          'Jaeger 1.55 (Apr 2025) adds OTLP native ingest, upgrades storage plugins, and deprecates the UDP agent in favor of gRPC collectors.',
      },
      {
        text: 'Alertmanager 0.28',
        href: 'https://prometheus.io/docs/alerting/latest/alertmanager/',
        role: 'Alert Routing',
        detailedDescription:
          'Alertmanager 0.28 (May 2025) introduces receiver-level tenant IDs for SaaS isolation, adds WebSocket silences feed, and removes legacy v1 APIs.',
      },
      {
        text: 'OpenTelemetry 1.5',
        href: 'https://opentelemetry.io/',
        role: 'Unified Observability Standard',
        detailedDescription:
          'OpenTelemetry 1.5 (May 2025) stabilizes logging APIs, finalizes semantic conventions 1.0, and enables unified OTLP pipelines for logs, metrics, and traces.',
      },
    ],
    image: '/images/technology/observability.png',
    link: '/technology/observability',
    buttonText: 'Explore suite',
  },
] as const satisfies CardProps[];
