// libs/content/src/en/technology/development.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary development technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/development.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const DevelopmentImage =
  `${Image_Paths.pages.technology}/development.png` as const;

/**
 * Development and AI-assisted engineering technology cards.
 *
 * This list intentionally includes only the development platforms and tools
 * currently used by Aerealith AI:
 *
 * - OpenAI Codex
 * - GitHub Copilot
 * - Docker
 * - GitHub
 * - GitHub Actions
 * - Cloudflare Flagship
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const developmentCards = [
  {
    title: 'Development & AI-Assisted Engineering',
    description:
      'Code hosting, workflow automation, container tooling, and AI-assisted development tools used to build, maintain, test, and improve Aerealith AI.',
    listItems: [
      {
        text: 'OpenAI Codex',
        href: 'https://developers.openai.com/codex/ide',
        role: 'AI Coding Agent',
        detailedDescription:
          'OpenAI Codex is a coding agent that can read, edit, and run code to help developers build faster, fix bugs, understand unfamiliar codebases, and delegate larger development tasks. Aerealith AI can use Codex for repository exploration, feature implementation, refactoring support, bug fixing, test-driven changes, documentation improvements, and structured software engineering workflows.',
      },
      {
        text: 'GitHub Copilot',
        href: 'https://github.com/features/copilot',
        role: 'AI Coding Assistant',
        detailedDescription:
          'GitHub Copilot is an AI coding assistant that supports developers across editor, terminal, pull request, and GitHub-connected workflows. It can help generate code, explain implementation details, refactor logic, debug issues, write tests, and speed up day-to-day engineering tasks. Aerealith AI can use GitHub Copilot as part of the development workflow for implementation help, documentation support, review assistance, and engineering productivity.',
      },
      {
        text: 'Docker',
        href: 'https://www.docker.com/',
        role: 'Container Toolchain',
        detailedDescription:
          'Docker provides tools for building, sharing, and running containerized applications. It helps make development environments, application dependencies, service packaging, local testing, and deployment artifacts more consistent across machines and environments. Aerealith AI can use Docker for local development, service packaging, test environments, integration stacks, deployment images, and repeatable application workflows.',
      },
      {
        text: 'GitHub',
        href: 'https://github.com/',
        role: 'Code Hosting & Collaboration',
        detailedDescription:
          'GitHub is the primary platform for hosting repositories, managing source code, reviewing pull requests, tracking issues, collaborating on engineering work, publishing packages, and coordinating project activity. Aerealith AI can use GitHub as the source of truth for code, documentation, issues, releases, project planning, security visibility, and repository-level development workflows.',
      },
      {
        text: 'GitHub Actions',
        href: 'https://github.com/features/actions',
        role: 'CI/CD Automation',
        detailedDescription:
          'GitHub Actions is GitHub’s workflow automation and CI/CD platform for building, testing, scanning, packaging, and deploying software directly from a repository. Aerealith AI can use GitHub Actions for automated checks, test pipelines, build workflows, release automation, documentation publishing, security validation, dependency workflows, and deployment handoffs.',
      },
      {
        text: 'Cloudflare Flagship',
        href: 'https://developers.cloudflare.com/flagship/',
        role: 'Feature Flag Platform',
        detailedDescription:
          'Cloudflare Flagship provides feature flag management through OpenFeature-compatible workflows for progressive delivery, controlled rollouts, environment-specific behavior, and operational toggles. Aerealith AI can use Flagship to manage frontend, API, dashboard, registration, pricing, maintenance, and observability flags without hard-coding release state into application code.',
      },
    ],
    image: DevelopmentImage,
    link: '/technology/development',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `developmentCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const DevelopmentCards = developmentCards;
