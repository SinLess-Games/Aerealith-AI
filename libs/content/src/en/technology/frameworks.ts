// libs/content/src/en/technology/frameworks.ts

import type { ReadonlyCardArray } from '../../types';

export const frameworksCards = [
  {
    title: 'Frameworks & Tooling',
    description:
      'Modern web frameworks, UI libraries, type-safe API layers, backend frameworks, ORMs, package managers, monorepo tools, testing frameworks, and code-quality tooling for JavaScript, TypeScript, and Python ecosystems.',
    listItems: [
      {
        text: 'TensorFlow',
        href: 'https://www.tensorflow.org/',
        role: 'ML Platform',
        detailedDescription:
          'TensorFlow is an end-to-end open-source machine-learning platform with tools for training, evaluating, deploying, and serving models across cloud, desktop, mobile, web, and edge environments. Its ecosystem includes TensorFlow, TensorFlow Lite, TensorFlow.js, TensorBoard, and production-serving workflows. Helix AI can use TensorFlow where structured ML pipelines, edge deployment, or mature production tooling are required.',
      },
      {
        text: 'PyTorch',
        href: 'https://pytorch.org/',
        role: 'Deep Learning Framework',
        detailedDescription:
          'PyTorch is a widely used open-source deep-learning framework with a Python-first developer experience, dynamic execution model, and a large ecosystem for research and production. It is commonly used for model training, fine-tuning, experimentation, computer vision, NLP, graph learning, and AI infrastructure work. Helix AI can use PyTorch for custom model development, research workflows, and local or self-hosted AI experimentation.',
      },
      {
        text: 'Keras',
        href: 'https://keras.io/',
        role: 'High-Level Deep Learning API',
        detailedDescription:
          'Keras is a high-level deep-learning API focused on developer productivity, readable model definitions, rapid experimentation, and multi-backend machine-learning workflows. It supports modern model-building patterns while allowing teams to work across major ML ecosystems. Helix AI can use Keras for fast prototyping, educational examples, and clear model-development workflows.',
      },
      {
        text: 'Matplotlib',
        href: 'https://matplotlib.org/',
        role: 'Visualization Library',
        detailedDescription:
          'Matplotlib is a core Python visualization library for creating static, animated, and interactive charts. It is commonly used with NumPy, Pandas, Jupyter, scientific computing workflows, reporting, and exploratory data analysis. Helix AI can use Matplotlib-backed workflows for generated analytics, internal reports, notebooks, and visual explanations of user-provided data.',
      },
      {
        text: 'LangChain',
        href: 'https://www.langchain.com/langchain',
        role: 'LLM Application Framework',
        detailedDescription:
          'LangChain is an open-source framework for building applications and agents around language models, tools, retrievers, prompts, integrations, and orchestration patterns. It works across many model providers and connects with the broader LangChain ecosystem, including LangGraph and LangSmith. Helix AI can use LangChain concepts or integrations where provider abstraction, tool orchestration, and agent workflows are useful.',
      },
      {
        text: 'Next.js',
        href: 'https://nextjs.org/',
        role: 'React Framework',
        detailedDescription:
          'Next.js is a React framework for building full-stack web applications with routing, rendering, data fetching, optimization, server components, and deployment-focused workflows. It supports both server and client rendering patterns and is especially useful for product sites, dashboards, documentation, SaaS frontends, and API-adjacent application surfaces. Helix AI can use Next.js for the hosted web app, marketing site, documentation interfaces, dashboard experiences, and user-facing product workflows.',
      },
      {
        text: 'React',
        href: 'https://react.dev/',
        role: 'UI Library',
        detailedDescription:
          'React is a JavaScript library for building user interfaces from reusable components. It works across web and native-style application surfaces and supports declarative UI composition, stateful components, hooks, server components, and a large ecosystem of supporting tools. Helix AI can use React as the foundation for interactive dashboards, assistant interfaces, analytics views, settings pages, marketplace screens, and reusable UI components.',
      },
      {
        text: 'tRPC',
        href: 'https://trpc.io/',
        role: 'Type-Safe API Layer',
        detailedDescription:
          'tRPC is a TypeScript-first framework for building and consuming end-to-end typesafe APIs without requiring schemas or code generation. It is useful when frontend and backend TypeScript applications should share inferred types across procedure inputs and outputs. Helix AI can use tRPC for internal app APIs, dashboard interactions, strongly typed frontend/backend contracts, and fast iteration inside TypeScript-first services.',
      },
      {
        text: 'Hono',
        href: 'https://hono.dev/',
        role: 'Web Framework',
        detailedDescription:
          'Hono is a small, fast web framework designed for modern JavaScript and TypeScript runtimes, including edge, serverless, and traditional server environments. It is useful for APIs, middleware, lightweight services, Cloudflare Workers, routing layers, and performance-sensitive web endpoints. Helix AI can use Hono for edge-first APIs, Cloudflare Worker services, webhooks, lightweight automation endpoints, and integration surfaces that need speed and portability.',
      },
      {
        text: 'MikroORM',
        href: 'https://mikro-orm.io/',
        role: 'TypeScript ORM',
        detailedDescription:
          'MikroORM is a TypeScript ORM for Node.js based on Data Mapper, Unit of Work, and Identity Map patterns. It helps build type-safe database layers while supporting entities, repositories, migrations, schema management, and multiple database engines. Helix AI can use MikroORM for strongly typed persistence around users, organizations, memory metadata, automations, subscriptions, integrations, audit logs, and platform configuration.',
      },
      {
        text: 'FastAPI',
        href: 'https://fastapi.tiangolo.com/',
        role: 'Python API Framework',
        detailedDescription:
          'FastAPI is a modern Python web framework for building APIs using standard Python type hints. It supports automatic interactive API documentation, validation through the Python typing ecosystem, asynchronous request handling, and production-ready service patterns. Helix AI can use FastAPI for Python-based AI services, model-serving APIs, ML utilities, internal tools, data-processing endpoints, and experimental AI workflows.',
      },
      {
        text: 'Nx',
        href: 'https://nx.dev/',
        role: 'Monorepo Build System',
        detailedDescription:
          'Nx is a smart build system and monorepo toolkit for managing large JavaScript, TypeScript, and full-stack workspaces. It supports affected builds, task caching, dependency graphs, generators, executors, project boundaries, and scalable CI workflows. Helix AI can use Nx to organize frontend apps, shared libraries, backend services, SDK packages, content libraries, testing workflows, and build automation inside a structured monorepo.',
      },
      {
        text: 'pnpm',
        href: 'https://pnpm.io/',
        role: 'Node Package Manager',
        detailedDescription:
          'pnpm is a fast, disk-space-efficient package manager for JavaScript and TypeScript projects. It is well suited for monorepos because it supports workspaces, deterministic lockfiles, strict dependency layouts, and a content-addressable package store. Helix AI can use pnpm for the Nx monorepo, shared packages, frontend and backend workspaces, repeatable installs, CI efficiency, and consistent developer environments.',
      },
      {
        text: 'Vitest',
        href: 'https://vitest.dev/',
        role: 'Unit Testing Framework',
        detailedDescription:
          'Vitest is a fast unit-testing framework designed for modern Vite, TypeScript, and JavaScript projects. It supports test isolation, mocking, snapshots, coverage, watch mode, and a developer experience that works well with modern frontend and library workflows. Helix AI can use Vitest for testing shared utilities, frontend logic, content packages, SDK behavior, UI helpers, and fast developer feedback inside the monorepo.',
      },
      {
        text: 'Jest',
        href: 'https://jestjs.io/',
        role: 'JavaScript Testing Framework',
        detailedDescription:
          'Jest is a mature JavaScript testing framework commonly used for unit tests, integration tests, mocks, snapshots, and application-level test suites. It has broad ecosystem support and works well across many Node.js and frontend projects. Helix AI can use Jest where ecosystem compatibility, existing tooling, or package-level test support makes it the best fit for reliable automated testing.',
      },
      {
        text: 'Cypress',
        href: 'https://www.cypress.io/',
        role: 'End-to-End Testing',
        detailedDescription:
          'Cypress is an end-to-end and component testing tool for modern web applications. It is useful for testing real browser workflows, user journeys, forms, dashboards, authentication flows, and regression-sensitive product behavior. Helix AI can use Cypress to validate the marketing site, waitlist funnel, dashboard flows, settings pages, pricing interactions, onboarding paths, and other user-facing experiences before production releases.',
      },
      {
        text: 'ESLint',
        href: 'https://eslint.org/',
        role: 'Code Linting',
        detailedDescription:
          'ESLint is a configurable linting tool for JavaScript and TypeScript projects that helps catch bugs, enforce code standards, and maintain consistency across teams. It supports custom rules, plugins, flat configuration, framework-specific rules, and CI enforcement. Helix AI can use ESLint to keep the monorepo consistent, prevent common mistakes, enforce architectural rules, and improve code quality across frontend, backend, tooling, and shared libraries.',
      },
      {
        text: 'Prettier',
        href: 'https://prettier.io/',
        role: 'Code Formatter',
        detailedDescription:
          'Prettier is an opinionated code formatter that keeps code style consistent across JavaScript, TypeScript, JSON, YAML, Markdown, CSS, and other supported formats. It reduces style debates and makes diffs easier to review. Helix AI can use Prettier to standardize formatting across the monorepo, documentation, configuration files, content packages, frontend code, and shared development workflows.',
      },
      {
        text: 'Poetry',
        href: 'https://python-poetry.org/',
        role: 'Python Dependency Manager',
        detailedDescription:
          'Poetry is a Python dependency-management and packaging tool that helps declare project dependencies, resolve versions, manage lockfiles, create isolated environments, and build packages for distribution. It is useful for reproducible Python services and clean project metadata through pyproject.toml. Helix AI can use Poetry for Python AI services, tooling packages, ML experiments, data utilities, and reproducible backend or research environments.',
      },
    ],
    image: '/images/technology/frameworks.png',
    link: '/technology/frameworks',
    buttonText: 'Explore frameworks',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `frameworksCards` for new imports.
 */
export const FrameworksCards = frameworksCards;