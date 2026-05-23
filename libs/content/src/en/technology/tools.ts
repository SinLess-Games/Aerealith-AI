// libs/content/src/en/technology/tools.ts

import type { ReadonlyCardArray } from '../../types';

/**
 * Curated developer tooling for local iteration, container builds, GitOps,
 * API design/testing, documentation, security operations, automation,
 * and cloud-native workflows.
 */
export const toolsCards = [
  {
    title: 'Development Tools',
    description:
      'CLI and UI utilities that streamline container builds, local development loops, API development, documentation, automation, secrets operations, security workflows, and cloud-native deployment.',
    listItems: [
      {
        text: 'Docker',
        href: 'https://www.docker.com/',
        role: 'Container Engine & Build Tooling',
        detailedDescription:
          'Docker provides tools for building, sharing, running, and managing containerized applications across developer machines, CI systems, registries, and deployment environments. Docker Desktop gives developers a local UI and integrated workflow for containers, images, volumes, Kubernetes, and related tooling. Helix AI can use Docker for local development, integration stacks, reproducible services, plugin isolation, container image builds, and CI validation.',
      },
      {
        text: 'Podman',
        href: 'https://podman.io/',
        role: 'Daemonless Containers',
        detailedDescription:
          'Podman is a daemonless, open-source container tool for finding, running, building, sharing, and deploying OCI containers and images. It provides a Docker-compatible style CLI while supporting rootless container workflows and pod-oriented operation. Helix AI can use Podman for rootless local development, secure container experiments, Linux workstation workflows, and environments where daemonless container management is preferred.',
      },
      {
        text: 'Go Task',
        href: 'https://taskfile.dev/',
        role: 'Task Runner & Build Automation',
        detailedDescription:
          'Go Task, commonly used through Taskfile, is a simple task runner and build automation tool that uses YAML-based task definitions. It is useful for replacing scattered shell scripts, Makefiles, and manual command sequences with repeatable project commands. Helix AI can use Go Task for monorepo workflows, local development commands, build tasks, linting, testing, formatting, deployment helpers, infrastructure automation, and contributor-friendly project setup.',
      },
      {
        text: 'Vault CLI',
        href: 'https://developer.hashicorp.com/vault/docs/commands',
        role: 'Secrets Operations CLI',
        detailedDescription:
          'Vault CLI is the command-line interface for interacting with HashiCorp Vault. It supports authentication, secret reads and writes, token inspection, policy workflows, KV operations, certificate workflows, and administrative tasks depending on the configured Vault backend and user permissions. Helix AI can use Vault CLI for development secrets, local testing, platform operations, connector credential management, certificate workflows, and secure automation around sensitive configuration.',
      },
      {
        text: 'Mage',
        href: 'https://magefile.org/',
        role: 'Go-Based Build Automation',
        detailedDescription:
          'Mage is a Make-like build tool that uses Go instead of shell scripts or Make syntax. It is useful when teams want strongly typed build logic, reusable Go functions, and cross-platform developer automation. Helix AI can use Mage for Go-heavy tooling, compiled build helpers, repository automation, release scripts, and infrastructure tasks that benefit from normal programming-language structure.',
      },
      {
        text: 'Tilt',
        href: 'https://tilt.dev/',
        role: 'Live Kubernetes Dev Loop',
        detailedDescription:
          'Tilt provides a local development workflow for services running in Kubernetes by automating image builds, deploys, logs, resource status, and live feedback loops. It helps developers iterate on multi-service systems without manually rebuilding and redeploying every change. Helix AI can use Tilt for Kubernetes-based development environments, local platform stacks, rapid service iteration, and debugging distributed application behavior.',
      },
      {
        text: 'Skaffold',
        href: 'https://skaffold.dev/',
        role: 'Local-to-Cluster Workflow',
        detailedDescription:
          'Skaffold is a command-line tool that handles the workflow for building, pushing, and deploying applications to Kubernetes. It supports iterative local development, CI/CD usage, profiles, render/deploy flows, and integration with Kubernetes manifests and common tooling. Helix AI can use Skaffold for local-to-cluster development loops, reproducible Kubernetes workflows, integration testing, and CI delivery patterns.',
      },
      {
        text: 'GitHub CLI',
        href: 'https://cli.github.com/',
        role: 'Repository Automation',
        detailedDescription:
          'GitHub CLI brings GitHub workflows to the terminal, including pull requests, issues, releases, Actions, repositories, gists, authentication, and extension-based automation. It is useful for scripting repository operations and integrating GitHub into local or CI workflows. Helix AI can use GitHub CLI for repo automation, issue triage, workflow inspection, release management, agentic GitHub workflows, and developer productivity commands.',
      },
      {
        text: 'Visual Studio Code',
        href: 'https://code.visualstudio.com/',
        role: 'Source-Code Editor',
        detailedDescription:
          'Visual Studio Code is a lightweight but extensible source-code editor with integrated terminal support, debugging, extensions, language tooling, remote development, Git integration, and broad ecosystem support. It is commonly used across TypeScript, Python, Go, Rust, Kubernetes, Docker, and infrastructure workflows. Helix AI can support VS Code through workspace settings, recommended extensions, GitHub integrations, debugging profiles, and developer automation.',
      },
      {
        text: 'Obsidian',
        href: 'https://obsidian.md/',
        role: 'Developer Notes & Docs',
        detailedDescription:
          'Obsidian is a Markdown-based knowledge base and note-taking application that stores notes as local files. It supports links, graphs, plugins, canvases, and personal or team documentation workflows. Helix AI can use Obsidian-compatible Markdown patterns for planning notes, architecture drafts, research logs, product ideas, offline knowledge bases, and user-owned documentation workflows.',
      },
      {
        text: 'NVIDIA CUDA Toolkit',
        href: 'https://developer.nvidia.com/cuda-toolkit',
        role: 'GPU Compute Toolkit',
        detailedDescription:
          'The NVIDIA CUDA Toolkit provides tools, libraries, compilers, and APIs for developing GPU-accelerated applications on NVIDIA hardware. It is widely used in AI, machine learning, scientific computing, data processing, and high-performance computing workflows. Helix AI can use CUDA-enabled environments for local model experiments, GPU-backed inference, ML workloads, image/video processing, and self-hosted AI acceleration.',
      },
      {
        text: 'Postman',
        href: 'https://www.postman.com/',
        role: 'API Design & Testing',
        detailedDescription:
          'Postman is an API platform for designing, testing, documenting, mocking, collaborating on, and automating API workflows. It supports collections, environments, test scripts, API documentation, monitors, and team collaboration around HTTP-based services. Helix AI can use Postman for API validation, integration testing, connector development, developer documentation, webhook testing, and manual QA workflows.',
      },
      {
        text: 'Deno',
        href: 'https://deno.com/',
        role: 'Secure JavaScript Runtime',
        detailedDescription:
          'Deno is an open-source JavaScript and TypeScript runtime built on web standards with secure defaults, permission controls, and a built-in toolchain. It can run JavaScript and TypeScript with minimal configuration while supporting modern runtime features. Helix AI can use Deno for plugin runtime experiments, sandboxed automation scripts, edge-style functions, developer tooling, and permissioned execution models.',
      },
      {
        text: 'Bazel',
        href: 'https://bazel.build/',
        role: 'Polyglot Build System',
        detailedDescription:
          'Bazel is a build and test tool designed for large, multi-language workspaces that need reproducible, cache-friendly, and scalable builds. It supports hermetic build patterns, remote caching, dependency graph execution, and polyglot monorepo workflows. Helix AI can use Bazel concepts or tooling where repository scale, build determinism, remote execution, and multi-language dependency graphs become important.',
      },
    ],
    image: '/images/technology/dev-tools.png',
    link: '/technology/tools',
    buttonText: 'Explore tools',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `toolsCards` for new imports.
 */
export const ToolsCards = toolsCards;
``