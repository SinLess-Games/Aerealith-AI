// libs/shared/site-content/src/lib/technology/development.ts

import type { CardProps } from '../types/card';

export const DevelopmentCards = [
  {
    title: 'Development & DevSecOps',
    description:
      'Modern CI/CD, GitOps, Infrastructure-as-Code, and AI-assisted workflows that accelerate software delivery.',
    listItems: [
      {
        text: 'GitHub Actions',
        href: 'https://github.com/features/actions',
        role: 'CI/CD Automation',
        detailedDescription:
          'Native CI/CD for GitHub repositories. The May 2025 update introduced `actions_inbound` wildcard domains for simpler self-hosted-runner firewalls and strengthened OIDC job tokens to curb supply-chain attacks.',
      },
      {
        text: 'FluxCD',
        href: 'https://fluxcd.io/',
        role: 'GitOps Controller',
        detailedDescription:
          'Graduated CNCF project that reconciles Kubernetes state from Git. Flux v2.2 (Mar 2025) adds OCI Helm provenance checks, OCI-based variables, and K8s 1.28 support—enabling multi-environment promotion with cryptographic integrity.',
      },
      {
        text: 'Flagger',
        href: 'https://flagger.app/',
        role: 'Progressive Delivery',
        detailedDescription:
          'Flagger automates canary, A/B, and blue-green deployments for Kubernetes via Istio, Linkerd, Cilium, or Gateway API. Version 1.32 (Apr 2025) debuts eBPF traffic mirroring, dynamic alert templates, and WASM policy gates for safe feature rollouts.',
      },
      {
        text: 'GitHub',
        href: 'https://github.com/',
        role: 'Code Hosting & Collaboration',
        detailedDescription:
          'Home to 100M+ developers with Issues, Discussions, Dependabot, and Codespaces cloud IDEs. Recent additions include AI-powered code search and reusable project templates prewired with Actions workflows.',
      },
      {
        text: 'GitLab',
        href: 'https://gitlab.com/',
        role: 'DevSecOps Platform',
        detailedDescription:
          'All-in-one DevSecOps suite spanning SCM, CI, package registry, and observability. GitLab 18.1 (Jun 2025) introduces Duo Code Review, Maven virtual registry (beta), and SLSA Level-1 provenance baked into pipelines.',
      },
      {
        text: 'GitLab Runners',
        href: 'https://docs.gitlab.com/runner/',
        role: 'CI Execution Agents',
        detailedDescription:
          'GitLab Runner executes jobs defined in `.gitlab-ci.yml`. Version 17.0 (May 2025) rolls out `machine-executor` powered by Firecracker micro-VMs, ARM 64 Docker-in-Docker support, and rotating registration tokens for enhanced isolation and security.',
      },
      {
        text: 'Terraform',
        href: 'https://www.terraform.io/',
        role: 'Infrastructure as Code',
        detailedDescription:
          'Declarative IaC tooling. Terraform 1.12 (Apr 2025) adds OCI Object Storage backend, short-circuit logical operators, and parallel unit tests via `terraform test -parallelism`, accelerating module validation.',
      },
      {
        text: 'Ansible',
        href: 'https://www.ansible.com/',
        role: 'Configuration Management',
        detailedDescription:
          'Agentless automation with YAML playbooks over SSH/WinRM. Community Ansible 11 LTS (Apr 2025) extends support to 18 months, while ansible-core 2.19 brings data-tagging and typed variables for cleaner inventories.',
      },
      {
        text: 'Docker',
        href: 'https://www.docker.com/',
        role: 'Container Toolchain',
        detailedDescription:
          'Docker Engine 25.0 (Feb 2025) bundles BuildKit 0.12, rootless overlayfs on cgroup-v2 hosts, and CVE-patched runc; Docker Desktop adds synchronized bind mounts and OpenTelemetry tracing hooks for supply-chain insights.',
      },
      {
        text: 'Helm',
        href: 'https://helm.sh/',
        role: 'Kubernetes Package Manager',
        detailedDescription:
          'Helm 3.17 (Feb 2025) brings persistent OCI registry logins, a `helm chart scavenger` for cleaning dangling layers, and default API v2 charts, streamlining app lifecycle operations.',
      },
      {
        text: 'Kubernetes',
        href: 'https://kubernetes.io/',
        role: 'Container Orchestrator',
        detailedDescription:
          'The de-facto container orchestration platform. Kubernetes 1.31 (May 2025) promotes Gateway API to GA, beta-releases sidecar lifecycle, enhances swap support, and introduces Static Pods v2, boosting edge resilience and simplifying multicluster networking.',
      },
      {
        text: 'GitHub Copilot',
        href: 'https://github.com/features/copilot',
        role: 'AI Pair Programmer',
        detailedDescription:
          'Powered by GPT-4o (May 2025), Copilot offers contextual inline completions across 16 languages plus a code-repair agent that opens pull requests with unit-tested fixes. Real-time vulnerability filtering catches OWASP Top-10 issues before merge.',
      },
    ],
    image: '/images/technology/development.png',
    link: '/technology/development',
    buttonText: 'Learn more',
  },
] as const satisfies CardProps[];
