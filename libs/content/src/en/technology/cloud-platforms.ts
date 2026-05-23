// libs/content/src/en/technology/cloud-platforms.ts

import type { ReadonlyCardArray } from '../../types';

export const cloudPlatformCards = [
  {
    title: 'Cloud Platforms & Edge',
    description:
      'Global cloud providers, edge networks, serverless runtimes, managed infrastructure, and deployment platforms for hosting, scaling, securing, and operating Helix AI workloads.',
    listItems: [
      {
        text: 'Amazon Web Services (AWS)',
        href: 'https://aws.amazon.com/',
        role: 'Hyperscale Cloud',
        detailedDescription:
          'Amazon Web Services is a broad hyperscale cloud platform for compute, storage, networking, databases, security, analytics, machine learning, containers, serverless applications, and generative AI workloads. Services such as EC2, S3, EKS, Lambda, CloudFront, IAM, RDS, DynamoDB, and Amazon Bedrock make AWS useful for highly available SaaS deployments, enterprise integrations, object storage, managed Kubernetes, AI-backed features, and compliance-oriented infrastructure. Helix AI can use AWS for scalable cloud hosting, storage, backup, managed compute, enterprise deployment patterns, and production-grade infrastructure when customer or workload requirements align with AWS.',
      },
      {
        text: 'Google Cloud Platform (GCP)',
        href: 'https://cloud.google.com/',
        role: 'Hyperscale Cloud',
        detailedDescription:
          'Google Cloud Platform provides infrastructure and managed services for compute, containers, networking, data platforms, analytics, AI, security, and application delivery. Services such as Compute Engine, Cloud Run, Google Kubernetes Engine, Cloud Storage, BigQuery, Pub/Sub, Cloud SQL, and Vertex AI are useful for cloud-native applications, managed AI workflows, analytics-heavy platforms, and data-intensive products. Helix AI can use GCP for managed container hosting, AI experimentation, analytics pipelines, cloud integrations, and enterprise deployments that already depend on Google Cloud services.',
      },
      {
        text: 'Microsoft Azure',
        href: 'https://azure.microsoft.com/',
        role: 'Enterprise Cloud',
        detailedDescription:
          'Microsoft Azure is an enterprise-focused cloud platform for compute, storage, identity, networking, databases, Kubernetes, developer tooling, security, observability, and AI services. Azure Kubernetes Service, Azure Container Apps, Microsoft Entra ID, Defender for Cloud, Azure Functions, Azure Storage, Azure SQL, and Azure AI services make it a strong fit for organizations already invested in Microsoft ecosystems. Helix AI can use Azure for enterprise identity integration, secure workloads, managed Kubernetes, business-ready AI deployments, and customer environments that require Microsoft-aligned infrastructure.',
      },
      {
        text: 'Cloudflare',
        href: 'https://www.cloudflare.com/developer-platform/',
        role: 'Edge & Developer Platform',
        detailedDescription:
          'Cloudflare provides a global edge network and developer platform for application delivery, security, serverless compute, storage, queues, databases, caching, DNS, Zero Trust access, bot protection, and AI-adjacent workflows. Services such as Workers, Pages, R2, KV, Durable Objects, D1, Queues, Turnstile, Zero Trust, Workers AI, and AI Gateway make Cloudflare especially useful for low-latency applications and edge-first architectures. Helix AI can use Cloudflare as a core platform for edge APIs, webhook handling, automation triggers, object storage, lightweight data, background jobs, frontend delivery, access control, and globally distributed user experiences.',
      },
      {
        text: 'Linode / Akamai Cloud',
        href: 'https://www.linode.com/',
        role: 'Developer Cloud',
        detailedDescription:
          'Linode, now part of Akamai Cloud Computing, provides developer-friendly cloud infrastructure for virtual machines, Kubernetes, object storage, networking, databases, and predictable hosting workflows. It is useful for cost-conscious environments, staging workloads, regional services, VPS-style deployments, and simpler infrastructure paths that do not require the full complexity of a hyperscale cloud. Helix AI can use Linode or Akamai Cloud for lightweight services, staging systems, practical regional workloads, developer environments, and cost-controlled deployment alternatives.',
      },
      {
        text: 'Alibaba Cloud',
        href: 'https://www.alibabacloud.com/',
        role: 'Global Cloud Platform',
        detailedDescription:
          'Alibaba Cloud is a major global cloud provider offering compute, storage, networking, databases, security, analytics, AI, Kubernetes, and enterprise infrastructure services. It is especially relevant for organizations operating in or near Asian markets, cross-region deployments, and international infrastructure strategies. Helix AI can consider Alibaba Cloud for global expansion scenarios, customer-specific hosting needs, enterprise deployments, regional infrastructure coverage, and workloads that require access to Alibaba Cloud’s ecosystem.',
      },
      {
        text: 'Oracle Cloud Infrastructure (OCI)',
        href: 'https://www.oracle.com/cloud/',
        role: 'Enterprise & Database Cloud',
        detailedDescription:
          'Oracle Cloud Infrastructure is an enterprise cloud platform focused on compute, networking, storage, databases, Kubernetes, security, analytics, and high-performance workloads. It is known for strong database offerings, enterprise workloads, bare metal options, and cloud infrastructure designed for performance-sensitive systems. Helix AI can use OCI for enterprise customers with Oracle-heavy environments, database-oriented workloads, private networking requirements, high-performance infrastructure needs, and business deployments that align with Oracle’s ecosystem.',
      },
      {
        text: 'DigitalOcean',
        href: 'https://www.digitalocean.com/',
        role: 'Developer-Friendly Cloud',
        detailedDescription:
          'DigitalOcean provides cloud infrastructure designed for developers, startups, and small teams that need simple virtual machines, managed databases, Kubernetes, object storage, networking, and application hosting. Its platform is useful for straightforward deployments, predictable pricing, fast prototyping, small production services, and developer-friendly operations. Helix AI can use DigitalOcean for MVP environments, small services, staging deployments, prototype workloads, and cost-conscious infrastructure that benefits from simpler cloud management.',
      },
    ],
    image: '/images/technology/cloud-platforms.png',
    link: '/technology/cloud-platforms',
    buttonText: 'Explore clouds',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `cloudPlatformCards` for new imports.
 */
export const CloudPlatformCards = cloudPlatformCards;