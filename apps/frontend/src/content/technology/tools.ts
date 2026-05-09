// libs/shared/site-content/src/lib/technology/tools.ts

import type { CardProps } from '../types/card';

/**
 * ### ToolsCards
 *
 * Curated developer tooling for local iteration, container builds, GitOps,
 * API design/testing, and cloud-native workflows.
 *
 * @example
 * ```ts
 * import { ToolsCards } from '@/lib/constants/frontend/technology/tools'
 * ```
 */
export const ToolsCards = [
  {
    title: 'Development Tools',
    description:
      'CLI and UI utilities that streamline container builds, local iteration loops, GitOps workflows, API development, and cloud-native deployment.',
    listItems: [
      {
        text: 'Docker 25.0',
        href: 'https://www.docker.com/',
        role: 'Container Engine & BuildKit',
        detailedDescription:
          'Docker Engine 25.0 (Feb 2025) bundles BuildKit 0.12, rootless overlayfs on cgroup-v2, and CVE-patched runc; Docker Desktop adds synchronized bind mounts, Dev Containers spec 1.0, and OpenTelemetry tracing hooks for supply-chain insight.',
      },
      {
        text: 'Podman 5.0',
        href: 'https://podman.io/',
        role: 'Daemonless Containers',
        detailedDescription:
          'Podman 5.0 (Apr 2025) introduces GPU passthrough in `podman machine`, auto-update of systemd-managed pods, and Docker Compose v2 parity—enabling rootless production containers on any Linux distro.',
      },
      {
        text: 'go-task 3.34',
        href: 'https://taskfile.dev/',
        role: 'Task Runner',
        detailedDescription:
          'go-task v3.34 (Mar 2025) offers embedded template functions, checksum-based caching, and a DAG-aware `--job-parallel` flag that slashes CI minutes for poly-repo pipelines.',
      },
      {
        text: 'Flux CLI 2.3',
        href: 'https://fluxcd.io/',
        role: 'GitOps CLI',
        detailedDescription:
          'Flux CLI 2.3 (Jun 2025) adds `flux trace` for commit-to-cluster diff, OCI-based variables, and Kustomize v5 schema validation; it drives declarative bootstrap, reconciliation, and multi-cluster release promotion from the terminal.',
      },
      {
        text: 'Consul CLI 1.18',
        href: 'https://developer.hashicorp.com/consul/cli',
        role: 'Service Mesh & KV CLI',
        detailedDescription:
          'Consul CLI 1.18 (Jan 2025) supports Mesh Gateway federation commands, KV namespace ACL tokens, and `consul-dataplane` live-reload, giving operators scriptable service-discovery and configuration flows.',
      },
      {
        text: 'Mage 1.17',
        href: 'https://magefile.org/',
        role: 'Makefile Replacement (Go)',
        detailedDescription:
          'Mage 1.17 (Jan 2025) adds `mage -compile` to emit self-contained binaries, integrates with Go workspaces, and improves dependency graph introspection, enabling deterministic cross-platform build scripts without Make.',
      },
      {
        text: 'Tilt 0.33',
        href: 'https://tilt.dev/',
        role: 'Live Kubernetes Dev Loop',
        detailedDescription:
          'Tilt 0.33 (May 2025) offers remote-cache image layering, a unified Web UI, and experimental Wasm workers, enabling sub-second feedback while hacking on Kubernetes apps.',
      },
      {
        text: 'Skaffold 2.9',
        href: 'https://skaffold.dev/',
        role: 'Local-to-Prod CI/CD',
        detailedDescription:
          'Skaffold 2.9 (Apr 2025) stabilises the `render` phase with Kustomize v5, adds CloudEvents triggers, and supports OCI artifact caching for reproducible multi-arch builds.',
      },
      {
        text: 'GitHub CLI 2.50',
        href: 'https://cli.github.com/',
        role: 'Repo Automation',
        detailedDescription:
          'gh 2.50 (Jun 2025) features `gh run watch` live logs, Copilot AI command suggestions, and secret-scanning fix prompts, making Actions and repo management fully scriptable.',
      },
      {
        text: 'Dev Containers Spec 1.0',
        href: 'https://containers.dev/',
        role: 'Portable Dev Environments',
        detailedDescription:
          'The Dev Containers 1.0 spec (Oct 2024) standardises `.devcontainer.json`, lifecycle hooks, and a feature marketplace, ensuring reproducible environments across VS Code, JetBrains, and Docker Desktop.',
      },
      {
        text: 'VS Code 1.90',
        href: 'https://code.visualstudio.com/',
        role: 'Source-Code Editor',
        detailedDescription:
          'Visual Studio Code 1.90 (May 2025) adds remote Dev Containers spec 1.0 sync, AI-powered inline refactor suggestions, and Rust Analyzer 2025-05 bundle, cementing its place as the go-to polyglot IDE.',
      },
      {
        text: 'Obsidian 1.5.0',
        href: 'https://obsidian.md/',
        role: 'Developer Notes & Docs',
        detailedDescription:
          'Obsidian 1.5 (Apr 2025) ships Canvas graph querying, live-preview Mermaid diagrams, and GitHub-sync plug-ins—turning Markdown knowledge bases into portable, version-controlled developer wikis.',
      },
      {
        text: 'NVIDIA CUDA 12.5 SDK',
        href: 'https://developer.nvidia.com/cuda-toolkit',
        role: 'GPU Compute Toolkit',
        detailedDescription:
          'CUDA 12.5 (Feb 2025) delivers cuBLAS flash-attention kernels, Lion optimizer primitives, and PTX ISA 9 with SM90 support—accelerating Helix AI’s deep-learning pipelines on Hopper GPUs.',
      },
      {
        text: 'Postman 2025-05',
        href: 'https://www.postman.com/',
        role: 'API Design & Testing',
        detailedDescription:
          'Postman v10.24 (May 2025) adds AI-generated test suites, OpenAPI-to-GraphQL converters, and a lightweight Collection Runner that executes 2× faster thanks to WebAssembly sandboxing.',
      },
      {
        text: 'Deno 1.46',
        href: 'https://deno.com/',
        role: 'Secure JavaScript Runtime',
        detailedDescription:
          'Deno 1.46 (Mar 2025) ships NPM triple-slash types auto-shim, experimental Bun-compat API, and KV database preview GA, enabling secure, permissioned serverless functions with first-class TypeScript support.',
      },
      {
        text: 'Bazel 7.0',
        href: 'https://bazel.build/',
        role: 'Polyglot Build System',
        detailedDescription:
          'Bazel 7.0 (Jan 2025) locks Starlark 2.0, ships `bzlmod` module downloads, and integrates Remote Execution API 2, delivering hermetic, cache-friendly builds for monorepos in Go, Rust, and TypeScript.',
      },
    ],
    image: '/images/technology/dev-tools.png',
    link: '/technology/tools',
    buttonText: 'Explore tools',
  },
] as const satisfies CardProps[];
