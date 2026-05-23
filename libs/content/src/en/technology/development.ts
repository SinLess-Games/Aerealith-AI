// libs/content/src/en/technology/development.ts

import type { ReadonlyCardArray } from '../../types';

export const developmentCards = [
  {
    title: 'Development & DevSecOps',
    description:
      'Version control, CI/CD, GitOps, infrastructure automation, container tooling, Kubernetes workflows, local cluster testing, runner infrastructure, and AI-assisted development tools that help teams ship reliable software faster.',
    listItems: [
      {
        text: 'GitHub Actions',
        href: 'https://github.com/features/actions',
        role: 'CI/CD Automation',
        detailedDescription:
          'GitHub Actions is GitHub’s workflow automation and CI/CD platform for building, testing, scanning, packaging, and deploying software directly from a repository. It supports event-driven workflows, reusable actions, hosted and self-hosted runners, secrets, environments, approvals, and OpenID Connect patterns for cloud deployments. Helix AI can use GitHub Actions for repository automation, test pipelines, release workflows, documentation publishing, security checks, and GitOps handoffs.',
      },
      {
        text: 'GitHub Runners',
        href: 'https://docs.github.com/en/actions/concepts/runners/about-runners',
        role: 'CI Execution Infrastructure',
        detailedDescription:
          'GitHub Runners are the execution environments that run GitHub Actions workflow jobs. They can be GitHub-hosted for convenience or self-hosted when a project needs custom hardware, private networking, GPU access, larger workloads, special dependencies, or tighter control over the build environment. Helix AI can use GitHub Runners for CI execution, release automation, security scans, container builds, documentation publishing, Kubernetes deployment workflows, and self-hosted build capacity inside controlled infrastructure.',
      },
      {
        text: 'Argo CD',
        href: 'https://argo-cd.readthedocs.io/en/stable/',
        role: 'GitOps Controller',
        detailedDescription:
          'Argo CD is a declarative GitOps continuous-delivery tool for Kubernetes. It continuously compares live cluster state against the desired state stored in Git and helps teams sync, roll back, visualize drift, and manage application deployments through an auditable Git-based workflow. Helix AI can use Argo CD for GitOps-managed platform deployments, environment promotion, Kubernetes application delivery, drift correction, deployment visibility, and production release confidence.',
      },
      {
        text: 'Flagger',
        href: 'https://flagger.app/',
        role: 'Progressive Delivery',
        detailedDescription:
          'Flagger is a progressive-delivery tool for Kubernetes that automates canary releases, A/B testing, and blue-green deployment strategies with service meshes and ingress controllers. It can evaluate rollout health using metrics and webhooks before promoting or rolling back changes. Helix AI can use Flagger-style workflows for safer releases, controlled feature rollouts, automated rollback behavior, and production deployment confidence.',
      },
      {
        text: 'GitHub',
        href: 'https://github.com/',
        role: 'Code Hosting & Collaboration',
        detailedDescription:
          'GitHub is a development platform for hosting Git repositories, managing issues, reviewing pull requests, collaborating on projects, running automation, publishing packages, and coordinating open-source or private engineering work. Its collaboration model supports code review, discussions, project planning, security features, and integrated automation. Helix AI can use GitHub as a core source of truth for code, issues, documentation, release planning, agentic workflows, and repository-level automation.',
      },
      {
        text: 'Terraform',
        href: 'https://developer.hashicorp.com/terraform',
        role: 'Infrastructure as Code',
        detailedDescription:
          'Terraform is an infrastructure-as-code tool for defining, provisioning, changing, and versioning cloud, on-prem, and SaaS resources through declarative configuration. It supports providers, modules, state management, planning, review workflows, and repeatable infrastructure changes. Helix AI can use Terraform for GitOps-tracked infrastructure, tenant environments, cloud resources, DNS, object storage, networks, Kubernetes dependencies, and auditable platform provisioning.',
      },
      {
        text: 'Ansible',
        href: 'https://www.ansible.com/',
        role: 'Configuration Management',
        detailedDescription:
          'Ansible is an automation tool for provisioning, configuration management, application deployment, orchestration, and repeatable IT operations. It uses human-readable playbooks and can automate across Linux, Windows, network devices, cloud services, containers, and infrastructure platforms. Helix AI can use Ansible for homelab automation, server configuration, Proxmox workflows, workstation setup, repeatable maintenance, and operational runbooks.',
      },
      {
        text: 'Docker',
        href: 'https://www.docker.com/',
        role: 'Container Toolchain',
        detailedDescription:
          'Docker provides tools for building, sharing, running, and managing containerized applications across developer machines, CI systems, registries, and deployment environments. It is useful for reproducible development environments, local services, container images, Compose workflows, and packaging application dependencies. Helix AI can use Docker for local development, test environments, service packaging, integration stacks, plugin isolation, and deployment artifacts.',
      },
      {
        text: 'Helm',
        href: 'https://helm.sh/',
        role: 'Kubernetes Package Manager',
        detailedDescription:
          'Helm is a package manager for Kubernetes that uses charts to define, install, configure, upgrade, and share Kubernetes applications. It helps teams manage reusable application packaging, environment-specific values, releases, rollbacks, and dependency charts. Helix AI can use Helm for platform component installation, reusable Kubernetes application packaging, GitOps deployment inputs, marketplace-ready charts, and infrastructure add-ons.',
      },
      {
        text: 'Kubernetes',
        href: 'https://kubernetes.io/',
        role: 'Container Orchestrator',
        detailedDescription:
          'Kubernetes is an open-source system for automating deployment, scaling, scheduling, networking, storage integration, and management of containerized applications. It provides a declarative control plane and a large ecosystem for running cloud-native workloads across hosted, self-managed, and hybrid environments. Helix AI can use Kubernetes for production platform services, self-hosted deployments, multi-tenant workloads, observability stacks, plugin isolation, and scalable automation infrastructure.',
      },
      {
        text: 'kind',
        href: 'https://kind.sigs.k8s.io/',
        role: 'Local Kubernetes Testing',
        detailedDescription:
          'kind is a tool for running local Kubernetes clusters using container nodes. It is useful for local development, Kubernetes testing, CI workflows, manifest validation, controller testing, and reproducible cluster experiments without requiring a full external cluster. Helix AI can use kind for testing Kubernetes manifests, validating Helm charts, checking GitOps changes, running integration tests, and giving developers a lightweight local cluster workflow before changes reach staging or production.',
      },
      {
        text: 'GitHub Copilot',
        href: 'https://github.com/features/copilot',
        role: 'AI Coding Assistant',
        detailedDescription:
          'GitHub Copilot is an AI coding assistant that helps developers write, understand, edit, review, and navigate code in supported editors and development workflows. It can assist with completions, explanations, tests, refactors, command-line workflows, and agent-style development tasks depending on the environment and plan. Helix AI can use Copilot as part of the developer experience around repository maintenance, coding assistance, documentation, issue triage, and productivity workflows.',
      },
      {
        text: 'Codex',
        href: 'https://openai.com/codex/',
        role: 'AI Coding Agent',
        detailedDescription:
          'Codex is OpenAI’s AI coding agent for software development workflows. It is designed to help developers work with codebases, answer implementation questions, write and modify code, run development tasks, and support agentic engineering workflows. Helix AI can use Codex as part of its developer workflow strategy for repository analysis, feature implementation support, test generation, issue triage, documentation improvements, and AI-assisted development loops.',
      },
    ],
    image: '/images/technology/development.png',
    link: '/technology/development',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `developmentCards` for new imports.
 */
export const DevelopmentCards = developmentCards;