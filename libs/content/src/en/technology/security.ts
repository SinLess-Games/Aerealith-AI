// libs/content/src/en/technology/security.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary security technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/security.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const SecurityImage =
  `${Image_Paths.pages.technology}/security.png` as const;

/**
 * Security and compliance technology cards.
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const securityCards = [
  {
    title: 'Security & Compliance',
    description:
      'Code scanning, dependency update automation, software composition analysis, vulnerability visibility, and supply-chain security tooling used to help protect Aerealith AI’s codebase and development workflow.',
    listItems: [
      {
        text: 'CodeQL',
        href: 'https://codeql.github.com/',
        role: 'Semantic Code Analysis',
        detailedDescription:
          'CodeQL is a semantic code analysis engine that treats code as data and enables security queries across supported languages. It powers code scanning workflows and can identify vulnerabilities, insecure patterns, and data-flow issues in application code. Aerealith AI can use CodeQL for repository security checks, pull-request scanning, static application security testing, and deeper visibility into risky code paths.',
      },
      {
        text: 'Renovate',
        href: 'https://github.com/renovatebot/renovate',
        role: 'Dependency Update Automation',
        detailedDescription:
          'Renovate automates dependency updates by scanning repositories and opening pull requests for package, container image, GitHub Action, Dockerfile, and infrastructure dependency changes. Aerealith AI can use Renovate for dependency hygiene, automated update PRs, grouped updates, security patches, version tracking, and long-term repository maintenance workflows.',
      },
      {
        text: 'Dependabot',
        href: 'https://github.com/dependabot',
        role: 'Dependency & Security PR Bot',
        detailedDescription:
          'Dependabot helps keep dependencies updated by opening pull requests for version updates and known security vulnerabilities in supported ecosystems. It integrates closely with GitHub repositories and dependency alerts. Aerealith AI can use Dependabot for GitHub-native dependency maintenance, vulnerability patching, lockfile updates, and automated security remediation workflows.',
      },
      {
        text: 'Mend',
        href: 'https://www.mend.io/',
        role: 'Software Composition Analysis',
        detailedDescription:
          'Mend provides software supply-chain and application security tooling focused on dependency risk, open-source vulnerabilities, license compliance, container security, and remediation workflows. Aerealith AI can use Mend-style tooling for dependency visibility, open-source risk review, license awareness, compliance support, and supply-chain security reporting.',
      },
      {
        text: 'Mend Bolt for GitHub',
        href: 'https://github.com/marketplace/mend',
        role: 'SCA GitHub App',
        detailedDescription:
          'Mend Bolt for GitHub is a GitHub Marketplace app for surfacing open-source vulnerability and license information in repository workflows. Aerealith AI can use this type of GitHub-integrated software composition analysis workflow for repository security visibility, dependency risk feedback, pull-request awareness, and developer-facing remediation guidance.',
      },
    ],
    image: SecurityImage,
    link: '/technology/security',
    buttonText: 'Explore security',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `securityCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const SecurityCards = securityCards;