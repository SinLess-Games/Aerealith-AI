// libs/content/src/en/technology/observability.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary observability technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/observability.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const ObservabilityImage =
  `${Image_Paths.pages.technology}/observability.png` as const;

/**
 * Observability technology cards.
 *
 * This list intentionally includes only the cloud-hosted observability
 * services currently used through Grafana Cloud:
 *
 * - Grafana Cloud
 * - Grafana Faro
 * - Grafana Cloud k6
 * - Grafana Loki
 * - Grafana Tempo
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const observabilityCards = [
  {
    title: 'Observability',
    description:
      'Cloud-hosted metrics, logs, traces, frontend telemetry, performance testing, dashboards, alerts, and production visibility services provided through Grafana Cloud for monitoring Aerealith AI.',
    listItems: [
      {
        text: 'Grafana Cloud',
        href: 'https://grafana.com/products/cloud/',
        role: 'Managed Observability Platform',
        detailedDescription:
          'Grafana Cloud is Grafana Labs’ managed observability platform for dashboards, alerts, metrics, logs, traces, frontend observability, performance testing, and production telemetry workflows. Aerealith AI can use Grafana Cloud as the central hosted observability layer for monitoring application health, reviewing incidents, tracking service behavior, visualizing telemetry, and reducing the operational burden of self-hosting observability backends.',
      },
      {
        text: 'Grafana Faro',
        href: 'https://grafana.com/oss/faro/',
        role: 'Frontend Observability',
        detailedDescription:
          'Grafana Faro provides frontend observability for collecting browser-side telemetry such as errors, performance signals, web vitals, logs, traces, and user-experience data. Aerealith AI can use Faro to understand frontend behavior, page performance, client-side failures, user-facing latency, browser errors, and the real-world health of the web application experience.',
      },
      {
        text: 'Grafana Cloud k6',
        href: 'https://grafana.com/products/cloud/k6/',
        role: 'Cloud Load Testing',
        detailedDescription:
          'Grafana Cloud k6 provides hosted performance and load testing workflows for validating how applications behave under traffic, stress, and expected user activity. Aerealith AI can use Grafana Cloud k6 to test frontend routes, API behavior, release readiness, performance regressions, scaling assumptions, and user-facing reliability before and after production changes.',
      },
      {
        text: 'Grafana Loki',
        href: 'https://grafana.com/oss/loki/',
        role: 'Log Aggregation',
        detailedDescription:
          'Grafana Loki is Grafana Labs’ log aggregation system designed to collect, query, and explore logs efficiently alongside dashboards and other telemetry signals. Aerealith AI can use Loki through Grafana Cloud for centralized application logs, Worker logs, platform events, error investigation, deployment review, debugging, and incident analysis.',
      },
      {
        text: 'Grafana Tempo',
        href: 'https://grafana.com/oss/tempo/',
        role: 'Distributed Tracing',
        detailedDescription:
          'Grafana Tempo is Grafana Labs’ distributed tracing backend for storing and querying traces from applications and services. Aerealith AI can use Tempo through Grafana Cloud to understand request flows, service latency, dependency behavior, API performance, bottlenecks, and production issues across frontend, backend, edge, and integration workflows.',
      },
    ],
    image: ObservabilityImage,
    link: '/technology/observability',
    buttonText: 'Explore suite',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `observabilityCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const ObservabilityCards = observabilityCards;