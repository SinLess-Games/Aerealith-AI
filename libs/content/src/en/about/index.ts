import type { AboutSection } from '../../types';

export const AboutDescription =
  'Helix AI is an adaptive digital companion and secure command center built to bring apps, data, automations, communities, dashboards, files, integrations, and workflows into one intelligent platform. Instead of forcing users to jump between disconnected tools, scattered information, manual processes, and isolated AI assistants, Helix is being designed to help people connect what matters, understand what is happening, and take action from one trusted place. It is built around user control, permissioned memory, transparent automation, scoped integrations, responsible AI behavior, and clear privacy boundaries. Helix is meant to support practical everyday use while also growing into a platform for creators, developers, teams, infrastructure operators, communities, and businesses. Whether someone is organizing personal tasks, managing a Discord community, building software, monitoring systems, or coordinating work across multiple platforms, Helix is designed to reduce friction and make complex information easier to use. The long-term vision is one flexible assistant layer that can support personal workflows, community operations, developer tooling, business systems, self-hosted environments, and enterprise-ready deployments.';

export const AboutHeader = 'About Helix AI';

export const aboutContent = [
  {
    title: 'Who We Are',
    icon: '✨',
    paragraphs: [
      'Helix AI is an adaptive digital companion and secure command center built to unify your tools, data, automations, dashboards, communities, and workflows behind one intelligent conversational interface.',
      'The platform is designed for people who live across many systems: developers, creators, infrastructure operators, businesses, communities, teams, and everyday users who want technology to feel more connected, understandable, and useful.',
      'Helix AI focuses on user control, transparency, context, and practical action. It is being built to help users monitor what matters, automate repeatable work, understand complex information, and make better decisions without losing ownership of their data or control over their workflows.',
    ],
  },
  {
    title: 'Our Mission',
    icon: '🚀',
    paragraphs: [
      'Our mission is to make intelligent assistance practical, trustworthy, and deeply personal while keeping users in control of their data, tools, systems, communities, and decisions.',
      'Helix AI exists to reduce friction between people and the digital systems they depend on every day. Instead of forcing users to jump between dashboards, apps, alerts, documents, bots, integrations, and disconnected workflows, Helix brings context together in one secure place.',
      'Whether you are deploying code, reviewing analytics, managing infrastructure, organizing personal workflows, supporting a community, coordinating a team, or connecting smart devices, Helix AI is being built to help you work faster, think clearer, automate safely, and act with confidence.',
    ],
  },
  {
    title: 'Our Vision',
    icon: '🧬',
    paragraphs: [
      'We believe the next generation of software will feel less like isolated tools and more like trusted digital companions that understand context, respect boundaries, and adapt over time.',
      'Helix AI is designed around that idea: memory with user control, automation with permission, analytics with provenance, integrations with scoped access, and assistant behavior that remains understandable wherever practical.',
      'The long-term vision is a secure, extensible assistant platform that can operate across cloud, local, self-hosted, and air-gapped environments while remaining transparent about what it knows, what it can do, what it cannot do, and when it needs approval.',
    ],
  },
  {
    title: 'Our Story',
    icon: '📖',
    paragraphs: [
      'Helix started with a simple question: what if your systems could talk to you in a way that was actually useful?',
      'After years of research, planning, experimentation, and hands-on infrastructure work, Helix AI has grown from a bold concept into a platform vision focused on memory, automation, analytics, integrations, security, developer tooling, and human-centered AI.',
      'The project is shaped by real operational pain: alert fatigue, scattered dashboards, disconnected tools, repetitive workflows, fragmented communities, and the need for assistants that can explain, act, and adapt without taking control away from the user.',
    ],
  },
  {
    title: 'What Makes Helix Different',
    icon: '🛡️',
    paragraphs: [
      'Helix AI is not just a chatbot, a thin wrapper around prompts, a simple Discord bot, or a basic automation tool. It is being designed as a connected assistant platform with memory, permissions, automations, analytics, integrations, developer tooling, and long-term personalization.',
      'The platform is built around clear boundaries: users own their data, sensitive actions require appropriate approval, memory should be reviewable and removable, and system behavior should be explainable wherever practical.',
      'Helix AI is also designed to support multiple environments, from hosted SaaS to future self-hosted and air-gapped deployments, so individuals, teams, infrastructure operators, and organizations can choose the level of control, privacy, and deployment flexibility they need.',
    ],
  },
  {
    title: 'Where Helix AI Is Today',
    icon: '🧪',
    paragraphs: [
      'Helix AI is currently in active development. The first production-ready version is focused on a practical MVP: a web dashboard, AI chat experience, Discord integration, memory lite, basic automation workflows, usage tracking, account controls, and early waitlist and crowdfunding support.',
      'Features will be released progressively as they are built, tested, and pushed to production. The goal is to ship real functionality in focused stages instead of promising every planned feature at once.',
      'As the platform grows, this page and the public documentation will continue to evolve with real release notes, feature previews, roadmap updates, contributor information, and clearer explanations of what is live, what is being tested, and what is planned next.',
    ],
  },
  {
    title: 'Development Philosophy',
    icon: '⚙️',
    paragraphs: [
      'Helix AI is being built around practical usefulness, transparency, security, and long-term control. Every major feature should solve a real problem, respect user permissions, and fit into the larger platform vision before becoming part of the public product.',
      'The development approach is intentionally staged. Core systems come first: identity, chat, memory, integrations, automation, usage tracking, security boundaries, and observability. More advanced capabilities, such as marketplace features, enterprise compliance, mobile apps, IoT, and air-gapped deployment, come later as the foundation matures.',
      'This keeps the MVP focused, reduces unnecessary complexity, and helps Helix grow from a useful assistant into a reliable platform without sacrificing trust, maintainability, or user control.',
    ],
  },
  {
    title: 'Trust & Privacy Principles',
    icon: '🔐',
    paragraphs: [
      'Trust is not being treated as a future enterprise feature. It is part of the foundation of Helix AI. The platform is being designed around user-owned data, permissioned memory, transparent automation, scoped integrations, and clear privacy boundaries.',
      'Users should be able to understand what Helix remembers, why it matters, how it is used, and how to review, change, export, or remove it. Automations should be intentional and auditable, not hidden background control.',
      'As Helix AI grows, the platform will continue to prioritize responsible AI behavior, clear consent, secure infrastructure, sensitive data minimization, honest limits, and strong access control for personal, community, team, and enterprise environments.',
    ],
  },
  {
    title: 'Built by SinLess Games LLC',
    icon: '👥',
    paragraphs: [
      'Helix AI is being built by SinLess Games LLC with a focus on practical engineering, secure systems, developer experience, automation, user-centered design, and long-term platform architecture.',
      'The project combines full-stack development, infrastructure operations, AI-assisted workflows, product design, security planning, automation strategy, and community-focused tooling into one unified vision.',
      'More team details, contributor information, project history, technical documentation, and public roadmap updates will be published as the platform and supporting documentation mature.',
    ],
  },
] as const satisfies readonly AboutSection[];

/**
 * Backward-compatible PascalCase export.
 *
 * Prefer `aboutContent` for new imports.
 */
export const AboutContent = aboutContent;