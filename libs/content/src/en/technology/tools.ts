// libs/content/src/en/technology/tools.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary development tools technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/dev-tools.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const ToolsImage = `${Image_Paths.pages.technology}/dev-tools.png` as const;

/**
 * Development tools cards.
 *
 * This list includes the local and repository tooling used by Aerealith AI
 * for container workflows, task automation, GitHub operations, and source-code
 * editing.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const toolsCards = [
  {
    title: 'Development Tools',
    description:
      'CLI and UI utilities used to streamline container builds, local development loops, project automation, GitHub workflows, source-code editing, and cloud-native development tasks.',
    listItems: [
      {
        text: 'Docker',
        href: 'https://www.docker.com/',
        role: 'Container Engine & Build Tooling',
        detailedDescription:
          'Docker provides tools for building, sharing, running, and managing containerized applications across developer machines, CI systems, registries, and deployment environments. Docker is useful for reproducible local development, service packaging, container image builds, integration stacks, and deployment artifacts. Aerealith AI can use Docker for local development, test environments, service containers, CI validation, and repeatable application workflows.',
      },
      {
        text: 'Go Task',
        href: 'https://taskfile.dev/',
        role: 'Task Runner & Build Automation',
        detailedDescription:
          'Go Task, commonly used through Taskfile, is a task runner and build automation tool that uses YAML-based task definitions. It is useful for replacing scattered shell scripts, Makefiles, and manual command sequences with repeatable project commands. Aerealith AI can use Go Task for monorepo workflows, local development commands, linting, testing, formatting, deployment helpers, and contributor-friendly project automation.',
      },
      {
        text: 'GitHub CLI',
        href: 'https://cli.github.com/',
        role: 'Repository Automation',
        detailedDescription:
          'GitHub CLI brings GitHub workflows to the terminal, including pull requests, issues, releases, Actions, repositories, authentication, and extension-based automation. It is useful for scripting repository operations and integrating GitHub into local or CI workflows. Aerealith AI can use GitHub CLI for repository automation, issue triage, workflow inspection, release management, GitHub Actions review, and developer productivity commands.',
      },
      {
        text: 'Visual Studio Code',
        href: 'https://code.visualstudio.com/',
        role: 'Source-Code Editor',
        detailedDescription:
          'Visual Studio Code is a lightweight and extensible source-code editor with integrated terminal support, debugging, extensions, language tooling, Git integration, and broad ecosystem support. It is commonly used across TypeScript, JavaScript, Docker, GitHub, and cloud-native development workflows. Aerealith AI can support VS Code through workspace settings, recommended extensions, debugging profiles, Copilot integration, and developer automation.',
      },
    ],
    image: ToolsImage,
    link: '/technology/tools',
    buttonText: 'Explore tools',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `toolsCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const ToolsCards = toolsCards;