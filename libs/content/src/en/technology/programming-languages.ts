// libs/content/src/en/technology/programming-languages.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary programming languages technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/programming-languages.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const ProgrammingLanguagesImage =
  `${Image_Paths.pages.technology}/programming-languages.png` as const;

/**
 * Programming language technology cards.
 *
 * This list intentionally includes only actual programming languages.
 * Structured data formats and configuration formats such as JSON and YAML
 * should live in a separate tooling, configuration, or platform category.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const programmingLanguagesCards = [
  {
    title: 'Programming Languages',
    description:
      'Core programming languages used to build Aerealith AI services, frontend experiences, backend logic, automation workflows, development scripts, and platform tooling.',
    listItems: [
      {
        text: 'TypeScript',
        href: 'https://www.typescriptlang.org/',
        role: 'Typed JavaScript',
        detailedDescription:
          'TypeScript is a strongly typed programming language that builds on JavaScript while improving editor tooling, maintainability, and large-scale application development. It is especially useful for monorepos, shared packages, frontend applications, backend services, SDKs, and strongly typed API contracts. Aerealith AI can use TypeScript across the Next.js frontend, shared content libraries, UI components, backend services, API contracts, automation tooling, and developer platform packages.',
      },
      {
        text: 'JavaScript',
        href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        role: 'Web Runtime Language',
        detailedDescription:
          'JavaScript is the primary programming language of the web and is also widely used in non-browser runtimes such as Node.js and edge/serverless environments. It supports dynamic application behavior, browser APIs, server-side logic, build tooling, and full-stack web development. Aerealith AI can use JavaScript where runtime compatibility, browser behavior, package ecosystem support, and edge-executed scripts are important.',
      },
      {
        text: 'Bash',
        href: 'https://www.gnu.org/software/bash/',
        role: 'Shell Automation',
        detailedDescription:
          'Bash is a Unix shell and command language commonly used for scripting, automation, local development workflows, deployment tasks, CI/CD steps, system administration, and infrastructure operations. It is useful for repeatable command execution, environment setup, server maintenance, and glue logic between command-line tools. Aerealith AI can use Bash scripts for development automation, local setup commands, infrastructure helpers, deployment workflows, maintenance tasks, and operator-focused tooling.',
      },
    ],
    image: ProgrammingLanguagesImage,
    link: '/technology/languages',
    buttonText: 'Explore languages',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `programmingLanguagesCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const ProgrammingLanguagesCards = programmingLanguagesCards;