// libs/content/src/en/technology/metrics-exporters.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary metrics exporters technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/metrics-exporters.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const MetricsExportersImage =
  `${Image_Paths.pages.technology}/metrics-exporters.png` as const;

/**
 * Grafana Cloud-provided telemetry collectors and exporter integrations.
 *
 * This list intentionally avoids standalone exporter entries because
 * Aerealith AI is only using exporter/collector paths offered through
 * Grafana Cloud.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const metricsExportersCards = [
  {
    title: 'Metrics Exporters',
    description:
      'Grafana Cloud-provided telemetry collection, exporter integrations, and managed observability pipelines used to collect, process, and send metrics for Aerealith AI.',
    listItems: [
      {
        text: 'Grafana Cloud Integrations',
        href: 'https://grafana.com/products/cloud/',
        role: 'Managed Observability Integrations',
        detailedDescription:
          'Grafana Cloud integrations provide guided setup paths for collecting telemetry from applications, infrastructure, services, and supported environments. Aerealith AI can use Grafana Cloud integrations instead of maintaining a broad list of standalone exporters directly, keeping metrics collection aligned with Grafana-supported setup flows, dashboards, alerts, and managed observability workflows.',
      },
      {
        text: 'Grafana Alloy',
        href: 'https://grafana.com/docs/alloy/latest/',
        role: 'Telemetry Collector',
        detailedDescription:
          'Grafana Alloy is Grafana Labs’ supported telemetry collector for collecting, processing, and exporting observability data. It can be used with Grafana Cloud to collect metrics and other telemetry signals through Grafana-supported pipelines. Aerealith AI can use Alloy as the primary collector layer for Grafana Cloud-connected metrics collection instead of managing many separate exporter tools individually.',
      },
    ],
    image: MetricsExportersImage,
    link: '/technology/metrics-exporters',
    buttonText: 'Explore exporters',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `metricsExportersCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const MetricsExportersCards = metricsExportersCards;