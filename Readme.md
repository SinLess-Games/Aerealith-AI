# Helix AI — Autonomous Assistant Platform

<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD004 -->
<!-- markdownlint-disable MD060 -->
<p align="center">
  <img src="/Docs/images/hero-circle.png" alt="Helix AI Logo" width="520" height="520" />
</p>

<p align="center">
  <strong>Automation-grade AI assistants for users, creators, developers, teams, and businesses.</strong>
</p>

<p align="center">
  <em>Unify your tools. Remember what matters. Automate with confidence.</em>
</p>

<p align="center">
  <strong>Project Pulse</strong><br />
  <a href="https://github.com/Sinless777/Helix/blob/main/LICENSE.md">
    <img src="https://img.shields.io/github/license/Sinless777/Helix?style=for-the-badge" alt="License" />
  </a>
  <a href="https://github.com/Sinless777/Helix/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/Sinless777/Helix/ci.yaml?branch=main&style=for-the-badge" alt="CI Status" />
  </a>
  <a href="https://github.com/Sinless777/Helix">
    <img src="https://img.shields.io/github/stars/Sinless777/Helix?style=for-the-badge" alt="GitHub Stars" />
  </a>
</p>

<p align="center">
  <strong>Momentum</strong><br />
  <a href="https://github.com/Sinless777/Helix/issues">
    <img src="https://img.shields.io/github/issues/Sinless777/Helix?style=for-the-badge" alt="GitHub Issues" />
  </a>
  <a href="https://github.com/Sinless777/Helix/pulls">
    <img src="https://img.shields.io/github/issues-pr/Sinless777/Helix?style=for-the-badge" alt="GitHub Pull Requests" />
  </a>
  <a href="https://github.com/Sinless777/Helix/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/Sinless777/Helix?style=for-the-badge" alt="Contributors" />
  </a>
  <a href="https://github.com/Sinless777/Helix/commits/main">
    <img src="https://img.shields.io/github/commit-activity/m/Sinless777/Helix?style=for-the-badge" alt="Commit Activity" />
  </a>
</p>

<p align="center">
  <strong>Community</strong><br />
  <a href="https://discord.gg/Za8MVstYnr">
    <img src="https://img.shields.io/discord/1070973491379191818?label=Community&logo=discord&style=for-the-badge" alt="Join the Discord Community" />
  </a>
  <a href="https://github.com/Sinless777/Helix/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-Welcome-ff69b4?style=for-the-badge&logo=github" alt="PRs Welcome" />
  </a>
</p>
<!-- markdownlint-enable MD033 -->

Helix AI is a modular assistant platform built by **SinLess Games LLC**. It combines conversational AI, contextual memory, workflow automation, analytics, secure integrations, and a plugin runtime into one extensible system.

Helix is designed to run across cloud, edge, local, and future air-gapped environments while keeping user control, provenance, observability, and security at the center of the platform.

---

## Contents

- [What Is Helix AI?](#what-is-helix-ai)
- [Project Goals](#project-goals)
- [Core Capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Common Commands](#common-commands)
- [Development Workflow](#development-workflow)
- [Deployment Model](#deployment-model)
- [Security Model](#security-model)
- [Observability](#observability)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## What Is Helix AI?

**Helix AI is an autonomous assistant platform for managing tools, memory, automations, workflows, analytics, and integrations through a natural-language interface.**

It is not just a chatbot. Helix is being built as a full-stack assistant operating layer that can:

- Answer questions with contextual awareness.
- Remember user, project, organization, and workflow context.
- Execute approved actions across connected tools.
- Automate recurring work through triggers and workflows.
- Route requests across cloud and local models.
- Provide dashboards for usage, memory, skills, automations, and system health.
- Support developers through APIs, SDKs, plugins, and marketplace-ready extensions.
- Operate across web, Discord, mobile, desktop, CLI, and future edge environments.

Helix is designed around a long-term vision: a trustworthy digital companion that can assist, organize, automate, explain, and adapt without hiding what it is doing.

---

## Project Goals

Helix AI is built around a few core principles:

| Principle | Meaning |
| --- | --- |
| **User-controlled memory** | Users can review, edit, delete, export, pause, or scope memory. |
| **Transparent automation** | Actions should be inspectable, auditable, and permissioned. |
| **Integrations-first design** | Helix should unify tools like Discord, GitHub, Google, Cloudflare, Stripe, and internal services. |
| **Hybrid inference** | Requests can route across hosted models, local models, and future self-hosted inference. |
| **Security by default** | RBAC, ABAC, audit logs, scoped permissions, secret isolation, and zero-trust patterns are first-class. |
| **Open-source core** | The core platform should be inspectable and community-friendly, with commercial add-ons where appropriate. |
| **Cloud or air-gapped** | Helix should support SaaS, self-hosted, and offline-capable deployments over time. |
| **Explainable autonomy** | Helix can act proactively only inside clear user-approved boundaries. |

---

## Core Capabilities

| Area | Capabilities |
| --- | --- |
| **Assistant UI** | Chat, personas, tool calls, memory inspection, workflow controls, and live assistant interactions. |
| **Memory** | Short-term session memory, long-term semantic memory, scoped recall, retention controls, and provenance. |
| **Automations** | Event, schedule, webhook, and integration-driven automation flows. |
| **Plugin Runtime** | Sandboxed tools with signed manifests, scoped permissions, review flow, and audit trails. |
| **Integrations** | Discord, GitHub, Google, Stripe, PayPal, Cloudflare, Notion, Slack, and future marketplace connectors. |
| **Analytics** | Dashboards for usage, automations, plugin activity, model behavior, memory health, and system events. |
| **Inference Router** | Model routing by cost, latency, privacy, capability, tenant policy, and fallback health. |
| **API & SDK** | REST API, TypeScript SDK, future Python client, OpenAPI documentation, and developer tooling. |
| **Security** | RBAC, ABAC, audit logs, per-tenant secrets, signed events, and policy-aware execution. |
| **Deployment** | Cloudflare-first SaaS, Vercel frontend deployment, GitHub Actions CI/CD, and future self-hosted support. |

---

## Architecture

Helix is designed as a multi-tenant assistant platform with clear separation between user experience, inference, memory, automation, integrations, and observability.

```mermaid
flowchart TD
  User[User / Team / Organization]
  UI[Web App / Discord / Mobile / CLI]
  Edge[Cloudflare Edge / API Gateway]
  Auth[AuthN / AuthZ / Tenant Context]
  Flags[Hypertune Feature Flags]
  Memory[Memory Service<br />Redis + Postgres + pgvector]
  Router[Inference Router]
  Models[Model Providers<br />OpenAI / Anthropic / Ollama / Local]
  Plugins[Plugin Runtime<br />Sandboxed Skills]
  Automations[Automation Engine]
  Integrations[External Integrations]
  Audit[Signed Audit Log]
  Telemetry[OpenTelemetry]
  Grafana[Grafana Dashboards]

  User --> UI
  UI --> Edge
  Edge --> Auth
  Auth --> Flags
  Auth --> Memory
  Auth --> Router
  Router --> Models
  Router --> Plugins
  Plugins --> Integrations
  Automations --> Plugins
  Plugins --> Audit
  Memory --> Audit
  Edge --> Telemetry
  Router --> Telemetry
  Plugins --> Telemetry
  Automations --> Telemetry
  Telemetry --> Grafana
````

### Runtime Flow

1. A user sends a message, command, webhook, or automation trigger.
2. The gateway enriches the request with tenant, user, persona, policy, and feature-flag context.
3. Memory loads relevant short-term and long-term context.
4. The inference router selects the right model or local runtime.
5. Tools and plugins run only with approved scopes.
6. Results are returned with provenance, structured metadata, and audit events.
7. Telemetry is emitted for traces, logs, metrics, profiles, and dashboard analytics.

---

## Tech Stack

### Application Layer

| Layer           | Technology                                                    |
| --------------- | ------------------------------------------------------------- |
| Monorepo        | Nx                                                            |
| Package Manager | pnpm                                                          |
| Frontend        | Next.js App Router                                            |
| UI              | React, Tailwind CSS, shadcn/ui, shared `@helix-ai/ui` package |
| API Runtime     | Hono / Cloudflare Workers-ready services                      |
| Auth            | NextAuth-compatible authentication architecture               |
| ORM             | MikroORM                                                      |
| Database        | Postgres / Supabase-compatible Postgres                       |
| Vector Search   | pgvector                                                      |
| Cache / Queues  | Redis                                                         |
| Feature Flags   | Hypertune                                                     |
| Content / CMS   | Contentful-ready architecture                                 |
| Payments        | Stripe and PayPal                                             |
| Analytics       | Hypertune, Google Analytics, internal event tables            |

### Infrastructure Layer

| Layer               | Technology                                              |
| ------------------- | ------------------------------------------------------- |
| Edge                | Cloudflare Workers, Cloudflare DNS, Cloudflare CDN      |
| Frontend Hosting    | Vercel or Cloudflare-compatible deployment target       |
| CI/CD               | GitHub Actions                                          |
| Observability       | OpenTelemetry, Grafana, Tempo, Loki, Mimir, Pyroscope   |
| Load Testing        | k6                                                      |
| Secrets             | Vault/KMS-compatible secret envelope model              |
| Audit               | Append-only signed audit events                         |
| Self-hosting Target | BYO Postgres, Redis, object storage, and secret backend |

---

## Monorepo Structure

```text
.
├── apps
│   ├── frontend
│   │   └── Next.js web app for helixaibot.com
│   └── frontend-e2e
│       └── End-to-end tests for the frontend
│
├── libs
│   ├── api
│   │   └── Shared API helpers, response utilities, CORS, auth, and logging
│   ├── config
│   │   └── Runtime configuration, schemas, environment parsing, and app metadata
│   ├── db
│   │   └── MikroORM entities, repositories, migrations, and database helpers
│   ├── hypertune
│   │   └── Feature flag client, typed flags, and React bindings
│   └── ui
│       └── Shared components, layouts, providers, theme tokens, and brand assets
│
├── Docs
│   ├── Features.md
│   ├── DEPLOY.md
│   └── ThirdParty.md
│
├── tools
│   └── Repo tooling, generators, scripts, and developer utilities
│
├── .github
│   └── GitHub Actions workflows, issue templates, and repository automation
│
├── nx.json
├── package.json
├── pnpm-lock.yaml
└── Readme.md
```

---

## Getting Started

### Requirements

Install the following before working on the repo:

* Node.js 24+
* pnpm 10+
* Git
* Docker, optional but recommended
* Cloudflare Wrangler, required for Cloudflare Worker workflows
* A Postgres-compatible database for local persistence
* Redis for local cache/session/queue development

### Install Dependencies

```bash
pnpm install
```

### Start the Frontend

```bash
pnpm nx dev frontend
```

Alternative Nx form:

```bash
pnpm nx serve frontend
```

### Build the Frontend

```bash
pnpm nx build frontend
```

### Run Tests

```bash
pnpm nx test frontend
pnpm nx e2e frontend-e2e
```

### Run Linting

```bash
pnpm nx lint frontend
```

### View the Nx Project Graph

```bash
pnpm nx graph
```

---

## Environment Configuration

Create a local environment file before running services that require secrets.

```bash
cp .env.example .env.local
```

Recommended environment groups:

```env
# App
NEXT_PUBLIC_APP_NAME="Helix AI"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/helix"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-me"

# Feature Flags
HYPERTUNE_TOKEN="replace-me"

# Observability
OTEL_SERVICE_NAME="helix-ai"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# Cloudflare
CLOUDFLARE_ACCOUNT_ID="replace-me"
CLOUDFLARE_API_TOKEN="replace-me"

# Payments
STRIPE_SECRET_KEY="replace-me"
PAYPAL_CLIENT_ID="replace-me"
PAYPAL_CLIENT_SECRET="replace-me"
```

Never commit real secrets. Use local `.env*` files, GitHub Actions secrets, Cloudflare secrets, or a Vault/KMS-backed secret provider.

---

## Common Commands

| Command                               | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `pnpm install`                        | Install workspace dependencies.                   |
| `pnpm nx dev frontend`                | Start the frontend in development mode.           |
| `pnpm nx build frontend`              | Build the frontend.                               |
| `pnpm nx lint frontend`               | Lint the frontend project.                        |
| `pnpm nx test frontend`               | Run frontend tests.                               |
| `pnpm nx e2e frontend-e2e`            | Run frontend end-to-end tests.                    |
| `pnpm nx graph`                       | Open the Nx dependency graph.                     |
| `pnpm nx affected -t lint test build` | Run checks only on affected projects.             |
| `pnpm exec wrangler deploy`           | Deploy Cloudflare Worker targets when configured. |
| `pnpm exec wrangler tail`             | Tail Cloudflare Worker logs.                      |

---

## Development Workflow

Recommended local workflow:

1. Create or update a feature branch.
2. Run affected lint, test, and build targets.
3. Verify the UI locally.
4. Check formatting before opening a pull request.
5. Open a pull request with a clear summary and validation notes.
6. Let GitHub Actions run CI, code scanning, and project checks.
7. Merge after review and successful validation.

```bash
git checkout -b feat/my-feature
pnpm nx affected -t lint test build
git status
```

Recommended pull request checklist:

* [ ] Code is formatted.
* [ ] Lint passes.
* [ ] Tests pass or known gaps are documented.
* [ ] Build passes.
* [ ] Environment variables are documented when changed.
* [ ] Security-sensitive changes include validation notes.
* [ ] User-facing changes include screenshots where helpful.

---

## Deployment Model

Helix is designed around a Cloudflare-first deployment strategy with GitHub-driven automation.

```mermaid
flowchart LR
  Dev[Developer]
  Git[GitHub Repository]
  Actions[GitHub Actions]
  Checks[Lint / Test / Build / Scan]
  Vercel[Vercel Frontend Deploy]
  Workers[Cloudflare Workers]
  DNS[Cloudflare DNS / CDN]
  Users[Users]

  Dev --> Git
  Git --> Actions
  Actions --> Checks
  Checks --> Vercel
  Checks --> Workers
  Vercel --> DNS
  Workers --> DNS
  DNS --> Users
```

Primary deployment goals:

* Keep `helixaibot.com` as the main web app domain.
* Use Cloudflare for DNS, CDN, edge routing, Workers, and future automations.
* Use GitHub Actions for checks, builds, tests, scans, and deployments.
* Support rollback-friendly deploys.
* Keep infrastructure changes auditable through GitOps-style workflows.

---

## Security Model

Helix is designed with zero-trust principles and scoped automation.

### Core Controls

| Control                    | Purpose                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Tenant isolation**       | Keep users, teams, organizations, memory, and audit data scoped.              |
| **RBAC**                   | Enforce role-based permissions across apps and APIs.                          |
| **ABAC**                   | Apply contextual rules such as tenant, sensitivity, device, time, and policy. |
| **Scoped plugins**         | Plugins request explicit permissions before accessing tools or data.          |
| **Secret isolation**       | Secrets should live in Vault/KMS or platform secret stores, not memory.       |
| **Signed audit logs**      | Sensitive actions should produce append-only signed events.                   |
| **Policy-aware inference** | Model routing should respect privacy, tier, and organization controls.        |
| **Memory controls**        | Users can view, edit, delete, pause, export, and scope memory.                |

### Sensitive Action Pattern

Sensitive actions should follow this pattern:

1. Classify the request.
2. Check user, tenant, role, policy, and feature flags.
3. Confirm required permissions.
4. Execute only the approved action.
5. Write an audit event.
6. Return a clear result with provenance.

---

## Observability

Helix emits telemetry so the platform can be measured, debugged, and improved safely.

### Planned Signals

| Signal           | Examples                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- |
| **Metrics**      | Request count, latency, error rate, plugin failures, model usage, cache hit rate.  |
| **Logs**         | API events, automation execution, plugin lifecycle, auth events, worker logs.      |
| **Traces**       | Request path, inference routing, memory recall, tool execution, integration calls. |
| **Profiles**     | CPU and memory profiling for hot paths and expensive workloads.                    |
| **Audit Events** | User actions, admin actions, memory changes, permission grants, plugin execution.  |

### Dashboard Areas

* Assistant health
* API latency and errors
* Memory recall and storage
* Plugin execution health
* Automation success and failure rate
* Model routing cost and latency
* Tenant usage
* Billing and entitlement activity
* Security and audit events

---

## Plugin Runtime

Helix plugins are planned around signed manifests and scoped execution.

Example manifest shape:

```json
{
  "name": "calendar-summary",
  "version": "0.1.0",
  "description": "Summarizes upcoming calendar events.",
  "entry": "plugin.ts",
  "permissions": ["read:calendar", "write:memory"],
  "author": "SinLess Games LLC"
}
```

Plugin goals:

* Run in a sandboxed runtime.
* Request explicit scopes.
* Emit audit logs.
* Support local development.
* Support signed marketplace packages.
* Allow organizations to approve, restrict, or block plugins.
* Remain portable between SaaS, self-hosted, and air-gapped deployments where possible.

---

## API & SDK

Helix is intended to expose core platform capabilities through stable APIs and SDKs.

Planned developer surfaces:

* REST API
* OpenAPI specification
* TypeScript SDK: `@helix/sdk`
* Python client
* Webhook system
* Plugin SDK
* CLI tooling through `helixctl`

Example future SDK usage:

```ts
import { HelixClient } from '@helix/sdk';

const helix = new HelixClient({
  apiKey: process.env.HELIX_API_KEY,
});

const response = await helix.chat.create({
  message: 'Summarize my open GitHub issues.',
  memory: {
    scope: 'project',
  },
});

console.log(response.text);
```

---

## Roadmap

Status markers:

* ✅ Available or partially available
* ⚙️ In progress
* 🧱 Planned
* 🧪 Experimental

| Status | Milestone                        | Description                                                                                                      |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ✅      | **Landing Site**                 | Public-facing Helix AI web presence and brand foundation.                                                        |
| ✅      | **Nx Monorepo**                  | Shared workspace for frontend, UI, API helpers, config, database, and tooling.                                   |
| ⚙️     | **Cloudflare-First API Layer**   | Worker-ready API services, request logging, CORS, response helpers, and edge deployment patterns.                |
| ⚙️     | **Database Foundation**          | Postgres/MikroORM schema foundation for users, orgs, plans, subscriptions, memory, automations, and audit data.  |
| ⚙️     | **Waitlist / Early Access Flow** | Public interest capture, persistence, validation, and admin review path.                                         |
| ⚙️     | **Feature Flags & Entitlements** | Hypertune-driven tier flags, add-ons, usage controls, and rollout gates.                                         |
| ⚙️     | **Memory System**                | Redis short-term memory and pgvector-backed long-term memory with scope, retention, sensitivity, and provenance. |
| ⚙️     | **Hybrid Inference Router**      | Policy-aware routing across hosted and local model providers with fallback controls.                             |
| 🧱     | **Automation Engine**            | Triggers, filters, actions, schedules, webhooks, and integration-based workflows.                                |
| 🧱     | **Plugin Runtime MVP**           | Sandboxed tools with manifests, scopes, signing, review flow, telemetry, and audit events.                       |
| 🧱     | **Discord Assistant**            | Discord bot integration for assistant workflows, community tools, tickets, and moderation-adjacent automation.   |
| 🧱     | **Analytics Dashboards**         | User and organization dashboards with usage, memory, model, automation, and plugin insights.                     |
| 🧱     | **Marketplace**                  | Official and third-party plugins, workflows, dashboards, personas, templates, and integrations.                  |
| 🧱     | **Mobile App**                   | Mobile assistant experience with notifications, memory sync, and voice-ready interaction patterns.               |
| 🧪     | **Local / Offline Mode**         | Local model routing, self-hosted dependencies, offline memory, and air-gapped deployment support.                |
| 🧪     | **Helix Linux / Desktop Agent**  | Native desktop and OS-level assistant integration with local automation and privacy-first controls.              |

---

## Project Philosophy

Helix explores what a long-term digital assistant can become when it has continuity, memory, permissions, observability, and user trust.

The project may use language like “companion,” “persona,” or “autonomous assistant,” but Helix does not claim sentience. The goal is to build transparent, useful, inspectable autonomy that helps users make decisions and complete work while keeping control in human hands.

---

## Contributing

Contributions are welcome.

Before contributing:

1. Read the [Contributor Guidelines](./CONTRIBUTING.md).
2. Review the [Code of Conduct](./CODE_OF_CONDUCT.md).
3. Open an issue for larger changes before starting major work.
4. Keep pull requests focused and reviewable.
5. Include validation steps in every pull request.

Useful contribution areas:

* UI components
* Accessibility improvements
* Documentation
* Tests
* API utilities
* Cloudflare Workers
* Security hardening
* Observability
* Plugin runtime design
* Developer tooling

---

## License

[Polyform Noncommercial License 1.0.0](./LICENSE.md) © SinLess Games LLC.

Helix AI is source-available. Noncommercial use is permitted under the Polyform Noncommercial License.

Commercial use, resale, sublicensing, hosted resale, or commercial redistribution requires a separate commercial license from SinLess Games LLC.

For commercial licensing, visit:

```text
https://helixaibot.com
```

---

## Links

| Resource          | Link                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Website           | [https://helixaibot.com](https://helixaibot.com)                                         |
| Repository        | [https://github.com/Sinless777/Helix](https://github.com/Sinless777/Helix)               |
| Issues            | [https://github.com/Sinless777/Helix/issues](https://github.com/Sinless777/Helix/issues) |
| Pull Requests     | [https://github.com/Sinless777/Helix/pulls](https://github.com/Sinless777/Helix/pulls)   |
| Discord           | [https://discord.gg/Za8MVstYnr](https://discord.gg/Za8MVstYnr)                           |
| SinLess Games LLC | [https://sinlessgamesllc.com](https://sinlessgamesllc.com)                               |

---

<!-- markdownlint-disable MD033 -->
<p align="center">
  Made with ❤️ by <a href="https://github.com/Sinless777">@Sinless777</a> and contributors.
</p>
<!-- markdownlint-disable MD033 -->
