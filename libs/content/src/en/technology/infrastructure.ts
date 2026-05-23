// libs/content/src/en/technology/infrastructure.ts

import type { ReadonlyCardArray } from '../../types';

export const infrastructureCards = [
  {
    title: 'Infrastructure',
    description:
      'Kubernetes, GitOps, runtime, networking, service mesh, autoscaling, storage, GPU, DNS, tunnels, secrets, security, backup, incident-response, mail, and platform operations components for resilient cloud-native systems.',
    listItems: [
      {
        text: 'RKE2',
        href: 'https://docs.rke2.io/',
        role: 'Enterprise Kubernetes Distribution',
        detailedDescription:
          'RKE2 is Rancher’s enterprise-ready Kubernetes distribution focused on security, compliance, and operational simplicity. It is a conformant Kubernetes distribution with a hardened operating model and a single-binary style installation approach for nodes participating in the cluster. Helix AI can use RKE2 for secure self-hosted, homelab, enterprise, and air-gapped Kubernetes deployments.',
      },
      {
        text: 'containerd',
        href: 'https://containerd.io/',
        role: 'Container Runtime',
        detailedDescription:
          'containerd is an industry-standard container runtime that manages the full container lifecycle, including image transfer, storage, execution, supervision, low-level storage, and network attachments. It is widely used under Kubernetes distributions and container platforms as a core runtime layer. Helix AI can rely on containerd through Kubernetes distributions such as RKE2 for predictable container execution, image management, and production workload isolation.',
      },
      {
        text: 'System Upgrade Controller',
        href: 'https://docs.k3s.io/upgrades/automated',
        role: 'Cluster Upgrade Automation',
        detailedDescription:
          'System Upgrade Controller is Rancher’s Kubernetes-native controller for orchestrating automated node and cluster upgrades through declarative plans. It is commonly used with K3s and RKE2 environments to coordinate controlled upgrades, node cycling, and operational maintenance. Helix AI can use this pattern for GitOps-managed cluster lifecycle automation, safer maintenance windows, and repeatable infrastructure upgrades.',
      },
      {
        text: 'Argo CD',
        href: 'https://argo-cd.readthedocs.io/en/stable/',
        role: 'GitOps Controller',
        detailedDescription:
          'Argo CD is a declarative GitOps continuous-delivery tool for Kubernetes that continuously compares live cluster state against desired state stored in Git. It helps teams sync applications, detect drift, roll back changes, visualize deployments, and operate platform components through an auditable Git-based workflow. Helix AI can use Argo CD for production platform delivery, app-of-apps management, environment promotion, drift correction, deployment visibility, and controlled Kubernetes releases.',
      },
      {
        text: 'Actions Runner Controller',
        href: 'https://github.com/actions/actions-runner-controller',
        role: 'GitHub Runner Operator',
        detailedDescription:
          'Actions Runner Controller is a Kubernetes operator for running GitHub Actions self-hosted runners inside Kubernetes. It helps teams scale runner workloads, isolate CI jobs, manage runner lifecycles, and connect repository automation to cluster-backed compute. Helix AI can use Actions Runner Controller for self-hosted CI/CD capacity, GitHub Actions jobs, container builds, security scans, documentation publishing, release automation, and controlled internal runner infrastructure.',
      },
      {
        text: 'Flagger',
        href: 'https://flagger.app/',
        role: 'Progressive Delivery',
        detailedDescription:
          'Flagger is a progressive-delivery tool for Kubernetes that automates canary releases, A/B testing, and blue-green deployment strategies with service meshes and ingress controllers. It can evaluate rollout health using metrics and webhooks before promoting or rolling back changes. Helix AI can use Flagger-style workflows for safer releases, controlled feature rollouts, automated rollback behavior, and production deployment confidence.',
      },
      {
        text: 'Istio',
        href: 'https://istio.io/',
        role: 'Service Mesh',
        detailedDescription:
          'Istio is a service mesh for cloud-native workloads that provides traffic management, zero-trust security, and service-to-service controls with or without sidecars. It helps teams secure, connect, and manage distributed applications without requiring every application to implement those capabilities directly. Helix AI can use Istio for mTLS, ingress and egress control, traffic shaping, progressive delivery support, authorization policy, and service-level security boundaries.',
      },
      {
        text: 'Cilium',
        href: 'https://cilium.io/',
        role: 'eBPF Networking & Security',
        detailedDescription:
          'Cilium is an open-source cloud-native networking and security platform built on eBPF for Kubernetes and distributed environments. It provides CNI networking, network policy, service connectivity, visibility, and security controls for cloud-native workloads. Helix AI can use Cilium for Kubernetes networking, kube-proxy replacement patterns, network policy enforcement, high-performance service connectivity, and stronger platform-level traffic control.',
      },
      {
        text: 'Karmada',
        href: 'https://karmada.io/',
        role: 'Multi-Cluster Orchestration',
        detailedDescription:
          'Karmada is a Kubernetes orchestration system for managing applications across multiple clusters and cloud environments. It helps teams distribute workloads, manage multi-cluster policies, coordinate deployments, and improve resilience across regions or infrastructure boundaries. Helix AI can use Karmada for future multi-cluster deployments, regional expansion, hybrid infrastructure, failover planning, and enterprise environments that need workload portability across clusters.',
      },
      {
        text: 'KEDA',
        href: 'https://keda.sh/',
        role: 'Event-Driven Autoscaling',
        detailedDescription:
          'KEDA is a Kubernetes-based event-driven autoscaler that scales workloads based on external event sources and metrics. It supports scaling from zero and reacts to queues, streams, databases, metrics systems, and other triggers. Helix AI can use KEDA for automation workers, queue consumers, AI background jobs, webhook processors, integration tasks, and cost-aware workload scaling based on real demand.',
      },
      {
        text: 'Longhorn',
        href: 'https://longhorn.io/',
        role: 'Kubernetes Block Storage',
        detailedDescription:
          'Longhorn is a cloud-native distributed block storage system for Kubernetes. It provides persistent volumes, replication, snapshots, backups, disaster recovery features, and a Kubernetes-native management experience. Helix AI can use Longhorn for self-hosted persistent storage, stateful platform components, development clusters, staging environments, and internal services that need resilient Kubernetes storage.',
      },
      {
        text: 'Garage',
        href: 'https://garagehq.deuxfleurs.fr/',
        role: 'Self-Hosted Object Storage',
        detailedDescription:
          'Garage is a lightweight, self-hostable, S3-compatible object storage system designed for distributed deployments. It is useful for private object storage, backups, artifacts, logs, internal assets, and environments where teams want control over storage without relying only on public cloud providers. Helix AI can use Garage for self-hosted object storage, internal S3-compatible buckets, backup targets, platform artifacts, and air-gapped or homelab-friendly deployment patterns.',
      },
      {
        text: 'NVIDIA GPU Operator',
        href: 'https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html',
        role: 'GPU Enablement',
        detailedDescription:
          'NVIDIA GPU Operator automates the management of NVIDIA GPU software components in Kubernetes, including drivers, device plugins, container runtime configuration, monitoring, and related GPU dependencies. It is useful for AI workloads, model inference, local GPU-backed services, media processing, and high-performance compute inside Kubernetes. Helix AI can use NVIDIA GPU Operator for self-hosted AI inference, local model experiments, GPU-enabled workers, and infrastructure where accelerated workloads are required.',
      },
      {
        text: 'cloudflared Tunnel',
        href: 'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/',
        role: 'Cloudflare Tunnel Agent',
        detailedDescription:
          'cloudflared is the Cloudflare Tunnel connector that establishes outbound connections between private resources and Cloudflare’s network. It allows services to be exposed through Cloudflare without directly opening inbound firewall access to the origin. Helix AI can use cloudflared for secure tunnels, private service exposure, homelab access, preview environments, webhook endpoints, Zero Trust routing, and controlled access to internal services.',
      },
      {
        text: 'Cloudflare DNS',
        href: 'https://www.cloudflare.com/application-services/products/dns/',
        role: 'Managed DNS',
        detailedDescription:
          'Cloudflare DNS provides managed authoritative DNS with global resolution, security features, API-driven record management, and integration with the broader Cloudflare platform. It is useful for public domains, application routing, tunnel endpoints, CDN-backed services, and automated DNS workflows. Helix AI can use Cloudflare DNS for production domains, preview environments, public service records, tunnel-backed hostnames, and GitOps-friendly DNS automation.',
      },
      {
        text: 'ExternalDNS',
        href: 'https://github.com/kubernetes-sigs/external-dns',
        role: 'Dynamic DNS Controller',
        detailedDescription:
          'ExternalDNS synchronizes selected Kubernetes resources such as Services and Ingresses with DNS providers so DNS records can follow cluster state. It supports provider-agnostic dynamic DNS management through Kubernetes configuration and annotations. Helix AI can use ExternalDNS to automate Cloudflare, Route 53, or other provider DNS records for gateways, services, preview environments, and GitOps-managed application exposure.',
      },
      {
        text: 'CoreDNS',
        href: 'https://coredns.io/',
        role: 'Cluster DNS Server',
        detailedDescription:
          'CoreDNS is a flexible, extensible DNS server written in Go and commonly used as the DNS service inside Kubernetes clusters. It uses a plugin-based model that makes it adaptable across many DNS and service-discovery environments. Helix AI can use CoreDNS as part of Kubernetes cluster networking for internal service discovery, name resolution, forwarding, and DNS customization.',
      },
      {
        text: 'DFIR-IRIS',
        href: 'https://dfir-iris.org/',
        role: 'Incident Response Platform',
        detailedDescription:
          'DFIR-IRIS is an open-source incident response platform for managing investigations, cases, evidence, assets, tasks, and incident workflows. It is useful for security teams that need structured response processes and case management around alerts and events. Helix AI can use DFIR-IRIS for incident tracking, security case management, forensic workflow documentation, response coordination, and audit-ready investigation history.',
      },
      {
        text: 'Velero',
        href: 'https://velero.io/',
        role: 'Kubernetes Backup & Restore',
        detailedDescription:
          'Velero is a backup, restore, migration, and disaster recovery tool for Kubernetes resources and persistent volumes. It helps teams protect cluster state, recover from incidents, migrate workloads, and create scheduled backups. Helix AI can use Velero for Kubernetes backup strategy, disaster recovery planning, environment migration, workload recovery, and resilience testing.',
      },
      {
        text: 'Mailu',
        href: 'https://mailu.io/',
        role: 'Self-Hosted Mail Server',
        detailedDescription:
          'Mailu is a self-hosted mail server stack that provides email services with components for SMTP, IMAP, webmail, administration, antispam, and antivirus integration. It is useful for organizations that want control over mail infrastructure instead of relying only on hosted email providers. Helix AI can use Mailu for self-hosted email scenarios, internal platform mail, lab environments, notification testing, and future deployment models where controlled mail infrastructure is required.',
      },
      {
        text: 'GitHub Packages',
        href: 'https://docs.github.com/en/packages',
        role: 'Package & Container Registry',
        detailedDescription:
          'GitHub Packages is a software package hosting service for publishing packages privately or publicly and using them as dependencies in projects. It supports registry workflows close to GitHub repositories, Actions workflows, and organization permissions. Helix AI can use GitHub Packages for internal packages, container images, shared libraries, SDK artifacts, deployment artifacts, and release assets connected to repository automation.',
      },
    ],
    image: '/images/technology/infrastructure.png',
    link: '/technology/infrastructure',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `infrastructureCards` for new imports.
 */
export const InfrastructureCards = infrastructureCards;