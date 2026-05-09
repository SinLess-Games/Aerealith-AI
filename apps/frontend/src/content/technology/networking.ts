// libs/shared/site-content/src/lib/technology/networking.ts

import type { CardProps } from '../types/card';

/**
 * ### NetworkingCards
 *
 * Comprehensive catalog of networking technologies used by Helix AI.
 * Each card entry is fully annotated so IDE IntelliSense can surface
 * rich hover-tooltips when the constants are imported.
 *
 * @example
 * ```ts
 * import { NetworkingCards } from '@/lib/constants/frontend/technology/networking'
 * ```
 */
export const NetworkingCards = [
  {
    /**
     * @property title Card heading shown in the UI.
     * @property description One-sentence category overview.
     * @property listItems Array of technology entries (see nested docs).
     * @property image CDN path to illustrative PNG icon.
     * @property link Internal route for deep-dive page.
     * @property buttonText Label for call-to-action button.
     */
    title: 'Networking & CDN',
    description:
      'Edge delivery, service meshes, load-balancers, and cloud-native networking stacks that connect Helix AI services to users worldwide.',
    listItems: [
      {
        /**
         * @property text Display name of the technology.
         * @property href Canonical documentation or homepage URL.
         * @property role Concise functional label for quick scanning.
         * @property detailedDescription Release-quality blurb (≤ 3 sentences).
         */
        text: 'Cloudflare',
        href: 'https://www.cloudflare.com/',
        role: 'Global Anycast CDN',
        detailedDescription:
          "Cloudflare's Anycast network spans 310+ PoPs (context: 2025) delivering static assets, WAF, DDoS mitigation, and Zero-Trust tunneling while providing analytics and rate limiting at the edge.",
      },
      {
        text: 'Cloudflare Workers',
        href: 'https://workers.cloudflare.com/',
        role: 'Edge Serverless Runtime',
        detailedDescription:
          "Workers run V8 isolates with sub-5 ms cold starts across Cloudflare's global edge. Smart Placement pushes compute closer to origin-latency zones, and AI Gateway enables streamed inference with on-PoP caching.",
      },
      {
        text: 'Fastly',
        href: 'https://www.fastly.com/',
        role: 'Programmable CDN',
        detailedDescription:
          'Fastly Compute@Edge executes WebAssembly modules with <50 ms cold starts, supports KV & object storage, and offers real-time logging, shielding, and advanced TLS automation.',
      },
      {
        text: 'NGINX Ingress Controller 3.1',
        href: 'https://docs.nginx.com/nginx-ingress-controller/',
        role: 'Kubernetes Ingress & Gateway',
        detailedDescription:
          'Adds Gateway API (Gamma), dynamic mTLS rotation, and enhanced Prometheus metrics—acting as a high-performance L7 load balancer for Kubernetes clusters.',
      },
      {
        text: 'Envoy Proxy 1.33',
        href: 'https://www.envoyproxy.io/',
        role: 'L7 Proxy / Sidecar',
        detailedDescription:
          'Stabilized WASM filters, HTTP/3 HCM, and adaptive concurrency controls—serving as the core data plane for meshes like Istio and Consul.',
      },
      {
        text: 'Istio 1.23',
        href: 'https://istio.io/',
        role: 'Service Mesh',
        detailedDescription:
          'Finalizes ambient (sidecar-less) dataplane, halves resource footprint, and integrates Kubernetes Gateway API for unified ingress and east-west traffic with mTLS.',
      },
      {
        text: 'Cilium 1.16',
        href: 'https://cilium.io/',
        role: 'eBPF CNI & Mesh',
        detailedDescription:
          'kube-proxy replacement via eBPF, L7 Kafka policies, and graduated Mesh mode with Hubble observability—delivering high-performance networking and security.',
      },
      {
        text: 'Consul Service Mesh 1.18',
        href: 'https://www.consul.io/',
        role: 'Service Mesh & Discovery',
        detailedDescription:
          'Enhances Mesh Gateway federation, embeds WASM-based traffic filters, and supports xDS sync—enabling zero-trust service connectivity across multi-cluster/multi-cloud.',
      },
      {
        text: 'cloudflared 2025.4.0',
        href: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/',
        role: 'Secure Tunnel Connector',
        detailedDescription:
          'Adds QUIC multiplex transport, automatic token refresh, and Kubernetes sidecar mode—creating outbound Zero-Trust tunnels that expose services without public ingress IPs.',
      },
    ],
    image: '/images/technology/networking.png',
    link: '/technology/networking',
    buttonText: 'Explore networking',
  },
] as const satisfies CardProps[];
