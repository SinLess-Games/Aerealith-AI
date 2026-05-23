// libs/content/src/en/technology/programming-languages.ts

import type { ReadonlyCardArray } from '../../types';

/**
 * Core programming languages and structured configuration formats powering
 * Helix AI — spanning type-safe web apps, AI/ML backends, cloud-native services,
 * infrastructure automation, high-performance systems, and deployment workflows.
 */
export const programmingLanguagesCards = [
  {
    title: 'Programming Languages',
    description:
      'Core languages and structured formats that power Helix AI services, ranging from type-safe web frontends and backend APIs to AI workflows, infrastructure tooling, configuration files, automation scripts, and high-performance systems.',
    listItems: [
      {
        text: 'TypeScript',
        href: 'https://www.typescriptlang.org/',
        role: 'Typed JavaScript',
        detailedDescription:
          'TypeScript is a strongly typed programming language that builds on JavaScript while improving editor tooling, maintainability, and large-scale application development. It is especially useful for monorepos, shared packages, frontend applications, backend services, SDKs, and strongly typed API contracts. Helix AI can use TypeScript across the Next.js frontend, shared content libraries, UI components, backend services, plugin SDKs, automation tooling, and developer platform packages.',
      },
      {
        text: 'JavaScript',
        href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        role: 'Web Runtime Language',
        detailedDescription:
          'JavaScript is the primary programming language of the web and is also widely used in non-browser runtimes such as Node.js and edge/serverless environments. It supports dynamic application behavior, browser APIs, server-side logic, build tooling, and full-stack web development. Helix AI can use JavaScript where runtime compatibility, browser behavior, package ecosystem support, and edge-executed scripts are important.',
      },
      {
        text: 'Python',
        href: 'https://www.python.org/',
        role: 'AI & Data Science',
        detailedDescription:
          'Python is a general-purpose programming language known for readability, fast development, and a large ecosystem for automation, data science, machine learning, scripting, and backend services. It is widely used with AI/ML frameworks, notebooks, data-processing tools, and API frameworks. Helix AI can use Python for AI services, model experiments, data utilities, backend automation, analytics workflows, infrastructure scripts, and research tooling.',
      },
      {
        text: 'Go',
        href: 'https://go.dev/',
        role: 'Cloud-Native Systems',
        detailedDescription:
          'Go is an open-source programming language designed for building simple, secure, and scalable systems. Its concurrency model, standard library, static binaries, and operational simplicity make it common in cloud-native infrastructure, CLIs, agents, networking tools, and backend services. Helix AI can use Go for high-reliability infrastructure services, lightweight agents, internal tooling, telemetry components, workers, and service integrations.',
      },
      {
        text: 'Rust',
        href: 'https://www.rust-lang.org/',
        role: 'Safe Systems Development',
        detailedDescription:
          'Rust is a systems programming language focused on performance, memory safety, and reliability without requiring a garbage collector. It is useful for performance-critical services, embedded systems, CLIs, runtimes, security-sensitive components, and low-level infrastructure. Helix AI can use Rust for plugin sandboxes, secure runtimes, local inference tooling, high-performance agents, parsers, networking components, and safety-critical platform internals.',
      },
      {
        text: 'C++',
        href: 'https://isocpp.org/',
        role: 'High-Performance Systems',
        detailedDescription:
          'C++ is a high-performance systems programming language used for applications that need speed, low-level control, memory management, and close hardware interaction. It is common in game engines, graphics systems, embedded software, performance-critical services, native tooling, and AI infrastructure components. Helix AI can use or support C++ for high-performance local agents, native extensions, game-development workflows, simulation tooling, GPU-adjacent workloads, and integrations where maximum runtime efficiency matters.',
      },
      {
        text: 'C#',
        href: 'https://learn.microsoft.com/en-us/dotnet/csharp/',
        role: 'Enterprise Applications',
        detailedDescription:
          'C# is a modern, object-oriented, type-safe language used with the .NET platform for web applications, APIs, desktop software, cloud services, games, and enterprise systems. It has strong tooling through the Microsoft ecosystem and works well for organizations already invested in .NET infrastructure. Helix AI can support C# and .NET integrations for enterprise customers, internal business applications, game-development workflows, desktop tooling, and Microsoft-aligned environments.',
      },
      {
        text: 'Kotlin',
        href: 'https://kotlinlang.org/',
        role: 'Multiplatform Development',
        detailedDescription:
          'Kotlin is a concise, statically typed, multiplatform programming language developed by JetBrains. It is used for server-side applications, Android development, shared mobile logic, web, desktop, and JVM-based systems. Helix AI can use or support Kotlin for Android clients, JVM services, multiplatform application logic, enterprise integrations, developer tooling, and teams that want modern language features with Java ecosystem compatibility.',
      },
      {
        text: 'Bash',
        href: 'https://www.gnu.org/software/bash/',
        role: 'Shell Automation',
        detailedDescription:
          'Bash is a Unix shell and command language commonly used for scripting, automation, local development workflows, deployment tasks, CI/CD steps, system administration, and infrastructure operations. It is useful for repeatable command execution, environment setup, server maintenance, and glue logic between command-line tools. Helix AI can use Bash scripts for development automation, local setup commands, infrastructure helpers, deployment workflows, maintenance tasks, and operator-focused tooling.',
      },
      {
        text: 'YAML',
        href: 'https://yaml.org/',
        role: 'Configuration Format',
        detailedDescription:
          'YAML is a human-readable data serialization format commonly used for configuration files, infrastructure manifests, CI/CD pipelines, Kubernetes resources, Docker Compose files, GitHub Actions workflows, and application settings. While it is not a general-purpose programming language, it is central to modern platform engineering and automation. Helix AI can use YAML for deployment manifests, workflow definitions, configuration files, policy documents, infrastructure-as-code inputs, and automation templates.',
      },
      {
        text: 'JSON',
        href: 'https://www.json.org/json-en.html',
        role: 'Structured Data Format',
        detailedDescription:
          'JSON is a lightweight structured data format widely used for APIs, configuration, data exchange, manifests, package metadata, logs, webhooks, and application state. It is easy for humans to read and simple for machines to parse, making it a standard format across web applications and service integrations. Helix AI can use JSON for API payloads, plugin manifests, automation definitions, content data, configuration files, structured model outputs, and integration contracts.',
      },
    ],
    image: '/images/technology/programming-languages.png',
    link: '/technology/languages',
    buttonText: 'Explore languages',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `programmingLanguagesCards` for new imports.
 */
export const ProgrammingLanguagesCards = programmingLanguagesCards;