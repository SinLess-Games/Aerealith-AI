// libs/content/src/en/technology/infrastructure.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary infrastructure technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/infrastructure.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const InfrastructureImage =
  `${Image_Paths.pages.technology}/infrastructure.png` as const;

/**
 * Infrastructure technology cards.
 *
 * This list intentionally includes only the infrastructure services
 * currently used by Aerealith AI:
 *
 * - Cloudflare DNS
 * - Docker Hub
 * - GitHub Container Registry
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const infrastructureCards = [
  {
    title: 'Infrastructure',
    description:
      'Managed DNS, container registries, package hosting, artifact storage, and deployment-support infrastructure used to route, publish, secure, and operate Aerealith AI services.',
    listItems: [
      {
        text: 'Cloudflare DNS',
        href: 'https://www.cloudflare.com/application-services/products/dns/',
        role: 'Managed DNS',
        detailedDescription:
          'Cloudflare DNS provides managed authoritative DNS with global resolution, security features, API-driven record management, and integration with the broader Cloudflare platform. Aerealith AI can use Cloudflare DNS for production domains, public service records, application routing, preview environments, edge-backed services, and infrastructure automation tied to the Cloudflare ecosystem.',
      },
      {
        text: 'Docker Hub',
        href: 'https://hub.docker.com/',
        role: 'Container Image Registry',
        detailedDescription:
          'Docker Hub provides hosted container image storage, distribution, versioning, and discovery for Docker-based workflows. Aerealith AI can use Docker Hub for publishing container images, sharing public or private images, supporting deployment workflows, testing service images, and distributing reusable containers across development, CI/CD, and production environments.',
      },
      {
        text: 'GitHub Container Registry',
        href: 'https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry',
        role: 'Container Image Registry',
        detailedDescription:
          'GitHub Container Registry, also known as GHCR, provides OCI container image hosting integrated with GitHub repositories, organization permissions, packages, and GitHub Actions workflows. Aerealith AI can use GitHub Container Registry for application images, service containers, worker images, deployment artifacts, versioned release images, and CI/CD-connected container publishing workflows.',
      },
    ],
    image: InfrastructureImage,
    link: '/technology/infrastructure',
    buttonText: 'Learn more',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `infrastructureCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const InfrastructureCards = infrastructureCards;