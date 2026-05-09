// libs/shared/site-content/src/lib/technology/infrastructure.ts

import type { CardProps } from '../types/card';

export const InfrastructureCards = [
  {
    title: 'Infrastructure',
    description:
      'Provisioning, orchestration, service mesh, and runtime components for resilient cloud-native platforms.',
    listItems: [
      {
        text: 'Helm 3.17',
        href: 'https://helm.sh/',
        role: 'Kubernetes Package Manager',
        detailedDescription:
          'Helm 3.17 (Feb 2025) persists OCI registry logins, debuts `helm chart scavenger` for layer cleanup, and defaults newly-created charts to API v2, simplifying secure chart distribution.',
      },
      {
        text: 'containerd 2.0',
        href: 'https://containerd.io/',
        role: 'Container Runtime',
        detailedDescription:
          'containerd 2.0 (Nov 2024) stabilises v2 snapshotter APIs, bumps Go 1.22, and ships cgroup-v2 rootless overlayfs—unlocking improved isolation and performance for Kubernetes CRI implementations.',
      },
      {
        text: 'System Upgrade Controller 0.13',
        href: 'https://docs.k3s.io/upgrades/automated',
        role: 'Cluster Upgrade Automation',
        detailedDescription:
          'Rancher’s System Upgrade Controller orchestrates rolling upgrades of K3s and RKE2 via *Plan* CRDs. Version 0.13 (Jan 2025) adds HelmChartPlan support and pre-drain hooks for zero-downtime node cycling.',
      },
      {
        text: 'Rook 1.15',
        href: 'https://rook.io/',
        role: 'Cloud-Native Storage',
        detailedDescription:
          'Rook 1.15 (Dec 2024) streamlines Ceph CSI auto-config, enables n-way stretch clusters, and introduces object-bucket replication—providing resilient file, block, and object storage in Kubernetes.',
      },
      {
        text: 'RKE2 1.30',
        href: 'https://docs.rke2.io/',
        role: 'Enterprise Kubernetes Distro',
        detailedDescription:
          'Rancher Kubernetes Engine 2 packages upstream Kubernetes 1.30 with CIS hardening, SELinux by default, and controllable component versions. Binary bundles include containerd, CoreDNS, and Canal CNI for production-ready clusters.',
      },
      {
        text: 'Kustomize 5.4',
        href: 'https://kustomize.io/',
        role: 'K8s Config Management',
        detailedDescription:
          'Kustomize 5.x supports composition of base overlays, introduces `varReference` schema validation, and allows remote OCI bases—enabling GitOps pipelines to generate deterministic, secrets-free manifests.',
      },
      {
        text: 'Istio 1.23',
        href: 'https://istio.io/',
        role: 'Service Mesh',
        detailedDescription:
          'Istio 1.23 (Apr 2025) finalises ambient sidecar-less dataplane, halves memory footprint, and integrates Kubernetes Gateway API for unified traffic management and zero-trust mTLS across clusters.',
      },
      {
        text: 'Cilium 1.16',
        href: 'https://cilium.io/',
        role: 'eBPF Networking & Mesh',
        detailedDescription:
          'Cilium 1.16 (Feb 2025) adds L7 policy for Kafka, accelerates kube-proxy replacement with eBPF, and graduates Mesh mode with Envoy-free Hubble observability—offering high-performance networking and security.',
      },
      {
        text: 'NGINX Ingress Controller 3.1',
        href: 'https://docs.nginx.com/nginx-ingress-controller/',
        role: 'Ingress Controller',
        detailedDescription:
          'NGINX Ingress Controller 3.1 (Mar 2025) supports Gateway API Gamma, includes dynamic mTLS certificate rotation, and ships an improved Prometheus exporter for real-time traffic stats.',
      },
      {
        text: 'ExternalDNS 0.15.1',
        href: 'https://github.com/kubernetes-sigs/external-dns/releases',
        role: 'Dynamic DNS Controller',
        detailedDescription:
          'ExternalDNS 0.15.1 (Jan 2025) syncs Kubernetes Services and Ingress hosts to 20+ DNS providers—including Route 53, Cloudflare, and Google Cloud DNS. Recent helm updates add `labelFilter`, `managedRecordTypes`, and templated service-account annotations, easing multi-tenant record management.',
      },
      {
        text: 'CoreDNS 1.13',
        href: 'https://coredns.io/',
        role: 'Cluster DNS Server',
        detailedDescription:
          'CoreDNS 1.13 (Jun 2025) becomes the default DNS plugin for Kubernetes 1.31, adding OpenTelemetry spans, improved negative-cache TTL handling, and a rewriten *auto* plugin that watches CRDs for dynamic stub zones.',
      },
      {
        text: 'PowerDNS Authoritative 4.9',
        href: 'https://www.powerdns.com/',
        role: 'Authoritative DNS Server',
        detailedDescription:
          'PowerDNS 4.9 (Apr 2025) introduces native DNS-over-HTTPS support, incremental AXFR optimisation, and Lua 5.4 policy scripts—making multi-tenant authoritative zones faster and more secure.',
      },
      {
        text: 'cloudflared 2025.4.0',
        href: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/',
        role: 'Cloudflare Tunnel Agent',
        detailedDescription:
          'cloudflared 2025.4 introduces QUIC multiplex transport, automatic token refresh, and Kubernetes Sidecar mode—creating secure outbound tunnels that expose services without public ingress IPs.',
      },
      {
        text: 'Consul 1.18',
        href: 'https://www.consul.io/',
        role: 'Service Discovery & KV',
        detailedDescription:
          'HashiCorp Consul 1.18 (Jan 2025) enhances Mesh Gateway federation, embeds wasm-based traffic filters, and adds xDS control-plane sync—simplifying multi-cluster service discovery and resilience.',
      },
      {
        text: 'Vault 1.16',
        href: 'https://www.vaultproject.io/',
        role: 'Secrets Management',
        detailedDescription:
          'Vault 1.16 (May 2025) ships Key Management Secrets Engine GA, native OIDC token exchange, and performance-standing splits—delivering unified secrets, encryption, and IAM workflows for cloud-native apps.',
      },
      {
        text: 'GitHub Packages 2025-05',
        href: 'https://docs.github.com/en/packages',
        role: 'Container & OCI Registry',
        detailedDescription:
          'GitHub Packages (May 2025) supports OCI-conformant Helm and WASM artifacts, fine-grained PAT scopes, and registry firewall rules—allowing teams to co-locate images, SBOMs, and Helm charts with their code.',
      },
    ],
    image: '/images/technology/infrastructure.png',
    link: '/technology/infrastructure',
    buttonText: 'Learn more',
  },
] as const satisfies CardProps[];
