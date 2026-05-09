// libs/shared/site-content/src/lib/technology/frameworks.ts

import type { CardProps } from '../types/card';

export const FrameworksCards = [
  {
    title: 'Frameworks & Tooling',
    description:
      'Modern web frameworks, type-safe API layers, and developer-friendly package managers for JavaScript and Python ecosystems.',
    listItems: [
      {
        text: 'Next.js 14',
        href: 'https://nextjs.org/',
        role: 'React Meta-framework',
        detailedDescription:
          'Next.js 14 (Oct 2024) stabilised Server Actions, shipped Partial Prerendering preview, and rolled out Turbopack-powered dev servers that start 53% faster and hot-refresh 94% quicker while keeping full App Router compatibility.',
      },
      {
        text: 'React 19',
        href: 'https://react.dev/',
        role: 'UI Library',
        detailedDescription:
          'React 19 (Dec 2024) introduces async transitions that automatically manage pending, error, and optimistic UI states; it finalises React Server Components and shrinks hydration costs through selective compilation.',
      },
      {
        text: 'tRPC v11',
        href: 'https://trpc.io/',
        role: 'Type-safe RPC',
        detailedDescription:
          'tRPC v11 (Mar 2025) adds native file uploads, React Query v5 adapters, and built-in OpenAPI generation—letting full-stack TypeScript apps share types end-to-end with zero codegen.',
      },
      {
        text: 'NestJS 11',
        href: 'https://nestjs.com/',
        role: 'Scalable Node.js Backend',
        detailedDescription:
          'NestJS 11 (May 2025) upgrades to ES2024 decorators, swaps in Fastify 5 by default, and embeds OpenTelemetry auto-instrumentation; schema-first GraphQL now compiles 30% faster via SWC.',
      },
      {
        text: 'MikroORM 6',
        href: 'https://mikro-orm.io/',
        role: 'TypeScript ORM',
        detailedDescription:
          'MikroORM 6 (May 2024) enhances type safety with stricter generics, introduces SQL tagged-template partials, and launches a Migration Lab CLI that visualises diff graphs for complex schema refactors.',
      },
      {
        text: 'FastAPI 0.110',
        href: 'https://fastapi.tiangolo.com/',
        role: 'Python Web Framework',
        detailedDescription:
          'FastAPI 0.110 (Mar 2025) brings full Pydantic V2 typing, streamlines async background tasks, and shrinks OpenAPI schemas 25% via `$ref` deduping—keeping sub-millisecond JSON serialisation speeds.',
      },
      {
        text: 'pnpm 9',
        href: 'https://pnpm.io/',
        role: 'Node Package Manager',
        detailedDescription:
          "pnpm 9 (Jan 2025) features a content-addressable store that reuses packages across projects through hardlinks, a `pnpm deploy` command for zero-install production images, and Plug'n'Play-style isolated dependencies that slash CI minutes.",
      },
      {
        text: 'Poetry 1.7',
        href: 'https://python-poetry.org/',
        role: 'Python Dependency Manager',
        detailedDescription:
          'Poetry 1.7 (Feb 2025) adds PEP 723 inline-metadata parsing, lock-file parallel downloads, and a `poetry publish --dry-run` workflow. Its virtual-env isolation and `pyproject.toml`-first config simplify reproducible builds and packaging.',
      },
    ],
    image: '/images/technology/frameworks.png',
    link: '/technology/frameworks',
    buttonText: 'Explore frameworks',
  },
] as const satisfies CardProps[];
