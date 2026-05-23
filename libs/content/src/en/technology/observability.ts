// libs/content/src/en/technology/observability.ts

import type { ReadonlyCardArray } from '../../types';

/**
 * Catalog of metrics, logs, traces, profiling, alerting, on-call management,
 * load testing, frontend telemetry, error tracking, managed observability,
 * and supplemental tooling used by Helix AI.
 */
export const observabilityCards = [
  {
    title: 'Observability',
    description:
      'Metrics, logs, traces, profiling, alerting, load testing, frontend telemetry, error tracking, managed observability platforms, on-call workflows, and supplemental tools for understanding production systems.',
    listItems: [
      {
        text: 'Grafana',
        href: 'https://grafana.com/',
        role: 'Dashboards & Visualization',
        detailedDescription:
          'Grafana is an observability and visualization platform for querying, exploring, alerting on, and presenting telemetry from many data sources. It is commonly used for dashboards across metrics, logs, traces, profiles, business data, infrastructure signals, and application health. Helix AI can use Grafana as the primary observability UI for platform dashboards, user-fed analytics, operational views, incident review, and shared reporting.',
      },
      {
        text: 'Grafana Cloud',
        href: 'https://grafana.com/products/cloud/',
        role: 'Managed Observability Platform',
        detailedDescription:
          'Grafana Cloud is Grafana Labs’ managed observability platform for metrics, logs, traces, profiles, dashboards, alerting, frontend observability, and related telemetry workflows. It reduces the operational burden of self-hosting observability backends while keeping the Grafana ecosystem available for production monitoring. Helix AI can use Grafana Cloud for early production visibility, managed metrics and logs, hosted dashboards, alerting, incident review, and centralized telemetry while the platform matures.',
      },
      {
        text: 'Prometheus',
        href: 'https://prometheus.io/',
        role: 'Metrics Collection',
        detailedDescription:
          'Prometheus is an open-source monitoring system and time-series database with a dimensional data model, PromQL query language, efficient local storage, and alerting rules. It collects metrics from configured targets and is widely used across Kubernetes and cloud-native systems. Helix AI can use Prometheus for live metrics collection, infrastructure dashboards, service health, SLOs, and alert rule evaluation.',
      },
      {
        text: 'Grafana Mimir',
        href: 'https://grafana.com/oss/mimir/',
        role: 'Scalable Metrics Backend',
        detailedDescription:
          'Grafana Mimir is a horizontally scalable, highly available, multi-tenant, long-term storage backend for Prometheus metrics. It is designed to scale metrics storage and querying beyond a single Prometheus instance while remaining compatible with Prometheus-style workflows. Helix AI can use Mimir for long-term metrics retention, multi-tenant observability, historical dashboards, and high-scale metric analytics.',
      },
      {
        text: 'Grafana Loki',
        href: 'https://grafana.com/oss/loki/',
        role: 'Log Aggregation',
        detailedDescription:
          'Grafana Loki is a log aggregation system designed to store and query logs efficiently using labels rather than indexing full log contents by default. It integrates closely with Grafana and Prometheus-style labels for correlation between logs and metrics. Helix AI can use Loki for application logs, audit-adjacent operational logs, Kubernetes logs, incident investigation, and cost-conscious log exploration.',
      },
      {
        text: 'Grafana Tempo',
        href: 'https://grafana.com/oss/tempo/',
        role: 'Tracing Backend',
        detailedDescription:
          'Grafana Tempo is a distributed tracing backend designed for storing and querying traces with object storage and Grafana integration. It works with OpenTelemetry and other tracing protocols to help teams follow requests across distributed services. Helix AI can use Tempo for request tracing, integration workflows, API latency analysis, automation debugging, and service dependency investigations.',
      },
      {
        text: 'Grafana Pyroscope',
        href: 'https://grafana.com/oss/pyroscope/',
        role: 'Continuous Profiling',
        detailedDescription:
          'Grafana Pyroscope is a continuous profiling database that helps teams understand CPU, memory, allocation, lock, and other performance characteristics over time. Profiling adds another layer of observability beyond logs, metrics, and traces by showing where applications spend resources. Helix AI can use Pyroscope for performance tuning, capacity planning, regression detection, and cost optimization across backend services.',
      },
      {
        text: 'Grafana Alloy',
        href: 'https://grafana.com/oss/alloy-opentelemetry-collector/',
        role: 'Telemetry Collector',
        detailedDescription:
          'Grafana Alloy is Grafana Labs’ OpenTelemetry Collector distribution with built-in Prometheus pipelines and support for metrics, logs, traces, and profiles. It can collect, process, and forward telemetry data across infrastructure and application observability pipelines. Helix AI can use Alloy as a unified collection layer for Kubernetes telemetry, application signals, logs, traces, profiles, and Grafana-compatible backends.',
      },
      {
        text: 'Grafana Faro',
        href: 'https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/',
        role: 'Frontend Observability SDK',
        detailedDescription:
          'Grafana Faro is a frontend observability project for collecting browser-side signals such as errors, web vitals, logs, events, and traces. It helps connect user-facing performance and frontend failures to backend telemetry. Helix AI can use Faro for web application monitoring, user-experience visibility, frontend error tracking, route performance, and browser-to-backend trace correlation.',
      },
      {
        text: 'Grafana Beyla',
        href: 'https://grafana.com/oss/beyla-ebpf/',
        role: 'eBPF Auto-Instrumentation',
        detailedDescription:
          'Grafana Beyla uses eBPF to automatically observe supported application traffic and generate telemetry without requiring application code changes. It can help surface service-level metrics and traces for workloads that are not manually instrumented yet. Helix AI can use Beyla for low-friction service visibility, early instrumentation coverage, Kubernetes workload discovery, and migration toward full OpenTelemetry instrumentation.',
      },
      {
        text: 'Grafana k6',
        href: 'https://grafana.com/oss/k6/',
        role: 'Load & Performance Testing',
        detailedDescription:
          'Grafana k6 is an open-source load-testing tool for testing APIs, services, websites, and user journeys through scripted performance scenarios. It helps validate reliability, latency, throughput, and scaling behavior before and after production changes. Helix AI can use k6 for release validation, API performance testing, SLO checks, capacity planning, and regression testing.',
      },
      {
        text: 'Sentry',
        href: 'https://sentry.io/',
        role: 'Error Tracking & Performance Monitoring',
        detailedDescription:
          'Sentry is an application monitoring platform focused on error tracking, performance monitoring, release health, session replay, and developer-focused debugging workflows. It helps teams detect exceptions, understand stack traces, connect failures to releases, and prioritize issues that affect users. Helix AI can use Sentry for frontend and backend error tracking, production exception monitoring, release regression detection, user-impact analysis, and faster debugging across web, API, worker, and integration services.',
      },
      {
        text: 'Datadog',
        href: 'https://www.datadoghq.com/',
        role: 'Managed Observability & APM',
        detailedDescription:
          'Datadog is a managed observability and security platform for metrics, logs, traces, application performance monitoring, infrastructure monitoring, synthetic checks, real user monitoring, cloud integrations, and alerting. It is useful for teams that want a broad SaaS observability platform with many integrations and production-ready monitoring workflows. Helix AI can use Datadog where managed APM, infrastructure monitoring, cloud-service visibility, synthetic testing, and enterprise-friendly observability integrations are preferred.',
      },
      {
        text: 'GoAlert',
        href: 'https://goalert.me/',
        role: 'On-Call Management',
        detailedDescription:
          'GoAlert is an open-source on-call scheduling and alert-escalation platform. It supports services, rotations, escalation policies, schedules, and notifications for incident-response workflows. Helix AI can use GoAlert for self-hosted on-call management, escalation routing, operations teams, and incident-response coordination where a lightweight open-source option is preferred.',
      },
      {
        text: 'Jaeger',
        href: 'https://www.jaegertracing.io/',
        role: 'Distributed Tracing',
        detailedDescription:
          'Jaeger is an open-source distributed tracing platform for monitoring and troubleshooting transactions in complex distributed systems. It helps teams understand request flow, latency, dependencies, and service interactions across microservices. Helix AI can use Jaeger in environments where Jaeger-native tracing workflows are preferred or where legacy tracing stacks need to interoperate with OpenTelemetry.',
      },
      {
        text: 'Alertmanager',
        href: 'https://prometheus.io/docs/alerting/latest/alertmanager/',
        role: 'Alert Routing',
        detailedDescription:
          'Alertmanager handles alerts sent by Prometheus-compatible systems and manages grouping, deduplication, silencing, inhibition, and routing to receivers. It is a central component for turning alert rules into actionable notifications. Helix AI can use Alertmanager for infrastructure and application alert routing, maintenance silences, escalation handoffs, notification policies, and incident workflows.',
      },
      {
        text: 'OpenTelemetry',
        href: 'https://opentelemetry.io/',
        role: 'Unified Observability Standard',
        detailedDescription:
          'OpenTelemetry is an open-source observability framework and standard for generating, collecting, processing, and exporting telemetry data such as traces, metrics, and logs. It provides APIs, SDKs, semantic conventions, and collectors for vendor-neutral instrumentation. Helix AI can use OpenTelemetry as the standard instrumentation layer across services, plugins, integrations, automations, API routes, workers, and inference workflows.',
      },
    ],
    image: '/images/technology/observability.png',
    link: '/technology/observability',
    buttonText: 'Explore suite',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `observabilityCards` for new imports.
 */
export const ObservabilityCards = observabilityCards;