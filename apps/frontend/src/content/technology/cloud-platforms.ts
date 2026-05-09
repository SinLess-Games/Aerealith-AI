// libs/shared/site-content/src/lib/technology/cloud-platforms.ts

import type { CardProps } from '../types/card';

export const CloudPlatformCards = [
  {
    title: 'Cloud Platforms & Edge',
    description:
      'Global infrastructure, serverless runtimes, and managed services that host and scale Helix AI workloads—from hyperscale clouds to edge networks.',
    listItems: [
      {
        text: 'Amazon Web Services (AWS)',
        href: 'https://aws.amazon.com/',
        role: 'Hyperscale Cloud',
        detailedDescription:
          'AWS offers 200+ services across 33 regions (Apr 2025), including EC2 Nitro instances, S3 object storage, and Bedrock foundation-model APIs, powering highly available, compliance-ready deployments.',
      },
      {
        text: 'Google Cloud Platform',
        href: 'https://cloud.google.com/',
        role: 'Hyperscale Cloud',
        detailedDescription:
          'GCP provides global VPC networking, TPUv5p accelerators, Vertex AI with Gemini 1.5 Pro, and Autopilot GKE clusters—backed by carbon-neutral datacentres.',
      },
      {
        text: 'Microsoft Azure',
        href: 'https://azure.microsoft.com/',
        role: 'Enterprise Cloud',
        detailedDescription:
          'Azure delivers AKS fleet management, confidential VMs with AMD SEV-SNP, and OpenAI GPT-4o APIs, integrating natively with GitHub Actions and Defender for Cloud.',
      },
      {
        text: 'Cloudflare Workers',
        href: 'https://workers.cloudflare.com/',
        role: 'Edge Serverless',
        detailedDescription:
          'Workers run V8 isolates in 320+ PoPs, support D1 SQLite, R2 object storage, and AI Gateway with on-PoP inference caching, enabling <50 ms TTFB worldwide.',
      },
      {
        text: 'Vercel',
        href: 'https://vercel.com/',
        role: 'Frontend Cloud',
        detailedDescription:
          'Vercel optimizes Next.js 14 edge-rendering, Server Actions, and image optimizations across a global edge, with AI SDK for hitting OpenAI and Claude endpoints securely.',
      },
      {
        text: 'Linode',
        href: 'https://www.linode.com/',
        role: 'Developer VPS & Kubernetes',
        detailedDescription:
          'Linode (an Akamai company) provides affordable virtual machines, S3-compatible Object Storage, Managed Databases, and Linode Kubernetes Engine (LKE) regions across North America, Europe, and Asia, with predictable flat pricing ideal for staging and edge workloads.',
      },
    ],
    image: '/images/technology/cloud-platforms.png',
    link: '/technology/cloud-platforms',
    buttonText: 'Explore clouds',
  },
] as const satisfies CardProps[];
