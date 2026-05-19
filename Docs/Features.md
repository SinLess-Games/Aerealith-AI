# Helix AI — Feature Matrix & Pricing Tiers (vNext)

This document outlines the major features planned for Helix AI across all tiers.

Each feature lists its **status**, **problem solved**, **tier availability**, and **implementation plan**.  
Pricing is listed as a planning baseline and may be adjusted before public launch.

---

## Legend

| Symbol | Meaning |
| ------ | ------- |
| 🧱 | Planned / Not Started |
| ⚙️ | In Development |
| ✅ | Implemented / Stable |

---

## Tier Pricing

| Tier | Monthly Price | Target User |
| ---- | ------------: | ----------- |
| **Free** | **$0** | Entry-level users who want to try Helix AI |
| **Basic** | **$5/month** | Personal users who want core assistant features |
| **Basic+** | **$10/month** | Power users who want more customization and integrations |
| **Premium** | **$15/month** | Advanced users who want automation and expanded assistant capabilities |
| **Premium+** | **$20/month** | Developers, creators, and prosumers who need advanced tools |
| **Pro** | **$25/month** | Small teams, businesses, and technical users |
| **Pro+** | **$30/month** | Growing teams that need higher limits, stronger automation, and deeper integrations |
| **Enterprise** | **Custom pricing** | Organizations that need compliance, governance, self-hosting, or air-gapped deployment |

---

## Tier Progression Rule

When a feature is listed as available from one tier to another, the range includes all tiers between them.

Example:

`Premium → Enterprise`

Includes:

- Premium
- Premium+
- Pro
- Pro+
- Enterprise

---

## Feature Overview

The matrices below group the Helix AI roadmap by capability area. Use the legend above to interpret the delivery status for each initiative.

---

## Core Assistant Features

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Multimodal Chat Interface** | ⚙️ In Development | Gives users a single conversational surface across text, voice, web, and Discord. | Free → Enterprise | Next.js chat surfaces with WebRTC voice, Discord and web bridge, and streaming responses; unified permissions with session hand-off across clients. |
| **Contextual Memory System** | ⚙️ In Development | Preserves short- and long-term context so follow-up prompts feel personal and informed. | Free → Enterprise | Redis handles short-term recall, while pgvector-backed `MemoryShard` stores long-term memories with retention controls, consent gating, and RAG hooks. |
| **Hybrid Inference Router** | ⚙️ In Development | Routes requests to the optimal model/provider for cost, latency, capability, privacy, and availability. | Pro → Enterprise | Policy-driven router with health probes, cost ceilings, local/cloud routing, and per-task fallback logic; exposes telemetry back to the model control layer. |
| **Persona Engine** | 🧱 Planned | Lets users and organizations define tone, behavior, and preference presets for Helix. | Basic+ → Enterprise | Persona manifest schema with safety guardrails, inheritance rules, and audit history; integrates with memory consent flows. |
| **Tool & Skill Runtime** | ⚙️ In Development | Safely executes sandboxed plugins so Helix can take action inside user workflows. | Basic+ → Enterprise | Deno/V8 isolates each execution with capability manifests, signed artifacts, monitored resource quotas, review workflows, and incident logging. |
| **Natural Language Automation** | 🧱 Planned | Converts “when X then do Y” requests into reliable automation pipelines without manual scripting. | Premium → Enterprise | Workflow DSL compiled from natural language prompts, trigger library, filter builder UI, and resilient workers with retry/backoff semantics. |
| **Live Web Search & Scraping** | 🧱 Planned | Keeps Helix responses fresh by gathering and summarizing real-time web data. | Premium+ → Enterprise | Cloudflare Worker crawler with sandboxed scraping, summarization through the inference router, and embedding pipeline into pgvector-backed knowledge bases. |
| **Fact Tracing & Citations** | 🧱 Planned | Builds user trust by linking factual answers back to verifiable sources. | Basic → Enterprise | Response post-processor attaches citation graph nodes, renders inline references, and stores provenance for audit replay. |

---

## User & Community Features

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Discord Bot / HelixBot** | ⚙️ In Development | Combines moderation, tickets, persona chat, and music into one intelligent bot for communities. | Basic+ → Enterprise | Modular services for moderation, music, tickets, and AI chat share a Discord gateway; ties into automation engine and org RBAC for scoped command access. |
| **Knowledge Base Creation** | ⚙️ In Development | Auto-builds indexed, memory-linked knowledge hubs for servers, teams, or individuals. | Free → Enterprise | Document ingestion pipeline with embeddings, auto-tagging to org/user memories, and review queue for sensitive content. |
| **Custom Commands & Macros** | 🧱 Planned | Lets users or organizations define reusable commands, macros, and prompt templates. | Basic+ → Enterprise | Macro builder UI backed by schema-validated JSON, version history, approval flows, and sharing controls. |
| **Community Management Panel** | 🧱 Planned | Provides a single dashboard for bans, roles, announcements, and member insights. | Basic+ → Enterprise | Next.js admin panel with analytics widgets, moderation actions, and scheduled announcements integrated with Discord and webhooks. |
| **Personal Dashboards** | 🧱 Planned | Gives users visibility into tool usage, automation runs, and memory state. | Free → Enterprise | Configurable dashboard powered by Supabase/Postgres views, Grafana embeds, and privacy controls for shared views. |
| **Multi-language Support** | 🧱 Planned | Enables end-to-end multilingual experiences in UI and inference. | Premium → Enterprise | Automatic locale negotiation, translation middleware leveraging inference router, and localized UI copy via Hypertune feature flags. |

---

## Developer & Plugin Features

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Open Plugin API** | ⚙️ In Development | Allows external developers to integrate Helix capabilities programmatically. | Basic+ → Enterprise | REST + GraphQL surface with scoped API tokens, manifest validation, webhook callbacks, and rate-limited execution. |
| **Scoped Memory Access** | 🧱 Planned | Ensures plugins can only touch the memories they are authorized to view. | Basic+ → Enterprise | Memory access policies enforced through ABAC, per-request audit logging, and consent prompts for sensitive scopes. |
| **Trigger-based Automation Engine** | 🧱 Planned | Lets developers wire triggers, filters, and actions into Helix without custom infrastructure. | Pro → Enterprise | Event bus abstraction with NATS/Kafka-compatible patterns, workflow composer, replay support, and retry/backoff semantics exposed through UI and SDK. |
| **Skill Marketplace** | 🧱 Planned | Provides discovery, review, and distribution for community-built automations and skills. | Basic+ → Enterprise | Marketplace service with submission review queue, rating system, signed bundles, revenue sharing, takedown controls, and usage analytics for creators. |
| **Helix SDK** | ⚙️ In Development | Simplifies integration through TypeScript, Python, and REST clients. | Basic → Enterprise | `@helix/sdk`, Python client, and OpenAPI definitions kept in sync through CI; includes auth helpers, test harnesses, and example integrations. |
| **CLI Tools / `helixctl`** | ⚙️ In Development | Supports local development, packaging, operations, and air-gapped deployment workflows. | Pro → Enterprise | Deno/Node CLI for scaffolding skills, running integration tests, packaging offline bundles, and managing deployments through the API. |

---

## Analytics & Observability

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Usage & Token Meters** | ⚙️ In Development | Gives users and organizations visibility into consumption for billing and capacity planning. | Pro → Enterprise | Metering pipeline captures per-request tokens, latency, cost, tool usage, and model routing decisions; exports to billing engine and dashboards. |
| **Audit Logging** | 🧱 Planned | Provides tamper-evident trails for compliance and security investigations. | Pro → Enterprise | Append-only, signed logs persisted in object storage with SIEM export, retention policies, and query tooling. |
| **Grafana Dashboards** | ⚙️ In Development | Centralizes latency, skill failure, vector recall, API usage, infrastructure, and automation insights. | Pro+ → Enterprise | Managed Grafana stack with Tempo/Loki/Mimir data sources, SLO dashboards, alert routing, and organization-level dashboard sharing. |
| **Feature Flag Resolution** | ⚙️ In Development | Enables targeted experiments and customer-specific feature toggles through Hypertune. | Free → Enterprise | Hypertune-backed rollout rules, per-org overrides, and audit logs; integrates with web app and automation engine for runtime decisions. |
| **OTEL Instrumentation** | 🧱 Planned | Unifies tracing, metrics, logs, and profiles for the Helix platform. | Internal / Enterprise | OpenTelemetry collector fleet exports to Tempo, Mimir, Loki, Pyroscope, and third-party sinks; includes sampling strategy and redaction policies. |

---

## Security & Privacy

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Zero-Trust Architecture** | 🧱 Planned | Ensures every service identity and connection is mutually authenticated and authorized. | Pro → Enterprise | SPIFFE/SPIRE identity issuance, mTLS mesh, periodic certificate rotation, and least-privilege policies enforced through service mesh and policy engine. |
| **Memory Redaction & Review Controls** | 🧱 Planned | Prevents sensitive data from persisting without appropriate review or consent. | Premium → Enterprise | Redaction pipelines with PII detection, reviewer queues, consent controls, and retention policies configurable per tenant. |
| **Per-Tenant Secret Isolation** | 🧱 Planned | Keeps credentials, API keys, and integration secrets isolated across tenants. | Pro → Enterprise | Vault/KMS-backed secret storage with envelope encryption, access logs, scoped access policies, and automated rotation hooks. |
| **RBAC & ABAC Policy Engine** | ⚙️ In Development | Governs role-based and attribute-based access for every surface. | Basic → Enterprise | Policy engine built on OPA/Rego with organization/group hierarchies, session enforcement, and audit trails shared with compliance tooling. |
| **Compliant Modes / SOC2, HIPAA, GDPR** | 🧱 Planned | Enables regulated customers to enforce stricter data handling and auditing standards. | Enterprise | Configuration bundles for logging, retention, encryption, access review, incident workflows, and export controls aligned with common compliance needs. |
| **Chaos Engineering Mode** | 🧱 Planned | Validates resilience of plugins, inference, automations, and infrastructure under failure scenarios. | Premium+ → Enterprise | Fault injection service, staged experiment library, runbook automation, rollback hooks, and outcome dashboards. |

---

## Platform & Deployment

| Feature | Status | Problem Solved | Tier | Implementation Notes |
| ------- | ------ | -------------- | ---- | -------------------- |
| **Helix Web App** | ⚙️ In Development | Delivers the primary web experience for managing chat, automations, analytics, and settings. | Free → Enterprise | Next.js + shadcn/ui front-end with app router, SSR streaming, shared component library, and Hypertune-backed feature flagging. |
| **Discord Integration** | ⚙️ In Development | Embeds Helix experiences directly inside Discord servers and DMs. | Free → Enterprise | Slash commands, context menus, and webhook bridges share authentication with HelixBot modules and respect org RBAC scopes. |
| **Android/iOS App** | 🧱 Planned | Extends Helix to mobile notifications, voice input, and device sync. | Free → Enterprise | React Native / Expo application with offline cache, push notifications, biometric auth, and deep links back to automations and dashboards. |
| **Helix Linux Distro** | 🧱 Planned | Offers a privacy-first desktop with Helix as the native system assistant. | Premium+ → Enterprise | Debian-based distro packaged with Helix CLI, local Ollama/LLAMA runtimes, secure telemetry opt-in, and automated updates through signed packages. |
| **IoT Agent Support** | 🧱 Planned | Connects Helix automations to smart home, device networks, and local infrastructure. | Premium+ → Enterprise | Device twin service with MQTT/Zigbee bridges, rules engine integration, and Grafana-powered device health monitoring. |
| **Air-Gapped Deployment Mode** | 🧱 Planned | Enables fully offline, self-hosted deployments for high-security environments. | Enterprise | BYO Postgres/Redis packaging, artifact signing, offline model caches, local plugin registry, and `helixctl` workflows for updates without external connectivity. |

---

## GA Core Platform Foundations / v1.0

These roadmap items define the minimum feature surface required for the General Availability milestone. Grouping the work keeps cross-team coordination focused and aligns delivery sequencing.

| Theme | Focus | Linked Issues |
| ----- | ----- | ------------- |
| **Authentication & Identity** | Establish shared auth service, session payloads, and multi-provider linking. | [#151](https://github.com/Sinless777/Helix/issues/151), [#152](https://github.com/Sinless777/Helix/issues/152) |
| **Context Intelligence** | Build the context engine that fuses memory, telemetry, and retention controls. | [#153](https://github.com/Sinless777/Helix/issues/153) |
| **Security & Policy** | Deliver zero-trust policy evaluation and signed audit logging. | [#154](https://github.com/Sinless777/Helix/issues/154) |
| **Plugin Ecosystem** | Stand up the sandbox runtime and lifecycle management for third-party skills. | [#155](https://github.com/Sinless777/Helix/issues/155) |
| **Developer Surface** | Ship the TypeScript SDK and CLI to expose Helix capabilities programmatically. | [#156](https://github.com/Sinless777/Helix/issues/156), [#157](https://github.com/Sinless777/Helix/issues/157) |

### Delivery Checklist

- Auth flows and account linking documented with environment setup for contributors.
- Context engine contracts reviewed by AI and platform teams before SDK wiring.
- Security engine test harness and audit pipelines validated before plugin runtime launch.
- Plugin runtime, SDK, and CLI roadmaps remain in lockstep so developer tooling reflects the same permission model.
- Marketplace permissions, review, publishing, versioning, and takedown flows are architecture-ready even if public marketplace launch happens after MVP.
- Enterprise controls for SSO, audit logging, self-hosting, private marketplace support, and air-gapped operation are designed into the platform foundation.

> Keeping these threads synchronized ensures GA customers receive a coherent experience across authentication, policy enforcement, developer tooling, and platform extensibility.

---

## Tier Distribution Summary

| Tier | Price | Focus | Included Features |
| ---- | ----: | ----- | ----------------- |
| **Free** | **$0** | Entry-level assistant and chat | Multimodal chat interface, contextual memory lite, starter dashboards, Discord integration lite, basic knowledge base access |
| **Basic** | **$5/month** | Personal use | Expanded memory, citation support, basic persona presets, knowledge base viewer, basic SDK/API access |
| **Basic+** | **$10/month** | Power users and creators | Full HelixBot suite, custom commands/macros, knowledge base creation, tool and skill runtime access, community management panel |
| **Premium** | **$15/month** | Advanced companion and automation | Natural language automation, memory redaction controls, security insights, API integrations, multilingual support |
| **Premium+** | **$20/month** | Developer / prosumer | IoT agent support, live web search and scraping, Linux distro integration, advanced memory controls, chaos testing access |
| **Pro** | **$25/month** | Small business and technical teams | Hybrid inference router, open plugin API, scoped memory access, usage and token meters, zero-trust foundation controls |
| **Pro+** | **$30/month** | Growing teams and advanced operators | Higher limits, advanced automation capacity, Grafana dashboards, deeper integrations, expanded governance, team-level analytics |
| **Enterprise** | **Custom pricing** | Large-scale organizations | Air-gapped deployment, self-hosting, private marketplace, zero-trust architecture, audit logging, compliant modes, OTEL dashboards, governance toolkit |

---

## Pricing Positioning

### Free

The Free tier exists to let users try Helix AI with minimal friction. It should provide enough value to prove the assistant experience while keeping advanced memory, automation, and integration-heavy features reserved for paid tiers.

### Basic

Basic is the entry paid plan for personal users. It should feel affordable while unlocking the first meaningful upgrade from Free: stronger personalization, better continuity, and practical day-to-day assistant features.

### Basic+

Basic+ is for power users, creators, and Discord/community users. This tier should unlock more customization, community management tools, knowledge creation, and early plugin/runtime capabilities.

### Premium

Premium is the first advanced automation tier. It should focus on users who want Helix to do more than answer questions: automate workflows, manage recurring actions, and provide deeper personalized support.

### Premium+

Premium+ is for developers, creators, prosumers, and technical users who want advanced local, web, IoT, and memory capabilities without needing a full business/team plan.

### Pro

Pro is the small business and technical team tier. It should introduce stronger governance, usage visibility, plugin/API access, hybrid inference routing, and team-ready controls.

### Pro+

Pro+ bridges the gap between Pro and Enterprise. It should support growing teams that need higher limits, better dashboards, deeper integrations, and stronger governance, but do not yet need custom enterprise contracts.

### Enterprise

Enterprise is for organizations that need custom deployment, compliance, governance, security, auditability, self-hosting, private marketplace controls, or air-gapped operation.

---

## Notes

- Pricing is monthly by default.
- Annual pricing, usage add-ons, compute add-ons, storage add-ons, and organization seats can be added later.
- Enterprise pricing varies by deployment model, compliance scope, support level, storage requirements, and integration complexity.
- Pro+ should remain in the model if Helix needs a clean bridge between self-serve business users and custom Enterprise contracts.
- If simplicity becomes more important than tier granularity, Pro+ can be removed and its features can be split between Pro and Enterprise.

---

<!-- markdownlint-disable MD036 -->
_© SinLess Games LLC / Helix AI Project — Internal Product Spec_
