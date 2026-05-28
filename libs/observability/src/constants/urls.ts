
/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/hosted-metrics/3254156#sending-metrics
 */
export const PrometheusCloud = {
    name: 'grafanacloud-aerealith-prom',
    rulesURL: 'https://prometheus-prod-67-prod-us-west-0.grafana.net/api/prom',
    writeURL: 'https://prometheus-prod-67-prod-us-west-0.grafana.net/api/prom/push',
    user: '3254156'
}

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/hosted-logs/1622753#sending-logs
 */
export const LokiCloud = {
    name: 'grafanacloud-aerealith-logs',
    url: 'https://logs-prod-021.grafana.net',
    pushURL: 'https://logs-prod-021.grafana.net/loki/api/v1/push',
    user: '1622753'
}

/**
 * @constant
 * @description Environment variable that stores the Grafana Loki API token.
 */
export const LOKI_API_TOKEN_ENV = 'LOKI_API_TOKEN' as const

/**
 * @constant
 * @description Environment variable that stores the Grafana Tempo API token.
 */
export const TEMPO_API_TOKEN_ENV = 'TEMPO_API_TOKEN' as const

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/stacks/1664966/otlp-info
 */
export const OpentelemetryCloud = {
    url: 'https://otlp-gateway-prod-us-west-0.grafana.net/otlp',
    instanceID: '1664966',
}

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/hosted-traces/1617054#sending-traces
 */
export const TempoCloud = {
    name: 'grafanacloud-aerealith-traces',
    url: 'https://tempo-prod-15-prod-us-west-0.grafana.net/tempo',
    otlpURL: 'https://otlp-gateway-prod-us-west-0.grafana.net/otlp',
    user: '1617054'
}

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/hosted-profiles/1664966
 */
export const PyroscopeCloud = {
    url: 'https://profiles-prod-008.grafana.net',
    user: '1664966'
}

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/grafana-assistant/1664966
 */
export const GrafanaAssistantCloud = {
    url: 'https://assistant-prod-us-west-0.grafana.net/assistant',
    user: '1664966'
}

/**
 * @constant
 * @see https://grafana.com/orgs/sinlessgames/ai-observability/1664966
 */
export const AiObservabilityCloud = {
    url: 'https://sigil-prod-us-west-0.grafana.net',
    user: '1664966'
}
