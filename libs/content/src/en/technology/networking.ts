// libs/content/src/en/technology/networking.ts

import type { ReadonlyCardArray } from '../../types';

/**
 * Comprehensive catalog of networking technologies used by Helix AI.
 */
export const networkingCards = [
  {
    title: 'Networking & CDN',
    description:
      'Edge delivery, service meshes, load balancers, tunnels, proxies, and cloud-native networking stacks that connect Helix AI services to users and systems securely.',
    listItems: [
      {
        text: 'Cloudflare',
        href: 'https://www.cloudflare.com/',
        role: 'Global Network & CDN',
        detailedDescription:
          'Cloudflare provides a global network for CDN delivery, application security, DDoS protection, DNS, Zero Trust access, traffic control, and edge services. It is useful for protecting and accelerating public applications while centralizing security and routing policies close to users. Helix AI can use Cloudflare for DNS, edge delivery, WAF, DDoS protection, tunnels, rate limiting, cache control, and Zero Trust access patterns.',
      },
      {
        text: 'Cloudflare Workers',
        href: 'https://workers.cloudflare.com/',
        role: 'Edge Serverless Runtime',
        detailedDescription:
          'Cloudflare Workers is a serverless edge runtime for running application code close to users without managing traditional servers. It integrates with Cloudflare platform services such as KV, Durable Objects, D1, R2, Queues, Workers AI, and AI Gateway. Helix AI can use Workers for edge APIs, webhook receivers, automation triggers, lightweight routing, middleware, and globally distributed frontend-adjacent logic.',
      },
      {
        text: 'Fastly',
        href: 'https://www.fastly.com/',
        role: 'Programmable CDN & Edge',
        detailedDescription:
          'Fastly provides edge cloud services for CDN delivery, programmable caching, security, real-time logging, and edge compute workloads. Fastly Compute allows teams to compile code to WebAssembly and run it on Fastly’s global edge network. Helix AI can use Fastly-style edge patterns for low-latency content delivery, programmable request handling, edge personalization, and performance-sensitive web workloads.',
      },
      {
        text: 'Envoy Proxy',
        href: 'https://www.envoyproxy.io/',
        role: 'L7 Proxy & Data Plane',
        detailedDescription:
          'Envoy is a high-performance L7 proxy and communication bus designed for modern service-oriented architectures. It is commonly used as a data plane for service meshes, API gateways, ingress systems, and traffic-management layers. Helix AI can use Envoy through Istio, gateway deployments, or proxy-based architectures for routing, retries, load balancing, observability, mTLS, and service-to-service traffic control.',
      },
      {
        text: 'Istio',
        href: 'https://istio.io/',
        role: 'Service Mesh',
        detailedDescription:
          'Istio is a service mesh that gives applications capabilities such as zero-trust security, observability, and advanced traffic management without requiring those features to be built into every service. It can help control service-to-service traffic, apply mTLS, expose telemetry, and support staged or resilient routing patterns. Helix AI can use Istio for strict internal mTLS, ingress and egress policy, traffic shaping, canary support, telemetry, and service-level security boundaries.',
      },
      {
        text: 'Cilium',
        href: 'https://cilium.io/',
        role: 'eBPF Networking & Security',
        detailedDescription:
          'Cilium is an open-source cloud-native networking, security, and observability platform built on eBPF. It provides Kubernetes networking, service connectivity, network policy, identity-aware security, and visibility into network behavior. Helix AI can use Cilium as a Kubernetes CNI for high-performance networking, network policy enforcement, service visibility, kube-proxy replacement patterns, and zero-trust infrastructure controls.',
      },
      {
        text: 'cloudflared',
        href: 'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/',
        role: 'Secure Tunnel Connector',
        detailedDescription:
          'cloudflared is the Cloudflare Tunnel connector that establishes outbound tunnels between private resources and Cloudflare’s network. It lets services be exposed through Cloudflare without directly opening inbound firewall access to the origin. Helix AI can use cloudflared for secure homelab access, private service exposure, preview environments, webhook endpoints, Zero Trust routing, and services that should remain behind outbound-only connectivity.',
      },
    ],
    image: '/images/technology/networking.png',
    link: '/technology/networking',
    buttonText: 'Explore networking',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `networkingCards` for new imports.
 */
export const NetworkingCards = networkingCards;